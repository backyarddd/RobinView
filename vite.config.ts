import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend dev server proxies API + WebSocket to the RobinView backend (server/index.ts).
const API_PORT = process.env.ROBINVIEW_API_PORT || "8787";

export default defineConfig({
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
