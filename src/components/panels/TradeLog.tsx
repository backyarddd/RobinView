import { Fragment, useEffect, useState } from "react";
import { useStore } from "../../store/useStore";
import type { OrderRow, PaperState, PaperTrade } from "@shared/types";
import { api } from "../../lib/api";
import { realizedBySell } from "../../lib/pnl";
import { dirClass, fmtDate, shares } from "../../lib/format";
import { useClock } from "../../hooks/useClock";

// Bottom-panel Trade Log: full history with P&L for the paper 0DTE book and
// for real (Robinhood) fills. Real P&L is FIFO-attributed per sell from the
// visible order history; sells whose buys predate it are marked "basis?".

type Mode = "paper" | "real";

const money = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const dur = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
};

function Summary({ items }: { items: { label: string; value: string; cls?: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 24, padding: "6px 10px", flexWrap: "wrap" }}>
      {items.map((s) => (
        <span key={s.label} style={{ fontSize: 12 }}>
          <span className="dim">{s.label} </span>
          <span className={`mono ${s.cls ?? ""}`} style={{ fontWeight: 600 }}>{s.value}</span>
        </span>
      ))}
    </div>
  );
}

function PaperLog() {
  const [state, setState] = useState<PaperState | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { fmtTime } = useClock();
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/paper/state")
        .then((r) => r.json())
        .then((b) => alive && setState(b.data))
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!state) return <div className="empty">Loading paper book…</div>;
  const rows: PaperTrade[] = state.open ? [state.open, ...state.trades] : state.trades;
  if (!rows.length) return <div className="empty">No paper trades yet. Signals run 9:45-13:45 ET weekdays; see the 0DTE Paper view for the full signal log.</div>;

  const closed = state.trades;
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) <= 0);
  const avg = (xs: PaperTrade[]) => (xs.length ? xs.reduce((a, t) => a + (t.pnl ?? 0), 0) / xs.length : 0);

  return (
    <div style={{ overflowX: "auto" }}>
      <Summary
        items={[
          { label: "Closed", value: `${closed.length}` },
          { label: "Net P&L", value: money(state.realized), cls: dirClass(state.realized) },
          { label: "Win rate", value: closed.length ? `${Math.round((wins.length / closed.length) * 100)}%` : "—" },
          { label: "Avg win", value: money(avg(wins)), cls: "up" },
          { label: "Avg loss", value: money(avg(losses)), cls: losses.length ? "down" : "" },
          { label: "Today", value: `${state.dayTrades} trades · ${money(state.dayPnl)}`, cls: dirClass(state.dayPnl) },
        ]}
      />
      <table className="tbl" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Entered</th><th>Contract</th><th>Qty</th><th>Conf</th><th>Entry</th><th>Spot in</th>
            <th>Exit</th><th>Spot out</th><th>Held</th><th>Reason</th><th>P&L</th><th>P&L %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const open = t.exitAt == null;
            const exitPx = open ? t.mark : t.exitPrice;
            const pnl = open ? (t.mark != null ? t.qty * 100 * (t.mark - t.entryPrice) : null) : (t.pnl ?? 0);
            const ret = exitPx != null ? (exitPx - t.entryPrice) / t.entryPrice : null;
            return (
              <Fragment key={t.id}>
                <tr onClick={() => setExpanded(expanded === t.id ? null : t.id)} style={{ cursor: "pointer" }}>
                  <td className="mono dim">{fmtDate(t.entryAt)} {fmtTime(t.entryAt)}</td>
                  <td className={t.side === "call" ? "up" : "down"} style={{ fontWeight: 600 }}>{t.contract}</td>
                  <td className="mono">{t.qty}</td>
                  <td className="mono dim">{t.confidence.toFixed(2)}</td>
                  <td className="mono">{t.entryPrice.toFixed(2)}</td>
                  <td className="mono dim">{t.entrySpot.toFixed(2)}</td>
                  <td className="mono">{exitPx != null ? exitPx.toFixed(2) + (open ? " (mark)" : "") : "…"}</td>
                  <td className="mono dim">{t.exitSpot != null ? t.exitSpot.toFixed(2) : "—"}</td>
                  <td className="mono dim">{open ? dur(Date.now() - t.entryAt) : t.exitAt ? dur(t.exitAt - t.entryAt) : "—"}</td>
                  <td className="dim">{open ? "open" : t.exitReason}</td>
                  <td className={`mono ${pnl != null ? dirClass(pnl) : ""}`}>{pnl != null ? money(pnl) : "…"}</td>
                  <td className={`mono ${ret != null ? dirClass(ret) : ""}`}>{ret != null ? pct(ret) : "…"}</td>
                </tr>
                {expanded === t.id && (
                  <tr>
                    <td colSpan={12} className="dim" style={{ fontSize: 12, whiteSpace: "normal", padding: "4px 10px 10px" }}>
                      <span className="mono" style={{ fontSize: 10, letterSpacing: 0.5 }}>THESIS · </span>
                      {t.thesis}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RealLog() {
  const account = useStore((s) => s.account);
  const initial = useStore((s) => s.orders);
  const [orders, setOrders] = useState<OrderRow[]>(initial);
  const { fmtTime } = useClock();
  useEffect(() => {
    if (account) api.orders(account).then(setOrders).catch(() => {});
  }, [account]);
  useEffect(() => setOrders(initial), [initial]);

  const filled = orders.filter((o) => o.state === "filled").sort((a, b) => b.createdAt - a.createdAt);
  if (!filled.length) return <div className="empty">No filled orders in this account's history.</div>;

  const attr = realizedBySell(orders);
  const sells = filled.filter((o) => o.side === "sell" && attr.has(o.id));
  const total = sells.reduce((a, o) => a + attr.get(o.id)!.pnl, 0);
  const winners = sells.filter((o) => attr.get(o.id)!.pnl > 0).length;

  return (
    <div style={{ overflowX: "auto" }}>
      <Summary
        items={[
          { label: "Fills", value: `${filled.length}` },
          { label: "Round-trips", value: `${sells.length}` },
          { label: "Realized P&L", value: money(total), cls: dirClass(total) },
          { label: "Win rate", value: sells.length ? `${Math.round((winners / sells.length) * 100)}%` : "—" },
        ]}
      />
      <table className="tbl" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Filled</th><th>Symbol</th><th>Side</th><th>Type</th><th>Qty</th><th>Fill</th>
            <th>Basis</th><th>P&L</th><th>P&L %</th><th>Via</th>
          </tr>
        </thead>
        <tbody>
          {filled.map((o) => {
            const a = o.side === "sell" ? attr.get(o.id) : undefined;
            const ret = a && a.basis > 0 ? (o.averageFillPrice! - a.basis) / a.basis : null;
            return (
              <tr key={o.id}>
                <td className="mono dim">{fmtDate(o.createdAt)} {fmtTime(o.createdAt)}</td>
                <td style={{ fontWeight: 600 }}>{o.symbol}</td>
                <td className={o.side === "buy" ? "up" : "down"}>{o.side}</td>
                <td className="dim">{o.type.replace("_", " ")}</td>
                <td className="mono">{shares(o.quantity)}</td>
                <td className="mono">{o.averageFillPrice != null ? o.averageFillPrice.toFixed(2) : "—"}</td>
                <td className="mono dim">{a ? (a.basis > 0 ? a.basis.toFixed(2) : "basis?") : "—"}</td>
                <td className={`mono ${a ? dirClass(a.pnl) : ""}`}>{a ? money(a.pnl) + (a.partial ? " *" : "") : "—"}</td>
                <td className={`mono ${ret != null ? dirClass(ret) : ""}`}>{ret != null ? pct(ret) : "—"}</td>
                <td className="dim">{o.placedAgent ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {[...attr.values()].some((a) => a.partial) && (
        <div className="dim" style={{ fontSize: 11, padding: "4px 10px" }}>
          * part of this sell had no matching buy in the visible order history; P&L covers the matched shares only.
        </div>
      )}
    </div>
  );
}

export function TradeLog() {
  const [mode, setMode] = useState<Mode>("paper");
  return (
    <div>
      <div style={{ display: "flex", gap: 6, padding: "8px 10px 0" }}>
        {(["paper", "real"] as Mode[]).map((m) => (
          <button key={m} className={`tab ${mode === m ? "on" : ""}`} onClick={() => setMode(m)} style={{ fontSize: 12 }}>
            {m === "paper" ? "Paper (0DTE)" : "Real (Robinhood)"}
          </button>
        ))}
      </div>
      {mode === "paper" ? <PaperLog /> : <RealLog />}
    </div>
  );
}
