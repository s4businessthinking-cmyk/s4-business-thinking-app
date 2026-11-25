// Payroll run: the month's salary sheet built from the employee master (salary parts), the attendance register
// (paid days, overtime) and the employee expenses already paid for that month (salary, advance, overtime, bonus,
// allowance). Paying the run posts one ordinary employee expense per person (category "salary", forMonth = the
// month, source "payroll"), so the ledger, P&L, Books, Cash Flow and the register's "Paid" column read it as they
// read any salary expense - nothing else is written. A second run only pays what is still due.
// UAE shops can also export the WPS Salary Information File (SIF: one EDR line per employee, one SCR line).
import { daysInMonth, summarizeMonth, wagesPaidByEmployee } from "./attendance.js";
import { SALARY_PARTS, grossSalary } from "./employeeProfile.js";

const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const fx = (v) => r2(v).toFixed(2);

/** Employee pay method -> expense method (WPS and bank both leave the bank account). */
export const expenseMethodOf = (payMethod) => (payMethod === "bank" || payMethod === "wps" ? "bank_transfer" : payMethod === "cheque" ? "cheque" : "cash");

/** Payroll expenses already posted for the month: Map(employeeId -> [expense]). */
export function payrollPostedFor(expenses, shopId, ym) {
  const map = new Map();
  (expenses || []).forEach((x) => {
    if (!x || x.isDeleted || x.status === "cancelled" || (shopId && x.shopId !== shopId) || x.source !== "payroll" || x.forMonth !== ym || !x.employeeId) return;
    map.set(x.employeeId, [...(map.get(x.employeeId) || []), x]);
  });
  return map;
}

/**
 * One sheet line for an employee.
 * summary: summarizeMonth(); paid: wages already paid for the month (any wage expense, payroll included);
 * extra: { bonus, deduction, deductionNote } typed on the sheet.
 * Fixed parts are pro-rated by paid days over the calendar month (as the attendance register does).
 */
export function payrollLine(employee, summary, ym, paid = 0, extra = {}) {
  const dim = daysInMonth(ym) || 30;
  const factor = summary.days ? summary.paidDays / dim : 0;
  const gross = grossSalary(employee);
  const hasParts = SALARY_PARTS.some((p) => num(employee?.[p.k]) > 0);
  const parts = hasParts
    ? SALARY_PARTS.filter((p) => num(employee?.[p.k]) > 0).map((p) => ({ k: p.k, en: p.en, bn: p.bn, monthly: r2(employee[p.k]), amount: r2(num(employee[p.k]) * factor) }))
    : gross > 0 ? [{ k: "basicSalary", en: "Basic", bn: "মূল বেতন", monthly: gross, amount: r2(gross * factor) }] : [];
  // the fixed total is gross x paid days / days in month; the last part takes the rounding cent
  const fixed = r2(gross * factor);
  if (parts.length) parts[parts.length - 1].amount = r2(fixed - parts.slice(0, -1).reduce((t, p) => t + p.amount, 0));
  const ot = r2(summary.otHours * num(employee?.otRate));
  const bonus = Math.max(0, r2(extra.bonus));
  const deduction = Math.max(0, r2(extra.deduction));
  const earned = r2(fixed + ot + bonus - deduction);
  const net = r2(earned - paid);
  return {
    employeeId: employee.id, name: employee.name || "", designation: employee.designation || "", gross, parts, fixed, ot, otHours: summary.otHours,
    bonus, deduction, deductionNote: String(extra.deductionNote || "").trim(), earned, paid: r2(paid), net,
    payable: Math.max(0, net), overpaid: net < 0 ? r2(-net) : 0,
    paidDays: summary.paidDays, days: summary.days, unmarked: summary.unmarked, leaveDays: r2(summary.L + summary.UL + summary.A),
    payMethod: employee.payMethod || "cash", bankName: employee.bankName || "", iban: String(employee.bankAccount || "").replace(/\s+/g, "").toUpperCase(),
    wpsPersonId: String(employee.wpsPersonId || "").trim(), routingCode: String(employee.bankRoutingCode || "").trim(),
  };
}

