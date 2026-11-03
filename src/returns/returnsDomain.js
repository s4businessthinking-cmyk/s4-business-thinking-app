const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const RETURN_KINDS = {
  sales: {
    col: "salesReturns", invCol: "salesInvoices", prefix: "SR", serial: "lastSRSerial",
    partyId: "customerId", partyName: "customerName", partyMobile: "customerMobile", priceKey: "unitPrice", vatKey: "vatAmt",
    accent: "#16a34a", printTitle: "CREDIT NOTE",
    title: { bn: "↩️ সেলস রিটার্ন (ক্রেডিট নোট)", en: "↩️ Sales Return (Credit Note)" },
    party: { bn: "কাস্টমার", en: "Customer" },
    refund: { bn: "কাস্টমারকে টাকা ফেরত", en: "Refund to customer" },
  },
  purchase: {
    col: "purchaseReturns", invCol: "purchaseInvoices", prefix: "PR", serial: "lastPRSerial",
    partyId: "vendorId", partyName: "vendorName", partyMobile: "vendorMobile", priceKey: "unitCost", vatKey: "taxAmt",
    accent: "#ea580c", printTitle: "DEBIT NOTE",
    title: { bn: "↪️ পারচেজ রিটার্ন (ডেবিট নোট)", en: "↪️ Purchase Return (Debit Note)" },
    party: { bn: "সাপ্লায়ার", en: "Supplier" },
    refund: { bn: "সাপ্লায়ার থেকে টাকা ফেরত", en: "Refund from supplier" },
  },
};

export function returnedQtyByLine(returns, invoiceId, exceptId = null) {
  const map = new Map();
  (returns || []).forEach((r) => {
    if (r.invoiceId !== invoiceId || r.status === "cancelled" || r.id === exceptId) return;
    (r.items || []).forEach((it) => map.set(it.lineIndex, (map.get(it.lineIndex) || 0) + n2(it.qty)));
  });
  return map;
}

// Credit/debit notes shown in the party ledger next to receipts/payments.
// Refund-only notes still appear (audit) but settle amount stays appliedToInvoice so AR/AP is not skewed.
export function returnsAsLedgerVouchers(returns, kind) {
  const k = RETURN_KINDS[kind];
  return (returns || [])
    .filter((r) => r.status !== "cancelled" && (n2(r.appliedToInvoice) > 0.009 || n2(r.refundAmount) > 0.009 || n2(r.total) > 0.009))
    .map((r) => {
      const applied = n2(r.appliedToInvoice);
      const refund = n2(r.refundAmount);
      const baseLabel = kind === "sales" ? "Credit Note" : "Debit Note";
      const typeLabel = refund > 0.009 && applied < 0.009 ? `${baseLabel} (Refunded)` : baseLabel;
      return {
        id: `ret-${r.id}`, no: r.returnNo, date: String(r.returnDate || "").slice(0, 10),
        partyId: r.partyId || null, partyName: r.partyName || "", partyMobile: r.partyMobile || "",
        method: typeLabel, typeLabel,
        amount: applied,
        status: r.status,
        // Settle only appliedToInvoice — never refund/total (else party-ledger "direct" paid shrinks).
        allocations: [{ invoiceId: r.invoiceId, invoiceNo: r.invoiceNo, amount: applied }],
        raw: { ...r, __return: true }, ref: k.prefix,
      };
    });
}

export function billHaystack(inv, partyNameKey, partyMobileKey) {
  return [
    inv.invoiceNo, inv.supplierInvoiceNo, inv[partyNameKey], inv[partyMobileKey],
    ...(inv.items || []).map((it) => `${it.name || ""} ${it.code || ""} ${it.brand || ""}`),
  ].join(" ").toLowerCase();
}

export const RETURNABLE_STATUSES = ["confirmed", "partial", "paid"];

/** Server/client shared: reject over-return and bad invoice links. Returns null if ok, else error code. */
export function validateReturnItems(invoice, items, priorReturns = [], exceptReturnId = null) {
  if (!invoice || invoice.isDeleted || invoice.deleted) return "INVOICE_MISSING";
  if (!RETURNABLE_STATUSES.includes(invoice.status)) return "INVOICE_NOT_RETURNABLE";
  const lines = invoice.items || [];
  if (!Array.isArray(items) || !items.length) return "NO_ITEMS";
  const already = returnedQtyByLine(priorReturns, invoice.id, exceptReturnId);
  for (const it of items) {
    const idx = Number(it.lineIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= lines.length) return "BAD_LINE";
    const qty = n2(it.qty);
    if (!(qty > 0)) return "BAD_QTY";
    const sold = n2(lines[idx].qty);
    const left = Math.max(0, sold - (already.get(idx) || 0));
    if (qty > left + 1e-9) return "OVER_QTY";
  }
  return null;
}

export function poGrnFieldsFromInvoice(inv) {
  if (!inv) return {};
  return {
    ...(inv.purchaseOrderId ? { purchaseOrderId: inv.purchaseOrderId, purchaseOrderNo: inv.purchaseOrderNo || "" } : {}),
    ...(inv.goodsReceiptId ? { goodsReceiptId: inv.goodsReceiptId, goodsReceiptNo: inv.goodsReceiptNo || "" } : {}),
    ...(Array.isArray(inv.goodsReceiptIds) && inv.goodsReceiptIds.length
      ? { goodsReceiptIds: inv.goodsReceiptIds, goodsReceiptNos: inv.goodsReceiptNos || [] }
      : {}),
  };
}

/** Single or multi GRN label — same rule as purchase invoice screens. */
export function grnLabel(doc) {
  const nos = Array.isArray(doc?.goodsReceiptNos) ? doc.goodsReceiptNos.filter(Boolean) : [];
  if (nos.length > 1) return nos.join(", ");
  return doc?.goodsReceiptNo || nos[0] || "";
}
