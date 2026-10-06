import { offlineGetById, offlineUpdate, offlineUpsert } from "../offline/offlineRepository";

// A party's opening balance lives in the ledger as one item-less bill, so receipts/payments can settle it.
const KINDS = {
  vendors: {
    collection: "purchaseInvoices", idPrefix: "vendor-opening-",
    idField: "vendorId", nameField: "vendorName", mobileField: "vendorMobile",
    partyName: (p) => p.vendorName, code: (p) => p.vendorCode,
    extra: { supplierInvoiceNo: "OPENING", totalTax: 0 },
  },
  customers: {
    collection: "salesInvoices", idPrefix: "customer-opening-",
    idField: "customerId", nameField: "customerName", mobileField: "customerMobile",
    partyName: (p) => p.customerName, code: (p) => p.customerCode,
    extra: { invoiceType: "regular", totalVat: 0, customerAddress: "", customerTrn: "" },
  },
};

const num = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export const openingBillId = (kind, partyId) => `${KINDS[kind].idPrefix}${partyId}`;
export const isOpeningBill = (inv) => inv?.source === "openingBalance";

// Creates/updates/cancels the opening bill. Throws when the new amount is below what was already paid.
export async function syncOpeningBill({ kind, partyId, party, shopId, uid, actorName = "", bn = false }) {
  const k = KINDS[kind];
  const amount = Math.max(0, Number(num(party.openingBalance).toFixed(2)));
  const id = openingBillId(kind, partyId);
  const existing = (await offlineGetById(k.collection, id))?.data || null;
  const live = existing && existing.status !== "cancelled";
  if (!live && amount <= 0) return false;
  const paid = live ? num(existing.amountPaid) : 0;
  if (amount < paid - 0.01) {
    throw new Error(bn
      ? `Opening balance থেকে আগেই ${paid.toFixed(2)} পরিশোধ হয়েছে — এর কম করা যাবে না`
      : `${paid.toFixed(2)} of the opening balance is already paid — it cannot go below that`);
  }
  const now = new Date().toISOString();
  const balanceDue = Math.max(0, Number((amount - paid).toFixed(2)));
  const fields = {
    shopId,
    [k.idField]: partyId,
    [k.nameField]: k.partyName(party) || "",
    [k.mobileField]: party.mobileNumber || party.whatsappNumber || "",
    subtotal: amount, totalDiscount: 0, grandTotal: amount,
    amountPaid: paid, balanceDue,
    status: amount <= 0 ? "cancelled" : balanceDue < 0.01 ? "paid" : paid > 0 ? "partial" : "confirmed",
    updatedAt: now,
    updatedBy: uid,
  };
  if (existing) {
    await offlineUpdate(k.collection, id, { ...existing, ...fields });
    return true;
  }
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await offlineUpsert(k.collection, id, {
    ...k.extra,
    ...fields,
    invoiceNo: `OB-${k.code(party) || String(partyId).slice(-6).toUpperCase()}`,
    invoiceDate: today,
    items: [],
    paymentMethod: "credit",
    note: "Opening balance",
    source: "openingBalance",
    createdBy: uid,
    createdByName: actorName,
    createdAt: now,
  });
  return true;
}
