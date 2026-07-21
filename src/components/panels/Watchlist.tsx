import { useState } from "react";
import { useStore } from "../../store/useStore";
import { useTrails } from "../../hooks/useTrails";
import { Sparkline, ChangePill } from "../common/bits";
import { CompanyLogo } from "../common/CompanyLogo";
import { IconTrash, IconPlus } from "../common/icons";
import { price as fmtPrice } from "../../lib/format";

export function Watchlist({ onAdd, flush = false }: { onAdd: () => void; flush?: boolean }) {
  const watchlist = useStore((s) => s.watchlist);
  const watchlists = useStore((s) => s.watchlists);
  const activeListId = useStore((s) => s.activeListId);
  const setActiveWatchlist = useStore((s) => s.setActiveWatchlist);
  const createWatchlist = useStore((s) => s.createWatchlist);
  const renameWatchlist = useStore((s) => s.renameWatchlist);
  const deleteWatchlist = useStore((s) => s.deleteWatchlist);
  const quotes = useStore((s) => s.quotes);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const remove = useStore((s) => s.removeFromWatchlist);
  const trails = useTrails(watchlist);
  const [menu, setMenu] = useState(false);

  const active = watchlists.find((l) => l.id === activeListId);

  return (
    <div className={flush ? "wl-flush" : "panel"} style={flush ? undefined : { flex: 1, minHeight: 0 }}>
      <div className="panel-head">
        <div style={{ position: "relative" }}>
          <button className="wl-switch" onClick={() => setMenu((m) => !m)} title="Switch watchlist">
            <span className="panel-title">{active?.name ?? "Watchlist"}</span>
            <span className="wl-caret">▾</span>
          </button>
          {menu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 19 }} onClick={() => setMenu(false)} />
              <div className="wl-menu">
                {watchlists.map((l) => (
                  <div
                    key={l.id}
                    className={`wl-menu-item ${l.id === activeListId ? "on" : ""}`}
                    onClick={() => {
                      setActiveWatchlist(l.id);
                      setMenu(false);
                    }}
                  >
                    <span style={{ flex: 1 }}>{l.name}</span>
                    <span className="mono dim" style={{ fontSize: 11 }}>{l.symbols.length}</span>
                    <button
                      className="wl-mini"
                      title="Rename"
                      onClick={(e) => {
                        e.stopPropagation();
                        const n = prompt("Rename list", l.name);
                        if (n) renameWatchlist(l.id, n);
                      }}
                    >
                      ✎
                    </button>
                    {watchlists.length > 1 && (
                      <button
                        className="wl-mini"
                        title="Delete list"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${l.name}"?`)) deleteWatchlist(l.id);
                        }}
                      >
                        <IconTrash size={13} />
                      </button>
                    )}
                  </div>
                ))}
                <div className="wl-menu-new" onClick={() => { const n = prompt("New watchlist name", "New List"); if (n !== null) { createWatchlist(n); setMenu(false); } }}>
                  <IconPlus size={13} /> New watchlist
                </div>
              </div>
            </>
          )}
        </div>
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
          // Real intraday close series from the quote feed; the live tick trail
          // is only a fallback for symbols whose quote has no spark data.
          const spark = q?.spark && q.spark.length > 1 ? q.spark : (trails[sym] ?? []);
          return (
            <div
              key={sym}
              className={`wl-row ${selected === sym ? "sel" : ""}`}
              onClick={() => select(sym)}
            >
              <div className="wl-left">
                <CompanyLogo symbol={sym} size={26} radius={7} />
                <div style={{ minWidth: 0 }}>
                  <div className="wl-sym">{sym}</div>
                  <div className="wl-name">{q?.name ?? ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="wl-spark">
                  {spark.length > 1 ? (
                    <Sparkline data={spark} />
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
