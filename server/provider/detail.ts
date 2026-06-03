import type { SymbolDetail, EarningsPoint, FinancialRow, AnalystTrend } from "../../shared/types.js";
import { fetchWithTimeout, getYahooCrumb, rawNum as raw } from "./util.js";

// Rich per-symbol detail from Yahoo's v10 quoteSummary (keyless, cookie+crumb
// gated). One request pulls every module the symbol-info panel needs: profile,
// valuation, dividends, earnings history, analyst coverage and annual financials.
const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; data: SymbolDetail }>();

const MODULES = [
  "price",
  "summaryDetail",
  "defaultKeyStatistics",
  "assetProfile",
  "calendarEvents",
  "financialData",
  "recommendationTrend",
  "earnings",
  "earningsHistory",
  "incomeStatementHistory",
].join(",");

export async function fetchSymbolDetail(symbol: string): Promise<SymbolDetail> {
  const sym = symbol.toUpperCase();
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  let data: SymbolDetail | null = null;
  try {
    data = await fromQuoteSummary(sym);
  } catch {
    data = null;
  }
  if (!data) {
    if (hit) return hit.data;
    data = { symbol: sym };
  }
  cache.set(sym, { at: Date.now(), data });
  return data;
}

async function fromQuoteSummary(sym: string): Promise<SymbolDetail | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cr = await getYahooCrumb(attempt > 0);
    if (!cr) return null;
    const url =
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}` +
      `?modules=${MODULES}&crumb=${encodeURIComponent(cr.crumb)}`;
    const res = await fetchWithTimeout(url, { headers: { Cookie: cr.cookie } });
    if (res.status === 401 || res.status === 403) continue;
    if (!res.ok) return null;
    const json: any = await res.json();
    const r = json?.quoteSummary?.result?.[0];
    if (!r) return null;
    return shape(sym, r);
  }
  return null;
}

const pct = (v: number | undefined) => (v == null ? undefined : v * 100);

function shape(sym: string, r: any): SymbolDetail {
  const price = r.price ?? {};
  const sd = r.summaryDetail ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  const ap = r.assetProfile ?? {};
  const ce = r.calendarEvents ?? {};
  const fd = r.financialData ?? {};

  const earningsTs = raw(ce?.earnings?.earningsDate?.[0]) ?? undefined;

  return {
    symbol: sym,
    longName: price.longName || price.shortName || undefined,
    sector: ap.sector || undefined,
    industry: ap.industry || undefined,
    description: ap.longBusinessSummary || undefined,
    website: ap.website || undefined,
    country: ap.country || undefined,
    employees: raw(ap.fullTimeEmployees),
    exchange: price.exchangeName || price.fullExchangeName || undefined,

    marketCap: raw(price.marketCap) ?? raw(sd.marketCap),
    peRatio: raw(sd.trailingPE),
    forwardPe: raw(sd.forwardPE) ?? raw(ks.forwardPE),
    pegRatio: raw(ks.pegRatio),
    priceToSales: raw(sd.priceToSalesTrailing12Months),
    priceToBook: raw(ks.priceToBook),
    eps: raw(ks.trailingEps),
    beta: raw(sd.beta) ?? raw(ks.beta),
    sharesOutstanding: raw(ks.sharesOutstanding) ?? raw(price.sharesOutstanding),
    avgVolume: raw(sd.averageVolume) ?? raw(sd.averageDailyVolume10Day),
    week52High: raw(sd.fiftyTwoWeekHigh),
    week52Low: raw(sd.fiftyTwoWeekLow),
    dayHigh: raw(price.regularMarketDayHigh) ?? raw(sd.dayHigh),
    dayLow: raw(price.regularMarketDayLow) ?? raw(sd.dayLow),

    dividendYield: pct(raw(sd.dividendYield) ?? raw(sd.trailingAnnualDividendYield)),
    dividendRate: raw(sd.dividendRate) ?? raw(sd.trailingAnnualDividendRate),
    exDividendDate: tsMs(raw(sd.exDividendDate) ?? raw(ce?.exDividendDate)),
    payoutRatio: pct(raw(sd.payoutRatio)),

    nextEarningsDate: earningsTs ? earningsTs * 1000 : undefined,
    earnings: mapEarnings(r.earnings, r.earningsHistory),

    recommendationKey: fd.recommendationKey || undefined,
    recommendationMean: raw(fd.recommendationMean),
    numberOfAnalysts: raw(fd.numberOfAnalystOpinions),
    targetLow: raw(fd.targetLowPrice),
    targetMean: raw(fd.targetMeanPrice),
    targetHigh: raw(fd.targetHighPrice),
    analystTrend: mapTrend(r.recommendationTrend),

    financials: mapFinancials(r.incomeStatementHistory),
  };
}

const tsMs = (v: number | undefined) => (v == null ? undefined : v * 1000);

// Build the recent-quarter EPS actual-vs-estimate series (oldest -> newest).
function mapEarnings(earnings: any, hist: any): EarningsPoint[] | undefined {
  const chart = earnings?.earningsChart?.quarterly;
  if (Array.isArray(chart) && chart.length) {
    return chart.map((q: any) => ({
      label: String(q.date ?? ""),
      actual: raw(q.actual),
      estimate: raw(q.estimate),
    }));
  }
  const rows = hist?.history;
  if (Array.isArray(rows) && rows.length) {
    return rows
      .slice(-6)
      .map((h: any) => ({
        label: h.quarter?.fmt ? String(h.quarter.fmt) : "",
        date: tsMs(raw(h.quarter)),
        actual: raw(h.epsActual),
        estimate: raw(h.epsEstimate),
      }));
  }
  return undefined;
}

function mapTrend(rt: any): AnalystTrend | undefined {
  const t = rt?.trend?.[0];
  if (!t) return undefined;
  const n = (v: any) => raw(v) ?? 0;
  const out = {
    strongBuy: n(t.strongBuy),
    buy: n(t.buy),
    hold: n(t.hold),
    sell: n(t.sell),
    strongSell: n(t.strongSell),
  };
  return out.strongBuy + out.buy + out.hold + out.sell + out.strongSell > 0 ? out : undefined;
}

function mapFinancials(is: any): FinancialRow[] | undefined {
  const rows = is?.incomeStatementHistory;
  if (!Array.isArray(rows) || !rows.length) return undefined;
  return rows
    .slice(0, 4)
    .map((s: any) => ({
      year: s.endDate?.fmt ? String(s.endDate.fmt).slice(0, 4) : "",
      revenue: raw(s.totalRevenue) || undefined,
      grossProfit: raw(s.grossProfit) || undefined, // Yahoo emits 0 when absent
      netIncome: raw(s.netIncome) || undefined,
    }))
    .filter((r: FinancialRow) => r.year);
}
