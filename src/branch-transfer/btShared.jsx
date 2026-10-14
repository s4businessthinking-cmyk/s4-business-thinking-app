import { useState, useEffect } from "react";
import { subscribeShopRecords } from "./branchTransferService.js";
import { numberValue, remainingQuantityForLine, receivedQuantityForLine, statusLabel } from "./branchTransferDomain.js";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS } from "../sales-invoice/siSkin";

export const COPY = {
  bn: {
    title: "Branch Stock Transfer",
    menu: "Branch Transfer",
    settingsTitle: "Branch Stock Transfer Settings",
    settingsSubOn: "চালু — Branch-এ পণ্য পাঠানো ও Receive",
    settingsSubOff: "বন্ধ — Branch না থাকলে বন্ধ রাখুন",
    enable: "Branch Stock Transfer চালু করুন",
    enableHelp: "Branch নেই এমন ব্যবসার জন্য এটি বন্ধ রাখা যাবে।",
    autoInvoice: "Receive করলেই Purchase Invoice auto-create",
    autoHelp: "বন্ধ থাকলে Receive হবে, কিন্তু কোনো Purchase Invoice তৈরি হবে না।",
    autoPayment: "Purchase Invoice payment",
    autoPaymentCash: "Cash / Paid",
    autoPaymentCredit: "Credit / Due",
    autoPaymentHelp: "এই transfer receive হলে Purchase Invoice-এ Cash হলে full paid, Credit হলে payable/due থাকবে।",
    partial: "Partial Receive অনুমতি দিন",
    saveSettings: "Settings Save",
    savedSettings: "Branch Transfer settings save হয়েছে",
    overview: "সারাংশ",
    newTransfer: "নতুন পাঠান",
    transfers: "Transfer তালিকা",
    branches: "Branch",
    incoming: "পণ্য গ্রহণ",
    stock: "Branch Stock",
    totalTransfers: "মোট Transfer",
    waitingReceive: "Receive বাকি",
    completed: "Completed",
    discrepancy: "সমস্যা",
    noTransfers: "কোনো Transfer নেই",
    noIncoming: "Receive করার মতো পণ্য নেই",
    notAssigned: "আপনার নামে কোনো Branch Transfer assign করা নেই।",
    branchName: "Branch নাম",
    branchCode: "Branch code",
    location: "ঠিকানা / এলাকা",
    phone: "ফোন",
    receiver: "Default Receive করবে",
    noReceiver: "কোনো default user assign নয়",
    salesman: "Salesman / Receiver",
    chooseSalesman: "Salesman নির্বাচন",
    salesmanRequired: "প্রথমে একজন Salesman নির্বাচন করুন",
    assignedTo: "Receive করবেন",
    saveBranch: "Branch Save",
    branchSaved: "Branch save হয়েছে",
    disable: "বন্ধ করুন",
    active: "Active",
    noBranches: "কোনো Branch তৈরি হয়নি",
    chooseBranch: "Branch নির্বাচন",
    chooseProduct: "Product নির্বাচন",
    itemName: "Item Name / পণ্যের নাম",
    modelCode: "Model / Code",
    brand: "Brand",
    unit: "Unit",
    selectExistingProduct: "Product Master থেকে নাম বা model/code লিখে product নির্বাচন করুন",
    quantity: "পরিমাণ",
    unitCost: "Unit Cost",
    addItem: "Item যোগ",
    expectedDate: "Expected delivery date",
    note: "নোট",
    saveDraft: "Draft Save",
    dispatchNow: "Save & Dispatch",
    transferSaved: "Transfer save হয়েছে",
    branchRequired: "প্রথমে Branch নির্বাচন করুন",
    itemsRequired: "কমপক্ষে একটি item যোগ করুন",
    sent: "পাঠানো",
    received: "গ্রহণ",
    remaining: "বাকি",
    damaged: "নষ্ট",
    issueNote: "সমস্যার নোট",
    receive: "Receive",
    confirmReceive: "Receive Confirm",
    receiveSaved: "Receive save হয়েছে",
    autoInvoiceCreated: "Receive এবং Purchase Invoice তৈরি হয়েছে",
    packed: "Packed",
    dispatch: "Dispatch",
    inTransit: "In Transit",
    cancel: "Cancel",
    statusUpdated: "Status update হয়েছে",
    source: "Source",
    branch: "Branch",
    createdBy: "তৈরি করেছেন",
    receiptHistory: "Receive History",
    noProducts: "Product Master-এ product নেই",
    noStock: "এখনো কোনো stock receive হয়নি",
    branchStock: "বর্তমান Branch Stock",
    pendingInvoiceTitle: "Branch Transfer থেকে Purchase Invoice",
    pendingInvoiceHelp: "Receive সম্পন্ন হয়েছে, কিন্তু Purchase Invoice এখনো তৈরি হয়নি।",
    createInvoice: "Purchase Invoice তৈরি করুন",
    invoiceCreated: "Purchase Invoice তৈরি হয়েছে",
    refresh: "Refresh",
    remove: "Remove",
    draft: "Draft",
    searchPlaceholder: "Transfer, Branch, Salesman, Product, Model/Code বা Vendor খুঁজুন...",
    fromDate: "তারিখ থেকে",
    toDate: "তারিখ পর্যন্ত",
    clearFilter: "Clear",
    viewDetails: "Product Preview",
    hideDetails: "Preview বন্ধ",
    transferDate: "পাঠানোর তারিখ",
    vendorName: "Vendor Name (Optional)",
    vendorInvoiceNo: "Vendor Invoice No. (Optional)",
    vendorHelp: "Vendor তথ্য থাকলে লিখুন, না থাকলে খালি রাখুন।",
    itemsCount: "টি product",
    totalValue: "মোট মূল্য",
    productDetails: "Product Details",
    filterResult: "টি Transfer পাওয়া গেছে",
  },
  en: {
    title: "Branch Stock Transfer",
    menu: "Branch Transfer",
    settingsTitle: "Branch Stock Transfer Settings",
    settingsSubOn: "Enabled — Send and receive branch products",
    settingsSubOff: "Disabled — Keep off when branches are not used",
    enable: "Enable Branch Stock Transfer",
    enableHelp: "Keep this disabled for businesses that do not use branches.",
    autoInvoice: "Auto-create Purchase Invoice when branch receives",
    autoHelp: "When disabled, receiving works but no Purchase Invoice is created.",
    autoPayment: "Purchase Invoice payment",
    autoPaymentCash: "Cash / Paid",
    autoPaymentCredit: "Credit / Due",
    autoPaymentHelp: "When this transfer is received, Cash marks the Purchase Invoice paid; Credit keeps it due.",
    partial: "Allow partial receiving",
    saveSettings: "Save Settings",
    savedSettings: "Branch Transfer settings saved",
    overview: "Overview",
    newTransfer: "New Transfer",
    transfers: "Transfers",
    branches: "Branches",
    incoming: "Incoming",
    stock: "Branch Stock",
    totalTransfers: "Total Transfers",
    waitingReceive: "Waiting Receive",
    completed: "Completed",
    discrepancy: "Discrepancy",
    noTransfers: "No transfers",
    noIncoming: "No incoming transfer to receive",
    notAssigned: "No Branch Transfer is assigned to your account.",
    branchName: "Branch name",
    branchCode: "Branch code",
    location: "Location",
    phone: "Phone",
    receiver: "Default receiver",
    noReceiver: "No default user assigned",
    salesman: "Salesman / Receiver",
    chooseSalesman: "Select salesman",
    salesmanRequired: "Select a salesman first",
    assignedTo: "Assigned to",
    saveBranch: "Save Branch",
    branchSaved: "Branch saved",
    disable: "Disable",
    active: "Active",
    noBranches: "No branches created",
    chooseBranch: "Select branch",
    chooseProduct: "Select product",
    itemName: "Item Name",
    modelCode: "Model / Code",
    brand: "Brand",
    unit: "Unit",
    selectExistingProduct: "Type item name or model/code and select from Product Master",
    quantity: "Quantity",
    unitCost: "Unit Cost",
    addItem: "Add Item",
    expectedDate: "Expected delivery date",
    note: "Note",
    saveDraft: "Save Draft",
    dispatchNow: "Save & Dispatch",
    transferSaved: "Transfer saved",
    branchRequired: "Select a branch first",
    itemsRequired: "Add at least one item",
    sent: "Sent",
    received: "Received",
    remaining: "Remaining",
    damaged: "Damaged",
    issueNote: "Issue note",
    receive: "Receive",
    confirmReceive: "Confirm Receive",
    receiveSaved: "Receipt saved",
    autoInvoiceCreated: "Receipt and Purchase Invoice created",
    packed: "Packed",
    dispatch: "Dispatch",
    inTransit: "In Transit",
    cancel: "Cancel",
    statusUpdated: "Status updated",
    source: "Source",
    branch: "Branch",
    createdBy: "Created by",
    receiptHistory: "Receipt History",
    noProducts: "No products found in Product Master",
    noStock: "No stock has been received yet",
    branchStock: "Current Branch Stock",
    pendingInvoiceTitle: "Purchase Invoice from Branch Transfer",
    pendingInvoiceHelp: "Receiving is complete, but Purchase Invoice has not been created yet.",
    createInvoice: "Create Purchase Invoice",
    invoiceCreated: "Purchase Invoice created",
    refresh: "Refresh",
    remove: "Remove",
    draft: "Draft",
    searchPlaceholder: "Search transfer, branch, salesman, product, model/code or vendor...",
    fromDate: "From date",
    toDate: "To date",
    clearFilter: "Clear",
    viewDetails: "Product Preview",
    hideDetails: "Hide Preview",
    transferDate: "Sent date",
    vendorName: "Vendor Name (Optional)",
    vendorInvoiceNo: "Vendor Invoice No. (Optional)",
    vendorHelp: "Enter vendor information only when available.",
    itemsCount: "products",
    totalValue: "Total value",
    productDetails: "Product Details",
    filterResult: "transfers found",
  },
};

