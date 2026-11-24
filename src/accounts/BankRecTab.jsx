import React, { useEffect, useMemo, useRef, useState } from "react";
import { offlineCreate, offlineList, offlineRemove, offlineUpdate } from "../offline/offlineRepository";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";
import { collectBankTransactions, reconcile, METHOD_LABEL, r2 } from "./bankRec.js";
import { lockedLines, parseStatementRows, reconciliationFileName, reconciliationRows, statementSummary, suggestEntryType, suggestMatches } from "./bankStatement.js";
import { activePeriodLock, periodLockMessage } from "./periodLock.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { csvText } from "../reports/vatExport.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;

const COL_LABEL = {
  salesInvoices: ["সেলস বিল", "Sales bill"], purchaseInvoices: ["পারচেজ বিল", "Purchase bill"], salesReceipts: ["রিসিপ্ট", "Receipt"],
  purchasePayments: ["পেমেন্ট", "Payment"], expenses: ["খরচ", "Expense"], bankReconciliations: ["ব্যাংক এন্ট্রি", "Bank entry"],
  salesReturns: ["সেলস রিটার্ন রিফান্ড", "Sales return refund"], purchaseReturns: ["পারচেজ রিটার্ন রিফান্ড", "Purchase return refund"], accountVouchers: ["জার্নাল / কন্ট্রা", "Journal / Contra"], partnerEntries: ["পার্টনারের লেনদেন", "Partner money"],
};
const ENTRY_TYPES = [
  { key: "charge", dir: "out", bn: "ব্যাংক চার্জ", en: "Bank charge" },
  { key: "interest", dir: "in", bn: "সুদ / লাভ", en: "Interest" },
  { key: "deposit", dir: "in", bn: "নগদ জমা", en: "Cash deposit" },
  { key: "withdrawal", dir: "out", bn: "নগদ উত্তোলন", en: "Cash withdrawal" },
];

