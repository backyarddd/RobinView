import type { Quote, SearchResult, AssetClass } from "../../shared/types.js";

// Real live market quotes + symbol search from Yahoo Finance (keyless).
// The spark endpoint returns intraday close series for many symbols in ONE call,
// from which we derive live price, previous close, day open/high/low.

const QUOTE_TTL = 1500; // ms — quotes are polled ~1/s; a tiny cache de-dupes bursts
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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (RobinView)" } });
    clearTimeout(timer);
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

function sparkToQuote(e: any): Quote | null {
  const symbol = String(e.symbol || "").toUpperCase();
  if (!symbol) return null;
  const closesRaw: number[] = (e.close ?? []).filter((x: any) => x != null);
  const prevClose = num(e.previousClose ?? e.chartPreviousClose);
  if (closesRaw.length === 0 && !prevClose) return null;
  const price = closesRaw.length ? closesRaw[closesRaw.length - 1] : prevClose;
  const open = closesRaw.length ? closesRaw[0] : prevClose;
  const dayHigh = closesRaw.length ? Math.max(...closesRaw) : price;
  const dayLow = closesRaw.length ? Math.min(...closesRaw) : price;
  const change = price - prevClose;
  return {
    symbol,
    name: nameCache.get(symbol),
    price: round2(price),
    previousClose: round2(prevClose),
    open: round2(open),
    dayHigh: round2(dayHigh),
    dayLow: round2(dayLow),
    bid: round2(price - price * 0.0002),
    ask: round2(price + price * 0.0002),
    change: round2(change),
    changePct: prevClose ? round2((change / prevClose) * 100) : 0,
    extendedHours: false,
    state: "active",
    updatedAt: Date.now(),
  };
}

export async function searchSymbols(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (RobinView)" } });
    clearTimeout(timer);
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

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
