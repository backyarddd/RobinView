import type { DataProvider } from "./types.js";
import { MockProvider } from "./mock.js";
import { MCPProvider } from "./mcp.js";

export type { DataProvider } from "./types.js";
export { MockProvider } from "./mock.js";
export { MCPProvider } from "./mcp.js";

// Provider selection:
//   ROBINVIEW_MODE=live  + ROBINHOOD_MCP_TOKEN set  -> real Robinhood MCP
//   otherwise                                        -> deterministic demo
export function createProvider(): DataProvider {
  const mode = (process.env.ROBINVIEW_MODE || "demo").toLowerCase();
  const hasToken = !!process.env.ROBINHOOD_MCP_TOKEN;
  if (mode === "live" && hasToken) {
    return new MCPProvider();
  }
  return new MockProvider();
}
