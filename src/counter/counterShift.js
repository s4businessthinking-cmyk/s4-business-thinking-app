// Counter shift: one shop-wide cash shift at a time (counterShifts collection). Opening a shift records the cash in
// the drawer; closing it records the counted cash against what the books expect:
//   expected = opening cash + cash in - cash out
// where cash in / out are the Global Ledger's "Cash in Hand" postings of documents first saved while the shift was open
// (cash bills, receipts, refunds, cash expenses, supplier payments, journals / contras touching cash). Nothing on the
// bills or vouchers is tagged or changed: the shift only reads them by the time they were saved. A draft confirmed
// later counts in the shift its draft was first saved in; cancelled documents are left out by the ledger.
import { CASH_ACCOUNT } from "../vouchers/accountVoucherDomain.js";
import { n, r2 } from "../reports/reportFilters.js";

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

export const openShifts = (shifts, shopId = "") => (shifts || []).filter((s) => s && !s.isDeleted && (!shopId || s.shopId === shopId) && s.status === "open")
  .sort((a, b) => isoOf(b.openedAt).localeCompare(isoOf(a.openedAt)));

/**
 * Cash movement of a shift: Cash in Hand postings whose document was saved in [fromIso, toIso).
 * ledger: buildGlobalLedger result; data: the lists it was built from.
 * -> { cashIn, cashOut, net, lines: [{ at, type, no, dr, cr, narration }] } (lines oldest first)
 */
export function shiftCash(ledger, data, fromIso, toIso) {
  const savedAt = new Map();
  Object.entries(SOURCE).forEach(([col, list]) => (data?.[list] || []).forEach((d) => { if (d?.id) savedAt.set(`${col}|${d.id}`, isoOf(d.createdAt)); }));
  const from = isoOf(fromIso), to = isoOf(toIso);
  const lines = (ledger?.postings || []).filter((p) => p.key === CASH_KEY).map((p) => ({ at: savedAt.get(`${p.col}|${p.docId}`) || "", type: p.type, no: p.no, dr: r2(p.dr), cr: r2(p.cr), narration: p.narration || "" }))
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
export function openShiftDoc({ openingCash, counter = "" }, shifts, { shopId, uid, name = "", now = new Date() }) {
  if (openShifts(shifts, shopId).length) return { error: "open" };
  const cash = money(openingCash);
  if (!Number.isFinite(cash) || cash < 0) return { error: "amount" };
  const at = isoOf(now);
  return {
    ok: true,
    doc: {
      shopId, status: "open", counter: String(counter || "").trim(), openingCash: r2(cash), openedAt: at, openedBy: uid, openedByName: name,
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
