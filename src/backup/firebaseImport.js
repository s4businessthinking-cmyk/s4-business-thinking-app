// Import of data exported from the old Firebase version
// (scripts/export-old-firebase.cjs) into the current shop. Pure functions:
// `current` is this shop's /v1/backup/export result.

export const FIREBASE_EXPORT_FORMAT = "s4-firebase-export";
const BACKUP_FORMAT = "s4-shop-backup";
const SKIP = new Set(["users", "shops", "inviteCodes", "staffLoginIndex", "productMaintenance"]);
export const DEFAULT_SELECTED = ["purchaseInvoices", "purchasePayments"];

// Shop counters that hand out the next document number; raised past the
// imported numbers so new vouchers don't reuse them.
const SERIAL_FIELDS = [
  ["purchaseInvoices", "invoiceNo", "lastPISerial"],
  ["purchasePayments", "paymentNo", "lastPaymentSerial"],
  ["salesInvoices", "invoiceNo", "lastSISerial"],
  ["salesReceipts", "receiptNo", "lastReceiptSerial"],
];

const norm = (v) => String(v ?? "").toUpperCase().replace(/[\s\-_./\\]+/g, "");
const phone = (v) => String(v ?? "").replace(/\D/g, "").slice(-9);

function indexBy(rows, keyOf) {
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

function productMatcher(products) {
  const byCodeBrand = indexBy(products, (p) => (norm(p.data.code) ? `${norm(p.data.code)}|${norm(p.data.brand)}` : ""));
  const byCode = indexBy(products, (p) => norm(p.data.code));
  const byBarcode = indexBy(products, (p) => norm(p.data.barcode));
  const byName = indexBy(products, (p) => norm(p.data.name));
  return (item) => {
    const code = norm(item.code);
    const brand = norm(item.brand);
    if (code) {
      const exact = byCodeBrand.get(`${code}|${brand}`);
      if (exact) return exact[0];
      const sameCode = byCode.get(code) || [];
      if (sameCode.length === 1) return sameCode[0];
      if (sameCode.length > 1 && brand) {
        const loose = sameCode.find((p) => norm(p.data.brand).includes(brand) || brand.includes(norm(p.data.brand)));
        if (loose) return loose;
      }
      const bc = byBarcode.get(code) || [];
      if (bc.length === 1) return bc[0];
    }
    const named = byName.get(norm(item.name)) || [];
    return named.length === 1 ? named[0] : null;
  };
}

function partyMatcher(rows, nameField, phoneFields) {
  const byName = indexBy(rows, (r) => norm(r.data[nameField]));
  const byPhone = new Map();
  for (const r of rows) for (const f of phoneFields) { const p = phone(r.data[f]); if (p.length >= 7 && !byPhone.has(p)) byPhone.set(p, r); }
  return (names, phones) => {
    for (const n of names) { const hit = byName.get(norm(n)); if (hit) return hit[0]; }
    for (const p of phones) { const hit = byPhone.get(phone(p)); if (hit) return hit; }
    return null;
  };
}

export function planFirebaseImport(raw, current, { shopId, userId }) {
  const cur = current.collections || {};
  const existing = new Set();
  for (const [name, docs] of Object.entries(cur)) for (const d of docs) existing.add(`${name}/${d.id}`);
  const oldUid = raw.oldOwnerUid;
  const oldVendors = new Map((raw.collections?.vendors || []).map((d) => [d.id, d.data]));
  const oldCustomers = new Map((raw.collections?.customers || []).map((d) => [d.id, d.data]));
  const matchProduct = productMatcher(cur.products || []);
  const matchVendor = partyMatcher(cur.vendors || [], "vendorName", ["mobileNumber", "phoneNumber", "whatsappNumber"]);
  const matchCustomer = partyMatcher(cur.customers || [], "customerName", ["mobile", "mobileNumber", "phone"]);
  const stats = { items: 0, itemsMatched: 0, unmatchedItems: [], vendorDocs: 0, vendorMatched: 0, unmatchedVendors: new Set() };
  const matchedWithOpening = new Set();

  const remapItems = (items) => (Array.isArray(items) ? items.map((it) => {
    stats.items += 1;
    const p = matchProduct(it || {});
    if (!p) {
      if (stats.unmatchedItems.length < 30) stats.unmatchedItems.push(`${it?.code || "—"} ${it?.brand || ""} ${it?.name || ""}`.trim());
      return { ...it, productId: "" };
    }
    stats.itemsMatched += 1;
    if (Number(p.data.openingStock) > 0) matchedWithOpening.add(p.id);
    return { ...it, productId: p.id };
  }) : items);

  const remapVendor = (data) => {
    stats.vendorDocs += 1;
    const old = oldVendors.get(data.vendorId) || {};
    const v = matchVendor([data.vendorName, old.vendorName], [data.vendorMobile, old.mobileNumber, old.phoneNumber]);
    if (v) { stats.vendorMatched += 1; return { ...data, vendorId: v.id, vendorName: data.vendorName || v.data.vendorName }; }
    stats.unmatchedVendors.add(data.vendorName || old.vendorName || "—");
    return { ...data, vendorId: "" };
  };

  const remapCustomer = (data) => {
    const old = oldCustomers.get(data.customerId) || {};
    const c = matchCustomer([data.customerName, old.customerName], [data.customerMobile, old.mobile]);
    return c ? { ...data, customerId: c.id } : { ...data, customerId: "" };
  };

  const byCollection = {};
  let alreadyThere = 0;
  for (const [name, docs] of Object.entries(raw.collections || {})) {
    if (SKIP.has(name) || !Array.isArray(docs)) continue;
    const fresh = [];
    for (const d of docs) {
      if (!d?.id || !d.data || typeof d.data !== "object") continue;
      if (existing.has(`${name}/${d.id}`)) { alreadyThere += 1; continue; }
      let data = { ...d.data, shopId };
      if (oldUid && userId) for (const [k, v] of Object.entries(data)) if (v === oldUid) data[k] = userId;
      for (const k of ["_cloud_sync_status", "_cloud_synced_at", "_cloud_cached_at"]) delete data[k];
      if (name === "purchaseInvoices") data = { ...remapVendor(data), items: remapItems(data.items) };
      else if (name === "purchasePayments") data = remapVendor(data);
      else if (name === "salesInvoices") data = { ...remapCustomer(data), items: remapItems(data.items) };
      else if (name === "salesReceipts") data = remapCustomer(data);
      fresh.push({ id: d.id, data });
    }
    if (fresh.length) byCollection[name] = fresh;
  }
  return {
    shopId, createdAt: raw.createdAt, byCollection, alreadyThere, shopRow: (cur.shops || [])[0] || null,
    stats: { ...stats, unmatchedVendors: [...stats.unmatchedVendors], productsWithOpeningStock: matchedWithOpening.size },
    currentCounts: Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, v.length])),
  };
}

