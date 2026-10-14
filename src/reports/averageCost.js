// Shared by the reports and the purchase screens, so the Avg. Cost shown on a product is the one the reports use.
import { itemBaseQty } from "../inventory/unitConversion.js";
import { n, dayOf } from "./reportFilters.js";

// Weighted average purchase cost per base unit up to a date: opening stock at its rate plus every confirmed purchase (VAT excluded).
export function averageCosts(products, purchases, upTo) {
  const acc = new Map();
  (products || []).forEach((p) => {
    const q = n(p.openingStock);
    const rate = n(p.openingRate) || n(p.landingCost);
    acc.set(p.id, { qty: q > 0 ? q : 0, value: q > 0 ? q * rate : 0, fallback: n(p.landingCost) || n(p.averageCost) || rate });
  });
  const productById = new Map((products || []).map((p) => [p.id, p]));
  purchases.forEach((inv) => {
    if (upTo && dayOf(inv.invoiceDate) > upTo) return;
    (inv.items || []).forEach((it) => {
      if (!it?.productId || !acc.has(it.productId)) return;
      const q = itemBaseQty(it, productById.get(it.productId));
      if (q <= 0) return;
      const net = n(it.lineTotal) - n(it.taxAmt);
      const a = acc.get(it.productId);
      a.qty += q;
      a.value += net > 0 ? net : 0;
    });
  });
  const out = new Map();
  acc.forEach((a, id) => out.set(id, a.qty > 0 && a.value > 0 ? a.value / a.qty : a.fallback));
  return out;
}
