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
} from "./common/icons";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { TerminalView } from "./views/TerminalView";
import { PortfolioView } from "./views/PortfolioView";
import { MarketsView } from "./views/MarketsView";
import { OrdersView } from "./views/OrdersView";
import { AlertsView } from "./views/AlertsView";

export type View = "terminal" | "portfolio" | "markets" | "orders" | "alerts";

const NAV: { id: View; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: "terminal", label: "Terminal", icon: IconTerminal },
  { id: "portfolio", label: "Portfolio", icon: IconWallet },
  { id: "markets", label: "Markets", icon: IconGrid },
  { id: "orders", label: "Orders", icon: IconList },
  { id: "alerts", label: "Alerts", icon: IconBell },
];

export function AppShell() {
  const [view, setView] = useState<View>("terminal");
  const [palette, setPalette] = useState(false);
  const init = useStore((s) => s.init);
  const alerts = useStore((s) => s.alerts);
  const activeAlerts = alerts.filter((a) => !a.triggered).length;

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
      if (e.key === "/" && !palette && !(e.target as HTMLElement)?.matches?.("input,textarea")) {
        e.preventDefault();
        setPalette(true);
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
        <button className="rail-btn" title="Settings">
          <IconGear size={20} />
          <span className="rail-tip">Settings · ⌘K</span>
        </button>
      </nav>

      <TopBar onOpenSearch={() => setPalette(true)} />

      <main className="main">
        {view === "terminal" && <TerminalView onOpenSearch={() => setPalette(true)} />}
        {view === "portfolio" && <PortfolioView />}
        {view === "markets" && <MarketsView />}
        {view === "orders" && <OrdersView />}
        {view === "alerts" && <AlertsView />}
      </main>

      <CommandPalette open={palette} onClose={() => setPalette(false)} onNavigate={setView} />
    </div>
  );
}
