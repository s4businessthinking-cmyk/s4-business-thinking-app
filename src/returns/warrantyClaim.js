const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const q4 = (v) => parseFloat(n2(v).toFixed(4));

export const WARRANTY_META = { prefix: "WC", serial: "lastWCSerial" };

/** Customer return → company → new product. Stock only rises at "replaced", then falls at "delivered". */
export const WARRANTY_STATUSES = {
  received: { key: "received", bn: "কাস্টমার থেকে নিয়েছি", en: "Received from customer", tone: "#b45309" },
  sent: { key: "sent", bn: "কোম্পানিতে পাঠানো", en: "Sent to company", tone: "#1d4ed8" },
  replaced: { key: "replaced", bn: "কোম্পানি নতুন দিয়েছে", en: "Company replaced", tone: "#15803d" },
  delivered: { key: "delivered", bn: "কাস্টমারকে দিয়েছি", en: "Given to customer", tone: "#0f766e" },
  cancelled: { key: "cancelled", bn: "বাতিল", en: "Cancelled", tone: "#6b7280" },
};

export const WARRANTY_REASONS = [
  { key: "battery", bn: "ব্যাটারি গ্যারান্টি", en: "Battery guarantee" },
  { key: "product", bn: "পণ্য গ্যারান্টি", en: "Product guarantee" },
  { key: "fitting", bn: "ফিটিং / মডেল ভুল", en: "Fitting / wrong model" },
  { key: "other", bn: "অন্যান্য", en: "Other" },
];

export const REMINDER_DAY_PRESETS = [3, 7, 10, 15, 30, 45, 60];

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function addDaysYmd(day, n) {
  const [y, m, d] = String(day || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + Number(n || 0));
  return ymd(dt);
}

export function warrantyStatusLabel(status, bn = false) {
  const row = WARRANTY_STATUSES[status] || WARRANTY_STATUSES.received;
  return row[bn ? "bn" : "en"];
}

export function warrantyReasonLabel(key, bn = false) {
  const row = WARRANTY_REASONS.find((r) => r.key === key) || WARRANTY_REASONS[WARRANTY_REASONS.length - 1];
  return row[bn ? "bn" : "en"];
}

/** Live shop stock effect: only "replaced" (new unit waiting at shop) adds qty. */
export function warrantyStockQty(claim) {
  if (!claim || claim.status !== "replaced" || claim.isDeleted || claim.deleted) return 0;
  const q = n2(claim.qty);
  return q4(Math.max(0, q > 0 ? q : 0));
}

export function warrantyStockProductId(claim) {
  return claim?.replacedProductId || claim?.productId || null;
}

export function canAdvance(status, action) {
  const map = {
    received: ["send", "cancel"],
    sent: ["replace", "cancel"],
    replaced: ["deliver", "cancel"],
    delivered: [],
    cancelled: [],
  };
  return (map[status] || []).includes(action);
}

export function buildWarrantyReminder({ claim, claimNo, dueDate, shopId, user, profile }) {
  const at = new Date().toISOString();
  const product = claim.productName || claim.productCode || "Product";
  const company = claim.vendorName || "Company";
  const title = `গ্যারান্টি চেঞ্জ বাকি · ${claimNo} · ${product}`;
  const note = [
    `${company} থেকে নতুন পণ্য এখনো আসেনি`,
    claim.customerName ? `কাস্টমার: ${claim.customerName}` : "",
    claim.customerMobile ? claim.customerMobile : "",
    "কোম্পানিতে ফলো-আপ করুন",
  ].filter(Boolean).join(" · ");
  return {
    title,
    note,
    dueDate: String(dueDate || "").slice(0, 10),
    dueTime: "09:00",
    repeat: "none",
    remindBefore: 1,
    assignedTo: "",
    assignedToName: "",
    private: false,
    status: "open",
    shopId,
    createdAt: at,
    updatedAt: at,
    createdBy: user?.uid || "",
    updatedBy: user?.uid || "",
    createdByName: profile?.personName || profile?.username || "",
    linkType: "warrantyClaim",
    linkId: claim.id || "",
    linkLabel: claimNo,
  };
}

