import { isInvoiceBankPayMethod } from "./invoiceBankPay.js";
import { shopBankAccountName } from "./ledgerShopOpts.js";

const n = (v) => Number(v) || 0;

export function invoiceNeedsPaymentBankRepair(inv) {
  if (!inv || inv.isDeleted || inv.deleted) return false;
  if (!isInvoiceBankPayMethod(inv.paymentMethod)) return false;
  if (n(inv.amountPaid) < 0.009) return false;
  return !String(inv.paymentBank || "").trim();
}

export function paymentBankRepairPatch(shop) {
  const name = shopBankAccountName(shop);
  return name ? { paymentBank: name } : {};
}