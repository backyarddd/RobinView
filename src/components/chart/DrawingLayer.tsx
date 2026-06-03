import { useEffect, useRef, useState, useCallback } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";

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

// A point anchored in chart space: logical index (x, survives pan/zoom and
// extends into whitespace) + price (y).
interface Pt {
  l: number;
  p: number;
}
export interface Drawing {
  id: string;
  tool: DrawTool;
  pts: Pt[];
  color: string;
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
    ts.subscribeVisibleLogicalRangeChange(bump);
    const ro = new ResizeObserver(() => {
      if (svgRef.current) {
        const r = svgRef.current.getBoundingClientRect();
        setSize({ w: r.width, h: r.height });
      }
      bump();
    });
    if (svgRef.current) ro.observe(svgRef.current);
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(bump);
      ro.disconnect();
    };
  }, [chart]);

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
  const toX = (l: number) => ts.logicalToCoordinate(l as any);
  const toY = (p: number) => series.priceToCoordinate(p);
  const fromXY = (clientX: number, clientY: number): Pt | null => {
    const r = svgRef.current!.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const l = ts.coordinateToLogical(x);
    const p = series.coordinateToPrice(y);
    if (l == null || p == null) return null;
    return { l: l as number, p: p as number };
  };

  // ---- pointer interaction (only when a draw tool is active) ----
  const onPointerDown = (e: React.PointerEvent) => {
    if (tool === "cursor") return;
    const pt = fromXY(e.clientX, e.clientY);
    if (!pt) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);

    if (tool === "text") {
      const text = prompt("Note text:");
      if (text) commit({ id: id(), tool, pts: [pt], color, text });
      onCommit();
      return;
    }
    if (tool === "hline" || tool === "vline") {
      commit({ id: id(), tool, pts: [pt], color });
      onCommit();
      return;
    }
    drafting.current = true;
    setDraft({ id: id(), tool, pts: tool === "brush" ? [pt] : [pt, pt], color });
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
      setMeasure(draft); // transient — not saved to the objects list
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
        const dl = cur.l - start.l;
        const dp = cur.p - start.p;
        pts = orig.map((p) => ({ l: p.l + dl, p: p.p + dp }));
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
    const sw = sel ? 2.5 : 1.6;
    const common = {
      stroke: d.color,
      strokeWidth: sw,
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
    const ax = a ? toX(a.l) : null;
    const ay = a ? toY(a.p) : null;

    switch (d.tool) {
      case "hline":
        if (ay == null) return null;
        return <line key={d.id} {...common} x1={0} y1={ay} x2={W} y2={ay} strokeDasharray={sel ? "" : "0"} />;
      case "vline":
        if (ax == null) return null;
        return <line key={d.id} {...common} x1={ax} y1={0} x2={ax} y2={H} />;
      case "trend": {
        if (!b) return null;
        const bx = toX(b.l);
        const by = toY(b.p);
        if (ax == null || ay == null || bx == null || by == null) return null;
        return <line key={d.id} {...common} x1={ax} y1={ay} x2={bx} y2={by} />;
      }
      case "ray": {
        if (!b) return null;
        const bx = toX(b.l);
        const by = toY(b.p);
        if (ax == null || ay == null || bx == null || by == null) return null;
        // extend beyond b to the right edge
        const dx = bx - ax;
        const dy = by - ay;
        const t = dx !== 0 ? (W - ax) / dx : 1e6;
        const ex = ax + dx * Math.max(t, 1);
        const ey = ay + dy * Math.max(t, 1);
        return <line key={d.id} {...common} x1={ax} y1={ay} x2={ex} y2={ey} />;
      }
      case "rect": {
        if (!b) return null;
        const bx = toX(b.l);
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
        const bx = toX(b.l);
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
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke={d.color} strokeWidth={1} strokeOpacity={0.7} />
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
        const pts = d.pts.map((pt) => `${toX(pt.l)},${toY(pt.p)}`).filter((s) => !s.includes("null"));
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
    else if (d.tool === "vline") pts = [{ x: toX(d.pts[0].l), y: H / 2, i: 0 }];
    else pts = d.pts.map((p, i) => ({ x: toX(p.l), y: toY(p.p), i }));
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
    const ax = toX(a.l);
    const ay = toY(a.p);
    const bx = toX(b.l);
    const by = toY(b.p);
    if (ax == null || ay == null || bx == null || by == null) return null;
    const up = b.p >= a.p;
    const c = up ? "#34e29b" : "#ff6a57";
    const dP = b.p - a.p;
    const pct = a.p ? (dP / a.p) * 100 : 0;
    const bars = Math.round(b.l - a.l);
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
  return Math.random().toString(36).slice(2, 10);
}
