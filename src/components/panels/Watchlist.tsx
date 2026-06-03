import { useStore } from "../../store/useStore";
import { useTrails } from "../../hooks/useTrails";
import { Sparkline, ChangePill } from "../common/bits";
import { IconTrash, IconPlus } from "../common/icons";
import { price as fmtPrice } from "../../lib/format";

export function Watchlist({ onAdd }: { onAdd: () => void }) {
  const watchlist = useStore((s) => s.watchlist);
  const quotes = useStore((s) => s.quotes);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const remove = useStore((s) => s.removeFromWatchlist);
  const trails = useTrails(watchlist);

  return (
    <div className="panel" style={{ flex: 1, minHeight: 0 }}>
      <div className="panel-head">
        <span className="panel-title">Watchlist</span>
        <span className="mono dim" style={{ fontSize: 11 }}>
          {watchlist.length}
        </span>
        <div className="spacer" />
        <button className="iconbtn" onClick={onAdd} title="Add symbol (⌘K)">
          <IconPlus size={16} />
        </button>
      </div>
      <div className="panel-body">
        {watchlist.length === 0 && (
          <div className="empty">
            <span>No symbols yet</span>
            <button className="btn sm" onClick={onAdd}>
              <IconPlus size={14} /> Add symbol
            </button>
          </div>
        )}
        {watchlist.map((sym) => {
          const q = quotes[sym];
          const trail = trails[sym] ?? [];
          return (
            <div
              key={sym}
              className={`wl-row ${selected === sym ? "sel" : ""}`}
              onClick={() => select(sym)}
            >
              <div style={{ minWidth: 0 }}>
                <div className="wl-sym">{sym}</div>
                <div className="wl-name">{q?.name ?? ""}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="wl-spark">
                  {trail.length > 1 ? (
                    <Sparkline data={trail} />
                  ) : (
                    <div className="skel" style={{ width: 56, height: 22 }} />
                  )}
                </div>
                <div className="wl-right">
                  <div className="wl-price">{q ? fmtPrice(q.price) : "—"}</div>
                  {q && <ChangePill pct={q.changePct} />}
                </div>
                <button
                  className="iconbtn wl-del"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(sym);
                  }}
                  title="Remove"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
