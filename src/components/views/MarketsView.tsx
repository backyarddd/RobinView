import { useEffect, useState } from "react";
import type { Quote } from "@shared/types";
import { api } from "../../lib/api";
import { useStore } from "../../store/useStore";
import { MARKET_SYMBOLS } from "../../lib/constants";
import { ChangePill, SymBadge } from "../common/bits";
import { price as fmtPrice, percent, compactNum, signedMoney, dirClass } from "../../lib/format";

// Map a daily % move to a heatmap background (emerald ↔ coral, intensity by magnitude).
function heatColor(pct: number): string {
  const cap = 4;
  const t = Math.max(-1, Math.min(1, pct / cap));
  const a = 0.1 + Math.abs(t) * 0.55;
  return t >= 0 ? `rgba(52,226,155,${a.toFixed(3)})` : `rgba(255,106,87,${a.toFixed(3)})`;
}

export function MarketsView() {
  const select = useStore((s) => s.select);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => {
    let alive = true;
    const tick = () =>
      api
        .quotes(MARKET_SYMBOLS)
        .then((qs) => {
          if (!alive) return;
          const map: Record<string, Quote> = {};
          for (const q of qs) map[q.symbol] = q;
          setQuotes(map);
        })
        .catch(() => {});
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const list = MARKET_SYMBOLS.map((s) => quotes[s]).filter(Boolean) as Quote[];
  const gainers = [...list].sort((a, b) => b.changePct - a.changePct).slice(0, 8);
  const losers = [...list].sort((a, b) => a.changePct - b.changePct).slice(0, 8);
  // Spark quotes carry no volume, so rank "most active" by absolute move.
  const active = [...list].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 8);

  return (
    <div className="pf">
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
          <h1 className="serif" style={{ fontSize: 28, fontWeight: 400 }}>
            Markets
          </h1>
          <span className="dim mono" style={{ fontSize: 12 }}>
            {list.length} instruments · live
          </span>
        </div>

        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <span className="panel-title">Heatmap</span>
            <span className="dim" style={{ fontSize: 11 }}>
              colored by today's move
            </span>
          </div>
          <div className="heat">
            {list.map((q) => (
              <div
                key={q.symbol}
                className="heat-cell"
                style={{ background: heatColor(q.changePct) }}
                onClick={() => select(q.symbol)}
              >
                <div className="hs">{q.symbol}</div>
                <div>
                  <div className="hp">{fmtPrice(q.price)}</div>
                  <div className="hp" style={{ color: q.changePct >= 0 ? "var(--up)" : "var(--down)" }}>
                    {percent(q.changePct)}
                  </div>
                </div>
              </div>
            ))}
            {list.length === 0 &&
              Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="skel" style={{ height: 74, borderRadius: 6 }} />
              ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <MoverList title="Top Gainers" rows={gainers} onPick={select} />
          <MoverList title="Top Losers" rows={losers} onPick={select} />
          <MoverList title="Most Active" rows={active} onPick={select} />
        </div>
      </div>
    </div>
  );
}

function MoverList({
  title,
  rows,
  onPick,
}: {
  title: string;
  rows: Quote[];
  onPick: (s: string) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">{title}</span>
      </div>
      <div className="panel-body">
        {rows.map((q, i) => (
          <div key={q.symbol} className="mover-row" onClick={() => onPick(q.symbol)}>
            <span className="mover-rank">{i + 1}</span>
            <div className="cell-sym">
              <SymBadge symbol={q.symbol} />
              <div className="nm">
                <span style={{ fontWeight: 600 }}>{q.symbol}</span>
                <small style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {q.name}
                </small>
              </div>
            </div>
            <div className="mono" style={{ textAlign: "right", fontSize: 13 }}>
              {fmtPrice(q.price)}
            </div>
            <ChangePill pct={q.changePct} />
          </div>
        ))}
        {rows.length === 0 && <div className="empty">Loading…</div>}
      </div>
    </div>
  );
}
