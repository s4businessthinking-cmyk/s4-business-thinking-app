import { offlineUpsert } from "../offline/offlineRepository.js";
import { buildChildCompanyReceiptInvoice } from "./interCompanyReceiptInvoice.js";

export { buildChildCompanyReceiptInvoice } from "./interCompanyReceiptInvoice.js";

export async function postBranchReceiptToChildCompanyFile({ transfer, receipt, childShopId, actor }) {
  const cid = String(childShopId || "").trim();
  if (!cid || cid === transfer?.shopId) return null;
  const accepted = (receipt?.lines || []).some((l) => Number(l.acceptedQty) > 0);
  if (!accepted) return null;
  const invoice = buildChildCompanyReceiptInvoice({ transfer, receipt, childShopId: cid, actor });
  const result = await offlineUpsert("purchaseInvoices", invoice.id, invoice);
  return { ...result.data, id: invoice.id };
}