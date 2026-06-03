import { useEffect, useState, type ReactNode } from "react";
import type { SymbolDetail, OptionsSummary, Quote, Candle, NewsItem } from "@shared/types";
import { api } from "../../lib/api";
import {
  compactMoney,
  compactNum,
  money,
  percent,
  price as fmtPrice,
  fmtDate,
  timeAgo,
  dirClass,
} from "../../lib/format";
import { computePerformance, computeSeasonals, computeTechnicals } from "../../lib/symbolStats";

// Section identity + order. Bonds is intentionally omitted (no free data source
// for single-name equities).
export const SECTIONS: { key: string; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "keystats", label: "Key stats" },
  { key: "pricing", label: "Pricing model" },
  { key: "bidask", label: "Bid & Ask" },
  { key: "ranges", label: "Price ranges" },
  { key: "performance", label: "Performance" },
  { key: "technicals", label: "Technicals" },
  { key: "analysts", label: "Analysts" },
  { key: "earnings", label: "Earnings" },
  { key: "dividends", label: "Dividends" },
  { key: "financials", label: "Financials" },
  { key: "seasonals", label: "Seasonals" },
  { key: "options", label: "Options" },
  { key: "news", label: "Latest news" },
  { key: "notes", label: "Notes" },
];

export interface SectionCtx {
  symbol: string;
  detail: SymbolDetail | null;
  quote?: Quote;
  daily: Candle[];
  weekly: Candle[];
  options: OptionsSummary | null;
}

// ── small building blocks ──
function KV({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className={`v ${cls ?? ""}`}>{v}</span>
    </div>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="si-sec">
      <div className="si-sec-title eyebrow">{title}</div>
      {children}
    </div>
  );
}
function Empty({ t }: { t: string }) {
  return <div className="si-sec-empty">{t}</div>;
}
const has = (n?: number) => n != null && Number.isFinite(n);

// ── sections ──
function Profile({ d, symbol }: { d: SymbolDetail | null; symbol: string }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [symbol]);
  if (!d) return <Empty t="Profile unavailable" />;
  return (
    <>
      {(d.sector || d.industry) && (
        <div className="si-tags">
          {d.sector && <span className="si-tag">{d.sector}</span>}
          {d.industry && <span className="si-tag dim">{d.industry}</span>}
        </div>
      )}
      <div className="si-kv">
        {d.exchange && <KV k="Exchange" v={d.exchange} />}
        {d.country && <KV k="Country" v={d.country} />}
        {has(d.employees) && <KV k="Employees" v={compactNum(d.employees!)} />}
        {d.website && (
          <div className="kv">
            <span className="k">Website</span>
            <a className="v si-link" href={d.website} target="_blank" rel="noreferrer">
              {d.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          </div>
        )}
      </div>
      {d.description && (
        <div className="si-desc">
          <p className={expanded ? "" : "si-clamp"}>{d.description}</p>
          <button className="si-more" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : "Show more"}
          </button>
        </div>
      )}
    </>
  );
}

function KeyStats({ d }: { d: SymbolDetail | null }) {
  if (!d) return <Empty t="No stats" />;
  const rows: [string, string][] = [];
  if (has(d.marketCap)) rows.push(["Market cap", compactMoney(d.marketCap!)]);
  if (has(d.sharesOutstanding)) rows.push(["Shares out", compactNum(d.sharesOutstanding!)]);
  if (has(d.avgVolume)) rows.push(["Avg volume", compactNum(d.avgVolume!)]);
  if (has(d.eps)) rows.push(["EPS (ttm)", d.eps!.toFixed(2)]);
  if (has(d.beta)) rows.push(["Beta", d.beta!.toFixed(2)]);
  if (has(d.week52Low) && has(d.week52High))
    rows.push(["52W range", `${fmtPrice(d.week52Low!)} - ${fmtPrice(d.week52High!)}`]);
  if (!rows.length) return <Empty t="No stats" />;
  return <div className="si-kv">{rows.map(([k, v]) => <KV key={k} k={k} v={v} />)}</div>;
}

