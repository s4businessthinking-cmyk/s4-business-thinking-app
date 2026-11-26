// Sales bills in a foreign currency (sales-invoice/siForex.js: saved in the shop currency at the bill's rate, the typed
// figures kept in inv.fx). When the customer pays at another rate, the shop currency received differs from what the
// bill carries; the difference is the realised exchange gain / loss, posted as an ordinary journal (source "forex",
// fxKind "realisedSale", each line tied to the bill) the same way the supplier side does it (forex.js):
//   gain (more shop currency received): Dr customer / Cr Exchange Gain - the extra received on the receipt sat on the
//        customer as an advance; the journal clears it.
//   loss (less received):               Dr Exchange Loss / Cr customer - and the bill's balance is closed by that much
//        (invoice.fxSettledAed, added to amountPaid), so the pending-bills list and the ledger agree. Every report that
//        works out cash taken on the bill itself leaves fxSettledAed out (it is not money).
// Difference = foreign amount settled x (rate received - bill rate), rounded to the fils.
import { FX_GAIN, FX_LOSS } from "./forex.js";

const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round(Number(((Number(v) || 0) * 100).toFixed(6))) / 100;
const r6 = (v) => Math.round((Number(v) || 0) * 1e6) / 1e6;
const clean = (v) => String(v ?? "").trim();
const dayOf = (v) => String(v || "").slice(0, 10);
const isLive = (d, shopId) => d && !d.isDeleted && (!shopId || !d.shopId || d.shopId === shopId);

/** Live sales bills saved from a foreign currency. */
export function foreignSales(salesInvoices, shopId = "", baseCurrency = "AED") {
  const base = clean(baseCurrency).toUpperCase();
  return (salesInvoices || []).filter((inv) => isLive(inv, shopId) && ["confirmed", "partial", "paid"].includes(inv.status) && inv.docKind !== "quotation" && inv.invoiceType !== "delivery"
    && clean(inv.currency) && clean(inv.currency).toUpperCase() !== base && num(inv.exchangeRate) > 0 && num(inv.fx?.doc?.grandTotal) > 0);
}

/** Realised difference already posted per sales bill: Map(billId -> { amount, fc }) - amount > 0 is a gain. */
export function postedSalesFx(vouchers, { shopId = "" } = {}) {
  const map = new Map();
  (vouchers || []).filter((v) => isLive(v, shopId) && v.status !== "cancelled" && v.source === "forex" && String(v.fxKind || "").toLowerCase() === "realisedsale").forEach((v) => {
    (v.lines || []).forEach((l) => {
      if (!l.billId || (l.account !== FX_GAIN && l.account !== FX_LOSS)) return;
      const cur = map.get(l.billId) || { amount: 0, fc: 0 };
      cur.amount = r2(cur.amount + num(l.credit) - num(l.debit));
      cur.fc = r6(cur.fc + num(l.fcAmount));
      map.set(l.billId, cur);
    });
  });
  return map;
}

/**
 * Foreign-currency sales bills: [{ id, no, date, customerId, customerName, currency, billRate, fc, grandTotal, settledAed,
 * fxSettledAed, bookOpen, realised, realisedFc, fcToSettle }] - fcToSettle: foreign amount not yet given an exchange
 * difference (the most a new settlement can take).
 */
