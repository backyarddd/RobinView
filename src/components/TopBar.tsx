import { useStore } from "../store/useStore";
import { useFlash } from "../hooks/useTrails";
import { ChangePill } from "./common/bits";
import { IconSearch } from "./common/icons";
import { ConnectControl, Feather } from "./ConnectRobinhood";
import { price as fmtPrice, signedMoney, dirClass } from "../lib/format";

export function TopBar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const symbol = useStore((s) => s.selected);
  const q = useStore((s) => s.quotes[symbol]);
  const connected = useStore((s) => s.connected);
  const mode = useStore((s) => s.mode);
  const rh = useStore((s) => s.robinhood);
  const accounts = useStore((s) => s.accounts);
  const account = useStore((s) => s.account);
  const setAccount = useStore((s) => s.setAccount);
  const disconnect = useStore((s) => s.disconnectRobinhood);
  const flash = useFlash(q?.price ?? 0);

  const mask = (n: string) => (n.length > 4 ? `••${n.slice(-4)}` : n);

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
            <span className={dirClass(q.change)} style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
              {signedMoney(q.change)}
            </span>
            <ChangePill pct={q.changePct} />
          </>
        )}
      </div>

      <div className="topbar-right">
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
            title="Connected to Robinhood — click to disconnect"
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
