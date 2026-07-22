#!/usr/bin/env node
// Research tick for the paper 0DTE experiment. Gathers live market context
// from the local RobinView API, asks Claude (headless CLI) for a directional
// thesis on SPY for the rest of the session, and posts the signal to the paper
// engine. The engine enforces every risk rule; this script only produces the
// opinion. NO REAL ORDERS - the paper engine simulates fills.
//
// Run manually:  node scripts/paper-research.mjs
// Cron wrapper:  scripts/paper-cron.sh (gates to ET market hours)

import { execFileSync } from "node:child_process";

const API = process.env.ROBINVIEW_API || "http://localhost:8787";

async function get(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()).data;
}

function fmtQuote(q) {
  if (!q) return "unavailable";
  return `${q.price} (${q.changePct >= 0 ? "+" : ""}${q.changePct?.toFixed(2)}% today, day range ${q.dayLow}-${q.dayHigh}, prev close ${q.previousClose})`;
}

async function gatherContext() {
  const [quotes, candles, news] = await Promise.all([
    get("/api/quotes?symbols=SPY,%5EVIX,QQQ,DIA"),
    get("/api/candles/SPY?timeframe=3M"),
    get("/api/news/SPY").catch(() => []),
  ]);
  const bySym = Object.fromEntries(quotes.map((q) => [q.symbol, q]));
  const daily = candles.candles.slice(-6);
  const dailyLines = daily
    .map((c) => `${new Date(c.time * 1000).toISOString().slice(0, 10)}: open ${c.open} close ${c.close} (${(((c.close - c.open) / c.open) * 100).toFixed(2)}%)`)
    .join("\n");
  const headlines = (news || [])
    .slice(0, 8)
    .map((n) => `- ${n.title}${n.summary ? ` :: ${String(n.summary).slice(0, 200)}` : ""}`)
    .join("\n");
  const nowET = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  return { bySym, dailyLines, headlines, nowET };
}

function buildPrompt(ctx) {
  return `You are the research brain of a PAPER-TRADING experiment (no real money). Decide a directional view on SPY for the REMAINDER of today's US session only.

Current time: ${ctx.nowET} ET.
SPY: ${fmtQuote(ctx.bySym["SPY"])}
VIX: ${fmtQuote(ctx.bySym["^VIX"])}
QQQ: ${fmtQuote(ctx.bySym["QQQ"])}   DIA: ${fmtQuote(ctx.bySym["DIA"])}

Recent SPY daily candles:
${ctx.dailyLines}

Latest headlines:
${ctx.headlines || "(none available)"}

You may use WebSearch to check for macro events, Fed speakers, or major breaking news happening today before deciding.

Rules for your answer:
- "call" = you expect SPY meaningfully higher by ~15:45 ET; "put" = meaningfully lower; "none" = no conviction either way. "none" is a respectable answer - most days have no exploitable intraday edge, and scheduled macro news is already priced in within seconds.
- confidence is 0..1 and must be honest: 0.6+ means you would genuinely bet on this. Do not inflate it.
- thesis: 2-3 sentences, the concrete reason.

Reply with ONLY a JSON object, no markdown fences, no other text:
{"direction": "call" | "put" | "none", "confidence": 0.0, "thesis": "..."}`;
}

function askClaude(prompt) {
  const out = execFileSync(
    "claude",
    // Pinned to a specific model so the experiment stays on one brain even if
    // the CLI default changes mid-run.
    ["-p", prompt, "--output-format", "json", "--model", "claude-sonnet-5", "--allowedTools", "WebSearch"],
    { encoding: "utf8", timeout: 5 * 60_000, maxBuffer: 10 * 1024 * 1024 },
  );
  const envelope = JSON.parse(out);
  const text = String(envelope.result ?? "");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON in Claude reply: ${text.slice(0, 200)}`);
  const sig = JSON.parse(m[0]);
  if (!["call", "put", "none"].includes(sig.direction)) throw new Error(`bad direction: ${sig.direction}`);
  sig.confidence = Math.max(0, Math.min(1, Number(sig.confidence) || 0));
  sig.thesis = String(sig.thesis ?? "").slice(0, 2000);
  return sig;
}

async function main() {
  const stamp = new Date().toISOString();
  const health = await get("/api/health").catch(() => null);
  if (!health?.ok) {
    console.log(`${stamp} abort: RobinView API not healthy at ${API}`);
    process.exit(1);
  }
  const ctx = await gatherContext();
  const sig = askClaude(buildPrompt(ctx));
  const res = await fetch(`${API}/api/paper/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sig),
  });
  const body = await res.json();
  const logged = body?.data ?? body;
  console.log(`${stamp} ${sig.direction} conf=${sig.confidence} -> ${logged.action ?? JSON.stringify(logged)}`);
  console.log(`  thesis: ${sig.thesis}`);
}

main().catch((e) => {
  console.error(`${new Date().toISOString()} research tick failed: ${e.message}`);
  process.exit(1);
});
