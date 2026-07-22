export const BRANCH_TRANSFER_STATUSES = Object.freeze({
  DRAFT: "draft",
  PACKED: "packed",
  DISPATCHED: "dispatched",
  IN_TRANSIT: "in_transit",
  PARTIALLY_RECEIVED: "partially_received",
  DISCREPANCY: "discrepancy",
  RECEIVED: "received",
  CANCELLED: "cancelled",
});

export const DEFAULT_BRANCH_TRANSFER_SETTINGS = Object.freeze({
  enabled: false,
  autoCreatePurchaseInvoiceOnReceive: true,
  allowPartialReceive: true,
});

export function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundMoney(value) {
  return Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;
}

export function createDocumentId(prefix = "id") {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function sanitizeDocumentId(value) {
  return String(value || "")
    .trim()
    .replaceAll("/", "-")
    .replace(/\s+/g, "-");
}

export function normalizeTransferItem(item, product = null) {
  const source = product || {};
  const quantity = numberValue(item?.quantity ?? item?.qty);
  const unitCost = numberValue(
    item?.unitCost ?? source.landingCost ?? source.vatExclusive ?? source.purchasePrice
  );

  return {
    lineId: item?.lineId || createDocumentId("line"),
    productId: item?.productId || source.id || null,
    name: String(item?.name || source.name || "").trim(),
    code: String(item?.code || source.code || source.barcode || "").trim(),
    brand: String(item?.brand || source.brand || "").trim(),
    unit: String(item?.unit || source.unit || "Pcs").trim() || "Pcs",
    quantity,
    unitCost: roundMoney(unitCost),
    lineTotal: roundMoney(quantity * unitCost),
  };
}

export function validateTransferItems(items = []) {
  const normalized = items.map((item) => normalizeTransferItem(item));

  if (!normalized.length) {
    throw new Error("TRANSFER_ITEMS_REQUIRED");
  }

  for (const item of normalized) {
    if (!item.productId || !item.name) {
      throw new Error("TRANSFER_PRODUCT_REQUIRED");
    }
    if (item.quantity <= 0) {
      throw new Error("TRANSFER_QUANTITY_INVALID");
    }
    if (item.unitCost < 0) {
      throw new Error("TRANSFER_UNIT_COST_INVALID");
    }
  }

  return normalized;
}

export function receivedQuantityForLine(transfer, lineId) {
  return (transfer?.receipts || []).reduce((total, receipt) => {
    const line = (receipt.lines || []).find((entry) => entry.lineId === lineId);
    return total + numberValue(line?.acceptedQty);
  }, 0);
}

export function remainingQuantityForLine(transfer, item) {
  return Math.max(
    0,
    numberValue(item?.quantity) - receivedQuantityForLine(transfer, item?.lineId)
  );
}

export function buildReceiptLines(transfer, inputLines = []) {
  const byLineId = new Map(inputLines.map((line) => [line.lineId, line]));

  return (transfer?.items || []).map((item) => {
    const input = byLineId.get(item.lineId) || {};
    const previouslyReceivedQty = receivedQuantityForLine(transfer, item.lineId);
    const remainingBefore = Math.max(0, numberValue(item.quantity) - previouslyReceivedQty);
    const receivedQty = numberValue(input.receivedQty);
    const damagedQty = numberValue(input.damagedQty);

    if (receivedQty < 0 || damagedQty < 0 || damagedQty > receivedQty) {
      throw new Error("RECEIPT_QUANTITY_INVALID");
    }
    if (receivedQty > remainingBefore) {
      throw new Error("RECEIPT_EXCEEDS_REMAINING");
    }

    const acceptedQty = receivedQty - damagedQty;

    return {
      lineId: item.lineId,
      productId: item.productId,
      name: item.name,
      code: item.code || "",
      brand: item.brand || "",
      unit: item.unit || "Pcs",
      unitCost: roundMoney(item.unitCost),
      sentQty: numberValue(item.quantity),
      previouslyReceivedQty,
      receivedQty,
      damagedQty,
      acceptedQty,
      remainingQtyAfter: Math.max(0, remainingBefore - acceptedQty),
      issueNote: String(input.issueNote || "").trim(),
    };
  });
}

export function deriveTransferStatus(transfer, receiptLines = []) {
  const existingAccepted = (transfer?.receipts || []).reduce(
    (sum, receipt) =>
      sum + (receipt.lines || []).reduce((lineSum, line) => lineSum + numberValue(line.acceptedQty), 0),
    0
  );
  const newAccepted = receiptLines.reduce((sum, line) => sum + numberValue(line.acceptedQty), 0);
  const totalSent = (transfer?.items || []).reduce(
    (sum, item) => sum + numberValue(item.quantity),
    0
  );
  const hasDiscrepancy = receiptLines.some(
    (line) => numberValue(line.damagedQty) > 0 || Boolean(line.issueNote)
  );
  const totalAccepted = existingAccepted + newAccepted;

  if (hasDiscrepancy) return BRANCH_TRANSFER_STATUSES.DISCREPANCY;
  if (totalAccepted >= totalSent && totalSent > 0) return BRANCH_TRANSFER_STATUSES.RECEIVED;
  if (totalAccepted > 0) return BRANCH_TRANSFER_STATUSES.PARTIALLY_RECEIVED;
  return transfer?.status || BRANCH_TRANSFER_STATUSES.DISPATCHED;
}

export function buildInternalPurchaseInvoice({
  transfer,
  receipt,
  shop,
  actor,
  invoiceId,
  paymentMethod = "cash",
  createdAt = new Date().toISOString(),
}) {
  const items = (receipt?.lines || [])
    .filter((line) => numberValue(line.acceptedQty) > 0)
    .map((line) => {
      const qty = numberValue(line.acceptedQty);
      const unitCost = roundMoney(line.unitCost);
      return {
        productId: line.productId || null,
        name: line.name || "",
        code: line.code || "",
        brand: line.brand || "",
        qty,
        unit: line.unit || "Pcs",
        unitCost,
        discountPerc: 0,
        discountAmt: 0,
        taxPerc: 0,
        taxAmt: 0,
        lineTotal: roundMoney(qty * unitCost),
        salePrice: null,
      };
    });

  if (!items.length) {
    throw new Error("PURCHASE_INVOICE_ITEMS_REQUIRED");
  }

  const grandTotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const normalizedPaymentMethod = paymentMethod === "credit" ? "credit" : "cash";
  const amountPaid = normalizedPaymentMethod === "cash" ? grandTotal : 0;
  const balanceDue = Math.max(0, roundMoney(grandTotal - amountPaid));
  const transferNo = String(transfer?.transferNo || transfer?.id || "TRANSFER");
  const receiptSequence = Number(receipt?.sequence || 1);

  return {
    id: invoiceId,
    shopId: transfer.shopId,
    invoiceNo: `PI-BT-${transferNo}-${receiptSequence}`,
    supplierInvoiceNo: String(transfer?.supplierInvoiceNo || "").trim(),
    invoiceDate: String(receipt?.receivedAt || createdAt).slice(0, 10),
    vendorId: transfer?.vendorId || null,
    vendorName: String(transfer?.vendorName || "").trim(),
    vendorMobile: String(transfer?.vendorMobile || "").trim(),
    items,
    subtotal: grandTotal,
    totalDiscount: 0,
    totalTax: 0,
    grandTotal,
    paymentMethod: normalizedPaymentMethod,
    amountPaid,
    balanceDue,
    status: balanceDue > 0 ? "confirmed" : "paid",
    note: [
      String(transfer?.note || "").trim(),
      `Branch Transfer: ${transferNo}`,
      `Branch: ${transfer.branchName || "-"}`,
    ].filter(Boolean).join(" · "),
    createdBy: actor?.uid || actor?.id || "",
    createdByName: actor?.personName || actor?.displayName || actor?.username || "",
    createdAt,
    updatedAt: createdAt,
    internalTransfer: true,
    excludeFromSupplierPayable: true,
    branchId: transfer.branchId,
    branchName: transfer.branchName || "",
    branchTransferId: transfer.id,
    branchTransferNo: transferNo,
    branchReceiptId: receipt.id,
    sourceType: "branch_transfer",
    sourceReferenceNo: transferNo,
    autoCreated: true,
  };
}

export function statusLabel(status, lang = "bn") {
  const labels = {
    draft: ["খসড়া", "Draft"],
    packed: ["প্যাক করা হয়েছে", "Packed"],
    dispatched: ["পাঠানো হয়েছে", "Dispatched"],
    in_transit: ["পথে আছে", "In Transit"],
    partially_received: ["আংশিক গ্রহণ", "Partially Received"],
    discrepancy: ["অমিল/সমস্যা", "Discrepancy"],
    received: ["সম্পূর্ণ গ্রহণ", "Received"],
    cancelled: ["বাতিল", "Cancelled"],
  };

  const pair = labels[status] || [status || "-", status || "-"];
  return lang === "bn" ? pair[0] : pair[1];
}
