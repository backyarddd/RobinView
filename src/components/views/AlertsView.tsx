import { AlertsPanel } from "../panels/AlertsPanel";

export function AlertsView() {
  return (
    <div className="pf">
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
          <h1 className="serif" style={{ fontSize: 28, fontWeight: 400 }}>
            Price Alerts
          </h1>
          <span className="dim mono" style={{ fontSize: 12 }}>
            crossing notifications
          </span>
        </div>
        <div className="panel" style={{ minHeight: 420 }}>
          <AlertsPanel />
        </div>
      </div>
    </div>
  );
}
