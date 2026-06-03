// Demo universe. Anchor prices are realistic reference points; the live-tick
// simulator walks them in real time. Real portfolio tickers are included so demo
// mode mirrors the shape of an actual Robinhood account.
export interface Instrument {
  symbol: string;
  name: string;
  sector: string;
  assetClass: "equity" | "etf" | "crypto" | "index";
  price: number;
}

export const UNIVERSE: Instrument[] = [
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Semiconductors", assetClass: "equity", price: 222.81 },
  { symbol: "AAPL", name: "Apple Inc.", sector: "Consumer Tech", assetClass: "equity", price: 315.22 },
  { symbol: "TSLA", name: "Tesla, Inc.", sector: "Automotive", assetClass: "equity", price: 423.74 },
  { symbol: "AMD", name: "Advanced Micro Devices", sector: "Semiconductors", assetClass: "equity", price: 198.4 },
  { symbol: "MRVL", name: "Marvell Technology", sector: "Semiconductors", assetClass: "equity", price: 142.6 },
  { symbol: "CRDO", name: "Credo Technology", sector: "Semiconductors", assetClass: "equity", price: 168.9 },
  { symbol: "ALAB", name: "Astera Labs", sector: "Semiconductors", assetClass: "equity", price: 241.1 },
  { symbol: "MU", name: "Micron Technology", sector: "Semiconductors", assetClass: "equity", price: 248.7 },
  { symbol: "SNDK", name: "Sandisk Corp.", sector: "Storage", assetClass: "equity", price: 412.3 },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", sector: "Index Fund", assetClass: "etf", price: 712.4 },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Software", assetClass: "equity", price: 498.2 },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Internet", assetClass: "equity", price: 211.5 },
  { symbol: "AMZN", name: "Amazon.com, Inc.", sector: "E-Commerce", assetClass: "equity", price: 238.9 },
  { symbol: "META", name: "Meta Platforms", sector: "Internet", assetClass: "equity", price: 742.1 },
  { symbol: "AVGO", name: "Broadcom Inc.", sector: "Semiconductors", assetClass: "equity", price: 1684.0 },
  { symbol: "NFLX", name: "Netflix, Inc.", sector: "Media", assetClass: "equity", price: 1140.5 },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials", assetClass: "equity", price: 312.7 },
  { symbol: "V", name: "Visa Inc.", sector: "Financials", assetClass: "equity", price: 365.3 },
  { symbol: "COST", name: "Costco Wholesale", sector: "Retail", assetClass: "equity", price: 1042.8 },
  { symbol: "PLTR", name: "Palantir Technologies", sector: "Software", assetClass: "equity", price: 184.2 },
  { symbol: "COIN", name: "Coinbase Global", sector: "Financials", assetClass: "equity", price: 392.1 },
  { symbol: "HOOD", name: "Robinhood Markets", sector: "Financials", assetClass: "equity", price: 118.6 },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", sector: "Index Fund", assetClass: "etf", price: 776.5 },
  { symbol: "QQQ", name: "Invesco QQQ Trust", sector: "Index Fund", assetClass: "etf", price: 638.9 },
  { symbol: "ARM", name: "Arm Holdings", sector: "Semiconductors", assetClass: "equity", price: 188.3 },
  { symbol: "SMCI", name: "Super Micro Computer", sector: "Hardware", assetClass: "equity", price: 64.2 },
  { symbol: "TSM", name: "Taiwan Semiconductor", sector: "Semiconductors", assetClass: "equity", price: 312.4 },
  { symbol: "ORCL", name: "Oracle Corp.", sector: "Software", assetClass: "equity", price: 268.7 },
  { symbol: "CRM", name: "Salesforce, Inc.", sector: "Software", assetClass: "equity", price: 342.1 },
  { symbol: "UBER", name: "Uber Technologies", sector: "Transportation", assetClass: "equity", price: 96.8 },
];

const BY_SYMBOL = new Map(UNIVERSE.map((i) => [i.symbol, i]));

export function lookup(symbol: string): Instrument | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

export function nameFor(symbol: string): string {
  return BY_SYMBOL.get(symbol.toUpperCase())?.name ?? symbol.toUpperCase();
}

export function sectorFor(symbol: string): string {
  return BY_SYMBOL.get(symbol.toUpperCase())?.sector ?? "Equity";
}
