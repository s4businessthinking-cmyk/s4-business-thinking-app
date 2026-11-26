/**
 * BW10 — which fields on an open warranty claim may be edited before delivered/cancelled.
 * Stock-affecting replaced qty/product stays locked once status is replaced (stock already counted).
 */

export function canEditOpenClaim(claim) {
  if (!claim || claim.isDeleted || claim.deleted) return false;
  return claim.status === "received" || claim.status === "sent";
}

/** Fields always editable while canEditOpenClaim. */
export const EDITABLE_CLAIM_KEYS = [
  "note", "reason", "serialNo", "reminderDays",
  "customerId", "customerName", "customerMobile",
  "vendorId", "vendorName",
  "invoiceId", "invoiceNo", "invoiceDate",
  "warrantyMonths", "warrantyStartDate", "warrantyEndDate", "warrantyExpiredAtOpen",
  "batteryAh", "batteryBrand",
];

/** Extra keys editable only while still received (before send — product/qty drive later stock). */
export const EDITABLE_RECEIVED_KEYS = [
  "productId", "productName", "productCode", "unit", "qty",
];

export function editableKeysFor(claim) {
  if (!canEditOpenClaim(claim)) return [];
  if (claim.status === "received") return [...EDITABLE_CLAIM_KEYS, ...EDITABLE_RECEIVED_KEYS];
  return [...EDITABLE_CLAIM_KEYS];
}

/** Build patch from form values; only allowed keys; empty string clears text fields. */
export function buildClaimEditPatch(claim, form = {}) {
  const allowed = new Set(editableKeysFor(claim));
  const patch = {};
  allowed.forEach((k) => {
    if (!(k in form)) return;
    let v = form[k];
    if (k === "qty") {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return;
      v = parseFloat(n.toFixed(4));
    }
    if (k === "reminderDays") {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < 1) return;
      v = Math.min(365, n);
    }
    if (k === "warrantyMonths") {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < 0) return;
      v = Math.min(120, n);
    }
    if (k === "batteryAh") {
      if (v == null || v === "") { v = null; }
      else {
        const n = Math.round(Number(v));
        if (!Number.isFinite(n) || n <= 0) return;
        v = Math.min(2000, n);
      }
    }
    if (k === "customerId" || k === "vendorId" || k === "productId" || k === "invoiceId") {
      v = v || null;
    } else if (typeof v === "string") {
      v = v.trim();
    }
    if (claim[k] === v) return;
    if ((claim[k] == null || claim[k] === "") && (v == null || v === "")) return;
    patch[k] = v;
  });
  return patch;
}
