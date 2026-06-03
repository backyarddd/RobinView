import type { Candle, Timeframe, Interval } from "../../shared/types.js";
import { round2 } from "./util.js";

// Deterministic PRNG (mulberry32) so a given symbol always renders the same history.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSymbol(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Box-Muller normal sample.
function gauss(r: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const TF_CONFIG: Record<Timeframe, { interval: Interval; bars: number; stepSec: number }> = {
  "1D": { interval: "5m", bars: 78, stepSec: 5 * 60 },
  "1W": { interval: "15m", bars: 130, stepSec: 15 * 60 },
  "1M": { interval: "1h", bars: 150, stepSec: 60 * 60 },
  "3M": { interval: "1d", bars: 66, stepSec: 24 * 60 * 60 },
  "1Y": { interval: "1d", bars: 252, stepSec: 24 * 60 * 60 },
  "5Y": { interval: "1w", bars: 260, stepSec: 7 * 24 * 60 * 60 },
  ALL: { interval: "1w", bars: 420, stepSec: 7 * 24 * 60 * 60 },
};

export function intervalFor(tf: Timeframe): Interval {
  return TF_CONFIG[tf].interval;
}

// Generate a realistic OHLC history that TERMINATES at `price` (the live last trade),
// with daily volatility scaled by timeframe. Anchored & deterministic per symbol+tf.
// `nowSec` is passed in (never Date.now() inside) so callers control the clock.
export function genCandles(
  symbol: string,
  price: number,
  prevClose: number,
  timeframe: Timeframe,
  nowSec: number,
): Candle[] {
  const cfg = TF_CONFIG[timeframe];
  const r = rng(hashSymbol(symbol) ^ hashSymbol(timeframe));
  const n = cfg.bars;

  // Per-bar volatility (fraction). Intraday is tighter than weekly.
  const baseVol =
    timeframe === "1D" ? 0.0016 : timeframe === "1W" ? 0.004 : timeframe === "1M" ? 0.009 : 0.018;

  // Build a return path, then rescale so it lands exactly on `price`.
  const drift = (r() - 0.5) * baseVol * 0.4;
  const rets: number[] = [];
  for (let i = 0; i < n; i++) rets.push(drift + gauss(r) * baseVol);

  // Start price chosen so a longer lookback shows meaningful trend.
  const trendSpan = 1 + (r() - 0.5) * (timeframe === "ALL" ? 1.6 : timeframe === "5Y" ? 1.2 : 0.5);
  let start = price / trendSpan;
  if (!isFinite(start) || start <= 0) start = price * 0.9;

  // Forward-simulate closes from start.
  const closes: number[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p *= 1 + rets[i];
    closes.push(p);
  }
  // Rescale path so the final close equals the live price exactly. Guard against
  // a halted symbol (price 0) or a degenerate final close (0/NaN/negative): in
  // those cases don't rescale at all (scale = 1) so we never divide by 0/NaN.
  const last = closes[n - 1];
  const scale = price > 0 && Number.isFinite(last) && last > 0 ? price / last : 1;
  for (let i = 0; i < n; i++) closes[i] *= scale;
  start *= scale; // keep the first bar's open in the same scaled frame as the closes
  // Pin the penultimate close near prevClose for daily views (continuity of "today's" move).
  if (timeframe === "1D" && prevClose > 0) closes[Math.max(0, n - 2)] = prevClose;

  const candles: Candle[] = [];
  const startTime = nowSec - (n - 1) * cfg.stepSec;
  let prev = start;
  // Approx average daily volume scaled by price band → plausible volume bars.
  const volBase = 4_000_000 + (hashSymbol(symbol) % 9) * 2_500_000;
  for (let i = 0; i < n; i++) {
    const close = closes[i];
    const open = i === 0 ? prev : closes[i - 1];
    const body = Math.abs(close - open);
    // Wick is driven mostly by volatility (tied to price) and only lightly by body,
    // so a large-body bar can't produce an absurd spike.
    const wick = body * (0.18 + r() * 0.5) + close * baseVol * (0.8 + r() * 0.9);
    const high = Math.max(open, close) + wick * r();
    const low = Math.min(open, close) - wick * r();
    const direction = close >= open ? 1 : 0.82;
    const volume = Math.round(volBase * (0.5 + r()) * direction * (cfg.stepSec / 3600 + 0.4));
    candles.push({
      time: startTime + i * cfg.stepSec,
      open: round2(open),
      high: round2(Math.max(high, open, close)),
      low: round2(Math.max(0.01, Math.min(low, open, close))),
      close: round2(close),
      volume,
    });
    prev = close;
  }
  return candles;
}

