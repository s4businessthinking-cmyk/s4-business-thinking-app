import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ProductTypeaheadInput } from "../components/ProductTypeaheadInput.jsx";
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
} from "./branchTransferService.js";
import {
  BRANCH_TRANSFER_STATUSES,
  DEFAULT_BRANCH_TRANSFER_SETTINGS,
  numberValue,
  receivedQuantityForLine,
  remainingQuantityForLine,
  statusLabel,
} from "./branchTransferDomain.js";

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
    canUse: settings.enabled === true && (Boolean(isOwner) || canSend || assigned),
    canSend,
  };
}

function PaymentMethodChoice({ lang, s, th, value, onChange }) {
  const t = bt(lang);
  const methods = [
    ["cash", t.autoPaymentCash],
    ["credit", t.autoPaymentCredit],
  ];
  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${th.border}` }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: th.txtPrimary, marginBottom: 4 }}>{t.autoPayment}</div>
      <div style={{ fontSize: 12, color: th.txtMuted, lineHeight: 1.5, marginBottom: 9 }}>{t.autoPaymentHelp}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
        {methods.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            style={{ ...s.stBtn, borderColor: value === key ? "#f97316" : th.borderMid, background: value === key ? "rgba(249,115,22,0.14)" : s.stBtn?.background, color: value === key ? "#f97316" : th.txtMuted }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
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

function StatusPill({ status, lang, th }) {
  const color = status === "received" ? "#22c55e" : status === "cancelled" || status === "discrepancy" ? "#ef4444" : status === "partially_received" ? "#f59e0b" : "#3b82f6";
  return <span style={{ border: `1px solid ${color}`, color, borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, background: th.bgInp }}>{statusLabel(status, lang)}</span>;
}

function Metric({ s, th, label, value, color = "#f97316" }) {
  return (
    <div style={{ ...s.card, textAlign: "center", padding: 12 }}>
      <div style={{ fontSize: 19, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 10, color: th.txtMuted, marginTop: 3 }}>{label}</div>
    </div>
  );
}

function NewTransfer({ lang, s, th, branches, team, products, vendors = [], shopId, shop, actor, busy, onCreated, toast, isDesktop }) {
  const t = bt(lang);
  const branchRef = useRef(null);
  const salesmanRef = useRef(null);
  const qtyRef = useRef(null);
  const vendorListId = useId().replaceAll(":", "-");
  const [branchId, setBranchId] = useState("");
  const [salesmanKey, setSalesmanKey] = useState("");
  const [vendor, setVendor] = useState({ vendorId: null, vendorName: "", vendorMobile: "", supplierInvoiceNo: "" });
  const [current, setCurrent] = useState({
    productId: null,
    name: "",
    code: "",
    brand: "",
    unit: "Pcs",
    quantity: "",
    unitCost: "",
  });
  const [items, setItems] = useState([]);
  const [purchaseInvoicePaymentMethod, setPurchaseInvoicePaymentMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [expectedDate, setExpectedDate] = useState("");

  const activeBranches = branches.filter((branch) => branch.active !== false);
  const activeSalesmen = team.filter(
    (member) =>
      member?.role !== "owner" &&
      member?.status !== "disabled" &&
      member?.isDeleted !== true
  );
  const activeProducts = products.filter((product) => product.isDeleted !== true && product.deleted !== true);
  const activeVendors = vendors.filter((row) => row?.isDeleted !== true && row?.status !== "disabled");

  const teamMemberKey = (member) =>
    String(member?.uid || member?.firebaseUid || member?.id || member?.localUserId || member?.username || "");

  const selectBranch = (nextBranchId) => {
    setBranchId(nextBranchId);
    const branch = activeBranches.find((row) => row.id === nextBranchId);
    if (!branch) {
      setSalesmanKey("");
      return;
    }

    const defaultMember = activeSalesmen.find((member) => {
      const ids = [member?.uid, member?.firebaseUid, member?.id, member?.localUserId]
        .filter(Boolean)
        .map(String);
      return ids.includes(String(branch.receiverUserId || "")) ||
        ids.includes(String(branch.receiverLocalUserId || ""));
    });

    setSalesmanKey(defaultMember ? teamMemberKey(defaultMember) : "");
  };

  const updateVendorName = (value) => {
    const clean = String(value || "");
    const exact = activeVendors.find(
      (row) => String(row.vendorName || "").trim().toLocaleLowerCase() === clean.trim().toLocaleLowerCase()
    );
    setVendor((prev) => ({
      ...prev,
      vendorName: clean,
      vendorId: exact?.id || null,
      vendorMobile: exact?.mobileNumber || exact?.whatsappNumber || exact?.phone || "",
    }));
  };

  const updateCurrent = (key, value, { clearProduct = false } = {}) => {
    setCurrent((prev) => ({
      ...prev,
      [key]: value,
      ...(clearProduct ? { productId: null } : {}),
    }));
  };

  const selectProduct = (product) => {
    if (!product) return;
    setCurrent({
      productId: product.id,
      name: product.name || "",
      code: product.code || product.barcode || product.ean || "",
      brand: product.brand || "",
      unit: product.unit || "Pcs",
      quantity: "",
      unitCost: String(
        product.landingCost ||
        product.vatExclusive ||
        product.purchasePrice ||
        ""
      ),
    });
    window.setTimeout(() => qtyRef.current?.focus(), 80);
  };

  const resetCurrent = () => setCurrent({
    productId: null,
    name: "",
    code: "",
    brand: "",
    unit: "Pcs",
    quantity: "",
    unitCost: "",
  });

  const addItem = () => {
    const product = activeProducts.find((row) => row.id === current.productId);
    if (!product) {
      return toast(
        lang === "bn"
          ? "Product Master থেকে item name বা model/code লিখে product নির্বাচন করুন"
          : "Select a product from Product Master by item name or model/code",
        "err"
      );
    }
    if (numberValue(current.quantity) <= 0) {
      return toast(
        lang === "bn" ? "সঠিক quantity দিন" : "Enter a valid quantity",
        "err"
      );
    }

    setItems((prev) => [...prev, {
      lineId: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId: product.id,
      name: product.name || current.name,
      code: product.code || product.barcode || product.ean || current.code || "",
      brand: product.brand || current.brand || "",
      unit: product.unit || current.unit || "Pcs",
      quantity: numberValue(current.quantity),
      unitCost: numberValue(current.unitCost),
    }]);
    resetCurrent();
  };

  const handleEnterAdd = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addItem();
    }
  };

  const save = async (initialStatus) => {
    if (busy) return;
    const branch = activeBranches.find((row) => row.id === branchId);
    const salesman = activeSalesmen.find((member) => teamMemberKey(member) === salesmanKey);

    if (!branch) {
      toast(t.branchRequired, "err");
      window.setTimeout(() => branchRef.current?.focus(), 50);
      return;
    }

    if (!salesman) {
      toast(t.salesmanRequired, "err");
      window.setTimeout(() => salesmanRef.current?.focus(), 50);
      return;
    }

    if (!items.length) {
      toast(t.itemsRequired, "err");
      return;
    }

    const receiver = {
      receiverUserId: String(salesman.firebaseUid || salesman.uid || salesman.id || ""),
      receiverFirebaseUid: String(salesman.firebaseUid || salesman.uid || ""),
      receiverMemberId: String(salesman.id || ""),
      receiverLocalUserId: String(salesman.localUserId || ""),
      receiverUsername: String(salesman.username || ""),
      receiverEmail: String(salesman.email || salesman.authEmail || ""),
      receiverName: salesman.personName || salesman.username || "",
    };

    const result = await onCreated({
      shopId,
      shop,
      branch,
      receiver,
      vendor: {
        vendorId: vendor.vendorId || null,
        vendorName: vendor.vendorName.trim(),
        vendorMobile: vendor.vendorMobile || "",
        supplierInvoiceNo: vendor.supplierInvoiceNo.trim(),
      },
      items,
      purchaseInvoicePaymentMethod,
      note,
      expectedDeliveryDate: expectedDate,
      initialStatus,
      actor,
    });
    if (result) {
      setBranchId("");
      setSalesmanKey("");
      setVendor({ vendorId: null, vendorName: "", vendorMobile: "", supplierInvoiceNo: "" });
      setItems([]);
      setPurchaseInvoicePaymentMethod("cash");
      setNote("");
      setExpectedDate("");
      resetCurrent();
    }
  };

  return (
    <div style={s.card}>
      <div style={s.settingsLbl}>🚚 {t.newTransfer}</div>
      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(auto-fit,minmax(220px,1fr))" : "minmax(0,1fr)", gap: 8, marginBottom: 10 }}>
        <select
          ref={branchRef}
          style={s.sel}
          value={branchId}
          onChange={(event) => selectBranch(event.target.value)}
        >
          <option value="">{t.chooseBranch}</option>
          {activeBranches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}{branch.code ? ` · ${branch.code}` : ""}
            </option>
          ))}
        </select>

        <select
          ref={salesmanRef}
          style={s.sel}
          value={salesmanKey}
          onChange={(event) => setSalesmanKey(event.target.value)}
        >
          <option value="">{t.chooseSalesman}</option>
          {activeSalesmen.map((member) => {
            const key = teamMemberKey(member);
            const label = member.personName || member.username || key;
            const position = member.position || "Salesman";
            return (
              <option key={key} value={key}>
                {label}{position ? ` · ${position}` : ""}
              </option>
            );
          })}
        </select>
      </div>

      <div style={{ color: th.txtMuted, fontSize: 11, marginBottom: 7 }}>{t.vendorHelp}</div>
      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(auto-fit,minmax(220px,1fr))" : "minmax(0,1fr)", gap: 8, marginBottom: 10 }}>
        <div>
          <input
            list={vendorListId}
            style={s.inp}
            value={vendor.vendorName}
            onChange={(event) => updateVendorName(event.target.value)}
            placeholder={t.vendorName}
          />
          <datalist id={vendorListId}>
            {activeVendors.map((row) => <option key={row.id || row.vendorName} value={row.vendorName || ""} />)}
          </datalist>
        </div>
        <input
          style={s.inp}
          value={vendor.supplierInvoiceNo}
          onChange={(event) => setVendor((prev) => ({ ...prev, supplierInvoiceNo: event.target.value }))}
          placeholder={t.vendorInvoiceNo}
        />
      </div>

      {!activeProducts.length && <div style={{ color: th.txtMuted, fontSize: 12, marginBottom: 8 }}>{t.noProducts}</div>}

      <div style={{
        border: `1px dashed ${th.borderMid || th.border}`,
        borderRadius: 12,
        background: th.bgInp,
        padding: 12,
      }}>
        <PaymentMethodChoice lang={lang} s={s} th={th} value={purchaseInvoicePaymentMethod} onChange={setPurchaseInvoicePaymentMethod} />
        <div style={{ color: th.txtMuted, fontSize: 11, marginBottom: 9 }}>
          🔎 {t.selectExistingProduct}
        </div>

        <ProductTypeaheadInput
          products={activeProducts}
          value={current.name}
          onChange={(value) => updateCurrent("name", value, { clearProduct: true })}
          onSelectProduct={selectProduct}
          field="name"
          placeholder={`${t.itemName} *`}
          th={th}
          lang={lang}
          onKeyDown={handleEnterAdd}
          style={{ ...s.inp, marginBottom: 8, fontWeight: 700 }}
        />

        <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(auto-fit,minmax(190px,1fr))" : "minmax(0,1fr)", gap: 8, marginBottom: 8 }}>
          <ProductTypeaheadInput
            products={activeProducts}
            value={current.code}
            onChange={(value) => updateCurrent("code", value, { clearProduct: true })}
            onSelectProduct={selectProduct}
            field="code"
            placeholder={t.modelCode}
            th={th}
            lang={lang}
            onKeyDown={handleEnterAdd}
            style={s.inp}
          />
          <input
            style={s.inp}
            value={current.brand}
            onChange={(event) => updateCurrent("brand", event.target.value)}
            placeholder={t.brand}
            readOnly={Boolean(current.productId)}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "minmax(90px,0.8fr) minmax(90px,0.7fr) minmax(150px,1.4fr) auto" : "minmax(0,1fr)", gap: 8, alignItems: "end" }}>
          <input
            ref={qtyRef}
            style={s.inp}
            value={current.quantity}
            onChange={(event) => updateCurrent("quantity", event.target.value)}
            onKeyDown={handleEnterAdd}
            placeholder={`${t.quantity} *`}
            inputMode="decimal"
          />
          <select style={s.sel} value={current.unit} onChange={(event) => updateCurrent("unit", event.target.value)}>
            <option value="Pcs">Pcs</option>
            <option value="Set">Set</option>
            <option value="Box">Box</option>
            <option value="Pair">Pair</option>
          </select>
          <input
            style={s.inp}
            value={current.unitCost}
            onChange={(event) => updateCurrent("unitCost", event.target.value)}
            onKeyDown={handleEnterAdd}
            placeholder={t.unitCost}
            inputMode="decimal"
          />
          <NativeButton s={s} tone="primary" onClick={addItem} style={isDesktop ? {} : { width: "100%" }}>{t.addItem} →</NativeButton>
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ marginTop: 10, border: `1px solid ${th.border}`, borderRadius: 10, overflow: "hidden" }}>
          {items.map((item, index) => (
            <div key={item.lineId} style={{ display: "grid", gridTemplateColumns: isDesktop ? "24px minmax(0,1fr) auto auto" : "22px minmax(0,1fr) auto", gap: 8, alignItems: "center", padding: 9, borderTop: index ? `1px solid ${th.border}` : "none", background: th.bgInp }}>
              <span style={{ color: th.txtMuted }}>{index + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: th.txtPrimary, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                <div style={{ color: th.txtMuted, fontSize: 10, marginTop: 2 }}>
                  {[item.code, item.brand].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <span style={{ color: th.txtMuted, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", gridColumn: isDesktop ? "auto" : "2 / 3" }}>{item.quantity} {item.unit} · {item.unitCost}</span>
              <button type="button" style={s.dlBtn} onClick={() => setItems((prev) => prev.filter((row) => row.lineId !== item.lineId))}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(auto-fit,minmax(220px,1fr))" : "minmax(0,1fr)", gap: 8, marginTop: 10 }}>
        <input type="date" style={s.inp} value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        <input style={s.inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.note} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <NativeButton s={s} disabled={busy} onClick={() => save(BRANCH_TRANSFER_STATUSES.DRAFT)}>{t.saveDraft}</NativeButton>
        <NativeButton s={s} tone="primary" disabled={busy} onClick={() => save(BRANCH_TRANSFER_STATUSES.DISPATCHED)}>{t.dispatchNow}</NativeButton>
      </div>
    </div>
  );
}

function ReceiveModal({ lang, s, th, transfer, busy, onClose, onConfirm, isDesktop }) {
  const t = bt(lang);
  const [lines, setLines] = useState(() => (transfer.items || []).map((item) => ({
    lineId: item.lineId,
    receivedQty: String(remainingQuantityForLine(transfer, item)),
    damagedQty: "0",
    issueNote: "",
  })));
  const update = (lineId, key, value) => setLines((prev) => prev.map((line) => line.lineId === lineId ? { ...line, [key]: value } : line));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "30px 12px" }}>
      <div style={{ width: "100%", maxWidth: 650, background: th.bgCard, border: `1px solid ${th.border}`, borderRadius: 16, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <div style={{ color: th.txtPrimary, fontWeight: 900 }}>📦 {transfer.transferNo} · {t.receive}</div>
          <NativeButton s={s} onClick={onClose}>✕</NativeButton>
        </div>
        {(transfer.items || []).map((item) => {
          const line = lines.find((row) => row.lineId === item.lineId) || {};
          return (
            <div key={item.lineId} style={{ ...s.card, marginBottom: 8 }}>
              <div style={{ color: th.txtPrimary, fontWeight: 800, marginBottom: 8 }}>{item.name} · {t.remaining}: {remainingQuantityForLine(transfer, item)}</div>
              <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "minmax(0,1fr)", gap: 8 }}>
                <input style={s.inp} value={line.receivedQty} onChange={(e) => update(item.lineId, "receivedQty", e.target.value)} placeholder={t.received} inputMode="decimal" />
                <input style={s.inp} value={line.damagedQty} onChange={(e) => update(item.lineId, "damagedQty", e.target.value)} placeholder={t.damaged} inputMode="decimal" />
              </div>
              <input style={{ ...s.inp, marginTop: 8 }} value={line.issueNote} onChange={(e) => update(item.lineId, "issueNote", e.target.value)} placeholder={t.issueNote} />
            </div>
          );
        })}
        <NativeButton s={s} tone="primary" disabled={busy} onClick={() => onConfirm(lines)} style={{ width: "100%" }}>{t.confirmReceive}</NativeButton>
      </div>
    </div>
  );
}

function TransferCard({ lang, s, th, transfer, isOwner, canManageTransferStatus = false, actor, busy, onStatus, onReceive, isDesktop }) {
  const t = bt(lang);
  const [expanded, setExpanded] = useState(false);
  const remaining = TransferRemaining(transfer);
  const canReceive = !isOwner && canReceiveBranchTransferActor(actor) && transferAssignedToActor(transfer, actor) && remaining > 0 && ["dispatched", "in_transit", "partially_received", "discrepancy"].includes(transfer.status);
  const sentDate = transferSentDate(transfer);

  return (
    <div style={s.card}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: th.txtPrimary, fontWeight: 900 }}>{transfer.transferNo}</div>
          <div style={{ color: th.txtMuted, fontSize: 11, marginTop: 4 }}>{t.source}: {transfer.sourceShopName || "Main Shop"} → {t.branch}: {transfer.branchName}</div>
          <div style={{ color: th.txtMuted, fontSize: 10, marginTop: 3 }}>{t.assignedTo}: {transfer.receiverName || "—"} · {t.createdBy}: {transfer.createdByName || "—"}</div>
          <div style={{ color: th.txtMuted, fontSize: 10, marginTop: 3 }}>
            {t.transferDate}: {sentDate || "—"}
            {transfer.expectedDeliveryDate ? ` · ${t.expectedDate}: ${transfer.expectedDeliveryDate}` : ""}
          </div>
          {(transfer.vendorName || transfer.supplierInvoiceNo) && (
            <div style={{ color: "#a855f7", fontSize: 10, marginTop: 3 }}>
              {transfer.vendorName || "—"}{transfer.supplierInvoiceNo ? ` · 🧾 ${transfer.supplierInvoiceNo}` : ""}
            </div>
          )}
        </div>
        <StatusPill status={transfer.status} lang={lang} th={th} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 10, padding: "8px 0", borderTop: `1px solid ${th.border}`, borderBottom: `1px solid ${th.border}` }}>
        <span style={{ color: th.txtMuted, fontSize: 11 }}>
          {(transfer.items || []).length} {t.itemsCount} · {t.remaining}: {remaining} · {t.totalValue}: {transferTotalValue(transfer).toFixed(2)}
        </span>
        <NativeButton s={s} onClick={() => setExpanded((value) => !value)}>
          {expanded ? t.hideDetails : t.viewDetails}
        </NativeButton>
      </div>

      {expanded && (
        <div style={{ marginTop: 10 }}>
          <div style={{ color: th.txtMuted, fontSize: 10, fontWeight: 800, marginBottom: 6 }}>{t.productDetails}</div>
          {(transfer.items || []).map((item, index) => {
            const accepted = receivedQuantityForLine(transfer, item.lineId);
            const damaged = damagedQuantityForLine(transfer, item.lineId);
            const itemRemaining = remainingQuantityForLine(transfer, item);
            const issueNotes = (transfer.receipts || [])
              .flatMap((receipt) => receipt.lines || [])
              .filter((line) => line.lineId === item.lineId && line.issueNote)
              .map((line) => line.issueNote);
            return (
              <div key={item.lineId} style={{ background: th.bgInp, borderRadius: 9, padding: 10, marginBottom: 7 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: th.txtPrimary, fontSize: 12, fontWeight: 800 }}>{index + 1}. {item.name}</div>
                    <div style={{ color: th.txtMuted, fontSize: 10, marginTop: 3 }}>{[item.code, item.brand, item.unit].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <div style={{ color: th.txtMuted, fontSize: 10, textAlign: "right", whiteSpace: "nowrap" }}>
                    {t.unitCost}: {numberValue(item.unitCost).toFixed(2)}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(4,minmax(60px,1fr))" : "repeat(2,minmax(0,1fr))", gap: 5, marginTop: 8 }}>
                  {[
                    [t.sent, item.quantity],
                    [t.received, accepted],
                    [t.damaged, damaged],
                    [t.remaining, itemRemaining],
                  ].map(([label, value]) => (
                    <div key={label} style={{ textAlign: "center", border: `1px solid ${th.border}`, borderRadius: 7, padding: "6px 3px" }}>
                      <div style={{ color: th.txtPrimary, fontSize: 11, fontWeight: 800 }}>{value}</div>
                      <div style={{ color: th.txtMuted, fontSize: 9, marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
                {issueNotes.length > 0 && <div style={{ color: "#ef4444", fontSize: 10, marginTop: 7 }}>{t.issueNote}: {issueNotes.join(" · ")}</div>}
              </div>
            );
          })}
          {transfer.note && <div style={{ color: th.txtMuted, fontSize: 10, marginTop: 6 }}>{t.note}: {transfer.note}</div>}
        </div>
      )}

      {(transfer.receipts || []).length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ color: th.txtMuted, fontSize: 10, fontWeight: 800, marginBottom: 6 }}>{t.receiptHistory}</div>
          {(transfer.receipts || []).map((receipt) => (
            <div key={receipt.id} style={{ background: th.bgInp, borderRadius: 8, padding: 8, marginBottom: 5, color: th.txtMuted, fontSize: 10 }}>
              R{receipt.sequence} · {receipt.receivedByName || "—"} · Accepted {receipt.acceptedTotal || 0} · Damaged {receipt.damagedTotal || 0}
              {receipt.purchaseInvoiceId && <span style={{ color: "#22c55e" }}> · PI ✓</span>}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
        {canManageTransferStatus && transfer.status === "draft" && <NativeButton s={s} disabled={busy} onClick={() => onStatus(transfer, "packed")}>{t.packed}</NativeButton>}
        {canManageTransferStatus && ["draft", "packed"].includes(transfer.status) && <NativeButton s={s} tone="primary" disabled={busy} onClick={() => onStatus(transfer, "dispatched")}>{t.dispatch}</NativeButton>}
        {canManageTransferStatus && transfer.status === "dispatched" && <NativeButton s={s} disabled={busy} onClick={() => onStatus(transfer, "in_transit")}>{t.inTransit}</NativeButton>}
        {canManageTransferStatus && transfer.status === "discrepancy" && remaining === 0 && <NativeButton s={s} tone="primary" disabled={busy} onClick={() => onStatus(transfer, "received")}>{t.completed}</NativeButton>}
        {canManageTransferStatus && !["received", "cancelled"].includes(transfer.status) && <NativeButton s={s} tone="danger" disabled={busy} onClick={() => onStatus(transfer, "cancelled")}>{t.cancel}</NativeButton>}
        {canReceive && <NativeButton s={s} tone="primary" disabled={busy} onClick={() => onReceive(transfer)}>{t.receive}</NativeButton>}
      </div>
    </div>
  );
}

function TransferList(props) {
  const { transfers, lang, s, th } = props;
  const t = bt(lang);
  if (!transfers.length) return <div style={{ ...s.card, color: th.txtMuted, textAlign: "center", padding: 35 }}>{props.emptyText || t.noTransfers}</div>;
  return <div style={{ display: "grid", gap: 9 }}>{transfers.map((transfer) => <TransferCard key={transfer.id} transfer={transfer} {...props} />)}</div>;
}

function StockList({ lang, s, th, stockRows, branchIds }) {
  const t = bt(lang);
  const rows = stockRows.filter((row) => branchIds.includes(row.branchId) && numberValue(row.quantity) !== 0);
  if (!rows.length) return <div style={{ ...s.card, color: th.txtMuted, textAlign: "center", padding: 35 }}>{t.noStock}</div>;
  return <div style={{ display: "grid", gap: 8 }}>{rows.map((row) => (
    <div key={row.id} style={{ ...s.card, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
      <div><div style={{ color: th.txtPrimary, fontWeight: 800 }}>{row.productName}</div><div style={{ color: th.txtMuted, fontSize: 10 }}>{row.branchName} · {row.productCode || "—"}</div></div>
      <div style={{ color: "#22c55e", fontWeight: 900 }}>{row.quantity} {row.unit || "Pcs"}</div>
    </div>
  ))}</div>;
}

export function BranchTransferWorkspace({ lang, th, s, shopId, user, profile, team, products, vendors = [], shop, settings, toast, isDesktop }) {
  const t = bt(lang);
  const actor = useMemo(() => actorFrom(user, profile), [user, profile]);
  const isOwner = profile?.role === "owner";
  const canSendTransfer = isOwner || profile?.permissions?.sendBranchTransfer === true;
  const canReceiveTransfer = canReceiveBranchTransferActor(actor);
  const [branches, setBranches] = useShopCollection(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, shopId);
  const [transfers, setTransfers] = useShopCollection(BRANCH_TRANSFER_COLLECTIONS.TRANSFERS, shopId);
  const [stockRows] = useShopCollection(BRANCH_TRANSFER_COLLECTIONS.STOCK_BALANCES, shopId);
  const [tab, setTab] = useState(canSendTransfer ? "overview" : "incoming");
  const [busy, setBusy] = useState(false);
  const [receiving, setReceiving] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => setTab(canSendTransfer ? "overview" : "incoming"), [canSendTransfer]);

  const assignedTransfers = useMemo(
    () => canReceiveTransfer ? transfers.filter((transfer) => transferAssignedToActor(transfer, actor)) : [],
    [transfers, actor, canReceiveTransfer]
  );
  const visibleTransfers = useMemo(
    () => (canSendTransfer ? transfers : assignedTransfers),
    [transfers, assignedTransfers, canSendTransfer]
  );

  const filteredTransfers = useMemo(() => {
    const queryText = searchText.trim().toLocaleLowerCase();
    return visibleTransfers.filter((transfer) => {
      if (queryText && !transferSearchHaystack(transfer).includes(queryText)) return false;
      const sentDate = transferSentDate(transfer);
      if (fromDate && (!sentDate || sentDate < fromDate)) return false;
      if (toDate && (!sentDate || sentDate > toDate)) return false;
      return true;
    });
  }, [visibleTransfers, searchText, fromDate, toDate]);

  const assignedBranches = useMemo(
    () =>
      branches.filter(
        (branch) =>
          branch.active !== false &&
          (
            isOwner ||
            assignedTransfers.some((transfer) => transfer.branchId === branch.id)
          )
      ),
    [branches, isOwner, assignedTransfers]
  );
  const assignedIds = useMemo(
    () => [...new Set(assignedBranches.map((branch) => branch.id))],
    [assignedBranches]
  );
  const incoming = filteredTransfers.filter(
    (transfer) =>
      (isOwner || (canReceiveTransfer && transferAssignedToActor(transfer, actor))) &&
      TransferRemaining(transfer) > 0 &&
      ["dispatched", "in_transit", "partially_received", "discrepancy"].includes(transfer.status)
  );

  const reload = async () => {
    const [nextBranches, nextTransfers] = await Promise.all([
      listShopRecords(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, shopId),
      listShopRecords(BRANCH_TRANSFER_COLLECTIONS.TRANSFERS, shopId),
    ]);
    setBranches(nextBranches);
    setTransfers(nextTransfers);
  };

  const run = async (work, success) => {
    setBusy(true);
    try {
      const result = await work();
      await reload();
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

  const clearFilters = () => {
    setSearchText("");
    setFromDate("");
    setToDate("");
  };

  const tabs = canSendTransfer
    ? [["overview", t.overview], ["new", t.newTransfer], ...(!isOwner ? [["incoming", t.incoming], ["stock", t.stock]] : []), ["transfers", t.transfers]]
    : [["incoming", t.incoming], ["transfers", t.transfers], ["stock", t.stock]];
  const waiting = filteredTransfers.filter((transfer) => TransferRemaining(transfer) > 0 && !["draft", "packed", "cancelled"].includes(transfer.status)).length;
  const completed = filteredTransfers.filter((transfer) => transfer.status === "received").length;
  const discrepancies = filteredTransfers.filter((transfer) => transfer.status === "discrepancy").length;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={s.secTitle}>🚚 {t.title}</div>
        <NativeButton s={s} disabled={busy} onClick={reload}>🔄 {t.refresh}</NativeButton>
      </div>

      <div style={{ ...s.card, marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "minmax(220px,2fr) repeat(2,minmax(145px,1fr)) auto" : "minmax(0,1fr)", gap: 8, alignItems: "end" }}>
          <input
            style={s.inp}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={`🔎 ${t.searchPlaceholder}`}
          />
          <label style={{ color: th.txtMuted, fontSize: 10 }}>
            {t.fromDate}
            <input type="date" style={{ ...s.inp, marginTop: 4 }} value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label style={{ color: th.txtMuted, fontSize: 10 }}>
            {t.toDate}
            <input type="date" style={{ ...s.inp, marginTop: 4 }} value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <NativeButton s={s} onClick={clearFilters} style={isDesktop ? {} : { width: "100%" }}>{t.clearFilter}</NativeButton>
        </div>
        <div style={{ color: th.txtMuted, fontSize: 10, marginTop: 7 }}>
          {filteredTransfers.length} {t.filterResult}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, marginBottom: 10 }}>
        {tabs.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} style={{ ...s.stBtn, whiteSpace: "nowrap", background: tab === key ? "#f97316" : s.stBtn?.background, color: tab === key ? "#fff" : th.txtMuted, borderColor: tab === key ? "#f97316" : th.borderMid }}>{label}</button>
        ))}
      </div>

      {tab === "overview" && canSendTransfer && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "repeat(4,1fr)" : "repeat(2,1fr)", gap: 8 }}>
            <Metric s={s} th={th} label={t.totalTransfers} value={filteredTransfers.length} />
            <Metric s={s} th={th} label={t.waitingReceive} value={waiting} color="#f59e0b" />
            <Metric s={s} th={th} label={t.completed} value={completed} color="#22c55e" />
            <Metric s={s} th={th} label={t.discrepancy} value={discrepancies} color="#ef4444" />
          </div>
          <TransferList lang={lang} s={s} th={th} transfers={filteredTransfers.slice(0, 5)} isOwner={isOwner} canManageTransferStatus={canSendTransfer} actor={actor} busy={busy} isDesktop={isDesktop} onStatus={(transfer, status) => run(() => updateTransferStatus({ transfer, status, actor }), t.statusUpdated)} onReceive={setReceiving} />
        </div>
      )}

      {tab === "new" && canSendTransfer && <NewTransfer lang={lang} s={s} th={th} branches={branches} team={team} products={products} vendors={vendors} shopId={shopId} shop={shop} actor={actor} busy={busy} toast={toast} isDesktop={isDesktop} onCreated={(payload) => run(async () => { const created = await createBranchTransfer(payload); setTab("transfers"); return created; }, t.transferSaved)} />}

      {tab === "incoming" && !isOwner && (
        assignedBranches.length
          ? <TransferList lang={lang} s={s} th={th} transfers={incoming} isOwner={isOwner} canManageTransferStatus={false} actor={actor} busy={busy} isDesktop={isDesktop} emptyText={t.noIncoming} onStatus={() => {}} onReceive={setReceiving} />
          : <div style={{ ...s.card, color: th.txtMuted, textAlign: "center", padding: 35 }}>{t.notAssigned}</div>
      )}

      {tab === "transfers" && <TransferList lang={lang} s={s} th={th} transfers={filteredTransfers} isOwner={isOwner} canManageTransferStatus={canSendTransfer} actor={actor} busy={busy} isDesktop={isDesktop} onStatus={(transfer, status) => run(() => updateTransferStatus({ transfer, status, actor }), t.statusUpdated)} onReceive={setReceiving} />}
      {tab === "stock" && !isOwner && <StockList lang={lang} s={s} th={th} stockRows={stockRows} branchIds={assignedIds} />}

      {receiving && (
        <ReceiveModal lang={lang} s={s} th={th} transfer={receiving} busy={busy} isDesktop={isDesktop} onClose={() => setReceiving(null)} onConfirm={(inputLines) => run(async () => {
          const result = await receiveBranchTransfer({ transfer: receiving, inputLines, settings, shop, actor });
          setReceiving(null);
          return result;
        }, settings.autoCreatePurchaseInvoiceOnReceive === true ? t.autoInvoiceCreated : t.receiveSaved)} />
      )}
    </>
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

export function branchTransferMenuLabel(lang) {
  return `🚚 ${bt(lang).menu}`;
}

export function branchTransferSettingsCopy(lang, enabled) {
  const t = bt(lang);
  return {
    title: t.settingsTitle,
    subtitle: enabled ? t.settingsSubOn : t.settingsSubOff,
  };
}
