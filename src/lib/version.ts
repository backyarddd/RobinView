// App version, injected from package.json at build time by Vite (see
// vite.config.ts `define`). The fallback keeps type-checkers and any
// non-Vite tooling happy; at runtime the real value is always substituted.
declare const __APP_VERSION__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
