import React, { useEffect, useMemo, useRef, useState } from "react";
import { offlineCreate, offlineList, offlineRemove, offlineUpdate } from "../offline/offlineRepository";
import { readDocFile, readProfilePhoto, openDocFile } from "../utils/docFiles.js";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";
import { openLink } from "../utils/openLink.js";
import { saveShopRecord } from "../offline/shopService";
import { computeAccounts } from "../reports/accountsCalc.js";
import {
  r2, addDays, PARTNER_TYPES, FREQUENCIES, ENTRY_KINDS, PAY_METHODS, partnerSettingsOf, periodOf, endedPeriods, periodLabel,
  distributionsOf, liveEntries, partnerLedger, computeDistribution, partnerAlertText, partnerDirectoryFrom, partnerDirectoryOf,
  PARTNER_FIELDS, PARTNER_SECTIONS, PARTNER_DOC_TYPES,
} from "./partners.js";

const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const emptyPartner = () => ({ ...Object.fromEntries(PARTNER_FIELDS.map((f) => [f.k, f.def ?? ""])), joinDate: localDay(), photo: "" });
const PARTNER_KEYS = [...PARTNER_FIELDS.map((f) => f.k), "photo"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function PartnersTab({ lang = "en", shopId, user, profile, cur = "AED", toast, shopName = "", shop = null, onShopUpdated, products = [], alerts = [], isOwner = false }) {
  const bn = lang === "bn";
  if (!isOwner) {
    return (
      <div className="pm-card" style={{ padding: 16 }}>
        {bn ? "পার্টনার ও লাভ-ভাগ শুধু মালিক দেখতে পারেন।" : "Partners and profit sharing are owner-only."}
      </div>
    );
  }
  const L = (b, e) => (bn ? b : e);
  const settings = partnerSettingsOf(shop);
  const today = localDay();
  const [partners, setPartners] = useState([]);
  const [entries, setEntries] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [docs, setDocs] = useState([]);
  const [section, setSection] = useState("basic");
  const [docForm, setDocForm] = useState(null);
  const photoRef = useRef(null);
  const docFileRef = useRef(null);
  const [view, setView] = useState("partners");
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [entryForm, setEntryForm] = useState(null);
  const [settingsForm, setSettingsForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stmtId, setStmtId] = useState("");
  const [showLeft, setShowLeft] = useState(false);
  const [acctData, setAcctData] = useState(null);
  const [range, setRange] = useState(() => endedPeriods(localDay(), partnerSettingsOf(shop), 1)[0]);
  const [profitOverride, setProfitOverride] = useState("");
  const [reservePct, setReservePct] = useState(String(settings.reservePct || ""));
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    if (!shopId) return undefined;
    const u1 = subscribeShopCollection({ collectionName: "partners", shopId, onRows: (l) => setPartners(l || []) });
    const u2 = subscribeShopCollection({ collectionName: "partnerEntries", shopId, onRows: (l) => setEntries(l || []) });
    const u3 = subscribeShopCollection({ collectionName: "expenses", shopId, onRows: (l) => setExpenses(l || []) });
    const u4 = subscribeShopCollection({ collectionName: "partnerDocs", shopId, onRows: (l) => setDocs(l || []) });
    return () => { try { u1?.(); u2?.(); u3?.(); u4?.(); } catch { /* ignore */ } };
  }, [shopId]);

  useEffect(() => {
    if (view !== "profit" || acctData) return undefined;
    let cancelled = false;
    Promise.all([loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses")])
      .then(([rows, rc, pm, ex]) => { if (!cancelled) setAcctData({ ...rows, receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex) }); })
      .catch((e) => console.warn("[S4 partners] load accounts failed", e));
    return () => { cancelled = true; };
  }, [view, acctData]);

  const all = useMemo(() => partners.filter((p) => p && !p.isDeleted && p.shopId === shopId), [partners, shopId]);
  const activeList = all.filter((p) => p.status !== "inactive");
  const shown = (showLeft ? all : activeList).slice().sort((a, b) => n(b.sharePercent) - n(a.sharePercent) || String(a.name).localeCompare(String(b.name)));
  const myEntries = useMemo(() => liveEntries(entries, shopId), [entries, shopId]);
  const ledgers = useMemo(() => new Map(all.map((p) => [p.id, partnerLedger(p.id, entries, shopId, expenses)])), [all, entries, shopId, expenses]);

  const directory = useMemo(() => partnerDirectoryFrom(all, shopId), [all, shopId]);
  const dirKey = JSON.stringify(directory);
  useEffect(() => {
    if (!shopId || !all.length || dirKey === JSON.stringify(partnerDirectoryOf(shop))) return;
    saveShopRecord(shopId, { partnerDirectory: directory }, { ownerUid: user?.uid, profile, user })
      .then((updated) => onShopUpdated?.(updated))
      .catch((e) => console.warn("[S4 partners] directory save failed", e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, dirKey, all.length]);
  const dists = useMemo(() => distributionsOf(entries, shopId).sort((a, b) => String(b.periodTo).localeCompare(String(a.periodTo))), [entries, shopId]);
  const shareTotal = r2(activeList.reduce((t, p) => t + n(p.sharePercent), 0));
  const capitalTotal = r2(activeList.reduce((t, p) => t + (ledgers.get(p.id)?.capital || 0), 0));
  const payableTotal = r2(activeList.reduce((t, p) => t + Math.max(0, ledgers.get(p.id)?.current || 0), 0));
  const nameOf = (id) => all.find((p) => p.id === id)?.name || "—";
  const stamp = () => ({ updatedAt: new Date().toISOString(), updatedBy: user?.uid || "" });
  const syncSoon = () => { if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {}); };

  const savePartner = async () => {
    const f = form;
    const name = f.name.trim();
    const fail = (sec, msg) => { setSection(sec); toast?.(msg, "err"); };
    if (!name) { fail("basic", L("❌ পার্টনারের নাম লিখুন", "❌ Enter the partner's name")); return; }
    if (!(n(f.sharePercent) > 0) || n(f.sharePercent) > 100) { fail("money", L("❌ লাভের শেয়ার % দিন (১–১০০)", "❌ Enter the profit share % (1–100)")); return; }
    const others = activeList.filter((p) => p.id !== editId).reduce((t, p) => t + n(p.sharePercent), 0);
    if (f.status !== "inactive" && others + n(f.sharePercent) > 100.001) { fail("money", L(`❌ মোট শেয়ার ১০০% ছাড়িয়ে যাচ্ছে (অন্যদের ${r2(others)}%)`, `❌ Total share goes over 100% (others have ${r2(others)}%)`)); return; }
    if (f.status === "inactive" && !f.leftDate) { fail("basic", L("❌ কবে চলে গেছেন সেই তারিখ দিন", "❌ Pick the leaving date")); return; }
    setBusy(true);
    try {
      const body = { ...Object.fromEntries(PARTNER_KEYS.map((k) => [k, typeof f[k] === "string" ? f[k].trim() : f[k]])), name, sharePercent: r2(f.sharePercent), lossPercent: f.lossPercent === "" ? "" : r2(f.lossPercent), ...stamp() };
      if (editId) {
        const prev = all.find((p) => p.id === editId);
        await offlineUpdate("partners", editId, { ...prev, ...body });
        setPartners((l) => l.map((p) => (p.id === editId ? { ...p, ...body } : p)));
        logAudit({ shopId, user, profile, action: "update", collection: "partners", docId: editId, docNo: name, note: `${body.sharePercent}%` });
      } else {
        const payload = { shopId, ...body, createdBy: user?.uid || "", createdAt: new Date().toISOString() };
        const res = await offlineCreate("partners", payload);
        setPartners((l) => [...l, { ...payload, id: res.documentId }]);
        logAudit({ shopId, user, profile, action: "create", collection: "partners", docId: res.documentId, docNo: name, note: `${body.sharePercent}%` });
        setEditId(res.documentId);
        setSection("docs");
        toast?.(L("✅ পার্টনার সেভ হয়েছে — এখন আইডি, চুক্তিপত্র ইত্যাদির ছবি যোগ করুন", "✅ Partner saved — now attach the ID, agreement and other papers"));
        syncSoon();
        return;
      }
      setForm(null); setEditId(null);
      toast?.(L("✅ পার্টনার সেভ হয়েছে", "✅ Partner saved"));
      syncSoon();
    } catch (e) { toast?.(`❌ ${e?.message || e}`, "err"); } finally { setBusy(false); }
  };

  const openPartner = (p) => {
    setForm(p ? { ...emptyPartner(), ...Object.fromEntries(PARTNER_KEYS.map((k) => [k, p[k] == null ? "" : String(p[k])])) } : emptyPartner());
    setEditId(p ? p.id : null);
    setSection("basic");
    setDocForm(null);
  };

  // ── photo & documents ──
  const pickPhoto = async (file) => {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) { toast?.(L("❌ শুধু ছবি দেওয়া যাবে", "❌ Only images"), "err"); return; }
    try { const data = await readProfilePhoto(file); setForm((f) => ({ ...f, photo: data })); }
    catch { toast?.(L("❌ ছবিটা পড়া গেল না", "❌ Could not read the image"), "err"); }
  };
  const pickDocFile = async (file) => {
    if (!file) return;
    try { const data = await readDocFile(file, L); setDocForm((d) => ({ ...d, file: data, fileName: file.name, fileType: file.type })); }
    catch (e) { toast?.(`❌ ${e?.message || e}`, "err"); }
  };
  const saveDoc = async () => {
    if (!docForm || !editId) return;
    if (!docForm.file) { toast?.(L("❌ ছবি বা PDF বাছুন", "❌ Choose a photo or PDF"), "err"); return; }
    const t = PARTNER_DOC_TYPES.find((x) => x[0] === docForm.docType) || PARTNER_DOC_TYPES[PARTNER_DOC_TYPES.length - 1];
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      const payload = { shopId, partnerId: editId, docType: t[0], label: docForm.label.trim() || (bn ? t[1] : t[2]), number: docForm.number.trim(), expiryDate: docForm.expiryDate || "",
        file: docForm.file, fileName: docForm.fileName || "", fileType: docForm.fileType || "", createdBy: user?.uid || "", createdByName: profile?.personName || "", createdAt: nowIso, updatedAt: nowIso, updatedBy: user?.uid || "" };
      const res = await offlineCreate("partnerDocs", payload);
      setDocs((l) => [...l, { ...payload, id: res.documentId }]);
      logAudit({ shopId, user, profile, action: "create", collection: "partnerDocs", docId: res.documentId, docNo: payload.label, note: nameOf(editId) });
      setDocForm(null);
      toast?.(L("✅ ডকুমেন্ট যোগ হয়েছে", "✅ Document added"));
      syncSoon();
    } catch (e) { toast?.(`❌ ${e?.message || e}`, "err"); } finally { setBusy(false); }
  };
  const deleteDoc = async (d) => {
    if (!window.confirm(L(`"${d.label}" মুছে ফেলবেন?`, `Delete "${d.label}"?`))) return;
    try {
      await offlineRemove("partnerDocs", d.id);
      setDocs((l) => l.filter((x) => x.id !== d.id));
      logAudit({ shopId, user, profile, action: "delete", collection: "partnerDocs", docId: d.id, docNo: d.label, note: nameOf(d.partnerId) });
      syncSoon();
    } catch (e) { toast?.(`❌ ${e?.message || e}`, "err"); }
  };
  const printProfile = () => {
    if (!form) return;
    const lbl = (f) => f.en.replace(/ \*$/, "");
    const val = (f) => {
      const v = form[f.k];
      if (v === "" || v == null) return "";
      if (f.t === "date") return fmtDay(v);
      if (f.opts) return (f.opts.find((o) => o[0] === v) || [])[2] || v;
      if (f.k === "sharePercent" || f.k === "lossPercent" || f.k === "interestRate") return `${v}%`;
      return f.cur ? `${cur} ${money(v)}` : String(v);
    };
    const rowsOut = [];
    PARTNER_SECTIONS.forEach((s) => {
      const list = PARTNER_FIELDS.filter((f) => f.sec === s.key && (!f.show || f.show(form)) && val(f));
      if (!list.length) return;
      rowsOut.push([`— ${s.en.toUpperCase()} —`, ""]);
      list.forEach((f) => rowsOut.push([lbl(f), val(f)]));
    });
    const led = editId ? ledgers.get(editId) : null;
    if (led) rowsOut.push(["— ACCOUNT —", ""], ["Capital", `${cur} ${money(led.capital)}`], ["Profit credited", `${cur} ${money(led.credited)}`], [led.current >= 0 ? "Due to partner" : "Overdrawn", `${cur} ${money(Math.abs(led.current))}`]);
    const partnerPapers = editId ? docs.filter((d) => !d.isDeleted && d.partnerId === editId) : [];
    if (partnerPapers.length) rowsOut.push(["— DOCUMENTS ON FILE —", ""], ...partnerPapers.map((d) => [d.label, [d.number, d.expiryDate ? `exp ${fmtDay(d.expiryDate)}` : ""].filter(Boolean).join(" · ")]));
    printWithSettings(generateStatementHTML({ shopName, title: `PARTNER PROFILE — ${form.name}`, subtitle: `Share ${n(form.sharePercent)}% · ${fmtDay(today)}`, cols: [{ label: "Field" }, { label: "Details" }], rows: rowsOut }), { lang });
  };

  const saveEntry = async () => {
    const f = entryForm;
    const amount = r2(f.amount);
    if (!f.partnerId) { toast?.(L("❌ পার্টনার বাছুন", "❌ Pick a partner"), "err"); return; }
    if (!(amount > 0)) { toast?.(L("❌ সঠিক টাকার পরিমাণ লিখুন", "❌ Enter a valid amount"), "err"); return; }
    if (!f.date) { toast?.(L("❌ তারিখ দিন", "❌ Pick a date"), "err"); return; }
    const led = ledgers.get(f.partnerId);
    if (f.kind === "capitalOut" && amount > (led?.capital || 0) + 0.01 && !window.confirm(L("মূলধনের চেয়ে বেশি ফেরত দিচ্ছেন। তবুও সেভ করবেন?", "This is more than the partner's capital. Save anyway?"))) return;
    if ((f.kind === "payout" || f.kind === "reinvest") && amount > Math.max(0, led?.current || 0) + 0.01 && !window.confirm(L(`পাওনা লাভ ${cur} ${money(Math.max(0, led?.current || 0))}। এর বেশি দিলে বাকিটা অগ্রিম ধরা হবে। সেভ করবেন?`, `Profit due is ${cur} ${money(Math.max(0, led?.current || 0))}. Anything above it counts as an advance. Save?`))) return;
    setBusy(true);
    try {
      const payload = { shopId, kind: f.kind, partnerId: f.partnerId, partnerName: nameOf(f.partnerId), amount, date: f.date, method: ENTRY_KINDS[f.kind].cash ? f.method : "", refNo: f.refNo.trim(), note: f.note.trim(), status: "active", createdBy: user?.uid || "", createdByName: profile?.personName || "", createdAt: new Date().toISOString(), ...stamp() };
      const res = await offlineCreate("partnerEntries", payload);
      setEntries((l) => [...l, { ...payload, id: res.documentId }]);
      logAudit({ shopId, user, profile, action: "create", collection: "partnerEntries", docId: res.documentId, docNo: ENTRY_KINDS[f.kind].en, amount, note: payload.partnerName });
      setEntryForm(null);
      toast?.(L("✅ লেনদেন সেভ হয়েছে", "✅ Entry saved"));
      syncSoon();
    } catch (e) { toast?.(`❌ ${e?.message || e}`, "err"); } finally { setBusy(false); }
  };

  const cancelEntry = async (e) => {
    if (!window.confirm(L("এই লেনদেন বাতিল করবেন? হিসাব থেকে বাদ যাবে।", "Cancel this entry? It drops out of the accounts."))) return;
    try {
      const patch = { status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: user?.uid || "", ...stamp() };
      await offlineUpdate("partnerEntries", e.id, { ...e, ...patch });
      setEntries((l) => l.map((x) => (x.id === e.id ? { ...x, ...patch } : x)));
      logAudit({ shopId, user, profile, action: "cancel", collection: "partnerEntries", docId: e.id, docNo: e.kind === "distribution" ? e.label : ENTRY_KINDS[e.kind]?.en, amount: e.amount ?? e.distributable, note: e.partnerName || "" });
      syncSoon();
    } catch (err) { toast?.(`❌ ${err?.message || err}`, "err"); }
  };

  const saveSettings = async () => {
    try {
      const next = partnerSettingsOf({ partnerSettings: settingsForm });
      const updated = await saveShopRecord(shopId, { partnerSettings: next }, { ownerUid: user?.uid, profile, user });
      onShopUpdated?.(updated);
      setSettingsForm(null);
      setRange(endedPeriods(today, next, 1)[0]);
      setReservePct(String(next.reservePct || ""));
      toast?.(L("✅ সেটিং সেভ হয়েছে", "✅ Settings saved"));
    } catch (e) { toast?.(`❌ ${e?.message || e}`, "err"); }
  };

  // ── Profit sharing ──
  const autoProfit = useMemo(() => (acctData && range ? computeAccounts(acctData, { products, shopId, from: range.from, to: range.to, bn }) : null), [acctData, range, products, shopId, bn]);
  const netProfit = profitOverride !== "" ? n(profitOverride) : autoProfit ? r2(autoProfit.netProfit) : null;
  const preview = useMemo(() => (netProfit == null || !range ? null : computeDistribution({ netProfit, partners: all, entries: myEntries, from: range.from, to: range.to, reservePct: n(reservePct) })), [netProfit, range, all, myEntries, reservePct]);
  const overlap = range && dists.find((d) => !(String(d.periodTo) < range.from || String(d.periodFrom) > range.to));
  const periodOptions = useMemo(() => [periodOf(today, settings), ...endedPeriods(today, settings, 8)], [today, settings.frequency, settings.startMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const postDistribution = async () => {
    if (!preview || !range) return;
    if (overlap) { toast?.(L(`❌ এই সময়ের লাভ আগেই ভাগ করা হয়েছে (${overlap.label})`, `❌ Profit for this time is already shared (${overlap.label})`), "err"); return; }
    if (!preview.allocations.length) { toast?.(L("❌ এই সময়ে কোনো পার্টনার নেই", "❌ No partners in this period"), "err"); return; }
    if (range.to > today && !window.confirm(L("এই সময় এখনো শেষ হয়নি। এখনই ভাগ করবেন?", "This period hasn't ended yet. Share it now anyway?"))) return;
    if (!window.confirm(L(`${periodLabel(range, true)}-এর লাভ ${cur} ${money(preview.netProfit)} ভাগ করবেন?`, `Share ${periodLabel(range, false)} profit of ${cur} ${money(preview.netProfit)}?`))) return;
    setBusy(true);
    try {
      const dueBase = range.to < today ? range.to : today;
      const payload = {
        shopId, kind: "distribution", label: periodLabel(range, bn), periodFrom: range.from, periodTo: range.to, dueDate: addDays(dueBase, settings.payoutDays),
        netProfit: preview.netProfit, profitSource: profitOverride !== "" ? "manual" : "accounts", reservePct: n(reservePct), reserve: preview.reserve, salaries: preview.salaries,
        interest: preview.interest, distributable: preview.distributable, unallocated: preview.unallocated, isLoss: preview.isLoss,
        allocations: preview.allocations.map((a) => ({ partnerId: a.partnerId, name: a.name, sharePct: preview.isLoss ? a.lossPct : a.sharePct, frac: r2(a.frac), salary: a.salary, interest: a.interest, share: a.share, total: a.total })),
        status: "active", createdBy: user?.uid || "", createdByName: profile?.personName || "", createdAt: new Date().toISOString(), ...stamp(),
      };
      const res = await offlineCreate("partnerEntries", payload);
      setEntries((l) => [...l, { ...payload, id: res.documentId }]);
      logAudit({ shopId, user, profile, action: "create", collection: "partnerEntries", docId: res.documentId, docNo: `Profit ${payload.label}`, amount: payload.netProfit });
      toast?.(L(`✅ লাভ ভাগ হয়েছে · টাকা দেওয়ার তারিখ ${fmtDay(payload.dueDate)}`, `✅ Profit shared · payout due ${fmtDay(payload.dueDate)}`));
      setProfitOverride("");
      syncSoon();
    } catch (e) { toast?.(`❌ ${e?.message || e}`, "err"); } finally { setBusy(false); }
  };

  // ── Statement ──
  const stmtPartner = all.find((p) => p.id === stmtId) || shown[0] || null;
  const stmt = stmtPartner ? ledgers.get(stmtPartner.id) : null;
  const kindLabel = (k) => (k === "distribution" ? L("লাভ / ক্ষতির ভাগ", "Profit / loss share") : k === "expensePaid" ? L("দোকানের খরচ নিজের পকেট থেকে দিয়েছেন", "Paid a shop expense from own pocket") : (bn ? ENTRY_KINDS[k]?.bn : ENTRY_KINDS[k]?.en) || k);
  const kindIcon = (k) => (k === "distribution" ? "📊" : k === "expensePaid" ? "🧾" : ENTRY_KINDS[k]?.icon || "");
  const printStatement = () => {
    if (!stmtPartner || !stmt) return;
    const cols = [{ label: "Date" }, { label: "Details" }, { label: `Capital (${cur})`, align: "right" }, { label: `Profit a/c (${cur})`, align: "right" }, { label: "Capital bal", align: "right" }, { label: "Profit bal", align: "right" }];
    const rows = stmt.rows.map((r) => [fmtDay(r.date), `${ENTRY_KINDS[r.kind]?.en || (r.kind === "expensePaid" ? "Shop expense paid by partner" : "Profit / loss share")}${r.label ? ` · ${r.label}` : ""}`, r.capital ? money(r.capital) : "", r.current ? money(r.current) : "", money(r.capitalBal), money(r.currentBal)]);
    printWithSettings(generateStatementHTML({
      shopName, title: "PARTNER STATEMENT", subtitle: `${stmtPartner.name} · Share ${n(stmtPartner.sharePercent)}% · As at ${fmtDay(today)}`,
      partyLine: [stmtPartner.mobile, stmtPartner.nationalId ? `ID ${stmtPartner.nationalId}` : ""].filter(Boolean).join(" | "), cols, rows,
      foot: ["", "BALANCE", "", "", money(stmt.capital), money(stmt.current)],
    }), { lang });
  };
  const sendWhatsApp = () => {
    if (!stmtPartner || !stmt) return;
    const phone = String(stmtPartner.mobile || "").replace(/[^\d]/g, "");
    const lastDist = stmt.rows.filter((r) => r.kind === "distribution").slice(-1)[0];
    const text = [
      `${shopName} — ${L("পার্টনার হিসাব", "Partner statement")} (${fmtDay(today)})`,
      `${stmtPartner.name} · ${L("শেয়ার", "Share")} ${n(stmtPartner.sharePercent)}%`,
      `${L("মূলধন", "Capital")}: ${cur} ${money(stmt.capital)}`,
      lastDist ? `${L("শেষ লাভের ভাগ", "Last profit share")} (${lastDist.label}): ${cur} ${money(lastDist.amount)}` : "",
      `${L("মোট পাওয়া লাভ", "Total profit credited")}: ${cur} ${money(stmt.credited)}`,
      `${L("তোলা / দেওয়া", "Taken / paid")}: ${cur} ${money(stmt.drawings + stmt.paid)}`,
      stmt.current >= 0 ? `${L("এখন পাওনা", "Now due to you")}: ${cur} ${money(stmt.current)}${lastDist?.dueDate ? ` (${L("তারিখ", "date")} ${fmtDay(lastDist.dueDate)})` : ""}` : `${L("বেশি তোলা হয়েছে", "Drawn in excess")}: ${cur} ${money(-stmt.current)}`,
    ].filter(Boolean).join("\n");
    openLink(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`);
  };

  // ── UI ──
  const kpi = (label, value, color) => <div className="si-kpi"><span>{label}</span><b style={color ? { color } : undefined}>{value}</b></div>;
  const fField = (label, control, wide) => <div className="si-field" style={wide ? { gridColumn: "1 / -1" } : undefined}><span className="pm-label">{label}</span>{control}</div>;
  const fieldControl = (f) => {
    const set = (v) => setForm((x) => ({ ...x, [f.k]: v }));
    if (f.t === "select") return <select className="pm-input" value={form[f.k]} onChange={(e) => set(e.target.value)}>{f.opts.map((o) => <option key={o[0]} value={o[0]}>{bn ? o[1] : o[2]}</option>)}</select>;
    if (f.t === "textarea") return <textarea className="pm-input" rows={3} style={{ height: 64 }} value={form[f.k]} onChange={(e) => set(e.target.value)} />;
    const type = f.t === "date" ? "date" : f.t === "email" ? "email" : "text";
    const inputMode = f.t === "decimal" ? "decimal" : f.t === "tel" ? "tel" : undefined;
    return <input className="pm-input" type={type} inputMode={inputMode} autoFocus={f.k === "name" && !editId} placeholder={f.ph ? (bn ? f.ph[0] : f.ph[1]) : undefined} value={form[f.k]} onChange={(e) => set(e.target.value)} />;
  };
  const partnerDocs = editId ? docs.filter((d) => d && !d.isDeleted && d.partnerId === editId).sort((a, b) => String(a.docType).localeCompare(String(b.docType))) : [];
  const docsPanel = (
    <div className="si-panel-body" style={{ gap: 6 }}>
      {!editId ? <div className="si-hint" style={{ marginLeft: 0 }}>💡 {L("আগে পার্টনার সেভ করুন, তারপর এখানে আইডি, পাসপোর্ট, চুক্তিপত্র, মূলধন জমার রসিদ, সইয়ের নমুনা ইত্যাদির ছবি বা PDF যোগ করতে পারবেন।", "Save the partner first, then attach photos or PDFs of the ID, passport, agreement, capital receipt, signature specimen and so on.")}</div> : (
        <>
          {!docForm && <button type="button" className="pm-btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => setDocForm({ docType: "nationalId", label: "", number: "", expiryDate: "", file: "", fileName: "", fileType: "" })}>📎 {L("ডকুমেন্ট যোগ করুন", "Add document")}</button>}
          {docForm && (
            <div className="si-entry">
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2, minmax(0,1fr))", gap: 6 }}>
                {fField(L("ধরন", "Type"), <select className="pm-input" value={docForm.docType} onChange={(e) => setDocForm((d) => ({ ...d, docType: e.target.value }))}>{PARTNER_DOC_TYPES.map((t) => <option key={t[0]} value={t[0]}>{bn ? t[1] : t[2]}</option>)}</select>)}
                {fField(L("নাম / বিবরণ", "Label"), <input className="pm-input" value={docForm.label} placeholder={L("যেমন: আইডি সামনের দিক", "e.g. ID front side")} onChange={(e) => setDocForm((d) => ({ ...d, label: e.target.value }))} />)}
                {fField(L("নম্বর", "Number"), <input className="pm-input" value={docForm.number} onChange={(e) => setDocForm((d) => ({ ...d, number: e.target.value }))} />)}
                {fField(L("মেয়াদ শেষ", "Expiry date"), <input type="date" className="pm-input" value={docForm.expiryDate} onChange={(e) => setDocForm((d) => ({ ...d, expiryDate: e.target.value }))} />)}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                <input ref={docFileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(e) => { pickDocFile(e.target.files?.[0]); e.target.value = ""; }} />
                <button type="button" className="pm-btn-secondary" onClick={() => docFileRef.current?.click()}>📷 {L("ছবি / PDF বাছুন", "Choose photo / PDF")}</button>
                {docForm.file && (String(docForm.file).startsWith("data:image") ? <img src={docForm.file} alt="" style={{ height: 48, borderRadius: 4, border: "1px solid #cbd5e1" }} /> : <span>📄 {docForm.fileName}</span>)}
                <span className="si-toolbar-gap" />
                <button type="button" className="pm-btn-secondary" onClick={() => setDocForm(null)}>{L("বাদ", "Cancel")}</button>
                <button type="button" className="pm-btn pm-btn--primary" disabled={busy || !docForm.file} onClick={saveDoc}>💾 {L("ডকুমেন্ট সেভ", "Save document")}</button>
              </div>
              <div className="si-hint" style={{ marginLeft: 0 }}>{L("মোবাইলে ক্যামেরা দিয়ে সরাসরি ছবি তোলা যায়। ছবি নিজে থেকে ছোট করে রাখা হয়, PDF সর্বোচ্চ ১.৫ MB। মেয়াদ দিলে শেষ হওয়ার ৩০ দিন আগে নোটিফিকেশন আসবে।", "On a phone you can take the photo with the camera. Photos are shrunk automatically, PDFs up to 1.5 MB. With an expiry date you get a notification 30 days before.")}</div>
            </div>
          )}
          {!partnerDocs.length && !docForm && <div className="si-empty">{L("এখনো কোনো ডকুমেন্ট নেই", "No documents yet")}</div>}
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))", gap: 6 }}>
            {partnerDocs.map((d) => {
              const left = d.expiryDate ? Math.round((new Date(`${d.expiryDate}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000) : null;
              const isImg = String(d.file || "").startsWith("data:image");
              return (
                <div key={d.id} style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: 4, background: "#fff", display: "flex", flexDirection: "column", gap: 2 }}>
                  <button type="button" onClick={() => openDocFile(d)} style={{ border: 0, padding: 0, background: "#f1f5f9", height: 90, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }} title={L("বড় করে দেখুন", "Open")}>
                    {isImg ? <img src={d.file} alt="" style={{ maxWidth: "100%", maxHeight: 90, objectFit: "contain" }} /> : <span style={{ fontSize: 32 }}>📄</span>}
                  </button>
                  <b style={{ fontSize: 12 }}>{d.label}</b>
                  {d.number && <span className="si-muted" style={{ fontSize: 11 }}>{d.number}</span>}
                  {d.expiryDate && <span style={{ fontSize: 11, fontWeight: 700, color: left < 0 ? "#b91c1c" : left <= 30 ? "#b45309" : "#15803d" }}>{left < 0 ? L("মেয়াদ শেষ", "Expired") : L("মেয়াদ", "Expires")} {fmtDay(d.expiryDate)}</span>}
                  <button type="button" onClick={() => deleteDoc(d)} style={{ border: 0, background: "none", color: "#b91c1c", cursor: "pointer", fontSize: 11, textAlign: "left", padding: 0 }}>🗑️ {L("মুছুন", "Delete")}</button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
  const othersShare = r2(activeList.filter((p) => p.id !== editId).reduce((t, p) => t + n(p.sharePercent), 0));
  const formLed = editId ? ledgers.get(editId) : null;

  const partnerWindow = form && (
    <div className="pm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setForm(null); }}>
      <div className="pm-window" style={{ maxWidth: mobile ? undefined : 820 }}>
        <div className="pm-window-title"><span>🤝 {editId ? form.name || L("পার্টনার", "Partner") : L("নতুন পার্টনার", "New partner")}</span><button type="button" className="pm-window-close" onClick={() => setForm(null)}>✕</button></div>
        <div className="pm-window-body">
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" onClick={() => photoRef.current?.click()} title={L("ছবি দিন", "Set photo")}
              style={{ width: 64, height: 64, borderRadius: "50%", border: "2px solid #cbd5e1", background: "#f1f5f9", overflow: "hidden", cursor: "pointer", padding: 0, fontSize: 28 }}>
              {form.photo ? <img src={form.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "📷"}
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <b>{form.name || L("নতুন পার্টনার", "New partner")}{form.role ? ` · ${form.role}` : ""}</b>
              <span className="si-muted" style={{ fontSize: 12 }}>
                <span className="si-badge">{(PARTNER_TYPES.find((t) => t.key === form.partnerType)?.[bn ? "bn" : "en"] || "").split(" (")[0]}</span>
                {n(form.sharePercent) > 0 ? ` · ${L("শেয়ার", "Share")} ${n(form.sharePercent)}%` : ""}
                {formLed ? ` · ${L("মূলধন", "Capital")} ${cur} ${money(formLed.capital)} · ${formLed.current >= 0 ? L("পাওনা", "Due") : L("বেশি তোলা", "Overdrawn")} ${money(Math.abs(formLed.current))}` : ""}
              </span>
              {form.photo && <button type="button" onClick={() => setForm((f) => ({ ...f, photo: "" }))} style={{ border: 0, background: "none", color: "#b91c1c", cursor: "pointer", fontSize: 11, padding: 0, textAlign: "left" }}>{L("ছবি সরান", "Remove photo")}</button>}
            </div>
          </div>
          <div className="si-pills" style={{ marginBottom: 6, flexWrap: "wrap" }}>
            {PARTNER_SECTIONS.map((s) => <button key={s.key} type="button" className={`pm-btn-secondary${section === s.key ? " is-active" : ""}`} onClick={() => setSection(s.key)}>{s.icon} {bn ? s.bn : s.en}</button>)}
            <button type="button" className={`pm-btn-secondary${section === "docs" ? " is-active" : ""}`} onClick={() => setSection("docs")}>📎 {L("ডকুমেন্ট / ছবি", "Documents")}{editId ? ` (${partnerDocs.length})` : ""}</button>
          </div>
          {section === "docs" ? docsPanel : (
            <div className="si-panel-body" style={{ gap: 6 }}>
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(2, minmax(0,1fr))", gap: 6 }}>
                {PARTNER_FIELDS.filter((f) => f.sec === section && (!f.show || f.show(form))).map((f) => (
                  <React.Fragment key={f.k}>{fField(`${bn ? f.bn : f.en}${f.cur ? ` (${cur})` : ""}`, fieldControl(f), f.wide || f.t === "textarea")}</React.Fragment>
                ))}
              </div>
              {section === "money" && <div className="si-hint" style={{ marginLeft: 0 }}>💡 {L(`অন্য সক্রিয় পার্টনারদের মোট শেয়ার ${othersShare}%। নিজেকেও (মালিক) পার্টনার হিসেবে যোগ করুন, যাতে সবার মোট ১০০% হয়।`, `Other active partners hold ${othersShare}%. Add yourself (the owner) as a partner too so the total is 100%.`)}</div>}
              {section === "id" && <div className="si-hint" style={{ marginLeft: 0 }}>🔔 {L("আইডি, পাসপোর্ট বা রেসিডেন্স আইডির মেয়াদ দিলে শেষ হওয়ার ৩০ দিন আগে নোটিফিকেশন আসবে।", "With an ID, passport or residence ID expiry you get a notification 30 days before.")}</div>}
              {section === "nominee" && <div className="si-hint" style={{ marginLeft: 0 }}>💡 {L("পার্টনারের কিছু হলে তার মূলধন আর পাওনা কে পাবেন — নমিনির তথ্য রাখলে পরে ঝামেলা হয় না।", "If something happens to the partner, the nominee is who receives their capital and dues — keeping it avoids disputes later.")}</div>}
            </div>
          )}
        </div>
        <div className="si-actions si-sticky-actions" style={{ background: "transparent" }}>
          {editId && <button type="button" className="pm-btn-secondary" disabled={busy} onClick={printProfile}>🖨️ {L("প্রোফাইল প্রিন্ট", "Print profile")}</button>}
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn-secondary" disabled={busy} onClick={() => setForm(null)}>{L("বন্ধ", "Close")}</button>
          <button type="button" className="pm-btn pm-btn--primary" disabled={busy} onClick={savePartner}>💾 {L("সেভ", "Save")}</button>
        </div>
      </div>
    </div>
  );

  const entryLed = entryForm?.partnerId ? ledgers.get(entryForm.partnerId) : null;
  const entryWindow = entryForm && (
    <div className="pm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setEntryForm(null); }}>
      <div className="pm-window" style={{ maxWidth: 560 }}>
        <div className="pm-window-title"><span>💵 {L("পার্টনারের লেনদেন", "Partner entry")}</span><button type="button" className="pm-window-close" onClick={() => setEntryForm(null)}>✕</button></div>
        <div className="pm-window-body">
          <div className="si-panel-body" style={{ gap: 6 }}>
            <div className="si-types" style={{ gridTemplateColumns: mobile ? "repeat(2, minmax(0,1fr))" : "repeat(3, minmax(0,1fr))" }}>
              {Object.entries(ENTRY_KINDS).map(([k, x]) => <button key={k} type="button" className={`pm-btn-secondary${entryForm.kind === k ? " is-active" : ""}`} onClick={() => setEntryForm((f) => ({ ...f, kind: k }))}>{x.icon} {bn ? x.bn : x.en}</button>)}
            </div>
            <div className="si-grid2">
              {fField(L("পার্টনার *", "Partner *"), <select className="pm-input" value={entryForm.partnerId} onChange={(e) => { const p = all.find((x) => x.id === e.target.value); setEntryForm((f) => ({ ...f, partnerId: e.target.value, method: p?.payMethod || f.method })); }}><option value="">—</option>{activeList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>)}
              {fField(`${L("টাকা", "Amount")} (${cur}) *`, <input className="pm-input" inputMode="decimal" value={entryForm.amount} onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))} />)}
              {fField(`${L("তারিখ", "Date")} *`, <input type="date" className="pm-input" value={entryForm.date} onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))} />)}
              {ENTRY_KINDS[entryForm.kind].cash && fField(L("মাধ্যম", "Method"), <select className="pm-input" value={entryForm.method} onChange={(e) => setEntryForm((f) => ({ ...f, method: e.target.value }))}>{PAY_METHODS.map((m) => <option key={m[0]} value={m[0]}>{bn ? m[1] : m[2]}</option>)}</select>)}
              {fField(L("রেফারেন্স / চেক নং", "Reference / cheque no"), <input className="pm-input" value={entryForm.refNo} onChange={(e) => setEntryForm((f) => ({ ...f, refNo: e.target.value }))} />)}
              {fField(L("নোট", "Note"), <input className="pm-input" value={entryForm.note} onChange={(e) => setEntryForm((f) => ({ ...f, note: e.target.value }))} />)}
            </div>
            {entryLed && <div className="si-hint" style={{ marginLeft: 0 }}>{L("মূলধন", "Capital")} <b>{cur} {money(entryLed.capital)}</b> · {entryLed.current >= 0 ? L("পাওনা লাভ", "Profit due") : L("বেশি তোলা", "Overdrawn")} <b style={{ color: entryLed.current < 0 ? "#b91c1c" : "#15803d" }}>{cur} {money(Math.abs(entryLed.current))}</b></div>}
            <div className="si-hint" style={{ marginLeft: 0 }}>
              {entryForm.kind === "capitalIn" && L("পার্টনার ব্যবসায় টাকা দিলেন। এটা মূলধন, লাভ নয়; ব্যবসার কাছে তার পাওনা হিসেবে থাকে।", "The partner put money into the business. It's capital, not profit, and stays as what the business owes them.")}
              {entryForm.kind === "capitalOut" && L("পার্টনার তার মূলধন থেকে টাকা ফেরত নিলেন (যেমন পার্টনারশিপ ছাড়লে)।", "The partner took back part of their capital (e.g. on leaving).")}
              {entryForm.kind === "drawing" && L("লাভ ভাগের আগেই অগ্রিম টাকা নিলেন। পরের লাভের ভাগ থেকে কেটে যাবে।", "Money taken before profit is shared. It comes off the next profit share.")}
              {entryForm.kind === "payout" && L("ভাগ করা লাভের টাকা, অথবা পার্টনার নিজের পকেট থেকে দোকানের যে খরচ দিয়েছিলেন সেই টাকা, তাকে দেওয়া হলো।", "The shared profit, or a shop expense the partner paid from their own pocket, is paid to the partner.")}
              {entryForm.kind === "reinvest" && L("লাভের টাকা না নিয়ে ব্যবসায় রেখে দিলেন, তার মূলধন বাড়ল। নগদ টাকা নড়ে না।", "The partner leaves the profit in the business and it becomes capital. No cash moves.")}
            </div>
          </div>
        </div>
        <div className="si-actions si-sticky-actions" style={{ background: "transparent" }}>
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn-secondary" disabled={busy} onClick={() => setEntryForm(null)}>{L("বন্ধ", "Close")}</button>
          <button type="button" className="pm-btn pm-btn--primary" disabled={busy} onClick={saveEntry}>💾 {L("সেভ", "Save")}</button>
        </div>
      </div>
    </div>
  );

  const settingsWindow = settingsForm && (
    <div className="pm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSettingsForm(null); }}>
      <div className="pm-window" style={{ maxWidth: 520 }}>
        <div className="pm-window-title"><span>⚙️ {L("লাভ ভাগের নিয়ম", "Profit sharing rules")}</span><button type="button" className="pm-window-close" onClick={() => setSettingsForm(null)}>✕</button></div>
        <div className="pm-window-body">
          <div className="si-panel-body" style={{ gap: 6 }}>
            <div className="si-grid2">
              {fField(L("কত দিন পর পর লাভ ভাগ", "Share profit every"), <select className="pm-input" value={settingsForm.frequency} onChange={(e) => setSettingsForm((f) => ({ ...f, frequency: e.target.value }))}>{FREQUENCIES.map((x) => <option key={x.key} value={x.key}>{bn ? x.bn : x.en}</option>)}</select>)}
              {fField(L("হিসাবের বছর শুরু", "Year starts in"), <select className="pm-input" value={settingsForm.startMonth} onChange={(e) => setSettingsForm((f) => ({ ...f, startMonth: Number(e.target.value) }))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>)}
              {fField(L("সময় শেষের কত দিন পর লাভ দেবেন", "Pay profit how many days after period end"), <input className="pm-input" inputMode="numeric" value={settingsForm.payoutDays} onChange={(e) => setSettingsForm((f) => ({ ...f, payoutDays: e.target.value }))} />)}
              {fField(L("ব্যবসায় রেখে দেওয়া (রিজার্ভ) % ", "Kept in business (reserve) %"), <input className="pm-input" inputMode="decimal" value={settingsForm.reservePct} onChange={(e) => setSettingsForm((f) => ({ ...f, reservePct: e.target.value }))} />)}
            </div>
            <div className="si-hint" style={{ marginLeft: 0 }}>{L("রিজার্ভ: লাভের এই অংশ কাউকে না দিয়ে ব্যবসায় রেখে দেওয়া হয় (মাল কেনা, বিপদের জন্য)। দেওয়ার দিন পার হলে নোটিফিকেশন আসবে।", "Reserve: this part of the profit stays in the business (stock, emergencies). You get a notification when the payout day passes.")}</div>
          </div>
        </div>
        <div className="si-actions si-sticky-actions" style={{ background: "transparent" }}>
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn-secondary" onClick={() => setSettingsForm(null)}>{L("বন্ধ", "Close")}</button>
          <button type="button" className="pm-btn pm-btn--primary" onClick={saveSettings}>💾 {L("সেভ", "Save")}</button>
        </div>
      </div>
    </div>
  );

  const partnersView = (
    <div className="si-box">
      {!shown.length ? <div className="si-empty">{L("এখনো কোনো পার্টনার নেই। \"+ নতুন পার্টনার\" চাপুন — নিজেকেও (মালিক) যোগ করুন।", "No partners yet. Press \"+ New partner\" and add yourself (the owner) too.")}</div> : mobile ? shown.map((p) => {
        const led = ledgers.get(p.id);
        return (
          <button key={p.id} type="button" className="si-mrow" onClick={() => openPartner(p)} style={p.status === "inactive" ? { opacity: 0.6 } : undefined}>
            <div className="si-mrow-top"><span>{p.photo ? <img src={p.photo} alt="" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", verticalAlign: "middle", marginRight: 4 }} /> : "🤝 "}{p.name}</span><span>{n(p.sharePercent)}%</span></div>
            <div className="si-mrow-sub"><span>{L("মূলধন", "Capital")} {money(led?.capital)}</span><span style={{ color: (led?.current || 0) < 0 ? "#b91c1c" : "#15803d" }}>{L("পাওনা", "Due")} {money(led?.current)}</span></div>
          </button>
        );
      }) : (
        <table className="pm-table">
          <thead><tr>
            <th>{L("নাম", "Name")}</th><th style={{ width: 150 }}>{L("ধরন", "Type")}</th><th style={{ width: 70 }} className="si-num">{L("শেয়ার", "Share")}</th>
            <th style={{ width: 110 }} className="si-num">{L("মূলধন", "Capital")}</th><th style={{ width: 110 }} className="si-num">{L("মোট পাওয়া লাভ", "Profit credited")}</th>
            <th style={{ width: 100 }} className="si-num">{L("তোলা + দেওয়া", "Taken + paid")}</th><th style={{ width: 110 }} className="si-num">{L("এখন পাওনা", "Due now")}</th><th style={{ width: 100 }}>{L("মোবাইল", "Mobile")}</th>
          </tr></thead>
          <tbody>
            {shown.map((p) => {
              const led = ledgers.get(p.id);
              return (
                <tr key={p.id} className="pm-clickable" onClick={() => openPartner(p)} style={p.status === "inactive" ? { color: "#6b7280" } : undefined}>
                  <td className="si-strong">{p.photo ? <img src={p.photo} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", verticalAlign: "middle", marginRight: 6 }} /> : "🤝 "}{p.name}{p.role ? <span className="si-muted" style={{ fontWeight: 400 }}> · {p.role}</span> : null}{p.status === "inactive" && <span className="si-badge" style={{ marginLeft: 6 }}>{L("ছেড়েছেন", "Left")} {fmtDay(p.leftDate)}</span>}</td>
                  <td>{(PARTNER_TYPES.find((t) => t.key === p.partnerType)?.[bn ? "bn" : "en"] || "").split(" (")[0]}</td>
                  <td className="si-num si-strong">{n(p.sharePercent)}%</td>
                  <td className="si-num">{money(led?.capital)}</td>
                  <td className="si-num">{money(led?.credited)}</td>
                  <td className="si-num">{money((led?.drawings || 0) + (led?.paid || 0))}</td>
                  <td className="si-num si-strong" style={{ color: (led?.current || 0) < 0 ? "#b91c1c" : "#15803d" }}>{money(led?.current)}</td>
                  <td>{p.mobile}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  const entriesView = (
    <div className="si-box">
      {!myEntries.filter((e) => e.kind !== "distribution").length ? <div className="si-empty">{L("এখনো কোনো লেনদেন নেই", "No entries yet")}</div> : (
        <table className="pm-table">
          <thead><tr><th style={{ width: 84 }}>{L("তারিখ", "Date")}</th><th>{L("পার্টনার", "Partner")}</th><th style={{ width: 170 }}>{L("ধরন", "Type")}</th><th style={{ width: 96 }}>{L("মাধ্যম", "Method")}</th><th>{L("নোট / রেফ", "Note / ref")}</th><th style={{ width: 100 }} className="si-num">{L("টাকা", "Amount")}</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {myEntries.filter((e) => e.kind !== "distribution").sort((a, b) => String(b.date).localeCompare(String(a.date))).map((e) => (
              <tr key={e.id}>
                <td>{fmtDay(e.date)}</td><td className="si-strong">{nameOf(e.partnerId)}</td><td>{ENTRY_KINDS[e.kind]?.icon} {kindLabel(e.kind)}</td>
                <td>{(PAY_METHODS.find((m) => m[0] === e.method) || [])[bn ? 1 : 2] || ""}</td><td>{[e.note, e.refNo].filter(Boolean).join(" · ")}</td>
                <td className="si-num si-strong" style={{ color: ENTRY_KINDS[e.kind]?.cash === "in" ? "#15803d" : ENTRY_KINDS[e.kind]?.cash === "out" ? "#b91c1c" : undefined }}>{money(e.amount)}</td>
                <td><button type="button" title={L("বাতিল", "Cancel")} onClick={() => cancelEntry(e)} style={{ border: 0, background: "none", cursor: "pointer" }}>🗑️</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const line = (label, value, strong, color) => <div className="si-total-row" style={{ display: "flex", justifyContent: "space-between", padding: "3px 6px", fontWeight: strong ? 800 : 500, color }}><span>{label}</span><span>{value}</span></div>;
  const profitView = (
    <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1fr) minmax(0,1.4fr)", gap: 6, minHeight: 0, overflow: "auto" }}>
      <div className="si-box" style={{ padding: 8 }}>
        <div className="si-grid2">
          {fField(L("সময়", "Period"), <select className="pm-input" value={range ? `${range.from}|${range.to}` : ""} onChange={(e) => { const [from, to] = e.target.value.split("|"); setRange({ from, to }); setProfitOverride(""); }}>
            {periodOptions.map((p) => <option key={p.from} value={`${p.from}|${p.to}`}>{periodLabel(p, bn)}{p.to >= today ? ` (${L("চলছে", "running")})` : ""}{dists.some((d) => d.periodFrom === p.from && d.periodTo === p.to) ? " ✔" : ""}</option>)}
            {range && !periodOptions.some((p) => p.from === range.from && p.to === range.to) && <option value={`${range.from}|${range.to}`}>{periodLabel(range, bn)}</option>}
          </select>)}
          {fField(L("রিজার্ভ %", "Reserve %"), <input className="pm-input" inputMode="decimal" value={reservePct} onChange={(e) => setReservePct(e.target.value)} />)}
          {fField(L("থেকে", "From"), <input type="date" className="pm-input" value={range?.from || ""} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} />)}
          {fField(L("পর্যন্ত", "To"), <input type="date" className="pm-input" value={range?.to || ""} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} />)}
        </div>
        <div style={{ marginTop: 8 }}>
          {line(L("হিসাব নিকাশ অনুযায়ী নিট লাভ", "Net profit as per Accounts"), autoProfit ? `${cur} ${money(autoProfit.netProfit)}` : L("লোড হচ্ছে…", "Loading…"))}
          {fField(L("নিজে লাভ লিখবেন? (হিসাবরক্ষকের অঙ্ক, খালি রাখলে উপরেরটা)", "Enter profit yourself? (accountant's figure; blank uses the one above)"), <input className="pm-input" inputMode="decimal" value={profitOverride} onChange={(e) => setProfitOverride(e.target.value)} placeholder={autoProfit ? money(autoProfit.netProfit) : ""} />)}
        </div>
        {preview && (
          <div style={{ marginTop: 8, borderTop: "1px solid #cbd5e1", paddingTop: 6 }}>
            {line(preview.netProfit < 0 ? L("নিট ক্ষতি", "Net loss") : L("নিট লাভ", "Net profit"), `${cur} ${money(preview.netProfit)}`, true, preview.netProfit < 0 ? "#b91c1c" : undefined)}
            {preview.reserve > 0 && line(L(`− ব্যবসায় রাখা (রিজার্ভ ${n(reservePct)}%)`, `− Kept in business (reserve ${n(reservePct)}%)`), money(-preview.reserve))}
            {preview.salaries > 0 && line(L("− কাজের পার্টনারদের বেতন", "− Working partners' salary"), money(-preview.salaries))}
            {preview.interest > 0 && line(L("− মূলধনের উপর সুদ", "− Interest on capital"), money(-preview.interest))}
            {line(preview.isLoss ? L("ভাগ হবে এমন ক্ষতি", "Loss to share") : L("ভাগ হবে এমন লাভ", "Profit to share"), `${cur} ${money(preview.distributable)}`, true)}
            {Math.abs(preview.unallocated) > 0.01 && line(L("কারো ভাগে যায়নি (ব্যবসায় থাকবে)", "Not given to anyone (stays in business)"), money(preview.unallocated), false, "#b45309")}
            {Math.abs(preview.shareTotal - 100) > 0.01 && <div className="si-hint" style={{ color: "#b45309", marginLeft: 0 }}>⚠️ {L(`সক্রিয় পার্টনারদের মোট শেয়ার ${preview.shareTotal}%, ১০০% নয়।`, `Active partners' shares total ${preview.shareTotal}%, not 100%.`)}</div>}
            {overlap ? <div className="si-hint" style={{ color: "#15803d", marginLeft: 0 }}>✔ {L(`এই সময়ের লাভ ভাগ হয়ে গেছে (${overlap.label})`, `Already shared (${overlap.label})`)}</div>
              : <button type="button" className="pm-btn pm-btn--primary" style={{ marginTop: 6, width: "100%" }} disabled={busy || !preview.allocations.length} onClick={postDistribution}>✅ {L("লাভ ভাগ করুন ও সেভ করুন", "Share profit and save")}</button>}
            <div className="si-hint" style={{ marginLeft: 0 }}>{L(`সেভ করলে প্রত্যেকের পাওনায় যোগ হবে। টাকা দেওয়ার তারিখ হবে সময় শেষের ${settings.payoutDays} দিন পর — তখন নোটিফিকেশন আসবে।`, `Saving adds each share to what the partner is owed. Payout is due ${settings.payoutDays} days after the period ends, with a notification.`)}</div>
          </div>
        )}
      </div>
      <div className="si-box" style={{ minHeight: 0, overflow: "auto" }}>
        {preview && preview.allocations.length > 0 && (
          <table className="pm-table">
            <thead><tr><th>{L("পার্টনার", "Partner")}</th><th className="si-num" style={{ width: 60 }}>%</th><th className="si-num" style={{ width: 90 }}>{L("বেতন", "Salary")}</th><th className="si-num" style={{ width: 90 }}>{L("সুদ", "Interest")}</th><th className="si-num" style={{ width: 100 }}>{preview.isLoss ? L("ক্ষতির ভাগ", "Loss share") : L("লাভের ভাগ", "Profit share")}</th><th className="si-num" style={{ width: 100 }}>{L("মোট", "Total")}</th></tr></thead>
            <tbody>
              {preview.allocations.map((a) => (
                <tr key={a.partnerId}>
                  <td className="si-strong">{a.name}{a.frac < 0.999 && <span className="si-badge" style={{ marginLeft: 4 }}>{Math.round(a.frac * 100)}% {L("সময়", "of period")}</span>}</td>
                  <td className="si-num">{preview.isLoss ? a.lossPct : a.sharePct}</td><td className="si-num">{a.salary ? money(a.salary) : ""}</td><td className="si-num">{a.interest ? money(a.interest) : ""}</td>
                  <td className="si-num" style={{ color: a.share < 0 ? "#b91c1c" : undefined }}>{money(a.share)}</td><td className="si-num si-strong">{money(a.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="pm-label" style={{ padding: "8px 6px 2px" }}>{L("আগে ভাগ করা লাভ", "Profit shared before")}</div>
        {!dists.length ? <div className="si-empty">{L("এখনো কোনো লাভ ভাগ হয়নি", "No profit shared yet")}</div> : (
          <table className="pm-table">
            <thead><tr><th>{L("সময়", "Period")}</th><th className="si-num">{L("নিট লাভ", "Net profit")}</th><th className="si-num">{L("ভাগ হয়েছে", "Shared")}</th><th>{L("দেওয়ার তারিখ", "Payout due")}</th><th>{L("করেছেন", "By")}</th><th style={{ width: 40 }} /></tr></thead>
            <tbody>
              {dists.map((d) => (
                <tr key={d.id}>
                  <td className="si-strong">{d.label}</td><td className="si-num">{money(d.netProfit)}{d.profitSource === "manual" ? " ✍️" : ""}</td>
                  <td className="si-num">{money((d.allocations || []).reduce((t, a) => t + n(a.total), 0))}</td><td>{fmtDay(d.dueDate)}</td><td>{d.createdByName || ""}</td>
                  <td><button type="button" title={L("বাতিল", "Cancel")} onClick={() => cancelEntry(d)} style={{ border: 0, background: "none", cursor: "pointer" }}>🗑️</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  const statementView = (
    <div className="si-box" style={{ minHeight: 0, overflow: "auto" }}>
      <div className="si-filters" style={{ padding: 6 }}>
        <select className="pm-input" style={{ maxWidth: 260 }} value={stmtPartner?.id || ""} onChange={(e) => setStmtId(e.target.value)}>{all.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <button type="button" className="pm-btn-secondary" disabled={!stmt} onClick={printStatement}>🖨️ {L("প্রিন্ট", "Print")}</button>
        <button type="button" className="pm-btn-secondary" disabled={!stmt || !stmtPartner?.mobile} onClick={sendWhatsApp}>💬 WhatsApp</button>
      </div>
      {stmt && (
        <>
          <div className="si-kpis">
            {kpi(L("মূলধন", "Capital"), `${cur} ${money(stmt.capital)}`)}
            {kpi(L("মোট পাওয়া লাভ", "Profit credited"), money(stmt.credited))}
            {kpi(L("অগ্রিম তোলা", "Drawings"), money(stmt.drawings))}
            {stmt.spentForShop > 0 && kpi(L("দোকানের খরচ নিজের পকেট থেকে", "Shop expenses from own pocket"), money(stmt.spentForShop))}
            {kpi(L("পার্টনারকে দেওয়া হয়েছে", "Paid to partner"), money(stmt.paid))}
            {kpi(stmt.current >= 0 ? L("এখন পাওনা", "Due now") : L("বেশি তোলা", "Overdrawn"), `${cur} ${money(Math.abs(stmt.current))}`, stmt.current < 0 ? "#b91c1c" : "#15803d")}
          </div>
          {!stmt.rows.length ? <div className="si-empty">{L("এখনো কোনো লেনদেন নেই", "No entries yet")}</div> : (
            <table className="pm-table">
              <thead><tr><th style={{ width: 84 }}>{L("তারিখ", "Date")}</th><th>{L("বিবরণ", "Details")}</th><th className="si-num" style={{ width: 100 }}>{L("মূলধন", "Capital")}</th><th className="si-num" style={{ width: 100 }}>{L("লাভের হিসাব", "Profit a/c")}</th><th className="si-num" style={{ width: 100 }}>{L("মূলধন ব্যালেন্স", "Capital bal")}</th><th className="si-num" style={{ width: 100 }}>{L("পাওনা ব্যালেন্স", "Due bal")}</th></tr></thead>
              <tbody>
                {stmt.rows.map((r) => (
                  <tr key={`${r.id}-${r.kind}`}>
                    <td>{fmtDay(r.date)}</td><td>{kindIcon(r.kind)} {kindLabel(r.kind)}{r.label ? ` · ${r.label}` : ""}{r.dueDate ? ` · ${L("দেওয়ার তারিখ", "due")} ${fmtDay(r.dueDate)}` : ""}</td>
                    <td className="si-num">{r.capital ? money(r.capital) : ""}</td><td className="si-num" style={{ color: r.current < 0 ? "#b91c1c" : undefined }}>{r.current ? money(r.current) : ""}</td>
                    <td className="si-num">{money(r.capitalBal)}</td><td className="si-num si-strong">{money(r.currentBal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );

  const G = (t, b) => <div style={{ marginBottom: 8 }}><div className="si-strong" style={{ marginBottom: 2 }}>{t}</div><div style={{ fontSize: 12, lineHeight: 1.55 }}>{b}</div></div>;
  const guideView = (
    <div className="si-box" style={{ padding: 10, overflow: "auto" }}>
      {G(L("১. পার্টনার কারা", "1. Who is a partner"), L("যারা ব্যবসায় টাকা দিয়েছেন বা কাজ করেন আর লাভের ভাগ পান। টাকার পার্টনার শুধু টাকা দেন (Sleeping partner), কাজের পার্টনার দোকানে কাজ করেন, কেউ দুটোই করেন। মালিক নিজেও একজন পার্টনার — নিজেকেও যোগ করুন যাতে সবার শেয়ার মিলে ১০০% হয়।", "People who put money into the business or work in it and get a share of the profit. A capital (sleeping) partner only gives money, a working partner works in the shop, some do both. The owner is a partner too, so add yourself and make the shares add up to 100%."))}
      {G(L("২. শেয়ার %", "2. Share %"), L("লাভের কত ভাগ কে পাবেন। যেমন আপনি ৬০%, করিম ৪০%। ক্ষতি হলে সাধারণত একই ভাগে ক্ষতি বহন করেন; চুক্তিতে আলাদা থাকলে \"ক্ষতির ভাগ %\" দিন। শেয়ার % মূলধনের অনুপাতে হতেই হবে এমন নয় — চুক্তিতে যা লেখা থাকে সেটাই।", "How much of the profit each gets, e.g. you 60%, Karim 40%. A loss is usually shared the same way; if the agreement says otherwise, fill \"Loss share %\". The share doesn't have to match the capital — the agreement decides."))}
      {G(L("৩. মূলধন (Capital)", "3. Capital"), L("পার্টনার ব্যবসায় যে টাকা দেন সেটা মূলধন। এটা লাভ নয়, খরচও নয় — ব্যবসার কাছে তার পাওনা। \"মূলধন জমা\" দিয়ে লিখুন। পার্টনারশিপ ছাড়লে বা টাকা ফেরত নিলে \"মূলধন ফেরত নেওয়া\"।", "Money a partner puts in is capital: not profit, not an expense — the business owes it back. Record it as \"Capital brought in\". When they take it back or leave, use \"Capital withdrawn\"."))}
      {G(L("৪. লাভ কীভাবে বের হয়", "4. How profit is worked out"), L("হিসাব নিকাশ পাতার নিট লাভ: বিক্রি − বিক্রি করা মালের কেনা দাম − খরচ (ভাড়া, বেতন, বিল ইত্যাদি)। হিসাবরক্ষক আলাদা অঙ্ক দিলে নিজে লিখতে পারবেন।", "The net profit from the Accounts page: sales − cost of the goods sold − expenses (rent, salaries, bills…). If an accountant gives a different figure you can type it in."))}
      {G(L("৫. লাভ ভাগের ক্রম", "5. Order of sharing"), L("(ক) রিজার্ভ: লাভের যে % ব্যবসায় রেখে দেবেন। (খ) কাজের পার্টনারের মাসিক বেতন। (গ) মূলধনের উপর সুদ (চুক্তিতে থাকলে)। (ঘ) বাকিটা শেয়ার % অনুযায়ী ভাগ। মাঝপথে যোগ দিলে যত দিন ছিলেন তত দিনের ভাগ পান।", "(a) Reserve: the % kept in the business. (b) Working partners' monthly salary. (c) Interest on capital (if agreed). (d) The rest by share %. Someone who joined midway gets the share for the days they were in."))}
      {G(L("৬. লাভের টাকা কখন", "6. When profit is paid"), L("সেটিং-এ ঠিক করুন কত দিন পর পর ভাগ হবে (মাসিক / ৩ মাস / ৬ মাস / বছরে) আর সময় শেষের কত দিন পর টাকা দেবেন। সময় শেষ হলে \"লাভ ভাগ\" থেকে ভাগ করুন। দেওয়ার দিন এলে নোটিফিকেশন আসবে; দিলে \"লাভের টাকা দেওয়া\" লিখুন। টাকা না নিয়ে ব্যবসায় রাখলে \"লাভ মূলধনে যোগ\"।", "In settings choose how often to share (monthly / quarterly / half-yearly / yearly) and how many days after the period end to pay. When a period ends, share it from \"Profit sharing\". On the payout day you get a notification; when you pay, record \"Profit share paid\". If they leave it in the business, use \"Profit added to capital\"."))}
      {G(L("৭. অগ্রিম তোলা (Drawing)", "7. Drawings"), L("লাভ ভাগের আগেই পার্টনার টাকা নিলে \"অগ্রিম তোলা\"। পরের লাভের ভাগ থেকে কেটে যায়। ভাগের চেয়ে বেশি তুললে নোটিফিকেশন আসবে।", "Money a partner takes before profit is shared is a drawing. It comes off their next share. If they take more than their share you get a notification."))}
      {G(L("৮. খেয়াল রাখবেন", "8. Keep in mind"), L("পার্টনারের টাকা (মূলধন, অগ্রিম, লাভ দেওয়া) খরচ নয়, তাই নিট লাভে আসে না। কাজের পার্টনারের বেতনও লাভ ভাগের অংশ, খরচের পাতায় আলাদা করে লিখবেন না। খরচের পাতায় পার্টনার বাছলে সফটওয়্যার জিজ্ঞেস করে টাকা কিসের জন্য: নিজের কাজে হলে খরচে সেভ হয় না, অগ্রিম তোলা হিসেবে লেখা হয়; দোকানের কাজে হলে খরচ হয়; নিজের পকেট থেকে দোকানের খরচ দিলে সেই টাকা তার পাওনায় যোগ হয়। ব্যাংকে দেওয়া-নেওয়া হলে ব্যাংক মেলানোয় নিজে থেকে আসে। একটা লিখিত পার্টনারশিপ চুক্তি রাখুন — শেয়ার, মূলধন, বেতন, কত দিন পর লাভ, ছাড়লে টাকা কীভাবে ফেরত — সব লেখা থাকবে।", "Partner money (capital, drawings, profit paid) is not an expense, so it doesn't change net profit. A working partner's salary is part of the profit split, so don't also enter it as an expense. Picking a partner on an expense asks what the money was for: personal use is not saved as an expense but as a drawing, shop work is an expense, and a shop expense paid from the partner's own pocket is added to what the business owes them. Bank movements show up in Bank Reconciliation automatically. Keep a written partnership agreement: shares, capital, salary, when profit is paid, and how money is returned on leaving."))}
    </div>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong>🤝 {L("পার্টনার ও লাভের ভাগ", "Partners & Profit Sharing")}</strong>
        <span>{L(`${(FREQUENCIES.find((f) => f.key === settings.frequency) || {}).bn} লাভ ভাগ · সময় শেষের ${settings.payoutDays} দিন পর টাকা`, `${(FREQUENCIES.find((f) => f.key === settings.frequency) || {}).en} sharing · paid ${settings.payoutDays} days after period end`)}</span>
      </div>
      <div className="si-toolbar">
        <button type="button" className="pm-btn pm-btn--primary" onClick={() => openPartner(null)}>+ {L("নতুন পার্টনার", "New partner")}</button>
        <button type="button" className="pm-btn-secondary" disabled={!activeList.length} onClick={() => setEntryForm({ kind: "capitalIn", partnerId: activeList.length === 1 ? activeList[0].id : "", amount: "", date: today, method: "cash", refNo: "", note: "" })}>💵 {L("লেনদেন যোগ", "Add entry")}</button>
        <button type="button" className="pm-btn-secondary" onClick={() => setSettingsForm({ ...settings })}>⚙️ {L("নিয়ম", "Rules")}</button>
        <span className="si-toolbar-gap" />
      </div>
      <div className="si-kpis">
        {kpi(L("সক্রিয় পার্টনার", "Active partners"), activeList.length)}
        {kpi(L("মোট শেয়ার", "Total share"), `${shareTotal}%`, Math.abs(shareTotal - 100) > 0.01 && activeList.length ? "#b45309" : "#15803d")}
        {kpi(L("মোট মূলধন", "Total capital"), `${cur} ${money(capitalTotal)}`)}
        {kpi(L("পার্টনারদের পাওনা লাভ", "Profit owed to partners"), `${cur} ${money(payableTotal)}`, payableTotal ? "#b91c1c" : undefined)}
      </div>
      {alerts.length > 0 && (
        <div className="si-box" style={{ maxHeight: 120, overflow: "auto", marginBottom: 4 }}>
          {alerts.map((a) => { const t = partnerAlertText(a, bn, cur); return <div key={a.key} style={{ padding: "3px 8px", fontSize: 12, color: a.tone === "danger" ? "#b91c1c" : a.tone === "warn" ? "#b45309" : undefined }}>{t.icon} <b>{t.title}</b> · {t.sub}</div>; })}
        </div>
      )}
      <div className="si-filters">
        <div className="si-pills">
          {[["partners", L("👥 পার্টনার", "👥 Partners")], ["entries", L("💵 লেনদেন", "💵 Entries")], ["profit", L("📊 লাভ ভাগ", "📊 Profit sharing")], ["statement", L("📄 হিসাব বিবরণী", "📄 Statement")], ["guide", L("ℹ️ কীভাবে কাজ করে", "ℹ️ How it works")]].map(([k, label]) => (
            <button key={k} type="button" className={`pm-btn-secondary${view === k ? " is-active" : ""}`} onClick={() => setView(k)}>{label}</button>
          ))}
        </div>
        {view === "partners" && <label className="pm-check"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} /> {L("ছেড়ে যাওয়াদেরও দেখাও", "Show partners who left")}</label>}
      </div>
      <div className="si-main is-all" style={{ minHeight: 0 }}>
        {view === "partners" && partnersView}
        {view === "entries" && entriesView}
        {view === "profit" && profitView}
        {view === "statement" && statementView}
        {view === "guide" && guideView}
      </div>
      <div className="si-statusbar">
        <span>{L("পার্টনার", "Partners")} <b>{all.length}</b></span>
        <span>{L("লাভ ভাগ হয়েছে", "Profit shares")} <b>{dists.length}</b></span>
      </div>
      {partnerWindow}
      {entryWindow}
      {settingsWindow}
    </div>
  );
}