function Pricing({ d }: { d: SymbolDetail | null }) {
  if (!d) return <Empty t="No valuation data" />;
  const rows: [string, string][] = [];
  if (has(d.peRatio)) rows.push(["P/E (ttm)", d.peRatio!.toFixed(2)]);
  if (has(d.forwardPe)) rows.push(["Forward P/E", d.forwardPe!.toFixed(2)]);
  if (has(d.pegRatio)) rows.push(["PEG", d.pegRatio!.toFixed(2)]);
  if (has(d.priceToSales)) rows.push(["P/S", d.priceToSales!.toFixed(2)]);
  if (has(d.priceToBook)) rows.push(["P/B", d.priceToBook!.toFixed(2)]);
  if (!rows.length) return <Empty t="No valuation data" />;
  return <div className="si-kv">{rows.map(([k, v]) => <KV key={k} k={k} v={v} />)}</div>;
}

function BidAsk({ q }: { q?: Quote }) {
  if (!q || (q.bid == null && q.ask == null)) return <Empty t="No quote" />;
  const spread = q.bid != null && q.ask != null ? q.ask - q.bid : undefined;
  return (
    <div className="si-kv">
      {q.bid != null && <KV k="Bid" v={fmtPrice(q.bid)} />}
      {q.ask != null && <KV k="Ask" v={fmtPrice(q.ask)} />}
      {spread != null && <KV k="Spread" v={fmtPrice(spread)} />}
      {q.volume != null && <KV k="Volume" v={compactNum(q.volume)} />}
    </div>
  );
}

// A min..max track with a marker at `value`.
function RangeBar({ low, high, value }: { low: number; high: number; value: number }) {
  const pos = high > low ? Math.max(0, Math.min(1, (value - low) / (high - low))) : 0.5;
  return (
    <div className="si-range">
      <span className="si-range-end">{fmtPrice(low)}</span>
      <div className="si-range-track">
        <div className="si-range-marker" style={{ left: `${pos * 100}%` }} />
      </div>
      <span className="si-range-end">{fmtPrice(high)}</span>
    </div>
  );
}
function Ranges({ d, q }: { d: SymbolDetail | null; q?: Quote }) {
  const cur = q?.price;
  const dayLow = q?.dayLow ?? d?.dayLow;
  const dayHigh = q?.dayHigh ?? d?.dayHigh;
  if (!cur) return <Empty t="No quote" />;
  return (
    <div className="si-ranges">
      {has(dayLow) && has(dayHigh) && (
        <div>
          <div className="si-range-lbl">Day range</div>
          <RangeBar low={dayLow!} high={dayHigh!} value={cur} />
        </div>
      )}
      {has(d?.week52Low) && has(d?.week52High) && (
        <div>
          <div className="si-range-lbl">52-week range</div>
          <RangeBar low={d!.week52Low!} high={d!.week52High!} value={cur} />
        </div>
      )}
    </div>
  );
}

function Performance({ daily, weekly }: { daily: Candle[]; weekly: Candle[] }) {
  const perf = computePerformance(daily, weekly);
  if (!perf.length) return <Empty t="No history" />;
  return (
    <div className="si-perf">
      {perf.map((p) => (
        <div key={p.label} className="si-perf-cell">
          <div className="si-perf-lbl">{p.label}</div>
          <div className={`si-perf-val ${dirClass(p.pct)}`}>{percent(p.pct)}</div>
        </div>
      ))}
    </div>
  );
}

