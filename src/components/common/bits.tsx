import { percent, dirClass } from "../../lib/format";
import { CompanyLogo } from "./CompanyLogo";

// Tiny SVG sparkline.
export function Sparkline({
  data,
  width = 56,
  height = 22,
  color,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stroke = color ?? (data[data.length - 1] >= data[0] ? "var(--up)" : "var(--down)");
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const id = `sg-${Math.round(min * 1000)}-${data.length}`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${height} ${pts.join(" ")} ${width},${height}`}
        fill={`url(#${id})`}
        stroke="none"
      />
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ChangePill({ pct, className = "" }: { pct: number; className?: string }) {
  const d = dirClass(pct) || "flat";
  return (
    <span className={`pill ${d} ${className}`}>
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "•"} {percent(pct, false)}
    </span>
  );
}

export function SymBadge({ symbol }: { symbol: string }) {
  return <CompanyLogo symbol={symbol} size={30} radius={8} />;
}
