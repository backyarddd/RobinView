import type { DrawTool } from "./DrawingLayer";
import { IconTrash, S } from "../common/icons";

export const TOOL_META: Record<DrawTool, { name: string; desc: string }> = {
  cursor: { name: "Cursor", desc: "Select objects & pan / zoom the chart" },
  trend: { name: "Trend line", desc: "Draw a line between two points" },
  ray: { name: "Ray", desc: "Line from a point, extended to the right" },
  hline: { name: "Horizontal line", desc: "Mark a price level across the chart" },
  vline: { name: "Vertical line", desc: "Mark a point in time" },
  rect: { name: "Rectangle", desc: "Shade a price / time zone" },
  fib: { name: "Fib retracement", desc: "Retracement levels between two points" },
  brush: { name: "Brush", desc: "Freehand drawing" },
  text: { name: "Text note", desc: "Place a label on the chart" },
  measure: { name: "Measure", desc: "Drag to measure price %, $ and bars" },
};

const ORDER: DrawTool[] = ["cursor", "trend", "ray", "hline", "vline", "rect", "fib", "brush", "text", "measure"];

const COLORS = ["#34e29b", "#ff6a57", "#e3b766", "#6fa8ff", "#c08bff", "#eef2ee"];

export function ToolIcon({ tool, size = 17 }: { tool: DrawTool; size?: number }) {
  const s = S(size);
  switch (tool) {
    case "cursor": return <svg {...s}><path d="M5 3l6 16 2-7 7-2L5 3z" /></svg>;
    case "trend": return <svg {...s}><path d="M4 18L20 6" /><circle cx="4" cy="18" r="1.6" fill="currentColor" /><circle cx="20" cy="6" r="1.6" fill="currentColor" /></svg>;
    case "ray": return <svg {...s}><path d="M4 18L21 7" /><circle cx="4" cy="18" r="1.8" fill="currentColor" /><path d="M21 7l-3 .4M21 7l-.4 3" /></svg>;
    case "hline": return <svg {...s}><path d="M3 12h18" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></svg>;
    case "vline": return <svg {...s}><path d="M12 3v18" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></svg>;
    case "rect": return <svg {...s}><rect x="4" y="6" width="16" height="12" rx="1" /></svg>;
    case "fib": return <svg {...s}><path d="M3 5h18M3 10h18M3 14h18M3 19h18" strokeOpacity="0.9" /></svg>;
    case "brush": return <svg {...s}><path d="M4 19c3 0 3-4 6-4s3 4 6 4M4 13c2-5 6-9 16-9" /></svg>;
    case "text": return <svg {...s}><path d="M5 5h14M12 5v14M9 19h6" /></svg>;
    case "measure": return <svg {...s}><path d="M3 8h18v8H3zM7 8v3M11 8v4M15 8v3M19 8v4" /></svg>;
  }
}

export function DrawingToolbar({
  tool,
  setTool,
  color,
  setColor,
  hasSelection,
  onDeleteSelected,
  onClear,
}: {
  tool: DrawTool;
  setTool: (t: DrawTool) => void;
  color: string;
  setColor: (c: string) => void;
  hasSelection: boolean;
  onDeleteSelected: () => void;
  onClear: () => void;
}) {
  return (
    <div className="draw-toolbar">
      {ORDER.map((t) => (
        <button key={t} className={`draw-btn ${tool === t ? "on" : ""}`} onClick={() => setTool(t)}>
          <ToolIcon tool={t} />
          <span className="draw-tip">
            <b>{TOOL_META[t].name}</b>
            <i>{TOOL_META[t].desc}</i>
          </span>
        </button>
      ))}
      <div className="draw-sep" />
      <div className="draw-colors">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`draw-swatch ${color === c ? "on" : ""}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <div className="draw-sep" />
      <button
        className="draw-btn"
        onClick={onDeleteSelected}
        disabled={!hasSelection}
        style={{ opacity: hasSelection ? 1 : 0.35 }}
      >
        <IconTrash size={16} />
        <span className="draw-tip">
          <b>Delete selected</b>
          <i>Remove the selected object (Del)</i>
        </span>
      </button>
      <button className="draw-btn" onClick={onClear}>
        <ClearIcon />
        <span className="draw-tip">
          <b>Clear all</b>
          <i>Remove every drawing on this symbol</i>
        </span>
      </button>
    </div>
  );
}

function ClearIcon() {
  return <svg {...S(17)}><path d="M4 7h16M9 11v6M15 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /><path d="M3 3l18 18" strokeWidth="1.4" /></svg>;
}
