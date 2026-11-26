/** BW09 — WhatsApp text for a warranty claim slip (pure; HTML/PDF built by the tab). */
import { claimInvoiceLabel, warrantyReasonLabel, warrantyStatusLabel } from "./warrantyClaim.js";

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fq = (v) => String(parseFloat(n2(v).toFixed(4)));

export function warrantyClaimShareExtra(claim, bn = false) {
  if (!claim) return "";
  const bat = [
    claim.batteryBrand || "",
    claim.batteryAh != null ? `${claim.batteryAh} Ah` : "",
  ].filter(Boolean).join(" ");
  const bits = [
    claim.productName ? `${claim.productName}${claim.productCode ? ` (${claim.productCode})` : ""} × ${fq(claim.qty || 1)}` : "",
    bat,
    claim.serialNo ? (bn ? `সিরিয়াল out: ${claim.serialNo}` : `Serial out: ${claim.serialNo}`) : "",
    (claim.replacedSerialNo || claim.serialNo)
      ? (bn ? `সিরিয়াল in: ${claim.replacedSerialNo || claim.serialNo}` : `Serial in: ${claim.replacedSerialNo || claim.serialNo}`)
      : "",
    warrantyStatusLabel(claim.status, bn),
    claimInvoiceLabel(claim, bn),
    warrantyReasonLabel(claim.reason, bn),
  ].filter(Boolean);
  return bits.join(" · ");
}

/** Prefer customer mobile; fall back to empty (button will ask). */
export function warrantyClaimSharePhone(claim) {
  return String(claim?.customerMobile || claim?.customerWhatsapp || "").trim();
}
