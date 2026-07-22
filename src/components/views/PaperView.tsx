import { useEffect, useState } from "react";
import type { PaperState, PaperTrade } from "@shared/types";
import { Sparkline } from "../common/bits";
import { ReviewChip } from "../panels/TradeLog";
import { dirClass } from "../../lib/format";

// Paper 0DTE experiment dashboard. Read-only view over the server-side paper
// engine; nothing here can place a real order.

const fmt$ = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
const fmtTime = (t: number) =>
  new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";

async function fetchState(): Promise<PaperState> {
  const res = await fetch("/api/paper/state");
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()).data as PaperState;
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="dim" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div className={`mono ${cls ?? ""}`} style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function TradeRow({ t }: { t: PaperTrade }) {
  const open = t.exitAt == null;
  const pnl = open ? (t.mark != null ? t.qty * 100 * (t.mark - t.entryPrice) : 0) : (t.pnl ?? 0);
  return (
    <tr title={t.thesis}>
      <td className="mono dim">{fmtTime(t.entryAt)}</td>
      <td className={t.side === "call" ? "up" : "down"} style={{ fontWeight: 600 }}>
        {t.side.toUpperCase()} {t.strike}
      </td>
      <td className="mono">{t.qty}</td>
      <td className="mono">{t.entryPrice.toFixed(2)}</td>
      <td className="mono">{open ? (t.mark != null ? `${t.mark.toFixed(2)} (mark)` : "…") : t.exitPrice!.toFixed(2)}</td>
      <td className="dim">{open ? "open" : t.exitReason}</td>
      <td className={`mono ${dirClass(pnl)}`}>{fmt$(pnl)}</td>
      <td><ReviewChip t={t} /></td>
    </tr>
  );
}

export function PaperView() {
  const [state, setState] = useState<PaperState | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => fetchState().then((s) => alive && (setState(s), setErr(false))).catch(() => alive && setErr(true));
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (err) return <div className="pf"><div className="dim" style={{ padding: 40 }}>Paper engine unreachable.</div></div>;
  if (!state) return <div className="pf"><div className="skel" style={{ height: 200, margin: 40 }} /></div>;

  const equity = state.cash + (state.open ? state.open.qty * 100 * (state.open.mark ?? state.open.entryPrice) : 0);
  const closed = state.trades;
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const rows: PaperTrade[] = state.open ? [state.open, ...closed] : closed;
  const bar = 60; // promotion bar trade count

  return (
    <div className="pf">
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
          <h1 className="serif" style={{ fontSize: 28, fontWeight: 400 }}>0DTE Paper</h1>
          <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "#e3b766", border: "1px solid rgba(227,183,102,0.45)", borderRadius: 4, padding: "1px 6px", letterSpacing: 0.5 }}>
            SIMULATED · NO REAL ORDERS
          </span>
          {state.halted && (
            <span className="mono down" style={{ fontSize: 11, fontWeight: 700 }}>HALTED TODAY: {state.halted}</span>
          )}
        </div>
        <div className="dim" style={{ fontSize: 12, marginBottom: 18 }}>
          Claude research signals buy same-day SPY calls/puts with honest fills (enter at ask, exit at bid).
          Promotion bar before any real dollar: {bar}+ trades, net positive after spreads, drawdown under 30%.
          Progress: {closed.length}/{bar} trades.
        </div>

        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-body" style={{ display: "flex", gap: 40, alignItems: "center", flexWrap: "wrap" }}>
            <Stat label="Equity" value={fmt$(equity)} cls={dirClass(equity - state.seed)} />
            <Stat label="Net P&L" value={fmt$(equity - state.seed)} cls={dirClass(equity - state.seed)} />
            <Stat label="Realized" value={fmt$(state.realized)} cls={dirClass(state.realized)} />
            <Stat label="Trades" value={`${closed.length}`} />
            <Stat label="Win rate" value={closed.length ? `${Math.round((wins / closed.length) * 100)}%` : "—"} />
            <Stat label="Today" value={`${state.dayTrades} trades · ${fmt$(state.dayPnl)}`} cls={dirClass(state.dayPnl)} />
            <div style={{ marginLeft: "auto" }}>
              {state.equityHist.length > 1 && (
                <Sparkline data={state.equityHist.map((p) => p.v)} width={220} height={44} color={equity >= state.seed ? "var(--up)" : "var(--down)"} />
              )}
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head">Trades</div>
          <div className="panel-body" style={{ overflowX: "auto" }}>
            {rows.length === 0 ? (
              <div className="dim" style={{ padding: 16 }}>No trades yet. Signals arrive on the research cron (9:45-14:00 ET weekdays); hover a row for its thesis.</div>
            ) : (
              <table className="tbl" style={{ width: "100%" }}>
                <thead>
                  <tr><th>Entered</th><th>Contract</th><th>Qty</th><th>Entry</th><th>Exit</th><th>Reason</th><th>P&L</th><th>Review</th></tr>
                </thead>
                <tbody>{rows.map((t) => <TradeRow key={t.id} t={t} />)}</tbody>
              </table>
            )}
          </div>
        </div>

        {closed.some((t) => t.review) && (
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-head">Lessons (fed back into every research tick)</div>
            <div className="panel-body">
              {closed
                .filter((t) => t.review)
                .slice(0, 15)
                .map((t) => (
                  <div key={t.id} style={{ padding: "6px 4px", display: "flex", gap: 10, alignItems: "baseline" }}>
                    <span className={`mono ${dirClass(t.pnl ?? 0)}`} style={{ fontSize: 11, minWidth: 64, textAlign: "right" }}>{fmt$(t.pnl ?? 0)}</span>
                    <span style={{ fontSize: 12 }}>{t.review!.lesson}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="panel">
          <div className="panel-head">Research signals</div>
          <div className="panel-body">
            {state.signals.length === 0 ? (
              <div className="dim" style={{ padding: 16 }}>None yet.</div>
            ) : (
              state.signals.slice(0, 25).map((s) => (
                <div key={s.at} style={{ padding: "8px 4px", borderBottom: "1px solid var(--border, rgba(128,128,128,0.15))" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <span className="mono dim" style={{ fontSize: 11 }}>{fmtTime(s.at)}</span>
                    <span className={s.direction === "call" ? "up" : s.direction === "put" ? "down" : "dim"} style={{ fontWeight: 700, fontSize: 12 }}>
                      {s.direction.toUpperCase()}
                    </span>
                    <span className="mono dim" style={{ fontSize: 11 }}>conf {s.confidence.toFixed(2)}</span>
                    <span className="mono" style={{ fontSize: 11 }}>{s.action}</span>
                  </div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>{s.thesis}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