export default function BankRecTab({ lang = "en", shopId, user, profile, isOwner, canManage, canDelete = false, canPrint = false, cur = "AED", toast, shopName = "" }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [data, setData] = useState(null);
  const [recDocs, setRecDocs] = useState([]);
  const [tick, setTick] = useState(0);
  const [asOf, setAsOf] = useState(() => localDay());
  const [stmt, setStmt] = useState("");
  const [show, setShow] = useState("uncleared");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [settingsForm, setSettingsForm] = useState(null);
  const [entryForm, setEntryForm] = useState(null);
  // statement import: { file, lines, skipped, summary, rows: [{ status, candidates, choice, entryType }] }
  const [imp, setImp] = useState(null);
  const [lastImport, setLastImport] = useState(null);
  const fileRef = useRef(null);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses"), offlineList("accountVouchers").catch(() => []), offlineList("partnerEntries").catch(() => [])])
      .then(([rows, rc, pm, ex, av, pe]) => {
        if (cancelled) return;
        setData({ salesInvoices: rows.salesInvoices, purchaseInvoices: rows.purchaseInvoices, salesReturns: rows.extras?.salesReturns || [], purchaseReturns: rows.extras?.purchaseReturns || [], receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex), vouchers: rowsOf(av), partnerEntries: rowsOf(pe) });
      })
      .catch((err) => console.warn("[S4 bank rec] load failed", err));
    return () => { cancelled = true; };
  }, [shopId, tick]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName: "bankReconciliations", shopId, onRows: (list) => setRecDocs(list || []) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId]);

  const docs = useMemo(() => recDocs.filter((d) => d && !d.isDeleted && d.shopId === shopId), [recDocs, shopId]);
  const settings = useMemo(() => docs.filter((d) => d.kind === "settings").sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null, [docs]);
  const entries = useMemo(() => docs.filter((d) => d.kind === "entry"), [docs]);
  const statements = useMemo(() => docs.filter((d) => d.kind === "statement").sort((a, b) => String(b.asOf || "").localeCompare(String(a.asOf || ""))), [docs]);
  const markDocs = useMemo(() => {
    const m = new Map();
    docs.filter((d) => d.kind === "mark" && d.txKey).forEach((d) => { const p = m.get(d.txKey); if (!p || String(d.updatedAt || "") > String(p.updatedAt || "")) m.set(d.txKey, d); });
    return m;
  }, [docs]);
  const marks = useMemo(() => new Map([...markDocs.entries()].map(([k, d]) => [k, d.clearedDate || ""])), [markDocs]);

  const txs = useMemo(() => (data ? collectBankTransactions({ ...data, bankEntries: entries }, shopId) : []), [data, entries, shopId]);
  const opening = n(settings?.openingBalance);
  const openingDate = settings?.openingDate || "";
  const rec = useMemo(() => reconcile(txs, marks, { opening, openingDate, asOf, statementBalance: stmt }), [txs, marks, opening, openingDate, asOf, stmt]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txs
      .filter((t) => (!openingDate || t.date >= openingDate) && (!asOf || t.date <= asOf))
      .filter((t) => {
        const c = rec.clearedOn(t);
        const cleared = !!c && (!asOf || c <= asOf);
        return show === "all" || (show === "cleared" ? cleared : !cleared);
      })
      .filter((t) => !q || [t.no, t.party, t.ref].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));
  }, [txs, rec, show, search, asOf, openingDate]);

  const syncSoon = () => { if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {}); };
  const stamp = () => ({ updatedAt: new Date().toISOString(), updatedBy: user?.uid || "" });

  const lockDate = activePeriodLock();
  const isLocked = (day) => !!lockDate && !!day && day <= lockDate;
  const setCleared = async (t, date) => {
    if (!canManage || t.autoCleared || busy) return;
    const prevDay = markDocs.get(t.key)?.clearedDate || "";
    if (isLocked(date) || isLocked(prevDay)) { toast?.(periodLockMessage(lockDate), "err"); return; }
    setBusy(t.key);
    const prev = markDocs.get(t.key);
    try {
      if (!date) {
        if (prev) { await offlineRemove("bankReconciliations", prev.id); setRecDocs((l) => l.filter((d) => d.id !== prev.id)); }
      } else if (prev) {
        const next = { ...prev, clearedDate: date, ...stamp() };
        await offlineUpdate("bankReconciliations", prev.id, next);
        setRecDocs((l) => l.map((d) => (d.id === prev.id ? next : d)));
      } else {
        const payload = { shopId, kind: "mark", txKey: t.key, clearedDate: date, amount: t.amount, dir: t.dir, createdBy: user?.uid || "", createdAt: new Date().toISOString(), ...stamp() };
        const res = await offlineCreate("bankReconciliations", payload);
        setRecDocs((l) => [...l, { ...payload, id: res.documentId }]);
      }
      syncSoon();
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    } finally {
      setBusy("");
    }
  };

  const clearAllShown = async () => {
    const todo = rows.filter((t) => !t.autoCleared && !rec.clearedOn(t));
    if (!todo.length || !window.confirm(L(`দেখানো ${todo.length}টি লেনদেন ব্যাংকে মিলেছে (${fmtDay(asOf)}) হিসেবে চিহ্নিত করবেন?`, `Mark the ${todo.length} shown items as cleared on ${fmtDay(asOf)}?`))) return;
    for (const t of todo) await setCleared(t, asOf);
    toast?.(L("চিহ্নিত হয়েছে", "Marked as cleared"));
  };

  const saveSettings = async () => {
    const f = settingsForm;
    if (!f) return;
    setBusy("settings");
    try {
      const body = { bankName: f.bankName.trim(), accountNo: f.accountNo.trim(), openingBalance: r2(f.openingBalance), openingDate: f.openingDate || "", ...stamp() };
      if (settings) {
        await offlineUpdate("bankReconciliations", settings.id, { ...settings, ...body });
        setRecDocs((l) => l.map((d) => (d.id === settings.id ? { ...d, ...body } : d)));
      } else {
        const payload = { shopId, kind: "settings", ...body, createdBy: user?.uid || "", createdAt: new Date().toISOString() };
        const res = await offlineCreate("bankReconciliations", payload);
        setRecDocs((l) => [...l, { ...payload, id: res.documentId }]);
      }
      setSettingsForm(null);
      toast?.(L("ব্যাংকের তথ্য সেভ হয়েছে", "Bank details saved"));
      syncSoon();
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    } finally {
      setBusy("");
    }
  };

  const saveEntry = async () => {
    const f = entryForm;
    if (!f) return;
    const amount = r2(f.amount);
    if (!(amount > 0)) { toast?.(L("সঠিক টাকার পরিমাণ লিখুন", "Enter a valid amount"), "err"); return; }
    if (!f.date) { toast?.(L("তারিখ দিন", "Pick a date"), "err"); return; }
    if (isLocked(f.date)) { toast?.(periodLockMessage(lockDate), "err"); return; }
    const type = ENTRY_TYPES.find((x) => x.key === f.entryType) || ENTRY_TYPES[0];
    setBusy("entry");
    try {
      const payload = { shopId, kind: "entry", entryType: type.key, direction: type.dir, amount, date: f.date, refNo: f.refNo.trim(), note: f.note.trim() || type.en, status: "active", createdBy: user?.uid || "", createdByName: profile?.personName || "", createdAt: new Date().toISOString(), ...stamp() };
      const res = await offlineCreate("bankReconciliations", payload);
      setRecDocs((l) => [...l, { ...payload, id: res.documentId }]);
      setEntryForm(null);
      toast?.(L("ব্যাংক এন্ট্রি যোগ হয়েছে", "Bank entry added"));
      syncSoon();
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    } finally {
      setBusy("");
    }
  };

  const removeEntry = async (t) => {
    const d = entries.find((x) => x.id === t.id);
    if (!d || !canManage || !window.confirm(L("এই ব্যাংক এন্ট্রি মুছে ফেলবেন?", "Delete this bank entry?"))) return;
    try {
      await offlineRemove("bankReconciliations", d.id);
      setRecDocs((l) => l.filter((x) => x.id !== d.id));
      logAudit({ shopId, user, profile, action: "delete", collection: "bankReconciliations", docId: d.id, docNo: d.entryType, amount: d.amount, note: d.note || "" });
      syncSoon();
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    }
  };

  const saveStatement = async () => {
    if (stmt === "") { toast?.(L("ব্যাংক স্টেটমেন্টের ব্যালেন্স লিখুন", "Enter the bank statement balance"), "err"); return; }
    setBusy("stmt");
    try {
      const payload = { shopId, kind: "statement", asOf, statementBalance: r2(stmt), bookBalance: rec.bookBalance, bankBalance: rec.bankBalance, difference: rec.difference, ...(lastImport ? { statementFile: lastImport.file, statementFrom: lastImport.from } : {}),
        unclearedInTotal: rec.unclearedInTotal, unclearedOutTotal: rec.unclearedOutTotal, createdBy: user?.uid || "", createdByName: profile?.personName || "", createdAt: new Date().toISOString(), ...stamp() };
      const res = await offlineCreate("bankReconciliations", payload);
      setRecDocs((l) => [...l, { ...payload, id: res.documentId }]);
      toast?.(rec.difference === 0 ? L("মিলে গেছে — সেভ হয়েছে", "Reconciled and saved") : L("পার্থক্য সহ সেভ হয়েছে", "Saved with a difference"));
      syncSoon();
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    } finally {
      setBusy("");
    }
  };

  // ── statement import ──
  const txByKey = useMemo(() => new Map(txs.map((t) => [t.key, t])), [txs]);
  const readStatement = async (file) => {
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const wb = /\.csv$/i.test(file.name) ? XLSX.read(await file.text(), { type: "string", raw: true }) : XLSX.read(await file.arrayBuffer(), { type: "array" });
      const parsed = parseStatementRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true }));
      if (parsed.error) { toast?.(L("তারিখ আর টাকার কলাম পাওয়া যায়নি (Date, Debit / Credit বা Amount)", "No date and amount columns found (Date, Debit / Credit or Amount)"), "err"); return; }
      const sugg = suggestMatches(parsed.lines, txs, { clearedOn: rec.clearedOn });
      setImp({
        file: file.name, lines: parsed.lines, skipped: parsed.skipped, summary: statementSummary(parsed.lines),
        rows: parsed.lines.map((l, i) => ({ status: sugg[i].status, candidates: sugg[i].candidates, choice: sugg[i].txKey, entryType: sugg[i].status === "none" ? suggestEntryType(l) : "" })),
      });
    } catch (e) { toast?.(L("ফাইল পড়া যায়নি: ", "Could not read the file: ") + (e?.message || e), "err"); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  };
  const setImpRow = (i, patch) => setImp((s) => ({ ...s, rows: s.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const chosenTwice = imp ? imp.rows.map((r) => r.choice).filter(Boolean).filter((k, i, a) => a.indexOf(k) !== i) : [];
  const applyImport = async () => {
    if (!imp || !canManage || busy) return;
    if (chosenTwice.length) { toast?.(L("একই লেনদেন দুটো লাইনে বাছা হয়েছে", "The same movement is picked for two lines"), "err"); return; }
    const locked = new Set(lockedLines(imp.lines, lockDate).map((l) => l.row));
    const todo = imp.rows.map((r, i) => ({ ...r, line: imp.lines[i] })).filter((r) => (r.choice || r.entryType) && !locked.has(r.line.row));
    const matches = todo.filter((r) => r.choice).length, newEntries = todo.filter((r) => !r.choice && r.entryType).length;
    if (!todo.length) { toast?.(L("কিছু বাছা হয়নি", "Nothing picked"), "err"); return; }
    if (!window.confirm(L(`${matches}টি লেনদেন মিলেছে হিসেবে চিহ্নিত হবে আর ${newEntries}টি ব্যাংক এন্ট্রি যোগ হবে। চালাবেন?`, `Mark ${matches} movement(s) as cleared and add ${newEntries} bank entr${newEntries === 1 ? "y" : "ies"}?`))) return;
    let done = 0;
    try {
      for (const r of todo) {
        if (r.choice) {
          const t = txByKey.get(r.choice);
          if (t) await setCleared(t, r.line.date > t.date ? r.line.date : t.date);
        } else {
          const type = ENTRY_TYPES.find((x) => x.key === r.entryType);
          if (!type || type.dir !== r.line.dir) continue;
          const payload = { shopId, kind: "entry", entryType: type.key, direction: type.dir, amount: r2(r.line.amount), date: r.line.date, refNo: r.line.ref || "", note: r.line.desc || type.en,
            status: "active", source: "statementImport", createdBy: user?.uid || "", createdByName: profile?.personName || "", createdAt: new Date().toISOString(), ...stamp() };
          const res = await offlineCreate("bankReconciliations", payload);
          setRecDocs((l) => [...l, { ...payload, id: res.documentId }]);
        }
        done += 1;
      }
      setLastImport({ file: imp.file, from: imp.summary?.from || "" });
      if (imp.summary?.to) setAsOf(imp.summary.to);
      if (imp.summary?.closing != null) setStmt(String(imp.summary.closing));
      logAudit({ shopId, user, profile, action: "import", collection: "bankReconciliations", docNo: imp.file, amount: imp.summary?.closing ?? null, note: `${matches} matched, ${newEntries} entries` });
      toast?.(L(`সম্পন্ন - ${done}টি লাইন`, `Done - ${done} line(s)`));
      setImp(null);
      syncSoon();
    } catch (e) {
      toast?.(L(`${done}টির পর থেমেছে: `, `Stopped after ${done}: `) + (e?.message || e), "err");
    }
  };
  const exportCsv = async () => {
    try { await saveTextFile(reconciliationFileName(asOf), csvText(reconciliationRows(rec, { asOf, statementBalance: stmt === "" ? null : n(stmt), typeLabel: (t) => COL_LABEL[t.col]?.[1] || t.col }))); }
    catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const print = () => {
    const cols = [{ label: "Date" }, { label: "Type" }, { label: "No" }, { label: "Party / Note" }, { label: "Ref" }, { label: `Amount (${cur})`, align: "right" }];
    const line = (label, amt) => ["", "", "", label, "", amt == null ? "" : money(amt)];
    const body = [
      line("Balance as per books", rec.bookBalance),
      line("Less: deposits not yet credited by bank", -rec.unclearedInTotal),
      ...rec.unclearedIn.map((t) => [fmtDay(t.date), COL_LABEL[t.col]?.[1] || t.col, t.no || "", t.party || "", t.ref || "", money(t.amount)]),
      line("Add: payments not yet debited by bank", rec.unclearedOutTotal),
      ...rec.unclearedOut.map((t) => [fmtDay(t.date), COL_LABEL[t.col]?.[1] || t.col, t.no || "", t.party || "", t.ref || "", money(t.amount)]),
      line("Expected balance as per bank", rec.bankBalance),
      ...(rec.difference == null ? [] : [line("Balance as per bank statement", n(stmt)), line("Difference", rec.difference)]),
    ];
    printWithSettings(generateStatementHTML({
      shopName, title: "BANK RECONCILIATION STATEMENT", subtitle: `As at ${fmtDay(asOf)}`,
      partyLine: [settings?.bankName, settings?.accountNo ? `A/C ${settings.accountNo}` : ""].filter(Boolean).join(" · "), cols, rows: body,
    }), { lang });
  };

  const kpi = (label, value, color) => <div className="si-kpi"><span>{label}</span><b style={color ? { color } : undefined}>{value}</b></div>;
  const fField = (label, control) => <div className="si-field"><span className="pm-label">{label}</span>{control}</div>;

  const settingsWindow = settingsForm && (
    <div className="pm-backdrop"onMouseDown={(e) => { if (e.target === e.currentTarget) setSettingsForm(null); }}>
      <div className="pm-window"style={{ maxWidth: 520 }}>
        <div className="pm-window-title"><span> {L("ব্যাংক অ্যাকাউন্ট", "Bank account")}</span><button type="button"className="pm-window-close"onClick={() => setSettingsForm(null)}>✕</button></div>
        <div className="pm-window-body">
          <div className="si-panel-body"style={{ gap: 6 }}>
            <div className="si-grid2">
              {fField(L("ব্যাংকের নাম", "Bank name"), <input className="pm-input"value={settingsForm.bankName} onChange={(e) => setSettingsForm((f) => ({ ...f, bankName: e.target.value }))} />)}
              {fField(L("অ্যাকাউন্ট নং", "Account no"), <input className="pm-input"value={settingsForm.accountNo} onChange={(e) => setSettingsForm((f) => ({ ...f, accountNo: e.target.value }))} />)}
            </div>
            <div className="si-grid2">
              {fField(`${L("শুরুর ব্যালেন্স", "Opening balance")} (${cur})`, <input className="pm-input"inputMode="decimal"value={settingsForm.openingBalance} onChange={(e) => setSettingsForm((f) => ({ ...f, openingBalance: e.target.value }))} />)}
              {fField(L("যে তারিখ থেকে", "From date"), <input type="date"className="pm-input"value={settingsForm.openingDate} onChange={(e) => setSettingsForm((f) => ({ ...f, openingDate: e.target.value }))} />)}
            </div>
            <div className="si-hint"style={{ marginLeft: 0 }}>{L("এই তারিখের আগের লেনদেন বাদ যাবে; শুরুর ব্যালেন্স হলো ঐ দিনের ব্যাংক স্টেটমেন্টের ব্যালেন্স।", "Transactions before this date are ignored; the opening balance is the bank statement balance on that date.")}</div>
          </div>
        </div>
        <div className="si-actions si-sticky-actions"style={{ background: "transparent" }}>
          <span className="si-toolbar-gap" />
          <button type="button"className="pm-btn-secondary"onClick={() => setSettingsForm(null)}>{L("বন্ধ", "Close")}</button>
          <button type="button"className="pm-btn pm-btn--primary"disabled={!!busy} onClick={saveSettings}> {L("সেভ", "Save")}</button>
        </div>
      </div>
    </div>
  );

  const entryWindow = entryForm && (
    <div className="pm-backdrop"onMouseDown={(e) => { if (e.target === e.currentTarget) setEntryForm(null); }}>
      <div className="pm-window"style={{ maxWidth: 520 }}>
        <div className="pm-window-title"><span> {L("ব্যাংক এন্ট্রি", "Bank entry")}</span><button type="button"className="pm-window-close"onClick={() => setEntryForm(null)}>✕</button></div>
        <div className="pm-window-body">
          <div className="si-panel-body"style={{ gap: 6 }}>
            <div className="si-types"style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
              {ENTRY_TYPES.map((x) => <button key={x.key} type="button"className={`pm-btn-secondary${entryForm.entryType === x.key ? "is-active" : ""}`} onClick={() => setEntryForm((f) => ({ ...f, entryType: x.key }))}>{x.dir === "in" ? "" : ""} {bn ? x.bn : x.en}</button>)}
            </div>
            <div className="si-grid2">
              {fField(`${L("টাকা", "Amount")} (${cur}) *`, <input autoFocus className="pm-input"inputMode="decimal"value={entryForm.amount} onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))} />)}
              {fField(`${L("তারিখ", "Date")} *`, <input type="date"className="pm-input"value={entryForm.date} onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))} />)}
            </div>
            <div className="si-grid2">
              {fField(L("রেফারেন্স", "Reference"), <input className="pm-input"value={entryForm.refNo} onChange={(e) => setEntryForm((f) => ({ ...f, refNo: e.target.value }))} />)}
              {fField(L("নোট", "Note"), <input className="pm-input"value={entryForm.note} onChange={(e) => setEntryForm((f) => ({ ...f, note: e.target.value }))} />)}
            </div>
            <div className="si-hint"style={{ marginLeft: 0 }}>{L("ব্যাংক স্টেটমেন্টে আছে কিন্তু সফটওয়্যারে লেখা নেই এমন জিনিস (চার্জ, সুদ, নগদ জমা/উত্তোলন) এখানে যোগ করুন।", "Add items that are on the bank statement but not in the books (charges, interest, cash deposits/withdrawals).")} {L("কন্ট্রা ভাউচারে (নগদ → ব্যাংক) আগে লিখে থাকলে এখানে আবার দেবেন না — ওটা নিজে থেকেই তালিকায় আসে।", "If you already wrote it as a Contra voucher (Cash → Bank), don't add it again here; it is listed automatically.")}</div>
          </div>
        </div>
        <div className="si-actions si-sticky-actions"style={{ background: "transparent" }}>
          <span className="si-toolbar-gap" />
          <button type="button"className="pm-btn-secondary"onClick={() => setEntryForm(null)}>{L("বন্ধ", "Close")}</button>
          <button type="button"className="pm-btn pm-btn--primary"disabled={!!busy} onClick={saveEntry}> {L("সেভ", "Save")}</button>
        </div>
      </div>
    </div>
  );

  const clearedCell = (t) => {
    const c = rec.clearedOn(t);
    if (t.autoCleared) return <span className="si-badge"style={{ color: "#15803d" }} title={t.manual ? "" : L("চেক পেজে ক্লিয়ার করা", "Cleared on the Cheque page")}> {fmtDay(c)}</span>;
    return (
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <input type="checkbox"disabled={!canManage || busy === t.key} checked={!!c} onChange={(e) => setCleared(t, e.target.checked ? (t.date > asOf ? t.date : asOf) : "")} />
        {c && <input type="date"className="pm-input"style={{ width: 126 }} disabled={!canManage} value={c} onChange={(e) => e.target.value && setCleared(t, e.target.value)} />}
      </span>
    );
  };

  const diffColor = rec.difference == null ? undefined : Math.abs(rec.difference) < 0.005 ? "#15803d" : "#b91c1c";

  return (
    <div ref={rootRef} className="si-root"style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("ব্যাংক মেলানো (Bank Reconciliation)", "Bank Reconciliation")}</strong>
        <span>{settings ? `${settings.bankName || L("ব্যাংক", "Bank")}${settings.accountNo ? ` · ${settings.accountNo}` : ""} · ${L("শুরু", "Opening")} ${cur} ${money(opening)}${openingDate ? ` (${fmtDay(openingDate)})` : ""}` : L("ব্যাংকের শুরুর ব্যালেন্স এখনো দেওয়া হয়নি", "Opening bank balance not set yet")}</span>
      </div>
      <div className="si-toolbar">
        {canManage && <button type="button"className="pm-btn-secondary"onClick={() => setSettingsForm({ bankName: settings?.bankName || "", accountNo: settings?.accountNo || "", openingBalance: settings ? String(settings.openingBalance ?? "") : "", openingDate: settings?.openingDate || "" })}> {L("ব্যাংক / শুরুর ব্যালেন্স", "Bank / opening")}</button>}
        {canManage && <button type="button"className="pm-btn-secondary"onClick={() => setEntryForm({ entryType: "charge", amount: "", date: asOf, refNo: "", note: "" })}> {L("চার্জ / সুদ এন্ট্রি", "Charge / interest")}</button>}
        <span className="si-toolbar-gap" />
        <span className="pm-label"style={{ margin: 0 }}>{L("স্টেটমেন্টের তারিখ", "Statement date")}</span>
        <input type="date"className="pm-input"style={{ width: 140 }} value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
        <input className="pm-input"inputMode="decimal"style={{ width: 150 }} placeholder={L("স্টেটমেন্টের ব্যালেন্স", "Statement balance")} value={stmt} onChange={(e) => setStmt(e.target.value)} />
        {canManage && <button type="button"className="pm-btn pm-btn--primary"disabled={!!busy || stmt === ""} onClick={saveStatement}> {L("সেভ", "Save")}</button>}
        {canPrint && <button type="button"className="pm-btn-secondary"onClick={print}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv}> Excel</button>}
        {canManage && <button type="button" className="pm-btn-secondary" onClick={() => fileRef.current?.click()} disabled={!data}> {L("স্টেটমেন্ট আনুন (CSV / Excel)", "Import statement (CSV / Excel)")}</button>}
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={(e) => readStatement(e.target.files?.[0])} />
      </div>
      <div className="si-kpis">
        {kpi(L("বই অনুযায়ী ব্যালেন্স", "Balance as per books"), `${cur} ${money(rec.bookBalance)}`)}
        {kpi(L("জমা, ব্যাংকে আসেনি", "Deposits not credited"), `− ${money(rec.unclearedInTotal)}`, rec.unclearedInTotal ? "#b45309" : undefined)}
        {kpi(L("পেমেন্ট, ব্যাংক থেকে কাটেনি", "Payments not debited"), `+ ${money(rec.unclearedOutTotal)}`, rec.unclearedOutTotal ? "#b45309" : undefined)}
        {kpi(L("ব্যাংকে থাকার কথা", "Expected bank balance"), `${cur} ${money(rec.bankBalance)}`, "#1d4ed8")}
        {kpi(L("পার্থক্য", "Difference"), rec.difference == null ? "—" : money(rec.difference), diffColor)}
      </div>
      {data && !settings && (
        <div className="si-hint"style={{ margin: "2px 4px", padding: "6px 8px", background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 4, color: "#92400e" }}>
           {L("ব্যাংকের শুরুর ব্যালেন্স দেওয়া হয়নি, তাই হিসাব ০ থেকে শুরু হচ্ছে আর ব্যালেন্স ভুল (মাইনাস) দেখাতে পারে। \"ব্যাংক / শুরুর ব্যালেন্স\"চেপে যে দিন থেকে শুরু করবেন সেই দিনের ব্যাংক স্টেটমেন্টের ব্যালেন্স দিন।", "No opening bank balance yet, so the books start from 0 and the balance can look wrong (negative). Press \"Bank / opening\"and enter the bank statement balance on the day you start from.")}
          {canManage && <button type="button"className="pm-btn-secondary"style={{ marginLeft: 8 }} onClick={() => setSettingsForm({ bankName: "", accountNo: "", openingBalance: "", openingDate: "" })}> {L("এখনই দিন", "Set it now")}</button>}
        </div>
      )}
      <div className="si-filters">
        <div className="si-search">
          <input className="pm-input"value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("খুঁজুন: নং, পার্টি, চেক/রেফ…", "Search: no, party, cheque/ref…")} />
          {search && <button type="button"onClick={() => setSearch("")}>✕</button>}
        </div>
        <div className="si-pills">
          {[["uncleared", L("মেলেনি", "Uncleared")], ["cleared", L("মিলেছে", "Cleared")], ["all", L("সব", "All")]].map(([k, label]) => (
            <button key={k} type="button"className={`pm-btn-secondary${show === k ? "is-active" : ""}`} onClick={() => setShow(k)}>{label}</button>
          ))}
        </div>
        {canManage && show !== "cleared" && <button type="button"className="pm-btn-secondary"disabled={!!busy} onClick={clearAllShown}> {L("দেখানো সব মিলেছে", "Clear all shown")}</button>}
      </div>
      <div className="si-main is-all">
        <div className="si-box">
          {!data ? <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div> : !rows.length ? (
            <div className="si-empty">{txs.length ? L("এই ফিল্টারে কিছু নেই", "Nothing in this filter") : L("এখনো কোনো ব্যাংক/কার্ড/চেক লেনদেন নেই", "No bank, card or cheque transactions yet")}</div>
          ) : mobile ? rows.map((t) => (
            <div key={t.key} className="si-mrow">
              <div className="si-mrow-top"><span>{COL_LABEL[t.col]?.[bn ? 0 : 1]} · {t.no}</span><span style={{ color: t.dir === "in" ? "#15803d" : "#b91c1c" }}>{t.dir === "in" ? "+" : "−"} {money(t.amount)}</span></div>
              <div className="si-mrow-sub"><span>{fmtDay(t.date)} · {t.party}{t.ref ? ` · ${t.ref}` : ""}</span><span>{clearedCell(t)}</span></div>
            </div>
          )) : (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 80 }}>{L("তারিখ", "Date")}</th>
                <th style={{ width: 96 }}>{L("ধরন", "Type")}</th>
                <th style={{ width: 90 }}>{L("নং", "No")}</th>
                <th>{L("পার্টি / নোট", "Party / Note")}</th>
                <th style={{ width: 96 }}>{L("মাধ্যম", "Mode")}</th>
                <th style={{ width: 100 }}>{L("চেক / রেফ", "Cheque / Ref")}</th>
                <th style={{ width: 92 }} className="si-num">{L("জমা", "In")}</th>
                <th style={{ width: 92 }} className="si-num">{L("খরচ", "Out")}</th>
                <th style={{ width: 170 }}>{L("ব্যাংকে মিলেছে", "Cleared in bank")}</th>
              </tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.key}>
                    <td>{fmtDay(t.date)}</td>
                    <td>{COL_LABEL[t.col]?.[bn ? 0 : 1]}</td>
                    <td className="si-strong">{t.no}</td>
                    <td title={t.party}>{t.party}{t.manual && canManage && <button type="button"onClick={() => removeEntry(t)} style={{ marginLeft: 6, border: 0, background: "none", color: "#b91c1c", cursor: "pointer" }} title={L("মুছুন", "Delete")}></button>}</td>
                    <td>{METHOD_LABEL[t.method] || t.method}</td>
                    <td>{t.ref}</td>
                    <td className="si-num"style={{ color: "#15803d" }}>{t.dir === "in" ? money(t.amount) : ""}</td>
                    <td className="si-num"style={{ color: "#b91c1c" }}>{t.dir === "out" ? money(t.amount) : ""}</td>
                    <td>{clearedCell(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {statements.length > 0 && (
        <div className="si-box"style={{ maxHeight: 150, overflow: "auto", marginTop: 4 }}>
          <table className="pm-table">
            <thead><tr><th>{L("সেভ করা রিকনসিলিয়েশন", "Saved reconciliations")}</th><th className="si-num">{L("স্টেটমেন্ট", "Statement")}</th><th className="si-num">{L("বই", "Books")}</th><th className="si-num">{L("পার্থক্য", "Difference")}</th><th>{L("করেছেন", "By")}</th>{canDelete && <th style={{ width: 40 }} />}</tr></thead>
            <tbody>
              {statements.map((s) => (
                <tr key={s.id} className="pm-clickable"onClick={() => { setAsOf(s.asOf); setStmt(String(s.statementBalance ?? "")); }}>
                  <td>{fmtDay(s.asOf)}</td>
                  <td className="si-num">{money(s.statementBalance)}</td>
                  <td className="si-num">{money(s.bookBalance)}</td>
                  <td className="si-num"style={{ color: Math.abs(n(s.difference)) < 0.005 ? "#15803d" : "#b91c1c" }}>{money(s.difference)}</td>
                  <td>{s.createdByName || ""}</td>
                  {canDelete && <td><button type="button"style={{ border: 0, background: "none", cursor: "pointer" }} onClick={async (e) => { e.stopPropagation(); if (!window.confirm(L("এটা মুছবেন?", "Delete this?"))) return; await offlineRemove("bankReconciliations", s.id); setRecDocs((l) => l.filter((d) => d.id !== s.id)); syncSoon(); }}></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="si-statusbar">
        <span>{L("দেখাচ্ছে", "Showing")} <b>{rows.length}</b></span>
        <span>{L("মেলেনি", "Uncleared")} <b>{rec.unclearedIn.length + rec.unclearedOut.length}</b></span>
      </div>
      {settingsWindow}
      {entryWindow}
      {imp && (
        <div className="pm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setImp(null); }}>
          <div className="pm-window" style={{ maxWidth: 1100 }}>
            <div className="pm-window-title"><span> {L("ব্যাংক স্টেটমেন্ট", "Bank statement")}: {imp.file}</span><button type="button" className="pm-window-close" onClick={() => setImp(null)}>x</button></div>
            <div className="pm-window-body">
              <div className="si-panel-body" style={{ gap: 6 }}>
                {imp.summary && (
                  <div>
                    {fmtDay(imp.summary.from)} - {fmtDay(imp.summary.to)} · {imp.summary.count} {L("লাইন", "lines")} · {L("জমা", "In")} {money(imp.summary.totalIn)} · {L("খরচ", "Out")} {money(imp.summary.totalOut)}
                    {imp.summary.closing != null && <> · {L("শুরু", "Opening")} {money(imp.summary.opening)} · {L("শেষ", "Closing")} <b>{money(imp.summary.closing)}</b></>}
                    {imp.summary.balanced === false && <span style={{ color: "#b91c1c" }}> · {L("স্টেটমেন্টের ব্যালেন্স কলাম লাইনের সাথে মেলেনি - ফাইল দেখে নিন", "The statement's balance column does not follow its lines - check the file")}</span>}
                  </div>
                )}
                {imp.skipped.length > 0 && (
                  <div className="si-muted">{L("বাদ দেওয়া সারি", "Skipped rows")}: {imp.skipped.map((s) => `${s.row} (${{ date: L("তারিখ নেই", "no date"), amount: L("টাকা নেই", "no amount"), both: L("ডেবিট আর ক্রেডিট দুটোই", "debit and credit both") }[s.reason] || s.reason})`).join(", ")}</div>
                )}
                {lockDate && lockedLines(imp.lines, lockDate).length > 0 && <div className="si-paid-box is-due">{L(`${lockedLines(imp.lines, lockDate).length}টি লাইন পিরিয়ড লকের (${fmtDay(lockDate)}) আগে - এগুলো বাদ যাবে`, `${lockedLines(imp.lines, lockDate).length} line(s) are on or before the period lock (${fmtDay(lockDate)}) - they are left out`)}</div>}
                {chosenTwice.length > 0 && <div className="si-paid-box is-due">{L("একই লেনদেন দুটো লাইনে বাছা হয়েছে", "The same movement is picked for two lines")}</div>}
                <div style={{ overflow: "auto", maxHeight: mobile ? undefined : 420 }}>
                  <table className="pm-table">
                    <thead><tr>
                      <th style={{ width: 80 }}>{L("তারিখ", "Date")}</th><th>{L("বিবরণ", "Description")}</th>
                      <th style={{ width: 90 }} className="si-num">{L("জমা", "In")}</th><th style={{ width: 90 }} className="si-num">{L("খরচ", "Out")}</th>
                      <th style={{ width: 330 }}>{L("S4-এ কোন লেনদেন", "S4 movement")}</th>
                    </tr></thead>
                    <tbody>
                      {imp.lines.map((l, i) => {
                        const r = imp.rows[i];
                        const lockedLine = !!lockDate && l.date <= lockDate;
                        const sameDir = ENTRY_TYPES.filter((x) => x.dir === l.dir);
                        return (
                          <tr key={`${l.row}-${i}`} style={lockedLine ? { color: "#94a3b8" } : undefined}>
                            <td>{fmtDay(l.date)}</td>
                            <td title={l.desc}>{l.desc}{l.ref ? <span className="si-muted"> · {l.ref}</span> : null}</td>
                            <td className="si-num" style={{ color: "#15803d" }}>{l.dir === "in" ? money(l.amount) : ""}</td>
                            <td className="si-num" style={{ color: "#b91c1c" }}>{l.dir === "out" ? money(l.amount) : ""}</td>
                            <td>
                              <select className="pm-input" style={{ height: 24, borderColor: r.status === "ambiguous" && !r.choice ? "#b45309" : undefined }} disabled={lockedLine}
                                value={r.choice ? `t:${r.choice}` : r.entryType ? `e:${r.entryType}` : ""}
                                onChange={(e) => { const v = e.target.value; setImpRow(i, v.startsWith("t:") ? { choice: v.slice(2), entryType: "" } : v.startsWith("e:") ? { choice: "", entryType: v.slice(2) } : { choice: "", entryType: "" }); }}>
                                <option value="">{r.status === "ambiguous" ? L("একাধিক মিল - বেছে নিন", "Several fit - pick one") : L("বাদ দিন", "Skip")}</option>
                                {r.candidates.map((k) => { const t = txByKey.get(k); return t ? <option key={k} value={`t:${k}`}>{`${fmtDay(t.date)} · ${COL_LABEL[t.col]?.[bn ? 0 : 1] || t.col} ${t.no || ""} · ${t.party || ""} · ${money(t.amount)}`}</option> : null; })}
                                {sameDir.map((x) => <option key={x.key} value={`e:${x.key}`}>{L("নতুন ব্যাংক এন্ট্রি", "New bank entry")}: {bn ? x.bn : x.en}</option>)}
                              </select>
                              {r.status === "match" && r.choice && <span className="si-muted" style={{ marginLeft: 4 }}>{L("প্রস্তাব", "suggested")}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="si-hint" style={{ marginLeft: 0 }}>
                  {L("মিল খোঁজা হয় একই দিক, টাকা ±০.০৫ আর তারিখ ±৩ দিনের মধ্যে; একাধিক সমান মিল হলে নিজে বেছে নিতে হয়। মিলালে শুধু S4-এর লেনদেনটা 'ব্যাংকে মিলেছে' চিহ্নিত হয় - বিল বা ভাউচারের টাকা বদলায় না। ব্যাংকে আছে কিন্তু S4-এ নেই (চার্জ, সুদ, নগদ জমা / উত্তোলন) সেগুলো নতুন ব্যাংক এন্ট্রি হিসেবে যোগ করা যায়; বাকিগুলোর জন্য আগে S4-এ ভাউচার লিখুন।",
                    "Matches need the same direction, an amount within 0.05 and a date within 3 days; when several fit equally you pick one. A match only marks the S4 movement as cleared in the bank - no bill or voucher amount changes. Bank-only lines (charges, interest, cash deposits / withdrawals) can be added as new bank entries; for anything else write the voucher in S4 first.")}
                </div>
              </div>
            </div>
            <div className="si-actions si-sticky-actions" style={{ background: "transparent" }}>
              <span>{L("মিল", "Matched")} <b>{imp.rows.filter((r) => r.choice).length}</b> · {L("নতুন এন্ট্রি", "New entries")} <b>{imp.rows.filter((r) => !r.choice && r.entryType).length}</b> · {L("বাকি", "Left")} <b>{imp.rows.filter((r) => !r.choice && !r.entryType).length}</b></span>
              <span className="si-toolbar-gap" />
              <button type="button" className="pm-btn-secondary" onClick={() => setImp(null)}>{L("বন্ধ", "Close")}</button>
              <button type="button" className="pm-btn pm-btn--primary" disabled={!!busy || chosenTwice.length > 0} onClick={applyImport}> {L("প্রয়োগ করুন", "Apply")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
