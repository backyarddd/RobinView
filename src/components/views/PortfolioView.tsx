import { useStore } from "../../store/useStore";
import { PositionsTable } from "../panels/PositionsTable";
import { AllocationDonut } from "../panels/AllocationDonut";
import { ConnectCard } from "../ConnectRobinhood";
import { Sparkline, ChangePill } from "../common/bits";
import { money, signedMoney, percent, dirClass, compactMoney } from "../../lib/format";

export function PortfolioView() {
  const pf = useStore((s) => s.portfolio);
  const ready = useStore((s) => s.mode === "demo" || s.robinhood.connected);
  const trail = useStore((s) => s.equityTrail);
  const positions = useStore((s) => s.positions);

  if (!ready) return <ConnectCard context="portfolio" />;

  if (!pf)
    return (
      <div className="empty" style={{ height: "100%" }}>
        <div className="loader" />
        <span>Loading your Robinhood portfolio…</span>
      </div>
    );

  const curve = trail.length > 1 ? trail.map((p) => p.v) : [pf.totalValue - pf.dayChange, pf.totalValue];
  const dayUp = pf.dayChange >= 0;

  return (
    <div className="pf">
      <div className="pf-grid">
        {/* HERO */}
        <div className="panel pf-hero">
          <div>
            <div className="eyebrow">Portfolio Value</div>
            <div className="pf-value">{money(pf.totalValue)}</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
              <span className={`mono ${dirClass(pf.dayChange)}`} style={{ fontSize: 15, fontWeight: 600 }}>
                {signedMoney(pf.dayChange)}
              </span>
              <ChangePill pct={pf.dayChangePct} />
              <span className="dim" style={{ fontSize: 12 }}>
                today
              </span>
            </div>
            <div className="pf-sub">
              <div className="stat">
                <span className="k">Total Return</span>
                <span className={`v ${dirClass(pf.totalChange)}`}>
                  {signedMoney(pf.totalChange)} ({percent(pf.totalChangePct)})
                </span>
              </div>
              <div className="stat">
                <span className="k">Buying Power</span>
                <span className="v">{money(pf.buyingPower)}</span>
              </div>
              <div className="stat">
                <span className="k">Cash</span>
                <span className="v">{money(pf.cash)}</span>
              </div>
              <div className="stat">
                <span className="k">Cost Basis</span>
                <span className="v">{money(pf.costBasis)}</span>
              </div>
            </div>
          </div>
          <div className="pf-curve">
            <Sparkline
              data={curve}
              width={520}
              height={132}
              color={dayUp ? "var(--up)" : "var(--down)"}
            />
            <div className="dim mono" style={{ position: "absolute", bottom: 0, right: 0, fontSize: 10 }}>
              live equity curve · session
            </div>
          </div>
        </div>

        {/* POSITIONS */}
        <div className="panel" style={{ minHeight: 320 }}>
          <div className="panel-head">
            <span className="panel-title">Holdings</span>
            <span className="dim mono" style={{ fontSize: 11 }}>
              {positions.length} positions · {compactMoney(pf.equityValue)}
            </span>
          </div>
          <div className="panel-body">
            <PositionsTable />
          </div>
        </div>

        {/* ALLOCATION */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <AllocationDonut />
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Account Breakdown</span>
            </div>
            <div className="panel-pad">
              <div className="kv">
                <span className="k">Equities</span>
                <span className="v">{money(pf.equityValue)}</span>
              </div>
              {pf.optionsValue > 0 && (
                <div className="kv">
                  <span className="k">Options</span>
                  <span className="v">{money(pf.optionsValue)}</span>
                </div>
              )}
              {pf.cryptoValue > 0 && (
                <div className="kv">
                  <span className="k">Crypto</span>
                  <span className="v">{money(pf.cryptoValue)}</span>
                </div>
              )}
              <div className="kv">
                <span className="k">Cash</span>
                <span className="v">{money(pf.cash)}</span>
              </div>
              <div className="kv" style={{ borderBottom: "none", paddingTop: 10 }}>
                <span className="k" style={{ fontWeight: 600, color: "var(--text-1)" }}>
                  Total
                </span>
                <span className="v" style={{ fontWeight: 700 }}>
                  {money(pf.totalValue)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
