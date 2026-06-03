import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { ScreenerRow } from "../../lib/api";
import { useStore } from "../../store/useStore";
import { ChangePill, SymBadge } from "../common/bits";
import { price as fmtPrice, compactNum, compactMoney } from "../../lib/format";

type Preset = "day_gainers" | "day_losers" | "most_actives";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "day_gainers", label: "Top Gainers" },
  { id: "day_losers", label: "Top Losers" },
  { id: "most_actives", label: "Most Active" },
];

type SortKey = "symbol" | "price" | "changePct" | "volume" | "marketCap" | "peRatio";
type Dir = "asc" | "desc";

const COLS: { key: SortKey; label: string }[] = [
  { key: "symbol", label: "Symbol" },
  { key: "price", label: "Price" },
  { key: "changePct", label: "Change" },
  { key: "volume", label: "Volume" },
  { key: "marketCap", label: "Mkt Cap" },
  { key: "peRatio", label: "P/E" },
];

const POLL_MS = 15000;

export function ScreenerView({ onOpenSymbol }: { onOpenSymbol?: (s: string) => void } = {}) {
  const select = useStore((s) => s.select);
  const open = onOpenSymbol ?? select;
  const [preset, setPreset] = useState<Preset>("day_gainers");
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: "changePct", dir: "desc" });

  useEffect(() => {
    let alive = true;
    setState("loading");
    setRows([]);
    const tick = (initial: boolean) =>
      api
        .screener(preset)
        .then((r) => {
          if (!alive) return;
          setRows(r);
          setState("ready");
        })
        .catch(() => {
          if (!alive || !initial) return;
          setState("error");
        });
    tick(true);
    const id = setInterval(() => tick(false), POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [preset]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const mult = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (key === "symbol") return a.symbol.localeCompare(b.symbol) * mult;
      const av = a[key];
      const bv = b[key];
      const aMissing = av == null || !Number.isFinite(av);
      const bMissing = bv == null || !Number.isFinite(bv);
      // Missing/non-finite values always sink to the end, regardless of direction.
      if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
      if (av === bv) return 0;
      return av < bv ? -mult : mult;
    });
  }, [rows, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "symbol" ? "asc" : "desc" }
    );

  return (
    <div className="pf">
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
          <h1 className="serif" style={{ fontSize: 28, fontWeight: 400 }}>
            Screener
          </h1>
          <span className="dim mono" style={{ fontSize: 12 }}>
            {state === "ready" ? `${rows.length} results · auto-refresh 15s` : "loading…"}
          </span>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="seg">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={preset === p.id ? "on" : ""}
                  onClick={() => setPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-body">
            {state === "error" ? (
              <div className="empty">Screener unavailable</div>
            ) : state === "ready" && rows.length === 0 ? (
              <div className="empty">No matching instruments</div>
            ) : (
              <table className="tbl scr-tbl">
                <thead>
                  <tr>
                    {COLS.map((c) => (
                      <th
                        key={c.key}
                        className={sort.key === c.key ? "sorted" : ""}
                        onClick={() => onSort(c.key)}
                      >
                        {c.label}
                        {sort.key === c.key && (
                          <span className="scr-caret">{sort.dir === "asc" ? " ▲" : " ▼"}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state === "loading"
                    ? Array.from({ length: 12 }).map((_, i) => (
                        <tr key={i} className="scr-skel-row">
                          <td>
                            <div className="cell-sym">
                              <div className="skel" style={{ width: 30, height: 30, borderRadius: 8 }} />
                              <div className="skel" style={{ height: 12, width: 90 }} />
                            </div>
                          </td>
                          {Array.from({ length: 5 }).map((__, j) => (
                            <td key={j}>
                              <div className="skel" style={{ height: 12, width: 54, marginLeft: "auto" }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    : sorted.map((r) => (
                        <tr key={r.symbol} onClick={() => open(r.symbol)}>
                          <td>
                            <div className="cell-sym">
                              <SymBadge symbol={r.symbol} />
                              <div className="nm">
                                <span style={{ fontWeight: 600 }}>{r.symbol}</span>
                                <small>{r.name}</small>
                              </div>
                            </div>
                          </td>
                          <td>{fmtPrice(r.price)}</td>
                          <td>
                            <ChangePill pct={r.changePct} />
                          </td>
                          <td>{r.volume != null ? compactNum(r.volume) : "—"}</td>
                          <td>{r.marketCap != null ? compactMoney(r.marketCap) : "—"}</td>
                          <td>{r.peRatio != null ? r.peRatio.toFixed(2) : "—"}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
