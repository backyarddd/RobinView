import type { DrawTool } from "./DrawingLayer";
import { IconTrash } from "../common/icons";

const TOOLS: { key: DrawTool; label: string; icon: JSX.Element }[] = [
  { key: "cursor", label: "Cursor (interact)", icon: <Cursor /> },
  { key: "trend", label: "Trend line", icon: <Trend /> },
  { key: "ray", label: "Ray", icon: <Ray /> },
  { key: "hline", label: "Horizontal line", icon: <HLine /> },
  { key: "vline", label: "Vertical line", icon: <VLine /> },
  { key: "rect", label: "Rectangle", icon: <Rect /> },
  { key: "fib", label: "Fib retracement", icon: <Fib /> },
  { key: "brush", label: "Brush (freehand)", icon: <Brush /> },
  { key: "text", label: "Text note", icon: <TextI /> },
];

const COLORS = ["#34e29b", "#ff6a57", "#e3b766", "#6fa8ff", "#c08bff", "#eef2ee"];

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
      {TOOLS.map((t) => (
        <button
          key={t.key}
          className={`draw-btn ${tool === t.key ? "on" : ""}`}
          onClick={() => setTool(t.key)}
          title={t.label}
        >
          {t.icon}
        </button>
      ))}
      <div className="draw-sep" />
      <div className="draw-colors" title="Color">
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
        title="Delete selected (or press Delete)"
        style={{ opacity: hasSelection ? 1 : 0.35 }}
      >
        <IconTrash size={16} />
      </button>
      <button className="draw-btn" onClick={onClear} title="Clear all drawings">
        <Clear />
      </button>
    </div>
  );
}

const s = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function Cursor() { return <svg {...s}><path d="M5 3l6 16 2-7 7-2L5 3z" /></svg>; }
function Trend() { return <svg {...s}><path d="M4 18L20 6" /><circle cx="4" cy="18" r="1.6" fill="currentColor" /><circle cx="20" cy="6" r="1.6" fill="currentColor" /></svg>; }
function Ray() { return <svg {...s}><path d="M4 18L21 7" /><circle cx="4" cy="18" r="1.8" fill="currentColor" /><path d="M21 7l-3 .4M21 7l-.4 3" /></svg>; }
function HLine() { return <svg {...s}><path d="M3 12h18" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></svg>; }
function VLine() { return <svg {...s}><path d="M12 3v18" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></svg>; }
function Rect() { return <svg {...s}><rect x="4" y="6" width="16" height="12" rx="1" /></svg>; }
function Fib() { return <svg {...s}><path d="M3 5h18M3 10h18M3 14h18M3 19h18" strokeOpacity="0.9" /></svg>; }
function Brush() { return <svg {...s}><path d="M4 19c3 0 3-4 6-4s3 4 6 4M4 13c2-5 6-9 16-9" /></svg>; }
function TextI() { return <svg {...s}><path d="M5 5h14M12 5v14M9 19h6" /></svg>; }
function Clear() { return <svg {...s}><path d="M4 7h16M9 11v6M15 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /><path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.4" /></svg>; }
