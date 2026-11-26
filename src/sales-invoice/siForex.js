// Sales invoices in a foreign currency (USD, SAR...): the bill is typed and printed in that currency, but it is saved
// and booked in the shop's own currency, the same way purchase bills are (purchase/piInvoiceActions.js):
// every amount on the saved bill (lines, totals, paid, balance) is the shop-currency amount at the bill's exchange rate,
// so the ledger, VAT, P&L, ageing and stock value read it unchanged. `currency` / `exchangeRate` say what it was typed
// in, and `fx` keeps the typed figures so the bill can be printed and edited in that currency again.
// Receipts are in the shop currency; when a customer pays at another rate, the difference is left on the customer's
// balance for the owner to clear (there is no automatic sales exchange gain / loss yet).
// half-up at the cent: 126 x 3.6725 is 462.73499999... in binary, which must round to 462.74
const r2 = (v) => Math.round(Number(((Number(v) || 0) * 100).toFixed(6))) / 100;
const r4 = (v) => Math.round(Number(((Number(v) || 0) * 10000).toFixed(4))) / 10000;
const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const code = (v) => String(v || "").trim().toUpperCase();

export const SALE_DOC_MONEY = ["subtotal", "totalDiscount", "totalVat", "grandTotal", "billDiscAmt", "billDiscount", "adjustment", "roundOff", "amountPaid", "balanceDue"];
export const SALE_ITEM_MONEY = ["unitPrice", "discountFlat", "discountAmt", "vatAmt", "lineTotal"];

/** Is a bill in this currency foreign for the shop? */
export const isForeignSale = (currency, baseCurrency = "AED") => !!code(currency) && code(currency) !== code(baseCurrency || "AED");

/**
 * Bill typed in a foreign currency -> the bill to save in the shop currency.
 * doc: the built bill with every amount in the typed currency. -> { error: "rate" } | the doc in the shop currency with
 * currency, exchangeRate and fx: { currency, rate, base, doc: { amounts as typed }, items: [{ amounts as typed }] }.
 */
export function saleToBase(doc, { rate, baseCurrency = "AED" } = {}) {
  const k = num(rate);
  if (!(k > 0)) return { error: "rate" };
  const typedDoc = Object.fromEntries(SALE_DOC_MONEY.filter((f) => doc[f] != null).map((f) => [f, num(doc[f])]));
  const typedItems = (doc.items || []).map((it) => Object.fromEntries(SALE_ITEM_MONEY.filter((f) => it[f] != null).map((f) => [f, num(it[f])])));
  const out = { ...doc };
  SALE_DOC_MONEY.forEach((f) => { if (doc[f] != null) out[f] = r2(num(doc[f]) * k); });
  out.items = (doc.items || []).map((it) => {
    const x = { ...it };
    SALE_ITEM_MONEY.forEach((f) => { if (it[f] != null) x[f] = f === "unitPrice" ? r4(num(it[f]) * k) : r2(num(it[f]) * k); });
    return x;
  });
  // the bill's own totals (total, VAT) are converted as a whole - the VAT in AED is the bill's VAT at the rate; lines are
  // converted one by one, so their AED sum can differ from the total by a fils of rounding
  if (doc.amountPaid != null && doc.grandTotal != null && Math.abs(num(doc.amountPaid) - num(doc.grandTotal)) < 0.005) out.amountPaid = out.grandTotal;
  if (doc.balanceDue != null) out.balanceDue = r2(Math.max(0, out.grandTotal - num(out.amountPaid)));
  return { ...out, currency: code(doc.currency), exchangeRate: k, fx: { currency: code(doc.currency), rate: k, base: code(baseCurrency || "AED"), doc: typedDoc, items: typedItems } };
}

/** A saved bill as typed (for the form and the print): amounts back in its own currency; a shop-currency bill as it is. */
export function saleAsTyped(inv) {
  const fx = inv?.fx;
  if (!fx || !(num(fx.rate) > 0)) return inv;
  const back = (v) => r2(num(v) / num(fx.rate));
  const out = { ...inv };
  SALE_DOC_MONEY.forEach((f) => { if (inv[f] != null) out[f] = fx.doc?.[f] != null ? fx.doc[f] : back(inv[f]); });
  // money received later (receipts, returns applied) is in the shop currency: show it at the bill's rate
  if (inv.amountPaid != null) out.amountPaid = Math.abs(num(inv.amountPaid) - num(inv.grandTotal)) < 0.005 && fx.doc?.grandTotal != null ? fx.doc.grandTotal : back(inv.amountPaid);
  if (inv.balanceDue != null) out.balanceDue = back(inv.balanceDue);
  out.items = (inv.items || []).map((it, i) => {
    const typed = fx.items?.[i] || {};
    const x = { ...it };
    SALE_ITEM_MONEY.forEach((f) => { if (it[f] != null) x[f] = typed[f] != null ? typed[f] : back(it[f]); });
    return x;
  });
  return out;
}

/** Lines for the printed bill: the rate and the shop-currency totals (UAE: the VAT of a tax invoice must show in AED). */
export function saleFxNote(inv) {
  const fx = inv?.fx;
  if (!fx || !(num(fx.rate) > 0)) return null;
  return {
    rate: `1 ${fx.currency} = ${num(fx.rate)} ${fx.base}`,
    total: `${fx.base} ${r2(inv.grandTotal).toFixed(2)}`,
    vat: `${fx.base} ${r2(inv.totalVat).toFixed(2)}`,
    base: fx.base, currency: fx.currency,
  };
}
