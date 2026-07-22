import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PaperForecast, PaperSignal, PaperState, PaperTrade } from "../../shared/types.js";
import { quote0dte } from "./chain.js";
import { fetchQuotes } from "../provider/quotes.js";

// Paper 0DTE experiment engine. Simulates buying same-day SPY calls/puts on
// Claude's research signals, with honest fills: enter at the ask, exit at the
// bid, mark open positions at the bid (liquidation value). NO REAL ORDERS.
//
// The rules below are the strategy, fixed in advance so results can't be
// quietly re-rationalized. Promotion bar (decided before any live dollar):
// 60+ closed trades, positive net P&L, max drawdown < 30% of seed.

export const RULES = {
  SYMBOL: "SPY",
  SEED: 5_000, // paper account size, $
  TRADE_BUDGET: 500, // max premium spent per trade, $
  MIN_CONFIDENCE: 0.55,
  // Aggressive mode: guarantee at least one trade per day. From this ET minute
  // on, if the day has no trades yet, the confidence gate is waived and the
  // research prompt mandates a direction ("none" not allowed).
  FORCE_TRADE_AFTER_MIN: 13 * 60,
  ENTRY_OPEN_MIN: 9 * 60 + 45, // no entries before 9:45 ET (opening churn)
  ENTRY_CLOSE_MIN: 14 * 60, // no entries after 14:00 ET (theta cliff)
  FORCE_CLOSE_MIN: 15 * 60 + 45, // flatten by 15:45 ET, never hold to expiry
  STOP_PCT: -0.5, // exit at -50% of premium
  TARGET_PCT: 1.0, // exit at +100% of premium
  MAX_DAY_TRADES: 3,
  DAY_LOSS_HALT: -300, // stop trading for the day at -$300 realized
} as const;

const STATE_PATH = join(dirname(fileURLToPath(import.meta.url)), "state.json");

export interface EtClock {
  day: string; // YYYY-MM-DD in ET
  minutes: number; // minutes since ET midnight
  weekday: number; // 1=Mon .. 7=Sun
}

export function etClock(now = new Date()): EtClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[get("weekday")] ?? 7;
  // en-CA hour can render midnight as "24"; normalize.
  const hour = Number(get("hour")) % 24;
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
    weekday: wd,
  };
}

function freshState(): PaperState {
  return {
    seed: RULES.SEED,
    cash: RULES.SEED,
    realized: 0,
    open: null,
    trades: [],
    signals: [],
    equityHist: [],
    day: "",
    dayTrades: 0,
    dayPnl: 0,
    halted: null,
    updatedAt: Date.now(),
  };
}

let state: PaperState | null = null;

export function getState(): PaperState {
  if (!state) {
    try {
      state = JSON.parse(readFileSync(STATE_PATH, "utf8")) as PaperState;
    } catch {
      state = freshState();
    }
  }
  return state;
}

