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

// Distill the paper book into a track record + lessons block so each research
// tick learns from what already worked and what did not.
function trackRecord(state) {
  const closed = (state?.trades ?? []).filter((t) => t.exitAt != null);
  if (!closed.length) return "";
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const total = closed.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const bySide = (side) => {
    const xs = closed.filter((t) => t.side === side);
    return xs.length ? `${side}s: ${xs.filter((t) => (t.pnl ?? 0) > 0).length}/${xs.length} won, net $${xs.reduce((a, t) => a + (t.pnl ?? 0), 0).toFixed(0)}` : `${side}s: none`;
  };
  const recent = closed.slice(0, 10).map((t) => {
    const line = `- ${t.side} ${t.strike} conf ${t.confidence} entered ${new Date(t.entryAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET, exit ${t.exitReason}, P&L $${t.pnl}`;
    return t.review ? `${line}\n  verdict: ${t.review.verdict}. lesson: ${t.review.lesson}` : line;
  });
  return `
YOUR TRACK RECORD SO FAR (paper): ${closed.length} closed, ${wins} wins, net $${total.toFixed(0)}. ${bySide("call")}. ${bySide("put")}.
Recent trades with post-mortem lessons:
${recent.join("\n")}

Apply these lessons. Do not repeat a documented mistake. If the record shows a setup keeps losing (e.g. chasing moves that already happened, trading chop), require visibly stronger evidence before signaling it again.`;
}

async function gatherContext() {
  const [quotes, candles, news, paper] = await Promise.all([
    get("/api/quotes?symbols=SPY,%5EVIX,QQQ,DIA"),
    get("/api/candles/SPY?timeframe=3M"),
    get("/api/news/SPY").catch(() => []),
    get("/api/paper/state").catch(() => null),
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
  // Daily-minimum mandate: final research window (>= 13:00 ET) with no trade
  // on the books today -> a direction is required, "none" not allowed.
  const et = new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" });
  const [h, m] = et.split(":").map(Number);
  const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const tradedToday = paper && paper.day === todayET && (paper.dayTrades > 0 || paper.open);
  const mustTrade = (h % 24) * 60 + m >= 13 * 60 && !tradedToday && !(paper?.halted);
  return { bySym, dailyLines, headlines, nowET, record: trackRecord(paper), mustTrade };
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
${ctx.record}

Rules for your answer:
- "call" = you expect SPY higher by ~15:45 ET; "put" = lower; "none" = no conviction either way.
- This is an AGGRESSIVE experiment designed to generate trades and test reasoning: when you see even a modest edge, take it (0.55+ confidence) rather than waiting for a perfect setup. But confidence must stay honest - it is how we will grade your calibration later. Do not inflate it to force a trade through.
- thesis: 2-3 sentences, the concrete reason.${ctx.mustTrade ? `
- MANDATE: no trade has happened today and this is the final window. "none" is NOT allowed - you MUST answer "call" or "put", whichever direction has the better expected value right now, even if the edge is thin. Report your honest (possibly low) confidence; the engine accepts it today.` : ""}

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
  let sig;
  try {
    sig = askClaude(buildPrompt(ctx));
  } catch (e) {
    console.error(`${stamp} first attempt failed (${e.message.slice(0, 120)}), retrying once`);
    await new Promise((r) => setTimeout(r, 15_000));
    sig = askClaude(buildPrompt(ctx));
  }
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
