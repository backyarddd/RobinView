import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { LogoMark } from "./common/Logo";
import {
  IconTerminal,
  IconWallet,
  IconGrid,
  IconList,
  IconBell,
  IconGear,
  IconFunnel,
} from "./common/icons";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { SettingsModal } from "./SettingsModal";
import { UpdateBanner } from "./UpdateBanner";
import { APP_VERSION } from "../lib/version";
import { TradeTicket } from "./trade/TradeTicket";
import { VIEW_PATHS } from "../lib/constants";
import { TerminalView } from "./views/TerminalView";
import { PortfolioView } from "./views/PortfolioView";
import { MarketsView } from "./views/MarketsView";
import { OrdersView } from "./views/OrdersView";
import { AlertsView } from "./views/AlertsView";
import { ScreenerView } from "./views/ScreenerView";

export type View = "terminal" | "portfolio" | "markets" | "screener" | "orders" | "alerts";

const NAV: { id: View; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: "terminal", label: "Terminal", icon: IconTerminal },
  { id: "portfolio", label: "Portfolio", icon: IconWallet },
  { id: "markets", label: "Markets", icon: IconGrid },
  { id: "screener", label: "Screener", icon: IconFunnel },
  { id: "orders", label: "Orders", icon: IconList },
  { id: "alerts", label: "Alerts", icon: IconBell },
];

export function AppShell() {
  // Initial view from the URL: /portfolio etc. selects that view; any other
  // path (e.g. /SPY, parsed by the store into `selected`) means the terminal.
  const [view, setView] = useState<View>(() => {
    const seg = location.pathname.split("/")[1]?.toLowerCase() || "";
    return (VIEW_PATHS as readonly string[]).includes(seg) ? (seg as View) : "terminal";
  });
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [settings, setSettings] = useState(false);
  const init = useStore((s) => s.init);
  const alerts = useStore((s) => s.alerts);
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selected);
  const checkUpdate = useStore((s) => s.checkUpdate);
  const hasUpdate = useStore((s) => !!s.update.info?.hasUpdate);
  const activeAlerts = alerts.filter((a) => !a.triggered).length;

  // Mirror the current place into the URL (terminal -> /SPY, others -> /orders)
  // so a refresh or a shared link lands exactly where you were. replaceState
  // keeps history clean (no entry per watchlist click).
  useEffect(() => {
    const path = view === "terminal" ? `/${encodeURIComponent(selected)}` : `/${view}`;
    if (location.pathname !== path) history.replaceState(null, "", path);
  }, [view, selected]);

  // Select a symbol and jump to the Terminal (the only view that hosts the chart).
  const openSymbol = (s: string) => {
    select(s);
    setView("terminal");
  };

  useEffect(() => {
    init();
  }, [init]);

  // Re-check GitHub for a newer release once an hour (launch check runs in init()).
  useEffect(() => {
    const id = setInterval(() => checkUpdate(), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [checkUpdate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
      const inField = (e.target as HTMLElement)?.matches?.("input,textarea,select");
      if (e.key === "/" && !palette && !inField) {
        e.preventDefault();
        setPalette(true);
      }
      if (e.key === "?" && !inField) {
        e.preventDefault();
        setShortcuts((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [palette]);

  return (
    <div className="shell">
      <nav className="rail">
        <div className="rail-logo" title="RobinView">
          <LogoMark size={30} />
        </div>
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              className={`rail-btn ${view === n.id ? "active" : ""}`}
              onClick={() => setView(n.id)}
            >
              <Icon size={20} />
              {n.id === "alerts" && activeAlerts > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--brass)",
                  }}
                />
              )}
              <span className="rail-tip">{n.label}</span>
            </button>
          );
        })}
        <div className="rail-spacer" />
        <button
          className={`rail-btn ${settings ? "active" : ""}`}
          title="Settings"
          onClick={() => setSettings(true)}
        >
          <IconGear size={20} />
          {hasUpdate && <span className="rail-update-dot" />}
          <span className="rail-tip">Settings{hasUpdate ? " · update available" : ""}</span>
        </button>
        <button
          className="rail-version mono"
          title={hasUpdate ? "Update available - open Settings" : "RobinView version"}
          onClick={() => setSettings(true)}
        >
          v{APP_VERSION}
          {hasUpdate && <span className="rail-version-dot" />}
        </button>
      </nav>

      <main className="main">
        {/* Terminal stays mounted (just hidden) across tab switches: it owns
            lightweight-charts instances whose teardown-on-unmount races the DOM
            detach and throws "Object is disposed"; keeping it alive also preserves
            chart state and makes returning to it instant. */}
        <div style={{ display: view === "terminal" ? "contents" : "none" }}>
          <TerminalView onOpenSearch={() => setPalette(true)} />
        </div>
        {view === "portfolio" && <PortfolioView onOpenSymbol={openSymbol} />}
        {view === "markets" && <MarketsView onOpenSymbol={openSymbol} />}
        {view === "screener" && <ScreenerView onOpenSymbol={openSymbol} />}
        {view === "orders" && <OrdersView />}
        {view === "alerts" && <AlertsView />}
      </main>

      <CommandPalette open={palette} onClose={() => setPalette(false)} onNavigate={setView} />
      <ShortcutsHelp open={shortcuts} onClose={() => setShortcuts(false)} />
      <SettingsModal open={settings} onClose={() => setSettings(false)} />
      <UpdateBanner />
      <TradeTicket />
    </div>
  );
}