function persist() {
  if (!state) return;
  state.updatedAt = Date.now();
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// Reset daily counters when the ET trading day changes.
function rollDay(s: PaperState, clock: EtClock) {
  if (s.day !== clock.day) {
    s.day = clock.day;
    s.dayTrades = 0;
    s.dayPnl = 0;
    s.halted = null;
  }
}

// True when the daily-minimum mandate is active: last research window of the
// day with no trades on the books yet.
export function isForcedWindow(s: PaperState, clock: EtClock): boolean {
  return clock.minutes >= RULES.FORCE_TRADE_AFTER_MIN && s.dayTrades === 0 && !s.open && !s.halted;
}

// Pure entry gate: the reason a signal cannot open a trade, or null if it can.
export function entryBlock(s: PaperState, sig: { direction: string; confidence: number }, clock: EtClock): string | null {
  if (sig.direction !== "call" && sig.direction !== "put") return "no directional signal";
  if (!isForcedWindow(s, clock) && sig.confidence < RULES.MIN_CONFIDENCE)
    return `confidence ${sig.confidence.toFixed(2)} < ${RULES.MIN_CONFIDENCE}`;
  if (clock.weekday > 5) return "market closed (weekend)";
  if (clock.minutes < RULES.ENTRY_OPEN_MIN || clock.minutes >= RULES.ENTRY_CLOSE_MIN) return "outside entry window (9:45-14:00 ET)";
  if (s.open) return "position already open";
  if (s.halted) return `halted: ${s.halted}`;
  if (s.dayTrades >= RULES.MAX_DAY_TRADES) return `max ${RULES.MAX_DAY_TRADES} trades/day reached`;
  return null;
}

// Pure exit rule: why an open trade must close now, or null to keep holding.
export function exitReason(t: PaperTrade, bid: number, clock: EtClock): PaperTrade["exitReason"] | null {
  if (clock.day > t.expiry) return "expired";
  if (clock.minutes >= RULES.FORCE_CLOSE_MIN) return "eod";
  const ret = (bid - t.entryPrice) / t.entryPrice;
  if (ret <= RULES.STOP_PCT) return "stop";
  if (ret >= RULES.TARGET_PCT) return "target";
  return null;
}

function close(s: PaperState, t: PaperTrade, price: number, spot: number | undefined, reason: NonNullable<PaperTrade["exitReason"]>) {
  t.exitPrice = price;
  t.exitAt = Date.now();
  t.exitSpot = spot;
  t.exitReason = reason;
  t.pnl = Math.round(t.qty * 100 * (price - t.entryPrice) * 100) / 100;
  s.cash += t.qty * 100 * price;
  s.realized += t.pnl;
  s.dayPnl += t.pnl;
  s.open = null;
  s.trades.unshift(t);
  if (s.dayPnl <= RULES.DAY_LOSS_HALT) s.halted = `daily loss ${s.dayPnl.toFixed(0)} <= ${RULES.DAY_LOSS_HALT}`;
}

// Handle a research signal: log it, and enter a position if every gate passes.
export async function onSignal(direction: "call" | "put" | "none", confidence: number, thesis: string): Promise<PaperSignal> {
  const s = getState();
  const clock = etClock();
  rollDay(s, clock);
  let action: string;
  const block = entryBlock(s, { direction, confidence }, clock);
  if (block) {
    action = `skipped: ${block}`;
  } else {
    const q = await quote0dte(RULES.SYMBOL, direction as "call" | "put", clock.day);
    if (!q) {
      action = "skipped: no 0DTE quote available";
    } else {
      const cost1 = q.ask * 100;
      const qty = Math.max(1, Math.floor(RULES.TRADE_BUDGET / cost1));
      if (cost1 * qty > s.cash) {
        action = `skipped: insufficient paper cash (${s.cash.toFixed(0)})`;
      } else {
        const t: PaperTrade = {
          id: `${Date.now().toString(36)}`,
          side: direction as "call" | "put",
          strike: q.strike,
          expiry: q.expiry,
          contract: `${RULES.SYMBOL} ${q.strike}${direction === "call" ? "C" : "P"} 0DTE`,
          qty,
          entryPrice: q.ask,
          entryAt: Date.now(),
          entrySpot: q.spot,
          thesis,
          confidence,
        };
        const forced = isForcedWindow(s, clock) && confidence < RULES.MIN_CONFIDENCE;
        s.cash -= qty * 100 * q.ask;
        s.open = t;
        s.dayTrades += 1;
        action = `entered ${qty}x ${t.contract} @ ${q.ask.toFixed(2)} (spot ${q.spot.toFixed(2)})${forced ? " [forced daily trade]" : ""}`;
      }
    }
  }
  const sig: PaperSignal = { at: Date.now(), direction, confidence, thesis, action };
  s.signals.unshift(sig);
  s.signals = s.signals.slice(0, 200);
  persist();
  return sig;
}

// Periodic tick: mark the open position, apply exit rules, record equity.
export async function tick(): Promise<void> {
  const s = getState();
  const clock = etClock();
  rollDay(s, clock);
  if (s.open) {
    const t = s.open;
    const q = await quote0dte(RULES.SYMBOL, t.side, t.expiry, t.strike);
    if (q && q.strike === t.strike) {
      t.mark = q.bid;
      const reason = exitReason(t, q.bid, clock);
      if (reason) close(s, t, q.bid, q.spot, reason);
    } else if (clock.day > t.expiry) {
      // Chain rolled off with the position still open: it expired worthless.
      close(s, t, 0, undefined, "expired");
    }
  }
  try {
    await resolveForecasts(s, clock);
  } catch {
    /* transient quote failure; retried next tick */
  }
  const equity = s.cash + (s.open ? s.open.qty * 100 * (s.open.mark ?? s.open.entryPrice) : 0);
  const last = s.equityHist[s.equityHist.length - 1];
  // Record a point when equity moved or 15 minutes elapsed; cap history.
  if (!last || Math.abs(last.v - equity) > 0.005 || Date.now() - last.t > 15 * 60_000) {
    s.equityHist.push({ t: Date.now(), v: Math.round(equity * 100) / 100 });
    s.equityHist = s.equityHist.slice(-2000);
  }
  persist();
}

// Log the daily open-of-market forecast (one per ET trading day; repeat posts
// for the same day are ignored so a retried tick can't double-log).
export function addForecast(direction: "up" | "down", confidence: number, thesis: string, baseline: number, openSpot: number): PaperForecast | null {
  const s = getState();
  s.forecasts ??= [];
  const clock = etClock();
  if (s.forecasts.some((f) => f.date === clock.day)) return null;
  const f: PaperForecast = {
    date: clock.day,
    direction,
    confidence: Math.max(0, Math.min(1, confidence)),
    thesis: thesis.slice(0, 2000),
    at: Date.now(),
    baseline,
    openSpot,
  };
  s.forecasts.unshift(f);
  s.forecasts = s.forecasts.slice(0, 400);
  persist();
  return f;
}

// Grade the outcome of a forecast: close vs the previous-close baseline.
export function resolveForecast(f: PaperForecast, close: number): void {
  f.close = close;
  f.actual = close >= f.baseline ? "up" : "down";
  f.correct = f.actual === f.direction;
}

// Resolve any pending forecasts once their day's close is knowable: after
// 16:05 ET same day (quote price = the close), or any later day (the quote's
// previousClose is the most recent close - correct for next-morning catch-up).
async function resolveForecasts(s: PaperState, clock: EtClock): Promise<boolean> {
  const pending = (s.forecasts ?? []).filter(
    (f) => f.correct == null && (f.date < clock.day || (f.date === clock.day && clock.minutes >= 16 * 60 + 5)),
  );
  if (!pending.length) return false;
  const [q] = await fetchQuotes([RULES.SYMBOL]);
  if (!q) return false;
  for (const f of pending) {
    // Same-day after close: live price IS the close. Later days: only resolve
    // yesterday's forecast via previousClose; older misses stay unresolved
    // rather than being graded against the wrong day's close.
    if (f.date === clock.day) resolveForecast(f, q.price);
    else if (isPrevTradingDay(f.date, clock)) resolveForecast(f, q.previousClose);
  }
  return true;
}

// Whether `day` is the trading day immediately before the clock's day
// (Fri -> Mon aware, holiday-approximate: allows up to 3 calendar days back).
function isPrevTradingDay(day: string, clock: EtClock): boolean {
  const d = (Date.parse(clock.day) - Date.parse(day)) / 86_400_000;
  return d >= 1 && d <= 3 && clock.minutes < 16 * 60;
}

// Attach a post-trade review to a closed trade (idempotent; latest wins).
export function addReview(id: string, review: { verdict: string; whatHappened: string; lesson: string }): boolean {
  const s = getState();
  const t = s.trades.find((x) => x.id === id);
  if (!t) return false;
  t.review = {
    verdict: String(review.verdict).slice(0, 60),
    whatHappened: String(review.whatHappened).slice(0, 2000),
    lesson: String(review.lesson).slice(0, 500),
    at: Date.now(),
  };
  persist();
  return true;
}

// Start the self-managing loop: mark/manage every 60s during ET market hours.
export function startPaperLoop(): void {
  setInterval(() => {
    const clock = etClock();
    const s = getState();
    const marketish = clock.weekday <= 5 && clock.minutes >= 9 * 60 + 30 && clock.minutes <= 16 * 60 + 15;
    const pendingForecast = (s.forecasts ?? []).some((f) => f.correct == null);
    if (!marketish && !s.open && !pendingForecast) return;
    tick().catch(() => {});
  }, 60_000);
}