export function bt(lang) {
  return COPY[lang === "bn" ? "bn" : "en"];
}

export function actorFrom(user, profile) {
  return {
    uid: user?.uid || profile?.firebaseUid || profile?.uid || "",
    firebaseUid: user?.uid || profile?.firebaseUid || profile?.uid || "",
    id: profile?.id || user?.id || "",
    localUserId: profile?.localUserId || user?.localUserId || "",
    personName: profile?.personName || user?.displayName || profile?.username || "",
    username: profile?.username || user?.username || "",
    email: profile?.email || user?.email || "",
    role: profile?.role || "",
    permissions: profile?.permissions || null,
  };
}

export function normalizeError(error, lang) {
  const messages = {
    SHOP_REQUIRED: ["Shop পাওয়া যায়নি", "Shop is missing"],
    OWNER_REQUIRED: ["শুধু Owner এই কাজ করতে পারবে", "Only the owner can do this"],
    BRANCH_NAME_REQUIRED: ["Branch নাম লিখুন", "Enter branch name"],
    ACTIVE_BRANCH_REQUIRED: ["Active Branch নির্বাচন করুন", "Select an active branch"],
    SALESMAN_REQUIRED: ["একজন Salesman নির্বাচন করুন", "Select a salesman"],
    TRANSFER_ITEMS_REQUIRED: ["কমপক্ষে একটি item যোগ করুন", "Add at least one item"],
    TRANSFER_SAVE_FAILED: ["Transfer save হয়নি। আবার চেষ্টা করার আগে Refresh করুন", "Transfer was not saved. Refresh before trying again"],
    TRANSFER_PRODUCT_REQUIRED: ["Product নির্বাচন করুন", "Select a product"],
    TRANSFER_QUANTITY_INVALID: ["সঠিক quantity দিন", "Enter a valid quantity"],
    RECEIVER_NOT_ASSIGNED: ["এই Branch-এর receiver আপনি নন", "You are not assigned to this branch"],
    RECEIVE_PERMISSION_REQUIRED: ["Owner এই Salesman-কে Receive permission দেয়নি", "Owner has not allowed this salesman to receive"],
    TRANSFER_NOT_RECEIVABLE: ["এই status-এ Receive করা যাবে না", "This transfer cannot be received now"],
    RECEIPT_QUANTITY_REQUIRED: ["Receive quantity দিন", "Enter received quantity"],
    RECEIPT_QUANTITY_INVALID: ["Received/Damaged quantity সঠিক নয়", "Received/damaged quantity is invalid"],
    RECEIPT_EXCEEDS_REMAINING: ["বাকি quantity-এর বেশি receive করা যাবে না", "Cannot receive more than remaining"],
    PARTIAL_RECEIVE_DISABLED: ["Partial receive Settings থেকে বন্ধ", "Partial receiving is disabled"],
    PURCHASE_INVOICE_ITEMS_REQUIRED: ["Invoice তৈরির মতো accepted item নেই", "No accepted item for invoice"],
    TRANSFER_REMAINING_ITEMS: ["বাকি item থাকা অবস্থায় Transfer complete করা যাবে না", "Cannot complete while items remain"],
  };
  const key = error?.message || String(error || "");
  const pair = messages[key];
  return pair ? pair[lang === "bn" ? 0 : 1] : key;
}

