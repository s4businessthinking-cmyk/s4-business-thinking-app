import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from "react";
import {
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  requestSignupCode,
} from "./backend/auth";
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  getDocs,
  runTransaction,
  writeBatch,
  serverTimestamp,
} from "./backend/firestore";
import {
  auth,
  db,
  FIREBASE_READY,
  COUNTRIES,
  generateInviteCode,
  friendlyAuthError,
} from "./firebase-config";
import {
  offlineCreate,
  offlineUpdate,
  offlineUpsert,
  offlinePatch,
  offlineBulkUpsert,
  offlineRemove,
  offlineList,
  offlineGetById,
  offlineCacheCloudRecords,
  offlineClearShopCollection,
  offlinePurgeLocal,
  offlineDirtyRecords,
  offlinePurgeCleanLocal,
} from "./offline/offlineRepository";
import { persistOfflineDb } from "./offline/sqliteDb.js";
import {
  loadCachedShop,
  saveCachedShop,
  loadShopRecord,
  saveShopRecord,
  shopNeedsSetup,
} from "./offline/shopService";
import {
  pullShopFromCloud,
  uploadPendingShopChanges,
  reconcileShopWithCloud,
  getSyncDashboardStatus,
  getCloudSyncBlockReason,
  shouldAutoPullShop,
  getShopCloudPulledAt,
  sortPulledRecords,
  getFailingSyncSamples,
  SHOP_PULL_COLLECTIONS,
} from "./offline/cloudPullService";
import { subscribeShopCollection, subscribeFirebaseAuthReady } from "./offline/realtimeSync";
import {
  ensureLocalAuthBootstrap,
  restoreLocalAuthSession,
  loginWithLocalCredentials,
  loginWithCredentials,
  logoutLocalAuth,
  friendlyLocalAuthError,
  buildProfileFromLocal,
  registerLocalOwnerAccount,
  registerLocalSalesmanAccount,
  addLocalInviteCode,
  repairStaffProfileIfNeeded,
} from "./auth/localAuthBootstrap";
import { updateLocalUserPassword, updateLocalUserProfile } from "./auth/localAuthService";
import { createStockLedgerEntry, buildStockLedgerEntry, STOCK_COLLECTIONS } from "./inventory/stockManagementService";

import ReorderAlertCard from "./inventory/ReorderAlertCard";
import { salesSpecs, specValues } from "./product-master/productSpecs";
import { pricingPatchFromLanding } from "./product-master/pricingFromLanding.js";
import { scheduleStaleClear, cancelStaleClear, STALE_DRAFT_MS } from "./utils/staleDraftClear.js";
import { unitFactorFor, itemBaseQty, rescaleForUnit } from "./inventory/unitConversion";
import StockBadge from "./inventory/StockBadge.jsx";
import { AppUpdatePanel, runStartupUpdatePrompt } from "./update/AppUpdatePanel.jsx";
import BackupPanel from "./backup/BackupPanel.jsx";
import { useShopFinance } from "./dashboard/shopFinance.js";
import ChequeDueAlert, { chequeTypeIcon, chequeTypeLabel } from "./dashboard/ChequeDueAlert.jsx";
import NotificationBell from "./dashboard/NotificationBell.jsx";
import PartyFolderList, { FolderToggle, groupInvoicesByParty } from "./invoices/PartyFolderList.jsx";
import { PM_CSS } from "./product-master/pmStyles";
import { SI_CSS, SI_STATUS_COLOR, PM_TH, usePmMobile } from "./sales-invoice/siSkin.js";
import MobileMenuDrawer from "./dashboard/MobileMenuDrawer.jsx";
import SideMenuGroups from "./dashboard/SideMenuGroups.jsx";
import DashboardQuickNav from "./dashboard/DashboardQuickNav.jsx";
import AppGlobalSearch from "./dashboard/AppGlobalSearch.jsx";
import { groupMenuItems } from "./dashboard/menuGroups.js";
import { useEscapeKey, useWindowState, WindowButtons, MinimizedChip } from "./components/WindowChrome.jsx";
import PrintSettingsWindow from "./print/PrintSettingsWindow.jsx";
import { loadPrintSettings, docSettingsFor, paperCss, printHtmlDocument, printWithSettings, canPickPrinter } from "./print/printSettings.js";
import { applyDesign, loadPrintDesign, layoutAppliesTo, renderLayoutDocument, amountInWords, generateStatementHTML, SAMPLE_DATA, shopHeaderExtras } from "./print/printDesign.js";
import { useChequeDueNotifications } from "./dashboard/chequeNotifications.js";
import { useEmployeeAlerts } from "./employees/useEmployeeAlerts.js";
import { alertText as employeeAlertText } from "./employees/employeeAlerts.js";
import VendorChequeWizard from "./vouchers/VendorChequeWizard.jsx";
import OwnerPinModal from "./auth/OwnerPinModal.jsx";
import ChequeHandoverModal from "./vouchers/ChequeHandoverModal.jsx";
import { chequeVoucherHtml, chequeHandoverHtml, chequeAmountOfVoucher } from "./vouchers/chequeDocs.js";
import { saveHandoverDocs, loadHandoverDocs, handoverSummary } from "./vouchers/chequeHandoverStore.js";
import { startAutoBackup } from "./backup/backupService.js";
import { saveTextFile } from "./utils/saveTextFile.js";
import { ProductTypeaheadInput } from "./components/ProductTypeaheadInput.jsx";
import SalesInvoiceDesktopForm from "./sales-invoice/SalesInvoiceDesktopForm.jsx";
import ProductInvoiceEntryInfo from "./sales-invoice/ProductInvoiceEntryInfo.jsx";
import PurchaseInvoiceDesktopForm from "./purchase/PurchaseInvoiceDesktopForm.jsx";
import { purchaseOptionsOf, rateOf, isForeign, lineToBase, batchReasons, nextBatchNo } from "./purchase/purchaseOptions.js";
import { computeStockMap, loadInvoiceRows } from "./inventory/stockFromInvoices";
import { batchStockByProduct, saleBatchChoices } from "./inventory/batchStock";
import BatchPickModal from "./sales-invoice/BatchPickModal";
import { CURRENCIES } from "./reports/taxDomain.js";
import AgainstInvoiceVoucherWindow from "./vouchers/AgainstInvoiceVoucherWindow.jsx";
import PartyLedgerWindow from "./vouchers/PartyLedgerWindow.jsx";
import PartyPickerWindow, { CUSTOMER_PICKER_COLS } from "./components/PartyPickerWindow.jsx";
import PdcWindow from "./vouchers/PdcWindow.jsx";
import { logAudit } from "./utils/auditLog.js";
import VendorMasterScreen, { EMPTY_VENDOR } from "./vendor-master/VendorMasterScreen.jsx";
import CustomerMasterScreen, { EMPTY_CUSTOMER } from "./customer-master/CustomerMasterScreen.jsx";
import { syncOpeningBill, isOpeningBill } from "./utils/openingBill.js";
import { isBranchTransferBill } from "./branch-transfer/branchTransferDomain.js";
import ReturnsTab, { returnsAsLedgerVouchers } from "./returns/ReturnsTab.jsx";
import VouchersTab from "./vouchers/VouchersTab.jsx";
import StockAdjustmentTab from "./returns/StockAdjustmentTab.jsx";
import StockConvertTab from "./returns/StockConvertTab.jsx";
import PurchaseDocsTab from "./purchase/PurchaseDocsTab.jsx";
import EmployeesTab from "./employees/EmployeesTab.jsx";
import AttendanceTab from "./employees/AttendanceTab.jsx";
import BankRecTab from "./accounts/BankRecTab.jsx";
import PartnersTab from "./partners/PartnersTab.jsx";
import PermissionMatrix from "./team/PermissionMatrix.jsx";
import UserGroupsPanel from "./team/UserGroupsPanel.jsx";
import { groupPermissions, memberGroupState, userGroupsOf } from "./team/permissionMatrix.js";
import PeriodLockPanel from "./accounts/PeriodLockPanel.jsx";
import BarcodeLabelsTab from "./labels/BarcodeLabelsTab.jsx";
import UserDefaultsEditor, { START_TABS } from "./team/UserDefaultsEditor.jsx";
import { isAcceptablePassword } from "./auth/passwordRules.js";
import RemindersTab from "./reminders/RemindersTab.jsx";
import { useReminderAlerts } from "./reminders/useReminderAlerts.js";
import { reminderAlertText } from "./reminders/reminders.js";
import CalculatorWindow from "./tools/CalculatorWindow.jsx";
import { periodLockOf, setActivePeriodLock, withoutPeriodLock } from "./accounts/periodLock.js";
import { usePartnerAlerts } from "./partners/usePartnerAlerts.js";
import { partnerAlertText } from "./partners/partners.js";
import JobCardTab from "./jobcard/JobCardTab.jsx";
import AuditLogTab from "./returns/AuditLogTab.jsx";
import ProfitLossReport from "./reports/ProfitLossReport.jsx";
import TaxReport from "./reports/TaxReport.jsx";
import ShopInfoSettings from "./settings/ShopInfoSettings.jsx";
import ExpensesTab from "./expenses/ExpensesTab.jsx";
import {
  BranchTransferSettingsPanel,
  BranchTransferWorkspace,
  branchTransferMenuLabel,
  useBranchTransferInbox,
  branchTransferSettingsCopy,
  useBranchTransferAccess,
} from "./branch-transfer/BranchTransferNative.jsx";
import { APP_VERSION } from "./update/githubUpdateService";
import {
  createShopStaffUser,
  listShopTeamMembers,
  mergeTeamMembers,
  assembleShopTeam,
  removeShopTeamMember,
  backfillLegacyTeamMembers,
  backfillShopStaffCloudRecords,
  updateShopMemberPermissions,
  updateShopMemberPosition,
  resetShopMemberPassword,
  updateOwnPassword,
} from "./auth/userManagementService";
import ProductMasterScreen from "./product-master/ProductMasterScreen.jsx";
import { code128SvgMarkup } from "./product-master/code128.js";

