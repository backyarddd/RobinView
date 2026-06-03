# Changelog

All notable changes to RobinView are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/).

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
