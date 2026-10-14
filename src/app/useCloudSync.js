import { db } from "../firebase-config";
import { doc, onSnapshot } from "../backend/firestore";
import { getCloudSyncBlockReason, getShopCloudPulledAt, getSyncDashboardStatus, pullShopFromCloud, reconcileShopWithCloud, sortPulledRecords, uploadPendingShopChanges } from "../offline/cloudPullService";
import { mergeProductCatalog } from "./mainAppHelpers.js";
import { offlineCacheCloudRecords, offlineGetById } from "../offline/offlineRepository";
import { saveCachedShop } from "../offline/shopService";
import { updateLocalUserProfile } from "../auth/localAuthService";
import { useEffect } from "react";

export function useCloudSync({ authSyncReady, cloudPullRunRef, isOrderManager, isOwner, lang, localShop, onLogout, onProfileUpdate, profile, profileSyncRef, setCloudPullBusy, setCloudUploadBusy, setCos, setCustomers, setInviteCodes, setLastCloudPullAt, setLicenseAccess, setLicenseAccessLoading, setLocalShop, setOrders, setProducts, setSyncDashboard, setSyncRefreshKey, setSyncState, setTeam, setVendors, shopId, syncDashboard, t, toast, user }) {
  const mergeShopRecord = (previous, next) => {
    if (!next) return previous;
    const merged = { ...(previous || {}), ...next };
    const previousHasOrderSetting = Object.prototype.hasOwnProperty.call(previous || {}, "orderModuleEnabled");
    const nextHasOrderSetting = Object.prototype.hasOwnProperty.call(next, "orderModuleEnabled");
    const previousUpdatedAt = Date.parse(previous?.updatedAt || "") || 0;
    const nextUpdatedAt = Date.parse(next?.updatedAt || "") || 0;
    if (previous?.orderModuleEnabled === true && !nextHasOrderSetting) {
      merged.orderModuleEnabled = true;
    }
    if (previousHasOrderSetting && nextHasOrderSetting && previousUpdatedAt > nextUpdatedAt) {
      merged.orderModuleEnabled = previous.orderModuleEnabled;
    }
    return merged;
  };

  const applyShopRecord = (next, { cache = false } = {}) => {
    if (!next) return;
    const mergedForCache = mergeShopRecord(localShop, next);
    setLocalShop(prev => mergeShopRecord(prev, next));
    if (cache && shopId && mergedForCache) {
      saveCachedShop(shopId, mergedForCache);
      offlineCacheCloudRecords("shops", [mergedForCache]).catch((err) =>
        console.warn("[S4 Offline] shop cache failed", err)
      );
    }
  };

  const orderRecordStamp = (order) => {
    const raw = order?.updatedAt || order?.createdAt || order?.createdAtIso || 0;
    const value = raw?.toDate?.() || raw;
    return new Date(value).getTime() || 0;
  };

  const sortOrderRecords = (list) =>
    [...list].sort((a,b) => orderRecordStamp(b) - orderRecordStamp(a));

  const isVisibleOrderRecord = (order) => {
    if (!order || order.shopId !== shopId) return false;
    return isOwner || isOrderManager || order.createdBy === user?.uid;
  };

  const mergeVisibleOrders = (incoming) => {
    const visibleIncoming = (incoming || []).filter(isVisibleOrderRecord);
    setOrders((prev) => {
      const merged = new Map();
      prev.filter(isVisibleOrderRecord).forEach((order) => merged.set(order.id, order));
      visibleIncoming.forEach((order) => {
        const current = merged.get(order.id);
        if (!current || orderRecordStamp(order) >= orderRecordStamp(current)) merged.set(order.id, order);
      });
      return sortOrderRecords([...merged.values()]);
    });
  };

  useEffect(() => {
    if (!user?.uid || isOwner || !db) return;

    let cancelled = false;

    const applyMemberRecord = async (data) => {
      if (!data || cancelled) return;

      const status = String(data.status || "active").toLowerCase();
      if (status === "disabled" || status === "closed" || data.isDeleted === true) {
        toast(
          lang === "bn"
            ? "অ্যাকাউন্ট বন্ধ করা হয়েছে। মালিকের সাথে যোগাযোগ করুন।"
            : "This account has been disabled. Contact the owner.",
          "err"
        );
        onLogout?.();
        return;
      }

      const currentProfile = profileSyncRef.current || {};
      const nextPermissions = data.permissions ?? currentProfile.permissions;
      const nextPosition = data.position || currentProfile.position;
      const permissionsChanged =
        JSON.stringify(nextPermissions || null) !== JSON.stringify(currentProfile.permissions || null);
      const positionChanged = nextPosition !== currentProfile.position;

      if (!permissionsChanged && !positionChanged) return;

      if (currentProfile.localUserId && permissionsChanged) {
        try {
          await updateLocalUserProfile(currentProfile.localUserId, {
            permissions: nextPermissions,
          });
        } catch (error) {
          console.warn("[S4 Team] local permission sync failed", error);
        }
      }

      onProfileUpdate?.({
        permissions: nextPermissions,
        position: nextPosition,
      });
    };

    offlineGetById("users", user.uid)
      .then((row) => applyMemberRecord(row?.data))
      .catch((error) => console.warn("[S4 Team] offline profile sync failed", error));

    let unsub = () => {};
    if (authSyncReady) {
      unsub = onSnapshot(
        doc(db, "users", user.uid),
        (snap) => {
          if (snap.exists()) applyMemberRecord(snap.data());
        },
        (error) => console.warn("[S4 Team] cloud profile sync failed", error)
      );
    }

    return () => {
      cancelled = true;
      unsub();
    };
  }, [user?.uid, isOwner, profile.localUserId, lang, authSyncReady]);

  const refreshSyncDashboard = async () => {
    try {
      setSyncDashboard(await getSyncDashboardStatus());
    } catch (error) {
      console.warn("[S4 Sync] dashboard refresh failed", error);
    }
  };

  const applyCloudPullResult = (pullResult) => {
    if (!pullResult?.data) return;
    const sorted = sortPulledRecords(pullResult.data);

    if (sorted.products.length) setProducts((previous) => mergeProductCatalog(sorted.products, previous));
    if (sorted.companies.length) setCos(sorted.companies);
    if (sorted.customers.length) setCustomers(sorted.customers);
    if (sorted.vendors.length) setVendors(sorted.vendors);
    if (sorted.orders.length) mergeVisibleOrders(sorted.orders);
    if (sorted.team.length) setTeam(sorted.team);
    if (sorted.shop) applyShopRecord(sorted.shop, { cache: true });
    if (sorted.inviteCodes.length) {
      setInviteCodes(sorted.inviteCodes.map((c) => ({ ...c, code: c.code || c.id })));
    }

    setSyncState(typeof navigator !== "undefined" && navigator.onLine ? "connected" : "offline");
  };

  const runCloudDownload = ({ silent = false } = {}) => {
    if (cloudPullRunRef.current) return cloudPullRunRef.current;
    const run = runCloudDownloadOnce({ silent });
    cloudPullRunRef.current = run;
    run.finally(() => { if (cloudPullRunRef.current === run) cloudPullRunRef.current = null; });
    return run;
  };

  const runCloudDownloadOnce = async ({ silent = false } = {}) => {
    if (!shopId) return null;
    const blockReason = getCloudSyncBlockReason();
    if (blockReason === "FIREBASE_AUTH_REQUIRED") {
      if (!silent) toast(t.syncNeedEmailLogin, "err");
      return null;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (!silent) toast(t.syncNeedInternet, "err");
      return null;
    }

    setCloudPullBusy(true);
    try {
      const result = await pullShopFromCloud(shopId, {
        filterOrdersForUserId: user?.uid,
        includeAllOrders: isOwner || isOrderManager,
      });

      if (result?.reason === "OFFLINE") {
        if (!silent) toast(t.syncNeedInternet, "err");
        return null;
      }

      applyCloudPullResult(result);
      setLastCloudPullAt(result.pulledAt || getShopCloudPulledAt(shopId));
      setSyncRefreshKey((value) => value + 1);

      if (!silent) {
        const productCount = result?.data?.products?.length || 0;
        const msg = `${t.syncDownloadOk} (${result.totalDocs || 0}, products: ${productCount})`;
        const failedNames = (result.results || []).filter((r) => !r.ok).map((r) => r.collection);
        const failedNote = failedNames.length
          ? (lang==="bn" ? ` ⚠️ আসেনি: ${failedNames.join(", ")}` : ` ⚠️ Not downloaded: ${failedNames.join(", ")}`)
          : "";
        toast(`${msg}${failedNote}`, failedNames.length ? "err" : "ok");
        if (failedNames.length) console.warn("[S4 Sync] cloud download failed for", (result.results || []).filter((r) => !r.ok));
      }

      await refreshSyncDashboard();
      return result;
    } catch (error) {
      if (!silent) {
        if (error?.code === "FIREBASE_AUTH_REQUIRED") {
          toast(t.syncNeedEmailLogin, "err");
        } else {
          toast(error?.message || String(error), "err");
        }
      }
      return null;
    } finally {
      setCloudPullBusy(false);
    }
  };

  const runCloudUpload = async () => {
    if (!shopId) return;
    const blockReason = getCloudSyncBlockReason();
    if (blockReason === "OFFLINE" || (typeof navigator !== "undefined" && !navigator.onLine)) {
      toast(t.syncNeedInternet, "err");
      return;
    }
    if (blockReason === "FIREBASE_AUTH_REQUIRED") {
      toast(t.syncNeedEmailLogin, "err");
      return;
    }

    setCloudUploadBusy(true);
    try {
      // Repair pass first: find any local record (in any collection) that
      // Firestore doesn't actually have — regardless of what its local dirty
      // flag says — and re-queue it with the correct shopId. This is what
      // catches records that got silently stuck (e.g. missing a shopId tag,
      // or abandoned after repeated sync failures) before the normal
      // "upload everything pending" pass below runs.
      const reconcileResult = await reconcileShopWithCloud(shopId);
      if (reconcileResult?.skipped) {
        if (reconcileResult?.reason === "FIREBASE_AUTH_REQUIRED") {
          toast(t.syncNeedEmailLogin, "err");
        } else {
          toast(t.syncNeedInternet, "err");
        }
        return;
      }
      const repairedCount = reconcileResult?.totalRequeued || 0;

      const result = await uploadPendingShopChanges(shopId);
      if (result?.reason === "OFFLINE" || result?.skipped) {
        if (result?.reason === "FIREBASE_AUTH_REQUIRED") {
          toast(t.syncNeedEmailLogin, "err");
        } else {
          toast(t.syncNeedInternet, "err");
        }
        return;
      }

      const productCount = result.productsUploaded || 0;
      const uploaded = result.totalUploaded || result.done || 0;
      if (uploaded === 0 && repairedCount === 0 && (syncDashboard?.localRecords || 0) > 0) {
        toast(
          lang === "bn"
            ? "⚠️ Cloud-এ upload হয়নি। Logout → email/password দিয়ে login → v1.0.12+ install করুন"
            : "⚠️ Nothing uploaded. Logout, sign in with email/password, and use v1.0.12+",
          "err"
        );
        return;
      }

      const repairedSuffix = repairedCount
        ? (lang === "bn" ? `, মেরামত: ${repairedCount}` : `, repaired: ${repairedCount}`)
        : "";
      const msg = lang==="bn"
        ? `${t.syncUploadOk} (${uploaded} records, products: ${productCount}${repairedSuffix})`
        : `${t.syncUploadOk} (${uploaded} records, products: ${productCount}${repairedSuffix})`;
      toast(result.failed || result.totalFailed ? `${msg} ⚠️` : msg, result.failed || result.totalFailed ? "err" : "ok");
      await refreshSyncDashboard();
    } catch (error) {
      if (error?.code === "FIREBASE_AUTH_REQUIRED") {
        toast(t.syncNeedEmailLogin, "err");
      } else {
        toast(error?.message || String(error), "err");
      }
    } finally {
      setCloudUploadBusy(false);
    }
  };

  const refreshLicenseAccess = async () => {
    setLicenseAccessLoading(true);
    try {
      const helper = typeof window !== "undefined" ? window.S4License : null;
      if (!helper?.accessStatus) {
        setLicenseAccess({
          ok: false,
          accessAllowed: true,
          accessReason: "LICENSE_HELPERS_NOT_READY",
        });
        return;
      }
      setLicenseAccess(await helper.accessStatus());
    } catch (error) {
      console.warn("[S4 License] access status check failed", error);
      setLicenseAccess({
        ok: false,
        accessAllowed: true,
        accessReason: "LICENSE_ACCESS_CHECK_FAILED",
        error: error?.message || String(error),
      });
    } finally {
      setLicenseAccessLoading(false);
    }
  };
  return { applyShopRecord, mergeShopRecord, mergeVisibleOrders, refreshLicenseAccess, refreshSyncDashboard, runCloudDownload, runCloudUpload };
}
