import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { SymbolDetail, OptionsSummary, Candle } from "@shared/types";
import { useStore } from "../../store/useStore";
import { CompanyLogo } from "../common/CompanyLogo";
import { IconGear, IconX } from "../common/icons";
import { SECTIONS, SectionBody, Section, type SectionCtx } from "./SymbolSections";

const VIS_KEY = "robinview.infoSections";

// Section visibility (persisted). Missing keys default to visible, so adding a
// new section later turns it on for existing users.
function loadVisible(): Record<string, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(VIS_KEY) || "{}") as Record<string, boolean>;
    const out: Record<string, boolean> = {};
    for (const s of SECTIONS) out[s.key] = raw[s.key] !== false;
    return out;
  } catch {
    return Object.fromEntries(SECTIONS.map((s) => [s.key, true]));
  }
}

export function SymbolInfo({ symbol }: { symbol: string }) {
  const quote = useStore((s) => s.quotes[symbol]);
  const [detail, setDetail] = useState<SymbolDetail | null>(null);
  const [options, setOptions] = useState<OptionsSummary | null>(null);
  const [daily, setDaily] = useState<Candle[]>([]);
  const [weekly, setWeekly] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState<Record<string, boolean>>(loadVisible);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDetail(null);
    setOptions(null);
    setDaily([]);
    setWeekly([]);
    api.symbolDetail(symbol).then((d) => alive && (setDetail(d), setLoading(false))).catch(() => alive && setLoading(false));
    api.options(symbol).then((o) => alive && setOptions(o)).catch(() => {});
    api.candles(symbol, "1Y").then((s) => alive && setDaily(s.candles)).catch(() => {});
    api.candles(symbol, "5Y").then((s) => alive && setWeekly(s.candles)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [symbol]);

  const toggle = (key: string) => {
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(VIS_KEY, JSON.stringify(next));
      } catch {
        /* quota */
      }
      return next;
    });
  };

  const ctx: SectionCtx = { symbol, detail, quote, daily, weekly, options };

  return (
    <div className="panel si-panel">
      <div className="panel-head">
        <span className="panel-title">Symbol info</span>
        <span className="spacer" />
        <div style={{ position: "relative" }}>
          <button
            className={`iconbtn ${menu ? "on" : ""}`}
            title="Choose sections"
            onClick={() => setMenu((m) => !m)}
          >
            <IconGear size={15} />
          </button>
          {menu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 19 }} onClick={() => setMenu(false)} />
              <div className="si-menu">
                <div className="si-menu-head">
                  <span className="eyebrow">Sections</span>
                  <button className="iconbtn" onClick={() => setMenu(false)} aria-label="Close">
                    <IconX size={14} />
                  </button>
                </div>
                {SECTIONS.map((s) => (
                  <label key={s.key} className="si-menu-item">
                    <input type="checkbox" checked={!!visible[s.key]} onChange={() => toggle(s.key)} />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel-body si-body">
        <div className="si-hero">
          <CompanyLogo symbol={symbol} size={40} radius={10} />
          <div className="si-hero-text">
            <div className="si-hero-name serif">{detail?.longName || quote?.name || symbol}</div>
            <div className="si-hero-sub mono dim">
              {symbol}
              {detail?.exchange ? ` · ${detail.exchange}` : ""}
            </div>
          </div>
        </div>

        {loading && !detail ? (
          <div style={{ padding: "8px 0" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="kv">
                <span className="skel" style={{ height: 11, width: 70 }} />
                <span className="skel" style={{ height: 11, width: 54 }} />
              </div>
            ))}
          </div>
        ) : (
          SECTIONS.filter((s) => visible[s.key]).map((s) => (
            <Section key={s.key} title={s.label}>
              <SectionBody k={s.key} ctx={ctx} />
            </Section>
          ))
        )}
      </div>
    </div>
  );
}
