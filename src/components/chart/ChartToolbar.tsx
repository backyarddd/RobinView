import { useState } from "react";
import type { Timeframe } from "@shared/types";
import { IconCandle, IconLine, IconArea, IconLayers, IconStar, S } from "../common/icons";
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

// Oscillators each occupy their own stacked lower pane; multiple can be active.
export const OSCILLATORS: IndicatorKey[] = ["rsi", "macd", "stoch", "williams", "atr", "obv", "roc"];

// ── Editable indicator parameters ──
// Per-indicator tunable periods/coefficients. Defaults equal the values that
// were previously hardcoded in TradingChart, so an untouched config reproduces
// today's exact output.
export interface IndicatorParams {
  rsi: { period: number };
  macd: { fast: number; slow: number; signal: number };
  bb: { period: number; stdDev: number };
  stoch: { k: number; d: number; smooth: number };
  psar: { step: number; max: number };
  atr: { period: number };
  williams: { period: number };
  roc: { period: number };
}

export const DEFAULT_PARAMS: IndicatorParams = {
  rsi: { period: 14 },
  macd: { fast: 12, slow: 26, signal: 9 },
  bb: { period: 20, stdDev: 2 },
  stoch: { k: 14, d: 3, smooth: 3 },
  psar: { step: 0.02, max: 0.2 },
  atr: { period: 14 },
  williams: { period: 14 },
  roc: { period: 12 },
};

// Keys that carry editable params (the parametric indicators).
type ParamKey = keyof IndicatorParams;

// Field descriptor for the inline editor: which param sub-field, its label, and
// number-input constraints. `int` forces integer step/rounding for periods.
type ParamField = { field: string; label: string; min: number; max: number; step: number; int: boolean };

const PARAM_FIELDS: Record<ParamKey, ParamField[]> = {
  rsi: [{ field: "period", label: "Length", min: 1, max: 200, step: 1, int: true }],
  macd: [
    { field: "fast", label: "Fast", min: 1, max: 200, step: 1, int: true },
    { field: "slow", label: "Slow", min: 1, max: 400, step: 1, int: true },
    { field: "signal", label: "Signal", min: 1, max: 200, step: 1, int: true },
  ],
  bb: [
    { field: "period", label: "Length", min: 1, max: 200, step: 1, int: true },
    { field: "stdDev", label: "StdDev", min: 0.1, max: 10, step: 0.1, int: false },
  ],
  stoch: [
    { field: "k", label: "%K", min: 1, max: 200, step: 1, int: true },
    { field: "d", label: "%D", min: 1, max: 100, step: 1, int: true },
    { field: "smooth", label: "Smooth", min: 1, max: 100, step: 1, int: true },
  ],
  psar: [
    { field: "step", label: "Step", min: 0.001, max: 1, step: 0.001, int: false },
    { field: "max", label: "Max", min: 0.01, max: 1, step: 0.01, int: false },
  ],
  atr: [{ field: "period", label: "Length", min: 1, max: 200, step: 1, int: true }],
  williams: [{ field: "period", label: "Length", min: 1, max: 200, step: 1, int: true }],
  roc: [{ field: "period", label: "Length", min: 1, max: 200, step: 1, int: true }],
};

const PARAM_KEYS = Object.keys(PARAM_FIELDS) as ParamKey[];
const isParamKey = (k: IndicatorKey): k is ParamKey => (PARAM_KEYS as IndicatorKey[]).includes(k);

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
  params,
  setParam,
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
  params: IndicatorParams;
  setParam: (key: ParamKey, field: string, value: number) => void;
  symbol: string;
  onExport: () => void;
  replayActive: boolean;
  onToggleReplay: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<ParamKey | null>(null);
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
              {([["Overlays", OVERLAYS], ["Oscillators (lower panes)", OSC_DEFS]] as const).map(
                ([label, defs], gi) => (
                  <div key={label}>
                    <div className="eyebrow" style={{ padding: gi === 0 ? "6px 10px" : "10px 10px 6px" }}>
                      {label}
                    </div>
                    {defs.map((ind) => {
                      const on = indicators.has(ind.key);
                      const editable = isParamKey(ind.key);
                      const open = editing === ind.key;
                      return (
                        <div key={ind.key}>
                          <div className={`ind-item ${on ? "on" : ""}`} onClick={() => toggle(ind.key)}>
                            <span className="ind-check">{on ? "✓" : ""}</span>
                            <span style={{ flex: 1 }}>{ind.label}</span>
                            <span className="dim" style={{ fontSize: 11 }}>
                              {ind.hint}
                            </span>
                            {editable && (
                              <button
                                type="button"
                                title="Settings"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditing((cur) => (cur === ind.key ? null : (ind.key as ParamKey)));
                                }}
                                style={{
                                  marginLeft: 6,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "none",
                                  border: "none",
                                  padding: 2,
                                  cursor: "pointer",
                                  color: open ? "var(--text-1, #fff)" : "var(--text-3, #9aa39c)",
                                }}
                              >
                                <GearIcon />
                              </button>
                            )}
                          </div>
                          {editable && open && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 8,
                                padding: "6px 10px 8px 30px",
                              }}
                            >
                              {PARAM_FIELDS[ind.key as ParamKey].map((f) => {
                                const val = (params[ind.key as ParamKey] as Record<string, number>)[f.field];
                                return (
                                  <label
                                    key={f.field}
                                    style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 10 }}
                                    className="dim"
                                  >
                                    {f.label}
                                    <input
                                      type="number"
                                      value={val}
                                      min={f.min}
                                      max={f.max}
                                      step={f.step}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        const raw = f.int
                                          ? Math.round(Number(e.target.value))
                                          : Number(e.target.value);
                                        if (Number.isNaN(raw)) return;
                                        const clamped = Math.min(f.max, Math.max(f.min, raw));
                                        setParam(ind.key as ParamKey, f.field, clamped);
                                      }}
                                      style={{
                                        width: 56,
                                        padding: "3px 5px",
                                        fontSize: 11,
                                        fontFamily: "var(--font-mono, monospace)",
                                        background: "var(--surface-2, #1a201c)",
                                        color: "var(--text-1, #e6ece8)",
                                        border: "1px solid var(--line, rgba(255,255,255,0.1))",
                                        borderRadius: 4,
                                      }}
                                    />
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ),
              )}
            </div>
          </>
        )}
      </div>

      <div className="spacer" style={{ flex: 1 }} />

      <button
        className={`btn sm ${replayActive ? "" : "ghost"}`}
        onClick={onToggleReplay}
        title="Bar replay - step through history"
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

const ic = S(15);
function HeikinIcon() { return <svg {...ic}><rect x="5" y="7" width="5" height="10" rx="1" /><rect x="14" y="9" width="5" height="7" rx="1" /><path d="M7.5 4v3M7.5 17v3M16.5 6v3M16.5 16v2" /></svg>; }
function BaselineIcon() { return <svg {...ic}><path d="M3 12h18" strokeDasharray="2 2" strokeOpacity="0.6" /><path d="M3 14l4-5 4 2 4-6 5 4" /></svg>; }
function ReplayIcon() { return <svg {...ic}><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" /><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" /></svg>; }
function ExportIcon() { return <svg {...ic}><path d="M12 3v12M8 11l4 4 4-4M5 19h14" /></svg>; }
function GearIcon() { const g = S(13); return <svg {...g}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>; }
