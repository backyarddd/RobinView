import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FileOAuthProvider } from "./oauth.js";
import { num } from "./util.js";
import type { Account, OrderRow } from "../../shared/types.js";

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
// the OAuth handshake. Nothing here depends on any other app's credentials —
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
  // stream — NOT by re-hitting the broker every tick. On a transient error we
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
    if (!this.transport) {
      // cold callback (server restarted mid-flow) — re-create a transport to finish
      this.transport = new StreamableHTTPClientTransport(new URL(this.url), { authProvider: this.auth });
    }
    await this.transport.finishAuth(code); // exchanges code -> tokens (persisted)
    // open a fresh session now that tokens exist
    this.client = this.newClient();
    this.transport = new StreamableHTTPClientTransport(new URL(this.url), { authProvider: this.auth });
    await this.client.connect(this.transport);
    this._connected = true;
    this._connecting = false;
    this.lastError = null;
  }

  async disconnect(): Promise<void> {
    try {
      await this.client?.close();
    } catch {
      /* ignore */
    }
    this.client = null;
    this.transport = null;
    this._connected = false;
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
      return (data.positions ?? []).map((p: any) => ({
        symbol: String(p.symbol).toUpperCase(),
        quantity: num(p.quantity),
        averageBuyPrice: num(p.average_buy_price),
      }));
    });
  }

  async getPortfolio(account: string): Promise<RawPortfolio> {
    return this.cached(`portfolio:${account}`, RobinhoodConnection.TTL.portfolio, async () => {
      const d = await this.call("get_portfolio", { account_number: account });
      return {
        cash: num(d.cash),
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
}
