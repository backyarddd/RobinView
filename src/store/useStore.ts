import { create } from "zustand";
import type {
  Account,
  Portfolio,
  Position,
  Quote,
  OrderRow,
  WsMessage,
} from "@shared/types";
import { api } from "../lib/api";

export interface Alert {
  id: string;
  symbol: string;
  direction: "above" | "below";
  price: number;
  createdAt: number;
  triggered?: number;
}

export interface PriceHistoryPoint {
  t: number;
  v: number;
}

export interface WatchlistGroup {
  id: string;
  name: string;
  symbols: string[];
}

interface StoreState {
  mode: "live" | "demo" | "connecting";
  connected: boolean;
  robinhood: { connected: boolean; hasSession: boolean; available: boolean };
  connectingRobinhood: boolean;
  accounts: Account[];
  account: string;
  portfolio: Portfolio | null;
  positions: Position[];
  orders: OrderRow[];
  quotes: Record<string, Quote>;
  prevPrice: Record<string, number>;
  watchlist: string[]; // mirror of the active list's symbols (read-only convenience)
  watchlists: WatchlistGroup[];
  activeListId: string;
  alerts: Alert[];
  selected: string;
  // small in-memory equity-curve trail for the sparkline header
  equityTrail: PriceHistoryPoint[];

  init: () => Promise<void>;
  setAccount: (account: string) => Promise<void>;
  select: (symbol: string) => void;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  createWatchlist: (name: string) => void;
  renameWatchlist: (id: string, name: string) => void;
  deleteWatchlist: (id: string) => void;
  setActiveWatchlist: (id: string) => void;
  addAlert: (a: Omit<Alert, "id" | "createdAt">) => void;
  removeAlert: (id: string) => void;
  connectRobinhood: () => Promise<void>;
  disconnectRobinhood: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  _ingest: (msg: WsMessage) => void;
}

const WATCHLIST_KEY = "robinview.watchlist"; // legacy single list (migrated)
const WATCHLISTS_KEY = "robinview.watchlists.v2";
const ALERTS_KEY = "robinview.alerts";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Normalize an RhStatus-shaped object into the store's robinhood slice.
function rhFrom(s: { connected: boolean; hasSession: boolean; available?: boolean }) {
  return { connected: s.connected, hasSession: s.hasSession, available: !!s.available };
}

// Load watchlist groups, migrating a legacy single list if present.
function loadWatchlists(): { lists: WatchlistGroup[]; activeId: string } {
  const saved = load<{ lists: WatchlistGroup[]; activeId: string } | null>(WATCHLISTS_KEY, null);
  if (saved && saved.lists?.length) return saved;
  const legacy = load<string[]>(WATCHLIST_KEY, ["NVDA", "AAPL", "TSLA", "MSFT", "AMD", "SPY", "BTC-USD"]);
  const lists: WatchlistGroup[] = [{ id: crypto.randomUUID(), name: "My List", symbols: legacy }];
  return { lists, activeId: lists[0].id };
}

function persistLists(lists: WatchlistGroup[], activeId: string) {
  localStorage.setItem(WATCHLISTS_KEY, JSON.stringify({ lists, activeId }));
}

// Single place that updates the lists, the active id, the `watchlist` mirror,
// and persistence together — so no action can desync them.
function commitLists(
  set: (p: Partial<StoreState>) => void,
  lists: WatchlistGroup[],
  activeId: string,
) {
  const active = lists.find((l) => l.id === activeId);
  set({ watchlists: lists, activeListId: activeId, watchlist: active?.symbols ?? [] });
  persistLists(lists, activeId);
}

const _wl = loadWatchlists();

let ws: WebSocket | null = null;

