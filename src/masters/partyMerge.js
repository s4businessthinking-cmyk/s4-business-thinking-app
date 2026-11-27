// Merge and split party ledgers (customers or suppliers). The Global Ledger is worked out from the documents, so a
// merge / split only changes which party the documents point to (id, name, code) - nothing is posted or deleted.
// Merge: every document of the source party moves to the surviving party; the source stays in the master as
//   inactive with mergedInto (kept for history, never deleted). Empty contact fields of the survivor are filled from
//   the source, and a loyalty membership moves over when the survivor has none.
// Split: the chosen bills move to another existing party, together with the receipts / payments and returns that
//   belong only to them. A receipt that also pays a bill staying behind blocks the split of that bill.
// Both stop (blockers) instead of half-moving: a closed accounting period, two opening balances, a both-sides link.
import { LOCKED_COLLECTIONS, recordDay } from "../accounts/periodLock.js";

const lc = (v) => String(v || "").trim().toLowerCase();

const sales = (col) => ({ col, id: "customerId", name: "customerName", code: "customerCode" });
const purch = (col) => ({ col, id: "vendorId", name: "vendorName", code: "vendorCode" });
export const PARTY_KINDS = {
  customer: {
    master: "customers", nameKey: "customerName", codeKey: "customerCode", linkKey: "linkedVendorId",
    bills: "salesInvoices", money: "salesReceipts", returns: "salesReturns",
    refs: [
      sales("salesInvoices"), sales("quotations"), sales("deliveryNotes"), sales("salesOrders"),
      { col: "salesReceipts", id: "customerId", name: "customerName" },
      { col: "salesReturns", id: "partyId", name: "partyName" },
      { col: "jobOrders", id: "customerId", name: "customerName" },
      { col: "warrantyClaims", id: "customerId", name: "customerName" },
      { col: "securityCheques", id: "partyId", name: "partyName", when: (d) => d.partyType === "customer" },
    ],
  },
  vendor: {
    master: "vendors", nameKey: "vendorName", codeKey: "vendorCode", linkKey: "linkedCustomerId",
    bills: "purchaseInvoices", money: "purchasePayments", returns: "purchaseReturns",
    refs: [
      purch("purchaseInvoices"), purch("purchaseOrders"), purch("goodsReceipts"),
      { col: "purchasePayments", id: "vendorId", name: "vendorName" },
      { col: "supplierPayments", id: "vendorId", name: "vendorName" },
      { col: "purchaseReturns", id: "partyId", name: "partyName" },
      { col: "warrantyClaims", id: "vendorId", name: "vendorName" },
      { col: "securityCheques", id: "partyId", name: "partyName", when: (d) => d.partyType !== "customer" },
    ],
  },
};
// Contact fields filled on the survivor only where it has none.
const FILL_KEYS = ["mobileNumber", "whatsappNumber", "phoneNumber", "email", "address", "trnNumber", "contactPerson"];
export const MERGE_COLLECTIONS = [...new Set([...PARTY_KINDS.customer.refs, ...PARTY_KINDS.vendor.refs].map((r) => r.col)), "accountVouchers"];

const live = (d) => d && !d.isDeleted && !d.deleted;
const belongs = (doc, ref, party, nameOf) => live(doc) && (!ref.when || ref.when(doc))
  && (doc[ref.id] ? doc[ref.id] === party.id : !!lc(doc[ref.name]) && lc(doc[ref.name]) === lc(nameOf(party)));
const lockedDoc = (col, doc, lockDate) => !!lockDate && !!LOCKED_COLLECTIONS[col] && !!recordDay(col, doc) && recordDay(col, doc) <= lockDate;
const isOpening = (doc) => doc?.source === "openingBalance";
const openingOf = (kind, party, data) => {
  const k = PARTY_KINDS[kind];
  const ref = k.refs.find((r) => r.col === k.bills);
  return (data[k.bills] || []).filter((d) => belongs(d, ref, party, (p) => p[k.nameKey]) && isOpening(d) && d.status !== "cancelled");
};

function refPatch(ref, target, k) {
  return { [ref.id]: target.id, [ref.name]: target[k.nameKey] || "", ...(ref.code ? { [ref.code]: target[k.codeKey] || "" } : {}) };
}

// journal / contra lines that name the source party move to the survivor's name
function voucherChanges(data, fromName, toName) {
  const out = [];
  (data.accountVouchers || []).filter(live).forEach((v) => {
    const lines = (v.lines || []).map((l) => (lc(l?.account) === lc(fromName) ? { ...l, account: toName } : l));
    const changed = lines.some((l, i) => l !== (v.lines || [])[i]);
    const from = lc(v.fromAccount) === lc(fromName), to = lc(v.toAccount) === lc(fromName);
    if (!changed && !from && !to) return;
    out.push({ col: "accountVouchers", id: v.id, doc: v, patch: { ...(changed ? { lines } : {}), ...(from ? { fromAccount: toName } : {}), ...(to ? { toAccount: toName } : {}) } });
  });
  return out;
}

/**
 * Merge preview. data: { [collection]: docs[] } for MERGE_COLLECTIONS. lockDate: the shop's period lock day ("" none).
 * -> { blockers: [code], changes: [{ col, id, doc, patch }], counts: { [col]: n }, sourcePatch, targetPatch }
 */