function Technicals({ daily }: { daily: Candle[] }) {
  const t = computeTechnicals(daily);
  if (!t) return <Empty t="No history" />;
  const cls =
    t.summary.includes("buy") || t.summary === "Buy" ? "up" : t.summary.includes("ell") ? "down" : "";
  return (
    <>
      <div className="si-tech-head">
        <span className={`si-tech-verdict ${cls}`}>{t.summary}</span>
        <span className="si-tech-counts mono">
          <span className="up">{t.buy} buy</span> · {t.neutral} neutral · <span className="down">{t.sell} sell</span>
        </span>
      </div>
      <div className="si-kv">
        {t.signals.map((s) => (
          <div key={s.name} className="kv">
            <span className="k">{s.name}</span>
            <span className={`v ${s.signal === "buy" ? "up" : s.signal === "sell" ? "down" : ""}`}>
              {s.value} · {s.signal}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Analysts({ d, q }: { d: SymbolDetail | null; q?: Quote }) {
  if (!d || (!has(d.targetMean) && !d.analystTrend)) return <Empty t="No analyst coverage" />;
  const t = d.analystTrend;
  const total = t ? t.strongBuy + t.buy + t.hold + t.sell + t.strongSell : 0;
  const seg = (n: number, c: string) => (n > 0 ? <span style={{ width: `${(n / total) * 100}%`, background: c }} /> : null);
  return (
    <>
      {d.recommendationKey && (
        <div className="si-an-rating">
          <span className="si-an-key">{d.recommendationKey.replace(/_/g, " ")}</span>
          {has(d.recommendationMean) && <span className="dim mono">{d.recommendationMean!.toFixed(2)} / 5</span>}
          {has(d.numberOfAnalysts) && <span className="dim">· {d.numberOfAnalysts} analysts</span>}
        </div>
      )}
      {t && total > 0 && (
        <>
          <div className="si-an-bar">
            {seg(t.strongBuy, "#1e9e63")}
            {seg(t.buy, "#34e29b")}
            {seg(t.hold, "#e3b766")}
            {seg(t.sell, "#ff9f7a")}
            {seg(t.strongSell, "#ff6a57")}
          </div>
          <div className="si-an-legend mono dim">
            {t.strongBuy + t.buy} buy · {t.hold} hold · {t.sell + t.strongSell} sell
          </div>
        </>
      )}
      {has(d.targetMean) && (
        <div className="si-kv" style={{ marginTop: 8 }}>
          {has(d.targetLow) && <KV k="Target low" v={fmtPrice(d.targetLow!)} />}
          <KV k="Target mean" v={fmtPrice(d.targetMean!)} cls={q && d.targetMean! > q.price ? "up" : "down"} />
          {has(d.targetHigh) && <KV k="Target high" v={fmtPrice(d.targetHigh!)} />}
        </div>
      )}
    </>
  );
}

function Earnings({ d }: { d: SymbolDetail | null }) {
  if (!d) return <Empty t="No earnings data" />;
  const pts = (d.earnings ?? []).filter((p) => p.actual != null || p.estimate != null);
  return (
    <>
      {has(d.nextEarningsDate) && <KV k="Next report" v={fmtDate(d.nextEarningsDate!)} />}
      {pts.length > 0 ? (
        <div className="si-eps">
          {pts.map((p, i) => {
            const beat = p.actual != null && p.estimate != null ? p.actual >= p.estimate : null;
            return (
              <div key={i} className="si-eps-row">
                <span className="si-eps-q mono">{p.label}</span>
                <span className="dim mono">est {p.estimate != null ? p.estimate.toFixed(2) : "-"}</span>
                <span className={`mono ${beat == null ? "" : beat ? "up" : "down"}`}>
                  act {p.actual != null ? p.actual.toFixed(2) : "-"}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        !has(d.nextEarningsDate) && <Empty t="No earnings data" />
      )}
    </>
  );
}

function Dividends({ d }: { d: SymbolDetail | null }) {
  if (!d || (!has(d.dividendYield) && !has(d.dividendRate)))
    return <Empty t="No dividend" />;
  return (
    <div className="si-kv">
      {has(d.dividendYield) && <KV k="Yield" v={percent(d.dividendYield!, false)} />}
      {has(d.dividendRate) && <KV k="Rate / yr" v={money(d.dividendRate!)} />}
      {has(d.payoutRatio) && <KV k="Payout" v={percent(d.payoutRatio!, false)} />}
      {has(d.exDividendDate) && <KV k="Ex-date" v={fmtDate(d.exDividendDate!)} />}
    </div>
  );
}

function Financials({ d }: { d: SymbolDetail | null }) {
  const rows = d?.financials ?? [];
  if (!rows.length) return <Empty t="No financials" />;
  return (
    <table className="si-fin">
      <thead>
        <tr>
          <th>Year</th>
          <th>Revenue</th>
          <th>Net income</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.year}>
            <td className="mono">{r.year}</td>
            <td className="mono">{has(r.revenue) ? compactMoney(r.revenue!) : "-"}</td>
            <td className={`mono ${has(r.netIncome) ? dirClass(r.netIncome!) : ""}`}>
              {has(r.netIncome) ? compactMoney(r.netIncome!) : "-"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Seasonals({ weekly }: { weekly: Candle[] }) {
  const s = computeSeasonals(weekly);
  if (!s.length) return <Empty t="No history" />;
  const max = Math.max(...s.map((m) => Math.abs(m.avg)), 0.01);
  return (
    <div className="si-seasonals">
      {s.map((m) => (
        <div key={m.month} className="si-sea-col" title={`${m.month}: ${percent(m.avg)} avg (${m.years}y)`}>
          <div className="si-sea-bar-wrap">
            <div
              className={`si-sea-bar ${m.avg >= 0 ? "up" : "down"}`}
              style={{ height: `${(Math.abs(m.avg) / max) * 100}%` }}
            />
          </div>
          <div className="si-sea-lbl">{m.month[0]}</div>
        </div>
      ))}
    </div>
  );
}

function Options({ o }: { o: OptionsSummary | null }) {
  if (!o) return <Empty t="Loading…" />;
  if (!o.hasOptions) return <Empty t="No options listed" />;
  return (
    <div className="si-kv">
      {o.expiration != null && <KV k="Nearest expiry" v={fmtDate(o.expiration)} />}
      {o.expirations && <KV k="Expirations" v={String(o.expirations.length)} />}
      <KV k="Calls / Puts" v={`${o.callCount ?? 0} / ${o.putCount ?? 0}`} />
      {has(o.putCallRatio) && <KV k="Put/Call (OI)" v={o.putCallRatio!.toFixed(2)} />}
      {has(o.atmStrike) && <KV k="ATM strike" v={fmtPrice(o.atmStrike!)} />}
      {has(o.atmCallIV) && <KV k="ATM call IV" v={percent(o.atmCallIV!, false)} />}
    </div>
  );
}

function LatestNews({ symbol }: { symbol: string }) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    setItems(null);
    api.news(symbol).then((n) => alive && setItems(n)).catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [symbol]);
  if (items == null) return <Empty t="Loading…" />;
  if (!items.length) return <Empty t="No recent headlines" />;
  return (
    <div className="si-news">
      {items.slice(0, 6).map((n, i) => (
        <a key={`${n.link}-${i}`} className="si-news-row" href={n.link} target="_blank" rel="noreferrer">
          <div className="si-news-title">{n.title}</div>
          <div className="si-news-meta mono dim">
            {n.publisher ? `${n.publisher} · ` : ""}
            {n.publishedAt != null ? timeAgo(n.publishedAt) : ""}
          </div>
        </a>
      ))}
    </div>
  );
}

function Notes({ symbol }: { symbol: string }) {
  const key = `robinview.notes.${symbol}`;
  const [text, setText] = useState("");
  useEffect(() => {
    setText(localStorage.getItem(key) || "");
  }, [key]);
  return (
    <textarea
      className="si-notes"
      placeholder={`Private notes on ${symbol} (saved on this device)…`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        try {
          if (e.target.value) localStorage.setItem(key, e.target.value);
          else localStorage.removeItem(key);
        } catch {
          /* quota */
        }
      }}
    />
  );
}

// Dispatcher: render one section's body by key.
export function SectionBody({ k, ctx }: { k: string; ctx: SectionCtx }) {
  switch (k) {
    case "profile": return <Profile d={ctx.detail} symbol={ctx.symbol} />;
    case "keystats": return <KeyStats d={ctx.detail} />;
    case "pricing": return <Pricing d={ctx.detail} />;
    case "bidask": return <BidAsk q={ctx.quote} />;
    case "ranges": return <Ranges d={ctx.detail} q={ctx.quote} />;
    case "performance": return <Performance daily={ctx.daily} weekly={ctx.weekly} />;
    case "technicals": return <Technicals daily={ctx.daily} />;
    case "analysts": return <Analysts d={ctx.detail} q={ctx.quote} />;
    case "earnings": return <Earnings d={ctx.detail} />;
    case "dividends": return <Dividends d={ctx.detail} />;
    case "financials": return <Financials d={ctx.detail} />;
    case "seasonals": return <Seasonals weekly={ctx.weekly} />;
    case "options": return <Options o={ctx.options} />;
    case "news": return <LatestNews symbol={ctx.symbol} />;
    case "notes": return <Notes symbol={ctx.symbol} />;
    default: return null;
  }
}

export { Section };
