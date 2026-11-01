// Privilege matrix: the existing permission keys arranged by module and action.
// The keys themselves are what the app (can()) and the server (memberMay) enforce,
// so a cell that shares a key with its neighbour is one switch shown across columns.

export const MATRIX_ACTIONS = [
  { key: "view", bn: "দেখা", en: "View" },
  { key: "add", bn: "যোগ", en: "Add" },
  { key: "edit", bn: "এডিট", en: "Edit" },
  { key: "del", bn: "বাতিল / মুছা", en: "Cancel / Delete" },
  { key: "print", bn: "প্রিন্ট", en: "Print" },
];

export const MATRIX_GROUPS = [
  { key: "masters", bn: "মাস্টার", en: "Masters" },
  { key: "transactions", bn: "লেনদেন", en: "Transactions" },
  { key: "accounts", bn: "হিসাব", en: "Accounts" },
];

const MATRIX_ROW_DEFS = [
  { key: "products", group: "masters", bn: "পণ্য", en: "Products", view: "viewProducts", add: "manageProducts", edit: "manageProducts", del: "deleteProducts", print: "printProducts" },
  { key: "customers", group: "masters", bn: "কাস্টমার", en: "Customers", view: "manageCustomers", add: "manageCustomers", edit: "manageCustomers", del: "deleteCustomers", print: "printCustomers",
    extras: [{ key: "viewCustomerBalance", bn: "বাকি / লেজার", en: "Balance / ledger" }] },
  { key: "vendors", group: "masters", bn: "সাপ্লায়ার", en: "Suppliers", view: "viewVendors", add: "manageVendors", edit: "manageVendors", del: "deleteVendors", print: "printVendors",
    extras: [{ key: "viewSupplierLedger", bn: "লেজার", en: "Ledger" }] },
  { key: "companies", group: "masters", bn: "কোম্পানি (অর্ডার)", en: "Companies (orders)", view: "manageCompanies", add: "manageCompanies", edit: "manageCompanies", del: "deleteCompanies", print: "printCompanies" },
  { key: "employees", group: "masters", bn: "কর্মচারী ও হাজিরা", en: "Employees & attendance", view: "manageEmployees", add: "manageEmployees", edit: "manageEmployees", del: "deleteEmployees", print: "printEmployees" },

  { key: "orders", group: "transactions", bn: "অর্ডার", en: "Orders", view: "sendOrder", add: "sendOrder", edit: "setStatus", del: "deleteOrder", print: "printOrders",
    extras: [{ key: "setPrices", bn: "দাম", en: "Prices" }, { key: "markDelivery", bn: "ডেলিভারি", en: "Delivery" }] },
  { key: "sales", group: "transactions", bn: "বিক্রয় (ইনভয়েস, কোটেশন, অর্ডার)", en: "Sales (invoice, quote, order)", view: "manageSales", add: "manageSales", edit: "manageSales", del: "cancelInvoices", print: "printSales",
    extras: [{ key: "giveDiscount", bn: "ডিসকাউন্ট", en: "Discount" }] },
  { key: "purchase", group: "transactions", bn: "ক্রয় (ইনভয়েস, PO, রিসিভ)", en: "Purchase (invoice, PO, receive)", view: "managePurchase", add: "managePurchase", edit: "managePurchase", del: "deletePurchase", print: "printPurchase" },
  { key: "returns", group: "transactions", bn: "সেলস / পারচেজ রিটার্ন", en: "Sales / purchase returns", view: "manageReturns", add: "manageReturns", edit: "manageReturns", del: "deleteReturns", print: "printReturns" },
  { key: "stock", group: "transactions", bn: "স্টক সমন্বয় ও গণনা", en: "Stock adjust & count", view: "stockAdjust", add: "stockAdjust", edit: "stockAdjust", del: "deleteStock", print: "printStock" },
  { key: "branch", group: "transactions", bn: "Branch ট্রান্সফার", en: "Branch transfer", view: "sendBranchTransfer", add: "sendBranchTransfer", edit: "sendBranchTransfer", del: "deleteBranch", print: "printBranch",
    extras: [{ key: "receiveBranchTransfer", bn: "রিসিভ", en: "Receive" }] },
  { key: "jobs", group: "transactions", bn: "জব কার্ড", en: "Job cards", view: "manageJobs", add: "manageJobs", edit: "manageJobs", del: "deleteJobs", print: "printJobs" },

  { key: "supplierPay", group: "accounts", bn: "সাপ্লায়ার পেমেন্ট", en: "Supplier payments", view: "vendorPayments", add: "vendorPayments", edit: "vendorPayments", del: "deletePayments", print: "printPayments" },
  { key: "expenses", group: "accounts", bn: "দোকানের খরচ", en: "Shop expenses", view: "manageExpenses", add: "manageExpenses", edit: "manageExpenses", del: "deleteExpenses", print: "printExpenses" },
  { key: "vouchers", group: "accounts", bn: "জার্নাল / কন্ট্রা", en: "Journal / contra", view: "accountVouchers", add: "accountVouchers", edit: "accountVouchers", del: "deleteVouchers", print: "printVouchers" },
  { key: "pdc", group: "accounts", bn: "PDC চেক", en: "PDC cheques", view: "managePdc", add: "managePdc", edit: "managePdc", del: "deletePdc", print: "printPdc" },
  { key: "cheque", group: "accounts", bn: "চেক প্রিন্টার", en: "Cheque printer", print: "printCheques" },
  { key: "bankRec", group: "accounts", bn: "ব্যাংক মেলানো", en: "Bank reconciliation", view: "bankReconcile", add: "bankReconcile", edit: "bankReconcile", del: "deleteBankRec", print: "printBankRec" },
  { key: "securityCheque", group: "accounts", bn: "সিকিউরিটি চেক", en: "Security cheques", view: "manageSecurityCheques", add: "manageSecurityCheques", edit: "manageSecurityCheques", del: "deleteSecurityCheques", print: "printSecurityCheques" },
  { key: "pnl", group: "accounts", bn: "হিসাব নিকাশ / লাভ-ক্ষতি", en: "Accounts / P&L", view: "viewAccounts", print: "printAccounts" },
  { key: "tax", group: "accounts", bn: "ট্যাক্স / VAT", en: "Tax / VAT", view: "viewTax", print: "printTax" },
  { key: "partners", group: "accounts", bn: "পার্টনার", en: "Partners", view: "viewPartners", add: "managePartners", edit: "managePartners", del: "deletePartners", print: "printPartners" },
  { key: "ledger", group: "accounts", bn: "গ্লোবাল লেজার", en: "Global ledger", view: "viewGlobalLedger", print: "printLedger" },
  { key: "audit", group: "accounts", bn: "অডিট লগ", en: "Audit log", view: "viewAuditLog", print: "printAudit" },
  { key: "backup", group: "accounts", bn: "ব্যাকআপ ও রিস্টোর", en: "Backup & restore", view: "manageBackup" },
];

