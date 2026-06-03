// Matches the Fundamentals contract in src/lib/api.ts (frontend cannot be imported here).
export interface Fundamentals {
  symbol: string;
  longName?: string;
  sector?: string;
  industry?: string;
  description?: string;
  marketCap?: number;
  peRatio?: number;
  forwardPe?: number;
  eps?: number;
  dividendYield?: number;
  beta?: number;
  week52High?: number;
  week52Low?: number;
  dayHigh?: number;
  dayLow?: number;
  avgVolume?: number;
  sharesOutstanding?: number;
  nextEarningsDate?: number;
}

// Real fundamentals from Yahoo Finance (keyless, but cookie+crumb gated).
// Primary:  v10 quoteSummary (rich modules) — needs a cookie + crumb pair.
// Fallback: v8 chart meta (already keyless) so the endpoint never hard-fails.

const UA = "Mozilla/5.0 (RobinView)";
const TTL = 5 * 60_000; // 5 min

interface CacheEntry {
  at: number;
  data: Fundamentals;
}
const cache = new Map<string, CacheEntry>();

// ── Shared Yahoo cookie + crumb (exported for screener.ts) ──────────────────
interface Crumb {
  cookie: string;
  crumb: string;
  at: number;
}
let crumbCache: Crumb | null = null;
const CRUMB_TTL = 30 * 60_000; // 30 min

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 9000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "User-Agent": UA, ...(init.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function getYahooCrumb(force = false): Promise<Crumb | null> {
  if (!force && crumbCache && Date.now() - crumbCache.at < CRUMB_TTL) return crumbCache;
  try {
    // 1) Obtain a Set-Cookie from a Yahoo edge host.
    let cookie = "";
    for (const host of ["https://fc.yahoo.com", "https://finance.yahoo.com"]) {
      try {
        const res = await fetchWithTimeout(host, {}, 7000);
        const sc = res.headers.get("set-cookie");
        if (sc) {
          cookie = sc.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
          if (cookie) break;
        }
      } catch {
        /* try next host */
      }
    }
    if (!cookie) return null;

    // 2) Exchange the cookie for a crumb.
    const res = await fetchWithTimeout(
      "https://query2.finance.yahoo.com/v1/test/getcrumb",
      { headers: { Cookie: cookie } },
      7000,
    );
    if (!res.ok) return null;
    const crumb = (await res.text()).trim();
    if (!crumb || crumb.includes("<")) return null;

    crumbCache = { cookie, crumb, at: Date.now() };
    return crumbCache;
  } catch {
    return null;
  }
}

export async function fetchFundamentals(symbol: string): Promise<Fundamentals> {
  const sym = symbol.toUpperCase();
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  let data: Fundamentals | null = null;
  try {
    data = await fromQuoteSummary(sym);
  } catch {
    data = null;
  }
  if (!data) {
    try {
      data = await fromChartMeta(sym);
    } catch {
      data = null;
    }
  }

  if (!data) {
    // Serve last-good on transient total failure.
    if (hit) return hit.data;
    data = { symbol: sym };
  }
  cache.set(sym, { at: Date.now(), data });
  return data;
}

async function fromQuoteSummary(sym: string): Promise<Fundamentals | null> {
  const modules = "price,summaryDetail,defaultKeyStatistics,assetProfile,calendarEvents";
  // Try with a crumb; on 401, refresh the crumb once and retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    const cr = await getYahooCrumb(attempt > 0);
    if (!cr) return null;
    const url =
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}` +
      `?modules=${modules}&crumb=${encodeURIComponent(cr.crumb)}`;
    const res = await fetchWithTimeout(url, { headers: { Cookie: cr.cookie } });
    if (res.status === 401 || res.status === 403) {
      crumbCache = null;
      continue;
    }
    if (!res.ok) return null;
    const json: any = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return null;
    return mapQuoteSummary(sym, result);
  }
  return null;
}

function raw(v: any): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "object" ? v.raw : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function mapQuoteSummary(sym: string, r: any): Fundamentals {
  const price = r.price ?? {};
  const sd = r.summaryDetail ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  const ap = r.assetProfile ?? {};
  const ce = r.calendarEvents ?? {};

  const earningsTs =
    raw(ce?.earnings?.earningsDate?.[0]) ??
    raw(ks?.nextFiscalYearEnd) ??
    undefined;

  return {
    symbol: sym,
    longName: price.longName || price.shortName || undefined,
    sector: ap.sector || undefined,
    industry: ap.industry || undefined,
    description: ap.longBusinessSummary || undefined,
    marketCap: raw(price.marketCap) ?? raw(sd.marketCap),
    peRatio: raw(sd.trailingPE),
    forwardPe: raw(sd.forwardPE) ?? raw(ks.forwardPE),
    eps: raw(ks.trailingEps),
    dividendYield: raw(sd.dividendYield),
    beta: raw(sd.beta) ?? raw(ks.beta),
    week52High: raw(sd.fiftyTwoWeekHigh),
    week52Low: raw(sd.fiftyTwoWeekLow),
    dayHigh: raw(price.regularMarketDayHigh) ?? raw(sd.dayHigh),
    dayLow: raw(price.regularMarketDayLow) ?? raw(sd.dayLow),
    avgVolume: raw(sd.averageVolume) ?? raw(sd.averageDailyVolume10Day),
    sharesOutstanding: raw(ks.sharesOutstanding) ?? raw(price.sharesOutstanding),
    nextEarningsDate: earningsTs ? earningsTs * 1000 : undefined,
  };
}

async function fromChartMeta(sym: string): Promise<Fundamentals | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
    `?range=1d&interval=1m`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const json: any = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  return {
    symbol: sym,
    longName: meta.longName || meta.shortName || undefined,
    week52High: num(meta.fiftyTwoWeekHigh),
    week52Low: num(meta.fiftyTwoWeekLow),
    dayHigh: num(meta.regularMarketDayHigh),
    dayLow: num(meta.regularMarketDayLow),
    avgVolume: num(meta.regularMarketVolume),
  };
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}
