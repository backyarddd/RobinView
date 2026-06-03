import type { DataProvider } from "./types.js";
import { MockProvider } from "./mock.js";
import { LiveProvider } from "./live.js";

export type { DataProvider } from "./types.js";
export { MockProvider } from "./mock.js";
export { LiveProvider } from "./live.js";

// Provider selection:
//   ROBINVIEW_MODE=demo            -> deterministic simulator (no network, no auth)
//   otherwise (default)            -> LiveProvider: real market data always; real
//                                     Robinhood account once the user connects.
export function createProvider(redirectUri: string): DataProvider {
  const mode = (process.env.ROBINVIEW_MODE || "live").toLowerCase();
  if (mode === "demo") return new MockProvider();
  return new LiveProvider(redirectUri);
}
