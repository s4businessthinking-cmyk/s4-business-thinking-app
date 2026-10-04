import React, { useEffect, useMemo, useRef, useState } from "react";
import { nsq } from "../utils/productSearch";

const MAX_ROWS = 300;
const ROW_H = 18;
const VISIBLE_ROWS = 10;

const isActive = (p) => p && !p.isDeleted && !p.deleted && String(p.status || "active").toLowerCase() !== "inactive";
const normName = (v) => String(v || "").trim().toLowerCase();

function rank(text, q, key) {
  const t = String(text || "").toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 3;
  if (t.includes(q)) return 2;
  return key && nsq(t).includes(key) ? 1 : 0;
}

function useListKeys(items, open, setOpen) {
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  useEffect(() => { setActive(0); }, [items]);
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  const move = (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: VISIBLE_ROWS, PageUp: -VISIBLE_ROWS }[e.key];
    if (!step) return false;
    e.preventDefault();
    if (!open) { setOpen(true); return true; }
    if (!items.length) return true;
    setActive((i) => Math.min(Math.max(i + step, 0), items.length - 1));
    return true;
  };
  return { active, setActive, listRef, move };
}

function DropList({ children, footer, listRef, width }) {
  return (
    <div style={{ position: "absolute", top: "calc(100% + 1px)", left: 0, width: width || "100%", minWidth: 260, zIndex: 1300, background: "#fff", border: "1px solid #6b85b0", boxShadow: "0 8px 20px rgba(0,0,0,0.25)" }}>
      <div ref={listRef} style={{ maxHeight: ROW_H * VISIBLE_ROWS + 4, overflowY: "auto" }}>{children}</div>
      <div style={{ borderTop: "1px solid #c3d0e6", padding: "3px 6px", fontSize: 11.5, fontWeight: 700, textAlign: "center", color: "#1f3f73", background: "#eef3fb" }}>{footer}</div>
    </div>
  );
}

const rowStyle = (selected) => ({
  height: ROW_H, lineHeight: `${ROW_H}px`, padding: "0 6px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  cursor: "default", background: selected ? "#1f5fbf" : "#fff", color: selected ? "#fff" : "#111", textTransform: "uppercase",
});

// Product name box: lists distinct names; choosing a name with several products hands the choice over to the code box.
export function ProductNameLookup({ products, value, onChange, onPickName, inputRef, openSignal = 0, style, onEnterClosed }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const groups = useMemo(() => {
    const map = new Map();
    products.filter(isActive).forEach((p) => {
      const key = normName(p.name);
      if (!key) return;
      if (!map.has(key)) map.set(key, { name: String(p.name).trim(), items: [] });
      map.get(key).items.push(p);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const q = normName(value);
  const items = useMemo(() => {
    if (!open) return [];
    if (!q) return groups.slice(0, MAX_ROWS);
    const key = nsq(q);
    return groups
      .map((g) => ({ g, s: rank(g.name, q, key) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.g.name.localeCompare(b.g.name))
      .slice(0, MAX_ROWS)
      .map((r) => r.g);
  }, [groups, q, open]);

  const { active, setActive, listRef, move } = useListKeys(items, open, setOpen);

  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  useEffect(() => {
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (g) => { setOpen(false); onPickName(g.name, g.items); };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input ref={inputRef} style={style} value={value} autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (move(e)) return;
          if (e.key === "Enter") {
            e.preventDefault();
            if (open && items.length) pick(items[active] || items[0]);
            else onEnterClosed?.();
          } else if (e.key === "Escape") setOpen(false);
        }} />
      {open && (
        <DropList listRef={listRef} footer="Double click or Press Enter to select" width="calc(100% + 0px)">
          {items.length === 0
            ? <div style={{ ...rowStyle(false), color: "#64748b", textTransform: "none" }}>No matching product</div>
            : items.map((g, i) => (
              <div key={g.name} style={rowStyle(i === active)} title={g.items.length > 1 ? `${g.items.length} codes` : undefined}
                onMouseDown={(e) => { e.preventDefault(); setActive(i); }}
                onDoubleClick={() => pick(g)}>
                {g.name}{g.items.length > 1 ? <span style={{ opacity: 0.6, fontWeight: 400 }}> ({g.items.length})</span> : null}
              </div>
            ))}
        </DropList>
      )}
    </div>
  );
}

export const codeLine = (p) => [p.code || p.barcode || "—", p.brand || p.company, p.description].filter(Boolean).join(" ");

// Code/Barcode box: an exact scan wins; otherwise lists codes (or the codes of the chosen name) to pick from.
export function ProductCodeLookup({ products, value, onChange, choices, onPick, onExactLookup, onNotFound, onEnterEmpty, selectedProduct, inputRef, openSignal = 0, style, placeholder }) {
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef(null);

  const q = String(value || "").trim().toLowerCase();
  const items = useMemo(() => {
    if (!open) return [];
    const key = nsq(q);
    if (choices?.length) {
      return q ? choices.filter((p) => rank(codeLine(p), q, key) > 0) : choices;
    }
    if (!q) return [];
    return products.filter(isActive)
      .map((p) => {
        const codes = [p.code, p.barcode, p.ean, ...(Array.isArray(p.moreBarcodes) ? p.moreBarcodes : [])];
        return { p, s: Math.max(...codes.map((c) => rank(c, q, key))) };
      })
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || String(a.p.code || "").localeCompare(String(b.p.code || "")))
      .slice(0, MAX_ROWS)
      .map((r) => r.p);
  }, [products, choices, q, open]);

  const { active, setActive, listRef, move } = useListKeys(items, open, setOpen);

  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  useEffect(() => {
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (p) => { setOpen(false); setBrowsing(false); onPick(p); };
  const highlighted = items[active];
  const listShown = open && items.length > 0;
  // Like the old ERP: while arrowing through the list the box shows the full line; once picked it shows the product's full code line.
  const shown = listShown && browsing && highlighted
    ? codeLine(highlighted)
    : (!focused && selectedProduct && value === (selectedProduct.code || selectedProduct.barcode || "") ? codeLine(selectedProduct) : value);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input ref={inputRef} style={style} value={shown} placeholder={placeholder} autoComplete="off" title={shown}
        onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setBrowsing(false); }}
        onChange={(e) => { setBrowsing(false); onChange(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (move(e)) { setBrowsing(true); return; }
          if (e.key === "Enter") {
            e.preventDefault();
            if (listShown && browsing) { pick(highlighted || items[0]); return; }
            if (selectedProduct && value === (selectedProduct.code || selectedProduct.barcode || "")) { setOpen(false); onEnterEmpty?.(); return; }
            if (q && onExactLookup()) { setOpen(false); return; }
            if (listShown) pick(highlighted || items[0]);
            else if (q) onNotFound?.();
            else onEnterEmpty?.();
          } else if (e.key === "Escape") { setOpen(false); setBrowsing(false); }
        }} />
      {listShown && (
        <DropList listRef={listRef} width="max(100%, 470px)"
          footer={<span style={{ color: "#b91c1c", textTransform: "uppercase" }}>{highlighted?.name || ""}</span>}>
          {items.map((p, i) => (
            <div key={p.id} style={rowStyle(i === active)} title={codeLine(p)}
              onMouseDown={(e) => { e.preventDefault(); setActive(i); }}
              onDoubleClick={() => pick(p)}>
              {codeLine(p)}
            </div>
          ))}
        </DropList>
      )}
    </div>
  );
}
