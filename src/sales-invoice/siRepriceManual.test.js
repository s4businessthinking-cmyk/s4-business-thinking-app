import assert from "node:assert/strict";
import test from "node:test";

const siN2 = (v) => parseFloat(v) || 0;
const norm = (v) => String(v || "").trim().toLowerCase();

function resolveRate(prod, unit, customerType) {
  const base = prod?.vatExclusive || "";
  const wantUnit = norm(unit || "Pcs");
  const wantType = norm(customerType);
  const rows = (prod.unitPrices || []).filter((r) => norm(r.unit) === wantUnit);
  const match =
    (wantType && rows.find((r) => norm(r.customerType) === wantType)) ||
    rows.find((r) => !String(r.customerType || "").trim());
  if (!match) return { unitPrice: base };
  return { unitPrice: match.vatExclusive || base };
}

function nextPriceForCustomerType(prod, item, prevType, newType) {
  const prevRate = resolveRate(prod, item.unit, prevType);
  const newRate = resolveRate(prod, item.unit, newType);
  const wasAuto = Math.abs(siN2(item.unitPrice) - siN2(prevRate.unitPrice)) < 0.005;
  if (!wasAuto) return String(item.unitPrice ?? "");
  return String(newRate.unitPrice || item.unitPrice || "");
}

const prod = {
  vatExclusive: "10",
  unitPrices: [
    { unit: "Pcs", customerType: "", vatExclusive: "10" },
    { unit: "Pcs", customerType: "Retail", vatExclusive: "12" },
    { unit: "Pcs", customerType: "Wholesale", vatExclusive: "9" },
  ],
};

test("manual price kept when customer type changes", () => {
  assert.equal(nextPriceForCustomerType(prod, { unit: "Pcs", unitPrice: "15" }, "", "Retail"), "15");
  assert.equal(nextPriceForCustomerType(prod, { unit: "Pcs", unitPrice: "15" }, "Retail", "Wholesale"), "15");
});

test("auto list price follows new customer type", () => {
  assert.equal(nextPriceForCustomerType(prod, { unit: "Pcs", unitPrice: "10" }, "", "Retail"), "12");
  assert.equal(nextPriceForCustomerType(prod, { unit: "Pcs", unitPrice: "12" }, "Retail", "Wholesale"), "9");
});

test("stamp merge prefers newer local over stale cloud", () => {
  const stampOf = (inv) => {
    const t = Date.parse(inv?._offline_updated_at || inv?.updatedAt || inv?.createdAt || "");
    return Number.isFinite(t) ? t : 0;
  };
  const cloud = { updatedAt: "2026-01-01T10:00:00.000Z", items: [{ unitPrice: 10 }] };
  const local = { _offline_updated_at: "2026-01-01T10:00:05.000Z", items: [{ unitPrice: 15 }] };
  assert.ok(stampOf(local) >= stampOf(cloud));
  const pick = stampOf(local) >= stampOf(cloud) ? local : cloud;
  assert.equal(pick.items[0].unitPrice, 15);
});