import s4LogoUrl from "./assets/s4-logo.png";
import { TR } from "./i18n/translations.js";
import { useFirebaseAuthReady } from "./auth/useFirebaseAuthReady.js";
import { localIsoDate } from "./utils/localIsoDate.js";
import { UAE_BANKS, amountToWordsAED } from "./cheque/chequeConfig.js";
import ChequePrinterTab from "./cheque/ChequePrinterTab.jsx";
import { DEFAULT_PERMISSIONS, piN2, piR2, nsmatch, piFmt2, PI_VOUCHER_METHODS, PARTY_CODE, partyCodeNumber, reserveShopSerial, formatPartyCode, deviceSerialTag, STOCK_AFFECTING_INVOICE_STATUSES, billLeaveGuard, applyInvoiceStockEffect, unlinkedStockOk, voucherParties, toVoucherView, nsq, nextPartyCode, PI_PREFIX } from "./shared/appShared.jsx";
import { generatePaymentVoucherHTML, generateSalesInvoiceHTML, printPaymentVoucher, siUnitOptionsFor, productRatesEnabled, SI_PAY } from "./sales-invoice/salesInvoiceShared.js";
import { SalesInvoiceTab } from "./sales-invoice/SalesInvoiceTab.jsx";
import { PurchaseInvoiceTab } from "./purchase/PurchaseInvoiceTab.jsx";
import { PiSalesmanView } from "./purchase/PiSalesmanView.jsx";
import { _globalS, LOGO_URL, APP_NAME, THEMES, getStyles } from "./shared/appShared.jsx";
import { Header } from "./components/AppHeader.jsx";
import { ShopSetupWizard, SetupScreen, SignupRolePicker, SignupForm, LoginScreen, VerifyGate, ChangePasswordScreen } from "./auth/AuthScreens.jsx";
import { InviteCodeRow, PermToggle } from "./team/TeamControls.jsx";
import { ExcelImportModal } from "./components/ExcelImportModal.jsx";
import { ProfilePasswordSettings, LicenseActivationPanel, HelpSettingsPanel, SyncSettingsPanel } from "./settings/SettingsPanels.jsx";
import { DashboardTab } from "./dashboard/DashboardTab.jsx";
import { OrderSupplierPicker, PriceCell } from "./components/OrderInputs.jsx";
import { SettingsPage } from "./settings/SettingsPage.jsx";
import { CompaniesScreen } from "./orders/CompaniesScreen.jsx";
import { OwnerOrdersScreen } from "./orders/OwnerOrdersScreen.jsx";
import { ShopOrderScreen } from "./orders/ShopOrderScreen.jsx";
import { newItem, loadWaStyle, saveWaStyle, loadSiShowCode, loadSiColor, useWindowWidth, mergeProductCatalog, backfillPartyCodes, isActiveProduct, compareProductNames, productSearchText, isBlankProduct, pushOrdersNow, ORDER_PREFIX, SC, mergePartyRow, CM_IMPORT_COLUMNS, VM_IMPORT_COLUMNS, emptyVendor, WA_STYLES, TAB_SHORTCUT_KEYS, ERP_MOBILE_CSS, saveSiShowCode, saveSiColor, designPreviewHtml, loadLang, saveLang, loadTheme, saveTheme, saveCachedProfile } from "./app/mainAppHelpers.js";
import { renderMainLayout } from "./app/renderMainLayout.jsx";
import { createOrderRenderers } from "./orders/orderRenderers.jsx";
import { renderTabContent } from "./app/renderTabContent.jsx";
import { useNavigationState } from "./app/useNavigationState.jsx";
import { useOrderTeamActions } from "./orders/useOrderTeamActions.js";
import { useProductActions } from "./products/useProductActions.js";
import { useGlobalSearch } from "./app/useGlobalSearch.js";
import { useProductForm } from "./products/useProductForm.js";
import { useProductsLoader } from "./products/useProductsLoader.js";
import { useShopDataSync } from "./app/useShopDataSync.js";
import { useCloudSync } from "./app/useCloudSync.js";
















