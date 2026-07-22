#!/usr/bin/env node
// Daily open-of-market forecast. Runs once shortly after 9:30 ET: Claude
// researches the tape and commits to an up-or-down call on SPY's full day
// (close vs previous close). The engine grades it after the close, building a
// measurable accuracy record. Separate from the 0DTE trade loop on purpose:
// this tests pure directional reasoning with no options mechanics.

import { execFileSync } from "node:child_process";

const API = process.env.ROBINVIEW_API || "http://localhost:8787";

async function get(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()).data;
}

function fmtQuote(q) {
  if (!q) return "unavailable";
  return `${q.price} (${q.changePct >= 0 ? "+" : ""}${q.changePct?.toFixed(2)}%, prev close ${q.previousClose})`;
}

function forecastRecord(state) {
  const done = (state?.forecasts ?? []).filter((f) => f.correct != null);
  if (!done.length) return "";
  const right = done.filter((f) => f.correct).length;
  const recent = done.slice(0, 10).map((f) => `- ${f.date}: called ${f.direction} conf ${f.confidence}, actual ${f.actual} -> ${f.correct ? "RIGHT" : "WRONG"}`);
  return `
YOUR FORECAST RECORD: ${right}/${done.length} correct.
${recent.join("\n")}
Calibrate against this record: if you keep being wrong in one direction or regime, adjust.`;
}

async function main() {
  const stamp = new Date().toISOString();
  const health = await get("/api/health").catch(() => null);
  if (!health?.ok) {
    console.log(`${stamp} forecast abort: API not healthy`);
    process.exit(1);
  }
  const [quotes, candles, news, paper] = await Promise.all([
    get("/api/quotes?symbols=SPY,%5EVIX,QQQ,DIA,ES%3DF"),
    get("/api/candles/SPY?timeframe=3M"),
    get("/api/news/SPY").catch(() => []),
    get("/api/paper/state").catch(() => null),
  ]);
  const bySym = Object.fromEntries(quotes.map((q) => [q.symbol, q]));
  const spy = bySym["SPY"];
  if (!spy) throw new Error("no SPY quote");
  const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if ((paper?.forecasts ?? []).some((f) => f.date === todayET)) {
    console.log(`${stamp} forecast already logged for ${todayET}`);
    return;
  }
  const daily = candles.candles.slice(-6)
    .map((c) => `${new Date(c.time * 1000).toISOString().slice(0, 10)}: close ${c.close} (${(((c.close - c.open) / c.open) * 100).toFixed(2)}%)`)
    .join("\n");
  const headlines = (news || []).slice(0, 8).map((n) => `- ${n.title}`).join("\n");

  const prompt = `You are logging a DAILY market forecast for a paper-trading research journal. The market just opened. Commit to one call: will SPY CLOSE today ABOVE its previous close (up) or BELOW it (down)?

Time: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET.
SPY at open: ${fmtQuote(spy)}
VIX: ${fmtQuote(bySym["^VIX"])}  QQQ: ${fmtQuote(bySym["QQQ"])}  DIA: ${fmtQuote(bySym["DIA"])}  ES futures: ${fmtQuote(bySym["ES=F"])}

Last sessions:
${daily}

Headlines:
${headlines || "(none)"}

Use WebSearch to check today's scheduled events (economic data, Fed speakers, major earnings) and overnight global-market and political news before deciding.
${forecastRecord(paper)}
Rules:
- You MUST answer "up" or "down" - no neutral option. This is a forced daily call to measure your directional accuracy over time.
- confidence 0..1, honest: 0.5 means coin-flip, do not inflate.
- thesis: 2-4 sentences with the concrete drivers behind the call.

Reply with ONLY a JSON object:
{"direction": "up" | "down", "confidence": 0.0, "thesis": "..."}`;

  let out;
  try {
    out = execFileSync("claude", ["-p", prompt, "--output-format", "json", "--model", "claude-sonnet-5", "--allowedTools", "WebSearch"], { encoding: "utf8", timeout: 5 * 60_000, maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    console.error(`${stamp} first attempt failed, retrying once`);
    await new Promise((r) => setTimeout(r, 15_000));
    out = execFileSync("claude", ["-p", prompt, "--output-format", "json", "--model", "claude-sonnet-5", "--allowedTools", "WebSearch"], { encoding: "utf8", timeout: 5 * 60_000, maxBuffer: 10 * 1024 * 1024 });
  }
  const text = String(JSON.parse(out).result ?? "");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON in reply: ${text.slice(0, 200)}`);
  const f = JSON.parse(m[0]);
  if (f.direction !== "up" && f.direction !== "down") throw new Error(`bad direction: ${f.direction}`);
  const res = await fetch(`${API}/api/paper/forecast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      direction: f.direction,
      confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.5)),
      thesis: String(f.thesis ?? "").slice(0, 2000),
      baseline: spy.previousClose,
      openSpot: spy.price,
    }),
  });
  const body = await res.json();
  console.log(`${stamp} forecast ${f.direction} conf=${f.confidence} baseline=${spy.previousClose} -> ${res.ok ? "logged" : JSON.stringify(body)}`);
  console.log(`  thesis: ${f.thesis}`);
}

main().catch((e) => {
  console.error(`${new Date().toISOString()} forecast failed: ${e.message}`);
  process.exit(1);
});
