import { useState } from "react";
import type { Drawing } from "./DrawingLayer";
import { TOOL_META, ToolIcon } from "./DrawingToolbar";
import { IconTrash, IconX } from "../common/icons";

// Photoshop-style list of every object drawn on the chart, newest on top.
export function ObjectsPanel({
  drawings,
  selectedId,
  setSelectedId,
  onChange,
  onClose,
}: {
  drawings: Drawing[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onChange: (d: Drawing[]) => void;
  onClose: () => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);

  // newest first (top of the stack, like layers)
  const ordered = [...drawings].reverse();

  const patch = (id: string, fields: Partial<Drawing>) =>
    onChange(drawings.map((d) => (d.id === id ? { ...d, ...fields } : d)));
  const remove = (id: string) => {
    onChange(drawings.filter((d) => d.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const detail = (d: Drawing): string => {
    const a = d.pts[0];
    if (!a) return "";
    if (d.tool === "hline") return `$${a.p.toFixed(2)}`;
    if (d.tool === "text") return d.text ?? "";
    if ((d.tool === "rect" || d.tool === "trend" || d.tool === "ray" || d.tool === "fib") && d.pts[1]) {
      return `$${Math.min(a.p, d.pts[1].p).toFixed(2)}–$${Math.max(a.p, d.pts[1].p).toFixed(2)}`;
    }
    return "";
  };

  return (
    <div className="objects-panel">
      <div className="objects-head">
        <span className="panel-title">Objects</span>
        <span className="mono dim" style={{ fontSize: 11 }}>{drawings.length}</span>
        <div style={{ flex: 1 }} />
        {drawings.length > 0 && (
          <button className="iconbtn" title="Clear all" onClick={() => onChange([])}>
            <IconTrash size={15} />
          </button>
        )}
        <button className="iconbtn" title="Close" onClick={onClose}>
          <IconX size={15} />
        </button>
      </div>
      <div className="objects-body">
        {drawings.length === 0 && (
          <div className="empty" style={{ height: 120, fontSize: 12 }}>
            Nothing drawn yet. Pick a tool on the left and draw on the chart.
          </div>
        )}
        {ordered.map((d) => {
          const name = d.name || TOOL_META[d.tool].name;
          return (
            <div
              key={d.id}
              className={`object-row ${selectedId === d.id ? "sel" : ""}`}
              onClick={() => setSelectedId(d.id)}
            >
              <button
                className="obj-eye"
                title={d.hidden ? "Show" : "Hide"}
                onClick={(e) => {
                  e.stopPropagation();
                  patch(d.id, { hidden: !d.hidden });
                }}
              >
                {d.hidden ? <EyeOff /> : <Eye />}
              </button>
              <span className="obj-swatch" style={{ background: d.color }} />
              <span className="obj-icon" style={{ color: d.color }}>
                <ToolIcon tool={d.tool} size={14} />
              </span>
              {renaming === d.id ? (
                <input
                  autoFocus
                  className="obj-rename"
                  defaultValue={name}
                  onBlur={(e) => {
                    patch(d.id, { name: e.target.value.trim() || undefined });
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  className="obj-name"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenaming(d.id);
                  }}
                  title="Double-click to rename"
                >
                  <span className="nm" style={{ opacity: d.hidden ? 0.5 : 1 }}>{name}</span>
                  {detail(d) && <span className="dt">{detail(d)}</span>}
                </div>
              )}
              <button
                className="obj-del"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(d.id);
                }}
              >
                <IconTrash size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Eye() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}
function EyeOff() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18M10.6 10.7a2.6 2.6 0 0 0 3.7 3.6M9.9 5.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.3 4M6.3 6.4A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 3-.5" />
    </svg>
  );
}
