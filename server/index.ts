import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { WebSocketServer, WebSocket } from "ws";
import { createProvider, MockProvider, LiveProvider } from "./provider/index.js";
import { fetchFundamentals } from "./provider/fundamentals.js";
import { fetchNews } from "./provider/news.js";
import { fetchScreener } from "./provider/screener.js";
import { checkForUpdate, applyUpdate } from "./provider/updates.js";
import { fetchSymbolDetail } from "./provider/detail.js";
import { fetchOptions } from "./provider/options.js";
import { resolveDomain } from "./provider/logo.js";
import { getState as getPaperState, onSignal as onPaperSignal, tick as paperTick, addReview as addPaperReview, startPaperLoop } from "./paper/engine.js";
import type { WsClientMessage, WsMessage } from "../shared/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.ROBINVIEW_API_PORT || 8787);
const PUBLIC_URL = process.env.ROBINVIEW_PUBLIC_URL || `http://localhost:${PORT}`;
const REDIRECT_URI = `${PUBLIC_URL}/api/robinhood/callback`;

const provider = createProvider(REDIRECT_URI);
const live = provider instanceof LiveProvider ? provider : null;

// Last-resort safety net: a stray rejection in the tick loop or a route handler
// must never take the whole server down. Log and keep serving.
process.on("unhandledRejection", (reason: any) => {
  console.error("[unhandledRejection]", reason?.message || reason);
});
process.on("uncaughtException", (err: any) => {
  console.error("[uncaughtException]", err?.message || err);
});

const app = express();
app.use(cors());
app.use(express.json());

// Map an error to an HTTP status: known client/validation/not-connected errors
// (those carrying a numeric `.status`) get a 4xx; everything else is treated as a
// genuine upstream failure (502). The JSON body shape ({error}) is unchanged.
const statusForError = (err: any): number => {
  const s = Number(err?.status);
  return Number.isInteger(s) && s >= 400 && s < 500 ? s : 502;
};

const ok = <T>(res: express.Response, fn: () => Promise<T>) =>
  fn()
    .then((data) => res.json({ data }))
    .catch((err) => {
      console.error("[api]", err?.message || err);
      res.status(statusForError(err)).json({ error: String(err?.message || err) });
    });

