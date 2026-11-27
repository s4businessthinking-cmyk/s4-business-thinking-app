import { offlineList, offlineUpsert } from "../offline/offlineRepository.js";
import { isActiveProduct } from "../app/mainAppHelpers.js";
import { listOwnerCompanyFiles } from "./branchCompanyFile.js";
import { mergeSharedParties } from "./companyPartyScope.js";

const mapRow = (r) => r?.data || r;

async function listCollection(collection) {
  const rows = await offlineList(collection).catch(() => []);
  const list = (Array.isArray(rows) ? rows : rows?.records || []).map(mapRow).filter(Boolean);
  return list;
}

/** Push HQ product master fields to every child company file (same product id). */
export async function syncProductsFromParentToBranches(parentShopId, { priceOnly = false } = {}) {
  if (!parentShopId) return { updated: 0, children: 0 };
  const files = await listOwnerCompanyFiles(parentShopId);
  const children = files.filter((f) => f.kind === "branch").map((f) => f.shopId);
  if (!children.length) return { updated: 0, children: 0 };

  const products = await listCollection("products");
  const parentRows = products.filter((p) => p.shopId === parentShopId && isActiveProduct(p));
  let updated = 0;
  const now = new Date().toISOString();
  const fields = priceOnly
    ? ["salePrice", "landingCost", "mrp", "wsPrice", "rate", "taxPerc", "updatedAt"]
    : null;

  for (const childShopId of children) {
    const existing = new Set(products.filter((p) => p.shopId === childShopId).map((p) => p.id));
    for (const p of parentRows) {
      if (!p.id) continue;
      const onChild = products.find((x) => x.id === p.id && x.shopId === childShopId);
      if (!existing.has(p.id)) {
        await offlineUpsert("products", p.id, {
          ...p,
          shopId: childShopId,
          syncedFromParentShopId: parentShopId,
          syncedAt: now,
          updatedAt: now,
        });
        updated += 1;
        continue;
      }
      if (!onChild) continue;
      const patch = fields
        ? fields.reduce((o, k) => ({ ...o, [k]: p[k] }), { updatedAt: now, syncedAt: now, syncedFromParentShopId: parentShopId })
        : { ...p, shopId: childShopId, syncedFromParentShopId: parentShopId, syncedAt: now, updatedAt: now };
      await offlineUpsert("products", p.id, { ...onChild, ...patch });
      updated += 1;
    }
  }
  return { updated, children: children.length };
}

/** Copy new/changed HQ customers and vendors to child files (by id). */
export async function syncPartiesFromParentToBranches(parentShopId) {
  if (!parentShopId) return { customers: 0, vendors: 0 };
  const files = await listOwnerCompanyFiles(parentShopId);
  const children = files.filter((f) => f.kind === "branch").map((f) => f.shopId);
  if (!children.length) return { customers: 0, vendors: 0 };

  const customers = await listCollection("customers");
  const vendors = await listCollection("vendors");
  const parentCust = customers.filter((c) => c.shopId === parentShopId && !c.isDeleted);
  const parentVend = vendors.filter((v) => v.shopId === parentShopId && !v.isDeleted);
  let cu = 0;
  let ve = 0;
  const now = new Date().toISOString();

  for (const childShopId of children) {
    for (const collection of [
      { name: "customers", parentRows: parentCust, key: "customerName" },
      { name: "vendors", parentRows: parentVend, key: "vendorName" },
    ]) {
      const childRows = (collection.name === "customers" ? customers : vendors).filter((r) => r.shopId === childShopId);
      const merged = mergeSharedParties(childRows, collection.parentRows, collection.key);
      for (const row of merged.filter((r) => r.sharedFromHq)) {
        const local = childRows.find((c) => c.id === row.id);
        const doc = {
          ...row,
          shopId: childShopId,
          sharedFromHq: undefined,
          syncedFromParentShopId: parentShopId,
          syncedAt: now,
          updatedAt: now,
        };
        if (!local) {
          await offlineUpsert(collection.name, row.id, doc);
          if (collection.name === "customers") cu += 1;
          else ve += 1;
        } else if (local.updatedAt !== row.updatedAt) {
          await offlineUpsert(collection.name, row.id, { ...local, ...doc });
          if (collection.name === "customers") cu += 1;
          else ve += 1;
        }
      }
    }
  }
  return { customers: cu, vendors: ve };
}

export async function runFullParentCatalogSync(parentShopId) {
  const products = await syncProductsFromParentToBranches(parentShopId);
  const parties = await syncPartiesFromParentToBranches(parentShopId);
  return { products, parties };
}