import type { DataProvider } from "./types.js";
import type {
  Account,
  Portfolio,
  Position,
  Quote,
  CandleSeries,
  OrderRow,
  SearchResult,
  Timeframe,
  AssetClass,
  RobinhoodStatus,
} from "../../shared/types.js";
import { fetchQuotes, searchSymbols } from "./quotes.js";
import { fetchHistory } from "./history.js";
import { genCandles, intervalFor } from "./market.js";
import { RobinhoodConnection } from "./robinhood.js";
import { round2 } from "./util.js";

// The real-data provider. Market data (quotes, candles, search) is always live
// from a keyless market source — this is the TradingView half and needs no auth.
// Account data (accounts, portfolio, positions, orders) comes from RobinView's
// own Robinhood MCP connection and is empty until the user connects.
export class LiveProvider implements DataProvider {
  readonly mode = "live" as const;
  readonly rh: RobinhoodConnection;

  constructor(redirectUri: string) {
    this.rh = new RobinhoodConnection(redirectUri);
  }

  // ---- Robinhood connection control (exposed via /api/robinhood/*) ----
  robinhoodStatus(): RobinhoodStatus {
    return this.rh.status();
  }
  connectRobinhood() {
    return this.rh.connect();
  }
  finishRobinhood(code: string) {
    return this.rh.finishAuth(code);
  }
  disconnectRobinhood() {
    return this.rh.disconnect();
  }
  resumeRobinhood() {
    return this.rh.resume();
  }

  // ---- Market data (always real) ----
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return fetchQuotes(symbols);
  }

  async getCandles(symbol: string, timeframe: Timeframe): Promise<CandleSeries> {
    const sym = symbol.toUpperCase();
    const interval = intervalFor(timeframe);
    const real = await fetchHistory(sym, timeframe);
    if (real) return { symbol: sym, timeframe, interval, candles: real };
    // offline fallback: anchor a synthetic series to the last live quote
    const [q] = await fetchQuotes([sym]);
    const price = q?.price ?? 100;
    const prev = q?.previousClose ?? price;
    return { symbol: sym, timeframe, interval, candles: genCandles(sym, price, prev, timeframe, Math.floor(Date.now() / 1000)) };
  }

  async search(query: string): Promise<SearchResult[]> {
    return searchSymbols(query);
  }

  // ---- Account data (requires a Robinhood connection) ----
  async getAccounts(): Promise<Account[]> {
    if (!this.rh.status().connected) return [];
    return this.rh.getAccounts();
  }

  async getPositions(account: string): Promise<Position[]> {
    if (!account || !this.rh.status().connected) return [];
    const holdings = await this.rh.getHoldings(account);
    if (holdings.length === 0) return [];
    const quotes = await fetchQuotes(holdings.map((h) => h.symbol));
    const byd = new Map(quotes.map((q) => [q.symbol, q]));
    const positions: Position[] = holdings.map((h) => {
      const q = byd.get(h.symbol);
      const price = q?.price ?? h.averageBuyPrice;
      const prevClose = q?.previousClose ?? price;
      const marketValue = price * h.quantity;
      const costBasis = h.averageBuyPrice * h.quantity;
      const dayChange = (price - prevClose) * h.quantity;
      const openPnl = marketValue - costBasis;
      return {
        symbol: h.symbol,
        name: q?.name ?? h.symbol,
        quantity: h.quantity,
        averageBuyPrice: h.averageBuyPrice,
        price: round2(price),
        previousClose: round2(prevClose),
        marketValue: round2(marketValue),
        costBasis: round2(costBasis),
        dayChange: round2(dayChange),
        dayChangePct: prevClose ? round2(((price - prevClose) / prevClose) * 100) : 0,
        openPnl: round2(openPnl),
        openPnlPct: costBasis ? round2((openPnl / costBasis) * 100) : 0,
        portfolioWeight: 0,
        assetClass: "equity" as AssetClass,
      };
    });
    const total = positions.reduce((a, p) => a + p.marketValue, 0);
    for (const p of positions) p.portfolioWeight = total ? p.marketValue / total : 0;
    return positions.sort((a, b) => b.marketValue - a.marketValue);
  }

  async getPortfolio(account: string, pre?: Position[]): Promise<Portfolio | null> {
    if (!account || !this.rh.status().connected) return null;
    const [raw, positions] = await Promise.all([
      this.rh.getPortfolio(account),
      pre ?? this.getPositions(account),
    ]);
    // Revalue live from positions so the total ticks with the market.
    const equityValue = positions.reduce((a, p) => a + p.marketValue, 0);
    const costBasis = positions.reduce((a, p) => a + p.costBasis, 0);
    const dayChange = positions.reduce((a, p) => a + p.dayChange, 0);
    const totalValue = equityValue + raw.cash;
    const prevTotal = totalValue - dayChange;
    const totalChange = equityValue - costBasis;
    return {
      accountNumber: account,
      totalValue: round2(totalValue),
      equityValue: round2(equityValue),
      optionsValue: round2(raw.optionsValue),
      cryptoValue: round2(raw.cryptoValue),
      cash: round2(raw.cash),
      buyingPower: round2(raw.buyingPower),
      pendingDeposits: round2(raw.pendingDeposits),
      currency: raw.currency,
      dayChange: round2(dayChange),
      dayChangePct: prevTotal ? round2((dayChange / prevTotal) * 100) : 0,
      totalChange: round2(totalChange),
      totalChangePct: costBasis ? round2((totalChange / costBasis) * 100) : 0,
      costBasis: round2(costBasis),
    };
  }

  async getOrders(account: string): Promise<OrderRow[]> {
    if (!account || !this.rh.status().connected) return [];
    return this.rh.getOrders(account);
  }
}
