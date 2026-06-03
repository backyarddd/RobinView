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
import type { Candle, Timeframe } from "@shared/types";
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
    if (indicators.has("sma20")) addLine("sma20", toLine(cs, sma(c, 20)), OVERLAY_COLORS.sma20);
    if (indicators.has("sma50")) addLine("sma50", toLine(cs, sma(c, 50)), OVERLAY_COLORS.sma50);
    if (indicators.has("sma100")) addLine("sma100", toLine(cs, sma(c, 100)), OVERLAY_COLORS.sma100);
    if (indicators.has("sma200")) addLine("sma200", toLine(cs, sma(c, 200)), OVERLAY_COLORS.sma200);
    if (indicators.has("ema9")) addLine("ema9", toLine(cs, ema(c, 9)), OVERLAY_COLORS.ema9);
    if (indicators.has("ema21")) addLine("ema21", toLine(cs, ema(c, 21)), OVERLAY_COLORS.ema21);
    if (indicators.has("ema50")) addLine("ema50", toLine(cs, ema(c, 50)), OVERLAY_COLORS.ema50);
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
  }, [symbol, tf, osc, loading]);

  function drawOsc() {
    const chart = oscChartRef.current;
    const cs = visible();
    if (!chart || !cs.length) return;
    oscRefs.current.forEach((s) => chart.removeSeries(s));
    oscRefs.current = [];
    const c = closes(cs);
    const line = (color: string, w = 2) =>
      chart.addLineSeries({ color, lineWidth: w as any, priceLineVisible: false, lastValueVisible: true });
    const band = (price: number, color: string, title: string) =>
      oscRefs.current[0]?.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title });

    if (osc === "rsi") {
      const l = line("#c08bff");
      l.setData(toLine(cs, rsi(c, 14)).map((p) => ({ time: p.time as Time, value: p.value })));
      oscRefs.current = [l];
      band(70, "rgba(255,106,87,0.4)", "70");
      band(30, "rgba(52,226,155,0.4)", "30");
    } else if (osc === "macd") {
      const m = macd(c);
      const hist = chart.addHistogramSeries({ priceLineVisible: false });
      hist.setData(
        cs.map((cc, i) => ({
          time: cc.time as Time,
          value: Number.isNaN(m.histogram[i]) ? 0 : m.histogram[i],
          color: (m.histogram[i] ?? 0) >= 0 ? "rgba(52,226,155,0.45)" : "rgba(255,106,87,0.45)",
        })),
      );
      const macdLine = line("#6fa8ff");
      macdLine.setData(toLine(cs, m.macd).map((p) => ({ time: p.time as Time, value: p.value })));
      const sigLine = line("#e3b766", 1);
      sigLine.setData(toLine(cs, m.signal).map((p) => ({ time: p.time as Time, value: p.value })));
      oscRefs.current = [hist, macdLine, sigLine];
    } else if (osc === "stoch") {
      const s = stochastic(cs, 14, 3, 3);
      const kL = line("#6fa8ff");
      kL.setData(toLine(cs, s.k).map((p) => ({ time: p.time as Time, value: p.value })));
      const dL = line("#e3b766", 1);
      dL.setData(toLine(cs, s.d).map((p) => ({ time: p.time as Time, value: p.value })));
      oscRefs.current = [kL, dL];
      band(80, "rgba(255,106,87,0.4)", "80");
      band(20, "rgba(52,226,155,0.4)", "20");
    } else if (osc === "williams") {
      const l = line("#c08bff");
      l.setData(toLine(cs, williamsR(cs, 14)).map((p) => ({ time: p.time as Time, value: p.value })));
      oscRefs.current = [l];
      band(-20, "rgba(255,106,87,0.4)", "-20");
      band(-80, "rgba(52,226,155,0.4)", "-80");
    } else if (osc === "atr") {
      const l = line("#ff9f7a");
      l.setData(toLine(cs, atr(cs, 14)).map((p) => ({ time: p.time as Time, value: p.value })));
      oscRefs.current = [l];
    } else if (osc === "obv") {
      const l = line("#5ad1c4");
      l.setData(toLine(cs, obv(cs)).map((p) => ({ time: p.time as Time, value: p.value })));
      oscRefs.current = [l];
    } else if (osc === "roc") {
      const l = line("#9bd45a");
      l.setData(toLine(cs, roc(c, 12)).map((p) => ({ time: p.time as Time, value: p.value })));
      oscRefs.current = [l];
      band(0, "rgba(255,255,255,0.2)", "0");
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

  // price scale mode: 0 normal · 1 logarithmic · 2 percentage
  useEffect(() => {
    if (!chartRef.current) return;
    const mode = scaleMode === "log" ? 1 : scaleMode === "percent" ? 2 : 0;
    chartRef.current.priceScale("right").applyOptions({ mode });
  }, [scaleMode, chartNonce]);

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
            <span className="replay-info mono">
              {candlesRef.current[Math.min(replayIdx, candlesRef.current.length - 1)]
                ? fmtDate(candlesRef.current[Math.min(replayIdx, candlesRef.current.length - 1)].time * 1000)
                : ""}
              <span className="dim"> · bar {Math.min(replayIdx + 1, candlesRef.current.length)}/{candlesRef.current.length}</span>
            </span>
            <input
              className="replay-range"
              type="range"
              min={2}
              max={Math.max(2, candlesRef.current.length - 1)}
              value={Math.min(replayIdx, candlesRef.current.length - 1)}
              onChange={(e) => setReplayIdx(Number(e.target.value))}
            />
          </div>
        )}

        <div className="chart-legend">
          <div className="row" style={{ fontWeight: 700, fontFamily: "var(--font-display)", fontSize: 14 }}>
            {symbol}
            <span className="dim" style={{ fontFamily: "var(--font-mono)", fontWeight: 400 }}>
              {tf} · {type}
            </span>
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
