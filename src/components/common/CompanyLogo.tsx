import { useEffect, useState } from "react";
import { api } from "../../lib/api";

// Company logo with graceful fallback: full logo (Clearbit) -> favicon (Google)
// -> a letter badge identical to the old placeholder. The image endpoint 302s to
// the real logo; on any load error we advance to the next source.
export function CompanyLogo({
  symbol,
  size = 30,
  radius = 8,
}: {
  symbol: string;
  size?: number;
  radius?: number;
}) {
  const [stage, setStage] = useState(0); // 0 logo, 1 favicon, 2 letter badge
  useEffect(() => setStage(0), [symbol]);

  const box = { width: size, height: size, borderRadius: radius } as const;

  if (stage >= 2) {
    const label = symbol.replace(/-USD$/i, "").slice(0, 4);
    return (
      <div className="sym-badge" style={{ ...box, fontSize: Math.max(8, Math.round(size * 0.33)) }}>
        {label}
      </div>
    );
  }

  return (
    <img
      className="sym-logo"
      style={box}
      src={api.logoUrl(symbol, stage === 1)}
      alt=""
      loading="lazy"
      onError={() => setStage((s) => s + 1)}
    />
  );
}
