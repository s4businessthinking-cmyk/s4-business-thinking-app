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
  const title = `🔋 গ্যারান্টি চেঞ্জ বাকি · ${claimNo} · ${product}`;
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
    icon: "🔋",
    title: bn
      ? `গ্যারান্টি চেঞ্জ বাকি · ${a.claimNo || ""}`
      : `Warranty change pending · ${a.claimNo || ""}`,
    sub: `${late} · ${a.productName || "—"}${a.vendorName ? ` · ${a.vendorName}` : ""} · ${when}`,
  };
}

export function claimSummary(c) {
  const q = q4(n2(c?.qty) || 1);
  return `${c?.productName || "?"} × ${q}${c?.vendorName ? ` → ${c.vendorName}` : ""}${c?.customerName ? ` · ${c.customerName}` : ""}`;
}
