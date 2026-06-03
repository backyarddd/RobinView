import type { NewsItem } from "../../shared/types.js";
import { fetchWithTimeout } from "./util.js";

// Real headlines from the Yahoo Finance search endpoint (keyless).
// Same host used by quotes.ts search; json.news[] carries the articles.
const TTL = 5 * 60_000; // 5 min
const cache = new Map<string, { at: number; items: NewsItem[] }>();

export async function fetchNews(symbol: string): Promise<NewsItem[]> {
  const sym = symbol.toUpperCase();
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < TTL) return hit.items;

  try {
    const url =
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}` +
      `&newsCount=12&quotesCount=0`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return hit ? hit.items : [];

    const json: any = await res.json();
    const news: any[] = json?.news ?? [];
    const items: NewsItem[] = news
      .filter((n) => n && n.title && n.link)
      .map((n) => {
        const thumb = pickThumbnail(n?.thumbnail?.resolutions);
        return {
          title: String(n.title),
          publisher: n.publisher ? String(n.publisher) : undefined,
          link: String(n.link),
          publishedAt:
            typeof n.providerPublishTime === "number"
              ? n.providerPublishTime * 1000
              : undefined,
          thumbnail: thumb,
        } as NewsItem;
      });

    cache.set(sym, { at: Date.now(), items });
    return items;
  } catch {
    // Serve last-good on transient errors.
    return hit ? hit.items : [];
  }
}

function pickThumbnail(resolutions: any): string | undefined {
  if (!Array.isArray(resolutions) || resolutions.length === 0) return undefined;
  // Prefer the smallest "tag" (thumbnails) if present, else the first url.
  const tagged = resolutions.find((r) => r?.tag === "140x140") ?? resolutions[0];
  const url = tagged?.url;
  return typeof url === "string" && url ? url : undefined;
}