// Item/vendor match numbers only for the collections that will be imported.
export function matchSummary(plan, selected) {
  const sel = new Set(selected);
  let items = 0, itemsMatched = 0, vendorDocs = 0, vendorMatched = 0;
  for (const name of ["purchaseInvoices", "salesInvoices"]) {
    if (!sel.has(name)) continue;
    for (const d of plan.byCollection[name] || []) for (const it of d.data.items || []) { items += 1; if (it.productId) itemsMatched += 1; }
  }
  for (const name of ["purchaseInvoices", "purchasePayments"]) {
    if (!sel.has(name)) continue;
    for (const d of plan.byCollection[name] || []) { vendorDocs += 1; if (d.data.vendorId) vendorMatched += 1; }
  }
  return { items, itemsMatched, vendorDocs, vendorMatched };
}

export function buildFirebaseImport(plan, selected) {
  const sel = new Set(selected);
  const collections = {};
  let total = 0;
  for (const [name, docs] of Object.entries(plan.byCollection)) {
    if (!sel.has(name)) continue;
    collections[name] = docs;
    total += docs.length;
  }
  if (total && plan.shopRow?.data) {
    const nextShop = { ...plan.shopRow.data };
    let bumped = false;
    for (const [col, field, serialKey] of SERIAL_FIELDS) {
      if (!sel.has(col)) continue;
      const max = (collections[col] || []).reduce((mx, d) => {
        const m = String(d.data[field] || "").match(/(\d+)$/);
        return m ? Math.max(mx, Number(m[1])) : mx;
      }, 0);
      if (max > Number(nextShop[serialKey] || 0)) { nextShop[serialKey] = max; bumped = true; }
    }
    if (bumped) collections.shops = [{ id: plan.shopRow.id, data: nextShop }];
  }
  const backup = { format: BACKUP_FORMAT, version: 1, shopId: plan.shopId, createdAt: plan.createdAt, collections };
  return { total, text: JSON.stringify(backup) };
}
