// ID photos and signature for a security cheque, kept in their own collection (one record per
// security-cheque id) so the register list, which loads everywhere, stays small. The main record
// only carries a summary flag.
import { offlineUpsert, offlineGetById, offlineCacheCloudRecord } from "../offline/offlineRepository";
import { doc, getDoc } from "../backend/firestore";
import { db } from "../firebase-config";

const COL = "securityChequeDocs";
const DOC_FIELDS = ["idFront", "idBack", "chequePhoto", "receiptFile", "signedReceiptCopy", "agreementFile", "returnEvidence"];

export const hasSecurityChequeDocs = (docs = {}) => DOC_FIELDS.some((k) => !!docs[k]);

export async function saveSecurityChequeDocs(record, docs, uid = "") {
  const saved = {
    shopId: record.shopId,
    securityChequeId: record.id,
    ...Object.fromEntries(DOC_FIELDS.map((k) => [k, docs[k] || ""])),
    updatedAt: new Date().toISOString(),
    updatedBy: uid,
  };
  await offlineUpsert(COL, record.id, saved);
  return saved;
}

/** This record's photos/signature, from this device or the server. */
export async function loadSecurityChequeDocs(record) {
  if (!record?.id) return {};
  let local = null;
  try { local = await offlineGetById(COL, record.id); } catch { /* ignore */ }
  const unsynced = Number(local?.dirty || 0) === 1;
  if (!local && navigator.onLine && !unsynced) {
    try {
      const snap = await getDoc(doc(db, COL, record.id));
      if (snap.exists()) {
        const data = snap.data();
        offlineCacheCloudRecord(COL, record.id, data).catch(() => {});
        return data;
      }
    } catch (error) {
      console.warn("[S4 SecurityCheque] load docs failed", error);
    }
  }
  return local?.data || {};
}
