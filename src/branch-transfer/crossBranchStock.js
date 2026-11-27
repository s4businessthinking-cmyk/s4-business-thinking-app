import { computeStockMap, loadInvoiceRows } from "../inventory/stockFromInvoices.js";
import { buildCrossBranchRows, crossBranchQtyRows, resolveHomeShopId } from "./crossBranchStockQuery.js";

export { crossBranchQtyRows, resolveHomeShopId, buildCrossBranchRows };

export function stockMapForShopId(products, rows, shopId) {
  if (!shopId) return new Map();
  return computeStockMap(
    products,
    rows.purchaseInvoices,
    rows.salesInvoices,
    shopId,
    rows.deliveryNotes,
    rows.extras
  );
}

export async function loadCrossBranchStock({ homeShopId, branches = [], products = [], rows: givenRows = null }) {
  if (!homeShopId) return [];
  const rows = givenRows || (await loadInvoiceRows());
  const productList = (products || []).filter((p) => p && !p.isDeleted && !p.deleted);
  return buildCrossBranchRows({
    homeShopId,
    branches,
    productList,
    stockMapForShopId: (list, shopId) => stockMapForShopId(list, rows, shopId),
  });
}