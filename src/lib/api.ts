import type {
  Account,
  Portfolio,
  Position,
  Quote,
  CandleSeries,
  OrderRow,
  SearchResult,
  Timeframe,
} from "@shared/types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data as T;
}

async function post<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "POST" });
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body.data as T;
}

export interface RhStatus {
  connected: boolean;
  connecting: boolean;
  hasSession: boolean;
  available: boolean;
  error?: string | null;
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
  quotes: (symbols: string[]) =>
    get<Quote[]>(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`),
  candles: (symbol: string, tf: Timeframe) =>
    get<CandleSeries>(`/api/candles/${symbol}?tf=${tf}`),
  search: (q: string) => get<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
};