export const useStore = create<StoreState>((set, get) => ({
  mode: "connecting",
  connected: false,
  robinhood: { connected: false, hasSession: false, available: false },
  connectingRobinhood: false,
  accounts: [],
  account: "",
  portfolio: null,
  positions: [],
  orders: [],
  quotes: {},
  prevPrice: {},
  watchlists: _wl.lists,
  activeListId: _wl.activeId,
  watchlist: _wl.lists.find((l) => l.id === _wl.activeId)?.symbols ?? _wl.lists[0]?.symbols ?? [],
  alerts: load<Alert[]>(ALERTS_KEY, []),
  selected: "NVDA",
  equityTrail: [],

  init: async () => {
    const health = await api.health().catch(() => ({ mode: "live" as const, ok: false, robinhood: false }));
    const status = await api.robinhood.status().catch(() => null);
    set({
      mode: health.mode,
      robinhood: status ? rhFrom(status) : { connected: false, hasSession: false, available: false },
    });
    // Demo mode has simulated accounts; live mode loads them once connected.
    if (health.mode === "demo" || status?.connected) await get().refreshAccount();

    // The OAuth popup posts back here when the user finishes authorizing.
    if (!(window as any).__rvAuthListener) {
      (window as any).__rvAuthListener = true;
      window.addEventListener("message", (e) => {
        if (e.data === "robinview:robinhood:connected") {
          api.robinhood.status().then((s) => {
            set({ robinhood: rhFrom(s), connectingRobinhood: false });
            if (s.connected) get().refreshAccount();
          });
        }
      });
    }
    connect(set, get);
  },

  connectRobinhood: async () => {
    set({ connectingRobinhood: true });
    try {
      const r = await api.robinhood.connect();
      if (r.authUrl) {
        window.open(r.authUrl, "robinhood-auth", "width=520,height=720");
        // Fallback: poll status in case the popup can't postMessage back.
        let tries = 0;
        const poll = setInterval(async () => {
          tries++;
          const s = await api.robinhood.status().catch(() => null);
          if (s?.connected) {
            clearInterval(poll);
            set({ robinhood: rhFrom(s), connectingRobinhood: false });
            await get().refreshAccount();
          } else if (tries > 150) {
            clearInterval(poll);
            set({ connectingRobinhood: false });
          }
        }, 2000);
      } else if (r.connected) {
        const s = await api.robinhood.status();
        set({ robinhood: rhFrom(s), connectingRobinhood: false });
        await get().refreshAccount();
      } else {
        set({ connectingRobinhood: false });
      }
    } catch {
      set({ connectingRobinhood: false });
    }
  },

  disconnectRobinhood: async () => {
    await api.robinhood.disconnect().catch(() => {});
    set({
      robinhood: { connected: false, hasSession: false, available: true },
      accounts: [],
      account: "",
      portfolio: null,
      positions: [],
      orders: [],
      equityTrail: [],
    });
  },

  refreshAccount: async () => {
    const accounts = await api.accounts().catch(() => [] as Account[]);
    // Keep the existing account list if a refresh transiently returns nothing.
    const accts = accounts.length ? accounts : get().accounts;
    const current = get().account;
    const account =
      (current && accts.find((a) => a.accountNumber === current)?.accountNumber) ||
      accts.find((a) => a.isDefault)?.accountNumber ||
      accts[0]?.accountNumber ||
      "";
    set({ accounts: accts, account });
    if (ws && ws.readyState === WebSocket.OPEN && account)
      ws.send(JSON.stringify({ type: "setAccount", account }));
    if (account) {
      const [portfolio, positions, orders] = await Promise.all([
        api.portfolio(account).catch(() => get().portfolio),
        api.positions(account).catch(() => get().positions),
        api.orders(account).catch(() => get().orders),
      ]);
      set({
        portfolio: portfolio ?? get().portfolio,
        positions: positions.length ? positions : get().positions,
        orders: orders.length ? orders : get().orders,
      });
      subscribeAll(get);
    }
  },

  setAccount: async (account: string) => {
    set({ account, portfolio: null, positions: [] });
    if (ws && ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "setAccount", account }));
    const [portfolio, positions, orders] = await Promise.all([
      api.portfolio(account).catch(() => null),
      api.positions(account).catch(() => []),
      api.orders(account).catch(() => []),
    ]);
    set({ portfolio, positions, orders });
  },

  select: (symbol) => {
    set({ selected: symbol.toUpperCase() });
    subscribeAll(get);
  },

  addToWatchlist: (symbol) => {
    const s = symbol.toUpperCase();
    const { watchlists, activeListId } = get();
    const lists = watchlists.map((l) =>
      l.id === activeListId && !l.symbols.includes(s) ? { ...l, symbols: [s, ...l.symbols] } : l,
    );
    commitLists(set, lists, activeListId);
    subscribeAll(get);
  },

  removeFromWatchlist: (symbol) => {
    const s = symbol.toUpperCase();
    const { watchlists, activeListId } = get();
    const lists = watchlists.map((l) =>
      l.id === activeListId ? { ...l, symbols: l.symbols.filter((x) => x !== s) } : l,
    );
    commitLists(set, lists, activeListId);
  },

  createWatchlist: (name) => {
    const list: WatchlistGroup = { id: crypto.randomUUID(), name: name.trim() || "New List", symbols: [] };
    commitLists(set, [...get().watchlists, list], list.id);
    subscribeAll(get);
  },

  renameWatchlist: (id, name) => {
    const lists = get().watchlists.map((l) => (l.id === id ? { ...l, name: name.trim() || l.name } : l));
    commitLists(set, lists, get().activeListId);
  },

  deleteWatchlist: (id) => {
    let lists = get().watchlists.filter((l) => l.id !== id);
    if (lists.length === 0) lists = [{ id: crypto.randomUUID(), name: "My List", symbols: [] }];
    const activeListId = get().activeListId === id ? lists[0].id : get().activeListId;
    commitLists(set, lists, activeListId);
    subscribeAll(get);
  },

  setActiveWatchlist: (id) => {
    if (!get().watchlists.some((l) => l.id === id)) return;
    commitLists(set, get().watchlists, id);
    subscribeAll(get);
  },

  addAlert: (a) => {
    const alert: Alert = { ...a, id: crypto.randomUUID(), createdAt: Date.now() };
    const alerts = [alert, ...get().alerts];
    set({ alerts });
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
    subscribeAll(get);
  },

  removeAlert: (id) => {
    const alerts = get().alerts.filter((a) => a.id !== id);
    set({ alerts });
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  },

  _ingest: (msg) => {
    if (msg.type === "quotes") {
      const quotes = { ...get().quotes };
      const prevPrice = { ...get().prevPrice };
      for (const q of msg.quotes) {
        const old = quotes[q.symbol];
        if (old) prevPrice[q.symbol] = old.price;
        quotes[q.symbol] = q;
      }
      set({ quotes, prevPrice });
      checkAlerts(get, set);
    } else if (msg.type === "portfolio") {
      const trail = [...get().equityTrail, { t: Date.now(), v: msg.portfolio.totalValue }].slice(-120);
      set({ portfolio: msg.portfolio, equityTrail: trail });
    } else if (msg.type === "positions") {
      // Ignore a transient empty push while we still hold positions (avoids flicker).
      if (msg.positions.length === 0 && get().positions.length > 0) return;
      set({ positions: msg.positions });
    } else if (msg.type === "hello") {
      set({ mode: msg.mode, connected: true });
    } else if (msg.type === "rhstatus") {
      const prev = get().robinhood;
      set({ robinhood: rhFrom(msg) });
      if (msg.connected && !prev.connected) get().refreshAccount();
      if (!msg.connected && prev.connected)
        set({ accounts: [], account: "", portfolio: null, positions: [], orders: [], equityTrail: [] });
    }
  },
}));