function primaryActionKey(row) {
  return row.view || row.add || row.edit || row.del || row.print || "";
}

export function completeMatrixRow(row) {
  const fallback = primaryActionKey(row);
  const out = { ...row };
  for (const a of MATRIX_ACTIONS) if (!out[a.key]) out[a.key] = fallback;
  return out;
}

export const MATRIX_ROWS = MATRIX_ROW_DEFS.map(completeMatrixRow);

export const OWNER_ONLY_AREAS = {
  bn: "মালিকের পিন, ইউজার গ্রুপ ও ইনভাইট শুধু মালিকের। বাকি সব টিক মালিক যাকে খুশি দিতে পারেন।",
  en: "Owner PIN, user groups and invites stay with the owner. Every other tick the owner can grant to anyone.",
};

// Cells of one row merged into spans of the same key: [{ key, from, span }]
export function rowSpans(row) {
  const out = [];
  MATRIX_ACTIONS.forEach((a, i) => {
    const key = row[a.key] || "";
    const last = out[out.length - 1];
    if (key && last && last.key === key && last.from + last.span === i) last.span += 1;
    else out.push({ key, from: i, span: 1 });
  });
  return out;
}

export function matrixKeys() {
  const keys = new Set();
  for (const row of MATRIX_ROWS) {
    for (const a of MATRIX_ACTIONS) if (row[a.key]) keys.add(row[a.key]);
    for (const x of row.extras || []) keys.add(x.key);
  }
  return [...keys];
}

