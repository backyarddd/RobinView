import { useState } from "react";
import { useStore } from "../../store/useStore";
import { SymBadge } from "../common/bits";
import { IconBell, IconTrash, IconPlus } from "../common/icons";
import { price as fmtPrice, timeAgo } from "../../lib/format";

export function AlertsPanel() {
  const alerts = useStore((s) => s.alerts);
  const quotes = useStore((s) => s.quotes);
  const selected = useStore((s) => s.selected);
  const add = useStore((s) => s.addAlert);
  const remove = useStore((s) => s.removeAlert);
  const select = useStore((s) => s.select);

  const [sym, setSym] = useState(selected);
  const [dir, setDir] = useState<"above" | "below">("above");
  const [px, setPx] = useState("");

  const submit = () => {
    const p = parseFloat(px);
    if (!sym || !isFinite(p)) return;
    add({ symbol: sym.toUpperCase(), direction: dir, price: p });
    setPx("");
    if (typeof Notification !== "undefined" && Notification.permission === "default")
      Notification.requestPermission();
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="alert-form">
        <input
          className="field"
          placeholder="Symbol"
          value={sym}
          onChange={(e) => setSym(e.target.value.toUpperCase())}
          style={{ textTransform: "uppercase" }}
        />
        <div className="seg">
          <button className={dir === "above" ? "on" : ""} onClick={() => setDir("above")}>
            ≥
          </button>
          <button className={dir === "below" ? "on" : ""} onClick={() => setDir("below")}>
            ≤
          </button>
        </div>
        <input
          className="field"
          placeholder="Price"
          value={px}
          inputMode="decimal"
          onChange={(e) => setPx(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ width: 100 }}
        />
        <button className="btn primary sm" onClick={submit}>
          <IconPlus size={14} /> Set
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {alerts.length === 0 && (
          <div className="empty">
            <IconBell size={22} />
            <span>No price alerts. Set one above — you'll be notified when price crosses.</span>
          </div>
        )}
        {alerts.map((a) => {
          const q = quotes[a.symbol];
          return (
            <div key={a.id} className={`alert-row ${a.triggered ? "done" : ""}`}>
              <SymBadge symbol={a.symbol} />
              <div onClick={() => select(a.symbol)} style={{ cursor: "pointer" }}>
                <div style={{ fontWeight: 600 }}>{a.symbol}</div>
                <div className="dim" style={{ fontSize: 11 }}>
                  {a.triggered ? `triggered ${timeAgo(a.triggered)}` : `watching ${timeAgo(a.createdAt)}`}
                </div>
              </div>
              <div className="mono" style={{ textAlign: "right" }}>
                <div style={{ color: a.direction === "above" ? "var(--up)" : "var(--down)", fontWeight: 600 }}>
                  {a.direction === "above" ? "≥" : "≤"} {fmtPrice(a.price)}
                </div>
                <div className="dim" style={{ fontSize: 11 }}>
                  now {q ? fmtPrice(q.price) : "—"}
                </div>
              </div>
              <button className="iconbtn" onClick={() => remove(a.id)} title="Delete alert">
                <IconTrash size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
