import { useStore } from "../store/useStore";
import { useFlash } from "../hooks/useTrails";
import { ChangePill } from "./common/bits";
import { IconSearch } from "./common/icons";
import { ConnectControl, Feather } from "./ConnectRobinhood";
import { MarketClock } from "./common/MarketClock";
import { price as fmtPrice, signedMoney, dirClass } from "../lib/format";

export function TopBar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const symbol = useStore((s) => s.selected);
  const q = useStore((s) => s.quotes[symbol]);
  const chartTf = useStore((s) => s.chartTf);
  const periodStart = useStore((s) => s.periodStart);
  const connected = useStore((s) => s.connected);
  const mode = useStore((s) => s.mode);
  const rh = useStore((s) => s.robinhood);
  const accounts = useStore((s) => s.accounts);
  const account = useStore((s) => s.account);
  const setAccount = useStore((s) => s.setAccount);
  const disconnect = useStore((s) => s.disconnectRobinhood);
  const flash = useFlash(q?.price ?? 0);

  const mask = (n: string) => (n.length > 4 ? `••${n.slice(-4)}` : n);

  // Change over the selected chart timeframe: live price vs the period's opening
  // price (published by the chart). Falls back to the live daily move until the
  // baseline for the current symbol/timeframe is available. The live "today" P/L
  // still lives in the symbol panel on the right, so this isn't redundant.
  const usePeriod = !!(q && periodStart && periodStart.symbol === symbol && periodStart.price > 0);
  const periodTf = usePeriod ? periodStart!.tf : chartTf;
  const change = usePeriod ? q!.price - periodStart!.price : q?.change ?? 0;
  const changePct = usePeriod ? (change / periodStart!.price) * 100 : q?.changePct ?? 0;

  return (
    <header className="topbar">
      <button className="searchbtn" onClick={onOpenSearch}>
        <IconSearch size={15} />
        <span>Search symbols…</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="topbar-ticker">
        <span className="topbar-sym serif">{symbol}</span>
        <span className="topbar-name">{q?.name ?? ""}</span>
        <span className={`topbar-price ${flash}`}>{q ? fmtPrice(q.price) : "—"}</span>
        {q && (
          <>
            <span className="topbar-tf mono" title={`Change over the ${periodTf} chart range`}>
              {periodTf}
            </span>
            <span className={dirClass(change)} style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
              {signedMoney(change)}
            </span>
            <ChangePill pct={changePct} />
          </>
        )}
      </div>

      <div className="topbar-right">
        <MarketClock />
        {(rh.connected || mode === "demo") && accounts.length > 0 && (
          <select className="acct-select" value={account} onChange={(e) => setAccount(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.accountNumber} value={a.accountNumber}>
                {a.nickname || a.brokerageAccountType.replace("_", " ")} · {mask(a.accountNumber)}
              </option>
            ))}
          </select>
        )}

        {rh.connected ? (
          <button
            className="modebadge live"
            onClick={() => {
              if (confirm("Disconnect RobinView from Robinhood?")) disconnect();
            }}
            title="Connected to Robinhood - click to disconnect"
            style={{ color: "var(--brass)", borderColor: "var(--brass-dim)", background: "var(--brass-glow)" }}
          >
            <Feather size={12} />
            Robinhood
          </button>
        ) : (
          <ConnectControl />
        )}

        <div className={`modebadge ${mode === "demo" ? "" : "live"}`} title={mode === "demo" ? "Simulated market data" : "Live market data"}>
          <span className={`conn-dot ${!connected ? "off" : mode === "demo" ? "" : "live"}`} />
          {mode === "demo" ? "Demo" : "Live"}
        </div>
      </div>
    </header>
  );
}
