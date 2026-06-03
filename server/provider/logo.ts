import { fetchWithTimeout, getYahooCrumb } from "./util.js";

// Resolve a ticker to a company web domain, which downstream becomes a logo URL
// (Clearbit, with a Google-favicon fallback). A static map covers the common
// names instantly and keylessly; anything else falls back to Yahoo's
// assetProfile.website. Results (including misses) are cached so the watchlist
// does not hammer Yahoo.
const STATIC: Record<string, string> = {
  NVDA: "nvidia.com", AAPL: "apple.com", MSFT: "microsoft.com", GOOGL: "google.com",
  GOOG: "google.com", AMZN: "amazon.com", META: "meta.com", TSLA: "tesla.com",
  AVGO: "broadcom.com", AMD: "amd.com", NFLX: "netflix.com", JPM: "jpmorganchase.com",
  V: "visa.com", MA: "mastercard.com", COST: "costco.com", PLTR: "palantir.com",
  COIN: "coinbase.com", HOOD: "robinhood.com", ORCL: "oracle.com", CRM: "salesforce.com",
  UBER: "uber.com", ARM: "arm.com", TSM: "tsmc.com", MU: "micron.com",
  MRVL: "marvell.com", SMCI: "supermicro.com", INTC: "intel.com", QCOM: "qualcomm.com",
  DIS: "disney.com", BA: "boeing.com", KO: "coca-cola.com", PEP: "pepsico.com",
  WMT: "walmart.com", NKE: "nike.com", SBUX: "starbucks.com", PYPL: "paypal.com",
  SHOP: "shopify.com", SNOW: "snowflake.com", CRWD: "crowdstrike.com",
  CRDO: "credosemi.com", ALAB: "asteralabs.com", SNDK: "sandisk.com",
  VOO: "vanguard.com", VTI: "vanguard.com", QQQ: "invesco.com", SPY: "ssga.com",
  "BTC-USD": "bitcoin.org", "ETH-USD": "ethereum.org", "SOL-USD": "solana.com",
};

const TTL = 24 * 60 * 60_000; // 24h for hits
const NEG_TTL = 60 * 60_000; // 1h for misses
const cache = new Map<string, { at: number; domain: string | null }>();

export async function resolveDomain(symbol: string): Promise<string | null> {
  const sym = symbol.toUpperCase();
  if (STATIC[sym]) return STATIC[sym];

  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < (hit.domain ? TTL : NEG_TTL)) return hit.domain;

  let domain: string | null = null;
  try {
    domain = await fromYahoo(sym);
  } catch {
    domain = null;
  }
  cache.set(sym, { at: Date.now(), domain });
  return domain;
}

async function fromYahoo(sym: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cr = await getYahooCrumb(attempt > 0);
    if (!cr) return null;
    const url =
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}` +
      `?modules=assetProfile&crumb=${encodeURIComponent(cr.crumb)}`;
    const res = await fetchWithTimeout(url, { headers: { Cookie: cr.cookie } });
    if (res.status === 401 || res.status === 403) continue;
    if (!res.ok) return null;
    const json: any = await res.json();
    const site: string | undefined = json?.quoteSummary?.result?.[0]?.assetProfile?.website;
    return normalizeDomain(site);
  }
  return null;
}

function normalizeDomain(site: string | undefined): string | null {
  if (!site || typeof site !== "string") return null;
  try {
    const host = new URL(site.includes("://") ? site : `https://${site}`).hostname;
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
