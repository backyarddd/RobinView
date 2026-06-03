// RobinView shared domain model.
// Shapes mirror the Robinhood MCP trading server responses, normalized to numbers
// (the wire format sends decimals as strings) so the UI never parses strings.

export type AssetClass = "equity" | "etf" | "crypto" | "option" | "index";

export interface Account {
  accountNumber: string;
  type: "margin" | "cash";
  brokerageAccountType: string; // individual | ira_roth | ...
  nickname?: string;
  isDefault: boolean;
  agenticAllowed: boolean;
  optionLevel: string;
}

export interface Portfolio {
  accountNumber: string;
  totalValue: number;
  equityValue: number;
  optionsValue: number;
  cryptoValue: number;
  cash: number;
  buyingPower: number;
  pendingDeposits: number;
  currency: string;
  // Derived day-level numbers (computed by the provider from positions + quotes).
  dayChange: number;
  dayChangePct: number;
  totalChange: number; // vs cost basis (open PnL)
  totalChangePct: number;
  costBasis: number;
}

export interface Position {
  symbol: string;
  name?: string;
  quantity: number;
  averageBuyPrice: number;
  // Live-derived (joined with quote):
  price: number;
  previousClose: number;
  marketValue: number;
  costBasis: number;
  dayChange: number;
  dayChangePct: number;
  openPnl: number;
  openPnlPct: number;
  portfolioWeight: number; // 0..1
  assetClass: AssetClass;
}

export interface Quote {
  symbol: string;
  name?: string;
  price: number; // best live price (regular or extended, whichever fresher)
  previousClose: number;
  open?: number;
  dayHigh?: number;
  dayLow?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  change: number; // price - previousClose
  changePct: number;
  extendedHours: boolean;
  state: "active" | "closed" | "pre" | "post";
  updatedAt: number; // epoch ms
}

export type Candle = {
  time: number; // epoch seconds (UTC), lightweight-charts convention
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Timeframe = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y" | "ALL";
export type Interval = "1m" | "5m" | "15m" | "1h" | "1d" | "1w";

export interface CandleSeries {
  symbol: string;
  timeframe: Timeframe;
  interval: Interval;
  candles: Candle[];
}

export interface OrderRow {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop_market" | "stop_limit";
  state: string;
  quantity: number;
  price?: number;
  averageFillPrice?: number;
  createdAt: number;
  placedAgent?: string;
}

export interface SearchResult {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  instrumentId?: string;
}

// ── Order entry (maps to the Robinhood agentic order tools) ──────────────────
export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop_market" | "stop_limit";
export type TimeInForce = "gfd" | "gtc";
export type MarketHours = "regular_hours" | "extended_hours" | "all_day_hours";

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity?: number; // shares (one of quantity / dollarAmount)
  dollarAmount?: number; // USD notional - market orders only
  limitPrice?: number; // required for limit / stop_limit
  stopPrice?: number; // required for stop_market / stop_limit
  timeInForce?: TimeInForce; // default gfd
  marketHours?: MarketHours; // default regular_hours
}

// Result of a pre-trade simulation (review_equity_order).
export interface OrderReview {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity?: number;
  estimatedPrice?: number; // quote used for the estimate
  estimatedCost?: number; // notional incl. computed shares for dollar orders
  buyingPower?: number;
  alerts: string[]; // pre-trade warnings (buying power, halt, PDT, …)
  raw?: unknown; // full upstream payload for anything not modeled
}

export interface OrderResult {
  ok: boolean;
  id?: string;
  state?: string;
  message?: string;
}

export interface MarketMover {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  change: number;
}

export interface RobinhoodStatus {
  connected: boolean;
  connecting?: boolean;
  hasSession: boolean;
  available?: boolean;
  error?: string | null;
}

// ── Free market-data contracts (Yahoo) - shared by server providers & client ──
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

