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

// ── Free market-data contracts (Yahoo) — shared by server providers & client ──
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
