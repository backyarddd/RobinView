import { useEffect, useState } from "react";
import { useClock } from "../../hooks/useClock";

type Phase = "open" | "pre" | "after" | "closed";

interface MarketState {
  phase: Phase;
  label: string;
  detail: string;
}

/**
 * ET wall-clock parts for a given Date: minutes since ET midnight, seconds,
 * day-of-week (0=Sun..6=Sat) and the ET calendar date (year/month/day).
 */
function etParts(now: Date): {
  minutes: number;
  seconds: number;
  dow: number;
  year: number;
  month: number; // 1-12
  day: number; // 1-31
} {
  // Wall-clock time in America/New_York.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
  return {
    minutes: hour * 60 + minute,
    seconds,
    dow,
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
  };
}

// ---------------------------------------------------------------------------
// US stock-market (NYSE/Nasdaq) holiday calendar.
//
// Dates are represented as plain {y, m, d} (m = 1-12) in ET wall-clock terms.
// We avoid Date arithmetic across DST by working with a simple day-number
// (Gregorian ordinal) for the few cases that need day shifting (Good Friday,
// "day after Thanksgiving"). All weekday math is derived from that ordinal.
// ---------------------------------------------------------------------------

interface YMD { y: number; m: number; d: number }

/** Days from a fixed epoch (proleptic Gregorian) for {y,m,d}. Pure integer math. */
function toOrdinal({ y, m, d }: YMD): number {
  // Days-from-civil algorithm (Howard Hinnant).
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of toOrdinal: ordinal day-number back to {y,m,d}. */
function fromOrdinal(z0: number): YMD {
  const z = z0 + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: m <= 2 ? y + 1 : y, m, d };
}

/** Day-of-week 0=Sun..6=Sat for an ordinal day-number. */
function ordinalDow(ord: number): number {
  // 1970-01-01 (ordinal 0) was a Thursday (4).
  return ((ord % 7) + 4 + 7 * 7) % 7;
}

/** Day-of-week 0=Sun..6=Sat for {y,m,d}. */
function ymdDow(date: YMD): number {
  return ordinalDow(toOrdinal(date));
}

/** Date of the nth weekday in a month, e.g. 3rd Monday of January. */
function nthWeekday(y: number, m: number, weekday: number, n: number): YMD {
  const firstDow = ymdDow({ y, m, d: 1 });
  const offset = (weekday - firstDow + 7) % 7;
  return { y, m, d: 1 + offset + (n - 1) * 7 };
}

/** Date of the last given weekday in a month, e.g. last Monday of May. */
function lastWeekday(y: number, m: number, weekday: number): YMD {
  // Day count in month: go to first of next month, step back one day.
  const firstNext = toOrdinal(m === 12 ? { y: y + 1, m: 1, d: 1 } : { y, m: m + 1, d: 1 });
  const lastDay = fromOrdinal(firstNext - 1);
  const lastDow = ymdDow(lastDay);
  const back = (lastDow - weekday + 7) % 7;
  return fromOrdinal(firstNext - 1 - back);
}

/** Easter Sunday (Gregorian) via the Anonymous/Meeus algorithm. */
function easterSunday(y: number): YMD {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const dd = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mth = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mth + 114) / 31);
  const day = ((h + l - 7 * mth + 114) % 31) + 1;
  return { y, m: month, d: day };
}

/**
 * Apply NYSE observed-date rules to a fixed-date holiday:
 *  - falls on Saturday -> observed the preceding Friday
 *  - falls on Sunday   -> observed the following Monday
 * (Used for New Year's Day, Juneteenth, Independence Day, Christmas.)
 */
function observed(date: YMD): YMD {
  const dow = ymdDow(date);
  if (dow === 6) return fromOrdinal(toOrdinal(date) - 1); // Sat -> Fri
  if (dow === 0) return fromOrdinal(toOrdinal(date) + 1); // Sun -> Mon
  return date;
}

/** Set of observed full-holiday ordinals for a given year. */
function fullHolidayOrdinals(y: number): Set<number> {
  const set = new Set<number>();
  const add = (date: YMD) => set.add(toOrdinal(date));

  add(observed({ y, m: 1, d: 1 })); // New Year's Day
  add(nthWeekday(y, 1, 1, 3)); // MLK Day (3rd Mon Jan)
  add(nthWeekday(y, 2, 1, 3)); // Washington's Birthday (3rd Mon Feb)
  add(fromOrdinal(toOrdinal(easterSunday(y)) - 2)); // Good Friday (Easter - 2)
  add(lastWeekday(y, 5, 1)); // Memorial Day (last Mon May)
  add(observed({ y, m: 6, d: 19 })); // Juneteenth
  add(observed({ y, m: 7, d: 4 })); // Independence Day
  add(nthWeekday(y, 9, 1, 1)); // Labor Day (1st Mon Sep)
  add(nthWeekday(y, 11, 4, 4)); // Thanksgiving (4th Thu Nov)
  add(observed({ y, m: 12, d: 25 })); // Christmas

  return set;
}

/**
 * Early-close (1:00 PM ET) ordinals for a given year:
 *  - Day after Thanksgiving (Black Friday)
 *  - Christmas Eve, Dec 24, when it is a weekday (and not itself a holiday)
 *  - July 3, when it is a weekday and July 4 is observed on its actual date
 * Early-close days that collide with a full holiday are dropped.
 */
