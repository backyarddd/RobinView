#!/usr/bin/env node
// Post-trade review sweep for the paper 0DTE experiment. For every closed
// trade that has no review yet, reconstruct what SPY actually did between
// entry and exit, ask Claude to grade the thesis against reality, and attach
// the verdict + lesson to the trade. Lessons feed the next research tick.
//
// Run manually:  node scripts/paper-review.mjs
// Cron: scripts/paper-cron.sh runs this on every weekday tick.

import { execFileSync } from "node:child_process";

const API = process.env.ROBINVIEW_API || "http://localhost:8787";
const MAX_PER_RUN = 5;

async function get(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()).data;
}

const et = (ms) =>
  new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// SPY bars overlapping the trade's life, from the 1W intraday series (so
// trades reviewed the next morning still find their day's bars).
function pathDuring(candles, fromMs, toMs) {
  const pad = 30 * 60_000; // include a bar of context on each side
  return candles
    .filter((c) => c.time * 1000 >= fromMs - pad && c.time * 1000 <= toMs + pad)
    .map((c) => `${et(c.time * 1000)}: ${c.close}`)
    .join("\n");
}

function buildPrompt(t, path) {
  const ret = t.exitPrice != null ? (((t.exitPrice - t.entryPrice) / t.entryPrice) * 100).toFixed(0) : "?";
  return `You are reviewing a closed PAPER trade from an experimental 0DTE SPY loop. Be a harsh, honest trading coach: the goal is to learn what works, not to feel good.

THE TRADE
- ${t.side.toUpperCase()} ${t.strike} strike, same-day expiry, ${t.qty} contract(s)
- Entered ${et(t.entryAt)} ET at ${t.entryPrice} premium (SPY was ${t.entrySpot})
- Exited ${et(t.exitAt)} ET at ${t.exitPrice} premium (SPY was ${t.exitSpot ?? "?"})
- Exit reason: ${t.exitReason} (rules: stop = -50% premium, target = +100%, eod = forced flat 15:45 ET)
- P&L: $${t.pnl} (${ret}% on premium)
- Confidence at entry: ${t.confidence}

THE THESIS AT ENTRY
"${t.thesis}"

WHAT SPY ACTUALLY DID (closes during the trade)
${path || "(bar data unavailable)"}

Grade the thesis against reality. Was the direction call right or wrong? Was the sizing of conviction right? Did theta/spread eat a correct call? Was the entry time the problem? Was this outcome luck (good or bad) rather than skill?

Reply with ONLY a JSON object, no markdown fences:
{"verdict": "<one of: thesis_right, thesis_wrong, right_but_stopped, right_but_late, chop_no_edge, lucky_win, news_surprise>", "whatHappened": "2-3 sentences: prediction vs the actual path", "lesson": "one actionable sentence to apply to FUTURE entries"}`;
}

function askClaude(prompt) {
  const out = execFileSync(
    "claude",
    ["-p", prompt, "--output-format", "json", "--model", "claude-sonnet-5"],
    { encoding: "utf8", timeout: 3 * 60_000, maxBuffer: 10 * 1024 * 1024 },
  );
  const text = String(JSON.parse(out).result ?? "");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON in reply: ${text.slice(0, 200)}`);
  const r = JSON.parse(m[0]);
  if (!r.verdict || !r.whatHappened || !r.lesson) throw new Error("incomplete review");
  return r;
}

async function main() {
  const state = await get("/api/paper/state");
  const pending = state.trades.filter((t) => t.exitAt != null && !t.review).slice(0, MAX_PER_RUN);
  if (!pending.length) return; // quiet when there is nothing to do
  const series = await get("/api/candles/SPY?timeframe=1W").catch(() => null);
  for (const t of pending) {
    try {
      const path = series ? pathDuring(series.candles, t.entryAt, t.exitAt) : "";
      const review = askClaude(buildPrompt(t, path));
      const res = await fetch(`${API}/api/paper/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, ...review }),
      });
      if (!res.ok) throw new Error(`POST review ${res.status}`);
      console.log(`${new Date().toISOString()} reviewed ${t.contract} (${t.pnl >= 0 ? "+" : ""}${t.pnl}): ${review.verdict}`);
      console.log(`  lesson: ${review.lesson}`);
    } catch (e) {
      console.error(`${new Date().toISOString()} review failed for ${t.id}: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(`${new Date().toISOString()} review sweep failed: ${e.message}`);
  process.exit(1);
});
