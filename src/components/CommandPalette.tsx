import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchResult } from "@shared/types";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import { IconSearch, IconWallet, IconGrid, IconBell, IconTerminal, IconArrow, IconFunnel } from "./common/icons";
import type { View } from "./AppShell";

interface NavCmd {
  id: View;
  label: string;
  icon: JSX.Element;
}
const NAV: NavCmd[] = [
  { id: "terminal", label: "Open Terminal", icon: <IconTerminal size={16} /> },
  { id: "portfolio", label: "Open Portfolio", icon: <IconWallet size={16} /> },
  { id: "markets", label: "Open Markets", icon: <IconGrid size={16} /> },
  { id: "screener", label: "Open Screener", icon: <IconFunnel size={16} /> },
  { id: "alerts", label: "Open Alerts", icon: <IconBell size={16} /> },
];

export function CommandPalette({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (v: View) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const select = useStore((s) => s.select);
  const watchlist = useStore((s) => s.watchlist);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      api.search(q).then(setResults).catch(() => setResults([]));
    }, 130);
    return () => clearTimeout(id);
  }, [q]);

  const navMatches = useMemo(
    () => (q ? NAV.filter((n) => n.label.toLowerCase().includes(q.toLowerCase())) : NAV),
    [q],
  );

  // flat list for keyboard nav: symbols first, then nav
  const flat = useMemo(
    () => [
      ...results.map((r) => ({ kind: "sym" as const, r })),
      ...navMatches.map((n) => ({ kind: "nav" as const, n })),
    ],
    [results, navMatches],
  );

  useEffect(() => setActive(0), [flat.length]);

  const pick = (i: number) => {
    const item = flat[i];
    if (!item) return;
    if (item.kind === "sym") {
      select(item.r.symbol);
      onNavigate("terminal");
    } else {
      onNavigate(item.n.id);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <IconSearch size={20} />
          <input
            ref={inputRef}
            value={q}
            placeholder="Search symbols, companies, or commands…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(flat.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                pick(active);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
          />
        </div>
        <div className="cmdk-list">
          {results.length > 0 && <div className="cmdk-sec eyebrow">Symbols</div>}
          {results.map((r, i) => (
            <div
              key={r.symbol}
              className={`cmdk-row ${active === i ? "active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(i)}
            >
              <div className="sym-badge">{r.symbol.slice(0, 4)}</div>
              <div className="grow">
                <div className="r-sym">{r.symbol}</div>
                <div className="r-name">{r.name}</div>
              </div>
              {watchlist.includes(r.symbol) && (
                <span className="pill flat" style={{ fontSize: 10 }}>
                  watching
                </span>
              )}
              <IconArrow size={15} />
            </div>
          ))}

          <div className="cmdk-sec eyebrow">Navigation</div>
          {navMatches.map((n, j) => {
            const i = results.length + j;
            return (
              <div
                key={n.id}
                className={`cmdk-row ${active === i ? "active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
              >
                {n.icon}
                <div className="grow">
                  <div className="r-sym" style={{ fontWeight: 500 }}>
                    {n.label}
                  </div>
                </div>
                <IconArrow size={15} />
              </div>
            );
          })}

          {q && flat.length === 0 && <div className="empty" style={{ height: 120 }}>No matches for "{q}"</div>}
        </div>
        <div className="cmdk-foot">
          <span>
            <kbd>↑↓</kbd>navigate
          </span>
          <span>
            <kbd>↵</kbd>open
          </span>
          <span>
            <kbd>esc</kbd>close
          </span>
        </div>
      </div>
    </div>
  );
}
