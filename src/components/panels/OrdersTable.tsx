import { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";
import type { OrderRow } from "@shared/types";
import { api } from "../../lib/api";
import { shares, price as fmtPrice, fmtDate, fmtTime } from "../../lib/format";

const STATE_COLOR: Record<string, string> = {
  filled: "var(--up)",
  confirmed: "var(--brass)",
  queued: "var(--brass)",
  new: "var(--brass)",
  partially_filled: "var(--brass)",
  cancelled: "var(--text-3)",
  rejected: "var(--down)",
  failed: "var(--down)",
};

export function OrdersTable() {
  const account = useStore((s) => s.account);
  const initial = useStore((s) => s.orders);
  const [orders, setOrders] = useState<OrderRow[]>(initial);
  const select = useStore((s) => s.select);

  useEffect(() => {
    if (account) api.orders(account).then(setOrders).catch(() => {});
  }, [account]);

  if (orders.length === 0) return <div className="empty">No orders.</div>;

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Side</th>
          <th>Type</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Status</th>
          <th>Placed</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} onClick={() => o.symbol && select(o.symbol)}>
            <td style={{ fontWeight: 600 }}>{o.symbol}</td>
            <td className={o.side === "buy" ? "up" : "down"} style={{ textTransform: "uppercase", fontWeight: 600, fontSize: 11 }}>
              {o.side}
            </td>
            <td className="muted" style={{ fontSize: 12 }}>
              {o.type.replace("_", " ")}
            </td>
            <td>{shares(o.quantity)}</td>
            <td>{o.averageFillPrice ? fmtPrice(o.averageFillPrice) : o.price ? fmtPrice(o.price) : "—"}</td>
            <td>
              <span style={{ color: STATE_COLOR[o.state] ?? "var(--text-2)", textTransform: "capitalize", fontSize: 12, fontWeight: 600 }}>
                {o.state.replace("_", " ")}
              </span>
            </td>
            <td className="muted" style={{ fontSize: 12 }}>
              {fmtDate(o.createdAt)} {fmtTime(o.createdAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
