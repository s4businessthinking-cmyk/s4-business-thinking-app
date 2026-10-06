import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEscapeKey } from "./WindowChrome.jsx";

const PICKER_LIMIT = 300;
const joinAddress = (p) => [p.address, p.area, p.city, p.emirate, p.country].filter(Boolean).join(" ");

export const VENDOR_PICKER_COLS = [
  { key: "name", label: "Vendor Name", width: "30%", get: (v) => v.vendorName },
  { key: "address", label: "Address", width: "28%", get: joinAddress },
  { key: "phone", label: "Phone Number", width: "15%", get: (v) => v.phoneNumber },
  { key: "mobile", label: "Mobile Number", width: "15%", get: (v) => v.mobileNumber || v.whatsappNumber },
  { key: "fax", label: "Fax", width: "12%", get: (v) => v.fax },
];

export const CUSTOMER_PICKER_COLS = [
  { key: "name", label: "Customer Name", width: "30%", get: (c) => c.customerName },
  { key: "address", label: "Address", width: "28%", get: joinAddress },
  { key: "phone", label: "Phone Number", width: "15%", get: (c) => c.phoneNumber },
  { key: "mobile", label: "Mobile Number", width: "15%", get: (c) => c.mobileNumber || c.whatsappNumber },
  { key: "fax", label: "Fax", width: "12%", get: (c) => c.fax },
];

// Desktop "Select Vendor / Select Customer" window: one filter box per column, starts-with matching
// (Extended Search = contains), ↑↓ + Enter or double-click to pick.
export default function PartyPickerWindow({ title, columns, items, onPick, onClose, lang, partyWord = "party", modalId = "party-picker", onQuickAdd = null }) {
  const bn = lang === "bn";
  const [filters, setFilters] = useState({});
  const [extended, setExtended] = useState(false);
  const [active, setActive] = useState(0);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const firstRef = useRef(null);
  const listRef = useRef(null);
  useEscapeKey(onClose, { level: 3 });
  useEffect(() => { setTimeout(() => firstRef.current?.focus(), 30); }, []);

  const nameCol = columns[0];
  const all = useMemo(() => (items || [])
    .filter((p) => p && !p.isDeleted && !p.deleted)
    .sort((a, b) => String(nameCol.get(a) || "").localeCompare(String(nameCol.get(b) || ""))), [items, nameCol]);
  const rows = useMemo(() => {
    const used = columns.map((c) => [c, String(filters[c.key] || "").trim().toLowerCase()]).filter(([, q]) => q);
    if (!used.length) return all;
    return all.filter((p) => used.every(([c, q]) => {
      const val = String(c.get(p) || "").toLowerCase();
      return extended ? val.includes(q) : val.startsWith(q);
    }));
  }, [all, columns, filters, extended]);
  const shown = rows.slice(0, PICKER_LIMIT);

  useEffect(() => { setActive(0); }, [filters, extended]);
  useEffect(() => { listRef.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[active]) onPick(shown[active]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
  };
  const quickAdd = async () => {
    const name = newName.trim();
    if (!name || !onQuickAdd || adding) return;
    setAdding(true);
    try { await onQuickAdd(name); setNewName(""); } finally { setAdding(false); }
  };
  const cellStyle = { padding: "3px 6px", fontSize: 12, borderRight: "1px solid #d7deea", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  const footBtn = { padding: "5px 14px", border: "1px solid #64748b", background: "#f1f5f9", fontWeight: 800, fontSize: 12, cursor: "pointer" };

  return (
    <div data-si-modal-open={modalId} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Segoe UI, Tahoma, sans-serif" }}>
      <div style={{ width: "min(900px, 96vw)", height: "min(560px, 90vh)", background: "#e9eef7", border: "1px solid #2854ad", boxShadow: "0 18px 50px rgba(2,6,23,0.45)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px", background: "linear-gradient(180deg,#3f69bd,#2854ad)", color: "#fff", fontSize: 13, fontWeight: 800 }}>
          <span>{title}</span>
          <button type="button" onClick={onClose} style={{ width: 24, height: 20, border: "1px solid rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", fontWeight: 900, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: "flex", padding: "6px 8px 0" }}>
          {columns.map((c, i) => (
            <input key={c.key} ref={i === 0 ? firstRef : undefined} value={filters[c.key] || ""} onKeyDown={onKeyDown} autoComplete="off"
              onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
              style={{ width: c.width, boxSizing: "border-box", height: 24, border: "1px solid #9fb2d1", padding: "0 6px", fontSize: 12, outline: "none" }} />
          ))}
        </div>
        <div ref={listRef} style={{ flex: 1, margin: "0 8px", overflowY: "auto", background: "#fff", border: "1px solid #9fb2d1", borderTop: "none" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>{columns.map((c) => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
            <thead><tr>
              {columns.map((c) => (
                <th key={c.key} style={{ position: "sticky", top: 0, background: "#2854ad", color: "#fff", textAlign: "left", padding: "4px 6px", fontSize: 12, fontWeight: 700, borderRight: "1px solid #4a72c4" }}>{c.label}</th>
              ))}
            </tr></thead>
            <tbody>
              {shown.map((p, i) => (
                <tr key={p.id || i} data-row={i} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} onDoubleClick={() => onPick(p)}
                  style={{ cursor: "pointer", background: i === active ? "#b9c8b0" : i % 2 ? "#f6f8fc" : "#fff", borderBottom: "1px solid #e3e9f3" }}>
                  {columns.map((c) => <td key={c.key} style={{ ...cellStyle, fontWeight: c.key === "name" ? 700 : 400 }} title={String(c.get(p) || "")}>{c.get(p) || ""}</td>)}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={columns.length} style={{ padding: 16, textAlign: "center", color: "#64748b", fontSize: 12 }}>{bn ? "কিছু পাওয়া যায়নি" : `No ${partyWord} found`}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 8px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={extended} onChange={(e) => { setExtended(e.target.checked); firstRef.current?.focus(); }} />
            <b>Extended Search</b>
            <span style={{ color: "#b91c1c" }}>{bn ? "(লেখাটা ঘরের যেকোনো জায়গায় থাকলেই দেখাবে)" : `(Will display all ${partyWord}s containing the search text in any part of the field)`}</span>
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onQuickAdd && (
              <>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); quickAdd(); } }}
                  placeholder={bn ? "নতুন নাম" : `New ${partyWord} name`} autoComplete="off"
                  style={{ width: 180, height: 24, border: "1px solid #9fb2d1", padding: "0 6px", fontSize: 12, outline: "none" }} />
                <button type="button" onClick={quickAdd} disabled={adding || !newName.trim()} style={{ ...footBtn, background: "#16a34a", color: "#fff", borderColor: "#15803d", opacity: adding || !newName.trim() ? 0.6 : 1 }}>+ ADD</button>
              </>
            )}
            <span style={{ fontSize: 11, color: "#475569" }}>{rows.length > PICKER_LIMIT ? `${PICKER_LIMIT} / ${rows.length}` : rows.length}</span>
            <button type="button" onClick={onClose} style={{ ...footBtn, padding: "5px 18px" }}>CLOSE</button>
          </div>
        </div>
      </div>
    </div>
  );
}
