import type { NewsItem } from "../../shared/types.js";
import { fetchWithTimeout } from "./util.js";

// Real headlines for a symbol, keyless, from two Yahoo Finance feeds combined:
//  1. the search endpoint  - gives publisher + thumbnail + precise timestamps
//  2. the RSS headline feed - gives an article description/standfirst
// We merge them by link/title so each card can show a thumbnail AND a summary.
const TTL = 5 * 60_000; // 5 min
const cache = new Map<string, { at: number; items: NewsItem[] }>();

export async function fetchNews(symbol: string): Promise<NewsItem[]> {
  const sym = symbol.toUpperCase();
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < TTL) return hit.items;

  try {
    const [searchItems, rss] = await Promise.all([
      fetchSearchNews(sym).catch(() => [] as NewsItem[]),
      fetchRssNews(sym).catch(() => [] as NewsItem[]),
    ]);

    // Index RSS summaries by a normalized key so we can attach them to the
    // richer search items (which carry thumbnails the RSS feed lacks).
    const summaryByKey = new Map<string, string>();
    for (const r of rss) {
      if (r.summary) {
        summaryByKey.set(r.link, r.summary);
        summaryByKey.set(normTitle(r.title), r.summary);
      }
    }

    let items: NewsItem[];
    if (searchItems.length) {
      items = searchItems.map((it) => {
        const summary = summaryByKey.get(it.link) ?? summaryByKey.get(normTitle(it.title));
        return summary ? { ...it, summary } : it;
      });
    } else {
      // Search returned nothing - the RSS feed alone still gives a usable list.
      items = rss;
    }

    cache.set(sym, { at: Date.now(), items });
    return items;
  } catch {
    return hit ? hit.items : [];
  }
}

// ── Yahoo search endpoint: titles, publishers, thumbnails, timestamps ──
async function fetchSearchNews(sym: string): Promise<NewsItem[]> {
  const url =
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}` +
    `&newsCount=15&quotesCount=0`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) return [];
  const json: any = await res.json();
  const news: any[] = json?.news ?? [];
  return news
    .filter((n) => n && n.title && n.link)
    .map((n) => {
      const thumb = pickThumbnail(n?.thumbnail?.resolutions);
      return {
        title: String(n.title),
        publisher: n.publisher ? String(n.publisher) : undefined,
        link: String(n.link),
        publishedAt:
          typeof n.providerPublishTime === "number" ? n.providerPublishTime * 1000 : undefined,
        thumbnail: thumb,
        summary: typeof n.summary === "string" && n.summary.trim() ? clean(n.summary) : undefined,
      } as NewsItem;
    });
}

// ── Yahoo RSS headline feed: carries <description> per article ──
async function fetchRssNews(sym: string): Promise<NewsItem[]> {
  const url =
    `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}` +
    `&region=US&lang=en-US`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) return [];
  const xml = await res.text();
  return parseRss(xml);
}

function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = clean(tag(block, "title"));
    const link = clean(tag(block, "link"));
    if (!title || !link) continue;
    const description = clean(tag(block, "description"));
    const pub = tag(block, "pubDate");
    const ts = pub ? Date.parse(pub) : NaN;
    items.push({
      title,
      link,
      publisher: clean(tag(block, "source")) || undefined,
      publishedAt: Number.isFinite(ts) ? ts : undefined,
      summary: description || undefined,
    });
  }
  return items;
}

// Extract the inner text of the first <name>…</name> (handles CDATA wrapping).
function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1] : "";
}

// Strip CDATA + HTML tags, decode the common entities, collapse whitespace.
function clean(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function pickThumbnail(resolutions: any): string | undefined {
  if (!Array.isArray(resolutions) || resolutions.length === 0) return undefined;
  const tagged = resolutions.find((r) => r?.tag === "140x140") ?? resolutions[0];
  const url = tagged?.url;
  return typeof url === "string" && url ? url : undefined;
}
