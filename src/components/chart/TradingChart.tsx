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
import { ChartToolbar, type ChartType, type IndicatorKey } from "./ChartToolbar";
import {
  sma,
  ema,
  bollinger,
  vwap,
  rsi,
  macd,
  toLine,
  closes,
} from "../../lib/indicators";
import { money, price as fmtPrice, compactNum } from "../../lib/format";

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
  ema21: "#c08bff",
  vwap: "#ff9f7a",
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
  const [indicators, setIndicators] = useState<Set<IndicatorKey>>(new Set(["sma20", "volume"]));
  const [legend, setLegend] = useState<Legend | null>(null);
  const [loading, setLoading] = useState(true);

  const liveQuote = useStore((s) => s.quotes[symbol]);
  const osc: "rsi" | "macd" | null = indicators.has("rsi")
    ? "rsi"
    : indicators.has("macd")
      ? "macd"
      : null;

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
    if (type === "candles") {
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
    } else {
      mainSeriesRef.current = chart.addLineSeries({
        color: THEME.up,
        lineWidth: 2,
        priceLineColor: "rgba(255,255,255,0.25)",
      });
    }
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

  function setMainData() {
    const cs = candlesRef.current;
    const s = mainSeriesRef.current;
    if (!s) return;
    if (type === "candles") {
      s.setData(cs.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
    } else {
      s.setData(cs.map((c) => ({ time: c.time as Time, value: c.close })));
    }
  }

  function applyData() {
    const chart = chartRef.current;
    if (!chart) return;
    const cs = candlesRef.current;
    setMainData();

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
    if (indicators.has("ema21")) addLine("ema21", toLine(cs, ema(c, 21)), OVERLAY_COLORS.ema21);
    if (indicators.has("vwap")) addLine("vwap", toLine(cs, vwap(cs)), OVERLAY_COLORS.vwap);
    if (indicators.has("bb")) {
      const b = bollinger(c, 20, 2);
      addLine("bbU", toLine(cs, b.upper), OVERLAY_COLORS.bbU, 1);
      addLine("bbM", toLine(cs, b.middle), OVERLAY_COLORS.bbM, 1);
      addLine("bbL", toLine(cs, b.lower), OVERLAY_COLORS.bbL, 1);
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
    const cs = candlesRef.current;
    if (!chart || !cs.length) return;
    oscRefs.current.forEach((s) => chart.removeSeries(s));
    oscRefs.current = [];
    const c = closes(cs);
    if (osc === "rsi") {
      const r = rsi(c, 14);
      const line = chart.addLineSeries({ color: "#c08bff", lineWidth: 2, priceLineVisible: false });
      line.setData(toLine(cs, r).map((p) => ({ time: p.time as Time, value: p.value })));
      line.createPriceLine({ price: 70, color: "rgba(255,106,87,0.4)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "70" });
      line.createPriceLine({ price: 30, color: "rgba(52,226,155,0.4)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "30" });
      oscRefs.current = [line];
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
      const macdLine = chart.addLineSeries({ color: "#6fa8ff", lineWidth: 2, priceLineVisible: false });
      macdLine.setData(toLine(cs, m.macd).map((p) => ({ time: p.time as Time, value: p.value })));
      const sigLine = chart.addLineSeries({ color: "#e3b766", lineWidth: 1, priceLineVisible: false });
      sigLine.setData(toLine(cs, m.signal).map((p) => ({ time: p.time as Time, value: p.value })));
      oscRefs.current = [hist, macdLine, sigLine];
    }
    chart.timeScale().fitContent();
  }

  // ---- live price -> update last candle ----
  useEffect(() => {
    if (!liveQuote || !mainSeriesRef.current || !candlesRef.current.length) return;
    const cs = candlesRef.current;
    const last = cs[cs.length - 1];
    last.close = liveQuote.price;
    last.high = Math.max(last.high, liveQuote.price);
    last.low = Math.min(last.low, liveQuote.price);
    const s = mainSeriesRef.current;
    if (type === "candles") {
      s.update({ time: last.time as Time, open: last.open, high: last.high, low: last.low, close: last.close });
    } else {
      s.update({ time: last.time as Time, value: last.close });
    }
  }, [liveQuote, type]);

  const toggle = (k: IndicatorKey) => {
    setIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else {
        // rsi and macd are mutually exclusive (single oscillator pane)
        if (k === "rsi") next.delete("macd");
        if (k === "macd") next.delete("rsi");
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
        indicators={indicators}
        toggle={toggle}
        symbol={symbol}
      />
      <div className="chart-wrap">
        <div ref={hostRef} className="chart-host" style={{ bottom: osc ? "30%" : 0 }} />
        {osc && <div ref={oscRef} className="chart-host" style={{ top: "70%", borderTop: "1px solid var(--line)" }} />}
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
