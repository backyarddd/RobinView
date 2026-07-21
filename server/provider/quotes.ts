import type { Quote, SearchResult, AssetClass } from "../../shared/types.js";
import { fetchWithTimeout, num, round2 } from "./util.js";

// Real live market quotes + symbol search from Yahoo Finance (keyless).
// The spark endpoint returns intraday close series for many symbols in ONE call,
// from which we derive live price, previous close, day open/high/low.

const QUOTE_TTL = 1500; // ms - quotes are polled ~1/s; a tiny cache de-dupes bursts
const cache = new Map<string, { at: number; quote: Quote }>();
const nameCache = new Map<string, string>();

export function cacheName(symbol: string, name: string) {
  if (name) nameCache.set(symbol.toUpperCase(), name);
}

export async function fetchQuotes(symbols: string[]): Promise<Quote[]> {
  const syms = symbols.map((s) => s.toUpperCase()).filter(Boolean);
  if (syms.length === 0) return [];

  const now = Date.now();
  const fresh: Quote[] = [];
  const stale: string[] = [];
  for (const s of syms) {
    const hit = cache.get(s);
    if (hit && now - hit.at < QUOTE_TTL) fresh.push(hit.quote);
    else stale.push(s);
  }
  if (stale.length === 0) return orderBy(syms, fresh);

  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(stale.join(","))}` +
      `&range=1d&interval=1m`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (res.ok) {
      const json: any = await res.json();
      // spark returns either { SYM: {...} } or { spark: { result: [...] } }
      const entries: any[] = json?.spark?.result
        ? json.spark.result.map((r: any) => ({ symbol: r.symbol, ...(r.response?.[0] ?? {}) }))
        : Object.entries(json).map(([symbol, v]: any) => ({ symbol, ...v }));
      for (const e of entries) {
        const q = sparkToQuote(e);
        if (q) {
          cache.set(q.symbol, { at: now, quote: q });
          fresh.push(q);
        }
      }
    }
  } catch {
    /* fall through with whatever is cached */
  }
  // any still-missing symbols: surface a neutral placeholder so the UI has a row
  for (const s of stale) {
    if (!fresh.find((q) => q.symbol === s)) {
      const hit = cache.get(s);
      if (hit) fresh.push(hit.quote);
    }
  }
  return orderBy(syms, fresh);
}

function orderBy(order: string[], quotes: Quote[]): Quote[] {
  const map = new Map(quotes.map((q) => [q.symbol, q]));
  return order.map((s) => map.get(s)).filter(Boolean) as Quote[];
}

// Mini-chart series: cap the points sent per quote (the UI draws ~56px wide).
const SPARK_POINTS = 40;
function downsample(xs: number[], n: number): number[] {
  if (xs.length <= n) return xs;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(xs[Math.floor((i * (xs.length - 1)) / (n - 1))]);
  return out;
}

function sparkToQuote(e: any): Quote | null {
  const symbol = String(e.symbol || "").toUpperCase();
  if (!symbol) return null;
  // Yahoo interleaves null AND NaN gaps in the close series; NaN survives a
  // `!= null` filter, so filter to finite numbers only.
  const closesRaw: number[] = (e.close ?? []).filter((x: any) => Number.isFinite(x));
  const prevClose = num(e.previousClose ?? e.chartPreviousClose);
  if (closesRaw.length === 0 && !prevClose) return null;
  const price = closesRaw.length ? closesRaw[closesRaw.length - 1] : prevClose;
  // Drop the quote entirely if we can't establish a finite price - a NaN/Infinity
  // price would poison every downstream computation (valuation, weights, charts).
  if (!Number.isFinite(price)) return null;
  const open = closesRaw.length ? closesRaw[0] : prevClose;
  const dayHigh = closesRaw.length ? Math.max(...closesRaw) : price;
  const dayLow = closesRaw.length ? Math.min(...closesRaw) : price;
  // Only treat prevClose as a baseline when it's a valid positive number;
  // otherwise there's no meaningful change/changePct to report.
  const havePrev = Number.isFinite(prevClose) && prevClose > 0;
  const change = havePrev ? price - prevClose : 0;
  return {
    symbol,
    name: nameCache.get(symbol),
    price: round2(price),
    previousClose: round2(havePrev ? prevClose : price),
    open: round2(open),
    dayHigh: round2(dayHigh),
    dayLow: round2(dayLow),
    bid: round2(price - price * 0.0002),
    ask: round2(price + price * 0.0002),
    change: round2(change),
    changePct: havePrev ? round2((change / prevClose) * 100) : 0,
    extendedHours: false,
    state: "active",
    updatedAt: Date.now(),
    // Today's close series (downsampled) so mini charts show the real intraday
    // shape instead of accumulating ticks from page load.
    spark: closesRaw.length > 1 ? downsample(closesRaw, SPARK_POINTS).map(round2) : undefined,
  };
}

export async function searchSymbols(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`;
    const res = await fetchWithTimeout(url, {}, 7000);
    if (!res.ok) return [];
    const json: any = await res.json();
    const quotes: any[] = json?.quotes ?? [];
    const allowed = new Set(["EQUITY", "ETF", "INDEX", "CRYPTOCURRENCY"]);
    return quotes
      .filter((r) => r.symbol && allowed.has(r.quoteType))
      .slice(0, 12)
      .map((r) => {
        const name = r.shortname || r.longname || r.symbol;
        cacheName(r.symbol, name);
        const assetClass: AssetClass =
          r.quoteType === "ETF"
            ? "etf"
            : r.quoteType === "INDEX"
              ? "index"
              : r.quoteType === "CRYPTOCURRENCY"
                ? "crypto"
                : "equity";
        return { symbol: r.symbol, name, assetClass };
      });
  } catch {
    return [];
  }
}