/** Loud overdue alerts for claims still with the company past reminderDueDate. */
export function warrantyOverdueAlerts(claims = [], today) {
  const day = String(today || "").slice(0, 10);
  return (claims || [])
    .filter((c) => c && c.status === "sent" && !c.isDeleted && !c.deleted)
    .filter((c) => {
      const due = String(c.reminderDueDate || "").slice(0, 10);
      return due && due <= day;
    })
    .map((c) => {
      const due = String(c.reminderDueDate || "").slice(0, 10);
      const late = due < day;
      return {
        key: `wc-${c.id}-${due}`,
        id: c.id,
        claimNo: c.claimNo || "",
        productName: c.productName || "",
        vendorName: c.vendorName || "",
        customerName: c.customerName || "",
        reminderDueDate: due,
        late,
        tone: "danger",
        state: late ? "overdue" : "today",
      };
    })
    .sort((a, b) => String(a.reminderDueDate).localeCompare(String(b.reminderDueDate)));
}

export function warrantyAlertText(a, bn = false) {
  const when = String(a.reminderDueDate || "").split("-").reverse().join("/");
  const late = a.state === "overdue"
    ? (bn ? "সময় পার — কোম্পানি থেকে চেঞ্জ আনেননি" : "OVERDUE — company has not replaced yet")
    : (bn ? "আজ কোম্পানি থেকে চেঞ্জ নিন" : "Get the company replacement TODAY");
  return {
    icon: "",
    title: bn
      ? `গ্যারান্টি চেঞ্জ বাকি · ${a.claimNo || ""}`
      : `Warranty change pending · ${a.claimNo || ""}`,
    sub: `${late} · ${a.productName || "—"}${a.vendorName ? ` · ${a.vendorName}` : ""} · ${when}`,
  };
}

export function claimSummary(c) {
  const q = q4(n2(c?.qty) || 1);
  const bill = c?.invoiceNo ? ` · ${c.invoiceNo}` : "";
  return `${c?.productName || "?"} × ${q}${c?.vendorName ? ` → ${c.vendorName}` : ""}${c?.customerName ? ` · ${c.customerName}` : ""}${bill}`;
}

/** Live sales bills that can back a warranty claim (BW01). */
export const WARRANTY_SOURCE_INV_STATUSES = ["confirmed", "partial", "paid"];

export function invoiceHasProduct(inv, productId) {
  if (!inv || !productId) return false;
  return (inv.items || []).some((it) => it && it.productId === productId);
}

/**
 * Sales invoices that sold this product (optional customer filter). Newest first.
 * Skips delivery notes / quotes / sales orders / cancelled / draft.
 */
export function warrantyCandidateInvoices({
  invoices = [], productId, customerId = null, customerName = "", limit = 25,
} = {}) {
  if (!productId) return [];
  const name = String(customerName || "").trim().toLowerCase();
  return (invoices || [])
    .filter((inv) => inv && !inv.isDeleted && !inv.deleted)
    .filter((inv) => WARRANTY_SOURCE_INV_STATUSES.includes(inv.status))
    .filter((inv) => {
      const kind = String(inv.docKind || "");
      if (kind === "quotation" || kind === "salesOrder" || kind === "delivery") return false;
      if (inv.invoiceType === "delivery") return false;
      return true;
    })
    .filter((inv) => invoiceHasProduct(inv, productId))
    .filter((inv) => {
      if (customerId) return inv.customerId === customerId;
      if (name) return String(inv.customerName || "").trim().toLowerCase() === name;
      return true;
    })
    .sort((a, b) => String(b.invoiceDate || "").localeCompare(String(a.invoiceDate || "")))
    .slice(0, Math.max(1, limit))
    .map((inv) => ({
      invoiceId: inv.id,
      invoiceNo: inv.invoiceNo || "",
      invoiceDate: String(inv.invoiceDate || "").slice(0, 10),
      customerId: inv.customerId || null,
      customerName: inv.customerName || "",
      customerMobile: inv.customerMobile || "",
    }));
}

