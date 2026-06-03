import { useEffect, useState } from "react";
import { useStore } from "../../store/useStore";
import type { OrderRow } from "@shared/types";
import { api } from "../../lib/api";
import { shares, price as fmtPrice, fmtDate } from "../../lib/format";
import { useClock } from "../../hooks/useClock";

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

// Orders that can still be cancelled (i.e. not terminal).
const OPEN_STATES = new Set(["queued", "confirmed", "new", "unconfirmed", "partially_filled", "pending"]);

export function OrdersTable() {
  const account = useStore((s) => s.account);
  const initial = useStore((s) => s.orders);
  const refreshAccount = useStore((s) => s.refreshAccount);
  const [orders, setOrders] = useState<OrderRow[]>(initial);
  const [canceling, setCanceling] = useState<string | null>(null);
  const select = useStore((s) => s.select);
  const { fmtTime } = useClock();

  const reload = () => {
    if (account) api.orders(account).then(setOrders).catch(() => {});
  };
  useEffect(reload, [account]);
  // Reflect store order changes (e.g. newly placed orders) without a remount.
  useEffect(() => setOrders(initial), [initial]);

  async function cancel(id: string) {
    if (!account) return;
    setCanceling(id);
    try {
      await api.cancelOrder(account, id);
      reload();
      refreshAccount();
    } catch {
      /* surfaced as no-op; order stays */
    } finally {
      setCanceling(null);
    }
  }

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
          <th></th>
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
              {o.type.replace(/_/g, " ")}
            </td>
            <td>{shares(o.quantity)}</td>
            <td>{o.averageFillPrice ? fmtPrice(o.averageFillPrice) : o.price ? fmtPrice(o.price) : "—"}</td>
            <td>
              <span style={{ color: STATE_COLOR[o.state] ?? "var(--text-2)", textTransform: "capitalize", fontSize: 12, fontWeight: 600 }}>
                {o.state.replace(/_/g, " ")}
              </span>
            </td>
            <td className="muted" style={{ fontSize: 12 }}>
              {fmtDate(o.createdAt)} {fmtTime(o.createdAt)}
            </td>
            <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
              {OPEN_STATES.has(o.state) && (
                <button
                  className="btn sm ghost"
                  style={{ color: "var(--down)" }}
                  disabled={canceling === o.id}
                  onClick={() => cancel(o.id)}
                >
                  {canceling === o.id ? "…" : "Cancel"}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