function earlyCloseOrdinals(y: number): Set<number> {
  const full = fullHolidayOrdinals(y);
  const set = new Set<number>();
  const addIfWeekdayAndOpen = (ord: number) => {
    const dow = ordinalDow(ord);
    if (dow >= 1 && dow <= 5 && !full.has(ord)) set.add(ord);
  };

  // Day after Thanksgiving.
  addIfWeekdayAndOpen(toOrdinal(nthWeekday(y, 11, 4, 4)) + 1);

  // Christmas Eve (Dec 24) when a weekday.
  addIfWeekdayAndOpen(toOrdinal({ y, m: 12, d: 24 }));

  // July 3: NYSE has an early close when July 4 lands such that the 3rd is a
  // regular trading day (i.e. July 4 falls Tue-Fri, so the 3rd is a weekday).
  const jul4Dow = ymdDow({ y, m: 7, d: 4 });
  if (jul4Dow >= 2 && jul4Dow <= 5) {
    addIfWeekdayAndOpen(toOrdinal({ y, m: 7, d: 3 }));
  }

  return set;
}

/** Day status for an ET calendar date. */
type DayKind = "holiday" | "early" | "normal";

function dayKind(year: number, month: number, day: number): DayKind {
  const ord = toOrdinal({ y: year, m: month, d: day });
  if (fullHolidayOrdinals(year).has(ord)) return "holiday";
  if (earlyCloseOrdinals(year).has(ord)) return "early";
  return "normal";
}

/** True if the market trades at all on this ET date (weekday and not a full holiday). */
function isTradingDay(ord: number): boolean {
  const dow = ordinalDow(ord);
  if (dow < 1 || dow > 5) return false;
  const { y } = fromOrdinal(ord);
  return !fullHolidayOrdinals(y).has(ord);
}

/**
 * Find the next regular-session open relative to "today" in ET, returning the
 * total number of seconds from the current ET wall-clock until that open.
 * Skips weekends and full holidays.
 */
function secondsUntilNextOpen(
  todayOrd: number,
  nowMinutes: number,
  nowSeconds: number,
): number {
  // Seconds elapsed since ET midnight today.
  const elapsedToday = nowMinutes * 60 + nowSeconds;

  // If the market still opens later today (today is a trading day and we're
  // before the open), count to today's open.
  if (isTradingDay(todayOrd) && nowMinutes < OPEN) {
    return OPEN * 60 - elapsedToday;
  }

  // Otherwise scan forward for the next trading day.
  let ord = todayOrd + 1;
  let daysAhead = 1;
  // Bound the loop defensively (markets never close > ~10 days in a row).
  while (!isTradingDay(ord) && daysAhead < 30) {
    ord += 1;
    daysAhead += 1;
  }
  const secsLeftToday = 24 * 3600 - elapsedToday;
  const fullDaysBetween = daysAhead - 1; // whole days between today and target day
  return secsLeftToday + fullDaysBetween * 24 * 3600 + OPEN * 60;
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

const EARLY_CLOSE = 13 * 60; // 13:00 (1:00 PM ET) on early-close days

function computeState(now: Date): MarketState {
  const { minutes, seconds, dow, year, month, day } = etParts(now);
  const isWeekday = dow >= 1 && dow <= 5;
  const secsLeftInMinute = 60 - seconds;
  // Seconds remaining until a target minute-of-day boundary today.
  const secsUntil = (targetMin: number) =>
    (targetMin - minutes - 1) * 60 + secsLeftInMinute;

  const todayOrd = toOrdinal({ y: year, m: month, d: day });
  const kind = dayKind(year, month, day);
  // The regular close for today: 1:00 PM ET on early-close days, else 4:00 PM.
  const todayClose = kind === "early" ? EARLY_CLOSE : CLOSE;

  // Countdown to the next regular session open (skips weekends + holidays).
  const nextOpenDetail = () =>
    `Opens in ${fmtCountdown(secondsUntilNextOpen(todayOrd, minutes, seconds))}`;

  // Fully closed all day: weekend or NYSE holiday.
  if (!isWeekday) {
    return { phase: "closed", label: "Closed", detail: nextOpenDetail() };
  }
  if (kind === "holiday") {
    return { phase: "closed", label: "Closed", detail: nextOpenDetail() };
  }

  // Regular session (open until 4:00 PM, or 1:00 PM on early-close days).
  if (minutes >= OPEN && minutes < todayClose) {
    return {
      phase: "open",
      label: "Open",
      detail: `Closes in ${fmtCountdown(secsUntil(todayClose))}`,
    };
  }
  // Pre-market (4:00 AM until the open).
  if (minutes >= PRE && minutes < OPEN) {
    return {
      phase: "pre",
      label: "Pre-market",
      detail: `Opens in ${fmtCountdown(secsUntil(OPEN))}`,
    };
  }
  // After-hours (from the close until 8:00 PM) - now shows a countdown to the
  // next session open, consistent with the other phases.
  if (minutes >= todayClose && minutes < AFTER) {
    return {
      phase: "after",
      label: kind === "early" ? "After-hours (early close)" : "After-hours",
      detail: nextOpenDetail(),
    };
  }
  // Closed (overnight, before pre-market) - also counts down to the next open.
  return { phase: "closed", label: "Closed", detail: nextOpenDetail() };
}

export function MarketClock() {
  const [now, setNow] = useState<Date>(() => new Date());
  const { fmtZoneNow } = useClock();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = computeState(now);
  const etTime = fmtZoneNow(now, "America/New_York");
  const dotClass = state.phase === "open" ? "mclock-dot open" : "mclock-dot";

  return (
    <div className={`mclock ${state.phase === "open" ? "open" : ""}`} title="US equities · regular session 9:30 AM – 4:00 PM ET">
      <span className={dotClass} />
      <span className="mclock-text">
        <span className="mclock-label">
          {state.label}
          <span className="mclock-time mono">{etTime} ET</span>
        </span>
        <span className="mclock-detail">{state.detail}</span>
      </span>
    </div>
  );
}
