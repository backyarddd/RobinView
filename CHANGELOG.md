# Changelog

All notable changes to RobinView are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/).

## [0.7.1]

### Changed

- **Aggressive paper mode with a daily minimum.** The confidence floor drops to 0.55, the
  research prompt tells the model to act on modest edges rather than waiting for perfect setups,
  and a daily-trade mandate guarantees at least one trade per day: if nothing has traded by the
  final research window (13:00 ET onward), the confidence gate is waived and the model must pick
  call or put - whichever has the better expected value - reporting its honest confidence. Forced
  entries are tagged "[forced daily trade]" in the signal log so calibration can be measured
  separately later. All other risk rules (stop, target, one position, daily loss halt) unchanged.

## [0.7.0]

### Added

- **Post-trade reviews (the learning loop).** Every closed paper trade is automatically
  investigated: a review sweep reconstructs what SPY actually did between entry and exit, has
  Claude grade the thesis against reality (thesis_right / thesis_wrong / right_but_stopped /
  chop_no_edge / lucky_win / ...), and attaches a 2-3 sentence "what happened" plus a one-line
  actionable lesson. Hover the Review chip on any closed trade to read it; click the row for the
  full thesis + post-mortem. The 0DTE Paper view gains a Lessons panel, and every research tick
  now receives the track record (win rates by side, recent trades with their lessons) so future
  signals learn from documented mistakes.

## [0.6.0]

### Added

