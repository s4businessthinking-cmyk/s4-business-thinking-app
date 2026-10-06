import React, { useEffect, useMemo, useRef, useState } from "react";
import { offlineCreate, offlineRemove, offlineUpdate } from "../offline/offlineRepository";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";

export const EXPENSE_CATEGORIES = [
  { key: "rent", bn: "দোকান ভাড়া", en: "Rent", icon: "🏠" },
  { key: "salary", bn: "বেতন", en: "Salary", icon: "👷" },
  { key: "electricity", bn: "বিদ্যুৎ বিল", en: "Electricity", icon: "💡" },
  { key: "water", bn: "পানি বিল", en: "Water", icon: "🚰" },
  { key: "phone", bn: "ফোন / ইন্টারনেট", en: "Phone / Internet", icon: "📶" },
  { key: "transport", bn: "গাড়ি ভাড়া / ডেলিভারি", en: "Transport / Delivery", icon: "🚚" },
  { key: "fuel", bn: "তেল / পেট্রোল", en: "Fuel", icon: "⛽" },
  { key: "maintenance", bn: "মেরামত", en: "Repairs / Maintenance", icon: "🔧" },
  { key: "office", bn: "অফিস / স্টেশনারি", en: "Office / Stationery", icon: "📎" },
  { key: "food", bn: "চা-নাস্তা / খাবার", en: "Tea / Food", icon: "☕" },
  { key: "marketing", bn: "বিজ্ঞাপন", en: "Marketing", icon: "📣" },
  { key: "bank", bn: "ব্যাংক চার্জ", en: "Bank Charges", icon: "🏦" },
  { key: "govt", bn: "সরকারি ফি / লাইসেন্স", en: "Govt Fees / License", icon: "🏛️" },
  { key: "other", bn: "অন্যান্য", en: "Other", icon: "🧾" },
];

const METHODS = [
  { key: "cash", bn: "নগদ", en: "Cash" },
  { key: "bank_transfer", bn: "ব্যাংক ট্রান্সফার", en: "Bank Transfer" },
  { key: "cheque", bn: "চেক", en: "Cheque" },
  { key: "card", bn: "কার্ড", en: "Card" },
];

const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100;
const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const d = new Date(); return localDay(new Date(d.getFullYear(), d.getMonth(), 1)); };
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");

export function expenseCategoryLabel(row, bn) {
  const cat = EXPENSE_CATEGORIES.find((c) => c.key === row?.category);
  if (cat && cat.key !== "other") return `${cat.icon} ${bn ? cat.bn : cat.en}`;
  return `🧾 ${row?.categoryName || (bn ? "অন্যান্য" : "Other")}`;
}

const emptyForm = () => ({ expenseDate: localDay(), category: "rent", categoryName: "", amount: "", method: "cash", paidTo: "", refNo: "", note: "", chequeNo: "", chequeBank: "", chequeDate: localDay() });

