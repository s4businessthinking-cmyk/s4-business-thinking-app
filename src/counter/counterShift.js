// Counter shift: one open shift per branch (counterShifts collection). Opening a shift records the cash in
// the drawer; closing it records the counted cash against what the books expect:
//   expected = opening cash + cash in - cash out
// where cash in / out are the Global Ledger's "Cash in Hand" postings of documents first saved while the shift was open
// (cash bills, receipts, refunds, cash expenses, supplier payments, journals / contras touching cash). Nothing on the
// bills or vouchers is tagged or changed: the shift only reads them by the time they were saved. A draft confirmed
// later counts in the shift its draft was first saved in; cancelled documents are left out by the ledger.
import { CASH_ACCOUNT } from "../vouchers/accountVoucherDomain.js";
import { n, r2 } from "../reports/reportFilters.js";
import { MAIN_BRANCH, branchOfDoc } from "../reports/groupView.js";
import { branchShiftCashKey } from "../branch-transfer/branchCashAccounts.js";

const CASH_KEY = `a:${CASH_ACCOUNT.trim().toLowerCase()}`;
// ledger posting col -> the data list its documents come from (see buildGlobalLedger)
const SOURCE = {
  salesInvoices: "salesInvoices", purchaseInvoices: "purchaseInvoices", salesReceipts: "receipts", purchasePayments: "payments",
  salesReturns: "salesReturns", purchaseReturns: "purchaseReturns", expenses: "expenses", accountVouchers: "accountVouchers",
  partnerEntries: "partnerEntries", bankReconciliations: "bankEntries",
};

