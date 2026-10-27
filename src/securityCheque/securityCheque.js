// Security Cheque Management: cheques held as collateral (vendor or customer, either direction),
// separate from PDC (actual payment/receipt cheques) and from accountVouchers. A record here never
// references a purchase/sales voucher id, so it cannot affect real payment or invoice balances.
const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
export const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const day10 = (v) => String(v || "").slice(0, 10);
const toDate = (d) => new Date(`${day10(d)}T12:00:00`);
export const dayDiff = (a, b) => Math.round((toDate(a) - toDate(b)) / 86400000);

export const PARTY_TYPES = [
  { key: "vendor", bn: "ভেন্ডর / সাপ্লায়ার", en: "Vendor / Supplier" },
  { key: "customer", bn: "কাস্টমার", en: "Customer" },
];

export const DIRECTIONS = [
  { key: "give", bn: "আমরা চেক দিচ্ছি", en: "We give the cheque" },
  { key: "receive", bn: "আমরা চেক নিচ্ছি", en: "We receive the cheque" },
];

export const STATUSES = [
  { key: "held", bn: "জমা আছে", en: "Held" },
  { key: "returned", bn: "ফেরত দেওয়া হয়েছে", en: "Returned" },
  { key: "presented", bn: "ব্যাংকে জমা দেওয়া হয়েছে", en: "Presented" },
];

export const ID_TYPES = ["Emirates ID", "Passport", "Other ID"];

export const SECURITY_CHEQUE_DEFAULTS = { reminderMonths: 3 };

/** Every field shown on the New/Edit form; `req` marks what validate() requires. */
export const SECURITY_CHEQUE_FIELDS = [
  { k: "partyType", bn: "পার্টির ধরন *", en: "Party type *", req: true },
  { k: "direction", bn: "চেকের দিক *", en: "Direction *", req: true },
  { k: "party", bn: "পার্টি / কোম্পানির নাম *", en: "Party / company name *", req: true },
  { k: "rep", bn: "প্রতিনিধির নাম", en: "Representative name" },
  { k: "repRole", bn: "প্রতিনিধির পদ", en: "Representative role" },
  { k: "idType", bn: "আইডির ধরন", en: "ID type" },
  { k: "idNumber", bn: "আইডি নম্বর (ঐচ্ছিক)", en: "ID number (optional)" },
  { k: "chequeNo", bn: "চেক নম্বর *", en: "Cheque number *", req: true },
  { k: "bank", bn: "ব্যাংক *", en: "Bank *", req: true },
  { k: "amount", bn: "চেকের পরিমাণ *", en: "Cheque amount *", req: true, t: "decimal" },
  { k: "handoverDate", bn: "হস্তান্তর / গ্রহণের তারিখ *", en: "Handover / received date *", req: true, t: "date" },
  { k: "terms", bn: "চুক্তি / ক্রেডিট শর্ত", en: "Agreement / credit terms" },
  { k: "lastTxn", bn: "সর্বশেষ লেনদেনের তারিখ *", en: "Last transaction date *", req: true, t: "date" },
  { k: "staff", bn: "দায়িত্বে থাকা কর্মী", en: "Responsible staff" },
  { k: "reminderMonths", bn: "কত মাস লেনদেন না হলে মনে করিয়ে দেবে", en: "Remind after no transactions (months)", t: "decimal" },
  { k: "notes", bn: "নোট", en: "Notes", t: "textarea" },
];

export const SECURITY_CHEQUE_DOC_FLAGS = [
  { k: "chequeCopy", bn: "চেকের কপি সংযুক্ত (সামনে/পেছনে)", en: "Cheque copy attached (front/back)" },
  { k: "idCopy", bn: "প্রতিনিধির আইডি কপি সংযুক্ত", en: "Representative ID copy attached" },
  { k: "signedReceipt", bn: "সই করা রসিদ পাওয়া গেছে", en: "Signed receipt received" },
  { k: "agreementCopy", bn: "চুক্তি / ক্রেডিট শর্তের কপি সংযুক্ত", en: "Agreement / credit terms copy attached" },
];

export function emptySecurityCheque() {
  return {
    partyType: "vendor", direction: "give", party: "", partyId: "", rep: "", repRole: "",
    idType: ID_TYPES[0], idNumber: "", chequeNo: "", bank: "", amount: "",
    handoverDate: "", terms: "", lastTxn: "", staff: "",
    reminderMonths: SECURITY_CHEQUE_DEFAULTS.reminderMonths,
    chequeCopy: false, idCopy: false, signedReceipt: false, agreementCopy: false,
    notes: "", status: "held", closureRequested: false, closureApproved: false,
    receiptNo: "", receiptDate: "", receiptTitle: "", receiptFileName: "",
    signedReceiptCopyFileName: "", agreementFileName: "", returnEvidenceFileName: "",
    linkedInvoices: [],
  };
}

