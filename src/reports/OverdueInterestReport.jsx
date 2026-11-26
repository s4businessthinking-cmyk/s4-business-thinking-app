// Interest on overdue bills: customer (and, when switched on, supplier) bills past their due date as at a date, the
// interest on each (simple, actual/365, after the grace days), party totals, print and Excel; the owner's rate settings
// and the "Post interest" journal. Rules in accounts/overdueInterest.js; open amounts follow the ageing report.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineGetById, offlineList, offlineUpdate, offlineUpsert } from "../offline/offlineRepository";
import { saveShopRecord } from "../offline/shopService";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { logAudit } from "../utils/auditLog.js";
import { activePeriodLock } from "../accounts/periodLock.js";
import { buildGlobalLedger } from "../ledger/globalLedger.js";
import { shopAccountNature } from "../ledger/accountNature.js";
import { csvText } from "./vatExport.js";
import { r2 } from "./reportFilters.js";
import {
  INTEREST_DAY_BASIS, interestBlockers, interestFileName, interestJournal, interestJournalId, interestRows, interestSettingsOf, interestSettingsProblem, overdueInterest,
} from "../accounts/overdueInterest.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const OI_CSS = `
.oi-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.oi-table th { text-align: left; background: #e8eef7; padding: 4px 6px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; }
.oi-table td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; }
.oi-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.oi-table tr.is-total td { font-weight: 800; background: #f4f7fc; }
.oi-table tr.is-party td { background: #f8fafc; font-weight: 700; }
`;

export default function OverdueInterestReport({ lang = "en", shopId, shop = null, user = null, profile = null, isOwner = false, customers = [], vendors = [], shopName = "", cur = "AED", toast, canPrint = false, onShopUpdated }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const today = localDay();
  const [asOf, setAsOf] = useState(today);
  const [side, setSide] = useState("customer");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  // same documents and ledger as the debtors / creditors ageing
  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([
      loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses"),
      offlineList("accountVouchers").catch(() => []), offlineList("partnerEntries").catch(() => []), offlineList("bankReconciliations").catch(() => []),
    ]).then(([rows, rc, pm, ex, av, pe, br]) => {
      if (cancelled) return;
      setData({
        salesInvoices: rows.salesInvoices, purchaseInvoices: rows.purchaseInvoices,
        salesReturns: rows.extras?.salesReturns || [], purchaseReturns: rows.extras?.purchaseReturns || [],
        receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex), accountVouchers: rowsOf(av),
        partnerEntries: rowsOf(pe), bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
      });
    }).catch((err) => { console.warn("[S4 Overdue interest] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const settings = useMemo(() => interestSettingsOf(shop), [shop]);
  const sideOn = side === "customer" ? settings.enabled : settings.enabled && settings.apEnabled;
  const rate = side === "customer" ? settings.arRate : settings.apRate;
  const day = asOf || today;
  const natureOf = useMemo(() => shopAccountNature(shop), [shop?.chartOfAccounts, shop?.coaGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const ledger = useMemo(() => (data ? buildGlobalLedger(data, { shopId, customers, vendors, natureOf, expenseLabel: (e) => expenseCategoryLabel(e, false) }) : null),
    [data, shopId, customers, vendors, natureOf]);
  const parties = side === "customer" ? customers : vendors;
  const rep = useMemo(() => (ledger && sideOn ? overdueInterest(ledger, {
    side, asOf: day, bills: side === "customer" ? data.salesInvoices : data.purchaseInvoices, parties, vouchers: data.accountVouchers, rate, graceDays: settings.graceDays, shopId,
  }) : null), [ledger, sideOn, side, day, data, parties, rate, settings.graceDays, shopId]);
  const existing = useMemo(() => (data?.accountVouchers || []).find((v) => v?.id === interestJournalId(side, day) && v.status !== "cancelled" && !v.isDeleted) || null, [data, side, day]);
  const lockDate = activePeriodLock();
  const blockers = rep ? interestBlockers({ asOf: day, today, lockDate, rep, existing, parties, side }) : [];
  const ruleText = L(`বছরে ${rate}% সরল সুদ, প্রকৃত দিন / ${INTEREST_DAY_BASIS}, শেষ তারিখের পর ${settings.graceDays} দিন ছাড়`, `${rate}% a year, simple, actual days / ${INTEREST_DAY_BASIS}, ${settings.graceDays} grace day(s) after the due date`);
  const sideName = side === "customer" ? L("কাস্টমার", "Customers") : L("সাপ্লায়ার", "Suppliers");

  const print = () => {
    if (!rep) return;
    const rows = interestRows(rep);
    printWithSettings(generateStatementHTML({
      shopName, title: L("বকেয়া বিলে সুদ", "INTEREST ON OVERDUE BILLS"), subtitle: `${sideName} · ${fmtDay(day)}`, partyLine: ruleText,
      cols: rows[0].map((label, i) => ({ label, align: i >= 4 ? "right" : undefined })), rows: rows.slice(1),
    }), { lang });
  };
  const exportCsv = async () => {
    if (!rep) return;
    try { await saveTextFile(interestFileName(side, day), csvText(interestRows(rep))); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const post = async () => {
    if (!isOwner || busy || !rep || blockers.length) return;
    const j = interestJournal(rep, { side, asOf: day, rate, shopId, uid: user?.uid || "", by: profile?.personName || profile?.username || user?.email || "" });
    if (!j) return;
    if (!window.confirm(L(`${fmtDay(day)} পর্যন্ত ${rep.parties.length} পার্টির ${cur} ${money(j.total)} সুদ জার্নালে লেখা হবে (${j.doc.voucherNo})। চালাবেন?`,
      `Post ${cur} ${money(j.total)} of interest to ${fmtDay(day)} for ${rep.parties.length} part${rep.parties.length === 1 ? "y" : "ies"} as journal ${j.doc.voucherNo}?`))) return;
    setBusy(true);
    try {
      const prev = await offlineGetById("accountVouchers", j.id).catch(() => null);
      if (prev?.data) await offlineUpdate("accountVouchers", j.id, { ...j.doc, createdAt: prev.data.createdAt || j.doc.createdAt, cancelledAt: null, cancelledBy: null, cancelReason: null });
      else await offlineUpsert("accountVouchers", j.id, j.doc);
      // read it back so the message is only shown for a voucher that is really saved
      const saved = await offlineGetById("accountVouchers", j.id).catch(() => null);
      if (!saved?.data || saved.data.status !== "active") throw new Error(L("জার্নাল সেভ হয়নি", "The journal was not saved"));
      logAudit({ shopId, user, profile, action: "create", collection: "accountVouchers", docId: j.id, docNo: j.doc.voucherNo, amount: j.total, note: `Overdue interest ${side === "vendor" ? "suppliers" : "customers"} to ${day}` });
      toast?.(L(`সুদ জার্নাল ${j.doc.voucherNo} সেভ হয়েছে`, `Interest journal ${j.doc.voucherNo} saved`));
      setTick((v) => v + 1);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); }
  };
  const cancelPosted = async () => {
    if (!isOwner || busy || !existing) return;
    if (lockDate && existing.voucherDate <= lockDate) { toast?.(L(`${fmtDay(lockDate)} পর্যন্ত লক`, `Locked up to ${fmtDay(lockDate)}`), "err"); return; }
    const later = (data?.accountVouchers || []).some((v) => v?.source === "overdueInterest" && v.interestSide === side && v.status !== "cancelled" && !v.isDeleted && v.voucherDate > existing.voucherDate);
    if (later) { toast?.(L("এর পরের সুদ জার্নাল আছে - আগে সেটা বাতিল করুন", "A later interest journal exists - cancel that first"), "err"); return; }
    if (!window.confirm(L(`${existing.voucherNo} বাতিল করবেন?`, `Cancel ${existing.voucherNo}?`))) return;
    setBusy(true);
    try {
      await offlineUpdate("accountVouchers", existing.id, { status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: user?.uid || "", cancelReason: "Overdue interest cancelled" });
      logAudit({ shopId, user, profile, action: "cancel", collection: "accountVouchers", docId: existing.id, docNo: existing.voucherNo, amount: existing.totalAmount, note: "Overdue interest" });
      toast?.(L("বাতিল হয়েছে", "Cancelled"));
      setTick((v) => v + 1);
    } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); }
  };

  const saveSettings = async () => {
    if (!isOwner || !edit || busy) return;
    const problem = interestSettingsProblem(edit);
    if (problem) { toast?.(problem === "rate" ? L("কাস্টমারের সুদের হার দিন", "Enter the customer interest rate") : L("সাপ্লায়ারের সুদের হার দিন", "Enter the supplier interest rate"), "err"); return; }
    setBusy(true);
    try {
      const next = interestSettingsOf({ overdueInterest: edit });
      const updated = await saveShopRecord(shopId, { overdueInterest: next }, { ownerUid: user?.uid || shop?.ownerUid });
      onShopUpdated?.(updated);
      logAudit({ shopId, user, profile, action: "edit", collection: "shops", docId: shopId, docNo: "Overdue interest", note: `${next.enabled ? "On" : "Off"} · customers ${next.arRate}% · suppliers ${next.apEnabled ? `${next.apRate}%` : "off"} · grace ${next.graceDays} day(s)` });
      toast?.(L("সুদের সেটিং সেভ হয়েছে", "Interest settings saved"));
      setEdit(null);
    } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); }
  };

  const kpi = (labelText, value, color, plain) => (
    <div className="si-kpi" title={labelText}><span>{labelText}</span><b style={{ color }}>{plain ? value : `${cur} ${money(value)}`}</b></div>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{OI_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("বকেয়া বিলে সুদ", "Interest on Overdue Bills")}</strong>
        <span>{sideName} · {fmtDay(day)}</span>
      </div>
      <div className="si-toolbar">
        <div className="si-pills">
          <button type="button" className={`pm-btn-secondary${side === "customer" ? " is-active" : ""}`} onClick={() => setSide("customer")}>{L("কাস্টমার (পাওনা)", "Customers (owed to us)")}</button>
          <button type="button" className={`pm-btn-secondary${side === "vendor" ? " is-active" : ""}`} onClick={() => setSide("vendor")}>{L("সাপ্লায়ার (আমাদের দেনা)", "Suppliers (we owe)")}</button>
        </div>
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!rep}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!rep}> Excel</button>}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
        {isOwner && <button type="button" className="pm-btn-secondary" onClick={() => setEdit(edit ? null : { ...settings })} disabled={busy}>{L("সুদের সেটিং", "Interest settings")}</button>}
        <span className="si-toolbar-gap" />
        <button type="button" className={`pm-btn-secondary${day === today ? " is-active" : ""}`} onClick={() => setAsOf(today)}>{L("আজ", "Today")}</button>
        <input type="date" className="pm-input" style={{ width: mobile ? "48%" : 130 }} value={asOf} onChange={(e) => setAsOf(e.target.value)} title={L("যে তারিখ পর্যন্ত", "As at date")} />
      </div>
      {rep && (
        <div className="si-kpis">
          {kpi(L("বকেয়া বিল", "Overdue bills"), rep.totals.bills, undefined, true)}
          {kpi(L("বকেয়া টাকা", "Overdue amount"), rep.totals.principal, "#b45309")}
          {kpi(L("সুদ", "Interest"), rep.totals.interest, side === "customer" ? "#15803d" : "#b91c1c")}
          {kpi(L("নিয়ম", "Rule"), ruleText, "#475569", true)}
        </div>
      )}
      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {edit && isOwner && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("সুদের সেটিং", "Interest settings")}</legend>
            <div className="si-panel-body" style={{ gap: 6 }}>
              <label className="pm-check"><input type="checkbox" checked={edit.enabled} disabled={busy} onChange={(e) => setEdit((s) => ({ ...s, enabled: e.target.checked }))} /> {L("বকেয়া বিলে সুদ হিসাব চালু", "Work out interest on overdue bills")}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <label className="si-field"><span className="pm-label">{L("কাস্টমার: বছরে সুদ %", "Customers: interest % a year")}</span>
                  <input className="pm-input" style={{ width: 120, textAlign: "right" }} inputMode="decimal" value={edit.arRate} disabled={busy} onChange={(e) => setEdit((s) => ({ ...s, arRate: e.target.value }))} /></label>
                <label className="si-field"><span className="pm-label">{L("শেষ তারিখের পর ছাড় (দিন)", "Grace after due date (days)")}</span>
                  <input className="pm-input" style={{ width: 120, textAlign: "right" }} inputMode="numeric" value={edit.graceDays} disabled={busy} onChange={(e) => setEdit((s) => ({ ...s, graceDays: e.target.value }))} /></label>
              </div>
              <label className="pm-check"><input type="checkbox" checked={edit.apEnabled} disabled={busy} onChange={(e) => setEdit((s) => ({ ...s, apEnabled: e.target.checked }))} /> {L("সাপ্লায়ারের বকেয়া বিলেও সুদ (আমাদের দেনা)", "Also on overdue supplier bills (what we owe)")}</label>
              {edit.apEnabled && (
                <label className="si-field"><span className="pm-label">{L("সাপ্লায়ার: বছরে সুদ %", "Suppliers: interest % a year")}</span>
                  <input className="pm-input" style={{ width: 120, textAlign: "right" }} inputMode="decimal" value={edit.apRate} disabled={busy} onChange={(e) => setEdit((s) => ({ ...s, apRate: e.target.value }))} /></label>
              )}
              <div className="si-hint" style={{ marginLeft: 0 }}>
                {L(`সরল সুদ, বকেয়া মূল টাকার উপর, প্রকৃত দিন / ${INTEREST_DAY_BASIS}। শেষ তারিখ = বিলের নিজের শেষ তারিখ, না থাকলে বিলের বাকির দিন, না থাকলে কাস্টমার / সাপ্লায়ার মাস্টারের "Credit Days"। ছাড়ের দিন পার হলে সেই দিন থেকে সুদ।`,
                  `Simple interest on the open principal, actual days / ${INTEREST_DAY_BASIS}. Due date = the bill's own due date, else its credit days, else Credit Days on the customer / supplier master. Interest counts from the end of the grace days.`)}
              </div>
              <div className="si-actions" style={{ background: "transparent", padding: 0 }}>
                <span className="si-toolbar-gap" />
                <button type="button" className="pm-btn-secondary" onClick={() => setEdit(null)} disabled={busy}>{L("বন্ধ", "Close")}</button>
                <button type="button" className="pm-btn pm-btn--primary" onClick={saveSettings} disabled={busy}>{busy ? L("সেভ হচ্ছে…", "Saving…") : L("সেভ", "Save")}</button>
              </div>
            </div>
          </fieldset>
        )}
        {!data && !error && <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>}
        {data && !sideOn && (
          <div className="si-empty">
            {side === "customer" || !settings.enabled
              ? L("সুদের হিসাব বন্ধ। মালিক \"সুদের সেটিং\" থেকে হার দিয়ে চালু করতে পারেন।", "Interest is switched off. The owner can switch it on with a rate under Interest settings.")
              : L("সাপ্লায়ারের সুদ বন্ধ। মালিক \"সুদের সেটিং\" থেকে চালু করতে পারেন।", "Supplier interest is switched off. The owner can switch it on under Interest settings.")}
          </div>
        )}
        {rep && !rep.rows.length && <div className="si-empty">{L("এই তারিখে কোনো বকেয়া বিল নেই", "No overdue bills on this date")}</div>}
        {rep && rep.rows.length > 0 && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("বকেয়া বিল", "Overdue bills")} ({rep.totals.bills})</legend>
            <div className="si-panel-body" style={{ overflow: "auto" }}>
              <table className="oi-table">
                <thead><tr>
                  <th>{L("বিল", "Bill")}</th><th>{L("বিলের তারিখ", "Bill date")}</th><th>{L("শেষ তারিখ", "Due date")}</th><th className="num">{L("দেরি (দিন)", "Days overdue")}</th>
                  <th className="num">{L("সুদের দিন", "Interest days")}</th><th className="num">{L("বকেয়া", "Open amount")}</th><th className="num">{L("সুদ", "Interest")}</th>
                </tr></thead>
                <tbody>
                  {rep.parties.map((p) => (
                    <React.Fragment key={p.partyKey}>
                      <tr className="is-party"><td colSpan={5}>{p.party} ({p.bills})</td><td className="num">{money(p.principal)}</td><td className="num">{money(p.interest)}</td></tr>
                      {rep.rows.filter((r) => r.partyKey === p.partyKey).map((r) => (
                        <tr key={`${r.billId}-${r.no}`}>
                          <td style={{ paddingLeft: 16 }}>{r.no}</td><td>{fmtDay(r.date)}</td><td>{fmtDay(r.dueDate)}</td>
                          <td className="num">{r.daysOverdue}</td>
                          <td className="num" title={r.postedTo ? L(`${fmtDay(r.postedTo)} পর্যন্ত আগেই দেওয়া`, `Already posted to ${fmtDay(r.postedTo)}`) : undefined}>{r.interestDays}{r.postedTo ? " *" : ""}</td>
                          <td className="num">{money(r.principal)}</td><td className="num">{money(r.interest)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                  <tr className="is-total"><td colSpan={5}>{L("মোট", "Total")}</td><td className="num">{money(rep.totals.principal)}</td><td className="num">{money(rep.totals.interest)}</td></tr>
                </tbody>
              </table>
            </div>
          </fieldset>
        )}
        {rep && isOwner && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("সুদ জার্নালে লিখুন", "Post interest")}</legend>
            <div className="si-panel-body" style={{ gap: 4 }}>
              {blockers.filter((b) => b.id !== "done").map((b) => <div key={b.id} className="si-hint" style={{ marginLeft: 0, color: "#b45309" }}>{bn ? b.bn : b.en}</div>)}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <button type="button" className="pm-btn pm-btn--primary" onClick={post} disabled={busy || blockers.length > 0}>
                  {L(`${fmtDay(day)} পর্যন্ত সুদ লিখুন (${cur} ${money(rep.totals.interest)})`, `Post interest to ${fmtDay(day)} (${cur} ${money(rep.totals.interest)})`)}
                </button>
                {existing && <span className="si-muted">{L(`আগেই দেওয়া: ${existing.voucherNo}`, `Already posted: ${existing.voucherNo}`)}</span>}
                {existing && <button type="button" className="pm-btn-secondary" onClick={cancelPosted} disabled={busy}>{L(`${existing.voucherNo} বাতিল`, `Cancel ${existing.voucherNo}`)}</button>}
              </div>
              <div className="si-hint" style={{ marginLeft: 0 }}>
                {side === "customer"
                  ? L("জার্নাল: প্রতিটি কাস্টমার ডেবিট (তার কাছে পাওনা বাড়ে) / Interest Received ক্রেডিট (আয়)। পরের হিসাবে শুধু এই তারিখের পরের দিন ধরা হয়।", "Journal: each customer debit (they owe more) / Interest Received credit (income). The next run counts only the days after this date.")
                  : L("জার্নাল: Interest Paid ডেবিট (খরচ) / প্রতিটি সাপ্লায়ার ক্রেডিট (আমাদের দেনা বাড়ে)। পরের হিসাবে শুধু এই তারিখের পরের দিন ধরা হয়।", "Journal: Interest Paid debit (expense) / each supplier credit (we owe more). The next run counts only the days after this date.")}
              </div>
            </div>
          </fieldset>
        )}
        <div className="si-note">
          {L(
            `বকেয়া টাকা ডেটরস / ক্রেডিটরস এজিংয়ের একই হিসাব (জমা টাকা আগে পুরোনো বিল শোধ করে)। শুধু বিক্রি / ক্রয় বিল আর ওপেনিং বিলে সুদ; Draft, বাতিল আর পরিশোধিত বিল বাদ; আগে দেওয়া সুদে আবার সুদ নেই। সরল সুদ, প্রকৃত দিন / ${INTEREST_DAY_BASIS}। জার্নাল না লেখা পর্যন্ত এটা শুধু হিসাব - লেজার বা লাভ-ক্ষতিতে কিছু যায় না।`,
            `Open amounts are the same as the debtors / creditors ageing (money received or paid clears the oldest bills first). Only sales / purchase bills and opening bills carry interest; drafts, cancelled and paid bills are left out, and interest already charged carries none. Simple interest, actual days / ${INTEREST_DAY_BASIS}. Until it is posted this is a calculation only - nothing goes to the ledger or the P&L.`
          )}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{ruleText}</span>
        {existing && <span>{L("জার্নাল", "Journal")} <b>{existing.voucherNo}</b></span>}
      </div>
    </div>
  );
}
