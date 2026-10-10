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

export function productSearchSub(p, { bn, cur = "AED", canSeeCost = false } = {}) {
  const line1 = [p.code, p.brand].filter(Boolean).join(" · ") || p.code || "";
  const loc = productStockLocationLabel(p);
  const cost = canSeeCost ? (p.landingCost || p.lastPurchaseCost || "") : "";
  const vendor = String(p.lastPurchaseVendorName || "").trim();
  const mrp = p.mrp || p.vatInclusive || p.vatExclusive || "";

  const bits = [];
  if (loc) bits.push(bn ? `লোকেশন: ${loc}` : `Loc: ${loc}`);
  if (cost !== "" && cost != null) bits.push(bn ? `ল্যান্ডিং: ${cur} ${fmtMoney(cost)}` : `L/C: ${cur} ${fmtMoney(cost)}`);
  if (vendor) bits.push(bn ? `ভেন্ডর: ${vendor}` : `Vendor: ${vendor}`);
  if (mrp !== "" && mrp != null) bits.push(`MRP: ${cur} ${fmtMoney(mrp)}`);

  if (!bits.length) return line1;
  const line2 = bits.join(" · ");
  return line1 ? `${line1}\n${line2}` : line2;
}
