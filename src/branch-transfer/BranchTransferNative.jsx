import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { filterProducts, findExactProductMatch } from "../utils/productSearch.js";
import { useEscapeKey } from "../components/WindowChrome.jsx";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import {
  BRANCH_TRANSFER_COLLECTIONS,
  createBranchTransfer,
  createPurchaseInvoiceFromReceipt,
  disableBranch,
  listShopRecords,
  loadBranchTransferSettings,
  receiveBranchTransfer,
  saveBranch,
  saveBranchTransferSettings,
  subscribeShopRecords,
  updateTransferStatus,
  deleteBranchTransfer,
} from "./branchTransferService.js";
import {
  BRANCH_TRANSFER_STATUSES,
  DEFAULT_BRANCH_TRANSFER_SETTINGS,
  numberValue,
  receivedQuantityForLine,
  remainingQuantityForLine,
  statusLabel,
} from "./branchTransferDomain.js";
import { unitFactorFor, itemBaseQty, rescaleForUnit } from "../inventory/unitConversion.js";
import { computeStockMap, loadInvoiceRows } from "../inventory/stockFromInvoices.js";
import { logAudit } from "../utils/auditLog.js";

// Base-unit quantity sold from each branch, keyed "branchId|productId".
function branchSalesMap(products, salesInvoices, deliveryNotes, shopId) {
  const productById = new Map((products || []).map((p) => [p.id, p]));
  const out = new Map();
  const add = (doc, statuses) => {
    if (!doc || doc.isDeleted || doc.deleted || (shopId && doc.shopId && doc.shopId !== shopId)) return;
    const loc = doc.stockLocation;
    if (!loc || loc === "main" || !statuses.includes(doc.status) || doc.internalTransfer) return;
    (doc.items || []).forEach((it) => {
      if (!it?.productId) return;
      const key = `${loc}|${it.productId}`;
      out.set(key, (out.get(key) || 0) + itemBaseQty(it, productById.get(it.productId)));
    });
  };
  (salesInvoices || []).forEach((inv) => { if (!inv?.deliveryNoteId) add(inv, ["confirmed", "paid", "partial"]); });
  (deliveryNotes || []).forEach((dn) => add(dn, ["confirmed", "invoiced"]));
  return out;
}

