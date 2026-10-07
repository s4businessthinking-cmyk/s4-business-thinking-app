const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
export const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;

/** Workflow stages a job moves through; "invoiced" and "cancelled" are set by the system and always exist. */
export const DEFAULT_STATUSES = [
  { key: "received", bn: "জমা নেওয়া হয়েছে", en: "Received", color: "#2563eb" },
  { key: "inspecting", bn: "পরীক্ষা চলছে", en: "Inspecting", color: "#7c3aed" },
  { key: "waitingParts", bn: "পার্টসের অপেক্ষায়", en: "Waiting for parts", color: "#b45309" },
  { key: "inProgress", bn: "কাজ চলছে", en: "In progress", color: "#0e7490" },
  { key: "completed", bn: "কাজ শেষ", en: "Completed", color: "#15803d", done: true },
  { key: "delivered", bn: "ফেরত দেওয়া হয়েছে", en: "Delivered", color: "#4d7c0f", done: true },
];
export const SYSTEM_STATUSES = [
  { key: "invoiced", bn: "বিল হয়েছে", en: "Invoiced", color: "#166534", done: true, system: true },
  { key: "cancelled", bn: "বাতিল", en: "Cancelled", color: "#6b7280", system: true },
];

export const DEFAULT_WARRANTIES = [
  { id: "none", name: "No warranty", days: 0 },
  { id: "w7", name: "7 days", days: 7 },
  { id: "w30", name: "1 month", days: 30 },
  { id: "w90", name: "3 months", days: 90 },
];

export function jobSettingsOf(shop) {
  const s = shop?.jobCardSettings || {};
  const statuses = Array.isArray(s.statuses) && s.statuses.length ? s.statuses.filter((x) => x?.key && !SYSTEM_STATUSES.some((y) => y.key === x.key)) : DEFAULT_STATUSES;
  return {
    services: Array.isArray(s.services) ? s.services.filter((x) => x?.id && x?.name) : [],
    warranties: Array.isArray(s.warranties) && s.warranties.length ? s.warranties.filter((x) => x?.id) : DEFAULT_WARRANTIES,
    statuses,
    allStatuses: [...statuses, ...SYSTEM_STATUSES],
    defaultWarrantyId: s.defaultWarrantyId || "none",
    showVehicle: s.showVehicle !== false,
    showItem: s.showItem !== false,
    terms: s.terms || "",
    defaultVat: s.defaultVat ?? "",
  };
}

export const statusOf = (settings, key) => settings.allStatuses.find((s) => s.key === key) || { key, bn: key, en: key, color: "#64748b" };
export const isClosed = (job) => job?.status === "invoiced" || job?.status === "cancelled";

const lineNet = (qty, price) => num(qty) * num(price);
export function jobTotals(job) {
  const services = (job?.services || []).reduce((t, s) => t + lineNet(s.qty || 1, s.charge), 0);
  const parts = (job?.parts || []).reduce((t, p) => t + lineNet(p.qty, p.unitPrice), 0);
  const vat = [...(job?.services || []).map((s) => lineNet(s.qty || 1, s.charge) * num(s.vatPerc)), ...(job?.parts || []).map((p) => lineNet(p.qty, p.unitPrice) * num(p.vatPerc))]
    .reduce((t, v) => t + v / 100, 0);
  const sub = services + parts;
  return { services: r2(services), parts: r2(parts), sub: r2(sub), vat: r2(vat), total: r2(sub + vat), balance: r2(sub + vat - num(job?.advance)) };
}

const addDays = (day, days) => {
  const d = new Date(`${String(day).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Warranty runs from the day the job was handed back (delivered or invoiced), else from completion. */
export function warrantyUntil(job) {
  const days = num(job?.warrantyDays);
  if (!(days > 0)) return "";
  const start = job?.deliveredAt || job?.invoicedAt || job?.completedAt || "";
  return start ? addDays(start, days) : "";
}

/** A Sales-Invoice-shaped document the Sales tab can load to bill the job. */
export function jobToInvoiceSource(job, { taxRegistered = true } = {}) {
  const items = [
    ...(job.parts || []).filter((p) => num(p.qty) > 0).map((p) => ({
      productId: p.productId || null, name: p.name || "", code: p.code || "", brand: p.brand || "", qty: num(p.qty), unit: p.unit || "Pcs",
      unitPrice: num(p.unitPrice), discountPerc: 0, vatPerc: taxRegistered ? num(p.vatPerc) : 0,
    })),
    ...(job.services || []).filter((s) => num(s.qty || 1) > 0).map((s) => ({
      productId: null, name: s.name || "Service", code: "", brand: "", qty: num(s.qty || 1), unit: "Job",
      unitPrice: num(s.charge), discountPerc: 0, vatPerc: taxRegistered ? num(s.vatPerc) : 0, isService: true,
    })),
  ];
  const noteParts = [job.itemDesc, job.vehicleModel, job.complaint ? `Complaint: ${job.complaint}` : "", job.warrantyName && num(job.warrantyDays) > 0 ? `Warranty: ${job.warrantyName}` : ""].filter(Boolean);
  return {
    id: job.id, docKind: "jobOrder", invoiceNo: job.jobNo, invoiceType: taxRegistered ? "tax" : "regular",
    customerId: job.customerId || "", customerName: job.customerName || "", customerMobile: job.customerMobile || "", customerAddress: job.customerAddress || "", customerTrn: job.customerTrn || "",
    paymentMethod: "cash", amountPaid: 0, vehicleNo: job.vehicleNo || "", note: noteParts.join(" · "),
    items,
  };
}