export function useShopCollection(collectionName, shopId) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!shopId) {
      setRows([]);
      return undefined;
    }
    return subscribeShopRecords(collectionName, shopId, setRows, (error) =>
      console.warn(`[S4 Branch Transfer] ${collectionName} listener failed`, error)
    );
  }, [collectionName, shopId]);
  return [rows, setRows];
}

export function NativeButton({ s, children, onClick, tone = "default", disabled = false, style = {} }) {
  const base = tone === "primary" ? s.sendBtn : tone === "danger" ? s.dlBtn : s.stBtn;
  return (
    <button
      type="button"
      style={{ ...base, opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer", ...style }}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export const BT_ACCENT = "#0e7490";

export const fq = (v) => String(parseFloat(numberValue(v).toFixed(4)));

export const f2 = (v) => numberValue(v).toFixed(2);

export function TransferRemaining(transfer) {
  return (transfer?.items || []).reduce((sum, item) => sum + remainingQuantityForLine(transfer, item), 0);
}

export function dateOnly(value) {
  if (!value) return "";
  const raw = value?.toDate?.() || value;
  const parsed = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

export function transferSentDate(transfer) {
  return dateOnly(transfer?.dispatchedAt || transfer?.createdAt || transfer?.updatedAt);
}

export function transferTotalValue(transfer) {
  return (transfer?.items || []).reduce(
    (sum, item) => sum + numberValue(item.quantity) * numberValue(item.unitCost),
    0
  );
}

export const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");

export const sentQty = (transfer) => (transfer?.items || []).reduce((sum, item) => sum + numberValue(item.quantity), 0);

export const acceptedQty = (transfer) => (transfer?.items || []).reduce((sum, item) => sum + receivedQuantityForLine(transfer, item.lineId), 0);

export const STATUS_COLOR = {
  draft: "#64748b",
  packed: "#7c3aed",
  dispatched: "#2563eb",
  in_transit: "#2563eb",
  partially_received: "#d97706",
  discrepancy: "#dc2626",
  received: "#15803d",
  cancelled: "#6b7280",
};

export const itemSummary = (transfer) => {
  const items = transfer?.items || [];
  return `${items.slice(0, 3).map((item) => `${item.name} ×${fq(item.quantity)}`).join(" · ")}${items.length > 3 ? ` +${items.length - 3}` : ""}`;
};

export function StatusBadge({ status, lang }) {
  return <span className="si-badge" style={{ color: STATUS_COLOR[status] || "#475569" }}>{statusLabel(status, lang)}</span>;
}

export function SkinShell({ rootRef, fitH, titleLeft, titleRight, children }) {
  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong style={{ color: BT_ACCENT }}>{titleLeft}</strong>
        <span>{titleRight}</span>
      </div>
      {children}
    </div>
  );
}