const COPY = {
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

function bt(lang) {
  return COPY[lang === "bn" ? "bn" : "en"];
}

function actorFrom(user, profile) {
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

function identitySet(source = {}) {
  return new Set(
    [
      source?.uid,
      source?.firebaseUid,
      source?.id,
      source?.localUserId,
      source?.username,
      source?.email,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean)
  );
}

function transferReceiverIds(transfer = {}) {
  return [
    transfer.receiverUserId,
    transfer.receiverFirebaseUid,
    transfer.receiverMemberId,
    transfer.receiverLocalUserId,
    transfer.receiverUsername,
    transfer.receiverEmail,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function transferAssignedToActor(transfer, actor) {
  const actorIds = identitySet(actor);
  return transferReceiverIds(transfer).some((value) => actorIds.has(value));
}

function canReceiveBranchTransferActor(actor) {
  return String(actor?.role || "").trim().toLowerCase() === "owner" || actor?.permissions?.receiveBranchTransfer === true;
}

function dateOnly(value) {
  if (!value) return "";
  const raw = value?.toDate?.() || value;
  const parsed = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function transferSentDate(transfer) {
  return dateOnly(transfer?.dispatchedAt || transfer?.createdAt || transfer?.updatedAt);
}

function transferSearchHaystack(transfer) {
  return [
    transfer?.transferNo,
    transfer?.branchName,
    transfer?.receiverName,
    transfer?.vendorName,
    transfer?.supplierInvoiceNo,
    transfer?.status,
    transfer?.sourceShopName,
    ...(transfer?.items || []).flatMap((item) => [item?.name, item?.code, item?.brand]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function normalizeError(error, lang) {
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

function useShopCollection(collectionName, shopId) {
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

export function useBranchTransferAccess({ shopId, user, profile, isOwner }) {
  const [settings, setSettings] = useState({ ...DEFAULT_BRANCH_TRANSFER_SETTINGS });
  const [assigned, setAssigned] = useState(Boolean(isOwner));
  const canSend = profile?.permissions?.sendBranchTransfer === true;
  const canReceive = profile?.permissions?.receiveBranchTransfer === true;

  useEffect(() => {
    let cancelled = false;
    if (!shopId) {
      setSettings({ ...DEFAULT_BRANCH_TRANSFER_SETTINGS });
      setAssigned(Boolean(isOwner));
      return undefined;
    }

    const actorIds = identitySet({
      uid: user?.uid,
      firebaseUid: profile?.firebaseUid,
      id: profile?.id,
      localUserId: profile?.localUserId,
      username: profile?.username,
      email: profile?.email || user?.email,
    });
    let latestBranches = [];
    let latestTransfers = [];

    const applyAssignment = () => {
      if (cancelled) return;
      if (isOwner) {
        setAssigned(true);
        return;
      }

      const assignedByTransfer = latestTransfers.some((transfer) =>
        transferReceiverIds(transfer).some((value) => actorIds.has(value))
      );

      setAssigned(assignedByTransfer);
    };

    const applyBranches = (rows = []) => {
      latestBranches = rows;
      applyAssignment();
    };

    const applyTransfers = (rows = []) => {
      latestTransfers = rows;
      applyAssignment();
    };
    const applySettings = (next) => {
      if (!cancelled && next) {
        setSettings({ ...DEFAULT_BRANCH_TRANSFER_SETTINGS, ...next });
      }
    };

    loadBranchTransferSettings(shopId).then(applySettings).catch(console.warn);
    const stopSettings = subscribeShopRecords(
      BRANCH_TRANSFER_COLLECTIONS.SETTINGS,
      shopId,
      (rows) => applySettings(rows[0])
    );
    const stopBranches = subscribeShopRecords(
      BRANCH_TRANSFER_COLLECTIONS.BRANCHES,
      shopId,
      applyBranches
    );
    const stopTransfers = subscribeShopRecords(
      BRANCH_TRANSFER_COLLECTIONS.TRANSFERS,
      shopId,
      applyTransfers
    );
    const handleChange = (event) => applySettings(event?.detail);
    window.addEventListener("s4-branch-transfer-settings-changed", handleChange);

    return () => {
      cancelled = true;
      stopSettings?.();
      stopBranches?.();
      stopTransfers?.();
      window.removeEventListener("s4-branch-transfer-settings-changed", handleChange);
    };
  }, [shopId, user?.uid, profile?.uid, profile?.localUserId, isOwner]);

  return {
    settings,
    setSettings,
    assigned,
    canUse: settings.enabled === true && (Boolean(isOwner) || canSend || canReceive || assigned),
    canSend,
    canReceive,
  };
}

function NativeButton({ s, children, onClick, tone = "default", disabled = false, style = {} }) {
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

function ToggleRow({ th, label, help, checked, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "14px 0", borderBottom: `1px solid ${th.border}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: th.txtPrimary, marginBottom: 4 }}>{label}</div>
        {help && <div style={{ fontSize: 12, color: th.txtMuted, lineHeight: 1.5 }}>{help}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{ width: 52, height: 30, borderRadius: 15, border: "none", cursor: "pointer", background: checked ? "#22c55e" : "#3f3f46", position: "relative", flexShrink: 0, transition: "background 0.2s", marginTop: 4 }}
      >
        <span style={{ position: "absolute", top: 3, left: checked ? 25 : 3, width: 24, height: 24, borderRadius: "50%", background: "#fff", transition: "left 0.15s", display: "block" }} />
      </button>
    </div>
  );
}

function BranchForm({ lang, s, th, team, onSave, busy }) {
  const t = bt(lang);
  const [form, setForm] = useState({ name: "", code: "", location: "", phone: "", receiverKey: "" });
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    const member = team.find((row) => String(row.uid || row.id || row.localUserId || "") === form.receiverKey);
    onSave({
      name: form.name,
      code: form.code,
      location: form.location,
      phone: form.phone,
      receiverUserId: member?.firebaseUid || member?.uid || member?.id || "",
      receiverLocalUserId: member?.localUserId || "",
      receiverName: member?.personName || member?.username || "",
    }).then((ok) => {
      if (ok) setForm({ name: "", code: "", location: "", phone: "", receiverKey: "" });
    });
  };

  return (
    <div style={{ ...s.card, marginBottom: 12 }}>
      <div style={s.settingsLbl}>➕ {t.saveBranch}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
        <input style={s.inp} placeholder={t.branchName} value={form.name} onChange={(e) => update("name", e.target.value)} />
        <input style={s.inp} placeholder={t.branchCode} value={form.code} onChange={(e) => update("code", e.target.value)} />
        <input style={s.inp} placeholder={t.location} value={form.location} onChange={(e) => update("location", e.target.value)} />
        <input style={s.inp} placeholder={t.phone} value={form.phone} onChange={(e) => update("phone", e.target.value)} />
        <select style={s.sel} value={form.receiverKey} onChange={(e) => update("receiverKey", e.target.value)}>
          <option value="">{t.noReceiver}</option>
          {team.filter((member) => member.role !== "owner" && member.status !== "disabled").map((member) => {
            const key = String(member.uid || member.id || member.localUserId || member.username || "");
            return <option key={key} value={key}>{member.personName || member.username || key}</option>;
          })}
        </select>
      </div>
      <NativeButton s={s} tone="primary" disabled={busy} onClick={submit} style={{ marginTop: 10 }}>{t.saveBranch}</NativeButton>
    </div>
  );
}

function BranchList({ lang, s, th, branches, onDisable, busy }) {
  const t = bt(lang);
  if (!branches.length) return <div style={{ ...s.card, color: th.txtMuted, textAlign: "center", padding: 30 }}>{t.noBranches}</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {branches.map((branch) => (
        <div key={branch.id} style={{ ...s.card, display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: th.txtPrimary, fontWeight: 800 }}>{branch.name}</div>
            <div style={{ color: th.txtMuted, fontSize: 11, marginTop: 3 }}>
              {[branch.code, branch.location, branch.receiverName].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <NativeButton s={s} tone="danger" disabled={busy || branch.active === false} onClick={() => onDisable(branch)}>
            {branch.active === false ? t.disable : t.disable}
          </NativeButton>
        </div>
      ))}
    </div>
  );
}

function SettingsPanel({ lang, s, th, shopId, user, profile, team, settings, onSettingsChanged, toast }) {
  const t = bt(lang);
  const actor = useMemo(() => actorFrom(user, profile), [user, profile]);
  const [draft, setDraft] = useState({ ...DEFAULT_BRANCH_TRANSFER_SETTINGS, ...settings });
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useShopCollection(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, shopId);

  useEffect(() => setDraft({ ...DEFAULT_BRANCH_TRANSFER_SETTINGS, ...settings }), [settings]);

  const run = async (work, success) => {
    setBusy(true);
    try {
      const result = await work();
      if (success) toast(success);
      return result;
    } catch (error) {
      toast(normalizeError(error, lang), "err");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = () => run(async () => {
    const saved = await saveBranchTransferSettings({ shopId, settings: draft, actor });
    const next = { ...DEFAULT_BRANCH_TRANSFER_SETTINGS, ...saved };
    onSettingsChanged?.(next);
    window.dispatchEvent(new CustomEvent("s4-branch-transfer-settings-changed", { detail: next }));
    return saved;
  }, t.savedSettings);

  const refreshBranches = async () => setBranches(await listShopRecords(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, shopId));

  return (
    <>
      <div style={s.card}>
        <div style={s.settingsLbl}>🚚 {t.settingsTitle}</div>
        <ToggleRow th={th} label={t.enable} help={t.enableHelp} checked={draft.enabled === true} onChange={(value) => setDraft((prev) => ({ ...prev, enabled: value }))} />
        <ToggleRow th={th} label={t.autoInvoice} help={t.autoHelp} checked={draft.autoCreatePurchaseInvoiceOnReceive === true} onChange={(value) => setDraft((prev) => ({ ...prev, autoCreatePurchaseInvoiceOnReceive: value }))} />
        <ToggleRow th={th} label={t.partial} checked={draft.allowPartialReceive === true} onChange={(value) => setDraft((prev) => ({ ...prev, allowPartialReceive: value }))} />
        <NativeButton s={s} tone="primary" disabled={busy} onClick={saveSettings} style={{ marginTop: 14 }}>{t.saveSettings}</NativeButton>
      </div>

      {draft.enabled && (
        <div style={{ marginTop: 12 }}>
          <BranchForm
            lang={lang}
            s={s}
            th={th}
            team={team}
            busy={busy}
            onSave={(branch) => run(async () => {
              const saved = await saveBranch({ shopId, branch, actor });
              await refreshBranches();
              return saved;
            }, t.branchSaved)}
          />
          <BranchList
            lang={lang}
            s={s}
            th={th}
            branches={branches}
            busy={busy}
            onDisable={(branch) => run(async () => {
              const saved = await disableBranch({ branch, actor });
              await refreshBranches();
              return saved;
            }, t.branchSaved)}
          />
        </div>
      )}
    </>
  );
}

export function BranchTransferSettingsPanel(props) {
  return <SettingsPanel {...props} />;
}

function TransferRemaining(transfer) {
  return (transfer?.items || []).reduce((sum, item) => sum + remainingQuantityForLine(transfer, item), 0);
}

function damagedQuantityForLine(transfer, lineId) {
  return (transfer?.receipts || []).reduce((total, receipt) => {
    const line = (receipt?.lines || []).find((entry) => entry.lineId === lineId);
    return total + numberValue(line?.damagedQty);
  }, 0);
}

function transferTotalValue(transfer) {
  return (transfer?.items || []).reduce(
    (sum, item) => sum + numberValue(item.quantity) * numberValue(item.unitCost),
    0
  );
}

const BT_ACCENT = "#0e7490";
const OPEN_STATUSES = ["draft", "packed", "dispatched", "in_transit", "partially_received", "discrepancy"];
const RECEIVABLE_STATUSES = ["dispatched", "in_transit", "partially_received", "discrepancy"];
const STATUS_COLOR = {
  draft: "#64748b",
  packed: "#7c3aed",
  dispatched: "#2563eb",
  in_transit: "#2563eb",
  partially_received: "#d97706",
  discrepancy: "#dc2626",
  received: "#15803d",
  cancelled: "#6b7280",
};
const fq = (v) => String(parseFloat(numberValue(v).toFixed(4)));
const f2 = (v) => numberValue(v).toFixed(2);
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const isReceivable = (transfer) => RECEIVABLE_STATUSES.includes(transfer?.status) && TransferRemaining(transfer) > 0;
const sentQty = (transfer) => (transfer?.items || []).reduce((sum, item) => sum + numberValue(item.quantity), 0);
const acceptedQty = (transfer) => (transfer?.items || []).reduce((sum, item) => sum + receivedQuantityForLine(transfer, item.lineId), 0);
const itemSummary = (transfer) => {
  const items = transfer?.items || [];
  return `${items.slice(0, 3).map((item) => `${item.name} ×${fq(item.quantity)}`).join(" · ")}${items.length > 3 ? ` +${items.length - 3}` : ""}`;
};

function StatusBadge({ status, lang }) {
  return <span className="si-badge" style={{ color: STATUS_COLOR[status] || "#475569" }}>{statusLabel(status, lang)}</span>;
}

function SkinShell({ rootRef, fitH, titleLeft, titleRight, children }) {
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

function productUnits(product) {
  const base = product?.unit || "Pcs";
  const extra = (Array.isArray(product?.unitPrices) ? product.unitPrices : [])
    .filter((row) => row?.unit && Number(row.factor) > 0)
    .map((row) => row.unit);
  return [...new Set([base, ...extra])];
}

function productCost(product) {
  return numberValue(product?.landingCost || product?.vatExclusive || product?.purchasePrice);
}

function NewTransferForm({ lang, mobile, branches, team, products, vendors, mainStock, busy, dirtyRef, onSave, onBack, toast }) {
  const t = bt(lang);
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const vendorListId = useId().replaceAll(":", "-");
  const [branchId, setBranchId] = useState("");
  const [salesmanKey, setSalesmanKey] = useState("");
  const [vendor, setVendor] = useState({ vendorId: null, vendorName: "", vendorMobile: "", supplierInvoiceNo: "" });
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [prodQ, setProdQ] = useState("");
  const [lines, setLines] = useState([]);

  useEffect(() => {
    dirtyRef.current = lines.length > 0;
  });

  const activeBranches = branches.filter((branch) => branch.active !== false);
  const activeSalesmen = team.filter((member) => member?.role !== "owner" && member?.status !== "disabled" && member?.isDeleted !== true);
  const activeProducts = useMemo(() => products.filter((p) => p && p.isDeleted !== true && p.deleted !== true && p.name), [products]);
  const productById = useMemo(() => new Map(activeProducts.map((p) => [p.id, p])), [activeProducts]);
  const activeVendors = vendors.filter((row) => row?.isDeleted !== true && row?.status !== "disabled");
  const memberKey = (member) => String(member?.uid || member?.firebaseUid || member?.id || member?.localUserId || member?.username || "");

  const selectBranch = (id) => {
    setBranchId(id);
    const branch = activeBranches.find((row) => row.id === id);
    const fallback = branch && activeSalesmen.find((member) => {
      const ids = [member?.uid, member?.firebaseUid, member?.id, member?.localUserId].filter(Boolean).map(String);
      return ids.includes(String(branch.receiverUserId || "")) || ids.includes(String(branch.receiverLocalUserId || ""));
    });
    setSalesmanKey(fallback ? memberKey(fallback) : "");
  };

  const updateVendorName = (value) => {
    const clean = String(value || "");
    const exact = activeVendors.find((row) => String(row.vendorName || "").trim().toLocaleLowerCase() === clean.trim().toLocaleLowerCase());
    setVendor((prev) => ({
      ...prev,
      vendorName: clean,
      vendorId: exact?.id || null,
      vendorMobile: exact?.mobileNumber || exact?.whatsappNumber || exact?.phone || "",
    }));
  };

  const prodMatches = useMemo(() => (prodQ.trim() ? filterProducts(activeProducts, prodQ, { limit: 20 }) : []), [prodQ, activeProducts]);
  const availOf = (id) => (mainStock?.has(id) ? mainStock.get(id) : null);
  const factorOf = (line) => unitFactorFor(productById.get(line.productId), line.unit) || 1;
  const baseQtyOf = (line) => numberValue(line.qty) * factorOf(line);
  const isShort = (line) => {
    const avail = availOf(line.productId);
    return avail != null && baseQtyOf(line) > avail + 1e-9;
  };

  const addProduct = (product) => {
    setProdQ("");
    if (lines.some((line) => line.productId === product.id)) {
      toast(L("এই পণ্য আগেই তালিকায় আছে", "This product is already in the list"), "err");
      return;
    }
    setLines((prev) => [...prev, {
      lineId: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId: product.id,
      name: product.name || "",
      code: product.code || product.barcode || product.ean || "",
      brand: product.brand || "",
      baseUnit: product.unit || "Pcs",
      unit: product.unit || "Pcs",
      qty: "1",
      cost: productCost(product) ? String(productCost(product)) : "",
    }]);
  };
  const onProdKey = (event) => {
    if (event.key !== "Enter") return;
      event.preventDefault();
    const exact = findExactProductMatch(activeProducts, { code: prodQ });
    const pick = exact || (prodMatches.length === 1 ? prodMatches[0] : null);
    if (pick) addProduct(pick);
  };
  const updLine = (lineId, patch) => setLines((prev) => prev.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)));
  const changeUnit = (line, unit) => updLine(line.lineId, {
    unit,
    cost: line.cost === "" ? "" : rescaleForUnit(line.cost, productById.get(line.productId), line.unit, unit),
  });
  const removeLine = (lineId) => setLines((prev) => prev.filter((line) => line.lineId !== lineId));
  const total = lines.reduce((sum, line) => sum + numberValue(line.qty) * numberValue(line.cost), 0);

  const save = (initialStatus) => {
    if (busy) return;
    const branch = activeBranches.find((row) => row.id === branchId);
    if (!branch) return toast(t.branchRequired, "err");
    const salesman = activeSalesmen.find((member) => memberKey(member) === salesmanKey);
    if (!salesman) return toast(t.salesmanRequired, "err");
    if (!lines.length) return toast(t.itemsRequired, "err");
    const badQty = lines.find((line) => numberValue(line.qty) <= 0);
    if (badQty) return toast(L(`❌ "${badQty.name}": সঠিক পরিমাণ দিন`, `❌ "${badQty.name}": enter a valid quantity`), "err");
    const badCost = lines.find((line) => numberValue(line.cost) < 0);
    if (badCost) return toast(L(`❌ "${badCost.name}": দাম মাইনাস হতে পারে না`, `❌ "${badCost.name}": cost can't be negative`), "err");
    const short = lines.filter(isShort);
    if (initialStatus === BRANCH_TRANSFER_STATUSES.DISPATCHED && short.length && !window.confirm(L(
      `মেইন দোকানে স্টক কম: ${short.map((line) => line.name).join(", ")}। তবুও পাঠাবেন?`,
      `Main shop stock is short for: ${short.map((line) => line.name).join(", ")}. Send anyway?`
    ))) return;

    onSave({
      branch,
      receiver: {
      receiverUserId: String(salesman.firebaseUid || salesman.uid || salesman.id || ""),
      receiverFirebaseUid: String(salesman.firebaseUid || salesman.uid || ""),
      receiverMemberId: String(salesman.id || ""),
      receiverLocalUserId: String(salesman.localUserId || ""),
      receiverUsername: String(salesman.username || ""),
      receiverEmail: String(salesman.email || salesman.authEmail || ""),
      receiverName: salesman.personName || salesman.username || "",
      },
      vendor: {
        vendorId: vendor.vendorId || null,
        vendorName: vendor.vendorName.trim(),
        vendorMobile: vendor.vendorMobile || "",
        supplierInvoiceNo: vendor.supplierInvoiceNo.trim(),
      },
      // Transfer lines are kept in the product's base unit.
      items: lines.map((line) => {
        const factor = factorOf(line);
        return {
          lineId: line.lineId,
          productId: line.productId,
          name: line.name,
          code: line.code,
          brand: line.brand,
          unit: line.baseUnit,
          quantity: parseFloat((numberValue(line.qty) * factor).toFixed(4)),
          unitCost: numberValue(line.cost) / factor,
        };
      }),
      purchaseInvoicePaymentMethod: "cash",
      note,
      expectedDeliveryDate: expectedDate,
      initialStatus,
    });
  };

  const field = (label, control) => <div className="si-field"><span className="pm-label">{label}</span>{control}</div>;
  const availText = (id) => (mainStock == null ? "…" : availOf(id) == null ? "—" : fq(availOf(id)));
  const unitSelect = (line) => (
    <select className="pm-input" value={line.unit} onChange={(e) => changeUnit(line, e.target.value)}>
      {productUnits(productById.get(line.productId) || { unit: line.baseUnit }).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
    </select>
  );
  const qtyInput = (line) => <input type="number" min="0" step="any" inputMode="decimal" className="pm-input" value={line.qty} onChange={(e) => updLine(line.lineId, { qty: e.target.value })} style={{ textAlign: "right" }} />;
  const costInput = (line) => <input type="number" min="0" step="any" inputMode="decimal" className="pm-input" value={line.cost} onChange={(e) => updLine(line.lineId, { cost: e.target.value })} style={{ textAlign: "right" }} />;

  return (
    <>
      <div className="si-body">
        <fieldset className="pm-panel" style={{ margin: 0 }}>
          <legend className="pm-panel-legend">{L("কোথায় পাঠাবেন", "Send to")}</legend>
          <div className={mobile ? "si-panel-body" : "si-grid2"} style={mobile ? undefined : { gridTemplateColumns: "repeat(4,minmax(0,1fr))", paddingTop: 3 }}>
            {field(`${t.branch} *`, (
              <select className="pm-input" value={branchId} onChange={(e) => selectBranch(e.target.value)}>
          <option value="">{t.chooseBranch}</option>
                {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.code ? ` · ${branch.code}` : ""}</option>)}
        </select>
            ))}
            {field(`${t.salesman} *`, (
              <select className="pm-input" value={salesmanKey} onChange={(e) => setSalesmanKey(e.target.value)}>
          <option value="">{t.chooseSalesman}</option>
          {activeSalesmen.map((member) => {
                  const key = memberKey(member);
                  return <option key={key} value={key}>{member.personName || member.username || key}{member.position ? ` · ${member.position}` : ""}</option>;
          })}
        </select>
            ))}
            {field(t.expectedDate, <input type="date" className="pm-input" value={expectedDate} min={localDay()} onChange={(e) => setExpectedDate(e.target.value)} />)}
            {field(t.note, <input className="pm-input" value={note} onChange={(e) => setNote(e.target.value)} />)}
      </div>
          {!activeBranches.length && <div className="si-hint" style={{ marginLeft: 0 }}>⚠️ {L("আগে Settings → Branch Transfer থেকে Branch তৈরি করুন", "Create a branch first in Settings → Branch Transfer")}</div>}
        </fieldset>

        <fieldset className="pm-panel" style={{ margin: 0 }}>
          <legend className="pm-panel-legend">{L("ভেন্ডর (ঐচ্ছিক)", "Vendor (optional)")}</legend>
          <div className={mobile ? "si-panel-body" : "si-grid2"} style={mobile ? undefined : { gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", paddingTop: 3 }}>
            {field(t.vendorName, (
              <>
                <input list={vendorListId} className="pm-input" value={vendor.vendorName} onChange={(e) => updateVendorName(e.target.value)} />
                <datalist id={vendorListId}>{activeVendors.map((row) => <option key={row.id || row.vendorName} value={row.vendorName || ""} />)}</datalist>
              </>
            ))}
            {field(t.vendorInvoiceNo, <input className="pm-input" value={vendor.supplierInvoiceNo} onChange={(e) => setVendor((prev) => ({ ...prev, supplierInvoiceNo: e.target.value }))} />)}
        </div>
        </fieldset>

        <fieldset className="pm-panel" style={{ margin: 0 }}>
          <legend className="pm-panel-legend">{L("পণ্য যোগ করুন", "Add product")}</legend>
          <div className="si-panel-body">
            <div className="si-search">
              <input className="pm-input" value={prodQ} onChange={(e) => setProdQ(e.target.value)} onKeyDown={onProdKey} autoFocus={!mobile}
                placeholder={L("নাম, কোড বা বারকোড লিখুন / স্ক্যান করুন…", "Type or scan name, code or barcode…")} />
              {prodQ && <button type="button" onClick={() => setProdQ("")}>✕</button>}
        </div>
            {prodMatches.length > 0 && (
              <div className="si-box" style={{ maxHeight: mobile ? 260 : 170 }}>
                {prodMatches.map((p) => (
                  <button key={p.id} type="button" className="si-mrow" style={{ display: "flex", justifyContent: "space-between", gap: 8, width: "100%", padding: mobile ? undefined : "3px 6px", border: 0, borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", font: "inherit", textAlign: "left" }} onClick={() => addProduct(p)}>
                    <span><b>{p.name}</b>{p.code ? <span className="si-muted"> · {p.code}</span> : null}{p.brand ? <span className="si-muted"> · {p.brand}</span> : null}</span>
                    <span style={{ color: BT_ACCENT, fontWeight: 700, whiteSpace: "nowrap" }} title={L("মেইন দোকানে আছে", "In main shop")}>{availText(p.id)} {p.unit || ""}</span>
                  </button>
                ))}
        </div>
            )}
            {prodQ.trim() && !prodMatches.length && <div className="si-muted">{L("কোনো পণ্য পাওয়া যায়নি", "No product found")}</div>}
        </div>
        </fieldset>

        <div className="si-box" style={{ flex: mobile ? undefined : 1, minHeight: 120 }}>
          {!lines.length && <div className="si-empty">{L("উপরে পণ্য খুঁজে যোগ করুন", "Search above and add products")}</div>}
          {lines.length > 0 && (mobile ? lines.map((line) => (
            <div key={line.lineId} className="si-mrow" style={{ cursor: "default" }}>
              <div className="si-mrow-top">
                <span>{line.name}</span>
                <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => removeLine(line.lineId)}>✕</button>
                </div>
              <div className="si-mrow-sub">
                <span>{line.code || ""}</span>
                <span style={isShort(line) ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{L("মেইনে", "Main")} <b>{availText(line.productId)}</b> {line.baseUnit}</span>
              </div>
              <div className="si-grid2" style={{ marginTop: 4, gridTemplateColumns: "1fr 1fr 1fr", alignItems: "center" }}>
                {qtyInput(line)}
                {unitSelect(line)}
                {costInput(line)}
            </div>
              <div className="si-mrow-sub"><span /><b>{f2(numberValue(line.qty) * numberValue(line.cost))}</b></div>
            </div>
          )) : (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 28 }} className="si-center">#</th>
                <th>{L("পণ্য", "Item")}</th>
                <th style={{ width: 120 }}>{L("কোড", "Code")}</th>
                <th style={{ width: 100 }} className="si-num">{L("মেইনে আছে", "Main stock")}</th>
                <th style={{ width: 90 }} className="si-num">{t.quantity}</th>
                <th style={{ width: 90 }}>{t.unit}</th>
                <th style={{ width: 100 }} className="si-num">{t.unitCost}</th>
                <th style={{ width: 100 }} className="si-num">{L("মোট", "Total")}</th>
                <th style={{ width: 30 }} />
              </tr></thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.lineId} className={isShort(line) ? undefined : "is-editing"} title={isShort(line) ? L("মেইন দোকানে এতো স্টক নেই", "Main shop doesn't have this much") : undefined}>
                    <td className="si-center">{index + 1}</td>
                    <td className="si-strong" title={line.name}>{line.name}{line.brand ? <span className="si-muted"> · {line.brand}</span> : null}</td>
                    <td>{line.code || ""}</td>
                    <td className="si-num" style={isShort(line) ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{availText(line.productId)} {line.baseUnit}</td>
                    <td style={{ padding: "1px 2px" }}>{qtyInput(line)}</td>
                    <td style={{ padding: "1px 2px" }}>{unitSelect(line)}</td>
                    <td style={{ padding: "1px 2px" }}>{costInput(line)}</td>
                    <td className="si-num si-strong">{f2(numberValue(line.qty) * numberValue(line.cost))}</td>
                    <td className="si-center"><button type="button" className="pm-btn-secondary pm-btn--danger" style={{ minHeight: 17, padding: "0 5px" }} onClick={() => removeLine(line.lineId)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </div>
      <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
        <button type="button" className="pm-btn-secondary" disabled={busy} onClick={onBack}>← {L("তালিকা", "List")}</button>
        {lines.length > 0 && <span className="si-hint">{lines.length} {t.itemsCount} · {t.totalValue}: <b>{f2(total)}</b></span>}
        {mainStock == null && <span className="si-hint">⏳ {L("স্টক লোড হচ্ছে…", "Loading stock…")}</span>}
        <span className="si-toolbar-gap" />
        <button type="button" className="pm-btn-secondary" disabled={busy || !lines.length} onClick={() => save(BRANCH_TRANSFER_STATUSES.DRAFT)}>📝 {t.saveDraft}</button>
        <button type="button" className="pm-btn pm-btn--primary" disabled={busy || !lines.length} onClick={() => save(BRANCH_TRANSFER_STATUSES.DISPATCHED)}>
          {busy ? L("সেভ হচ্ছে…", "Saving…") : `🚚 ${t.dispatchNow}`}
        </button>
      </div>
    </>
  );
}

function ReceiveWindow({ lang, mobile, transfer, busy, allowPartial, onClose, onConfirm, toast }) {
  const t = bt(lang);
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const items = (transfer.items || []).filter((item) => remainingQuantityForLine(transfer, item) > 0);
  const [lines, setLines] = useState(() => (transfer.items || []).map((item) => ({
    lineId: item.lineId,
    receivedQty: fq(remainingQuantityForLine(transfer, item)),
    damagedQty: "0",
    issueNote: "",
  })));
  useEscapeKey(() => { if (!busy) onClose(); }, { level: 3 });
  const lineOf = (lineId) => lines.find((line) => line.lineId === lineId) || {};
  const upd = (lineId, key, value) => setLines((prev) => prev.map((line) => (line.lineId === lineId ? { ...line, [key]: value } : line)));
  const setAll = (full) => setLines((prev) => prev.map((line) => {
    const item = (transfer.items || []).find((row) => row.lineId === line.lineId);
    return { ...line, receivedQty: full ? fq(remainingQuantityForLine(transfer, item)) : "0", damagedQty: "0" };
  }));
  const problem = (item) => {
    const line = lineOf(item.lineId);
    const rec = numberValue(line.receivedQty);
    const dmg = numberValue(line.damagedQty);
    if (rec < 0 || dmg < 0) return L("মাইনাস হবে না", "Can't be negative");
    if (rec > remainingQuantityForLine(transfer, item) + 1e-9) return L("বাকির চেয়ে বেশি", "More than remaining");
    if (dmg > rec) return L("নষ্ট > পেয়েছেন", "Damaged > received");
    return "";
  };
  const totalRec = items.reduce((sum, item) => sum + numberValue(lineOf(item.lineId).receivedQty), 0);
  const totalDmg = items.reduce((sum, item) => sum + numberValue(lineOf(item.lineId).damagedQty), 0);
  const totalRemaining = TransferRemaining(transfer);

  const confirm = () => {
    if (busy) return;
    const bad = items.find(problem);
    if (bad) return toast(`❌ ${bad.name}: ${problem(bad)}`, "err");
    if (totalRec <= 0) return toast(normalizeError(new Error("RECEIPT_QUANTITY_REQUIRED"), lang), "err");
    if (!allowPartial && totalRec < totalRemaining - 1e-9) return toast(normalizeError(new Error("PARTIAL_RECEIVE_DISABLED"), lang), "err");
    onConfirm(lines);
  };

  const numInput = (item, key) => (
    <input type="number" min="0" step="any" inputMode="decimal" className="pm-input" value={lineOf(item.lineId)[key] ?? ""} onChange={(e) => upd(item.lineId, key, e.target.value)} style={{ textAlign: "right" }} />
  );

  return (
    <div className="pm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="pm-window" style={{ maxWidth: mobile ? undefined : 860 }}>
        <div className="pm-window-title">
          <span>📥 {t.receive} — {transfer.transferNo} · {transfer.branchName}</span>
          <button type="button" className="pm-window-close" disabled={busy} onClick={onClose}>✕</button>
        </div>
        <div className="pm-window-body">
          <div className="si-pills" style={{ marginBottom: 4 }}>
            <button type="button" className="pm-btn-secondary" onClick={() => setAll(true)}>✓ {L("সব বাকি পেয়েছি", "Got all remaining")}</button>
            <button type="button" className="pm-btn-secondary" onClick={() => setAll(false)}>0 {L("সব শূন্য", "Clear all")}</button>
          </div>
          <div className="si-box" style={{ maxHeight: mobile ? undefined : 380 }}>
            {mobile ? items.map((item) => {
              const line = lineOf(item.lineId);
              const err = problem(item);
          return (
                <div key={item.lineId} className="si-mrow" style={{ cursor: "default" }}>
                  <div className="si-mrow-top"><span>{item.name}</span><span>{t.remaining} <b>{fq(remainingQuantityForLine(transfer, item))}</b> {item.unit}</span></div>
                  <div className="si-grid2" style={{ marginTop: 4 }}>
                    <div className="si-field"><span className="pm-label">{t.received}</span>{numInput(item, "receivedQty")}</div>
                    <div className="si-field"><span className="pm-label">{t.damaged}</span>{numInput(item, "damagedQty")}</div>
              </div>
                  <input className="pm-input" style={{ marginTop: 4 }} value={line.issueNote || ""} onChange={(e) => upd(item.lineId, "issueNote", e.target.value)} placeholder={t.issueNote} />
                  {err && <div style={{ color: "#b91c1c", fontWeight: 700 }}>⚠️ {err}</div>}
            </div>
              );
            }) : (
              <table className="pm-table">
                <thead><tr>
                  <th style={{ width: 28 }} className="si-center">#</th>
                  <th>{L("পণ্য", "Item")}</th>
                  <th style={{ width: 80 }} className="si-num">{t.remaining}</th>
                  <th style={{ width: 95 }} className="si-num">{t.received}</th>
                  <th style={{ width: 95 }} className="si-num">{t.damaged}</th>
                  <th style={{ width: 80 }} className="si-num">{L("ভালো", "Good")}</th>
                  <th style={{ width: 200 }}>{t.issueNote}</th>
                </tr></thead>
                <tbody>
                  {items.map((item, index) => {
                    const line = lineOf(item.lineId);
                    const err = problem(item);
                    return (
                      <tr key={item.lineId} className="is-editing" title={err || undefined}>
                        <td className="si-center">{index + 1}</td>
                        <td className="si-strong" title={item.name}>{item.name}{item.code ? <span className="si-muted"> · {item.code}</span> : null}</td>
                        <td className="si-num">{fq(remainingQuantityForLine(transfer, item))} {item.unit}</td>
                        <td style={{ padding: "1px 2px" }}>{numInput(item, "receivedQty")}</td>
                        <td style={{ padding: "1px 2px" }}>{numInput(item, "damagedQty")}</td>
                        <td className="si-num si-strong" style={{ color: err ? "#b91c1c" : "#15803d" }}>{err ? "⚠️" : fq(numberValue(line.receivedQty) - numberValue(line.damagedQty))}</td>
                        <td style={{ padding: "1px 2px" }}><input className="pm-input" value={line.issueNote || ""} onChange={(e) => upd(item.lineId, "issueNote", e.target.value)} /></td>
                      </tr>
          );
        })}
                </tbody>
              </table>
            )}
          </div>
          <div className="si-hint" style={{ marginLeft: 0 }}>
            {t.received} <b>{fq(totalRec)}</b> · {t.damaged} <b>{fq(totalDmg)}</b> · {L("ভালো", "Good")} <b>{fq(totalRec - totalDmg)}</b>
            {!allowPartial && ` · ${L("আংশিক রিসিভ বন্ধ — সব বাকি একসাথে রিসিভ করতে হবে", "Partial receive is off — receive all remaining at once")}`}
          </div>
          <div className="si-actions" style={{ padding: 0 }}>
            <button type="button" className="pm-btn-secondary" disabled={busy} onClick={onClose}>{L("বন্ধ", "Close")}</button>
            <span className="si-toolbar-gap" />
            <button type="button" className="pm-btn pm-btn--primary" disabled={busy} onClick={confirm}>{busy ? L("সেভ হচ্ছে…", "Saving…") : `✓ ${t.confirmReceive}`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransferDetail({ lang, mobile, transfer, isOwner, canManage, canReceive, canCreateInvoice, busy, onStatus, onDelete, onReceive, onCreateInvoice, onPrint, onBack }) {
  const t = bt(lang);
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const remaining = TransferRemaining(transfer);
  const status = transfer.status;
  const receipts = transfer.receipts || [];
  const vRow = (label, value, opts = {}) => (
    <div className="pm-form-row">
      <span className="pm-label">{label}</span>
      <div className={`si-val${opts.strong ? " is-strong" : ""}`} style={opts.color ? { color: opts.color } : undefined}>{value}</div>
    </div>
  );
  const issueNotesOf = (lineId) => receipts.flatMap((receipt) => receipt.lines || []).filter((line) => line.lineId === lineId && line.issueNote).map((line) => line.issueNote).join(" · ");
  const askCancel = () => {
    const received = acceptedQty(transfer) > 0;
    const msg = received
      ? L(`${transfer.transferNo} বাতিল করবেন?\nযা আগে রিসিভ হয়েছে তা Branch-এই থাকবে। বাকি ${fq(remaining)} টা আর পাঠানো হবে না (মেইন দোকানেই থাকবে)।`, `Cancel ${transfer.transferNo}?\nWhat was already received stays at the branch. The remaining ${fq(remaining)} will not be sent (stays in the main shop).`)
      : L(`${transfer.transferNo} বাতিল করবেন?\nকোনো পণ্য Branch-এ যাবে না, সব মেইন দোকানেই থাকবে।`, `Cancel ${transfer.transferNo}?\nNothing goes to the branch; everything stays in the main shop.`);
    if (window.confirm(msg)) onStatus(transfer, "cancelled");
  };
  const billNo = (receipt) => `PI-BT-${transfer.transferNo || transfer.id}-${receipt.sequence || 1}`;
  const billCell = (receipt) => {
    if (receipt.purchaseInvoiceId) return <span style={{ color: "#15803d", fontWeight: 700 }}>✓ {billNo(receipt)}</span>;
    if (numberValue(receipt.acceptedTotal) <= 0) return <span className="si-muted">—</span>;
    if (canCreateInvoice) return <button type="button" className="pm-btn-secondary" disabled={busy} onClick={() => onCreateInvoice(transfer, receipt)}>🧾 {t.createInvoice}</button>;
    return <span className="si-muted">{L("বিল হয়নি", "No bill")}</span>;
  };

  return (
    <>
      <div className="si-body">
        <fieldset className="pm-panel" style={{ margin: 0 }}>
          <legend className="pm-panel-legend">{L("তথ্য", "Details")}</legend>
          <div className={mobile ? "si-panel-body" : "si-cols"} style={{ paddingTop: 3, ...(mobile ? {} : { gridTemplateColumns: "repeat(3,minmax(0,1fr))" }) }}>
            <div className="si-panel-body" style={{ paddingTop: 0 }}>
              {vRow(L("নম্বর", "No"), transfer.transferNo, { strong: true, color: BT_ACCENT })}
              {vRow(t.transferDate, fmtDay(transferSentDate(transfer)) || "—")}
              {vRow(t.branch, transfer.branchName || "—", { strong: true })}
              {vRow(t.assignedTo, transfer.receiverName || "—")}
          </div>
            <div className="si-panel-body" style={{ paddingTop: 0 }}>
              {vRow(t.createdBy, transfer.createdByName || "—")}
              {vRow(L("ভেন্ডর", "Vendor"), [transfer.vendorName, transfer.supplierInvoiceNo && `🧾 ${transfer.supplierInvoiceNo}`].filter(Boolean).join(" · ") || "—")}
              {vRow(t.expectedDate, fmtDay(transfer.expectedDeliveryDate) || "—")}
              {vRow(t.note, transfer.note || "—")}
            </div>
            <div className="si-panel-body" style={{ paddingTop: 0 }}>
              {vRow(t.sent, `${fq(sentQty(transfer))} · ${(transfer.items || []).length} ${t.itemsCount}`)}
              {vRow(t.received, fq(acceptedQty(transfer)), { color: "#15803d" })}
              {vRow(t.remaining, fq(remaining), { strong: true, color: remaining > 0 && status !== "cancelled" ? "#d97706" : undefined })}
              {vRow(t.totalValue, f2(transferTotalValue(transfer)), { strong: true })}
            </div>
          </div>
        </fieldset>
        {receipts.some((receipt) => numberValue(receipt.damagedTotal) > 0) && (
          <div className="si-note" style={{ color: "#b45309" }}>
            ⚠️ {L(
              `পথে নষ্ট ${fq(receipts.reduce((sum, receipt) => sum + numberValue(receipt.damagedTotal), 0))} টা এখনো দোকানের মোট স্টকে ধরা আছে — Stock Adjustment-এ "নষ্ট / ভাঙা" দিয়ে কমিয়ে দিন।`,
              `${fq(receipts.reduce((sum, receipt) => sum + numberValue(receipt.damagedTotal), 0))} damaged on the way are still in the shop's total stock — reduce them in Stock Adjustment as "Damaged".`
          )}
        </div>
        )}
        {status === "cancelled" && (
          <div className="si-note" style={{ color: "#b91c1c" }}>
            🚫 {L("বাতিল", "Cancelled")} {fmtDay(transfer.cancelledAt)} — {acceptedQty(transfer) > 0
              ? L("যা রিসিভ হয়েছিল তা Branch-এ আছে; বাকিটা মেইন দোকানে।", "What was received stays at the branch; the rest is in the main shop.")
              : L("কোনো পণ্য Branch-এ যায়নি।", "Nothing went to the branch.")}
      </div>
        )}
        <div className="si-box">
          {mobile ? (transfer.items || []).map((item, index) => (
            <div key={item.lineId} className="si-mrow" style={{ cursor: "default" }}>
              <div className="si-mrow-top"><span>{index + 1}. {item.name}</span><b>{f2(numberValue(item.quantity) * numberValue(item.unitCost))}</b></div>
              <div className="si-mrow-sub"><span>{[item.code, item.brand].filter(Boolean).join(" · ")}</span><span>{f2(item.unitCost)} / {item.unit}</span></div>
              <div className="si-mrow-sub">
                <span>{t.sent} <b>{fq(item.quantity)}</b> · {t.received} <b style={{ color: "#15803d" }}>{fq(receivedQuantityForLine(transfer, item.lineId))}</b></span>
                <span>{damagedQuantityForLine(transfer, item.lineId) > 0 && <>{t.damaged} <b style={{ color: "#b91c1c" }}>{fq(damagedQuantityForLine(transfer, item.lineId))}</b> · </>}{t.remaining} <b>{fq(remainingQuantityForLine(transfer, item))}</b></span>
      </div>
              {issueNotesOf(item.lineId) && <div className="si-mrow-sub" style={{ color: "#b91c1c" }}><span>⚠️ {issueNotesOf(item.lineId)}</span></div>}
            </div>
          )) : (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 28 }} className="si-center">#</th>
                <th>{L("পণ্য", "Item")}</th>
                <th style={{ width: 110 }}>{L("কোড", "Code")}</th>
                <th style={{ width: 60 }}>{t.unit}</th>
                <th style={{ width: 80 }} className="si-num">{t.unitCost}</th>
                <th style={{ width: 70 }} className="si-num">{t.sent}</th>
                <th style={{ width: 70 }} className="si-num">{t.received}</th>
                <th style={{ width: 70 }} className="si-num">{t.damaged}</th>
                <th style={{ width: 70 }} className="si-num">{t.remaining}</th>
                <th style={{ width: 90 }} className="si-num">{L("মূল্য", "Value")}</th>
                <th style={{ width: 160 }}>{t.issueNote}</th>
              </tr></thead>
              <tbody>
          {(transfer.items || []).map((item, index) => {
            const damaged = damagedQuantityForLine(transfer, item.lineId);
                  const left = remainingQuantityForLine(transfer, item);
            return (
                    <tr key={item.lineId}>
                      <td className="si-center">{index + 1}</td>
                      <td className="si-strong" title={item.name}>{item.name}{item.brand ? <span className="si-muted"> · {item.brand}</span> : null}</td>
                      <td>{item.code || ""}</td>
                      <td>{item.unit || ""}</td>
                      <td className="si-num">{f2(item.unitCost)}</td>
                      <td className="si-num">{fq(item.quantity)}</td>
                      <td className="si-num" style={{ color: "#15803d" }}>{fq(receivedQuantityForLine(transfer, item.lineId))}</td>
                      <td className="si-num" style={damaged > 0 ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{fq(damaged)}</td>
                      <td className="si-num si-strong" style={left > 0 && status !== "cancelled" ? { color: "#d97706" } : undefined}>{fq(left)}</td>
                      <td className="si-num">{f2(numberValue(item.quantity) * numberValue(item.unitCost))}</td>
                      <td title={issueNotesOf(item.lineId)} style={{ color: "#b91c1c" }}>{issueNotesOf(item.lineId)}</td>
                    </tr>
            );
          })}
              </tbody>
            </table>
          )}
            </div>
        {receipts.length > 0 && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{t.receiptHistory}</legend>
            <div className="si-box" style={{ border: 0 }}>
              {mobile ? receipts.map((receipt) => (
                <div key={receipt.id} className="si-mrow" style={{ cursor: "default" }}>
                  <div className="si-mrow-top"><span>R{receipt.sequence} · {fmtDay(receipt.receivedAt)}</span><span>{receipt.receivedByName || "—"}</span></div>
                  <div className="si-mrow-sub"><span>{L("ভালো", "Good")} <b>{fq(receipt.acceptedTotal)}</b>{numberValue(receipt.damagedTotal) > 0 && <> · {t.damaged} <b style={{ color: "#b91c1c" }}>{fq(receipt.damagedTotal)}</b></>}</span>{billCell(receipt)}</div>
                </div>
              )) : (
                <table className="pm-table">
                  <thead><tr>
                    <th style={{ width: 50 }}>R#</th>
                    <th style={{ width: 90 }}>{L("তারিখ", "Date")}</th>
                    <th>{L("রিসিভ করেছেন", "Received by")}</th>
                    <th style={{ width: 80 }} className="si-num">{L("ভালো", "Good")}</th>
                    <th style={{ width: 80 }} className="si-num">{t.damaged}</th>
                    <th style={{ width: 230 }}>{L("রিসিভ বিল", "Receipt bill")}</th>
                  </tr></thead>
                  <tbody>
                    {receipts.map((receipt) => (
                      <tr key={receipt.id}>
                        <td className="si-strong">R{receipt.sequence}</td>
                        <td>{fmtDay(receipt.receivedAt)}</td>
                        <td>{receipt.receivedByName || "—"}</td>
                        <td className="si-num" style={{ color: "#15803d" }}>{fq(receipt.acceptedTotal)}</td>
                        <td className="si-num" style={numberValue(receipt.damagedTotal) > 0 ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{fq(receipt.damagedTotal)}</td>
                        <td style={{ padding: "1px 4px" }}>{billCell(receipt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
        </div>
          </fieldset>
        )}
      </div>
      <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
        <button type="button" className="pm-btn-secondary" disabled={busy} onClick={onBack}>← {L("তালিকা", "List")}</button>
        <button type="button" className="pm-btn-secondary" onClick={() => onPrint(transfer)}>🖨️ {L("চালান প্রিন্ট", "Print")}</button>
        <span className="si-toolbar-gap" />
        {canManage && status === "draft" && <button type="button" className="pm-btn-secondary" disabled={busy} onClick={() => onStatus(transfer, "packed")}>📦 {t.packed}</button>}
        {canManage && ["draft", "packed"].includes(status) && <button type="button" className="pm-btn pm-btn--primary" disabled={busy} onClick={() => onStatus(transfer, "dispatched")}>🚚 {t.dispatch}</button>}
        {canManage && status === "dispatched" && <button type="button" className="pm-btn-secondary" disabled={busy} onClick={() => onStatus(transfer, "in_transit")}>🛣️ {t.inTransit}</button>}
        {canManage && status === "discrepancy" && remaining === 0 && <button type="button" className="pm-btn pm-btn--primary" disabled={busy} onClick={() => onStatus(transfer, "received")}>✓ {t.completed}</button>}
        {canManage && !["received", "cancelled"].includes(status) && <button type="button" className="pm-btn-secondary pm-btn--danger" disabled={busy} onClick={askCancel}>⛔ {t.cancel}</button>}
        {isOwner && status === "cancelled" && <button type="button" className="pm-btn-secondary pm-btn--danger" disabled={busy} onClick={() => { if (window.confirm(L(`ট্রান্সফার ${transfer.transferNo || ""} একেবারে মুছে ফেলবেন?`, `Delete transfer ${transfer.transferNo || ""} permanently?`))) onDelete(transfer); }}>🗑️ {L("মুছুন", "Delete")}</button>}
        {canReceive && <button type="button" className="pm-btn pm-btn--primary" disabled={busy} onClick={() => onReceive(transfer)}>📥 {t.receive}</button>}
    </div>
    </>
  );
}

function BranchStockView({ lang, mobile, stockRows, shopStock, branches, branchIds, loading }) {
  const t = bt(lang);
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [branchFilter, setBranchFilter] = useState("");
  const [query, setQuery] = useState("");
  const visibleBranches = branches.filter((branch) => branchIds.includes(branch.id));
  const q = query.trim().toLocaleLowerCase();
  const rows = stockRows
    .filter((row) => branchIds.includes(row.branchId) && (!branchFilter || row.branchId === branchFilter))
    .filter((row) => row.received !== 0 || row.current !== 0)
    .filter((row) => !q || [row.productName, row.productCode, row.branchName].join(" ").toLocaleLowerCase().includes(q))
    .sort((a, b) => String(a.branchName || "").localeCompare(String(b.branchName || "")) || String(a.productName || "").localeCompare(String(b.productName || "")));
  const totalNow = rows.reduce((sum, row) => sum + row.current, 0);
  const value = rows.reduce((sum, row) => sum + Math.max(0, row.current) * numberValue(row.lastUnitCost), 0);
  // Branch stock is part of the shop total, so it can never be more than the total.
  // It happens when the purchase that brought the goods in was deleted after the transfer.
  const atBranches = new Map();
  stockRows.forEach((row) => atBranches.set(row.productId, (atBranches.get(row.productId) || 0) + Math.max(0, row.current)));
  const shopTotalOf = (productId) => (shopStock?.has(productId) ? shopStock.get(productId) : null);
  const overShop = (row) => {
    const total = shopTotalOf(row.productId);
    return total !== null && row.current > 0 && atBranches.get(row.productId) > total + 1e-9;
  };
  const overCount = new Set(rows.filter(overShop).map((row) => row.productId)).size;
  const overTitle = (row) => L(
    `দোকানের মোট স্টক মাত্র ${fq(shopTotalOf(row.productId))} — অথচ Branch-এ ${fq(atBranches.get(row.productId))}। পণ্যটার Purchase সম্ভবত delete হয়েছে।`,
    `The shop's total stock is only ${fq(shopTotalOf(row.productId))} but branches hold ${fq(atBranches.get(row.productId))}. The purchase was probably deleted.`
  );

  return (
    <>
      {overCount > 0 && (
        <div style={{ margin: "4px 0", padding: "8px 10px", border: "1px solid #fca5a5", background: "#fef2f2", color: "#991b1b", borderRadius: 6, fontSize: 12, lineHeight: 1.5 }}>
          ⚠️ {L(
            `${overCount}টা পণ্যের Branch স্টক দোকানের মোট স্টকের চেয়ে বেশি দেখাচ্ছে। সাধারণত পণ্য Branch-এ পাঠানোর পর তার Purchase delete করলে এমন হয়। Purchase ভুল করে delete হলে আবার এন্ট্রি দিন, আর পণ্য সত্যিই না থাকলে Branch-এ যাওয়া Transfer-টা দেখুন।`,
            `${overCount} product(s) show more stock at the branch than the shop's total. This usually means the purchase was deleted after the goods were sent to the branch. If it was deleted by mistake, enter it again; if the goods really are not there, check the transfer that sent them.`
          )}
    </div>
      )}
      <div className="si-kpis">
        <div className="si-kpi"><span>{L("পণ্য", "Products")}</span><b>{rows.length}</b></div>
        <div className="si-kpi"><span>{L("Branch-এ এখন", "At branch now")}</span><b style={{ color: "#15803d" }}>{fq(totalNow)}</b></div>
        <div className="si-kpi"><span>{L("আনুমানিক মূল্য", "Approx. value")}</span><b>{f2(value)}</b></div>
    </div>
      <div className="si-filters">
        <div className="si-search">
          <input className="pm-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L("পণ্য, কোড বা Branch…", "Product, code or branch…")} />
          {query && <button type="button" onClick={() => setQuery("")}>✕</button>}
        </div>
        <select className="pm-input" style={{ width: mobile ? "100%" : 180 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="">{L("সব Branch", "All branches")}</option>
          {visibleBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        {loading && <span className="si-hint">⏳ {L("বিক্রি হিসাব হচ্ছে…", "Counting sales…")}</span>}
      </div>
      <div className="si-main is-all">
        <div className="si-box">
          {mobile ? rows.map((row) => (
            <div key={row.id} className="si-mrow" style={{ cursor: "default" }}>
              <div className="si-mrow-top"><span>{row.productName}</span><b title={overShop(row) ? overTitle(row) : undefined} style={{ color: row.current < 0 || overShop(row) ? "#b91c1c" : "#15803d" }}>{overShop(row) ? "⚠️ " : ""}{fq(row.current)} {row.unit || "Pcs"}</b></div>
              <div className="si-mrow-sub"><span>{row.branchName} · {row.productCode || "—"}</span><span>{L("এসেছে", "In")} {fq(row.received)} · {L("বিক্রি", "Sold")} {fq(row.sold)}</span></div>
            </div>
          )) : rows.length > 0 && (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 150 }}>{t.branch}</th>
                <th>{L("পণ্য", "Item")}</th>
                <th style={{ width: 130 }}>{L("কোড", "Code")}</th>
                <th style={{ width: 90 }} className="si-num">{L("এসেছে", "Received")}</th>
                <th style={{ width: 90 }} className="si-num">{L("বিক্রি", "Sold")}</th>
                <th style={{ width: 90 }} className="si-num">{L("এখন আছে", "Now")}</th>
                <th style={{ width: 60 }}>{t.unit}</th>
              </tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.branchName}</td>
                    <td className="si-strong" title={row.productName}>{row.productName}</td>
                    <td>{row.productCode || ""}</td>
                    <td className="si-num">{fq(row.received)}</td>
                    <td className="si-num">{fq(row.sold)}</td>
                    <td className="si-num si-strong" title={overShop(row) ? overTitle(row) : undefined} style={{ color: row.current < 0 || overShop(row) ? "#b91c1c" : "#15803d" }}>{overShop(row) ? "⚠️ " : ""}{fq(row.current)}</td>
                    <td>{row.unit || "Pcs"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!rows.length && <div className="si-empty">{t.noStock}</div>}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{L("দেখাচ্ছে", "Showing")} <b>{rows.length}</b></span>
        <span>{L("Branch স্টক = রিসিভ হওয়া − Branch থেকে বিক্রি। দোকানের মোট স্টকে এটা আলাদা করে যোগ হয় না।", "Branch stock = received − sold from the branch. It is part of the shop's total stock, not added on top.")}</span>
      </div>
    </>
  );
}

export function BranchTransferWorkspace({ lang, shopId, user, profile, team, products, vendors = [], shop, settings, toast, leaveGuard = null }) {
  const t = bt(lang);
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const actor = useMemo(() => actorFrom(user, profile), [user, profile]);
  const isOwner = profile?.role === "owner";
  const canSendTransfer = isOwner || profile?.permissions?.sendBranchTransfer === true;
  const canReceiveTransfer = canReceiveBranchTransferActor(actor);
  const [branches, setBranches] = useShopCollection(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, shopId);
  const [transfers, setTransfers] = useShopCollection(BRANCH_TRANSFER_COLLECTIONS.TRANSFERS, shopId);
  const [receivedRows] = useShopCollection(BRANCH_TRANSFER_COLLECTIONS.STOCK_BALANCES, shopId);
  const [view, setView] = useState("list");
  const [section, setSection] = useState(canSendTransfer ? "all" : "incoming");
  const [selId, setSelId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [receiving, setReceiving] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [invoiceRows, setInvoiceRows] = useState(null);
  const dirtyRef = useRef(false);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, `${view}-${section}`);

  useEffect(() => setSection(canSendTransfer ? "all" : "incoming"), [canSendTransfer]);

  const needStock = view === "new" || (view === "list" && section === "stock");
  useEffect(() => {
    if (!needStock) return undefined;
    let cancelled = false;
    loadInvoiceRows()
      .then((rows) => { if (!cancelled) setInvoiceRows(rows); })
      .catch((err) => console.warn("[S4 Branch] stock load failed", err));
    return () => { cancelled = true; };
  }, [needStock, receivedRows, shopId]);

  const soldAtBranch = useMemo(
    () => (invoiceRows ? branchSalesMap(products, invoiceRows.salesInvoices, invoiceRows.deliveryNotes, shopId) : new Map()),
    [invoiceRows, products, shopId]
  );
  // Received balances only ever grow, so sales made from a branch are taken off here.
  const stockRows = useMemo(() => receivedRows.map((row) => {
    const received = numberValue(row.quantity);
    const sold = soldAtBranch.get(`${row.branchId}|${row.productId}`) || 0;
    return { ...row, received, sold, current: parseFloat((received - sold).toFixed(4)) };
  }), [receivedRows, soldAtBranch]);

  const shopStock = useMemo(() => (invoiceRows && view === "list" && section === "stock"
    ? computeStockMap(products, invoiceRows.purchaseInvoices, invoiceRows.salesInvoices, shopId, invoiceRows.deliveryNotes, invoiceRows.extras)
    : null), [invoiceRows, view, section, products, shopId]);

  // Shop stock is one total; what the main shop can still send is that total minus
  // what sits at branches and what is already on an open transfer.
  const mainStock = useMemo(() => {
    if (!invoiceRows || view !== "new") return null;
    const out = new Map(computeStockMap(products, invoiceRows.purchaseInvoices, invoiceRows.salesInvoices, shopId, invoiceRows.deliveryNotes, invoiceRows.extras));
    for (const row of stockRows) {
      if (out.has(row.productId)) out.set(row.productId, out.get(row.productId) - Math.max(0, row.current));
    }
    for (const transfer of transfers) {
      if (!OPEN_STATUSES.includes(transfer.status)) continue;
      for (const item of transfer.items || []) {
        if (out.has(item.productId)) out.set(item.productId, out.get(item.productId) - remainingQuantityForLine(transfer, item));
      }
    }
    out.forEach((value, key) => out.set(key, parseFloat(value.toFixed(4))));
    return out;
  }, [invoiceRows, view, products, shopId, stockRows, transfers]);

  const isAssigned = (transfer) => transferAssignedToActor(transfer, actor);
  const visibleTransfers = useMemo(
    () => (canSendTransfer ? transfers : canReceiveTransfer ? transfers.filter((transfer) => transferAssignedToActor(transfer, actor)) : []),
    [transfers, actor, canSendTransfer, canReceiveTransfer]
  );
  const canReceiveRow = (transfer) => canReceiveTransfer && (isOwner || isAssigned(transfer)) && isReceivable(transfer);
  const canInvoiceRow = (transfer) => canReceiveTransfer && (isOwner || isAssigned(transfer));
  const incomingList = visibleTransfers.filter(canReceiveRow);

  const inRange = (transfer) => {
    const q = search.trim().toLocaleLowerCase();
    if (q && !transferSearchHaystack(transfer).includes(q)) return false;
    const day = transferSentDate(transfer);
    if (from && (!day || day < from)) return false;
    if (to && (!day || day > to)) return false;
      return true;
  };
  const scoped = (section === "incoming" ? incomingList : visibleTransfers).filter(inRange);
  const filtered = scoped
    .filter((transfer) => !statusFilter || (statusFilter === "open" ? OPEN_STATUSES.includes(transfer.status) : transfer.status === statusFilter))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const kpiRows = scoped.filter((transfer) => transfer.status !== "cancelled");
  const waiting = kpiRows.filter(isReceivable).length;
  const discrepancies = kpiRows.filter((transfer) => transfer.status === "discrepancy").length;
  const completed = kpiRows.filter((transfer) => transfer.status === "received").length;
  const totalValue = kpiRows.reduce((sum, transfer) => sum + transferTotalValue(transfer), 0);

  const assignedBranchIds = useMemo(
    () => [...new Set(visibleTransfers.map((transfer) => transfer.branchId))],
    [visibleTransfers]
  );
  const stockBranchIds = canSendTransfer ? branches.map((branch) => branch.id) : assignedBranchIds;

  const upsertTransfer = (next) => {
    if (next?.id) setTransfers((list) => [next, ...(list || []).filter((row) => row.id !== next.id)]);
  };
  const reload = async () => {
    const [nextBranches, nextTransfers] = await Promise.all([
      listShopRecords(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, shopId),
      listShopRecords(BRANCH_TRANSFER_COLLECTIONS.TRANSFERS, shopId),
    ]);
    setBranches(nextBranches);
    setTransfers(nextTransfers);
  };
  const run = async (work, success) => {
    if (busy) return null;
    setBusy(true);
    try {
      const result = await work();
      if (success) toast(success);
      return result;
    } catch (error) {
      console.error("[S4 Branch Transfer] action failed", error);
      toast(normalizeError(error, lang), "err");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const leaveOk = () => view !== "new" || !dirtyRef.current || window.confirm(L("এই ট্রান্সফার সেভ হয়নি। তবুও চলে যাবেন?", "This transfer is not saved. Leave anyway?"));
  const backToList = () => {
    if (!leaveOk()) return;
    dirtyRef.current = false;
    setSelId(null);
    setView("list");
  };
  useEffect(() => {
    if (!leaveGuard || view === "list") return undefined;
    const guard = { leave: () => leaveOk(), back: () => { backToList(); return true; } };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });
  useEscapeKey(backToList, { enabled: view !== "list" && !receiving, level: view === "new" ? 2 : 1 });

  const openNew = () => { dirtyRef.current = false; setView("new"); };
  const openDetail = (transfer) => { setSelId(transfer.id); setView("detail"); };

  const createTransfer = (payload) => run(async () => {
    const created = await createBranchTransfer({ ...payload, shopId, shop, actor });
    upsertTransfer(created);
    logAudit({ shopId, user, profile, action: "create", collection: "branchTransfers", docId: created.id, docNo: created.transferNo, amount: transferTotalValue(created), note: created.branchName || "" });
    dirtyRef.current = false;
    setSelId(created.id);
    setView("detail");
    return created;
  }, t.transferSaved);
  const changeStatus = (transfer, status) => run(async () => {
    const updated = await updateTransferStatus({ transfer, status, actor });
    upsertTransfer(updated);
    logAudit({ shopId, user, profile, action: status === "cancelled" ? "cancel" : "edit", collection: "branchTransfers", docId: transfer.id, docNo: transfer.transferNo, note: `${statusLabel(status, "en")} · ${transfer.branchName || ""}` });
    return updated;
  }, status === "cancelled" ? L("🚫 ট্রান্সফার বাতিল হয়েছে", "🚫 Transfer cancelled") : t.statusUpdated);
  const deleteTransfer = (transfer) => run(async () => {
    await deleteBranchTransfer({ transfer, actor });
    setTransfers((list) => (list || []).filter((row) => row.id !== transfer.id));
    logAudit({ shopId, user, profile, action: "delete", collection: "branchTransfers", docId: transfer.id, docNo: transfer.transferNo, note: transfer.branchName || "" });
    setSelId(null);
    setView("list");
  }, L("ট্রান্সফার মুছে ফেলা হয়েছে", "Transfer deleted"));
  const confirmReceive = (transfer, inputLines) => run(async () => {
    const result = await receiveBranchTransfer({ transfer, inputLines, settings, shop, actor });
    upsertTransfer(result.transfer);
    setReceiving(null);
    logAudit({ shopId, user, profile, action: "receive", collection: "branchTransfers", docId: transfer.id, docNo: transfer.transferNo, note: `R${result.receipt?.sequence || ""} · ${transfer.branchName || ""}` });
    return result;
  }, settings?.autoCreatePurchaseInvoiceOnReceive === true ? t.autoInvoiceCreated : t.receiveSaved);
  const createInvoice = (transfer, receipt) => run(async () => {
    const result = await createPurchaseInvoiceFromReceipt({ transfer, receiptId: receipt.id, shop, actor });
    upsertTransfer(result.transfer);
    return result;
  }, t.invoiceCreated);

  const printTransfer = (transfer) => {
    const cols = [{ label: "#" }, { label: "Item" }, { label: "Unit" }, { label: "Sent", align: "right" }, { label: "Received", align: "right" }, { label: "Cost", align: "right" }, { label: "Value", align: "right" }];
    const body = (transfer.items || []).map((item, index) => [
      String(index + 1),
      [item.name, item.code].filter(Boolean).join(" · "),
      item.unit || "",
      fq(item.quantity),
      fq(receivedQuantityForLine(transfer, item.lineId)),
      f2(item.unitCost),
      f2(numberValue(item.quantity) * numberValue(item.unitCost)),
    ]);
    body.push(["", "TOTAL", "", fq(sentQty(transfer)), fq(acceptedQty(transfer)), "", f2(transferTotalValue(transfer))]);
    const subtitle = [
      transfer.transferNo,
      fmtDay(transferSentDate(transfer)),
      `${transfer.sourceShopName || "Main Shop"} → ${transfer.branchName || ""}`,
      transfer.receiverName && `Receiver: ${transfer.receiverName}`,
      transfer.vendorName,
      statusLabel(transfer.status, "en"),
    ].filter(Boolean).join(" · ");
    printWithSettings(generateStatementHTML({ shopName: shop?.companyName || "", title: "BRANCH TRANSFER", subtitle, cols, rows: body }), { lang });
  };

  const receiveWindow = receiving && (
    <ReceiveWindow lang={lang} mobile={mobile} transfer={receiving} busy={busy} allowPartial={settings?.allowPartialReceive !== false} toast={toast}
      onClose={() => setReceiving(null)} onConfirm={(inputLines) => confirmReceive(receiving, inputLines)} />
  );
  const shellTitle = `🚚 ${t.title}`;

  if (view === "new" && canSendTransfer) {
  return (
      <SkinShell rootRef={rootRef} fitH={fitH} titleLeft={L("নতুন ট্রান্সফার", "New Transfer")} titleRight={shellTitle}>
        <NewTransferForm lang={lang} mobile={mobile} branches={branches} team={team} products={products} vendors={vendors}
          mainStock={mainStock} busy={busy} dirtyRef={dirtyRef} toast={toast} onSave={createTransfer} onBack={backToList} />
      </SkinShell>
    );
  }

  const sel = view === "detail" && selId ? transfers.find((row) => row.id === selId) : null;
  if (sel) {
    return (
      <SkinShell rootRef={rootRef} fitH={fitH} titleLeft={<>{sel.transferNo} <StatusBadge status={sel.status} lang={lang} /></>} titleRight={shellTitle}>
        <TransferDetail lang={lang} mobile={mobile} transfer={sel} isOwner={isOwner} canManage={canSendTransfer}
          canReceive={canReceiveRow(sel)} canCreateInvoice={canInvoiceRow(sel)} busy={busy}
          onStatus={changeStatus} onDelete={deleteTransfer} onReceive={setReceiving} onCreateInvoice={createInvoice}
          onPrint={printTransfer} onBack={backToList} />
        {receiveWindow}
      </SkinShell>
    );
  }

  const statusOptions = [
    ["", L("সব অবস্থা", "All statuses")],
    ["open", L("চলমান (শেষ হয়নি)", "Open (not finished)")],
    ...["draft", "packed", "dispatched", "in_transit", "partially_received", "discrepancy", "received", "cancelled"].map((key) => [key, statusLabel(key, lang)]),
  ];

  return (
    <SkinShell rootRef={rootRef} fitH={fitH} titleLeft={shellTitle} titleRight={section === "stock" ? t.stock : `${filtered.length} ${L("টি", "transfers")}`}>
      <div className="si-toolbar">
        {canSendTransfer && <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {t.newTransfer}</button>}
        <div className="si-pills">
          <button type="button" className={`pm-btn-secondary${section === "all" ? " is-active" : ""}`} onClick={() => setSection("all")}>{canSendTransfer ? L("সব ট্রান্সফার", "All transfers") : L("আমার ট্রান্সফার", "My transfers")}</button>
          {canReceiveTransfer && (
            <button type="button" className={`pm-btn-secondary${section === "incoming" ? " is-active" : ""}`} onClick={() => setSection("incoming")}>
              📥 {t.incoming}{incomingList.length ? ` (${incomingList.length})` : ""}
            </button>
          )}
          <button type="button" className={`pm-btn-secondary${section === "stock" ? " is-active" : ""}`} onClick={() => setSection("stock")}>📦 {t.stock}</button>
        </div>
        <span className="si-toolbar-gap" />
        <button type="button" className="pm-btn-secondary" disabled={busy} onClick={reload}>🔄 {t.refresh}</button>
      </div>

      {section === "stock" ? (
        <BranchStockView lang={lang} mobile={mobile} stockRows={stockRows} shopStock={shopStock} branches={branches} branchIds={stockBranchIds} loading={!invoiceRows} />
      ) : (
        <>
          <div className="si-kpis">
            <div className="si-kpi"><span>{t.totalTransfers}</span><b>{kpiRows.length}</b></div>
            <div className="si-kpi"><span>{t.waitingReceive}</span><b style={{ color: "#d97706" }}>{waiting}</b></div>
            <div className="si-kpi"><span>{t.discrepancy}</span><b style={{ color: "#dc2626" }}>{discrepancies}</b></div>
            <div className="si-kpi"><span>{t.completed}</span><b style={{ color: "#15803d" }}>{completed}</b></div>
            <div className="si-kpi"><span>{t.totalValue}</span><b>{f2(totalValue)}</b></div>
      </div>
          <div className="si-filters">
            <div className="si-search">
              <input className="pm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPlaceholder} />
              {search && <button type="button" onClick={() => setSearch("")}>✕</button>}
          </div>
            <select className="pm-input" style={{ width: mobile ? "100%" : 170 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {statusOptions.map(([key, label]) => <option key={key || "all"} value={key}>{label}</option>)}
            </select>
            <input type="date" className="pm-input" title={t.fromDate} style={{ width: mobile ? "calc(50% - 2px)" : 120 }} value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="pm-input" title={t.toDate} style={{ width: mobile ? "calc(50% - 2px)" : 120 }} value={to} onChange={(e) => setTo(e.target.value)} />
            {(search || statusFilter || from || to) && <button type="button" className="pm-btn-secondary" onClick={() => { setSearch(""); setStatusFilter(""); setFrom(""); setTo(""); }}>{t.clearFilter}</button>}
        </div>
          <div className="si-main is-all">
            <div className="si-box">
              {mobile ? filtered.map((transfer) => (
                <button key={transfer.id} type="button" className="si-mrow" onClick={() => openDetail(transfer)} style={transfer.status === "cancelled" ? { opacity: 0.6 } : undefined}>
                  <div className="si-mrow-top"><span style={{ color: BT_ACCENT }}>{transfer.transferNo}</span><StatusBadge status={transfer.status} lang={lang} /></div>
                  <div className="si-mrow-sub"><span>{fmtDay(transferSentDate(transfer))} · {transfer.branchName}</span><b>{f2(transferTotalValue(transfer))}</b></div>
                  <div className="si-mrow-sub">
                    <span>{transfer.receiverName || "—"}</span>
                    {TransferRemaining(transfer) > 0 && transfer.status !== "cancelled" && <span className="si-due">{t.remaining} {fq(TransferRemaining(transfer))}</span>}
                  </div>
                </button>
              )) : filtered.length > 0 && (
                <table className="pm-table">
                  <thead><tr>
                    <th style={{ width: 80 }}>{L("তারিখ", "Date")}</th>
                    <th style={{ width: 150 }}>{L("নম্বর", "No")}</th>
                    <th style={{ width: 130 }}>{t.branch}</th>
                    <th style={{ width: 120 }}>{t.assignedTo}</th>
                    <th>{L("পণ্য", "Items")}</th>
                    <th style={{ width: 64 }} className="si-num">{t.sent}</th>
                    <th style={{ width: 64 }} className="si-num">{t.received}</th>
                    <th style={{ width: 64 }} className="si-num">{t.remaining}</th>
                    <th style={{ width: 90 }} className="si-num">{L("মূল্য", "Value")}</th>
                    <th style={{ width: 120 }} className="si-center">{L("অবস্থা", "Status")}</th>
                    <th style={{ width: 84 }} />
                  </tr></thead>
                  <tbody>
                    {filtered.map((transfer) => {
                      const left = TransferRemaining(transfer);
                      return (
                        <tr key={transfer.id} className="pm-clickable" onClick={() => openDetail(transfer)} style={transfer.status === "cancelled" ? { color: "#6b7280" } : undefined} title={transfer.note || ""}>
                          <td>{fmtDay(transferSentDate(transfer))}</td>
                          <td className="si-strong" style={{ color: transfer.status === "cancelled" ? undefined : BT_ACCENT }}>{transfer.transferNo}</td>
                          <td title={transfer.branchName || ""}>{transfer.branchName}</td>
                          <td title={transfer.receiverName || ""}>{transfer.receiverName || "—"}</td>
                          <td title={itemSummary(transfer)}>{itemSummary(transfer)}</td>
                          <td className="si-num">{fq(sentQty(transfer))}</td>
                          <td className="si-num" style={{ color: "#15803d" }}>{fq(acceptedQty(transfer))}</td>
                          <td className="si-num si-strong" style={left > 0 && transfer.status !== "cancelled" ? { color: "#d97706" } : undefined}>{fq(left)}</td>
                          <td className="si-num">{f2(transferTotalValue(transfer))}</td>
                          <td className="si-center"><StatusBadge status={transfer.status} lang={lang} /></td>
                          <td className="si-center" style={{ padding: "1px 2px" }}>
                            {canReceiveRow(transfer) && <button type="button" className="pm-btn-secondary" style={{ minHeight: 17, padding: "0 6px" }} disabled={busy} onClick={(e) => { e.stopPropagation(); setReceiving(transfer); }}>📥 {t.receive}</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {!filtered.length && (
                <div className="si-empty">
                  {section === "incoming" ? t.noIncoming
                    : !canSendTransfer && !visibleTransfers.length ? t.notAssigned
                    : visibleTransfers.length ? L("এই ফিল্টারে কিছু নেই", "Nothing matches these filters")
                    : t.noTransfers}
                </div>
              )}
            </div>
          </div>
          <div className="si-statusbar">
            <span>{L("দেখাচ্ছে", "Showing")} <b>{filtered.length}</b> / {visibleTransfers.length}</span>
            <span>{L("ট্রান্সফার = দোকানের ভেতরে মাল সরানো। এতে মোট স্টক, ক্রয় বা সাপ্লায়ারের বাকি বাড়ে না।", "A transfer moves goods inside your shop. It does not change total stock, purchases or supplier dues.")}</span>
          </div>
        </>
      )}
      {receiveWindow}
    </SkinShell>
  );
}

export function BranchTransferPurchaseImport({ lang, th, s, shopId, user, profile, shop, settings, toast, onInvoiceCreated }) {
  const t = bt(lang);
  const actor = useMemo(() => actorFrom(user, profile), [user, profile]);
  const [transfers, setTransfers] = useShopCollection(BRANCH_TRANSFER_COLLECTIONS.TRANSFERS, shopId);
  const [busyId, setBusyId] = useState("");

  const pending = useMemo(() => {
    if (settings?.enabled !== true || settings?.autoCreatePurchaseInvoiceOnReceive !== false) return [];
    const rows = [];
    for (const transfer of transfers) {
      for (const receipt of transfer.receipts || []) {
        if (numberValue(receipt.acceptedTotal) > 0 && !receipt.purchaseInvoiceId) rows.push({ transfer, receipt });
      }
    }
    return rows;
  }, [transfers, settings?.enabled, settings?.autoCreatePurchaseInvoiceOnReceive]);

  if (!pending.length) return null;

  const createInvoice = async (transfer, receipt) => {
    setBusyId(receipt.id);
    try {
      const result = await createPurchaseInvoiceFromReceipt({ transfer, receiptId: receipt.id, shop, actor, settings });
      setTransfers(await listShopRecords(BRANCH_TRANSFER_COLLECTIONS.TRANSFERS, shopId));
      onInvoiceCreated?.(result.invoice);
      toast(t.invoiceCreated);
    } catch (error) {
      toast(normalizeError(error, lang), "err");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div style={{ ...s.card, marginBottom: 14, border: "1px solid #f97316" }}>
      <div style={s.settingsLbl}>🚚 {t.pendingInvoiceTitle}</div>
      <div style={{ color: th.txtMuted, fontSize: 11, marginBottom: 10 }}>{t.pendingInvoiceHelp}</div>
      <div style={{ display: "grid", gap: 7 }}>
        {pending.map(({ transfer, receipt }) => (
          <div key={receipt.id} style={{ background: th.bgInp, borderRadius: 9, padding: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ color: th.txtPrimary, fontWeight: 800 }}>{transfer.transferNo} · {transfer.branchName}</div>
              <div style={{ color: th.txtMuted, fontSize: 10, marginTop: 3 }}>R{receipt.sequence} · Accepted {receipt.acceptedTotal}</div>
            </div>
            <NativeButton s={s} tone="primary" disabled={busyId === receipt.id} onClick={() => createInvoice(transfer, receipt)}>{t.createInvoice}</NativeButton>
          </div>
        ))}
      </div>
    </div>
  );
}

export function branchTransferMenuLabel(lang, waiting = 0) {
  return `🚚 ${bt(lang).menu}${waiting > 0 ? ` (${waiting})` : ""}`;
}

/** Transfers this user can receive right now — the owner, or the salesman assigned to the branch. Newest first. */
export function useBranchTransferInbox({ shopId, user, profile, enabled }) {
  const [transfers] = useShopCollection(BRANCH_TRANSFER_COLLECTIONS.TRANSFERS, enabled ? shopId : "");
  return useMemo(() => {
    const actor = actorFrom(user, profile);
    if (!enabled || !canReceiveBranchTransferActor(actor)) return [];
    const isOwner = String(actor.role || "").toLowerCase() === "owner";
    return transfers
      .filter((transfer) => isReceivable(transfer) && (isOwner || transferAssignedToActor(transfer, actor)))
      .sort((a, b) => String(b.dispatchedAt || b.createdAt || "").localeCompare(String(a.dispatchedAt || a.createdAt || "")));
  }, [transfers, user, profile, enabled]);
}

export function branchTransferSettingsCopy(lang, enabled) {
  const t = bt(lang);
  return {
    title: t.settingsTitle,
    subtitle: enabled ? t.settingsSubOn : t.settingsSubOff,
  };
}
