import { fetchWithTimeout, getYahooCrumb, rawNum as raw } from "../provider/util.js";

// Live 0DTE option quotes from Yahoo's v7 chain endpoint (crumb-gated, same
// auth as server/provider/options.ts). Used only by the paper engine.

export interface ContractQuote {
  contractSymbol: string;
  strike: number;
  expiry: string; // YYYY-MM-DD
  bid: number;
  ask: number;
  spot: number;
}

async function fetchChain(symbol: string, date?: number): Promise<any | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cr = await getYahooCrumb(attempt > 0);
    if (!cr) return null;
    const url =
      `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}` +
      `?crumb=${encodeURIComponent(cr.crumb)}` +
      (date ? `&date=${date}` : "");
    const res = await fetchWithTimeout(url, { headers: { Cookie: cr.cookie } }, 8000);
    if (res.status === 401 || res.status === 403) continue;
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.optionChain?.result?.[0] ?? null;
  }
  return null;
}

// Yahoo stamps expirations at 00:00 UTC of the expiry date, so the UTC
// calendar day IS the expiry date (converting to ET would shift it back a day).
const expiryDay = (epochSec: number) => new Date(epochSec * 1000).toISOString().slice(0, 10);

// Today's (ET) expiry for the symbol, or null when there is no 0DTE chain
// (holiday, or the last expiry already rolled off).
export async function todayExpiry(symbol: string, todayET: string): Promise<number | null> {
  const r = await fetchChain(symbol);
  const dates: number[] = r?.expirationDates ?? [];
  const hit = dates.find((d) => expiryDay(d) === todayET);
  return hit ?? null;
}

// Quote the 0DTE contract nearest the given strike (or nearest the money when
// strike is omitted). Returns null when the chain or the side is unavailable.
export async function quote0dte(
  symbol: string,
  side: "call" | "put",
  todayET: string,
  strike?: number,
): Promise<ContractQuote | null> {
  const exp = await todayExpiry(symbol, todayET);
  if (!exp) return null;
  const r = await fetchChain(symbol, exp);
  const chain = r?.options?.[0];
  const spot = raw(r?.quote?.regularMarketPrice);
  const list: any[] = (side === "call" ? chain?.calls : chain?.puts) ?? [];
  if (!list.length || spot == null) return null;
  const target = strike ?? spot;
  let best: any = null;
  let bestD = Infinity;
  for (const c of list) {
    const s = raw(c.strike);
    const bid = raw(c.bid);
    const ask = raw(c.ask);
    if (s == null || bid == null || ask == null || ask <= 0) continue;
    const d = Math.abs(s - target);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) return null;
  return {
    contractSymbol: String(best.contractSymbol || ""),
    strike: raw(best.strike)!,
    expiry: expiryDay(exp),
    bid: raw(best.bid)!,
    ask: raw(best.ask)!,
    spot,
  };
}
