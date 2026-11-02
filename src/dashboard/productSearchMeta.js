import { splitRack } from "../sales-invoice/rackLocation.js";

const fmtMoney = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n.toFixed(2) : String(v || "");
};

export function productStockLocationLabel(p) {
  const raw = String(p?.rackLocation || "").trim();
  if (!raw) return "";
  const { rack, floor, bin } = splitRack(raw);
  const parts = [rack, floor, bin].filter(Boolean);
  return parts.length ? parts.join(" / ") : raw;
}

function billDay(value) {
  if (value && typeof value.toISOString === "function") return value.toISOString().slice(0, 10);
  const s = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

function createdStamp(inv) {
  const raw = inv?.createdAt;
  if (raw && typeof raw.toISOString === "function") return raw.toISOString();
  return String(raw || "");
}

export function lastPurchaseFromInvoices(invoices) {
  const map = Object.create(null);
  for (const inv of invoices || []) {
    if (!inv?.id) continue;
    if (inv.status === "cancelled" || inv.status === "draft" || inv.isDeleted) continue;
    if (inv.source === "openingBalance" || inv.internalTransfer === true || inv.sourceType === "branch_transfer") continue;
    const date = billDay(inv.invoiceDate);
    if (!date) continue;
    const vendor = String(inv.vendorName || "").trim();
    const sortKey = `${date}\t${createdStamp(inv)}`;
    const put = (key) => {
      if (!key) return;
      const prev = map[key];
      if (!prev || sortKey >= prev.sortKey) map[key] = { date, vendor, sortKey, invoiceId: inv.id };
    };
    for (const it of inv.items || []) {
      put(it.productId);
      const code = String(it.code || "").trim().toLowerCase();
      if (code) put(`code:${code}`);
    }
  }
  return map;
}

export function productSearchSub(p, { bn, cur = "AED", canSeeCost = false } = {}) {
  const line1 = [p.code, p.brand].filter(Boolean).join(" · ") || p.code || "";
  const loc = productStockLocationLabel(p);
  const cost = canSeeCost ? (p.landingCost || p.lastPurchaseCost || "") : "";
  const lastDay = String(p.lastPurchaseDate || "").slice(0, 10);
  const vendor = String(p.lastPurchaseVendorName || "").trim();
  const mrp = p.mrp || p.vatInclusive || p.vatExclusive || "";

  const bits = [];
  if (loc) bits.push(bn ? `লোকেশন: ${loc}` : `Loc: ${loc}`);
  if (cost !== "" && cost != null) bits.push(bn ? `ল্যান্ডিং: ${cur} ${fmtMoney(cost)}` : `L/C: ${cur} ${fmtMoney(cost)}`);
  if (lastDay) bits.push(bn ? `শেষ ক্রয়: ${lastDay}` : `Last purchase: ${lastDay}`);
  if (vendor) bits.push(bn ? `ভেন্ডর: ${vendor}` : `Vendor: ${vendor}`);
  if (mrp !== "" && mrp != null) bits.push(`MRP: ${cur} ${fmtMoney(mrp)}`);

  if (!bits.length) return line1;
  const line2 = bits.join(" · ");
  return line1 ? `${line1}\n${line2}` : line2;
}
