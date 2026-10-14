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
import { SettingsPanel } from "./BtSettingsPanel.jsx";
import { bt, normalizeError, actorFrom, useShopCollection, NativeButton } from "./btShared.jsx";
import { fq, BT_ACCENT, f2 } from "./btShared.jsx";
import { NewTransferForm } from "./BtNewTransferForm.jsx";
import { TransferRemaining } from "./btShared.jsx";
import { ReceiveWindow } from "./BtReceiveWindow.jsx";
import { transferSentDate, transferTotalValue, sentQty, acceptedQty, fmtDay } from "./btShared.jsx";
import { TransferDetail } from "./BtTransferDetail.jsx";
import { BranchStockView } from "./BtBranchStockView.jsx";
import { SkinShell, StatusBadge, itemSummary } from "./btShared.jsx";
import { renderBtWorkspace } from "./renderBtWorkspace.jsx";
import { useBtWorkspaceActions } from "./useBtWorkspaceActions.js";

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

export function BranchTransferSettingsPanel(props) {
  return <SettingsPanel {...props} />;
}

const OPEN_STATUSES = ["draft", "packed", "dispatched", "in_transit", "partially_received", "discrepancy"];
const RECEIVABLE_STATUSES = ["dispatched", "in_transit", "partially_received", "discrepancy"];
const isReceivable = (transfer) => RECEIVABLE_STATUSES.includes(transfer?.status) && TransferRemaining(transfer) > 0;

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

  const { backToList, changeStatus, confirmReceive, createInvoice, createTransfer, deleteTransfer, openDetail, openNew, printTransfer, reload } = useBtWorkspaceActions({ L, actor, busy, dirtyRef, lang, leaveGuard, profile, receiving, setBranches, setBusy, setReceiving, setSelId, setTransfers, setView, settings, shop, shopId, t, toast, user, view });

  const receiveWindow = receiving && (
    <ReceiveWindow lang={lang} mobile={mobile} transfer={receiving} busy={busy} allowPartial={settings?.allowPartialReceive !== false} toast={toast}
      onClose={() => setReceiving(null)} onConfirm={(inputLines) => confirmReceive(receiving, inputLines)} />
  );
  const shellTitle = `🚚 ${t.title}`;

  return renderBtWorkspace({ L, backToList, branches, busy, canInvoiceRow, canReceiveRow, canReceiveTransfer, canSendTransfer, changeStatus, completed, createInvoice, createTransfer, deleteTransfer, dirtyRef, discrepancies, filtered, fitH, from, incomingList, invoiceRows, isOwner, kpiRows, lang, mainStock, mobile, openDetail, openNew, printTransfer, products, receiveWindow, reload, rootRef, search, section, selId, setFrom, setReceiving, setSearch, setSection, setStatusFilter, setTo, shellTitle, shopStock, statusFilter, stockBranchIds, stockRows, t, team, to, toast, totalValue, transfers, vendors, view, visibleTransfers, waiting });
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
