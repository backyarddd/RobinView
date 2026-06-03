import { useStore } from "../store/useStore";
import { IconArrow } from "./common/icons";

// Compact top-bar control: connect / connecting / account+disconnect.
export function ConnectControl() {
  const rh = useStore((s) => s.robinhood);
  const connecting = useStore((s) => s.connectingRobinhood);
  const connect = useStore((s) => s.connectRobinhood);

  if (!rh.available) return null;
  if (rh.connected) return null; // account selector shown elsewhere when connected

  return (
    <button className="btn" onClick={connect} disabled={connecting} style={{ borderColor: "var(--brass-dim)", color: "var(--brass)" }}>
      {connecting ? <span className="loader" style={{ width: 13, height: 13, borderTopColor: "var(--brass)" }} /> : <Feather />}
      {connecting ? "Connecting…" : "Connect Robinhood"}
    </button>
  );
}

// Full empty-state card used in Portfolio / Positions when not connected.
export function ConnectCard({ context = "portfolio" }: { context?: string }) {
  const rh = useStore((s) => s.robinhood);
  const connecting = useStore((s) => s.connectingRobinhood);
  const connect = useStore((s) => s.connectRobinhood);

  return (
    <div className="empty" style={{ height: "100%" }}>
      <div style={{ maxWidth: 380, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 16,
            display: "grid",
            placeItems: "center",
            background: "var(--brass-glow)",
            border: "1px solid var(--brass-dim)",
            color: "var(--brass)",
          }}
        >
          <Feather size={26} />
        </div>
        <div>
          <div className="serif" style={{ fontSize: 21, color: "var(--text-1)", marginBottom: 6 }}>
            Connect your Robinhood account
          </div>
          <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.55, margin: 0 }}>
            RobinView authorizes directly with Robinhood to read your real {context} — positions,
            balances and order history. Charts and market data work without connecting.
          </p>
        </div>
        <button
          className="btn primary"
          onClick={connect}
          disabled={connecting}
          style={{ height: 38, padding: "0 18px", background: "var(--brass)", color: "#1a1206" }}
        >
          {connecting ? "Opening Robinhood…" : "Connect Robinhood"}
          {!connecting && <IconArrow size={16} />}
        </button>
        {!rh.available && (
          <span className="dim" style={{ fontSize: 11 }}>
            Live mode is disabled (running the demo simulator).
          </span>
        )}
        <span className="dim" style={{ fontSize: 11, maxWidth: 320 }}>
          You'll be prompted to open a Robinhood Agentic account. Read access only unless you place a trade.
        </span>
      </div>
    </div>
  );
}

export function Feather({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 4c-7 0-13 4-15 11l-2 5 5-2C15 16 19 11 20 4Z"
        fill="currentColor"
        opacity="0.92"
      />
      <path d="M8 18C10 12 14 8 19 6" stroke="#0a0c0b" strokeOpacity="0.35" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
