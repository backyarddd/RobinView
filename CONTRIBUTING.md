# Contributing to RobinView

Thanks for your interest in RobinView. This is a focused project; the notes below should get you
productive quickly.

## Development setup

```bash
git clone https://github.com/backyarddd/RobinView.git
cd RobinView
npm install
npm run dev
```

Open `http://localhost:5273`. See [docs/INSTALL.md](./docs/INSTALL.md) for prerequisites and
[docs/CONFIGURATION.md](./docs/CONFIGURATION.md) for environment variables.

## Checks before opening a PR

```bash
npm run typecheck   # strict TypeScript, must pass with no errors
npm test            # indicator math unit tests, must pass
npm run build       # must build cleanly
```

Please make sure all three are green.

## Project layout

| Path | What lives there |
|------|------------------|
| `src/components/` | React UI (chart, panels, views, shell) |
| `src/store/useStore.ts` | Zustand store: app state, WebSocket client, actions |
| `src/lib/` | Pure helpers: indicators, formatting, the API client, version |
| `server/index.ts` | Express + WebSocket server and the tick loop |
| `server/provider/` | Data providers: quotes, history, news, fundamentals, screener, Robinhood MCP, updates |
| `shared/types.ts` | The normalized domain model shared by client and server |
| `docs/` | Install, usage, and configuration guides |

## Conventions

- TypeScript everywhere; keep it strict and avoid `any` at module boundaries.
- Normalize wire data to numbers once, at the provider seam (see `shared/types.ts`).
- Indicator math is pure and unit-tested. Add a test when you add or change an indicator.
- Keep files reasonably small and validate input at system boundaries.
- Prefer plain punctuation over em dashes in prose and UI strings.

## Data and safety

- Market data must stay keyless and free (Yahoo Finance endpoints today). Swapping vendors should
  be a contained change in `server/provider/quotes.ts` and `history.ts`.
- Account data comes only from the user's own Robinhood MCP authorization. Never copy credentials
  or data from any other application.
- Never commit secrets, tokens, or `.env` files.

## License

By contributing you agree that your contributions are licensed under the project's
[MIT License](./LICENSE).
