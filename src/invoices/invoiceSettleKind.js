// When a return or warranty credit closes a bill's balance, status is still "paid" (balance due 0)
// but settleKind marks that no cash was collected — UI must not say "Paid" as if the customer paid money.

export const SETTLE_BY_RETURN = "return";
export const SETTLE_BY_WARRANTY = "warranty";

export function invoiceStatusLabel(inv, lang = "en", statuses = null) {
  if (inv?.status === "paid" && inv?.settleKind === SETTLE_BY_RETURN) {
    return lang === "bn" ? "রিটার্নে নিষ্পন্ন" : "Settled by return";
  }
  if (inv?.status === "paid" && inv?.settleKind === SETTLE_BY_WARRANTY) {
    return lang === "bn" ? "গ্যারান্টিতে নিষ্পন্ন" : "Settled by warranty";
  }
  const st = inv?.status;
  return (statuses && st && statuses[st]?.[lang]) || st || "";
}

/** Status + settleKind patch when amountPaid / balanceDue change. */
export function settleStatusPatch(balance, amountPaid, { byReturn = false, byWarranty = false } = {}) {
  if (balance < 0.01) {
    if (byWarranty) return { status: "paid", settleKind: SETTLE_BY_WARRANTY };
    if (byReturn) return { status: "paid", settleKind: SETTLE_BY_RETURN };
    return { status: "paid", settleKind: "" };
  }
  if (amountPaid > 0.009) return { status: "partial", settleKind: "" };
  return { status: "confirmed", settleKind: "" };
}
