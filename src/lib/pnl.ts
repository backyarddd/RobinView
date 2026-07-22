import type { OrderRow } from "@shared/types";

// FIFO realized-P&L attribution over filled orders. Buys accumulate cost lots
// per symbol; each sell consumes the oldest lots and realizes the difference.
// Returns a map keyed by sell-order id. Sells with no matched basis in the
// visible history (e.g. the buy predates what the API returns) are flagged
// `partial` so the UI can say "basis unknown" instead of lying with $0.

export interface SellAttribution {
  pnl: number; // realized $ on the matched quantity
  basis: number; // average cost of the matched lots
  matchedQty: number;
  sellQty: number;
  partial: boolean; // some of the sell had no visible buy lot
}

export function realizedBySell(orders: OrderRow[]): Map<string, SellAttribution> {
  const filled = orders
    .filter((o) => o.state === "filled" && (o.averageFillPrice ?? 0) > 0 && o.quantity > 0)
    .sort((a, b) => a.createdAt - b.createdAt);
  const lots = new Map<string, { qty: number; price: number }[]>();
  const out = new Map<string, SellAttribution>();
  for (const o of filled) {
    const price = o.averageFillPrice!;
    if (o.side === "buy") {
      const l = lots.get(o.symbol) ?? [];
      l.push({ qty: o.quantity, price });
      lots.set(o.symbol, l);
      continue;
    }
    let remaining = o.quantity;
    let matchedQty = 0;
    let matchedCost = 0;
    const l = lots.get(o.symbol) ?? [];
    while (remaining > 1e-9 && l.length) {
      const lot = l[0];
      const take = Math.min(lot.qty, remaining);
      matchedQty += take;
      matchedCost += take * lot.price;
      lot.qty -= take;
      remaining -= take;
      if (lot.qty <= 1e-9) l.shift();
    }
    out.set(o.id, {
      pnl: matchedQty > 0 ? (price - matchedCost / matchedQty) * matchedQty : 0,
      basis: matchedQty > 0 ? matchedCost / matchedQty : 0,
      matchedQty,
      sellQty: o.quantity,
      partial: remaining > 1e-9,
    });
  }
  return out;
}
