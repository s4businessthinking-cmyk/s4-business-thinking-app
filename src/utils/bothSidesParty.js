export const BOTH_SIDES_SHARED = [
  "contactPerson", "mobileNumber", "phoneNumber", "whatsappNumber", "fax", "email",
  "address", "emirate", "area", "city", "country", "mapLink",
  "trnNumber", "tradeLicenseNumber", "tinNumber", "binNumber", "vatNumber",
  "bankName", "bankBranch", "accountName", "accountNumber", "ibanNumber", "swiftCode",
  "creditLimit", "paymentTerms", "paymentType", "status", "notes",
];

const digits = (s) => String(s || "").replace(/\D/g, "");
const fold = (s) => String(s || "").trim().toLowerCase();

export function samePartyHint(aName, aMobile, bName, bMobile) {
  const name = fold(aName);
  const mobile = digits(aMobile);
  return !!(name && name === fold(bName) && mobile && mobile === digits(bMobile));
}

export function pickSharedPartyFields(src = {}) {
  return Object.fromEntries(BOTH_SIDES_SHARED.map((k) => [k, src[k] ?? ""]));
}

export function buildVendorFromCustomer(customer = {}) {
  return { vendorName: customer.customerName || "", ...pickSharedPartyFields(customer) };
}

export function buildCustomerFromVendor(vendor = {}) {
  return { customerName: vendor.vendorName || "", ...pickSharedPartyFields(vendor) };
}

export function findLinkedOther(list = [], { sourceId, linkedId, name, mobile, nameKey, linkKey }) {
  if (linkedId) {
    const hit = list.find((row) => row.id === linkedId);
    if (hit) return hit;
  }
  return list.find((row) => {
    const already = row?.[linkKey];
    if (already && already !== sourceId) return false;
    return samePartyHint(name, mobile, row?.[nameKey], row?.mobileNumber || row?.phoneNumber);
  }) || null;
}

// Uncheck must only touch the already-linked row. Name+mobile match is only for linking.
export function resolveOtherParty({ wantBoth, sourceId, linkedId, name, mobile, list = [], nameKey, linkKey }) {
  if (linkedId) {
    const hit = list.find((row) => row.id === linkedId);
    if (hit) return hit;
  }
  if (!wantBoth) return null;
  return findLinkedOther(list, { sourceId, linkedId: "", name, mobile, nameKey, linkKey });
}

async function partyRepo() {
  return import("../offline/offlineRepository.js");
}

async function partyIsUsed(kind, shopId, id) {
  if (!id) return false;
  const { offlineList } = await partyRepo();
  const specs = kind === "customers"
    ? [
      ["salesInvoices", "customerId"], ["salesReceipts", "customerId"],
      ["quotations", "customerId"], ["salesOrders", "customerId"], ["deliveryNotes", "customerId"],
      ["securityCheques", "partyId", (d) => d.partyType === "customer"],
    ]
    : [
      ["purchaseInvoices", "vendorId"], ["purchasePayments", "vendorId"],
      ["purchaseOrders", "vendorId"], ["goodsReceipts", "vendorId"],
      ["securityCheques", "partyId", (d) => d.partyType === "vendor"],
    ];
  const packs = await Promise.all(specs.map(([col]) => offlineList(col).catch(() => ({ records: [] }))));
  return packs.some((pack, i) => {
    const [, field, extra] = specs[i];
    return (pack.records || []).some((r) => {
      const d = r.data || r;
      if (d.shopId !== shopId || d[field] !== id) return false;
      if (d.status === "cancelled" || d.isDeleted) return false;
      return extra ? extra(d) : true;
    });
  });
}

export async function syncBothSidesParty({
  from, wantBoth, sourceId, sourceDoc, otherList = [], shopId, user, nextOtherCode,
}) {
  const toVendor = from === "customer";
  const otherKind = toVendor ? "vendors" : "customers";
  const linkOnSource = toVendor ? "linkedVendorId" : "linkedCustomerId";
  const linkOnOther = toVendor ? "linkedCustomerId" : "linkedVendorId";
  const nameKey = toVendor ? "vendorName" : "customerName";
  const sourceName = toVendor ? sourceDoc.customerName : sourceDoc.vendorName;
  let other = resolveOtherParty({
    wantBoth, sourceId, linkedId: sourceDoc[linkOnSource], name: sourceName,
    mobile: sourceDoc.mobileNumber || sourceDoc.phoneNumber,
    list: otherList, nameKey, linkKey: linkOnOther,
  });
  const { offlineCreate, offlineGetById, offlineRemove, offlineUpdate } = await partyRepo();
  if (!other && sourceDoc[linkOnSource]) {
    const got = await offlineGetById(otherKind, sourceDoc[linkOnSource]).catch(() => null);
    if (got?.data) other = { ...got.data, id: sourceDoc[linkOnSource] };
  }

  const now = new Date().toISOString();
  const actor = { updatedBy: user?.uid || "", updatedAt: now };

  if (!wantBoth) {
    if (!other?.id) return { sourcePatch: { [linkOnSource]: "" }, other: null, removedId: null };
    if (await partyIsUsed(otherKind, shopId, other.id)) {
      const result = await offlineUpdate(otherKind, other.id, { [linkOnOther]: "", ...actor });
      return { sourcePatch: { [linkOnSource]: "" }, other: { ...result.data, id: other.id }, removedId: null, keptBecauseUsed: true };
    }
    await offlineRemove(otherKind, other.id);
    return { sourcePatch: { [linkOnSource]: "" }, other: null, removedId: other.id };
  }

  const body = {
    shopId,
    ...(toVendor ? buildVendorFromCustomer(sourceDoc) : buildCustomerFromVendor(sourceDoc)),
    [linkOnOther]: sourceId,
    ...actor,
  };

  if (other?.id) {
    const result = await offlineUpdate(otherKind, other.id, body);
    return { sourcePatch: { [linkOnSource]: other.id }, other: { ...result.data, id: other.id }, removedId: null };
  }
  if (nextOtherCode) {
    if (toVendor) body.vendorCode = await nextOtherCode();
    else { body.customerCode = await nextOtherCode(); body.customerType = "Customer"; }
  }
  const result = await offlineCreate(otherKind, { ...body, createdBy: user?.uid || "", createdAt: now });
  return { sourcePatch: { [linkOnSource]: result.documentId }, other: { ...result.data, id: result.documentId }, removedId: null };
}
