import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Fundamentals } from "../../lib/api";
import { compactMoney, compactNum, percent, fmtDate, price as fmtPrice } from "../../lib/format";

type Row = { k: string; v: string };

function buildRows(f: Fundamentals): Row[] {
  const rows: Row[] = [];
  const push = (k: string, val: number | undefined, fmt: (n: number) => string) => {
    if (val != null && Number.isFinite(val)) rows.push({ k, v: fmt(val) });
  };
  push("Market Cap", f.marketCap, compactMoney);
  push("P/E", f.peRatio, (n) => n.toFixed(2));
  push("Fwd P/E", f.forwardPe, (n) => n.toFixed(2));
  push("EPS", f.eps, (n) => n.toFixed(2));
  push("Div Yield", f.dividendYield, (n) => percent(n, false));
  push("Beta", f.beta, (n) => n.toFixed(2));
  if (f.week52Low != null && f.week52High != null) {
    rows.push({ k: "52W Range", v: `${fmtPrice(f.week52Low)} – ${fmtPrice(f.week52High)}` });
  }
  push("Avg Vol", f.avgVolume, compactNum);
  push("Shares Out", f.sharesOutstanding, compactNum);
  if (f.nextEarningsDate != null && Number.isFinite(f.nextEarningsDate)) {
    rows.push({ k: "Next Earnings", v: fmtDate(f.nextEarningsDate) });
  }
  return rows;
}

export function SymbolInfo({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Fundamentals | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    setState("loading");
    setData(null);
    setExpanded(false);
    api
      .fundamentals(symbol)
      .then((f) => {
        if (!alive) return;
        setData(f);
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

  const rows = data ? buildRows(data) : [];

  return (
    <div className="panel si-panel">
      <div className="panel-head">
        <span className="panel-title">Profile</span>
        <span className="spacer" />
        <span className="eyebrow mono">{symbol}</span>
      </div>

      <div className="panel-body panel-pad">
        {state === "loading" && (
          <>
            <div className="si-head">
              <div className="skel" style={{ height: 18, width: "70%", marginBottom: 8 }} />
              <div className="skel" style={{ height: 11, width: "45%" }} />
            </div>
            <div style={{ marginTop: 12 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="kv">
                  <span className="skel" style={{ height: 11, width: 70 }} />
                  <span className="skel" style={{ height: 11, width: 54 }} />
                </div>
              ))}
            </div>
          </>
        )}

        {state === "error" && (
          <div className="empty" style={{ height: "auto", padding: "28px 8px" }}>
            Profile unavailable
          </div>
        )}

        {state === "ready" && data && (
          <>
            <div className="si-head">
              <div className="si-name serif">{data.longName || symbol}</div>
              {(data.sector || data.industry) && (
                <div className="si-tags">
                  {data.sector && <span className="si-tag">{data.sector}</span>}
                  {data.industry && <span className="si-tag dim">{data.industry}</span>}
                </div>
              )}
            </div>

            {rows.length > 0 ? (
              <div className="si-kv">
                {rows.map((r) => (
                  <div key={r.k} className="kv">
                    <span className="k">{r.k}</span>
                    <span className="v">{r.v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty" style={{ height: "auto", padding: "20px 8px" }}>
                No stats available
              </div>
            )}

            {data.description && (
              <div className="si-desc">
                <p className={expanded ? "" : "si-clamp"}>{data.description}</p>
                <button className="si-more" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? "Show less" : "Show more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
