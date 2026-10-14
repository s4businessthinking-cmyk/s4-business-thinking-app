import { collection, onSnapshot, orderBy, query, where } from "../backend/firestore";
import { compareProductNames, isActiveProduct } from "../app/mainAppHelpers.js";
import { db } from "../firebase-config";
import { offlineCacheCloudRecords, offlineDirtyRecords, offlineList, offlinePurgeCleanLocal } from "../offline/offlineRepository";
import { useEffect } from "react";

export function useProductsLoader({ authSyncReady, productBulkDeleteRef, setProducts, setProductsLoading, setSyncRefreshKey, setSyncState, shopId, syncRefreshKey }) {
  const fetchProducts = async () => {
    setSyncRefreshKey((value) => value + 1);
  };

  useEffect(() => {
    if (!shopId) return;

    setProductsLoading(true);

    let cancelled = false;
    let cloudApplied = false;
    let cloudRows = new Map(); // every cloud product of this shop, tombstones included
    let publishSeq = 0;

    const loadLocalProducts = async () => {
      try {
        const local = await offlineList("products");
        if (cancelled || cloudApplied) return;
        const docs = local.records
          .map((r) => ({ id: r.document_id, ...(r.data || {}) }))
          .filter((p) => p.shopId === shopId && isActiveProduct(p))
          .sort(compareProductNames);
        setProducts(docs);
        setSyncState(typeof navigator !== "undefined" && navigator.onLine ? "connected" : "offline");
      } catch (err) {
        console.error("products offline fallback:", err);
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    };

    // Cloud rows overlaid with unsynced local rows, so an offline edit or delete is not undone
    // by a snapshot that arrives before the upload, and nothing deleted elsewhere is kept.
    const publishProducts = async () => {
      const seq = ++publishSeq;
      const dirty = await offlineDirtyRecords("products").catch(() => []);
      if (cancelled || seq !== publishSeq) return;
      const merged = new Map(cloudRows);
      dirty.forEach((rec) => {
        const sameShop = rec.data?.shopId ? rec.data.shopId === shopId : cloudRows.has(rec.documentId);
        if (!sameShop) return;
        if (rec.deleted) merged.delete(rec.documentId);
        else merged.set(rec.documentId, { ...rec.data, id: rec.documentId });
      });
      setProducts([...merged.values()].filter(isActiveProduct).sort(compareProductNames));
    };
    // Bursts of snapshots (e.g. while an import uploads) are coalesced into one refresh.
    let publishTimer = null;
    const schedulePublish = () => {
      if (publishTimer) return;
      publishTimer = setTimeout(() => {
        publishTimer = null;
        publishProducts();
      }, 150);
    };

    const applyDocs = (snap) => {
      if (productBulkDeleteRef.current) return;

      if (snap.metadata?.fromCache && snap.empty) {
        loadLocalProducts();
        return;
      }

      const changes = snap.docChanges();
      const fullSnapshot = !cloudApplied
        || (changes.length === snap.docs.length && changes.every((c) => c.type === "added"));
      let changed = [];
      const removedIds = [];
      if (fullSnapshot) {
        const previousIds = cloudRows;
        cloudRows = new Map(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id }]));
        changed = [...cloudRows.values()];
        previousIds.forEach((_, id) => { if (!cloudRows.has(id)) removedIds.push(id); });
      } else {
        changes.forEach((c) => {
          if (c.type === "removed") {
            cloudRows.delete(c.doc.id);
            removedIds.push(c.doc.id);
          } else {
            const row = { ...c.doc.data(), id: c.doc.id };
            cloudRows.set(c.doc.id, row);
            changed.push(row);
          }
        });
      }
      const firstCloudSnapshot = !cloudApplied;
      cloudApplied = true;
      if (firstCloudSnapshot) publishProducts();
      else schedulePublish();

      if (changed.length) {
        offlineCacheCloudRecords("products", changed).catch((err) =>
          console.warn("[S4 Offline] product cache failed", err)
        );
      }
      if (firstCloudSnapshot) {
        offlineList("products")
          .then((local) => {
            const stale = local.records
              .filter((r) => Number(r.dirty || 0) !== 1 && r.data?.shopId === shopId && !cloudRows.has(r.document_id))
              .map((r) => r.document_id);
            if (stale.length) return offlinePurgeCleanLocal("products", stale);
          })
          .catch((err) => console.warn("[S4 Offline] stale product purge failed", err));
      } else if (removedIds.length) {
        offlinePurgeCleanLocal("products", removedIds).catch((err) =>
          console.warn("[S4 Offline] removed product purge failed", err)
        );
      }
      setSyncState("connected");
      setProductsLoading(false);
    };

    let unsub1 = () => {};
    let unsub2 = null;

    if (authSyncReady) {
      unsub1 = onSnapshot(
        query(collection(db, "products"), where("shopId", "==", shopId), orderBy("name")),
        applyDocs,
        () => {
          unsub2 = onSnapshot(
            query(collection(db, "products"), where("shopId", "==", shopId)),
            applyDocs,
            (err) => {
              console.error("products listener:", err);
              loadLocalProducts();
            }
          );
        }
      );
    }

    loadLocalProducts();

    return () => {
      cancelled = true;
      clearTimeout(publishTimer);
      unsub1();
      unsub2 && unsub2();
    };
  }, [shopId, syncRefreshKey, authSyncReady]);
  return { fetchProducts };
}
