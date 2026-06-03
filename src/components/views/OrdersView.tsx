import { OrdersTable } from "../panels/OrdersTable";

export function OrdersView() {
  return (
    <div className="pf">
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
          <h1 className="serif" style={{ fontSize: 28, fontWeight: 400 }}>
            Orders
          </h1>
          <span className="dim mono" style={{ fontSize: 12 }}>
            recent activity
          </span>
        </div>
        <div className="panel">
          <div className="panel-body">
            <OrdersTable />
          </div>
        </div>
      </div>
    </div>
  );
}
