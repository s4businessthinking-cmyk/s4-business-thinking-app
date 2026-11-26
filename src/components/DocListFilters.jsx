// Filter row pieces for the bill lists: status pills with counts (All / Active / each status), a date range and a
// one-line summary of what the filtered list adds up to, with drafts and cancelled bills kept out of the money.
import React from "react";
import { LIVE } from "../utils/docStatusFilter.js";
import DateField from "./DateField.jsx";

export function DocStatusPills({ statuses = {}, value = "ALL", onChange, counts = null, lang = "en", allLabel }) {
  const bn = lang === "bn";
  const count = (k) => (counts && counts[k] ? ` (${counts[k]})` : counts ? " (0)" : "");
  const keys = ["ALL", LIVE, ...Object.keys(statuses)];
  return (
    <div className="si-pills">
      {keys.map((k) => (
        <button key={k} type="button" className={`pm-btn-secondary${value === k ? " is-active" : ""}`} onClick={() => onChange?.(k)}
          title={k === LIVE ? (bn ? "Draft আর বাতিল ছাড়া" : "Without drafts and cancelled") : undefined}>
          {k === "ALL" ? (allLabel || (bn ? "সব" : "All")) : k === LIVE ? (bn ? "চালু" : "Active") : statuses[k]?.[lang] || k}{count(k)}
        </button>
      ))}
    </div>
  );
}

export function DocDateRange({ from = "", to = "", onFrom, onTo, lang = "en", mobile = false }) {
  const bn = lang === "bn";
  const bad = !!(from && to && from > to);
  const w = mobile ? "calc(50% - 2px)" : 118;
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
      <DateField className="pm-input" style={{ width: w, borderColor: bad ? "#b91c1c" : undefined }} value={from} onChange={(e) => onFrom?.(e.target.value)} title={bn ? "এই তারিখ থেকে" : "From date"} />
      <DateField className="pm-input" style={{ width: w, borderColor: bad ? "#b91c1c" : undefined }} value={to} onChange={(e) => onTo?.(e.target.value)} title={bn ? "এই তারিখ পর্যন্ত" : "To date"} />
      {(from || to) && <button type="button" className="pm-btn-secondary" onClick={() => { onFrom?.(""); onTo?.(""); }}>{bn ? "সব তারিখ" : "All dates"}</button>}
    </div>
  );
}

/** Shown when a status / date filter is on, or the filtered list holds drafts or cancelled bills. */
export function DocListSummary({ summary, active = false, lang = "en", cur = "", fmt = (v) => String(v) }) {
  if (!summary || (!active && !summary.cancelled && !summary.draft)) return null;
  const bn = lang === "bn";
  const parts = [
    bn ? `দেখাচ্ছে ${summary.count}টি` : `Showing ${summary.count}`,
    bn ? `মোটে ধরা: ${summary.counted}টি · ${cur} ${fmt(summary.amount)}` : `Counted: ${summary.counted} · ${cur} ${fmt(summary.amount)}`,
    summary.draft ? (bn ? `Draft ${summary.draft}টি (${fmt(summary.draftAmount)}) মোটে নেই` : `${summary.draft} draft (${fmt(summary.draftAmount)}) not counted`) : "",
    summary.cancelled ? (bn ? `বাতিল ${summary.cancelled}টি (${fmt(summary.cancelledAmount)}) মোটে নেই` : `${summary.cancelled} cancelled (${fmt(summary.cancelledAmount)}) not counted`) : "",
  ].filter(Boolean);
  return <div className="si-hint" style={{ margin: "2px 6px", fontWeight: 600 }}>{parts.join("   ·   ")}</div>;
}
