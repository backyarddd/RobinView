import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { NewsItem } from "../../lib/api";
import { timeAgo } from "../../lib/format";

export function NewsPanel({ symbol }: { symbol: string }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    setItems([]);
    api
      .news(symbol)
      .then((n) => {
        if (!alive) return;
        setItems(n);
        setState("ready");
      })
      .catch(() => {
        if (!alive) return;
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [symbol]);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">News</span>
        <span className="spacer" />
        <span className="eyebrow mono">{symbol}</span>
      </div>

      <div className="panel-body">
        {state === "loading" &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="news-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="skel" style={{ height: 13, width: "92%", marginBottom: 7 }} />
                <div className="skel" style={{ height: 13, width: "60%", marginBottom: 9 }} />
                <div className="skel" style={{ height: 10, width: 96 }} />
              </div>
              <div className="skel news-thumb" />
            </div>
          ))}

        {state === "error" && (
          <div className="empty">News unavailable</div>
        )}

        {state === "ready" && items.length === 0 && (
          <div className="empty">No recent headlines</div>
        )}

        {state === "ready" &&
          items.map((n, i) => (
            <a
              key={`${n.link}-${i}`}
              className="news-row"
              href={n.link}
              target="_blank"
              rel="noreferrer"
            >
              <div className="news-main">
                <div className="news-title">{n.title}</div>
                <div className="news-meta">
                  {n.publisher && <span className="news-pub">{n.publisher}</span>}
                  {n.publisher && n.publishedAt != null && <span className="news-dot">·</span>}
                  {n.publishedAt != null && <span className="mono">{timeAgo(n.publishedAt)}</span>}
                </div>
              </div>
              {n.thumbnail && (
                <img className="news-thumb" src={n.thumbnail} alt="" loading="lazy" />
              )}
            </a>
          ))}
      </div>
    </div>
  );
}
