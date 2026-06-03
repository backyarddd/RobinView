// Technical-indicator math. Pure functions over arrays aligned to candle index.
// Each returns arrays the same length as the input, padded with NaN where undefined,
// so they line up 1:1 with the chart's time axis.
import type { Candle } from "@shared/types";

export type LinePoint = { time: number; value: number };

const NA = NaN;

export function sma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NA);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NA);
  const k = 2 / (period + 1);
  let prev = NA;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(prev)) {
      // seed with SMA once enough data exists
      if (i >= period - 1) {
        let s = 0;
        for (let j = i - period + 1; j <= i; j++) s += values[j];
        prev = s / period;
        out[i] = prev;
      }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out = new Array(values.length).fill(NA);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    const gain = Math.max(ch, 0);
    const loss = Math.max(-ch, 0);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-9));
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-9));
    }
  }
  return out;
}

export interface MACDResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(values: number[], fast = 12, slow = 26, signalP = 9): MACDResult {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) =>
    Number.isNaN(emaFast[i]) || Number.isNaN(emaSlow[i]) ? NA : emaFast[i] - emaSlow[i],
  );
  // Signal = EMA of the defined portion of the macd line.
  const firstIdx = macdLine.findIndex((v) => !Number.isNaN(v));
  const signal = new Array(values.length).fill(NA);
  if (firstIdx >= 0) {
    const defined = macdLine.slice(firstIdx).map((v) => (Number.isNaN(v) ? 0 : v));
    const sig = ema(defined, signalP);
    for (let i = 0; i < sig.length; i++) signal[firstIdx + i] = sig[i];
  }
  const histogram = macdLine.map((v, i) =>
    Number.isNaN(v) || Number.isNaN(signal[i]) ? NA : v - signal[i],
  );
  return { macd: macdLine, signal, histogram };
}

export interface BollingerResult {
  upper: number[];
  middle: number[];
  lower: number[];
}

export function bollinger(values: number[], period = 20, mult = 2): BollingerResult {
  const middle = sma(values, period);
  const upper = new Array(values.length).fill(NA);
  const lower = new Array(values.length).fill(NA);
  for (let i = period - 1; i < values.length; i++) {
    let variance = 0;
    const mean = middle[i];
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mean) ** 2;
    const sd = Math.sqrt(variance / period);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { upper, middle, lower };
}

// VWAP, anchored per trading session (resets at each day boundary) like
// TradingView. Candle times are UNIX seconds; a US regular/extended session
// falls within a single UTC day, so the UTC day index is a sound session key.
// On daily+ timeframes each bar is its own session, so VWAP degenerates to the
// typical price - the mathematically correct session VWAP for that resolution.
export function vwap(candles: Candle[]): number[] {
  const out = new Array(candles.length).fill(NA);
  let cumPV = 0;
  let cumV = 0;
  let session = NaN;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const day = Math.floor((c.time as number) / 86400);
    if (day !== session) {
      session = day;
      cumPV = 0;
      cumV = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumV += c.volume;
    out[i] = cumV ? cumPV / cumV : c.close;
  }
  return out;
}

// ── Oscillators & studies that need full OHLC ──

export interface StochResult {
  k: number[];
  d: number[];
}
// Stochastic oscillator (%K smoothed, %D = SMA of %K).
export function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3, smooth = 3): StochResult {
  const n = candles.length;
  const rawK = new Array(n).fill(NA);
  for (let i = kPeriod - 1; i < n; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    const denom = hi - lo || 1e-9;
    rawK[i] = ((candles[i].close - lo) / denom) * 100;
  }
  const k = smaIgnoreNaN(rawK, smooth);
  const d = smaIgnoreNaN(k, dPeriod);
  return { k, d };
}

