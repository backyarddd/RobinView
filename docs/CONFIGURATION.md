<div align="center">
<img src="../public/logo.svg" alt="RobinView" width="280" />

# Configuration Reference
</div>

RobinView runs with zero configuration. Every setting has a sensible default. To override one,
copy `.env.example` to `.env` and edit it, or export the variable in your shell before starting
the server.

```bash
cp .env.example .env
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ROBINVIEW_MODE` | `live` | `live` uses real keyless market data and lets you connect Robinhood for account data. `demo` runs a deterministic simulator with no network and no auth. |
| `ROBINVIEW_API_PORT` | `8787` | Port for the API + WebSocket server. The Vite dev proxy and production static server both follow this. |
| `ROBINVIEW_PUBLIC_URL` | `http://localhost:<port>` | Public origin RobinView is reached at. Used to build the Robinhood OAuth redirect URI (`<PUBLIC_URL>/api/robinhood/callback`). Set this when deploying behind a domain. |
| `ROBINVIEW_TICK_MS` | `1000` | Live broadcast cadence in milliseconds. Lower is snappier and noisier; higher is calmer and lighter. |
| `ROBINVIEW_DATA_DIR` | `~/.robinview` | Where the Robinhood OAuth session (tokens) is stored. |
| `ROBINHOOD_MCP_URL` | `https://agent.robinhood.com/mcp/trading` | The Robinhood MCP trading server. Override only if Robinhood changes the URL. |
| `ROBINVIEW_REPO` | resolved from `git remote origin`, then `backyarddd/RobinView` | The `owner/name` GitHub repository the auto-updater checks for new releases. Set this on a fork so the updater tracks your repository. |

## Preferences (in-app, persisted locally)

These are set from the UI and saved in the browser's `localStorage`, not via environment
variables:

| Preference | Where | Storage key |
|------------|-------|-------------|
| 12-hour / 24-hour clock | Settings > Preferences | `robinview.prefs` |
| Watchlists | Watchlist panel | `robinview.watchlists.v2` |
| Price alerts | Alerts panel | `robinview.alerts` |
| Chart drawings (per symbol) | Chart | `robinview.drawings.<SYMBOL>` |
| Indicator parameters | Indicators menu | `robinview.indicatorParams` |
| Drawing toolbar visibility | Chart | `robinview.drawToolbar` |

You can clear drawings, or reset everything, from **Settings > Local data**.

## Data sources

- **Market data** (quotes, candles, search, fundamentals, news, screener): the public, keyless
  Yahoo Finance endpoints, cached per request. Swapping vendors (Polygon, Finnhub, and so on) is a
  contained change in `server/provider/quotes.ts` and `server/provider/history.ts`.
- **Account data** (accounts, positions, portfolio, orders): your own Robinhood MCP
  authorization. Nothing is copied from any other application.
- **Update checks**: the public, unauthenticated GitHub REST API (rate-limited to 60 requests per
  hour per IP, which an hourly check never approaches).
