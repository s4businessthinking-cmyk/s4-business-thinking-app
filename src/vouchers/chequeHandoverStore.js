// Handover photos and signatures are kept in their own collection (one record per
// voucher id) so the payment voucher lists, which load everywhere, stay small.
// The voucher itself only carries a summary: { receiverName, receivedAt, hasDocs }.
import { offlineUpsert, offlineGetById, offlineCacheCloudRecord } from "../offline/offlineRepository";
import { doc, getDoc } from "../backend/firestore";
import { db } from "../firebase-config";

const COL = "chequeHandovers";
const DOC_FIELDS = ["idFront", "idBack", "signature", "signedPaper"];

export const handoverSummary = (handover = {}) => ({
  receiverName: handover.receiverName || "",
  receivedAt: handover.receivedAt || "",
  hasDocs: DOC_FIELDS.some((k) => !!handover[k]),
});

export async function saveHandoverDocs(voucher, handover, uid = "") {
  const record = {
    shopId: voucher.shopId,
    voucherId: voucher.id,
    paymentNo: voucher.paymentNo || "",
    receiverName: handover.receiverName || "",
    receivedAt: handover.receivedAt || "",
    ...Object.fromEntries(DOC_FIELDS.map((k) => [k, handover[k] || ""])),
    updatedAt: new Date().toISOString(),
    updatedBy: uid,
  };
  await offlineUpsert(COL, voucher.id, record);
  return record;
}

/** Full handover (summary + photos) for a voucher, from this device or the server. */
export async function loadHandoverDocs(voucher) {
  const summary = voucher?.handover || {};
  if (!voucher?.id) return summary;
  if (DOC_FIELDS.some((k) => summary[k])) return summary;
  let local = null;
  try { local = await offlineGetById(COL, voucher.id); } catch {}
  const unsynced = Number(local?.dirty || 0) === 1;
  if (summary.hasDocs && navigator.onLine && !unsynced) {
    try {
      const snap = await getDoc(doc(db, COL, voucher.id));
      if (snap.exists()) {
        const data = snap.data();
        offlineCacheCloudRecord(COL, voucher.id, data).catch(() => {});
        return { ...summary, ...data };
      }
    } catch (error) {
      console.warn("[S4 Handover] load failed", error);
    }
  }
  return local?.data ? { ...summary, ...local.data } : summary;
}
