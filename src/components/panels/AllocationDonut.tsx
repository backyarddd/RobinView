import { useStore } from "../../store/useStore";
import { money } from "../../lib/format";

const PALETTE = [
  "#34e29b", "#e3b766", "#6fa8ff", "#c08bff", "#ff9f7a",
  "#5ad1c4", "#f2748f", "#9bd45a", "#ff6a57", "#7c8a82",
];

export function AllocationDonut() {
  const positions = useStore((s) => s.positions);
  const portfolio = useStore((s) => s.portfolio);
  const select = useStore((s) => s.select);

  const total = positions.reduce((a, p) => a + p.marketValue, 0);
  const cash = portfolio?.cash ?? 0;
  const grand = total + cash;

  const slices = positions
    .slice(0, 9)
    .map((p, i) => ({ label: p.symbol, value: p.marketValue, color: PALETTE[i % PALETTE.length] }));
  const restValue = positions.slice(9).reduce((a, p) => a + p.marketValue, 0);
  if (restValue > 0) slices.push({ label: "Other", value: restValue, color: "#4a524d" });
  if (cash > 0) slices.push({ label: "Cash", value: cash, color: "#2c322e" });

  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Allocation</span>
      </div>
      <div className="donut-wrap">
        <svg width="132" height="132" viewBox="0 0 132 132" style={{ flexShrink: 0 }}>
          <g transform="rotate(-90 66 66)">
            {slices.map((s, i) => {
              const frac = grand ? s.value / grand : 0;
              const len = frac * C;
              const dash = `${len} ${C - len}`;
              const el = (
                <circle
                  key={i}
                  cx="66"
                  cy="66"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="16"
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  style={{ transition: "stroke-dashoffset .4s var(--ease)" }}
                />
              );
              offset += len;
              return el;
            })}
          </g>
          <text x="66" y="62" textAnchor="middle" className="serif" fill="var(--text-1)" fontSize="17" fontWeight="500">
            {positions.length}
          </text>
          <text x="66" y="78" textAnchor="middle" fill="var(--text-3)" fontSize="9" letterSpacing="1.5">
            HOLDINGS
          </text>
        </svg>
        <div className="donut-legend">
          {slices.map((s, i) => (
            <div
              key={i}
              className="donut-leg-row"
              onClick={() => s.label.length <= 5 && select(s.label)}
              style={{ cursor: s.label.length <= 5 ? "pointer" : "default" }}
            >
              <span className="sw" style={{ background: s.color }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
              <span className="pc">{grand ? ((s.value / grand) * 100).toFixed(1) : "0.0"}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
