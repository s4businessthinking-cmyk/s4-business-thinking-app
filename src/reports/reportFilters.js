export const LIVE = ["confirmed", "paid", "partial"];
export const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
export const r2 = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100;
export const dayOf = (v) => String(v || "").slice(0, 10);
export const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
export const isLive = (doc, shopId) => doc && !doc.isDeleted && !doc.deleted && (!shopId || !doc.shopId || doc.shopId === shopId);

// A party's opening balance is money owed from before, not a sale or purchase of goods; callers drop it where needed.
export const liveSalesOf = (list, shopId) => (list || []).filter((inv) => isLive(inv, shopId) && LIVE.includes(inv.status) && inv.docKind !== "quotation" && inv.invoiceType !== "delivery");
export const livePurchasesOf = (list, shopId) => (list || []).filter((inv) => isLive(inv, shopId) && LIVE.includes(inv.status) && !inv.internalTransfer && inv.sourceType !== "branch_transfer");
export const liveReturnsOf = (list, shopId) => (list || []).filter((r) => isLive(r, shopId) && r.status !== "cancelled");
