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

const r2 = (v) => Math.round((n2(v) + Number.EPSILON) * 100) / 100;

function invoiceDue(inv) {
  return Math.max(0, r2(n2(inv?.grandTotal) - n2(inv?.amountPaid)));
}

/**
 * Settle a return against the source bill first, then other open bills of the same party (oldest first).
 * Only the leftover becomes cash/cheque refund — so next vendor cheque / customer collection shrinks.
 */
export function planPartyReturnSettlement({
  sourceInvoice, returnTotal, invoices = [], partyIdKey, partyNameKey, exceptInvoiceIds = null,
}) {
  let left = r2(returnTotal);
  const apps = [];
  const skip = new Set(exceptInvoiceIds || []);
  const add = (inv, amt) => {
    const a = r2(Math.min(left, amt));
    if (!(a > 0.009) || !inv?.id) return;
    apps.push({
      invoiceId: inv.id,
      invoiceNo: inv.invoiceNo || "",
      supplierInvoiceNo: inv.supplierInvoiceNo || "",
      amount: a,
    });
    left = r2(left - a);
  };

  if (sourceInvoice && !skip.has(sourceInvoice.id)) add(sourceInvoice, invoiceDue(sourceInvoice));

  if (left > 0.009) {
    const pid = sourceInvoice?.[partyIdKey] || null;
    const pname = sourceInvoice?.[partyNameKey] || "";
    const others = (invoices || [])
      .filter((inv) => inv && inv.id && inv.id !== sourceInvoice?.id && !skip.has(inv.id))
      .filter((inv) => ["confirmed", "partial"].includes(inv.status) && !inv.isDeleted && !inv.deleted)
      .filter((inv) => (pid ? inv[partyIdKey] === pid : !!pname && inv[partyNameKey] === pname))
      .map((inv) => ({ inv, due: invoiceDue(inv) }))
      .filter((x) => x.due > 0.01)
      .sort((a, b) => String(a.inv.invoiceDate || "").localeCompare(String(b.inv.invoiceDate || "")));
    for (const { inv, due } of others) {
      if (left <= 0.009) break;
      add(inv, due);
    }
  }

  const appliedToInvoice = r2(apps.reduce((s, a) => s + a.amount, 0));
  return {
    appliedToInvoice,
    refundAmount: r2(Math.max(0, n2(returnTotal) - appliedToInvoice)),
    appliedAllocations: apps,
  };
}

/** Live purchase-return cash credit still owed by a vendor (not yet netted into bill dues). */
export function vendorReturnCredit(returns, vendorId, vendorName) {
  return r2((returns || []).reduce((t, r) => {
    if (!r || r.status === "cancelled" || !(n2(r.refundAmount) > 0.009)) return t;
    const match = vendorId ? r.partyId === vendorId : !!vendorName && r.partyName === vendorName;
    return match ? t + n2(r.refundAmount) : t;
  }, 0));
}

/** Oldest-first slices of live PR refund credit, for consuming against a cheque/payment. */
export function takeVendorReturnCredits(returns, vendorId, vendorName, amount) {
  let left = r2(amount);
  const out = [];
  if (!(left > 0.009)) return out;
  const list = (returns || [])
    .filter((r) => r && r.status !== "cancelled" && n2(r.refundAmount) > 0.009)
    .filter((r) => (vendorId ? r.partyId === vendorId : !!vendorName && r.partyName === vendorName))
    .sort((a, b) => String(a.returnDate || a.createdAt || "").localeCompare(String(b.returnDate || b.createdAt || "")));
  for (const r of list) {
    if (left <= 0.009) break;
    const take = r2(Math.min(n2(r.refundAmount), left));
    if (!(take > 0.009)) continue;
    out.push({ ret: r, amount: take });
    left = r2(left - take);
  }
  return out;
}

