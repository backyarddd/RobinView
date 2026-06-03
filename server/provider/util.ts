// Shared helpers for the server data providers - numeric coercion, rounding,
// and the Yahoo Finance HTTP primitives (timeout fetch + cookie/crumb auth).
// Previously these were copy-pasted across quotes/history/news/screener/
// fundamentals; this is the single source of truth.

export const YAHOO_UA = "Mozilla/5.0 (RobinView)";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A known client-side / validation / not-connected error. The HTTP layer maps
 * the attached `status` to a 4xx (vs. 502 for genuine upstream failures), while
 * keeping the {error} JSON body shape the client expects.
 */
export function clientError(message: string, status = 409): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

/** Coerce to a finite number, defaulting to 0 (for required fields). */
export function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

/** Coerce to a finite number or undefined (for optional fields). */
export function numU(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/** Unwrap Yahoo's `{ raw, fmt }` numeric shape (or a bare number) → number | undefined. */
export function rawNum(v: any): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "object" ? v.raw : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 9000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "User-Agent": YAHOO_UA, ...(init.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ── Yahoo cookie + crumb (required by the v10 quoteSummary / screener APIs) ──
export interface YahooCrumb {
  cookie: string;
  crumb: string;
  at: number;
}
let crumbCache: YahooCrumb | null = null;
const CRUMB_TTL = 30 * 60_000;

export async function getYahooCrumb(force = false): Promise<YahooCrumb | null> {
  if (!force && crumbCache && Date.now() - crumbCache.at < CRUMB_TTL) return crumbCache;
  try {
    let cookie = "";
    for (const host of ["https://fc.yahoo.com", "https://finance.yahoo.com"]) {
      try {
        const res = await fetchWithTimeout(host, {}, 7000);
        const sc = res.headers.get("set-cookie");
        if (sc) {
          cookie = sc.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
          if (cookie) break;
        }
      } catch {
        /* try next host */
      }
    }
    if (!cookie) return null;
    const res = await fetchWithTimeout(
      "https://query2.finance.yahoo.com/v1/test/getcrumb",
      { headers: { Cookie: cookie } },
      7000,
    );
    if (!res.ok) return null;
    const crumb = (await res.text()).trim();
    if (!crumb || crumb.includes("<")) return null;
    crumbCache = { cookie, crumb, at: Date.now() };
    return crumbCache;
  } catch {
    return null;
  }
}
