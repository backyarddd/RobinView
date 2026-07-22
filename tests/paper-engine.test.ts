import { describe, expect, it } from "vitest";
import { entryBlock, exitReason, RULES, type EtClock } from "../server/paper/engine";
import type { PaperState, PaperTrade } from "../shared/types";

const clock = (minutes: number, weekday = 2, day = "2026-07-21"): EtClock => ({ day, minutes, weekday });

const state = (over: Partial<PaperState> = {}): PaperState => ({
  seed: RULES.SEED,
  cash: RULES.SEED,
  realized: 0,
  open: null,
  trades: [],
  signals: [],
  equityHist: [],
  day: "2026-07-21",
  dayTrades: 0,
  dayPnl: 0,
  halted: null,
  updatedAt: 0,
  ...over,
});

const trade = (over: Partial<PaperTrade> = {}): PaperTrade => ({
  id: "t1",
  side: "call",
  strike: 630,
  expiry: "2026-07-21",
  contract: "SPY 630C 0DTE",
  qty: 2,
  entryPrice: 2.0,
  entryAt: 0,
  entrySpot: 630,
  thesis: "",
  confidence: 0.7,
  ...over,
});

describe("paper engine entry gates", () => {
  const goodSig = { direction: "call", confidence: 0.7 };
  const midday = clock(11 * 60);

  it("allows a confident directional signal in the window", () => {
    expect(entryBlock(state(), goodSig, midday)).toBeNull();
  });
  it("blocks 'none' direction", () => {
    expect(entryBlock(state(), { direction: "none", confidence: 0.9 }, midday)).toMatch(/no directional/);
  });
  it("blocks low confidence", () => {
    expect(entryBlock(state(), { direction: "put", confidence: 0.59 }, midday)).toMatch(/confidence/);
  });
  it("blocks weekends", () => {
    expect(entryBlock(state(), goodSig, clock(11 * 60, 6))).toMatch(/weekend/);
  });
  it("blocks before 9:45 and after 14:00 ET", () => {
    expect(entryBlock(state(), goodSig, clock(9 * 60 + 44))).toMatch(/entry window/);
    expect(entryBlock(state(), goodSig, clock(14 * 60))).toMatch(/entry window/);
    expect(entryBlock(state(), goodSig, clock(9 * 60 + 45))).toBeNull();
  });
  it("blocks when a position is open", () => {
    expect(entryBlock(state({ open: trade() }), goodSig, midday)).toMatch(/already open/);
  });
  it("blocks after the daily halt trips", () => {
    expect(entryBlock(state({ halted: "daily loss" }), goodSig, midday)).toMatch(/halted/);
  });
  it("blocks past the day-trade cap", () => {
    expect(entryBlock(state({ dayTrades: RULES.MAX_DAY_TRADES }), goodSig, midday)).toMatch(/trades\/day/);
  });
});

describe("paper engine exit rules", () => {
  const t = trade(); // entry 2.00
  const midday = clock(11 * 60);

  it("holds inside the band", () => {
    expect(exitReason(t, 2.5, midday)).toBeNull();
    expect(exitReason(t, 1.01, midday)).toBeNull();
  });
  it("stops out at -50% of premium", () => {
    expect(exitReason(t, 1.0, midday)).toBe("stop");
    expect(exitReason(t, 0.4, midday)).toBe("stop");
  });
  it("takes profit at +100%", () => {
    expect(exitReason(t, 4.0, midday)).toBe("target");
    expect(exitReason(t, 5.5, midday)).toBe("target");
  });
  it("force-closes at 15:45 ET regardless of price", () => {
    expect(exitReason(t, 2.0, clock(15 * 60 + 45))).toBe("eod");
  });
  it("expires when the trading day has passed the contract expiry", () => {
    expect(exitReason(t, 2.0, clock(10 * 60, 3, "2026-07-22"))).toBe("expired");
  });
});
