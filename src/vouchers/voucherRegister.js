// Voucher register: journal, contra, receipt and payment vouchers in one list with type, date, status and text
// filters. Read-only. Amounts follow the global ledger: a receipt is its total, a payment is what left the shop
// (cheque amount, else total less discount). Cancelled vouchers can be listed but never count in the totals.
// Debit / credit notes are sales / purchase returns and keep their own register on the Returns pages.
import { r2, voucherParticulars } from "./accountVoucherDomain.js";

const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const day = (v) => String(v || "").slice(0, 10);
const lc = (v) => String(v || "").trim().toLowerCase();
export const REGISTER_TYPES = ["journal", "contra", "receipt", "payment"];
const TYPE_EN = { journal: "Journal", contra: "Contra", receipt: "Receipt", payment: "Payment" };
const METHOD_EN = { cash: "Cash", cheque: "Cheque", bank_transfer: "Bank transfer", bank: "Bank transfer", card: "Card", credit: "Credit" };

const allocNos = (v) => (v.allocations || []).map((a) => a.invoiceNo || a.supplierInvoiceNo).filter(Boolean);

function rowOf(kind, v) {
  if (kind === "journal" || kind === "contra") {
    return {
      kind, refund: false, id: v.id, no: v.voucherNo || "", date: day(v.voucherDate || v.createdAt), particulars: voucherParticulars(v), party: "",
      narration: v.narration || "", ref: v.refNo || "", method: "", amount: r2(v.totalAmount), user: v.createdByName || "", cancelled: v.status === "cancelled", src: v,
    };
  }
  const isReceipt = kind === "receipt";
  const party = (isReceipt ? v.customerName : v.vendorName) || "";
  const amount = isReceipt ? r2(v.totalAmount) : r2(v.chequeAmount != null ? n(v.chequeAmount) : n(v.totalAmount) - n(v.discountAmount));
  const bills = allocNos(v);
  return {
    kind, refund: !!v.isRefund, id: v.id, no: (isReceipt ? v.receiptNo : v.paymentNo) || "", date: day((isReceipt ? v.receiptDate : v.paymentDate) || v.createdAt),
    particulars: [party, bills.length ? `Bills ${bills.join(", ")}` : "", v.returnNo ? `Return ${v.returnNo}` : ""].filter(Boolean).join(" · "), party,
    narration: v.note || "", ref: [v.chequeNo && `Chq ${v.chequeNo}`, v.chequeBank].filter(Boolean).join(" ") || v.refNo || "", method: v.method || "",
    amount, discount: isReceipt ? 0 : r2(v.discountAmount), chequeStatus: v.method === "cheque" ? (v.chequeStatus || "pending") : "",
    user: v.createdByName || v.collectedByName || "", cancelled: v.status === "cancelled", src: v,
  };
}

/**
 * data: { accountVouchers, receipts, payments }.
 * opts: { shopId, userId, isOwner, include: { journal, contra, receipt, payment }, from, to, type, status: "active"|"cancelled"|"all", query }
 * Journal / contra: staff see only their own, as on the journal list.
 * -> { rows (newest first), kpi: { [type]: { count, amount } }, total: { count, amount }, cancelled }
 */
export function buildVoucherRegister(data, opts = {}) {
  const { shopId = "", userId = "", isOwner = false, include = {}, from = "", to = "", type = "", status = "active", query = "" } = opts;
  const mineShop = (v) => v && !v.isDeleted && !v.deleted && (!shopId || !v.shopId || v.shopId === shopId);
  const all = [
    ...(data?.accountVouchers || []).filter((v) => mineShop(v) && include[v.voucherType] && (isOwner || v.createdBy === userId)).map((v) => rowOf(v.voucherType, v)),
    ...(include.receipt ? (data?.receipts || []).filter(mineShop).map((v) => rowOf("receipt", v)) : []),
    ...(include.payment ? (data?.payments || []).filter(mineShop).map((v) => rowOf("payment", v)) : []),
  ];
  const q = lc(query);
  const inPeriod = all.filter((r) => (!from || r.date >= from) && (!to || r.date <= to) && (!type || r.kind === type)
    && (!q || [r.no, r.particulars, r.party, r.narration, r.ref, r.user].some((v) => lc(v).includes(q))));
  const rows = inPeriod.filter((r) => (status === "all" ? true : status === "cancelled" ? r.cancelled : !r.cancelled))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.no).localeCompare(String(a.no), undefined, { numeric: true }));
  const counted = inPeriod.filter((r) => !r.cancelled);
  const kpi = Object.fromEntries(REGISTER_TYPES.map((t) => {
    const list = counted.filter((r) => r.kind === t);
    return [t, { count: list.length, amount: r2(list.reduce((s, r) => s + r.amount, 0)) }];
  }));
  return {
    rows, kpi,
    total: { count: counted.length, amount: r2(counted.reduce((s, r) => s + r.amount, 0)) },
    cancelled: inPeriod.length - counted.length,
  };
}

export const typeName = (r) => (r.refund ? (r.kind === "receipt" ? "Refund to customer" : "Refund from supplier") : TYPE_EN[r.kind] || r.kind);
export const REGISTER_COLS = ["Date", "Type", "Voucher No", "Particulars", "Party", "Method", "Reference", "Narration", "Amount", "Status", "Entered by"];

/** CSV rows: fixed English headers, plain-number amounts, cancelled marked and left out of the total line. */
export function registerRows(reg) {
  return [
    REGISTER_COLS,
    ...reg.rows.map((r) => [r.date, typeName(r), r.no, r.particulars, r.party, METHOD_EN[r.method] || r.method, r.ref, r.narration, r.amount.toFixed(2),
      r.cancelled ? "Cancelled" : r.chequeStatus ? `Active (cheque ${r.chequeStatus})` : "Active", r.user]),
    ["Total (cancelled left out)", `${reg.total.count} voucher(s)`, "", "", "", "", "", "", reg.total.amount.toFixed(2), "", ""],
  ];
}

export const registerFileName = (type, from, to) => `voucher-register-${type || "all"}-${from || "start"}-${to || "today"}.csv`;
