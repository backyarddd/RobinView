import { useEffect, useState } from "react";

type Phase = "open" | "pre" | "after" | "closed";

interface MarketState {
  phase: Phase;
  label: string;
  detail: string;
}

/** Minutes since ET midnight + day-of-week (0=Sun..6=Sat) for a given Date. */
function etParts(now: Date): { minutes: number; seconds: number; dow: number } {
  // Wall-clock time in America/New_York.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some engines emit "24" for midnight
  const minute = parseInt(get("minute"), 10);
  const seconds = parseInt(get("second"), 10);
  const wdMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = wdMap[get("weekday")] ?? 0;
  return { minutes: hour * 60 + minute, seconds, dow };
}

const OPEN = 9 * 60 + 30; // 09:30
const CLOSE = 16 * 60; // 16:00
const PRE = 4 * 60; // 04:00
const AFTER = 20 * 60; // 20:00

function fmtCountdown(totalSecs: number): string {
  const s = Math.max(0, totalSecs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

function computeState(now: Date): MarketState {
  const { minutes, seconds, dow } = etParts(now);
  const isWeekday = dow >= 1 && dow <= 5;
  const secsLeftInMinute = 60 - seconds;
  // Seconds remaining until a target minute-of-day boundary today.
  const secsUntil = (targetMin: number) =>
    (targetMin - minutes - 1) * 60 + secsLeftInMinute;

  if (!isWeekday) {
    return { phase: "closed", label: "Closed", detail: "Weekend" };
  }

  if (minutes >= OPEN && minutes < CLOSE) {
    return {
      phase: "open",
      label: "Open",
      detail: `Closes in ${fmtCountdown(secsUntil(CLOSE))}`,
    };
  }
  if (minutes >= PRE && minutes < OPEN) {
    return {
      phase: "pre",
      label: "Pre-market",
      detail: `Opens in ${fmtCountdown(secsUntil(OPEN))}`,
    };
  }
  if (minutes >= CLOSE && minutes < AFTER) {
    return { phase: "after", label: "After-hours", detail: "Closed for the day" };
  }
  return { phase: "closed", label: "Closed", detail: "Pre-market 4:00 AM ET" };
}

export function MarketClock() {
  const [state, setState] = useState<MarketState>(() => computeState(new Date()));

  useEffect(() => {
    const id = setInterval(() => setState(computeState(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  const dotClass = state.phase === "open" ? "mclock-dot open" : "mclock-dot";

  return (
    <div className={`mclock ${state.phase === "open" ? "open" : ""}`} title="US equities · regular session 9:30 AM – 4:00 PM ET">
      <span className={dotClass} />
      <span className="mclock-text">
        <span className="mclock-label">{state.label}</span>
        <span className="mclock-detail">{state.detail}</span>
      </span>
    </div>
  );
}
