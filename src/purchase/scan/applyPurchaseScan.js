import { PI_UNITS } from "../purchaseShared.js";

const billUnit = (u) => PI_UNITS.find((x) => x.toLowerCase() === String(u || "").toLowerCase().replace(/^pc$/, "pcs").replace(/^sets$/, "set")) || "Pcs";

export function scanLinesToPi(res) {
  return (res.lines || []).map((l) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productId: l.product?.id || null,
    name: l.product?.name || l.name,
    code: l.product?.code || l.code || "",
    brand: l.product?.brand || l.product?.company || "",
    qty: String(l.qty),
    unit: l.product?.unit || billUnit(l.unit),
    unitCost: String(l.rate),
    discountPerc: "0",
    discountFlat: l.discount ? String(l.discount) : "",
    taxPerc: String(l.vatPerc),
    salePrice: "",
  }));
}

export function applyPurchaseScan(res, { pickVendor, setField, setLines, toast, lang }) {
  if (res.vendor) pickVendor?.(res.vendor);
  else if (res.supplierName) setField("vendorName", res.supplierName);
  if (res.supplierInvoiceNo) setField("supplierInvoiceNo", res.supplierInvoiceNo);
  if (res.invoiceDate) setField("invoiceDate", res.invoiceDate);
  // a scanned bill: lines with no matching product must be entered in Product Master before it can be saved
  setField("scanFilled", true);
  setLines((prev) => [...prev.filter((x) => String(x.name || "").trim()), ...scanLinesToPi(res)]);
  toast?.(lang === "bn"
    ? `✅ ${res.lines.length}টি লাইন বসানো হয়েছে — মিলিয়ে নিয়ে Save করুন`
    : `✅ ${res.lines.length} line(s) filled — check them, then Save`);
}