- **Trade Log tab** in the terminal's bottom panel (next to Watchlist / Positions / Orders /
  Alerts), with a Paper / Real switch:
  - **Paper (0DTE)**: every paper trade with full detail - entry/exit premium, spot at entry and
    exit, confidence, holding time, exit reason, P&L in dollars and percent, plus summary stats
    (net P&L, win rate, average win/loss, today's tally). Click a row to expand the trade's
    written thesis.
  - **Real (Robinhood)**: all filled orders for the selected account with FIFO-attributed
    realized P&L - each sell is matched against the oldest visible buy lots to compute basis,
    P&L, and return, with totals and win rate up top. Sells whose buys predate the visible
    history are flagged instead of shown as $0.

## [0.5.0]

### Added

- **0DTE Paper experiment.** A fully simulated agentic day-trading loop: a cron-driven research
  tick (hourly, 9:45-14:00 ET weekdays) has Claude analyze SPY, VIX, recent candles, and live
  headlines, then emit a directional signal (call / put / none with confidence and thesis). The
  server-side paper engine buys the nearest-the-money same-day SPY contract with honest fills
  (enter at the ask, exit at the bid, marked at the bid) using real Yahoo option-chain quotes.
  Hard-coded risk rules: $500 premium budget per trade, 60% minimum confidence, one position at
  a time, max 3 trades/day, -50% stop / +100% target, forced flat by 15:45 ET, and a -$300 daily
  loss halt. A new "0DTE Paper" view shows equity, win rate, the trade log with each trade's
  thesis, and every research signal (including skipped ones and why). NO REAL ORDERS: nothing in
  this module touches order endpoints; the promotion bar before any live dollar is 60+ trades,
  net positive after spreads, drawdown under 30%.

## [0.4.0]

### Added

- **URL routing.** The address bar now reflects where you are: `/SPY` opens the terminal on that
  symbol (crypto pairs like `/BTC-USD` work too), and `/portfolio`, `/markets`, `/screener`,
  `/orders`, `/alerts` open those views. The URL stays in sync as you navigate, so a refresh or a
  shared link lands exactly where you were.
- **Real intraday sparklines.** Watchlist mini charts now draw today's actual close series
  (downsampled server-side from Yahoo spark data) instead of accumulating live ticks from page
  load, so the shape is correct the moment the list renders. The tick trail remains as a fallback
  for symbols without spark data.
- **SIMULATED badge.** When live history is unavailable and the server falls back to generated
  candles, the chart header shows a SIMULATED badge so synthetic data is never mistaken for real
  market history.
- **Background chart refresh.** An open chart re-fetches its series on a per-timeframe cadence
  (30s on 1D, scaling up for longer windows), so new bars appear without a reload. The refresh is
  silent: no loading flash, and your zoom / scroll position is preserved.

### Fixed

- **Chart times are now local.** The time axis and crosshair format timestamps in your local
  timezone instead of UTC (a 9:30 AM ET open no longer displays as 1:30 PM). Daily+ bars still
  render as calendar days, constructed locally so they cannot shift to the previous day.
- Sparkline gradient ids are now unique per instance; previously two rows with similar data could
  collide and one row's line could pick up another row's fill color.

## [0.3.1]

### Fixed

- The right column now keeps the quote / buy-sell card at its natural height (it was being
  squeezed and its Buy/Sell buttons clipped); the Symbol Info panel takes the remaining space and
  scrolls on its own.
- Symbol Info content is inset to match the panel header and the quote card, fixing the
  misaligned spacing.

## [0.3.0]

### Added

- **Company logos** in place of ticker placeholders, everywhere a symbol appears (watchlist,
  positions, screener, markets, search, and the chart/info headers). Resolved by ticker -> domain
  (static map plus Yahoo profile) and served via a logo endpoint that falls back from full logo to
  favicon to a letter badge, so it always renders.
- **Rich, sectioned Symbol Info panel** with a show/hide menu (like TradingView's section toggles):
  Profile, Key stats, Pricing model, Bid & Ask, Price ranges, Performance, Technicals, Analysts,
  Earnings, Dividends, Financials, Seasonals, Options, Latest news, and Notes. All real keyless
  data (Yahoo quoteSummary, the options endpoint, and locally computed performance / seasonality /
  technical summary). Bonds is omitted (no free source for single-name equities). Section choices
  persist locally; private per-symbol notes are saved on the device.

### Changed

- **Layout.** The standalone top bar was removed and merged into the chart bubble (symbol, price,
  timeframe-aware change, search, market clock, account switcher and connection controls now live
  in the chart header). Watchlists moved into the bottom panel alongside Positions / Orders /
  Alerts. The rich Symbol Info panel now occupies the right column. The bottom and right panels are
  larger, using the space freed by removing the top bar.

## [0.2.2]

### Changed

- The trade ticket no longer blocks orders when the selected account is not agentic-enabled.
  It now routes the order through your agentic account instead, with a clear notice naming that
  account, shows that account's buying power, and confirms the routing on the review screen. If no
  agentic account is connected at all, it explains that rather than failing silently.

### Notes

- Equity orders are always funded from the account's buying power (cash plus any margin). Robinhood
  does not expose a per-order payment method or funding source for stock orders, so there is no
  payment-method picker; deposits/transfers fund the account separately in Robinhood.

## [0.2.1]

### Fixed

- The chart time axis and crosshair label now honor the 12-hour / 24-hour clock preference
  (for example `1:30 PM` versus `13:30`), on the price pane and every oscillator pane.

### Changed

- The News tab now shows a headline-count badge (for example `News 10`) so it is obvious the
  panel is populated. Per-symbol news with article summaries lives in **Terminal > News**.

## [0.2.0]

### Added

- **In-app auto-update.** RobinView checks this GitHub repository for a newer release on launch
  and once an hour. An update toast and a Settings indicator appear when one is available, and
  **Settings > Updates** can pull and reinstall in place (`git pull --ff-only` + `npm install`),
  then reload. Configurable via `ROBINVIEW_REPO` for forks.
- **Version on the dashboard.** The running version is shown at the bottom of the left rail and in
  Settings, with a marker when an update is available.
- **12-hour / 24-hour clock preference** (Settings > Preferences), applied to the new live ET
  market clock and to order timestamps, persisted locally.
- **Timeframe-aware change / P&L in the top bar.** Switching the chart timeframe (1D, 1W, 1M, and
  so on) re-frames the top-bar change in dollars and percent to that period. The live "today" P&L
  remains in the symbol panel.
- **Richer news.** Per-symbol news cards now include an article summary alongside the headline,
  publisher, timestamp, thumbnail, and link, sourced from Yahoo's keyless search and RSS feeds.

### Documentation

- Expanded README and added `docs/INSTALL.md`, `docs/USAGE.md`, and `docs/CONFIGURATION.md`.

## [0.1.0]

### Added

- Initial release: TradingView-class terminal on free keyless market data with an optional
  Robinhood MCP account connection.
- Charting: candlestick, Heikin Ashi, area, baseline, and line types; Linear/Log/Percent scales;
  bar replay; PNG export; comparison overlays; volume; crosshair OHLC readout.
- Indicators: SMA, EMA, Bollinger Bands, VWAP, Parabolic SAR overlays, and RSI, MACD, Stochastic,
  Williams %R, ATR, OBV, and Rate of Change oscillators.
- Drawing tools with edit handles, a measure tool, an Objects (layers) panel, and per-symbol
  persistence.
- Portfolio with live valuation, holdings table, equity curve, and allocation donut.
- Markets heatmap and movers, screener, symbol fundamentals, news, watchlists, price alerts, a
  command palette, and multi-account switching.
- Live quotes and a revalued portfolio over a WebSocket tick loop.
