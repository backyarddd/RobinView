import { useEffect, useLayoutEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type LogicalRange,
} from "lightweight-charts";
import type { Candle, Timeframe, SearchResult } from "@shared/types";
import { api } from "../../lib/api";
import { useStore } from "../../store/useStore";
import {
  ChartToolbar,
  OSCILLATORS,
  DEFAULT_PARAMS,
  type ChartType,
  type IndicatorKey,
  type ScaleMode,
  type IndicatorParams,
} from "./ChartToolbar";
import { DrawingLayer, migrateDrawings, type DrawTool, type Drawing } from "./DrawingLayer";
import { DrawingToolbar, ToolIcon } from "./DrawingToolbar";
import { ObjectsPanel } from "./ObjectsPanel";
import { IconLayers } from "../common/icons";
import {
  sma,
  ema,
  bollinger,
  vwap,
  rsi,
  macd,
  stochastic,
  atr,
  obv,
  williamsR,
  roc,
  psar,
  heikinAshi,
  toLine,
  closes,
} from "../../lib/indicators";
import { price as fmtPrice, compactNum } from "../../lib/format";

const THEME = {
  text: "#9aa39c",
  grid: "rgba(255,255,255,0.035)",
  up: "#34e29b",
  down: "#ff6a57",
  upWick: "#34e29b",
  downWick: "#ff6a57",
  border: "rgba(255,255,255,0.07)",
};

const CMP_COLORS = ["#e3b766", "#6fa8ff", "#c08bff", "#ff9f7a"];

// Orders still working in the book (non-terminal) get a price line on the chart.
const OPEN_ORDER_STATES = new Set(["queued", "confirmed", "new", "unconfirmed", "partially_filled", "pending"]);

const OVERLAY_COLORS: Record<string, string> = {
  sma20: "#e3b766",
  sma50: "#6fa8ff",
  sma100: "#f2748f",
  sma200: "#9bd45a",
  ema9: "#5ad1c4",
  ema21: "#c08bff",
  ema50: "#ff9f7a",
  vwap: "#ffd479",
  psar: "#7fd0ff",
  bbU: "rgba(111,227,196,0.5)",
  bbL: "rgba(111,227,196,0.5)",
  bbM: "rgba(111,227,196,0.25)",
};

// Replay readout: include the year on multi-year ranges where month/day alone
// is ambiguous (a "Jun 3" could be any of several years on 5Y / ALL).
function fmtReplayDate(ts: number, tf: Timeframe): string {
  const multiYear = tf === "5Y" || tf === "ALL";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(multiYear ? { year: "numeric" } : {}),
  });
}

interface Legend {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  up: boolean;
}

const PARAMS_KEY = "robinview.indicatorParams";

// Load persisted indicator params, deep-merging onto defaults so a partial or
// corrupt blob still yields a complete, valid config (missing fields fall back
// to the default for that indicator).
function loadParams(): IndicatorParams {
  try {
    const raw = localStorage.getItem(PARAMS_KEY);
    if (!raw) return DEFAULT_PARAMS;
    const saved = JSON.parse(raw) as Partial<Record<keyof IndicatorParams, Record<string, unknown>>>;
    const merged = {} as IndicatorParams;
    for (const k of Object.keys(DEFAULT_PARAMS) as (keyof IndicatorParams)[]) {
      const def = DEFAULT_PARAMS[k] as Record<string, number>;
      const s = (saved?.[k] ?? {}) as Record<string, unknown>;
      const out: Record<string, number> = {};
      for (const f of Object.keys(def)) {
        const v = s[f];
        out[f] = typeof v === "number" && Number.isFinite(v) ? v : def[f];
      }
      (merged as unknown as Record<string, unknown>)[k] = out;
    }
    return merged;
  } catch {
    return DEFAULT_PARAMS;
  }
}

