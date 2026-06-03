import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";

export type DrawTool =
  | "cursor"
  | "trend"
  | "ray"
  | "hline"
  | "vline"
  | "rect"
  | "fib"
  | "brush"
  | "text"
  | "measure";

// A point anchored in chart space: time (x, epoch seconds - stable across
// timeframe changes and reloads, unlike a logical index) + price (y).
export interface Pt {
  t: number;
  p: number;
}
// Legacy point format ({l,p}) persisted before the time-anchoring refactor.
// Migrated to {t,p} on load (see migrateDrawings).
export interface LegacyPt {
  l: number;
  p: number;
}
export interface Drawing {
  id: string;
  tool: DrawTool;
  pts: Pt[];
  color: string;
  width?: number; // stroke width in px (default 1.5)
  dash?: boolean; // dashed stroke
  text?: string;
  name?: string; // custom label shown in the Objects panel
  hidden?: boolean;
  createdAt?: number;
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export function DrawingLayer({
  chart,
  series,
  tool,
  color,
  width,
  dash,
  magnet,
  drawings,
  onChange,
  onCommit,
  selectedId,
  setSelectedId,
}: {
  chart: IChartApi;
  series: ISeriesApi<any>;
  tool: DrawTool;
  color: string;
  width: number; // stroke width for new drawings (px)
  dash: boolean; // dashed stroke for new drawings
  magnet: boolean; // snap new/dragged points to nearest OHLC value
  drawings: Drawing[];
  onChange: (d: Drawing[]) => void;
  onCommit: () => void; // reset tool to cursor after a one-shot draw
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [, force] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<Drawing | null>(null);
  const [edit, setEdit] = useState<Drawing | null>(null); // shape being dragged
  const [measure, setMeasure] = useState<Drawing | null>(null); // transient ruler
  const drafting = useRef(false);
  // Is there anything that needs re-projecting on pan/zoom? Kept in a ref so the
  // chart's range-change subscription can cheaply skip re-renders when empty.
  const hasContent = useRef(false);
  hasContent.current = drawings.length > 0 || !!draft || !!edit || !!measure;

  // clear the measurement when leaving the measure tool or pressing Escape
  useEffect(() => {
    if (tool !== "measure") setMeasure(null);
  }, [tool]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMeasure(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // re-project on every pan / zoom / resize
  useEffect(() => {
    const ts = chart.timeScale();
    const bump = () => force((n) => n + 1);
    // During a pan/zoom this fires every frame - skip the re-render when there's
    // nothing drawn to re-project.
    const onRange = () => {
      if (hasContent.current) bump();
    };
    ts.subscribeVisibleLogicalRangeChange(onRange);
    const ro = new ResizeObserver(() => {
      if (svgRef.current) {
        const r = svgRef.current.getBoundingClientRect();
        setSize({ w: r.width, h: r.height });
      }
      bump();
    });
    if (svgRef.current) ro.observe(svgRef.current);
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(onRange);
      ro.disconnect();
    };
  }, [chart]);

  // Empty-space click -> deselect. In cursor mode the SVG root is
  // pointer-events:none so its own onClick never fires; instead we listen to the
  // chart canvas. A click that lands on a drawing is consumed by that SVG shape
  // (the topmost hit target), so the canvas only fires for genuine empty space.
  const toolRef = useRef(tool);
  toolRef.current = tool;
  useEffect(() => {
    const handler = () => {
      if (toolRef.current === "cursor") setSelectedId(null);
    };
    chart.subscribeClick(handler);
    return () => chart.unsubscribeClick(handler);
  }, [chart, setSelectedId]);

  // delete selected with keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const t = e.target as HTMLElement;
        if (t?.matches?.("input,textarea")) return;
        onChange(drawings.filter((d) => d.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, drawings, onChange, setSelectedId]);

  const ts = chart.timeScale();
  const toX = (t: number) => ts.timeToCoordinate(t as Time);
  const toY = (p: number) => series.priceToCoordinate(p);

  // Magnet snapping: given an x-coordinate and a raw price, snap the price to the
  // nearest OHLC value of the bar under that coordinate. True OHLC snapping -
  // lightweight-charts v4 exposes the loaded bar data via series.dataByIndex(),
  // so no extra `candles` prop is needed. If the bar (or its OHLC) can't be
  // resolved, the raw price is returned unchanged (never throws).
  const snapPrice = (x: number, rawPrice: number): number => {
    try {
      const logical = ts.coordinateToLogical(x);
      if (logical == null) return rawPrice;
      const bar: any = series.dataByIndex(Math.round(logical as number));
      if (!bar) return rawPrice;
      const vals = [bar.open, bar.high, bar.low, bar.close].filter(
        (v): v is number => typeof v === "number",
      );
      if (!vals.length) return rawPrice;
      let best = vals[0];
      let bestD = Math.abs(rawPrice - best);
      for (const v of vals) {
        const dd = Math.abs(rawPrice - v);
        if (dd < bestD) {
          best = v;
          bestD = dd;
        }
      }
      return best;
    } catch {
      return rawPrice;
    }
  };

  const fromXY = (clientX: number, clientY: number): Pt | null => {
    const r = svgRef.current!.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const t = ts.coordinateToTime(x);
    const p = series.coordinateToPrice(y);
    if (t == null || p == null) return null;
    const price = magnet ? snapPrice(x, p as number) : (p as number);
    return { t: t as number, p: price };
  };

  // ---- pointer interaction (only when a draw tool is active) ----
  const onPointerDown = (e: React.PointerEvent) => {
    if (tool === "cursor") return;
    const pt = fromXY(e.clientX, e.clientY);
    if (!pt) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);

    if (tool === "text") {
      const text = prompt("Note text:");
      if (text) commit({ id: id(), tool, pts: [pt], color, width, dash, text });
      onCommit();
      return;
    }
    if (tool === "hline" || tool === "vline") {
      commit({ id: id(), tool, pts: [pt], color, width, dash });
      onCommit();
      return;
    }
    drafting.current = true;
    setDraft({ id: id(), tool, pts: tool === "brush" ? [pt] : [pt, pt], color, width, dash });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drafting.current || !draft) return;
    const pt = fromXY(e.clientX, e.clientY);
    if (!pt) return;
    if (draft.tool === "brush") setDraft({ ...draft, pts: [...draft.pts, pt] });
    else setDraft({ ...draft, pts: [draft.pts[0], pt] });
  };

  const onPointerUp = () => {
    if (!drafting.current || !draft) return;
    drafting.current = false;
    if (draft.tool === "measure") {
      setMeasure(draft); // transient - not saved to the objects list
      setDraft(null);
      return; // keep the measure tool active for repeated measurements
    }
    if (draft.pts.length >= 2 || draft.tool === "brush") commit(draft);
    setDraft(null);
    onCommit();
  };

  const commit = (d: Drawing) => onChange([...drawings, { ...d, createdAt: d.createdAt ?? Date.now() }]);

  // ---- drag-to-edit an existing drawing (cursor mode) ----
  const startEdit = (
    e: React.PointerEvent,
    d: Drawing,
    kind: "point" | "body",
    index = 0,
  ) => {
    if (tool !== "cursor") return;
    e.stopPropagation();
    setSelectedId(d.id);
    const start = fromXY(e.clientX, e.clientY);
    if (!start) return;
    const orig = d.pts;
    const move = (ev: PointerEvent) => {
      const cur = fromXY(ev.clientX, ev.clientY);
      if (!cur) return;
      let pts: Pt[];
      if (kind === "point") pts = orig.map((p, i) => (i === index ? cur : p));
      else {
        const dt = cur.t - start.t;
        const dp = cur.p - start.p;
        pts = orig.map((p) => ({ t: p.t + dt, p: p.p + dp }));
      }
      setEdit({ ...d, pts });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setEdit((cur) => {
        if (cur) onChange(drawings.map((x) => (x.id === cur.id ? cur : x)));
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const W = size.w;
  const H = size.h;

  const renderDrawing = (d: Drawing, isDraft = false) => {
    const sel = d.id === selectedId && !isDraft;
    // Per-drawing stroke width (default 1.5); selection bumps it for visibility.
    const baseW = d.width ?? 1.5;
    const sw = sel ? baseW + 1 : baseW;
    // Per-drawing dash. Pattern scales slightly with width so it stays legible.
    const dashArray = d.dash ? `${baseW * 4} ${baseW * 2.5}` : undefined;
    const common = {
      stroke: d.color,
      strokeWidth: sw,
      strokeDasharray: dashArray,
      fill: "none",
      style: { cursor: tool === "cursor" ? "move" : "crosshair", pointerEvents: "stroke" as const },
      onPointerDown: (e: React.PointerEvent) => startEdit(e, d, "body"),
      onClick: (e: React.MouseEvent) => {
        if (tool === "cursor") {
          e.stopPropagation();
          setSelectedId(d.id);
        }
      },
    };
    const a = d.pts[0];
    const b = d.pts[1];
    const ax = a ? toX(a.t) : null;
    const ay = a ? toY(a.p) : null;

    switch (d.tool) {
      case "hline":
        if (ay == null) return null;
        return <line key={d.id} {...common} x1={0} y1={ay} x2={W} y2={ay} />;
      case "vline":
        if (ax == null) return null;
        return <line key={d.id} {...common} x1={ax} y1={0} x2={ax} y2={H} />;
      case "trend": {
        if (!b) return null;
        const bx = toX(b.t);
        const by = toY(b.p);
        if (ax == null || ay == null || bx == null || by == null) return null;
        return <line key={d.id} {...common} x1={ax} y1={ay} x2={bx} y2={by} />;
      }
      case "ray": {
        if (!b) return null;
        const bx = toX(b.t);
        const by = toY(b.p);
        if (ax == null || ay == null || bx == null || by == null) return null;
        // Extend in the a->b direction to the chart edge, regardless of sign.
        // Parametrize P(t) = a + t*(b-a); forward means t increasing past b (t>1).
        // Intersect with x=0 and x=W and take the nearest forward edge hit.
        const dx = bx - ax;
        const dy = by - ay;
        let t = 1;
        if (dx !== 0) {
          const t0 = (0 - ax) / dx;
          const tW = (W - ax) / dx;
          // pick the forward-going (t>0, in the b direction) edge intersection
          const fwd = [t0, tW].filter((v) => v > 0);
          t = fwd.length ? Math.max(...fwd) : 1;
        } else {
          // vertical ray: extend to whichever horizontal edge is forward
          t = dy >= 0 ? (H - ay) / (dy || 1) : (0 - ay) / (dy || 1);
        }
        t = Math.max(t, 1); // never retract behind b
        const ex = ax + dx * t;
        const ey = ay + dy * t;
        return <line key={d.id} {...common} x1={ax} y1={ay} x2={ex} y2={ey} />;
      }
      case "rect": {
        if (!b) return null;
        const bx = toX(b.t);
        const by = toY(b.p);
        if (ax == null || ay == null || bx == null || by == null) return null;
        return (
          <rect
            key={d.id}
            {...common}
            x={Math.min(ax, bx)}
            y={Math.min(ay, by)}
            width={Math.abs(bx - ax)}
            height={Math.abs(by - ay)}
            fill={d.color + "14"}
          />
        );
      }
      case "fib": {
        if (!b) return null;
        const bx = toX(b.t);
        const by = toY(b.p);
        if (ax == null || ay == null || bx == null || by == null) return null;
        const x1 = Math.min(ax, bx);
        const x2 = Math.max(ax, bx);
        const hi = Math.max(a.p, b.p);
        const lo = Math.min(a.p, b.p);
        return (
          <g key={d.id} onClick={common.onClick} style={common.style as any}>
            {FIB_LEVELS.map((lv) => {
              const price = hi - (hi - lo) * lv;
              const y = toY(price);
              if (y == null) return null;
              return (
                <g key={lv}>
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke={d.color} strokeWidth={baseW} strokeDasharray={dashArray} strokeOpacity={0.7} />
                  <text x={x2 + 4} y={y + 3} fill={d.color} fontSize={10} fontFamily="var(--font-mono)">
                    {lv.toFixed(3)} · {price.toFixed(2)}
                  </text>
                </g>
              );
            })}
          </g>
        );
      }
      case "brush": {
        const pts = d.pts.map((pt) => `${toX(pt.t)},${toY(pt.p)}`).filter((s) => !s.includes("null"));
        if (pts.length < 2) return null;
        return <polyline key={d.id} {...common} points={pts.join(" ")} strokeLinejoin="round" strokeLinecap="round" />;
      }
      case "text": {
        if (ax == null || ay == null) return null;
        return (
          <text
            key={d.id}
            x={ax}
            y={ay}
            fill={d.color}
            fontSize={13}
            fontFamily="var(--font-ui)"
            style={{ pointerEvents: "all", cursor: tool === "cursor" ? "pointer" : "crosshair" }}
            onClick={common.onClick}
          >
            {d.text}
          </text>
        );
      }
      default:
        return null;
    }
  };

  // Draggable endpoint handles for the selected drawing (cursor mode only).
  const renderHandles = (d: Drawing) => {
    if (tool !== "cursor" || d.id !== selectedId || d.tool === "brush") return null;
    let pts: { x: number | null; y: number | null; i: number }[] = [];
    if (d.tool === "hline") pts = [{ x: W / 2, y: toY(d.pts[0].p), i: 0 }];
    else if (d.tool === "vline") pts = [{ x: toX(d.pts[0].t), y: H / 2, i: 0 }];
    else pts = d.pts.map((p, i) => ({ x: toX(p.t), y: toY(p.p), i }));
    return pts.map((h) =>
      h.x == null || h.y == null ? null : (
        <circle
          key={`${d.id}-h${h.i}`}
          cx={h.x}
          cy={h.y}
          r={5}
          fill="var(--bg-base)"
          stroke={d.color}
          strokeWidth={2}
          style={{ pointerEvents: "all", cursor: "grab" }}
          onPointerDown={(e) => startEdit(e, d, "point", h.i)}
        />
      ),
    );
  };

  const renderMeasure = () => {
    if (!measure) return null;
    const a = measure.pts[0];
    const b = measure.pts[1];
    if (!a || !b) return null;
    const ax = toX(a.t);
    const ay = toY(a.p);
    const bx = toX(b.t);
    const by = toY(b.p);
    if (ax == null || ay == null || bx == null || by == null) return null;
    const up = b.p >= a.p;
    const c = up ? "#34e29b" : "#ff6a57";
    const dP = b.p - a.p;
    const pct = a.p ? (dP / a.p) * 100 : 0;
    // Bar count is a logical-index distance; derive it from the projected pixels
    // since points are now anchored by time, not logical index.
    const la = ts.coordinateToLogical(ax);
    const lb = ts.coordinateToLogical(bx);
    const bars = la != null && lb != null ? Math.round((lb as number) - (la as number)) : 0;
    const boxW = 132;
    const boxH = 46;
    const bxX = Math.min(Math.max(bx + 10, 0), W - boxW);
    const bxY = Math.min(Math.max(by - boxH / 2, 0), H - boxH);
    return (
      <g style={{ pointerEvents: "none" }}>
        <rect x={Math.min(ax, bx)} y={Math.min(ay, by)} width={Math.abs(bx - ax)} height={Math.abs(by - ay)} fill={c + "14"} stroke={c} strokeWidth={1} strokeDasharray="4 3" />
        <line x1={ax} y1={ay} x2={bx} y2={by} stroke={c} strokeWidth={1.5} />
        <rect x={bxX} y={bxY} width={boxW} height={boxH} rx={6} fill="#141916" stroke={c} strokeWidth={1} />
        <text x={bxX + 9} y={bxY + 18} fill={c} fontSize={12.5} fontFamily="var(--font-mono)" fontWeight={600}>
          {dP >= 0 ? "+" : ""}{dP.toFixed(2)} ({pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)
        </text>
        <text x={bxX + 9} y={bxY + 35} fill="var(--text-3)" fontSize={11} fontFamily="var(--font-mono)">
          {Math.abs(bars)} bars
        </text>
      </g>
    );
  };

  const editId = edit?.id;

  return (
    <svg
      ref={svgRef}
      className="draw-layer"
      style={{ pointerEvents: tool === "cursor" ? "none" : "all", cursor: tool === "cursor" ? "default" : "crosshair" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={() => {
        if (tool === "cursor") setSelectedId(null);
      }}
    >
      {drawings
        .filter((d) => !d.hidden)
        .map((d) => {
          const dd = editId === d.id && edit ? edit : d;
          return (
            <g key={d.id}>
              {renderDrawing(dd)}
              {renderHandles(dd)}
            </g>
          );
        })}
      {draft && renderDrawing(draft, true)}
      {renderMeasure()}
    </svg>
  );
}

function id() {
  return crypto.randomUUID();
}

// Drawings are anchored by time ({t,p}). Older saves used logical index ({l,p}),
// which isn't stable across timeframe changes / reloads. Convert any legacy points
// to time using the currently loaded candles (candles[l].time). A drawing whose
// point can't be converted (index out of range for this candle set) is dropped
// rather than rendered at the wrong place. Already-migrated drawings pass through
// untouched, so this is safe to run repeatedly.
export function migrateDrawings(
  raw: unknown,
  candles: { time: number }[],
): { drawings: Drawing[]; changed: boolean } {
  if (!Array.isArray(raw)) return { drawings: [], changed: false };
  let changed = false;
  const out: Drawing[] = [];
  for (const d of raw as any[]) {
    if (!d || !Array.isArray(d.pts)) {
      changed = true;
      continue;
    }
    const pts: Pt[] = [];
    let ok = true;
    for (const pt of d.pts as (Pt | LegacyPt)[]) {
      if (pt && typeof (pt as Pt).t === "number") {
        pts.push({ t: (pt as Pt).t, p: (pt as any).p });
      } else if (pt && typeof (pt as LegacyPt).l === "number") {
        const t = candles[(pt as LegacyPt).l]?.time;
        if (t == null) {
          ok = false;
          break;
        }
        pts.push({ t, p: (pt as any).p });
        changed = true;
      } else {
        ok = false;
        break;
      }
    }
    if (ok && pts.length) out.push({ ...d, pts });
    else changed = true; // dropped an unconvertible drawing
  }
  return { drawings: out, changed };
}
