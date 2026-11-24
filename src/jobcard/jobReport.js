// Job order report and service-charge checks, worked out from the saved job cards with jobTotals.
// Billed = the job was turned into a sales invoice (convertedInvoiceNo, or the system "invoiced" status).
// Cancelled jobs stay in the list (marked) but are left out of every total.
import { jobTotals, r2 } from "./jobCard.js";

const lc = (v) => String(v || "").trim().toLowerCase();
export const isBilled = (j) => !!j?.convertedInvoiceNo || j?.status === "invoiced";

/**
 * jobs: job cards; filters: { from, to, status, technicianId, query } (query: job no, customer, mobile, vehicle, item, serial, invoice no).
 * -> { rows: [{ job, totals, billed, cancelled }], kpi, byTechnician: [{ name, jobs, services, parts, total }], byStatus: [{ key, jobs, total }] }
 */
export function buildJobReport(jobs, { from = "", to = "", status = "", technicianId = "", query = "" } = {}) {
  const q = lc(query);
  const rows = (jobs || [])
    .filter((j) => j && !j.isDeleted && j.jobNo)
    .filter((j) => (!from || String(j.jobDate || "") >= from) && (!to || String(j.jobDate || "") <= to))
    .filter((j) => (!status || (status === "billed" ? isBilled(j) : status === "unbilled" ? !isBilled(j) && j.status !== "cancelled" : j.status === status)))
    .filter((j) => !technicianId || j.technicianId === technicianId)
    .filter((j) => !q || [j.jobNo, j.customerName, j.customerMobile, j.vehicleNo, j.vehicleModel, j.itemDesc, j.serialNo, j.convertedInvoiceNo].some((v) => lc(v).includes(q)))
    .sort((a, b) => String(a.jobDate || "").localeCompare(String(b.jobDate || "")) || String(a.jobNo).localeCompare(String(b.jobNo), undefined, { numeric: true }))
    .map((job) => ({ job, totals: jobTotals(job), billed: isBilled(job), cancelled: job.status === "cancelled" }));

  const live = rows.filter((r) => !r.cancelled);
  const sum = (list, key) => r2(list.reduce((t, r) => t + r.totals[key], 0));
  const billed = live.filter((r) => r.billed), unbilled = live.filter((r) => !r.billed);
  const kpi = {
    jobs: live.length, cancelled: rows.length - live.length,
    services: sum(live, "services"), parts: sum(live, "parts"), vat: sum(live, "vat"), total: sum(live, "total"),
    billedJobs: billed.length, billedTotal: sum(billed, "total"), unbilledJobs: unbilled.length, unbilledTotal: sum(unbilled, "total"),
  };

  const tech = new Map();
  live.forEach(({ job, totals }) => {
    const name = String(job.technicianName || "").trim();
    const t = tech.get(name) || { name, jobs: 0, services: 0, parts: 0, total: 0 };
    t.jobs += 1; t.services = r2(t.services + totals.services); t.parts = r2(t.parts + totals.parts); t.total = r2(t.total + totals.total);
    tech.set(name, t);
  });
  const st = new Map();
  rows.forEach(({ job, totals, cancelled }) => {
    const s = st.get(job.status) || { key: job.status, jobs: 0, total: 0 };
    s.jobs += 1;
    if (!cancelled) s.total = r2(s.total + totals.total);
    st.set(job.status, s);
  });
  return {
    rows, kpi,
    byTechnician: [...tech.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    byStatus: [...st.values()].sort((a, b) => b.jobs - a.jobs),
  };
}

export const JOB_REPORT_COLS = ["Date", "Job No", "Customer", "Mobile", "Vehicle", "Item", "Serial", "Technician", "Status", "Services", "Parts", "VAT", "Total", "Billed", "Invoice No"];
const amount = (v) => r2(v).toFixed(2);

/** CSV rows (fixed English headers, plain-number amounts); statusName(key) gives the status label. */
export function jobReportRows(report, statusName = (k) => k) {
  const k = report.kpi;
  return [
    JOB_REPORT_COLS,
    ...report.rows.map(({ job, totals, billed }) => [
      job.jobDate || "", job.jobNo, job.customerName || "", job.customerMobile || "", [job.vehicleNo, job.vehicleModel].filter(Boolean).join(" "), job.itemDesc || "", job.serialNo || "",
      job.technicianName || "", statusName(job.status), amount(totals.services), amount(totals.parts), amount(totals.vat), amount(totals.total), billed ? "Yes" : "No", job.convertedInvoiceNo || "",
    ]),
    ["Total (cancelled left out)", `${k.jobs} job(s)`, "", "", "", "", "", "", "", amount(k.services), amount(k.parts), amount(k.vat), amount(k.total), `${k.billedJobs} billed`, ""],
  ];
}

export const jobReportFileName = (from, to) => `job-report-${from || "start"}-${to || "today"}.csv`;

/** Problems in the service charge master: names used twice and services without a charge. */
export function serviceIssues(services) {
  const seen = new Map();
  (services || []).forEach((s) => { const k = lc(s?.name); if (k) seen.set(k, (seen.get(k) || 0) + 1); });
  const duplicates = new Set([...seen.entries()].filter(([, c]) => c > 1).map(([k]) => k));
  const noCharge = (services || []).filter((s) => String(s?.name || "").trim() && !(parseFloat(String(s.charge ?? "").replace(/,/g, "")) > 0)).length;
  return { duplicates, noCharge, isDuplicate: (s) => duplicates.has(lc(s?.name)) };
}
