export const INVOICE_BANK_PAY_METHODS = new Set(["bank", "bank_transfer", "card", "cheque"]);

export function isInvoiceBankPayMethod(method) {
  return INVOICE_BANK_PAY_METHODS.has(String(method || "").trim());
}