/** A saved time as an ISO string (ISO text, Date, epoch ms or a { seconds } timestamp), "" when unknown. */
export function isoOf(v) {
  if (!v) return "";
  if (typeof v === "object" && !(v instanceof Date) && Number.isFinite(Number(v.seconds))) return new Date(Number(v.seconds) * 1000).toISOString();
  const d = v instanceof Date ? v : new Date(typeof v === "number" ? v : String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

const normBranch = (id) => {
  const c = String(id ?? "").trim();
  return c && c !== MAIN_BRANCH ? c : MAIN_BRANCH;
};

/** branchId omitted = all open shifts for the shop; branchId set = that branch only (legacy shifts without branchId = main). */
export const openShifts = (shifts, shopId = "", branchId = null) => (shifts || []).filter((s) => {
  if (!s || s.isDeleted || s.status !== "open") return false;
  if (shopId && s.shopId !== shopId) return false;
  if (branchId != null && branchId !== "") {
    if (normBranch(s.branchId) !== normBranch(branchId)) return false;
  }
  return true;
}).sort((a, b) => isoOf(b.openedAt).localeCompare(isoOf(a.openedAt)));

/** Map ledger posting doc -> branch for branch-scoped counter cash. */
export function branchIndexOfDocs(data) {
  const invBranch = new Map();
  (data?.salesInvoices || []).forEach((d) => { if (d?.id) invBranch.set(d.id, branchOfDoc(d)); });
  const docBranch = new Map();
  const tag = (col, id, branch) => { if (id) docBranch.set(`${col}|${id}`, normBranch(branch)); };
  (data?.salesInvoices || []).forEach((d) => tag("salesInvoices", d.id, branchOfDoc(d)));
  (data?.purchaseInvoices || []).forEach((d) => tag("purchaseInvoices", d.id, MAIN_BRANCH));
  (data?.salesReturns || []).forEach((d) => tag("salesReturns", d.id, invBranch.get(d.invoiceId) || MAIN_BRANCH));
  (data?.purchaseReturns || []).forEach((d) => tag("purchaseReturns", d.id, MAIN_BRANCH));
  (data?.receipts || []).forEach((d) => {
    const invId = (d.allocations || [])[0]?.invoiceId;
    tag("receipts", d.id, invId ? (invBranch.get(invId) || MAIN_BRANCH) : MAIN_BRANCH);
  });
  (data?.payments || []).forEach((d) => tag("payments", d.id, MAIN_BRANCH));
  (data?.expenses || []).forEach((d) => tag("expenses", d.id, MAIN_BRANCH));
  (data?.accountVouchers || []).forEach((d) => tag("accountVouchers", d.id, MAIN_BRANCH));
  (data?.partnerEntries || []).forEach((d) => tag("partnerEntries", d.id, MAIN_BRANCH));
  (data?.bankEntries || []).forEach((d) => tag("bankEntries", d.id, MAIN_BRANCH));
  return docBranch;
}

/**
 * Cash movement of a shift: Cash in Hand postings whose document was saved in [fromIso, toIso).
 * ledger: buildGlobalLedger result; data: the lists it was built from.
 * -> { cashIn, cashOut, net, lines: [{ at, type, no, dr, cr, narration }] } (lines oldest first)
 */
export function shiftCash(ledger, data, fromIso, toIso, branchId = "", branchName = "") {
  const savedAt = new Map();
  Object.entries(SOURCE).forEach(([col, list]) => (data?.[list] || []).forEach((d) => { if (d?.id) savedAt.set(`${col}|${d.id}`, isoOf(d.createdAt)); }));
  const cashKey = branchId ? branchShiftCashKey(branchId, branchName) : CASH_KEY;
  const from = isoOf(fromIso), to = isoOf(toIso);
  const lines = (ledger?.postings || []).filter((p) => p.key === cashKey).map((p) => ({ at: savedAt.get(`${p.col}|${p.docId}`) || "", type: p.type, no: p.no, dr: r2(p.dr), cr: r2(p.cr), narration: p.narration || "" }))
    .filter((l) => l.at && (!from || l.at >= from) && (!to || l.at < to))
    .sort((a, b) => a.at.localeCompare(b.at));
  const cashIn = r2(lines.reduce((t, l) => t + l.dr, 0)), cashOut = r2(lines.reduce((t, l) => t + l.cr, 0));
  return { cashIn, cashOut, net: r2(cashIn - cashOut), lines };
}

const money = (v) => {
  const s = String(v ?? "").replace(/,/g, "").trim();
  return s !== "" && Number.isFinite(Number(s)) ? Number(s) : NaN;
};

/** New shift record, or { error: "open" | "amount" }. */
export function openShiftDoc({ openingCash, counter = "", branchId = "", branchName = "" }, shifts, { shopId, uid, name = "", now = new Date() }) {
  const bid = normBranch(branchId);
  if (openShifts(shifts, shopId, bid).length) return { error: "open" };
  const cash = money(openingCash);
  if (!Number.isFinite(cash) || cash < 0) return { error: "amount" };
  const at = isoOf(now);
  return {
    ok: true,
    doc: {
      shopId, status: "open", counter: String(counter || "").trim(), branchId: bid, branchName: String(branchName || "").trim() || (bid === MAIN_BRANCH ? "Main" : bid),
      openingCash: r2(cash), openedAt: at, openedBy: uid, openedByName: name,
      createdAt: at, createdBy: uid, updatedAt: at, updatedBy: uid,
    },
  };
}

/** Fields that close a shift, or { error: "amount" | "closed" }. cash: shiftCash() for the shift up to now. */
export function closeShiftPatch(shift, cash, { closingCash, note = "" }, { uid, name = "", now = new Date() }) {
  if (!shift || shift.status !== "open") return { error: "closed" };
  const counted = money(closingCash);
  if (!Number.isFinite(counted) || counted < 0) return { error: "amount" };
  const expected = r2(n(shift.openingCash) + n(cash?.cashIn) - n(cash?.cashOut));
  const at = isoOf(now);
  return {
    ok: true,
    patch: {
      status: "closed", closingCash: r2(counted), cashIn: r2(cash?.cashIn), cashOut: r2(cash?.cashOut), expectedCash: expected,
      difference: r2(counted - expected), note: String(note || "").trim(), closedAt: at, closedBy: uid, closedByName: name, updatedAt: at, updatedBy: uid,
    },
  };
}

/** Expected cash and difference for a shift (frozen once closed, live while open). */
export function shiftSummary(shift, liveCash) {
  if (shift?.status === "closed") {
    return { cashIn: r2(shift.cashIn), cashOut: r2(shift.cashOut), expected: r2(shift.expectedCash), counted: r2(shift.closingCash), difference: r2(shift.difference) };
  }
  const expected = r2(n(shift?.openingCash) + n(liveCash?.cashIn) - n(liveCash?.cashOut));
  return { cashIn: r2(liveCash?.cashIn), cashOut: r2(liveCash?.cashOut), expected, counted: null, difference: null };
}

export const SHIFT_COLS = ["Counter", "Opened", "Opened by", "Opening cash", "Cash in", "Cash out", "Expected", "Closed", "Closed by", "Counted", "Difference", "Note"];
/** CSV rows for closed shifts, newest first. */
export const shiftCsvRows = (shifts) => [
  SHIFT_COLS,
  ...(shifts || []).filter((s) => s?.status === "closed").sort((a, b) => isoOf(b.openedAt).localeCompare(isoOf(a.openedAt))).map((s) => [
    s.counter || "", isoOf(s.openedAt).replace("T", " ").slice(0, 16), s.openedByName || "", r2(s.openingCash).toFixed(2), r2(s.cashIn).toFixed(2), r2(s.cashOut).toFixed(2),
    r2(s.expectedCash).toFixed(2), isoOf(s.closedAt).replace("T", " ").slice(0, 16), s.closedByName || "", r2(s.closingCash).toFixed(2), r2(s.difference).toFixed(2), s.note || "",
  ]),
];
export const shiftFileName = (from, to) => `counter-shifts-${from || "start"}-${to || "today"}.csv`;