/** The month's sheet: employees on the books that month, wage expenses, attendance marks (marksByDate()). */
export function buildPayroll({ employees, byDate, expenses, shopId, ym, extras = {} }) {
  const first = `${ym}-01`, last = `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`;
  const paidBy = wagesPaidByEmployee(expenses, shopId, ym);
  const lines = (employees || [])
    .filter((e) => e && !e.isDeleted && (!e.joinDate || e.joinDate <= last) && (!e.leftDate || e.leftDate >= first) && (e.status !== "inactive" || e.leftDate))
    .map((e) => payrollLine(e, summarizeMonth(byDate, e.id, ym, e.joinDate || "", e.status === "inactive" ? e.leftDate || "" : ""), ym, paidBy.get(e.id) || 0, extras[e.id] || {}))
    .sort((a, b) => a.name.localeCompare(b.name));
  const sum = (k) => r2(lines.reduce((t, l) => t + l[k], 0));
  return { ym, lines, totals: { fixed: sum("fixed"), ot: sum("ot"), bonus: sum("bonus"), deduction: sum("deduction"), earned: sum("earned"), paid: sum("paid"), payable: sum("payable"), overpaid: sum("overpaid") } };
}

/**
 * Why a line cannot be paid now -> [{ id, en, bn }] (empty = ok). lockDate: the period lock.
 */
export function payrollLineBlockers(line, { payDate, lockDate = "", today = "" }) {
  const out = [];
  if (!(line.payable > 0)) out.push({ id: "nothing", en: "Nothing due", bn: "কিছু বাকি নেই" });
  if (line.unmarked > 0) out.push({ id: "unmarked", en: `${line.unmarked} day(s) not marked in attendance`, bn: `হাজিরায় ${line.unmarked} দিন মার্ক নেই` });
  if (!payDate) out.push({ id: "date", en: "Pick the payment date", bn: "বেতন দেওয়ার তারিখ দিন" });
  else if (lockDate && payDate <= lockDate) out.push({ id: "locked", en: `The books are locked up to ${lockDate}`, bn: `${lockDate} পর্যন্ত হিসাব লক` });
  else if (today && payDate > today) out.push({ id: "future", en: "The payment date is in the future", bn: "বেতনের তারিখ ভবিষ্যতে" });
  return out;
}

/** The salary expense a payroll line posts (ExpensesTab shape). */
export function payrollExpense(line, { ym, payDate, shopId, expenseNo, method = expenseMethodOf(line.payMethod), uid = "", by = "", now = new Date() }) {
  const at = new Date(now).toISOString();
  const isCheque = method === "cheque";
  const detail = [
    `Payroll ${ym}: ${line.paidDays}/${daysInMonth(ym)} paid days`,
    line.ot ? `OT ${line.otHours} h ${fx(line.ot)}` : "",
    line.bonus ? `bonus ${fx(line.bonus)}` : "",
    line.deduction ? `less ${fx(line.deduction)}${line.deductionNote ? ` (${line.deductionNote})` : ""}` : "",
    line.paid ? `less paid before ${fx(line.paid)}` : "",
  ].filter(Boolean).join(", ");
  return {
    shopId, expenseNo, status: "active", source: "payroll", expenseDate: payDate, category: "salary", categoryName: "",
    allowanceTypeId: "", allowanceTypeName: "", amount: line.payable, method, paidTo: line.name, refNo: `PAYROLL-${ym}`, note: detail,
    partnerId: "", partnerName: "", paidByPartner: false,
    chequeNo: "", chequeBank: isCheque ? line.bankName : "", chequeDate: isCheque ? payDate : "", chequeStatus: isCheque ? "pending" : "",
    vatAmount: 0, supplierTrn: "", employeeId: line.employeeId, employeeName: line.name, forMonth: ym,
    payroll: { fixed: line.fixed, ot: line.ot, otHours: line.otHours, bonus: line.bonus, deduction: line.deduction, deductionNote: line.deductionNote, paidBefore: line.paid, paidDays: line.paidDays, parts: line.parts.map((p) => ({ k: p.k, amount: p.amount })) },
    createdBy: uid, createdByName: by, createdAt: at, updatedAt: at, updatedBy: uid,
  };
}

