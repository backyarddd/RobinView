import { describe, it, expect } from "vitest";
import { sma, ema, rsi, macd, bollinger, vwap } from "../src/lib/indicators";
import type { Candle } from "../shared/types";

describe("indicators", () => {
  it("sma averages the trailing window and pads leading NaN", () => {
    const out = sma([1, 2, 3, 4, 5], 3);
    expect(Number.isNaN(out[0])).toBe(true);
    expect(Number.isNaN(out[1])).toBe(true);
    expect(out[2]).toBeCloseTo(2);
    expect(out[3]).toBeCloseTo(3);
    expect(out[4]).toBeCloseTo(4);
  });

  it("ema seeds from the SMA and reacts faster than SMA", () => {
    const values = Array.from({ length: 30 }, (_, i) => 100 + i);
    const e = ema(values, 10);
    expect(Number.isNaN(e[8])).toBe(true);
    expect(e[9]).toBeCloseTo(104.5, 1); // SMA seed of first 10
    expect(e[29]).toBeGreaterThan(124); // tracks the uptrend
  });

  it("rsi is 100 for a monotonic rise and within [0,100]", () => {
    const up = Array.from({ length: 20 }, (_, i) => i);
    const r = rsi(up, 14);
    expect(r[19]).toBeCloseTo(100, 5);
    for (const v of r) if (!Number.isNaN(v)) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(100);
  });

  it("macd histogram equals macd minus signal where defined", () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5);
    const m = macd(values);
    const i = 59;
    expect(m.histogram[i]).toBeCloseTo(m.macd[i] - m.signal[i], 6);
  });

  it("bollinger bands straddle the middle SMA", () => {
    const values = Array.from({ length: 40 }, (_, i) => 100 + (i % 5));
    const b = bollinger(values, 20, 2);
    const i = 39;
    expect(b.upper[i]).toBeGreaterThan(b.middle[i]);
    expect(b.lower[i]).toBeLessThan(b.middle[i]);
  });

  it("vwap stays within the price range", () => {
    const candles: Candle[] = Array.from({ length: 10 }, (_, i) => ({
      time: i,
      open: 100,
      high: 105,
      low: 95,
      close: 100 + i,
      volume: 1000,
    }));
    const v = vwap(candles);
    expect(v[9]).toBeGreaterThan(95);
    expect(v[9]).toBeLessThan(110);
  });
});
