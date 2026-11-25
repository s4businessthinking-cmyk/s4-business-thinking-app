// Serial / IMEI registry: every product serial already saved on a document, with its lifecycle worked out from
// those documents only. Sources (the fields that exist today):
// - sales / purchase invoice lines: items[].serialNo (bills do not ask for it yet; older or imported bills may have it)
// - sales returns / purchase returns: items[].serialNo (optional on each returned line)
// - warranty claims: serialNo, through received / sent / replaced / delivered
// - job cards (service): serialNo of the customer's item, with the job status
// A serial's status is its latest event; nothing is assumed between documents (a purchased serial is not reported
// as "in stock" unless a document says so). Invoice numbering serials (SI-0001...) are not product serials.
import { dayOf, isLive } from "./reportFilters.js";

const LIVE_BILL = ["confirmed", "paid", "partial"];
// Spaces, dashes and other separators are ignored, so "35-111 222" and "35111222" are one serial.
export const normSerial = (v) => String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");

// Status groups for the filter; order is also the tie-break when two events fall on the same day.
export const STATUS_GROUPS = ["purchased", "sold", "returnedIn", "returnedOut", "warranty", "service"];
const KIND_GROUP = {
  purchase: "purchased", sale: "sold", salesReturn: "returnedIn", purchaseReturn: "returnedOut",
  warrantyReceived: "warranty", warrantySent: "warranty", warrantyReplaced: "warranty", warrantyDelivered: "warranty", service: "service",
};
const KIND_ORDER = ["purchase", "sale", "salesReturn", "purchaseReturn", "warrantyReceived", "warrantySent", "warrantyReplaced", "warrantyDelivered", "service"];
export const groupOf = (kind) => KIND_GROUP[kind] || "";

/**
 * data: { salesInvoices, purchaseInvoices, salesReturns, purchaseReturns, warrantyClaims, jobOrders, products }.
 * -> rows: [{ key, serial, productId, productName, productCode, status, group, last, events }] newest event first,
 *    events: [{ kind, date, no, col, docId, party, productId, productName, productCode, detail }] oldest first.
 */
export function buildSerialRegistry(data, { shopId = "" } = {}) {
  const productById = new Map((data?.products || []).filter((p) => p?.id).map((p) => [p.id, p]));
  const bySerial = new Map();
  const add = (serial, ev) => {
    const key = normSerial(serial);
    if (!key) return;
    const p = productById.get(ev.productId);
    const e = { ...ev, date: dayOf(ev.date), productName: ev.productName || p?.name || "", productCode: ev.productCode || p?.code || "" };
    if (!bySerial.has(key)) bySerial.set(key, { key, serial: String(serial).trim(), events: [] });
    bySerial.get(key).events.push(e);
  };
  const lines = (list, col, kind, okStatus, dateOf, partyOf, noOf) => (list || []).forEach((doc) => {
    if (!isLive(doc, shopId) || !okStatus(doc)) return;
    (doc.items || []).forEach((it) => {
      if (!it?.serialNo) return;
      add(it.serialNo, { kind, date: dateOf(doc), no: noOf(doc), col, docId: doc.id, party: partyOf(doc) || "", productId: it.productId || "", productName: it.name || "", productCode: it.code || "", detail: doc.invoiceNo && col.endsWith("Returns") ? doc.invoiceNo : "" });
    });
  });

  lines(data?.purchaseInvoices, "purchaseInvoices", "purchase", (d) => LIVE_BILL.includes(d.status) && !d.internalTransfer && d.sourceType !== "branch_transfer",
    (d) => d.invoiceDate, (d) => d.vendorName, (d) => d.invoiceNo || "");
  lines(data?.salesInvoices, "salesInvoices", "sale", (d) => LIVE_BILL.includes(d.status) && d.docKind !== "quotation" && d.invoiceType !== "delivery",
    (d) => d.invoiceDate, (d) => d.customerName, (d) => d.invoiceNo || "");
  lines(data?.salesReturns, "salesReturns", "salesReturn", (d) => d.status !== "cancelled", (d) => d.returnDate, (d) => d.partyName, (d) => d.returnNo || "");
  lines(data?.purchaseReturns, "purchaseReturns", "purchaseReturn", (d) => d.status !== "cancelled", (d) => d.returnDate, (d) => d.partyName, (d) => d.returnNo || "");

  (data?.warrantyClaims || []).forEach((c) => {
    if (!isLive(c, shopId) || c.status === "cancelled" || !c.serialNo) return;
    const base = { col: "warrantyClaims", docId: c.id, no: c.claimNo || "", productId: c.productId || "", productName: c.productName || "", productCode: c.productCode || "" };
    add(c.serialNo, { ...base, kind: "warrantyReceived", date: c.claimDate, party: c.customerName || "" });
    if (c.sentDate || ["sent", "replaced", "delivered"].includes(c.status)) add(c.serialNo, { ...base, kind: "warrantySent", date: c.sentDate || c.claimDate, party: c.vendorName || "" });
    if (c.replacedDate || ["replaced", "delivered"].includes(c.status)) add(c.serialNo, { ...base, kind: "warrantyReplaced", date: c.replacedDate || c.sentDate || c.claimDate, party: c.vendorName || "" });
    if (c.deliveredDate || c.status === "delivered") add(c.serialNo, { ...base, kind: "warrantyDelivered", date: c.deliveredDate || c.replacedDate || c.claimDate, party: c.customerName || "" });
  });

  (data?.jobOrders || []).forEach((j) => {
    if (!isLive(j, shopId) || j.status === "cancelled" || !j.serialNo) return;
    const hist = Array.isArray(j.statusHistory) ? j.statusHistory : [];
    const lastAt = hist.length ? hist[hist.length - 1].at : "";
    add(j.serialNo, { kind: "service", date: lastAt || j.jobDate || j.createdAt, no: j.jobNo || "", col: "jobOrders", docId: j.id, party: j.customerName || "", productId: "", productName: j.itemDesc || "", productCode: "", detail: j.status || "" });
  });

  const rows = [...bySerial.values()].map((r) => {
    // Same day: lifecycle order, then document no and id, so the result never depends on load order.
    r.events.sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
      || String(a.no).localeCompare(String(b.no), undefined, { numeric: true }) || String(a.docId).localeCompare(String(b.docId)));
    const last = r.events[r.events.length - 1];
    const named = [...r.events].reverse().find((e) => e.productId || e.productName) || last;
    return { ...r, productId: named.productId, productName: named.productName, productCode: named.productCode, status: last.kind, group: groupOf(last.kind), last };
  });
  return rows.sort((a, b) => b.last.date.localeCompare(a.last.date) || a.key.localeCompare(b.key));
}

/** Search: serial (partial, spaces and case ignored), product code / name, party; group: one of STATUS_GROUPS. */
export function filterSerials(rows, { query = "", group = "" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  const qs = normSerial(query);
  return (rows || []).filter((r) => (!group || r.group === group)
    && (!q || (qs && r.key.includes(qs)) || [r.productName, r.productCode, ...r.events.map((e) => e.party)].some((v) => String(v || "").toLowerCase().includes(q))));
}
