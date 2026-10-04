import { useEffect, useMemo, useRef, useState } from "react";
import {
  DESIGN_DOCS, LAYOUT_FIELDS, TABLE_COLS, LAYOUT_PAPERS, INVOICE_KINDS, SAMPLE_DATA,
  defaultLayout, renderLayoutDocument, tableCapacity, colLabel, imageFileToDataUrl,
} from "./printDesign.js";
import { printHtmlDocument } from "./printSettings.js";
import { useEscapeKey } from "../components/WindowChrome.jsx";

const font = "Tahoma, 'Segoe UI', Arial, sans-serif";
const C = { bg: "#c9d9ef", panel: "#dbe6f5", border: "#7d94b7", bar: "#2854ad", text: "#07101c", sel: "#0a64d8" };
const snap = (v) => Math.round(v * 2) / 2;
const num = (v, d = 0) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
let seq = 0;
const newId = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

const input = (extra = {}) => ({ height: 24, border: "1px solid #8797a9", fontFamily: font, fontSize: 12, padding: "0 5px", background: "#fff", boxSizing: "border-box", ...extra });
const btn = (primary) => ({
  padding: "5px 10px", fontSize: 12, fontFamily: font, cursor: "pointer", borderRadius: 3, border: "1px solid #41658e", color: C.text,
  fontWeight: primary ? 700 : 400, background: "linear-gradient(180deg,#f8fbff 0%,#d4e3f4 49%,#a8c5e6 51%,#e4effa 100%)", whiteSpace: "nowrap",
});

function NumIn({ label, value, onChange, step = 0.5, width = 58 }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
      <span style={{ minWidth: 14 }}>{label}</span>
      <input type="number" step={step} value={value} onChange={(e) => onChange(num(e.target.value))} style={input({ width })} />
    </label>
  );
}

