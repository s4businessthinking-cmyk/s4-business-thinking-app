import { doc, getDoc } from "../backend/firestore";
import { db } from "../firebase-config";

let cache = { shopId: "", at: 0, state: null };

export async function getProductCatalogMaintenance(shopId) {
  if (!shopId || !db) {
    return { active: false, catalogEpoch: 0, blocked: false };
  }

  const now = Date.now();
  if (cache.shopId === shopId && cache.state && now - cache.at < 30_000) {
    return cache.state;
  }

  try {
    const snap = await getDoc(doc(db, "productMaintenance", shopId));
    if (!snap.exists()) {
      const state = { active: false, catalogEpoch: 0, blocked: false };
      cache = { shopId, at: now, state };
      return state;
    }
    const row = snap.data() || {};
    const state = {
      active: row.active === true,
      catalogEpoch: Number(row.catalogEpoch) || 0,
      blocked: row.active === true,
    };
    cache = { shopId, at: now, state };
    return state;
  } catch {
    return { active: false, catalogEpoch: 0, blocked: false };
  }
}

export function stampProductCatalogEpoch(data, maintenance) {
  if (!data || maintenance?.blocked) return data;
  return {
    ...data,
    productCatalogEpoch: maintenance?.catalogEpoch ?? 0,
  };
}
