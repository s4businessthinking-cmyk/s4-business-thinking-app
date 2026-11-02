export function invMeta(inv, isCustomer) {
  const raw = inv?.raw || inv;
  if (!raw) return { dn: "", vehicle: "", trn: "", note: "", refNo: "" };
  const isDeliveryDoc = raw.docKind === "delivery" || raw.invoiceType === "delivery";
  return {
    dn: isCustomer
      ? String(raw.deliveryNoteNo || (isDeliveryDoc ? (raw.invoiceNo || inv.no) : "") || inv.ref || "").trim()
      : String(raw.supplierInvoiceNo || inv.ref || "").trim(),
    vehicle: String(raw.vehicleNo || "").trim(),
    trn: String(raw.customerTrn || raw.vendorTrn || "").trim(),
    note: String(raw.note || "").trim(),
    refNo: String(raw.refNo || "").trim(),
  };
}

export function statementRefValue(meta, { includeDn = false } = {}) {
  const refNo = String(meta?.refNo || "").trim();
  const dn = String(meta?.dn || "").trim();
  if (!includeDn) return refNo;
  if (refNo && dn && refNo !== dn) return `${refNo} · ${dn}`;
  return refNo || dn;
}
