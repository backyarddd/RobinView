import type { ScreenerRow } from "../../shared/types.js";
import { fetchQuotes } from "./quotes.js";
import { UNIVERSE } from "./universe.js";
import { fetchWithTimeout, getYahooCrumb, rawNum as num } from "./util.js";

// Predefined screeners (gainers / losers / most actives).
// Primary:  Yahoo predefined saved screener (cookie + crumb gated).
// Fallback: compute from a broad symbol universe via real quotes so we
//           always return something.
const TTL = 60_000; // 60 s

export type Preset = "day_gainers" | "day_losers" | "most_actives";
const PRESETS: Preset[] = ["day_gainers", "day_losers", "most_actives"];
const cache = new Map<string, { at: number; rows: ScreenerRow[] }>();

// Broaden the fallback universe beyond the demo list with a few liquid names.
const EXTRAS = [
  "INTC", "BAC", "F", "T", "PFE", "DIS", "KO", "WMT", "XOM", "CVX",
  "BABA", "SOFI", "NIO", "MARA", "RIOT", "PYPL", "SHOP", "SNAP", "RIVN", "LCID",
  "DELL", "NOW", "ADBE", "QCOM", "TXN", "GE", "BA", "NKE", "MCD", "PEP",
];

export async function fetchScreener(presetRaw: string): Promise<ScreenerRow[]> {
  const preset = (PRESETS.includes(presetRaw as Preset) ? presetRaw : "day_gainers") as Preset;
  const hit = cache.get(preset);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;

  let rows: ScreenerRow[] | null = null;
  try {
    rows = await fromYahooScreener(preset);
  } catch {
    rows = null;
  }
  if (!rows || rows.length === 0) {
    try {
      rows = await fromUniverse(preset);
    } catch {
      rows = null;
    }
  }

  if (!rows || rows.length === 0) {
    if (hit) return hit.rows;
    rows = [];
  }
  cache.set(preset, { at: Date.now(), rows });
  return rows;
}

async function fromYahooScreener(preset: Preset): Promise<ScreenerRow[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cr = await getYahooCrumb(attempt > 0);
    if (!cr) return null;
    const url =
      `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved` +
      `?count=25&scrIds=${encodeURIComponent(preset)}&crumb=${encodeURIComponent(cr.crumb)}`;
    const res = await fetchWithTimeout(url, { headers: { Cookie: cr.cookie } });
    if (res.status === 401 || res.status === 403) continue;
    if (!res.ok) return null;
    const json: any = await res.json();
    const quotes: any[] = json?.finance?.result?.[0]?.quotes ?? [];
    if (quotes.length === 0) return null;
    return quotes
      .map((q) => mapYahooRow(q))
      .filter((r): r is ScreenerRow => r !== null);
  }
  return null;
}

function mapYahooRow(q: any): ScreenerRow | null {
  const symbol = String(q.symbol || "").toUpperCase();
  const price = num(q.regularMarketPrice);
  if (!symbol || price == null) return null;
  return {
    symbol,
    name: q.shortName || q.longName || symbol,
    price,
    changePct: num(q.regularMarketChangePercent) ?? 0,
    marketCap: num(q.marketCap),
    volume: num(q.regularMarketVolume),
    peRatio: num(q.trailingPE),
  };
}

async function fromUniverse(preset: Preset): Promise<ScreenerRow[]> {
  const symbols = Array.from(new Set([...UNIVERSE.map((u) => u.symbol), ...EXTRAS]));
  const quotes = await fetchQuotes(symbols);
  const nameBy = new Map(UNIVERSE.map((u) => [u.symbol, u.name]));

  const rows: ScreenerRow[] = quotes
    .filter((q) => q && Number.isFinite(q.price) && q.price > 0)
    .map((q) => ({
      symbol: q.symbol,
      name: q.name || nameBy.get(q.symbol) || q.symbol,
      price: q.price,
      changePct: q.changePct ?? 0,
      volume: undefined,
      marketCap: undefined,
      peRatio: undefined,
    }));

  if (preset === "day_gainers") rows.sort((a, b) => b.changePct - a.changePct);
  else if (preset === "day_losers") rows.sort((a, b) => a.changePct - b.changePct);
  else rows.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)); // proxy for "active"

  return rows.slice(0, 25);
}
