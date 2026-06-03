import { useMemo, useState } from "react";
import { useStore } from "../../store/useStore";
import type { Position } from "@shared/types";
import { SymBadge, ChangePill } from "../common/bits";
import { money, signedMoney, shares, price as fmtPrice, dirClass, percent } from "../../lib/format";

type Key = keyof Pick<
  Position,
  "symbol" | "quantity" | "averageBuyPrice" | "price" | "marketValue" | "dayChange" | "openPnl" | "portfolioWeight"
>;

const COLS: { key: Key; label: string }[] = [
  { key: "symbol", label: "Symbol" },
  { key: "quantity", label: "Qty" },
  { key: "averageBuyPrice", label: "Avg" },
  { key: "price", label: "Price" },
  { key: "marketValue", label: "Mkt Value" },
  { key: "dayChange", label: "Day" },
  { key: "openPnl", label: "Open P/L" },
  { key: "portfolioWeight", label: "Weight" },
];

export function PositionsTable({ onOpenSymbol }: { onOpenSymbol?: (s: string) => void } = {}) {
  const positions = useStore((s) => s.positions);
  const select = useStore((s) => s.select);
  const open = onOpenSymbol ?? select;
  const openTicket = useStore((s) => s.openTicket);
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "marketValue", dir: -1 });

  const rows = useMemo(() => {
    const r = [...positions];
    r.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === "string") return sort.dir * av.localeCompare(bv as string);
      return sort.dir * ((av as number) - (bv as number));
    });
    return r;
  }, [positions, sort]);

  const clickSort = (key: Key) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }));

  if (positions.length === 0)
    return (
      <div className="empty">
        <span>No open positions in this account.</span>
      </div>
    );

  return (
    <table className="tbl">
      <thead>
        <tr>
          {COLS.map((c) => (
            <th
              key={c.key}
              className={sort.key === c.key ? "sorted" : ""}
              onClick={() => clickSort(c.key)}
            >
              {c.label}
              {sort.key === c.key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
            </th>
          ))}
          <th style={{ textAlign: "right" }}>Trade</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.symbol} onClick={() => open(p.symbol)}>
            <td>
              <div className="cell-sym">
                <SymBadge symbol={p.symbol} />
                <div className="nm">
                  <span style={{ fontWeight: 600 }}>{p.symbol}</span>
                  <small>{p.name}</small>
                </div>
              </div>
            </td>
            <td>{shares(p.quantity)}</td>
            <td className="muted">{fmtPrice(p.averageBuyPrice)}</td>
            <td>{fmtPrice(p.price)}</td>
            <td style={{ fontWeight: 600 }}>{money(p.marketValue)}</td>
            <td className={dirClass(p.dayChange)}>
              {signedMoney(p.dayChange)}
              <div style={{ fontSize: 11 }} className={dirClass(p.dayChange)}>
                {percent(p.dayChangePct)}
              </div>
            </td>
            <td className={dirClass(p.openPnl)}>
              {signedMoney(p.openPnl)}
              <div style={{ fontSize: 11 }} className={dirClass(p.openPnl)}>
                {percent(p.openPnlPct)}
              </div>
            </td>
            <td>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                <div style={{ width: 42, height: 5, borderRadius: 3, background: "var(--surface-3)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, p.portfolioWeight * 100)}%`, height: "100%", background: "var(--brass)" }} />
                </div>
                <span className="muted">{(p.portfolioWeight * 100).toFixed(1)}%</span>
              </div>
            </td>
            <td onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                <button className="btn sm" style={{ color: "var(--up)" }} onClick={() => openTicket({ symbol: p.symbol, side: "buy" })}>
                  Buy
                </button>
                <button className="btn sm" style={{ color: "var(--down)" }} onClick={() => openTicket({ symbol: p.symbol, side: "sell" })}>
                  Sell
                </button>
                <button
                  className="btn sm ghost"
                  title={`Sell all ${shares(p.quantity)} shares`}
                  onClick={() => openTicket({ symbol: p.symbol, side: "sell", qty: p.quantity })}
                >
                  Close
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
