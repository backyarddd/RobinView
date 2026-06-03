import type {
  Account,
  Portfolio,
  Position,
  Quote,
  CandleSeries,
  OrderRow,
  SearchResult,
  Timeframe,
} from "../../shared/types.js";

// A DataProvider is the seam between RobinView and a data source.
// Two implementations ship: MockProvider (deterministic demo, no auth) and
// MCPProvider (the real Robinhood MCP trading server). The UI never knows which.
export interface DataProvider {
  readonly mode: "live" | "demo";
  getAccounts(): Promise<Account[]>;
  // `positions` may be passed when the caller has already computed them this
  // tick, so the portfolio can be derived without recomputing positions.
  getPortfolio(account: string, positions?: Position[]): Promise<Portfolio | null>;
  getPositions(account: string): Promise<Position[]>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getCandles(symbol: string, timeframe: Timeframe): Promise<CandleSeries>;
  getOrders(account: string): Promise<OrderRow[]>;
  search(query: string): Promise<SearchResult[]>;
}
