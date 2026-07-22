import { describe, expect, it } from "vitest";
import { realizedBySell } from "../src/lib/pnl";
import type { OrderRow } from "../shared/types";

const order = (over: Partial<OrderRow>): OrderRow => ({
  id: "x",
  symbol: "AAPL",
  side: "buy",
  type: "market",
  state: "filled",
  quantity: 10,
  averageFillPrice: 100,
  createdAt: 1,
  ...over,
});

describe("realizedBySell (FIFO)", () => {
  it("matches a simple round trip", () => {
    const attr = realizedBySell([
      order({ id: "b1", createdAt: 1, quantity: 10, averageFillPrice: 100 }),
      order({ id: "s1", createdAt: 2, side: "sell", quantity: 10, averageFillPrice: 110 }),
    ]);
    expect(attr.get("s1")).toMatchObject({ pnl: 100, basis: 100, matchedQty: 10, partial: false });
  });

  it("consumes lots oldest-first across multiple buys", () => {
    const attr = realizedBySell([
      order({ id: "b1", createdAt: 1, quantity: 5, averageFillPrice: 100 }),
      order({ id: "b2", createdAt: 2, quantity: 5, averageFillPrice: 120 }),
      order({ id: "s1", createdAt: 3, side: "sell", quantity: 8, averageFillPrice: 130 }),
    ]);
    // basis = (5*100 + 3*120) / 8 = 107.5; pnl = 8 * (130 - 107.5) = 180
    expect(attr.get("s1")!.basis).toBeCloseTo(107.5);
    expect(attr.get("s1")!.pnl).toBeCloseTo(180);
  });

  it("keeps symbols independent and ignores unfilled orders", () => {
    const attr = realizedBySell([
      order({ id: "b1", symbol: "AAPL", createdAt: 1 }),
      order({ id: "b2", symbol: "TSLA", createdAt: 2, averageFillPrice: 200 }),
      order({ id: "c1", symbol: "AAPL", createdAt: 3, state: "cancelled" }),
      order({ id: "s1", symbol: "TSLA", createdAt: 4, side: "sell", quantity: 10, averageFillPrice: 190 }),
    ]);
    expect(attr.get("s1")!.pnl).toBeCloseTo(-100);
    expect(attr.size).toBe(1);
  });

  it("flags sells with basis missing from visible history", () => {
    const attr = realizedBySell([
      order({ id: "b1", createdAt: 1, quantity: 4, averageFillPrice: 100 }),
      order({ id: "s1", createdAt: 2, side: "sell", quantity: 10, averageFillPrice: 110 }),
    ]);
    const a = attr.get("s1")!;
    expect(a.partial).toBe(true);
    expect(a.matchedQty).toBe(4);
    expect(a.pnl).toBeCloseTo(40);
  });

  it("handles fractional shares", () => {
    const attr = realizedBySell([
      order({ id: "b1", createdAt: 1, quantity: 0.5, averageFillPrice: 100 }),
      order({ id: "s1", createdAt: 2, side: "sell", quantity: 0.5, averageFillPrice: 120 }),
    ]);
    expect(attr.get("s1")).toMatchObject({ partial: false });
    expect(attr.get("s1")!.pnl).toBeCloseTo(10);
  });
});
