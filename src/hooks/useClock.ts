import { useStore } from "../store/useStore";

// Time formatters that follow the user's 12h/24h preference. Returning these
// from a hook (rather than a bare function) means any component that shows a
// clock time re-renders when the preference flips.
export function useClock() {
  const hour12 = useStore((s) => s.hour12);
  const opts = (extra: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormatOptions => ({
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12,
    ...extra,
  });
  return {
    hour12,
    fmtTime: (ts: number) => new Date(ts).toLocaleTimeString("en-US", opts()),
    fmtTimeSec: (ts: number) => new Date(ts).toLocaleTimeString("en-US", opts({ second: "2-digit" })),
    // Current wall-clock time in a specific zone (used for the ET market clock).
    fmtZoneNow: (now: Date, timeZone: string) =>
      now.toLocaleTimeString("en-US", opts({ timeZone })),
  };
}
