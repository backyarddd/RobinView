import { useStore } from "../../store/useStore";
import { ChangePill } from "../common/bits";
import { useFlash } from "../../hooks/useTrails";
import { price as fmtPrice, money, signedMoney, percent, compactNum, dirClass, shares } from "../../lib/format";

export function SymbolQuote() {
  const symbol = useStore((s) => s.selected);
  const q = useStore((s) => s.quotes[symbol]);
  const positions = useStore((s) => s.positions);
  const openTicket = useStore((s) => s.openTicket);
  const flash = useFlash(q?.price ?? 0);
  const pos = positions.find((p) => p.symbol === symbol);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">{symbol}</span>
        <span className="dim" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {q?.name ?? ""}
        </span>
        {q?.extendedHours && (
          <span className="pill flat" style={{ marginLeft: "auto" }}>
            EXT
          </span>
        )}
      </div>
      <div className="panel-pad">
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span className={`mono ${flash}`} style={{ fontSize: 30, fontWeight: 600 }}>
            {q ? fmtPrice(q.price) : "—"}
          </span>
          {q && <ChangePill pct={q.changePct} />}
        </div>
        {q && (
          <div className={dirClass(q.change)} style={{ fontFamily: "var(--font-mono)", fontSize: 13, marginTop: 2 }}>
            {signedMoney(q.change)} today
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <div className="kv">
            <span className="k">Bid / Ask</span>
            <span className="v">{q?.bid ? `${fmtPrice(q.bid)} / ${fmtPrice(q.ask!)}` : "—"}</span>
          </div>
          <div className="kv">
            <span className="k">Prev Close</span>
            <span className="v">{q ? fmtPrice(q.previousClose) : "—"}</span>
          </div>
          <div className="kv">
            <span className="k">Day Range</span>
            <span className="v">{q?.dayLow ? `${fmtPrice(q.dayLow)} – ${fmtPrice(q.dayHigh!)}` : "—"}</span>
          </div>
          <div className="kv">
            <span className="k">Volume</span>
            <span className="v">{q?.volume ? compactNum(q.volume) : "—"}</span>
          </div>
        </div>

        {pos && (
          <div style={{ marginTop: 12, padding: 12, background: "var(--surface-2)", borderRadius: "var(--r-md)", border: "1px solid var(--line)" }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Your Position
            </div>
            <div className="kv" style={{ borderColor: "transparent", paddingTop: 2 }}>
              <span className="k">Shares</span>
              <span className="v">{shares(pos.quantity)}</span>
            </div>
            <div className="kv" style={{ borderColor: "transparent" }}>
              <span className="k">Market Value</span>
              <span className="v">{money(pos.marketValue)}</span>
            </div>
            <div className="kv" style={{ borderColor: "transparent", paddingBottom: 0 }}>
              <span className="k">Open P/L</span>
              <span className={`v ${dirClass(pos.openPnl)}`}>
                {signedMoney(pos.openPnl)} ({percent(pos.openPnlPct)})
              </span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            className="btn primary"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() => openTicket({ symbol, side: "buy" })}
          >
            Buy
          </button>
          <button
            className="btn"
            style={{ flex: 1, justifyContent: "center", color: "var(--down)" }}
            onClick={() => openTicket({ symbol, side: "sell" })}
          >
            Sell
          </button>
        </div>
        {pos && (
          <button
            className="btn ghost"
            style={{ width: "100%", justifyContent: "center", marginTop: 8, color: "var(--down)" }}
            onClick={() => openTicket({ symbol, side: "sell", qty: pos.quantity })}
          >
            Close position · {shares(pos.quantity)} sh
          </button>
        )}
        <div className="dim" style={{ fontSize: 10.5, marginTop: 8, textAlign: "center" }}>
          Order tickets route through the Robinhood agentic API (review required).
        </div>
      </div>
    </div>
  );
}
