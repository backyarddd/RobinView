import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
} from "../../shared/types.js";
import { genCandles, intervalFor } from "./market.js";
import { nameFor } from "./universe.js";

const DEFAULT_URL = "https://agent.robinhood.com/mcp/trading";

// Live provider backed by the Robinhood MCP trading server.
//
// Auth: the MCP endpoint is OAuth-gated. Supply a bearer token via the
// ROBINHOOD_MCP_TOKEN env var (obtained from your Robinhood agent session).
// Without it the server starts in demo mode — RobinView never blocks on auth.
export class MCPProvider implements DataProvider {
  readonly mode = "live" as const;
  private client: Client;
  private connected: Promise<void> | null = null;

  constructor(
    private url: string = process.env.ROBINHOOD_MCP_URL || DEFAULT_URL,
    private token: string | undefined = process.env.ROBINHOOD_MCP_TOKEN,
  ) {
    this.client = new Client({ name: "robinview", version: "0.1.0" }, { capabilities: {} });
  }

  private connect(): Promise<void> {
    if (!this.connected) {
      const transport = new StreamableHTTPClientTransport(new URL(this.url), {
        requestInit: this.token
          ? { headers: { Authorization: `Bearer ${this.token}` } }
          : undefined,
      });
      this.connected = this.client.connect(transport);
    }
    return this.connected;
  }

  private async call(name: string, args: Record<string, unknown> = {}): Promise<any> {
    await this.connect();
    const res: any = await this.client.callTool({ name, arguments: args });
    const text = (res?.content ?? [])
      .filter((c: any) => c?.type === "text")
      .map((c: any) => c.text)
      .join("");
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      return parsed?.data ?? parsed;
    } catch {
      return { raw: text };
    }
  }

  async getAccounts(): Promise<Account[]> {
    const data = await this.call("get_accounts");
    return (data.accounts ?? []).map((a: any) => ({
      accountNumber: a.account_number,
      type: a.type,
      brokerageAccountType: a.brokerage_account_type,
      nickname: a.nickname,
      isDefault: !!a.is_default,
      agenticAllowed: !!a.agentic_allowed,
      optionLevel: a.option_level ?? "",
    }));
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) return [];
    const data = await this.call("get_equity_quotes", { symbols });
    return (data.results ?? []).map((r: any) => mapQuote(r));
  }

  async getPositions(account: string): Promise<Position[]> {
    const data = await this.call("get_equity_positions", { account_number: account });
    const rows = data.positions ?? [];
    const symbols = rows.map((p: any) => p.symbol);
    const quotes = await this.getQuotes(symbols);
    const bysymbol = new Map(quotes.map((q) => [q.symbol, q]));
    const positions: Position[] = rows.map((p: any) => {
      const q = byymbolGet(bysymbol, p.symbol);
      const quantity = num(p.quantity);
      const avg = num(p.average_buy_price);
      const price = q?.price ?? avg;
      const prevClose = q?.previousClose ?? avg;
      const marketValue = price * quantity;
      const costBasis = avg * quantity;
      const dayChange = (price - prevClose) * quantity;
      const openPnl = marketValue - costBasis;
      return {
        symbol: p.symbol,
        name: nameFor(p.symbol),
        quantity,
        averageBuyPrice: avg,
        price,
        previousClose: prevClose,
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

  async getPortfolio(account: string): Promise<Portfolio> {
    const [data, positions] = await Promise.all([
      this.call("get_portfolio", { account_number: account }),
      this.getPositions(account),
    ]);
    const costBasis = positions.reduce((a, p) => a + p.costBasis, 0);
    const dayChange = positions.reduce((a, p) => a + p.dayChange, 0);
    const equityValue = num(data.equity_value);
    const totalValue = num(data.total_value);
    const prevTotal = totalValue - dayChange;
    const totalChange = equityValue - costBasis;
    return {
      accountNumber: account,
      totalValue: round2(totalValue),
      equityValue: round2(equityValue),
      optionsValue: num(data.options_value),
      cryptoValue: num(data.crypto_value),
      cash: num(data.cash),
      buyingPower: num(data.buying_power?.buying_power),
      pendingDeposits: num(data.pending_deposits),
      currency: data.currency ?? "USD",
      dayChange: round2(dayChange),
      dayChangePct: prevTotal ? round2((dayChange / prevTotal) * 100) : 0,
      totalChange: round2(totalChange),
      totalChangePct: costBasis ? round2((totalChange / costBasis) * 100) : 0,
      costBasis: round2(costBasis),
    };
  }

  async getOrders(account: string): Promise<OrderRow[]> {
    const data = await this.call("get_equity_orders", { account_number: account });
    return (data.orders ?? []).map((o: any) => ({
      id: o.id,
      symbol: o.symbol ?? o.instrument_symbol ?? "",
      side: o.side,
      type: o.type,
      state: o.state,
      quantity: num(o.quantity),
      price: o.price ? num(o.price) : undefined,
      averageFillPrice: o.average_price ? num(o.average_price) : undefined,
      createdAt: o.created_at ? Date.parse(o.created_at) : Date.now(),
      placedAgent: o.placed_agent,
    }));
  }

  async search(query: string): Promise<SearchResult[]> {
    const data = await this.call("search", { query, asset_type: "instrument" });
    const results = data.results ?? data.instruments ?? [];
    return results.slice(0, 12).map((r: any) => ({
      symbol: r.symbol,
      name: r.name ?? r.simple_name ?? r.symbol,
      assetClass: "equity" as AssetClass,
      instrumentId: r.instrument_id ?? r.id,
    }));
  }

  // The Robinhood MCP surface does not expose historical OHLC, so chart history is
  // reconstructed deterministically and anchored to the live last price.
  // Live intraday motion comes from the real quote stream layered on top.
  async getCandles(symbol: string, timeframe: Timeframe): Promise<CandleSeries> {
    const [q] = await this.getQuotes([symbol]);
    const price = q?.price ?? 100;
    const prev = q?.previousClose ?? price;
    const nowSec = Math.floor(Date.now() / 1000);
    return {
      symbol: symbol.toUpperCase(),
      timeframe,
      interval: intervalFor(timeframe),
      candles: genCandles(symbol, price, prev, timeframe, nowSec),
    };
  }
}

function byymbolGet(map: Map<string, Quote>, symbol: string): Quote | undefined {
  return map.get(symbol);
}

function mapQuote(r: any): Quote {
  const q = r.quote ?? r;
  const close = r.close ?? {};
  const last = num(q.last_trade_price);
  const ext = num(q.last_non_reg_trade_price);
  const regTime = Date.parse(q.venue_last_trade_time ?? "") || 0;
  const extTime = Date.parse(q.venue_last_non_reg_trade_time ?? "") || 0;
  const extendedHours = extTime > regTime && ext > 0;
  const price = extendedHours ? ext : last || ext;
  const prevClose = num(q.adjusted_previous_close) || num(q.previous_close) || num(close.price);
  const change = price - prevClose;
  return {
    symbol: q.symbol,
    name: nameFor(q.symbol),
    price: round2(price),
    previousClose: round2(prevClose),
    bid: q.bid_price ? round2(num(q.bid_price)) : undefined,
    ask: q.ask_price ? round2(num(q.ask_price)) : undefined,
    change: round2(change),
    changePct: prevClose ? round2((change / prevClose) * 100) : 0,
    extendedHours,
    state: q.state === "active" ? "active" : "closed",
    updatedAt: Date.now(),
  };
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
