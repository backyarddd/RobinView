import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { FileOAuthProvider } from "./oauth.js";
import { num, numU } from "./util.js";
import type {
  Account,
  OrderRow,
  OrderRequest,
  OrderReview,
  OrderResult,
} from "../../shared/types.js";

const DEFAULT_URL = process.env.ROBINHOOD_MCP_URL || "https://agent.robinhood.com/mcp/trading";

export interface RawHolding {
  symbol: string;
  quantity: number;
  averageBuyPrice: number;
}
export interface RawPortfolio {
  cash: number;
  buyingPower: number;
  pendingDeposits: number;
  equityValue: number;
  totalValue: number;
  optionsValue: number;
  cryptoValue: number;
  currency: string;
}

// Owns RobinView's OWN MCP connection to the Robinhood trading server, including
// the OAuth handshake. Nothing here depends on any other app's credentials -
// the user authorizes RobinView directly at agent.robinhood.com.
export class RobinhoodConnection {
  private auth: FileOAuthProvider;
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private _connected = false;
  private _connecting = false;
  private lastError: string | null = null;

  // Account data (accounts, holdings, balances) changes only when you trade, so
  // it is cached and refreshed slowly. Live valuation happens against the quote
  // stream - NOT by re-hitting the broker every tick. On a transient error we
  // serve the last good value instead of an empty flicker.
  private cache = new Map<string, { at: number; data: any }>();
  private inflight = new Map<string, Promise<any>>();
  private static TTL = { accounts: 60_000, holdings: 20_000, portfolio: 20_000, orders: 30_000 };

  constructor(redirectUri: string, private url: string = DEFAULT_URL) {
    this.auth = new FileOAuthProvider(redirectUri);
  }

