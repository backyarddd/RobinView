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

// VWAP resets per session; with synthetic intraday we run it cumulatively.
export function vwap(candles: Candle[]): number[] {
  const out = new Array(candles.length).fill(NA);
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumV += c.volume;
    out[i] = cumV ? cumPV / cumV : c.close;
  }
  return out;
}

// Build {time,value} points dropping NaN — ready for lightweight-charts setData.
export function toLine(candles: Candle[], series: number[]): LinePoint[] {
  const pts: LinePoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (!Number.isNaN(series[i])) pts.push({ time: candles[i].time, value: series[i] });
  }
  return pts;
}

export const closes = (candles: Candle[]) => candles.map((c) => c.close);
