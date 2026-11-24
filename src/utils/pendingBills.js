// Pending bills: sales or purchase bills that still have money due, with due date, days overdue and an ageing bucket.
// Bills: the live money bills the P&L counts (confirmed / partial / paid; no quotations, delivery notes, branch
// transfers, drafts or cancelled) without party opening balances, and only while balanceDue is above zero.
// Due date: the saved dueDate, else bill date + creditDays, else the bill date itself (no credit terms = due at once).
// Days = as-at date minus due date: negative = not due yet, 0 = due today. Buckets use the Debtors & Creditors ageing
// windows (0-30 / 31-60 / 61-90 / 90+), counted on days overdue.
import { AGE_BUCKETS, bucketOf } from "../reports/partyAging.js";
import { liveSalesOf, livePurchasesOf } from "../reports/reportFilters.js";

const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((n(v) + Number.EPSILON) * 100) / 100;
const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 10) : "");
const addDays = (iso, days) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
};
const daysBetween = (fromIso, toIso) => Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);

export const NOT_DUE = "notDue";
export const NOT_SET = "notSet";
export const PENDING_BUCKETS = [NOT_DUE, ...AGE_BUCKETS.map((b) => b[2])];
export const SOON_DAYS = 7;

/** -> { date, source: "saved" | "terms" | "billDate" | "" } */
export function dueDateOf(inv) {
  const saved = day(inv?.dueDate);
  if (saved) return { date: saved, source: "saved" };
  const billDate = day(inv?.invoiceDate);
  if (!billDate) return { date: "", source: "" };
  const terms = Math.round(n(inv?.creditDays));
  if (terms > 0) return { date: addDays(billDate, terms), source: "terms" };
  return { date: billDate, source: "billDate" };
}

export const bucketForDays = (days) => (days == null ? NOT_SET : days < 0 ? NOT_DUE : AGE_BUCKETS[bucketOf(days)][2]);

/**
 * invoices: sales or purchase bills; kind: "sales" | "purchase".
 * -> rows sorted by due date (oldest first), then bill date and number:
 *    [{ inv, billDate, due, dueSource, days, bucket, total, paid, balance }]
 */
export function pendingRows(invoices, { kind = "sales", asOf, shopId = "" } = {}) {
  const live = (kind === "purchase" ? livePurchasesOf : liveSalesOf)(invoices, shopId)
    .filter((inv) => inv.source !== "openingBalance" && inv.docKind !== "salesOrder" && inv.docKind !== "delivery" && n(inv.balanceDue) > 0.009);
  return live.map((inv) => {
    const { date, source } = dueDateOf(inv);
    const days = date && asOf ? daysBetween(date, asOf) : null;
    return { inv, billDate: day(inv.invoiceDate), due: date, dueSource: source, days, bucket: bucketForDays(days), total: r2(inv.grandTotal), paid: r2(inv.amountPaid), balance: r2(inv.balanceDue) };
  }).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.billDate.localeCompare(b.billDate)
    || String(a.inv.invoiceNo || "").localeCompare(String(b.inv.invoiceNo || ""), undefined, { numeric: true }));
}

/** mode: "pending" (all) | "overdue" | "today" | "soon" (due in the next SOON_DAYS days) | "notDue"; bucket: one of PENDING_BUCKETS / NOT_SET. */
export function filterPending(rows, { mode = "pending", bucket = "", query = "", partyOf = () => "" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (mode === "overdue" && !(r.days > 0)) return false;
    if (mode === "today" && r.days !== 0) return false;
    if (mode === "soon" && !(r.days < 0 && r.days >= -SOON_DAYS)) return false;
    if (mode === "notDue" && !(r.days < 0)) return false;
    if (bucket && r.bucket !== bucket) return false;
    return !q || [r.inv.invoiceNo, r.inv.supplierInvoiceNo, partyOf(r.inv), r.inv.customerMobile, r.inv.vendorMobile].some((v) => String(v || "").toLowerCase().includes(q));
  });
}

/** Totals for the shown rows: count, due, overdue, due today / soon, and per bucket. */
export function pendingSummary(rows) {
  const out = { count: 0, due: 0, overdueCount: 0, overdue: 0, todayCount: 0, soonCount: 0, buckets: {} };
  [...PENDING_BUCKETS, NOT_SET].forEach((b) => { out.buckets[b] = { count: 0, amount: 0 }; });
  (rows || []).forEach((r) => {
    out.count += 1;
    out.due = r2(out.due + r.balance);
    if (r.days > 0) { out.overdueCount += 1; out.overdue = r2(out.overdue + r.balance); }
    if (r.days === 0) out.todayCount += 1;
    if (r.days < 0 && r.days >= -SOON_DAYS) out.soonCount += 1;
    const b = out.buckets[r.bucket];
    b.count += 1;
    b.amount = r2(b.amount + r.balance);
  });
  return out;
}

export const PENDING_COLS = ["Date", "Invoice No", "Party", "Mobile", "Due Date", "Days", "Bucket", "Total", "Paid", "Due", "Status"];
const BUCKET_EN = { [NOT_DUE]: "Not due", [NOT_SET]: "Not set" };

/** CSV rows (fixed English headers, plain numbers). Days: positive = overdue, negative = days left. */
export function pendingCsvRows(rows, { kind = "sales" } = {}) {
  const party = (inv) => (kind === "purchase" ? inv.vendorName : inv.customerName) || "";
  const mobile = (inv) => (kind === "purchase" ? inv.vendorMobile : inv.customerMobile) || "";
  const s = pendingSummary(rows);
  return [
    PENDING_COLS,
    ...rows.map((r) => [r.billDate, r.inv.invoiceNo || "", party(r.inv), mobile(r.inv), r.due, r.days == null ? "" : String(r.days),
      BUCKET_EN[r.bucket] || r.bucket, r.total.toFixed(2), r.paid.toFixed(2), r.balance.toFixed(2), r.inv.status || ""]),
    ["Total", `${s.count} bill(s)`, "", "", "", "", "", "", "", s.due.toFixed(2), `${s.overdueCount} overdue (${s.overdue.toFixed(2)})`],
  ];
}

export const pendingFileName = (kind, asOf) => `pending-bills-${kind === "purchase" ? "purchase" : "sales"}-${asOf}.csv`;
