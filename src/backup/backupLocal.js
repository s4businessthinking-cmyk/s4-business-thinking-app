// Local SQLite → same .s4backup shape as the server export (no network).
export const BACKUP_FORMAT = "s4-shop-backup";

export function docsFromLocalRecords(records, shopId, collectionName) {
  const sid = String(shopId || "");
  const docs = [];
  for (const row of records || []) {
    const data = row?.data && typeof row.data === "object" ? row.data : (row || {});
    const id = String(data.id || row.document_id || row.id || "");
    if (!id) continue;
    const rowShop = String(data.shopId || "");
    if (collectionName === "shops") {
      if (id !== sid && rowShop !== sid) continue;
    } else if (rowShop !== sid) continue;
    docs.push({ id, data });
  }
  return docs;
}

export function buildLocalBackupPayload(shopId, collectionDocs, createdAt) {
  const collections = {};
  let documentCount = 0;
  for (const [name, docs] of Object.entries(collectionDocs || {})) {
    if (!Array.isArray(docs) || !docs.length) continue;
    collections[name] = docs;
    documentCount += docs.length;
  }
  return {
    format: BACKUP_FORMAT,
    version: 1,
    shopId: String(shopId || ""),
    createdAt,
    documentCount,
    collections,
  };
}
