import React, { useEffect, useMemo, useRef, useState } from "react";
import { offlineCreate, offlineRemove, offlineUpdate } from "../offline/offlineRepository";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";
import { taxSettingsOf } from "../reports/taxDomain.js";
import { partnerDirectoryOf, matchPartnerName, PARTNER_BLOCKED_EXPENSE_CATEGORIES } from "../partners/partners.js";

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

export const EMPLOYEE_EXPENSE_CATEGORIES = [
  { key: "salary", bn: "বেতন", en: "Salary", icon: "👷" },
  { key: "advance", bn: "অগ্রিম", en: "Advance", icon: "💵" },
  { key: "overtime", bn: "ওভারটাইম", en: "Overtime", icon: "⏱️" },
  { key: "bonus", bn: "বোনাস / কমিশন", en: "Bonus / Commission", icon: "🎁" },
  { key: "allowance", bn: "ভাতা (খাবার/যাতায়াত)", en: "Allowance (food/travel)", icon: "🍱" },
  { key: "visa", bn: "ভিসা / পারমিট", en: "Visa / Permit", icon: "🛂" },
  { key: "ticket", bn: "এয়ার টিকিট", en: "Air ticket", icon: "✈️" },
  { key: "gratuity", bn: "সার্ভিস বেনিফিট / গ্র্যাচুইটি", en: "Gratuity / End of service", icon: "🏁" },
  { key: "medical", bn: "চিকিৎসা / ইনস্যুরেন্স", en: "Medical / Insurance", icon: "🩺" },
  { key: "other", bn: "অন্যান্য", en: "Other", icon: "🧾" },
];

const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...EMPLOYEE_EXPENSE_CATEGORIES.filter((c) => !EXPENSE_CATEGORIES.some((x) => x.key === c.key))];

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
  const cat = ALL_CATEGORIES.find((c) => c.key === row?.category);
  if (cat && cat.key !== "other") return `${cat.icon} ${bn ? cat.bn : cat.en}`;
  return `🧾 ${row?.categoryName || (bn ? "অন্যান্য" : "Other")}`;
}

// vatAuto: the VAT box follows the amount until the user types their own VAT figure.
const emptyForm = (forEmployee = false) => ({ expenseDate: localDay(), category: forEmployee ? "salary" : "rent", categoryName: "", employeeId: "", forMonth: forEmployee ? localDay().slice(0, 7) : "", amount: "", method: "cash", paidTo: "", refNo: "", note: "", chequeNo: "", chequeBank: "", chequeDate: localDay(), hasVat: false, vatAmount: "", vatAuto: true, supplierTrn: "", partnerId: "", partnerUse: "", partnerPaid: "shop", enteredBy: "" });
const ENTERED_BY_KEY = "s4_expense_entered_by";

