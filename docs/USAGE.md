<div align="center">
<img src="../public/logo.svg" alt="RobinView" width="280" />

# Usage Guide
</div>

A tour of everything RobinView does, organized by where it lives in the app. For installation
see [INSTALL.md](./INSTALL.md); for configuration see [CONFIGURATION.md](./CONFIGURATION.md).

## Layout

- **Left rail**: navigation between Terminal, Portfolio, Markets, Screener, Orders, and Alerts,
  plus Settings and the version label at the bottom.
- **Top bar**: symbol search (also `Cmd/Ctrl+K`), the active symbol with its price and the change
  over the selected chart timeframe, the live ET market clock, account switcher, and the
  connection badge.
- **Terminal**: the chart, the symbol quote and watchlist, and a tabbed panel for Positions,
  Orders, Alerts, Info, and News.

## Charting

- **Chart types**: candlestick, Heikin Ashi, area, baseline, and line.
- **Timeframes**: 1D, 1W, 1M, 3M, 1Y, 5Y, ALL. Changing the timeframe also re-frames the top-bar
  change ($ and %) to that period, so 1M shows the one-month move while the live "today" P&L stays
  in the symbol panel on the right.
- **Scales**: Linear, Log, and Percent. Adding comparison symbols switches to Percent so different
  price levels line up.
- **Bar replay**: step through history bar by bar, or autoplay.
- **Export**: save the current chart as a PNG.
- **Compare**: overlay other symbols as normalized percent lines.

### Indicators

Open the **Indicators** menu in the chart toolbar.

- **Overlays** (drawn on the price pane): SMA 20/50/100/200, EMA 9/21/50, Bollinger Bands, VWAP
  (anchored to each trading session), and Parabolic SAR.
- **Oscillators** (each in its own stacked lower pane, any number at once): RSI, MACD, Stochastic,
  Williams %R, ATR, OBV, and Rate of Change.
- Click the gear next to an indicator to edit its periods and coefficients. Changes apply live and
  persist.

### Drawing tools

The vertical toolbar on the left of the chart (hide it with the X, reopen with the brush button):

| Tool | Key | Tool | Key |
|------|-----|------|-----|
| Cursor | `Esc` | Rectangle | `B` |
| Trend line | `T` | Fib retracement | `F` |
| Ray | `R` | Brush (freehand) | `D` |
| Horizontal line | `H` | Text note | `X` |
| Vertical line | `V` | Measure / ruler | `M` |

Set the color, line width (1 / 2 / 3 px), and dashed or solid style. Turn on **magnet** to snap
points to the nearest OHLC value. Drag endpoint handles to edit, select and delete, or open the
**Objects** panel to manage drawings as layers. Undo and redo with `Cmd/Ctrl+Z` and
`Cmd/Ctrl+Shift+Z`. Drawings are saved per symbol on your device.

When you hold a position or have open orders in the active symbol, RobinView draws a dashed
average-cost line and dotted order lines directly on the chart.

## Symbol quote, watchlist, and trading

The right side of the Terminal shows the live price, change, bid/ask, day range, volume, and your
position if you hold one. **Buy** and **Sell** open the trade ticket. Every order routes through
the Robinhood agentic API and requires a review step before it is placed.

The watchlist below it supports multiple lists (create, rename, delete, switch). Add the current
symbol with the star button in the chart toolbar.

## Research panel (bottom tabs)

- **Positions**: your holdings with per-position day and open P&L and weight.
- **Orders**: recent orders with status; open orders can be cancelled. Timestamps follow your
  12h/24h preference.
- **Alerts**: price alerts you have set, with their state.
- **Info**: fundamentals for the symbol (market cap, P/E, EPS, dividend yield, beta, 52-week range,
  next earnings).
- **News**: recent headlines for the symbol, each with the publisher, time, a thumbnail, an article
  summary, and a link to the full story.

## Markets, Screener, Portfolio

- **Markets**: a live heatmap colored by the daily move, plus Top Gainers / Losers / Most Active.
- **Screener**: preset screens (day gainers, and so on) you can open into the Terminal.
- **Portfolio**: total value, day change, total return, buying power, cost basis, a live equity
  curve, a sortable holdings table, and an allocation donut by holding and asset class.

## Alerts

Set a price alert (above or below) from the Alerts panel. When the live price crosses the level,
RobinView fires a browser notification. Grant notification permission when prompted.

## Preferences and updates

- **Settings > Preferences**: switch between a 12-hour and a 24-hour clock. The choice applies to
  the market clock and order timestamps.
- **Settings > Updates**: see the installed and available versions, read the release notes, and
  update in place. RobinView also checks automatically on launch and once an hour and shows a toast
  when a new version is available. See [INSTALL.md](./INSTALL.md#5-keeping-robinview-up-to-date).

## Keyboard shortcuts

Press `?` anywhere to open the full cheat sheet. Highlights:

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+K` or `/` | Command palette / symbol search |
| `T R H V B F D X M` | Pick a drawing tool (when the chart is focused) |
| `Esc` | Return to the cursor tool |
| `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` | Undo / redo a drawing |
| `?` | Open the shortcuts help |
