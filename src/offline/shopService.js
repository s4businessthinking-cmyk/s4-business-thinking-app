import { offlineGetById, offlineUpsert } from "./offlineRepository";

export const S4_SHOP_CACHE_KEY = "s4-auth-shop-cache-v1";

function shopCacheKey(shopId) {
  return `${S4_SHOP_CACHE_KEY}:${shopId}`;
}

export function loadCachedShop(shopId) {
  if (!shopId || typeof localStorage === "undefined") return null;

  try {
    const raw = localStorage.getItem(shopCacheKey(shopId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCachedShop(shopId, shop) {
  if (!shopId || !shop || typeof localStorage === "undefined") return;

  try {
    localStorage.setItem(
      shopCacheKey(shopId),
      JSON.stringify({ ...shop, id: shop.id || shopId, cachedAt: new Date().toISOString() })
    );
  } catch {}
}

export function shopNeedsSetup(shop) {
  if (!shop) return true;
  return !String(shop.companyName || "").trim();
}

export async function loadShopRecord(shopId) {
  if (!shopId) return null;

  const cached = loadCachedShop(shopId);
  let offlineData = null;

  try {
    const offline = await offlineGetById("shops", shopId);
    offlineData = offline?.data || null;
  } catch (error) {
    console.warn("[S4 Shop] offline load failed", error);
  }

  if (!cached && !offlineData) return null;

  const merged = {
    ...(cached || {}),
    ...(offlineData || {}),
    id: shopId,
    shopId,
  };

  saveCachedShop(shopId, merged);
  return merged;
}

async function syncOwnerUserRecord(user, profile, shop) {
  if (!user?.uid || profile?.role !== "owner") return;

  const userDoc = {
    uid: user.uid,
    id: user.uid,
    role: "owner",
    shopId: shop.id || shop.shopId,
    personName: profile.personName || shop.ownerName || "",
    email: profile.email || shop.email || "",
    mobile: shop.mobile || profile.mobile || "",
    country: shop.country || profile.country || "BD",
    countryName: shop.countryName || profile.countryName || "",
    area: shop.area || profile.area || "",
    companyName: shop.companyName || "",
    position: profile.position || "মালিক",
    permissions: null,
    updatedAt: new Date().toISOString(),
  };

  await offlineUpsert("users", user.uid, userDoc);
}

export async function saveShopRecord(shopId, patch = {}, meta = {}) {
  if (!shopId) throw new Error("shopId is required.");

  const existing = (await loadShopRecord(shopId)) || { id: shopId, shopId, positions: [] };
  const now = new Date().toISOString();

  const updated = {
    ...existing,
    ...patch,
    id: shopId,
    shopId,
    updatedAt: now,
    ...(existing.createdAt ? {} : { createdAt: now }),
  };

  if (meta.ownerUid && !updated.ownerUid) {
    updated.ownerUid = meta.ownerUid;
  }

  saveCachedShop(shopId, updated);
  await offlineUpsert("shops", shopId, updated);

  if (meta.user && meta.profile) {
    await syncOwnerUserRecord(meta.user, meta.profile, updated);
  }

  if (typeof window !== "undefined" && window.S4Offline?.syncNow && navigator.onLine) {
    window.S4Offline.syncNow().catch((error) => {
      console.warn("[S4 Shop] background sync failed", error);
    });
  }

  return updated;
}