function connect(set: any, get: () => StoreState) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    set({ connected: true });
    subscribeAll(get);
  };
  ws.onmessage = (e) => {
    try {
      get()._ingest(JSON.parse(e.data) as WsMessage);
    } catch {
      /* ignore */
    }
  };
  ws.onclose = () => {
    set({ connected: false });
    setTimeout(() => connect(set, get), 1500);
  };
  ws.onerror = () => ws?.close();
}

// Subscribe to the union of: selected symbol, watchlist, positions, alerts.
function subscribeAll(get: () => StoreState) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const s = get();
  const symbols = new Set<string>([s.selected, ...s.watchlist]);
  s.positions.forEach((p) => symbols.add(p.symbol));
  s.alerts.forEach((a) => symbols.add(a.symbol));
  ws.send(JSON.stringify({ type: "subscribe", symbols: [...symbols] }));
}

function checkAlerts(get: () => StoreState, set: any) {
  const { alerts, quotes } = get();
  let changed = false;
  const next = alerts.map((a) => {
    if (a.triggered) return a;
    const q = quotes[a.symbol];
    if (!q) return a;
    const hit = a.direction === "above" ? q.price >= a.price : q.price <= a.price;
    if (hit) {
      changed = true;
      notify(`${a.symbol} ${a.direction} $${a.price.toFixed(2)}`, `Now $${q.price.toFixed(2)}`);
      return { ...a, triggered: Date.now() };
    }
    return a;
  });
  if (changed) {
    set({ alerts: next });
    localStorage.setItem(ALERTS_KEY, JSON.stringify(next));
  }
}

function notify(title: string, body: string) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}