export function mergePlan(kind, source, target, data, { lockDate = "", now = new Date(), by = "" } = {}) {
  const k = PARTY_KINDS[kind];
  const blockers = [];
  if (!source || !target) return { blockers: ["missing"], changes: [], counts: {}, sourcePatch: null, targetPatch: null };
  if (source.id === target.id) blockers.push("same");
  if (source.mergedInto || target.mergedInto) blockers.push("merged");
  if (source[k.linkKey] || target[k.linkKey]) blockers.push("linked");
  if (openingOf(kind, source, data).length && openingOf(kind, target, data).length) blockers.push("bothOpening");
  const changes = [];
  k.refs.forEach((ref) => (data[ref.col] || []).forEach((doc) => {
    if (belongs(doc, ref, source, (p) => p[k.nameKey])) changes.push({ col: ref.col, id: doc.id, doc, patch: refPatch(ref, target, k) });
  }));
  changes.push(...voucherChanges(data, source[k.nameKey], target[k.nameKey]));
  if (changes.some((c) => lockedDoc(c.col, c.doc, lockDate))) blockers.push("locked");
  const counts = {};
  changes.forEach((c) => { counts[c.col] = (counts[c.col] || 0) + 1; });
  const at = new Date(now).toISOString();
  const fill = Object.fromEntries(FILL_KEYS.filter((f) => !String(target[f] || "").trim() && String(source[f] || "").trim()).map((f) => [f, source[f]]));
  const loyalty = kind === "customer" && source.loyaltyMember === true && target.loyaltyMember !== true
    ? { loyaltyMember: true, loyaltyNo: source.loyaltyNo || "", loyaltySince: source.loyaltySince || "" } : {};
  const opening = Number(source.openingBalance) && !Number(target.openingBalance) ? { openingBalance: source.openingBalance } : {};
  return {
    blockers, changes, counts,
    sourcePatch: { status: "inactive", mergedInto: target.id, mergedIntoName: target[k.nameKey] || "", mergedAt: at, mergedBy: by, openingBalance: 0, ...(kind === "customer" ? { loyaltyMember: false, autoWhatsAppInvoice: false, autoWhatsAppReceipt: false } : {}) },
    targetPatch: { ...fill, ...loyalty, ...opening },
  };
}

/** Bills of a party that can be split off, with what would travel with each. */
export function splitCandidates(kind, party, data) {
  const k = PARTY_KINDS[kind];
  const billRef = k.refs.find((r) => r.col === k.bills);
  const moneyRef = k.refs.find((r) => r.col === k.money);
  const bills = (data[k.bills] || []).filter((d) => belongs(d, billRef, party, (p) => p[k.nameKey]) && !isOpening(d));
  const money = (data[k.money] || []).filter((d) => belongs(d, moneyRef, party, (p) => p[k.nameKey]));
  return { bills, money };
}

/**
 * Split preview: move the chosen bills (ids) of source to target.
 * Receipts / payments go along when every bill they settle is chosen; one that also settles a bill staying behind
 * blocks (sharedMoney). Returns against a chosen bill go along. Opening-balance bills cannot be split.
 * -> { blockers, changes, counts, shared: [doc] }
 */
export function splitPlan(kind, source, target, data, billIds, { lockDate = "" } = {}) {
  const k = PARTY_KINDS[kind];
  const blockers = [];
  const chosen = new Set(billIds || []);
  if (!source || !target) return { blockers: ["missing"], changes: [], counts: {}, shared: [] };
  if (source.id === target.id) blockers.push("same");
  if (target.mergedInto) blockers.push("merged");
  if (!chosen.size) blockers.push("none");
  const { bills, money } = splitCandidates(kind, source, data);
  const picked = bills.filter((b) => chosen.has(b.id));
  if ((data[k.bills] || []).some((b) => chosen.has(b.id) && isOpening(b))) blockers.push("opening");
  const shared = [];
  const moving = [];
  money.forEach((m) => {
    const ids = (m.allocations || []).map((a) => a.invoiceId).filter(Boolean);
    if (!ids.length) return; // on account: stays with the party
    const inside = ids.filter((id) => chosen.has(id)).length;
    if (inside === ids.length) moving.push(m);
    else if (inside > 0) shared.push(m);
  });
  if (shared.length) blockers.push("sharedMoney");
  const billRef = k.refs.find((r) => r.col === k.bills);
  const moneyRef = k.refs.find((r) => r.col === k.money);
  const retRef = k.refs.find((r) => r.col === k.returns);
  const changes = [
    ...picked.map((doc) => ({ col: k.bills, id: doc.id, doc, patch: refPatch(billRef, target, k) })),
    ...moving.map((doc) => ({ col: k.money, id: doc.id, doc, patch: refPatch(moneyRef, target, k) })),
    ...(data[k.returns] || []).filter((r) => live(r) && chosen.has(r.invoiceId)).map((doc) => ({ col: k.returns, id: doc.id, doc, patch: refPatch(retRef, target, k) })),
  ];
  if (changes.some((c) => lockedDoc(c.col, c.doc, lockDate))) blockers.push("locked");
  const counts = {};
  changes.forEach((c) => { counts[c.col] = (counts[c.col] || 0) + 1; });
  return { blockers, changes, counts, shared };
}
