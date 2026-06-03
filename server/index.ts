import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { WebSocketServer, WebSocket } from "ws";
import { createProvider, MockProvider } from "./provider/index.js";
import type { WsClientMessage, WsMessage } from "../shared/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.ROBINVIEW_API_PORT || 8787);
const provider = createProvider();
const app = express();
app.use(cors());
app.use(express.json());

const ok = <T>(res: express.Response, fn: () => Promise<T>) =>
  fn()
    .then((data) => res.json({ data }))
    .catch((err) => {
      console.error("[api]", err?.message || err);
      res.status(502).json({ error: String(err?.message || err) });
    });

app.get("/api/health", (_req, res) => res.json({ data: { mode: provider.mode, ok: true } }));
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
app.get("/api/search", (req, res) =>
  ok(res, () => provider.search(String(req.query.q || ""))),
);

// In production, serve the built frontend from the same process (single deploy).
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

wss.on("connection", async (ws) => {
  const accounts = await provider.getAccounts().catch(() => []);
  const account = accounts.find((a) => a.isDefault)?.accountNumber || accounts[0]?.accountNumber || "";
  const client: Client = { ws, symbols: new Set(), account };
  clients.add(client);
  send(ws, { type: "hello", mode: provider.mode, account, time: Date.now() });

  ws.on("message", (raw) => {
    let msg: WsClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === "subscribe") msg.symbols.forEach((s) => client.symbols.add(s.toUpperCase()));
    else if (msg.type === "unsubscribe")
      msg.symbols.forEach((s) => client.symbols.delete(s.toUpperCase()));
    else if (msg.type === "setAccount") client.account = msg.account;
  });

  ws.on("close", () => clients.delete(client));
  ws.on("error", () => clients.delete(client));
});

// Live tick loop: advance the simulator (demo) and broadcast quotes + portfolio.
const TICK_MS = Number(process.env.ROBINVIEW_TICK_MS || 1000);
let portfolioCounter = 0;

async function broadcast() {
  if (provider instanceof MockProvider) provider.tick();
  if (clients.size === 0) return;

  // Union of all subscribed symbols across clients (one upstream fetch).
  const allSymbols = new Set<string>();
  for (const c of clients) c.symbols.forEach((s) => allSymbols.add(s));

  let quoteMap = new Map<string, any>();
  if (allSymbols.size > 0) {
    try {
      const quotes = await provider.getQuotes([...allSymbols]);
      quoteMap = new Map(quotes.map((q) => [q.symbol, q]));
    } catch (e) {
      /* transient upstream error — skip this tick */
    }
  }

  portfolioCounter++;
  const pushPortfolio = portfolioCounter % 2 === 0; // every other tick

  for (const c of clients) {
    if (c.symbols.size > 0) {
      const quotes = [...c.symbols].map((s) => quoteMap.get(s)).filter(Boolean);
      if (quotes.length) send(c.ws, { type: "quotes", quotes });
    }
    if (pushPortfolio && c.account) {
      try {
        const [portfolio, positions] = await Promise.all([
          provider.getPortfolio(c.account),
          provider.getPositions(c.account),
        ]);
        send(c.ws, { type: "portfolio", portfolio });
        send(c.ws, { type: "positions", positions });
      } catch {
        /* skip */
      }
    }
  }
}

setInterval(() => {
  broadcast().catch((e) => console.error("[ws] broadcast", e?.message || e));
}, TICK_MS);

httpServer.listen(PORT, () => {
  console.log(
    `\n  ▲ RobinView API  ·  mode=${provider.mode}  ·  http://localhost:${PORT}  ·  ws://localhost:${PORT}/ws\n`,
  );
});