function mergeAllocations(prev, add) {
  const map = new Map();
  for (const a of [...(prev || []), ...(add || [])]) {
    if (!a?.invoiceId || !(n2(a.amount) > 0.009)) continue;
    const cur = map.get(a.invoiceId) || {
      invoiceId: a.invoiceId,
      invoiceNo: a.invoiceNo || "",
      supplierInvoiceNo: a.supplierInvoiceNo || "",
      amount: 0,
    };
    cur.amount = r2(cur.amount + n2(a.amount));
    if (a.invoiceNo) cur.invoiceNo = a.invoiceNo;
    if (a.supplierInvoiceNo) cur.supplierInvoiceNo = a.supplierInvoiceNo;
    map.set(a.invoiceId, cur);
  }
  return [...map.values()];
}

/**
 * Move leftover purchase-return refund credit onto the same vendor's other open bills (oldest first).
 * Used when opening the cheque/payment wizard so last-balance / month cheque already shows the net.
 */
export function planSettleLeftoverReturnCredits({
  returns = [],
  invoices = [],
  vendorId = null,
  vendorName = "",
  partyIdKey = "vendorId",
  partyNameKey = "vendorName",
}) {
  const originals = new Map((invoices || []).filter((i) => i?.id).map((i) => [i.id, i]));
  const invById = new Map([...originals.entries()].map(([id, i]) => [id, { ...i }]));
  const returnPatches = [];

  const list = (returns || [])
    .filter((r) => r && r.status !== "cancelled" && n2(r.refundAmount) > 0.009)
    .filter((r) => (vendorId ? r.partyId === vendorId : !!vendorName && r.partyName === vendorName))
    .sort((a, b) => String(a.returnDate || a.createdAt || "").localeCompare(String(b.returnDate || b.createdAt || "")));

  for (const r of list) {
    const credit = n2(r.refundAmount);
    if (!(credit > 0.009)) continue;
    let source = invById.get(r.invoiceId);
    if (!source) {
      source = {
        id: r.invoiceId,
        invoiceNo: r.invoiceNo || "",
        supplierInvoiceNo: r.supplierInvoiceNo || "",
        grandTotal: 0,
        amountPaid: 0,
        balanceDue: 0,
        status: "paid",
        [partyIdKey]: vendorId || r.partyId || null,
        [partyNameKey]: vendorName || r.partyName || "",
      };
    }
    const plan = planPartyReturnSettlement({
      sourceInvoice: source,
      returnTotal: credit,
      invoices: [...invById.values()],
      partyIdKey,
      partyNameKey,
    });
    if (!(plan.appliedToInvoice > 0.009)) continue;

    for (const a of plan.appliedAllocations) {
      const inv = invById.get(a.invoiceId);
      if (!inv) continue;
      const newPaid = r2(n2(inv.amountPaid) + n2(a.amount));
      const balance = Math.max(0, r2(n2(inv.grandTotal) - newPaid));
      inv.amountPaid = newPaid;
      inv.balanceDue = balance;
      inv.status = balance < 0.01 ? "paid" : newPaid > 0.009 ? "partial" : (inv.status || "confirmed");
    }

    const prevAllocs = (r.appliedAllocations || []).length
      ? r.appliedAllocations
      : (n2(r.appliedToInvoice) > 0.009 ? [{ invoiceId: r.invoiceId, invoiceNo: r.invoiceNo || "", amount: n2(r.appliedToInvoice) }] : []);
    const newRefund = r2(credit - plan.appliedToInvoice);
    returnPatches.push({
      id: r.id,
      prev: r,
      appliedToInvoice: r2(n2(r.appliedToInvoice) + plan.appliedToInvoice),
      appliedAllocations: mergeAllocations(prevAllocs, plan.appliedAllocations),
      refundAmount: newRefund,
      clearRefundVoucher: newRefund <= 0.009,
      addedAllocations: plan.appliedAllocations,
    });
  }

  const invoicePatches = [];
  for (const [id, next] of invById.entries()) {
    const prev = originals.get(id);
    if (!prev) continue;
    if (r2(n2(prev.amountPaid)) === r2(n2(next.amountPaid))) continue;
    invoicePatches.push({
      id,
      prev,
      amountPaid: next.amountPaid,
      balanceDue: next.balanceDue,
      status: next.status,
    });
  }
  return { invoicePatches, returnPatches };
}
