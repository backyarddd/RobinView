import { useState } from "react";
import type { Timeframe } from "@shared/types";
import { IconCandle, IconLine, IconArea, IconLayers, IconStar } from "../common/icons";
import { useStore } from "../../store/useStore";

export type ChartType = "candles" | "area" | "line";
export type IndicatorKey =
  | "volume"
  | "sma20"
  | "sma50"
  | "ema21"
  | "bb"
  | "vwap"
  | "rsi"
  | "macd";

const TIMEFRAMES: Timeframe[] = ["1D", "1W", "1M", "3M", "1Y", "5Y", "ALL"];

const INDICATORS: { key: IndicatorKey; label: string; hint: string }[] = [
  { key: "volume", label: "Volume", hint: "histogram" },
  { key: "sma20", label: "SMA 20", hint: "moving avg" },
  { key: "sma50", label: "SMA 50", hint: "moving avg" },
  { key: "ema21", label: "EMA 21", hint: "exp. moving avg" },
  { key: "bb", label: "Bollinger Bands", hint: "20, 2σ" },
  { key: "vwap", label: "VWAP", hint: "vol-weighted" },
  { key: "rsi", label: "RSI", hint: "oscillator · 14" },
  { key: "macd", label: "MACD", hint: "oscillator · 12/26/9" },
];

export function ChartToolbar({
  tf,
  setTf,
  type,
  setType,
  indicators,
  toggle,
  symbol,
}: {
  tf: Timeframe;
  setTf: (t: Timeframe) => void;
  type: ChartType;
  setType: (t: ChartType) => void;
  indicators: Set<IndicatorKey>;
  toggle: (k: IndicatorKey) => void;
  symbol: string;
}) {
  const [menu, setMenu] = useState(false);
  const watchlist = useStore((s) => s.watchlist);
  const add = useStore((s) => s.addToWatchlist);
  const remove = useStore((s) => s.removeFromWatchlist);
  const watched = watchlist.includes(symbol);

  return (
    <div className="chart-toolbar">
      <div className="seg">
        {TIMEFRAMES.map((t) => (
          <button key={t} className={tf === t ? "on" : ""} onClick={() => setTf(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="seg">
        <button className={type === "candles" ? "on" : ""} onClick={() => setType("candles")} title="Candlesticks">
          <IconCandle size={15} />
        </button>
        <button className={type === "area" ? "on" : ""} onClick={() => setType("area")} title="Area">
          <IconArea size={15} />
        </button>
        <button className={type === "line" ? "on" : ""} onClick={() => setType("line")} title="Line">
          <IconLine size={15} />
        </button>
      </div>

      <div style={{ position: "relative" }}>
        <button className="btn sm" onClick={() => setMenu((m) => !m)}>
          <IconLayers size={15} /> Indicators
          <span className="mono dim" style={{ fontSize: 11 }}>
            {indicators.size}
          </span>
        </button>
        {menu && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 19 }} onClick={() => setMenu(false)} />
            <div className="ind-menu">
              <div className="eyebrow" style={{ padding: "6px 10px" }}>
                Studies
              </div>
              {INDICATORS.map((ind) => {
                const on = indicators.has(ind.key);
                return (
                  <div key={ind.key} className={`ind-item ${on ? "on" : ""}`} onClick={() => toggle(ind.key)}>
                    <span className="ind-check">{on ? "✓" : ""}</span>
                    <span style={{ flex: 1 }}>{ind.label}</span>
                    <span className="dim" style={{ fontSize: 11 }}>
                      {ind.hint}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="spacer" style={{ flex: 1 }} />

      <button
        className="btn sm ghost"
        onClick={() => (watched ? remove(symbol) : add(symbol))}
        title={watched ? "Remove from watchlist" : "Add to watchlist"}
        style={{ color: watched ? "var(--brass)" : "var(--text-3)" }}
      >
        <IconStar size={15} /> {watched ? "Watching" : "Watch"}
      </button>
    </div>
  );
}
