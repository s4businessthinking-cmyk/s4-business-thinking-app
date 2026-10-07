import React, { useEffect, useMemo, useRef, useState } from "react";
import { offlineCreate, offlineRemove, offlineUpdate } from "../offline/offlineRepository";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";
import { EXPENSE_CATEGORIES } from "../expenses/ExpensesTab.jsx";
import { ACCOUNT_VOUCHER_TYPES, CASH_ACCOUNT, checkContra, checkJournal, r2, voucherParticulars } from "./accountVoucherDomain.js";

const COL = "accountVouchers";
const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const d = new Date(); return localDay(new Date(d.getFullYear(), d.getMonth(), 1)); };
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const emptyLine = () => ({ account: "", debit: "", credit: "", note: "" });
const emptyForm = (type) => (type === "contra"
  ? { voucherDate: localDay(), fromAccount: CASH_ACCOUNT, toAccount: "", amount: "", refNo: "", narration: "" }
  : { voucherDate: localDay(), lines: [emptyLine(), emptyLine()], refNo: "", narration: "" });

const TILE_CSS = `
.vt-menu { display: flex; flex-direction: column; align-items: center; padding: 18px 10px; }
.vt-card { width: min(560px, 100%); border: 2px solid #1e4f8f; border-radius: 10px 10px 4px 4px; background: #fff; overflow: hidden; box-shadow: 0 6px 18px rgba(15,40,80,.15); }
.vt-card-title { background: linear-gradient(180deg, #2d6cc0, #1a4f97); color: #fff; font-weight: 800; padding: 6px 14px; font-size: 14px; }
.vt-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 14px; }
.vt-tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px; border: 1px solid transparent; border-radius: 8px; background: transparent; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 800; color: #0f172a; }
.vt-tile:hover:not(:disabled), .vt-tile:focus-visible { background: #e8f1ff; border-color: #93b8ea; outline: none; }
.vt-tile:disabled { opacity: .35; cursor: not-allowed; }
.vt-tile-icon { font-size: 40px; line-height: 1; }
.vt-tile small { font-weight: 400; font-size: 10.5px; color: #475569; text-align: center; }
.vt-lines { width: 100%; border-collapse: collapse; }
.vt-lines th { background: #e5edf7; font-size: 11px; padding: 4px; text-align: left; }
.vt-lines td { padding: 2px; }
.vt-lines input { width: 100%; }
.vt-diff { font-weight: 800; }
@media (max-width: 760px) { .vt-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .vt-tile-icon { font-size: 34px; } }
`;

