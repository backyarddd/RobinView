import { useEffect } from "react";
import { IconX } from "./common/icons";

interface ShortcutRow {
  keys: string[];
  label: string;
}
interface ShortcutGroup {
  title: string;
  rows: ShortcutRow[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: "General",
    rows: [
      { keys: ["⌘", "K"], label: "Command palette" },
      { keys: ["Ctrl", "K"], label: "Command palette" },
      { keys: ["/"], label: "Search" },
      { keys: ["?"], label: "Keyboard shortcuts" },
      { keys: ["Esc"], label: "Close / cursor tool" },
    ],
  },
  {
    title: "Drawing tools",
    rows: [
      { keys: ["T"], label: "Trend line" },
      { keys: ["R"], label: "Ray" },
      { keys: ["H"], label: "Horizontal line" },
      { keys: ["V"], label: "Vertical line" },
      { keys: ["B"], label: "Rectangle" },
      { keys: ["F"], label: "Fib retracement" },
      { keys: ["D"], label: "Brush" },
      { keys: ["X"], label: "Text" },
      { keys: ["M"], label: "Measure" },
      { keys: ["Esc"], label: "Cursor" },
      { keys: ["Del", "⌫"], label: "Delete selected" },
    ],
  },
];

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="kbd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kbd-head">
          <span className="kbd-title">Keyboard Shortcuts</span>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </button>
        </div>
        <div className="kbd-body">
          {GROUPS.map((g) => (
            <div className="kbd-group" key={g.title}>
              <div className="kbd-group-title eyebrow">{g.title}</div>
              <div className="kbd-rows">
                {g.rows.map((r, i) => (
                  <div className="kbd-row" key={`${r.label}-${i}`}>
                    <span className="kbd-label">{r.label}</span>
                    <span className="kbd-combo">
                      {r.keys.map((k, j) => (
                        <kbd className="kbd" key={j}>
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="kbd-foot">
          <span>
            Press <kbd className="kbd">?</kbd> to toggle this panel
          </span>
        </div>
      </div>
    </div>
  );
}
