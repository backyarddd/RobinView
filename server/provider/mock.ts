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
import { UNIVERSE, lookup, nameFor } from "./universe.js";
import { genCandles, intervalFor, rng, hashSymbol } from "./market.js";

interface LiveState {
  price: number;
  prevClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  drift: number;
  vol: number;
}

interface DemoHolding {
  symbol: string;
  quantity: number;
  avgCost: number;
}

// A believable demo portfolio (mirrors the real account's tickers, scaled to a
// more illustrative size). Avg costs sit below/above live so PnL shows both colors.
const DEMO_HOLDINGS: DemoHolding[] = [
  { symbol: "NVDA", quantity: 42.5, avgCost: 176.4 },
  { symbol: "AAPL", quantity: 18, avgCost: 244.1 },
  { symbol: "AMD", quantity: 31, avgCost: 162.8 },
  { symbol: "TSLA", quantity: 12, avgCost: 388.2 },
  { symbol: "MRVL", quantity: 60, avgCost: 118.5 },
  { symbol: "ALAB", quantity: 14, avgCost: 286.7 },
  { symbol: "MU", quantity: 9, avgCost: 271.4 },
  { symbol: "VOO", quantity: 8.2, avgCost: 648.9 },
  { symbol: "CRDO", quantity: 22, avgCost: 151.2 },
  { symbol: "SNDK", quantity: 3, avgCost: 360.1 },
];

const DEMO_CASH = 4187.55;
const DEMO_BUYING_POWER = 4187.55;

export class MockProvider implements DataProvider {
  readonly mode = "demo" as const;
  private state = new Map<string, LiveState>();
  private started = false;

  constructor() {
    for (const inst of UNIVERSE) {
      const r = rng(hashSymbol(inst.symbol));
      const prevClose = inst.price * (1 + (r() - 0.5) * 0.01);
      this.state.set(inst.symbol, {
        price: inst.price,
        prevClose,
        open: prevClose * (1 + (r() - 0.5) * 0.004),
        dayHigh: Math.max(inst.price, prevClose),
        dayLow: Math.min(inst.price, prevClose),
        volume: Math.round((2 + r() * 8) * 1_000_000),
        drift: (r() - 0.5) * 0.00002,
        vol: 0.0006 + r() * 0.0011,
      });
    }
  }

  // Advance every symbol one tick (called by the server on an interval).
  tick(): void {
    this.started = true;
    for (const s of this.state.values()) {
      const shock = gaussian() * s.vol;
      s.price = Math.max(0.01, s.price * (1 + s.drift + shock));
      s.dayHigh = Math.max(s.dayHigh, s.price);
      s.dayLow = Math.min(s.dayLow, s.price);
      s.volume += Math.round(Math.random() * 25_000);
    }
  }

  private quoteFor(symbol: string): Quote {
    const sym = symbol.toUpperCase();
    const s = this.state.get(sym);
    const inst = lookup(sym);
    const price = s?.price ?? inst?.price ?? 100;
    const prevClose = s?.prevClose ?? price;
    const change = price - prevClose;
    return {
      symbol: sym,
      name: nameFor(sym),
      price: round2(price),
      previousClose: round2(prevClose),
      open: s ? round2(s.open) : undefined,
      dayHigh: s ? round2(s.dayHigh) : undefined,
      dayLow: s ? round2(s.dayLow) : undefined,
      bid: round2(price - price * 0.0002),
      ask: round2(price + price * 0.0002),
      volume: s?.volume,
      change: round2(change),
      changePct: prevClose ? round2((change / prevClose) * 100) : 0,
      extendedHours: false,
      state: "active",
      updatedAt: Date.now(),
    };
  }

  async getAccounts(): Promise<Account[]> {
    return [
      {
        accountNumber: "DEMO-0001",
        type: "margin",
        brokerageAccountType: "individual",
        nickname: "Demo Brokerage",
        isDefault: true,
        agenticAllowed: false,
        optionLevel: "option_level_3",
      },
      {
        accountNumber: "DEMO-0002",
        type: "cash",
        brokerageAccountType: "ira_roth",
        nickname: "Demo Roth IRA",
        isDefault: false,
        agenticAllowed: false,
        optionLevel: "",
      },
    ];
  }