export default function VouchersTab({
  lang = "en", shopId, user, profile, isOwner, canJournal = false, cur = "AED", toast, shopName = "",
  makeNo, leaveGuard = null, customers = [], vendors = [], banks = [],
  onOpenReceipts, onOpenPayments, onOpenDebitNote, onOpenCreditNote,
}) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [view, setView] = useState(null);
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localDay());
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [baseline, setBaseline] = useState("");
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);
  const type = ACCOUNT_VOUCHER_TYPES[view] || null;

  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName: COL, shopId, onRows: (list) => setRows(list || []) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId]);

  const accountNames = useMemo(() => {
    const names = [
      CASH_ACCOUNT, ...banks.map((b) => `Bank - ${b}`), "Capital", "Drawings", "Sales", "Purchase", "Discount Allowed", "Discount Received",
      ...EXPENSE_CATEGORIES.filter((c) => c.key !== "other").map((c) => c.en),
      ...customers.filter((c) => c && !c.isDeleted).map((c) => c.customerName),
      ...vendors.filter((v) => v && !v.isDeleted).map((v) => v.vendorName),
    ];
    return [...new Set(names.map((x) => String(x || "").trim()).filter(Boolean))];
  }, [banks, customers, vendors]);

  const mine = useMemo(() => rows.filter((r) => r && !r.isDeleted && r.shopId === shopId && r.voucherType === view && (isOwner || r.createdBy === user?.uid)),
    [rows, shopId, view, isOwner, user?.uid]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mine
      .filter((r) => showCancelled || r.status !== "cancelled")
      .filter((r) => (!from || String(r.voucherDate) >= from) && (!to || String(r.voucherDate) <= to))
      .filter((r) => !q || [r.voucherNo, r.narration, r.refNo, voucherParticulars(r)].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a, b) => String(b.voucherDate).localeCompare(String(a.voucherDate)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }, [mine, from, to, search, showCancelled]);
  const active = filtered.filter((r) => r.status !== "cancelled");
  const total = active.reduce((t, r) => t + r2(r.totalAmount), 0);

  const editRow = editId ? rows.find((r) => r.id === editId) : null;
  const readOnly = !!editRow && (editRow.status === "cancelled" || !(isOwner || (canJournal && editRow.createdBy === user?.uid)));
  const formDirty = !!form && !readOnly && JSON.stringify(form) !== baseline;

  const openNew = () => { const f = emptyForm(view); setEditId(null); setForm(f); setBaseline(JSON.stringify(f)); };
  const openRow = (r) => {
    const f = r.voucherType === "contra"
      ? { voucherDate: r.voucherDate || localDay(), fromAccount: r.fromAccount || "", toAccount: r.toAccount || "", amount: String(r.totalAmount ?? ""), refNo: r.refNo || "", narration: r.narration || "" }
      : { voucherDate: r.voucherDate || localDay(), lines: (r.lines || []).map((l) => ({ account: l.account || "", debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "", note: l.note || "" })), refNo: r.refNo || "", narration: r.narration || "" };
    setEditId(r.id); setForm(f); setBaseline(JSON.stringify(f));
  };
  const closeForm = () => {
    if (saving) return;
    if (formDirty && !window.confirm(L("সেভ না করা পরিবর্তন আছে। বন্ধ করবেন?", "You have unsaved changes. Close anyway?"))) return;
    setForm(null); setEditId(null);
  };

  const checkErrorText = (error, res) => ({
    lines: L("❌ অন্তত দুটো লাইন লিখুন", "❌ Enter at least two lines"),
    account: L("❌ প্রতিটা লাইনে খাতের (Account) নাম দিন", "❌ Every line needs an account"),
    side: L("❌ প্রতিটা লাইনে শুধু Debit অথবা শুধু Credit লিখুন", "❌ Each line takes either a Debit or a Credit"),
    balance: L(`❌ Debit (${money(res?.debit)}) আর Credit (${money(res?.credit)}) সমান নয়`, `❌ Debit (${money(res?.debit)}) and Credit (${money(res?.credit)}) do not match`),
    same: L("❌ যেখান থেকে আর যেখানে — দুটো একই হতে পারবে না", "❌ From and To must be different"),
    amount: L("❌ সঠিক টাকার পরিমাণ লিখুন", "❌ Enter a valid amount"),
  }[error] || `❌ ${error}`);

  const save = async () => {
    if (saving || !form || readOnly) return;
    if (!form.voucherDate) { toast?.(L("❌ তারিখ দিন", "❌ Pick a date"), "err"); return; }
    const res = view === "contra" ? checkContra(form) : checkJournal(form.lines);
    if (res.error) { toast?.(checkErrorText(res.error, res), "err"); return; }
    setSaving(true);
    const nowIso = new Date().toISOString();
    const body = {
      voucherDate: form.voucherDate, lines: res.rows, totalAmount: res.total,
      fromAccount: view === "contra" ? res.from : "", toAccount: view === "contra" ? res.to : "",
      refNo: form.refNo.trim(), narration: form.narration.trim(), updatedAt: nowIso, updatedBy: user?.uid || "",
    };
    try {
      if (editRow) {
        await offlineUpdate(COL, editRow.id, { ...editRow, ...body });
        setRows((list) => list.map((r) => (r.id === editRow.id ? { ...r, ...body } : r)));
        toast?.(L(`✅ ${editRow.voucherNo} আপডেট হয়েছে`, `✅ ${editRow.voucherNo} updated`));
        logAudit({ shopId, user, profile, action: "edit", collection: COL, docId: editRow.id, docNo: editRow.voucherNo, amount: res.total, note: voucherParticulars({ ...editRow, ...body }) });
      } else {
        const voucherNo = await makeNo(type.serial, type.prefix, rows.filter((r) => r.voucherType === view).map((r) => r.voucherNo));
        const payload = { ...body, shopId, voucherType: view, voucherNo, status: "active", createdBy: user?.uid || "", createdByName: profile?.personName || "", createdAt: nowIso };
        const result = await offlineCreate(COL, payload);
        setRows((list) => [{ ...payload, id: result.documentId }, ...list]);
        toast?.(L(`✅ ${voucherNo} সেভ হয়েছে`, `✅ ${voucherNo} saved`));
        logAudit({ shopId, user, profile, action: "create", collection: COL, docId: result.documentId, docNo: voucherNo, amount: res.total, note: voucherParticulars(payload) });
      }
      setForm(null); setEditId(null);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const cancelRow = async (r) => {
    if (!window.confirm(L(`${r.voucherNo} বাতিল করবেন?`, `Cancel ${r.voucherNo}?`))) return;
    const nowIso = new Date().toISOString();
    const patch = { status: "cancelled", cancelledAt: nowIso, cancelledBy: user?.uid || "", updatedAt: nowIso, updatedBy: user?.uid || "" };
    try {
      await offlineUpdate(COL, r.id, { ...r, ...patch });
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
      setForm(null); setEditId(null);
      toast?.(L(`${r.voucherNo} বাতিল হয়েছে`, `${r.voucherNo} cancelled`));
      logAudit({ shopId, user, profile, action: "cancel", collection: COL, docId: r.id, docNo: r.voucherNo, amount: r.totalAmount });
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };

  const deleteRow = async (r) => {
    if (!isOwner || r.status !== "cancelled") return;
    if (!window.confirm(L(`${r.voucherNo} একেবারে মুছে ফেলবেন?`, `Delete ${r.voucherNo} permanently?`))) return;
    try {
      await offlineRemove(COL, r.id);
      setRows((list) => list.filter((x) => x.id !== r.id));
      setForm(null); setEditId(null);
      toast?.(L(`${r.voucherNo} মুছে ফেলা হয়েছে`, `${r.voucherNo} deleted`), "err");
      logAudit({ shopId, user, profile, action: "delete", collection: COL, docId: r.id, docNo: r.voucherNo, amount: r.totalAmount });
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };

  const printVoucher = (r) => {
    const t = ACCOUNT_VOUCHER_TYPES[r.voucherType];
    const cols = [{ label: "Account" }, { label: "Note" }, { label: `Debit (${cur})`, align: "right" }, { label: `Credit (${cur})`, align: "right" }];
    const body = (r.lines || []).map((l) => [l.account, l.note || "", l.debit ? money(l.debit) : "", l.credit ? money(l.credit) : ""]);
    const partyLine = [r.narration, r.refNo ? `Ref: ${r.refNo}` : "", r.status === "cancelled" ? "CANCELLED" : ""].filter(Boolean).join(" · ");
    printWithSettings(generateStatementHTML({
      shopName, title: t.printTitle, subtitle: `${r.voucherNo} · ${fmtDay(r.voucherDate)}`, partyLine,
      cols, rows: body, foot: ["", "TOTAL", money(r.totalAmount), money(r.totalAmount)],
    }), { lang });
  };

  const printList = () => {
    const cols = [{ label: "Date" }, { label: "No" }, { label: "Particulars" }, { label: "Narration" }, { label: `Amount (${cur})`, align: "right" }];
    const body = active.map((r) => [fmtDay(r.voucherDate), r.voucherNo || "", voucherParticulars(r), r.narration || "", money(r.totalAmount)]);
    printWithSettings(generateStatementHTML({
      shopName, title: `${type.printTitle} REGISTER`, subtitle: `${from ? fmtDay(from) : "Start"} — ${to ? fmtDay(to) : "Today"}`,
      cols, rows: body, foot: ["", "", "", "TOTAL", money(total)],
    }), { lang });
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
      else if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "s") { e.preventDefault(); save(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const tiles = [
    { key: "receipts", icon: "💰", label: "Receipts", hint: L("কাস্টমার থেকে টাকা পাওয়া", "Money received from customers"), onClick: onOpenReceipts },
    { key: "payments", icon: "💸", label: "Payments", hint: L("ভেন্ডরকে টাকা দেওয়া", "Money paid to vendors"), onClick: onOpenPayments },
    { key: "journal", icon: "📒", label: "Journal", hint: L("খাতায় সংশোধন / স্থানান্তর", "Book adjustments"), onClick: canJournal ? () => setView("journal") : null },
    { key: "contra", icon: "🔁", label: "Contra", hint: L("ক্যাশ ⇄ ব্যাংক", "Cash ⇄ Bank"), onClick: canJournal ? () => setView("contra") : null },
    { key: "debit", icon: "↪️", label: "Debit Note", hint: L("ভেন্ডরকে মাল ফেরত", "Purchase return"), onClick: onOpenDebitNote },
    { key: "credit", icon: "↩️", label: "Credit Note", hint: L("কাস্টমার থেকে মাল ফেরত", "Sales return"), onClick: onOpenCreditNote },
  ];

  if (!type) {
    return (
      <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
        <style>{PM_CSS}</style>
        <style>{SI_CSS}</style>
        <style>{TILE_CSS}</style>
        <div className="pm-reference-title"><strong>🧾 {L("ভাউচার", "Vouchers")}</strong></div>
        <div className="vt-menu">
          <div className="vt-card">
            <div className="vt-card-title">Select Voucher</div>
            <div className="vt-grid">
              {tiles.map((tile) => (
                <button key={tile.key} type="button" className="vt-tile" disabled={!tile.onClick} onClick={() => tile.onClick?.()}
                  title={tile.onClick ? tile.hint : L("অনুমতি নেই", "No permission")}>
                  <span className="vt-tile-icon">{tile.icon}</span>
                  {tile.label}
                  <small>{tile.hint}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const today = localDay();
  const quick = [
    ["today", L("আজ", "Today"), today, today],
    ["month", L("এই মাস", "This month"), monthStart(), today],
    ["year", L("এই বছর", "This year"), `${new Date().getFullYear()}-01-01`, today],
    ["all", L("সব", "All"), "", ""],
  ];
  const activeQuick = quick.find(([, , f, t]) => f === from && t === to)?.[0];
  const typeTitle = type.title[bn ? "bn" : "en"];
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setLine = (i, k, v) => setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const fField = (label, control, extra) => (<div className="si-field" style={extra}><span className="pm-label">{label}</span>{control}</div>);
  const drTotal = form?.lines ? r2(form.lines.reduce((t, l) => t + r2(l.debit), 0)) : 0;
  const crTotal = form?.lines ? r2(form.lines.reduce((t, l) => t + r2(l.credit), 0)) : 0;

  const journalFields = form?.lines && (
    <div style={{ overflowX: "auto" }}>
      <table className="vt-lines">
        <thead><tr>
          <th>{L("খাত (Account)", "Account")}</th>
          <th style={{ width: 110 }}>Debit</th>
          <th style={{ width: 110 }}>Credit</th>
          <th style={{ width: mobile ? 120 : 180 }}>{L("বিবরণ", "Note")}</th>
          {!readOnly && <th style={{ width: 30 }} />}
        </tr></thead>
        <tbody>
          {form.lines.map((l, i) => (
            <tr key={i}>
              <td><input className="pm-input" list="vt-accounts" disabled={readOnly} value={l.account} onChange={(e) => setLine(i, "account", e.target.value)} autoFocus={i === 0 && !mobile && !readOnly && !editRow} /></td>
              <td><input className="pm-input" inputMode="decimal" disabled={readOnly} value={l.debit} onChange={(e) => setLine(i, "debit", e.target.value)} style={{ textAlign: "right" }} /></td>
              <td><input className="pm-input" inputMode="decimal" disabled={readOnly} value={l.credit} onChange={(e) => setLine(i, "credit", e.target.value)} style={{ textAlign: "right" }} /></td>
              <td><input className="pm-input" disabled={readOnly} value={l.note} onChange={(e) => setLine(i, "note", e.target.value)} /></td>
              {!readOnly && <td><button type="button" className="pm-btn-secondary" disabled={form.lines.length <= 2} onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}>✕</button></td>}
            </tr>
          ))}
        </tbody>
        <tfoot><tr>
          <td>{!readOnly && <button type="button" className="pm-btn-secondary" onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))}>+ {L("লাইন", "Line")}</button>}</td>
          <td className="si-num si-strong">{money(drTotal)}</td>
          <td className="si-num si-strong">{money(crTotal)}</td>
          <td className="vt-diff" style={{ color: drTotal === crTotal ? "#15803d" : "#b91c1c" }}>
            {drTotal === crTotal ? L("✔ সমান", "✔ Balanced") : `${L("পার্থক্য", "Difference")} ${money(Math.abs(drTotal - crTotal))}`}
          </td>
          {!readOnly && <td />}
        </tr></tfoot>
      </table>
    </div>
  );

  const contraFields = form && view === "contra" && (
    <>
      <div className="si-grid2">
        {fField(`${L("যেখান থেকে", "From")} *`, <input className="pm-input" list="vt-money-accounts" disabled={readOnly} value={form.fromAccount} onChange={(e) => setF("fromAccount", e.target.value)} />)}
        {fField(`${L("যেখানে", "To")} *`, <input className="pm-input" list="vt-money-accounts" disabled={readOnly} value={form.toAccount} onChange={(e) => setF("toAccount", e.target.value)} placeholder={L("যেমন: Bank - ADCB", "e.g. Bank - ADCB")} autoFocus={!mobile && !readOnly && !editRow} />)}
      </div>
      {fField(`${L("টাকা", "Amount")} (${cur}) *`, <input className="pm-input" inputMode="decimal" disabled={readOnly} value={form.amount} placeholder="0.00" onChange={(e) => setF("amount", e.target.value)} style={{ fontWeight: 700 }} />)}
    </>
  );

  const formTitle = !editRow ? `${type.icon} ${L("নতুন", "New")} ${typeTitle}` : readOnly ? `🧾 ${editRow.voucherNo}` : `✏️ ${typeTitle} — ${editRow.voucherNo}`;
  const formWindow = form && (
    <div className="pm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm(); }}>
      <div className="pm-window" style={{ maxWidth: mobile ? undefined : 820 }}>
        <div className="pm-window-title">
          <span>{formTitle}</span>
          <button type="button" className="pm-window-close" onClick={closeForm}>✕</button>
        </div>
        <div className="pm-window-body">
          {readOnly && editRow?.status !== "cancelled" && <div className="si-hint" style={{ marginLeft: 0 }}>🔒 {L("শুধু দেখতে পারবেন", "View only")}</div>}
          <div className="si-panel-body" style={{ gap: 6 }}>
            <div className="si-grid2">
              {fField(`${L("তারিখ", "Date")} *`, <input type="date" className="pm-input" disabled={readOnly} value={form.voucherDate} onChange={(e) => setF("voucherDate", e.target.value)} />)}
              {fField(L("রেফারেন্স নং", "Ref No"), <input className="pm-input" disabled={readOnly} value={form.refNo} onChange={(e) => setF("refNo", e.target.value)} />)}
            </div>
            {view === "contra" ? contraFields : journalFields}
            {fField(L("বিবরণ (Narration)", "Narration"), <textarea className="pm-input" disabled={readOnly} rows={2} value={form.narration} onChange={(e) => setF("narration", e.target.value)} style={{ height: mobile ? 64 : 44 }} />)}
            <div className="si-hint" style={{ marginLeft: 0 }}>ℹ️ {L("এটা শুধু হিসাবের খাতায় লেখা থাকে — কাস্টমার/ভেন্ডরের বাকি বা স্টক বদলায় না", "This is a book record only — it does not change customer/vendor balances or stock")}</div>
            {editRow && <div className="si-hint" style={{ marginLeft: 0 }}>{editRow.voucherNo}{editRow.createdByName ? ` · ${L("লিখেছেন", "By")} ${editRow.createdByName}` : ""}{editRow.status === "cancelled" ? ` · ${L("বাতিল করা হয়েছে", "Cancelled")}` : ""}</div>}
          </div>
        </div>
        <div className="si-actions si-sticky-actions" style={{ background: "transparent" }}>
          {editRow && !readOnly && <button type="button" className="pm-btn-secondary pm-btn--danger" disabled={saving} onClick={() => cancelRow(editRow)}>✖ {L("বাতিল", "Cancel voucher")}</button>}
          {editRow && editRow.status === "cancelled" && isOwner && <button type="button" className="pm-btn-secondary pm-btn--danger" disabled={saving} onClick={() => deleteRow(editRow)}>🗑️ {L("মুছে ফেলুন", "Delete")}</button>}
          {editRow && <button type="button" className="pm-btn-secondary" onClick={() => printVoucher(editRow)}>🖨️ {L("প্রিন্ট", "Print")}</button>}
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn-secondary" disabled={saving} onClick={closeForm}>{L("বন্ধ", "Close")}</button>
          {!readOnly && (
            <button type="button" className="pm-btn pm-btn--primary" disabled={saving} onClick={save}>
              {saving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${editRow ? L("আপডেট", "Update") : L("সেভ", "Save")} (Ctrl+S)`}
            </button>
          )}
        </div>
      </div>
      <datalist id="vt-accounts">{accountNames.map((a) => <option key={a} value={a} />)}</datalist>
      <datalist id="vt-money-accounts">{[CASH_ACCOUNT, ...banks.map((b) => `Bank - ${b}`)].map((a) => <option key={a} value={a} />)}</datalist>
    </div>
  );

  const statusCell = (r) => (r.status === "cancelled" ? <span className="si-badge" style={{ color: "#6b7280", marginRight: 4 }}>{L("বাতিল", "Cancelled")}</span> : null);
  const listTable = (
    <table className="pm-table">
      <thead><tr>
        <th style={{ width: 80 }}>{L("তারিখ", "Date")}</th>
        <th style={{ width: 90 }}>{L("নং", "No")}</th>
        <th>{L("খাত", "Particulars")}</th>
        <th>{L("বিবরণ", "Narration")}</th>
        {isOwner && <th style={{ width: 100 }}>{L("লিখেছেন", "By")}</th>}
        <th style={{ width: 110 }} className="si-num">{L("টাকা", "Amount")}</th>
      </tr></thead>
      <tbody>
        {filtered.map((r) => (
          <tr key={r.id} className={`pm-clickable${editId === r.id ? " pm-selected" : ""}`} onClick={() => openRow(r)} style={r.status === "cancelled" ? { color: "#6b7280" } : undefined}>
            <td>{fmtDay(r.voucherDate)}</td>
            <td className="si-strong">{r.voucherNo}</td>
            <td title={voucherParticulars(r)}>{voucherParticulars(r)}</td>
            <td title={r.narration || ""}>{r.refNo ? `[${r.refNo}] ` : ""}{r.narration || ""}</td>
            {isOwner && <td>{r.createdByName || ""}</td>}
            <td className="si-num si-strong" style={r.status === "cancelled" ? { textDecoration: "line-through" } : undefined}>{statusCell(r)}{money(r.totalAmount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const listMobile = filtered.map((r) => (
    <button key={r.id} type="button" className="si-mrow" onClick={() => openRow(r)} style={r.status === "cancelled" ? { opacity: 0.6 } : undefined}>
      <div className="si-mrow-top"><span>{r.voucherNo}</span><span>{cur} {money(r.totalAmount)}</span></div>
      <div className="si-mrow-sub"><span>{fmtDay(r.voucherDate)} · {voucherParticulars(r)}</span><span>{statusCell(r)}</span></div>
      {r.narration && <div className="si-mrow-sub"><span>{r.narration}</span></div>}
    </button>
  ));

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{TILE_CSS}</style>
      <div className="pm-reference-title">
        <strong>{type.icon} {typeTitle}</strong>
        <span>{from ? fmtDay(from) : L("শুরু", "Start")} — {to ? fmtDay(to) : L("আজ", "Today")}</span>
      </div>
      <div className="si-toolbar">
        <button type="button" className="pm-btn-secondary" onClick={() => { setView(null); setForm(null); setEditId(null); }}>← {L("ভাউচার", "Vouchers")}</button>
        {canJournal && <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {L("নতুন", "New")} {typeTitle}</button>}
        <button type="button" className="pm-btn-secondary" onClick={printList} disabled={!active.length}>🖨️ {L("প্রিন্ট", "Print")}</button>
        <span className="si-toolbar-gap" />
        <div className="si-pills">
          {quick.map(([key, label, f, t]) => (
            <button key={key} type="button" className={`pm-btn-secondary${activeQuick === key ? " is-active" : ""}`} onClick={() => { setFrom(f); setTo(t); }}>{label}</button>
          ))}
        </div>
        <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120 }} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="si-filters">
        <div className="si-search">
          <input className="pm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("খুঁজুন: নং, খাত, বিবরণ…", "Search: no, account, narration…")} />
          {search && <button type="button" onClick={() => setSearch("")}>✕</button>}
        </div>
        <label className="pm-check"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> {L("বাতিলগুলোও দেখাও", "Show cancelled")}</label>
      </div>
      <div className="si-main is-all">
        <div className="si-box">
          {filtered.length ? (mobile ? listMobile : listTable) : <div className="si-empty">{mine.length ? L("এই ফিল্টারে কিছু নেই", "Nothing matches these filters") : L("এখনো কোনো ভাউচার নেই", "No vouchers yet")}</div>}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{L("দেখাচ্ছে", "Showing")} <b>{filtered.length}</b> / {mine.length}</span>
        <span>{L("মোট", "Total")} <b>{cur} {money(total)}</b></span>
        {!isOwner && <span>{L("শুধু আপনার লেখা ভাউচার দেখাচ্ছে", "Showing only vouchers you entered")}</span>}
      </div>
      {formWindow}
    </div>
  );
}