export function TradingChart({ symbol }: { symbol: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const overlayRefs = useRef<Record<string, ISeriesApi<"Line">>>({});
  const compareSeriesRef = useRef<Record<string, ISeriesApi<"Line">>>({});
  // ── Multi-oscillator panes ──
  // One lightweight-charts instance per active oscillator, keyed by IndicatorKey.
  // The DIVs are rendered from `oscList` and captured via ref callbacks; the
  // lifecycle effect creates/disposes charts to match, and ROs are tracked so
  // each pane's observer is disconnected exactly when its chart is disposed.
  const oscDivs = useRef<Map<IndicatorKey, HTMLDivElement>>(new Map());
  const oscCharts = useRef<Map<IndicatorKey, IChartApi>>(new Map());
  const oscSeries = useRef<Map<IndicatorKey, ISeriesApi<any>[]>>(new Map());
  const oscObservers = useRef<Map<IndicatorKey, ResizeObserver>>(new Map());
  const candlesRef = useRef<Candle[]>([]);
  const priceLinesRef = useRef<any[]>([]);
  const syncing = useRef(false);
  // True while the pointer is over the chart area - scopes drawing hotkeys so
  // single letters don't get hijacked app-wide.
  const chartHovered = useRef(false);
  // Per-symbol drawing history for undo/redo (reset on symbol change).
  const undoStack = useRef<Drawing[][]>([]);
  const redoStack = useRef<Drawing[][]>([]);

  // Chart timeframe lives in the store so the top bar can show the change over
  // the selected period (1D…ALL), not just the live daily move.
  const tf = useStore((s) => s.chartTf);
  const setTf = useStore((s) => s.setChartTf);
  const [type, setType] = useState<ChartType>("candles");
  const [scaleMode, setScaleMode] = useState<ScaleMode>("normal");
  const [indicators, setIndicators] = useState<Set<IndicatorKey>>(new Set(["sma20", "volume"]));
  const [params, setParams] = useState<IndicatorParams>(loadParams);
  const [legend, setLegend] = useState<Legend | null>(null);
  const [loading, setLoading] = useState(true);
  const [replay, setReplay] = useState(false);
  const [replayIdx, setReplayIdx] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool>("cursor");
  const [drawColor, setDrawColor] = useState("#34e29b");
  const [drawWidth, setDrawWidth] = useState(1.5);
  const [drawDash, setDrawDash] = useState(false);
  const [magnet, setMagnet] = useState(false); // snap drawn points to nearest OHLC
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [showObjects, setShowObjects] = useState(false);
  const [showDraw, setShowDraw] = useState(() => localStorage.getItem("robinview.drawToolbar") !== "0");
  const [chartNonce, setChartNonce] = useState(0); // bumps when chart/series (re)created
  // Each compared symbol carries its own stable color, chosen at add-time, so
  // removing one symbol never recolors the survivors (chip + line stay matched).
  const [compareSymbols, setCompareSymbols] = useState<{ sym: string; color: string }[]>([]);
  const [cmpOpen, setCmpOpen] = useState(false);
  const [cmpQuery, setCmpQuery] = useState("");
  const [cmpResults, setCmpResults] = useState<SearchResult[]>([]);

  const liveQuote = useStore((s) => s.quotes[symbol]);
  const position = useStore((s) => s.positions.find((p) => p.symbol === symbol));
  const orders = useStore((s) => s.orders);
  // Active oscillators in OSCILLATORS order. May be empty. Each gets its own
  // stacked lower pane. A stable string form is used as an effect dependency so
  // the lifecycle effect only re-runs when the SET of panes changes.
  const oscList: IndicatorKey[] = OSCILLATORS.filter((k) => indicators.has(k));
  const oscKey = oscList.join(",");
  const hasOsc = oscList.length > 0;

  // Mirror params into a ref so non-reactive paths (the live-tick oscillator
  // update) read the current values without stale closures.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // Persist params after every change. Side effect lives in an effect (NOT in
  // the setState updater) so StrictMode's double-invoked updaters can't double-
  // write or corrupt anything.
  useEffect(() => {
    try {
      localStorage.setItem(PARAMS_KEY, JSON.stringify(params));
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [params]);

  // Update one param field with a pure functional update (no side effects in the
  // updater - StrictMode-safe). Persistence + redraw happen in their effects.
  const setParam = useCallback((key: keyof IndicatorParams, field: string, value: number) => {
    setParams((prev) => ({
      ...prev,
      [key]: { ...(prev[key] as Record<string, number>), [field]: value },
    }));
  }, []);

  // ---- create main chart once ----
  // useLayoutEffect so chart.remove() in cleanup runs synchronously BEFORE the
  // browser paints / React detaches the host div - otherwise lightweight-charts
  // paints into a removed container and throws "Object is disposed".
  useLayoutEffect(() => {
    if (!hostRef.current) return;
    const chart = createChart(hostRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: THEME.text,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: { vertLines: { color: THEME.grid }, horzLines: { color: THEME.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255,255,255,0.18)", labelBackgroundColor: "#1a201c" },
        horzLine: { color: "rgba(255,255,255,0.18)", labelBackgroundColor: "#1a201c" },
      },
      rightPriceScale: { borderColor: THEME.border, scaleMargins: { top: 0.08, bottom: 0.26 } },
      timeScale: { borderColor: THEME.border, timeVisible: true, secondsVisible: false },
      handleScroll: true,
      handleScale: true,
    });
    chartRef.current = chart;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !mainSeriesRef.current) {
        setLegend(null);
        return;
      }
      // Read the hovered bar straight from lightweight-charts (O(1), and never
      // resolves bars past the replay cutoff like a candlesRef scan would).
      const bar = param.seriesData.get(mainSeriesRef.current) as
        | { open?: number; high?: number; low?: number; close?: number; value?: number }
        | undefined;
      if (!bar) {
        setLegend(null);
        return;
      }
      const close = bar.close ?? bar.value;
      if (close == null) {
        setLegend(null);
        return;
      }
      const o = bar.open ?? close;
      const h = bar.high ?? close;
      const l = bar.low ?? close;
      // Volume isn't carried on the price series; pull it from the matching candle.
      const vc = candlesRef.current.find((c) => c.time === (param.time as number));
      setLegend({ o, h, l, c: close, v: vc?.volume ?? 0, up: close >= o });
    });

    const ro = new ResizeObserver(() => {
      if (hostRef.current) chart.applyOptions({ width: hostRef.current.clientWidth, height: hostRef.current.clientHeight });
    });
    ro.observe(hostRef.current);

    // sync main time scale -> every oscillator pane (guarded against loops).
    // Each cross-chart call is wrapped so a pane disposed mid-flight can't throw an
    // uncaught "Object is disposed"; try/finally guarantees the lock is released.
    chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (syncing.current || !r) return;
      syncing.current = true;
      try {
        for (const oc of oscCharts.current.values()) {
          try {
            oc.timeScale().setVisibleLogicalRange(r as LogicalRange);
          } catch {
            /* pane was disposed between toggle and this sync tick */
          }
        }
      } finally {
        syncing.current = false;
      }
    });

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volSeriesRef.current = null;
      overlayRefs.current = {};
    };
  }, []);

  // ---- (re)build main price + volume series when chart type changes ----
  const rebuildMainSeries = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (mainSeriesRef.current) {
      chart.removeSeries(mainSeriesRef.current);
      mainSeriesRef.current = null;
    }
    if (type === "candles" || type === "heikin") {
      mainSeriesRef.current = chart.addCandlestickSeries({
        upColor: THEME.up,
        downColor: THEME.down,
        wickUpColor: THEME.upWick,
        wickDownColor: THEME.downWick,
        borderVisible: false,
        priceLineColor: "rgba(255,255,255,0.25)",
      });
    } else if (type === "area") {
      mainSeriesRef.current = chart.addAreaSeries({
        lineColor: THEME.up,
        topColor: "rgba(52,226,155,0.28)",
        bottomColor: "rgba(52,226,155,0.0)",
        lineWidth: 2,
        priceLineColor: "rgba(255,255,255,0.25)",
      });
    } else if (type === "baseline") {
      mainSeriesRef.current = chart.addBaselineSeries({
        topLineColor: THEME.up,
        topFillColor1: "rgba(52,226,155,0.28)",
        topFillColor2: "rgba(52,226,155,0.02)",
        bottomLineColor: THEME.down,
        bottomFillColor1: "rgba(255,106,87,0.04)",
        bottomFillColor2: "rgba(255,106,87,0.28)",
        lineWidth: 2,
        priceLineColor: "rgba(255,255,255,0.25)",
      });
    } else {
      mainSeriesRef.current = chart.addLineSeries({
        color: THEME.up,
        lineWidth: 2,
        priceLineColor: "rgba(255,255,255,0.25)",
      });
    }
    setChartNonce((n) => n + 1); // signal the drawing layer that the series is ready
  }, [type]);

  // ---- fetch data when symbol/tf changes ----
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .candles(symbol, tf)
      .then((series) => {
        if (!alive) return;
        candlesRef.current = series.candles;
        // Publish the period baseline (open of the first bar in the window) so
        // the top bar can show the % / $ change across this exact timeframe.
        const first = series.candles[0];
        if (first) {
          useStore.getState().setPeriodStart({ symbol, tf, price: first.open || first.close });
        }
        rebuildMainSeries();
        applyData();
        chartRef.current?.timeScale().fitContent();
        // Drawings are anchored by time; load + migrate them now that candles
        // (needed to convert any legacy logical-index anchors) are available.
        loadAndMigrateDrawings();
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf]);

  // rebuild main series on type change, keep data
  useEffect(() => {
    if (candlesRef.current.length) {
      rebuildMainSeries();
      applyData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // re-apply overlays/volume when indicator set changes
  useEffect(() => {
    if (candlesRef.current.length) applyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators]);

  // Recompute overlays + oscillator when editable params change so the chart
  // reflects the new periods/coefficients live (e.g. RSI 14 -> 7).
  useEffect(() => {
    if (!candlesRef.current.length) return;
    applyData();
    redrawAllOsc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // candles currently shown - full history, or truncated during bar replay.
  const visible = (): Candle[] => {
    const all = candlesRef.current;
    if (!replay) return all;
    return all.slice(0, Math.max(2, Math.min(all.length, replayIdx + 1)));
  };

  function setMainData(cs: Candle[]) {
    const s = mainSeriesRef.current;
    if (!s) return;
    if (type === "candles") {
      s.setData(cs.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
    } else if (type === "heikin") {
      s.setData(heikinAshi(cs).map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
    } else {
      if (type === "baseline" && cs.length) {
        s.applyOptions({ baseValue: { type: "price", price: cs[0].close } });
      }
      s.setData(cs.map((c) => ({ time: c.time as Time, value: c.close })));
    }
  }

  function applyData() {
    const chart = chartRef.current;
    if (!chart) return;
    const cs = visible();
    setMainData(cs);

    // volume
    if (volSeriesRef.current) {
      chart.removeSeries(volSeriesRef.current);
      volSeriesRef.current = null;
    }
    if (indicators.has("volume")) {
      const vs = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
        color: THEME.up,
      });
      vs.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vs.setData(
        cs.map((c) => ({
          time: c.time as Time,
          value: c.volume,
          color: c.close >= c.open ? "rgba(52,226,155,0.32)" : "rgba(255,106,87,0.32)",
        })),
      );
      volSeriesRef.current = vs;
    }

    // overlays
    for (const k of Object.keys(overlayRefs.current)) {
      chart.removeSeries(overlayRefs.current[k]);
    }
    overlayRefs.current = {};
    const c = closes(cs);
    const addLine = (key: string, pts: { time: number; value: number }[], color: string, w = 1.5) => {
      const ls = chart.addLineSeries({ color, lineWidth: w as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      ls.setData(pts.map((p) => ({ time: p.time as Time, value: p.value })));
      overlayRefs.current[key] = ls;
    };
    // Moving-average overlays are uniform - drive them from a table.
    const MAS: [IndicatorKey, (v: number[], p: number) => number[], number][] = [
      ["sma20", sma, 20], ["sma50", sma, 50], ["sma100", sma, 100], ["sma200", sma, 200],
      ["ema9", ema, 9], ["ema21", ema, 21], ["ema50", ema, 50],
    ];
    for (const [key, fn, p] of MAS) {
      if (indicators.has(key)) addLine(key, toLine(cs, fn(c, p)), OVERLAY_COLORS[key]);
    }
    if (indicators.has("vwap")) addLine("vwap", toLine(cs, vwap(cs)), OVERLAY_COLORS.vwap);
    if (indicators.has("bb")) {
      const b = bollinger(c, params.bb.period, params.bb.stdDev);
      addLine("bbU", toLine(cs, b.upper), OVERLAY_COLORS.bbU, 1);
      addLine("bbM", toLine(cs, b.middle), OVERLAY_COLORS.bbM, 1);
      addLine("bbL", toLine(cs, b.lower), OVERLAY_COLORS.bbL, 1);
    }
    if (indicators.has("psar")) {
      // Render SAR as a dotted line so it reads as a dot trail without a marker plugin.
      const ls = chart.addLineSeries({
        color: OVERLAY_COLORS.psar,
        lineWidth: 1,
        lineStyle: 1, // dotted
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      ls.setData(toLine(cs, psar(cs, params.psar.step, params.psar.max)).map((p) => ({ time: p.time as Time, value: p.value })));
      overlayRefs.current["psar"] = ls;
    }
  }

  // ---- oscillator panes: create/dispose one chart per active oscillator ----
  // Keyed on the SET of active oscillators (oscKey). Idempotent under StrictMode:
  // a chart is only created for a key that lacks one, and only disposed for a key
  // no longer present. On unmount, every pane is disposed.
  // useLayoutEffect so a toggled-off pane's chart.remove() runs before the next
  // paint (its div is already detached), avoiding "Object is disposed".
  useLayoutEffect(() => {
    const wanted = new Set(oscList);

    // Dispose panes whose oscillator was turned off (or that StrictMode left over).
    for (const key of Array.from(oscCharts.current.keys())) {
      if (!wanted.has(key)) disposeOscPane(key);
    }

    // Create panes for newly-active oscillators that have a mounted div.
    for (const key of oscList) {
      if (oscCharts.current.has(key)) continue;
      const div = oscDivs.current.get(key);
      if (!div) continue; // div mounts on the same render; effect re-runs are covered by oscKey + the create guard
      const chart = createChart(div, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: THEME.text,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
        },
        grid: { vertLines: { color: THEME.grid }, horzLines: { color: THEME.grid } },
        crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "rgba(255,255,255,0.18)" }, horzLine: { visible: false, labelVisible: false } },
        rightPriceScale: { borderColor: THEME.border },
        timeScale: { borderColor: THEME.border, timeVisible: true, secondsVisible: false },
      });
      oscCharts.current.set(key, chart);
      // This pane -> main (and via main's own handler, onward to sibling panes).
      chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
        if (syncing.current || !chartRef.current || !r) return;
        syncing.current = true;
        try {
          chartRef.current.timeScale().setVisibleLogicalRange(r as LogicalRange);
          for (const [k, oc] of oscCharts.current) {
            if (k === key) continue;
            try {
              oc.timeScale().setVisibleLogicalRange(r as LogicalRange);
            } catch {
              /* sibling pane disposed mid-flight */
            }
          }
        } catch {
          /* main chart disposed (e.g. navigating away from Terminal) */
        } finally {
          syncing.current = false;
        }
      });
      const ro = new ResizeObserver(() => {
        const d = oscDivs.current.get(key);
        if (d) chart.applyOptions({ width: d.clientWidth, height: d.clientHeight });
      });
      ro.observe(div);
      oscObservers.current.set(key, ro);
      drawOsc(key);
    }
    // No cleanup on dep change: disposal of removed panes happens at the top of
    // this effect (driven by `wanted`), and full-unmount disposal lives in the
    // dedicated []-effect below. This keeps the effect idempotent under
    // StrictMode's double-invoke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oscKey]);

  // Dispose ALL oscillator panes on component unmount (StrictMode-safe: removing
  // an already-removed chart is guarded by the map membership check). Layout-phase
  // so charts are removed before their divs detach (no post-removal paint throw).
  useLayoutEffect(() => {
    return () => {
      for (const key of Array.from(oscCharts.current.keys())) disposeOscPane(key);
    };
  }, []);

  // Tear down one oscillator pane: disconnect its RO, remove its chart, and drop
  // it from every per-key map. Idempotent.
  function disposeOscPane(key: IndicatorKey) {
    const ro = oscObservers.current.get(key);
    if (ro) {
      ro.disconnect();
      oscObservers.current.delete(key);
    }
    const chart = oscCharts.current.get(key);
    if (chart) {
      chart.remove();
      oscCharts.current.delete(key);
    }
    oscSeries.current.delete(key);
  }

  // Redraw the series of all active oscillator panes (used on symbol/tf/replay/
  // params change).
  function redrawAllOsc() {
    for (const key of oscCharts.current.keys()) drawOsc(key);
  }

  useEffect(() => {
    redrawAllOsc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, oscKey]);

  // Draw a single oscillator's series into its own pane chart, replacing any
  // existing series for that key. Series construction is identical to the prior
  // single-pane code, just parameterized by `key`.
  function drawOsc(key: IndicatorKey) {
    const chart = oscCharts.current.get(key);
    const cs = visible();
    if (!chart || !cs.length) return;
    (oscSeries.current.get(key) ?? []).forEach((s) => chart.removeSeries(s));
    oscSeries.current.set(key, []);
    const setSeries = (arr: ISeriesApi<any>[]) => oscSeries.current.set(key, arr);
    const c = closes(cs);
    const line = (color: string, w = 2) =>
      chart.addLineSeries({ color, lineWidth: w as any, priceLineVisible: false, lastValueVisible: true });
    const plot = (color: string, values: number[], w = 2) => {
      const l = line(color, w);
      l.setData(toLine(cs, values).map((p) => ({ time: p.time as Time, value: p.value })));
      return l;
    };
    const band = (price: number, color: string) =>
      oscSeries.current.get(key)?.[0]?.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: String(price) });
    const UP = "rgba(52,226,155,0.4)";
    const DOWN = "rgba(255,106,87,0.4)";

    if (key === "macd") {
      const m = macd(c, params.macd.fast, params.macd.slow, params.macd.signal);
      const hist = chart.addHistogramSeries({ priceLineVisible: false });
      hist.setData(
        cs.map((cc, i) => ({
          time: cc.time as Time,
          value: Number.isNaN(m.histogram[i]) ? 0 : m.histogram[i],
          color: (m.histogram[i] ?? 0) >= 0 ? "rgba(52,226,155,0.45)" : "rgba(255,106,87,0.45)",
        })),
      );
      setSeries([hist, plot("#6fa8ff", m.macd), plot("#e3b766", m.signal, 1)]);
    } else if (key === "stoch") {
      const s = stochastic(cs, params.stoch.k, params.stoch.d, params.stoch.smooth);
      setSeries([plot("#6fa8ff", s.k), plot("#e3b766", s.d, 1)]);
      band(80, DOWN);
      band(20, UP);
    } else {
      // Single-line oscillators share one shape: a line plus optional bands.
      const SINGLE: Partial<Record<IndicatorKey, { color: string; values: number[]; bands?: [number, string][] }>> = {
        rsi: { color: "#c08bff", values: rsi(c, params.rsi.period), bands: [[70, DOWN], [30, UP]] },
        williams: { color: "#c08bff", values: williamsR(cs, params.williams.period), bands: [[-20, DOWN], [-80, UP]] },
        atr: { color: "#ff9f7a", values: atr(cs, params.atr.period) },
        obv: { color: "#5ad1c4", values: obv(cs) },
        roc: { color: "#9bd45a", values: roc(c, params.roc.period), bands: [[0, "rgba(255,255,255,0.2)"]] },
      };
      const cfg = SINGLE[key];
      if (cfg) {
        setSeries([plot(cfg.color, cfg.values)]);
        cfg.bands?.forEach(([p, col]) => band(p, col));
      }
    }
    chart.timeScale().fitContent();
  }

  // Recompute only the oscillator's last point(s) from the live-adjusted last bar
  // so the lower pane agrees with the price pane on every tick. Cheap: it rebuilds
  // the oscillator series over the same window drawOsc() used, then series.update()s
  // just the final value rather than re-creating series.
  function updateOscLive(liveLast: Candle) {
    if (!oscCharts.current.size) return;
    const base = visible();
    if (base.length < 2) return;
    const cs = [...base.slice(0, -1), liveLast];
    const c = closes(cs);
    const last = cs[cs.length - 1];
    const t = last.time as Time;
    const p = paramsRef.current;
    // Update each active pane's last point. Cheap per pane: recompute the active
    // oscillator over the window and series.update() only the final value(s).
    for (const [key, series] of oscSeries.current) {
      if (!oscCharts.current.has(key)) continue;
      const upd = (s: ISeriesApi<any> | undefined, v: number | undefined) => {
        if (s && v != null && !Number.isNaN(v)) {
          try {
            s.update({ time: t, value: v });
          } catch {
            /* pane disposed between the membership check and this update */
          }
        }
      };
      if (key === "macd") {
        const m = macd(c, p.macd.fast, p.macd.slow, p.macd.signal);
        const i = m.histogram.length - 1;
        if (series[0]) {
          const hv = m.histogram[i];
          if (hv != null && !Number.isNaN(hv)) {
            try {
              series[0].update({ time: t, value: hv, color: hv >= 0 ? "rgba(52,226,155,0.45)" : "rgba(255,106,87,0.45)" });
            } catch {
              /* pane disposed mid-tick */
            }
          }
        }
        upd(series[1], m.macd[m.macd.length - 1]);
        upd(series[2], m.signal[m.signal.length - 1]);
      } else if (key === "stoch") {
        const s = stochastic(cs, p.stoch.k, p.stoch.d, p.stoch.smooth);
        upd(series[0], s.k[s.k.length - 1]);
        upd(series[1], s.d[s.d.length - 1]);
      } else {
        const SINGLE: Partial<Record<IndicatorKey, number[]>> = {
          rsi: rsi(c, p.rsi.period),
          williams: williamsR(cs, p.williams.period),
          atr: atr(cs, p.atr.period),
          obv: obv(cs),
          roc: roc(c, p.roc.period),
        };
        const vals = SINGLE[key];
        if (vals) upd(series[0], vals[vals.length - 1]);
      }
    }
  }

  // ---- live price -> update last candle (paused during replay) ----
  // The cached candles are the immutable base loaded from the API. A live tick is
  // applied as a transient overlay on the LAST bar only - we never mutate the
  // cache, so indicators/legend/replay keep reading clean OHLC.
  useEffect(() => {
    if (replay) return;
    if (!liveQuote || !mainSeriesRef.current || !candlesRef.current.length) return;
    const cs = candlesRef.current;
    const base = cs[cs.length - 1];
    // Fresh clone of the immutable base bar with the live last price folded in.
    const live: Candle = {
      ...base,
      close: liveQuote.price,
      high: Math.max(base.high, liveQuote.price),
      low: Math.min(base.low, liveQuote.price),
    };
    const s = mainSeriesRef.current;
    if (type === "heikin") {
      // HA last bar depends on the chain - recompute over base + live last bar
      // without touching the cache.
      const ha = heikinAshi([...cs.slice(0, -1), live]);
      const last = ha[ha.length - 1];
      if (last) s.update({ time: last.time as Time, open: last.open, high: last.high, low: last.low, close: last.close });
    } else if (type === "candles") {
      s.update({ time: live.time as Time, open: live.open, high: live.high, low: live.low, close: live.close });
    } else {
      s.update({ time: live.time as Time, value: live.close });
    }
    // keep every oscillator pane's last point in sync with the live last bar
    if (oscCharts.current.size) updateOscLive(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveQuote, type, replay, oscKey]);

  // Position & open-order price lines on the main series (TradingView-style):
  // a dashed line at the position's average cost and dotted lines at each open
  // order's price. Rebuilt whenever the series, symbol, or account data changes.
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series) return;
    const clear = () => {
      priceLinesRef.current.forEach((pl) => {
        try {
          series.removePriceLine(pl);
        } catch {
          /* series may already be gone */
        }
      });
      priceLinesRef.current = [];
    };
    clear();
    if (position && position.quantity !== 0 && position.averageBuyPrice > 0) {
      priceLinesRef.current.push(
        series.createPriceLine({
          price: position.averageBuyPrice,
          color: "#6fa8ff",
          lineWidth: 1,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: "Avg cost",
        }),
      );
    }
    orders
      .filter((o) => o.symbol === symbol && OPEN_ORDER_STATES.has(o.state) && (o.price ?? 0) > 0)
      .forEach((o) => {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: o.price as number,
            color: o.side === "buy" ? THEME.up : THEME.down,
            lineWidth: 1,
            lineStyle: 1, // dotted
            axisLabelVisible: true,
            title: `${o.side === "buy" ? "Buy" : "Sell"} ${o.type.replace(/_/g, " ")}`,
          }),
        );
      });
    return clear;
  }, [position, orders, symbol, chartNonce, type]);

  // Load drawings for this symbol from localStorage and migrate any legacy
  // logical-index anchors to time anchors using the loaded candles. Persists the
  // migrated form so the conversion only happens once. Idempotent - safe to call
  // again on every candle (re)load.
  const loadAndMigrateDrawings = useCallback(() => {
    let raw: unknown = [];
    try {
      raw = JSON.parse(localStorage.getItem(`robinview.drawings.${symbol}`) || "[]");
    } catch {
      raw = [];
    }
    const { drawings: migrated, changed } = migrateDrawings(raw, candlesRef.current);
    setDrawings(migrated);
    if (changed) localStorage.setItem(`robinview.drawings.${symbol}`, JSON.stringify(migrated));
  }, [symbol]);

  // Reset selection + undo history on symbol change; the actual drawings load
  // happens after the candles arrive (migration needs them) in the fetch effect.
  useEffect(() => {
    setSelectedId(null);
    undoStack.current = [];
    redoStack.current = [];
  }, [symbol]);

  const persistDrawings = (next: Drawing[]) =>
    localStorage.setItem(`robinview.drawings.${symbol}`, JSON.stringify(next));

  // Mirror current drawings into a ref so the history helpers can read the live
  // value without putting side effects inside a setState updater (StrictMode
  // double-invokes updaters, which would corrupt the undo/redo stacks).
  const drawingsRef = useRef<Drawing[]>([]);
  drawingsRef.current = drawings;

  // A normal edit (add/move/delete/clear): snapshot the prior state for undo and
  // drop the redo stack, since a new branch of history starts here.
  const updateDrawings = useCallback(
    (next: Drawing[]) => {
      undoStack.current.push(drawingsRef.current);
      if (undoStack.current.length > 100) undoStack.current.shift();
      redoStack.current = [];
      setDrawings(next);
      persistDrawings(next);
    },
    [symbol],
  );

  const undoDrawing = useCallback(() => {
    if (!undoStack.current.length) return;
    redoStack.current.push(drawingsRef.current);
    const prev = undoStack.current.pop()!;
    setDrawings(prev);
    persistDrawings(prev);
    setSelectedId(null);
  }, [symbol]);

  const redoDrawing = useCallback(() => {
    if (!redoStack.current.length) return;
    undoStack.current.push(drawingsRef.current);
    const nxt = redoStack.current.pop()!;
    setDrawings(nxt);
    persistDrawings(nxt);
    setSelectedId(null);
  }, [symbol]);

  // disable chart pan/zoom while a drawing tool is active so drawing doesn't scroll
  useEffect(() => {
    if (!chartRef.current) return;
    const drawing = drawTool !== "cursor";
    chartRef.current.applyOptions({ handleScroll: !drawing, handleScale: !drawing });
  }, [drawTool, chartNonce]);

  // price scale mode: 0 normal · 1 logarithmic · 2 percentage.
  // Comparison overlays force percentage so different-priced symbols line up.
  useEffect(() => {
    if (!chartRef.current) return;
    const base = scaleMode === "log" ? 1 : scaleMode === "percent" ? 2 : 0;
    const mode = compareSymbols.length > 0 ? 2 : base;
    chartRef.current.priceScale("right").applyOptions({ mode });
  }, [scaleMode, chartNonce, compareSymbols.length]);

  // comparison overlays - normalized % lines on the same scale
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let alive = true;
    const activeSyms = new Set(compareSymbols.map((c) => c.sym));
    for (const sym of Object.keys(compareSeriesRef.current)) {
      if (!activeSyms.has(sym)) {
        chart.removeSeries(compareSeriesRef.current[sym]);
        delete compareSeriesRef.current[sym];
      }
    }
    compareSymbols.forEach(({ sym, color }) => {
      api
        .candles(sym, tf)
        .then((series) => {
          if (!alive || !chartRef.current) return;
          let s = compareSeriesRef.current[sym];
          if (!s) {
            s = chart.addLineSeries({
              color,
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: true,
              crosshairMarkerVisible: true,
            });
            compareSeriesRef.current[sym] = s;
          }
          s.setData(series.candles.map((c) => ({ time: c.time as Time, value: c.close })));
        })
        .catch(() => {});
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareSymbols, tf, chartNonce]);

  // compare-symbol search
  useEffect(() => {
    if (!cmpQuery.trim()) {
      setCmpResults([]);
      return;
    }
    const id = setTimeout(() => api.search(cmpQuery).then(setCmpResults).catch(() => setCmpResults([])), 150);
    return () => clearTimeout(id);
  }, [cmpQuery]);

  const addCompare = (sym: string) => {
    const s = sym.toUpperCase();
    if (!s || s === symbol) return;
    setCompareSymbols((p) => {
      if (p.length >= 4 || p.some((c) => c.sym === s)) return p;
      // Pick the first palette color not already in use so colors stay stable
      // and distinct as symbols come and go.
      const used = new Set(p.map((c) => c.color));
      const color = CMP_COLORS.find((c) => !used.has(c)) ?? CMP_COLORS[p.length % CMP_COLORS.length];
      return [...p, { sym: s, color }];
    });
    setCmpOpen(false);
    setCmpQuery("");
    setCmpResults([]);
  };
  const removeCompare = (sym: string) => setCompareSymbols((p) => p.filter((x) => x.sym !== sym));

  // bar replay: re-render the visible slice when the index / toggle changes
  useEffect(() => {
    if (candlesRef.current.length) {
      applyData();
      redrawAllOsc();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay, replayIdx]);

  // replay autoplay
  useEffect(() => {
    if (!replay || !replayPlaying) return;
    const id = setInterval(() => {
      setReplayIdx((i) => {
        if (i >= candlesRef.current.length - 1) {
          setReplayPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 350);
    return () => clearInterval(id);
  }, [replay, replayPlaying]);

  // drawing-tool hotkeys - scoped so they don't hijack single letters app-wide.
  // They only fire when the chart is the relevant focus/hover target AND no modal
  // or command overlay is open. Escape always works (to reset to the cursor tool).
  useEffect(() => {
    const map: Record<string, DrawTool> = {
      t: "trend", r: "ray", h: "hline", v: "vline", b: "rect",
      f: "fib", d: "brush", x: "text", m: "measure", escape: "cursor",
    };
    const overlayOpen = () =>
      !!document.querySelector(".cmdk-overlay, .tt-overlay, .kbd-modal");
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el?.matches?.("input,textarea,select")) return;
      const key = e.key.toLowerCase();
      const t = map[key];
      if (!t) return;
      // Escape always resets the tool. Other tool keys require the chart to be the
      // relevant target (hovered) and no overlay/modal to be open.
      if (key !== "escape") {
        if (overlayOpen()) return;
        const onChart = chartHovered.current || hostRef.current?.contains(el) || false;
        if (!onChart) return;
      }
      setDrawTool(t);
      if (t === "cursor") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Undo/redo for drawings (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z or Ctrl+Y), scoped to
  // the chart and suppressed while an overlay/modal or a text field is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const el = e.target as HTMLElement;
      if (el?.matches?.("input,textarea,select")) return;
      if (document.querySelector(".cmdk-overlay, .tt-overlay, .kbd-modal")) return;
      if (!chartHovered.current && !hostRef.current?.contains(el)) return;
      e.preventDefault();
      if (key === "y" || e.shiftKey) redoDrawing();
      else undoDrawing();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoDrawing, redoDrawing]);

  const toggleReplay = () => {
    setReplay((on) => {
      const next = !on;
      if (next) setReplayIdx(Math.max(2, Math.floor(candlesRef.current.length * 0.6)));
      else setReplayPlaying(false);
      return next;
    });
  };

  const exportPng = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const url = chart.takeScreenshot().toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `RobinView-${symbol}-${tf}.png`;
    a.click();
  };

  const toggle = (k: IndicatorKey) => {
    setIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k); // oscillators stack - no mutual exclusion
      return next;
    });
  };

  // ── Lower-pane layout math ──
  // The oscillator band grows with pane count (one pane = 30% of height) up to a
  // cap (60%), then panes share the band equally. Main price pane gets the rest.
  // Returns the band height (in %) and a per-index [top%, height%] for each pane,
  // stacked top-to-bottom directly under the main pane.
  const n = oscList.length;
  const oscBand = n === 0 ? 0 : Math.min(60, 30 + (n - 1) * 15); // 30/45/60/60…
  const mainBottom = `${oscBand}%`; // main pane occupies the top (100 - band)%
  const paneH = n > 0 ? oscBand / n : 0; // equal share within the band
  const oscPaneStyle = (idx: number): CSSProperties => ({
    top: `${100 - oscBand + idx * paneH}%`,
    height: `${paneH}%`,
    bottom: "auto",
    borderTop: "1px solid var(--line)",
  });

  return (
    <div className="panel t-chart">
      <ChartToolbar
        tf={tf}
        setTf={setTf}
        type={type}
        setType={setType}
        // Comparison overlays force a percent scale; reflect that in the toolbar
        // (show Percent, ignore clicks) so the UI never desyncs from the chart.
        // The user's real selection is preserved and restored once compares clear.
        scaleMode={compareSymbols.length > 0 ? "percent" : scaleMode}
        setScaleMode={compareSymbols.length > 0 ? () => {} : setScaleMode}
        indicators={indicators}
        toggle={toggle}
        params={params}
        setParam={setParam}
        symbol={symbol}
        onExport={exportPng}
        replayActive={replay}
        onToggleReplay={toggleReplay}
      />
      <div
        className="chart-wrap"
        onMouseEnter={() => (chartHovered.current = true)}
        onMouseLeave={() => (chartHovered.current = false)}
      >
        <div ref={hostRef} className="chart-host" style={{ bottom: hasOsc ? mainBottom : 0 }} />
        {oscList.map((key, idx) => (
          <div
            key={key}
            className="chart-host"
            style={oscPaneStyle(idx)}
            ref={(el) => {
              if (el) oscDivs.current.set(key, el);
              else oscDivs.current.delete(key);
            }}
          />
        ))}
        <div className="draw-host" style={{ bottom: hasOsc ? mainBottom : 0 }}>
          {chartNonce > 0 && chartRef.current && mainSeriesRef.current && (
            <DrawingLayer
              chart={chartRef.current}
              series={mainSeriesRef.current}
              tool={drawTool}
              color={drawColor}
              width={drawWidth}
              dash={drawDash}
              magnet={magnet}
              drawings={drawings}
              onChange={updateDrawings}
              onCommit={() => setDrawTool("cursor")}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
            />
          )}
        </div>
        {showDraw ? (
          <DrawingToolbar
            tool={drawTool}
            setTool={setDrawTool}
            color={drawColor}
            setColor={setDrawColor}
            width={drawWidth}
            setWidth={setDrawWidth}
            dash={drawDash}
            setDash={setDrawDash}
            magnet={magnet}
            setMagnet={setMagnet}
            hasSelection={!!selectedId}
            onDeleteSelected={() => {
              if (selectedId) updateDrawings(drawings.filter((d) => d.id !== selectedId));
              setSelectedId(null);
            }}
            onClear={() => {
              updateDrawings([]);
              setSelectedId(null);
            }}
            onCollapse={() => {
              setShowDraw(false);
              localStorage.setItem("robinview.drawToolbar", "0");
            }}
          />
        ) : (
          <button
            className="draw-reopen"
            onClick={() => {
              setShowDraw(true);
              localStorage.setItem("robinview.drawToolbar", "1");
            }}
            title="Show drawing tools"
          >
            <ToolIcon tool="brush" size={16} />
          </button>
        )}

        <button
          className={`objects-toggle ${showObjects ? "on" : ""}`}
          onClick={() => setShowObjects((v) => !v)}
          title="Objects (drawings)"
        >
          <IconLayers size={15} />
          Objects
          {drawings.length > 0 && <span className="objects-count">{drawings.length}</span>}
        </button>
        {showObjects && (
          <ObjectsPanel
            drawings={drawings}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            onChange={updateDrawings}
            onClose={() => setShowObjects(false)}
          />
        )}

        {replay && (
          <div className="replay-bar">
            <button className="iconbtn" title="Step back" onClick={() => setReplayIdx((i) => Math.max(2, i - 1))}>⏮</button>
            <button
              className="iconbtn"
              title={replayPlaying ? "Pause" : "Play"}
              onClick={() => setReplayPlaying((p) => !p)}
              style={{ color: "var(--up)" }}
            >
              {replayPlaying ? "⏸" : "▶"}
            </button>
            <button
              className="iconbtn"
              title="Step forward"
              onClick={() => setReplayIdx((i) => Math.min(candlesRef.current.length - 1, i + 1))}
            >
              ⏭
            </button>
            {(() => {
              const total = candlesRef.current.length;
              const idx = Math.min(replayIdx, total - 1);
              const bar = candlesRef.current[idx];
              return (
                <>
                  <span className="replay-info mono">
                    {bar ? fmtReplayDate(bar.time * 1000, tf) : ""}
                    <span className="dim"> · bar {Math.min(replayIdx + 1, total)}/{total}</span>
                  </span>
                  <input
                    className="replay-range"
                    type="range"
                    min={2}
                    max={Math.max(2, total - 1)}
                    value={idx}
                    onChange={(e) => setReplayIdx(Number(e.target.value))}
                  />
                </>
              );
            })()}
          </div>
        )}

        <div className="chart-legend">
          <div className="row" style={{ fontWeight: 700, fontFamily: "var(--font-display)", fontSize: 14 }}>
            {symbol}
            <span className="dim" style={{ fontFamily: "var(--font-mono)", fontWeight: 400 }}>
              {tf} · {type}
            </span>
          </div>
          <div className="cmp-row">
            {compareSymbols.map(({ sym, color }) => (
              <span key={sym} className="cmp-chip" style={{ borderColor: color }}>
                <span className="cmp-dot" style={{ background: color }} />
                {sym}
                <button onClick={() => removeCompare(sym)} title="Remove comparison">×</button>
              </span>
            ))}
            <div className="cmp-add-wrap">
              <button className="cmp-add" onClick={() => setCmpOpen((o) => !o)}>+ Compare</button>
              {cmpOpen && (
                <div className="cmp-search">
                  <input
                    autoFocus
                    value={cmpQuery}
                    placeholder="Add symbol to compare…"
                    onChange={(e) => setCmpQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addCompare(cmpQuery);
                      if (e.key === "Escape") setCmpOpen(false);
                    }}
                  />
                  {cmpResults.length > 0 && (
                    <div className="cmp-results">
                      {cmpResults.slice(0, 6).map((r) => (
                        <div key={r.symbol} className="cmp-res" onClick={() => addCompare(r.symbol)}>
                          <b>{r.symbol}</b>
                          <span>{r.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {legend && (
            <div className="chart-ohlc">
              <span>O <b>{fmtPrice(legend.o)}</b></span>
              <span>H <b className="up">{fmtPrice(legend.h)}</b></span>
              <span>L <b className="down">{fmtPrice(legend.l)}</b></span>
              <span>C <b>{fmtPrice(legend.c)}</b></span>
              <span>Vol <b>{compactNum(legend.v)}</b></span>
            </div>
          )}
        </div>
        {loading && (
          <div className="empty" style={{ position: "absolute", inset: 0, background: "var(--surface-1)" }}>
            <div className="loader" />
          </div>
        )}
      </div>
    </div>
  );
}
