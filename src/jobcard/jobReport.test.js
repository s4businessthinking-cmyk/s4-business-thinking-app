import test from "node:test";
import assert from "node:assert/strict";
import { buildJobReport, isBilled, jobReportFileName, jobReportRows, serviceIssues } from "./jobReport.js";

const job = (id, jobDate, extra = {}) => ({ id, jobNo: id, jobDate, shopId: "s1", status: "inProgress", customerName: "Al Noor", technicianId: "t1", technicianName: "Rafiq", services: [], parts: [], ...extra });
const jobs = [
  job("JO-1", "2026-11-02", { services: [{ name: "Oil change", qty: 1, charge: 50, vatPerc: 5 }], parts: [{ name: "Filter", qty: 2, unitPrice: 20, vatPerc: 5 }], status: "invoiced", convertedInvoiceNo: "SI-0101" }),
  job("JO-2", "2026-11-05", { services: [{ name: "Diagnosis", qty: 1, charge: 100, vatPerc: 0 }], customerName: "Star Garage", vehicleNo: "D 12345", technicianId: "t2", technicianName: "Karim", status: "completed" }),
  job("JO-3", "2026-11-06", { services: [{ name: "Wash", charge: 30, vatPerc: 5 }], status: "cancelled" }),
  job("JO-4", "2026-10-28", { services: [{ name: "Wash", charge: 30, vatPerc: 5 }] }),
  job("JO-5", "2026-11-07", { isDeleted: true }),
];
const NOV = { from: "2026-11-01", to: "2026-11-30" };

test("totals per job from jobTotals; cancelled listed but not counted", () => {
  const r = buildJobReport(jobs, NOV);
  assert.deepEqual(r.rows.map((x) => [x.job.jobNo, x.totals.total, x.billed, x.cancelled]), [["JO-1", 94.5, true, false], ["JO-2", 100, false, false], ["JO-3", 31.5, false, true]]);
  assert.deepEqual(r.kpi, { jobs: 2, cancelled: 1, services: 150, parts: 40, vat: 4.5, total: 194.5, billedJobs: 1, billedTotal: 94.5, unbilledJobs: 1, unbilledTotal: 100 });
});

test("breakdowns by technician and status", () => {
  const r = buildJobReport(jobs, NOV);
  assert.deepEqual(r.byTechnician.map((t) => [t.name, t.jobs, t.services, t.parts, t.total]), [["Karim", 1, 100, 0, 100], ["Rafiq", 1, 50, 40, 94.5]]);
  assert.deepEqual(r.byStatus.find((s) => s.key === "cancelled"), { key: "cancelled", jobs: 1, total: 0 });
});

test("filters: date, status, billed / unbilled, technician, search", () => {
  assert.equal(buildJobReport(jobs, {}).rows.length, 4);
  assert.deepEqual(buildJobReport(jobs, { ...NOV, status: "billed" }).rows.map((x) => x.job.jobNo), ["JO-1"]);
  assert.deepEqual(buildJobReport(jobs, { ...NOV, status: "unbilled" }).rows.map((x) => x.job.jobNo), ["JO-2"]);
  assert.deepEqual(buildJobReport(jobs, { ...NOV, status: "completed" }).rows.map((x) => x.job.jobNo), ["JO-2"]);
  assert.deepEqual(buildJobReport(jobs, { ...NOV, technicianId: "t2" }).rows.map((x) => x.job.jobNo), ["JO-2"]);
  assert.deepEqual(buildJobReport(jobs, { ...NOV, query: "d 123" }).rows.map((x) => x.job.jobNo), ["JO-2"]);
  assert.deepEqual(buildJobReport(jobs, { query: "si-0101" }).rows.map((x) => x.job.jobNo), ["JO-1"]);
  assert.equal(isBilled({ status: "invoiced" }), true);
});

test("CSV rows: fixed headers, plain numbers, invoice no, total line", () => {
  const rows = jobReportRows(buildJobReport(jobs, NOV), (k) => ({ invoiced: "Invoiced" })[k] || k);
  assert.equal(rows[0][1], "Job No");
  assert.deepEqual(rows[1].slice(8), ["Invoiced", "50.00", "40.00", "4.50", "94.50", "Yes", "SI-0101"]);
  assert.deepEqual(rows[rows.length - 1].slice(9, 14), ["150.00", "40.00", "4.50", "194.50", "1 billed"]);
  assert.equal(jobReportFileName("2026-11-01", "2026-11-30"), "job-report-2026-11-01-2026-11-30.csv");
  assert.equal(jobReportFileName("", ""), "job-report-start-today.csv");
});

test("service master checks: duplicate names and missing charge", () => {
  const issues = serviceIssues([{ name: "Oil change", charge: "50" }, { name: " oil change ", charge: "60" }, { name: "Wash", charge: "" }, { name: "", charge: "" }]);
  assert.deepEqual([...issues.duplicates], ["oil change"]);
  assert.equal(issues.noCharge, 1);
  assert.equal(issues.isDuplicate({ name: "OIL CHANGE" }), true);
});