  // Cached fetch with single-flight + last-good fallback.
  private async cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.data as T;
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;
    const p = (async () => {
      try {
        const data = await fetcher();
        this.cache.set(key, { at: Date.now(), data });
        return data;
      } catch (err) {
        if (hit) return hit.data as T; // serve stale rather than flicker
        throw err;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  /** Drop cached account data (e.g. after the user places a trade). */
  invalidateAccountCache() {
    this.cache.clear();
  }

  status() {
    return {
      connected: this._connected,
      connecting: this._connecting,
      hasSession: this.auth.hasTokens(),
      error: this.lastError,
    };
  }

  private newClient() {
    return new Client({ name: "RobinView", version: "0.1.0" }, { capabilities: {} });
  }

  // Attempt to (re)connect. Returns { connected } when tokens already exist, or
  // { authUrl } when the user must authorize in the browser.
  async connect(): Promise<{ connected: boolean; authUrl?: string }> {
    if (this._connected) return { connected: true };
    this._connecting = true;
    this.lastError = null;
    this.auth.resetAuthUrl();
    try {
      this.client = this.newClient();
      this.transport = new StreamableHTTPClientTransport(new URL(this.url), { authProvider: this.auth });
      await this.client.connect(this.transport);
      this._connected = true;
      this._connecting = false;
      return { connected: true };
    } catch (err: any) {
      // The SDK calls redirectToAuthorization before throwing when auth is needed.
      const authUrl = this.auth.getLastAuthUrl();
      if (authUrl) {
        this._connecting = false;
        return { connected: false, authUrl: authUrl.toString() };
      }
      this._connecting = false;
      this.lastError = String(err?.message || err);
      throw err;
    }
  }

  // Called by the OAuth redirect callback with the authorization code.
  async finishAuth(code: string): Promise<void> {
    this._connecting = true;
    try {
      if (!this.transport) {
        // cold callback (server restarted mid-flow) - re-create a transport to finish
        this.transport = new StreamableHTTPClientTransport(new URL(this.url), { authProvider: this.auth });
      } else {
        // Close any prior client bound to this transport before we reuse it for
        // the live session, so we don't leak a half-open SSE stream.
        try {
          await this.client?.close();
        } catch {
          /* ignore */
        }
        this.client = null;
      }
      await this.transport.finishAuth(code); // exchanges code -> tokens (persisted)
      // Reuse the SAME transport that completed the handshake for the live
      // session rather than building (and leaking) a second one.
      this.client = this.newClient();
      await this.client.connect(this.transport);
      this._connected = true;
      this.lastError = null;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client?.close();
    } catch {
      /* ignore */
    }
    try {
      await this.transport?.close();
    } catch {
      /* ignore */
    }
    this.client = null;
    this.transport = null;
    this._connected = false;
    this._connecting = false;
    this.lastError = null;
    this.auth.clearAll();
  }

  // Resume a prior session on boot (tokens on disk) without forcing the browser.
  async resume(): Promise<boolean> {
    if (!this.auth.hasTokens()) return false;
    try {
      const r = await this.connect();
      return r.connected;
    } catch {
      return false;
    }
  }

  private async call(name: string, args: Record<string, unknown> = {}): Promise<any> {
    if (!this._connected || !this.client) throw new Error("robinhood not connected");
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
    return this.cached("accounts", RobinhoodConnection.TTL.accounts, async () => {
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
    });
  }

  async getHoldings(account: string): Promise<RawHolding[]> {
    return this.cached(`holdings:${account}`, RobinhoodConnection.TTL.holdings, async () => {
      const data = await this.call("get_equity_positions", { account_number: account });
      return (data.positions ?? [])
        .map((p: any) => ({
          symbol: String(p.symbol).toUpperCase(),
          // numU returns undefined when quantity can't be parsed to a finite
          // number, so we can drop the row rather than fabricate a 0-share
          // position (which would understate the account and clutter the table).
          quantity: numU(p.quantity),
          averageBuyPrice: num(p.average_buy_price),
        }))
        .filter((h: { symbol: string; quantity?: number }) => h.symbol && (h.quantity ?? 0) > 0)
        .map((h: { symbol: string; quantity?: number; averageBuyPrice: number }) => ({
          symbol: h.symbol,
          quantity: h.quantity as number,
          averageBuyPrice: h.averageBuyPrice,
        }));
    });
  }

  async getPortfolio(account: string): Promise<RawPortfolio> {
    return this.cached(`portfolio:${account}`, RobinhoodConnection.TTL.portfolio, async () => {
      const d = await this.call("get_portfolio", { account_number: account });
      return {
        cash: num(d.cash),
        // Verified against the live get_portfolio MCP payload (2026-06-03):
        // buying_power is a nested object
        // { buying_power, unleveraged_buying_power, display_currency } and the
        // tool's own guide says to quote buying_power.buying_power as the
        // authoritative spendable figure. This is NOT inconsistent with
        // reviewOrder - review_equity_order is a different tool that returns no
        // buying_power field at all (see reviewOrder below).
        buyingPower: num(d.buying_power?.buying_power),
        pendingDeposits: num(d.pending_deposits),
        equityValue: num(d.equity_value),
        totalValue: num(d.total_value),
        optionsValue: num(d.options_value),
        cryptoValue: num(d.crypto_value),
        currency: d.currency ?? "USD",
      };
    });
  }

  async getOrders(account: string): Promise<OrderRow[]> {
    return this.cached(`orders:${account}`, RobinhoodConnection.TTL.orders, async () => {
      const data = await this.call("get_equity_orders", { account_number: account });
      return (data.orders ?? []).slice(0, 50).map((o: any) => ({
        id: o.id,
        symbol: o.symbol ?? "",
        side: o.side,
        type: o.type,
        state: o.state,
        quantity: num(o.quantity),
        price: o.price ? num(o.price) : undefined,
        averageFillPrice: o.average_price ? num(o.average_price) : undefined,
        createdAt: o.created_at ? Date.parse(o.created_at) : Date.now(),
        placedAgent: o.placed_agent,
      }));
    });
  }

  // ---- Order entry ----------------------------------------------------------
  // Map RobinView's camelCase OrderRequest onto the MCP tool's snake_case args.
  // Prices/quantities go over the wire as strings (the trading API's format).
  private orderArgs(account: string, req: OrderRequest): Record<string, unknown> {
    const a: Record<string, unknown> = {
      account_number: account,
      symbol: req.symbol.toUpperCase(),
      side: req.side,
      type: req.type,
      time_in_force: req.timeInForce ?? "gfd",
      market_hours: req.marketHours ?? "regular_hours",
    };
    if (req.dollarAmount != null) a.dollar_amount = req.dollarAmount.toFixed(2);
    else if (req.quantity != null) a.quantity = String(req.quantity);
    if (req.limitPrice != null) a.limit_price = req.limitPrice.toFixed(2);
    if (req.stopPrice != null) a.stop_price = req.stopPrice.toFixed(2);
    return a;
  }

  async reviewOrder(account: string, req: OrderRequest): Promise<OrderReview> {
    const d = await this.call("review_equity_order", this.orderArgs(account, req));
    // Real payload: { quote_data: {...}, order_checks: {alertType, ...} | [] }.
    const q = d.quote_data ?? d.quote ?? {};
    const estimatedPrice = num(q.last_trade_price ?? q.ask_price ?? q.last_non_reg_trade_price ?? q.price);
    const qty = req.quantity ?? (estimatedPrice && req.dollarAmount ? req.dollarAmount / estimatedPrice : undefined);
    const estimatedCost = estimatedPrice && qty ? estimatedPrice * qty : undefined;
    return {
      symbol: req.symbol.toUpperCase(),
      side: req.side,
      type: req.type,
      quantity: qty,
      estimatedPrice: estimatedPrice || undefined,
      estimatedCost,
      // Verified against the live review_equity_order MCP payload (2026-06-03,
      // agentic-enabled account 938...290): the response has NO buying_power
      // field at all - it carries quote_data + order_checks instead, and
      // buying-power shortfalls surface as the EQUITY_NOT_ENOUGH_BP check
      // (handled by humanizeChecks below). This is a DIFFERENT tool from
      // get_portfolio (which nests buying_power.buying_power), so the two were
      // never actually inconsistent. This scalar read is harmless defensive
      // code that simply resolves to undefined for the real payload.
      buyingPower: d.buying_power != null ? num(d.buying_power) : undefined,
      alerts: humanizeChecks(d.order_checks ?? d.alerts ?? d.warnings),
      raw: d,
    };
  }

  async placeOrder(account: string, req: OrderRequest): Promise<OrderResult> {
    const args = this.orderArgs(account, req);
    args.ref_id = randomUUID(); // idempotency key for this logical order
    const d = await this.call("place_equity_order", args);
    this.invalidateAccountCache(); // holdings/orders/portfolio just changed
    const order = d.order ?? d;
    return {
      ok: true,
      id: order?.id,
      state: order?.state,
      message: order?.state ? `Order ${order.state}` : "Order placed",
    };
  }

  async cancelOrder(account: string, orderId: string): Promise<OrderResult> {
    const d = await this.call("cancel_equity_order", { account_number: account, order_id: orderId });
    this.invalidateAccountCache();
    return { ok: true, id: orderId, state: d?.state ?? "cancelled", message: "Cancel requested" };
  }
}

// Friendly text for known pre-trade checks (the gateway uses SCREAMING_SNAKE
// alertType codes). Accepts a single check object, an array, or strings.
const CHECK_MESSAGES: Record<string, string> = {
  EQUITY_NOT_ENOUGH_BP: "Not enough buying power for this order.",
  PATTERN_DAY_TRADE: "This may flag a pattern day-trade restriction.",
  INSTRUMENT_HALTED: "Trading in this symbol is currently halted.",
  COLLARED: "Price is collared; the fill price may be protected/limited.",
  MARKET_CLOSED: "The market is closed for this session.",
  FRACTIONAL_NOT_ALLOWED: "Fractional shares aren't allowed for this order.",
};

function humanizeChecks(checks: unknown): string[] {
  const list = Array.isArray(checks)
    ? checks
    : checks && typeof checks === "object" && Object.keys(checks as object).length
      ? [checks]
      : [];
  return list.map((c: any) => humanizeCheck(c)).filter(Boolean);
}

function humanizeCheck(c: any): string {
  if (!c) return "";
  if (typeof c === "string") return c;
  const type: string = c.alertType ?? c.type ?? c.code ?? "";
  let msg = CHECK_MESSAGES[type] ?? c.message ?? c.detail ?? c.text ?? prettifyCode(type);
  // Add the buying-power shortfall when the gateway provides it.
  const dep = c.equityNotEnoughBpAlertDetails?.depositAmount?.amount;
  if (type === "EQUITY_NOT_ENOUGH_BP" && dep) msg = `Not enough buying power - about $${num(dep).toFixed(2)} short.`;
  return msg;
}

function prettifyCode(code: string): string {
  if (!code) return "";
  const s = code.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
