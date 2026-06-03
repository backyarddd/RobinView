<div align="center">
<img src="../public/logo.svg" alt="RobinView" width="280" />

# Installation Guide
</div>

This guide walks through installing RobinView from scratch, running it in development,
building it for production, and connecting your Robinhood account. For the full list of
configuration options see [CONFIGURATION.md](./CONFIGURATION.md); for a feature walkthrough
see [USAGE.md](./USAGE.md).

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18 LTS or newer (20+ recommended) | Ships with `npm`. `git` is also required for the in-app updater. |
| Git | any recent version | Used to clone the repo and by the auto-updater (`git pull`). |
| OS | macOS, Linux, or Windows | Tested on macOS and Linux. |

Check your versions:

```bash
node -v
npm -v
git --version
```

## 1. Clone and install

```bash
git clone https://github.com/backyarddd/RobinView.git
cd RobinView
npm install
```

`npm install` pulls the frontend (React, lightweight-charts, Zustand) and backend
(Express, ws, the Model Context Protocol SDK) dependencies. No global tools are needed.

## 2. Run in development

```bash
npm run dev
```

This starts two processes via `concurrently`:

- **Vite** dev server on `http://localhost:5273` (the app you open in the browser)
- **API + WebSocket** server on `http://localhost:8787` (data, quotes, account, updates)

Vite proxies `/api` and `/ws` to the backend, so you only ever visit `http://localhost:5273`.
The terminal comes up immediately on **real, keyless live market data**: charts, search,
watchlists and the heatmap all work with no account and no login.

## 3. Connect Robinhood (optional)

Click **Connect Robinhood** in the top-right, or open **Settings > Connection**. RobinView:

1. Runs OAuth discovery against `agent.robinhood.com` and dynamically registers itself as its
   own OAuth client using PKCE (there are no secrets to manage).
2. Opens Robinhood's authorization page in a popup. You log in and approve, opening a Robinhood
   **Agentic** account if you do not already have one.
3. Receives the redirect on its local callback, completes the token exchange, and connects.

The session is stored under `~/.robinview` and resumes automatically on restart. Disconnect
anytime from the **Robinhood** badge in the top bar or from Settings.

> Want to explore without an account? Run in demo mode:
> ```bash
> ROBINVIEW_MODE=demo npm run dev
> ```
> Demo mode uses a deterministic market simulator with simulated accounts and positions. It is
> handy for screenshots and CI. Historical candles are still real (same source as live).

## 4. Production build

```bash
npm run build      # type-checks and bundles the frontend into dist/
npm start          # one Node process serves the API, WebSocket, and the built app on :8787
```

In production the single Node process serves the static frontend from `dist/` alongside the
API and WebSocket, so you only need to expose port `8787` (or whatever you set
`ROBINVIEW_API_PORT` to). If you deploy behind a domain, set `ROBINVIEW_PUBLIC_URL` so the
Robinhood OAuth redirect resolves correctly. See [CONFIGURATION.md](./CONFIGURATION.md).

## 5. Keeping RobinView up to date

RobinView checks this GitHub repository for a newer release on launch and once an hour. When an
update is available you will see an **Update available** toast and a marker on the Settings icon.
Open **Settings > Updates** and click **Update now**, or use the toast. RobinView runs
`git pull --ff-only` and `npm install` in place and then reloads.

You can always update manually:

```bash
git pull
npm install
npm run build   # only needed for a production deployment
```

## Verifying the install

```bash
npm run typecheck   # strict TypeScript, expect no errors
npm test            # indicator math unit tests, expect all passing
curl http://localhost:8787/api/health   # {"data":{"mode":"live","ok":true,...}}
```

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| `EADDRINUSE` on 8787 or 5273 | Another RobinView (or other) process holds the port. Stop it, or change `ROBINVIEW_API_PORT` / the Vite `server.port`. |
| Charts show but quotes look frozen | The keyless market-data source may be rate-limiting or temporarily unreachable. RobinView serves last-good values and falls back to a deterministic generator so charts always render. |
| "Connect Robinhood" does nothing | A popup blocker may have stopped the OAuth window. Allow popups for `localhost` and retry. |
| Update check never finds anything | You may be offline, rate-limited by GitHub, or the repository has no releases/tags yet. The check is best-effort and silently no-ops. |
| Auto-update fails with a git error | The updater is fast-forward only. Commit or stash local changes, or update manually with `git pull`. |
