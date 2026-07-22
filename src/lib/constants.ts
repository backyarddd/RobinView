// URL paths reserved for app views; any other /SEGMENT is treated as a ticker
// (terminal view). "terminal" itself is represented by the symbol path (/SPY).
export const VIEW_PATHS = ["portfolio", "markets", "screener", "orders", "alerts", "paper"] as const;

// Path segments that look like a ticker (incl. crypto pairs like BTC-USD).
export const SYMBOL_PATH_RE = /^[A-Za-z0-9.\-^=]{1,15}$/;

// Symbols surfaced in the Markets view heatmap & movers.
export const MARKET_SYMBOLS = [
  "NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "AVGO",
  "AMD", "NFLX", "JPM", "V", "COST", "PLTR", "COIN", "HOOD",
  "ORCL", "CRM", "UBER", "ARM", "TSM", "MU", "MRVL", "SMCI",
  "VOO", "SPY", "QQQ", "CRDO", "ALAB", "SNDK",
  "BTC-USD", "ETH-USD", "SOL-USD",
];

export const INDEX_SYMBOLS = ["SPY", "QQQ", "VOO"];
