// Minimal inline icon set (stroke-based, 1.6 weight) — no icon dependency.
type P = { size?: number };
const S = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IconTerminal = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="M3 5h18v14H3z" />
    <path d="M3 9h18M7 13l2 2-2 2M12 17h4" />
  </svg>
);
export const IconChart = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="M4 19V5M4 19h16M8 16l3-4 3 2 4-6" />
  </svg>
);
export const IconWallet = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8H6a3 3 0 0 1-3-2z" />
    <circle cx="16.5" cy="13" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);
export const IconGrid = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
  </svg>
);
export const IconList = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </svg>
);
export const IconBell = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);
export const IconSearch = ({ size }: P) => (
  <svg {...S(size)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
export const IconPlus = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconX = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IconTrash = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" />
  </svg>
);
export const IconLayers = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="m12 3 9 5-9 5-9-5 9-5M3 13l9 5 9-5M3 17l9 5 9-5" />
  </svg>
);
export const IconGear = ({ size }: P) => (
  <svg {...S(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7.7 1.6 1.6 0 0 0-1 1.5V22a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H2a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </svg>
);
export const IconArrow = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconStar = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 21l1.1-6.5L2.6 9.8l6.5-.9L12 3z" />
  </svg>
);
export const IconCandle = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="M7 4v3M7 17v3M17 7v2M17 15v2" />
    <rect x="4.5" y="7" width="5" height="10" rx="1" />
    <rect x="14.5" y="9" width="5" height="6" rx="1" />
  </svg>
);
export const IconLine = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="M3 17l5-6 4 3 4-7 5 4" />
  </svg>
);
export const IconArea = ({ size }: P) => (
  <svg {...S(size)}>
    <path d="M3 16l5-6 4 3 4-7 5 4v9H3z" />
  </svg>
);