export function salesFxPosition({ salesInvoices, vouchers = [], customers = [], shopId = "", baseCurrency = "AED" }) {
  const posted = postedSalesFx(vouchers, { shopId });
  const masterName = new Map((customers || []).filter((c) => c?.id && !c.isDeleted && c.customerName).map((c) => [c.id, c.customerName]));
  return foreignSales(salesInvoices, shopId, baseCurrency).map((inv) => {
    const fc = r2(inv.fx.doc.grandTotal), gt = r2(inv.grandTotal), paid = r2(inv.amountPaid);
    const p = posted.get(inv.id) || { amount: 0, fc: 0 };
    return {
      id: inv.id, no: inv.invoiceNo || "", date: dayOf(inv.invoiceDate), customerId: inv.customerId || "", customerName: masterName.get(inv.customerId) || inv.customerName || "",
      currency: clean(inv.currency).toUpperCase(), billRate: num(inv.exchangeRate), fc, grandTotal: gt, settledAed: paid, fxSettledAed: r2(inv.fxSettledAed),
      bookOpen: r2(Math.max(0, gt - paid)), realised: p.amount, realisedFc: r2(p.fc), fcToSettle: r2(Math.max(0, fc - p.fc)),
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
}

/**
 * The exchange difference when `fcAmount` of the bill was received at `rate` (or `aedReceived` for it).
 * -> { error } | { id, doc, amount, kind: "gain" | "loss", invoicePatch } - amount > 0 gain, < 0 loss;
 * invoicePatch (loss only) closes that much of the bill's shop-currency balance.
 * errors: fc, fcMax (more than not yet settled), rate, date, same (no difference), short (loss bigger than the open balance)
 */
export function salesRealisedJournal({ bill, inv, fcAmount, rate, aedReceived, date, shopId = "", uid = "", by = "", now = new Date(), seq = 1 }) {
  const fc = r2(fcAmount);
  if (!(fc > 0)) return { error: "fc" };
  if (fc > bill.fcToSettle + 0.004) return { error: "fcMax" };
  const ra = num(aedReceived) > 0 ? num(aedReceived) / fc : num(rate);
  if (!(ra > 0)) return { error: "rate" };
  if (!date) return { error: "date" };
  const amount = r2(num(aedReceived) > 0 ? num(aedReceived) - fc * bill.billRate : fc * (ra - bill.billRate));
  if (Math.abs(amount) < 0.005) return { error: "same" };
  const loss = amount < 0;
  if (loss && -amount > bill.bookOpen + 0.004) return { error: "short" };
  const note = `${bill.no} ${bill.currency}`;
  const party = { account: bill.customerName, partyId: bill.customerId, billId: bill.id, note };
  const lines = loss
    ? [{ account: FX_LOSS, debit: -amount, credit: 0, billId: bill.id, note, fcAmount: fc, paidRate: r6(ra) }, { ...party, debit: 0, credit: -amount }]
    : [{ ...party, debit: amount, credit: 0 }, { account: FX_GAIN, debit: 0, credit: amount, billId: bill.id, note, fcAmount: fc, paidRate: r6(ra) }];
  const at = new Date(now).toISOString();
  const id = `fx-sale-${bill.id}-${seq}`;
  const doc = {
    shopId, voucherType: "journal", voucherNo: `FX-${bill.no}-${seq}`, voucherDate: date,
    narration: `Exchange difference on ${bill.no}: ${bill.currency} ${fc} received at ${r6(ra)} (booked at ${bill.billRate})`,
    lines, totalAmount: Math.abs(amount), status: "active", source: "forex", fxKind: "realisedSale", billId: bill.id,
    createdBy: uid, createdByName: by, createdAt: at, updatedAt: at, updatedBy: uid,
  };
  let invoicePatch = null;
  if (loss && inv) {
    const paid = r2(num(inv.amountPaid) - amount);
    const gt = r2(inv.grandTotal);
    const balanceDue = r2(Math.max(0, gt - paid));
    invoicePatch = { amountPaid: paid, balanceDue, fxSettledAed: r2(num(inv.fxSettledAed) - amount), status: balanceDue < 0.01 ? "paid" : "partial" };
  }
  return { id, doc, amount, kind: loss ? "loss" : "gain", invoicePatch };
}

/** Undo a loss settlement on the bill when its journal is cancelled. */
export function cancelSalesFxPatch(inv, journal) {
  const loss = (journal?.lines || []).filter((l) => l.account === FX_LOSS).reduce((t, l) => t + num(l.debit), 0);
  if (!(loss > 0) || !inv) return null;
  const paid = r2(Math.max(0, num(inv.amountPaid) - loss));
  const balanceDue = r2(Math.max(0, r2(inv.grandTotal) - paid));
  return { amountPaid: paid, balanceDue, fxSettledAed: r2(Math.max(0, num(inv.fxSettledAed) - loss)), status: balanceDue < 0.01 ? "paid" : paid > 0 ? "partial" : "confirmed" };
}
