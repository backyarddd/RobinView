import { useEffect } from "react";
import { useStore } from "../store/useStore";
import { IconX } from "./common/icons";
import { Feather } from "./ConnectRobinhood";
import { APP_VERSION } from "../lib/version";

// Remove every persisted RobinView key, then hard-reload so all views reset.
function clearKeys(prefix: string) {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mode = useStore((s) => s.mode);
  const connected = useStore((s) => s.connected);
  const rh = useStore((s) => s.robinhood);
  const connecting = useStore((s) => s.connectingRobinhood);
  const connect = useStore((s) => s.connectRobinhood);
  const disconnect = useStore((s) => s.disconnectRobinhood);
  const accounts = useStore((s) => s.accounts);
  const account = useStore((s) => s.account);
  const setAccount = useStore((s) => s.setAccount);
  const hour12 = useStore((s) => s.hour12);
  const setHour12 = useStore((s) => s.setHour12);
  const update = useStore((s) => s.update);
  const checkUpdate = useStore((s) => s.checkUpdate);
  const applyUpdate = useStore((s) => s.applyUpdate);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const mask = (n: string) => (n.length > 4 ? `••${n.slice(-4)}` : n);

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="kbd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kbd-head">
          <span className="kbd-title">Settings</span>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </button>
        </div>

        <div className="kbd-body">
          {/* Connection */}
          <div className="kbd-group">
            <div className="kbd-group-title eyebrow">Connection</div>
            <div className="set-row">
              <div className="set-row-text">
                <div className="set-row-label">Market data</div>
                <div className="set-row-sub">
                  {mode === "demo" ? "Simulated quotes - no real money" : "Live market data"}
                </div>
              </div>
              <div className={`modebadge ${mode === "demo" ? "" : "live"}`}>
                <span className={`conn-dot ${!connected ? "off" : mode === "demo" ? "" : "live"}`} />
                {mode === "demo" ? "Demo" : "Live"}
              </div>
            </div>

            <div className="set-row">
              <div className="set-row-text">
                <div className="set-row-label">Robinhood</div>
                <div className="set-row-sub">
                  {rh.connected
                    ? "Connected - orders route through the agentic API"
                    : rh.available
                      ? "Connect to place live orders"
                      : "Unavailable in this environment"}
                </div>
              </div>
              {rh.connected ? (
                <button
                  className="btn sm ghost"
                  onClick={() => confirm("Disconnect RobinView from Robinhood?") && disconnect()}
                >
                  Disconnect
                </button>
              ) : (
                <button className="btn sm" onClick={() => connect()} disabled={!rh.available || connecting}>
                  <Feather size={12} />
                  {connecting ? "Connecting…" : "Connect"}
                </button>
              )}
            </div>

            {(rh.connected || mode === "demo") && accounts.length > 0 && (
              <div className="set-row">
                <div className="set-row-text">
                  <div className="set-row-label">Default account</div>
                  <div className="set-row-sub">Used for quotes, positions and orders</div>
                </div>
                <select className="acct-select" value={account} onChange={(e) => setAccount(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.accountNumber} value={a.accountNumber}>
                      {a.nickname || a.brokerageAccountType.replace("_", " ")} · {mask(a.accountNumber)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Preferences */}
          <div className="kbd-group">
            <div className="kbd-group-title eyebrow">Preferences</div>
            <div className="set-row">
              <div className="set-row-text">
                <div className="set-row-label">Time format</div>
                <div className="set-row-sub">How clock times show across orders and the market clock</div>
              </div>
              <div className="seg">
                <button className={hour12 ? "on" : ""} onClick={() => setHour12(true)}>
                  12-hour
                </button>
                <button className={!hour12 ? "on" : ""} onClick={() => setHour12(false)}>
                  24-hour
                </button>
              </div>
            </div>
          </div>

          {/* Updates */}
          <div className="kbd-group">
            <div className="kbd-group-title eyebrow">Updates</div>
            <div className="set-row">
              <div className="set-row-text">
                <div className="set-row-label">
                  {update.info?.hasUpdate ? "Update available" : "RobinView is up to date"}
                </div>
                <div className="set-row-sub">
                  {update.error ? (
                    <span className="set-danger">{update.error}</span>
                  ) : update.info?.hasUpdate ? (
                    <>
                      v{update.info.current} installed · {update.info.latest} available
                      {update.info.url && (
                        <>
                          {" · "}
                          <a href={update.info.url} target="_blank" rel="noreferrer" style={{ color: "var(--brass)" }}>
                            release notes
                          </a>
                        </>
                      )}
                    </>
                  ) : update.checking ? (
                    "Checking GitHub…"
                  ) : (
                    `v${update.info?.current ?? APP_VERSION} · checks GitHub on launch and hourly`
                  )}
                </div>
              </div>
              {update.info?.hasUpdate ? (
                <button className="btn sm" onClick={() => applyUpdate()} disabled={update.applying}>
                  {update.applying ? "Updating…" : "Update now"}
                </button>
              ) : (
                <button className="btn sm ghost" onClick={() => checkUpdate(true)} disabled={update.checking}>
                  {update.checking ? "Checking…" : "Check now"}
                </button>
              )}
            </div>
          </div>

          {/* Local data */}
          <div className="kbd-group">
            <div className="kbd-group-title eyebrow">Local data</div>
            <div className="set-row">
              <div className="set-row-text">
                <div className="set-row-label">Chart drawings</div>
                <div className="set-row-sub">Trend lines, fibs and notes saved on this device</div>
              </div>
              <button
                className="btn sm ghost"
                onClick={() => {
                  if (!confirm("Delete all saved chart drawings? This can't be undone.")) return;
                  clearKeys("robinview.drawings.");
                  location.reload();
                }}
              >
                Clear drawings
              </button>
            </div>
            <div className="set-row">
              <div className="set-row-text">
                <div className="set-row-label">Reset RobinView</div>
                <div className="set-row-sub">Clears watchlists, alerts, drawings and preferences, then reloads</div>
              </div>
              <button
                className="btn sm ghost set-danger"
                onClick={() => {
                  if (!confirm("Reset all local data? Watchlists, alerts and drawings will be erased.")) return;
                  clearKeys("robinview.");
                  location.reload();
                }}
              >
                Reset all
              </button>
            </div>
          </div>

          {/* About */}
          <div className="kbd-group">
            <div className="kbd-group-title eyebrow">About</div>
            <div className="set-row">
              <div className="set-row-text">
                <div className="set-row-label">RobinView</div>
                <div className="set-row-sub">A calmer terminal for Robinhood - charts, watchlists and trading.</div>
              </div>
              <span className="mono dim" style={{ fontSize: 12 }}>
                v{APP_VERSION}
              </span>
            </div>
          </div>
        </div>

        <div className="kbd-foot">
          <span>
            Press <kbd className="kbd">Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
