import { useState } from "react";
import { useStore } from "../../store/useStore";
import { TradingChart } from "../chart/TradingChart";
import { Watchlist } from "../panels/Watchlist";
import { SymbolQuote } from "../panels/SymbolQuote";
import { PositionsTable } from "../panels/PositionsTable";
import { OrdersTable } from "../panels/OrdersTable";
import { AlertsPanel } from "../panels/AlertsPanel";
import { SymbolInfo } from "../panels/SymbolInfo";
import { NewsPanel } from "../panels/NewsPanel";
import { ConnectCard } from "../ConnectRobinhood";

type Tab = "positions" | "orders" | "alerts" | "info" | "news";

export function TerminalView({ onOpenSearch }: { onOpenSearch: () => void }) {
  const symbol = useStore((s) => s.selected);
  const positions = useStore((s) => s.positions);
  const alerts = useStore((s) => s.alerts);
  const rhConnected = useStore((s) => s.mode === "demo" || s.robinhood.connected);
  const [tab, setTab] = useState<Tab>("positions");

  return (
    <div className="terminal">
      <TradingChart symbol={symbol} />

      <div className="t-side">
        <SymbolQuote />
        <Watchlist onAdd={onOpenSearch} />
      </div>

      <div className="panel t-bottom">
        <div className="panel-head">
          <div className="tabs">
            <button className={`tab ${tab === "positions" ? "on" : ""}`} onClick={() => setTab("positions")}>
              Positions <span className="badge">{positions.length}</span>
            </button>
            <button className={`tab ${tab === "orders" ? "on" : ""}`} onClick={() => setTab("orders")}>
              Orders
            </button>
            <button className={`tab ${tab === "alerts" ? "on" : ""}`} onClick={() => setTab("alerts")}>
              Alerts <span className="badge">{alerts.filter((a) => !a.triggered).length}</span>
            </button>
            <button className={`tab ${tab === "info" ? "on" : ""}`} onClick={() => setTab("info")}>
              Info
            </button>
            <button className={`tab ${tab === "news" ? "on" : ""}`} onClick={() => setTab("news")}>
              News
            </button>
          </div>
        </div>
        <div className="panel-body">
          {(tab === "positions" || tab === "orders") && !rhConnected ? (
            <ConnectCard context={tab} />
          ) : (
            <>
              {tab === "positions" && <PositionsTable />}
              {tab === "orders" && <OrdersTable />}
              {tab === "alerts" && <AlertsPanel />}
              {tab === "info" && <SymbolInfo symbol={symbol} />}
              {tab === "news" && <NewsPanel symbol={symbol} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
