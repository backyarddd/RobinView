import { describe, it, expect } from "vitest";
import {
  stochastic,
  atr,
  obv,
  williamsR,
  roc,
  psar,
  heikinAshi,
} from "../src/lib/indicators";
import type { Candle } from "../shared/types";

// Deterministic candle fixtures ---------------------------------------------

// A monotonically rising series: each bar's OHLC steps up by 1.
function risingCandles(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    time: i,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 1000,
  }));
}

// Build candles from an explicit list of closes; high/low bracket the close.
function candlesFromCloses(closes: number[], volume = 1000): Candle[] {
  return closes.map((close, i) => ({
    time: i,
    open: i === 0 ? close : closes[i - 1],
    high: close + 1,
    low: close - 1,
    close,
    volume,
  }));
}

describe("stochastic", () => {
  it("keeps %K within [0,100] and aligns to candle length", () => {
    const candles = candlesFromCloses([
      10, 12, 11, 13, 14, 13, 15, 16, 14, 17, 18, 16, 19, 20, 21, 19, 22, 23,
    ]);
    const { k, d } = stochastic(candles, 14, 3, 3);
    expect(k.length).toBe(candles.length);
    expect(d.length).toBe(candles.length);
    for (const v of k) {
      if (!Number.isNaN(v)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("trends high (%K) on a monotonically rising series", () => {
    const candles = risingCandles(40);
    const { k } = stochastic(candles, 14, 3, 3);
    const last = k[k.length - 1];
    expect(Number.isNaN(last)).toBe(false);
    // Close sits at the very top of the lookback window → %K near 100.
    expect(last).toBeGreaterThan(90);
  });
});

describe("atr", () => {
  it("produces positive values once seeded and matches length", () => {
    const candles = candlesFromCloses([
      10, 11, 12, 13, 12, 14, 15, 13, 16, 17, 15, 18, 19, 17, 20, 21,
    ]);
    const out = atr(candles, 14);
    expect(out.length).toBe(candles.length);
    const last = out[out.length - 1];
    expect(Number.isNaN(last)).toBe(false);
    expect(last).toBeGreaterThan(0);
  });

  it("pads NaN before the period and seeds at index period-1", () => {
    const period = 5;
    const candles = candlesFromCloses([10, 11, 12, 13, 14, 15, 16, 17]);
    const out = atr(candles, period);
    for (let i = 0; i < period - 1; i++) {
      expect(Number.isNaN(out[i])).toBe(true);
    }
    expect(Number.isNaN(out[period - 1])).toBe(false);
    expect(out[period - 1]).toBeGreaterThan(0);
  });
});

describe("obv", () => {
  it("accumulates volume up on rising closes and down on falling closes", () => {
    // closes: 10 -> 11 (up) -> 10 (down) -> 10 (flat) -> 12 (up)
    const candles: Candle[] = [
      { time: 0, open: 10, high: 11, low: 9, close: 10, volume: 100 },
      { time: 1, open: 10, high: 12, low: 10, close: 11, volume: 200 },
      { time: 2, open: 11, high: 11, low: 9, close: 10, volume: 300 },
      { time: 3, open: 10, high: 11, low: 9, close: 10, volume: 400 },
      { time: 4, open: 10, high: 13, low: 10, close: 12, volume: 500 },
    ];
    const out = obv(candles);
    expect(out.length).toBe(candles.length);
    expect(out[0]).toBe(0); // first bar seeds at 0
    expect(out[1]).toBe(200); // +200 (up)
    expect(out[2]).toBe(-100); // 200 - 300 (down)
    expect(out[3]).toBe(-100); // flat → unchanged
    expect(out[4]).toBe(400); // -100 + 500 (up)
  });
});

describe("williamsR", () => {
  it("stays within [-100, 0]", () => {
    const candles = candlesFromCloses([
      10, 12, 11, 13, 14, 13, 15, 16, 14, 17, 18, 16, 19, 20, 21, 19, 22, 23,
    ]);
    const out = williamsR(candles, 14);
    expect(out.length).toBe(candles.length);
    for (const v of out) {
      if (!Number.isNaN(v)) {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(0);
      }
    }
  });
});

describe("roc", () => {
  it("equals ((v[i]-v[i-n])/v[i-n])*100 on a known series", () => {
    const values = [10, 11, 12, 13, 14, 15, 16, 17];
    const period = 3;
    const out = roc(values, period);
    expect(out.length).toBe(values.length);
    for (let i = 0; i < period; i++) {
      expect(Number.isNaN(out[i])).toBe(true);
    }
    for (let i = period; i < values.length; i++) {
      const expected = ((values[i] - values[i - period]) / values[i - period]) * 100;
      expect(out[i]).toBeCloseTo(expected, 9);
    }
  });
});

describe("psar", () => {
  it("returns finite numbers after the first bar", () => {
    const candles = candlesFromCloses([
      10, 11, 12, 13, 14, 15, 16, 15, 14, 13, 12, 11, 10, 9, 8,
    ]);
    const out = psar(candles);
    expect(out.length).toBe(candles.length);
    expect(Number.isNaN(out[0])).toBe(true); // first bar has no SAR
    for (let i = 1; i < out.length; i++) {
      expect(Number.isFinite(out[i])).toBe(true);
    }
  });

  it("flips with the trend (sanity)", () => {
    // Up then sharply down — SAR should sit below price in the uptrend
    // and above price after the reversal.
    const candles = candlesFromCloses([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 12, 11, 10, 9, 8, 7,
    ]);
    const out = psar(candles);
    // During the established uptrend, SAR is below the close.
    expect(out[7]).toBeLessThan(candles[7].close);
    // After the downturn, SAR rises above the close.
    const lastIdx = candles.length - 1;
    expect(out[lastIdx]).toBeGreaterThan(candles[lastIdx].close);
  });
});

describe("heikinAshi", () => {
  it("computes the first candle and preserves length", () => {
    const candles = candlesFromCloses([10, 12, 11, 13, 14, 13, 15]);
    const ha = heikinAshi(candles);
    expect(ha.length).toBe(candles.length);

    const first = candles[0];
    // First HA open == (open+close)/2 of the first raw candle.
    expect(ha[0].open).toBeCloseTo((first.open + first.close) / 2, 9);
  });

  it("HA close == average of the raw OHLC for every bar", () => {
    const candles = candlesFromCloses([10, 12, 11, 13, 14, 13, 15]);
    const ha = heikinAshi(candles);
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      expect(ha[i].close).toBeCloseTo((c.open + c.high + c.low + c.close) / 4, 9);
    }
  });

  it("HA high >= max(HA open, HA close) and HA low <= min(HA open, HA close)", () => {
    const candles = candlesFromCloses([10, 12, 11, 13, 14, 13, 15, 9, 8, 11]);
    const ha = heikinAshi(candles);
    for (const c of ha) {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
    }
  });
});
