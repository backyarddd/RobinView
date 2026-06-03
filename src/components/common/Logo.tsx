// RobinView mark: an aperture/lens (the "View") framing a rising market line,
// with a brass focus dot at the high. Brass ring = the brand accent.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="rv-fill" x1="32" y1="50" x2="32" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1E7A56" />
          <stop offset="1" stopColor="#34E29B" />
        </linearGradient>
        <clipPath id="rv-lens">
          <circle cx="32" cy="32" r="22" />
        </clipPath>
      </defs>
      {/* lens ring (the "View") */}
      <circle cx="32" cy="32" r="27" fill="#0f1311" stroke="#E3B766" strokeWidth="2.4" />
      <circle cx="32" cy="32" r="27" fill="none" stroke="#E3B766" strokeOpacity="0.16" strokeWidth="6" />
      {/* rising market line + area, framed by the lens */}
      <g clipPath="url(#rv-lens)">
        <path d="M10.4 47.3 L20.3 40.1 L27.5 43.7 L36.5 30.2 L45.5 34.7 L55.4 16.7 L55.4 55 L10.4 55 Z" fill="url(#rv-fill)" fillOpacity="0.26" />
        <path d="M10.4 47.3 L20.3 40.1 L27.5 43.7 L36.5 30.2 L45.5 34.7 L55.4 16.7" stroke="#34E29B" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* node on the line + brass focus dot at the high */}
      <circle cx="45.5" cy="34.7" r="2.4" fill="#0f1311" stroke="#34E29B" strokeWidth="1.5" />
      <circle cx="45.5" cy="20.3" r="3.1" fill="#E3B766" />
    </svg>
  );
}

export function LogoWordmark({ size = 32 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <LogoMark size={size} />
      <span
        className="serif"
        style={{
          fontSize: size * 0.66,
          fontWeight: 500,
          letterSpacing: "-0.01em",
          lineHeight: 1,
        }}
      >
        Robin<span style={{ color: "var(--brass)" }}>View</span>
      </span>
    </div>
  );
}
