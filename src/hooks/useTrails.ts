import { useEffect, useRef } from "react";
import { useStore } from "../store/useStore";

// Accumulates a rolling price history per symbol from the live quote stream,
// so watchlist rows can render a sparkline that grows as the market moves.
export function useTrails(symbols: string[], cap = 40): Record<string, number[]> {
  const quotes = useStore((s) => s.quotes);
  const trails = useRef<Record<string, number[]>>({});
  for (const sym of symbols) {
    const q = quotes[sym];
    if (!q) continue;
    const arr = trails.current[sym] ?? (trails.current[sym] = [q.price]);
    if (arr[arr.length - 1] !== q.price) {
      arr.push(q.price);
      if (arr.length > cap) arr.shift();
    }
  }
  return trails.current;
}

// Flash a row green/red briefly when a value ticks. Returns a className.
export function useFlash(value: number): string {
  const prev = useRef(value);
  const cls = useRef("");
  if (value !== prev.current) {
    cls.current = value > prev.current ? "flash-up" : "flash-down";
    prev.current = value;
  }
  // re-trigger animation by keying on value handled by caller
  useEffect(() => {
    const t = setTimeout(() => (cls.current = ""), 650);
    return () => clearTimeout(t);
  }, [value]);
  return cls.current;
}