/** Next EXP-nnnn number after the highest one in use (same rule as the Expenses screen). */
export function nextExpenseNos(expenses, count) {
  const mx = (expenses || []).reduce((m, r) => { const x = String(r?.expenseNo || "").match(/EXP-?(\d+)$/i); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return Array.from({ length: count }, (_, i) => `EXP-${String(mx + 1 + i).padStart(4, "0")}`);
}

// ---- UAE WPS Salary Information File ----

const IBAN_AE = /^AE\d{21}$/;

/** What stops a line going into the SIF -> [{ en, bn }]. */
export function wpsLineProblems(line) {
  const out = [];
  if (!/^\d{14}$/.test(line.wpsPersonId)) out.push({ en: "MOHRE person ID (14 digits) missing", bn: "MOHRE পার্সন আইডি (১৪ সংখ্যা) নেই" });
  if (!/^\d{9}$/.test(line.routingCode)) out.push({ en: "Bank routing code (9 digits) missing", bn: "ব্যাংক রাউটিং কোড (৯ সংখ্যা) নেই" });
  if (!IBAN_AE.test(line.iban)) out.push({ en: "UAE IBAN (AE + 21 digits) missing", bn: "UAE IBAN (AE + ২১ সংখ্যা) নেই" });
  return out;
}

export function wpsEmployerProblems(wps) {
  const out = [];
  if (!/^\d{13}$/.test(String(wps?.employerId || ""))) out.push({ en: "Employer ID (MOHRE establishment, 13 digits) missing", bn: "নিয়োগকর্তা আইডি (MOHRE প্রতিষ্ঠান, ১৩ সংখ্যা) নেই" });
  if (!/^\d{9}$/.test(String(wps?.routingCode || ""))) out.push({ en: "Employer bank routing code (9 digits) missing", bn: "নিয়োগকর্তার ব্যাংক রাউটিং কোড (৯ সংখ্যা) নেই" });
  return out;
}

/**
 * SIF text for the lines paid by WPS. amounts: Map(employeeId -> amount transferred). The variable part is overtime +
 * bonus (up to the transfer), the rest is fixed. -> { text, fileName, count, total }
 */
export function buildSif({ wps, ym, lines, amounts, now = new Date() }) {
  const [y, m] = ym.split("-");
  const start = `${ym}-01`, end = `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`;
  const d = new Date(now);
  const p2 = (v) => String(v).padStart(2, "0");
  const day = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const hhmm = `${p2(d.getHours())}${p2(d.getMinutes())}`;
  const edr = lines.filter((l) => r2(amounts.get(l.employeeId)) > 0).map((l) => {
    const amt = r2(amounts.get(l.employeeId));
    const variable = Math.min(amt, r2(l.ot + l.bonus));
    return ["EDR", l.wpsPersonId, l.routingCode, l.iban, start, end, String(l.days), fx(amt - variable), fx(variable), String(Math.round(l.leaveDays))].join(",");
  });
  const total = r2(lines.reduce((t, l) => t + r2(amounts.get(l.employeeId)), 0));
  const scr = ["SCR", wps.employerId, wps.routingCode, day, hhmm, `${m}${y}`, String(edr.length), fx(total), "AED", String(wps.reference || "").replace(/,/g, " ").trim()].join(",");
  const stamp = `${String(d.getFullYear()).slice(2)}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  return { text: `${[...edr, scr].join("\r\n")}\r\n`, fileName: `${wps.employerId}${stamp}.SIF`, count: edr.length, total };
}

// ---- print / Excel ----

export const payrollSheetCols = (cur) => ["Employee", "Paid days", `Fixed (${cur})`, `Overtime (${cur})`, `Bonus (${cur})`, `Deduction (${cur})`, `Earned (${cur})`, `Paid before (${cur})`, `Net due (${cur})`, "Paid by"];

export function payrollSheetRows(sheet) {
  const rows = sheet.lines.map((l) => [l.name, `${l.paidDays}/${l.days}`, fx(l.fixed), fx(l.ot), fx(l.bonus), fx(l.deduction), fx(l.earned), fx(l.paid), l.overpaid ? `-${fx(l.overpaid)}` : fx(l.payable), l.payMethod.toUpperCase()]);
  const t = sheet.totals;
  return [...rows, ["TOTAL", "", fx(t.fixed), fx(t.ot), fx(t.bonus), fx(t.deduction), fx(t.earned), fx(t.paid), fx(t.payable), ""]];
}

/** Payslip rows: [label, amount] (earnings, deductions, net). posted: payroll expenses of the month for the person. */
export function payslipRows(line, posted = []) {
  const rows = [
    ...line.parts.map((p) => [`${p.en} (${fx(p.monthly)} a month)`, fx(p.amount)]),
    ...(line.ot ? [[`Overtime ${line.otHours} h`, fx(line.ot)]] : []),
    ...(line.bonus ? [["Bonus", fx(line.bonus)]] : []),
    ...(line.deduction ? [[`Less: ${line.deductionNote || "Deduction"}`, `-${fx(line.deduction)}`]] : []),
    ["Earned for the month", fx(line.earned)],
  ];
  const otherPaid = r2(line.paid - posted.reduce((t, x) => t + num(x.amount), 0));
  if (otherPaid > 0) rows.push(["Less: advance / paid during the month", `-${fx(otherPaid)}`]);
  posted.forEach((x) => rows.push([`Paid ${x.expenseDate} ${x.expenseNo || ""} (${x.method === "bank_transfer" ? "bank" : x.method})`, `-${fx(x.amount)}`]));
  rows.push([line.overpaid ? "Paid in advance (carried)" : "Balance due", line.overpaid ? `-${fx(line.overpaid)}` : fx(line.payable)]);
  return rows;
}
