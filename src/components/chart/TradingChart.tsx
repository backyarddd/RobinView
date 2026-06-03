import { useEffect, useRef, useState, useCallback } from "react";
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
import { ChartToolbar, OSCILLATORS, type ChartType, type IndicatorKey, type ScaleMode } from "./ChartToolbar";
import { DrawingLayer, type DrawTool, type Drawing } from "./DrawingLayer";
import { DrawingToolbar } from "./DrawingToolbar";
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
import { price as fmtPrice, compactNum, fmtDate } from "../../lib/format";

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

interface Legend {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  up: boolean;
}

export function TradingChart({ symbol }: { symbol: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const oscRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const oscChartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const overlayRefs = useRef<Record<string, ISeriesApi<"Line">>>({});
  const compareSeriesRef = useRef<Record<string, ISeriesApi<"Line">>>({});
  const oscRefs = useRef<ISeriesApi<any>[]>([]);
  const candlesRef = useRef<Candle[]>([]);
  const syncing = useRef(false);

  const [tf, setTf] = useState<Timeframe>("1D");
  const [type, setType] = useState<ChartType>("candles");
  const [scaleMode, setScaleMode] = useState<ScaleMode>("normal");
  const [indicators, setIndicators] = useState<Set<IndicatorKey>>(new Set(["sma20", "volume"]));
  const [legend, setLegend] = useState<Legend | null>(null);
  const [loading, setLoading] = useState(true);
  const [replay, setReplay] = useState(false);
  const [replayIdx, setReplayIdx] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool>("cursor");
  const [drawColor, setDrawColor] = useState("#34e29b");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [showObjects, setShowObjects] = useState(false);
  const [chartNonce, setChartNonce] = useState(0); // bumps when chart/series (re)created
  const [compareSymbols, setCompareSymbols] = useState<string[]>([]);
  const [cmpOpen, setCmpOpen] = useState(false);
  const [cmpQuery, setCmpQuery] = useState("");
  const [cmpResults, setCmpResults] = useState<SearchResult[]>([]);

  const liveQuote = useStore((s) => s.quotes[symbol]);
  const osc: IndicatorKey | null = OSCILLATORS.find((k) => indicators.has(k)) ?? null;

  // ---- create main chart once ----
  useEffect(() => {
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
      const idx = candlesRef.current.findIndex((c) => c.time === (param.time as number));
      const c = candlesRef.current[idx];
      if (c) setLegend({ o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume, up: c.close >= c.open });
    });

    const ro = new ResizeObserver(() => {
      if (hostRef.current) chart.applyOptions({ width: hostRef.current.clientWidth, height: hostRef.current.clientHeight });
    });
    ro.observe(hostRef.current);

    // sync oscillator time scale -> main
    chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (syncing.current || !oscChartRef.current || !r) return;
      syncing.current = true;
      oscChartRef.current.timeScale().setVisibleLogicalRange(r as LogicalRange);
      syncing.current = false;
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
        rebuildMainSeries();
        applyData();
        chartRef.current?.timeScale().fitContent();
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

  // candles currently shown — full history, or truncated during bar replay.
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
    // Moving-average overlays are uniform — drive them from a table.
    const MAS: [IndicatorKey, (v: number[], p: number) => number[], number][] = [
      ["sma20", sma, 20], ["sma50", sma, 50], ["sma100", sma, 100], ["sma200", sma, 200],
      ["ema9", ema, 9], ["ema21", ema, 21], ["ema50", ema, 50],
    ];
    for (const [key, fn, p] of MAS) {
      if (indicators.has(key)) addLine(key, toLine(cs, fn(c, p)), OVERLAY_COLORS[key]);
    }
    if (indicators.has("vwap")) addLine("vwap", toLine(cs, vwap(cs)), OVERLAY_COLORS.vwap);
    if (indicators.has("bb")) {
      const b = bollinger(c, 20, 2);
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
      ls.setData(toLine(cs, psar(cs)).map((p) => ({ time: p.time as Time, value: p.value })));
      overlayRefs.current["psar"] = ls;
    }
  }

  // ---- oscillator pane ----
  useEffect(() => {
    if (!osc) {
      if (oscChartRef.current) {
        oscChartRef.current.remove();
        oscChartRef.current = null;
        oscRefs.current = [];
      }
      return;
    }
    if (!oscRef.current) return;
    const chart = createChart(oscRef.current, {
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
    oscChartRef.current = chart;
    chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (syncing.current || !chartRef.current || !r) return;
      syncing.current = true;
      chartRef.current.timeScale().setVisibleLogicalRange(r as LogicalRange);
      syncing.current = false;
    });
    const ro = new ResizeObserver(() => {
      if (oscRef.current) chart.applyOptions({ width: oscRef.current.clientWidth, height: oscRef.current.clientHeight });
    });
    ro.observe(oscRef.current);
    drawOsc();
    return () => {
      ro.disconnect();
      chart.remove();
      oscChartRef.current = null;
      oscRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osc]);

  useEffect(() => {
    if (osc && oscChartRef.current) drawOsc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, osc]);

  function drawOsc() {
    const chart = oscChartRef.current;
    const cs = visible();
    if (!chart || !cs.length) return;
    oscRefs.current.forEach((s) => chart.removeSeries(s));
    oscRefs.current = [];
    const c = closes(cs);
    const line = (color: string, w = 2) =>
      chart.addLineSeries({ color, lineWidth: w as any, priceLineVisible: false, lastValueVisible: true });
    const plot = (color: string, values: number[], w = 2) => {
      const l = line(color, w);
      l.setData(toLine(cs, values).map((p) => ({ time: p.time as Time, value: p.value })));
      return l;
    };
    const band = (price: number, color: string) =>
      oscRefs.current[0]?.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: String(price) });
    const UP = "rgba(52,226,155,0.4)";
    const DOWN = "rgba(255,106,87,0.4)";

    if (osc === "macd") {
      const m = macd(c);
      const hist = chart.addHistogramSeries({ priceLineVisible: false });
      hist.setData(
        cs.map((cc, i) => ({
          time: cc.time as Time,
          value: Number.isNaN(m.histogram[i]) ? 0 : m.histogram[i],
          color: (m.histogram[i] ?? 0) >= 0 ? "rgba(52,226,155,0.45)" : "rgba(255,106,87,0.45)",
        })),
      );
      oscRefs.current = [hist, plot("#6fa8ff", m.macd), plot("#e3b766", m.signal, 1)];
    } else if (osc === "stoch") {
      const s = stochastic(cs, 14, 3, 3);
      oscRefs.current = [plot("#6fa8ff", s.k), plot("#e3b766", s.d, 1)];
      band(80, DOWN);
      band(20, UP);
    } else {
      // Single-line oscillators share one shape: a line plus optional bands.
      const SINGLE: Partial<Record<IndicatorKey, { color: string; values: number[]; bands?: [number, string][] }>> = {
        rsi: { color: "#c08bff", values: rsi(c, 14), bands: [[70, DOWN], [30, UP]] },
        williams: { color: "#c08bff", values: williamsR(cs, 14), bands: [[-20, DOWN], [-80, UP]] },
        atr: { color: "#ff9f7a", values: atr(cs, 14) },
        obv: { color: "#5ad1c4", values: obv(cs) },
        roc: { color: "#9bd45a", values: roc(c, 12), bands: [[0, "rgba(255,255,255,0.2)"]] },
      };
      const cfg = osc ? SINGLE[osc] : undefined;
      if (cfg) {
        oscRefs.current = [plot(cfg.color, cfg.values)];
        cfg.bands?.forEach(([p, col]) => band(p, col));
      }
    }
    chart.timeScale().fitContent();
  }

  // ---- live price -> update last candle (paused during replay) ----
  useEffect(() => {
    if (replay) return;
    if (!liveQuote || !mainSeriesRef.current || !candlesRef.current.length) return;
    const cs = candlesRef.current;
    const last = cs[cs.length - 1];
    last.close = liveQuote.price;
    last.high = Math.max(last.high, liveQuote.price);
    last.low = Math.min(last.low, liveQuote.price);
    const s = mainSeriesRef.current;
    if (type === "heikin") {
      setMainData(cs); // HA last bar depends on the chain — recompute
    } else if (type === "candles") {
      s.update({ time: last.time as Time, open: last.open, high: last.high, low: last.low, close: last.close });
    } else {
      s.update({ time: last.time as Time, value: last.close });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveQuote, type, replay]);

  // load/persist drawings per symbol
  useEffect(() => {
    try {
      setDrawings(JSON.parse(localStorage.getItem(`robinview.drawings.${symbol}`) || "[]"));
    } catch {
      setDrawings([]);
    }
    setSelectedId(null);
  }, [symbol]);

  const updateDrawings = useCallback(
    (next: Drawing[]) => {
      setDrawings(next);
      localStorage.setItem(`robinview.drawings.${symbol}`, JSON.stringify(next));
    },
    [symbol],
  );

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

  // comparison overlays — normalized % lines on the same scale
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let alive = true;
    for (const sym of Object.keys(compareSeriesRef.current)) {
      if (!compareSymbols.includes(sym)) {
        chart.removeSeries(compareSeriesRef.current[sym]);
        delete compareSeriesRef.current[sym];
      }
    }
    compareSymbols.forEach((sym, i) => {
      api
        .candles(sym, tf)
        .then((series) => {
          if (!alive || !chartRef.current) return;
          let s = compareSeriesRef.current[sym];
          if (!s) {
            s = chart.addLineSeries({
              color: CMP_COLORS[i % CMP_COLORS.length],
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
    if (!s || s === symbol || compareSymbols.includes(s)) return;
    setCompareSymbols((p) => [...p, s].slice(0, 4));
    setCmpOpen(false);
    setCmpQuery("");
    setCmpResults([]);
  };
  const removeCompare = (sym: string) => setCompareSymbols((p) => p.filter((x) => x !== sym));

  // bar replay: re-render the visible slice when the index / toggle changes
  useEffect(() => {
    if (candlesRef.current.length) {
      applyData();
      if (osc && oscChartRef.current) drawOsc();
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

  // drawing-tool hotkeys (ignored while typing or with modifiers)
  useEffect(() => {
    const map: Record<string, DrawTool> = {
      t: "trend", r: "ray", h: "hline", v: "vline", b: "rect",
      f: "fib", d: "brush", x: "text", m: "measure", escape: "cursor",
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el?.matches?.("input,textarea,select")) return;
      const t = map[e.key.toLowerCase()];
      if (t) {
        setDrawTool(t);
        if (t === "cursor") setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      else {
        // Only one oscillator at a time (single lower pane).
        if (OSCILLATORS.includes(k)) OSCILLATORS.forEach((o) => next.delete(o));
        next.add(k);
      }
      return next;
    });
  };

  return (
    <div className="panel t-chart">
      <ChartToolbar
        tf={tf}
        setTf={setTf}
        type={type}
        setType={setType}
        scaleMode={scaleMode}
        setScaleMode={setScaleMode}
        indicators={indicators}
        toggle={toggle}
        symbol={symbol}
        onExport={exportPng}
        replayActive={replay}
        onToggleReplay={toggleReplay}
      />
      <div className="chart-wrap">
        <div ref={hostRef} className="chart-host" style={{ bottom: osc ? "30%" : 0 }} />
        {osc && <div ref={oscRef} className="chart-host" style={{ top: "70%", borderTop: "1px solid var(--line)" }} />}
        <div className="draw-host" style={{ bottom: osc ? "30%" : 0 }}>
          {chartNonce > 0 && chartRef.current && mainSeriesRef.current && (
            <DrawingLayer
              chart={chartRef.current}
              series={mainSeriesRef.current}
              tool={drawTool}
              color={drawColor}
              drawings={drawings}
              onChange={updateDrawings}
              onCommit={() => setDrawTool("cursor")}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
            />
          )}
        </div>
        <DrawingToolbar
          tool={drawTool}
          setTool={setDrawTool}
          color={drawColor}
          setColor={setDrawColor}
          hasSelection={!!selectedId}
          onDeleteSelected={() => {
            if (selectedId) updateDrawings(drawings.filter((d) => d.id !== selectedId));
            setSelectedId(null);
          }}
          onClear={() => {
            updateDrawings([]);
            setSelectedId(null);
          }}
        />

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
                    {bar ? fmtDate(bar.time * 1000) : ""}
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
            {compareSymbols.map((sym, i) => (
              <span key={sym} className="cmp-chip" style={{ borderColor: CMP_COLORS[i % CMP_COLORS.length] }}>
                <span className="cmp-dot" style={{ background: CMP_COLORS[i % CMP_COLORS.length] }} />
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