export default function ExpensesTab({ lang = "en", th, s, shopId, user, profile, isOwner, cur = "AED", isDesktop, toast, shopName = "", leaveGuard = null, shop = null, employeeMode = false }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const taxCfg = useMemo(() => taxSettingsOf(shop), [shop]);
  const tn = taxCfg.taxName || "VAT";
  const vatRate = Math.max(0, n(taxCfg.rate));
  const vatOn = taxCfg.taxApplicable !== "none" && vatRate > 0;
  const autoVat = (amount) => (vatRate > 0 && n(amount) > 0 ? String(r2((n(amount) * vatRate) / (100 + vatRate))) : "");
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localDay());
  const [catFilter, setCatFilter] = useState("");
  const [empFilter, setEmpFilter] = useState("");
  const [employees, setEmployees] = useState([]);
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

  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName: "employees", shopId, onRows: (list) => setEmployees((list || []).filter((e) => e && !e.isDeleted && e.shopId === shopId)) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId]);

  const activeEmployees = useMemo(() => employees.filter((e) => e.status !== "inactive").sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))), [employees]);
  const empName = (id, fallback = "") => employees.find((e) => e.id === id)?.name || fallback;
  const partnerDirectory = useMemo(() => partnerDirectoryOf(shop), [shop]);
  const partnerName = (id, fallback = "") => partnerDirectory.find((p) => p.id === id)?.name || fallback;
  // Partners share the owner login, so the login alone can't tell which of them wrote the entry.
  const showEnteredBy = isOwner && partnerDirectory.length > 0;
  const byName = (r) => r.enteredByName || r.createdByName || "";

  const mine = useMemo(() => rows.filter((r) => r && !r.isDeleted && r.shopId === shopId && (isOwner || r.createdBy === user?.uid) && (!employeeMode || r.employeeId)), [rows, shopId, isOwner, user?.uid, employeeMode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mine
      .filter((r) => (showCancelled || r.status !== "cancelled"))
      .filter((r) => (!from || String(r.expenseDate) >= from) && (!to || String(r.expenseDate) <= to))
      .filter((r) => !catFilter || r.category === catFilter)
      .filter((r) => !empFilter || r.employeeId === empFilter)
      .filter((r) => !q || [r.expenseNo, r.paidTo, r.note, r.refNo, r.categoryName, r.employeeName].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a, b) => String(b.expenseDate).localeCompare(String(a.expenseDate)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }, [mine, from, to, catFilter, empFilter, search, showCancelled]);

  const active = filtered.filter((r) => r.status !== "cancelled");
  const total = active.reduce((t, r) => t + n(r.amount), 0);
  const vatTotal = active.reduce((t, r) => t + n(r.vatAmount), 0);
  const showVat = vatOn || mine.some((r) => n(r.vatAmount) > 0);
  const byCategory = useMemo(() => {
    const map = new Map();
    active.forEach((r) => {
      const label = expenseCategoryLabel(r, bn);
      const cur0 = map.get(label) || { amt: 0, key: ALL_CATEGORIES.some((c) => c.key === r.category) ? r.category : "other" };
      cur0.amt += n(r.amount);
      map.set(label, cur0);
    });
    return [...map.entries()].map(([label, v]) => [label, v.amt, v.key]).sort((a, b) => b[1] - a[1]);
  }, [active, bn]);
  const byEmployee = useMemo(() => {
    const map = new Map();
    active.forEach((r) => {
      if (!r.employeeId) return;
      const cur0 = map.get(r.employeeId) || { amt: 0, advance: 0, name: empName(r.employeeId, r.employeeName || "") };
      cur0.amt += n(r.amount);
      if (r.category === "advance") cur0.advance += n(r.amount);
      map.set(r.employeeId, cur0);
    });
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.amt - a.amt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, employees]);

  const nextNo = () => {
    const mx = rows.reduce((m, r) => { const x = String(r.expenseNo || "").match(/EXP-?(\d+)$/i); return x ? Math.max(m, Number(x[1])) : m; }, 0);
    return `EXP-${String(mx + 1).padStart(4, "0")}`;
  };

  const lastEnteredBy = () => { try { const id = localStorage.getItem(`${ENTERED_BY_KEY}:${shopId}`) || ""; return partnerDirectory.some((p) => p.id === id) ? id : ""; } catch { return ""; } };
  const openNew = () => { const f = { ...emptyForm(employeeMode), employeeId: employeeMode ? empFilter : "", enteredBy: showEnteredBy ? lastEnteredBy() : "" }; if (f.employeeId) f.paidTo = empName(f.employeeId); setEditId(null); setForm(f); setBaseline(JSON.stringify(f)); };
  const openEdit = (r) => {
    const f = { expenseDate: r.expenseDate || localDay(), category: r.category || "other", categoryName: r.categoryName || "", employeeId: r.employeeId || "", forMonth: r.forMonth || "", amount: String(r.amount ?? ""), method: !r.method || r.method === "partner" ? "cash" : r.method, paidTo: r.paidTo || "", refNo: r.refNo || "", note: r.note || "", chequeNo: r.chequeNo || "", chequeBank: r.chequeBank || "", chequeDate: r.chequeDate || r.expenseDate || localDay(), hasVat: n(r.vatAmount) > 0, vatAmount: n(r.vatAmount) > 0 ? String(r.vatAmount) : "", vatAuto: false, supplierTrn: r.supplierTrn || "", partnerId: r.partnerId || "", partnerUse: r.partnerId ? "shop" : "", partnerPaid: r.paidByPartner ? "own" : "shop", enteredBy: r.enteredBy || "" };
    setEditId(r.id);
    setForm(f);
    setBaseline(JSON.stringify(f));
  };

  // Salary is always paid to someone, so the general Expenses window asks for the employee too.
  const usesEmployeeCats = (f) => employeeMode || (!!f?.employeeId && !EXPENSE_CATEGORIES.some((c) => c.key === f.category));
  const showsEmployee = (f) => !!f && (usesEmployeeCats(f) || f.category === "salary");

  const enteredByFields = (prev = {}) => {
    if (!form.enteredBy) return { enteredBy: prev.enteredBy || "", enteredByName: prev.enteredByName || "" };
    try { localStorage.setItem(`${ENTERED_BY_KEY}:${shopId}`, form.enteredBy); } catch { /* storage blocked */ }
    return { enteredBy: form.enteredBy, enteredByName: partnerName(form.enteredBy, prev.enteredByName || "") };
  };

  // A partner taking money for themselves is a drawing: it comes off their profit share and never lowers the profit.
  const saveAsDrawing = async () => {
    const amount = r2(form.amount);
    if (!(amount > 0)) { toast?.(L("❌ সঠিক টাকার পরিমাণ লিখুন", "❌ Enter a valid amount"), "err"); return; }
    if (showEnteredBy && !form.enteredBy) { toast?.(L("❌ খরচের হিসাব কে লিখছেন, বাছুন", "❌ Pick who is entering this expense"), "err"); return; }
    if (!isOwner) { toast?.(L("❌ এটা খরচ নয়। পার্টনার নিজের জন্য নিলে মালিক পার্টনার পাতায় \"অগ্রিম তোলা\" লিখবেন — মালিককে জানান।", "❌ This isn't an expense. When a partner takes money for themselves the owner records a drawing on the Partners page — tell the owner."), "err"); return; }
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const payload = {
        shopId, kind: "drawing", partnerId: form.partnerId, partnerName: partnerName(form.partnerId), amount, date: form.expenseDate, method: form.method,
        refNo: [form.refNo.trim(), form.method === "cheque" ? form.chequeNo.trim() : ""].filter(Boolean).join(" · "), note: form.note.trim(), status: "active",
        ...enteredByFields(), createdBy: user?.uid || "", createdByName: profile?.personName || "", createdAt: nowIso, updatedAt: nowIso, updatedBy: user?.uid || "",
      };
      const res = await offlineCreate("partnerEntries", payload);
      logAudit({ shopId, user, profile, action: "create", collection: "partnerEntries", docId: res.documentId, docNo: "Drawing", amount, note: payload.partnerName });
      if (editRow && editRow.status !== "cancelled") {
        const patch = { status: "cancelled", cancelledAt: nowIso, cancelledBy: user?.uid || "", cancelReason: "Moved to partner drawing", updatedAt: nowIso, updatedBy: user?.uid || "" };
        await offlineUpdate("expenses", editRow.id, { ...editRow, ...patch });
        setRows((list) => list.map((r) => (r.id === editRow.id ? { ...r, ...patch } : r)));
        logAudit({ shopId, user, profile, action: "cancel", collection: "expenses", docId: editRow.id, docNo: editRow.expenseNo, amount: editRow.amount, note: "Moved to partner drawing" });
      }
      toast?.(L(`✅ ${payload.partnerName}-এর অগ্রিম তোলা হিসেবে সেভ হয়েছে (খরচে নয়)`, `✅ Saved as ${payload.partnerName}'s drawing (not an expense)`));
      setForm(null);
      setEditId(null);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (saving || !form) return;
    const amount = r2(form.amount);
    if (!(amount > 0)) { toast?.(L("❌ সঠিক টাকার পরিমাণ লিখুন", "❌ Enter a valid amount"), "err"); return; }
    if (!form.expenseDate) { toast?.(L("❌ তারিখ দিন", "❌ Pick a date"), "err"); return; }
    if (form.category === "other" && !form.categoryName.trim()) { toast?.(L("❌ খরচের ধরন লিখুন", "❌ Type the expense type"), "err"); return; }
    if (showEnteredBy && !form.enteredBy) { toast?.(L("❌ খরচের হিসাব কে লিখছেন, বাছুন", "❌ Pick who is entering this expense"), "err"); return; }
    let partnerId = employeeMode ? "" : form.partnerId;
    if (partnerId && !form.partnerUse) { toast?.(L("❌ পার্টনার টাকাটা কিসের জন্য নিলেন — দোকানের কাজে নাকি নিজের কাজে, বাছুন", "❌ Pick what the partner took the money for — shop work or personal use"), "err"); return; }
    if (partnerId && form.partnerUse === "personal") { await saveAsDrawing(); return; }
    if (partnerId && PARTNER_BLOCKED_EXPENSE_CATEGORIES.has(form.category)) { toast?.(L("❌ পার্টনারের বেতন / অগ্রিম / বোনাস খরচ নয় — এটা লাভ ভাগে আসে। পার্টনার পাতায় লিখুন।", "❌ A partner's salary / advance / bonus isn't an expense — it comes from the profit split. Record it on the Partners page."), "err"); return; }
    if (!partnerId && !employeeMode && !form.employeeId) {
      const hit = matchPartnerName(form.paidTo, partnerDirectory);
      if (hit) {
        if (!window.confirm(L(`"${hit.name}" একজন পার্টনার।\n\nটাকাটা কি দোকানের কাজে খরচ হয়েছে?\nOK = হ্যাঁ, দোকানের খরচ\nCancel = না, ফিরে গিয়ে ঠিক করব`, `"${hit.name}" is a partner.\n\nWas this money spent on shop work?\nOK = yes, a shop expense\nCancel = no, go back and fix it`))) {
          setForm((f) => ({ ...f, partnerId: hit.id, partnerUse: "" }));
          return;
        }
        if (PARTNER_BLOCKED_EXPENSE_CATEGORIES.has(form.category)) { toast?.(L("❌ পার্টনারের বেতন / অগ্রিম / বোনাস খরচ নয় — এটা লাভ ভাগে আসে।", "❌ A partner's salary / advance / bonus isn't an expense — it comes from the profit split."), "err"); return; }
        partnerId = hit.id;
      }
    }
    const ownPocket = !!partnerId && form.partnerPaid === "own";
    const method = ownPocket ? "partner" : form.method;
    const linkEmployee = !partnerId && showsEmployee(form);
    const oldUnlinked = !!editId && !rows.find((r) => r.id === editId)?.employeeId;
    if (linkEmployee && !form.employeeId && (employeeMode || (activeEmployees.length > 0 && !oldUnlinked))) { toast?.(L("❌ কর্মচারী বাছুন", "❌ Pick the employee"), "err"); return; }
    const isCheque = method === "cheque";
    if (isCheque && !form.chequeDate) { toast?.(L("❌ চেকের তারিখ দিন", "❌ Pick the cheque date"), "err"); return; }
    const vatAmount = form.hasVat ? r2(form.vatAmount) : 0;
    if (form.hasVat && !(vatAmount > 0 && vatAmount < amount)) { toast?.(L(`❌ ${tn}-এর পরিমাণ ঠিক করুন — মোট টাকার চেয়ে কম হতে হবে`, `❌ Fix the ${tn} amount — it must be less than the total`), "err"); return; }
    setSaving(true);
    const nowIso = new Date().toISOString();
    const prev = editId ? rows.find((r) => r.id === editId) || {} : {};
    const body = {
      expenseDate: form.expenseDate, category: form.category, categoryName: form.category === "other" ? form.categoryName.trim() : "",
      amount, method, paidTo: form.paidTo.trim() || (partnerId ? partnerName(partnerId) : ""), refNo: form.refNo.trim(), note: form.note.trim(),
      partnerId: partnerId || "", partnerName: partnerId ? partnerName(partnerId, prev.partnerName || "") : "", paidByPartner: ownPocket,
      ...enteredByFields(prev),
      chequeNo: isCheque ? form.chequeNo.trim() : "", chequeBank: isCheque ? form.chequeBank.trim() : "", chequeDate: isCheque ? form.chequeDate : "",
      chequeStatus: isCheque ? (prev.method === "cheque" && prev.chequeStatus && prev.chequeDate === form.chequeDate ? prev.chequeStatus : "pending") : "",
      vatAmount, supplierTrn: form.hasVat ? form.supplierTrn.trim() : "",
      employeeId: linkEmployee ? form.employeeId || "" : "", employeeName: linkEmployee && form.employeeId ? empName(form.employeeId, prev.employeeName || "") : "",
      forMonth: linkEmployee && form.employeeId ? form.forMonth || String(form.expenseDate).slice(0, 7) : "",
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
      { label: "Date" }, { label: "No" }, { label: L("ধরন", "Type") }, { label: employeeMode ? L("কর্মচারী", "Employee") : L("কাকে", "Paid To") },
      { label: L("বিবরণ", "Note") }, { label: L("মাধ্যম", "Mode") },
      ...(showEnteredBy ? [{ label: "By" }] : []),
      ...(showVat ? [{ label: `${tn} (${cur})`, align: "right" }] : []),
      { label: `${L("টাকা", "Amount")} (${cur})`, align: "right" },
    ];
    const body = active.map((r) => [fmtDay(r.expenseDate), r.expenseNo || "", expenseCategoryLabel(r, false).replace(/^\S+\s/, ""), employeeMode ? empName(r.employeeId, r.employeeName || "") : (r.partnerId ? `Partner: ${r.partnerName || r.paidTo || ""}` : r.paidTo || ""), [r.forMonth ? `[${r.forMonth}]` : "", r.note || ""].filter(Boolean).join(" "), r.method === "partner" ? "Partner's pocket" : (METHODS.find((m) => m.key === r.method)?.en) || r.method || "", ...(showEnteredBy ? [byName(r)] : []), ...(showVat ? [n(r.vatAmount) > 0 ? money(r.vatAmount) : ""] : []), money(r.amount)]);
    printWithSettings(generateStatementHTML({
      shopName, title: employeeMode ? "EMPLOYEE EXPENSE REPORT" : "EXPENSE REPORT",
      subtitle: `${from ? fmtDay(from) : "Start"} — ${to ? fmtDay(to) : "Today"}${empFilter ? ` · ${empName(empFilter)}` : ""}`,
      cols, rows: body, foot: ["", "", "", "", "", ...(showEnteredBy ? [""] : []), "TOTAL", ...(showVat ? [money(vatTotal)] : []), money(total)],
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
  const methodName = (r) => (r.method === "partner" ? L("পার্টনারের পকেট", "Partner's pocket") : (METHODS.find((m) => m.key === r.method)?.[bn ? "bn" : "en"]) || r.method || "");
  const chequeLabel = (st) => (st === "cleared" ? L("ক্লিয়ার", "Cleared") : st === "bounced" ? L("বাউন্স", "Bounced") : L("পেন্ডিং", "Pending"));
  const chequeColor = (st) => (st === "cleared" ? "#15803d" : st === "bounced" ? "#b91c1c" : "#b45309");
  const cashTotal = active.filter((r) => r.method === "cash").reduce((t, r) => t + n(r.amount), 0);
  const pendingCheques = active.filter((r) => r.method === "cheque" && (r.chequeStatus || "pending") === "pending");
  const cancelledCount = filtered.length - active.length;
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setAmount = (v) => setForm((f) => ({ ...f, amount: v, ...(f.hasVat && f.vatAuto ? { vatAmount: autoVat(v) } : {}) }));
  const toggleVat = (on) => setForm((f) => ({ ...f, hasVat: on, vatAuto: true, vatAmount: on ? autoVat(f.amount) : "", supplierTrn: on ? f.supplierTrn : "" }));
  const fField = (label, control, extra) => (
    <div className="si-field" style={extra}><span className="pm-label">{label}</span>{control}</div>
  );

  const toolbar = (
    <div className="si-toolbar">
      <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {employeeMode ? L("কর্মচারীর খরচ", "Employee Expense") : L("নতুন খরচ", "New Expense")}</button>
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
      {showVat && <div className="si-kpi"><span>{L(`${tn} (ফেরত পাবেন)`, `${tn} (claimable)`)}</span><b style={{ color: "#15803d" }}>{money(vatTotal)}</b></div>}
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
        {(employeeMode ? EMPLOYEE_EXPENSE_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c.key} value={c.key}>{c.icon} {bn ? c.bn : c.en}</option>)}
      </select>
      {(employeeMode || employees.length > 0) && (
        <select className="pm-input" style={{ width: mobile ? "100%" : 190 }} value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
          <option value="">{L("সব কর্মচারী", "All employees")}</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.status === "inactive" ? ` (${L("বাদ", "left")})` : ""}</option>)}
        </select>
      )}
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
        <th>{employeeMode ? L("কর্মচারী", "Employee") : L("কাকে", "Paid To")}</th>
        <th>{L("বিবরণ", "Note")}</th>
        <th style={{ width: 92 }}>{L("মাধ্যম", "Mode")}</th>
        <th style={{ width: 120 }}>{L("চেক", "Cheque")}</th>
        {isOwner && <th style={{ width: 90 }}>{L("লিখেছেন", "By")}</th>}
        {showVat && <th style={{ width: 76 }} className="si-num">{tn}</th>}
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
              <td title={r.paidTo || ""}>{r.employeeId ? `👷 ${empName(r.employeeId, r.employeeName || "")}` : r.partnerId ? `🤝 ${r.partnerName || r.paidTo || ""}` : (r.paidTo || "—")}</td>
              <td title={r.note || ""}>{r.forMonth ? `[${r.forMonth}] ` : ""}{r.refNo ? `[${r.refNo}] ` : ""}{r.note || ""}</td>
              <td>{methodName(r)}</td>
              <td>{r.method === "cheque" ? <><span className="si-badge" style={{ color: chequeColor(r.chequeStatus) }}>{chequeLabel(r.chequeStatus)}</span> {fmtDay(r.chequeDate)}</> : ""}</td>
              {isOwner && <td>{byName(r)}</td>}
              {showVat && <td className="si-num">{n(r.vatAmount) > 0 ? money(r.vatAmount) : ""}</td>}
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
          <span>{fmtDay(r.expenseDate)} · {r.expenseNo}{r.employeeId ? ` · 👷 ${empName(r.employeeId, r.employeeName || "")}` : r.partnerId ? ` · 🤝 ${r.partnerName || r.paidTo || ""}` : r.paidTo ? ` · ${r.paidTo}` : ""}{n(r.vatAmount) > 0 ? ` · ${tn} ${money(r.vatAmount)}` : ""}</span>
          <span>
            {cancelled ? <span className="si-badge" style={{ color: "#6b7280" }}>{L("বাতিল", "Cancelled")}</span>
              : r.method === "cheque" ? <span className="si-badge" style={{ color: chequeColor(r.chequeStatus) }}>{L("চেক", "Cheque")} · {chequeLabel(r.chequeStatus)}</span>
                : methodName(r)}
          </span>
        </div>
        {(r.note || (isOwner && byName(r))) && <div className="si-mrow-sub"><span>{r.note}</span>{isOwner && byName(r) && <span>✍️ {byName(r)}</span>}</div>}
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

  const employeeBox = (
    <div className="si-box">
      <table className="pm-table">
        <thead><tr><th>{L("কর্মচারী", "Employee")}</th><th style={{ width: 80 }} className="si-num">{L("অগ্রিম", "Advance")}</th><th style={{ width: 92 }} className="si-num">{L("মোট", "Total")}</th></tr></thead>
        <tbody>
          <tr className={`pm-clickable${!empFilter ? " pm-selected" : ""}`} onClick={() => setEmpFilter("")}>
            <td className="si-strong">{L("সব কর্মচারী", "All employees")}</td><td className="si-num">{money(byEmployee.reduce((t, e) => t + e.advance, 0))}</td><td className="si-num si-strong">{money(total)}</td>
          </tr>
          {byEmployee.map((e) => (
            <tr key={e.id} className={`pm-clickable${empFilter === e.id ? " pm-selected" : ""}`} onClick={() => setEmpFilter(empFilter === e.id ? "" : e.id)}>
              <td>👷 {e.name || "—"}</td>
              <td className="si-num">{e.advance > 0 ? money(e.advance) : ""}</td>
              <td className="si-num">{money(e.amt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!byEmployee.length && <div className="si-empty">{activeEmployees.length ? L("এই সময়ে কোনো খরচ নেই", "No expenses in this period") : L("আগে Employees মাস্টারে কর্মচারী যোগ করুন", "Add employees in the Employees master first")}</div>}
    </div>
  );
  const sideBox = employeeMode ? employeeBox : categoryBox;
  const formPartner = !employeeMode && !!form?.partnerId;
  const formForEmployee = showsEmployee(form) && !formPartner;
  const formOwnPocket = formPartner && form.partnerUse === "shop" && form.partnerPaid === "own";
  const formPersonal = formPartner && form.partnerUse === "personal";
  const paidToPartner = form && !employeeMode && !form.partnerId && !form.employeeId ? matchPartnerName(form.paidTo, partnerDirectory) : null;
  const choice = (active, onClick, label, color) => (
    <button type="button" disabled={readOnly} className={`pm-btn-secondary${active ? " is-active" : ""}`} onClick={onClick} style={active && color ? { borderColor: color, color } : undefined}>{label}</button>
  );
  const partnerBox = form && !employeeMode && (partnerDirectory.length > 0 || form.partnerId) && (
    <div className="si-entry">
      {fField(L("পার্টনার টাকা নিয়েছেন / দিয়েছেন?", "Did a partner take / pay this money?"), (
        <select className="pm-input" disabled={readOnly} value={form.partnerId} onChange={(e) => { const id = e.target.value; setForm((f) => ({ ...f, partnerId: id, partnerUse: id ? (f.partnerId === id ? f.partnerUse : "") : "", partnerPaid: "shop", ...(id && !f.paidTo.trim() ? { paidTo: partnerName(id) } : {}) })); }}>
          <option value="">{L("— না, পার্টনার নয় —", "— No, not a partner —")}</option>
          {(form.partnerId && !partnerDirectory.some((p) => p.id === form.partnerId) ? [...partnerDirectory, { id: form.partnerId, name: editRow?.partnerName || form.partnerId }] : partnerDirectory)
            .map((p) => <option key={p.id} value={p.id}>🤝 {p.name}</option>)}
        </select>
      ))}
      {formPartner && (
        <>
          <span className="pm-label">{L("টাকাটা কিসের জন্য? *", "What was the money for? *")}</span>
          <div className="si-types" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
            {choice(form.partnerUse === "shop", () => setF("partnerUse", "shop"), L("🏪 দোকানের কাজে", "🏪 Shop work"), "#15803d")}
            {choice(form.partnerUse === "personal", () => setF("partnerUse", "personal"), L("👤 নিজের কাজে", "👤 Personal use"), "#b91c1c")}
          </div>
          {form.partnerUse === "shop" && (
            <>
              <span className="pm-label">{L("টাকা কে দিল?", "Whose money paid it?")}</span>
              <div className="si-types" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                {choice(form.partnerPaid === "shop", () => setF("partnerPaid", "shop"), L("💰 দোকানের টাকা থেকে", "💰 The shop's money"))}
                {choice(form.partnerPaid === "own", () => setF("partnerPaid", "own"), L("🫴 পার্টনার নিজের পকেট থেকে", "🫴 Partner's own pocket"))}
              </div>
              <div className="si-hint" style={{ marginLeft: 0, color: "#15803d" }}>
                ✔ {form.partnerPaid === "own"
                  ? L("দোকানের খরচ হিসেবে সেভ হবে। দোকানের নগদ বা ব্যাংক থেকে টাকা কমবে না, আর এই টাকা পার্টনারের পাওনায় যোগ হবে — পরে তাকে ফেরত দেবেন।", "Saved as a shop expense. The shop's cash or bank doesn't go down, and the amount is added to what the business owes the partner — pay it back later.")
                  : L("দোকানের খরচ হিসেবে সেভ হবে, সাথে লেখা থাকবে কোন পার্টনার খরচ করেছেন।", "Saved as a shop expense, noting which partner spent it.")}
              </div>
              {PARTNER_BLOCKED_EXPENSE_CATEGORIES.has(form.category) && <div className="si-hint" style={{ marginLeft: 0, color: "#b91c1c" }}>⛔ {L("পার্টনারের বেতন / অগ্রিম / বোনাস খরচ নয় — এটা লাভ ভাগে আসে। অন্য খরচের ধরন বাছুন।", "A partner's salary / advance / bonus isn't an expense — it comes from the profit split. Pick another expense type.")}</div>}
            </>
          )}
          {formPersonal && (
            <div className="si-hint" style={{ marginLeft: 0, color: "#b91c1c" }}>
              ⛔ {L("নিজের কাজে নেওয়া টাকা দোকানের খরচ নয়, তাই খরচে সেভ হবে না।", "Money taken for personal use is not a shop expense, so it won't be saved as one.")}{" "}
              {isOwner
                ? L("নিচের বোতামে এটা পার্টনারের \"অগ্রিম তোলা\" হিসেবে সেভ হবে — তার লাভের ভাগ থেকে কেটে যাবে।", "The button below saves it as the partner's drawing — it comes off their profit share.")
                : L("মালিককে জানান, তিনি পার্টনার পাতায় \"অগ্রিম তোলা\" হিসেবে লিখবেন।", "Tell the owner — they record it as a drawing on the Partners page.")}
            </div>
          )}
        </>
      )}
    </div>
  );

  const catGrid = form && (
    <div className="si-types" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
      {(usesEmployeeCats(form) ? EMPLOYEE_EXPENSE_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
        <button key={c.key} type="button" disabled={readOnly} className={`pm-btn-secondary${form.category === c.key ? " is-active" : ""}`} onClick={() => setForm((f) => ({ ...f, category: c.key, ...(c.key === "salary" && !f.forMonth ? { forMonth: String(f.expenseDate || localDay()).slice(0, 7) } : {}) }))}>
          {c.icon} {bn ? c.bn : c.en}
        </button>
      ))}
    </div>
  );

  const fields = form && (
    <div className="si-panel-body" style={{ gap: 6 }}>
      {showEnteredBy && fField(`✍️ ${L("খরচের হিসাব কে লিখছেন?", "Who is entering this expense?")} *`, (
        <select className="pm-input" disabled={readOnly} value={form.enteredBy} onChange={(e) => setF("enteredBy", e.target.value)} style={!form.enteredBy ? { borderColor: "#b45309" } : undefined}>
          <option value="">{L("— বাছুন —", "— Pick —")}</option>
          {(form.enteredBy && !partnerDirectory.some((p) => p.id === form.enteredBy) ? [...partnerDirectory, { id: form.enteredBy, name: editRow?.enteredByName || form.enteredBy }] : partnerDirectory)
            .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ))}
      {formForEmployee && (
        <div className="si-grid2">
          {fField(`${L("কর্মচারী", "Employee")} *`, (
            <select className="pm-input" disabled={readOnly} value={form.employeeId} onChange={(e) => { const id = e.target.value; setForm((f) => ({ ...f, employeeId: id, paidTo: id ? empName(id) : f.paidTo })); }}>
              <option value="">{L("— বাছুন —", "— Pick —")}</option>
              {(form.employeeId && !activeEmployees.some((e) => e.id === form.employeeId) ? [...activeEmployees, { id: form.employeeId, name: empName(form.employeeId, editRow?.employeeName || form.employeeId) }] : activeEmployees)
                .map((e) => <option key={e.id} value={e.id}>{e.name}{e.designation ? ` · ${e.designation}` : ""}</option>)}
            </select>
          ))}
          {fField(L("কোন মাসের", "For month"), <input type="month" className="pm-input" disabled={readOnly} value={form.forMonth} onChange={(e) => setF("forMonth", e.target.value)} />)}
        </div>
      )}
      {formForEmployee && !activeEmployees.length && <div className="si-hint" style={{ marginLeft: 0 }}>⚠️ {L("কোনো কর্মচারী নেই — আগে Employees মাস্টারে যোগ করুন", "No employees yet — add them in the Employees master first")}</div>}
      <div className="si-grid2">
        {fField(`${L("টাকা", "Amount")} (${cur}) *`, <input autoFocus={!mobile && !readOnly} className="pm-input" inputMode="decimal" disabled={readOnly} value={form.amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} style={{ fontWeight: 700, color: "#b91c1c" }} />)}
        {fField(`${L("তারিখ", "Date")} *`, <input type="date" className="pm-input" disabled={readOnly} value={form.expenseDate} onChange={(e) => setF("expenseDate", e.target.value)} />)}
      </div>
      {(vatOn || form.hasVat) && (
        <div className="si-entry">
          <label className="pm-check" style={{ fontWeight: 700 }}>
            <input type="checkbox" disabled={readOnly} checked={form.hasVat} onChange={(e) => toggleVat(e.target.checked)} />
            {L(`এই বিলে ${tn} আছে (Tax Invoice পেয়েছি)`, `This bill includes ${tn} (I have a tax invoice)`)}
          </label>
          {form.hasVat && (
            <>
              <div className="si-grid2">
                {fField(`${tn} (${cur}) *`, <input className="pm-input" inputMode="decimal" disabled={readOnly} value={form.vatAmount} placeholder="0.00" onChange={(e) => setForm((f) => ({ ...f, vatAmount: e.target.value, vatAuto: false }))} style={{ fontWeight: 700, color: "#15803d" }} />)}
                {fField(L("সাপ্লায়ারের TRN", "Supplier TRN"), <input className="pm-input" disabled={readOnly} value={form.supplierTrn} onChange={(e) => setF("supplierTrn", e.target.value)} placeholder={L("বিলে লেখা থাকে", "Printed on the bill")} />)}
              </div>
              <div className="si-hint" style={{ marginLeft: 0 }}>
                {L(`মোট টাকা ${tn} সহ লিখুন। ${tn} ছাড়া খরচ`, `Enter the total including ${tn}. Cost without ${tn}`)}: <b>{cur} {money(n(form.amount) - n(form.vatAmount))}</b>
                {!readOnly && vatRate > 0 && !form.vatAuto && <> · <button type="button" style={{ background: "none", border: 0, padding: 0, color: "#2563eb", cursor: "pointer" }} onClick={() => setForm((f) => ({ ...f, vatAmount: autoVat(f.amount), vatAuto: true }))}>{L(`${vatRate}% দিয়ে হিসাব করুন`, `Work out at ${vatRate}%`)}</button></>}
                <br />{L(`এই ${tn} ট্যাক্স পেজের "ক্রয়ের ${tn}"-এ যোগ হবে, সরকারকে কম দিতে হবে।`, `This ${tn} is added to "Input ${tn}" on the Tax page, so you pay the government less.`)}
              </div>
            </>
          )}
        </div>
      )}
      {form.category === "other" && fField(`${L("খরচের ধরন", "Expense type")} *`, <input className="pm-input" disabled={readOnly} value={form.categoryName} onChange={(e) => setF("categoryName", e.target.value)} placeholder={L("যেমন: পরিষ্কার", "e.g. Cleaning")} />)}
      {partnerBox}
      {!formOwnPocket && fField(L("কীভাবে দিলেন", "Paid by"), (
        <div className="si-types" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
          {METHODS.map((m) => (
            <button key={m.key} type="button" disabled={readOnly} className={`pm-btn-secondary${form.method === m.key ? " is-active" : ""}`} onClick={() => setF("method", m.key)}>{bn ? m.bn : m.en}</button>
          ))}
        </div>
      ))}
      {form.method === "cheque" && !formOwnPocket && (
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
      {paidToPartner && !readOnly && (
        <div className="si-hint" style={{ marginLeft: 0, color: "#b45309" }}>
          ⚠️ {L(`"${paidToPartner.name}" একজন পার্টনার। তিনি টাকা নিয়ে থাকলে পার্টনার বাছুন — নিজের কাজে নিলে এটা খরচ নয়।`, `"${paidToPartner.name}" is a partner. If they took the money, pick the partner — personal use is not an expense.`)}{" "}
          <button type="button" style={{ background: "none", border: 0, padding: 0, color: "#2563eb", cursor: "pointer", fontWeight: 700 }} onClick={() => setForm((f) => ({ ...f, partnerId: paidToPartner.id, partnerUse: "", partnerPaid: "shop" }))}>{L("পার্টনার বাছুন", "Pick partner")}</button>
        </div>
      )}
      {fField(L("বিবরণ", "Note"), <textarea className="pm-input" disabled={readOnly} rows={2} value={form.note} onChange={(e) => setF("note", e.target.value)} style={{ height: mobile ? 64 : 44 }} />)}
      {editRow && (
        <div className="si-hint" style={{ marginLeft: 0 }}>
          {editRow.expenseNo}{byName(editRow) ? ` · ${L("লিখেছেন", "By")} ${byName(editRow)}` : ""}
          {editRow.status === "cancelled" ? ` · ${L("বাতিল করা হয়েছে", "Cancelled")}` : ""}
        </div>
      )}
    </div>
  );

  const title = !editRow ? (employeeMode ? L("👷 কর্মচারীর খরচ", "👷 Employee Expense") : L("💸 নতুন খরচ", "💸 New Expense")) : readOnly ? `🧾 ${editRow.expenseNo}` : `✏️ ${L("খরচ এডিট", "Edit Expense")} — ${editRow.expenseNo}`;
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
            <button type="button" className="pm-btn pm-btn--primary" disabled={saving || (formPersonal && !isOwner)} onClick={save}>
              {saving ? L("সেভ হচ্ছে…", "Saving…") : formPersonal ? `👛 ${L("অগ্রিম তোলা হিসেবে সেভ", "Save as partner drawing")}` : `💾 ${editRow ? L("আপডেট", "Update") : L("সেভ", "Save")} (Ctrl+S)`}
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
        <strong>{employeeMode ? `👷 ${L("কর্মচারীর খরচ", "Employee Expenses")}` : `💸 ${L("দোকানের খরচ", "Shop Expenses")}`}</strong>
        <span>{from ? fmtDay(from) : L("শুরু", "Start")} — {to ? fmtDay(to) : L("আজ", "Today")}</span>
      </div>
      {toolbar}
      {kpis}
      {filterBar}
      {mobile ? (
        <div className="si-main is-all">
          <div className="si-box">{filtered.length ? listMobile : emptyBox}</div>
          {(employeeMode ? byEmployee.length : byCategory.length) > 0 && <div style={{ marginTop: 6 }}>{sideBox}</div>}
        </div>
      ) : (
        <div className="si-main">
          {sideBox}
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
