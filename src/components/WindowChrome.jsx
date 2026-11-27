import { useEffect, useRef, useState } from "react";

// Esc closes only the topmost registered layer: higher `level` wins, ties go to
// the most recently opened. While typing, the first Esc just leaves the field so
// a stray key press can't discard unsaved input.
const escStack = [];
let escSeq = 0;
let escInstalled = false;

function onEscKey(e) {
  if (e.key !== "Escape" || e.defaultPrevented || !escStack.length) return;
  const el = e.target;
  const tag = String(el?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) {
    e.preventDefault();
    el.blur?.();
    return;
  }
  let top = escStack[0];
  for (const entry of escStack) {
    if (entry.level > top.level || (entry.level === top.level && entry.seq > top.seq)) top = entry;
  }
  e.preventDefault();
  top.ref.current?.();
}

export function useEscapeKey(handler, { enabled = true, level = 1 } = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    if (!escInstalled) { window.addEventListener("keydown", onEscKey); escInstalled = true; }
    const entry = { ref, level, seq: ++escSeq };
    escStack.push(entry);
    return () => {
      const i = escStack.indexOf(entry);
      if (i >= 0) escStack.splice(i, 1);
    };
  }, [enabled, level]);
}

export function useWindowState({ maximized = false } = {}) {
  const [min, setMin] = useState(false);
  const [max, setMax] = useState(maximized);
  return { min, max, minimize: () => setMin(true), restore: () => setMin(false), toggleMax: () => setMax((m) => !m) };
}

const ctlBtn = (light) => ({
  width: 30, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center",
  border: light ? "1px solid #6c87af" : "1px solid rgba(255,255,255,0.45)",
  borderRadius: 3,
  background: light ? "#fffdf6" : "rgba(255,255,255,0.12)",
  color: light ? "#07101c" : "#fff",
  fontSize: 13, fontWeight: 900, lineHeight: 1, cursor: "pointer", padding: 0,
  fontFamily: "Segoe UI, Tahoma, sans-serif",
});

export function WindowButtons({ win, onClose, lang, light = false }) {
  const bn = lang === "bn";
  return (
    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
      <button type="button" title={bn ? "ছোট করুন (Minimize)" : "Minimize"} onClick={win.minimize} style={ctlBtn(light)}>▁</button>
      <button type="button" title={win.max ? (bn ? "আগের মাপে" : "Restore") : (bn ? "বড় করুন (Maximize)" : "Maximize")} onClick={win.toggleMax} style={ctlBtn(light)}>{win.max ? "❐" : "▢"}</button>
      <button type="button" title={bn ? "বন্ধ করুন (Esc)" : "Close (Esc)"} onClick={onClose} style={{ ...ctlBtn(light), background: "#c42b1c", borderColor: "#e8806f", color: "#fff" }}>✕</button>
    </div>
  );
}

export function MinimizedChip({ title, onRestore, onClose, lang, slot = 0 }) {
  const bn = lang === "bn";
  return (
    <div style={{
      position: "fixed", left: 12 + slot * 250, bottom: 12, zIndex: 1700, width: 238,
      display: "flex", alignItems: "center", gap: 6, padding: "6px 6px 6px 10px",
      background: "linear-gradient(180deg, #dce9f8 0%, #91acd2 58%, #789bcf 100%)",
      color: "#064e22", border: "1px solid #6c87af", borderRadius: 6,
      boxShadow: "0 10px 26px rgba(2,6,23,0.35)", fontFamily: "Segoe UI, Tahoma, sans-serif",
    }}>
      <button type="button" onClick={onRestore} title={bn ? "আবার খুলুন" : "Restore"}
        style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", color: "#07101c", textAlign: "left", cursor: "pointer", fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: 0, fontFamily: "inherit" }}>
        {"\u25B2"} {title}
      </button>
      {onClose && (
        <button type="button" onClick={onClose} title={bn ? "বন্ধ করুন" : "Close"}
          style={{ ...ctlBtn(true), width: 24, height: 20, background: "#c42b1c", borderColor: "#e8806f", color: "#fff" }}>✕</button>
      )}
    </div>
  );
}
