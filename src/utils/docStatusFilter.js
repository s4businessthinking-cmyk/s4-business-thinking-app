// Status / date filters shared by the bill lists (sales, delivery notes, quotations, purchases). "ALL" shows every
// document, "LIVE" leaves out drafts and cancelled ones, any other value is one exact status. Drafts and cancelled
// documents never count in money totals; the summary keeps them apart so the list can say how many were left out.

export const LIVE = "LIVE";
const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100;
export const isInactive = (doc) => doc?.status === "draft" || doc?.status === "cancelled";

export function matchesStatus(doc, filter) {
  if (!filter || filter === "ALL") return true;
  if (filter === LIVE) return !isInactive(doc);
  return doc?.status === filter;
}

/** Date filter on a YYYY-MM-DD field; an empty bound is open. */
export function inDateRange(doc, dateKey, from, to) {
  const d = String(doc?.[dateKey] || "").slice(0, 10);
  return (!from || d >= from) && (!to || d <= to);
}

/** Count per status plus ALL and LIVE, for the filter pills. */
export function statusCounts(docs) {
  const out = { ALL: 0, [LIVE]: 0 };
  (docs || []).forEach((d) => {
    out.ALL += 1;
    if (!isInactive(d)) out[LIVE] += 1;
    out[d?.status] = (out[d?.status] || 0) + 1;
  });
  return out;
}

/**
 * What the filtered list adds up to: counted = live documents (skip(doc) true leaves a live one out of the amount,
 * e.g. party opening balances); drafts and cancelled are counted apart with their own amount.
 */
export function listSummary(docs, { amountOf = (d) => d?.grandTotal, skip = () => false } = {}) {
  const out = { count: 0, counted: 0, amount: 0, draft: 0, draftAmount: 0, cancelled: 0, cancelledAmount: 0 };
  (docs || []).forEach((d) => {
    out.count += 1;
    if (d?.status === "cancelled") { out.cancelled += 1; out.cancelledAmount = r2(out.cancelledAmount + n(amountOf(d))); return; }
    if (d?.status === "draft") { out.draft += 1; out.draftAmount = r2(out.draftAmount + n(amountOf(d))); return; }
    out.counted += 1;
    if (!skip(d)) out.amount = r2(out.amount + n(amountOf(d)));
  });
  return out;
}