// Average True Range.
export function atr(candles: Candle[], period = 14): number[] {
  const n = candles.length;
  const tr = new Array(n).fill(NA);
  for (let i = 0; i < n; i++) {
    if (i === 0) tr[i] = candles[i].high - candles[i].low;
    else {
      const c = candles[i];
      const pc = candles[i - 1].close;
      tr[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    }
  }
  // Wilder's smoothing
  const out = new Array(n).fill(NA);
  let prev = NA;
  for (let i = 0; i < n; i++) {
    if (i === period - 1) {
      let s = 0;
      for (let j = 0; j < period; j++) s += tr[j];
      prev = s / period;
      out[i] = prev;
    } else if (i >= period) {
      prev = (prev * (period - 1) + tr[i]) / period;
      out[i] = prev;
    }
  }
  return out;
}

// On-Balance Volume.
export function obv(candles: Candle[]): number[] {
  const out = new Array(candles.length).fill(NA);
  let acc = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) acc = 0;
    else if (candles[i].close > candles[i - 1].close) acc += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) acc -= candles[i].volume;
    out[i] = acc;
  }
  return out;
}

// Williams %R (range -100..0).
export function williamsR(candles: Candle[], period = 14): number[] {
  const n = candles.length;
  const out = new Array(n).fill(NA);
  for (let i = period - 1; i < n; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    const denom = hi - lo || 1e-9;
    out[i] = ((hi - candles[i].close) / denom) * -100;
  }
  return out;
}

// Rate of Change (%).
export function roc(values: number[], period = 12): number[] {
  const out = new Array(values.length).fill(NA);
  for (let i = period; i < values.length; i++) {
    const base = values[i - period] || 1e-9;
    out[i] = ((values[i] - base) / base) * 100;
  }
  return out;
}

// Parabolic SAR (overlay dots).
export function psar(candles: Candle[], step = 0.02, max = 0.2): number[] {
  const n = candles.length;
  const out = new Array(n).fill(NA);
  if (n < 2) return out;
  let bull = candles[1].close >= candles[0].close;
  let af = step;
  let ep = bull ? candles[0].high : candles[0].low;
  let sar = bull ? candles[0].low : candles[0].high;
  for (let i = 1; i < n; i++) {
    sar = sar + af * (ep - sar);
    const c = candles[i];
    if (bull) {
      sar = Math.min(sar, candles[i - 1].low, i >= 2 ? candles[i - 2].low : candles[i - 1].low);
      if (c.low < sar) {
        bull = false;
        sar = ep;
        ep = c.low;
        af = step;
      } else if (c.high > ep) {
        ep = c.high;
        af = Math.min(af + step, max);
      }
    } else {
      sar = Math.max(sar, candles[i - 1].high, i >= 2 ? candles[i - 2].high : candles[i - 1].high);
      if (c.high > sar) {
        bull = true;
        sar = ep;
        ep = c.high;
        af = step;
      } else if (c.low < ep) {
        ep = c.low;
        af = Math.min(af + step, max);
      }
    }
    out[i] = round4(sar);
  }
  return out;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// SMA over a series that may contain NaN (used to smooth %K etc.).
function smaIgnoreNaN(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NA);
  const buf: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (Number.isNaN(values[i])) continue;
    buf.push(values[i]);
    if (buf.length > period) buf.shift();
    if (buf.length === period) out[i] = buf.reduce((a, b) => a + b, 0) / period;
  }
  return out;
}

// Build {time,value} points dropping NaN - ready for lightweight-charts setData.
export function toLine(candles: Candle[], series: number[]): LinePoint[] {
  const pts: LinePoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (!Number.isNaN(series[i])) pts.push({ time: candles[i].time, value: series[i] });
  }
  return pts;
}

export const closes = (candles: Candle[]) => candles.map((c) => c.close);

// Heikin Ashi candles - smoothed OHLC that filters noise / clarifies trend.
export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  let prevO = 0;
  let prevC = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = i === 0 ? (c.open + c.close) / 2 : (prevO + prevC) / 2;
    const high = Math.max(c.high, open, close);
    const low = Math.min(c.low, open, close);
    out.push({ time: c.time, open, high, low, close, volume: c.volume });
    prevO = open;
    prevC = close;
  }
  return out;
}
