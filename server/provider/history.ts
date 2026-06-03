import type { Candle, Timeframe } from "../../shared/types.js";
import { fetchWithTimeout, round2 } from "./util.js";

// Real historical OHLC from the Yahoo Finance v8 chart API.
// Keyless, covers intraday + daily + weekly, and is the source of truth for
// chart history in both demo and live modes (history is real either way).
// Falls back to the deterministic generator (market.ts) if a fetch fails.

const RANGE: Record<Timeframe, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "5m" },
  "1W": { range: "5d", interval: "30m" },
  "1M": { range: "1mo", interval: "1h" },
  "3M": { range: "3mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "5Y": { range: "5y", interval: "1wk" },
  ALL: { range: "max", interval: "1mo" },
};

// Intraday views update often; long views barely change - cache accordingly.
const TTL: Record<Timeframe, number> = {
  "1D": 20_000,
  "1W": 60_000,
  "1M": 5 * 60_000,
  "3M": 30 * 60_000,
  "1Y": 60 * 60_000,
  "5Y": 6 * 60 * 60_000,
  ALL: 12 * 60 * 60_000,
};

interface CacheEntry {
  at: number;
  candles: Candle[];
}
const cache = new Map<string, CacheEntry>();

export async function fetchHistory(symbol: string, tf: Timeframe): Promise<Candle[] | null> {
  const key = `${symbol.toUpperCase()}:${tf}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL[tf]) return hit.candles;

  const { range, interval } = RANGE[tf];
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}` +
    `?range=${range}&interval=${interval}&includePrePost=false`;

  try {
    const res = await fetchWithTimeout(url, {}, 9000);
    if (!res.ok) return null;
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const ts: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    const o = q.open ?? [];
    const h = q.high ?? [];
    const l = q.low ?? [];
    const c = q.close ?? [];
    const v = q.volume ?? [];

    const candles: Candle[] = [];
    for (let i = 0; i < ts.length; i++) {
      // Yahoo emits nulls for gaps/halts - carry the last close so the series stays continuous.
      const close = c[i];
      if (close == null) continue;
      const open = o[i] ?? close;
      const high = h[i] ?? Math.max(open, close);
      const low = l[i] ?? Math.min(open, close);
      candles.push({
        time: ts[i],
        open: round2(open),
        high: round2(high),
        low: round2(low),
        close: round2(close),
        volume: Math.round(v[i] ?? 0),
      });
    }
    if (candles.length < 2) return null;
    cache.set(key, { at: Date.now(), candles });
    return candles;
  } catch {
    return null;
  }
}
