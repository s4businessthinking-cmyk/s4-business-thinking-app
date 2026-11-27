import { offlineList, offlinePatch } from "../offline/offlineRepository.js";
import { persistOfflineDb } from "../offline/sqliteDb.js";
import { rowsOf } from "../inventory/stockFromInvoices.js";
import { invoiceNeedsPaymentBankRepair, paymentBankRepairPatch } from "./invoicePaymentBankRepair.js";

export { invoiceNeedsPaymentBankRepair, paymentBankRepairPatch } from "./invoicePaymentBankRepair.js";

export async function repairShopInvoicePaymentBanks(shopId, shop, { dryRun = false } = {}) {
  const bankName = paymentBankRepairPatch(shop).paymentBank || "";
  if (!bankName || !shopId) return { sales: 0, purchase: 0, bankName };
  let sales = 0;
  let purchase = 0;
  const patchCollection = async (collection) => {
    const res = await offlineList(collection);
    const rows = rowsOf(res).filter((r) => r.shopId === shopId);
    for (const row of rows) {
      if (!invoiceNeedsPaymentBankRepair(row)) continue;
      if (collection === "salesInvoices") sales += 1;
      else purchase += 1;
      if (!dryRun) {
        await offlinePatch(collection, row.id, paymentBankRepairPatch(shop));
      }
    }
  };
  await patchCollection("salesInvoices");
  await patchCollection("purchaseInvoices");
  if (!dryRun && (sales || purchase)) await persistOfflineDb();
  return { sales, purchase, bankName };
}