// ─── MAIN APP ─────────────────────────────────────────────────
function MainApp({ t, lang, setLang, user, profile, shop:shopProp, toast, s:sBase, th:thBase, theme, setTheme, onLogout, onProfileUpdate }) {
  const isOwner = profile.role==="owner";
  const isSalesman = !isOwner;
  const shopId  = profile.shopId;
  const perms   = { ...DEFAULT_PERMISSIONS, ...(profile.permissions || {}) };
  const can     = (key) => isOwner||perms[key]===true;
  const canManageProducts = can("manageProducts");
  const canSeeProductCost = canManageProducts || can("managePurchase");
  const patchProductInList = useCallback((productId, patch) => {
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, ...patch } : p)));
  }, []);
  const isOrderManager = !isOwner&&(can("setStatus")||can("setPrices")||can("markDelivery")||can("deleteOrder"));

  const [orders,setOrders]=useState([]);
  const [cos,setCos]=useState([]);
  const [team,setTeam]=useState([]);
  const [inviteCodes,setInviteCodes]=useState([]);
  const [products,setProducts]=useState([]);
  const [syncState,setSyncState]=useState("connecting");
  // Genuine Firebase Auth session (auth.currentUser), distinct from the local-only
  // offline session that can hand us a usable shopId before/without one. Every
  // Firestore onSnapshot listener below gates on this so a local-only session never
  // attaches a shopId-scoped listener that would just permission-deny silently.
  const authSyncReady = useFirebaseAuthReady();

  // Visible, non-spammy status when we're online but the real-time listeners
  // above are deliberately not attached because there's no genuine Firebase
  // Auth session yet (a local-only session came up first, or the session
  // never established one). Reported as "reconnecting" — the listeners
  // above re-attach automatically the moment authSyncReady flips true.
  useEffect(() => {
    if (!shopId || authSyncReady) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setSyncState("reconnecting");
  }, [shopId, authSyncReady]);
  const [localShop,setLocalShop]=useState(shopProp);
  const userGroups = useMemo(()=>userGroupsOf(localShop), [localShop]);
  const periodLock = periodLockOf(localShop);
  setActivePeriodLock(periodLock.lockDate);

  const [tab,setTabState]=useState("dashboard");
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const setTab = (next) => {
    if (next !== tabRef.current && billLeaveGuard.current && !billLeaveGuard.current.leave()) return;
    setTabState(next);
  };

  // Global desktop shortcut: open Product Master from anywhere in the app.
  useEffect(() => {
    const onProductMasterShortcut = (event) => {
      if (event.key !== "F2") return;
      if (!(isOwner || perms.viewProducts === true)) return;
      event.preventDefault();
      setTab("products");
    };
    window.addEventListener("keydown", onProductMasterShortcut);
    return () => window.removeEventListener("keydown", onProductMasterShortcut);
  }, [isOwner, perms.viewProducts]);

  // Vouchers screen tiles open the receipt / payment window inside Sales / Purchase.
  const [siVoucherReq,setSiVoucherReq] = useState(0);
  const [piVoucherReq,setPiVoucherReq] = useState(0);

  // Global desktop shortcut: F3 opens a new purchase invoice.
  const [piNewReq,setPiNewReq] = useState(0);
  const [piNewVendor,setPiNewVendor] = useState(null);
  useEffect(() => {
    const onPurchaseShortcut = (event) => {
      if (event.key !== "F3") return;
      if (!(isOwner || perms.managePurchase === true)) return;
      event.preventDefault();
      if (document.querySelector("[data-si-modal-open]")) return;
      if (tabRef.current !== "purchase" && billLeaveGuard.current && !billLeaveGuard.current.leave()) return;
      setTabState("purchase");
      setPiNewReq(Date.now());
    };
    window.addEventListener("keydown", onPurchaseShortcut);
    return () => window.removeEventListener("keydown", onPurchaseShortcut);
  }, [isOwner, perms.managePurchase]);

  // Global desktop shortcut: F4 opens a new sales invoice.
  const [siNewReq,setSiNewReq] = useState(0);
  const [siNewCustomer,setSiNewCustomer] = useState(null);
  useEffect(() => {
    const onSalesShortcut = (event) => {
      if (event.key !== "F4") return;
      if (!(isOwner || perms.manageSales === true)) return;
      event.preventDefault();
      if (document.querySelector("[data-si-modal-open]")) return;
      if (tabRef.current !== "sales" && billLeaveGuard.current && !billLeaveGuard.current.leave()) return;
      setTabState("sales");
      setSiNewReq(Date.now());
    };
    window.addEventListener("keydown", onSalesShortcut);
    return () => window.removeEventListener("keydown", onSalesShortcut);
  }, [isOwner, perms.manageSales]);

  // Global desktop shortcut: Ctrl+O opens Vendor Master.
  useEffect(() => {
    const onVendorShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || String(event.key).toLowerCase() !== "o") return;
      event.preventDefault();
      if (!(isOwner || perms.viewVendors === true || perms.manageVendors === true)) return;
      if (document.querySelector("[data-si-modal-open]")) return;
      setTab("vendors");
    };
    window.addEventListener("keydown", onVendorShortcut);
    return () => window.removeEventListener("keydown", onVendorShortcut);
  }, [isOwner, perms.viewVendors, perms.manageVendors]);

  // Global desktop shortcut: Ctrl+U opens Customer Master.
  useEffect(() => {
    const onCustomerShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || String(event.key).toLowerCase() !== "u") return;
      event.preventDefault();
      if (!isOwner) return;
      if (document.querySelector("[data-si-modal-open]")) return;
      setTab("customers");
    };
    window.addEventListener("keydown", onCustomerShortcut);
    return () => window.removeEventListener("keydown", onCustomerShortcut);
  }, [isOwner]);

  // ── INVOICE STATE ──
  // items = confirmed invoice list (locked rows)
  // currentItem = the form being filled right now
  const [items,setItems]=useState([]);
  const [currentItem,setCurrentItem]=useState(newItem());
  const [note,setNote]=useState("");
  const [editingOrderId,setEditingOrderId]=useState(null);
  const orderEditBaselineRef = useRef("");
  const nameRef = useRef(null);

  const [selOrder,setSelOrder]=useState(null);
  const [orderStatusPage,setOrderStatusPage]=useState("pending");
  const [supplierPickerTarget,setSupplierPickerTarget]=useState(null);
  const [orderReceive,setOrderReceive]=useState(null);
  const [orderReceiveSaving,setOrderReceiveSaving]=useState(false);
  const [supplierPickerQuery,setSupplierPickerQuery]=useState("");
  const supplierPickerInputRef = useRef(null);
  const [priceEditorTarget,setPriceEditorTarget]=useState(null);
  const [priceEditorValue,setPriceEditorValue]=useState("");
  const priceEditorInputRef = useRef(null);

  const [editId,setEditId]=useState(null);
  const [editNm,setEditNm]=useState(""); const [editPh,setEditPh]=useState("");
  const [newNm,setNewNm]=useState(""); const [newPh,setNewPh]=useState("");
  const [showAdd,setShowAdd]=useState(false);
  const [copyState,setCopyState]=useState(false);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const reloadCustomersFromOffline = useCallback(async () => {
    if (!shopId) return;
    try {
      const local = await offlineList("customers");
      const docs = (local.records || [])
        .map((r) => ({ id: r.document_id || r.data?.id, ...(r.data || r) }))
        .filter((c) => c.shopId === shopId)
        .sort((a, b) => (a.customerName || "").localeCompare(b.customerName || ""));
      setCustomers(docs);
    } catch (err) {
      console.warn("[S4] customers reload failed", err);
    }
  }, [shopId]);
  const reloadVendorsFromOffline = useCallback(async () => {
    if (!shopId) return;
    try {
      const local = await offlineList("vendors");
      const docs = (local.records || [])
        .map((r) => ({ id: r.document_id || r.data?.id, ...(r.data || r) }))
        .filter((v) => v.shopId === shopId)
        .sort((a, b) => (a.vendorName || "").localeCompare(b.vendorName || ""));
      setVendors(docs);
    } catch (err) {
      console.warn("[S4] vendors reload failed", err);
    }
  }, [shopId]);

  const [searchQ,setSearchQ]=useState("");
  const [waStyle,setWaStyleState]=useState(loadWaStyle());
  const setWaStyle = (v) => { setWaStyleState(v); saveWaStyle(v); };
  const [siShowCode,setSiShowCode] = useState(loadSiShowCode);
  const [siColorPrint,setSiColorPrint] = useState(loadSiColor);

  const windowWidth = useWindowWidth();
  const isDesktop = windowWidth >= 768;
  const erpSkin = !isDesktop && tab !== "dashboard";
  const [menuOpen, setMenuOpen] = useState(false);
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  const [pageMax, setPageMax] = useState(false);
  const [minTab, setMinTab] = useState(null);
  useEffect(() => { if (minTab && tab === minTab) setMinTab(null); }, [tab, minTab]);
  const erpDark = erpSkin && theme === "dark";
  const th = erpSkin ? (erpDark ? THEMES.erpDark : THEMES.erp) : thBase;
  const s = erpSkin ? (erpDark ? _erpDarkS : _erpS) : sBase;
  const [licenseAccess, setLicenseAccess] = useState(null);
  const [syncRefreshKey, setSyncRefreshKey] = useState(0);
  const [clearingProducts, setClearingProducts] = useState(false);
  const productBulkDeleteRef = useRef(false);
  const [licenseAccessLoading, setLicenseAccessLoading] = useState(true);
  const [syncDashboard, setSyncDashboard] = useState(null);
  const [cloudPullBusy, setCloudPullBusy] = useState(false);
  const cloudPullRunRef = useRef(null);
  const [cloudUploadBusy, setCloudUploadBusy] = useState(false);
  const [lastCloudPullAt, setLastCloudPullAt] = useState(null);
  const [settingsPage,setSettingsPage]=useState(null);
  const [teamEmployees,setTeamEmployees]=useState([]);
  useEffect(() => {
    if (!isOwner || tab!=="settings" || settingsPage!=="team") return;
    let alive = true;
    offlineList("employees")
      .then(res => { if (alive) setTeamEmployees((Array.isArray(res) ? res : (res?.records || [])).map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) })).filter(e=>e.shopId===shopId)); })
      .catch(err => console.warn("[S4 Team] employee list failed", err));
    return () => { alive = false; };
  }, [isOwner, tab, settingsPage, shopId]);
  const [orderSettingsSaving,setOrderSettingsSaving]=useState(false);
  const [orderModuleOverride,setOrderModuleOverride]=useState(null);
  const orderModuleEnabled = orderModuleOverride ?? (localShop?.orderModuleEnabled === true);
  const branchTransferAccess = useBranchTransferAccess({
    shopId, user, profile, isOwner,
  });
  const branchTransferSettings = branchTransferAccess.settings;
  const setBranchTransferSettings = branchTransferAccess.setSettings;
  const canUseBranchTransfer = branchTransferAccess.canUse;
  const btInbox = useBranchTransferInbox({ shopId, user, profile, enabled: canUseBranchTransfer });
  const btSeenRef = useRef(null);
  useEffect(() => {
    const ids = new Set(btInbox.map((tr) => tr.id));
    const seen = btSeenRef.current;
    btSeenRef.current = ids;
    if (!seen) return;
    const mine = new Set([user?.uid, profile?.localUserId].filter(Boolean));
    const fresh = btInbox.filter((tr) => !seen.has(tr.id) && !mine.has(tr.createdBy) && !mine.has(tr.dispatchedBy));
    if (!fresh.length) return;
    const first = fresh[0];
    toast(lang==="bn"
      ? `🚚 নতুন Branch Transfer এসেছে: ${first.transferNo||""}${first.branchName?` → ${first.branchName}`:""}${fresh.length>1?` (+${fresh.length-1})`:""} — রিসিভ করুন`
      : `🚚 New branch transfer: ${first.transferNo||""}${first.branchName?` → ${first.branchName}`:""}${fresh.length>1?` (+${fresh.length-1})`:""} — please receive`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [btInbox]);

  const saveOrderModuleEnabled = async (enabled) => {
    if (!isOwner || !shopId || !localShop) return;
    if (orderSettingsSaving) return;
    setOrderSettingsSaving(true);
    setOrderModuleOverride(enabled);
    try {
      const updated = await saveShopRecord(
        shopId,
        { ...localShop, orderModuleEnabled: enabled },
        { ownerUid: user?.uid, profile, user }
      );
      setLocalShop(prev => mergeShopRecord(prev, updated));
      if (!enabled && (tab === "owner" || tab === "shop")) setTab("dashboard");
      toast(enabled ? (lang==="bn"?"✅ Order option চালু হয়েছে":"✅ Order option enabled") : (lang==="bn"?"Order option বন্ধ হয়েছে":"Order option disabled"));
    } catch (error) {
      hErr(error);
    } finally {
      setOrderSettingsSaving(false);
    }
  };

  const [staffForm, setStaffForm] = useState({ username:"", password:"", personName:"", mobile:"", position:"Salesman" });
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffPwReset, setStaffPwReset] = useState({});

  const profileSyncRef = useRef(profile);
  profileSyncRef.current = profile;

  const { applyShopRecord, mergeShopRecord, mergeVisibleOrders, refreshLicenseAccess, refreshSyncDashboard, runCloudDownload, runCloudUpload } = useCloudSync({ authSyncReady, cloudPullRunRef, isOrderManager, isOwner, lang, localShop, onLogout, onProfileUpdate, profile, profileSyncRef, setCloudPullBusy, setCloudUploadBusy, setCos, setCustomers, setInviteCodes, setLastCloudPullAt, setLicenseAccess, setLicenseAccessLoading, setLocalShop, setOrders, setProducts, setSyncDashboard, setSyncRefreshKey, setSyncState, setTeam, setVendors, shopId, syncDashboard, t, toast, user });

  const { calcMode, empFocus, employeeAlertList, finance, openEmployeeAlert, partnerAlertList, productMaintenance, productMaintenanceId, productMaintenanceRef, productReplacementActive, productsLoading, rebuildTeam, reminderAlertList, setCalcMode, setEmpFocus, setProductMaintenance, setProductReplacementActive, setProductsLoading, teamPermissionOverridesRef } = useShopDataSync({ applyShopRecord, authSyncReady, can, customers, inviteCodes, isOrderManager, isOwner, lang, localShop, mergeVisibleOrders, refreshLicenseAccess, refreshSyncDashboard, runCloudDownload, setCos, setCustomers, setInviteCodes, setLastCloudPullAt, setSettingsPage, setSyncRefreshKey, setSyncState, setTab, setTeam, setVendors, settingsPage, shopId, shopProp, syncState, t, team, toast, user, vendors });

  const { fetchProducts } = useProductsLoader({ authSyncReady, productBulkDeleteRef, setProducts, setProductsLoading, setSyncRefreshKey, setSyncState, shopId, syncRefreshKey });

  const { chequeHandoverReq, chequePrefill, confirmPmDiscard, createEmptyPmForm, deleteInviteCode, generateNewCode, globalFocusCustomerId, globalFocusProductId, globalFocusVendorId, globalOpenPurchaseInvoiceId, globalOpenSalesInvoiceId, grnIncoming, hErr, loadPmForm, ownerUnlocked, pinModal, pmCatFilter, pmEditId, pmForm, pmOverSales, pmPickForSales, pmReset, pmSearch, purchaseSource, quoteToConvert, savingProduct, setChequeHandoverReq, setChequePrefill, setGlobalFocusCustomerId, setGlobalFocusProductId, setGlobalFocusVendorId, setGlobalOpenPurchaseInvoiceId, setGlobalOpenSalesInvoiceId, setGrnIncoming, setOwnerUnlocked, setPinModal, setPmCatFilter, setPmEditId, setPmForm, setPmOverSales, setPmPickForSales, setPmSearch, setPmShowAdd, setPurchaseSource, setQuoteToConvert, setSavingProduct, startProductEdit } = useProductForm({ isOwner, lang, setSelOrder, setSettingsPage, shopId, tab, toast });

  const { globalSearchCan, globalSearchCanAny, handleGlobalSearchNavigate } = useGlobalSearch({ can, globalFocusProductId, isDesktop, isOwner, perms, products, setGlobalFocusCustomerId, setGlobalFocusProductId, setGlobalFocusVendorId, setGlobalOpenPurchaseInvoiceId, setGlobalOpenSalesInvoiceId, setTabState, startProductEdit, tab, tabRef });

  const { addProduct, clearAllShopProducts, deleteProduct, editProduct, exportProductsCsv, exportWeighingBarcodeCsv, filteredProducts, finishProductReplacement, getFilteredProducts, importProductRecords, pmUpd, printProductBarcodes, removeBlankProducts } = useProductActions({ canManageProducts, canSeeProductCost, clearingProducts, createEmptyPmForm, hErr, isOwner, lang, pmCatFilter, pmEditId, pmForm, pmOverSales, pmReset, pmSearch, productBulkDeleteRef, productMaintenanceId, productMaintenanceRef, productReplacementActive, products, profile, setClearingProducts, setPmEditId, setPmForm, setPmOverSales, setPmPickForSales, setPmShowAdd, setProductMaintenance, setProductReplacementActive, setProducts, setSavingProduct, setSyncRefreshKey, shopId, t, toast, user });

  const { addCo, addItToInvoice, applyGroupToMember, cancelEdit, cancelEditOrder, cancelOrder, closeOrderSupplierPicker, closePriceEditor, closeTeamMember, createStaffMember, delCo, delIt, delOrder, deliverItem, findOrderSupplier, getOrderDisplayNo, handleEnterAdd, handleLogout, markRead, openOrderSupplierPicker, openPriceEditor, patchOrderOffline, resetStaffPassword, saveEdit, saveMemberDefaults, saveMemberPosition, saveOrderReceive, savePermissions, savePriceEditor, saveSupplierPhone, saveUserGroups, searchOrderSuppliers, selectOrderSupplierFromPicker, selectProductToOrder, sendOrder, setCo, setItemStatus, startEdit, startEditOrder, supplierPhone, updCurrentItem, waLinkGroup } = useOrderTeamActions({ can, cos, currentItem, editNm, editPh, editingOrderId, hErr, isOwner, isSalesman, items, lang, localShop, mergeShopRecord, nameRef, newNm, newPh, note, onLogout, orderEditBaselineRef, orderReceive, orderReceiveSaving, orders, priceEditorInputRef, priceEditorTarget, priceEditorValue, products, profile, rebuildTeam, selOrder, setCopyState, setCos, setCurrentItem, setEditId, setEditNm, setEditPh, setEditingOrderId, setItems, setLocalShop, setNewNm, setNewPh, setNote, setOrderReceive, setOrderReceiveSaving, setOrders, setPriceEditorTarget, setPriceEditorValue, setSelOrder, setShowAdd, setStaffForm, setStaffPwReset, setStaffSaving, setSupplierPickerQuery, setSupplierPickerTarget, setTeam, shopId, staffForm, staffPwReset, supplierPickerInputRef, supplierPickerTarget, t, teamPermissionOverridesRef, toast, user, userGroups, vendors, waStyle });

  const { canStaffSupplierArea, canStaffVouchers, closeMenu, currentTabLabel, filterOrders, filterOrdersByStatusPage, goBack, groupByDay, makeShopNo, notificationItems, renderOrderPageTabs, selectFromMenu, setOrderStatus, stPage, staffQuickNavKeys, tabLabelOf, unread, visibleTabs } = useNavigationState({ btInbox, can, canUseBranchTransfer, confirmPmDiscard, employeeAlertList, finance, findOrderSupplier, getOrderDisplayNo, hErr, isDesktop, isOrderManager, isOwner, lang, localShop, menuOpen, openEmployeeAlert, orderModuleEnabled, orderReceive, orderReceiveSaving, orderStatusPage, orders, partnerAlertList, patchOrderOffline, pmOverSales, pmReset, profile, reminderAlertList, searchQ, setMenuOpen, setOrderReceive, setOrderStatusPage, setPmEditId, setPmOverSales, setPmShowAdd, setSettingsPage, setTab, setTabState, settingsPage, shopId, t, tab, team, th, toast, user });

  const canExpand = isOwner || isOrderManager || can("deleteOrder");

  const { OrderCard, ownerLockedPanel } = createOrderRenderers({ can, canExpand, cancelOrder, delOrder, deliverItem, findOrderSupplier, getOrderDisplayNo, isDesktop, isOrderManager, isOwner, isSalesman, lang, markRead, openOrderSupplierPicker, openPriceEditor, s, saveSupplierPhone, selOrder, setCo, setItemStatus, setOrderStatus, setPinModal, setSelOrder, startEditOrder, supplierPhone, t, th, user, waLinkGroup });

  const { tabContent } = renderTabContent({ OrderCard, addCo, addItToInvoice, addProduct, applyGroupToMember, branchTransferSettings, btInbox, calcMode, can, canManageProducts, canSeeProductCost, canStaffSupplierArea, canStaffVouchers, canUseBranchTransfer, cancelEdit, cancelEditOrder, chequeHandoverReq, chequePrefill, clearAllShopProducts, clearingProducts, closeTeamMember, cloudPullBusy, cloudUploadBusy, confirmPmDiscard, cos, createEmptyPmForm, createStaffMember, currentItem, customers, delCo, delIt, deleteInviteCode, deleteProduct, editId, editNm, editPh, editProduct, editingOrderId, empFocus, employeeAlertList, exportProductsCsv, exportWeighingBarcodeCsv, fetchProducts, filterOrders, filterOrdersByStatusPage, filteredProducts, finance, finishProductReplacement, generateNewCode, getFilteredProducts, globalFocusCustomerId, globalFocusVendorId, globalOpenPurchaseInvoiceId, globalOpenSalesInvoiceId, globalSearchCan, grnIncoming, groupByDay, hErr, handleEnterAdd, handleGlobalSearchNavigate, handleLogout, importProductRecords, inviteCodes, isDesktop, isOrderManager, isOwner, items, lang, lastCloudPullAt, loadPmForm, localShop, makeShopNo, mergeShopRecord, nameRef, newNm, newPh, note, openEmployeeAlert, orderModuleEnabled, orderSettingsSaving, orders, ownerLockedPanel, ownerUnlocked, partnerAlertList, patchProductInList, periodLock, piNewReq, piNewVendor, piVoucherReq, pinModal, pmCatFilter, pmEditId, pmForm, pmOverSales, pmPickForSales, pmReset, pmSearch, pmUpd, printProductBarcodes, productMaintenance, productReplacementActive, products, productsLoading, profile, purchaseSource, quoteToConvert, refreshSyncDashboard, reloadCustomersFromOffline, reloadVendorsFromOffline, removeBlankProducts, renderOrderPageTabs, resetStaffPassword, runCloudDownload, runCloudUpload, s, saveEdit, saveMemberDefaults, saveMemberPosition, saveOrderModuleEnabled, savePermissions, saveUserGroups, savingProduct, searchQ, selectProductToOrder, sendOrder, setBranchTransferSettings, setCalcMode, setChequeHandoverReq, setChequePrefill, setCustomers, setEditNm, setEditPh, setEmpFocus, setGlobalFocusCustomerId, setGlobalFocusVendorId, setGlobalOpenPurchaseInvoiceId, setGlobalOpenSalesInvoiceId, setGrnIncoming, setLang, setLocalShop, setMenuOpen, setNewNm, setNewPh, setNote, setOwnerUnlocked, setPiNewReq, setPiNewVendor, setPiVoucherReq, setPinModal, setPmCatFilter, setPmEditId, setPmOverSales, setPmSearch, setPmShowAdd, setPrintSettingsOpen, setPurchaseSource, setQuoteToConvert, setSearchQ, setSettingsPage, setShowAdd, setSiNewCustomer, setSiNewReq, setSiVoucherReq, setStaffForm, setStaffPwReset, setTab, setTabState, setTheme, setVendors, setWaStyle, settingsPage, shopId, showAdd, siColorPrint, siNewCustomer, siNewReq, siShowCode, siVoucherReq, stPage, staffForm, staffPwReset, staffQuickNavKeys, staffSaving, startEdit, startProductEdit, syncDashboard, syncRefreshKey, syncState, t, tab, tabRef, team, teamEmployees, th, theme, toast, unread, updCurrentItem, user, userGroups, vendors, waStyle, windowWidth });

  return renderMainLayout({ canSeeProductCost, closeMenu, closeOrderSupplierPicker, closePriceEditor, currentTabLabel, customers, erpDark, erpSkin, findOrderSupplier, getOrderDisplayNo, globalSearchCan, globalSearchCanAny, goBack, handleGlobalSearchNavigate, handleLogout, isDesktop, isOwner, lang, licenseAccess, licenseAccessLoading, localShop, menuOpen, minTab, notificationItems, orderReceive, orderReceiveSaving, orders, pageMax, pmOverSales, priceEditorInputRef, priceEditorTarget, priceEditorValue, printSettingsOpen, products, profile, refreshLicenseAccess, s, saveOrderReceive, savePriceEditor, searchOrderSuppliers, selectFromMenu, selectOrderSupplierFromPicker, setLang, setLocalShop, setMinTab, setOrderReceive, setPageMax, setPriceEditorValue, setPrintSettingsOpen, setSiColorPrint, setSiShowCode, setSupplierPickerQuery, setTab, setTheme, shopId, siColorPrint, siShowCode, supplierPickerInputRef, supplierPickerQuery, supplierPickerTarget, syncState, t, tab, tabContent, tabLabelOf, th, theme, toast, unread, user, vendors, visibleTabs });
}

