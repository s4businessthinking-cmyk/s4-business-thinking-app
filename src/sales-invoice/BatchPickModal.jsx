import React, { useEffect, useState } from "react";

const fmt = (v) => (Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");

// Asks which batch a sold line comes from. Enter / number keys pick, Esc closes (the line is not added).
export default function BatchPickModal({ lang = "en", product, choices, onPick, onClose }) {
  const bn = lang === "bn";
  const [active, setActive] = useState(0);
  const unit = product?.unit || "Pcs";

  useEffect(() => {
    if (!choices?.length) return undefined;
    const onKey = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % choices.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + choices.length) % choices.length); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onPick(choices[active]); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      else if (/^[1-9]$/.test(e.key) && choices[Number(e.key) - 1]) { e.preventDefault(); onPick(choices[Number(e.key) - 1]); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [choices, active, onPick, onClose]);

  return (
    <div data-si-modal-open="" style={{ position: "fixed", inset: 0, background: "rgba(10,25,55,0.45)", zIndex: 10060, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 640, maxHeight: "85vh", display: "flex", flexDirection: "column", background: "#f4f7fc", border: "1px solid #2854ad", borderRadius: 6, boxShadow: "0 18px 40px rgba(0,0,0,0.35)", fontFamily: "Segoe UI, Tahoma, sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#2854ad", color: "#fff", padding: "7px 10px", fontWeight: 800, fontSize: 13.5 }}>
          <span>📦 {bn ? "কোন ব্যাচ থেকে দেবেন?" : "Which batch?"} — {product?.name}</span>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ overflow: "auto", padding: 8, display: "grid", gap: 6 }}>
          {choices.map((c, i) => (
            <button key={c.batchNo || "main"} type="button" onClick={() => onPick(c)} onMouseEnter={() => setActive(i)}
              style={{ textAlign: "left", padding: "8px 10px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit", border: i === active ? "2px solid #2854ad" : "1px solid #b7c6e0", background: i === active ? "#dbe6f5" : "#fff", display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 8, alignItems: "center" }}>
              <b style={{ color: "#2854ad", fontSize: 15 }}>{i + 1}</b>
              <span>
                <span style={{ fontWeight: 800, fontSize: 13.5, color: c.isMain ? "#1f2937" : "#7c3aed" }}>
                  {c.isMain ? (bn ? "আগের / সাধারণ stock" : "Main stock") : `${bn ? "ব্যাচ" : "Batch"} ${c.batchNo}`}
                </span>
                {!c.isMain && (
                  <span style={{ display: "block", fontSize: 12, color: "#4b5f86" }}>
                    {[fmtDay(c.date), c.vendorName, c.mrp > 0 ? `M.R.P ${fmt(c.mrp)}` : "", c.cost > 0 ? `${bn ? "খরচ" : "Cost"} ${fmt(c.cost)}` : ""].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              <span style={{ fontWeight: 900, fontSize: 14, color: "#15803d", whiteSpace: "nowrap" }}>{c.stock} {unit}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: "6px 10px", fontSize: 11.5, color: "#4b5f86", borderTop: "1px solid #b7c6e0" }}>
          {bn ? "↑↓ বা নম্বর চেপে বাছুন, Enter = ঠিক আছে, Esc = বাতিল" : "Use ↑↓ or a number, Enter to pick, Esc to cancel"}
        </div>
      </div>
    </div>
  );
}