/** Short label for linked bill on claim UI / print. */
export function claimInvoiceLabel(claim, bn = false) {
  if (!claim?.invoiceId && !claim?.invoiceNo) return "";
  const no = claim.invoiceNo || "—";
  const d = String(claim.invoiceDate || "").slice(0, 10);
  const dd = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d;
  return bn ? `বিল ${no}${dd ? ` · ${dd}` : ""}` : `Bill ${no}${dd ? ` · ${dd}` : ""}`;
}

/** Fields stored on warrantyClaims for BW01. */
export function claimInvoiceFields(link) {
  if (!link?.invoiceId && !link?.invoiceNo) {
    return { invoiceId: null, invoiceNo: "", invoiceDate: "" };
  }
  return {
    invoiceId: link.invoiceId || null,
    invoiceNo: link.invoiceNo || "",
    invoiceDate: String(link.invoiceDate || "").slice(0, 10),
  };
}

/** BW02: common battery/product guarantee lengths (months). */
export const WARRANTY_MONTH_PRESETS = [3, 6, 12, 18, 24, 36];

export function addMonthsYmd(day, months) {
  const [y, m, d] = String(day || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d);
  const dayNum = dt.getDate();
  dt.setMonth(dt.getMonth() + Number(months || 0));
  // clamp end-of-month (e.g. Jan 31 + 1 month)
  if (dt.getDate() < dayNum) dt.setDate(0);
  return ymd(dt);
}

/** Default months from product master if set, else battery 12 / other 6. */
export function productWarrantyMonths(product, reason = "battery") {
  const fromProd = Number(product?.warrantyMonths ?? product?.guaranteeMonths ?? 0);
  if (fromProd > 0) return Math.min(120, Math.round(fromProd));
  return reason === "battery" ? 12 : 6;
}

/**
 * Warranty window from sale (or claim) date + months.
 * expired = asOf (claim day) is after end date.
 */
export function warrantyWindow({ saleDate = "", claimDate = "", months = 0 } = {}) {
  const start = String(saleDate || claimDate || "").slice(0, 10);
  const mo = Math.max(0, Number(months) || 0);
  if (!start || !mo) return { start: start || "", end: "", expired: false, months: mo };
  const end = addMonthsYmd(start, mo);
  const asOf = String(claimDate || start).slice(0, 10);
  const expired = !!(end && asOf && asOf > end);
  return { start, end, expired, months: mo };
}

/** Persist BW02 fields on the claim. */
export function claimWarrantyPeriodFields({ saleDate, claimDate, months }) {
  const win = warrantyWindow({ saleDate, claimDate, months });
  return {
    warrantyMonths: win.months || 0,
    warrantyStartDate: win.start || "",
    warrantyEndDate: win.end || "",
    warrantyExpiredAtOpen: !!win.expired,
  };
}

/** BW11: parse Ah from product fields / name (e.g. "70Ah", "70 AH", specs.ah). */
export function parseBatteryAh(...sources) {
  for (const src of sources) {
    if (src == null || src === "") continue;
    if (typeof src === "number" && Number.isFinite(src) && src > 0) return Math.round(src);
    const s = String(src);
    const m = s.match(/(\d{1,4})\s*(?:ah|a\.?h\.?|amp(?:ere)?(?:s)?(?:[\s-]?hour)?)/i)
      || s.match(/\bah\s*[:=]?\s*(\d{1,4})\b/i);
    if (m) {
      const n = Number(m[1]);
      if (n > 0 && n <= 2000) return n;
    }
  }
  return null;
}

export function productBatteryAh(product) {
  if (!product) return null;
  return parseBatteryAh(
    product.batteryAh, product.ah, product.capacityAh,
    product.specs?.ah, product.specs?.batteryAh,
    product.name, product.code, product.model,
  );
}

export function productBatteryBrand(product) {
  if (!product) return "";
  return String(product.brand || product.company || product.make || "").trim();
}

/** Fields stored on warrantyClaims for BW11. */
export function claimBatteryFields({ ah, brand } = {}) {
  const n = ah == null || ah === "" ? null : Number(ah);
  return {
    batteryAh: Number.isFinite(n) && n > 0 ? Math.min(2000, Math.round(n)) : null,
    batteryBrand: String(brand || "").trim(),
  };
}
