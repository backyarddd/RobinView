import type {
  Account,
  Portfolio,
  Position,
  Quote,
  CandleSeries,
  OrderRow,
  SearchResult,
  Timeframe,
  RobinhoodStatus,
  Fundamentals,
  NewsItem,
  ScreenerRow,
  OrderRequest,
  OrderReview,
  OrderResult,
  UpdateInfo,
  UpdateResult,
  SymbolDetail,
  OptionsSummary,
} from "@shared/types";

// Re-export the shared market-data contracts so existing `from "../lib/api"`
// imports keep working from one source of truth in shared/types.ts.
export type { Fundamentals, NewsItem, ScreenerRow, OrderRequest, OrderReview, OrderResult, UpdateInfo, UpdateResult, SymbolDetail, OptionsSummary } from "@shared/types";
export type RhStatus = RobinhoodStatus;

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data as T;
}

async function post<T>(url: string, payload?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: payload !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data as T;
}


export const api = {
  health: () => get<{ mode: "live" | "demo"; ok: boolean; robinhood: boolean }>("/api/health"),
  robinhood: {
    status: () => get<RhStatus>("/api/robinhood/status"),
    connect: () => post<{ connected: boolean; authUrl?: string }>("/api/robinhood/connect"),
    disconnect: () => post<{ ok: boolean }>("/api/robinhood/disconnect"),
  },
  accounts: () => get<Account[]>("/api/accounts"),
  portfolio: (account: string) => get<Portfolio>(`/api/portfolio/${account}`),
  positions: (account: string) => get<Position[]>(`/api/positions/${account}`),
  orders: (account: string) => get<OrderRow[]>(`/api/orders/${account}`),
  reviewOrder: (account: string, req: OrderRequest) =>
    post<OrderReview>(`/api/orders/${account}/review`, req),
  placeOrder: (account: string, req: OrderRequest) =>
    post<OrderResult>(`/api/orders/${account}/place`, req),
  cancelOrder: (account: string, orderId: string) =>
    post<OrderResult>(`/api/orders/${account}/cancel`, { orderId }),
  quotes: (symbols: string[]) =>
    get<Quote[]>(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`),
  candles: (symbol: string, tf: Timeframe) =>
    get<CandleSeries>(`/api/candles/${symbol}?tf=${tf}`),
  search: (q: string) => get<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
  fundamentals: (symbol: string) => get<Fundamentals>(`/api/fundamentals/${symbol}`),
  news: (symbol: string) => get<NewsItem[]>(`/api/news/${symbol}`),
  screener: (preset = "day_gainers") => get<ScreenerRow[]>(`/api/screener?preset=${encodeURIComponent(preset)}`),
  version: (force = false) => get<UpdateInfo>(`/api/version${force ? "?force=1" : ""}`),
  applyUpdate: () => post<UpdateResult>("/api/update"),
  symbolDetail: (symbol: string) => get<SymbolDetail>(`/api/symbol/${encodeURIComponent(symbol)}`),
  options: (symbol: string) => get<OptionsSummary>(`/api/options/${encodeURIComponent(symbol)}`),
  // Logo image URL (the endpoint 302s to the real logo); `fav` requests the
  // favicon fallback used when the primary logo image fails to load.
  logoUrl: (symbol: string, fav = false) =>
    `/api/logo/${encodeURIComponent(symbol)}${fav ? "?fallback=fav" : ""}`,
};
