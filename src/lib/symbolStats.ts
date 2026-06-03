// Client-side derivations for the symbol-info panel that need price history
// rather than fundamentals: trailing performance, monthly seasonality, and a
// TradingView-style technical summary. All pure, computed from candle arrays.
import type { Candle } from "@shared/types";
import { sma, ema, rsi, macd, closes } from "./indicators";

export interface PerfPoint {
  label: string;
  pct: number;
}

// Trailing returns over standard windows. `daily` drives the short/mid windows;
// `weekly` (a longer span) drives 5Y. Returns only the windows we can cover.
export function computePerformance(daily: Candle[], weekly: Candle[]): PerfPoint[] {
  const out: PerfPoint[] = [];
  const ret = (series: Candle[], daysAgo: number, label: string) => {
    if (series.length < 2) return;
    const last = series[series.length - 1];
    const targetT = last.time - daysAgo * 86400;
    // First candle at or after the target time.
    const base = series.find((c) => c.time >= targetT) ?? series[0];
    if (base && base.close > 0 && base !== last) {
      out.push({ label, pct: (last.close / base.close - 1) * 100 });
    }
  };
  ret(daily, 7, "1W");
  ret(daily, 30, "1M");
  ret(daily, 91, "3M");
  ret(daily, 182, "6M");
  // YTD: first daily bar of the current calendar year (UTC).
  if (daily.length > 1) {
    const last = daily[daily.length - 1];
    const lastDate = new Date(last.time * 1000);
    const janFirst = Date.UTC(lastDate.getUTCFullYear(), 0, 1) / 1000;
    const base = daily.find((c) => c.time >= janFirst);
    if (base && base.close > 0 && base !== last) {
      out.push({ label: "YTD", pct: (last.close / base.close - 1) * 100 });
    }
  }
  ret(daily, 365, "1Y");
  ret(weekly, 365 * 5, "5Y");
  return out;
}

export interface Seasonal {
  month: string; // "Jan"..."Dec"
  avg: number; // average % return for that calendar month
  years: number; // sample size
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Average month-over-month return per calendar month, from a long series.
// We reduce the series to one close per month (the last bar in each month),
// then average the month-over-month change grouped by calendar month.
export function computeSeasonals(series: Candle[]): Seasonal[] {
  if (series.length < 13) return [];
  // Last close of each calendar month, in order.
  const monthly: { y: number; m: number; close: number }[] = [];
  for (const c of series) {
    const d = new Date(c.time * 1000);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const prev = monthly[monthly.length - 1];
    if (prev && prev.y === y && prev.m === m) prev.close = c.close;
    else monthly.push({ y, m, close: c.close });
  }
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (let i = 1; i < monthly.length; i++) {
    const prev = monthly[i - 1];
    const cur = monthly[i];
    if (prev.close > 0) buckets[cur.m].push((cur.close / prev.close - 1) * 100);
  }
  return MONTHS.map((month, m) => {
    const arr = buckets[m];
    const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return { month, avg, years: arr.length };
  });
}

export interface TechSignal {
  name: string;
  value: string;
  signal: "buy" | "sell" | "neutral";
}
export interface Technicals {
  summary: "Strong buy" | "Buy" | "Neutral" | "Sell" | "Strong sell";
  buy: number;
  sell: number;
  neutral: number;
  signals: TechSignal[];
}

// A compact technical read on a daily series: price vs several moving averages,
// MACD cross, and RSI. Tallies buy/sell signals into an overall verdict.
export function computeTechnicals(daily: Candle[]): Technicals | null {
  if (daily.length < 30) return null;
  const c = closes(daily);
  const price = c[c.length - 1];
  const last = (a: number[]) => a[a.length - 1];

  const signals: TechSignal[] = [];
  const maSig = (name: string, arr: number[]) => {
    const v = last(arr);
    if (!Number.isFinite(v)) return;
    signals.push({
      name,
      value: v.toFixed(2),
      signal: price > v ? "buy" : price < v ? "sell" : "neutral",
    });
  };
  maSig("EMA 9", ema(c, 9));
  maSig("EMA 21", ema(c, 21));
  maSig("SMA 20", sma(c, 20));
  maSig("SMA 50", sma(c, 50));
  maSig("SMA 200", sma(c, 200));

  const m = macd(c);
  const macdV = last(m.macd);
  const sigV = last(m.signal);
  if (Number.isFinite(macdV) && Number.isFinite(sigV)) {
    signals.push({
      name: "MACD",
      value: macdV.toFixed(2),
      signal: macdV > sigV ? "buy" : macdV < sigV ? "sell" : "neutral",
    });
  }
  const r = last(rsi(c));
  if (Number.isFinite(r)) {
    signals.push({
      name: "RSI (14)",
      value: r.toFixed(0),
      signal: r >= 70 ? "sell" : r <= 30 ? "buy" : r > 55 ? "buy" : r < 45 ? "sell" : "neutral",
    });
  }

  const buy = signals.filter((s) => s.signal === "buy").length;
  const sell = signals.filter((s) => s.signal === "sell").length;
  const neutral = signals.filter((s) => s.signal === "neutral").length;
  const net = buy - sell;
  const summary =
    net >= 4 ? "Strong buy" : net >= 1 ? "Buy" : net <= -4 ? "Strong sell" : net <= -1 ? "Sell" : "Neutral";
  return { summary, buy, sell, neutral, signals };
}
