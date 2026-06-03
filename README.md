<div align="center">

<img src="./public/logo.svg" alt="RobinView" width="380" />

### A TradingView-class terminal for your Robinhood portfolio

Live charts · technical indicators · real-time P&L · watchlists · price alerts

<sub>Built on the Robinhood MCP trading server · React + lightweight-charts · MIT licensed</sub>

</div>

<br/>

<img src="./docs/terminal.png" alt="RobinView terminal" width="100%" />

<br/>

## What is RobinView?

**RobinView is a TradingView-class terminal — with Robinhood added on.**

The base is a fast, keyboard-driven market terminal on **real live data**: candlestick charts
with studies, a live heatmap, watchlists, symbol search and price alerts. It works for anyone,
with no account and no login.

**Connect Robinhood** and RobinView overlays your real account — positions, balances, P&L and
order history — by authorizing **directly with Robinhood** over the official MCP trading
server. RobinView runs the OAuth flow itself and registers as its own client; it never reuses
another app's credentials or copies data out of anything else.

> [!IMPORTANT]
> RobinView is an independent project and is **not affiliated with or endorsed by
> Robinhood**. Connecting grants read access to your accounts (and trading only in a dedicated
> Robinhood **Agentic** account). It is a viewer/analysis tool — not investment advice.
> See [Data & honesty](#data--honesty) for exactly what is real.

## Features

**Charting**
- 5 chart types — **candlestick · Heikin Ashi · area · baseline · line** — powered by [`lightweight-charts`](https://github.com/tradingview/lightweight-charts) (TradingView's own open-source engine)
- Price scale modes: **Linear · Log · Percent**; **bar replay** to step through history bar-by-bar; **export chart as PNG**
- 7 timeframes (1D → ALL), volume histogram, crosshair OHLC readout, hover tooltips
- **Drawing tools**: trend line, ray, horizontal/vertical line, rectangle, Fibonacci retracement, freehand brush, text notes — plus a **measure/ruler** tool (price %, $ and bars). Drag-to-edit endpoint handles, color picker, select & delete, an **Objects (layers) panel**, persisted per symbol
- Overlays: **SMA 20/50/100/200, EMA 9/21/50, Bollinger Bands, VWAP, Parabolic SAR**
- Synced oscillator pane: **RSI, MACD, Stochastic, Williams %R, ATR, OBV, Rate of Change**
- Live last-price streamed into the forming candle
- **Keyboard shortcuts** throughout — `T`/`R`/`H`/`V`/`B`/`F`/`D`/`X`/`M` pick drawing tools, `Esc` returns to the cursor, `?` opens the shortcuts cheat-sheet

**Portfolio**
- Editorial hero with total value, day change, total return, buying power, cost basis
- Live equity curve, sortable holdings table with per-position day & open P&L, weight bars
- Allocation donut by holding + account breakdown (equities / options / crypto / cash)

**Markets**
- Live heatmap colored by daily move · Top Gainers / Losers / Most Active

**Workflow**
- ⌘K command palette — fuzzy symbol & company search + navigation
- Watchlists (persisted), price alerts with browser notifications on crossing
- Multi-account switching (margin / cash / IRA)

<table>
<tr>
<td width="50%"><img src="./docs/portfolio.png" alt="Portfolio" /><p align="center"><sub>Portfolio</sub></p></td>
<td width="50%"><img src="./docs/markets.png" alt="Markets" /><p align="center"><sub>Markets heatmap</sub></p></td>
</tr>
</table>

## Feature parity

How RobinView stacks up against TradingView on the features it sets out to cover:

| Feature | RobinView | TradingView |
|---------|-----------|-------------|
| Advanced charts (types, scales, replay, export) | ✅ | ✅ |
| Indicators (overlays + oscillators) | ✅ 12 built-in | ✅ thousands |
| Drawing tools (edit handles, measure, layers) | ✅ | ✅ |
| Watchlists | ✅ | ✅ |
| Market heatmap / movers | ✅ | ✅ |
| Screener | ✅ | ✅ |
| Symbol fundamentals | ✅ | ✅ |
| News | ✅ | ✅ |
| Price alerts | ✅ browser notifications | ✅ |
| Command palette | ✅ ⌘K | ✅ |
| Real portfolio / trading | ✅ via Robinhood MCP | partial (broker integrations) |
| Live quotes | ✅ | ✅ |

> **Honest scope note.** RobinView deliberately leaves out the parts of TradingView that
> depend on paid market data — tick-level / Level-2 order books, options chains, and real-time
> futures — because they can't be served from free, keyless feeds. Everything here runs on
> **only free keyless market data (Yahoo Finance)** plus **your own Robinhood MCP connection**
> for account data. No paid data vendor, no scraping another app, no copied credentials.

## Quick start

```bash
git clone https://github.com/<you>/robinview.git
cd robinview
npm install
npm run dev
```

Open **http://localhost:5273**. The terminal comes up on **real live market data** — charts,
watchlists, search and the heatmap all work immediately, no login.

## Connecting your Robinhood account

Click **Connect Robinhood** (top-right). RobinView:

1. Performs OAuth discovery against `agent.robinhood.com` and **dynamically registers itself**
   as its own OAuth client (PKCE, no secrets to manage).
2. Opens Robinhood's authorization page — you log in and approve, opening a Robinhood
   **Agentic** account if you don't have one.
3. Robinhood redirects back to RobinView's local callback, which completes the token exchange
   and connects. The session is stored under `~/.robinview` and resumes on restart.

Your real accounts, positions, live P&L and order history then populate. Disconnect anytime
from the **Robinhood** badge in the top bar. No data is ever copied from any other application —
RobinView holds its own authorization.

> Prefer to demo without an account? `ROBINVIEW_MODE=demo npm run dev` runs a deterministic
> simulator (handy for screenshots/CI).

## Production

```bash
npm run build      # bundles the frontend into dist/
npm start          # single Node process serves API + WebSocket + static app on :8787
```

## Architecture

```
              ┌──────────────────────── browser ────────────────────────┐
              │  React + lightweight-charts · Zustand · WS client        │
              │  Connect-Robinhood OAuth popup ──┐                       │
              └─────────┬────────────────────────┼───────────┬──────────┘
                REST/api │                 OAuth  │      /ws  │ live quotes +
                         ▼                 redirect▼           ▼ revalued portfolio
              ┌──────────────────────── server (Node) ──────────────────┐
              │  Express + ws · 1 Hz tick loop · DataProvider interface  │
              │                                                          │
              │   LiveProvider ─────────────┬──────────────────────────┐│
              │     market data ▶ Yahoo (quotes, candles, search)       ││
              │     account data ▶ RobinhoodConnection (own MCP OAuth)  ││
              │                      · FileOAuthProvider (PKCE, tokens) ││
              │   MockProvider ▶ deterministic simulator (ROBINVIEW_MODE=demo)
              └───────────────────────────────────┬─────────────────────┘
                          real market data         ▼  OAuth + MCP
                       (Yahoo Finance)   Robinhood MCP  (agent.robinhood.com)
```

**Live valuation.** Your holdings (symbol, quantity, cost basis) come from Robinhood and
change only when you trade — but RobinView revalues them against the live market quote stream
every tick, so market value, day change, P&L and the portfolio total move in real time.

- **`server/provider/live.ts`** — composes market data + account data into one `DataProvider`
- **`server/provider/robinhood.ts`** + **`oauth.ts`** — RobinView's own MCP OAuth connection
- **`server/provider/quotes.ts`** / **`history.ts`** — real keyless market quotes & candles
- **`src/lib/indicators.ts`** — pure, tested SMA/EMA/RSI/MACD/Bollinger/VWAP math
- **`shared/types.ts`** — normalized domain model (wire decimals → numbers once, at the seam)

## Data & honesty

RobinView is precise about what is real:

| Data | Live mode (default) | Demo mode |
|------|---------------------|-----------|
| Quotes & live price motion | **Real** market quotes | Simulated tick engine |
| Historical OHLC candles | **Real** intraday/daily/weekly | Real (same source) |
| Symbol search | **Real** | Real (same source) |
| Accounts, positions, portfolio, orders | **Real**, your Robinhood (once connected) | Simulated |
| Portfolio valuation / P&L | **Real holdings × real live quotes** | Simulated |

Market data (quotes, candles, search) comes from a **keyless source** (Yahoo Finance), cached
per request; offline, charts fall back to a deterministic per-symbol generator anchored to the
last price so they always render. Account data comes from **your own Robinhood MCP
authorization** — RobinView never copies it from another app. Swapping the market-data vendor
(Polygon, Finnhub, …) is a one-file change in `server/provider/quotes.ts` + `history.ts`.

## Tech

React 18 · TypeScript · Vite · lightweight-charts · Zustand · Express · ws ·
`@modelcontextprotocol/sdk` · Fraunces / Hanken Grotesk / JetBrains Mono

```bash
npm run typecheck   # strict TS, no errors
npm test            # indicator math unit tests
```

## License

MIT — see [LICENSE](./LICENSE). Not affiliated with Robinhood Markets, Inc. or TradingView.
Use at your own risk; nothing here is financial advice.
