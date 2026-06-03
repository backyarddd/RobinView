import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Frontend dev server proxies API + WebSocket to the RobinView backend (server/index.ts).
const API_PORT = process.env.ROBINVIEW_API_PORT || "8787";

// Single source of truth for the app version: package.json. Injected at build
// time so the UI and the auto-updater agree without hardcoding it twice.
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      "/api": { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      "/ws": { target: `ws://localhost:${API_PORT}`, ws: true },
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
