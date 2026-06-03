// RobinView mark: a rising chart line whose crest lifts into a robin in flight.
// The body is an emerald area (the "view"/market); the head & breast are brass.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="rv-body" x1="6" y1="52" x2="52" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1E7A56" />
          <stop offset="1" stopColor="#34E29B" />
        </linearGradient>
        <linearGradient id="rv-breast" x1="40" y1="14" x2="58" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F0C878" />
          <stop offset="1" stopColor="#D49A3E" />
        </linearGradient>
      </defs>
      {/* rising area = bird body */}
      <path
        d="M6 50 L18 44 L27 33 L37 36 L48 22 Q52 18 50 30 Q48 42 38 48 L30 52 Q18 56 6 50 Z"
        fill="url(#rv-body)"
      />
      {/* wing crease (a candle-tick echo) */}
      <path d="M19 44 L28 35 L37 38 L47 26" stroke="#0A0C0B" strokeOpacity="0.45" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* head */}
      <circle cx="49" cy="20" r="9" fill="url(#rv-breast)" />
      {/* eye */}
      <circle cx="51.5" cy="18.5" r="1.7" fill="#0A0C0B" />
      {/* beak */}
      <path d="M57 20 L63 18.5 L57.5 23.5 Z" fill="#D49A3E" />
      {/* tail tick */}
      <path d="M6 50 L2 57" stroke="#34E29B" strokeWidth="3" strokeLinecap="round" />
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