function allOff() {
  return Object.fromEntries(matrixKeys().map((k) => [k, false]));
}

function on(...keys) {
  return { ...allOff(), ...Object.fromEntries(keys.map((k) => [k, true])) };
}

export const GROUP_PRESETS = [
  { id: "preset_salesman", bn: "সেলসম্যান", en: "Salesman",
    permissions: on("sendOrder", "viewProducts", "manageSales", "printSales", "manageCustomers", "printCustomers") },
  { id: "preset_cashier", bn: "ক্যাশিয়ার", en: "Cashier",
    permissions: on("viewProducts", "manageSales", "printSales", "manageCustomers", "printCustomers", "viewCustomerBalance", "giveDiscount", "manageReturns", "manageExpenses") },
  { id: "preset_store", bn: "স্টোর কিপার", en: "Store keeper",
    permissions: on("viewProducts", "manageProducts", "managePurchase", "printPurchase", "viewVendors", "stockAdjust", "sendBranchTransfer", "receiveBranchTransfer") },
  { id: "preset_accountant", bn: "হিসাবরক্ষক", en: "Accountant",
    permissions: on("viewProducts", "viewVendors", "viewSupplierLedger", "vendorPayments", "managePdc", "manageExpenses", "printCheques", "viewCustomerBalance", "accountVouchers", "bankReconcile", "manageCustomers", "manageSecurityCheques") },
  { id: "preset_manager", bn: "ম্যানেজার", en: "Manager",
    permissions: Object.fromEntries(matrixKeys().map((k) => [k, true])) },
];

export function userGroupsOf(shop) {
  const list = Array.isArray(shop?.userGroups) ? shop.userGroups : [];
  return list.filter((g) => g && g.id && g.name);
}

export function groupPermissions(group, defaults = {}) {
  return { ...defaults, ...allOff(), ...(group?.permissions || {}) };
}

export function samePermissions(a = {}, b = {}) {
  return matrixKeys().every((k) => (a[k] === true) === (b[k] === true));
}

// The member still follows their group only while their switches match it.
export function memberGroupState(member, groups) {
  const g = groups.find((x) => x.id === member?.groupId);
  if (!g) return { group: null, custom: false };
  return { group: g, custom: !samePermissions(member?.permissions || {}, g.permissions || {}) };
}

export function countOn(perms = {}) {
  return matrixKeys().filter((k) => perms[k] === true).length;
}

export function setMatrixFlags(on, base = {}) {
  return { ...base, ...Object.fromEntries(matrixKeys().map((k) => [k, on === true])) };
}

export function presetNameSet(preset) {
  return new Set([preset?.bn, preset?.en].map((n) => String(n || "").trim().toLowerCase()).filter(Boolean));
}

export function unusedGroupPresets(groups = []) {
  return GROUP_PRESETS.filter((p) => {
    const names = presetNameSet(p);
    return !groups.some((g) => names.has(String(g.name || "").trim().toLowerCase()));
  });
}

export function groupDraftDirty(draft, groups = [], defaults = {}) {
  if (!draft) return false;
  if (draft.isNew) {
    const named = String(draft.name || "").trim().length > 0;
    const vsEmpty = !samePermissions(draft.permissions, groupPermissions({ permissions: defaults }, defaults));
    return named || vsEmpty;
  }
  const saved = groups.find((g) => g.id === draft.id);
  if (!saved) return true;
  if (String(draft.name || "").trim() !== String(saved.name || "").trim()) return true;
  return !samePermissions(draft.permissions, groupPermissions(saved, defaults));
}
