// Payroll run (Attendance Register > Payroll run): the month's salary sheet from salary parts, attendance and the
// wages already paid; bonus / deduction per person; pay the run (one salary expense each), payslips, sheet print /
// Excel and, for UAE shops, the WPS SIF file. Owner only, like salaries on the Employees master. Rules in payroll.js.
import React, { useMemo, useState } from "react";
import { offlineCreate } from "../offline/offlineRepository";
import { saveShopRecord } from "../offline/shopService";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { logAudit } from "../utils/auditLog.js";
import { activePeriodLock } from "../accounts/periodLock.js";
import { csvText } from "../reports/vatExport.js";
import { combinePrintHtml } from "../reports/monthEndPack.js";
import {
  buildPayroll, buildSif, expenseMethodOf, nextExpenseNos, payrollExpense, payrollLineBlockers, payrollPostedFor,
  payrollSheetCols, payrollSheetRows, payslipRows, wpsEmployerProblems, wpsLineProblems,
} from "./payroll.js";

const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const money = (v) => (Math.round((n(v) + Number.EPSILON) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const METHODS = [["cash", "নগদ", "Cash"], ["bank_transfer", "ব্যাংক", "Bank transfer"], ["cheque", "চেক", "Cheque"]];

export default function PayrollPanel({ lang = "en", shopId, shop, user, profile, month, employees, byDate, expenses, cur = "AED", toast, shopName = "", onShopUpdated }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const isUae = String(shop?.country || "").toUpperCase() === "AE";
  const [extras, setExtras] = useState({});
  const [methods, setMethods] = useState({});
  const [picked, setPicked] = useState({});
  const [payDate, setPayDate] = useState(() => localDay());
  const [busy, setBusy] = useState(false);
  const [wpsForm, setWpsForm] = useState(null);
  const today = localDay();
  const lockDate = activePeriodLock();
  const who = profile?.personName || profile?.username || user?.email || "";

  const sheet = useMemo(() => buildPayroll({ employees, byDate, expenses, shopId, ym: month, extras }), [employees, byDate, expenses, shopId, month, extras]);
  const posted = useMemo(() => payrollPostedFor(expenses, shopId, month), [expenses, shopId, month]);
  const blockersOf = (l) => payrollLineBlockers(l, { payDate, lockDate, today });
  const methodOf = (l) => methods[l.employeeId] || expenseMethodOf(l.payMethod);
  const isPicked = (l) => (picked[l.employeeId] ?? true) && !blockersOf(l).length;
  const toPay = sheet.lines.filter(isPicked);
  const payTotal = toPay.reduce((t, l) => t + l.payable, 0);
  const setExtra = (id, patch) => setExtras((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }));

  const pay = async () => {
    if (busy || !toPay.length) return;
    if (!window.confirm(L(
      `${toPay.length} জনের বেতন ${cur} ${money(payTotal)} ${fmtDay(payDate)} তারিখে দেওয়া হিসেবে লেখা হবে (প্রতি জনের একটা বেতন খরচ)। চালাবেন?`,
      `Record ${cur} ${money(payTotal)} salary for ${toPay.length} employee(s) as paid on ${fmtDay(payDate)} (one salary expense each). Continue?`))) return;
    setBusy(true);
    const nos = nextExpenseNos(expenses, toPay.length);
    let done = 0;
    try {
      for (const [i, l] of toPay.entries()) {
        const doc = payrollExpense(l, { ym: month, payDate, shopId, expenseNo: nos[i], method: methodOf(l), uid: user?.uid || "", by: who });
        const res = await offlineCreate("expenses", doc);
        logAudit({ shopId, user, profile, action: "create", collection: "expenses", docId: res?.documentId, docNo: doc.expenseNo, amount: doc.amount, note: `Payroll ${month} ${l.name}` });
        done += 1;
      }
      toast?.(L(`${done} জনের বেতন লেখা হয়েছে`, `Salary recorded for ${done} employee(s)`));
      setExtras({});
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`${done ? L(`${done} জনের লেখা হয়েছে, তারপর থেমেছে: `, `${done} recorded, then stopped: `) : ""}${e?.message || e}`, "err");
    } finally { setBusy(false); }
  };

  const sheetHtml = () => generateStatementHTML({
    shopName, title: "SALARY SHEET", subtitle: month,
    cols: payrollSheetCols(cur).map((label, i) => ({ label, align: i > 0 && i < 9 ? "right" : undefined })),
    rows: payrollSheetRows(sheet).slice(0, -1), foot: payrollSheetRows(sheet).at(-1),
  });
  const slipHtml = (l) => generateStatementHTML({
    shopName, title: "PAYSLIP", subtitle: `${month} · ${l.name}${l.designation ? ` · ${l.designation}` : ""}`,
    partyLine: `Paid days ${l.paidDays} of ${l.days}${l.otHours ? ` · Overtime ${l.otHours} h` : ""} · Paid by ${l.payMethod.toUpperCase()}${l.iban ? ` · ${l.iban}` : ""}`,
    cols: [{ label: "Item" }, { label: `Amount (${cur})`, align: "right" }], rows: payslipRows(l, posted.get(l.employeeId) || []),
  });
  const printSheet = () => printWithSettings(sheetHtml(), { lang });
  const printSlips = (only = null) => {
    const list = only ? [only] : sheet.lines.filter((l) => l.earned > 0 || l.paid > 0);
    if (!list.length) return;
    printWithSettings(combinePrintHtml(list.map(slipHtml)), { lang });
  };
  const exportCsv = async () => {
    try { await saveTextFile(`salary-sheet-${month}.csv`, csvText([[`Salary sheet ${month}`], payrollSheetCols(cur), ...payrollSheetRows(sheet)])); } catch (e) { toast?.(e?.message || String(e), "err"); }
  };

  // WPS: transfer = what is due now, or what this month's payroll already sent by bank
  const wps = shop?.wps || {};
  const wpsLines = sheet.lines.filter((l) => l.payMethod === "wps");
  const wpsAmounts = useMemo(() => new Map(wpsLines.map((l) => [l.employeeId, l.payable > 0 ? l.payable
    : (posted.get(l.employeeId) || []).filter((x) => x.method === "bank_transfer").reduce((t, x) => t + n(x.amount), 0)])), [wpsLines, posted]); // eslint-disable-line react-hooks/exhaustive-deps
  const wpsReady = wpsLines.filter((l) => wpsAmounts.get(l.employeeId) > 0);
  const wpsBad = wpsReady.map((l) => [l, wpsLineProblems(l)]).filter(([, p]) => p.length);
  const employerBad = wpsEmployerProblems(wps);
  const exportSif = async () => {
    if (employerBad.length || wpsBad.length || !wpsReady.length) return;
    const sif = buildSif({ wps, ym: month, lines: wpsReady, amounts: wpsAmounts });
    try {
      await saveTextFile(sif.fileName, sif.text, "text/plain;charset=utf-8");
      toast?.(L(`${sif.fileName} সেভ হয়েছে - ${sif.count} জন, ${cur} ${money(sif.total)}`, `${sif.fileName} saved - ${sif.count} employee(s), ${cur} ${money(sif.total)}`));
    } catch (e) { toast?.(e?.message || String(e), "err"); }
  };
  const saveWps = async () => {
    const next = { employerId: String(wpsForm.employerId || "").trim(), routingCode: String(wpsForm.routingCode || "").trim(), reference: String(wpsForm.reference || "").trim() };
    if (wpsEmployerProblems(next).length) { toast?.(L("নিয়োগকর্তা আইডি ১৩ সংখ্যা আর রাউটিং কোড ৯ সংখ্যা হতে হবে", "Employer ID must be 13 digits and the routing code 9 digits"), "err"); return; }
    setBusy(true);
    try {
      const updated = await saveShopRecord(shopId, { wps: next }, { ownerUid: user?.uid, profile, user });
      onShopUpdated?.(updated || { wps: next });
      setWpsForm(null);
      toast?.(L("WPS তথ্য সেভ হয়েছে", "WPS details saved"));
    } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); }
  };

  const t = sheet.totals;
  return (
    <>
      <div className="si-toolbar">
        <span className="si-muted">{L("বেতনের তারিখ", "Payment date")}</span>
        <input type="date" className="pm-input" style={{ width: 140 }} value={payDate} max={today} onChange={(e) => setPayDate(e.target.value)} />
        <span className="si-toolbar-gap" />
        <button type="button" className="pm-btn-secondary" onClick={printSheet} disabled={!sheet.lines.length}>{L("শিট প্রিন্ট / PDF", "Print / PDF sheet")}</button>
        <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!sheet.lines.length}>Excel</button>
        <button type="button" className="pm-btn-secondary" onClick={() => printSlips()} disabled={!sheet.lines.length}>{L("সব পে-স্লিপ", "All payslips")}</button>
        {isUae && <button type="button" className="pm-btn-secondary" onClick={exportSif} disabled={!wpsReady.length || employerBad.length > 0 || wpsBad.length > 0} title={L("WPS বেতন ফাইল (SIF) - ব্যাংক / এক্সচেঞ্জে আপলোড করুন", "WPS salary file (SIF) - upload it to your bank / exchange")}>WPS SIF</button>}
        <button type="button" className="pm-btn pm-btn--primary" onClick={pay} disabled={busy || !toPay.length}>
          {busy ? L("লেখা হচ্ছে…", "Recording…") : L(`বেতন দিন (${toPay.length}) ${cur} ${money(payTotal)}`, `Pay salary (${toPay.length}) ${cur} ${money(payTotal)}`)}
        </button>
      </div>
      <div className="si-kpis">
        <div className="si-kpi"><span>{L("মোট অর্জিত", "Earned")}</span><b>{cur} {money(t.earned)}</b></div>
        <div className="si-kpi"><span>{L("আগে দেওয়া (অগ্রিম সহ)", "Paid before (incl. advances)")}</span><b>{cur} {money(t.paid)}</b></div>
        <div className="si-kpi"><span>{L("বাকি", "Net due")}</span><b style={{ color: t.payable > 0 ? "#b91c1c" : "#15803d" }}>{cur} {money(t.payable)}</b></div>
        {t.overpaid > 0 && <div className="si-kpi"><span>{L("বেশি দেওয়া (অগ্রিম)", "Paid in advance")}</span><b style={{ color: "#b45309" }}>{cur} {money(t.overpaid)}</b></div>}
      </div>
      {lockDate && payDate && payDate <= lockDate && <div className="si-hint" style={{ color: "#b91c1c", margin: "2px 4px" }}>{L(`${fmtDay(lockDate)} পর্যন্ত হিসাব লক - পরের তারিখ বাছুন`, `The books are locked up to ${fmtDay(lockDate)} - pick a later date`)}</div>}
      {isUae && wpsLines.length > 0 && (
        <div className="si-hint" style={{ margin: "2px 4px" }}>
          {employerBad.length > 0 && <span style={{ color: "#b45309", marginRight: 8 }}>WPS: {employerBad.map((p) => (bn ? p.bn : p.en)).join(", ")}.</span>}
          {wpsBad.map(([l, p]) => <span key={l.employeeId} style={{ color: "#b45309", marginRight: 8 }}>{l.name}: {p.map((x) => (bn ? x.bn : x.en)).join(", ")} ({L("কর্মচারী মাস্টারে দিন", "set it on the Employees master")}).</span>)}
          {wpsForm ? (
            <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
              <input className="pm-input" style={{ width: 150 }} inputMode="numeric" placeholder={L("নিয়োগকর্তা আইডি (১৩)", "Employer ID (13)")} value={wpsForm.employerId || ""} onChange={(e) => setWpsForm((f) => ({ ...f, employerId: e.target.value.replace(/\D/g, "") }))} />
              <input className="pm-input" style={{ width: 130 }} inputMode="numeric" placeholder={L("রাউটিং কোড (৯)", "Routing code (9)")} value={wpsForm.routingCode || ""} onChange={(e) => setWpsForm((f) => ({ ...f, routingCode: e.target.value.replace(/\D/g, "") }))} />
              <input className="pm-input" style={{ width: 140 }} placeholder={L("রেফারেন্স (ঐচ্ছিক)", "Reference (optional)")} value={wpsForm.reference || ""} onChange={(e) => setWpsForm((f) => ({ ...f, reference: e.target.value }))} />
              <button type="button" className="pm-btn pm-btn--primary" onClick={saveWps} disabled={busy}>{L("সেভ", "Save")}</button>
              <button type="button" className="pm-btn-secondary" onClick={() => setWpsForm(null)}>{L("বাতিল", "Cancel")}</button>
            </span>
          ) : <button type="button" className="pm-btn-secondary" onClick={() => setWpsForm({ ...wps })}>{L("WPS নিয়োগকর্তা তথ্য", "WPS employer details")}</button>}
        </div>
      )}
      <div className="si-main is-all">
        <div className="si-box" style={{ overflow: "auto" }}>
          {!sheet.lines.length ? <div className="si-empty">{L("এই মাসে কোনো কর্মচারী নেই", "No employees in this month")}</div> : (
            <table className="pm-table" style={{ minWidth: 1000 }}>
              <thead><tr>
                <th style={{ width: 28 }} />
                <th>{L("কর্মচারী", "Employee")}</th>
                <th className="si-num">{L("কাজের দিন", "Paid days")}</th>
                <th className="si-num">{L("নির্দিষ্ট", "Fixed")}</th>
                <th className="si-num">OT</th>
                <th className="si-num" style={{ width: 90 }}>{L("বোনাস", "Bonus")}</th>
                <th style={{ width: 200 }}>{L("কর্তন / কারণ", "Deduction / reason")}</th>
                <th className="si-num">{L("অর্জিত", "Earned")}</th>
                <th className="si-num">{L("আগে দেওয়া", "Paid before")}</th>
                <th className="si-num">{L("বাকি", "Net due")}</th>
                <th style={{ width: 120 }}>{L("কীভাবে", "Paid by")}</th>
                <th />
              </tr></thead>
              <tbody>
                {sheet.lines.map((l) => {
                  const ex = extras[l.employeeId] || {};
                  const blk = blockersOf(l);
                  const done = (posted.get(l.employeeId) || []).length > 0;
                  return (
                    <tr key={l.employeeId}>
                      <td><input type="checkbox" disabled={blk.length > 0} checked={isPicked(l)} onChange={(e) => setPicked((m) => ({ ...m, [l.employeeId]: e.target.checked }))} /></td>
                      <td className="si-strong">{l.name}{l.designation ? <span style={{ color: "#64748b", fontWeight: 400 }}> · {l.designation}</span> : null}
                        {blk.filter((b) => b.id !== "nothing").map((b) => <div key={b.id} style={{ color: "#b45309", fontWeight: 400, fontSize: 11.5 }}>{bn ? b.bn : b.en}</div>)}
                        {done && <div style={{ color: "#15803d", fontWeight: 400, fontSize: 11.5 }}>{L("এই মাসে পে-রোল দেওয়া হয়েছে", "Payroll paid this month")} ({(posted.get(l.employeeId) || []).map((x) => x.expenseNo).join(", ")})</div>}
                      </td>
                      <td className="si-num">{l.paidDays}/{l.days}</td>
                      <td className="si-num" title={l.parts.map((p) => `${p.en} ${money(p.amount)}`).join(" + ")}>{money(l.fixed)}</td>
                      <td className="si-num" title={l.otHours ? `${l.otHours} h` : ""}>{l.ot ? money(l.ot) : ""}</td>
                      <td><input className="pm-input" inputMode="decimal" value={ex.bonus ?? ""} onChange={(e) => setExtra(l.employeeId, { bonus: e.target.value })} style={{ textAlign: "right" }} /></td>
                      <td style={{ display: "flex", gap: 3 }}>
                        <input className="pm-input" inputMode="decimal" value={ex.deduction ?? ""} onChange={(e) => setExtra(l.employeeId, { deduction: e.target.value })} style={{ textAlign: "right", width: 70 }} />
                        <input className="pm-input" value={ex.deductionNote ?? ""} placeholder={L("কারণ", "Reason")} onChange={(e) => setExtra(l.employeeId, { deductionNote: e.target.value })} />
                      </td>
                      <td className="si-num">{money(l.earned)}</td>
                      <td className="si-num">{l.paid ? money(l.paid) : ""}</td>
                      <td className="si-num si-strong" style={{ color: l.overpaid ? "#b45309" : l.payable > 0 ? "#b91c1c" : "#15803d" }}>{l.overpaid ? `-${money(l.overpaid)}` : money(l.payable)}</td>
                      <td>
                        <select className="pm-input" value={methodOf(l)} onChange={(e) => setMethods((m) => ({ ...m, [l.employeeId]: e.target.value }))}>
                          {METHODS.map(([k, b, e]) => <option key={k} value={k}>{bn ? b : e}{l.payMethod === "wps" && k === "bank_transfer" ? " (WPS)" : ""}</option>)}
                        </select>
                      </td>
                      <td><button type="button" className="pm-btn-secondary" onClick={() => printSlips(l)} disabled={!(l.earned > 0 || l.paid > 0)}>{L("পে-স্লিপ", "Payslip")}</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr className="si-strong">
                <td /><td>{L("মোট", "Total")}</td><td />
                <td className="si-num">{money(t.fixed)}</td><td className="si-num">{money(t.ot)}</td><td className="si-num">{money(t.bonus)}</td><td className="si-num">{money(t.deduction)}</td>
                <td className="si-num">{money(t.earned)}</td><td className="si-num">{money(t.paid)}</td><td className="si-num">{money(t.payable)}</td><td /><td />
              </tr></tfoot>
            </table>
          )}
        </div>
      </div>
      <div className="si-hint" style={{ margin: "2px 4px" }}>
        {L(
          "নির্দিষ্ট = কর্মচারী মাস্টারের বেতনের অংশগুলো ÷ মাসের দিন × কাজের দিন; OT = ওভারটাইম ঘণ্টা × রেট। \"আগে দেওয়া\" = এই মাসের বেতন / অগ্রিম / OT / বোনাস / ভাতার খরচ। \"বেতন দিন\" প্রতি জনের জন্য একটা বেতন খরচ (Employee Expense) লেখে - লেজার, P&L, ক্যাশ / ব্যাংক বই সেখান থেকেই পড়ে। হাজিরা মার্ক না থাকলে বা লক করা তারিখে দেওয়া যায় না। ভুল হলে Employee Expense থেকে সেই খরচ বাতিল করুন - বাকি আবার দেখা যাবে।",
          "Fixed = the salary parts on the Employees master ÷ days in the month × paid days; OT = overtime hours × rate. \"Paid before\" = this month's salary / advance / OT / bonus / allowance expenses. \"Pay salary\" records one salary expense (Employee Expense) per person - the ledger, P&L and cash / bank books read it from there. Days not marked in attendance or a locked date stop the payment. To undo, cancel that expense under Employee Expense - the due comes back.",
        )}
      </div>
    </>
  );
}