// ─── ROOT ────────────────────────────────────────────────────
export default function App() {
  const [lang,setLangState]=useState(loadLang());
  const setLang = (l) => { setLangState(l); saveLang(l); };
  const t = TR[lang];

  const [theme,setThemeState]=useState(loadTheme());
  const setTheme = (v) => { setThemeState(v); saveTheme(v); };
  const th = THEMES[theme]||THEMES.dark;
  const s  = getStyles(th);

  const [user,setUser]=useState(null);
  const [profile,setProfile]=useState(null);
  const [shop,setShop]=useState(null);
  const [authReady,setAuthReady]=useState(false);
  const [authScreen,setAuthScreen]=useState("login");
  const [signupRole,setSignupRole]=useState(null);
  const [notif,setNotif]=useState(null);
  const [profileError,setProfileError]=useState(null);
  const toastTimer=useRef(null);

  const toast = (msg,type="ok") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setNotif({msg,type});
    toastTimer.current = setTimeout(()=>setNotif(null),3500);
  };

  const handleProfileUpdate = (patch) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      if (user?.uid) saveCachedProfile(user.uid, next);
      return next;
    });
  };

  const applyAuthResult = (result) => {
    if (!result?.user || !result?.profile) return;
    setUser(result.user);
    setProfile(result.profile);
    saveCachedProfile(result.user.uid, result.profile);

    const resolvedShopId = result.shop?.id || result.profile?.shopId || "";
    if (resolvedShopId && typeof sessionStorage !== "undefined" && !getShopCloudPulledAt(resolvedShopId)) {
      try { sessionStorage.setItem(`s4-force-cloud-pull:${resolvedShopId}`, "1"); } catch {}
    }

    if (result.shop?.id) {
      saveCachedShop(result.shop.id, result.shop);
      setShop(result.shop);
    } else if (result.profile.shopId) {
      let cachedShop = loadCachedShop(result.profile.shopId);
      if (!cachedShop && result.migratedFromFirebase) {
        cachedShop = {
          id: result.profile.shopId,
          companyName: result.profile.companyName || "",
          ownerName: result.profile.personName || "",
          ownerUid: result.user.uid,
          country: result.profile.country || "BD",
          area: result.profile.area || "",
          mobile: result.profile.mobile || "",
          email: result.profile.email || "",
          positions: [],
        };
        saveCachedShop(result.profile.shopId, cachedShop);
      } else if (!cachedShop) {
        cachedShop = {
          id: result.profile.shopId,
          companyName: "",
          ownerName: result.profile.personName || "",
          ownerUid: result.user.uid,
          country: "BD",
          area: "",
          mobile: "",
          email: "",
          positions: [],
        };
        saveCachedShop(result.profile.shopId, cachedShop);
      }
      setShop(cachedShop);
    }
    setProfileError(null);
    setAuthScreen("login");
  };

  const handleEmailVerificationRequired = (fbUser) => {
    setUser({
      uid: fbUser.uid,
      email: fbUser.email,
      emailVerified: false,
      reload: () => fbUser.reload(),
    });
    setProfile(null);
    setShop(null);
  };

  const handleLogout = async () => {
    await logoutLocalAuth();
    try { await signOut(auth); } catch {}
    setUser(null);
    setProfile(null);
    setShop(null);
    setProfileError(null);
  };

  useEffect(() => {
    if (!profile?.localUserId || profile.role === "owner" || profile.shopId) return;

    let cancelled = false;

    (async () => {
      for (let attempt = 0; attempt < 12 && !cancelled; attempt++) {
        if (auth?.currentUser || (typeof navigator !== "undefined" && !navigator.onLine)) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const repaired = await repairStaffProfileIfNeeded(profile.localUserId);
      if (cancelled || !repaired?.ok || !repaired.profile?.shopId) {
        if (repaired?.reason === "ACCOUNT_DISABLED") {
          toast(
            lang === "bn"
              ? "অ্যাকাউন্ট বন্ধ করা হয়েছে। মালিকের সাথে যোগাযোগ করুন।"
              : "This account has been disabled. Contact the owner.",
            "err"
          );
          handleLogout();
        }
        return;
      }

      setProfile(repaired.profile);
      saveCachedProfile(repaired.profile.uid, repaired.profile);
      if (repaired.shop?.id) {
        setShop(repaired.shop);
        saveCachedShop(repaired.shop.id, repaired.shop);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile?.localUserId, profile?.shopId, profile?.role, lang]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const boot = await ensureLocalAuthBootstrap();
        if (boot.shop) saveCachedShop(boot.shop.id, boot.shop);

        const restored = await restoreLocalAuthSession();
        if (cancelled) return;
        if (restored) applyAuthResult(restored);
      } catch (error) {
        console.error("[S4 Auth] local session restore failed", error);
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(()=>()=>{ if (toastTimer.current) clearTimeout(toastTimer.current); },[]);

  useEffect(() => {
    if (!user || !profile) return;
    runStartupUpdatePrompt({ lang, toast });
  }, [user?.uid, profile?.uid, lang]);

  if (!FIREBASE_READY||!auth||!db) return <SetupScreen t={t} lang={lang} setLang={setLang} s={s} theme={theme} setTheme={setTheme} />;

  const Notif = notif&&(
    <div style={{ ...s.notif, background:notif.type==="err"?"#450a0a":"#052e16", borderColor:notif.type==="err"?"#ef4444":"#22c55e", color:notif.type==="err"?"#ef4444":"#22c55e" }}>{notif.msg}</div>
  );

  if (!authReady) return <div style={s.root}><Header t={t} lang={lang} setLang={setLang} s={s} theme={theme} setTheme={setTheme} /><div style={{ ...s.empty, paddingTop:80 }}>⏳</div></div>;

  if (!user) {
    let screen;
    if (authScreen === "signupRole") {
      screen = (
        <SignupRolePicker
          t={t}
          lang={lang}
          setLang={setLang}
          onPick={(r) => { setSignupRole(r); setAuthScreen("signupForm"); }}
          onSwitchToLogin={() => setAuthScreen("login")}
          s={s}
          theme={theme}
          setTheme={setTheme}
        />
      );
    } else if (authScreen === "signupForm") {
      screen = (
        <SignupForm
          t={t}
          lang={lang}
          setLang={setLang}
          role={signupRole}
          onBack={() => setAuthScreen("signupRole")}
          onSwitchToLogin={() => setAuthScreen("login")}
          toast={toast}
          s={s}
          theme={theme}
          setTheme={setTheme}
          onSignupSuccess={applyAuthResult}
          onEmailVerificationRequired={handleEmailVerificationRequired}
        />
      );
    } else {
      screen = (
        <LoginScreen
          t={t}
          lang={lang}
          setLang={setLang}
          toast={toast}
          s={s}
          theme={theme}
          setTheme={setTheme}
          onLoginSuccess={applyAuthResult}
          onSwitchToSignup={() => setAuthScreen("signupRole")}
          onEmailVerificationRequired={handleEmailVerificationRequired}
        />
      );
    }
    return <>{Notif}{screen}</>;
  }

  if (user && user.emailVerified === false && !profile) {
    return (
      <>
        {Notif}
        <VerifyGate
          t={t}
          lang={lang}
          setLang={setLang}
          user={user}
          toast={toast}
          onLogout={handleLogout}
          s={s}
          theme={theme}
          setTheme={setTheme}
        />
      </>
    );
  }

  if (profile?.mustChangePassword) {
    return (
      <>
        {Notif}
        <ChangePasswordScreen
          t={t}
          lang={lang}
          setLang={setLang}
          profile={profile}
          toast={toast}
          s={s}
          theme={theme}
          setTheme={setTheme}
          onPasswordChanged={(localUser) => {
            const updatedProfile = buildProfileFromLocal(localUser);
            setProfile(updatedProfile);
            saveCachedProfile(user.uid, updatedProfile);
          }}
          onLogout={handleLogout}
        />
      </>
    );
  }

  if (!profile) {
    return (
      <div style={s.root}><Header t={t} lang={lang} setLang={setLang} s={s} theme={theme} setTheme={setTheme} />
        <div style={s.welcomeWrap}>
          <div style={{ fontSize:48, marginBottom:12 }}>⚠️</div>
          <div style={{ ...s.authTitle, color:"#ef4444" }}>{lang==="bn"?"প্রোফাইল পাওয়া যায়নি":"Profile not found"}</div>
          <div style={{ ...s.authSub, marginBottom:8 }}>{lang==="bn"?"লগআউট করে আবার লগইন করুন":"Please logout and login again"}</div>
          {profileError&&<div style={{ fontSize:11, color:th.txtMuted, marginBottom:20 }}>{profileError}</div>}
          <button style={s.sendBtn} onClick={handleLogout}>{lang==="bn"?"🚪 লগআউট":"🚪 Logout"}</button>
        </div>
      </div>
    );
  }

  return <>{Notif}<MainApp t={t} lang={lang} setLang={setLang} user={user} profile={profile} shop={shop} toast={toast} s={s} th={th} theme={theme} setTheme={setTheme} onLogout={handleLogout} onProfileUpdate={handleProfileUpdate} /></>;
}

const _erpS = getStyles(THEMES.erp);
const _erpDarkS = getStyles(THEMES.erpDark);