export default function ExpensesTab({ lang = "en", th, s, shopId, user, profile, isOwner, cur = "AED", isDesktop, toast, shopName = "", leaveGuard = null }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localDay());
  const [catFilter, setCatFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [baseline, setBaseline] = useState("");
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName: "expenses", shopId, onRows: (list) => setRows(list || []) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId]);

  const mine = useMemo(() => rows.filter((r) => r && !r.isDeleted && r.shopId === shopId && (isOwner || r.createdBy === user?.uid)), [rows, shopId, isOwner, user?.uid]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mine
      .filter((r) => (showCancelled || r.status !== "cancelled"))
      .filter((r) => (!from || String(r.expenseDate) >= from) && (!to || String(r.expenseDate) <= to))
      .filter((r) => !catFilter || r.category === catFilter)
      .filter((r) => !q || [r.expenseNo, r.paidTo, r.note, r.refNo, r.categoryName].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a, b) => String(b.expenseDate).localeCompare(String(a.expenseDate)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }, [mine, from, to, catFilter, search, showCancelled]);

  const active = filtered.filter((r) => r.status !== "cancelled");
  const total = active.reduce((t, r) => t + n(r.amount), 0);
  const byCategory = useMemo(() => {
    const map = new Map();
    active.forEach((r) => {
      const label = expenseCategoryLabel(r, bn);
      const cur0 = map.get(label) || { amt: 0, key: EXPENSE_CATEGORIES.some((c) => c.key === r.category) ? r.category : "other" };
      cur0.amt += n(r.amount);
      map.set(label, cur0);
    });
    return [...map.entries()].map(([label, v]) => [label, v.amt, v.key]).sort((a, b) => b[1] - a[1]);
  }, [active, bn]);

  const nextNo = () => {
    const mx = rows.reduce((m, r) => { const x = String(r.expenseNo || "").match(/EXP-?(\d+)$/i); return x ? Math.max(m, Number(x[1])) : m; }, 0);
    return `EXP-${String(mx + 1).padStart(4, "0")}`;
  };

  const openNew = () => { const f = emptyForm(); setEditId(null); setForm(f); setBaseline(JSON.stringify(f)); };
  const openEdit = (r) => {
    const f = { expenseDate: r.expenseDate || localDay(), category: r.category || "other", categoryName: r.categoryName || "", amount: String(r.amount ?? ""), method: r.method || "cash", paidTo: r.paidTo || "", refNo: r.refNo || "", note: r.note || "", chequeNo: r.chequeNo || "", chequeBank: r.chequeBank || "", chequeDate: r.chequeDate || r.expenseDate || localDay() };
    setEditId(r.id);
    setForm(f);
    setBaseline(JSON.stringify(f));
  };

  const save = async () => {
    if (saving || !form) return;
    const amount = r2(form.amount);
    if (!(amount > 0)) { toast?.(L("❌ সঠিক টাকার পরিমাণ লিখুন", "❌ Enter a valid amount"), "err"); return; }
    if (!form.expenseDate) { toast?.(L("❌ তারিখ দিন", "❌ Pick a date"), "err"); return; }
    if (form.category === "other" && !form.categoryName.trim()) { toast?.(L("❌ খরচের ধরন লিখুন", "❌ Type the expense type"), "err"); return; }
    const isCheque = form.method === "cheque";
    if (isCheque && !form.chequeDate) { toast?.(L("❌ চেকের তারিখ দিন", "❌ Pick the cheque date"), "err"); return; }
    setSaving(true);
    const nowIso = new Date().toISOString();
    const prev = editId ? rows.find((r) => r.id === editId) || {} : {};
    const body = {
      expenseDate: form.expenseDate, category: form.category, categoryName: form.category === "other" ? form.categoryName.trim() : "",
      amount, method: form.method, paidTo: form.paidTo.trim(), refNo: form.refNo.trim(), note: form.note.trim(),
      chequeNo: isCheque ? form.chequeNo.trim() : "", chequeBank: isCheque ? form.chequeBank.trim() : "", chequeDate: isCheque ? form.chequeDate : "",
      chequeStatus: isCheque ? (prev.method === "cheque" && prev.chequeStatus && prev.chequeDate === form.chequeDate ? prev.chequeStatus : "pending") : "",
      updatedAt: nowIso, updatedBy: user?.uid || "",
    };
    try {
      if (editId) {
        await offlineUpdate("expenses", editId, { ...prev, ...body });
        setRows((list) => list.map((r) => (r.id === editId ? { ...r, ...body } : r)));
        toast?.(L("✅ খরচ আপডেট হয়েছে", "✅ Expense updated"));
      } else {
        const payload = {
          ...body, shopId, expenseNo: nextNo(), status: "active",
          createdBy: user?.uid || "", createdByName: profile?.personName || "", createdAt: nowIso,
        };
        const result = await offlineCreate("expenses", payload);
        setRows((list) => [{ ...payload, id: result.documentId }, ...list]);
        toast?.(L(`✅ খরচ ${payload.expenseNo} সেভ হয়েছে`, `✅ Expense ${payload.expenseNo} saved`));
      }
      setForm(null);
      setEditId(null);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const cancelRow = async (r) => {
    if (!window.confirm(L(`${r.expenseNo} খরচটি বাতিল করবেন?`, `Cancel expense ${r.expenseNo}?`))) return;
    const nowIso = new Date().toISOString();
    const patch = { status: "cancelled", cancelledAt: nowIso, cancelledBy: user?.uid || "", updatedAt: nowIso, updatedBy: user?.uid || "" };
    try {
      await offlineUpdate("expenses", r.id, { ...r, ...patch });
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
      setForm(null);
      setEditId(null);
      toast?.(L("খরচ বাতিল হয়েছে", "Expense cancelled"));
      logAudit({ shopId, user, profile, action: "cancel", collection: "expenses", docId: r.id, docNo: r.expenseNo, amount: r.amount, note: r.paidTo || "" });
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };

  const deleteRow = async (r) => {
    if (!isOwner || r.status !== "cancelled") return;
    if (!window.confirm(L(`${r.expenseNo} খরচটি একেবারে মুছে ফেলবেন?`, `Delete expense ${r.expenseNo} permanently?`))) return;
    try {
      await offlineRemove("expenses", r.id);
      setRows((list) => list.filter((x) => x.id !== r.id));
      setForm(null);
      setEditId(null);
      toast?.(L("খরচ মুছে ফেলা হয়েছে", "Expense deleted"), "err");
      logAudit({ shopId, user, profile, action: "delete", collection: "expenses", docId: r.id, docNo: r.expenseNo, amount: r.amount, note: r.paidTo || "" });
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };

  const print = () => {
    const cols = [
      { label: "Date" }, { label: "No" }, { label: L("ধরন", "Type") }, { label: L("কাকে", "Paid To") },
      { label: L("বিবরণ", "Note") }, { label: L("মাধ্যম", "Mode") }, { label: `${L("টাকা", "Amount")} (${cur})`, align: "right" },
    ];
    const body = active.map((r) => [fmtDay(r.expenseDate), r.expenseNo || "", expenseCategoryLabel(r, false).replace(/^\S+\s/, ""), r.paidTo || "", r.note || "", (METHODS.find((m) => m.key === r.method)?.en) || r.method || "", money(r.amount)]);
    printWithSettings(generateStatementHTML({
      shopName, title: "EXPENSE REPORT", subtitle: `${from ? fmtDay(from) : "Start"} — ${to ? fmtDay(to) : "Today"}`,
      cols, rows: body, foot: ["", "", "", "", "", "TOTAL", money(total)],
    }), { lang });
  };

  const editRow = editId ? rows.find((r) => r.id === editId) : null;
  const readOnly = !!editRow && (editRow.status === "cancelled" || !(isOwner || editRow.createdBy === user?.uid));
  const formDirty = !!form && !readOnly && JSON.stringify(form) !== baseline;
  const closeForm = () => {
    if (saving) return;
    if (formDirty && !window.confirm(L("সেভ না করা পরিবর্তন আছে। বন্ধ করবেন?", "You have unsaved changes. Close anyway?"))) return;
    setForm(null);
    setEditId(null);
  };
  useEffect(() => {
    if (!leaveGuard || !form) return undefined;
    const guard = {
      leave: () => !formDirty || window.confirm(L("সেভ না করা পরিবর্তন আছে। বন্ধ করবেন?", "You have unsaved changes. Close anyway?")),
      back: () => { closeForm(); return true; },
    };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });

  useEffect(() => {
    if (!form) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeForm(); }
      else if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "s") { e.preventDefault(); if (!readOnly) save(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const today = localDay();
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const quick = [
    ["today", L("আজ", "Today"), today, today],
    ["month", L("এই মাস", "This month"), monthStart(), today],
    ["year", L("এই বছর", "This year"), yearStart, today],
    ["all", L("সব", "All"), "", ""],
  ];
  const activeQuick = quick.find(([, , f, t]) => f === from && t === to)?.[0];
  const catName = (r) => expenseCategoryLabel(r, bn).replace(/^\S+\s/, "");
  const methodName = (r) => (METHODS.find((m) => m.key === r.method)?.[bn ? "bn" : "en"]) || r.method || "";
  const chequeLabel = (st) => (st === "cleared" ? L("ক্লিয়ার", "Cleared") : st === "bounced" ? L("বাউন্স", "Bounced") : L("পেন্ডিং", "Pending"));
  const chequeColor = (st) => (st === "cleared" ? "#15803d" : st === "bounced" ? "#b91c1c" : "#b45309");
  const cashTotal = active.filter((r) => r.method === "cash").reduce((t, r) => t + n(r.amount), 0);
  const pendingCheques = active.filter((r) => r.method === "cheque" && (r.chequeStatus || "pending") === "pending");
  const cancelledCount = filtered.length - active.length;
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const fField = (label, control, extra) => (
    <div className="si-field" style={extra}><span className="pm-label">{label}</span>{control}</div>
  );

  const toolbar = (
    <div className="si-toolbar">
      <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {L("নতুন খরচ", "New Expense")}</button>
      <button type="button" className="pm-btn-secondary" onClick={print} disabled={!active.length}>🖨️ {L("প্রিন্ট", "Print")}</button>
      <span className="si-toolbar-gap" />
      <div className="si-pills">
        {quick.map(([key, label, f, t]) => (
          <button key={key} type="button" className={`pm-btn-secondary${activeQuick === key ? " is-active" : ""}`} onClick={() => { setFrom(f); setTo(t); }}>{label}</button>
        ))}
      </div>
      <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120 }} value={from} onChange={(e) => setFrom(e.target.value)} />
      <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120 }} value={to} onChange={(e) => setTo(e.target.value)} />
    </div>
  );

  const kpis = (
    <div className="si-kpis">
      <div className="si-kpi"><span>{L("মোট খরচ", "Total expenses")}</span><b style={{ color: "#b91c1c" }}>{cur} {money(total)}</b></div>
      <div className="si-kpi"><span>{L("এন্ট্রি", "Entries")}</span><b>{active.length}</b></div>
      <div className="si-kpi"><span>{L("নগদে", "Paid in cash")}</span><b>{money(cashTotal)}</b></div>
      <div className="si-kpi"><span>{L("পেন্ডিং চেক", "Pending cheques")}</span><b style={{ color: pendingCheques.length ? "#b45309" : undefined }}>{pendingCheques.length} · {money(pendingCheques.reduce((t, r) => t + n(r.amount), 0))}</b></div>
    </div>
  );

  const filterBar = (
    <div className="si-filters">
      <div className="si-search">
        <input className="pm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("খুঁজুন: নং, কাকে, বিবরণ, রেফ…", "Search: no, paid to, note, ref…")} />
        {search && <button type="button" onClick={() => setSearch("")}>✕</button>}
      </div>
      <select className="pm-input" style={{ width: mobile ? "100%" : 190 }} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
        <option value="">{L("সব ধরন", "All types")}</option>
        {EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.icon} {bn ? c.bn : c.en}</option>)}
      </select>
      <label className="pm-check"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> {L("বাতিলগুলোও দেখাও", "Show cancelled")}</label>
    </div>
  );

  const emptyBox = (
    <div className="si-empty">
      {mine.length ? L("এই ফিল্টারে কোনো খরচ নেই", "No expenses match these filters") : L("এখনো কোনো খরচ লেখা হয়নি", "No expenses yet")}
    </div>
  );

  const listTable = (
    <table className="pm-table">
      <thead><tr>
        <th style={{ width: 74 }}>{L("তারিখ", "Date")}</th>
        <th style={{ width: 78 }}>{L("নং", "No")}</th>
        <th style={{ width: 130 }}>{L("ধরন", "Type")}</th>
        <th>{L("কাকে", "Paid To")}</th>
        <th>{L("বিবরণ", "Note")}</th>
        <th style={{ width: 92 }}>{L("মাধ্যম", "Mode")}</th>
        <th style={{ width: 120 }}>{L("চেক", "Cheque")}</th>
        {isOwner && <th style={{ width: 90 }}>{L("লিখেছেন", "By")}</th>}
        <th style={{ width: 96 }} className="si-num">{L("টাকা", "Amount")}</th>
      </tr></thead>
      <tbody>
        {filtered.map((r) => {
          const cancelled = r.status === "cancelled";
          return (
            <tr key={r.id} className={`pm-clickable${editId === r.id ? " pm-selected" : ""}`} onClick={() => openEdit(r)} style={cancelled ? { color: "#6b7280" } : undefined}>
              <td>{fmtDay(r.expenseDate)}</td>
              <td className="si-strong">{r.expenseNo}</td>
              <td>{catName(r)}</td>
              <td title={r.paidTo || ""}>{r.paidTo || "—"}</td>
              <td title={r.note || ""}>{r.refNo ? `[${r.refNo}] ` : ""}{r.note || ""}</td>
              <td>{methodName(r)}</td>
              <td>{r.method === "cheque" ? <><span className="si-badge" style={{ color: chequeColor(r.chequeStatus) }}>{chequeLabel(r.chequeStatus)}</span> {fmtDay(r.chequeDate)}</> : ""}</td>
              {isOwner && <td>{r.createdByName || ""}</td>}
              <td className="si-num si-strong" style={cancelled ? { textDecoration: "line-through" } : { color: "#b91c1c" }}>
                {cancelled && <span className="si-badge" style={{ color: "#6b7280", marginRight: 4, textDecoration: "none" }}>{L("বাতিল", "Cancelled")}</span>}
                {money(r.amount)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const listMobile = filtered.map((r) => {
    const cancelled = r.status === "cancelled";
    return (
      <button key={r.id} type="button" className="si-mrow" onClick={() => openEdit(r)} style={cancelled ? { opacity: 0.6 } : undefined}>
        <div className="si-mrow-top">
          <span>{catName(r)}</span>
          <span style={cancelled ? { textDecoration: "line-through" } : { color: "#b91c1c" }}>{cur} {money(r.amount)}</span>
        </div>
        <div className="si-mrow-sub">
          <span>{fmtDay(r.expenseDate)} · {r.expenseNo}{r.paidTo ? ` · ${r.paidTo}` : ""}</span>
          <span>
            {cancelled ? <span className="si-badge" style={{ color: "#6b7280" }}>{L("বাতিল", "Cancelled")}</span>
              : r.method === "cheque" ? <span className="si-badge" style={{ color: chequeColor(r.chequeStatus) }}>{L("চেক", "Cheque")} · {chequeLabel(r.chequeStatus)}</span>
                : methodName(r)}
          </span>
        </div>
        {r.note && <div className="si-mrow-sub"><span>{r.note}</span></div>}
      </button>
    );
  });

  const categoryBox = (
    <div className="si-box">
      <table className="pm-table">
        <thead><tr><th>{L("খরচের ধরন", "Expense type")}</th><th style={{ width: 92 }} className="si-num">{L("টাকা", "Amount")}</th><th style={{ width: 46 }} className="si-num">%</th></tr></thead>
        <tbody>
          <tr className={`pm-clickable${!catFilter ? " pm-selected" : ""}`} onClick={() => setCatFilter("")}>
            <td className="si-strong">{L("সব ধরন", "All types")}</td><td className="si-num si-strong">{money(total)}</td><td className="si-num">{total > 0 ? "100" : "0"}</td>
          </tr>
          {byCategory.map(([label, amt, key]) => (
            <tr key={label} className={`pm-clickable${catFilter === key ? " pm-selected" : ""}`} onClick={() => setCatFilter(catFilter === key ? "" : key)}>
              <td>{label}</td>
              <td className="si-num">{money(amt)}</td>
              <td className="si-num">{total > 0 ? ((amt / total) * 100).toFixed(0) : "0"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!byCategory.length && <div className="si-empty">{L("এই সময়ে কোনো খরচ নেই", "No expenses in this period")}</div>}
    </div>
  );

  const catGrid = form && (
    <div className="si-types" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
      {EXPENSE_CATEGORIES.map((c) => (
        <button key={c.key} type="button" disabled={readOnly} className={`pm-btn-secondary${form.category === c.key ? " is-active" : ""}`} onClick={() => setF("category", c.key)}>
          {c.icon} {bn ? c.bn : c.en}
        </button>
      ))}
    </div>
  );

  const fields = form && (
    <div className="si-panel-body" style={{ gap: 6 }}>
      <div className="si-grid2">
        {fField(`${L("টাকা", "Amount")} (${cur}) *`, <input autoFocus={!mobile && !readOnly} className="pm-input" inputMode="decimal" disabled={readOnly} value={form.amount} placeholder="0.00" onChange={(e) => setF("amount", e.target.value)} style={{ fontWeight: 700, color: "#b91c1c" }} />)}
        {fField(`${L("তারিখ", "Date")} *`, <input type="date" className="pm-input" disabled={readOnly} value={form.expenseDate} onChange={(e) => setF("expenseDate", e.target.value)} />)}
      </div>
      {form.category === "other" && fField(`${L("খরচের ধরন", "Expense type")} *`, <input className="pm-input" disabled={readOnly} value={form.categoryName} onChange={(e) => setF("categoryName", e.target.value)} placeholder={L("যেমন: পরিষ্কার", "e.g. Cleaning")} />)}
      {fField(L("কীভাবে দিলেন", "Paid by"), (
        <div className="si-types" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
          {METHODS.map((m) => (
            <button key={m.key} type="button" disabled={readOnly} className={`pm-btn-secondary${form.method === m.key ? " is-active" : ""}`} onClick={() => setF("method", m.key)}>{bn ? m.bn : m.en}</button>
          ))}
        </div>
      ))}
      {form.method === "cheque" && (
        <div className="si-entry">
          <div className="si-grid2">
            {fField(L("চেক নং", "Cheque No"), <input className="pm-input" disabled={readOnly} value={form.chequeNo} onChange={(e) => setF("chequeNo", e.target.value)} />)}
            {fField(L("ব্যাংক", "Bank"), <input className="pm-input" disabled={readOnly} value={form.chequeBank} onChange={(e) => setF("chequeBank", e.target.value)} />)}
          </div>
          {fField(`${L("চেকের তারিখ", "Cheque date")} *`, <input type="date" className="pm-input" disabled={readOnly} value={form.chequeDate} onChange={(e) => setF("chequeDate", e.target.value)} />)}
          {editRow?.method === "cheque" && <div className="si-hint" style={{ marginLeft: 0 }}>{L("চেকের অবস্থা", "Cheque status")}: <b style={{ color: chequeColor(editRow.chequeStatus) }}>{chequeLabel(editRow.chequeStatus)}</b> — {L("ক্লিয়ার/বাউন্স চেক পেজ থেকে করুন", "mark cleared/bounced from the Cheque page")}</div>}
          {!readOnly && <div className="si-hint" style={{ marginLeft: 0 }}>🔔 {L("চেকের তারিখের ৭, ২ আর ১ দিন আগে নোটিফিকেশন আসবে", "You'll be reminded 7, 2 and 1 day before the cheque date")}</div>}
        </div>
      )}
      <div className="si-grid2">
        {fField(L("কাকে দিলেন", "Paid to"), <input className="pm-input" disabled={readOnly} value={form.paidTo} onChange={(e) => setF("paidTo", e.target.value)} />)}
        {fField(L("রেফারেন্স / বিল নং", "Ref / Bill No"), <input className="pm-input" disabled={readOnly} value={form.refNo} onChange={(e) => setF("refNo", e.target.value)} />)}
      </div>
      {fField(L("বিবরণ", "Note"), <textarea className="pm-input" disabled={readOnly} rows={2} value={form.note} onChange={(e) => setF("note", e.target.value)} style={{ height: mobile ? 64 : 44 }} />)}
      {editRow && (
        <div className="si-hint" style={{ marginLeft: 0 }}>
          {editRow.expenseNo}{editRow.createdByName ? ` · ${L("লিখেছেন", "By")} ${editRow.createdByName}` : ""}
          {editRow.status === "cancelled" ? ` · ${L("বাতিল করা হয়েছে", "Cancelled")}` : ""}
        </div>
      )}
    </div>
  );

  const title = !editRow ? L("💸 নতুন খরচ", "💸 New Expense") : readOnly ? `🧾 ${editRow.expenseNo}` : `✏️ ${L("খরচ এডিট", "Edit Expense")} — ${editRow.expenseNo}`;
  const formWindow = form && (
    <div className="pm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm(); }}>
      <div className="pm-window" style={{ maxWidth: mobile ? undefined : 780 }}>
        <div className="pm-window-title">
          <span>{title}</span>
          <button type="button" className="pm-window-close" onClick={closeForm}>✕</button>
        </div>
        <div className="pm-window-body">
          {readOnly && editRow?.status !== "cancelled" && <div className="si-hint" style={{ marginLeft: 0 }}>🔒 {L("এটা অন্য কেউ লিখেছেন, শুধু দেখতে পারবেন", "Entered by someone else — view only")}</div>}
          <div className={mobile ? "" : "si-cols"} style={mobile ? { display: "flex", flexDirection: "column", gap: 8 } : undefined}>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("খরচের ধরন", "Expense type")} *</legend>
              {catGrid}
            </fieldset>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("বিস্তারিত", "Details")}</legend>
              {fields}
            </fieldset>
          </div>
        </div>
        <div className="si-actions si-sticky-actions" style={{ background: "transparent" }}>
          {editRow && !readOnly && <button type="button" className="pm-btn-secondary pm-btn--danger" disabled={saving} onClick={() => cancelRow(editRow)}>✖ {L("খরচ বাতিল", "Cancel expense")}</button>}
          {editRow && editRow.status === "cancelled" && isOwner && <button type="button" className="pm-btn-secondary pm-btn--danger" disabled={saving} onClick={() => deleteRow(editRow)}>🗑️ {L("মুছে ফেলুন", "Delete")}</button>}
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn-secondary" disabled={saving} onClick={closeForm}>{L("বন্ধ", "Close")}</button>
          {!readOnly && (
            <button type="button" className="pm-btn pm-btn--primary" disabled={saving} onClick={save}>
              {saving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${editRow ? L("আপডেট", "Update") : L("সেভ", "Save")} (Ctrl+S)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong>💸 {L("দোকানের খরচ", "Shop Expenses")}</strong>
        <span>{from ? fmtDay(from) : L("শুরু", "Start")} — {to ? fmtDay(to) : L("আজ", "Today")}</span>
      </div>
      {toolbar}
      {kpis}
      {filterBar}
      {mobile ? (
        <div className="si-main is-all">
          <div className="si-box">{filtered.length ? listMobile : emptyBox}</div>
          {byCategory.length > 0 && <div style={{ marginTop: 6 }}>{categoryBox}</div>}
        </div>
      ) : (
        <div className="si-main">
          {categoryBox}
          <div className="si-box">{filtered.length ? listTable : emptyBox}</div>
        </div>
      )}
      <div className="si-statusbar">
        <span>{L("দেখাচ্ছে", "Showing")} <b>{filtered.length}</b> / {mine.length}</span>
        <span>{L("মোট", "Total")} <b>{cur} {money(total)}</b></span>
        {cancelledCount > 0 && <span>{L("বাতিল", "Cancelled")} <b>{cancelledCount}</b></span>}
        {!isOwner && <span>{L("শুধু আপনার লেখা খরচ দেখাচ্ছে", "Showing only expenses you entered")}</span>}
      </div>
      {formWindow}
    </div>
  );
}
