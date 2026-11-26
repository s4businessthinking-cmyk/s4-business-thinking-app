// Stock moved outside buying and selling: stock adjustments (damage, loss, count difference, exchange, convert) and
// warranty units replaced by the company. Pure (no storage), so the stock count (stockFromInvoices), the P&L
// (accountsCalc) and the global ledger all read the same quantities.
import { itemBaseQty } from "./unitConversion.js";
import { dayOf, recordDay } from "../accounts/periodLock.js";

/** The day an adjustment moves stock. */
export const adjustmentDay = (adj) => recordDay("stockAdjustments", adj);
/** The day a warranty claim adds stock: the company's replaced day (the balance sheet counts it from then). */
export const warrantyStockDay = (c) => (c?.replacedDate ? dayOf(c.replacedDate) : recordDay("warrantyClaims", c));

export function addAdjustments(adjustments, shopId, into, productById, onlyIds = null) {
  (adjustments || []).forEach((adj) => {
    if (!adj || adj.isDeleted || adj.deleted || adj.status !== "confirmed") return;
    if (shopId && adj.shopId && adj.shopId !== shopId) return;
    (adj.items || []).forEach((it) => {
      if (!it?.productId) return;
      if (onlyIds && !onlyIds.has(it.productId)) return;
      const qty = itemBaseQty(it, productById.get(it.productId));
      if (qty <= 0) return;
      into.set(it.productId, (into.get(it.productId) || 0) + (it.direction === "out" ? -qty : qty));
    });
  });
}

/** Warranty: only "replaced" (company gave new unit, still at shop) adds saleable stock. */
export function addWarrantyClaims(claims, shopId, into, productById, onlyIds = null) {
  (claims || []).forEach((c) => {
    if (!c || c.isDeleted || c.deleted || c.status !== "replaced") return;
    if (shopId && c.shopId && c.shopId !== shopId) return;
    const productId = c.replacedProductId || c.productId;
    if (!productId) return;
    if (onlyIds && !onlyIds.has(productId)) return;
    const qty = itemBaseQty(
      { productId, qty: c.qty, unitFactor: c.unitFactor || 1 },
      productById.get(productId),
    );
    if (qty <= 0) return;
    into.set(productId, (into.get(productId) || 0) + qty);
  });
}
