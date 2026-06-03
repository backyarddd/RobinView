import type { OptionsSummary } from "../../shared/types.js";
import { fetchWithTimeout, getYahooCrumb, rawNum as raw } from "./util.js";

// Options-chain summary from Yahoo's keyless v7 options endpoint. We surface a
// compact overview (nearest expiry, contract counts, put/call ratio by open
// interest, and at-the-money implied vol) rather than the full chain.
const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; data: OptionsSummary }>();

export async function fetchOptions(symbol: string): Promise<OptionsSummary> {
  const sym = symbol.toUpperCase();
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  let data: OptionsSummary = { symbol: sym, hasOptions: false };
  try {
    // The v7 options endpoint is now crumb-gated (returns "Invalid Crumb" 401
    // without it), so authenticate like the other Yahoo calls and retry once on
    // a stale crumb.
    let r: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const cr = await getYahooCrumb(attempt > 0);
      if (!cr) break;
      const url =
        `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}` +
        `?crumb=${encodeURIComponent(cr.crumb)}`;
      const res = await fetchWithTimeout(url, { headers: { Cookie: cr.cookie } }, 8000);
      if (res.status === 401 || res.status === 403) continue;
      if (!res.ok) break;
      const json: any = await res.json();
      r = json?.optionChain?.result?.[0];
      break;
    }
    {
      const chain = r?.options?.[0];
      if (r && chain) {
        const underlying = raw(r.quote?.regularMarketPrice);
        const calls: any[] = chain.calls ?? [];
        const puts: any[] = chain.puts ?? [];
        const callOI = sum(calls.map((c) => raw(c.openInterest) ?? 0));
        const putOI = sum(puts.map((p) => raw(p.openInterest) ?? 0));
        const atmCall = nearest(calls, underlying);
        const atmPut = nearest(puts, underlying);
        data = {
          symbol: sym,
          hasOptions: calls.length + puts.length > 0,
          underlyingPrice: underlying,
          expiration: raw(chain.expirationDate) ? raw(chain.expirationDate)! * 1000 : undefined,
          expirations: (r.expirationDates ?? []).map((d: number) => d * 1000),
          callCount: calls.length,
          putCount: puts.length,
          putCallRatio: callOI > 0 ? putOI / callOI : undefined,
          atmStrike: raw(atmCall?.strike) ?? raw(atmPut?.strike),
          atmCallIV: atmCall ? pct(raw(atmCall.impliedVolatility)) : undefined,
          atmPutIV: atmPut ? pct(raw(atmPut.impliedVolatility)) : undefined,
        };
      }
    }
  } catch {
    if (hit) return hit.data;
  }
  cache.set(sym, { at: Date.now(), data });
  return data;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const pct = (v: number | undefined) => (v == null ? undefined : v * 100);

// The contract whose strike is closest to the underlying price.
function nearest(contracts: any[], price: number | undefined): any | undefined {
  if (!contracts.length || price == null) return contracts[Math.floor(contracts.length / 2)];
  let best = contracts[0];
  let bestD = Infinity;
  for (const c of contracts) {
    const s = raw(c.strike);
    if (s == null) continue;
    const d = Math.abs(s - price);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