export interface NewsItem {
  title: string;
  publisher?: string;
  link: string;
  publishedAt?: number;
  thumbnail?: string;
  summary?: string; // article description / standfirst, when the source provides one
}

// ── App self-update (checks the project's GitHub repo) ──────────────────────
export interface UpdateInfo {
  current: string; // version this running build reports
  latest: string | null; // newest published release/tag, null if unknown
  hasUpdate: boolean; // latest is strictly newer than current
  url: string | null; // release page to read more
  notes: string | null; // release body / changelog excerpt
  publishedAt: number | null; // epoch ms of the latest release
  channel: "release" | "tag" | "none"; // where `latest` came from
}

export interface UpdateResult {
  ok: boolean;
  version: string; // version after the attempt
  message: string; // human-readable outcome (shown in the UI)
  restartRequired: boolean; // true when the user must restart the server manually
  output?: string; // tail of the git/npm output, for diagnostics
}

// ── Rich symbol detail (Yahoo quoteSummary, keyless) ──
export interface EarningsPoint {
  label: string; // e.g. "Q3 '25"
  date?: number; // epoch ms
  actual?: number; // reported EPS
  estimate?: number; // consensus EPS estimate
}
export interface AnalystTrend {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}
export interface FinancialRow {
  year: string; // fiscal year label
  revenue?: number;
  grossProfit?: number;
  netIncome?: number;
}
export interface SymbolDetail {
  symbol: string;
  // Profile
  longName?: string;
  sector?: string;
  industry?: string;
  description?: string;
  website?: string;
  country?: string;
  employees?: number;
  exchange?: string;
  // Key stats / pricing model (valuation)
  marketCap?: number;
  peRatio?: number;
  forwardPe?: number;
  pegRatio?: number;
  priceToSales?: number;
  priceToBook?: number;
  eps?: number;
  beta?: number;
  sharesOutstanding?: number;
  avgVolume?: number;
  week52High?: number;
  week52Low?: number;
  dayHigh?: number;
  dayLow?: number;
  // Dividends
  dividendYield?: number; // percent (e.g. 0.52 = 0.52%)
  dividendRate?: number; // annual $ per share
  exDividendDate?: number; // epoch ms
  payoutRatio?: number; // percent
  // Earnings
  nextEarningsDate?: number; // epoch ms
  earnings?: EarningsPoint[]; // recent quarters, oldest -> newest
  // Analysts
  recommendationKey?: string; // e.g. "buy"
  recommendationMean?: number; // 1 (strong buy) .. 5 (strong sell)
  numberOfAnalysts?: number;
  targetLow?: number;
  targetMean?: number;
  targetHigh?: number;
  analystTrend?: AnalystTrend;
  // Financials (annual, newest -> oldest)
  financials?: FinancialRow[];
}

// ── Options chain summary (Yahoo /v7/finance/options, keyless) ──
export interface OptionsSummary {
  symbol: string;
  hasOptions: boolean;
  underlyingPrice?: number;
  expiration?: number; // nearest expiry shown, epoch ms
  expirations?: number[]; // all available expiries, epoch ms
  callCount?: number;
  putCount?: number;
  putCallRatio?: number; // by open interest
  atmStrike?: number;
  atmCallIV?: number; // percent
  atmPutIV?: number; // percent
}

export interface ScreenerRow {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  marketCap?: number;
  volume?: number;
  peRatio?: number;
}

// WebSocket envelope: server -> client.
export type WsMessage =
  | { type: "hello"; mode: "live" | "demo"; account: string; time: number }
  | { type: "quotes"; quotes: Quote[] }
  | { type: "portfolio"; portfolio: Portfolio }
  | { type: "positions"; positions: Position[] }
  | { type: "rhstatus"; connected: boolean; hasSession: boolean; available: boolean }
  | { type: "error"; message: string };

// WebSocket client -> server.
export type WsClientMessage =
  | { type: "subscribe"; symbols: string[] }
  | { type: "unsubscribe"; symbols: string[] }
  | { type: "setAccount"; account: string };
