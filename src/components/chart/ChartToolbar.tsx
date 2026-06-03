import { useState } from "react";
import type { Timeframe } from "@shared/types";
import { IconCandle, IconLine, IconArea, IconLayers, IconStar } from "../common/icons";
import { useStore } from "../../store/useStore";

export type ChartType = "candles" | "heikin" | "area" | "baseline" | "line";
export type ScaleMode = "normal" | "log" | "percent";
export type IndicatorKey =
  | "volume"
  | "sma20"
  | "sma50"
  | "sma100"
  | "sma200"
  | "ema9"
  | "ema21"
  | "ema50"
  | "bb"
  | "vwap"
  | "psar"
  | "rsi"
  | "macd"
  | "stoch"
  | "williams"
  | "atr"
  | "obv"
  | "roc";

// Oscillators occupy the lower pane and are mutually exclusive.
export const OSCILLATORS: IndicatorKey[] = ["rsi", "macd", "stoch", "williams", "atr", "obv", "roc"];

const TIMEFRAMES: Timeframe[] = ["1D", "1W", "1M", "3M", "1Y", "5Y", "ALL"];

const OVERLAYS: { key: IndicatorKey; label: string; hint: string }[] = [
  { key: "volume", label: "Volume", hint: "histogram" },
  { key: "sma20", label: "SMA 20", hint: "moving avg" },
  { key: "sma50", label: "SMA 50", hint: "moving avg" },
  { key: "sma100", label: "SMA 100", hint: "moving avg" },
  { key: "sma200", label: "SMA 200", hint: "moving avg" },
  { key: "ema9", label: "EMA 9", hint: "exp. moving avg" },
  { key: "ema21", label: "EMA 21", hint: "exp. moving avg" },
  { key: "ema50", label: "EMA 50", hint: "exp. moving avg" },
  { key: "bb", label: "Bollinger Bands", hint: "20, 2σ" },
  { key: "vwap", label: "VWAP", hint: "vol-weighted" },
  { key: "psar", label: "Parabolic SAR", hint: "0.02 / 0.2" },
];
const OSC_DEFS: { key: IndicatorKey; label: string; hint: string }[] = [
  { key: "rsi", label: "RSI", hint: "14" },
  { key: "macd", label: "MACD", hint: "12/26/9" },
  { key: "stoch", label: "Stochastic", hint: "14/3/3" },
  { key: "williams", label: "Williams %R", hint: "14" },
  { key: "atr", label: "ATR", hint: "14" },
  { key: "obv", label: "OBV", hint: "volume" },
  { key: "roc", label: "Rate of Change", hint: "12" },
];

const SCALE_LABEL: Record<ScaleMode, string> = { normal: "Lin", log: "Log", percent: "%" };
const SCALE_NEXT: Record<ScaleMode, ScaleMode> = { normal: "log", log: "percent", percent: "normal" };

export function ChartToolbar({
  tf,
  setTf,
  type,
  setType,
  scaleMode,
  setScaleMode,
  indicators,
  toggle,
  symbol,
  onExport,
  replayActive,
  onToggleReplay,
}: {
  tf: Timeframe;
  setTf: (t: Timeframe) => void;
  type: ChartType;
  setType: (t: ChartType) => void;
  scaleMode: ScaleMode;
  setScaleMode: (m: ScaleMode) => void;
  indicators: Set<IndicatorKey>;
  toggle: (k: IndicatorKey) => void;
  symbol: string;
  onExport: () => void;
  replayActive: boolean;
  onToggleReplay: () => void;
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
        <button className={type === "heikin" ? "on" : ""} onClick={() => setType("heikin")} title="Heikin Ashi">
          <HeikinIcon />
        </button>
        <button className={type === "area" ? "on" : ""} onClick={() => setType("area")} title="Area">
          <IconArea size={15} />
        </button>
        <button className={type === "baseline" ? "on" : ""} onClick={() => setType("baseline")} title="Baseline">
          <BaselineIcon />
        </button>
        <button className={type === "line" ? "on" : ""} onClick={() => setType("line")} title="Line">
          <IconLine size={15} />
        </button>
      </div>

      <button
        className="btn sm"
        onClick={() => setScaleMode(SCALE_NEXT[scaleMode])}
        title="Price scale: Linear → Log → Percent"
        style={{ fontFamily: "var(--font-mono)", minWidth: 44, justifyContent: "center" }}
      >
        {SCALE_LABEL[scaleMode]}
      </button>

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
                Overlays
              </div>
              {OVERLAYS.map((ind) => {
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
              <div className="eyebrow" style={{ padding: "10px 10px 6px" }}>
                Oscillator (lower pane)
              </div>
              {OSC_DEFS.map((ind) => {
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
        className={`btn sm ${replayActive ? "" : "ghost"}`}
        onClick={onToggleReplay}
        title="Bar replay — step through history"
        style={replayActive ? { color: "var(--up)", borderColor: "var(--up-dim)", background: "var(--up-wash)" } : undefined}
      >
        <ReplayIcon /> Replay
      </button>
      <button className="btn sm ghost" onClick={onExport} title="Export chart as PNG">
        <ExportIcon />
      </button>
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

const ic = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function HeikinIcon() { return <svg {...ic}><rect x="5" y="7" width="5" height="10" rx="1" /><rect x="14" y="9" width="5" height="7" rx="1" /><path d="M7.5 4v3M7.5 17v3M16.5 6v3M16.5 16v2" /></svg>; }
function BaselineIcon() { return <svg {...ic}><path d="M3 12h18" strokeDasharray="2 2" strokeOpacity="0.6" /><path d="M3 14l4-5 4 2 4-6 5 4" /></svg>; }
function ReplayIcon() { return <svg {...ic}><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" /><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" /></svg>; }
function ExportIcon() { return <svg {...ic}><path d="M12 3v12M8 11l4 4 4-4M5 19h14" /></svg>; }