app.get("/api/health", (_req, res) =>
  res.json({ data: { mode: provider.mode, ok: true, robinhood: !!live } }),
);
app.get("/api/accounts", (_req, res) => ok(res, () => provider.getAccounts()));
app.get("/api/portfolio/:account", (req, res) =>
  ok(res, () => provider.getPortfolio(req.params.account)),
);
app.get("/api/positions/:account", (req, res) =>
  ok(res, () => provider.getPositions(req.params.account)),
);
app.get("/api/orders/:account", (req, res) =>
  ok(res, () => provider.getOrders(req.params.account)),
);
// Order entry: review simulates, place commits real money, cancel cancels by id.
app.post("/api/orders/:account/review", (req, res) =>
  ok(res, () => provider.reviewOrder(req.params.account, req.body)),
);
app.post("/api/orders/:account/place", (req, res) =>
  ok(res, () => provider.placeOrder(req.params.account, req.body)),
);
app.post("/api/orders/:account/cancel", (req, res) =>
  ok(res, () => provider.cancelOrder(req.params.account, String(req.body?.orderId || ""))),
);
app.get("/api/quotes", (req, res) => {
  const symbols = String(req.query.symbols || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  ok(res, () => provider.getQuotes(symbols));
});
app.get("/api/candles/:symbol", (req, res) => {
  const tf = (req.query.tf as any) || "1D";
  ok(res, () => provider.getCandles(req.params.symbol, tf));
});
app.get("/api/search", (req, res) => ok(res, () => provider.search(String(req.query.q || ""))));

// ── Free keyless market data (Yahoo Finance) ───────────────────────────────
app.get("/api/fundamentals/:symbol", (req, res) =>
  ok(res, () => fetchFundamentals(req.params.symbol)),
);
app.get("/api/news/:symbol", (req, res) => ok(res, () => fetchNews(req.params.symbol)));
app.get("/api/symbol/:symbol", (req, res) => ok(res, () => fetchSymbolDetail(req.params.symbol)));
app.get("/api/options/:symbol", (req, res) => ok(res, () => fetchOptions(req.params.symbol)));
app.get("/api/screener", (req, res) =>
  ok(res, () => fetchScreener(String(req.query.preset || "day_gainers"))),
);

// Company logo: resolve the ticker to a domain, then 302 to a logo service.
// `?fallback=fav` switches from Clearbit (full logo) to a Google favicon, which
// the client uses as a second attempt before falling back to a letter badge.
app.get("/api/logo/:symbol", (req, res) => {
  resolveDomain(req.params.symbol)
    .then((domain) => {
      if (!domain) return res.status(404).end();
      const url =
        req.query.fallback === "fav"
          ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
          : `https://logo.clearbit.com/${domain}`;
      res.redirect(302, url);
    })
    .catch(() => res.status(404).end());
});

// ── Paper 0DTE experiment (simulated fills only; never places real orders) ──
app.get("/api/paper/state", (_req, res) => ok(res, async () => getPaperState()));
app.post("/api/paper/signal", (req, res) =>
  ok(res, () => {
    const { direction, confidence, thesis } = req.body ?? {};
    if (!["call", "put", "none"].includes(direction)) throw new Error("direction must be call|put|none");
    const conf = Number(confidence);
    if (!Number.isFinite(conf) || conf < 0 || conf > 1) throw new Error("confidence must be 0..1");
    return onPaperSignal(direction, conf, String(thesis ?? "").slice(0, 2000));
  }),
);
app.post("/api/paper/tick", (_req, res) => ok(res, () => paperTick().then(() => getPaperState())));
app.post("/api/paper/review", (req, res) =>
  ok(res, async () => {
    const { id, verdict, whatHappened, lesson } = req.body ?? {};
    if (!id || !verdict || !whatHappened || !lesson) throw new Error("id, verdict, whatHappened, lesson required");
    if (!addPaperReview(String(id), { verdict, whatHappened, lesson })) throw new Error("trade not found");
    return { ok: true };
  }),
);

// ── Self-update (checks / applies the latest from the GitHub repo) ──────────
app.get("/api/version", (req, res) =>
  ok(res, () => checkForUpdate(req.query.force === "1")),
);
app.post("/api/update", (_req, res) => ok(res, () => applyUpdate()));

// ── Robinhood MCP connection (OAuth) ───────────────────────────────────────
const rhUnavailable = { connected: false, connecting: false, hasSession: false, error: null, available: false };

app.get("/api/robinhood/status", (_req, res) =>
  res.json({ data: live ? { ...live.robinhoodStatus(), available: true } : rhUnavailable }),
);
app.post("/api/robinhood/connect", (_req, res) => {
  if (!live) return res.json({ data: { connected: false } });
  live
    .connectRobinhood()
    .then((r) => res.json({ data: r }))
    .catch((e) => res.status(502).json({ error: String(e?.message || e) }));
});
app.get("/api/robinhood/callback", (req, res) => {
  const code = String(req.query.code || "");
  if (!live || !code) return res.status(400).send(authPage("Missing authorization code.", false));
  live
    .finishRobinhood(code)
    .then(() => res.send(authPage("RobinView is now connected to Robinhood. You can close this window.", true)))
    .catch((e) => res.status(502).send(authPage("Authorization failed: " + String(e?.message || e), false)));
});
app.post("/api/robinhood/disconnect", (_req, res) => {
  if (!live) return res.json({ data: { ok: true } });
  live.disconnectRobinhood().then(() => res.json({ data: { ok: true } })).catch(() => res.json({ data: { ok: true } }));
});

function authPage(message: string, success: boolean): string {
  return `<!doctype html><meta charset="utf-8"><title>RobinView · Robinhood</title>
<style>html,body{height:100%;margin:0}body{background:#0a0c0b;color:#eef2ee;font-family:-apple-system,Segoe UI,sans-serif;display:grid;place-items:center}
.card{max-width:420px;text-align:center;padding:34px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:#0f1311}
.dot{width:46px;height:46px;border-radius:50%;margin:0 auto 18px;background:${success ? "#34e29b" : "#ff6a57"};box-shadow:0 0 26px ${success ? "rgba(52,226,155,.4)" : "rgba(255,106,87,.4)"}}
h1{font-size:18px;margin:0 0 8px}p{color:#9aa39c;font-size:14px;line-height:1.5}</style>
<div class="card"><div class="dot"></div><h1>${success ? "Connected" : "Connection issue"}</h1><p>${message}</p></div>
<script>try{window.opener&&window.opener.postMessage('robinview:robinhood:${success ? "connected" : "error"}','*')}catch(e){}
${success ? "setTimeout(function(){window.close()},1600);" : ""}</script>`;
}

// ── Production: serve the built frontend from this process ──────────────────
const distDir = join(__dirname, "..", "dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api|\/ws).*/, (_req, res) => res.sendFile(join(distDir, "index.html")));
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

interface Client {
  ws: WebSocket;
  symbols: Set<string>;
  account: string;
}
const clients = new Set<Client>();

function send(ws: WebSocket, msg: WsMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function rhStatusMsg(): WsMessage {
  const s = live?.robinhoodStatus();
  return { type: "rhstatus", connected: !!s?.connected, hasSession: !!s?.hasSession, available: !!live };
}

wss.on("connection", async (ws) => {
  const accounts = await provider.getAccounts().catch(() => []);
  const account = accounts.find((a) => a.isDefault)?.accountNumber || accounts[0]?.accountNumber || "";
  const client: Client = { ws, symbols: new Set(), account };
  clients.add(client);
  send(ws, { type: "hello", mode: provider.mode, account, time: Date.now() });
  send(ws, rhStatusMsg());

  ws.on("message", (raw) => {
    let msg: WsClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    // The client sends its full symbol union on every subscribe, so REPLACE the
    // set rather than union into it (which would grow unbounded over a session).
    if (msg.type === "subscribe") client.symbols = new Set(msg.symbols.map((s) => s.toUpperCase()));
    else if (msg.type === "unsubscribe") msg.symbols.forEach((s) => client.symbols.delete(s.toUpperCase()));
    else if (msg.type === "setAccount") client.account = msg.account;
  });

  ws.on("close", () => clients.delete(client));
  ws.on("error", () => clients.delete(client));
});

// Live tick loop: broadcast real quotes + (when connected) live-revalued portfolio.
const TICK_MS = Number(process.env.ROBINVIEW_TICK_MS || 1000);
let counter = 0;
let lastRhConnected = false;

async function broadcast() {
  if (provider instanceof MockProvider) provider.tick();
  if (clients.size === 0) return;

  const allSymbols = new Set<string>();
  for (const c of clients) c.symbols.forEach((s) => allSymbols.add(s));

  let quoteMap = new Map<string, any>();
  if (allSymbols.size > 0) {
    try {
      const quotes = await provider.getQuotes([...allSymbols]);
      quoteMap = new Map(quotes.map((q) => [q.symbol, q]));
    } catch {
      /* transient upstream error - skip quotes this tick */
    }
  }

  counter++;
  const pushPortfolio = counter % 2 === 0;
  // Notify clients when the Robinhood connection state flips.
  const rhConnected = !!live?.robinhoodStatus().connected;
  const rhFlipped = rhConnected !== lastRhConnected;
  lastRhConnected = rhConnected;
  // Account data is available in demo mode (simulated) or once Robinhood connects.
  const accountLive = provider instanceof MockProvider || rhConnected;

  for (const c of clients) {
    if (rhFlipped) send(c.ws, rhStatusMsg());
    if (c.symbols.size > 0) {
      const quotes = [...c.symbols].map((s) => quoteMap.get(s)).filter(Boolean);
      if (quotes.length) send(c.ws, { type: "quotes", quotes });
    }
    if (pushPortfolio && c.account && accountLive) {
      try {
        // Compute positions once, then derive the portfolio from them (avoids a
        // second positions pass inside getPortfolio).
        const positions = await provider.getPositions(c.account);
        const portfolio = await provider.getPortfolio(c.account, positions);
        if (portfolio) send(c.ws, { type: "portfolio", portfolio });
        send(c.ws, { type: "positions", positions });
      } catch {
        /* skip */
      }
    }
  }
}

// Self-scheduling loop with a re-entrancy guard: a slow tick can never overlap
// with the next one. The next tick is scheduled in finally, so an error in the
// body can't stall the loop.
let broadcasting = false;
function scheduleBroadcast() {
  setTimeout(async () => {
    if (broadcasting) {
      scheduleBroadcast();
      return;
    }
    broadcasting = true;
    try {
      await broadcast();
    } catch (e: any) {
      console.error("[ws] broadcast", e?.message || e);
    } finally {
      broadcasting = false;
      scheduleBroadcast();
    }
  }, TICK_MS);
}
scheduleBroadcast();

httpServer.listen(PORT, async () => {
  console.log(
    `\n  ▲ RobinView API  ·  mode=${provider.mode}  ·  http://localhost:${PORT}  ·  ws://localhost:${PORT}/ws`,
  );
  if (live) {
    const resumed = await live.resumeRobinhood().catch(() => false);
    console.log(`  ● Robinhood: ${resumed ? "session resumed" : "not connected (connect in the app)"}\n`);
  }
  startPaperLoop();
});