  async getPositions(_account: string): Promise<Position[]> {
    const positions = DEMO_HOLDINGS.map((h) => this.buildPosition(h));
    const total = positions.reduce((a, p) => a + p.marketValue, 0);
    for (const p of positions) p.portfolioWeight = total ? p.marketValue / total : 0;
    return positions.sort((a, b) => b.marketValue - a.marketValue);
  }

  private buildPosition(h: DemoHolding): Position {
    const q = this.quoteFor(h.symbol);
    const marketValue = q.price * h.quantity;
    const costBasis = h.avgCost * h.quantity;
    const dayChange = q.change * h.quantity;
    const openPnl = marketValue - costBasis;
    const inst = lookup(h.symbol);
    return {
      symbol: h.symbol,
      name: q.name,
      quantity: h.quantity,
      averageBuyPrice: h.avgCost,
      price: q.price,
      previousClose: q.previousClose,
      marketValue: round2(marketValue),
      costBasis: round2(costBasis),
      dayChange: round2(dayChange),
      dayChangePct: q.changePct,
      openPnl: round2(openPnl),
      openPnlPct: costBasis ? round2((openPnl / costBasis) * 100) : 0,
      portfolioWeight: 0,
      assetClass: (inst?.assetClass ?? "equity") as AssetClass,
    };
  }

  async getPortfolio(account: string): Promise<Portfolio> {
    const positions = await this.getPositions(account);
    const equityValue = positions.reduce((a, p) => a + p.marketValue, 0);
    const costBasis = positions.reduce((a, p) => a + p.costBasis, 0);
    const dayChange = positions.reduce((a, p) => a + p.dayChange, 0);
    const totalValue = equityValue + DEMO_CASH;
    const prevTotal = totalValue - dayChange;
    const totalChange = equityValue - costBasis;
    return {
      accountNumber: account,
      totalValue: round2(totalValue),
      equityValue: round2(equityValue),
      optionsValue: 0,
      cryptoValue: 0,
      cash: DEMO_CASH,
      buyingPower: DEMO_BUYING_POWER,
      pendingDeposits: 0,
      currency: "USD",
      dayChange: round2(dayChange),
      dayChangePct: prevTotal ? round2((dayChange / prevTotal) * 100) : 0,
      totalChange: round2(totalChange),
      totalChangePct: costBasis ? round2((totalChange / costBasis) * 100) : 0,
      costBasis: round2(costBasis),
    };
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return symbols.map((s) => this.quoteFor(s));
  }

  async getCandles(symbol: string, timeframe: Timeframe): Promise<CandleSeries> {
    const q = this.quoteFor(symbol);
    const nowSec = Math.floor(Date.now() / 1000);
    const candles = genCandles(symbol, q.price, q.previousClose, timeframe, nowSec);
    return { symbol: symbol.toUpperCase(), timeframe, interval: intervalFor(timeframe), candles };
  }

  async getOrders(_account: string): Promise<OrderRow[]> {
    const now = Date.now();
    const mk = (
      i: number,
      symbol: string,
      side: "buy" | "sell",
      type: OrderRow["type"],
      state: string,
      quantity: number,
      price: number,
      filled?: number,
    ): OrderRow => ({
      id: `demo-${i}`,
      symbol,
      side,
      type,
      state,
      quantity,
      price,
      averageFillPrice: filled,
      createdAt: now - i * 3_600_000 * 6,
      placedAgent: "user",
    });
    return [
      mk(1, "NVDA", "buy", "limit", "filled", 5, 220.0, 219.84),
      mk(2, "AAPL", "sell", "market", "filled", 3, 0, 314.9),
      mk(3, "TSLA", "buy", "limit", "confirmed", 2, 415.0),
      mk(4, "AMD", "buy", "limit", "filled", 10, 195.5, 195.12),
      mk(5, "MU", "buy", "stop_limit", "queued", 4, 250.0),
      mk(6, "PLTR", "sell", "limit", "cancelled", 8, 190.0),
    ];
  }

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return UNIVERSE.filter(
      (i) => i.symbol.includes(q) || i.name.toUpperCase().includes(q),
    )
      .slice(0, 12)
      .map((i) => ({ symbol: i.symbol, name: i.name, assetClass: i.assetClass }));
  }
}

let spare: number | null = null;
function gaussian(): number {
  if (spare !== null) {
    const s = spare;
    spare = null;
    return s;
  }
  let u = 0;
  let v = 0;
  let s = 0;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  const mul = Math.sqrt((-2 * Math.log(s)) / s);
  spare = v * mul;
  return u * mul;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