/** This party's open (unpaid/partial) invoices from the given list — same rule PDC/payment
 *  vouchers already use elsewhere (status confirmed/partial, balanceDue > 0.01), applied locally
 *  so this module never has to import from the purchase/sales modules. */
export function openInvoicesFor(invoices, idField, partyId) {
  if (!partyId) return [];
  return (invoices || [])
    .filter((inv) => inv && ["confirmed", "partial"].includes(inv.status) && num(inv.balanceDue) > 0.01 && inv[idField] === partyId)
    .sort((a, b) => String(a.invoiceDate || "").localeCompare(String(b.invoiceDate || "")));
}

/** This party's current outstanding balance (AP or AR) — a read-only sum of `balanceDue`,
 *  the same field accountsCalc.js sums shop-wide; never written back anywhere. */
export function outstandingBalanceFor(invoices, idField, partyId) {
  if (!partyId) return 0;
  return r2((invoices || [])
    .filter((inv) => inv && inv.status !== "cancelled" && inv[idField] === partyId)
    .reduce((t, inv) => t + Math.max(0, num(inv.balanceDue)), 0));
}

/** Required-field check for the New/Edit form; returns the first missing field's label, or "" if OK. */
export function validateSecurityCheque(form, bn) {
  for (const f of SECURITY_CHEQUE_FIELDS) {
    if (!f.req) continue;
    const v = form?.[f.k];
    if (f.k === "amount" ? !(num(v) > 0) : !String(v ?? "").trim()) return bn ? f.bn : f.en;
  }
  return "";
}

const live = (r, shopId) => r && !r.isDeleted && (!shopId || r.shopId === shopId);
export const liveSecurityCheques = (records, shopId) => (records || []).filter((r) => live(r, shopId));

/** True once `reminderMonths` have passed since the last recorded transaction, for a still-held cheque. */
export function isStale(record, today) {
  if (!record?.lastTxn || record.status !== "held") return false;
  const months = Number(record.reminderMonths) || SECURITY_CHEQUE_DEFAULTS.reminderMonths;
  const d = new Date(`${day10(record.lastTxn)}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return new Date(`${day10(today)}T00:00:00`) >= d;
}

/** What needs attention for one record: stale (no-transaction) reminder, closure pending, incomplete documents. */
export function alertsFor(record, today) {
  const out = [];
  if (record.status === "held" && isStale(record, today)) {
    out.push({ kind: "stale", tone: "warn", months: Number(record.reminderMonths) || SECURITY_CHEQUE_DEFAULTS.reminderMonths });
  }
  if (record.closureRequested && !record.closureApproved && record.status === "held") {
    out.push({ kind: "closure", tone: "bad" });
  }
  if (record.status === "held" && (!record.chequeCopy || !record.idCopy || !record.signedReceipt)) {
    out.push({ kind: "docs", tone: "warn" });
  }
  return out;
}

const ALERT_ORDER = { bad: 0, warn: 1, info: 2 };

/** Owner/staff-facing feed of every record needing attention, newest/most-severe first. */
export function securityChequeAlerts({ records = [], shopId = "", today }) {
  const out = [];
  liveSecurityCheques(records, shopId).forEach((r) => {
    alertsFor(r, today).forEach((a) => out.push({ key: `sc:${a.kind}:${r.id}`, recordId: r.id, party: r.party, amount: r2(r.amount), ...a }));
  });
  return out.sort((a, b) => ALERT_ORDER[a.tone] - ALERT_ORDER[b.tone]);
}

const money = (v, cur) => `${cur} ${r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function securityChequeAlertText(a, bn, cur = "AED") {
  switch (a.kind) {
    case "stale":
      return {
        icon: "🔔",
        title: bn ? `${a.party} — ${a.months} মাস কোনো লেনদেন নেই` : `${a.party} — no transaction for ${a.months} months`,
        sub: bn ? "সিকিউরিটি চেক ফেরত দেওয়া বা অ্যাকাউন্ট বন্ধ করার কথা ভাবুন" : "Consider returning the security cheque or closing the account",
      };
    case "closure":
      return {
        icon: "⚠️",
        title: bn ? `${a.party} — বন্ধের অনুরোধ, চেক এখনো জমা` : `${a.party} — closure requested, cheque still held`,
        sub: bn ? "মালিকের অনুমোদন ও চেক ফেরতের অপেক্ষায়" : "Awaiting owner approval and cheque return",
      };
    case "docs":
      return {
        icon: "📎",
        title: bn ? `${a.party} — ডকুমেন্ট অসম্পূর্ণ` : `${a.party} — documents incomplete`,
        sub: bn ? "চেক কপি, আইডি কপি ও সই করা রসিদ যাচাই করুন" : "Check cheque copy, ID copy and signed receipt",
      };
    default:
      return { icon: "🔒", title: a.party || "", sub: a.amount ? money(a.amount, cur) : "" };
  }
}
