import type { Fundamentals } from "../../shared/types.js";
import { fetchWithTimeout, getYahooCrumb, rawNum as raw, numU as num } from "./util.js";

// Real fundamentals from Yahoo Finance (keyless, but cookie+crumb gated).
// Primary:  v10 quoteSummary (rich modules) - needs a cookie + crumb pair.
// Fallback: v8 chart meta (already keyless) so the endpoint never hard-fails.
const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; data: Fundamentals }>();

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
      continue; // next iteration forces a crumb refresh via getYahooCrumb(true)
    }
    if (!res.ok) return null;
    const json: any = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return null;
    return mapQuoteSummary(sym, result);
  }
  return null;
}

// Convert a fractional yield (0.0052) to a percentage number (0.52).
function scalePct(v: number | undefined): number | undefined {
  return v == null ? undefined : v * 100;
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
    // Yahoo returns dividendYield as a fraction (0.0052 = 0.52%); the UI's
    // percent() does not scale, so normalize to a percentage number here.
    dividendYield: scalePct(raw(sd.dividendYield)),
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
