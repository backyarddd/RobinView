import { useState } from "react";
import { useStore } from "../../store/useStore";
import { TradingChart } from "../chart/TradingChart";
import { Watchlist } from "../panels/Watchlist";
import { SymbolQuote } from "../panels/SymbolQuote";
import { PositionsTable } from "../panels/PositionsTable";
import { OrdersTable } from "../panels/OrdersTable";
import { AlertsPanel } from "../panels/AlertsPanel";
import { SymbolInfo } from "../panels/SymbolInfo";
import { ConnectCard } from "../ConnectRobinhood";

type Tab = "lists" | "positions" | "orders" | "alerts";

export function TerminalView({ onOpenSearch }: { onOpenSearch: () => void }) {
  const symbol = useStore((s) => s.selected);
  const positions = useStore((s) => s.positions);
  const alerts = useStore((s) => s.alerts);
  const watchlist = useStore((s) => s.watchlist);
  const rhConnected = useStore((s) => s.mode === "demo" || s.robinhood.connected);
  const [tab, setTab] = useState<Tab>("lists");

  return (
    <div className="terminal">
      <TradingChart symbol={symbol} onOpenSearch={onOpenSearch} />

      {/* Right column: quote + buy/sell, then the rich symbol-info panel. */}
      <div className="t-side">
        <SymbolQuote />
        <SymbolInfo symbol={symbol} />
      </div>

      {/* Bottom: watchlists now live here alongside positions / orders / alerts. */}
      <div className="panel t-bottom">
        <div className="panel-head">
          <div className="tabs">
            <button className={`tab ${tab === "lists" ? "on" : ""}`} onClick={() => setTab("lists")}>
              Watchlist <span className="badge">{watchlist.length}</span>
            </button>
            <button className={`tab ${tab === "positions" ? "on" : ""}`} onClick={() => setTab("positions")}>
              Positions <span className="badge">{positions.length}</span>
            </button>
            <button className={`tab ${tab === "orders" ? "on" : ""}`} onClick={() => setTab("orders")}>
              Orders
            </button>
            <button className={`tab ${tab === "alerts" ? "on" : ""}`} onClick={() => setTab("alerts")}>
              Alerts <span className="badge">{alerts.filter((a) => !a.triggered).length}</span>
            </button>
          </div>
        </div>
        <div className="panel-body">
          {tab === "lists" && <Watchlist onAdd={onOpenSearch} flush />}
          {(tab === "positions" || tab === "orders") && !rhConnected ? (
            <ConnectCard context={tab === "positions" ? "positions" : "orders"} />
          ) : (
            <>
              {tab === "positions" && <PositionsTable />}
              {tab === "orders" && <OrdersTable />}
            </>
          )}
          {tab === "alerts" && <AlertsPanel />}
        </div>
      </div>
    </div>
  );
}
