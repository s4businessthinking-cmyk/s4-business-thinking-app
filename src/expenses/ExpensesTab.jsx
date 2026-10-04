import React, { useEffect, useMemo, useState } from "react";
import { offlineCreate, offlineUpdate } from "../offline/offlineRepository";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";

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

export default function ExpensesTab({ lang = "en", th, s, shopId, user, profile, isOwner, cur = "AED", isDesktop, toast, shopName = "" }) {
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
      map.set(label, (map.get(label) || 0) + n(r.amount));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [active, bn]);

  const nextNo = () => {
    const mx = rows.reduce((m, r) => { const x = String(r.expenseNo || "").match(/EXP-?(\d+)$/i); return x ? Math.max(m, Number(x[1])) : m; }, 0);
    return `EXP-${String(mx + 1).padStart(4, "0")}`;
  };

  const openNew = () => { setEditId(null); setForm(emptyForm()); };
  const openEdit = (r) => {
    setEditId(r.id);
    setForm({ expenseDate: r.expenseDate || localDay(), category: r.category || "other", categoryName: r.categoryName || "", amount: String(r.amount ?? ""), method: r.method || "cash", paidTo: r.paidTo || "", refNo: r.refNo || "", note: r.note || "", chequeNo: r.chequeNo || "", chequeBank: r.chequeBank || "", chequeDate: r.chequeDate || r.expenseDate || localDay() });
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
      toast?.(L("খরচ বাতিল হয়েছে", "Expense cancelled"));
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

  useEffect(() => {
    if (!form) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !saving) setForm(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form, saving]);

  const card = { padding: 14, borderRadius: 14, background: th.bgCard, border: `1px solid ${th.border}` };
  const inp = { padding: "10px 11px", borderRadius: 10, border: `1px solid ${th.borderMid || th.border}`, background: th.bgInp, color: th.txtPrimary, fontFamily: "inherit", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" };
  const btn = (bg, color = "#fff") => ({ padding: "9px 14px", borderRadius: 10, border: "none", background: bg, color, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });
  const lbl = { fontSize: 11, fontWeight: 800, color: th.txtMuted, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3 };
  const today = localDay();
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const quick = [
    ["today", L("আজ", "Today"), today, today],
    ["month", L("এই মাস", "This month"), monthStart(), today],
    ["year", L("এই বছর", "This year"), yearStart, today],
    ["all", L("সব", "All"), "", ""],
  ];
  const activeQuick = quick.find(([, , f, t]) => f === from && t === to)?.[0];
  const chip = (on) => ({
    padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
    border: `1px solid ${on ? "#f97316" : th.border}`, background: on ? "#f97316" : th.bgInp, color: on ? "#fff" : th.txtSecondary,
  });
  const catIcon = (r) => (EXPENSE_CATEGORIES.find((c) => c.key === r.category) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]).icon;
  const catName = (r) => expenseCategoryLabel(r, bn).replace(/^\S+\s/, "");

  const filters = (
    <div style={{ ...card, padding: isDesktop ? 12 : 10, marginBottom: 12, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {quick.map(([key, label, f, t]) => <button key={key} type="button" onClick={() => { setFrom(f); setTo(t); }} style={chip(activeQuick === key)}>{label}</button>)}
        {isDesktop && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inp, width: 150, padding: "6px 9px", fontSize: 13 }} />
            <span style={{ color: th.txtMuted, alignSelf: "center" }}>—</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inp, width: 150, padding: "6px 9px", fontSize: 13 }} />
          </>
        )}
      </div>
      {!isDesktop && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inp, padding: "8px 9px", fontSize: 13 }} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inp, padding: "8px 9px", fontSize: 13 }} />
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "220px 240px auto" : "1fr 1fr", gap: 6, alignItems: "center" }}>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ ...inp, padding: "8px 9px", fontSize: 13 }}>
          <option value="">{L("সব ধরন", "All types")}</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.icon} {bn ? c.bn : c.en}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`🔍 ${L("খুঁজুন…", "Search…")}`} style={{ ...inp, padding: "8px 9px", fontSize: 13 }} />
        <label style={{ fontSize: 12, color: th.txtSecondary, display: "flex", gap: 5, alignItems: "center", cursor: "pointer", gridColumn: isDesktop ? undefined : "1 / -1" }}>
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> {L("বাতিলগুলোও দেখাও", "Show cancelled")}
        </label>
      </div>
    </div>
  );

  const summary = (
    <div style={{ ...card, background: "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(249,115,22,0.12))", border: "1px solid rgba(249,115,22,0.35)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 12, color: th.txtSecondary, fontWeight: 800 }}>{L("মোট খরচ", "Total expenses")}</div>
        <div style={{ fontSize: 11, color: th.txtMuted, fontWeight: 700 }}>{active.length} {L("টি", "entries")}</div>
      </div>
      <div style={{ fontSize: isDesktop ? 26 : 28, fontWeight: 900, color: "#ef4444", margin: "2px 0 10px" }}>{cur} {money(total)}</div>
      {isDesktop ? (
        byCategory.map(([label, amt]) => (
          <div key={label} style={{ marginBottom: 7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: th.txtPrimary, fontWeight: 700 }}>
              <span>{label}</span><span>{money(amt)}</span>
            </div>
            <div style={{ height: 5, borderRadius: 4, background: th.bgInp, marginTop: 3 }}>
              <div style={{ height: 5, borderRadius: 4, width: `${total > 0 ? Math.max(2, (amt / total) * 100) : 0}%`, background: "#f97316" }} />
            </div>
          </div>
        ))
      ) : (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {byCategory.map(([label, amt]) => (
            <div key={label} style={{ flex: "0 0 auto", padding: "6px 10px", borderRadius: 10, background: th.bgCard, border: `1px solid ${th.border}` }}>
              <div style={{ fontSize: 11, color: th.txtSecondary, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</div>
              <div style={{ fontSize: 13, color: th.txtPrimary, fontWeight: 900 }}>{money(amt)}</div>
            </div>
          ))}
        </div>
      )}
      {!byCategory.length && <div style={{ fontSize: 12, color: th.txtMuted }}>{L("এই সময়ে কোনো খরচ নেই", "No expenses in this period")}</div>}
    </div>
  );

  const list = (
    <div style={{ display: "grid", gap: 8 }}>
      {filtered.map((r) => {
        const cancelled = r.status === "cancelled";
        const canEdit = !cancelled && (isOwner || r.createdBy === user?.uid);
        const method = (METHODS.find((m) => m.key === r.method)?.[bn ? "bn" : "en"]) || r.method;
        return (
          <div key={r.id} style={{ ...card, padding: "10px 12px", opacity: cancelled ? 0.55 : 1, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, background: "rgba(249,115,22,0.14)" }}>{catIcon(r)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: th.txtPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{catName(r)}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: cancelled ? th.txtMuted : "#ef4444", whiteSpace: "nowrap", textDecoration: cancelled ? "line-through" : "none" }}>{cur} {money(r.amount)}</div>
              </div>
              {r.paidTo && <div style={{ fontSize: 12.5, color: th.txtSecondary, fontWeight: 600, marginTop: 1 }}>👤 {r.paidTo}</div>}
              <div style={{ fontSize: 11, color: th.txtMuted, marginTop: 3, lineHeight: 1.5 }}>
                📅 {fmtDay(r.expenseDate)} · {r.expenseNo} · {method}{r.refNo ? ` · Ref ${r.refNo}` : ""}{isOwner && r.createdByName ? ` · ${r.createdByName}` : ""}
                {cancelled ? <span style={{ color: "#ef4444", fontWeight: 800 }}> · {L("বাতিল", "Cancelled")}</span> : null}
              </div>
              {r.method === "cheque" && r.chequeDate && (
                <div style={{ fontSize: 11.5, marginTop: 3, color: th.txtSecondary, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span>🧾 {L("চেক", "Cheque")} {r.chequeNo || "—"}{r.chequeBank ? ` · ${r.chequeBank}` : ""} · 📅 {fmtDay(r.chequeDate)}</span>
                  <span style={{ padding: "1px 7px", borderRadius: 999, fontWeight: 800, fontSize: 10.5,
                    ...(r.chequeStatus === "cleared" ? { background: "rgba(22,163,74,0.15)", color: "#16a34a" }
                      : r.chequeStatus === "bounced" ? { background: "rgba(220,38,38,0.15)", color: "#ef4444" }
                        : { background: "rgba(245,158,11,0.15)", color: "#f59e0b" }) }}>
                    {r.chequeStatus === "cleared" ? L("ক্লিয়ার", "Cleared") : r.chequeStatus === "bounced" ? L("বাউন্স", "Bounced") : L("পেন্ডিং", "Pending")}
                  </span>
                </div>
              )}
              {r.note && <div style={{ fontSize: 12, color: th.txtSecondary, marginTop: 3 }}>📝 {r.note}</div>}
              {canEdit && (
                <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                  <button type="button" onClick={() => openEdit(r)} style={{ ...btn("rgba(37,99,235,0.12)", "#3b82f6"), padding: "5px 12px", fontSize: 12 }}>✏️ {L("এডিট", "Edit")}</button>
                  <button type="button" onClick={() => cancelRow(r)} style={{ ...btn("rgba(220,38,38,0.12)", "#ef4444"), padding: "5px 12px", fontSize: 12 }}>✖ {L("বাতিল", "Cancel")}</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {!filtered.length && (
        <div style={{ ...card, textAlign: "center", color: th.txtMuted, padding: 30 }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>💸</div>
          {L("কোনো খরচ পাওয়া যায়নি", "No expenses found")}
          <div style={{ marginTop: 10 }}><button type="button" onClick={openNew} style={btn("#16a34a")}>+ {L("প্রথম খরচ লিখুন", "Add the first expense")}</button></div>
        </div>
      )}
    </div>
  );

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const catGrid = form && (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 6 }}>
      {EXPENSE_CATEGORIES.map((c) => {
        const on = form.category === c.key;
        return (
          <button key={c.key} type="button" onClick={() => setF("category", c.key)}
            style={{ padding: isDesktop ? "7px 4px" : "9px 4px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              border: `1.5px solid ${on ? "#f97316" : th.border}`, background: on ? "rgba(249,115,22,0.16)" : th.bgInp, color: on ? "#f97316" : th.txtPrimary }}>
            <span style={{ fontSize: isDesktop ? 17 : 20, lineHeight: 1 }}>{c.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.2, textAlign: "center" }}>{bn ? c.bn : c.en}</span>
          </button>
        );
      })}
    </div>
  );
  const fields = form && (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><div style={lbl}>{L("টাকা", "Amount")} ({cur}) *</div>
          <input autoFocus={isDesktop} inputMode="decimal" value={form.amount} placeholder="0.00" onChange={(e) => setF("amount", e.target.value)}
            style={{ ...inp, fontSize: 20, fontWeight: 900, color: "#ef4444", padding: "8px 11px" }} /></div>
        <div><div style={lbl}>{L("তারিখ", "Date")} *</div><input type="date" value={form.expenseDate} onChange={(e) => setF("expenseDate", e.target.value)} style={{ ...inp, padding: "12px 11px" }} /></div>
      </div>
      {form.category === "other" && (
        <div><div style={lbl}>{L("খরচের ধরন", "Expense type")} *</div>
          <input value={form.categoryName} onChange={(e) => setF("categoryName", e.target.value)} placeholder={L("যেমন: পরিষ্কার", "e.g. Cleaning")} style={inp} /></div>
      )}
      <div><div style={lbl}>{L("কীভাবে দিলেন", "Paid by")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 5 }}>
          {METHODS.map((m) => (
            <button key={m.key} type="button" onClick={() => setF("method", m.key)}
              style={{ padding: "8px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                border: `1.5px solid ${form.method === m.key ? "#3b82f6" : th.border}`, background: form.method === m.key ? "rgba(59,130,246,0.16)" : th.bgInp, color: form.method === m.key ? "#3b82f6" : th.txtSecondary }}>
              {bn ? m.bn : m.en}
            </button>
          ))}
        </div>
      </div>
      {form.method === "cheque" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: 8, borderRadius: 10, background: "rgba(59,130,246,0.08)", border: "1px dashed rgba(59,130,246,0.45)" }}>
          <div><div style={lbl}>{L("চেক নং", "Cheque No")}</div><input value={form.chequeNo} onChange={(e) => setF("chequeNo", e.target.value)} style={{ ...inp, padding: "8px 9px" }} /></div>
          <div><div style={lbl}>{L("ব্যাংক", "Bank")}</div><input value={form.chequeBank} onChange={(e) => setF("chequeBank", e.target.value)} style={{ ...inp, padding: "8px 9px" }} /></div>
          <div><div style={lbl}>{L("চেকের তারিখ", "Cheque date")} *</div><input type="date" value={form.chequeDate} onChange={(e) => setF("chequeDate", e.target.value)} style={{ ...inp, padding: "8px 6px", fontSize: 13 }} /></div>
          <div style={{ gridColumn: "1 / -1", fontSize: 11, color: th.txtSecondary }}>🔔 {L("চেকের তারিখের ৭, ২ আর ১ দিন আগে নোটিফিকেশন আসবে", "You'll be reminded 7, 2 and 1 day before the cheque date")}</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><div style={lbl}>{L("কাকে দিলেন", "Paid to")}</div><input value={form.paidTo} onChange={(e) => setF("paidTo", e.target.value)} style={inp} /></div>
        <div><div style={lbl}>{L("রেফারেন্স / বিল নং", "Ref / Bill No")}</div><input value={form.refNo} onChange={(e) => setF("refNo", e.target.value)} style={inp} /></div>
      </div>
      <div><div style={lbl}>{L("বিবরণ", "Note")}</div>
        <textarea value={form.note} onChange={(e) => setF("note", e.target.value)} rows={2} style={{ ...inp, resize: "none" }} /></div>
    </div>
  );
  const saveBtn = (full) => (
    <button type="button" disabled={saving} onClick={save} style={{ ...btn("linear-gradient(135deg,#16a34a,#15803d)"), padding: full ? "14px" : "10px 22px", fontSize: full ? 16 : 14, width: full ? "100%" : undefined, opacity: saving ? 0.7 : 1, boxShadow: "0 6px 16px rgba(22,163,74,0.35)" }}>
      {saving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${editId ? L("আপডেট করুন", "Update") : L("সেভ করুন", "Save")}`}
    </button>
  );
  const title = editId ? L("✏️ খরচ এডিট", "✏️ Edit Expense") : L("💸 নতুন খরচ", "💸 New Expense");

  return (
    <div style={isDesktop ? s?.desktopPanel : s?.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: isDesktop ? 18 : 17, fontWeight: 900, color: th.txtPrimary }}>💸 {L("দোকানের খরচ", "Shop Expenses")}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {isDesktop && <button type="button" onClick={print} disabled={!active.length} style={btn("transparent", "#3b82f6")}>🖨️ {L("প্রিন্ট", "Print")}</button>}
          <button type="button" onClick={openNew} style={{ ...btn("linear-gradient(135deg,#16a34a,#15803d)"), boxShadow: "0 6px 16px rgba(22,163,74,0.3)" }}>+ {L("নতুন খরচ", "New Expense")}</button>
        </div>
      </div>

      {filters}

      {isDesktop ? (
        <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0,1fr)", gap: 12, alignItems: "start" }}>
          {summary}
          {list}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {summary}
          {list}
          {active.length > 0 && <button type="button" onClick={print} style={{ ...btn("transparent", "#3b82f6"), border: `1px solid ${th.border}` }}>🖨️ {L("তালিকা প্রিন্ট", "Print list")}</button>}
        </div>
      )}

      {form && isDesktop && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setForm(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.65)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ ...card, width: "min(860px, 100%)", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", padding: 0, borderRadius: 18, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${th.border}` }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: th.txtPrimary }}>{title}</div>
              <button type="button" onClick={() => !saving && setForm(null)} style={{ ...btn("transparent", th.txtMuted), padding: "4px 8px", fontSize: 18 }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, padding: 16, overflowY: "auto" }}>
              <div><div style={lbl}>{L("খরচের ধরন", "Expense type")} *</div>{catGrid}</div>
              {fields}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: `1px solid ${th.border}` }}>
              <button type="button" disabled={saving} onClick={() => setForm(null)} style={{ ...btn("transparent", th.txtSecondary), border: `1px solid ${th.border}` }}>{L("বন্ধ", "Close")}</button>
              {saveBtn(false)}
            </div>
          </div>
        </div>
      )}

      {form && !isDesktop && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: th.bgRoot || th.bgCard, display: "flex", flexDirection: "column", height: "100dvh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px", paddingTop: "calc(12px + env(safe-area-inset-top, 0px))", borderBottom: `1px solid ${th.border}`, background: th.bgCard, flexShrink: 0 }}>
            <button type="button" onClick={() => !saving && setForm(null)} style={{ ...btn("transparent", th.txtPrimary), padding: "4px 8px", fontSize: 20 }}>←</button>
            <div style={{ flex: 1, fontSize: 16, fontWeight: 900, color: th.txtPrimary }}>{title}</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gap: 14, alignContent: "start" }}>
            {fields}
            <div><div style={lbl}>{L("খরচের ধরন", "Expense type")} *</div>{catGrid}</div>
          </div>
          <div style={{ flexShrink: 0, padding: "10px 14px", paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${th.border}`, background: th.bgCard, boxShadow: "0 -6px 18px rgba(0,0,0,0.18)" }}>
            {saveBtn(true)}
          </div>
        </div>
      )}
    </div>
  );
}