export default function PrintDesigner({ kind, layout: initial, lang, logo = "", onSave, onClose }) {
  const bn = lang === "bn";
  const [layout, setLayout] = useState(() => JSON.parse(JSON.stringify(initial)));
  const [selId, setSelId] = useState(null);
  const [zoom, setZoom] = useState(3);
  const [dirty, setDirty] = useState(false);
  const drag = useRef(null);
  const sample = SAMPLE_DATA[kind];
  const fields = LAYOUT_FIELDS[kind];
  const docName = DESIGN_DOCS.find((d) => d.key === kind)?.[bn ? "bn" : "en"] || kind;
  const W = num(layout.width, 210);
  const H = num(layout.height, 297);
  const sel = layout.elements.find((e) => e.id === selId) || null;
  const table = layout.elements.find((e) => e.type === "table");

  const update = (patch) => { setLayout((l) => ({ ...l, ...patch })); setDirty(true); };
  const updateEl = (id, patch) => { setLayout((l) => ({ ...l, elements: l.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) })); setDirty(true); };
  const removeEl = (id) => { setLayout((l) => ({ ...l, elements: l.elements.filter((e) => e.id !== id) })); setSelId(null); setDirty(true); };
  const addEl = (el) => {
    const e = { id: newId(), x: 20, y: 20, w: 60, h: 6, size: 10, bold: false, align: "left", ...el };
    setLayout((l) => ({ ...l, elements: [...l.elements, e] }));
    setSelId(e.id);
    setDirty(true);
  };

  const close = () => {
    if (dirty && !window.confirm(bn ? "পরিবর্তন সেভ করা হয়নি। বন্ধ করবেন?" : "Changes are not saved. Close anyway?")) return;
    onClose();
  };
  useEscapeKey(close, { level: 4 });

  useEffect(() => {
    const onKey = (e) => {
      if (!selId) return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      const step = e.shiftKey ? 5 : 0.5;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) {
        e.preventDefault();
        const [dx, dy] = moves[e.key];
        setLayout((l) => ({ ...l, elements: l.elements.map((el) => (el.id === selId ? { ...el, x: snap(el.x + dx), y: snap(el.y + dy) } : el)) }));
        setDirty(true);
      } else if (e.key === "Delete") {
        e.preventDefault();
        removeEl(selId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  const startDrag = (e, el, mode) => {
    e.stopPropagation();
    e.preventDefault();
    setSelId(el.id);
    drag.current = { id: el.id, mode, mx: e.clientX, my: e.clientY, x: el.x, y: el.y, w: el.w, h: el.h };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.mx) / zoom;
    const dy = (e.clientY - d.my) / zoom;
    if (d.mode === "move") updateEl(d.id, { x: snap(Math.max(-5, d.x + dx)), y: snap(Math.max(-5, d.y + dy)) });
    else updateEl(d.id, { w: snap(Math.max(2, d.w + dx)), h: snap(Math.max(1, d.h + dy)) });
  };
  const endDrag = () => { drag.current = null; };

  const setPaper = (key) => {
    const p = LAYOUT_PAPERS.find((x) => x.key === key);
    if (!p) return;
    update(key === "custom" ? { paper: key } : { paper: key, width: p.w, height: p.h });
  };

  const uploadBg = async (file) => {
    if (!file) return;
    try { update({ bg: await imageFileToDataUrl(file, { maxW: 1400, type: "image/jpeg", quality: 0.6 }) }); }
    catch { alert(bn ? "ছবিটা পড়া যায়নি" : "Could not read the image"); }
  };

  const testPrint = () => {
    const html = renderLayoutDocument(layout, kind, { ...sample, logo }, { title: docName, bn });
    printHtmlDocument(html, { preview: true, lang });
  };

  const fieldLabel = (key) => {
    const f = fields.find((x) => x[0] === key);
    return f ? (bn ? f[2] : f[1]) : key;
  };

  const capacity = table ? tableCapacity(table, layout.preprinted) : 0;
  const usedFields = useMemo(() => new Set(layout.elements.filter((e) => e.type === "field").map((e) => e.field)), [layout.elements]);

  const renderEl = (el) => {
    const isSel = el.id === selId;
    const base = {
      position: "absolute", left: el.x * zoom, top: el.y * zoom, width: el.w * zoom,
      height: el.type === "line" ? Math.max(6, 0.3 * zoom) : el.h * zoom,
      outline: isSel ? `2px solid ${C.sel}` : "1px dashed rgba(10,100,216,0.35)", cursor: "move", boxSizing: "border-box",
      fontSize: (el.size || 10) * zoom * 0.3528, fontWeight: el.bold ? 700 : 400, textAlign: el.align || "left",
      lineHeight: 1.2, overflow: "hidden", whiteSpace: "pre-wrap", color: "#000", background: isSel ? "rgba(10,100,216,0.06)" : "transparent",
      touchAction: "none", userSelect: "none",
    };
    const ghost = layout.preprinted && (el.type === "text" || el.type === "line" || el.type === "box" || el.type === "logo");
    let content = null;
    if (el.type === "field") {
      content = <>{el.label && <span style={{ fontWeight: 400, color: layout.preprinted ? "#9ca3af" : "#374151" }}>{el.label} </span>}{sample.fields[el.field] || `[${fieldLabel(el.field)}]`}</>;
    } else if (el.type === "text") content = el.text;
    else if (el.type === "line") content = <div style={{ borderTop: "1px solid #000", marginTop: Math.max(2, 0.15 * zoom) }} />;
    else if (el.type === "box") content = <div style={{ position: "absolute", inset: 0, border: "1px solid #000" }} />;
    else if (el.type === "logo") content = logo ? <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", border: "1px dashed #999", color: "#999" }}>LOGO</div>;
    else if (el.type === "table") {
      const rowH = num(el.rowH, 7) * zoom;
      const showHead = !layout.preprinted && el.header !== false;
      const rows = sample.items;
      content = (
        <div style={{ position: "absolute", inset: 0 }}>
          {showHead && (
            <div style={{ display: "flex", height: rowH, fontWeight: 700, borderBottom: "1px solid #000" }}>
              {(el.cols || []).map((c, i) => <div key={i} style={{ width: c.w * zoom, padding: "0 2px", overflow: "hidden", whiteSpace: "nowrap", borderRight: el.grid ? "1px solid #000" : "1px dotted #9ca3af" }}>{c.label || colLabel(kind, c.key, bn)}</div>)}
            </div>
          )}
          {rows.map((r, ri) => (
            <div key={ri} style={{ display: "flex", height: rowH, borderBottom: el.grid && !layout.preprinted ? "1px solid #000" : "1px dotted #d1d5db" }}>
              {(el.cols || []).map((c, i) => <div key={i} style={{ width: c.w * zoom, padding: "0 2px", overflow: "hidden", whiteSpace: "nowrap", borderRight: el.grid && !layout.preprinted ? "1px solid #000" : "1px dotted #d1d5db" }}>{r[c.key]}</div>)}
            </div>
          ))}
          <div style={{ position: "absolute", left: 4, bottom: 2, fontSize: 10, color: C.sel, fontWeight: 700 }}>
            {bn ? `এক পাতায় ${capacity}টা লাইন` : `${capacity} rows per page`}
          </div>
        </div>
      );
      base.border = el.grid && !layout.preprinted ? "1px solid #000" : undefined;
    }
    return (
      <div key={el.id} style={{ ...base, opacity: ghost ? 0.35 : 1 }} onPointerDown={(e) => startDrag(e, el, "move")} onPointerMove={onMove} onPointerUp={endDrag}>
        {content}
        {isSel && (
          <div onPointerDown={(e) => startDrag(e, el, "resize")} onPointerMove={onMove} onPointerUp={endDrag}
            style={{ position: "absolute", right: -5, bottom: -5, width: 10, height: 10, background: C.sel, border: "1px solid #fff", cursor: "nwse-resize" }} />
        )}
      </div>
    );
  };

  const props = () => {
    if (!sel) {
      return (
        <div style={{ fontSize: 12, lineHeight: 1.6, color: "#1f2937" }}>
          {bn
            ? "👉 বাম দিক থেকে যে তথ্য লাগবে সেটায় ক্লিক করে কাগজে যোগ করুন। তারপর মাউস দিয়ে টেনে জায়গামতো বসান, নিচের কোণা টেনে বড়-ছোট করুন। কীবোর্ডের তীর দিয়ে ০.৫ মিমি (Shift দিয়ে ৫ মিমি) সরানো যায়, Delete দিয়ে মুছে ফেলা যায়।"
            : "👉 Click a field on the left to add it, drag it into place, and drag the corner to resize. Arrow keys move 0.5 mm (Shift = 5 mm); Delete removes."}
        </div>
      );
    }
    const set = (k, v) => updateEl(sel.id, { [k]: v });
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>
          {sel.type === "field" ? fieldLabel(sel.field) : sel.type === "table" ? (bn ? "আইটেম টেবিল" : "Items table") : sel.type === "text" ? (bn ? "লেখা" : "Text") : sel.type === "line" ? (bn ? "লাইন" : "Line") : sel.type === "box" ? (bn ? "বক্স" : "Box") : "Logo"}
        </div>
        {sel.type === "field" && (
          <>
            <select value={sel.field} onChange={(e) => set("field", e.target.value)} style={input({ width: "100%" })}>
              {fields.map(([k, en, b]) => <option key={k} value={k}>{bn ? b : en}</option>)}
            </select>
            <label style={{ fontSize: 11 }}>{bn ? "আগে লেবেল (pre-printed এ প্রিন্ট হবে না)" : "Label before value (not printed on pre-printed)"}
              <input value={sel.label || ""} onChange={(e) => set("label", e.target.value)} style={input({ width: "100%" })} />
            </label>
          </>
        )}
        {sel.type === "text" && (
          <textarea value={sel.text || ""} onChange={(e) => set("text", e.target.value)} rows={3} style={{ ...input({ width: "100%", height: "auto" }), padding: 4 }} />
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <NumIn label="X" value={sel.x} onChange={(v) => set("x", v)} />
          <NumIn label="Y" value={sel.y} onChange={(v) => set("y", v)} />
          <NumIn label={bn ? "চও" : "W"} value={sel.w} onChange={(v) => set("w", Math.max(2, v))} />
          {sel.type !== "line" && <NumIn label={bn ? "উঁ" : "H"} value={sel.h} onChange={(v) => set("h", Math.max(1, v))} />}
        </div>
        <div style={{ fontSize: 10, color: "#4b5563" }}>{bn ? "সব মাপ মিলিমিটারে (mm)" : "All sizes in millimetres"}</div>
        {sel.type !== "line" && sel.type !== "box" && sel.type !== "logo" && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <NumIn label={bn ? "ফন্ট" : "Font"} value={sel.size || 10} step={1} width={50} onChange={(v) => set("size", Math.max(5, Math.min(48, v)))} />
            {sel.type !== "table" && (
              <>
                <button type="button" style={{ ...btn(sel.bold), fontWeight: 900, background: sel.bold ? "#bfdbfe" : undefined }} onClick={() => set("bold", !sel.bold)}>B</button>
                {["left", "center", "right"].map((a) => (
                  <button key={a} type="button" style={{ ...btn(false), background: sel.align === a ? "#bfdbfe" : undefined }} onClick={() => set("align", a)}>
                    {a === "left" ? "⬅" : a === "center" ? "↔" : "➡"}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        {sel.type === "table" && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <NumIn label={bn ? "লাইনের উচ্চতা" : "Row H"} value={sel.rowH || 7} width={50} onChange={(v) => set("rowH", Math.max(3, v))} />
            </div>
            <label style={{ fontSize: 12, display: "flex", gap: 5 }}><input type="checkbox" checked={sel.header !== false} onChange={(e) => set("header", e.target.checked)} />{bn ? "কলামের নাম প্রিন্ট করো" : "Print column headings"}</label>
            <label style={{ fontSize: 12, display: "flex", gap: 5 }}><input type="checkbox" checked={!!sel.grid} onChange={(e) => set("grid", e.target.checked)} />{bn ? "ঘরের দাগ (grid) প্রিন্ট করো" : "Print grid lines"}</label>
            <div style={{ fontSize: 11, fontWeight: 700 }}>{bn ? "কলাম (বাম থেকে ডানে)" : "Columns (left to right)"} — {bn ? "মোট" : "total"} {(sel.cols || []).reduce((s, c) => s + num(c.w), 0)} / {sel.w} mm</div>
            {(sel.cols || []).map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 3, alignItems: "center" }}>
                <select value={c.key} onChange={(e) => set("cols", sel.cols.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} style={input({ flex: 1, minWidth: 0 })}>
                  {TABLE_COLS[kind].map(([k, en, b]) => <option key={k} value={k}>{bn ? b : en}</option>)}
                </select>
                <input type="number" step={0.5} value={c.w} onChange={(e) => set("cols", sel.cols.map((x, j) => (j === i ? { ...x, w: num(e.target.value) } : x)))} style={input({ width: 46 })} />
                <button type="button" style={btn(false)} disabled={!i} onClick={() => { const a = [...sel.cols]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set("cols", a); }}>↑</button>
                <button type="button" style={btn(false)} onClick={() => set("cols", sel.cols.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button type="button" style={btn(false)} onClick={() => set("cols", [...(sel.cols || []), { key: TABLE_COLS[kind][0][0], w: 20 }])}>+ {bn ? "কলাম" : "Column"}</button>
          </>
        )}
        <button type="button" style={{ ...btn(false), color: "#b91c1c" }} onClick={() => removeEl(sel.id)}>🗑 {bn ? "মুছে ফেলুন" : "Remove"}</button>
      </div>
    );
  };

  const paperOpt = LAYOUT_PAPERS.find((p) => p.key === layout.paper) || LAYOUT_PAPERS[0];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 5200, background: C.bg, display: "flex", flexDirection: "column", fontFamily: font, color: C.text }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 6px 5px 10px", background: "linear-gradient(180deg,#3f69bd,#2854ad)", color: "#fff", fontWeight: 700, fontSize: 13 }}>
        <span>🧩 {bn ? "প্রিন্ট ডিজাইনার" : "Print Designer"} — {docName}</span>
        <button type="button" onClick={close} title={bn ? "বন্ধ করুন (Esc)" : "Close (Esc)"}
          style={{ width: 30, height: 22, border: "1px solid #e8806f", borderRadius: 3, background: "#c42b1c", color: "#fff", fontWeight: 900, cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "6px 10px", borderBottom: `1px solid ${C.border}`, background: C.panel, fontSize: 12 }}>
        <label style={{ display: "flex", gap: 5, alignItems: "center", fontWeight: 700, color: layout.enabled ? "#15803d" : "#b91c1c" }}>
          <input type="checkbox" checked={!!layout.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
          {bn ? "এই ডিজাইনে প্রিন্ট করো" : "Print with this layout"}
        </label>
        <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <input type="checkbox" checked={!!layout.preprinted} onChange={(e) => update({ preprinted: e.target.checked })} />
          {bn ? "Pre-printed কাগজ — শুধু তথ্য প্রিন্ট হবে" : "Pre-printed paper — print data only"}
        </label>
        <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {bn ? "কাগজ:" : "Paper:"}
          <select value={layout.paper} onChange={(e) => setPaper(e.target.value)} style={input()}>
            {LAYOUT_PAPERS.map((p) => <option key={p.key} value={p.key}>{p.label || p.key}{p.w ? ` (${p.w}×${p.h})` : ""}</option>)}
          </select>
          {paperOpt.key === "custom" && (
            <>
              <NumIn label={bn ? "চও" : "W"} value={W} step={1} width={52} onChange={(v) => update({ width: Math.max(30, v) })} />
              <NumIn label={bn ? "উঁ" : "H"} value={H} step={1} width={52} onChange={(v) => update({ height: Math.max(30, v) })} />
            </>
          )}
        </span>
        <span style={{ display: "flex", gap: 4, alignItems: "center" }} title={bn ? "প্রিন্টারে লেখা একটু সরে গেলে এখানে ঠিক করুন" : "Shift everything if the printer prints slightly off"}>
          {bn ? "সরাও (mm):" : "Offset (mm):"}
          <NumIn label="X" value={layout.offsetX || 0} width={48} onChange={(v) => update({ offsetX: v })} />
          <NumIn label="Y" value={layout.offsetY || 0} width={48} onChange={(v) => update({ offsetY: v })} />
        </span>
        <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <label style={{ ...btn(false), display: "inline-block" }} title={bn ? "খালি ছাপানো প্যাডের ছবি/স্ক্যান দিন — শুধু মেলানোর জন্য, প্রিন্ট হবে না" : "Scan of the blank pre-printed form — only a guide, never printed"}>
            🖼 {bn ? "প্যাডের ছবি" : "Form image"}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { uploadBg(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {layout.bg && <button type="button" style={btn(false)} onClick={() => update({ bg: "" })}>✕</button>}
        </span>
        {kind === "invoice" && (
          <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {bn ? "যেখানে ব্যবহার হবে:" : "Use for:"}
            {INVOICE_KINDS.map((k) => (
              <label key={k.key} style={{ display: "flex", gap: 3, alignItems: "center" }}>
                <input type="checkbox" checked={layout.appliesTo?.[k.key] !== false} onChange={(e) => update({ appliesTo: { ...layout.appliesTo, [k.key]: e.target.checked } })} />
                {bn ? k.bn : k.en}
              </label>
            ))}
          </span>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ width: 200, flexShrink: 0, overflowY: "auto", borderRight: `1px solid ${C.border}`, background: C.panel, padding: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: "#1e3a8a" }}>{bn ? "তথ্য যোগ করুন" : "Add field"}</div>
          {fields.map(([k, en, b]) => (
            <button key={k} type="button" onClick={() => addEl({ type: "field", field: k, w: 60, h: 6, label: "" })}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "4px 6px", marginBottom: 2, fontFamily: font, fontSize: 12, cursor: "pointer", border: "1px solid #b6c6dc", background: usedFields.has(k) ? "#e0ecfb" : "#fff", color: C.text }}>
              {usedFields.has(k) ? "✓ " : "+ "}{bn ? b : en}
            </button>
          ))}
          <div style={{ fontSize: 11, fontWeight: 700, margin: "10px 0 4px", color: "#1e3a8a" }}>{bn ? "অন্যান্য" : "Other"}</div>
          {!table && <button type="button" style={{ ...btn(false), width: "100%", marginBottom: 3 }} onClick={() => addEl({ type: "table", x: 15, y: 70, w: 180, h: 120, rowH: 7, header: true, grid: true, cols: TABLE_COLS[kind].slice(0, 4).map(([key]) => ({ key, w: 45 })) })}>▦ {bn ? "আইটেম টেবিল" : "Items table"}</button>}
          <button type="button" style={{ ...btn(false), width: "100%", marginBottom: 3 }} onClick={() => addEl({ type: "text", text: bn ? "লেখা" : "Text" })}>T {bn ? "লেখা" : "Text"}</button>
          <button type="button" style={{ ...btn(false), width: "100%", marginBottom: 3 }} onClick={() => addEl({ type: "line", w: 80, h: 1 })}>― {bn ? "লাইন" : "Line"}</button>
          <button type="button" style={{ ...btn(false), width: "100%", marginBottom: 3 }} onClick={() => addEl({ type: "box", w: 60, h: 20 })}>▭ {bn ? "বক্স" : "Box"}</button>
          <button type="button" style={{ ...btn(false), width: "100%", marginBottom: 3 }} onClick={() => addEl({ type: "logo", w: 30, h: 15 })}>🖼 {bn ? "লোগো" : "Logo"}</button>
          <div style={{ fontSize: 10, color: "#4b5563", marginTop: 6, lineHeight: 1.4 }}>
            {bn ? "Pre-printed চালু থাকলে লেখা, লাইন, বক্স, লোগো আর লেবেল ঝাপসা দেখাবে — এগুলো প্রিন্ট হবে না।" : "With pre-printed on, text, lines, boxes, logo and labels are faded — they are not printed."}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 20, background: "#8a99ad" }} onPointerDown={() => setSelId(null)}>
          <div style={{ position: "relative", width: W * zoom, height: H * zoom, background: "#fff", margin: "0 auto", boxShadow: "0 6px 24px rgba(0,0,0,0.35)" }}>
            {layout.bg && <img src={layout.bg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", opacity: 0.45, pointerEvents: "none" }} />}
            {layout.elements.map(renderEl)}
          </div>
        </div>

        <div style={{ width: 250, flexShrink: 0, overflowY: "auto", borderLeft: `1px solid ${C.border}`, background: C.panel, padding: 10 }}>
          {props()}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 8, borderTop: `1px solid ${C.border}`, background: C.panel, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12 }}>{bn ? "জুম:" : "Zoom:"}</span>
        {[2, 3, 4].map((z) => <button key={z} type="button" style={{ ...btn(false), background: zoom === z ? "#bfdbfe" : undefined }} onClick={() => setZoom(z)}>{z === 2 ? "S" : z === 3 ? "M" : "L"}</button>)}
        <button type="button" style={btn(false)} onClick={() => { if (window.confirm(bn ? "আগের ডিফল্ট ডিজাইনে ফিরে যাবেন?" : "Reset to the default layout?")) { setLayout({ ...defaultLayout(kind), enabled: layout.enabled }); setSelId(null); setDirty(true); } }}>↺ {bn ? "ডিফল্ট" : "Default"}</button>
        <span style={{ flex: 1 }} />
        <button type="button" style={btn(false)} onClick={testPrint}>👁 {bn ? "নমুনা দেখুন / টেস্ট প্রিন্ট" : "Preview / Test print"}</button>
        <button type="button" style={btn(true)} onClick={() => { if (onSave(layout) !== false) setDirty(false); }}>💾 {bn ? "সেভ" : "Save"}</button>
        <button type="button" style={btn(false)} onClick={close}>{bn ? "বন্ধ" : "Close"}</button>
      </div>
    </div>
  );
}
