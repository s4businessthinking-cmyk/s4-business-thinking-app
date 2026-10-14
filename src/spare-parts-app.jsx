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

const productNameCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const compareProductNames = (a, b) => productNameCollator.compare(a?.name || "", b?.name || "");
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
import { DEFAULT_PERMISSIONS, piN2, piR2, nsmatch, piFmt2, PI_VOUCHER_METHODS, AutoTA, PARTY_CODE, partyCodeNumber, reserveShopSerial, formatPartyCode, deviceSerialTag, STOCK_AFFECTING_INVOICE_STATUSES, billLeaveGuard, applyInvoiceStockEffect, unlinkedStockOk, voucherParties, toVoucherView, nsq, nextPartyCode, PI_PREFIX } from "./shared/appShared.jsx";
import { generatePaymentVoucherHTML, generateSalesInvoiceHTML, printPaymentVoucher, siUnitOptionsFor, productRatesEnabled, SI_PAY } from "./sales-invoice/salesInvoiceShared.js";
import { SalesInvoiceTab } from "./sales-invoice/SalesInvoiceTab.jsx";
import { PurchaseInvoiceTab, PiSalesmanView } from "./purchase/PurchaseInvoiceTab.jsx";
import { _globalS, LOGO_URL, APP_NAME, THEMES, getStyles } from "./shared/appShared.jsx";
import { Header } from "./components/AppHeader.jsx";
import { ShopSetupWizard, SetupScreen, SignupRolePicker, SignupForm, LoginScreen, VerifyGate, ChangePasswordScreen } from "./auth/AuthScreens.jsx";
import { InviteCodeRow, PermToggle } from "./team/TeamControls.jsx";
import { ExcelImportModal } from "./components/ExcelImportModal.jsx";

function isBlankProduct(product) {
  return !["name", "code", "barcode"].some((k) => String(product?.[k] ?? "").trim() !== "");
}

function isActiveProduct(product) {
  if (!product) return false;
  return product.isDeleted !== true && product.deleted !== true && !isBlankProduct(product);
}

function mergeProductCatalog(cloudRows = [], localRows = []) {
  const merged = new Map();
  localRows.forEach((product) => {
    const id = String(product?.id || "").trim();
    if (id) merged.set(id, product);
  });
  cloudRows.forEach((product) => {
    const id = String(product?.id || "").trim();
    if (!id) return;
    const local = merged.get(id);
    if (!local) {
      merged.set(id, product);
      return;
    }
    if (product.isDeleted === true || product.deleted === true) {
      merged.set(id, product);
      return;
    }
    const localTs = String(local._offline_updated_at || local.updatedAt || "");
    const cloudTs = String(product._offline_updated_at || product.updatedAt || "");
    merged.set(id, cloudTs > localTs ? product : local);
  });
  return [...merged.values()]
    .filter(isActiveProduct)
    .sort(compareProductNames);
}


const SUPPORT_CONTACTS = {
  whatsapp: "8801860531723",
  whatsappDisplay: "+8801860531723",
  facebook: "https://www.facebook.com/share/18rxnEiW3b/",
  email: "s4businessthinking@gmail.com",
  website: "https://s4businessthinking.com",
  websiteDisplay: "s4businessthinking.com",
};

function openExternalLink(url) {
  if (typeof window === "undefined" || !url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function buildSupportWhatsappUrl(lang) {
  const text = lang === "bn"
    ? "S4 Business Thinking - সাহায্য/complaint: "
    : "S4 Business Thinking - Help/complaint: ";
  return `https://wa.me/${SUPPORT_CONTACTS.whatsapp}?text=${encodeURIComponent(text)}`;
}

// ─── PRESET POSITIONS ────────────────────────────────────────
// ─── PERMISSIONS ────────────────────────────────────────────
const PERMISSIONS_LIST = [
  { key: "sendOrder",        bn: "অর্ডার দেওয়া",              en: "Send Orders" },
  { key: "manageCompanies",  bn: "কোম্পানি ম্যানেজ করা",       en: "Manage Companies" },
  { key: "setPrices",        bn: "দাম সেট করা",                en: "Set Prices" },
  { key: "setStatus",        bn: "স্ট্যাটাস পরিবর্তন করা",     en: "Change Item Status" },
  { key: "markDelivery",     bn: "ডেলিভারি মার্ক করা",         en: "Mark as Delivered" },
  { key: "deleteOrder",      bn: "অর্ডার ডিলিট করা",           en: "Delete Orders" },
  { key: "viewProducts",     bn: "পণ্য তালিকা দেখা",           en: "View Product List" },
  { key: "manageProducts",   bn: "পণ্য যোগ / এডিট / Import",   en: "Add / Edit / Import Products" },
  { key: "manageSales",      bn: "বিক্রয় ইনভয়েস ম্যানেজ করা", en: "Manage Sales Invoices" },
  { key: "manageCustomers",  bn: "কাস্টমার যোগ / বেছে নেওয়া", en: "Add / Pick Customers" },

  // Owner-controlled purchase/supplier/payment access for staff.
  // OFF by default. Salesman can see/use these options only after owner turns them ON from Settings → Team.
  { key: "viewVendors",      bn: "সাপ্লায়ার / ভেন্ডর দেখা",   en: "View Suppliers / Vendors" },
  { key: "manageVendors",    bn: "সাপ্লায়ার / ভেন্ডর যোগ ও এডিট", en: "Add / Edit Suppliers / Vendors" },
  { key: "viewSupplierLedger", bn: "সাপ্লায়ার লেজার দেখা",    en: "View Supplier Ledger" },
  { key: "vendorPayments",   bn: "সাপ্লায়ার পেমেন্ট করা",     en: "Make Supplier Payments" },
  { key: "managePurchase",   bn: "ক্রয় ইনভয়েস ম্যানেজ করা",  en: "Manage Purchase Invoices" },
  { key: "managePdc",        bn: "PDC (পোস্ট ডেটেড চেক) দেখা ও পোস্ট করা", en: "Post Dated Cheques (PDC)" },
  { key: "manageExpenses",   bn: "দোকানের খরচ লেখা",           en: "Record Shop Expenses" },
  { key: "sendBranchTransfer", bn: "Branch-এ পণ্য পাঠানো",      en: "Send Branch Products" },
  { key: "receiveBranchTransfer", bn: "Branch Transfer Receive", en: "Receive Branch Products" },
  { key: "printCheques",     bn: "চেক প্রিন্টার ব্যবহার",       en: "Use Cheque Printer" },
  { key: "viewCustomerBalance", bn: "কাস্টমারের বাকি / লেজার দেখা", en: "View Customer Balance / Ledger" },
  { key: "giveDiscount",     bn: "বিক্রয়ে ডিসকাউন্ট দেওয়া",     en: "Give Discount on Sales" },
  { key: "cancelInvoices",   bn: "ইনভয়েস / রিসিট বাতিল ও ডিলিট", en: "Cancel / Delete Invoices & Receipts" },
  { key: "manageReturns",    bn: "সেলস / পারচেজ রিটার্ন করা",   en: "Sales / Purchase Returns" },
  { key: "stockAdjust",      bn: "স্টক সমন্বয় (কম/বেশি) করা",   en: "Stock Adjustment" },
  { key: "accountVouchers",  bn: "জার্নাল / কন্ট্রা ভাউচার",      en: "Journal / Contra Vouchers" },
  { key: "manageEmployees",  bn: "কর্মচারী ও হাজিরা",              en: "Employees & Attendance" },
  { key: "bankReconcile",    bn: "ব্যাংক হিসাব মেলানো",            en: "Bank Reconciliation" },
  { key: "manageJobs",       bn: "জব কার্ড / সার্ভিস কাজ",          en: "Job Cards / Service Jobs" },
];

const SC = {
  pending:            { color:"#f59e0b", bg:"#451a03" },
  order_confirmed:    { color:"#22c55e", bg:"#052e16" },
  ordered_supplier:   { color:"#06b6d4", bg:"#083344" },
  in_stock:           { color:"#22c55e", bg:"#052e16" },
  out_of_stock:       { color:"#ef4444", bg:"#450a0a" },
  waiting_delivery:   { color:"#f97316", bg:"#431407" },
  arrived_main_shop:  { color:"#a855f7", bg:"#2e1065" },
  out_for_branch:     { color:"#06b6d4", bg:"#083344" },
  delivered:          { color:"#818cf8", bg:"#1e1b4b" },
  cancelled:          { color:"#71717a", bg:"#27272a" },
};

const LANG_KEY = "sparetrack-lang";
const WA_STYLE_KEY = "wa-msg-style";
const THEME_KEY    = "s4-theme";
const ORDER_PREFIX = "S4-";
const loadLang     = () => { try { return localStorage.getItem(LANG_KEY)||"bn"; } catch { return "bn"; } };
const saveLang     = (l) => { try { localStorage.setItem(LANG_KEY,l); } catch {} };
const loadWaStyle  = () => { try { return localStorage.getItem(WA_STYLE_KEY)||"1"; } catch { return "1"; } };
const saveWaStyle  = (v) => { try { localStorage.setItem(WA_STYLE_KEY,v); } catch {} };
const loadTheme    = () => { try { return localStorage.getItem(THEME_KEY)||"dark"; } catch { return "dark"; } };
const saveTheme    = (v) => { try { localStorage.setItem(THEME_KEY,v); } catch {} };

const S4_PROFILE_CACHE_KEY = "s4-auth-profile-cache-v1";

const safeGetJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const safeSetJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const profileCacheKey = (uid) => `${S4_PROFILE_CACHE_KEY}:${uid}`;

const loadCachedProfile = (uid) => uid ? safeGetJson(profileCacheKey(uid)) : null;
const saveCachedProfile = (uid, profile) => {
  if (!uid || !profile) return;
  safeSetJson(profileCacheKey(uid), { ...profile, uid, cachedAt: new Date().toISOString() });
};

const ERP_MOBILE_CSS = `
.erp-m { font-family: Tahoma, "Segoe UI", Arial, sans-serif; }
.erp-m input:not([type=checkbox]):not([type=radio]):not([type=range]),
.erp-m select, .erp-m textarea {
  border-radius: 2px !important;
  border: 1px solid #8797a9 !important;
  background-color: #fff !important;
  color: #07101c !important;
  box-shadow: inset 1px 1px 1px rgba(0,0,0,.12) !important;
}
.erp-m input:focus, .erp-m select:focus, .erp-m textarea:focus {
  border-color: #315fa8 !important;
  box-shadow: inset 1px 1px 1px rgba(0,0,0,.14), 0 0 0 1px #b8d4f5 !important;
}
.erp-m button { border-radius: 3px !important; }
.erp-m button:not(:disabled) {
  box-shadow: inset 1px 1px 0 rgba(255,255,255,.55), inset -1px -1px 0 rgba(35,64,104,.35) !important;
}
.erp-m button:active:not(:disabled) { transform: translateY(1px); }
.erp-m-title {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  min-height: 24px; padding: 3px 8px;
  background: linear-gradient(180deg, #dce9f8 0%, #91acd2 58%, #789bcf 100%);
  border-bottom: 1px solid #6c87af; color: #064e22;
  font-family: Tahoma, "Segoe UI", Arial, sans-serif;
}
.erp-m.erp-m-dark input:not([type=checkbox]):not([type=radio]):not([type=range]),
.erp-m.erp-m-dark select, .erp-m.erp-m-dark textarea {
  border-color: #4f6f92 !important;
  background-color: #0d1522 !important;
  color: #f8fafc !important;
  box-shadow: inset 1px 1px 1px rgba(0,0,0,.4) !important;
}
.erp-m.erp-m-dark button:not(:disabled) {
  box-shadow: inset 1px 1px 0 rgba(255,255,255,.12), inset -1px -1px 0 rgba(0,0,0,.45) !important;
}
.erp-m-dark .erp-m-title {
  background: linear-gradient(180deg, #2c4a7d 0%, #1e3a68 58%, #162c52 100%);
  border-bottom-color: #0f1f3d; color: #d8ffe5;
}
.erp-m-dark .erp-m-title span { color: #b6c7df; }
.erp-m-title strong { font-size: 13px; letter-spacing: .3px; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.erp-m-title span { font-size: 10px; color: #1f2937; white-space: nowrap; }
`;

// ─── WA STYLES ───────────────────────────────────────────────
const WA_STYLES = [
  {
    id:"1", labelBn:"বুলেট", labelEn:"Bullet",
    previewBn:"▪️ *Brake Pad* | BP-123 | Toyota | 2 Pcs\n▪️ *Air Filter* | AF-456 | Honda | 1 Set",
    previewEn:"▪️ *Brake Pad* | BP-123 | Toyota | 2 Pcs\n▪️ *Air Filter* | AF-456 | Honda | 1 Set",
  },
  {
    id:"2", labelBn:"নম্বর", labelEn:"Numbered",
    previewBn:"1️⃣ *Brake Pad* | BP-123 | Toyota | 2 Pcs\n2️⃣ *Air Filter* | AF-456 | Honda | 1 Set",
    previewEn:"1️⃣ *Brake Pad* | BP-123 | Toyota | 2 Pcs\n2️⃣ *Air Filter* | AF-456 | Honda | 1 Set",
  },
  {
    id:"3", labelBn:"ডায়মন্ড", labelEn:"Diamond",
    previewBn:"🔸 *Brake Pad* | BP-123 | Toyota | 2 Pcs\n🔸 *Air Filter* | AF-456 | Honda | 1 Set",
    previewEn:"🔸 *Brake Pad* | BP-123 | Toyota | 2 Pcs\n🔸 *Air Filter* | AF-456 | Honda | 1 Set",
  },
  {
    id:"4", labelBn:"লাইন", labelEn:"Lined",
    previewBn:"──────────────\n▪️ *Brake Pad*\n   BP-123 | Toyota | 2 Pcs\n──────────────\n▪️ *Air Filter*\n   AF-456 | Honda | 1 Set\n──────────────",
    previewEn:"──────────────\n▪️ *Brake Pad*\n   BP-123 | Toyota | 2 Pcs\n──────────────\n▪️ *Air Filter*\n   AF-456 | Honda | 1 Set\n──────────────",
  },
];
const newItem  = () => ({ id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, name:"", code:"", brand:"", qty:"", unit:"Pcs" });

// ─── RESPONSIVE HOOK ─────────────────────────────────────────
function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

// ─── PRICE CELL ──────────────────────────────────────────────
function PriceCell({ initialValue, disabled, placeholder, onOpen }) {
  const stop = (e) => e.stopPropagation();
  const displayValue = String(initialValue ?? "").trim();
  return (
    <div style={{ display:"flex", gap:7, marginBottom:7, alignItems:"center" }}
      onClick={stop} onMouseDown={stop} onPointerDown={stop} onTouchStart={stop}>
      <button
        type="button"
        disabled={disabled}
        onClick={(event)=>{ event.stopPropagation(); onOpen(); }}
        style={{ ..._globalS.inp, textAlign:"left", cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.65:1 }}>
        {displayValue || placeholder}
      </button>
    </div>
  );
}


const productSearchTextCache = new WeakMap();
const productSearchText = (p) => {
  let text = productSearchTextCache.get(p);
  if (text === undefined) {
    const codes = [
      p.barcode,
      p.ean,
      ...(Array.isArray(p.moreBarcodes)?p.moreBarcodes:[]),
      ...(Array.isArray(p.unitPrices)?p.unitPrices.map(r=>r?.barcode):[]),
    ].map(v=>String(v||"").trim()).filter(Boolean);
    text = [p.name,p.code,p.barcode,p.ean,p.brand,p.company,p.category,p.subcategory,p.productGroup,codes.join(" "),specValues(p)].filter(Boolean).join(" ");
    productSearchTextCache.set(p, text);
  }
  return text;
};

const emptyVendor = EMPTY_VENDOR;
const VM_IMPORT_COLUMNS = {
  VendorName:"vendorName", Address:"address", LedgerCode:"vendorCode",
  Emirate:"emirate", Area:"area", PhoneNo:"phoneNumber", MobileNo:"mobileNumber",
  Fax:"fax", Email:"email", LicenseNo:"tradeLicenseNumber", TRN:"trnNumber",
  CreditLimit:"creditLimit", CreditPeriod:"paymentTerms", OpeningBal:"openingBalance",
};

const CM_IMPORT_COLUMNS = {
  CustomerName:"customerName", Address:"address", LedgerCode:"customerCode",
  Emirate:"emirate", Area:"area", PhoneNo:"phoneNumber", MobileNo:"mobileNumber",
  Fax:"fax", Email:"email", LicenseNo:"tradeLicenseNumber", TRN:"trnNumber",
  CreditLimit:"creditLimit", CreditPeriod:"paymentTerms", OpeningBal:"openingBalance",
};

// Sample documents for the live preview in Print Settings → Design.
function designPreviewHtml(kind, style, shop, lang, showCode, colorPrint) {
  const shopInfo = shop?.companyName ? shop : { companyName:"S4 Auto Spare Parts", area:"Industrial Area 4", countryName:"Sharjah", mobile:"+971 50 000 0000", trnNumber:"100000000000003" };
  if (kind === "voucher") {
    return generatePaymentVoucherHTML({
      receiptNo:"RV-0012", receiptDate:"2026-10-04", customerName:"Al Noor Garage", method:"cheque", chequeNo:"004512", chequeBank:"Emirates NBD",
      chequeDate:"2026-10-10", totalAmount:1500, note:"Against old bills",
      allocations:[{ invoiceNo:"SI-0001", invoiceDate:"2026-10-01", amount:1000 }, { invoiceNo:"SI-0004", invoiceDate:"2026-10-02", amount:500 }],
    }, shopInfo, lang, { style, noLayout:true });
  }
  if (kind === "statement") {
    const cols = [["Date"],["Type"],["Doc No"],["Ref"],["Particulars"],["Debit","right"],["Credit","right"],["Balance","right"]].map(([label,align])=>({ label, align }));
    const keys = ["date","type","no","ref","particulars","debit","credit","balance"];
    return generateStatementHTML({
      shopName:shopInfo.companyName, title:"CUSTOMER STATEMENT", subtitle:"01/09/2026 — 04/10/2026", partyLine:"Al Noor Garage · +971 55 111 2222",
      cols, rows:SAMPLE_DATA.statement.items.map(r=>keys.map(k=>r[k])), foot:["","","","","TOTAL","4,950.00","1,500.00","3,450.00 Dr"],
    }, style);
  }
  return generateSalesInvoiceHTML({
    invoiceNo:"SI-0001", invoiceDate:"2026-10-04", invoiceType:"tax", customerName:"Al Noor Garage", customerMobile:"+971 55 111 2222",
    customerAddress:"Ajman", paymentMethod:"credit", status:"partial", amountPaid:500, createdByName:"Admin", salesmanName:"Rahim",
    note:"Goods once sold will not be taken back.",
    items:[
      { name:"Brake Pad Front", code:"BP-101", qty:2, unit:"Pcs", unitPrice:150, discountPerc:0, vatPerc:5 },
      { name:"Oil Filter", code:"OF-22", qty:4, unit:"Pcs", unitPrice:35, discountPerc:5, vatPerc:5 },
      { name:"Shock Absorber Rear", code:"SA-9", qty:1, unit:"Pcs", unitPrice:780, discountPerc:0, vatPerc:5 },
    ],
  }, shopInfo, lang, showCode, colorPrint, { style, noLayout:true, customerBalance:3450 });
}


function mergePartyRow(prev, row, nameKey) {
  const id = row?.id;
  if (!id) return prev;
  const ix = prev.findIndex((p) => p.id === id);
  const merged = { ...(ix >= 0 ? prev[ix] : {}), ...row, id };
  const next = ix >= 0 ? prev.map((p, i) => (i === ix ? merged : p)) : [...prev, merged];
  return next.sort((a, b) => String(a[nameKey] || "").localeCompare(String(b[nameKey] || "")));
}

// Owner-side: gives a code to every party that has none or shares one with an older party.
async function backfillPartyCodes(shopId, kind, records = []) {
  const { field, serial } = PARTY_CODE[kind];
  const ts = (r) => { const v = r?.createdAt; return v?.toMillis ? v.toMillis() : (Date.parse(v) || 0); };
  const sorted = [...records].sort((a, b) => ts(a) - ts(b) || String(a.id).localeCompare(String(b.id)));
  const seen = new Set();
  const missing = [];
  for (const r of sorted) {
    const code = String(r?.[field] || "").trim().toUpperCase();
    if (!code || seen.has(code)) missing.push(r);
    else seen.add(code);
  }
  if (!missing.length) return 0;
  const localMax = records.reduce((m, r) => Math.max(m, partyCodeNumber(kind, r?.[field])), 0);
  const first = await reserveShopSerial(shopId, serial, localMax, missing.length);
  if (!first) return 0;
  for (let i = 0; i < missing.length; i++) {
    await offlineUpdate(kind, missing[i].id, { [field]: formatPartyCode(kind, first + i) });
  }
  window.S4Offline?.syncNow?.().catch(err => console.warn(`[S4 Sync] ${kind} code sync failed`, err));
  return missing.length;
}

// Global keyboard shortcuts per menu tab, shown beside the name in the desktop sidebar.
const TAB_SHORTCUT_KEYS = { products:"F2", purchase:"F3", sales:"F4", vendors:"Ctrl+O", customers:"Ctrl+U" };

function pushOrdersNow() {
  const off = window.S4Offline;
  if (!off) return;
  Promise.resolve(off.syncCollectionNow?.("orders"))
    .catch(err => console.warn("[S4 Sync] order quick push failed", err))
    .finally(() => off.syncNow?.().catch(err => console.warn("[S4 Sync] order sync failed", err)));
}



const SI_SHOW_CODE_KEY = "si-show-code";
const loadSiShowCode = () => { try { return localStorage.getItem(SI_SHOW_CODE_KEY)==="true"; } catch { return false; } };
const saveSiShowCode = (v) => { try { localStorage.setItem(SI_SHOW_CODE_KEY, v?"true":"false"); } catch {} };
const SI_COLOR_KEY = "si-color-print";
const loadSiColor = () => { try { return localStorage.getItem(SI_COLOR_KEY)==="true"; } catch { return false; } };
const saveSiColor = (v) => { try { localStorage.setItem(SI_COLOR_KEY, v?"true":"false"); } catch {} };




function LicenseActivationPanel({ lang, th, s, toast, locked = false, onActivated }) {
  const isBn = lang === "bn";
  const [licenseKey, setLicenseKey] = useState("");
  const [status, setStatus] = useState(null);
  const [accessStatus, setAccessStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState(null);

  const txt = {
    title: isBn ? "লাইসেন্স অ্যাক্টিভেশন" : "License Activation",
    status: isBn ? "লাইসেন্স স্ট্যাটাস" : "License status",
    deviceId: isBn ? "ডিভাইস আইডি" : "Device ID",
    fingerprint: isBn ? "ডিভাইস ফিঙ্গারপ্রিন্ট" : "Device fingerprint",
    copyDevice: isBn ? "ডিভাইস আইডি কপি করুন" : "Copy device ID",
    copyFingerprint: isBn ? "ফিঙ্গারপ্রিন্ট কপি করুন" : "Copy fingerprint",
    keyLabel: isBn ? "লাইসেন্স কী" : "License key",
    keyPlaceholder: "S4-LIC-v1...",
    activate: isBn ? "লাইসেন্স অ্যাক্টিভ করুন" : "Activate license",
    activated: isBn ? "লাইসেন্স সফলভাবে অ্যাক্টিভ হয়েছে" : "License activated successfully",
    invalid: isBn ? "লাইসেন্স কী সঠিক নয়" : "Invalid license key",
    unavailable: isBn ? "লাইসেন্স সার্ভিস প্রস্তুত নয়" : "License service is not ready",
    copied: isBn ? "কপি হয়েছে" : "Copied",
    missing: isBn ? "এখনও পাওয়া যায়নি" : "Not available yet",
    refresh: isBn ? "রিফ্রেশ" : "Refresh",
    trialActive: isBn ? "ফ্রি ট্রায়াল চালু আছে" : "Free trial active",
    trialExpired: isBn ? "ফ্রি ট্রায়াল শেষ" : "Trial expired",
    licenseActive: isBn ? "লাইসেন্স চালু" : "License active",
    daysRemaining: isBn ? "কত দিন বাকি" : "Days remaining",
    accessStatus: isBn ? "অ্যাক্সেস স্ট্যাটাস" : "Access status",
    lockedTitle: isBn ? "ফ্রি ট্রায়াল শেষ" : "Free trial expired",
    lockedNote: isBn
      ? "চালিয়ে যেতে লাইসেন্স অ্যাক্টিভ করুন"
      : "Please activate your license to continue",
    note: isBn
      ? "লাইসেন্স স্ট্যাটাস দেখুন অথবা নতুন লাইসেন্স অ্যাক্টিভ করুন।"
      : "Check license status or activate a new license.",
  };

  const loadStatus = async () => {
    setLoading(true);
    try {
      const helper = typeof window !== "undefined" ? window.S4License : null;
      if (!helper?.getStatus) {
        setStatus({ ok: false, status: "UNKNOWN", reason: "LICENSE_HELPERS_NOT_READY" });
        setAccessStatus(null);
        return;
      }
      const latestLicense = await helper.getStatus();
      const latestAccess = helper.accessStatus ? await helper.accessStatus() : null;
      setStatus(latestLicense);
      setAccessStatus(latestAccess);
    } catch (error) {
      setStatus({ ok: false, status: "ERROR", reason: error?.message || String(error) });
      setAccessStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const copyText = async (value, label) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast(`✅ ${label}: ${txt.copied}`);
    } catch {
      toast("Copy failed", "err");
    }
  };

  const activate = async (event) => {
    event?.preventDefault?.();
    const key = licenseKey.trim();
    if (!key) {
      setMessage({ type: "err", text: txt.invalid });
      return;
    }

    setActivating(true);
    setMessage(null);

    try {
      const helper = typeof window !== "undefined" ? window.S4License : null;
      if (!helper?.activateOffline) {
        setMessage({ type: "err", text: txt.unavailable });
        return;
      }

      const result = await helper.activateOffline(key);
      const latestLicense = helper.getStatus ? await helper.getStatus() : result;
      const latestAccess = helper.accessStatus ? await helper.accessStatus() : null;
      setStatus(latestLicense);
      setAccessStatus(latestAccess);
      setMessage({
        type: result?.ok ? "ok" : "err",
        text: result?.ok ? txt.activated : txt.invalid,
      });
      if (result?.ok) onActivated?.(latestAccess);
      if (result?.ok) setLicenseKey("");
    } catch {
      setMessage({ type: "err", text: txt.invalid });
    } finally {
      setActivating(false);
    }
  };

  const statusText = loading ? "..." : status?.status || "UNKNOWN";
  const statusColor =
    statusText === "ACTIVE" ? "#22c55e" : statusText === "NOT_FOUND" ? "#f59e0b" : "#ef4444";
  const trial = accessStatus?.trial;
  const licenseInfo = accessStatus?.license || status || {};
  const showingLicense = accessStatus?.accessReason === "LICENSE_ACTIVE";

  const licenseExpiresAt = licenseInfo?.expiresAt || status?.expiresAt || "";
  const licenseEndsAtMs = licenseExpiresAt ? new Date(licenseExpiresAt).getTime() : NaN;
  const licenseDaysRemaining = Number.isFinite(licenseEndsAtMs)
    ? Math.max(0, Math.ceil((licenseEndsAtMs - Date.now()) / 86400000))
    : null;

  const displayDaysRemaining = showingLicense
    ? (licenseDaysRemaining ?? (licenseInfo?.plan === "LIFETIME" ? "Lifetime" : "—"))
    : (trial?.daysRemaining ?? "—");

  const displayEndsAt = showingLicense
    ? licenseExpiresAt
    : trial?.trialEndsAt;

  const trialStatusText =
    showingLicense
      ? txt.licenseActive
      : trial?.status === "TRIAL_EXPIRED"
        ? txt.trialExpired
        : trial?.status === "TRIAL_ACTIVE"
          ? txt.trialActive
          : trial?.status || "UNKNOWN";
  const trialColor =
    showingLicense || trial?.status === "TRIAL_ACTIVE"
      ? "#22c55e"
      : trial?.status === "TRIAL_EXPIRED"
        ? "#ef4444"
        : "#f59e0b";

  return (
    <div style={s.card}>
      <div style={s.settingsLbl}>{locked ? txt.lockedTitle : txt.title}</div>
      <div style={{ fontSize:12, color:th.txtMuted, marginBottom:12 }}>{locked ? txt.lockedNote : txt.note}</div>

      <div style={{ background:th.bgInp, borderRadius:10, padding:12, marginBottom:12, border:`1px solid ${th.border}` }}>
        <div style={{ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:800, marginBottom:5 }}>{txt.status}</div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
          <span style={{ fontSize:16, fontWeight:900, color:statusColor }}>{statusText}</span>
          <button style={s.addCoBtn} onClick={loadStatus} disabled={loading}>{txt.refresh}</button>
        </div>
        {status?.reason&&(
          <div style={{ fontSize:11, color:th.txtMuted, marginTop:6 }}>{status.reason}</div>
        )}
      </div>

      <div style={{ background:th.bgInp, borderRadius:10, padding:12, marginBottom:12, border:`1px solid ${th.border}` }}>
        <div style={{ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:800, marginBottom:5 }}>{txt.accessStatus}</div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:6 }}>
          <span style={{ fontSize:14, fontWeight:900, color:trialColor }}>{trialStatusText}</span>
          <span style={{ fontSize:11, color:th.txtMuted }}>{accessStatus?.accessReason || "..."}</span>
        </div>
        <div style={{ fontSize:12, color:th.txtMuted }}>
          {txt.daysRemaining}: <b style={{ color:th.txtPrimary }}>{displayDaysRemaining}</b>
        </div>
        {displayEndsAt&&(
          <div style={{ fontSize:11, color:th.txtMuted, marginTop:4 }}>
            {isBn ? "শেষ হবে" : "Ends"}: {new Date(displayEndsAt).toLocaleString(isBn ? "bn-BD" : "en-GB")}
          </div>
        )}
      </div>

      {[
        { label:txt.deviceId, value:status?.deviceId || accessStatus?.trial?.deviceId, copy:txt.copyDevice },
        { label:txt.fingerprint, value:status?.deviceFingerprint || accessStatus?.trial?.deviceFingerprint, copy:txt.copyFingerprint },
      ].map((item) => (
        <div key={item.label} style={{ marginBottom:10 }}>
          <div style={{ fontSize:10, color:th.txtMuted, fontWeight:800, textTransform:"uppercase", marginBottom:4 }}>{item.label}</div>
          <div style={{ display:"flex", gap:7 }}>
            <input style={{ ...s.inp, flex:1, fontFamily:"monospace", fontSize:11 }} readOnly value={item.value || txt.missing} />
            <button style={s.addCoBtn} onClick={()=>copyText(item.value, item.label)} disabled={!item.value}>{item.copy}</button>
          </div>
        </div>
      ))}

      <form onSubmit={activate}>
        <div style={{ fontSize:10, color:th.txtMuted, fontWeight:800, textTransform:"uppercase", marginBottom:4 }}>{txt.keyLabel}</div>
        <textarea
          style={{ ...s.ta, minHeight:92, fontFamily:"monospace", fontSize:11 }}
          value={licenseKey}
          onChange={e=>setLicenseKey(e.target.value)}
          placeholder={txt.keyPlaceholder}
        />
        <button type="submit" style={s.sendBtn} disabled={activating}>
          {activating ? "..." : txt.activate}
        </button>
      </form>

      {message&&(
        <div style={{ marginTop:10, padding:"10px 12px", borderRadius:10, fontSize:12, fontWeight:800, background:message.type==="ok"?"#052e16":"#450a0a", color:message.type==="ok"?"#22c55e":"#ef4444", border:`1px solid ${message.type==="ok"?"#22c55e":"#ef4444"}` }}>
          {message.text}
        </div>
      )}
    </div>
  );
}


function OrderSupplierPicker({ s, th, selectedSupplier, selectedSupplierId, canEdit, placeholder, onClear, onOpen }) {
  const displayText = selectedSupplier?.name || "";

  return (
    <div
      style={{ marginTop:8 }}
      onClick={e=>e.stopPropagation()}
      onMouseDown={e=>e.stopPropagation()}
      onPointerDown={e=>e.stopPropagation()}
      onTouchStart={e=>e.stopPropagation()}
    >
      <div style={{ position:"relative" }}>
        <input
          style={{ ...s.inp, paddingLeft:34 }}
          value={displayText}
          disabled={!canEdit}
          readOnly
          autoComplete="off"
          placeholder={placeholder}
          onClick={e=>{ e.stopPropagation(); onOpen(); }}
          onFocus={e=>e.currentTarget.blur()}
          onKeyDown={e=>e.stopPropagation()}
        />
        <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", fontSize:14, pointerEvents:"none", color:th.txtMuted }}>🔍</span>
        {(selectedSupplierId||query)&&canEdit&&(
          <button
            type="button"
            onClick={(event)=>{
              event.stopPropagation();
              onClear();
            }}
            style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:th.txtMuted, cursor:"pointer", fontSize:16, lineHeight:1 }}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ─── DASHBOARD TAB ───────────────────────────────────────────
function DashboardTab({ t, lang, th, s, profile, userUid, localShop, orders, cos, products, team, vendors, customers, isOwner, isDesktop, setTab, unread, staffQuickNavKeys, canUseBranchTransfer, btInbox=[], orderModuleEnabled, finance, moneyLocked=false, onUnlockMoney, onLockMoney, toast, onOpenMenu, globalSearchCan, onGlobalSearchNavigate, globalSearchCur, globalSearchCanSeeCost }) {
  const myOrders   = isOwner ? orders : orders.filter(o=>o.createdBy===userUid);
  const isLightDash = th.bgCard === "#ffffff" || th.bgRoot === "#f1f5f9";
  const pending    = myOrders.filter(o=>o.overall==="pending").length;
  // Open orders count whenever they were made; delivered/cancelled only count when they closed today.
  const todayKey   = localIsoDate();
  const closedToday = (o) => {
    const raw = o.updatedAt || o.createdAt;
    const d = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
    return !!d && !Number.isNaN(d.getTime()) && localIsoDate(d) === todayKey;
  };
  const delivered  = myOrders.filter(o=>o.overall==="delivered"&&closedToday(o)).length;
  const cancelled  = myOrders.filter(o=>o.overall==="cancelled"&&closedToday(o)).length;
  const inProgress = myOrders.filter(o=>!["pending","delivered","cancelled"].includes(o.overall)).length;

  const panelStyle = isDesktop
    ? {
        ...s.desktopPanel,
        background:isLightDash
          ? "linear-gradient(180deg,#f8fafc,#eef6ff)"
          : `radial-gradient(circle at 8% 0%, rgba(96,165,250,0.18), transparent 34%), linear-gradient(180deg, ${th.bgRoot}, ${th.bgRoot})`,
      }
    : {
        ...s.panel,
        padding:"16px 14px 96px",
        background:isLightDash
          ? "radial-gradient(circle at 14% 0%, rgba(59,130,246,0.18), transparent 34%), linear-gradient(180deg,#f8fafc,#eaf3ff)"
          : `radial-gradient(circle at 15% 0%, rgba(96,165,250,0.20), transparent 34%), radial-gradient(circle at 92% 8%, rgba(14,165,233,0.10), transparent 30%), linear-gradient(180deg, ${th.bgRoot}, #07111f)`,
      };

  const sectionTitle = {
    display:"flex",
    justifyContent:"space-between",
    alignItems:"center",
    margin:"12px 2px 8px",
    color:th.txtPrimary,
    fontSize:isDesktop?12:11,
    fontWeight:900,
    textTransform:"uppercase",
    letterSpacing:0.7,
  };

  const dashRow = isDesktop ? {
    display:"flex",
    gap:10,
    marginBottom:14,
    overflowX:"auto",
    flexWrap:"nowrap",
    scrollbarWidth:"none",
    WebkitOverflowScrolling:"touch",
  } : {
    display:"grid",
    gridTemplateColumns:"repeat(4, minmax(0,1fr))",
    gap:8,
    marginBottom:14,
  };
  const moneyRow = isDesktop ? dashRow : {
    display:"grid",
    gridTemplateColumns:"repeat(2, minmax(0,1fr))",
    gap:8,
    marginBottom:14,
  };

  const glassCard = {
    background:isLightDash
      ? "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(239,246,255,0.96))"
      : "linear-gradient(145deg, rgba(30,41,59,0.92), rgba(15,23,42,0.86))",
    border:isLightDash ? "1px solid rgba(59,130,246,0.18)" : "1px solid rgba(148,163,184,0.25)",
    boxShadow:isLightDash ? "0 12px 28px rgba(30,64,175,0.10)" : "0 14px 35px rgba(2,6,23,0.32)",
    backdropFilter:"blur(14px)",
  };

  const btWaiting = btInbox.length;
  const ownerNavItems = [
    ...(orderModuleEnabled ? [{ key:"owner", icon:"📋", label:lang==="bn"?"অর্ডার":"Orders", badge:unread }] : []),
    { key:"products", icon:"📦", label:lang==="bn"?"পণ্য":"Products",         badge:products.length },
    { key:"purchase", icon:"🧾", label:lang==="bn"?"ক্রয়":"Purchase",         badge:null },
    { key:"sales",    icon:"🧾", label:lang==="bn"?"বিক্রয়":"Sales",          badge:null },
    { key:"vendors",  icon:"🏭", label:lang==="bn"?"ভেন্ডর":"Vendors",        badge:vendors.length },
    { key:"customers",icon:"👥", label:lang==="bn"?"কাস্টমার":"Customers",    badge:customers.length },
    { key:"cheque",   icon:"🖨️", label:lang==="bn"?"চেক":"Cheque",            badge:null },
    { key:"pdc",      icon:"📃", label:lang==="bn"?"PDC চেক":"PDC",           badge:null },
    { key:"expenses", icon:"💸", label:lang==="bn"?"খরচ":"Expenses",          badge:null },
    { key:"vouchers", icon:"🧾", label:lang==="bn"?"ভাউচার":"Vouchers",       badge:null },
    { key:"salesReturn", icon:"↩️", label:lang==="bn"?"সেলস রিটার্ন":"Sales Return", badge:null },
    { key:"purchaseReturn", icon:"↪️", label:lang==="bn"?"পারচেজ রিটার্ন":"Purchase Return", badge:null },
    { key:"stockAdjust", icon:"⚖️", label:lang==="bn"?"স্টক সমন্বয়":"Stock Adjust", badge:null },
    { key:"accounts", icon:"📊", label:lang==="bn"?"হিসাব নিকাশ":"Accounts",  badge:null },
    { key:"tax",      icon:"🏛️", label:lang==="bn"?"ট্যাক্স / VAT":"Tax / VAT", badge:null },
    { key:"partners", icon:"🤝", label:lang==="bn"?"পার্টনার":"Partners",      badge:null },
    { key:"auditLog", icon:"🕵️", label:lang==="bn"?"অডিট লগ":"Audit Log",   badge:null },
    ...(canUseBranchTransfer ? [{ key:"branchTransfer", icon:"🚚", label:lang==="bn"?"Branch Transfer":"Branch Transfer", badge:btWaiting||null }] : []),
    { key:"settings", icon:"⚙️", label:lang==="bn"?"সেটিংস":"Settings",       badge:null },
  ];

  const salesNavItems = [
    ...(orderModuleEnabled ? [{ key:"shop", icon:"📋", label:lang==="bn"?"অর্ডার":"New Order", badge:unread }] : []),
    ...(staffQuickNavKeys.includes("products") ? [{ key:"products", icon:"📦", label:lang==="bn"?"পণ্য":"Products", badge:null }] : []),
    ...(staffQuickNavKeys.includes("sales") ? [{ key:"sales", icon:"🧾", label:lang==="bn"?"বিক্রয়":"Sales", badge:null }] : []),
    { key:"purchase", icon:"📦", label:lang==="bn"?"ক্রয় তথ্য":"Purchase",   badge:null },
    ...(staffQuickNavKeys.includes("cheque") ? [{ key:"cheque", icon:"🖨️", label:lang==="bn"?"চেক":"Cheque", badge:null }] : []),
    ...(staffQuickNavKeys.includes("pdc") ? [{ key:"pdc", icon:"📃", label:lang==="bn"?"PDC চেক":"PDC", badge:null }] : []),
    ...(staffQuickNavKeys.includes("expenses") ? [{ key:"expenses", icon:"💸", label:lang==="bn"?"খরচ":"Expenses", badge:null }] : []),
    ...(staffQuickNavKeys.includes("vouchers") ? [{ key:"vouchers", icon:"🧾", label:lang==="bn"?"ভাউচার":"Vouchers", badge:null }] : []),
    ...(staffQuickNavKeys.includes("salesReturn") ? [{ key:"salesReturn", icon:"↩️", label:lang==="bn"?"সেলস রিটার্ন":"Sales Return", badge:null }] : []),
    ...(staffQuickNavKeys.includes("purchaseReturn") ? [{ key:"purchaseReturn", icon:"↪️", label:lang==="bn"?"পারচেজ রিটার্ন":"Purchase Return", badge:null }] : []),
    ...(staffQuickNavKeys.includes("stockAdjust") ? [{ key:"stockAdjust", icon:"⚖️", label:lang==="bn"?"স্টক সমন্বয়":"Stock Adjust", badge:null }] : []),
    ...(canUseBranchTransfer ? [{ key:"branchTransfer", icon:"🚚", label:lang==="bn"?"Branch Transfer":"Branch Transfer", badge:btWaiting||null }] : []),
    { key:"settings", icon:"⚙️", label:lang==="bn"?"সেটিংস":"Settings",       badge:null },
  ];

  const navItems = isOwner ? ownerNavItems : salesNavItems;

  const statusCards = [
    { label:t.dashPending,    value:pending,    icon:"⏳", color:"#f59e0b", glow:"rgba(245,158,11,0.26)" },
    { label:t.dashInProgress, value:inProgress, icon:"🔄", color:"#0ea5e9", glow:"rgba(14,165,233,0.26)" },
    { label:t.dashDelivered,  value:delivered,  icon:"✅", color:"#22c55e", glow:"rgba(34,197,94,0.24)" },
    { label:t.dashCancelled,  value:cancelled,  icon:"✖", color:"#ef4444", glow:"rgba(239,68,68,0.24)" },
  ];

  const bn = lang==="bn";
  const cur = t.cur || "AED";
  const money = (v) => (Math.round((parseFloat(v)||0)*100)/100).toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 });
  const salesCards = [
    { key:"st", tab:"sales",    icon:"🧾", color:"#22c55e", label:bn?"আজকের বিক্রি":"Today's sales",
      value:money(finance.salesToday), sub:bn?`${finance.salesTodayCount}টি ইনভয়েস`:`${finance.salesTodayCount} invoices` },
    { key:"sm", tab:"sales",    icon:"📈", color:"#3b82f6", label:bn?"এই মাসের বিক্রি":"This month's sales",
      value:money(finance.salesMonth), sub:bn?`${finance.salesMonthCount}টি ইনভয়েস`:`${finance.salesMonthCount} invoices` },
    { key:"ct", tab:"sales",    icon:"💵", color:"#10b981", label:bn?"আজ টাকা আদায়":"Collected today",
      value:money(finance.collectedToday), sub:bn?"নগদ + রিসিট":"Cash + receipts" },
    { key:"pt", tab:"purchase", icon:"🛒", color:"#8b5cf6", label:bn?"আজকের ক্রয়":"Today's purchase",
      value:money(finance.purchaseToday), sub:bn?`${finance.purchaseTodayCount}টি ইনভয়েস`:`${finance.purchaseTodayCount} invoices` },
    { key:"pm", tab:"purchase", icon:"📦", color:"#a855f7", label:bn?"এই মাসের ক্রয়":"This month's purchase",
      value:money(finance.purchaseMonth), sub:bn?`${finance.purchaseMonthCount}টি ইনভয়েস`:`${finance.purchaseMonthCount} invoices` },
  ];
  const creditCards = [
    { key:"rc", tab:"sales",    icon:"🙋", color:"#f59e0b", label:bn?"কাস্টমারের কাছে পাওনা":"Customers owe you",
      value:money(finance.receivable.amount), sub:bn?`${finance.receivable.parties} জন কাস্টমার`:`${finance.receivable.parties} customers` },
    { key:"py", tab:"purchase", icon:"🏭", color:"#ef4444", label:bn?"সাপ্লায়ারকে দেনা":"You owe suppliers",
      value:money(finance.payable.amount), sub:bn?`${finance.payable.parties} জন সাপ্লায়ার`:`${finance.payable.parties} suppliers` },
    { key:"cr", tab:"pdc",      icon:"📥", color:"#06b6d4", label:bn?"হাতে থাকা চেক (পাওয়া)":"Cheques received (pending)",
      value:money(finance.chequesReceived.amount),
      sub:finance.chequesReceived.dueNow>0
        ? (bn?`${finance.chequesReceived.count}টি · ${finance.chequesReceived.dueNow}টি জমার সময় হয়েছে`:`${finance.chequesReceived.count} · ${finance.chequesReceived.dueNow} due now`)
        : (bn?`${finance.chequesReceived.count}টি চেক`:`${finance.chequesReceived.count} cheques`),
      extra:{ label:bn?"এই মাসে":"This month", value:money(finance.chequesReceived.monthAmount), count:finance.chequesReceived.monthCount },
      alert:finance.chequesReceived.dueNow>0 },
    { key:"ci", tab:"pdc",      icon:"📤", color:"#ec4899", label:bn?"দেওয়া চেক (বাকি)":"Cheques issued (pending)",
      value:money(finance.chequesIssued.amount),
      sub:finance.chequesIssued.dueNow>0
        ? (bn?`${finance.chequesIssued.count}টি · ${finance.chequesIssued.dueNow}টি পাস হওয়ার সময়`:`${finance.chequesIssued.count} · ${finance.chequesIssued.dueNow} due now`)
        : (bn?`${finance.chequesIssued.count}টি চেক`:`${finance.chequesIssued.count} cheques`),
      extra:{ label:bn?"এই মাসে":"This month", value:money(finance.chequesIssued.monthAmount), count:finance.chequesIssued.monthCount },
      alert:finance.chequesIssued.dueNow>0 },
  ];

  const moneyCard = (item, idx, list) => (
    <button
      key={item.key}
      onClick={()=>setTab(item.tab)}
      style={{
        ...glassCard,
        borderRadius:14,
        padding:isDesktop?"10px 12px":"9px 10px",
        minHeight:86,
        boxSizing:"border-box",
        display:"flex",
        flexDirection:"column",
        alignItems:"flex-start",
        justifyContent:"space-between",
        gap:4,
        borderBottom:`3px solid ${item.color}`,
        flex:isDesktop?"1 1 0":undefined,
        minWidth:0,
        width:"100%",
        overflow:"hidden",
        gridColumn:!isDesktop && list.length%2===1 && idx===list.length-1 ? "1 / -1" : undefined,
        cursor:"pointer",
        fontFamily:"inherit",
        textAlign:"left",
        color:th.txtPrimary,
      }}
    >
      <div style={{ display:"flex", alignItems:"center", gap:7, width:"100%" }}>
        <span style={{ width:24, height:24, borderRadius:12, background:`linear-gradient(135deg, ${item.color}, rgba(255,255,255,0.12))`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0 }}>{item.icon}</span>
        <span style={{ color:th.txtSecondary, fontSize:11, fontWeight:800, lineHeight:1.15, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.label}</span>
      </div>
      <div style={{ fontSize:isDesktop?19:16, fontWeight:900, lineHeight:1.1, letterSpacing:-0.3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%" }}>
        <span style={{ fontSize:11, fontWeight:800, color:th.txtMuted, marginRight:4 }}>{cur}</span>{item.value}
      </div>
      <div style={{ fontSize:10, fontWeight:700, color:item.alert?"#f59e0b":th.txtMuted, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%" }}>{item.sub}</div>
      {item.extra&&(
        <div style={{ width:"100%", boxSizing:"border-box", marginTop:2, padding:"4px 7px", borderRadius:8, background:`${item.color}1f`, border:`1px solid ${item.color}44`, display:"flex", flexWrap:"wrap", justifyContent:"space-between", alignItems:"baseline", columnGap:6, rowGap:1, whiteSpace:"nowrap" }}>
          <span style={{ fontSize:10, fontWeight:800, color:th.txtSecondary }}>📅 {item.extra.label} ({item.extra.count})</span>
          <span style={{ fontSize:12, fontWeight:900, color:th.txtPrimary }}>{item.extra.value}</span>
        </div>
      )}
    </button>
  );

  const statCard = (item) => (
    <div
      key={item.label}
      style={{
        ...glassCard,
        borderRadius:14,
        padding:isDesktop?"10px 12px":"8px 8px",
        minHeight:isDesktop?72:64,
        height:isDesktop?72:64,
        boxSizing:"border-box",
        position:"relative",
        overflow:"hidden",
        borderBottom:`3px solid ${item.color}`,
        display:"flex",
        flexDirection:"column",
        justifyContent:"space-between",
        flex:"1 1 0",
        minWidth:0,
      }}
    >
      <div style={{ position:"absolute", inset:"auto -28px -32px auto", width:72, height:72, borderRadius:"50%", background:item.glow||`${item.color}22`, filter:"blur(4px)" }} />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6, position:"relative", zIndex:1 }}>
        <div style={{ width:30, height:30, borderRadius:15, background:`linear-gradient(135deg, ${item.color}, rgba(255,255,255,0.12))`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, boxShadow:`0 6px 14px ${item.color}44`, flexShrink:0 }}>
          {item.icon}
        </div>
        <div style={{ color:th.txtPrimary, fontSize:isDesktop?22:20, lineHeight:1, fontWeight:900, letterSpacing:-0.5 }}>{item.value}</div>
      </div>
      <div style={{ color:th.txtSecondary, fontSize:isDesktop?11:10, fontWeight:700, marginTop:6, lineHeight:1.2, position:"relative", zIndex:1 }}>{item.label}</div>
    </div>
  );

  const globalSearchOn = onGlobalSearchNavigate && globalSearchCan && Object.values(globalSearchCan).some(Boolean);

  return (
    <div style={panelStyle}>
      {!isDesktop && globalSearchOn && (
        <div style={{ marginBottom: 10 }}>
          <AppGlobalSearch
            lang={lang}
            th={th}
            glassCard={{ ...glassCard, borderRadius: 14, padding: "10px 12px" }}
            products={products}
            customers={customers}
            vendors={vendors}
            can={globalSearchCan}
            onNavigate={onGlobalSearchNavigate}
            isMobile
            cur={globalSearchCur || t.cur || "AED"}
            canSeeCost={globalSearchCanSeeCost}
          />
        </div>
      )}

      {orderModuleEnabled && (
        <>
          <div style={sectionTitle}>
            <span>{isOwner ? (lang==="bn"?"আজকের অর্ডার":"Today Overview") : t.dashMyOrders}</span>
            <button onClick={()=>setTab(isOwner?"owner":"shop")} style={{ background:"transparent", border:0, color:"#60a5fa", fontWeight:800, fontSize:12, cursor:"pointer" }}>
              {lang==="bn"?"সব দেখুন":"View all"}
            </button>
          </div>
          <div style={dashRow}>
            {statusCards.map(c=>statCard(c))}
          </div>
        </>
      )}

      {isDesktop && globalSearchOn && (
        <AppGlobalSearch
          lang={lang}
          th={th}
          glassCard={glassCard}
          products={products}
          customers={customers}
          vendors={vendors}
          can={globalSearchCan}
          onNavigate={onGlobalSearchNavigate}
          cur={globalSearchCur || t.cur || "AED"}
          canSeeCost={globalSearchCanSeeCost}
        />
      )}

      {isOwner && !moneyLocked && (
        <ChequeDueAlert lang={lang} th={th} cur={cur} cheques={finance.dueCheques} upcoming={finance.upcomingCheques} today={finance.today}
          userId={userUid} toast={toast} onOpenPdc={()=>setTab("pdc")} />
      )}

      {isOwner && moneyLocked && (
        <button onClick={onUnlockMoney} style={{ ...glassCard, width:"100%", borderRadius:14, padding:"16px 14px", marginTop:6, marginBottom:6, display:"flex", alignItems:"center", gap:12, cursor:"pointer", fontFamily:"inherit", textAlign:"left", color:th.txtPrimary, borderBottom:"3px solid #2563eb" }}>
          <span style={{ fontSize:28 }}>🔒</span>
          <span style={{ flex:1, minWidth:0 }}>
            <span style={{ display:"block", fontSize:14, fontWeight:900 }}>{bn?"টাকার হিসাব লুকানো আছে":"Money figures are hidden"}</span>
            <span style={{ display:"block", fontSize:11, color:th.txtMuted, marginTop:2 }}>
              {bn?"বিক্রি, ক্রয়, পাওনা, দেনা ও চেকের হিসাব দেখতে পিন দিন":"Enter your PIN to see sales, purchase, receivables, payables and cheques"}
              {(finance.dueCheques?.length||0)>0 ? (bn?` · ⏰ ${finance.dueCheques.length}টি চেকের তারিখ এসেছে`:` · ⏰ ${finance.dueCheques.length} cheques due`) : ""}
            </span>
          </span>
          <span style={{ padding:"8px 14px", borderRadius:10, background:"linear-gradient(135deg,#2563eb,#1d4ed8)", color:"#fff", fontSize:13, fontWeight:800, whiteSpace:"nowrap" }}>🔓 {bn?"দেখুন":"Show"}</span>
        </button>
      )}

      {isOwner && !moneyLocked && (
        <>
          <div style={{ ...sectionTitle, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>{bn?"💰 বিক্রির হিসাব":"💰 Sales"}</span>
            {onLockMoney&&<button onClick={onLockMoney} title={bn?"আবার লুকান":"Hide again"} style={{ padding:"4px 10px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:"transparent", color:th.txtSecondary, fontSize:11, fontWeight:800, cursor:"pointer", fontFamily:"inherit" }}>🔒 {bn?"লক":"Lock"}</button>}
          </div>
          <div style={moneyRow}>
            {salesCards.map(moneyCard)}
          </div>
          <div style={sectionTitle}><span>{bn?"📒 বাকির হিসাব":"📒 Credit"}</span></div>
          <div style={moneyRow}>
            {creditCards.map(moneyCard)}
          </div>
        </>
      )}

      {canUseBranchTransfer && btWaiting>0 && (
        <button type="button" onClick={()=>setTab("branchTransfer")}
          style={{ ...glassCard, width:"100%", display:"flex", alignItems:"center", gap:12, padding:"12px 14px", marginBottom:14, borderRadius:14, border:"1px solid #f59e0b", borderLeft:"5px solid #f59e0b", cursor:"pointer", textAlign:"left", fontFamily:"inherit", color:th.txtPrimary }}>
          <span style={{ fontSize:26 }}>🚚</span>
          <span style={{ flex:1, minWidth:0 }}>
            <span style={{ display:"block", fontSize:14, fontWeight:800 }}>
              {bn ? `${btWaiting}টা Branch Transfer রিসিভের অপেক্ষায়` : `${btWaiting} branch transfer${btWaiting>1?"s":""} waiting to be received`}
            </span>
            <span style={{ display:"block", fontSize:12, color:th.txtMuted, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {btInbox.slice(0,3).map(tr=>`${tr.transferNo||""}${tr.branchName?` → ${tr.branchName}`:""}`).join(" · ")}
            </span>
          </span>
          <span style={{ fontSize:12, fontWeight:800, color:"#b45309", whiteSpace:"nowrap" }}>{bn ? "খুলুন ›" : "Open ›"}</span>
        </button>
      )}

      <DashboardQuickNav
        navItems={navItems}
        lang={lang}
        isDesktop={isDesktop}
        isLightDash={isLightDash}
        th={th}
        setTab={setTab}
        title={t.dashQuickNav}
      />

      {!isDesktop && (
        <div style={{ position:"fixed", left:12, right:12, bottom:10, zIndex:20, borderRadius:24, padding:"10px 12px", background:isLightDash?"rgba(255,255,255,0.92)":"rgba(15,23,42,0.86)", border:isLightDash?"1px solid rgba(59,130,246,0.18)":"1px solid rgba(148,163,184,0.25)", boxShadow:isLightDash?"0 20px 40px rgba(30,64,175,0.14)":"0 20px 40px rgba(2,6,23,0.48)", backdropFilter:"blur(16px)", display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
          {[
            { key:"dashboard", icon:"🏠", label:lang==="bn"?"হোম":"Home" },
            { key:isOwner?"owner":"shop", icon:"📋", label:lang==="bn"?"অর্ডার":"Orders" },
            {
              key: isOwner ? "purchase" : "shop",
              icon:"＋",
              label: isOwner ? (lang==="bn"?"নতুন":"New") : (lang==="bn"?"অর্ডার":"Order"),
              main:true,
            },
            ...(isOwner ? [{ key:"vendors", icon:"🏭", label:lang==="bn"?"ভেন্ডর":"Vendors" }] : []),
            { key:"more", icon:"☰", label:lang==="bn"?"আরও":"More" },
          ].map(item=>(
            <button key={item.key} onClick={()=>item.key==="more" ? (onOpenMenu ? onOpenMenu() : setTab("settings")) : setTab(item.key)}
              style={{ border:0, background:"transparent", color:item.main?"#fff":th.txtSecondary, fontFamily:"inherit", display:"flex", flexDirection:"column", alignItems:"center", gap:3, fontSize:10, fontWeight:800 }}>
              <span style={{ width:item.main?50:30, height:item.main?50:30, marginTop:item.main?-24:0, borderRadius:999, background:item.main?"linear-gradient(135deg,#2563eb,#60a5fa)":"transparent", boxShadow:item.main?"0 12px 28px rgba(59,130,246,0.46)":"none", display:"flex", alignItems:"center", justifyContent:"center", fontSize:item.main?34:22 }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PROFILE PASSWORD ────────────────────────────────────────
function ProfilePasswordSettings({ t, lang, profile, toast, th, s }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!currentPw || !newPw || !newPw2) {
      return toast(lang==="bn"?"সব password field পূরণ করুন":"Fill all password fields","err");
    }
    if (!isAcceptablePassword(newPw)) {
      return toast(lang==="bn"?"নতুন password অন্তত ৬ অক্ষর":"New password must be at least 6 characters","err");
    }
    if (newPw !== newPw2) {
      return toast(lang==="bn"?"নতুন password match করছে না":"New passwords do not match","err");
    }

    setBusy(true);
    try {
      await updateOwnPassword(profile.localUserId, currentPw, newPw);
      setCurrentPw("");
      setNewPw("");
      setNewPw2("");
      toast(t.ownPwChangedOk);
    } catch (err) {
      toast(err?.message || String(err), "err");
    } finally {
      setBusy(false);
    }
  };

  if (!profile?.localUserId) return null;

  const inp = {
    padding:"10px 12px",
    borderRadius:8,
    border:`1px solid ${th.borderMid}`,
    background:th.bgInp,
    color:th.txtPrimary,
    fontSize:14,
    outline:"none",
    width:"100%",
    boxSizing:"border-box",
    fontFamily:"inherit",
    marginBottom:10,
  };

  return (
    <div style={{ ...s.card, marginTop:12 }}>
      <div style={s.settingsLbl}>{lang==="bn"?"🔐 পাসওয়ার্ড পরিবর্তন":"🔐 Change Password"}</div>
      <form onSubmit={submit}>
        <input style={inp} type="password" placeholder={t.currentPwLbl} value={currentPw} onChange={e=>setCurrentPw(e.target.value)} autoComplete="current-password" />
        <input style={inp} type="password" placeholder={t.newPwLbl} value={newPw} onChange={e=>setNewPw(e.target.value)} autoComplete="new-password" />
        <input style={inp} type="password" placeholder={t.confirmPwLbl} value={newPw2} onChange={e=>setNewPw2(e.target.value)} autoComplete="new-password" />
        <button type="submit" style={s.sendBtn} disabled={busy}>{busy?"...":t.changePwSettingsBtn}</button>
      </form>
    </div>
  );
}

// ─── HELP SETTINGS ─────────────────────────────────────────────
function HelpSettingsPanel({ t, lang, th, s }) {
  const contactBtn = {
    ...s.stBtn,
    width:"100%",
    textAlign:"left",
    display:"flex",
    alignItems:"center",
    gap:10,
    padding:"12px 14px",
    marginBottom:8,
  };

  return (
    <div style={{ ...s.card, border:"1px solid rgba(249,115,22,0.25)" }}>
      <div style={s.settingsLbl}>{t.helpTitle}</div>
      <div style={{ fontSize:12, color:th.txtMuted, lineHeight:1.6, marginBottom:14 }}>
        {t.helpIntro}
      </div>

      <button
        type="button"
        style={{ ...contactBtn, background:"rgba(34,197,94,0.12)", borderColor:"#22c55e", color:"#22c55e" }}
        onClick={() => openExternalLink(buildSupportWhatsappUrl(lang))}
      >
        <span>{t.helpWhatsappBtn}</span>
        <span style={{ marginLeft:"auto", fontSize:11, opacity:0.9 }}>{SUPPORT_CONTACTS.whatsappDisplay}</span>
      </button>
      <div style={{ fontSize:10, color:"#f59e0b", margin:"-4px 0 10px", lineHeight:1.4 }}>
        {t.helpWhatsappNote}
      </div>

      <button
        type="button"
        style={{ ...contactBtn, background:"rgba(37,99,235,0.1)", borderColor:"#2563eb", color:"#60a5fa" }}
        onClick={() => openExternalLink(SUPPORT_CONTACTS.facebook)}
      >
        <span>{t.helpFacebookBtn}</span>
      </button>

      <button
        type="button"
        style={contactBtn}
        onClick={() => openExternalLink(`mailto:${SUPPORT_CONTACTS.email}?subject=${encodeURIComponent("S4 Business Thinking - Support")}`)}
      >
        <span>{t.helpEmailBtn}</span>
        <span style={{ marginLeft:"auto", fontSize:11, opacity:0.85 }}>{SUPPORT_CONTACTS.email}</span>
      </button>

      <button
        type="button"
        style={contactBtn}
        onClick={() => openExternalLink(SUPPORT_CONTACTS.website)}
      >
        <span>{t.helpWebsiteBtn}</span>
        <span style={{ marginLeft:"auto", fontSize:11, opacity:0.85 }}>{SUPPORT_CONTACTS.websiteDisplay}</span>
      </button>
    </div>
  );
}

// ─── SYNC SETTINGS ───────────────────────────────────────────
function SyncSettingsPanel({
  t,
  lang,
  th,
  s,
  toast,
  syncState,
  syncDashboard,
  lastCloudPullAt,
  cloudUploadBusy,
  cloudPullBusy,
  shopId,
  productCount,
  firebaseCloudReady,
  onUpload,
  onDownload,
  onRefresh,
}) {
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : false;
  const [showFailingDetails, setShowFailingDetails] = useState(false);
  const [failingSamples, setFailingSamples] = useState(null);
  const [failingLoading, setFailingLoading] = useState(false);

  const toggleFailingDetails = async () => {
    const next = !showFailingDetails;
    setShowFailingDetails(next);
    if (!next || failingSamples) return;
    setFailingLoading(true);
    try {
      setFailingSamples(await getFailingSyncSamples());
    } catch (error) {
      console.warn("[S4 Sync] failing sample fetch failed", error);
      setFailingSamples([]);
    } finally {
      setFailingLoading(false);
    }
  };

  return (
    <div style={s.card}>
      <div style={s.settingsLbl}>{t.syncStatus}</div>
      <div style={{ fontSize:14, fontWeight:700, color:syncState==="connected"?"#22c55e":syncState==="offline"?"#ef4444":"#f59e0b", marginBottom:12 }}>
        {syncState==="connected"?t.connected:syncState==="offline"?t.offline:syncState==="reconnecting"?t.reconnecting:t.connecting}
      </div>

      <div style={{ display:"grid", gap:8, marginBottom:14 }}>
        <div style={{ fontSize:12, color:th.txtMuted }}>
          {t.syncShopLbl}: <strong style={{ color:th.txtPrimary, wordBreak:"break-all" }}>{shopId || "—"}</strong>
        </div>
        <div style={{ fontSize:12, color:th.txtMuted }}>
          {t.syncFirebaseLbl}: <strong style={{ color:firebaseCloudReady ? "#22c55e" : "#ef4444" }}>{firebaseCloudReady ? t.syncFirebaseOk : t.syncFirebaseNo}</strong>
        </div>
        <div style={{ fontSize:12, color:th.txtMuted }}>
          {t.syncProductsLbl}: <strong style={{ color:th.txtPrimary }}>{productCount ?? 0}</strong>
        </div>
        <div style={{ fontSize:12, color:th.txtMuted }}>
          {t.syncPendingLbl}: <strong style={{ color:th.txtPrimary }}>{syncDashboard?.pendingSync ?? 0}</strong>
        </div>
        {Number(syncDashboard?.failingSync) > 0 && (
          <div>
            <button
              type="button"
              onClick={toggleFailingDetails}
              style={{
                display:"block", width:"100%", textAlign:"left", background:"none", border:"none",
                padding:0, cursor:"pointer", fontSize:12, color:"#f59e0b", fontFamily:"inherit",
              }}
            >
              {lang==="bn" ? "⚠️ বারবার ব্যর্থ (retry চলছে)" : "⚠️ Repeatedly failing (still retrying)"}: <strong style={{ color:"#f59e0b" }}>{syncDashboard.failingSync}</strong>{" "}
              {showFailingDetails ? "▲" : (lang==="bn" ? "▼ বিস্তারিত দেখুন" : "▼ tap for details")}
            </button>
            {showFailingDetails && (
              <div style={{ marginTop:6, padding:10, borderRadius:8, background:th.bgInp, display:"grid", gap:8 }}>
                {failingLoading && (
                  <div style={{ fontSize:11, color:th.txtMuted }}>{lang==="bn"?"লোড হচ্ছে...":"Loading..."}</div>
                )}
                {!failingLoading && failingSamples?.length === 0 && (
                  <div style={{ fontSize:11, color:th.txtMuted }}>
                    {lang==="bn" ? "কোনো বিস্তারিত পাওয়া যায়নি (সম্ভবত এইমাত্র ঠিক হয়ে গেছে)।" : "No details found (they may have just recovered)."}
                  </div>
                )}
                {!failingLoading && failingSamples?.map((group, i) => (
                  <div key={i} style={{ fontSize:11, borderBottom: i < failingSamples.length - 1 ? `1px solid ${th.border}` : "none", paddingBottom:8 }}>
                    <div style={{ color:th.txtPrimary, fontWeight:700 }}>
                      {group.collectionName} × {group.count} {lang==="bn"?`(${group.maxRetryCount}বার retry)`:`(retried ${group.maxRetryCount}x)`}
                    </div>
                    <div style={{ color:th.txtMuted }}>
                      {lang==="bn"?"নমুনা ID":"sample id"}: <span style={{ wordBreak:"break-all" }}>{group.sampleDocumentId || "—"}</span>
                    </div>
                    <div style={{ color:"#ef4444", wordBreak:"break-word", marginTop:2 }}>{group.lastError}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ fontSize:12, color:th.txtMuted }}>
          {t.syncLocalRecordsLbl}: <strong style={{ color:th.txtPrimary }}>{syncDashboard?.localRecords ?? 0}</strong>
        </div>
        <div style={{ fontSize:12, color:th.txtMuted }}>
          {t.syncLastPullLbl}: <strong style={{ color:th.txtPrimary }}>{lastCloudPullAt ? new Date(lastCloudPullAt).toLocaleString(lang==="bn"?"bn-BD":"en-GB") : "—"}</strong>
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <button
          type="button"
          onClick={onUpload}
          disabled={cloudUploadBusy || !isOnline}
          style={{ ...s.sendBtn, opacity:cloudUploadBusy || !isOnline ? 0.6 : 1 }}
        >
          {cloudUploadBusy ? "..." : t.syncUploadBtn}
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={cloudPullBusy || !isOnline}
          style={{ ...s.sendBtn, background:"linear-gradient(135deg,#2563eb,#1d4ed8)", opacity:cloudPullBusy || !isOnline ? 0.6 : 1 }}
        >
          {cloudPullBusy ? "..." : t.syncDownloadBtn}
        </button>
        <button type="button" onClick={onRefresh} style={s.stBtn}>
          {lang==="bn"?"🔄 রিফ্রেশ":"🔄 Refresh"}
        </button>
      </div>

      {!firebaseCloudReady && isOnline && (
        <div style={{ fontSize:11, color:"#ef4444", marginTop:12, lineHeight:1.5 }}>
          {t.syncNeedEmailLogin}
        </div>
      )}

      {!isOnline && (
        <div style={{ fontSize:11, color:"#f59e0b", marginTop:12 }}>
          {t.syncNeedInternet}
        </div>
      )}

      <div style={{ fontSize:11, color:th.txtMuted, marginTop:12, lineHeight:1.5 }}>
        {lang==="bn"
          ? "নতুন PC/mobile-এ প্রথমবার internet দিয়ে Cloud Download চাপুন। পরে local data offline-এ কাজ করবে।"
          : "On a new PC/mobile, tap Cloud Download once while online. After that, local data works offline."}
      </div>
    </div>
  );
}

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
const [showVendorModal, setShowVendorModal] = useState(false);

const [vendorForm, setVendorForm] = useState(emptyVendor);
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

  const mergeShopRecord = (previous, next) => {
    if (!next) return previous;
    const merged = { ...(previous || {}), ...next };
    const previousHasOrderSetting = Object.prototype.hasOwnProperty.call(previous || {}, "orderModuleEnabled");
    const nextHasOrderSetting = Object.prototype.hasOwnProperty.call(next, "orderModuleEnabled");
    const previousUpdatedAt = Date.parse(previous?.updatedAt || "") || 0;
    const nextUpdatedAt = Date.parse(next?.updatedAt || "") || 0;
    if (previous?.orderModuleEnabled === true && !nextHasOrderSetting) {
      merged.orderModuleEnabled = true;
    }
    if (previousHasOrderSetting && nextHasOrderSetting && previousUpdatedAt > nextUpdatedAt) {
      merged.orderModuleEnabled = previous.orderModuleEnabled;
    }
    return merged;
  };

  const applyShopRecord = (next, { cache = false } = {}) => {
    if (!next) return;
    const mergedForCache = mergeShopRecord(localShop, next);
    setLocalShop(prev => mergeShopRecord(prev, next));
    if (cache && shopId && mergedForCache) {
      saveCachedShop(shopId, mergedForCache);
      offlineCacheCloudRecords("shops", [mergedForCache]).catch((err) =>
        console.warn("[S4 Offline] shop cache failed", err)
      );
    }
  };

  const orderRecordStamp = (order) => {
    const raw = order?.updatedAt || order?.createdAt || order?.createdAtIso || 0;
    const value = raw?.toDate?.() || raw;
    return new Date(value).getTime() || 0;
  };

  const sortOrderRecords = (list) =>
    [...list].sort((a,b) => orderRecordStamp(b) - orderRecordStamp(a));

  const isVisibleOrderRecord = (order) => {
    if (!order || order.shopId !== shopId) return false;
    return isOwner || isOrderManager || order.createdBy === user?.uid;
  };

  const mergeVisibleOrders = (incoming) => {
    const visibleIncoming = (incoming || []).filter(isVisibleOrderRecord);
    setOrders((prev) => {
      const merged = new Map();
      prev.filter(isVisibleOrderRecord).forEach((order) => merged.set(order.id, order));
      visibleIncoming.forEach((order) => {
        const current = merged.get(order.id);
        if (!current || orderRecordStamp(order) >= orderRecordStamp(current)) merged.set(order.id, order);
      });
      return sortOrderRecords([...merged.values()]);
    });
  };

  useEffect(() => {
    if (!user?.uid || isOwner || !db) return;

    let cancelled = false;

    const applyMemberRecord = async (data) => {
      if (!data || cancelled) return;

      const status = String(data.status || "active").toLowerCase();
      if (status === "disabled" || status === "closed" || data.isDeleted === true) {
        toast(
          lang === "bn"
            ? "অ্যাকাউন্ট বন্ধ করা হয়েছে। মালিকের সাথে যোগাযোগ করুন।"
            : "This account has been disabled. Contact the owner.",
          "err"
        );
        onLogout?.();
        return;
      }

      const currentProfile = profileSyncRef.current || {};
      const nextPermissions = data.permissions ?? currentProfile.permissions;
      const nextPosition = data.position || currentProfile.position;
      const permissionsChanged =
        JSON.stringify(nextPermissions || null) !== JSON.stringify(currentProfile.permissions || null);
      const positionChanged = nextPosition !== currentProfile.position;

      if (!permissionsChanged && !positionChanged) return;

      if (currentProfile.localUserId && permissionsChanged) {
        try {
          await updateLocalUserProfile(currentProfile.localUserId, {
            permissions: nextPermissions,
          });
        } catch (error) {
          console.warn("[S4 Team] local permission sync failed", error);
        }
      }

      onProfileUpdate?.({
        permissions: nextPermissions,
        position: nextPosition,
      });
    };

    offlineGetById("users", user.uid)
      .then((row) => applyMemberRecord(row?.data))
      .catch((error) => console.warn("[S4 Team] offline profile sync failed", error));

    let unsub = () => {};
    if (authSyncReady) {
      unsub = onSnapshot(
        doc(db, "users", user.uid),
        (snap) => {
          if (snap.exists()) applyMemberRecord(snap.data());
        },
        (error) => console.warn("[S4 Team] cloud profile sync failed", error)
      );
    }

    return () => {
      cancelled = true;
      unsub();
    };
  }, [user?.uid, isOwner, profile.localUserId, lang, authSyncReady]);

  const refreshSyncDashboard = async () => {
    try {
      setSyncDashboard(await getSyncDashboardStatus());
    } catch (error) {
      console.warn("[S4 Sync] dashboard refresh failed", error);
    }
  };

  const applyCloudPullResult = (pullResult) => {
    if (!pullResult?.data) return;
    const sorted = sortPulledRecords(pullResult.data);

    if (sorted.products.length) setProducts((previous) => mergeProductCatalog(sorted.products, previous));
    if (sorted.companies.length) setCos(sorted.companies);
    if (sorted.customers.length) setCustomers(sorted.customers);
    if (sorted.vendors.length) setVendors(sorted.vendors);
    if (sorted.orders.length) mergeVisibleOrders(sorted.orders);
    if (sorted.team.length) setTeam(sorted.team);
    if (sorted.shop) applyShopRecord(sorted.shop, { cache: true });
    if (sorted.inviteCodes.length) {
      setInviteCodes(sorted.inviteCodes.map((c) => ({ ...c, code: c.code || c.id })));
    }

    setSyncState(typeof navigator !== "undefined" && navigator.onLine ? "connected" : "offline");
  };

  const runCloudDownload = ({ silent = false } = {}) => {
    if (cloudPullRunRef.current) return cloudPullRunRef.current;
    const run = runCloudDownloadOnce({ silent });
    cloudPullRunRef.current = run;
    run.finally(() => { if (cloudPullRunRef.current === run) cloudPullRunRef.current = null; });
    return run;
  };

  const runCloudDownloadOnce = async ({ silent = false } = {}) => {
    if (!shopId) return null;
    const blockReason = getCloudSyncBlockReason();
    if (blockReason === "FIREBASE_AUTH_REQUIRED") {
      if (!silent) toast(t.syncNeedEmailLogin, "err");
      return null;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (!silent) toast(t.syncNeedInternet, "err");
      return null;
    }

    setCloudPullBusy(true);
    try {
      const result = await pullShopFromCloud(shopId, {
        filterOrdersForUserId: user?.uid,
        includeAllOrders: isOwner || isOrderManager,
      });

      if (result?.reason === "OFFLINE") {
        if (!silent) toast(t.syncNeedInternet, "err");
        return null;
      }

      applyCloudPullResult(result);
      setLastCloudPullAt(result.pulledAt || getShopCloudPulledAt(shopId));
      setSyncRefreshKey((value) => value + 1);

      if (!silent) {
        const productCount = result?.data?.products?.length || 0;
        const msg = `${t.syncDownloadOk} (${result.totalDocs || 0}, products: ${productCount})`;
        const failedNames = (result.results || []).filter((r) => !r.ok).map((r) => r.collection);
        const failedNote = failedNames.length
          ? (lang==="bn" ? ` ⚠️ আসেনি: ${failedNames.join(", ")}` : ` ⚠️ Not downloaded: ${failedNames.join(", ")}`)
          : "";
        toast(`${msg}${failedNote}`, failedNames.length ? "err" : "ok");
        if (failedNames.length) console.warn("[S4 Sync] cloud download failed for", (result.results || []).filter((r) => !r.ok));
      }

      await refreshSyncDashboard();
      return result;
    } catch (error) {
      if (!silent) {
        if (error?.code === "FIREBASE_AUTH_REQUIRED") {
          toast(t.syncNeedEmailLogin, "err");
        } else {
          toast(error?.message || String(error), "err");
        }
      }
      return null;
    } finally {
      setCloudPullBusy(false);
    }
  };

  const runCloudUpload = async () => {
    if (!shopId) return;
    const blockReason = getCloudSyncBlockReason();
    if (blockReason === "OFFLINE" || (typeof navigator !== "undefined" && !navigator.onLine)) {
      toast(t.syncNeedInternet, "err");
      return;
    }
    if (blockReason === "FIREBASE_AUTH_REQUIRED") {
      toast(t.syncNeedEmailLogin, "err");
      return;
    }

    setCloudUploadBusy(true);
    try {
      // Repair pass first: find any local record (in any collection) that
      // Firestore doesn't actually have — regardless of what its local dirty
      // flag says — and re-queue it with the correct shopId. This is what
      // catches records that got silently stuck (e.g. missing a shopId tag,
      // or abandoned after repeated sync failures) before the normal
      // "upload everything pending" pass below runs.
      const reconcileResult = await reconcileShopWithCloud(shopId);
      if (reconcileResult?.skipped) {
        if (reconcileResult?.reason === "FIREBASE_AUTH_REQUIRED") {
          toast(t.syncNeedEmailLogin, "err");
        } else {
          toast(t.syncNeedInternet, "err");
        }
        return;
      }
      const repairedCount = reconcileResult?.totalRequeued || 0;

      const result = await uploadPendingShopChanges(shopId);
      if (result?.reason === "OFFLINE" || result?.skipped) {
        if (result?.reason === "FIREBASE_AUTH_REQUIRED") {
          toast(t.syncNeedEmailLogin, "err");
        } else {
          toast(t.syncNeedInternet, "err");
        }
        return;
      }

      const productCount = result.productsUploaded || 0;
      const uploaded = result.totalUploaded || result.done || 0;
      if (uploaded === 0 && repairedCount === 0 && (syncDashboard?.localRecords || 0) > 0) {
        toast(
          lang === "bn"
            ? "⚠️ Cloud-এ upload হয়নি। Logout → email/password দিয়ে login → v1.0.12+ install করুন"
            : "⚠️ Nothing uploaded. Logout, sign in with email/password, and use v1.0.12+",
          "err"
        );
        return;
      }

      const repairedSuffix = repairedCount
        ? (lang === "bn" ? `, মেরামত: ${repairedCount}` : `, repaired: ${repairedCount}`)
        : "";
      const msg = lang==="bn"
        ? `${t.syncUploadOk} (${uploaded} records, products: ${productCount}${repairedSuffix})`
        : `${t.syncUploadOk} (${uploaded} records, products: ${productCount}${repairedSuffix})`;
      toast(result.failed || result.totalFailed ? `${msg} ⚠️` : msg, result.failed || result.totalFailed ? "err" : "ok");
      await refreshSyncDashboard();
    } catch (error) {
      if (error?.code === "FIREBASE_AUTH_REQUIRED") {
        toast(t.syncNeedEmailLogin, "err");
      } else {
        toast(error?.message || String(error), "err");
      }
    } finally {
      setCloudUploadBusy(false);
    }
  };

  const refreshLicenseAccess = async () => {
    setLicenseAccessLoading(true);
    try {
      const helper = typeof window !== "undefined" ? window.S4License : null;
      if (!helper?.accessStatus) {
        setLicenseAccess({
          ok: false,
          accessAllowed: true,
          accessReason: "LICENSE_HELPERS_NOT_READY",
        });
        return;
      }
      setLicenseAccess(await helper.accessStatus());
    } catch (error) {
      console.warn("[S4 License] access status check failed", error);
      setLicenseAccess({
        ok: false,
        accessAllowed: true,
        accessReason: "LICENSE_ACCESS_CHECK_FAILED",
        error: error?.message || String(error),
      });
    } finally {
      setLicenseAccessLoading(false);
    }
  };

  useEffect(() => {
    refreshLicenseAccess();
  }, []);

  useEffect(() => {
    if (!shopId) {
      setSyncState("offline");
      return;
    }

    setLastCloudPullAt(getShopCloudPulledAt(shopId));
    refreshSyncDashboard();

    const handleConnectivity = () => {
      refreshSyncDashboard();
      if (typeof navigator !== "undefined" && navigator.onLine && !getCloudSyncBlockReason()) {
        window.S4Offline?.syncNow?.().catch((err) =>
          console.warn("[S4 Sync] auto upload on reconnect failed", err)
        );
      }
    };

    window.addEventListener("online", handleConnectivity);
    window.addEventListener("offline", handleConnectivity);
    return () => {
      window.removeEventListener("online", handleConnectivity);
      window.removeEventListener("offline", handleConnectivity);
    };
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;

    const runAutoUpload = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (getCloudSyncBlockReason()) return;
      window.S4Offline?.syncNow?.().catch((err) =>
        console.warn("[S4 Sync] periodic auto upload failed", err)
      );
    };

    runAutoUpload();
    const timer = window.setInterval(runAutoUpload, 15000);

    return () => window.clearInterval(timer);
  }, [shopId, user?.uid]);

  // Cold-start / catch-up pull only. Continuous freshness is now handled by the
  // real-time onSnapshot listeners above and the background collection sync
  // below — this just covers a brand-new install (empty local catalog) or a
  // very stale local cache, and re-runs once when a genuine Firebase Auth
  // session becomes available (it can't do anything useful before that).
  // Manual "Cloud Download" in Settings > Sync (runCloudDownload) remains the
  // user-triggered fallback for a full re-pull at any time.
  useEffect(() => {
    if (!shopId || !authSyncReady) return;
    let cancelled = false;

    const tryAutoPull = async ({ force = false } = {}) => {
      try {
        const forceKey = `s4-force-cloud-pull:${shopId}`;
        const forced =
          force ||
          (typeof sessionStorage !== "undefined" && sessionStorage.getItem(forceKey) === "1");
        if (!forced && !(await shouldAutoPullShop(shopId))) return;
        if (forced && typeof sessionStorage !== "undefined") {
          try { sessionStorage.removeItem(forceKey); } catch {}
        }
        const result = await runCloudDownload({ silent: !forced });
        if (!cancelled && result?.ok && !forced) {
          toast(t.syncAutoPullOk);
        }
      } catch (error) {
        console.warn("[S4 Sync] auto cloud pull failed", error);
      }
    };

    tryAutoPull({ force: false });

    return () => {
      cancelled = true;
    };
  }, [shopId, isOwner, isOrderManager, user?.uid, authSyncReady]);

  const finance = useShopFinance(shopId, { enabled: isOwner, live: !!authSyncReady });
  useChequeDueNotifications({
    shopId, enabled: isOwner, cheques: finance.dueCheques, upcoming: finance.upcomingCheques, pending: finance.pendingCheques, today: finance.today,
    lang, toast, cur: t.cur || "AED", onOpen: () => setTab("dashboard"),
  });
  const [empFocus, setEmpFocus] = useState(null);
  const employeeAlertList = useEmployeeAlerts({
    shopId, enabled: isOwner || can("manageEmployees"), shopCountry: localShop?.country || "",
    lang, toast, cur: t.cur || "AED", onOpen: () => { setSettingsPage(null); setTab("employees"); },
  });
  const partnerAlertList = usePartnerAlerts({
    shopId, enabled: isOwner, shop: localShop, lang, toast, cur: t.cur || "AED", onOpen: () => { setSettingsPage(null); setTab("partners"); },
  });
  const reminderAlertList = useReminderAlerts({
    shopId, uid: user?.uid, isOwner, lang, toast, onOpen: () => { setSettingsPage(null); setTab("reminders"); },
  });
  const [calcMode, setCalcMode] = useState(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "F12" || (!e.ctrlKey && !e.shiftKey)) return;
      e.preventDefault();
      const want = e.shiftKey ? "fx" : "calc";
      setCalcMode((m) => (m === want ? null : want));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const openEmployeeAlert = (a) => {
    setSettingsPage(null);
    if (a.kind === "attendance") { setTab("attendance"); return; }
    if ((a.kind === "salaryDue" || a.kind === "salarySoon") && (isOwner || can("manageExpenses"))) { setTab("employeeExpense"); return; }
    if (a.employeeId) setEmpFocus({ id: a.employeeId, section: a.section || "basic", at: Date.now() });
    setTab("employees");
  };

  useEffect(() => {
    if (!shopId || !isOwner || !authSyncReady) return;
    return startAutoBackup(shopId, {
      onReminder: () => toast(lang==="bn"
        ? "💾 অনেকদিন ব্যাকআপ নেওয়া হয়নি — সেটিংস › ব্যাকআপ ও রিস্টোর থেকে Google Drive-এ ব্যাকআপ নিন"
        : "💾 No recent backup — go to Settings › Backup & restore to save one to Google Drive"),
    });
  }, [shopId, isOwner, authSyncReady]);

  // ── Background real-time sync for collections that don't have their own
  // always-mounted listener above (purchaseInvoices/purchasePayments/
  // salesInvoices already get true real-time UI updates from their own tab
  // components while that tab is open; this keeps their local SQLite cache
  // live even while the user is on a different tab, so switching to that tab
  // — or working fully offline — never shows minutes-old data). Gated on
  // genuine Firebase auth + auto-retry with backoff via subscribeShopCollection. ──
  useEffect(() => {
    if (!shopId) return;

    const backgroundCollections = SHOP_PULL_COLLECTIONS.filter(
      (name) => !["products", "companies", "customers", "vendors", "orders", "users"].includes(name)
    );

    const unsubscribers = backgroundCollections.map((collectionName) =>
      subscribeShopCollection({
        collectionName,
        shopId,
        onRows: () => {}, // cache-only: no MainApp-level UI state for these
        onStatus: ({ state }) => {
          if (state === "connected") {
            setLastCloudPullAt(new Date().toISOString());
          }
        },
      })
    );

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [shopId]);

  useEffect(() => {
    if (!auth || !shopId) return;

    return onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) return;
      setSyncRefreshKey((value) => value + 1);
      if (typeof navigator !== "undefined" && navigator.onLine) {
        window.S4Offline?.syncNow?.().catch((err) =>
          console.warn("[S4 Sync] auth restore upload failed", err)
        );
        const forceKey = `s4-force-cloud-pull:${shopId}`;
        const forced = typeof sessionStorage !== "undefined" && sessionStorage.getItem(forceKey) === "1";
        (forced ? Promise.resolve(true) : shouldAutoPullShop(shopId)).then((shouldPull) => {
          if (!shouldPull) return null;
          if (forced && typeof sessionStorage !== "undefined") {
            try { sessionStorage.removeItem(forceKey); } catch {}
          }
          return runCloudDownload({ silent: !forced });
        }).catch((err) => console.warn("[S4 Sync] auth restore cloud pull failed", err));
      }
    });
  }, [shopId]);

  useEffect(() => {
    if (settingsPage !== "sync") return;
    refreshSyncDashboard();
  }, [settingsPage]);

  useEffect(() => {
    if (settingsPage !== "team" || !isOwner || !shopId || !team.length) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    let cancelled = false;

    (async () => {
      try {
        const result = await backfillShopStaffCloudRecords(shopId, team);
        if (!cancelled && result?.updated > 0) {
          rebuildTeam();
        }
      } catch (error) {
        console.warn("[S4 Team] staff cloud backfill on team page failed", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [settingsPage, isOwner, shopId]);

  const [showChequePrinter,setShowChequePrinter]=useState(false);
  useEffect(() => {
    if (shopProp) applyShopRecord(shopProp);
  }, [shopProp]);

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;

    (async () => {
      try {
        const local = await loadShopRecord(shopId);
        if (!cancelled && local) applyShopRecord(local);
      } catch (err) {
        console.warn("[S4 Shop] local load failed", err);
      }
    })();

    let unsub = () => {};
    if (authSyncReady) {
      unsub = onSnapshot(
        doc(db, "shops", shopId),
        (snap) => {
          if (!snap.exists()) return;
          const data = { id: snap.id, ...snap.data() };
          applyShopRecord(data, { cache: true });
        },
        (err) => console.warn("[S4 Shop] online listener failed", err)
      );
    }

    return () => {
      cancelled = true;
      unsub();
    };
  }, [shopId, authSyncReady]);

  // ── Orders real-time listener with offline cache fallback ──
  useEffect(() => {
    if (!shopId) return;

    const applyOrderRecords = (incoming) => {
      mergeVisibleOrders(incoming);
    };

    const loadLocalOrders = async () => {
      try {
        const local = await offlineList("orders");

        let docs = local.records
          .map(r => ({ id: r.document_id, ...(r.data || {}) }))
          .filter(o => o.shopId === shopId);

        if (!isOwner && !isOrderManager) {
          docs = docs.filter(o => o.createdBy === user.uid);
        }

        applyOrderRecords(docs);
        setSyncState("offline");
      } catch (err) {
        console.error("orders offline fallback:", err);
        setSyncState("offline");
      }
    };

    const applyDocs = (snap) => {
      if (snap.metadata?.fromCache && snap.empty) {
        loadLocalOrders();
        return;
      }

      const docs = snap.docs.map(d => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
        };
      });

      applyOrderRecords(docs);
      offlineCacheCloudRecords("orders", docs).catch(err => console.warn("[S4 Offline] order cache failed", err));
      setSyncState("connected");
    };

    let unsub = () => {};
    if (authSyncReady) {
      const q = (isOwner||isOrderManager)
        ? query(collection(db,"orders"), where("shopId","==",shopId), orderBy("createdAt","desc"))
        : query(collection(db,"orders"), where("shopId","==",shopId), where("createdBy","==",user.uid), orderBy("createdAt","desc"));

      unsub = onSnapshot(
        q,
        applyDocs,
        err => {
          console.error("orders listener:", err);
          loadLocalOrders();
        }
      );
    }

    loadLocalOrders();

    return () => unsub();
  },[shopId,isOwner,isOrderManager,user?.uid,authSyncReady]);

  // ── Companies real-time listener with offline fallback ──
  useEffect(() => {
    if (!shopId) return;

    const loadLocalCompanies = async () => {
      try {
        const local = await offlineList("companies");
        const docs = local.records
          .map(r => ({ id: r.document_id, ...(r.data || {}) }))
          .filter(c => c.shopId === shopId)
          .sort((a,b)=>(a.name||"").localeCompare(b.name||""));

        setCos(docs);
        setSyncState("offline");
      } catch (err) {
        console.error("companies offline fallback:", err);
      }
    };

    const applyDocs = (snap) => {
      if (snap.metadata?.fromCache && snap.empty) {
        loadLocalCompanies();
        return;
      }

      const docs = snap.docs
        .map(d=>({...d.data(),id:d.id}))
        .sort((a,b)=>(a.name||"").localeCompare(b.name||""));

      setCos(docs);
      offlineCacheCloudRecords("companies", docs).catch(err => console.warn("[S4 Offline] company cache failed", err));
      setSyncState("connected");
    };

    let unsub = () => {};
    if (authSyncReady) {
      unsub = onSnapshot(
        query(collection(db,"companies"), where("shopId","==",shopId), orderBy("name")),
        applyDocs,
        (err) => {
          console.error("companies listener:", err);
          loadLocalCompanies();
        }
      );
    }

    loadLocalCompanies();

    return () => unsub();
  },[shopId,authSyncReady]);
  
  // ── Vendors real-time listener with offline fallback ──
  useEffect(() => {
    if (!shopId) return;

    const loadLocalVendors = async () => {
      try {
        const local = await offlineList("vendors");
        const docs = local.records
          .map(r => ({ id: r.document_id, ...(r.data || {}) }))
          .filter(v => v.shopId === shopId)
          .sort((a,b)=>(a.vendorName||"").localeCompare(b.vendorName||""));

        setVendors(docs);
        setSyncState("offline");
      } catch (err) {
        console.error("vendors offline fallback:", err);
      }
    };

    const applyDocs = (snap) => {
      if (snap.metadata?.fromCache && snap.empty) {
        loadLocalVendors();
        return;
      }

      const docs = snap.docs
        .map(d => ({ id:d.id, ...d.data() }))
        .sort((a,b)=>(a.vendorName||"").localeCompare(b.vendorName||""));

      setVendors(docs);
      offlineCacheCloudRecords("vendors", docs).catch(err => console.warn("[S4 Offline] vendor cache failed", err));
      setSyncState("connected");
    };

    let unsub1 = () => {};
    let unsub2 = null;

    if (authSyncReady) {
      unsub1 = onSnapshot(
        query(collection(db,"vendors"), where("shopId","==",shopId), orderBy("vendorName")),
        applyDocs,
        () => {
          unsub2 = onSnapshot(
            query(collection(db,"vendors"), where("shopId","==",shopId)),
            applyDocs,
            (err) => {
              console.error("vendors listener error:", err);
              loadLocalVendors();
            }
          );
        }
      );
    }

    loadLocalVendors();

    return () => { unsub1(); unsub2 && unsub2(); };
  }, [shopId, authSyncReady]);

  // ── Customers real-time listener with offline fallback ──
  useEffect(() => {
    if (!shopId) return;

    const loadLocalCustomers = async () => {
      try {
        const local = await offlineList("customers");
        const docs = local.records
          .map(r => ({ id: r.document_id, ...(r.data || {}) }))
          .filter(c => c.shopId === shopId)
          .sort((a,b)=>(a.customerName||"").localeCompare(b.customerName||""));

        setCustomers(docs);
        setSyncState("offline");
      } catch (err) {
        console.error("customers offline fallback:", err);
      }
    };

    const applyDocs = (snap) => {
      if (snap.metadata?.fromCache && snap.empty) {
        loadLocalCustomers();
        return;
      }

      const docs = snap.docs
        .map(d=>({ id:d.id, ...d.data() }))
        .sort((a,b)=>(a.customerName||"").localeCompare(b.customerName||""));

      setCustomers(docs);
      offlineCacheCloudRecords("customers", docs).catch(err => console.warn("[S4 Offline] customer cache failed", err));
      setSyncState("connected");
    };

    let unsub1 = () => {};
    let unsub2 = null;

    if (authSyncReady) {
      unsub1 = onSnapshot(
        query(collection(db,"customers"), where("shopId","==",shopId), orderBy("customerName")),
        applyDocs,
        () => {
          unsub2 = onSnapshot(
            query(collection(db,"customers"), where("shopId","==",shopId)),
            applyDocs,
            (err) => {
              console.error("customers listener:", err);
              loadLocalCustomers();
            }
          );
        }
      );
    }

    loadLocalCustomers();

    return () => { unsub1(); unsub2 && unsub2(); };
  }, [shopId, authSyncReady]);

  // Owner, online: give vendors/customers without a code (old, quick-added, imported, offline) a shop code.
  const partyCodeBusy = useRef({});
  useEffect(() => {
    if (!isOwner || !shopId || !authSyncReady || syncState !== "connected") return;
    const timer = setTimeout(() => {
      [["vendors", vendors], ["customers", customers]].forEach(([kind, list]) => {
        if (partyCodeBusy.current[kind] || !list.length) return;
        partyCodeBusy.current[kind] = true;
        backfillPartyCodes(shopId, kind, list)
          .catch(err => console.warn(`[S4] ${kind} code backfill failed`, err))
          .finally(() => { partyCodeBusy.current[kind] = false; });
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, [isOwner, shopId, authSyncReady, syncState, vendors, customers]);

  const cloudTeamRef = useRef([]);
  const inviteCodesRef = useRef([]);
  const teamPermissionOverridesRef = useRef({});

  const rebuildTeam = async () => {
    if (!shopId) return;
    try {
      if (isOwner && inviteCodesRef.current.length) {
        await backfillLegacyTeamMembers({
          cloudUsers: cloudTeamRef.current,
          usedInvites: inviteCodesRef.current,
          shopId,
        });
      }

      const localTeam = await listShopTeamMembers(shopId);
      let nextTeam = assembleShopTeam({
        cloudUsers: cloudTeamRef.current,
        localTeam,
        usedInvites: inviteCodesRef.current,
      });

      const overrides = teamPermissionOverridesRef.current;
      nextTeam = nextTeam.map((member) => {
        const memberId = member.uid || member.id;
        const override = overrides[memberId];
        if (!override) return member;

        const mergedCloud = { ...DEFAULT_PERMISSIONS, ...(member.permissions || {}) };
        const mergedOverride = { ...DEFAULT_PERMISSIONS, ...override };
        if (JSON.stringify(mergedCloud) === JSON.stringify(mergedOverride)) {
          delete overrides[memberId];
          return member;
        }

        return { ...member, permissions: override };
      });

      setTeam(nextTeam);
    } catch (err) {
      console.error("[S4 Team] rebuild failed", err);
    }
  };

  useEffect(() => {
    inviteCodesRef.current = inviteCodes;
    rebuildTeam();
  }, [inviteCodes, shopId]);

  useEffect(() => {
    if (!shopId) return;

    rebuildTeam();

    if (!authSyncReady) return undefined;

    return onSnapshot(
      query(collection(db,"users"), where("shopId","==",shopId)),
      (snap) => {
        cloudTeamRef.current = snap.docs.map((d) => ({
          ...d.data(),
          id: d.id,
          uid: d.data().uid || d.id,
        }));
        rebuildTeam();
      },
      (err) => {
        console.error(err);
        rebuildTeam();
      }
    );
  },[shopId, authSyncReady]);

  // ── Invite codes listener (owner only) ──
  useEffect(() => {
    if (!isOwner || !authSyncReady) return undefined;
    return onSnapshot(
      query(collection(db,"inviteCodes"), where("shopId","==",shopId)),
      snap => setInviteCodes(snap.docs.map(d=>({...d.data(), code:d.id}))),
      err  => console.error(err)
    );
  },[shopId, isOwner, authSyncReady]);

  // ── Products — realtime listener with offline cache fallback ──
  const [productsLoading,setProductsLoading]=useState(false);
  const [productMaintenance,setProductMaintenance]=useState({ active:false, catalogEpoch:0 });
  const [productReplacementActive,setProductReplacementActive]=useState(false);
  const productMaintenanceRef=useRef({ active:false, catalogEpoch:0 });
  const productMaintenanceId=shopId;

  useEffect(() => {
    if (!shopId || !db || !authSyncReady) return undefined;
    return onSnapshot(
      doc(db, "productMaintenance", productMaintenanceId),
      (snap) => {
        const next = snap.exists()
          ? { active:!!snap.data().active, catalogEpoch:Number(snap.data().catalogEpoch)||0, ...snap.data() }
          : { active:false, catalogEpoch:0 };
        productMaintenanceRef.current = next;
        setProductMaintenance(next);
        if (next.active) window.S4Offline?.pauseCollectionSync?.("products");
        else if (!productReplacementActive) window.S4Offline?.resumeCollectionSync?.("products");
      },
      (err) => console.warn("[Product Master] maintenance lock listener failed", err)
    );
  }, [shopId, productMaintenanceId, productReplacementActive, authSyncReady]);

  const fetchProducts = async () => {
    setSyncRefreshKey((value) => value + 1);
  };

  useEffect(() => {
    if (!shopId) return;

    setProductsLoading(true);

    let cancelled = false;
    let cloudApplied = false;
    let cloudRows = new Map(); // every cloud product of this shop, tombstones included
    let publishSeq = 0;

    const loadLocalProducts = async () => {
      try {
        const local = await offlineList("products");
        if (cancelled || cloudApplied) return;
        const docs = local.records
          .map((r) => ({ id: r.document_id, ...(r.data || {}) }))
          .filter((p) => p.shopId === shopId && isActiveProduct(p))
          .sort(compareProductNames);
        setProducts(docs);
        setSyncState(typeof navigator !== "undefined" && navigator.onLine ? "connected" : "offline");
      } catch (err) {
        console.error("products offline fallback:", err);
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    };

    // Cloud rows overlaid with unsynced local rows, so an offline edit or delete is not undone
    // by a snapshot that arrives before the upload, and nothing deleted elsewhere is kept.
    const publishProducts = async () => {
      const seq = ++publishSeq;
      const dirty = await offlineDirtyRecords("products").catch(() => []);
      if (cancelled || seq !== publishSeq) return;
      const merged = new Map(cloudRows);
      dirty.forEach((rec) => {
        const sameShop = rec.data?.shopId ? rec.data.shopId === shopId : cloudRows.has(rec.documentId);
        if (!sameShop) return;
        if (rec.deleted) merged.delete(rec.documentId);
        else merged.set(rec.documentId, { ...rec.data, id: rec.documentId });
      });
      setProducts([...merged.values()].filter(isActiveProduct).sort(compareProductNames));
    };
    // Bursts of snapshots (e.g. while an import uploads) are coalesced into one refresh.
    let publishTimer = null;
    const schedulePublish = () => {
      if (publishTimer) return;
      publishTimer = setTimeout(() => {
        publishTimer = null;
        publishProducts();
      }, 150);
    };

    const applyDocs = (snap) => {
      if (productBulkDeleteRef.current) return;

      if (snap.metadata?.fromCache && snap.empty) {
        loadLocalProducts();
        return;
      }

      const changes = snap.docChanges();
      const fullSnapshot = !cloudApplied
        || (changes.length === snap.docs.length && changes.every((c) => c.type === "added"));
      let changed = [];
      const removedIds = [];
      if (fullSnapshot) {
        const previousIds = cloudRows;
        cloudRows = new Map(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id }]));
        changed = [...cloudRows.values()];
        previousIds.forEach((_, id) => { if (!cloudRows.has(id)) removedIds.push(id); });
      } else {
        changes.forEach((c) => {
          if (c.type === "removed") {
            cloudRows.delete(c.doc.id);
            removedIds.push(c.doc.id);
          } else {
            const row = { ...c.doc.data(), id: c.doc.id };
            cloudRows.set(c.doc.id, row);
            changed.push(row);
          }
        });
      }
      const firstCloudSnapshot = !cloudApplied;
      cloudApplied = true;
      if (firstCloudSnapshot) publishProducts();
      else schedulePublish();

      if (changed.length) {
        offlineCacheCloudRecords("products", changed).catch((err) =>
          console.warn("[S4 Offline] product cache failed", err)
        );
      }
      if (firstCloudSnapshot) {
        offlineList("products")
          .then((local) => {
            const stale = local.records
              .filter((r) => Number(r.dirty || 0) !== 1 && r.data?.shopId === shopId && !cloudRows.has(r.document_id))
              .map((r) => r.document_id);
            if (stale.length) return offlinePurgeCleanLocal("products", stale);
          })
          .catch((err) => console.warn("[S4 Offline] stale product purge failed", err));
      } else if (removedIds.length) {
        offlinePurgeCleanLocal("products", removedIds).catch((err) =>
          console.warn("[S4 Offline] removed product purge failed", err)
        );
      }
      setSyncState("connected");
      setProductsLoading(false);
    };

    let unsub1 = () => {};
    let unsub2 = null;

    if (authSyncReady) {
      unsub1 = onSnapshot(
        query(collection(db, "products"), where("shopId", "==", shopId), orderBy("name")),
        applyDocs,
        () => {
          unsub2 = onSnapshot(
            query(collection(db, "products"), where("shopId", "==", shopId)),
            applyDocs,
            (err) => {
              console.error("products listener:", err);
              loadLocalProducts();
            }
          );
        }
      );
    }

    loadLocalProducts();

    return () => {
      cancelled = true;
      clearTimeout(publishTimer);
      unsub1();
      unsub2 && unsub2();
    };
  }, [shopId, syncRefreshKey, authSyncReady]);

  const hErr  = (e) => { console.error(e); toast(e.message||String(e),"err"); };

  // ── Generate a new single-use invite code ──
  const generateNewCode = async () => {
    try {
      if (!navigator.onLine || !db) {
        toast(lang==="bn"?"❌ Invite Code বানাতে ইন্টারনেট লাগবে":"❌ Internet is required to create an invite code","err");
        return;
      }
      const code = generateInviteCode();
      await setDoc(doc(db,"inviteCodes",code),{
        shopId, used:false, createdAt:serverTimestamp(),
      });
      addLocalInviteCode(shopId, code);
      toast(lang==="bn"?"✅ নতুন Invite Code তৈরি হয়েছে!":"✅ New invite code created!");
    } catch(e) { hErr(e); }
  };

  const deleteInviteCode = async (code) => {
    try { await deleteDoc(doc(db,"inviteCodes",code)); }
    catch(e) { hErr(e); }
  };

  // ── PRODUCT MASTER STATE ──
  const createEmptyPmForm = () => ({
    name:"", code:"",
    barcode:"", ean:"", moreBarcodes:[],
    brand:"", company:"", productGroup:"", category:"", subcategory:"",
    commodityCode:"", productType:"Goods", arabicName:"", weightBarcode:false, rateBarcode:false,
    salesVat:"0", purchaseVat:"0",
    landingCost:"", marginPerc:"", marginAmount:"",
    vatExclusive:"", vatInclusive:"", vatOnMrp:false, mrp:"", averageCost:"",
    openingStock:"", openingRate:"", openingWarehouse:"", unit:"Pcs", customUnits:[], unitDefinitions:[],
    customerTypes:[], unitPrices:[], multiCustomerRatesEnabled:true,
    defaultDiscount:"", reorderMin:"", reorderMax:"", reorderQty:"", rackLocation:"",
    specificationText:"", specShowInSales:false, photoUrl:"", description:""
  });
  const [pmSearch,setPmSearch]=useState("");
  const [pmCatFilter,setPmCatFilter]=useState("ALL");
  const [pmShowAdd,setPmShowAdd]=useState(false);
  // Product Master opened over the Sales Invoice (F9); a product saved there is handed back to the invoice.
  const [pmOverSales,setPmOverSales]=useState(false);
  const [pmPickForSales,setPmPickForSales]=useState(null);
  const [quoteToConvert,setQuoteToConvert]=useState(null);
  const [purchaseSource,setPurchaseSource]=useState(null);
  const [grnIncoming,setGrnIncoming]=useState(null);
  const [chequePrefill,setChequePrefill]=useState(null);
  const [ownerUnlocked,setOwnerUnlocked]=useState(false);
  const ownerIdleTimerRef = useRef(null);
  const OWNER_IDLE_MS = 15 * 60 * 1000;
  useEffect(() => {
    if (!isOwner || !ownerUnlocked) return undefined;
    const bump = () => {
      clearTimeout(ownerIdleTimerRef.current);
      ownerIdleTimerRef.current = setTimeout(() => setOwnerUnlocked(false), OWNER_IDLE_MS);
    };
    bump();
    const evts = ["pointerdown", "keydown", "touchstart", "scroll"];
    evts.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const onVis = () => { if (document.visibilityState === "hidden") setOwnerUnlocked(false); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(ownerIdleTimerRef.current);
      evts.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isOwner, ownerUnlocked]);
  const [pinModal,setPinModal]=useState(null);   // null | "unlock" | "reset"
  const [chequeHandoverReq,setChequeHandoverReq]=useState(null);
  useEffect(()=>{ if (!["sales","quotation","delivery","purchase"].includes(tab)) setPmOverSales(false); },[tab]);
  const [pmEditId,setPmEditId]=useState(null);
  const [pmForm,setPmForm]=useState(createEmptyPmForm);
  const [savingProduct,setSavingProduct]=useState(false);
  // Snapshot of the form as loaded, so leaving with unsaved edits can ask first.
  const pmBaselineRef = useRef(JSON.stringify(createEmptyPmForm()));
  const loadPmForm = (form) => {
    pmBaselineRef.current = JSON.stringify(form);
    setPmForm(form);
  };
  const confirmPmDiscard = () => JSON.stringify(pmForm) === pmBaselineRef.current
    || window.confirm(lang==="bn"?"সেভ না করা পরিবর্তন আছে। বাদ দিয়ে চলে যাবেন?":"You have unsaved changes. Discard them?");
  const pmReset = () => loadPmForm(createEmptyPmForm());

  // Every menu opens at its start screen; sub-pages left open are not restored.
  const lastTabRef = useRef(tab);
  useEffect(() => {
    if (lastTabRef.current === tab) return;
    lastTabRef.current = tab;
    setSettingsPage(null);
    setSelOrder(null);
    setPmShowAdd(false);
    setPmEditId(null);
    loadPmForm(createEmptyPmForm());
  }, [tab]);

  useEffect(() => {
    if (tab === "products") {
      cancelStaleClear("pm-search");
      return undefined;
    }
    scheduleStaleClear("pm-search", () => {
      setPmSearch("");
      setPmCatFilter("ALL");
    }, STALE_DRAFT_MS);
    return () => cancelStaleClear("pm-search");
  }, [tab]);

  useEffect(() => {
    if (pmShowAdd) {
      cancelStaleClear("pm-form-draft");
      return undefined;
    }
    scheduleStaleClear("pm-form-draft", () => {
      if (JSON.stringify(pmForm) === pmBaselineRef.current) return;
      setPmEditId(null);
      loadPmForm(createEmptyPmForm());
    }, STALE_DRAFT_MS);
    return () => cancelStaleClear("pm-form-draft");
  }, [pmShowAdd]);

  const pmFormFromProduct = (p) => ({
    ...createEmptyPmForm(),
    ...p,
    name:p.name||"",
    code:p.code||"",
    barcode:p.barcode||"",
    ean:p.ean||"",
    moreBarcodes:Array.isArray(p.moreBarcodes)?p.moreBarcodes:[],
    brand:p.brand||p.company||"",
    company:p.company||p.brand||"",
    productGroup:p.productGroup||"",
    category:p.category||"",
    subcategory:p.subcategory||"",
    unit:p.unit||"Pcs",
    productType:p.productType||"Goods",
    salesVat:String(p.salesVat ?? p.vatPerc ?? "0"),
    purchaseVat:String(p.purchaseVat ?? "0"),
    landingCost:String(p.landingCost||""),
    marginPerc:String(p.marginPerc||""),
    marginAmount:String(p.marginAmount||""),
    vatExclusive:String(p.vatExclusive||""),
    vatInclusive:String(p.vatInclusive||""),
    mrp:String(p.mrp||""),
    openingStock:String(p.openingStock||""),
    customUnits:Array.isArray(p.customUnits)?p.customUnits:[],
    unitDefinitions:Array.isArray(p.unitDefinitions)?p.unitDefinitions:[],
    customerTypes:Array.isArray(p.customerTypes)?p.customerTypes:[],
    unitPrices:Array.isArray(p.unitPrices)?p.unitPrices:[],
    multiCustomerRatesEnabled:productRatesEnabled(p),
  });

  const startProductEdit = (p) => {
    loadPmForm(pmFormFromProduct(p));
    setPmEditId(p.id);
    setPmShowAdd(true);
  };

  const [globalOpenSalesInvoiceId, setGlobalOpenSalesInvoiceId] = useState(null);
  const [globalOpenPurchaseInvoiceId, setGlobalOpenPurchaseInvoiceId] = useState(null);
  const [globalFocusCustomerId, setGlobalFocusCustomerId] = useState(null);
  const [globalFocusVendorId, setGlobalFocusVendorId] = useState(null);
  const [globalFocusProductId, setGlobalFocusProductId] = useState(null);

  const globalSearchCan = useMemo(() => ({
    products: isOwner || can("viewProducts") || can("manageSales") || can("managePurchase"),
    customers: isOwner,
    vendors: isOwner || can("viewVendors") || can("manageVendors") || can("managePurchase"),
    sales: isOwner || can("manageSales"),
    purchase: isOwner || can("managePurchase"),
  }), [isOwner, perms.viewProducts, perms.viewVendors, perms.manageVendors, perms.manageSales, perms.managePurchase]);
  const globalSearchCanAny = useMemo(
    () => Object.values(globalSearchCan).some(Boolean),
    [globalSearchCan],
  );

  const handleGlobalSearchNavigate = useCallback((hit) => {
    const goTab = (next) => {
      if (tabRef.current !== next && billLeaveGuard.current && !billLeaveGuard.current.leave()) return false;
      setTabState(next);
      return true;
    };
    if (hit.kind === "product") {
      const canFindProduct = isOwner || can("viewProducts") || can("manageSales") || can("managePurchase");
      if (!canFindProduct) return;
      if (!products.some((x) => x.id === hit.id)) return;
      if (isOwner || can("viewProducts")) {
        if (!goTab("products")) return;
        // Tab-change effect clears pm form; open product after switch (like customer/vendor focus).
        if (tabRef.current === "products") startProductEdit(products.find((x) => x.id === hit.id));
        else setGlobalFocusProductId(hit.id);
      } else if (can("manageSales")) {
        if (!goTab("sales")) return;
      } else if (can("managePurchase")) {
        if (!goTab("purchase")) return;
      }
      return;
    }
    if (hit.kind === "customer") {
      if (!isOwner) return;
      if (!goTab("customers")) return;
      setGlobalFocusCustomerId(hit.id);
      return;
    }
    if (hit.kind === "vendor") {
      if (!(isOwner || can("viewVendors") || can("manageVendors"))) return;
      if (!goTab("vendors")) return;
      setGlobalFocusVendorId(hit.id);
      return;
    }
    if (hit.kind === "salesInvoice") {
      if (!(isOwner || can("manageSales"))) return;
      if (!goTab("sales")) return;
      setGlobalOpenSalesInvoiceId(hit.id);
      return;
    }
    if (hit.kind === "purchaseInvoice") {
      if (!(isOwner || can("managePurchase"))) return;
      if (!goTab("purchase")) return;
      setGlobalOpenPurchaseInvoiceId(hit.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, isOwner, perms.viewProducts, perms.viewVendors, perms.manageVendors, perms.manageSales, perms.managePurchase]);

  useEffect(() => {
    if (!globalFocusProductId || tab !== "products") return;
    const p = products.find((x) => x.id === globalFocusProductId);
    setGlobalFocusProductId(null);
    if (p) startProductEdit(p);
  }, [globalFocusProductId, tab, products]);

  useEffect(() => {
    const onKey = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      if (String(event.key).toLowerCase() !== "k") return;
      if (document.querySelector("[data-si-modal-open]")) return;
      event.preventDefault();
      if (isDesktop && tabRef.current !== "dashboard") setTabState("dashboard");
      window.dispatchEvent(new CustomEvent("s4-focus-global-search"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop]);

  const collectProductBarcodes = (p) => [
    p.barcode,
    p.ean,
    ...(Array.isArray(p.moreBarcodes)?p.moreBarcodes:[]),
    ...(Array.isArray(p.unitPrices)?p.unitPrices.map(r=>r.barcode):[]),
  ].map(v=>String(v||"").trim()).filter(Boolean);

  const validateProductForm = (skipId=null) => {
    if (!pmForm.name.trim()) return t.e3;
    // Code / Model is intentionally excluded. Barcode, EAN and More Barcodes
    // share one unique namespace, both within this form and across products.
    const identityCodes = [
      pmForm.barcode,
      pmForm.ean,
      ...(Array.isArray(pmForm.moreBarcodes)?pmForm.moreBarcodes:[]),
      ...(Array.isArray(pmForm.unitPrices)?pmForm.unitPrices.map(r=>r.barcode):[]),
    ].map(v=>String(v||"").trim()).filter(Boolean);
    const normalized = identityCodes.map(v=>v.toLowerCase());
    const repeatedAt = normalized.findIndex((code,index)=>normalized.indexOf(code)!==index);
    if (repeatedAt>=0) {
      const code = identityCodes[repeatedAt];
      return lang==="bn"?`একই Barcode/EAN দুইবার দেওয়া যাবে না: ${code}`:`The same Barcode/EAN cannot be entered twice: ${code}`;
    }
    const currentCodes = new Set(normalized);
    const duplicate = products.find(p => p.id !== skipId && [
      p.barcode,
      p.ean,
      ...(Array.isArray(p.moreBarcodes)?p.moreBarcodes:[]),
      ...(Array.isArray(p.unitPrices)?p.unitPrices.map(r=>r.barcode):[]),
    ].map(v=>String(v||"").trim().toLowerCase()).filter(Boolean).some(code=>currentCodes.has(code)));
    if (duplicate) return lang==="bn"?`Barcode/EAN আগে থেকেই আছে: ${duplicate.name}`:`Barcode/EAN already exists: ${duplicate.name}`;
    return "";
  };

  const buildProductPayload = (created=false, productId=null) => {
    const now = new Date().toISOString();
    const cleanName = pmForm.name.trim();
    return {
      ...pmForm,
      shopId,
      productCatalogEpoch: productMaintenanceRef.current.catalogEpoch || 0,
      name: cleanName,
      code: String(pmForm.code || "").trim(),
      brand: pmForm.brand || pmForm.company || "",
      company: pmForm.company || pmForm.brand || "",
      averageCost: pmForm.averageCost || pmForm.landingCost || "",
      moreBarcodes: Array.isArray(pmForm.moreBarcodes) ? pmForm.moreBarcodes.filter(Boolean) : [],
      unitPrices: Array.isArray(pmForm.unitPrices) ? pmForm.unitPrices : [],
      customUnits: Array.isArray(pmForm.customUnits) ? pmForm.customUnits : [],
      unitDefinitions: Array.isArray(pmForm.unitDefinitions) ? pmForm.unitDefinitions : [],
      customerTypes: Array.isArray(pmForm.customerTypes) ? pmForm.customerTypes : [],
      updatedBy: user.uid,
      updatedAt: now,
      ...(created ? { createdBy:user.uid, createdAt:now } : {}),
    };
  };

  const csvCell = (v) => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const filteredProducts = useMemo(() => products.filter(p=>{
    const matchCat = pmCatFilter==="ALL"||!pmCatFilter||p.category===pmCatFilter;
    return matchCat && (!pmSearch || nsmatch(productSearchText(p), pmSearch));
  }), [products, pmSearch, pmCatFilter]);
  const getFilteredProducts = () => filteredProducts;

  const exportProductsCsv = async (rows=getFilteredProducts(), { silent=false } = {}) => {
    if (!canSeeProductCost) {
      toast(productEditDeniedMessage(), "err");
      return false;
    }
    const headers = ["ProductId","ProductName","CodeModel","Barcode","EAN","ProductGroup","Company","Category","SubCategory","CommodityCode","BaseUnit","ProductType","ArabicName","SalesVAT","PurchaseVAT","LandingCost","AverageCost","Margin%","MarginAmount","VATExclusive","VATInclusive","VATOnMrp","MRP","OpeningStock","OpeningRate","Warehouse","Rack","DefaultDiscount","ReorderMin","ReorderMax","ReorderQty","WeightBarcode","RateBarcode","MoreBarcodes","UnitPricesJson","CustomUnitsJson","UnitDefinitionsJson","CustomerTypesJson","MultiCustomerRatesEnabled","SpecificationText","SpecShowInSales","PhotoUrl","Description"];
    const body = rows.map(p => [p.id,p.name,p.code,p.barcode,p.ean,p.productGroup,p.company||p.brand,p.category,p.subcategory,p.commodityCode,p.unit,p.productType,p.arabicName,p.salesVat,p.purchaseVat,p.landingCost,p.averageCost,p.marginPerc,p.marginAmount,p.vatExclusive,p.vatInclusive,p.vatOnMrp,p.mrp,p.openingStock,p.openingRate,p.openingWarehouse,p.rackLocation,p.defaultDiscount,p.reorderMin,p.reorderMax,p.reorderQty,p.weightBarcode?"TRUE":"",p.rateBarcode?"TRUE":"",Array.isArray(p.moreBarcodes)?p.moreBarcodes.join(";"):"",Array.isArray(p.unitPrices)?JSON.stringify(p.unitPrices):"",Array.isArray(p.customUnits)?JSON.stringify(p.customUnits):"",Array.isArray(p.unitDefinitions)?JSON.stringify(p.unitDefinitions):"",Array.isArray(p.customerTypes)?JSON.stringify(p.customerTypes):"",p.multiCustomerRatesEnabled?"TRUE":"",p.specificationText,p.specShowInSales?"TRUE":"",p.photoUrl,p.description].map(csvCell).join(","));
    const saved = await saveTextFile(`product-master-${new Date().toISOString().slice(0,10)}.csv`, [headers.map(csvCell).join(","), ...body].join("\n"));
    if (saved && !silent) toast(lang==="bn"?"✅ Product export হয়েছে":"✅ Products exported");
    return saved;
  };

  // Receives rows already mapped to Product Master fields by the Import window
  // (src/product-master/modals/ImportModal.jsx). Rows are created one by one so a
  // single bad row is reported instead of aborting the whole file.
  const productEditDeniedMessage = () => lang==="bn"
    ? "পণ্য যোগ / এডিট / Import করার অনুমতি নেই। Owner-এর কাছে 'পণ্য যোগ / এডিট / Import' permission চান।"
    : "You don't have permission to add, edit or import products. Ask the Owner for 'Add / Edit / Import Products'.";

  const importProductRecords = async (records) => {
    if (!canManageProducts) {
      const message = productEditDeniedMessage();
      toast(message, "err");
      return { created:0, skipped:records.length, errors:[{ row:"-", reason:message }] };
    }
    if (clearingProducts || productBulkDeleteRef.current) {
      const message = lang==="bn"
        ? "Product clear শেষ হওয়ার আগে import করা যাবে না। একটু অপেক্ষা করুন।"
        : "Wait for product clear to finish before importing.";
      toast(message, "err");
      return { created:0, skipped:records.length, errors:[{ row:"-", reason:message }] };
    }
    const maintenance = productMaintenanceRef.current || {};
    const locker = String(maintenance.startedBy || "");
    const thisDeviceReplacement = productReplacementActive
      || !locker
      || locker === user.uid;
    if (maintenance.active && !thisDeviceReplacement) {
      const message = "Product Master is being replaced on another device. Import is temporarily locked.";
      toast(message, "err");
      return { created:0, skipped:records.length, errors:[{ row:"-", reason:message }] };
    }
    if (maintenance.active && thisDeviceReplacement && !productReplacementActive) {
      setProductReplacementActive(true);
    }
    const summary = { created:0, skipped:0, errors:[] };
    const pending = [];
    const existingIds = new Set(products.map((product) => String(product.id || "").trim()).filter(Boolean));
    const existingCodes = new Set(products.flatMap(product => [
      product.barcode,
      product.ean,
      ...(Array.isArray(product.moreBarcodes)?product.moreBarcodes:[]),
      ...(Array.isArray(product.unitPrices)?product.unitPrices.map(row=>row.barcode):[]),
    ]).map(v=>String(v||"").trim().toLowerCase()).filter(Boolean));

    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      const rowNo = i + 2; // header occupies row 1
      const name = String(record.name||"").trim();
      if (!name) { summary.skipped += 1; summary.errors.push({ row:rowNo, reason:"Product Name is empty" }); continue; }
      const requestedId = String(record.id || "").trim();
      if (requestedId && existingIds.has(requestedId)) {
        summary.skipped += 1;
        summary.errors.push({ row:rowNo, reason:`Product ID is duplicated: ${requestedId}` });
        continue;
      }

      const droppedCodes = [];
      const keepCode = (code) => {
        if (!existingCodes.has(code.toLowerCase())) return true;
        droppedCodes.push(code);
        return false;
      };
      const moreBarcodes = String(record.moreBarcodes || "")
        .split(/[;,|]/)
        .map(v=>v.trim())
        .filter(Boolean)
        .filter((code, index, list) => list.findIndex((other) => other.toLowerCase() === code.toLowerCase()) === index)
        .filter(keepCode);
      const arrayFields = ["unitPrices", "customUnits", "unitDefinitions", "customerTypes"];
      const parsedArrays = {};
      let arrayError = "";
      for (const field of arrayFields) {
        if (!record[field]) {
          parsedArrays[field] = [];
          continue;
        }
        try {
          const parsed = JSON.parse(record[field]);
          if (!Array.isArray(parsed)) throw new Error("must be an array");
          parsedArrays[field] = parsed;
        } catch {
          arrayError = `${field} JSON is invalid`;
          break;
        }
      }
      if (arrayError) {
        summary.skipped += 1;
        summary.errors.push({ row:rowNo, reason:arrayError });
        continue;
      }
      const unitPrices = parsedArrays.unitPrices.map((row) => {
        const barcode = String(row?.barcode || "").trim();
        if (barcode && !keepCode(barcode)) return { ...row, barcode:"" };
        return row;
      });
      let barcode = String(record.barcode || "").trim();
      let ean = String(record.ean || "").trim();
      if (barcode && !keepCode(barcode)) barcode = "";
      if (ean && !keepCode(ean)) ean = "";
      if (ean && barcode && ean.toLowerCase() === barcode.toLowerCase()) ean = "";
      const rowCodes = [barcode, ean, ...moreBarcodes, ...unitPrices.map(row=>row?.barcode)]
        .map(v=>String(v||"").trim()).filter(Boolean);
      if (droppedCodes.length) {
        summary.errors.push({ row:rowNo, reason:`Imported without barcode(s) already used by another product: ${droppedCodes.join(", ")}` });
      }
      const rawOpening = String(record.openingStock ?? "").trim();
      const openingNum = rawOpening === "" ? 0 : Number(rawOpening.replace(/,/g, ""));
      const openingValid = Number.isFinite(openingNum) && openingNum >= 0;
      if (!openingValid) {
        summary.errors.push({ row:rowNo, reason:`Opening stock "${rawOpening}" is not valid — imported with 0` });
      }

      const now = new Date().toISOString();
      try {
        const draftId = requestedId || globalThis.crypto?.randomUUID?.() || `import-${Date.now()}-${i}`;
        const payload = {
          ...createEmptyPmForm(), ...record, shopId, name,
          id: draftId,
          barcode,
          ean,
          productCatalogEpoch: productMaintenanceRef.current.catalogEpoch || 0,
          code: String(record.code || "").trim(),
          brand: record.company || "",
          unit: record.unit || "Pcs",
          productType: record.productType || "Goods",
          salesVat: record.salesVat || "0",
          purchaseVat: record.purchaseVat || "0",
          moreBarcodes,
          unitPrices,
          customUnits:parsedArrays.customUnits,
          unitDefinitions:parsedArrays.unitDefinitions,
          customerTypes:parsedArrays.customerTypes,
          multiCustomerRatesEnabled: ["true","1","yes","y"].includes(String(record.multiCustomerRatesEnabled || "").trim().toLowerCase()) || unitPrices.length > 0,
          weightBarcode: ["true","1","yes","y"].includes(String(record.weightBarcode || "").trim().toLowerCase()),
          rateBarcode: ["true","1","yes","y"].includes(String(record.rateBarcode || "").trim().toLowerCase()),
          specShowInSales: ["true","1","yes","y"].includes(String(record.specShowInSales || "").trim().toLowerCase()),
          createdBy:user.uid, createdAt:now, updatedAt:now,
        };
        const openingQty = openingValid ? openingNum : 0;
        payload.openingStock = openingQty ? String(openingQty) : "";
        payload.openingStockPosted = openingQty;
        let ledgerEntry = null;
        if (openingQty > 0) {
          ledgerEntry = buildStockLedgerEntry({
            productId: draftId,
            shopId,
            quantity: openingQty,
            movementType: "opening",
            referenceType: "opening_stock",
            referenceId: draftId,
            unitCost: parseFloat(payload.openingRate || payload.landingCost) || 0,
            actor: { uid:user.uid, personName:profile.personName },
          });
        }
        pending.push({ rowNo, payload, ledgerEntry });
        rowCodes.forEach(code=>existingCodes.add(code.toLowerCase()));
        existingIds.add(draftId);
      } catch (err) {
        summary.skipped += 1;
        summary.errors.push({ row:rowNo, reason:String(err?.message||err) });
      }
    }

    // Saved in chunks: one local transaction and one database write per chunk instead of per row.
    const IMPORT_CHUNK = 500;
    const createdRows = [];
    for (let i = 0; i < pending.length; i += IMPORT_CHUNK) {
      const chunk = pending.slice(i, i + IMPORT_CHUNK);
      try {
        await offlineBulkUpsert("products", chunk.map((row) => row.payload));
      } catch (err) {
        chunk.forEach((row) => {
          summary.skipped += 1;
          summary.errors.push({ row:row.rowNo, reason:String(err?.message||err) });
        });
        continue;
      }
      createdRows.push(...chunk);
      const ledgerRows = chunk.filter((row) => row.ledgerEntry);
      if (!ledgerRows.length) continue;
      try {
        await offlineBulkUpsert(STOCK_COLLECTIONS.STOCK_LEDGER, ledgerRows.map((row) => row.ledgerEntry));
      } catch (ledgerErr) {
        console.warn("[S4 Stock] import opening stock ledger entries failed", ledgerErr);
        await offlineBulkUpsert("products", ledgerRows.map((row) => ({ ...row.payload, openingStockPosted:0 }))).catch(() => null);
        ledgerRows.forEach((row) => {
          row.payload.openingStockPosted = 0;
          summary.errors.push({ row:row.rowNo, reason:"Imported, but opening stock was not posted to the ledger — open and Save this product once" });
        });
      }
    }
    summary.created = createdRows.length;
    if (createdRows.length) {
      const createdById = new Map(createdRows.map((row) => [row.payload.id, row.payload]));
      setProducts(prev => [...createdById.values(), ...prev.filter(p=>!createdById.has(p.id))].sort(compareProductNames));
    }

    toast(lang==="bn"?`✅ ${summary.created} import, ${summary.skipped} skip`:`✅ ${summary.created} imported, ${summary.skipped} skipped`);
    if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] product import sync failed", err));
    return summary;
  };

  const exportWeighingBarcodeCsv = async (rows=getFilteredProducts()) => {
    try {
      const body = rows.filter(p=>p.weightBarcode||p.rateBarcode).map(p => [p.barcode||p.ean||p.code, p.name, p.vatInclusive||p.mrp||p.vatExclusive||0, p.unit||"Pcs", p.weightBarcode?"WEIGHT":"RATE"].map(csvCell).join(","));
      const saved = await saveTextFile(`weighing-barcode-${new Date().toISOString().slice(0,10)}.csv`, [["Barcode","ProductName","Rate","Unit","Type"].map(csvCell).join(","), ...body].join("\n"));
      if (saved) toast(lang==="bn"?"✅ Weighing barcode file তৈরি হয়েছে":"✅ Weighing barcode file generated");
    } catch (e) { hErr(e); }
  };

  const printProductBarcodes = (rows) => {
    const list = (Array.isArray(rows)?rows:[rows]).filter(Boolean);
    if (!list.length) return toast(lang==="bn"?"Print করার product নেই":"No product to print", "err");
    const skipped = [];
    const labels = list.map(p => {
      const code = p.barcode||p.ean||p.code||p.name;
      const barcodeSvg = code128SvgMarkup(code, { moduleWidth: 2, height: 48, fontSize: 11 });
      if (!barcodeSvg) {
        skipped.push(p.name || code || "Unnamed product");
        return "";
      }
      return `<div class="label"><div class="name">${String(p.name||"").replace(/[<>&]/g,"")}</div>${barcodeSvg}<div class="price">MRP ${String(p.mrp||p.vatInclusive||"").replace(/[<>&]/g,"")}</div></div>`;
    }).filter(Boolean).join("");
    if (!labels) return toast(lang==="bn"?"CODE128 print করার মতো barcode নেই":"No CODE128-compatible barcode to print", "err");
    if (skipped.length) toast(`Skipped ${skipped.length} unsupported barcode(s): ${skipped.slice(0,5).join(", ")}${skipped.length>5?"...":""}`, "err");
    printWithSettings(`<html><head><meta charset="UTF-8"><title>Product Barcodes</title><style>body{font-family:Arial,sans-serif;margin:16px}.sheet{display:flex;flex-wrap:wrap;gap:10px}.label{width:190px;border:1px solid #111;padding:8px;text-align:center;page-break-inside:avoid}.name{font-size:12px;font-weight:700;height:30px;overflow:hidden}.label svg{max-width:100%;height:auto;margin:4px 0}.price{font-size:11px;margin-top:3px}@media print{.label{break-inside:avoid}}</style></head><body><div class="sheet">${labels}</div></body></html>`, { lang, kind:"barcode" });
  };

  // Smart pmUpd — triggers auto-calculations
  const pmUpd = (field, val) => {
    setPmForm(prev => {
      const next = { ...prev, [field]: val };
      const n = (v) => parseFloat(v)||0;

      if (field==="landingCost"||field==="marginPerc"||field==="marginAmount"||field==="vatExclusive"||field==="salesVat"||field==="vatOnMrp") {
        const lc = n(field==="landingCost"?val:next.landingCost);
        let mp = n(field==="marginPerc"?val:next.marginPerc);
        let ma = n(field==="marginAmount"?val:next.marginAmount);
        let ve = n(field==="vatExclusive"?val:next.vatExclusive);
        const sv = n(field==="salesVat"?val:next.salesVat);

        if (field==="landingCost"||field==="marginPerc") {
          // LC or MP changed → recalc MA and VE
          if (field==="marginPerc" && lc>0) ma = parseFloat((lc*mp/100).toFixed(4));
          else ma = lc>0 && mp>0 ? parseFloat((lc*mp/100).toFixed(4)) : ma;
          ve = lc>0 ? parseFloat((lc+ma).toFixed(4)) : ve;
          next.marginAmount = ma||ma===0 ? String(ma) : "";
          next.vatExclusive = ve ? String(ve) : "";
        } else if (field==="marginAmount") {
          // MA changed → recalc MP and VE
          mp = lc>0 ? parseFloat((ma/lc*100).toFixed(4)) : 0;
          ve = parseFloat((lc+ma).toFixed(4));
          next.marginPerc = mp ? String(mp) : "";
          next.vatExclusive = ve ? String(ve) : "";
        } else if (field==="vatExclusive") {
          // VE changed manually → recalc MA and MP (no landing cost means margin is unknown)
          if (lc>0) {
            ma = parseFloat((ve-lc).toFixed(4));
            mp = parseFloat((ma/lc*100).toFixed(4));
            next.marginAmount = ma ? String(ma) : "";
            next.marginPerc = mp ? String(mp) : "";
          }
        }

        // Always recalc VAT Inclusive from current VE
        const currentVe = n(next.vatExclusive);
        if (currentVe>0) {
          const vi = parseFloat((currentVe + currentVe*sv/100).toFixed(4));
          next.vatInclusive = String(vi);
          // MRP auto-fill based on vatOnMrp
          const vatOn = field==="vatOnMrp"?val:next.vatOnMrp;
          next.mrp = vatOn ? String(vi) : String(currentVe);
        }
      }

      // vatInclusive typed → back-calculate VE, margin and MRP; VI itself stays as typed
      if (field==="vatInclusive") {
        const vi = n(val);
        const sv = n(next.salesVat);
        const lc = n(next.landingCost);
        if (vi>0) {
          const ve = parseFloat((vi/(1+sv/100)).toFixed(4));
          next.vatExclusive = String(ve);
          if (lc>0) {
            const ma = parseFloat((ve-lc).toFixed(4));
            next.marginAmount = ma ? String(ma) : "";
            next.marginPerc = ma ? String(parseFloat((ma/lc*100).toFixed(4))) : "";
          }
          next.mrp = next.vatOnMrp ? String(vi) : String(ve);
        }
      }

      // vatOnMrp toggled → update MRP
      if (field==="vatOnMrp") {
        const vi = n(next.vatInclusive);
        const ve = n(next.vatExclusive);
        next.mrp = val ? (vi?String(vi):"") : (ve?String(ve):"");
      }

      return next;
    });
  };

  // Posts only the change since the last posting, so re-saving a product never double-counts opening stock.
  const postOpeningStockDelta = async (product) => {
    const wanted = parseFloat(product?.openingStock) || 0;
    const posted = parseFloat(product?.openingStockPosted) || 0;
    const delta = parseFloat((wanted - posted).toFixed(4));
    if (!product?.id || !delta) return;
    // Marked as posted before the ledger write: if the ledger write fails the mark is reverted,
    // so a failure can under-post (fixed by saving again) but never double-post.
    const savePosted = async (value) => {
      const result = await offlineUpdate("products", product.id, {
        ...product,
        openingStockPosted: value,
        productCatalogEpoch: productMaintenanceRef.current.catalogEpoch || 0,
        updatedAt: new Date().toISOString(),
      });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, ...result.data, id: product.id } : p));
    };
    try {
      await savePosted(wanted);
    } catch (err) {
      console.warn("[S4 Stock] opening stock mark failed", product.id, err);
      toast(lang==="bn"?"⚠️ Opening stock ledger-এ যোগ হয়নি, আবার Save করুন":"⚠️ Opening stock was not posted to the ledger. Save again.", "err");
      return;
    }
    try {
      await createStockLedgerEntry({
        productId: product.id,
        shopId,
        quantity: Math.abs(delta),
        movementType: delta > 0 ? "opening" : "adjustment",
        referenceType: "opening_stock",
        referenceId: product.id,
        unitCost: parseFloat(product.openingRate || product.landingCost) || 0,
        actor: { uid:user.uid, personName:profile.personName },
      });
    } catch (err) {
      console.warn("[S4 Stock] opening stock ledger entry failed", product.id, err);
      await savePosted(posted).catch((revertErr) => console.warn("[S4 Stock] opening stock mark revert failed", product.id, revertErr));
      toast(lang==="bn"?"⚠️ Opening stock ledger-এ যোগ হয়নি, আবার Save করুন":"⚠️ Opening stock was not posted to the ledger. Save again.", "err");
    }
  };

  const addProduct = async () => {
    if (!canManageProducts) return toast(productEditDeniedMessage(), "err");
    if (productMaintenanceRef.current.active) {
      return toast("Product Master replacement is in progress. Saving is temporarily locked.", "err");
    }
    const validationError = validateProductForm();
    if (validationError) return toast(validationError,"err");

    const draftId = globalThis.crypto?.randomUUID?.() || `product-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const payload = { ...buildProductPayload(true, draftId), id: draftId, openingStockPosted: 0 };

    setSavingProduct(true);
    try {
      const result = await offlineCreate("products", payload);
      const created = { ...result.data, id: result.documentId };

      setProducts(prev =>
        [created, ...prev.filter(p => p.id !== created.id)]
          .sort(compareProductNames)
      );

      pmReset();
      setPmShowAdd(false);
      toast(t.pmAdded);
      if (pmOverSales) {
        setPmPickForSales({ product: created, at: Date.now() });
        setPmEditId(null);
        setPmOverSales(false);
      }
      await postOpeningStockDelta(created);

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] product sync failed", err));
      }
    } catch(e) {
      hErr(e);
    } finally {
      setSavingProduct(false);
    }
  };

  const editProduct = async (id) => {
    if (!canManageProducts) return toast(productEditDeniedMessage(), "err");
    if (productMaintenanceRef.current.active) {
      return toast("Product Master replacement is in progress. Saving is temporarily locked.", "err");
    }
    const validationError = validateProductForm(id);
    if (validationError) return toast(validationError,"err");

    const payload = buildProductPayload(false, id);

    setSavingProduct(true);
    try {
      const stored = (await offlineGetById("products", id).catch(() => null))?.data
        || products.find(p => p.id === id);
      payload.openingStockPosted = parseFloat(stored?.openingStockPosted) || 0;
      const result = await offlineUpdate("products", id, payload);
      const updated = { ...result.data, id };

      setProducts(prev =>
        prev
          .map(p => p.id === id ? updated : p)
          .sort(compareProductNames)
      );

      pmReset();
      setPmEditId(null);
      setPmShowAdd(false);
      toast(t.pmUpdated);
      if (pmOverSales) {
        setPmPickForSales({ product: updated, at: Date.now() });
        setPmOverSales(false);
      }
      await postOpeningStockDelta(updated);

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] product update sync failed", err));
      }
    } catch(e) {
      hErr(e);
    } finally {
      setSavingProduct(false);
    }
  };

  const deleteProduct = async (id) => {
    if (!isOwner) {
      toast(lang==="bn"?"শুধু মালিক পণ্য মুছতে পারেন।":"Only the owner can delete products.","err");
      return;
    }
    if (productMaintenanceRef.current.active) {
      toast(lang==="bn"?"Product replacement চলছে, এখন মোছা যাবে না।":"Product replacement is running; deleting is locked.","err");
      return;
    }
    if (!window.confirm(lang==="bn"?"এই পণ্যটি মুছে ফেলবেন?":"Delete this product?")) return;
    const delProd = products.find(p => p.id === id);
    logAudit({ shopId, user, profile, action:"delete", collection:"products", docId:id, docNo:delProd?.code || "", note:delProd?.name || "" });

    const now = new Date().toISOString();
    const tombstone = {
      shopId,
      isDeleted:true,
      deletedAt:now,
      updatedAt:now,
      updatedBy:user.uid,
      productCatalogEpoch:productMaintenanceRef.current.catalogEpoch || 0,
    };

    try {
      if (navigator.onLine && db) {
        try {
          await deleteDoc(doc(db, "products", id));
          await offlinePurgeLocal("products", id);
        } catch (cloudErr) {
          const denied = String(cloudErr?.code || cloudErr?.message || "").includes("permission");
          if (!denied) throw cloudErr;
          await setDoc(doc(db, "products", id), tombstone, { merge: true });
          await offlineUpdate("products", id, tombstone);
        }
      } else {
        // A hard delete queued offline is refused once a catalog epoch exists; a tombstone always syncs.
        await offlineUpdate("products", id, tombstone);
      }

      setProducts(p=>p.filter(x=>x.id!==id));
      if (pmEditId === id) { setPmEditId(null); pmReset(); }
      toast(t.pmDeleted,"err");

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] product delete sync failed", err));
      }
    } catch(e) {
      hErr(e);
    }
  };

  const removeBlankProducts = async () => {
    if (!isOwner) return toast(lang==="bn"?"শুধু Owner এটা করতে পারবে":"Only the Shop Owner can do this","err");
    if (!navigator.onLine || !db || !shopId) return toast(t.syncNeedInternet,"err");
    try {
      const snap = await getDocs(query(collection(db, "products"), where("shopId", "==", shopId)));
      const cloudBlank = snap.docs.filter((d) => isBlankProduct(d.data()) && d.data().isDeleted !== true);
      const local = await offlineList("products");
      const localBlank = local.records.filter((r) => {
        const data = r.data || {};
        return (!data.shopId || data.shopId === shopId) && isBlankProduct(data) && data.isDeleted !== true;
      });
      const ids = new Set([...cloudBlank.map((d) => d.id), ...localBlank.map((r) => r.document_id)]);
      if (!ids.size) {
        toast(lang==="bn"?"✅ কোনো খালি প্রোডাক্ট নেই":"✅ No blank products found");
        return;
      }
      const msg = lang==="bn"
        ? `নাম, কোড আর বারকোড ছাড়া ${ids.size}টা খালি প্রোডাক্ট পাওয়া গেছে (cloud: ${cloudBlank.length}, এই ডিভাইস: ${localBlank.length})। এগুলো মুছে ফেলবেন? আসল প্রোডাক্টে হাত দেওয়া হবে না।`
        : `Found ${ids.size} blank products with no name, code or barcode (cloud: ${cloudBlank.length}, this device: ${localBlank.length}). Delete them? Real products are not touched.`;
      if (!window.confirm(msg)) return;
      const cloudIds = cloudBlank.map((d) => d.id);
      const now = new Date().toISOString();
      const tombstone = {
        isDeleted:true, deletedAt:now, updatedAt:now, updatedBy:user.uid,
        productCatalogEpoch:productMaintenanceRef.current.catalogEpoch || 0,
      };
      for (let i = 0; i < cloudIds.length; i += 400) {
        const chunk = cloudIds.slice(i, i + 400);
        try {
          const batch = writeBatch(db);
          chunk.forEach((id) => batch.delete(doc(db, "products", id)));
          await batch.commit();
        } catch (err) {
          if (!String(err?.code || err?.message || "").includes("permission")) throw err;
          const batch = writeBatch(db);
          chunk.forEach((id) => batch.set(doc(db, "products", id), tombstone, { merge:true }));
          await batch.commit();
        }
      }
      for (const id of ids) await offlinePurgeLocal("products", id);
      setProducts((prev) => prev.filter((p) => !ids.has(p.id)));
      toast(lang==="bn"?`🗑️ ${ids.size}টা খালি প্রোডাক্ট মুছে ফেলা হয়েছে`:`🗑️ Removed ${ids.size} blank products`);
    } catch (e) {
      hErr(e);
    }
  };

  const clearAllShopProducts = async () => {
    if (clearingProducts) return;
    if (!isOwner) {
      toast("Only the Shop Owner can clear Product Master data.", "err");
      return { ok:false, reason:"OWNER_REQUIRED" };
    }
    if (!navigator.onLine || !db || !shopId) {
      toast("Internet connection is required for a safe Clear & Import.", "err");
      return { ok:false, reason:"ONLINE_REQUIRED" };
    }

    setClearingProducts(true);
    productBulkDeleteRef.current = true;
    window.S4Offline?.pauseCollectionSync?.("products");
    let done = 0;
    let lockAcquired = false;
    const chunkSize = 200;
    const operationId = globalThis.crypto?.randomUUID?.() || `replace-${Date.now()}`;
    const nextEpoch = (Number(productMaintenanceRef.current.catalogEpoch) || 0) + 1;

    const reportProgress = (total) => {
      toast(lang==="bn"?`🗑️ ${done}/${total}...`:`🗑️ ${done}/${total}...`);
    };

    const commitBatchWithRetry = async (buildBatch, retries = 4) => {
      let lastErr;
      for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
          const batch = writeBatch(db);
          buildBatch(batch);
          await batch.commit();
          return;
        } catch (err) {
          lastErr = err;
          const message = String(err?.message || err?.code || "").toLowerCase();
          const retryable = message.includes("fetch")
            || message.includes("network")
            || message.includes("unavailable")
            || message.includes("deadline");
          if (!retryable || attempt === retries) throw err;
          await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
        }
      }
      throw lastErr;
    };

    try {
      if (!(await exportProductsCsv(products, { silent:true }))) {
        toast(lang==="bn"?"Backup ফাইল সেভ হয়নি, তাই কিছু মোছা হয়নি।":"Backup file was not saved, so nothing was deleted.", "err");
        return { ok:false, reason:"BACKUP_NOT_SAVED" };
      }
      await setDoc(doc(db, "productMaintenance", productMaintenanceId), {
        shopId,
        type:"productMaintenance",
        active:true,
        catalogEpoch:nextEpoch,
        operationId,
        startedBy:user.uid,
        startedAt:serverTimestamp(),
        updatedAt:serverTimestamp(),
      }, { merge:true });
      lockAcquired = true;
      const activeMaintenance = {
        active:true,
        catalogEpoch:nextEpoch,
        operationId,
        startedBy:user.uid,
      };
      productMaintenanceRef.current = activeMaintenance;
      setProductMaintenance(activeMaintenance);
      setProductReplacementActive(true);

      const snap = await getDocs(query(collection(db, "products"), where("shopId", "==", shopId)));
      const rows = snap.docs.map((d) => ({ id:d.id, ...d.data() }));
      setProducts([]);
      setPmEditId(null);

      toast(lang==="bn"?"🗑️ মুছা হচ্ছে...":"🗑️ Deleting...");
      reportProgress(rows.length);

      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await commitBatchWithRetry((batch) => {
          chunk.forEach((p) => batch.delete(doc(db, "products", p.id)));
        });
        done += chunk.length;
        reportProgress(rows.length);
      }

      await offlineClearShopCollection("products", shopId);
      const verifyCloud = await getDocs(query(collection(db, "products"), where("shopId", "==", shopId)));
      const verifyLocal = await offlineList("products");
      const localRemaining = verifyLocal.records.filter((row) => row.data?.shopId === shopId);
      if (!verifyCloud.empty || localRemaining.length) {
        throw new Error(`Clear verification failed (cloud ${verifyCloud.size}, local ${localRemaining.length}).`);
      }
      toast("✅ Backup downloaded and Product Master cleared. Select the new import file.");
      return { ok:true, deleted:rows.length, catalogEpoch:nextEpoch };
    } catch (e) {
      hErr(e);
      if (lockAcquired && db && shopId && isOwner) {
        try {
          await setDoc(doc(db, "productMaintenance", productMaintenanceId), {
            shopId,
            type: "productMaintenance",
            active: false,
            catalogEpoch: nextEpoch,
            failedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
          const released = { active: false, catalogEpoch: nextEpoch };
          productMaintenanceRef.current = released;
          setProductMaintenance(released);
          setProductReplacementActive(false);
          window.S4Offline?.resumeCollectionSync?.("products");
        } catch (releaseErr) {
          console.warn("[Product Master] maintenance lock release failed", releaseErr);
        }
      }
      toast(lang === "bn" ? "মুছতে সমস্যা — লক খুলে দেওয়া হয়েছে, আবার চেষ্টা করুন" : "Clear failed — lock released; please retry.", "err");
      return { ok:false, reason:String(e?.message||e) };
    } finally {
      productBulkDeleteRef.current = false;
      setClearingProducts(false);
      if (!lockAcquired) window.S4Offline?.resumeCollectionSync?.("products");
      setSyncRefreshKey((value) => value + 1);
    }
  };

  const finishProductReplacement = async () => {
    if (!productReplacementActive || !isOwner || !db || !shopId) return;
    const catalogEpoch = Number(productMaintenanceRef.current.catalogEpoch) || 0;
    try {
      await setDoc(doc(db, "productMaintenance", productMaintenanceId), {
        shopId,
        type:"productMaintenance",
        active:false,
        catalogEpoch,
        completedBy:user.uid,
        completedAt:serverTimestamp(),
        updatedAt:serverTimestamp(),
      }, { merge:true });
      const completed = { ...productMaintenanceRef.current, active:false, catalogEpoch };
      productMaintenanceRef.current = completed;
      setProductMaintenance(completed);
      setProductReplacementActive(false);
      window.S4Offline?.resumeCollectionSync?.("products");

      let syncResult = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        syncResult = await window.S4Offline?.syncNow?.();
        if (!syncResult?.skipped) break;
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
      setSyncRefreshKey((value) => value + 1);
      if (syncResult?.failed) {
        toast(`Import saved locally, but ${syncResult.failed} product sync item(s) need retry.`, "err");
      } else {
        const [cloudSnap, localResult] = await Promise.all([
          getDocs(query(collection(db, "products"), where("shopId", "==", shopId))),
          offlineList("products"),
        ]);
        const cloudCount = cloudSnap.docs.filter((item) => isActiveProduct(item.data())).length;
        const localCount = localResult.records.filter(
          (row) => row.data?.shopId === shopId && isActiveProduct(row.data)
        ).length;
        if (cloudCount !== localCount) {
          toast(`Replacement saved, but verification differs (local ${localCount}, cloud ${cloudCount}). Sync will retry.`, "err");
        } else {
          toast(`✅ Product replacement completed. Verified ${localCount} products locally and in Firebase.`);
        }
      }
    } catch (error) {
      hErr(error);
      toast("Could not finish replacement. Product sync remains locked for safety.", "err");
    }
  };

  const selectProductToOrder = (prod) => {
    setCurrentItem(p=>({...p, name:prod.name, code:prod.code||prod.barcode||"", brand:prod.brand||"", unit:prod.unit||"Pcs"}));
  };

  // ── INVOICE ITEM FUNCTIONS ──
  const updCurrentItem = (field, val) => {
    const value = (field==="name" && typeof val==="string" && val.length>0)
      ? (val.charAt(0).toUpperCase()+val.slice(1))
      : val;
    setCurrentItem(p=>({...p,[field]:value}));
  };

  const addItToInvoice = () => {
    if (!currentItem.name.trim()) return toast(t.noItemName,"err");
    if (!currentItem.qty.toString().trim()) return toast(t.noQty,"err");
    setItems(p=>[...p, { ...currentItem, id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}` }]);
    setCurrentItem(newItem());
    // Auto-focus the name field for fast entry
    setTimeout(()=>{ nameRef.current?.focus(); },50);
  };

  const delIt = (id) => setItems(p=>p.filter(it=>it.id!==id));

  const handleEnterAdd = (e) => {
    if (e.key === "Enter") { e.preventDefault(); addItToInvoice(); }
  };

  // ✅ নতুন কোড
const startEditOrder = (order) => {
  setItems(order.items.map(it=>({
    id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, // ← এটা যোগ করুন
    name:it.name, code:it.code||"", brand:it.brand||"",
    qty:it.qty||"", unit:it.unit||"Pcs"
  })));
  setNote(order.note||"");
  orderEditBaselineRef.current = JSON.stringify({
    items: (order.items || []).map((it) => ({ name: it.name, code: it.code || "", brand: it.brand || "", qty: it.qty || "", unit: it.unit || "Pcs" })),
    note: order.note || "",
  });
  setEditingOrderId(order.id);
  setSelOrder(null);
  window.scrollTo({top:0,behavior:"smooth"});
};

  const cancelEditOrder = () => {
    setEditingOrderId(null);
    orderEditBaselineRef.current = "";
    setItems([]);
    setCurrentItem(newItem());
    setNote("");
  };

  useEffect(() => {
    if (!editingOrderId) return undefined;
    const snapshot = () => JSON.stringify({
      items: items.map((it) => ({ name: it.name, code: it.code || "", brand: it.brand || "", qty: it.qty || "", unit: it.unit || "Pcs" })),
      note: note || "",
    });
    const guard = {
      leave: () => snapshot() === orderEditBaselineRef.current || window.confirm(lang === "bn" ? "সেভ না করা অর্ডার পরিবর্তন আছে। চলে যাবেন?" : "You have unsaved order changes. Leave anyway?"),
      back: () => { cancelEditOrder(); return true; },
    };
    billLeaveGuard.current = guard;
    return () => { if (billLeaveGuard.current === guard) billLeaveGuard.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOrderId, items, note, lang]);

  const sendOrder = async () => {
    const valid = items.filter(it=>it.name.trim());
    if (!valid.length) return toast(t.e1,"err");
    if (!isOwner && !can("sendOrder")) {
      toast(lang==="bn" ? "অর্ডার পাঠানোর অনুমতি নেই" : "You are not allowed to send orders", "err");
      return;
    }
    // ── EDIT MODE: update existing order ──
    if (editingOrderId) {
      try {
        const existing = orders.find(o => o.id === editingOrderId) || {};
        if (!isOwner && existing.createdBy && existing.createdBy !== user?.uid) {
          toast(lang==="bn" ? "শুধু অর্ডারকারী বা মালিক এডিট করতে পারেন" : "Only the order creator or owner can edit", "err");
          return;
        }
        const nowIso = new Date().toISOString();

        const patch = {
          items: valid.map((it, idx) => {
            const prev = (existing.items || [])[idx] || {};
            return {
              name: it.name,
              code: it.code || "",
              brand: it.brand || "",
              qty: it.qty || "",
              unit: it.unit || "Pcs",
              price: prev.price ?? it.price ?? "",
              status: prev.status ?? it.status ?? "pending",
              co: prev.co ?? it.co ?? null,
            };
          }),
          note: note || "",
          updatedAt: nowIso,
          updatedBy: user?.uid || "",
        };

        const result = await offlinePatch("orders", editingOrderId, patch, existing);
        const updated = { ...result.data, id: editingOrderId };

        setOrders(prev => prev.map(o => o.id === editingOrderId ? updated : o));

        setEditingOrderId(null);
        orderEditBaselineRef.current = "";
        setItems([]);
        setCurrentItem(newItem());
        setNote("");
        toast(lang==="bn"?"✅ অর্ডার আপডেট হয়েছে!":"✅ Order updated!");

        if (navigator.onLine) {
          pushOrdersNow();
        }
      } catch(e){ hErr(e); }
      return;
    }
    try {
      const now = new Date();
      const nowIso = now.toISOString();

      const localSerial = Date.now();
      const orderNo = `${ORDER_PREFIX}${String(localSerial).slice(-6)}`;

      const payload = {
        shopId,
        createdBy: user.uid,
        createdByName: profile.personName,
        serialNo: localSerial,
        orderNo,
        items: valid.map(it=>({name:it.name,code:it.code||"",brand:it.brand||"",qty:it.qty||"",unit:it.unit||"Pcs",price:"",status:"pending",co:null})),
        note: note || "",
        createdAt: now,
        createdAtIso: nowIso,
        overall: "pending",
        read: false,
      };

      const result = await offlineCreate("orders", payload);
      const created = { ...result.data, id: result.documentId };

      setOrders(prev => [created, ...prev.filter(o => o.id !== created.id)]);
      setItems([]);
      setCurrentItem(newItem());
      setNote("");
      toast(t.n1);

      if (navigator.onLine) {
        pushOrdersNow();
      }
    } catch(e) { hErr(e); }
  };

  const patchOrderOffline = async (oId, patch, successMessage = null) => {
    const existing = orders.find(o => o.id === oId) || {};
    const nowIso = new Date().toISOString();
    const syncPatch = { ...patch, updatedAt: nowIso, updatedBy: user?.uid || "" };

    const result = await offlinePatch("orders", oId, syncPatch, existing);
    const updated = { ...result.data, id: oId };

    setOrders(prev => prev.map(o => o.id === oId ? updated : o));

    if (successMessage) toast(successMessage);

    if (navigator.onLine) {
      pushOrdersNow();
    }

    return updated;
  };

  // Order line → purchase line, linked to the product master by code (+ brand when several share the code) so it adds stock.
  const buildOrderPurchaseLine = (item, qty, unitCost) => {
    const codeKey = nsq(item.code);
    const brandKey = String(item.brand || "").trim().toLowerCase();
    const byCode = codeKey ? (products || []).filter(p => !p.isDeleted && [p.code, p.barcode, p.ean].some(c => c && nsq(c) === codeKey)) : [];
    const byBrand = byCode.length > 1 && brandKey ? byCode.filter(p => String(p.brand || "").trim().toLowerCase() === brandKey) : byCode;
    const linked = item.productId ? (products || []).find(p => p.id === item.productId) : (byBrand.length === 1 ? byBrand[0] : null);
    return {
      productId:linked?.id || item.productId || null,
      unitFactor:linked ? unitFactorFor(linked, item.unit || "Pcs") : 1,
      name:String(item.name || "").trim(),
      code:String(item.code || "").trim(),
      brand:String(item.brand || "").trim(),
      qty,
      unit:item.unit || "Pcs",
      unitCost,
      discountPerc:0,
      discountAmt:0,
      taxPerc:0,
      taxAmt:0,
      lineTotal:Number((qty * unitCost).toFixed(2)),
      salePrice:null,
    };
  };

  const reserveOrderPurchaseNo = async () => {
    const rows = await offlineList("purchaseInvoices");
    const localMax = (rows.records || []).reduce((mx, r) => {
      const inv = r.data || {};
      if (inv.shopId !== shopId) return mx;
      const m = String(inv.invoiceNo || "").match(/PI-?(\d+)(?:-[A-Z]{2})?$/i);
      return m ? Math.max(mx, Number(m[1])) : mx;
    }, Number(localShop?.lastPISerial || 0));
    const serial = await reserveShopSerial(shopId, "lastPISerial", localMax);
    const fmt = (n) => `${PI_PREFIX}${String(n).padStart(4, "0")}`;
    if (serial) return fmt(serial);
    return isOwner ? fmt(localMax + 1) : `${fmt(localMax + 1)}-${deviceSerialTag()}`;
  };

  const savePrice = async (oId, iIdx, directVal) => {
    if (!isOwner&&!can("setPrices")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    const current = order.items[iIdx];
    if (!current || current.status==="delivered" || current.status==="cancelled") return;
    const upd = order.items.map((it,x)=>x===iIdx?{...it,price:String(directVal??"")}:it);
    try { await patchOrderOffline(oId, {items:upd}, t.n2); } catch(e) { hErr(e); }
  };

  const setItemStatus = async (oId,iIdx,status) => {
    if (!isOwner&&!can("setStatus")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    if (order.overall==="cancelled") return;
    const current = order.items[iIdx];
    if (!current || current.status==="delivered"||current.status==="cancelled") return;
    const isRecheck = current.status==="out_of_stock" && status==="order_confirmed";
    const isEditableItemState = ["pending","order_confirmed","out_of_stock"].includes(current.status);
    if (!isRecheck && !isEditableItemState) return;
    const upd = order.items.map((it,x)=>x===iIdx?{...it,status}:it);
    let newOverall = order.overall;
    if (isRecheck && order.overall!=="cancelled") newOverall = "order_confirmed";
    try { await patchOrderOffline(oId, {overall:newOverall,items:upd}); } catch(e) { hErr(e); }
  };

  // Goods arrived at the shop: the supplier's bill is entered here and becomes a normal purchase invoice.
  const deliverItem = (oId,iIdx) => {
    if (!isSalesman&&!can("markDelivery")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    if (isSalesman&&!can("markDelivery")&&order.createdBy!==user.uid) return;
    const target = order.items[iIdx];
    if (!target || target.status!=="out_for_branch") return;
    const supplierKey = target.co || "";
    const supplier = findOrderSupplier(supplierKey);
    setOrderReceive({
      orderId:oId,
      supplierKey,
      vendorName:supplier?.name || "",
      vendorMobile:supplier?.phone || "",
      supplierInvoiceNo:"",
      invoiceDate:localIsoDate(),
      paymentMethod:"credit",
      lines:order.items
        .map((it,x)=>({ iIdx:x, it }))
        .filter(({ it, iIdx:x }) => it.status==="out_for_branch" && (x===iIdx || (it.co||"")===supplierKey))
        .map(({ it, iIdx:x }) => ({ iIdx:x, checked:true, qty:String(it.qty ?? ""), unitCost:String(it.price ?? "") })),
    });
  };

  const saveOrderReceive = async () => {
    const rc = orderReceive; if (!rc || orderReceiveSaving) return;
    const order = orders.find(o=>o.id===rc.orderId); if (!order) { setOrderReceive(null); return; }
    const bn = lang==="bn";
    if (!rc.vendorName.trim()) { toast(bn?"❌ Vendor-এর নাম দিন":"❌ Enter the vendor name","err"); return; }
    if (!rc.supplierInvoiceNo.trim()) { toast(bn?"❌ সাপ্লায়ারের Invoice No দিন":"❌ Enter the supplier's invoice no","err"); return; }
    const picked = rc.lines.filter(l => l.checked && order.items[l.iIdx]?.status==="out_for_branch");
    if (!picked.length) { toast(bn?"❌ অন্তত একটা আইটেম বেছে নিন":"❌ Select at least one item","err"); return; }
    for (const l of picked) {
      const it = order.items[l.iIdx];
      if (!(Number(l.qty) > 0)) { toast(bn?`❌ "${it.name}": Qty দিন`:`❌ "${it.name}": enter the qty`,"err"); return; }
      if (Number(l.unitCost) < 0 || l.unitCost==="" || !Number.isFinite(Number(l.unitCost))) { toast(bn?`❌ "${it.name}": দাম দিন`:`❌ "${it.name}": enter the cost`,"err"); return; }
    }
    const builtItems = picked.map(l => buildOrderPurchaseLine(order.items[l.iIdx], Number(l.qty), Number(l.unitCost)));
    if (!unlinkedStockOk(builtItems, lang)) return;

    setOrderReceiveSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const orderNo = getOrderDisplayNo(order);
      const grandTotal = Number(builtItems.reduce((sum, it) => sum + (Number(it.lineTotal) || 0), 0).toFixed(2));
      const cash = rc.paymentMethod === "cash";
      const vendorRec = String(rc.supplierKey).startsWith("vendor:") ? vendors.find(v => v.id === String(rc.supplierKey).slice(7)) : null;
      const creditDays = Math.max(0, Math.round(Number(vendorRec?.paymentTerms) || 0));
      let dueDate = "";
      if (!cash && creditDays > 0) {
        const d = new Date(`${rc.invoiceDate || localIsoDate()}T00:00:00`);
        d.setDate(d.getDate() + creditDays);
        dueDate = localIsoDate(d);
      }
      const invoiceNo = await reserveOrderPurchaseNo();
      const payload = {
        shopId,
        invoiceNo,
        supplierInvoiceNo:rc.supplierInvoiceNo.trim(),
        invoiceDate:rc.invoiceDate || localIsoDate(),
        vendorId:String(rc.supplierKey).startsWith("vendor:") ? String(rc.supplierKey).slice(7) : null,
        vendorName:rc.vendorName.trim(),
        vendorMobile:rc.vendorMobile.trim(),
        items:builtItems,
        subtotal:grandTotal,
        totalDiscount:0,
        totalTax:0,
        grandTotal,
        paymentMethod:cash ? "cash" : "credit",
        amountPaid:cash ? grandTotal : 0,
        balanceDue:cash ? 0 : grandTotal,
        status:(cash || grandTotal <= 0) ? "paid" : "confirmed",
        note:`Order ${orderNo}`,
        dueDate,
        creditDays:dueDate ? creditDays : 0,
        source:"salesmanOrder",
        sourceOrderId:order.id,
        sourceOrderNo:orderNo,
        sourceSupplierKey:rc.supplierKey || "manual",
        createdBy:user.uid,
        createdByName:profile.personName,
        createdAt:nowIso,
        updatedAt:nowIso,
      };
      const result = await offlineCreate("purchaseInvoices", payload);
      const invoiceId = result.documentId || result.id;
      await applyInvoiceStockEffect({
        oldInvoice:null,
        newInvoice:payload,
        invoiceId,
        applyType:"purchase",
        reverseType:"adjustment",
        referenceType:"purchase_invoice",
        unitCostKey:"unitCost",
        shopId,
        actor:{ uid:user?.uid, personName:profile?.personName },
      });

      const byIdx = new Map(picked.map(l => [l.iIdx, l]));
      const upd = order.items.map((it,x) => {
        const l = byIdx.get(x);
        return l ? { ...it, status:"delivered", qty:String(l.qty), price:String(l.unitCost), purchaseInvoiceId:invoiceId, purchaseInvoiceNo:invoiceNo, supplierInvoiceNo:payload.supplierInvoiceNo } : it;
      });
      const activeItems = upd.filter(it=>it.status!=="cancelled" && it.status!=="out_of_stock");
      const allDelivered = activeItems.length>0 && activeItems.every(it=>it.status==="delivered");
      await patchOrderOffline(order.id, {
        overall:allDelivered ? "delivered" : order.overall,
        items:upd,
        purchaseInvoiceIds:[...new Set([...(order.purchaseInvoiceIds || []), invoiceId])],
        purchaseInvoiceCreated:allDelivered,
      }, bn ? `✅ ডেলিভারি হয়েছে — Purchase ${invoiceNo} তৈরি হয়েছে` : `✅ Delivered — purchase ${invoiceNo} created`);
      setOrderReceive(null);
    } catch(e) { hErr(e); }
    finally { setOrderReceiveSaving(false); }
  };

  const delOrder = async (oId) => {
    if (!can("deleteOrder")) return;
    if (!window.confirm(t.delConfirm)) return;

    try {
      await offlineRemove("orders", oId);

      setOrders(prev => prev.filter(o => o.id !== oId));
      if (selOrder===oId) setSelOrder(null);
      toast(t.n7,"err");

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] order delete sync failed", err));
      }
    } catch(e) { hErr(e); }
  };

  const cancelOrder = async (oId) => {
    if (!window.confirm(lang==="bn"?"এই অর্ডারটি বাতিল করবেন?":"Cancel this order?")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    if (!isOwner && order.createdBy && order.createdBy !== user?.uid) {
      toast(lang==="bn" ? "শুধু অর্ডারকারী বা মালিক বাতিল করতে পারেন" : "Only the order creator or owner can cancel", "err");
      return;
    }
    const cancelledItems = order.items.map(it=>({...it, status:"cancelled"}));
    try {
      await patchOrderOffline(oId, { overall:"cancelled", items:cancelledItems });
      toast(t.n8,"err");
    } catch(e) { hErr(e); }
  };

  const setCo = async (oId,iIdx,coId) => {
    if (!isOwner&&!can("manageCompanies")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    const current = order.items[iIdx];
    if (!current || current.status==="delivered" || current.status==="cancelled") return;
    const selectedSupplier = findOrderSupplier(coId);
    const upd = order.items.map((it,x)=>x===iIdx?{
      ...it,
      co:coId||null,
      supplierPhone: selectedSupplier?.phone ? "" : (coId ? (it.supplierPhone || "") : ""),
    }:it);
    try { await patchOrderOffline(oId, {items:upd}); } catch(e) { hErr(e); }
  };

  const saveSupplierPhone = async (oId,iIdx,phone) => {
    if (!isOwner&&!can("manageCompanies")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    const current = order.items[iIdx];
    if (!current || current.status==="delivered" || current.status==="cancelled") return;
    if (!["pending","order_confirmed","out_of_stock"].includes(current.status)) return;
    const cleanPhone = String(phone || "").replace(/[^0-9]/g, "");
    const upd = order.items.map((it,x)=>x===iIdx?{...it,supplierPhone:cleanPhone}:it);
    try { await patchOrderOffline(oId, {items:upd}); } catch(e) { hErr(e); }
  };

  const markRead = async (oId) => {
    const order = orders.find(o=>o.id===oId); if (!order||order.read) return;
    try { await patchOrderOffline(oId, {read:true}); } catch(e) { console.error(e); }
  };

  const startEdit = (c) => { setEditId(c.id); setEditNm(c.name); setEditPh(c.phone||""); };
  const cancelEdit = () => { setEditId(null); setEditNm(""); setEditPh(""); };

  const saveEdit = async (id) => {
    if (!editNm.trim()) return toast(t.e2,"err");

    const now = new Date().toISOString();

    const payload = {
      shopId,
      name: editNm.trim(),
      phone: editPh.trim(),
      updatedBy: user?.uid || "",
      updatedAt: now,
    };

    try {
      const result = await offlineUpdate("companies", id, payload);
      const updated = { ...result.data, id };

      setCos(prev =>
        prev
          .map(c => c.id === id ? updated : c)
          .sort((a,b)=>(a.name||"").localeCompare(b.name||""))
      );

      cancelEdit();
      toast(t.n5);

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] company update sync failed", err));
      }
    } catch(e) {
      hErr(e);
    }
  };

  const delCo = async (id) => {
    try {
      await offlineRemove("companies", id);

      setCos(prev => prev.filter(c => c.id !== id));
      toast(t.n6,"err");

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] company delete sync failed", err));
      }
    } catch(e) {
      hErr(e);
    }
  };

  const addCo = async () => {
    if (!newNm.trim()) return toast(t.e3,"err");

    const now = new Date().toISOString();

    const payload = {
      shopId,
      name: newNm.trim(),
      phone: newPh.trim(),
      createdBy: user?.uid || "",
      createdAt: now,
      updatedAt: now,
    };

    try {
      const result = await offlineCreate("companies", payload);
      const created = { ...result.data, id: result.documentId };

      setCos(prev =>
        [created, ...prev.filter(c => c.id !== created.id)]
          .sort((a,b)=>(a.name||"").localeCompare(b.name||""))
      );

      setNewNm("");
      setNewPh("");
      setShowAdd(false);
      toast(t.n4);

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] company sync failed", err));
      }
    } catch(e) {
      hErr(e);
    }
  };


  const saveVendor = async (editId=null) => {
    if (!vendorForm.vendorName.trim()) return toast(t.vm_errName||"Enter vendor name!","err");
    if (!vendorForm.mobileNumber.trim()) return toast(t.vm_errMobile||"Enter mobile number!","err");

    const nowIso = new Date().toISOString();

    const payload = {
      shopId,
      vendorName:vendorForm.vendorName.trim(), vendorCode:vendorForm.vendorCode.trim(),
      category:vendorForm.category, status:vendorForm.status||"active",
      contactPerson:vendorForm.contactPerson.trim(),
      mobileNumber:vendorForm.mobileNumber.trim(), phoneNumber:vendorForm.phoneNumber.trim(),
      whatsappNumber:vendorForm.whatsappNumber.trim(), email:vendorForm.email.trim(),
      address:vendorForm.address.trim(), area:vendorForm.area.trim(),
      city:vendorForm.city.trim(), country:vendorForm.country.trim(), mapLink:vendorForm.mapLink.trim(),
      trnNumber:vendorForm.trnNumber.trim(),
      tradeLicenseNumber:vendorForm.tradeLicenseNumber.trim(),
      tinNumber:vendorForm.tinNumber.trim(), binNumber:vendorForm.binNumber.trim(),
      vatNumber:vendorForm.vatNumber.trim(),
      bankName:vendorForm.bankName.trim(), bankBranch:vendorForm.bankBranch.trim(),
      accountName:vendorForm.accountName.trim(), accountNumber:vendorForm.accountNumber.trim(),
      ibanNumber:vendorForm.ibanNumber.trim(), swiftCode:vendorForm.swiftCode.trim(),
      creditLimit:Number(vendorForm.creditLimit||0),
      openingBalance:Number(vendorForm.openingBalance||0),
      paymentTerms:Number(vendorForm.paymentTerms||0),
      notes:vendorForm.notes.trim(),
      updatedBy:user.uid,
      updatedAt:nowIso,
    };

    try {
      if (editId) {
        const result = await offlineUpdate("vendors", editId, payload);
        const updated = { ...result.data, id: editId };

        setVendors(prev => prev.map(v => v.id === editId ? updated : v));
        toast(t.vm_updated||"Vendor updated!");
      } else {
        const result = await offlineCreate("vendors", {
          ...payload,
          vendorCode: await nextPartyCode(shopId, "vendors", vendors),
          createdBy:user.uid,
          createdAt:nowIso,
        });
        const created = { ...result.data, id: result.documentId };

        setVendors(prev => [created, ...prev]);
        toast(t.vm_saved||"Vendor saved!");
      }

      setVendorForm(emptyVendor);
      setShowVendorModal(false);

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] vendor modal save sync failed", err));
      }
    } catch(e) {
      console.error(e);
      toast(e.message,"err");
    }
  };

  const savePermissions = async (member, newPerms) => {
    const memberId = member.uid || member.id;
    teamPermissionOverridesRef.current[memberId] = newPerms;
    setTeam((prev) => prev.map((m) => ((m.uid || m.id) === memberId ? { ...m, permissions: newPerms } : m)));
    try {
      await updateShopMemberPermissions(memberId, {
        permissions: newPerms,
        position: member.position,
        localUserId: member.localUserId,
        memberRecord: { ...member, permissions: newPerms, shopId },
      });
      toast(t.permSaved);
    } catch(e) {
      delete teamPermissionOverridesRef.current[memberId];
      rebuildTeam();
      hErr(e);
    }
  };

  const saveUserGroups = async (next) => {
    const updated = await saveShopRecord(shopId, { userGroups: next }, { ownerUid: user?.uid, profile, user });
    setLocalShop(prev=>mergeShopRecord(prev, updated || { userGroups: next }));
  };

  const saveMemberDefaults = async (member, defaults) => {
    const memberId = member.uid || member.id;
    try {
      await updateShopMemberPermissions(memberId, {
        localUserId: member.localUserId,
        memberRecord: { ...member, defaults, shopId },
        extra: { defaults },
      });
      setTeam((prev) => prev.map((m) => ((m.uid || m.id) === memberId ? { ...m, defaults } : m)));
      toast(lang==="bn"?"✅ ডিফল্ট সেভ হয়েছে — পরের নতুন বিল থেকে কাজ করবে":"✅ Defaults saved — used from the next new bill");
    } catch(e) { hErr(e); }
  };

  const applyGroupToMember = async (member, group, { notify = false } = {}) => {
    const memberId = member.uid || member.id;
    const newPerms = group ? groupPermissions(group, DEFAULT_PERMISSIONS) : { ...DEFAULT_PERMISSIONS, ...(member.permissions || {}) };
    const groupId = group?.id || "";
    teamPermissionOverridesRef.current[memberId] = newPerms;
    setTeam((prev) => prev.map((m) => ((m.uid || m.id) === memberId ? { ...m, permissions: newPerms, groupId } : m)));
    try {
      await updateShopMemberPermissions(memberId, {
        permissions: newPerms,
        position: member.position,
        localUserId: member.localUserId,
        memberRecord: { ...member, permissions: newPerms, groupId, shopId },
        extra: { groupId },
      });
      if (notify) toast(t.permSaved);
    } catch(e) {
      delete teamPermissionOverridesRef.current[memberId];
      rebuildTeam();
      if (notify) hErr(e); else throw e;
    }
  };

  const saveMemberPosition = async (member, position) => {
    const memberId = member.uid || member.id;
    try {
      await updateShopMemberPosition(memberId, position, member.localUserId);
      setTeam((prev) => prev.map((m) => ((m.uid || m.id) === memberId ? { ...m, position } : m)));
      toast(t.permSaved);
    } catch(e) { hErr(e); }
  };

  const createStaffMember = async () => {
    if (!staffForm.username.trim() || !staffForm.password || !staffForm.personName.trim()) {
      return toast(lang==="bn"?"username, password ও নাম দিন":"Enter username, password and name","err");
    }
    if (!isAcceptablePassword(staffForm.password)) {
      return toast(lang==="bn"?"password-এ অক্ষর ও সংখ্যা মিশিয়ে কমপক্ষে ৬ অক্ষর":"Password needs letters and numbers (min 6)","err");
    }

    setStaffSaving(true);
    try {
      const member = await createShopStaffUser({
        username: staffForm.username.trim(),
        password: staffForm.password,
        personName: staffForm.personName.trim(),
        shopId,
        position: staffForm.position || "Salesman",
        mobile: staffForm.mobile.trim(),
        permissions: { ...DEFAULT_PERMISSIONS },
      });
      setTeam((prev) => mergeTeamMembers(prev, [member]));
      const startGroup = userGroups.find(g=>g.id===staffForm.groupId);
      if (startGroup) {
        try { await applyGroupToMember(member, startGroup); }
        catch(err) { console.warn("[S4 Team] group apply failed", err); }
      }
      setStaffForm({ username:"", password:"", personName:"", mobile:"", position:"Salesman", groupId:staffForm.groupId||"" });
      toast(
        member.authEmail
          ? (lang==="bn"
            ? `✅ কর্মী যোগ হয়েছে। অন্য device-এ username "${member.username}" + password দিয়ে login করুন (প্রথমবার internet লাগবে)`
            : `✅ Staff added. On another device login with username "${member.username}" + password (internet needed once)`)
          : t.staffAddedOk
      );
    } catch(e) {
      if (e?.code === "OFFLINE_REQUIRED") {
        toast(friendlyLocalAuthError({ reason: "OFFLINE_REQUIRED" }, lang), "err");
      } else if (e?.code === "auth/email-already-in-use") {
        toast(friendlyAuthError(e, lang), "err");
      } else {
        hErr(e);
      }
    }
    finally { setStaffSaving(false); }
  };

  const resetStaffPassword = async (member) => {
    if (!member.localUserId) {
      return toast(lang==="bn"?"এই সদস্যের local account নেই":"No local account for this member","err");
    }
    const pw = staffPwReset[member.localUserId] || "";
    if (!isAcceptablePassword(pw)) {
      return toast(lang==="bn"?"password-এ অক্ষর ও সংখ্যা মিশিয়ে কমপক্ষে ৬ অক্ষর":"Password needs letters and numbers (min 6)","err");
    }
    try {
      await resetShopMemberPassword(member.localUserId, pw);
      setStaffPwReset((prev) => ({ ...prev, [member.localUserId]: "" }));
      toast(t.resetPwOk);
    } catch(e) { hErr(e); }
  };

  const closeTeamMember = async (member) => {
    const memberId = member.uid || member.id;
    if (!window.confirm(t.confirmRemoveMember)) return;

    try {
      await removeShopTeamMember(member, { ownerUid: user?.uid || profile?.uid || "" });
      setTeam((prev) => prev.filter((m) => (m.uid || m.id) !== memberId));
      toast(t.memberRemovedOk);
    } catch (e) {
      hErr(e);
    }
  };

  const shortId  = (id) => id.slice(-6).toUpperCase();
  const getOrderDisplayNo = (order) => {
    if (order.orderNo) return order.orderNo;
    if (Number.isFinite(order.serialNo)) return `${ORDER_PREFIX}${String(order.serialNo).padStart(4, "0")}`;
    return shortId(order.id);
  };
  // ── WA MESSAGE BUILDER (grouped, style-aware) ──
  const waLinkGroup = (phone, items) => {
    const isBn = lang === "bn";
    const title = isBn ? "*পণ্যের তালিকা:*" : "*Product List:*";
    const footer = isBn
      ? "_দয়া করে দাম ও স্টক জানান।_ 🙏 ধন্যবাদ"
      : "_Please share price and stock availability._ 🙏 Thank you";
    const nums = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
    let lines = "";
    items.forEach((it, i) => {
      const name = `*${it.name}*`;
      const meta = [it.code, it.brand, `${it.qty} ${it.unit}`].filter(Boolean).join(" | ");
      if (waStyle==="1") lines += `▪️ ${name} | ${meta}\n`;
      else if (waStyle==="2") lines += `${nums[i]||`${i+1}.`} ${name} | ${meta}\n`;
      else if (waStyle==="3") lines += `🔸 ${name} | ${meta}\n`;
      else if (waStyle==="4") lines += `──────────────\n▪️ ${name}\n   ${meta}\n`;
    });
    if (waStyle==="4") lines += "──────────────";
    const msg = `${title}\n${lines}\n${footer}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const supplierPhone = (row = {}) => String(
    row.whatsappNumber || row.mobileNumber || row.phoneNumber || row.phone || row.supplierPhone || ""
  ).replace(/[^0-9]/g, "");

  const orderSupplierOptions = [
    ...vendors
      .filter(v => v?.isDeleted !== true && !["disabled","inactive","blocked"].includes(v?.status))
      .map(v => ({
        id: `vendor:${v.id}`,
        name: v.vendorName || "",
        phone: supplierPhone(v),
        source: lang === "bn" ? "ভেন্ডর" : "Vendor",
      })),
  ].filter(row => row.name.trim());

  // Older orders may still point at an entry of the retired Companies list.
  const findOrderSupplier = (value) => {
    if (!value) return null;
    const vendorRow = orderSupplierOptions.find(row => row.id === value);
    if (vendorRow) return vendorRow;
    const legacy = cos.find(c => c.id === value);
    return legacy ? { id: legacy.id, name: legacy.name || "", phone: supplierPhone(legacy), source: lang === "bn" ? "কোম্পানি" : "Company" } : null;
  };

  const normalizeSupplierSearch = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, "");
  const searchOrderSuppliers = (query) => {
    const clean = normalizeSupplierSearch(query);
    if (!clean) return orderSupplierOptions.slice(0, 80);
    return orderSupplierOptions
      .filter(row => normalizeSupplierSearch(`${row.name} ${row.phone} ${row.source}`).includes(clean))
      .slice(0, 80);
  };

  useEffect(() => {
    if (!supplierPickerTarget) return;
    const timer = setTimeout(() => {
      supplierPickerInputRef.current?.focus?.();
      supplierPickerInputRef.current?.select?.();
    }, 50);
    return () => clearTimeout(timer);
  }, [supplierPickerTarget]);

  const openOrderSupplierPicker = (orderId, itemIndex, selectedSupplier) => {
    setSupplierPickerTarget({ orderId, itemIndex });
    setSupplierPickerQuery(selectedSupplier?.name || "");
  };

  const closeOrderSupplierPicker = () => {
    setSupplierPickerTarget(null);
    setSupplierPickerQuery("");
  };

  const selectOrderSupplierFromPicker = (supplierId) => {
    if (!supplierPickerTarget) return;
    setCo(supplierPickerTarget.orderId, supplierPickerTarget.itemIndex, supplierId);
    closeOrderSupplierPicker();
  };

  useEffect(() => {
    if (!priceEditorTarget) return;
    const timer = setTimeout(() => {
      priceEditorInputRef.current?.focus?.();
      priceEditorInputRef.current?.select?.();
    }, 50);
    return () => clearTimeout(timer);
  }, [priceEditorTarget]);

  const openPriceEditor = (orderId, itemIndex, currentPrice) => {
    setPriceEditorTarget({ orderId, itemIndex });
    setPriceEditorValue(String(currentPrice ?? ""));
  };

  const closePriceEditor = () => {
    setPriceEditorTarget(null);
    setPriceEditorValue("");
  };

  const savePriceEditor = async () => {
    if (!priceEditorTarget) return;
    await savePrice(priceEditorTarget.orderId, priceEditorTarget.itemIndex, priceEditorValue);
    closePriceEditor();
  };

  const handleLogout = async () => {
    if (!window.confirm(t.confirmLogout)) return;
    try {
      if (onLogout) await onLogout();
      else await signOut(auth);
    } catch(e) { hErr(e); }
  };

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(localShop.inviteCode); setCopyState(true); setTimeout(()=>setCopyState(false),2000); }
    catch { toast("Copy failed","err"); }
  };

  const unread = isOwner || isOrderManager
    ? orders.filter(o=>o.overall==="pending"&&!o.read).length
    : orders.filter(o=>o.items?.some(it=>it.status==="out_for_branch")).length;

  const notificationItems = [
    ...(isOwner ? finance.dueCheques.map(c => ({
      key:`chq-${c.key}`,
      icon:chequeTypeIcon(c.type),
      tone:c.daysLate>0?"danger":undefined,
      title:lang==="bn"
        ? `${chequeTypeLabel(c.type,true)} ক্লিয়ার করুন · ${t.cur||"AED"} ${(Math.round(c.amount*100)/100).toLocaleString("en-US",{minimumFractionDigits:2})}`
        : `Clear ${chequeTypeLabel(c.type,false).toLowerCase()} · ${t.cur||"AED"} ${(Math.round(c.amount*100)/100).toLocaleString("en-US",{minimumFractionDigits:2})}`,
      sub:`${c.party||"—"} · ${lang==="bn"?"চেক":"Cheque"} ${c.chequeNo||c.no} · ${c.daysLate>0?(lang==="bn"?`${c.daysLate} দিন পার`:`${c.daysLate} day(s) late`):(lang==="bn"?"আজ":"today")}`,
      onClick:()=>{ setSettingsPage(null); setTab("dashboard"); },
    })) : []),
    ...(isOwner ? finance.upcomingCheques.map(c => ({
      key:`chq-up-${c.key}`,
      icon:"⏳",
      title:lang==="bn"
        ? `${-c.daysLate} দিন পর ${chequeTypeLabel(c.type,true)} · ${t.cur||"AED"} ${(Math.round(c.amount*100)/100).toLocaleString("en-US",{minimumFractionDigits:2})}`
        : `${chequeTypeLabel(c.type,false)} in ${-c.daysLate} day(s) · ${t.cur||"AED"} ${(Math.round(c.amount*100)/100).toLocaleString("en-US",{minimumFractionDigits:2})}`,
      sub:`${c.party||"—"} · ${lang==="bn"?"চেক":"Cheque"} ${c.chequeNo||c.no} · 📅 ${c.chequeDate.split("-").reverse().join("/")}`,
      onClick:()=>{ setSettingsPage(null); setTab("dashboard"); },
    })) : []),
    ...employeeAlertList.filter(a => a.tone!=="info" || a.daysLeft<=7).map(a => {
      const txt = employeeAlertText(a, lang==="bn", t.cur||"AED");
      return { key:`emp-${a.key}`, icon:txt.icon, tone:a.tone==="danger"?"danger":undefined, title:txt.title, sub:txt.sub, onClick:()=>openEmployeeAlert(a) };
    }),
    ...partnerAlertList.map(a => {
      const txt = partnerAlertText(a, lang==="bn", t.cur||"AED");
      return { key:`partner-${a.key}`, icon:txt.icon, tone:a.tone==="danger"?"danger":undefined, title:txt.title, sub:txt.sub, onClick:()=>{ setSettingsPage(null); setTab("partners"); } };
    }),
    ...reminderAlertList.map(a => {
      const txt = reminderAlertText(a, lang==="bn");
      return { key:a.key, icon:txt.icon, tone:a.tone, title:txt.title, sub:txt.sub, onClick:()=>{ setSettingsPage(null); setTab("reminders"); } };
    }),
    ...(orderModuleEnabled && unread>0 ? [{
      key:"orders", icon:"📋", count:unread,
      title:lang==="bn"?`${unread}টি নতুন অর্ডার`:`${unread} new order(s)`,
      sub:lang==="bn"?"অর্ডার পাতায় দেখুন":"Open orders",
      onClick:()=>{ setSettingsPage(null); setTab(isOwner?"owner":"shop"); },
    }] : []),
  ];

  // Phone/browser back button and the header Back button: sub-page → settings
  // list → dashboard, instead of leaving the app.
  const navHistRef = useRef({ pushed:false, ignorePop:false });
  const navStateRef = useRef({ tab, settingsPage });
  navStateRef.current = { tab, settingsPage };
  // Back while Product Master is open: keep unsaved edits unless confirmed, and an overlay
  // opened from an invoice closes back to that invoice. Returns true when it handled the back.
  const pmBackRef = useRef(null);
  pmBackRef.current = () => {
    const pmVisible = tab === "products" || (pmOverSales && ["sales","quotation","delivery","purchase"].includes(tab));
    if (!pmVisible) return false;
    if (!confirmPmDiscard()) return true;
    setPmShowAdd(false); setPmEditId(null); pmReset();
    if (pmOverSales) { setPmOverSales(false); return true; }
    return false;
  };
  useEffect(() => {
    const h = navHistRef.current;
    const away = tab !== "dashboard";
    if (away && !h.pushed) { window.history.pushState({ s4nav:true }, ""); h.pushed = true; }
    else if (!away && h.pushed) { h.pushed = false; h.ignorePop = true; window.history.back(); }
  }, [tab, settingsPage]);
  useEffect(() => {
    const onPop = () => {
      const h = navHistRef.current;
      if (h.ignorePop) { h.ignorePop = false; return; }
      if (!h.pushed) return;
      h.pushed = false;
      if (pmBackRef.current?.() || billLeaveGuard.current?.back()) {
        window.history.pushState({ s4nav:true }, "");
        h.pushed = true;
        return;
      }
      const { tab:curTab, settingsPage:curPage } = navStateRef.current;
      if (curTab === "settings" && curPage) setSettingsPage(null);
      else setTab("dashboard");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const menuHistRef = useRef(false);
  useEffect(() => {
    if (!menuOpen) return undefined;
    window.history.pushState({ s4menu:true }, "");
    menuHistRef.current = true;
    const onPop = () => {
      if (!menuHistRef.current) return;
      menuHistRef.current = false;
      setMenuOpen(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [menuOpen]);
  const closeMenu = () => {
    if (menuHistRef.current) {
      menuHistRef.current = false;
      navHistRef.current.ignorePop = true;
      window.history.back();
    }
    setMenuOpen(false);
  };
  const selectFromMenu = (k) => {
    if (k !== tab && billLeaveGuard.current && !billLeaveGuard.current.leave()) { closeMenu(); return; }
    if (menuHistRef.current) {
      menuHistRef.current = false;
      if (k !== "dashboard" && !navHistRef.current.pushed) navHistRef.current.pushed = true;
      else { navHistRef.current.ignorePop = true; window.history.back(); }
    }
    setMenuOpen(false);
    setSettingsPage(null);
    setTabState(k);
  };
  const stPage = settingsPage || (isDesktop ? "profile" : null);
  const goBack = () => {
    if (pmBackRef.current?.() || billLeaveGuard.current?.back()) return;
    if (tab === "settings" && settingsPage) setSettingsPage(null);
    else { setSettingsPage(null); setTab("dashboard"); }
  };

  // ── SEARCH FILTER ──
  const filterOrders = (list) => {
    const q = searchQ.trim();
    if (!q) return list;
    return list.filter(o => {
      const noMatch = nsmatch(getOrderDisplayNo(o), q);
      const itemMatch = o.items?.some(it =>
        nsmatch([it.name,it.brand,it.code].filter(Boolean).join(" "), q)
      );
      const supplierMatch = o.items?.some(it => {
        const supplier = findOrderSupplier(it.co);
        return nsmatch([supplier?.name, supplier?.phone, it.supplierPhone].filter(Boolean).join(" "), q);
      });
      const d = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
      // Match against several date formats so user can type e.g. "9 may", "09/05", "2026"
      const dateFormats = [
        d.toLocaleDateString("bn-BD", { day:"numeric", month:"long", year:"numeric" }),
        d.toLocaleDateString("en-GB",  { day:"numeric", month:"long", year:"numeric" }),
        d.toLocaleDateString("en-GB",  { day:"2-digit", month:"2-digit", year:"numeric" }), // 09/05/2026
        d.toLocaleDateString("en-GB",  { day:"numeric", month:"short" }),                   // 9 May
        String(d.getFullYear()),
      ];
      const dateMatch = dateFormats.some(f => f.toLowerCase().includes(q));
      return noMatch || itemMatch || supplierMatch || dateMatch;
    });
  };

  // ── DAILY GROUP ──
  const groupByDay = (list) => {
    const groups = {};
    list.forEach(o => {
      const d = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
      const key = d.toLocaleDateString(lang==="bn"?"bn-BD":"en-GB", { day:"numeric", month:"long", year:"numeric" });
      if (!groups[key]) groups[key] = [];
      groups[key].push(o);
    });
    return Object.entries(groups); // [ [dateStr, [orders]], ... ]
  };

  const orderPageTabs = [
    { key:"pending", label:lang==="bn"?"Pending":"Pending", icon:"⏳" },
    { key:"delivered", label:lang==="bn"?"Delivered":"Delivered", icon:"✅" },
    { key:"cancelled", label:lang==="bn"?"Cancelled":"Cancelled", icon:"🚫" },
  ];
  const orderPageCounts = {
    pending: orders.filter(o => !["delivered","cancelled"].includes(o.overall)).length,
    delivered: orders.filter(o => o.overall === "delivered").length,
    cancelled: orders.filter(o => o.overall === "cancelled").length,
  };
  const filterOrdersByStatusPage = (list) => list.filter((order) => {
    if (orderStatusPage === "delivered") return order.overall === "delivered";
    if (orderStatusPage === "cancelled") return order.overall === "cancelled";
    return !["delivered","cancelled"].includes(order.overall);
  });
  const renderOrderPageTabs = () => (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:7, marginBottom:12 }}>
      {orderPageTabs.map(page => (
        <button
          key={page.key}
          type="button"
          onClick={()=>setOrderStatusPage(page.key)}
          style={{ padding:"10px 8px", borderRadius:12, border:`1px solid ${orderStatusPage===page.key?"#f97316":th.borderMid}`, background:orderStatusPage===page.key?th.accentDim:th.bgCard, color:orderStatusPage===page.key?"#f97316":th.txtSecondary, fontSize:12, fontWeight:850, cursor:"pointer", fontFamily:"inherit" }}>
          {page.icon} {page.label}
          <span style={{ display:"block", fontSize:10, color:th.txtMuted, marginTop:2 }}>{orderPageCounts[page.key] || 0}</span>
        </button>
      ))}
    </div>
  );

  const canStaffSupplierArea = can("viewVendors") || can("viewSupplierLedger") || can("vendorPayments") || can("managePurchase");
  const canStaffVouchers = can("accountVouchers") || can("manageSales") || can("vendorPayments") || can("manageReturns");
  const staffQuickNavKeys = isOwner
    ? []
    : [
        ...(orderModuleEnabled ? ["shop"] : []),
        ...(can("viewProducts") ? ["products"] : []),
        ...(can("manageSales") ? ["sales"] : []),
        "purchase",
        ...(can("printCheques") ? ["cheque"] : []),
        ...(can("managePdc") ? ["pdc"] : []),
        ...(can("manageExpenses") ? ["expenses"] : []),
        ...(canStaffVouchers ? ["vouchers"] : []),
        ...(can("manageReturns") ? ["salesReturn","purchaseReturn"] : []),
        ...(can("stockAdjust") ? ["stockAdjust"] : []),
        "settings",
      ];

  const makeShopNo = async (field, prefix, nos = []) => {
    const re = new RegExp(`^${prefix}-?(\\d+)(?:-[A-Z]{2})?$`, "i");
    const local = nos.reduce((mx, no) => {
      const m = String(no || "").match(re);
      return m ? Math.max(mx, Number(m[1])) : mx;
    }, Number(localShop?.[field] || 0));
    const fmt = (n) => `${prefix}-${String(n).padStart(4, "0")}`;
    const serial = await reserveShopSerial(shopId, field, local);
    if (serial) return fmt(serial);
    return isOwner ? fmt(local + 1) : `${fmt(local + 1)}-${deviceSerialTag()}`;
  };
  const newTabLabels = {
    salesOrder: lang==="bn"?"📝 সেলস অর্ডার":"📝 Sales Order",
    purchaseOrder: lang==="bn"?"📋 পারচেজ অর্ডার":"📋 Purchase Order",
    goodsReceipt: lang==="bn"?"📥 মাল গ্রহণ (DN Received)":"📥 Delivery Note (Received)",
    employees: lang==="bn"?"👷 কর্মচারী":"👷 Employees",
    employeeExpense: lang==="bn"?"🧑‍💼 কর্মচারীর খরচ":"🧑‍💼 Employee Expense",
    attendance: lang==="bn"?"🗓️ হাজিরা খাতা":"🗓️ Attendance Register",
    bankRec: lang==="bn"?"🏦 ব্যাংক মেলানো":"🏦 Bank Reconciliation",
    jobCard: lang==="bn"?"🔧 জব কার্ড":"🔧 Job Card",
    partners: lang==="bn"?"🤝 পার্টনার ও লাভের ভাগ":"🤝 Partners",
    labels: lang==="bn"?"🏷️ বারকোড লেবেল":"🏷️ Barcode Labels",
    reminders: lang==="bn"?"🔔 রিমাইন্ডার":"🔔 Reminders",
    calculator: lang==="bn"?"🧮 ক্যালকুলেটর / মুদ্রা":"🧮 Calculator / Currency",
  };
  const returnTabLabels = {
    salesReturn: lang==="bn"?"↩️ সেলস রিটার্ন":"↩️ Sales Return",
    purchaseReturn: lang==="bn"?"↪️ পারচেজ রিটার্ন":"↪️ Purchase Return",
    stockAdjust: lang==="bn"?"⚖️ স্টক সমন্বয়":"⚖️ Stock Adjustment",
    loosen: lang==="bn"?"📦 পণ্য খোলা (Loosening)":"📦 Product Loosening",
    bundle: lang==="bn"?"🧰 পণ্য জোড়া / কিট":"🧰 Product Bundling",
    auditLog: lang==="bn"?"🕵️ অডিট লগ":"🕵️ Audit Log",
  };

  const visibleTabs = useMemo(() => (isOwner
    ? [["dashboard",t.tabDashboard],...(orderModuleEnabled?[["owner",t.tabOwner]]:[]),["products",t.tabProducts],["purchaseOrder",newTabLabels.purchaseOrder],["goodsReceipt",newTabLabels.goodsReceipt],["purchase",t.tabPurchase],["sales",t.tabSales],["quotation",t.tabQuotation],["salesOrder",newTabLabels.salesOrder],["delivery",t.tabDelivery],["jobCard",newTabLabels.jobCard],["vendors",t.tabVendor],["customers",t.tabCustomer],["cheque",t.tabCheque],["pdc",lang==="bn"?"📃 PDC চেক":"📃 PDC Cheques"],["expenses",lang==="bn"?"💸 খরচ":"💸 Expenses"],["employees",newTabLabels.employees],["employeeExpense",newTabLabels.employeeExpense],["attendance",newTabLabels.attendance],["vouchers",lang==="bn"?"🧾 ভাউচার":"🧾 Vouchers"],["salesReturn",returnTabLabels.salesReturn],["purchaseReturn",returnTabLabels.purchaseReturn],["stockAdjust",returnTabLabels.stockAdjust],["loosen",returnTabLabels.loosen],["bundle",returnTabLabels.bundle],["accounts",lang==="bn"?"📊 হিসাব নিকাশ":"📊 Accounts"],["bankRec",newTabLabels.bankRec],["partners",newTabLabels.partners],["tax",lang==="bn"?"🏛️ ট্যাক্স / VAT":"🏛️ Tax / VAT"],["auditLog",returnTabLabels.auditLog],...(canUseBranchTransfer?[["branchTransfer",branchTransferMenuLabel(lang, btInbox.length)]]:[]),["labels",newTabLabels.labels],["reminders",newTabLabels.reminders],["calculator",newTabLabels.calculator],["settings",t.tabSettings]]
    : [
        ["dashboard",t.tabDashboard],
        ...(orderModuleEnabled?[["shop",t.tabShop]]:[]),
        ...(can("viewProducts")?[["products",t.tabProducts]]:[]),
        ...(can("manageSales")?[["sales", t.tabSales],["quotation", t.tabQuotation],["salesOrder", newTabLabels.salesOrder],["delivery", t.tabDelivery]]:[]),
        ...(can("managePurchase")?[["purchaseOrder",newTabLabels.purchaseOrder],["goodsReceipt",newTabLabels.goodsReceipt]]:[]),
        ["purchase", canStaffSupplierArea ? t.tabPurchase : (lang==="bn"?"📦 ক্রয় তথ্য":"📦 Purchase Info")],
        ...(can("viewVendors")||can("manageVendors")?[["vendors",t.tabVendor]]:[]),
        ...(can("printCheques")?[["cheque",t.tabCheque]]:[]),
        ...(can("managePdc")?[["pdc",lang==="bn"?"📃 PDC চেক":"📃 PDC Cheques"]]:[]),
        ...(can("manageExpenses")?[["expenses",lang==="bn"?"💸 খরচ":"💸 Expenses"],["employeeExpense",newTabLabels.employeeExpense]]:[]),
        ...(can("manageEmployees")?[["employees",newTabLabels.employees],["attendance",newTabLabels.attendance]]:[]),
        ...(can("bankReconcile")?[["bankRec",newTabLabels.bankRec]]:[]),
        ...(can("manageJobs")?[["jobCard",newTabLabels.jobCard]]:[]),
        ...(canStaffVouchers?[["vouchers",lang==="bn"?"🧾 ভাউচার":"🧾 Vouchers"]]:[]),
        ...(can("manageReturns")?[["salesReturn",returnTabLabels.salesReturn],["purchaseReturn",returnTabLabels.purchaseReturn]]:[]),
        ...(can("stockAdjust")?[["stockAdjust",returnTabLabels.stockAdjust],["loosen",returnTabLabels.loosen],["bundle",returnTabLabels.bundle]]:[]),
        ...(canUseBranchTransfer?[["branchTransfer",branchTransferMenuLabel(lang, btInbox.length)]]:[]),
        ...(can("viewProducts")?[["labels",newTabLabels.labels]]:[]),
        ["reminders",newTabLabels.reminders],
        ["calculator",newTabLabels.calculator],
        ["settings",t.tabSettings],
      ]), [isOwner, orderModuleEnabled, t, newTabLabels, returnTabLabels, lang, canUseBranchTransfer, btInbox.length, canStaffSupplierArea, canStaffVouchers]);
  const validTabs = visibleTabs;

  // Safety: if any old/invalid tab is active after new menu changes, always return to Dashboard.
  useEffect(() => {
    if (!validTabs.some(([k]) => k === tab)) setTabState("dashboard");
  }, [tab, validTabs]);

  const myStartTab = (team.find(m=>(m.uid||m.id)===user?.uid)?.defaults || profile?.defaults || {}).startTab || "";
  const startTabDoneRef = useRef(false);
  const mountedAtRef = useRef(Date.now());
  useEffect(() => {
    if (startTabDoneRef.current || !myStartTab) return;
    if (!validTabs.some(([k]) => k === myStartTab)) return;
    startTabDoneRef.current = true;
    if (tab==="dashboard" && Date.now()-mountedAtRef.current < 20000 && START_TABS.some(([k]) => k === myStartTab)) setTab(myStartTab);
  }, [myStartTab, validTabs]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabLabelOf = (k) => (validTabs.find(([key]) => key === k) || [])[1] || k;
  const currentTabLabel = tabLabelOf(tab);
  useEscapeKey(() => {
    if (settingsPage) setSettingsPage(null);
    else if (tab !== "dashboard") setTab("dashboard");
  }, { enabled: isDesktop && (tab !== "dashboard" || !!settingsPage), level: 0 });
  useEscapeKey(() => { if (!orderReceiveSaving) setOrderReceive(null); }, { enabled: !!orderReceive, level: 3 });

  // ── ORDER STATUS FLOW (overall) ──
  const setOrderStatus = async (oId, newStatus) => {
    if (!isOwner&&!can("setStatus")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    if (order.overall==="cancelled") return;
    const hasRecheckableItems = order.items.some(it=>it.status==="order_confirmed"||it.status==="pending");
    if (order.overall==="delivered" && !hasRecheckableItems) return;
    if (newStatus==="ordered_supplier") {
      const activeItems = order.items.filter(it =>
        it.status!=="out_of_stock" && it.status!=="cancelled" && it.status!=="delivered"
      );
      const missingCo = activeItems.some(it => !it.co);
      if (missingCo) return toast(
        lang==="bn"
          ? "❌ সব আইটেমে কোম্পানি সিলেক্ট করুন, তারপর এগিয়ে যান"
          : "❌ Select a company for every item before ordering supplier",
        "err"
      );
      const missingPrice = activeItems.some(it => !String(it.price||"").trim());
      if (missingPrice) return toast(
        lang==="bn"
          ? "❌ সব আইটেমের দাম সেট করুন, তারপর এগিয়ে যান"
          : "❌ Set price for all items before ordering supplier",
        "err"
      );
    }
    const updatable = new Set(["order_confirmed","ordered_supplier","waiting_delivery","arrived_main_shop","out_for_branch"]);
    const newItems = updatable.has(newStatus)
      ? order.items.map(it =>
          (it.status==="out_of_stock"||it.status==="delivered"||it.status==="cancelled")
            ? it
            : { ...it, status:newStatus }
        )
      : order.items;
    try { await patchOrderOffline(oId, {overall:newStatus,items:newItems}); }
    catch(e) { hErr(e); }
  };

  const canExpand = isOwner || isOrderManager || can("deleteOrder");

  // ── RENDER ORDER ITEMS (expanded detail view) ──
  const renderOrderItems = (order) => {
    return (
      <>
        {order.items.map((it,iIdx)=>{
          const selectedSupplier = findOrderSupplier(it.co);
          const supplierPhoneForItem = selectedSupplier?.phone || supplierPhone(it);
          const itemLocked = it.status==="delivered" || it.status==="cancelled";
          const canEditProc = !itemLocked;
          return (
            <div key={iIdx} style={s.oiCard}>
              <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary, marginBottom:6 }}>
                {iIdx+1}. {it.name}
                {it.code&&<span style={{ fontSize:11, color:"#71717a", marginLeft:6 }}>📋 {it.code}</span>}
                {it.brand&&<span style={{ fontSize:11, color:"#71717a", marginLeft:6 }}>🏷️ {it.brand}</span>}
                <span style={{ fontSize:11, color:"#71717a", marginLeft:6 }}>{it.qty} {it.unit}</span>
              </div>
              {it.purchaseInvoiceNo&&(
                <div style={{ fontSize:11, color:"#22c55e", marginBottom:6 }}>
                  🧾 {lang==="bn"?"Purchase":"Purchase"} {it.purchaseInvoiceNo}{it.supplierInvoiceNo?` · ${lang==="bn"?"সাপ্লায়ার বিল":"Supplier bill"} ${it.supplierInvoiceNo}`:""}
                </div>
              )}
              {(isOwner||can("manageCompanies"))&&(
                <div>
                  <OrderSupplierPicker
                    s={s}
                    th={th}
                    selectedSupplier={selectedSupplier}
                    selectedSupplierId={it.co}
                    canEdit={canEditProc}
                    placeholder={lang==="bn"?"ভেন্ডর নাম বা নম্বর দিয়ে খুঁজুন":"Search vendor by name or number"}
                    onClear={()=>setCo(order.id,iIdx,"")}
                    onOpen={()=>openOrderSupplierPicker(order.id,iIdx,selectedSupplier)}
                  />
                  {supplierPhoneForItem&&(
                    <div style={{ fontSize:11, color:"#22c55e", marginTop:4 }}>
                      WhatsApp: +{supplierPhoneForItem}
                    </div>
                  )}
                  {selectedSupplier&&!selectedSupplier.phone&&canEditProc&&(
                    <input
                      style={{ ...s.inp, marginTop:6 }}
                      inputMode="tel"
                      defaultValue={it.supplierPhone || ""}
                      placeholder={lang==="bn"?"WhatsApp নম্বর দিন":"Enter WhatsApp number"}
                      onBlur={e=>saveSupplierPhone(order.id,iIdx,e.target.value)}
                    />
                  )}
                </div>
              )}
              {(isOwner||can("setPrices"))&&(
                <PriceCell
                  initialValue={it.price ?? ""}
                  disabled={!canEditProc}
                  placeholder={t.price}
                  onOpen={() => openPriceEditor(order.id, iIdx, it.price ?? "")}
                />
              )}
              {(isOwner||can("setStatus"))&&(
                <div style={s.sRow}>
                  {it.status==="out_of_stock" && !itemLocked && order.overall!=="cancelled" ? (
                    <button style={{ ...s.stBtn, flex:1, background:"#1d4ed8", color:"#fff", border:"1px solid #1d4ed8" }}
                      onClick={()=>setItemStatus(order.id,iIdx,"order_confirmed")}>
                      🔁 {lang==="bn"?"আবার চেক":"Recheck"}
                    </button>
                  ) : canEditProc && (
                    <>
                      <button style={{ ...s.stBtn, ...(it.status==="order_confirmed"?s.stBtnC:{}) }}
                        onClick={()=>setItemStatus(order.id,iIdx,"order_confirmed")}>{t.confirmed}</button>
                      <button style={{ ...s.stBtn, ...(it.status==="out_of_stock"?s.stBtnN:{}) }}
                        onClick={()=>setItemStatus(order.id,iIdx,"out_of_stock")}>{t.noStock}</button>
                    </>
                  )}
                </div>
              )}
              {(isSalesman&&order.createdBy===user.uid&&it.status==="out_for_branch")&&(
                <div style={{ marginTop:8 }}>
                  <button style={s.delBtn} onClick={()=>deliverItem(order.id,iIdx)}>🚚 {t.deliver}</button>
                </div>
              )}
              {(isSalesman&&can("markDelivery")&&order.createdBy!==user.uid&&it.status==="out_for_branch")&&(
                <div style={{ marginTop:8 }}>
                  <button style={s.delBtn} onClick={()=>deliverItem(order.id,iIdx)}>🚚 {t.deliver}</button>
                </div>
              )}
            </div>
          );
        })}
        {/* ── Grouped WA buttons per company ── */}
        {(isOwner||can("manageCompanies"))&&(()=>{
          const groups = {};
          order.items.forEach(it => {
            if (!it.co || it.status==="cancelled") return;
            const co = findOrderSupplier(it.co);
            const phone = co?.phone || supplierPhone(it);
            if (!co || !phone) return;
            const supplierForMessage = { ...co, phone };
            if (!groups[it.co]) groups[it.co] = { co, items:[] };
            groups[it.co].co = supplierForMessage;
            groups[it.co].items.push(it);
          });
          const entries = Object.values(groups);
          if (!entries.length) return null;
          return (
            <div style={{ marginTop:10, marginBottom:4 }}>
              <div style={{ fontSize:10, color:"#71717a", textTransform:"uppercase", letterSpacing:0, fontWeight:700, marginBottom:6 }}>
                {lang==="bn"?"💬 WhatsApp-এ পাঠান":"💬 Send via WhatsApp"}
              </div>
              {entries.map(({co, items})=>(
                <a key={co.id} href={waLinkGroup(co.phone, items)} target="_blank" rel="noreferrer"
                  style={{ ...s.waBtn, display:"flex", justifyContent:"space-between", marginBottom:7, textDecoration:"none", borderRadius:10 }}>
                  <span>💬 {co.name}</span>
                  <span style={{ opacity:0.8, fontSize:11 }}>{items.length} {lang==="bn"?"টি পণ্য":"items"}</span>
                </a>
              ))}
            </div>
          );
        })()}
        {(isOwner||can("setStatus"))&&order.overall!=="cancelled"&&(
          <div style={{ marginTop:10 }}>
            <div style={{ fontSize:11, color:"#71717a", marginBottom:8, textTransform:"uppercase", letterSpacing:0, fontWeight:700 }}>
              {lang==="bn"?"স্ট্যাটাস আপডেট করুন":"Update Status"}
            </div>
            {order.overall==="pending"&&(
              <button style={{ ...s.flowBtn, background:"#052e16", color:"#22c55e", border:"1px solid #22c55e" }}
                onClick={()=>setOrderStatus(order.id,"order_confirmed")}>
                ✅ {lang==="bn"?"অর্ডার গ্রহণ করুন":"Confirm Order"}
              </button>
            )}
            {order.overall==="order_confirmed"&&(
              <button style={{ ...s.flowBtn, background:"#083344", color:"#06b6d4", border:"1px solid #06b6d4" }}
                onClick={()=>setOrderStatus(order.id,"ordered_supplier")}>
                📦 {lang==="bn"?"কোম্পানিকে জানানো হয়েছে":"Ordered to Supplier"}
              </button>
            )}
            {order.overall==="ordered_supplier"&&(
              <button style={{ ...s.flowBtn, background:"#431407", color:"#f97316", border:"1px solid #f97316" }}
                onClick={()=>setOrderStatus(order.id,"waiting_delivery")}>
                ⏳ {lang==="bn"?"মাল আসার অপেক্ষায়":"Waiting for Delivery"}
              </button>
            )}
            {order.overall==="waiting_delivery"&&(
              <button style={{ ...s.flowBtn, background:"#2e1065", color:"#a855f7", border:"1px solid #a855f7" }}
                onClick={()=>setOrderStatus(order.id,"arrived_main_shop")}>
                🏪 {lang==="bn"?"মেইন শপে এসেছে":"Arrived at Main Shop"}
              </button>
            )}
            {order.overall==="arrived_main_shop"&&(
              <button style={{ ...s.flowBtn, background:"#083344", color:"#06b6d4", border:"1px solid #06b6d4" }}
                onClick={()=>setOrderStatus(order.id,"out_for_branch")}>
                🚚 {lang==="bn"?"ব্রাঞ্চে পাঠানো হচ্ছে":"Out for Branch"}
              </button>
            )}
            {order.overall==="out_for_branch"&&(
              <div style={{ fontSize:12, color:"#71717a", textAlign:"center", padding:"10px 0" }}>
                {lang==="bn"
                  ? "⏳ সেলসম্যান মাল বুঝে পাওয়ার পর ডেলিভারি সম্পন্ন হবে"
                  : "⏳ Waiting for salesman to confirm receipt"}
              </div>
            )}
            {order.overall==="delivered"&&order.items.some(it=>it.status==="order_confirmed")&&(
              <div style={{ background:th.accentDim, border:"1px solid #f97316", borderRadius:10, padding:"10px 12px", marginBottom:6 }}>
                <div style={{ fontSize:12, color:"#f97316", fontWeight:700, marginBottom:8 }}>
                  🔁 {lang==="bn"?"No Stock আইটেম Recheck করা হয়েছে — আবার অর্ডার করুন":"No-stock items rechecked — re-order below"}
                </div>
                <button style={{ ...s.flowBtn, background:"#083344", color:"#06b6d4", border:"1px solid #06b6d4", marginBottom:0 }}
                  onClick={()=>setOrderStatus(order.id,"ordered_supplier")}>
                  📦 {lang==="bn"?"কোম্পানিকে জানানো হয়েছে":"Ordered to Supplier"}
                </button>
              </div>
            )}
          </div>
        )}
        {can("deleteOrder")&&(
          <button style={s.delOrderBtn} onClick={()=>delOrder(order.id)}>🗑️ {t.delOrder}</button>
        )}
      </>
    );
  };

  // ── ORDER CARD ──
  const OrderCard = ({ order, showSenderName }) => {
    const isMyOrder = order.createdBy === user.uid;
    const isCancelled = order.overall === "cancelled";
    const canCancel = (isOwner || isMyOrder) && !isCancelled && order.overall === "pending";
    const orderAge = Date.now() - (order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt)).getTime();
    const canEditOrder = isSalesman && isMyOrder && order.overall === "pending" && orderAge < 60 * 60 * 1000;
    const canExpandThis = canExpand;
    return (
      <div style={{ ...s.card, cursor:canExpandThis?"pointer":"default", opacity:isCancelled?0.6:1 }}
        onClick={() => { if (!canExpandThis) return; markRead(order.id); setSelOrder(selOrder===order.id?null:order.id); }}>
        <div style={s.oHdr}>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span style={s.oId}>Order #{getOrderDisplayNo(order)}</span>
            {!order.read&&(isOwner||isOrderManager)&&<span style={s.nBadge}>{t.newTag}</span>}
            {isSalesman&&order.items?.some(it=>it.status==="out_for_branch")&&<span style={s.nBadge}>{t.newTag}</span>}
          </div>
          <div style={{ display:"flex", gap:7, alignItems:"center" }}>
            <span style={{ color:"#6b7280", fontSize:11 }}>{(() => {
  const raw = order.createdAt || order.createdAtIso || Date.now();
  const d = raw?.toDate?.() || (raw instanceof Date ? raw : new Date(raw));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString();
})()}</span>
            <span style={{ ...s.sBadge, color:SC[order.overall]?.color||"#71717a", background:SC[order.overall]?.bg||"#18181b" }}>{t.status[order.overall]}</span>
          </div>
        </div>
        <div style={{ fontSize:12, color:"#71717a" }}>
          {order.items.length}{t.items}
          {showSenderName&&order.createdByName&&` · 👨‍💼 ${order.createdByName}`}
          {order.note&&` · ${order.note}`}
        </div>
        {order.items.map((it,x)=>(
          <div key={x} style={s.iSum}>
            <div style={{ flex:1, minWidth:120 }}>
              <div style={s.iName}>{it.name}</div>
              {(it.code||it.brand)&&(
                <div style={s.iMeta}>
                  {it.code&&<span>📋 {it.code}</span>}
                  {it.code&&it.brand&&<span> · </span>}
                  {it.brand&&<span>🏷️ {it.brand}</span>}
                </div>
              )}
            </div>
            <span style={s.iQty}>{it.qty} {it.unit}</span>
            {it.price&&<span style={s.iPrice}>{t.cur} {it.price}</span>}
            <span style={{ fontSize:11, fontWeight:700, color:SC[it.status]?.color||SC[order.overall]?.color }}>{t.status[it.status]||t.status[order.overall]}</span>
          </div>
        ))}
        {(canCancel||canEditOrder)&&(
          <div style={{ display:"flex", gap:6, marginTop:8 }}>
            {canEditOrder&&(
              <button
                style={{ ...s.delOrderBtn, flex:1, borderColor:"#1d4ed8", color:"#60a5fa" }}
                onClick={e=>{ e.stopPropagation(); startEditOrder(order); }}>
                ✏️ {lang==="bn"?"অর্ডার এডিট করুন":"Edit Order"}
              </button>
            )}
            {canCancel&&(
              <button
                style={{ ...s.delOrderBtn, flex:1, borderColor:"#713f12", color:"#f59e0b" }}
                onClick={e=>{ e.stopPropagation(); cancelOrder(order.id); }}>
                🚫 {lang==="bn"?"বাতিল করুন":"Cancel Order"}
              </button>
            )}
          </div>
        )}
        {selOrder===order.id&&canExpandThis&&(
          <div
            onClick={e=>e.stopPropagation()}
            onMouseDown={e=>e.stopPropagation()}
            onPointerDown={e=>e.stopPropagation()}
            onTouchStart={e=>e.stopPropagation()}
            style={{ cursor:"default" }}>
            <div style={s.div} />
            {renderOrderItems(order)}
          </div>
        )}
      </div>
    );
  };

  // ── TAB CONTENT ──
  const ownerLockedPanel = (what) => (
    <div style={isDesktop?s.desktopPanel:s.panel}>
      <div style={{ ...s.card, textAlign:"center", padding:"36px 18px" }}>
        <div style={{ fontSize:42, marginBottom:8 }}>🔒</div>
        <div style={{ fontSize:16, fontWeight:800, color:th.txtPrimary, marginBottom:6 }}>{what}</div>
        <div style={{ fontSize:13, color:th.txtMuted, marginBottom:16 }}>{lang==="bn"?"দেখতে মালিকের পিন দিন":"Enter the owner PIN to view"}</div>
        <button onClick={()=>setPinModal("unlock")} style={{ padding:"11px 22px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#2563eb,#1d4ed8)", color:"#fff", fontSize:14, fontWeight:800, cursor:"pointer", fontFamily:"inherit" }}>🔓 {lang==="bn"?"পিন দিয়ে খুলুন":"Unlock with PIN"}</button>
      </div>
    </div>
  );

  const tabContent = (
    <>
      {pinModal&&isOwner&&(
        <OwnerPinModal lang={lang} uid={user.uid} localUserId={profile.localUserId} initialMode={pinModal}
          onUnlocked={()=>{ setOwnerUnlocked(true); setPinModal(null); toast(lang==="bn"?"🔓 খোলা হয়েছে":"🔓 Unlocked"); }}
          onClose={()=>setPinModal(null)} />
      )}
      {tab==="dashboard"&&(
        <DashboardTab
          t={t} lang={lang} th={th} s={s}
          profile={profile} userUid={user.uid} localShop={localShop}
          orders={orders} cos={cos} products={products}
          team={team} vendors={vendors} customers={customers}
          isOwner={isOwner} isDesktop={isDesktop}
          setTab={setTab} unread={unread}
          staffQuickNavKeys={staffQuickNavKeys}
          canUseBranchTransfer={canUseBranchTransfer}
          btInbox={btInbox}
          orderModuleEnabled={orderModuleEnabled}
          finance={finance}
          moneyLocked={isOwner&&!ownerUnlocked}
          onUnlockMoney={()=>setPinModal("unlock")}
          onLockMoney={()=>setOwnerUnlocked(false)}
          toast={toast}
          onOpenMenu={()=>setMenuOpen(true)}
          globalSearchCan={globalSearchCan}
          onGlobalSearchNavigate={handleGlobalSearchNavigate}
          globalSearchCur={t.cur || localShop?.currency || "AED"}
          globalSearchCanSeeCost={canSeeProductCost}
        />
      )}
      {tab==="dashboard"&&(isOwner||can("viewProducts"))&&(
        <ReorderAlertCard
          products={products} shopId={shopId} lang={lang} s={s}
          wrapStyle={isDesktop?s.desktopPanel:s.panel}
          onOpenProducts={()=>setTab("products")}
        />
      )}
      {!isOwner&&orderModuleEnabled&&tab==="shop"&&(
        <div style={isDesktop?s.desktopPanel:s.panel}>
          {can("sendOrder")&&(
            <>
              <div style={s.secTitle}>{t.newOrder}</div>

              {/* ── ITEM ENTRY FORM ── */}
              <div style={{ ...s.card, border:"1px solid #3f3f46" }}>
                <div style={{ marginBottom:8 }}>
                  <ProductTypeaheadInput
                    products={products}
                    value={currentItem.name}
                    onChange={(value)=>updCurrentItem("name", value)}
                    onSelectProduct={selectProductToOrder}
                    field="name"
                    inputRef={nameRef}
                    placeholder={t.itemName}
                    th={th}
                    lang={lang}
                    onKeyDown={handleEnterAdd}
                    style={{ ...s.inp, fontSize:15, fontWeight:600 }}
                  />
                </div>
                <div style={{ display:"flex", gap:7, marginBottom:8 }}>
                  <ProductTypeaheadInput
                    products={products}
                    value={currentItem.code}
                    onChange={(value)=>updCurrentItem("code", value)}
                    onSelectProduct={selectProductToOrder}
                    field="code"
                    placeholder={lang==="bn"?"Code / Model":"Code / Model"}
                    th={th}
                    lang={lang}
                    onKeyDown={handleEnterAdd}
                    style={{ ...s.inp, flex:1 }}
                  />
                  <input style={{ ...s.inp, flex:1 }} placeholder={t.brand}
                    value={currentItem.brand}
                    onChange={e=>updCurrentItem("brand",e.target.value)}
                    onKeyDown={handleEnterAdd}
                  />
                </div>
                <div style={{ display:"flex", gap:7, marginBottom:10 }}>
                  <input
                    style={{ ...s.inp, flex:2 }}
                    placeholder={t.qty}
                    inputMode="numeric"
                    value={currentItem.qty}
                    onChange={e=>updCurrentItem("qty",e.target.value)}
                    onKeyDown={handleEnterAdd}
                  />
                  <select style={{ ...s.sel, flex:1 }} value={currentItem.unit}
                    onChange={e=>updCurrentItem("unit",e.target.value)}>
                    <option value="Pcs">{t.unitPcs}</option>
                    <option value="Set">{t.unitSet}</option>
                  </select>
                </div>
                <button style={s.addInvoiceBtn} onClick={addItToInvoice}>
                  {t.addItem}
                </button>
              </div>

              {/* ── INVOICE LIST ── */}
              {items.length > 0 && (
                <div style={{ marginTop:14 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                    <div style={{ ...s.secTitle, margin:0 }}>{t.invoiceList}</div>
                    <span style={{ fontSize:12, color:"#f97316", fontWeight:700, background:th.accentDim, padding:"3px 10px", borderRadius:20 }}>
                      {items.length}{lang==="bn"?"টি":""}
                    </span>
                  </div>
                  <div style={s.invoiceCard}>
                    {/* Header row */}
                    <div style={s.invHeader}>
                      <span style={{ width:22, flexShrink:0 }}>#</span>
                      <span style={{ flex:1 }}>{lang==="bn"?"নাম":"Name"}</span>
                      <span style={{ width:70, textAlign:"center" }}>{lang==="bn"?"কোড":"Code"}</span>
                      <span style={{ width:60, textAlign:"center" }}>{lang==="bn"?"পরিমাণ":"Qty"}</span>
                      <span style={{ width:26, flexShrink:0 }}></span>
                    </div>
                    {/* Item rows */}
                    {items.map((item, idx) => (
                      <div key={item.id} style={s.invRow}>
                        <span style={{ ...s.invSerial, width:22, flexShrink:0 }}>{idx+1}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                            {item.name}
                          </div>
                          {item.brand&&(
                            <div style={{ fontSize:11, color:"#71717a" }}>🏷️ {item.brand}</div>
                          )}
                        </div>
                        <div style={{ width:70, textAlign:"center" }}>
                          {item.code
                            ? <span style={{ fontSize:11, color:"#a1a1aa", fontFamily:"monospace" }}>{item.code}</span>
                            : <span style={{ color:"#3f3f46" }}>—</span>
                          }
                        </div>
                        <div style={{ width:60, textAlign:"center" }}>
                          <span style={{ fontSize:13, fontWeight:700, color:"#f97316" }}>{item.qty}</span>
                          <span style={{ fontSize:10, color:"#71717a", marginLeft:2 }}>{item.unit}</span>
                        </div>
                        <button style={s.invDelBtn} onClick={()=>delIt(item.id)} title="Remove">✕</button>
                      </div>
                    ))}
                  </div>

                  {/* Note + Send */}
                  <textarea style={{ ...s.ta, marginTop:10 }} placeholder={t.noteP} value={note} onChange={e=>setNote(e.target.value)} rows={2} />
                  {editingOrderId&&(
                    <button style={{ ...s.stBtn, marginBottom:6, width:"100%" }} onClick={cancelEditOrder}>
                      ✕ {lang==="bn"?"এডিট বাতিল করুন":"Cancel Edit"}
                    </button>
                  )}
                  <button style={{ ...s.sendBtn, background:editingOrderId?"#0e7490":undefined }} onClick={sendOrder}>
                    {editingOrderId?(lang==="bn"?"✅ অর্ডার আপডেট করুন":"✅ Update Order"):t.sendOrder}
                  </button>
                </div>
              )}

              {/* If no items yet, show empty state hint */}
              {items.length === 0 && (
                <div style={{ textAlign:"center", padding:"18px 0 4px", color:"#52525b", fontSize:12 }}>
                  ↑ {lang==="bn"?"আইটেম যোগ করুন, তারপর অর্ডার পাঠান":"Add items above, then send order"}
                </div>
              )}
            </>
          )}

          {orders.length>0&&(<>
            <div style={{ ...s.secTitle, marginTop:20 }}>{t.sentOrders}</div>
          </>)}
          {orders.length>0&&renderOrderPageTabs()}
          {/* Search box - always visible */}
          {orders.length>0&&(
            <div style={{ position:"relative", marginBottom:12 }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
              <input
                style={{ ...s.inp, paddingLeft:36, background:th.bgCard }}
              placeholder={lang==="bn"?"অর্ডার, পণ্য, কোম্পানি/ভেন্ডর নাম বা নম্বর দিয়ে খুঁজুন...":"Search order, item, company/vendor name or number..."}
                value={searchQ}
                onChange={e=>setSearchQ(e.target.value)}
              />
              {searchQ&&<button onClick={()=>setSearchQ("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#71717a", cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>}
            </div>
          )}
          {/* Daily grouped orders */}
          {(() => {
              const filtered = filterOrdersByStatusPage(filterOrders(orders));
              if (!filtered.length) return (
                <div style={s.empty}><div style={{ fontSize:36 }}>🔍</div><div>{lang==="bn"?"কিছু পাওয়া যায়নি":"No results found"}</div></div>
              );
              const groups = groupByDay(filtered);
              return groups.map(([dateStr, dayOrders]) => (
                <div key={dateStr}>
                  <div style={s.dayHeader}>
                    <span style={s.dayDot} />
                    <span style={s.dayLabel}>📅 {dateStr}</span>
                    <span style={s.dayCount}>{dayOrders.length}{lang==="bn"?"টি অর্ডার":" orders"}</span>
                  </div>
                  {dayOrders.map(o=><OrderCard key={o.id} order={o} showSenderName={isOrderManager} />)}
                </div>
              ));
            })()}
          {orders.length===0&&!can("sendOrder")&&(
            <div style={s.empty}><div style={{ fontSize:42 }}>📭</div><div>{t.noOrders}</div></div>
          )}
        </div>
      )}

      {isOwner&&orderModuleEnabled&&tab==="owner"&&(
        <div style={isDesktop?s.desktopPanel:s.panel}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginBottom:10 }}>
                <div style={s.secTitle}>{lang==="bn"?"📋 সেলসম্যান অর্ডার":"📋 Order to Salesman"}</div>
              </div>
              {orders.length>0&&renderOrderPageTabs()}
              <div style={{ position:"relative", marginBottom:12 }}>
                <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
                <input
                  style={{ ...s.inp, paddingLeft:36, background:th.bgCard }}
                  placeholder={lang==="bn"?"অর্ডার, পণ্য, ভেন্ডর নাম বা নম্বর দিয়ে খুঁজুন...":"Search order, item, vendor name or number..."}
                  value={searchQ}
                  onChange={e=>setSearchQ(e.target.value)}
                />
                {searchQ&&<button onClick={()=>setSearchQ("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#71717a", cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>}
              </div>
              {orders.length===0
                ? <div style={s.empty}><div style={{ fontSize:42 }}>📭</div><div>{t.noOrders}</div></div>
                : (() => {
                    const filtered = filterOrdersByStatusPage(filterOrders(orders));
                    if (!filtered.length) return (
                      <div style={s.empty}><div style={{ fontSize:36 }}>🔍</div><div>{lang==="bn"?"কিছু পাওয়া যায়নি":"No results found"}</div></div>
                    );
                    const groups = groupByDay(filtered);
                    return groups.map(([dateStr, dayOrders]) => (
                      <div key={dateStr}>
                        <div style={s.dayHeader}>
                          <span style={s.dayDot} />
                          <span style={s.dayLabel}>📅 {dateStr}</span>
                          <span style={s.dayCount}>{dayOrders.length}{lang==="bn"?"টি অর্ডার":" orders"}</span>
                        </div>
                        {dayOrders.map(o=><OrderCard key={o.id} order={o} showSenderName={true} />)}
                      </div>
                    ));
                  })()
              }
        </div>
      )}

      {(isOwner||can("viewProducts"))&&(tab==="products"||(pmOverSales&&["sales","quotation","delivery","purchase"].includes(tab)))&&(
        <div data-si-modal-open={pmOverSales ? "" : undefined} style={{
          position:"fixed",
          inset:0,
          zIndex:2000,
          width:"100vw",
          height:"100dvh",
          margin:0,
          padding:0,
          overflow:"auto",
          background:"#adc3e3"
        }}>
          <ProductMasterScreen
            key={shopId || "default-shop"}
            shopId={shopId}
            products={products}
            filteredProducts={filteredProducts}
            productsLoading={productsLoading}
            clearingProducts={clearingProducts}
            companies={cos}
            form={pmForm}
            upd={pmUpd}
            selectedId={pmEditId}
            search={pmSearch}
            onSearchChange={setPmSearch}
            category={pmCatFilter}
            onCategoryChange={setPmCatFilter}
            canDelete={isOwner}
            canEdit={canManageProducts}
            canSeeCost={canSeeProductCost}
            saving={savingProduct}
            onNew={()=>{ if (!confirmPmDiscard()) return; pmReset(); setPmEditId(null); setPmShowAdd(true); }}
            onSave={()=>{ if (pmEditId) editProduct(pmEditId); else addProduct(); }}
            onDelete={()=>{ if (pmEditId) deleteProduct(pmEditId); }}
            onClose={()=>{
              if (!confirmPmDiscard()) return;
              setPmShowAdd(false); setPmEditId(null); pmReset();
              if (pmOverSales) setPmOverSales(false); else setTab("dashboard");
            }}
            onSelectProduct={(p)=>{ if (p.id !== pmEditId && confirmPmDiscard()) startProductEdit(p); }}
            onRefresh={fetchProducts}
            onClearAll={clearAllShopProducts}
            onRemoveBlank={isOwner ? removeBlankProducts : undefined}
            replacementActive={productReplacementActive}
            onFinishReplacement={finishProductReplacement}
            productMaintenanceActive={productMaintenance.active}
            onExport={canSeeProductCost ? ()=>exportProductsCsv(getFilteredProducts()).catch(hErr) : undefined}
            onImportRecords={importProductRecords}
            onGenerateWeighingFile={()=>exportWeighingBarcodeCsv(getFilteredProducts())}
            onPrintBarcodes={printProductBarcodes}
            notify={(message,kind)=>toast(message, kind==="err"?"err":"ok")}
          />
        </div>
      )}

      {orderModuleEnabled&&(isOwner||can("manageCompanies"))&&tab==="companies"&&(
  <div style={isDesktop?s.desktopPanel:s.panel}>

    {isOwner&&(
      <button
        type="button"
        style={{ ...s.stBtn, marginBottom:12, padding:"8px 12px" }}
        onClick={()=>setTab("owner")}
      >
        {lang==="bn"?"← অপশন":"← Options"}
      </button>
    )}

    <div style={{
      display:"flex",
      alignItems:"center",
      justifyContent:"space-between",
      marginBottom:14,
      gap:10,
      flexWrap:"wrap"
    }}>

      <div style={s.secTitle}>
        {t.coList}
      </div>

      <div style={{
        display:"flex",
        gap:10,
        flexWrap:"wrap"
      }}>

        <button
          style={s.addCoBtn}
          onClick={()=>setShowAdd(!showAdd)}
        >
          {showAdd ? `✕ ${t.cancel}` : t.addNew}
        </button>

      </div>

    </div>

    {showAdd&&(
      <div style={{ ...s.card, border:"1px solid #f97316", marginBottom:14 }}>

        <div style={{
          fontSize:13,
          fontWeight:700,
          color:"#f97316",
          marginBottom:10
        }}>
          {t.addCoTitle}
        </div>

        <input
          style={{ ...s.inp, marginBottom:8 }}
          placeholder={t.coName}
          value={newNm}
          onChange={e=>setNewNm(e.target.value)}
        />

        <input
          style={{ ...s.inp, marginBottom:8 }}
          placeholder={t.waNum}
          value={newPh}
          onChange={e=>setNewPh(e.target.value)}
        />

        <div style={{
          fontSize:11,
          color:"#71717a",
          marginBottom:10
        }}>
          {t.waHint}
        </div>

        <div style={s.row}>

          <button
            style={{ ...s.sendBtn, flex:1, padding:"10px" }}
            onClick={addCo}
          >
            {t.addBtn}
          </button>

          <button
            style={{ ...s.stBtn, flex:1 }}
            onClick={()=>{
              setShowAdd(false);
              setNewNm("");
              setNewPh("");
            }}
          >
            {t.cancel}
          </button>

        </div>

      </div>
    )}


    {/* ───────── VENDORS LIST ───────── */}

{false && vendors.length > 0 && (

  <div style={{ marginTop:20 }}>

    <div style={s.secTitle}>
      Vendors
    </div>

    {vendors.map(v => (

      <div
        key={v.id}
        style={s.card}
      >

        <div
          style={{
            display:"flex",
            justifyContent:"space-between",
            gap:12,
            alignItems:"flex-start"
          }}
        >

          <div style={{ flex:1 }}>

            <div
              style={{
                fontSize:16,
                fontWeight:700,
                color:th.txtPrimary,
                marginBottom:4
              }}
            >
              {v.vendorName}
            </div>

            <div
              style={{
                fontSize:12,
                color:"#71717a",
                marginBottom:2
              }}
            >
              Code: {v.vendorCode || "-"}
            </div>

            <div
              style={{
                fontSize:12,
                color:"#71717a",
                marginBottom:2
              }}
            >
              📱 {v.mobileNumber || "-"}
            </div>

            <div
              style={{
                fontSize:12,
                color:"#71717a",
                marginBottom:2
              }}
            >
              ✉️ {v.email || "-"}
            </div>

            <div
              style={{
                fontSize:12,
                color:"#71717a"
              }}
            >
              🏢 {v.address || "-"}
            </div>

          </div>

          <div
            style={{
              display:"flex",
              gap:6
            }}
          >

            {v.mobileNumber && (

              <a
                href={`https://wa.me/${v.mobileNumber}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...s.waBtn,
                  padding:"6px 10px"
                }}
              >
                💬
              </a>

            )}

          </div>

        </div>

      </div>

    ))}

  </div>

)}


    
          {cos.length===0&&<div style={s.empty}><div style={{ fontSize:38 }}>🏢</div><div>{t.noCo}</div></div>}
          {cos.map(c=>(
            <div key={c.id} style={s.card}>
              {editId===c.id?(
                <div>
                  <div style={{ fontSize:12, color:"#f97316", fontWeight:700, marginBottom:10 }}>{t.editTitle}</div>
                  <input style={{ ...s.inp, marginBottom:8 }} value={editNm} onChange={e=>setEditNm(e.target.value)} />
                  <input style={{ ...s.inp, marginBottom:10 }} value={editPh} onChange={e=>setEditPh(e.target.value)} />
                  <div style={s.row}>
                    <button style={{ ...s.savBtn, flex:1, padding:"10px" }} onClick={()=>saveEdit(c.id)}>{t.saveEdit}</button>
                    <button style={{ ...s.stBtn, flex:1 }} onClick={cancelEdit}>{t.cancel}</button>
                  </div>
                </div>
              ):(
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={s.coIcon}>🏢</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:th.txtPrimary }}>{c.name}</div>
                    <div style={{ fontSize:12, color:"#71717a", marginTop:2 }}>{c.phone?`📱 +${c.phone}`:t.noPhone}</div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    {c.phone&&<a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" style={{ ...s.waBtn, padding:"6px 10px" }}>💬</a>}
                    <button style={s.edBtn} onClick={()=>startEdit(c)}>✏️</button>
                    <button style={s.dlBtn} onClick={()=>delCo(c.id)}>🗑️</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}


      {/* ───────── VENDOR MODAL ───────── */}

{false && showVendorModal && (

  <div style={s.modalOverlay}>

    <div style={s.vendorModal}>

      <div style={s.vendorHeader}>

        <div style={s.vendorTitle}>
  Create Vendor
</div>

<button
  style={s.modalCloseBtn}
  onClick={() => setShowVendorModal(false)}
>
  ✕
</button>
      </div>

      <div style={s.vendorGrid}>

        <input
          style={s.inp}
          placeholder="Vendor Name"
          value={vendorForm.vendorName}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              vendorName: e.target.value
            })
          }
        />

        <input
          style={{ ...s.inp, opacity:0.75, cursor:"not-allowed" }}
          placeholder="Vendor Code (auto)"
          value={vendorForm.vendorCode}
          readOnly
          tabIndex={-1}
        />

        <input
          style={s.inp}
          placeholder="Contact Person"
          value={vendorForm.contactPerson}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              contactPerson: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="Mobile Number"
          value={vendorForm.mobileNumber}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              mobileNumber: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="Phone Number"
          value={vendorForm.phoneNumber}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              phoneNumber: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="WhatsApp Number"
          value={vendorForm.whatsappNumber}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              whatsappNumber: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="Email"
          value={vendorForm.email}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              email: e.target.value
            })
          }
        />

        <AutoTA
          style={s.ta}
          placeholder="Address"
          value={vendorForm.address}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              address: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="Area"
          value={vendorForm.area}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              area: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="City"
          value={vendorForm.city}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              city: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="Trade License"
          value={vendorForm.tradeLicenseNumber}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              tradeLicenseNumber: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="TIN Number"
          value={vendorForm.tinNumber}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              tinNumber: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="BIN Number"
          value={vendorForm.binNumber}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              binNumber: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="VAT Number"
          value={vendorForm.vatNumber}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              vatNumber: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="Bank Name"
          value={vendorForm.bankName}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              bankName: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="Bank Branch"
          value={vendorForm.bankBranch}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              bankBranch: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="Account Name"
          value={vendorForm.accountName}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              accountName: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="Account Number"
          value={vendorForm.accountNumber}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              accountNumber: e.target.value
            })
          }
        />

        <input
          style={s.inp}
          placeholder="Credit Limit"
          value={vendorForm.creditLimit}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              creditLimit: e.target.value
            })
          }
        />

        <AutoTA
          style={s.ta}
          placeholder="Notes"
          value={vendorForm.notes}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              notes: e.target.value
            })
          }
        />

      </div>

      <div style={s.vendorFooter}>

        <button
          style={s.stBtn}
          onClick={() => setShowVendorModal(false)}
        >
          Cancel
        </button>

        <button
          style={s.sendBtn}
          onClick={saveVendor}
        >
          Save Vendor
        </button>

      </div>

    </div>

  </div>

)}
      {isOwner&&tab==="customers"&&(
        <CustomerMasterScreen
          t={t} lang={lang} cur={t.cur||"AED"}
          shopId={shopId} user={user}
          customers={customers} team={team} toast={toast}
          canEdit canDelete canSales
          actorName={profile?.personName||""}
          leaveGuard={billLeaveGuard}
          focusPartyId={globalFocusCustomerId}
          onFocusPartyHandled={()=>setGlobalFocusCustomerId(null)}
          onPartySaved={(row)=>setCustomers((prev)=>mergePartyRow(prev, row, "customerName"))}
          onPartyRemoved={(id)=>setCustomers((prev)=>prev.filter((c)=>c.id!==id))}
          onClose={()=>setTab("dashboard")}
          nextCode={()=>nextPartyCode(shopId, "customers", customers)}
          onGoToSales={(customer)=>{
            if (tabRef.current !== "sales" && billLeaveGuard.current && !billLeaveGuard.current.leave()) return;
            setTabState("sales");
            setSiNewCustomer(customer||null);
            setSiNewReq(Date.now());
          }}
          renderImport={(close)=>(
            <ExcelImportModal t={t} lang={lang} th={th} shopId={shopId} user={user}
              type="customer" columnMap={CM_IMPORT_COLUMNS} defaultFields={{ ...EMPTY_CUSTOMER, customerType:"Customer", status:"active", country:"UAE", paymentType:"cash" }}
              collection="customers"
              onClose={close}
              onImported={(n)=>{ close(); toast(`✅ ${n} ${lang==="bn"?"জন কাস্টমার ইমপোর্ট হয়েছে":"customers imported!"}`); reloadCustomersFromOffline(); }} />
          )}
        />
      )}

      {(isOwner || can("viewVendors") || can("manageVendors"))&&tab==="vendors"&&(
        <VendorMasterScreen
          t={t} lang={lang} cur={t.cur||"AED"}
          shopId={shopId} user={user}
          vendors={vendors} toast={toast} canDelete={isOwner} canEdit={isOwner||can("manageVendors")}
          leaveGuard={billLeaveGuard}
          focusPartyId={globalFocusVendorId}
          onFocusPartyHandled={()=>setGlobalFocusVendorId(null)}
          onPartySaved={(row)=>setVendors((prev)=>mergePartyRow(prev, row, "vendorName"))}
          onPartyRemoved={(id)=>setVendors((prev)=>prev.filter((v)=>v.id!==id))}
          onClose={()=>setTab("dashboard")}
          nextCode={()=>nextPartyCode(shopId, "vendors", vendors)}
          canPurchase={isOwner||can("managePurchase")}
          actorName={profile?.personName||""}
          onGoToPurchase={(isOwner||can("managePurchase")) ? (vendor)=>{
            if (tabRef.current !== "purchase" && billLeaveGuard.current && !billLeaveGuard.current.leave()) return;
            setTabState("purchase");
            setPiNewVendor(vendor||null);
            setPiNewReq(Date.now());
          } : undefined}
          renderImport={(close)=>(
            <ExcelImportModal t={t} lang={lang} th={th} shopId={shopId} user={user}
              type="vendor" columnMap={VM_IMPORT_COLUMNS} defaultFields={{ ...emptyVendor, status:"active", country:"UAE" }}
              collection="vendors"
              onClose={close}
              onImported={(n)=>{ close(); toast(`✅ ${n} ${lang==="bn"?"জন ভেন্ডর ইমপোর্ট হয়েছে":"vendors imported!"}`); reloadVendorsFromOffline(); }} />
          )}
        />
      )}

      {tab==="purchase"&&canStaffSupplierArea&&(
        <PurchaseInvoiceTab
          t={t} lang={lang} th={th} s={s}
          shopId={shopId} user={user} profile={profile}
          vendors={vendors} products={products}
          shop={localShop} toast={toast} isDesktop={isDesktop} wideDesktop={windowWidth >= 1100}
          onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))}
          syncRefreshKey={syncRefreshKey}
          onOpenProductMaster={canManageProducts ? (name) => {
            loadPmForm({ ...createEmptyPmForm(), ...(name ? { name } : {}) });
            setPmEditId(null); setPmShowAdd(true); setPmOverSales(true);
          } : undefined}
          productFromMaster={pmPickForSales}
          onOpenChequePrinter={(isOwner||can("printCheques")) ? (p)=>{ setChequePrefill({ ...p, at:Date.now() }); setTab("cheque"); } : undefined}
          chequeHandoverRequest={chequeHandoverReq}
          onChequeHandoverHandled={()=>setChequeHandoverReq(null)}
          openNewRequest={piNewReq}
          openNewVendor={piNewVendor}
          onOpenNewHandled={()=>{ setPiNewReq(0); setPiNewVendor(null); }}
          voucherRequest={piVoucherReq}
          onVoucherHandled={()=>setPiVoucherReq(0)}
          purchaseSource={purchaseSource}
          onPurchaseSourceHandled={()=>setPurchaseSource(null)}
          openInvoiceId={globalOpenPurchaseInvoiceId}
          onOpenInvoiceHandled={()=>setGlobalOpenPurchaseInvoiceId(null)}
          onProductPatched={patchProductInList}
        />
      )}

      {(tab==="purchaseOrder"||tab==="goodsReceipt")&&(isOwner||can("managePurchase"))&&(
        <PurchaseDocsTab key={tab} kind={tab==="purchaseOrder"?"po":"grn"} lang={lang} shopId={shopId} user={user} profile={profile}
          isOwner={isOwner} canManage={isOwner||can("managePurchase")} products={products} vendors={vendors} toast={toast}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} makeNo={makeShopNo} leaveGuard={billLeaveGuard}
          incoming={tab==="goodsReceipt"?grnIncoming:null} onIncomingHandled={()=>setGrnIncoming(null)}
          onMakePurchase={(k,doc,lines)=>{ setPurchaseSource({ kind:k, doc, lines, at:Date.now() }); setTabState("purchase"); }}
          onMakeReceipt={(doc,lines)=>{ setGrnIncoming({ doc, lines, at:Date.now() }); setTabState("goodsReceipt"); }} />
      )}

      {tab==="purchase"&&!canStaffSupplierArea&&(
        <div style={isDesktop?s.desktopPanel:s.panel}>
          <PiSalesmanView t={t} lang={lang} th={th} shopId={shopId} syncRefreshKey={syncRefreshKey} showCost={isOwner||canSeeProductCost} />
        </div>
      )}

      {(isOwner || can("manageSales")) && ["sales","quotation","delivery","salesOrder"].includes(tab)&&(
        <SalesInvoiceTab
          key={tab}
          kind={tab}
          quoteToConvert={tab==="sales"||tab==="delivery" ? quoteToConvert : null}
          onConvertQuote={(q)=>{ setQuoteToConvert(q); setTabState("sales"); }}
          onConvertToDN={(q)=>{ setQuoteToConvert(q); setTabState("delivery"); }}
          onQuoteConvertHandled={()=>setQuoteToConvert(null)}
          openNewRequest={tab==="sales" ? siNewReq : 0}
          openNewCustomer={siNewCustomer}
          onOpenNewHandled={()=>{ setSiNewReq(0); setSiNewCustomer(null); }}
          voucherRequest={tab==="sales" ? siVoucherReq : 0}
          onVoucherHandled={()=>setSiVoucherReq(0)}
          openInvoiceId={tab === "sales" ? globalOpenSalesInvoiceId : null}
          onOpenInvoiceHandled={()=>setGlobalOpenSalesInvoiceId(null)}
          t={t} lang={lang} th={th} s={s}
          shopId={shopId} user={user} profile={profile}
          customers={customers} products={products}
          shop={localShop} toast={toast} isDesktop={isDesktop} wideDesktop={windowWidth >= 1100}
          siShowCode={siShowCode} siColorPrint={siColorPrint}
          canManageCustomers={can("manageCustomers")}
          syncRefreshKey={syncRefreshKey}
          team={team}
          onOpenProductMaster={canManageProducts ? (name) => {
            loadPmForm({ ...createEmptyPmForm(), ...(name ? { name } : {}) });
            setPmEditId(null); setPmShowAdd(true); setPmOverSales(true);
          } : undefined}
          productFromMaster={pmPickForSales}
          onCustomerCreated={(created) => setCustomers((prev) => [...prev, created].sort((a,b)=>(a.customerName||"").localeCompare(b.customerName||"")))}
        />
      )}


      {tab==="cheque"&&(isOwner||can("printCheques"))&&(
        <ChequePrinterTab
          t={t} lang={lang} th={th} s={s}
          isDesktop={isDesktop}
          shopName={localShop?.companyName||""}
          shopAccount={localShop?.accountNumber||""}
          shopIban={localShop?.ibanNumber||""}
          shopId={shopId} user={user} shop={localShop}
          syncRefreshKey={syncRefreshKey}
          prefill={chequePrefill}
          onPrefillDone={()=>setChequePrefill(null)}
          onOpenHandover={canStaffSupplierArea&&(isOwner||can("vendorPayments")) ? (v)=>{ setChequeHandoverReq({ ...v, at:Date.now() }); setTab("purchase"); } : undefined}
          foldersVisible={isOwner&&ownerUnlocked}
          onUnlockFolders={isOwner ? ()=>setPinModal("unlock") : undefined}
          onLockFolders={isOwner ? ()=>setOwnerUnlocked(false) : undefined}
        />
      )}

      {tab==="pdc"&&(isOwner||can("managePdc"))&&(
        <PdcWindow inline lang={lang} cur={t.cur||"AED"} shopId={shopId} userId={user?.uid||""}
          shopName={localShop?.companyName||""}
          onOpenVoucher={(raw)=>printPaymentVoucher(raw, localShop, lang)} />
      )}

      {(tab==="expenses"||tab==="employeeExpense")&&(isOwner||can("manageExpenses"))&&(
        <ExpensesTab key={tab} employeeMode={tab==="employeeExpense"} lang={lang} th={th} s={s} shopId={shopId} user={user} profile={profile} isOwner={isOwner}
          cur={t.cur||"AED"} isDesktop={isDesktop} toast={toast} shopName={localShop?.companyName||""} leaveGuard={billLeaveGuard} shop={localShop} />
      )}

      {tab==="employees"&&(isOwner||can("manageEmployees"))&&(
        <EmployeesTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner} canManage={isOwner||can("manageEmployees")}
          cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""} shop={localShop} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} leaveGuard={billLeaveGuard}
          alerts={employeeAlertList} focus={empFocus} onFocusHandled={()=>setEmpFocus(null)} onOpenAlert={openEmployeeAlert} />
      )}

      {tab==="jobCard"&&(isOwner||can("manageJobs"))&&(
        <JobCardTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner} canManage={isOwner||can("manageJobs")}
          cur={t.cur||"AED"} toast={toast} shop={localShop} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))}
          customers={customers} products={products} makeNo={makeShopNo} leaveGuard={billLeaveGuard}
          onMakeInvoice={(isOwner||can("manageSales")) ? (src)=>{ setQuoteToConvert(src); setTabState("sales"); } : undefined} />
      )}

      {tab==="bankRec"&&(isOwner||can("bankReconcile"))&&(
        <BankRecTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner} canManage={isOwner||can("bankReconcile")}
          cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""} />
      )}

      {tab==="attendance"&&(isOwner||can("manageEmployees"))&&(
        <AttendanceTab lang={lang} shopId={shopId} user={user} profile={profile} canManage={isOwner||can("manageEmployees")}
          cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""} leaveGuard={billLeaveGuard} />
      )}

      {tab==="vouchers"&&(isOwner||canStaffVouchers)&&(
        <VouchersTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner}
          canJournal={isOwner||can("accountVouchers")} cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""}
          makeNo={makeShopNo} leaveGuard={billLeaveGuard} customers={customers} vendors={vendors} banks={UAE_BANKS.map(b=>b.name)}
          onOpenReceipts={(isOwner||can("manageSales")) ? ()=>{ setTab("sales"); setSiVoucherReq(Date.now()); } : undefined}
          onOpenPayments={canStaffSupplierArea&&(isOwner||can("vendorPayments")) ? ()=>{ setTab("purchase"); setPiVoucherReq(Date.now()); } : undefined}
          onOpenDebitNote={(isOwner||can("manageReturns")) ? ()=>setTab("purchaseReturn") : undefined}
          onOpenCreditNote={(isOwner||can("manageReturns")) ? ()=>setTab("salesReturn") : undefined} />
      )}

      {(tab==="salesReturn"||tab==="purchaseReturn")&&(isOwner||can("manageReturns"))&&(
        <ReturnsTab key={tab} kind={tab==="salesReturn"?"sales":"purchase"} lang={lang} th={th} shopId={shopId} user={user} profile={profile}
          isOwner={isOwner} canManage={isOwner||can("manageReturns")} cur={t.cur||"AED"} isDesktop={isDesktop} toast={toast}
          shopName={localShop?.companyName||""} makeNo={makeShopNo} leaveGuard={billLeaveGuard} />
      )}

      {tab==="stockAdjust"&&(isOwner||can("stockAdjust"))&&(
        <StockAdjustmentTab lang={lang} th={th} shopId={shopId} user={user} profile={profile} products={products}
          isOwner={isOwner} canManage={isOwner||can("stockAdjust")} isDesktop={isDesktop} toast={toast}
          shopName={localShop?.companyName||""} makeNo={makeShopNo} leaveGuard={billLeaveGuard} />
      )}
      {tab==="reminders"&&(
        <RemindersTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner} team={team} toast={toast} />
      )}
      {tab==="calculator"&&(
        <CalculatorWindow inline lang={lang} baseCurrency={String(localShop?.currency||t.cur||"AED").toUpperCase()} />
      )}
      {calcMode&&tab!=="calculator"&&(
        <CalculatorWindow lang={lang} baseCurrency={String(localShop?.currency||t.cur||"AED").toUpperCase()} initialMode={calcMode} onClose={()=>setCalcMode(null)} />
      )}
      {tab==="labels"&&(isOwner||can("viewProducts"))&&(
        <BarcodeLabelsTab lang={lang} shopId={shopId} user={user} profile={profile} shop={localShop} products={products} toast={toast}
          isOwner={isOwner} cur={t.cur||""} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} />
      )}
      {(tab==="loosen"||tab==="bundle")&&(isOwner||can("stockAdjust"))&&(
        <StockConvertTab key={tab} kind={tab} lang={lang} shopId={shopId} user={user} profile={profile} products={products}
          isOwner={isOwner} canManage={isOwner||can("stockAdjust")} toast={toast}
          shopName={localShop?.companyName||""} makeNo={makeShopNo} leaveGuard={billLeaveGuard} />
      )}

      {tab==="auditLog"&&isOwner&&(
        <AuditLogTab lang={lang} th={th} shopId={shopId} cur={t.cur||"AED"} isDesktop={isDesktop} />
      )}

      {tab==="accounts"&&isOwner&&ownerUnlocked&&(
        <ProfitLossReport lang={lang} th={th} s={s} shopId={shopId} products={products}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} isDesktop={isDesktop} />
      )}
      {tab==="accounts"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"হিসাব নিকাশ (Accounts) লক করা":"Accounts are locked")}
      {tab==="tax"&&isOwner&&ownerUnlocked&&(
        <TaxReport lang={lang} shopId={shopId} shop={localShop} user={user} products={products} customers={customers} vendors={vendors}
          shopName={localShop?.companyName||""} toast={toast} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} />
      )}
      {tab==="tax"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"ট্যাক্স / VAT লক করা":"Tax / VAT is locked")}
      {tab==="partners"&&isOwner&&ownerUnlocked&&(
        <PartnersTab lang={lang} shopId={shopId} user={user} profile={profile} cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""}
          shop={localShop} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} products={products} alerts={partnerAlertList} isOwner={isOwner} />
      )}
      {tab==="partners"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"পার্টনারের হিসাব লক করা":"Partners are locked")}

      {tab==="branchTransfer"&&canUseBranchTransfer&&(
        <BranchTransferWorkspace
          lang={lang}
          shopId={shopId} user={user} profile={profile}
          team={team} products={products} vendors={vendors} shop={localShop}
          settings={branchTransferSettings} toast={toast}
          leaveGuard={billLeaveGuard}
        />
      )}

      {tab==="settings"&&(()=>{
        const bnS = lang==="bn";
        const plain = (v)=>String(v||"").replace(/^[^\p{L}\p{N}]+/u,"");
        const btCopy = isOwner ? branchTransferSettingsCopy(lang, branchTransferSettings.enabled) : null;
        const items = [
          { id:"profile", icon:"👤", label:plain(t.profileTitle), sub:profile.personName },
          isOwner && { id:"period", icon:"📅", label:bnS?"হিসাব বছর বন্ধ / লক":"Accounting period lock", sub:periodLock.lockDate?(bnS?`${periodLock.lockDate} পর্যন্ত বন্ধ`:`Closed up to ${periodLock.lockDate}`):(bnS?"লক নেই — পুরোনো এন্ট্রি বন্ধ করুন":"Not locked — close old entries") },
          isOwner && { id:"pin", icon:"🔒", label:bnS?"মালিকের পিন":"Owner PIN", sub:bnS?"ড্যাশবোর্ডের টাকা, Accounts ও চেক ফোল্ডার — পিন সেট / পরিবর্তন":"Dashboard money, Accounts & cheque folders — set / change PIN", action:()=>setPinModal("reset") },
          localShop && { id:"shop", icon:"🏢", label:plain(t.shopInfoTitle), sub:`${localShop.companyName||""}${!isOwner?(bnS?" · শুধু দেখা":" · View only"):""}` },
          isOwner && { id:"invite", icon:"🔗", label:plain(t.inviteCodeTitle), sub:`${inviteCodes.filter(c=>!c.used).length} ${bnS?"টি active":"active"}` },
          (isOwner || team.length>0) && { id:"team", icon:"👥", label:plain(t.teamTitle), sub:`${team.length} ${bnS?"জন সদস্য":"members"}` },
          isOwner && { id:"groups", icon:"🛡️", label:bnS?"ইউজার গ্রুপ ও অনুমতি":"User groups & privileges", sub:`${userGroups.length} ${bnS?"টি গ্রুপ · দেখা / যোগ / এডিট / বাতিল / প্রিন্ট":"groups · view / add / edit / delete / print"}` },
          isOwner && { id:"orderModule", icon:"🧾", label:"Order Option", sub:orderModuleEnabled?(bnS?"চালু আছে":"Enabled"):(bnS?"বন্ধ আছে":"Disabled") },
          isOwner && { id:"branchTransfer", icon:"🚚", label:btCopy.title, sub:btCopy.subtitle },
          isOwner && { id:"wastyle", icon:"💬", label:"WhatsApp Message Style", sub:WA_STYLES.find(w=>w.id===waStyle)?.[bnS?"labelBn":"labelEn"]||"" },
          { id:"theme", icon:theme==="dark"?"🌙":"☀️", label:bnS?"থিম / রঙ":"Theme", sub:theme==="dark"?(bnS?"ডার্ক মোড":"Dark Mode"):(bnS?"লাইট মোড":"Light Mode") },
          { id:"language", icon:"🌐", label:bnS?"ভাষা":"Language", sub:bnS?"বাংলা":"English" },
          { id:"print", icon:"🖨️", label:bnS?"প্রিন্ট সেটিংস":"Print Settings", sub:bnS?"বিলের ধরন, কাগজের মাপ, কপি, প্রিভিউ":"Bill type, paper size, copies, preview", action:()=>setPrintSettingsOpen(true) },
          { id:"sync", icon:syncState==="connected"?"🟢":syncState==="offline"?"🔴":syncState==="reconnecting"?"🟠":"🟡", label:plain(t.syncStatus), sub:syncState==="connected"?"Online":syncState==="offline"?"Offline":syncState==="reconnecting"?"Reconnecting...":"Connecting..." },
          isOwner && { id:"backup", icon:"💾", label:bnS?"ব্যাকআপ ও রিস্টোর":"Backup & restore", sub:bnS?"Google Drive / কম্পিউটারে দোকানের ডেটার কপি":"Copy of shop data to Google Drive / computer" },
          { id:"license", icon:"🔐", label:bnS?"লাইসেন্স স্ট্যাটাস":"License status", sub:bnS?"ঐচ্ছিক লাইসেন্স অ্যাক্টিভেশন":"Optional license activation" },
          { id:"update", icon:"🔄", label:plain(t.updateTitle), sub:`v${APP_VERSION} · ${t.updateSub}` },
          { id:"help", icon:"❓", label:plain(t.helpTitle), sub:t.helpMenuSub },
        ].filter(Boolean);
        const openItem = (it)=>{ if (it.action) it.action(); else setSettingsPage(it.id); };
        const current = items.find(it=>it.id===stPage);
        const settingGroups = [
          { key:"company", label:bnS?"🏢 অ্যাকাউন্ট ও দোকান":"🏢 Account & Company", ids:["profile","shop","pin","period","license"] },
          { key:"team", label:bnS?"👥 টিম":"👥 Team", ids:["team","groups","invite"] },
          { key:"features", label:bnS?"🧩 ফিচার":"🧩 Features", ids:["orderModule","branchTransfer","wastyle"] },
          { key:"display", label:bnS?"🎨 দেখা ও প্রিন্ট":"🎨 Display & Print", ids:["print","theme","language"] },
          { key:"data", label:bnS?"💾 ডেটা ও সিস্টেম":"💾 Data & System", ids:["backup","sync","update"] },
          { key:"help", label:bnS?"❓ সাহায্য":"❓ Help", ids:["help"] },
        ].map(g=>({ ...g, items:g.ids.map(id=>items.find(it=>it.id===id)).filter(Boolean) }))
          .concat([{ key:"other", label:"", items:items.filter(it=>!["profile","shop","pin","period","license","team","groups","invite","positions","orderModule","branchTransfer","wastyle","print","theme","language","backup","sync","update","help"].includes(it.id)) }])
          .filter(g=>g.items.length);
        const groupHead = (label, first) => label && (
          <div style={{ fontSize:11, fontWeight:900, letterSpacing:0.4, textTransform:"uppercase", color:th.txtMuted, padding:isDesktop?"10px 10px 4px":"4px 4px 6px", marginTop:first?0:(isDesktop?4:14), borderTop:!first&&isDesktop?`1px solid ${th.border}`:"none" }}>{label}</div>
        );
        return (
        <div style={isDesktop?{ ...s.desktopPanel, maxWidth:1240 }:s.panel}>
          {isDesktop&&<style dangerouslySetInnerHTML={{ __html:`
.st-pc{display:grid;grid-template-columns:290px minmax(0,1fr);gap:18px;align-items:start;}
.st-side{position:sticky;top:12px;background:${th.bgCard};border:1px solid ${th.border};border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(15,23,42,.06);}
.st-side-head{padding:12px 16px;font-weight:800;font-size:15px;color:#fff;background:linear-gradient(180deg,#3d6fcb,#24519f);}
.st-list{max-height:calc(100vh - 210px);overflow:auto;padding:6px;}
.st-item{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:none;border-left:3px solid transparent;border-radius:8px;background:transparent;cursor:pointer;text-align:left;font-family:inherit;color:${th.txtPrimary};}
.st-item:hover{background:${theme==="dark"?"rgba(96,165,250,.12)":"#f1f5fb"};}
.st-item.is-active{background:${theme==="dark"?"rgba(96,165,250,.2)":"#e3edfc"};border-left-color:${th.accent};}
.st-item .st-ic{width:32px;height:32px;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:17px;background:${theme==="dark"?"rgba(255,255,255,.06)":"#eef3fb"};}
.st-item b{display:block;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.st-item small{display:block;font-size:11px;color:${th.txtMuted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.st-item .st-tx{min-width:0;flex:1;}
.st-out{display:block;width:calc(100% - 12px);margin:6px;padding:9px;border-radius:8px;border:1px solid #fecaca;background:${theme==="dark"?"#450a0a":"#fef2f2"};color:#dc2626;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;}
.st-main{background:${th.bgCard};border:1px solid ${th.border};border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(15,23,42,.06);min-height:420px;}
.st-main-head{display:flex;align-items:center;gap:12px;padding:12px 18px;color:#fff;background:linear-gradient(180deg,#3d6fcb,#24519f);}
.st-main-head .st-ic{font-size:22px;}
.st-main-head .st-title{font-size:16px;font-weight:800;}
.st-main-head .st-sub{font-size:12px;opacity:.85;}
.st-main-body{padding:18px 22px 24px;max-width:860px;}
.st-main-body input:not([type=checkbox]):not([type=radio]),.st-main-body select{min-height:38px;}
` }} />}
          <div className={isDesktop?"st-pc":undefined}>
            {isDesktop ? (
              <aside className="st-side">
                <div className="st-side-head">⚙️ {plain(t.settingsTitle)}</div>
                <div className="st-list">
                  {settingGroups.map((g,gi)=>(
                    <Fragment key={g.key}>
                      {groupHead(g.label, gi===0)}
                      {g.items.map(it=>(
                        <button key={it.id} type="button" className={`st-item${stPage===it.id?" is-active":""}`} onClick={()=>openItem(it)} title={it.sub}>
                          <span className="st-ic">{it.icon}</span>
                          <span className="st-tx"><b>{it.label}</b><small>{it.sub}</small></span>
                        </button>
                      ))}
                    </Fragment>
                  ))}
                </div>
                <button type="button" className="st-out" onClick={handleLogout}>🚪 {t.logout}</button>
              </aside>
            ) : !settingsPage&&(
              <>
                <div style={s.secTitle}>{t.settingsTitle}</div>
                {settingGroups.map((g,gi)=>(
                  <Fragment key={g.key}>
                    {groupHead(g.label, gi===0)}
                    {g.items.map(it=>(
                      <button key={it.id} style={s.settingsRow} onClick={()=>openItem(it)}>
                        <span style={s.settingsRowIcon}>{it.icon}</span>
                        <div style={{ flex:1 }}>
                          <div style={s.settingsRowLabel}>{it.label}</div>
                          <div style={s.settingsRowSub}>{it.sub}</div>
                        </div>
                        {it.id!=="sync"&&<span style={s.settingsArrow}>›</span>}
                      </button>
                    ))}
                  </Fragment>
                ))}
                <button style={{ ...s.logoutBtn, marginTop:16 }} onClick={handleLogout}>🚪 {t.logout}</button>
              </>
            )}
            <section className={isDesktop?"st-main":undefined}>
              {isDesktop ? (
                <div className="st-main-head">
                  <span className="st-ic">{current?.icon}</span>
                  <div><div className="st-title">{current?.label}</div><div className="st-sub">{current?.sub}</div></div>
                </div>
              ) : settingsPage&&(
                <button style={s.backRowBtn} onClick={()=>setSettingsPage(null)}>
                  ← {bnS?"সেটিংস":"Settings"}
                </button>
              )}
              <div className={isDesktop?"st-main-body":undefined}>

          {stPage==="profile"&&(
            <>
              <div style={s.card}>
                <div style={s.settingsLbl}>{t.profileTitle}</div>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ ...s.coIcon, fontSize:24 }}>{isOwner?"🏢":"👨‍💼"}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:th.txtPrimary }}>{profile.personName}</div>
                    <div style={{ fontSize:12, color:"#71717a", marginTop:2 }}>{profile.email} · {isOwner?t.ownerLabel:(profile.position||t.salesmanLabel)}</div>
                    <div style={{ fontSize:12, color:"#71717a" }}>📱 {profile.mobile} · {profile.area}, {profile.countryName}</div>
                  </div>
                </div>
              </div>
              <ProfilePasswordSettings t={t} lang={lang} profile={profile} toast={toast} th={th} s={s} />
            </>
          )}

          {stPage==="shop"&&localShop&&(
            <ShopInfoSettings
              localShop={localShop} shopId={shopId}
              profile={profile} user={user}
              onShopUpdated={setLocalShop}
              th={th} s={s} lang={lang} toast={toast}
              readOnly={!isOwner}
            />
          )}

          {stPage==="license"&&(
            <LicenseActivationPanel
              lang={lang}
              th={th}
              s={s}
              toast={toast}
            />
          )}

          {stPage==="update"&&(
            <AppUpdatePanel lang={lang} th={th} s={s} toast={toast} />
          )}

          {stPage==="help"&&(
            <HelpSettingsPanel t={t} lang={lang} th={th} s={s} />
          )}

          {stPage==="invite"&&isOwner&&(
            <div style={{ ...s.card, border:"1px solid #f97316" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                <div style={s.settingsLbl}>{t.inviteCodeTitle}</div>
                <button style={s.addCoBtn} onClick={generateNewCode}>{lang==="bn"?"+ নতুন Code":"+ New Code"}</button>
              </div>
              <div style={{ fontSize:11, color:"#a1a1aa", marginBottom:12 }}>{t.inviteCodeDesc}</div>
              {inviteCodes.filter(c=>!c.used).length===0&&(
                <div style={{ fontSize:12, color:"#71717a", textAlign:"center", padding:"10px 0" }}>
                  {lang==="bn"?"কোনো active code নেই। নতুন তৈরি করুন।":"No active codes. Generate one above."}
                </div>
              )}
              {inviteCodes.filter(c=>!c.used).map(c=>(
                <InviteCodeRow key={c.code} c={c} lang={lang} t={t} onDelete={deleteInviteCode} th={th} />
              ))}
              {inviteCodes.filter(c=>c.used).length>0&&(
                <div style={{ marginTop:12, paddingTop:10, borderTop:`1px solid ${th.border}` }}>
                  <div style={{ fontSize:10, color:"#71717a", textTransform:"uppercase", letterSpacing:0, fontWeight:700, marginBottom:8 }}>
                    {lang==="bn"?"ব্যবহৃত Codes":"Used Codes"} ({inviteCodes.filter(c=>c.used).length})
                  </div>
                  {inviteCodes.filter(c=>c.used).map(c=>(
                    <div key={c.code} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderTop:`1px solid ${th.border}` }}>
                      <span style={{ fontSize:13, fontWeight:700, color:th.txtMuted, fontFamily:"monospace", flex:1, letterSpacing:1 }}>{c.code}</span>
                      <span style={{ fontSize:11, color:th.txtMuted }}>✅ {c.usedByName||"—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {stPage==="team"&&(isOwner || team.length>0)&&(
            <>
              {isOwner&&(
                <div style={{ ...s.card, marginBottom:12, border:"1px solid #3b82f6" }}>
                  <div style={s.settingsLbl}>{t.addStaffTitle}</div>
                  <input style={{ ...s.inp, marginBottom:8 }} placeholder={t.personName} value={staffForm.personName} onChange={e=>setStaffForm(p=>({...p,personName:e.target.value}))} />
                  <input style={{ ...s.inp, marginBottom:8 }} placeholder={t.usernameLbl} value={staffForm.username} onChange={e=>setStaffForm(p=>({...p,username:e.target.value}))} autoComplete="off" autoCapitalize="none" />
                  <input style={{ ...s.inp, marginBottom:8 }} type="password" placeholder={t.passwordLbl} value={staffForm.password} onChange={e=>setStaffForm(p=>({...p,password:e.target.value}))} autoComplete="new-password" />
                  <input style={{ ...s.inp, marginBottom:8 }} type="tel" placeholder={t.mobileLbl} value={staffForm.mobile} onChange={e=>setStaffForm(p=>({...p,mobile:e.target.value}))} />
                  <select style={{ ...s.sel, marginBottom:10 }} value={staffForm.position} onChange={e=>setStaffForm(p=>({...p,position:e.target.value}))}>
                    <option value="Salesman">{t.defaultPosition}</option>
                    {(localShop?.positions||[]).map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                  {userGroups.length>0&&(
                    <select style={{ ...s.sel, marginBottom:10 }} value={staffForm.groupId||""} onChange={e=>setStaffForm(p=>({...p,groupId:e.target.value}))}>
                      <option value="">{lang==="bn"?"🛡️ ইউজার গ্রুপ — নেই (সাধারণ অনুমতি)":"🛡️ User group — none (default permissions)"}</option>
                      {userGroups.map(g=><option key={g.id} value={g.id}>🛡️ {g.name}</option>)}
                    </select>
                  )}
                  <button style={s.sendBtn} onClick={createStaffMember} disabled={staffSaving}>{staffSaving?"...":t.addStaffBtn}</button>
                </div>
              )}

              <div style={s.card}>
                <div style={s.settingsLbl}>{t.teamTitle} ({team.length})</div>
                {team.length===0&&(
                  <div style={{ fontSize:12, color:"#71717a", padding:"8px 0" }}>
                    {lang==="bn"?"এখনো কোনো কর্মী নেই। উপরে নতুন কর্মী যোগ করুন।":"No staff yet. Add a staff member above."}
                  </div>
                )}
                {team.map((m,idx)=>{
                  const memberId = m.uid || m.id;
                  return (
                <div key={memberId} style={{ padding:"10px 0", borderTop:idx>0?`1px solid ${th.border}`:"none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:isOwner&&m.role!=="owner"&&memberId!==user.uid?10:0 }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background:th.border, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{m.role==="owner"?"🏢":"👨‍💼"}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{m.personName}{memberId===user.uid&&<span style={{ color:"#f97316", fontSize:11 }}> ({t.youLabel})</span>}</div>
                      <div style={{ fontSize:11, color:"#71717a" }}>
                        {m.role==="owner"?t.ownerLabel:(m.position||t.salesmanLabel)}
                        {m.username&&<span> · @{m.username}</span>}
                        {m.email&&<span> · ✉️ {m.email}</span>}
                        {m.mobile&&<span> · 📱 {m.mobile}</span>}
                        {m.area&&<span> · {m.area}</span>}
                      </div>
                    </div>
                  </div>
                  {isOwner&&m.role!=="owner"&&memberId!==user.uid&&(
                    <div style={{ background:th.bgInp, borderRadius:10, padding:"10px 12px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                        <span style={{ fontSize:12, color:"#71717a", fontWeight:700, textTransform:"uppercase", letterSpacing:0 }}>{t.positionLbl}</span>
                        <select style={{ ...s.sel, flex:"unset", width:"auto", fontSize:12, padding:"5px 8px" }}
                          value={m.position||"Salesman"}
                          onChange={e=>saveMemberPosition(m, e.target.value)}>
                          <option value="Salesman">{t.defaultPosition}</option>
                          {(localShop?.positions||[]).map(p=><option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div style={{ height:1, background:th.bgCard, marginBottom:8 }} />
                      {(()=>{
                        const mPerms = { ...DEFAULT_PERMISSIONS, ...(m.permissions || {}) };
                        const gs = memberGroupState(m, userGroups);
                        return (
                          <>
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                              <span style={{ fontSize:12, color:"#71717a", fontWeight:700, textTransform:"uppercase" }}>🛡️ {lang==="bn"?"ইউজার গ্রুপ":"User group"}</span>
                              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                {gs.custom&&<span style={{ fontSize:10, color:"#f59e0b", fontWeight:700 }}>{lang==="bn"?"কাস্টম বদল":"Customised"}</span>}
                                <select style={{ ...s.sel, flex:"unset", width:"auto", fontSize:12, padding:"5px 8px" }}
                                  value={gs.group?.id||""}
                                  onChange={e=>{ const g=userGroups.find(x=>x.id===e.target.value)||null; applyGroupToMember(m, g, { notify:true }); }}>
                                  <option value="">{lang==="bn"?"— গ্রুপ নেই (নিজস্ব) —":"— No group (custom) —"}</option>
                                  {userGroups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                                {gs.custom&&<button type="button" style={{ ...s.addCoBtn, padding:"4px 8px", fontSize:11 }} onClick={()=>applyGroupToMember(m, gs.group, { notify:true })}>{lang==="bn"?"গ্রুপ অনুযায়ী করুন":"Reset to group"}</button>}
                              </div>
                            </div>
                            {userGroups.length===0&&(
                              <div style={{ fontSize:11, color:"#71717a", marginBottom:8 }}>
                                {lang==="bn"?"গ্রুপ বানাতে: সেটিংস → ইউজার গ্রুপ ও অনুমতি।":"Create groups in Settings → User groups & privileges."}
                                {" "}<button type="button" style={{ background:"none", border:"none", color:"#f97316", cursor:"pointer", fontSize:11, fontWeight:700, padding:0 }} onClick={()=>setSettingsPage("groups")}>{lang==="bn"?"খুলুন →":"Open →"}</button>
                              </div>
                            )}
                            <div style={{ fontSize:10, color:"#71717a", marginBottom:4, textTransform:"uppercase", letterSpacing:0, fontWeight:700 }}>{t.permissionsTitle}</div>
                            <PermissionMatrix lang={lang} th={th} perms={mPerms} compact
                              onToggle={(key,val)=>savePermissions(m,{ ...mPerms, [key]:val })} />
                            <div style={{ height:1, background:th.bgCard, margin:"10px 0 8px" }} />
                            <UserDefaultsEditor lang={lang} th={th} s={s} member={m} team={team} employees={teamEmployees} payOptions={SI_PAY}
                              onSave={(d)=>saveMemberDefaults(m, d)} />
                          </>
                        );
                      })()}
                      {m.localUserId&&(
                        <>
                          <div style={{ height:1, background:th.bgCard, margin:"10px 0 8px" }} />
                          <div style={{ fontSize:10, color:"#71717a", marginBottom:8, textTransform:"uppercase", letterSpacing:0, fontWeight:700 }}>{t.resetPwLbl}</div>
                          <div style={s.row}>
                            <input style={{ ...s.inp, flex:1 }} type="password" placeholder={t.resetPwLbl} value={staffPwReset[m.localUserId]||""}
                              onChange={e=>setStaffPwReset(prev=>({ ...prev, [m.localUserId]: e.target.value }))} autoComplete="new-password" />
                            <button style={s.savBtn} onClick={()=>resetStaffPassword(m)}>{t.resetPwBtn}</button>
                          </div>
                        </>
                      )}
                      <div style={{ height:1, background:th.bgCard, margin:"10px 0 8px" }} />
                      <button
                        style={{ ...s.addCoBtn, width:"100%", borderColor:"#450a0a", color:"#ef4444", marginTop:4 }}
                        onClick={()=>closeTeamMember(m)}
                      >{t.removeMemberBtn}</button>
                    </div>
                  )}
                </div>
                  );
                })}
              </div>
              {isOwner&&(()=>{
                const me = team.find(m=>(m.uid||m.id)===user.uid) || { uid:user.uid, id:user.uid, role:"owner", personName:profile.personName, defaults:profile.defaults||{} };
                return (
                  <div style={{ ...s.card, marginTop:12 }}>
                    <UserDefaultsEditor lang={lang} th={th} s={s} member={{ ...me, defaults: me.defaults || profile.defaults || {} }} team={team} employees={teamEmployees} payOptions={SI_PAY}
                      onSave={(d)=>saveMemberDefaults(me, d)} />
                    <div style={{ fontSize:11, color:"#71717a", marginTop:6 }}>{lang==="bn"?"↑ এটা আপনার (মালিকের) নিজের লগইনের ডিফল্ট।":"↑ These are your own (owner) login defaults."}</div>
                  </div>
                );
              })()}
            </>
          )}

          {stPage==="period"&&isOwner&&(
            <PeriodLockPanel lang={lang} th={th} s={s} shop={localShop} user={user} profile={profile} toast={toast}
              onSave={async (next)=>{
                const updated = await saveShopRecord(shopId, { periodLock: next }, { ownerUid: user?.uid, profile, user });
                setLocalShop(prev=>mergeShopRecord(prev, updated || { periodLock: next }));
              }} />
          )}

          {stPage==="groups"&&isOwner&&(
            <UserGroupsPanel lang={lang} th={th} s={s} groups={userGroups} team={team} defaults={DEFAULT_PERMISSIONS}
              onSaveGroups={saveUserGroups} onApplyGroup={(m,g)=>applyGroupToMember(m,g)} toast={toast} />
          )}

          {stPage==="branchTransfer"&&isOwner&&(
            <BranchTransferSettingsPanel
              lang={lang} th={th} s={s}
              shopId={shopId} user={user} profile={profile}
              team={team} settings={branchTransferSettings}
              onSettingsChanged={setBranchTransferSettings}
              toast={toast}
            />
          )}

          {stPage==="orderModule"&&isOwner&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{lang==="bn"?"📋 Order Option":"📋 Order Option"}</div>
              <div style={{ fontSize:12, color:th.txtMuted, lineHeight:1.6, marginBottom:14 }}>
                {lang==="bn"
                  ? "Single shop হলে এই option বন্ধ রাখতে পারেন। চালু করলে Orders/New Order দেখা যাবে (owner, salesman ও dashboard সবখানে)। বন্ধ থাকলে কারো কাছে দেখাবে না।"
                  : "For a single shop, you can keep this off. Enable it to show Orders/New Order for the owner, salesmen and dashboard. When off, it is hidden for everyone."}
              </div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"14px 0", borderTop:`1px solid ${th.border}`, borderBottom:`1px solid ${th.border}` }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:th.txtPrimary }}>{lang==="bn"?"Order system":"Order system"}</div>
                  <div style={{ fontSize:12, color:th.txtMuted, marginTop:4 }}>
                    {orderModuleEnabled ? (lang==="bn"?"চালু আছে":"Enabled") : (lang==="bn"?"বন্ধ আছে (Default)":"Disabled (Default)")}
                  </div>
                </div>
                <PermToggle isOn={orderModuleEnabled} disabled={orderSettingsSaving} onToggle={()=>saveOrderModuleEnabled(!orderModuleEnabled)} />
              </div>
              {orderSettingsSaving&&(
                <div style={{ fontSize:12, color:"#f97316", marginTop:10 }}>{lang==="bn"?"সেভ হচ্ছে...":"Saving..."}</div>
              )}
            </div>
          )}

          {stPage==="wastyle"&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{lang==="bn"?"💬 WhatsApp Message Style":"💬 WhatsApp Message Style"}</div>
              <div style={{ fontSize:11, color:"#71717a", marginBottom:12 }}>
                {lang==="bn"?"কোম্পানিকে WhatsApp করার সময় কোন style-এ message যাবে বেছে নিন":"Choose how messages look when sending to companies"}
              </div>
              {WA_STYLES.map(st=>(
                <button key={st.id} onClick={()=>setWaStyle(st.id)}
                  style={{ width:"100%", textAlign:"left", background:waStyle===st.id?"rgba(249,115,22,0.08)":th.bgInp,
                    border:`1px solid ${waStyle===st.id?"#f97316":th.border}`, borderRadius:10,
                    padding:"10px 12px", marginBottom:8, cursor:"pointer", fontFamily:"inherit" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:waStyle===st.id?"#f97316":th.txtPrimary }}>
                      {waStyle===st.id?"✅ ":""}{lang==="bn"?st.labelBn:st.labelEn}
                    </span>
                  </div>
                  <pre style={{ fontSize:11, color:th.txtMuted, margin:0, fontFamily:"monospace", whiteSpace:"pre-wrap", lineHeight:1.6 }}>
                    {lang==="bn"?`*পণ্যের তালিকা:*\n${st.previewBn}\n\n_দয়া করে দাম ও স্টক জানান।_ 🙏 ধন্যবাদ`:`*Product List:*\n${st.previewEn}\n\n_Please share price and stock._ 🙏 Thanks`}
                  </pre>
                </button>
              ))}
            </div>
          )}

          {stPage==="language"&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{t.languageLbl}</div>
              <div style={s.langSw}>
                <button style={{ ...s.lBtn, padding:"10px 18px", flex:1, ...(lang==="bn"?s.lBtnA:{}) }} onClick={()=>setLang("bn")}>বাংলা</button>
                <button style={{ ...s.lBtn, padding:"10px 18px", flex:1, ...(lang==="en"?s.lBtnA:{}) }} onClick={()=>setLang("en")}>English</button>
              </div>
            </div>
          )}

          {stPage==="theme"&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{lang==="bn"?"🎨 থিম বেছে নিন":"🎨 Choose Theme"}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <button onClick={()=>setTheme("dark")}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:12,
                    border:`2px solid ${theme==="dark"?"#f97316":th.border}`,
                    background:theme==="dark"?"rgba(249,115,22,0.08)":"transparent",
                    cursor:"pointer", fontFamily:"inherit", textAlign:"left", width:"100%" }}>
                  <span style={{ fontSize:28 }}>🌙</span>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:th.txtPrimary }}>{lang==="bn"?"ডার্ক মোড":"Dark Mode"}</div>
                    <div style={{ fontSize:12, color:th.txtMuted }}>{lang==="bn"?"চোখে আরামদায়ক অন্ধকার থিম":"Easy on the eyes dark theme"}</div>
                  </div>
                  {theme==="dark"&&<span style={{ marginLeft:"auto", color:"#f97316", fontSize:18 }}>✅</span>}
                </button>
                <button onClick={()=>setTheme("light")}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:12,
                    border:`2px solid ${theme==="light"?"#f97316":th.border}`,
                    background:theme==="light"?"rgba(249,115,22,0.08)":"transparent",
                    cursor:"pointer", fontFamily:"inherit", textAlign:"left", width:"100%" }}>
                  <span style={{ fontSize:28 }}>☀️</span>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:th.txtPrimary }}>{lang==="bn"?"লাইট মোড":"Light Mode"}</div>
                    <div style={{ fontSize:12, color:th.txtMuted }}>{lang==="bn"?"উজ্জ্বল সাদা থিম":"Bright white theme"}</div>
                  </div>
                  {theme==="light"&&<span style={{ marginLeft:"auto", color:"#f97316", fontSize:18 }}>✅</span>}
                </button>
              </div>
            </div>
          )}

          {stPage==="backup"&&isOwner&&shopId&&(
            <BackupPanel lang={lang} th={th} s={s} toast={toast} shopId={shopId} userId={user?.uid} />
          )}

          {stPage==="sync"&&(
            <SyncSettingsPanel
              t={t}
              lang={lang}
              th={th}
              s={s}
              toast={toast}
              syncState={syncState}
              syncDashboard={syncDashboard}
              lastCloudPullAt={lastCloudPullAt}
              cloudUploadBusy={cloudUploadBusy}
              cloudPullBusy={cloudPullBusy}
              shopId={shopId}
              productCount={products.length}
              firebaseCloudReady={!getCloudSyncBlockReason()}
              onUpload={runCloudUpload}
              onDownload={() => runCloudDownload()}
              onRefresh={refreshSyncDashboard}
            />
          )}
              </div>
            </section>
          </div>
        </div>
        );
      })()}
    </>
  );

  if (licenseAccessLoading && !licenseAccess) {
    return (
      <div style={s.root}>
        <Header t={t} lang={lang} setLang={setLang} isDesktop={isDesktop} s={s} theme={theme} setTheme={setTheme} />
        <div style={isDesktop?s.desktopPanel:s.panel}>
          <div style={s.empty}>⏳</div>
        </div>
      </div>
    );
  }

  if (licenseAccess?.accessAllowed === false) {
    return (
      <div style={s.root}>
        <Header t={t} lang={lang} setLang={setLang} isDesktop={isDesktop} s={s} theme={theme} setTheme={setTheme} />
        <div style={isDesktop?s.desktopPanel:s.panel}>
          <div style={{ ...s.card, border:"1px solid #ef4444", background:th.bgCard }}>
            <div style={{ fontSize:34, marginBottom:8 }}>🔐</div>
            <div style={{ fontSize:22, fontWeight:900, color:"#ef4444", marginBottom:6 }}>
              {lang==="bn"?"ফ্রি ট্রায়াল শেষ":"Free trial expired"}
            </div>
            <div style={{ fontSize:13, color:th.txtMuted, lineHeight:1.5 }}>
              {lang==="bn"?"চালিয়ে যেতে লাইসেন্স অ্যাক্টিভ করুন":"Please activate your license to continue"}
            </div>
            {licenseAccess?.accessReason&&(
              <div style={{ fontSize:11, color:th.txtMuted, marginTop:8 }}>
                {licenseAccess.accessReason}
              </div>
            )}
          </div>

          <LicenseActivationPanel
            lang={lang}
            th={th}
            s={s}
            toast={toast}
            locked
            onActivated={refreshLicenseAccess}
          />

          <button style={s.logoutBtn} onClick={handleLogout}>
            🚪 {lang==="bn"?"লগআউট":"Logout"}
          </button>
        </div>
      </div>
    );
  }

  if (isOwner && shopId && shopNeedsSetup(localShop)) {
    return (
      <ShopSetupWizard
        t={t}
        lang={lang}
        setLang={setLang}
        localShop={localShop}
        shopId={shopId}
        profile={profile}
        user={user}
        toast={toast}
        s={s}
        theme={theme}
        setTheme={setTheme}
        onShopSaved={setLocalShop}
      />
    );
  }

  const supplierPickerResults = supplierPickerTarget ? searchOrderSuppliers(supplierPickerQuery) : [];
  const supplierPickerOrder = supplierPickerTarget
    ? orders.find(order => order.id === supplierPickerTarget.orderId)
    : null;
  const supplierPickerSelectedId = supplierPickerTarget
    ? supplierPickerOrder?.items?.[supplierPickerTarget.itemIndex]?.co
    : null;

  return (
    <div style={s.root}>
      <Header t={t} lang={lang} setLang={setLang} isDesktop={isDesktop} s={s} theme={theme} setTheme={setTheme}
        shopName={localShop?.companyName||""} personName={profile.personName||""}
        rightSlot={(
          <>
            {!isDesktop && globalSearchCanAny && (
              <button
                type="button"
                aria-label={lang === "bn" ? "সার্চ" : "Search"}
                onClick={() => window.dispatchEvent(new CustomEvent("s4-focus-global-search"))}
                style={{ border: "none", background: "transparent", fontSize: 20, lineHeight: 1, padding: "2px 6px", cursor: "pointer" }}
              >
                🔎
              </button>
            )}
            <NotificationBell lang={lang} theme={theme} items={notificationItems} />
          </>
        )}
        onBack={!isDesktop && tab!=="dashboard" ? goBack : null} />

      {isDesktop ? (
        <div style={s.desktopLayout}>
          {!(pageMax && tab!=="dashboard") && <div style={s.sidebar}>
            <SideMenuGroups items={visibleTabs} activeKey={tab} lang={lang}
              colors={{ head:th.txtPrimary, headBg:th.bgInp, line:th.borderMid }}
              renderItem={(k,label)=>(
                <button style={{ ...s.sideTab, padding:"8px 12px", ...(tab===k?s.sideTabA:{}) }} onClick={()=>setTab(k)}>
                  <span style={{ flex:1, textAlign:"left" }}>{label}</span>
                  {TAB_SHORTCUT_KEYS[k]&&<span style={{ ...s.sideKey, ...(tab===k?s.sideKeyA:{}) }}>{TAB_SHORTCUT_KEYS[k]}</span>}
                  {((isOwner&&k==="owner")||(!isOwner&&k==="shop"))&&unread>0&&<span style={s.sideBadge}>{unread}</span>}
                </button>
              )} />
            <div style={{ flex:1 }} />
            <div style={{ fontSize:11, color:syncState==="connected"?"#22c55e":syncState==="offline"?"#ef4444":"#f59e0b", textAlign:"center", marginBottom:10 }}>
              {syncState==="connected"?"🟢 Online":syncState==="offline"?"🔴 Offline":syncState==="reconnecting"?"🟠 Reconnecting...":"🟡 Connecting..."}
            </div>
            <button style={s.sideLogout} onClick={handleLogout}>🚪 {t.logout}</button>
          </div>}
          <div style={s.desktopContent}>
            {tab!=="dashboard"&&(
              <div onDoubleClick={()=>setPageMax(m=>!m)}
                style={{ position:"sticky", top:0, zIndex:8, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, padding:"4px 6px 4px 12px", background:"linear-gradient(180deg,#3f69bd,#2854ad)", color:"#fff", fontSize:13, fontWeight:800, userSelect:"none", fontFamily:"Segoe UI, Tahoma, sans-serif" }}>
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentTabLabel}</span>
                <WindowButtons lang={lang}
                  win={{ max:pageMax, minimize:()=>{ setMinTab(tab); setTab("dashboard"); }, toggleMax:()=>setPageMax(m=>!m) }}
                  onClose={()=>setTab("dashboard")} />
              </div>
            )}
            {tabContent}
          </div>
        </div>
      ) : erpSkin ? (
        <div className={erpDark ? "erp-m erp-m-dark" : "erp-m"}>
          <style>{ERP_MOBILE_CSS}</style>
          {tab!=="products"&&!pmOverSales&&(
            <div className="erp-m-title">
              <strong>{String((visibleTabs.find(([k])=>k===tab)||[])[1]||tab).replace(/^[^\p{L}\p{N}]+/u,"")}</strong>
              <span>{new Date().toLocaleDateString(lang==="bn"?"bn-BD":"en-GB",{ day:"numeric", month:"short", year:"numeric" })}</span>
            </div>
          )}
          {globalSearchCanAny && (tab === "products" || pmOverSales) && (
            <AppGlobalSearch
              lang={lang}
              th={th}
              glassCard={{ background: th.bgCard, border: `1px solid ${th.border}` }}
              products={products}
              customers={customers}
              vendors={vendors}
              can={globalSearchCan}
              onNavigate={handleGlobalSearchNavigate}
              isMobile
              showBar={false}
              cur={t.cur || localShop?.currency || "AED"}
              canSeeCost={canSeeProductCost}
            />
          )}
          {globalSearchCanAny && tab !== "products" && !pmOverSales && (
            <AppGlobalSearch
              lang={lang}
              th={th}
              glassCard={{ background: th.bgCard, border: `1px solid ${th.border}` }}
              products={products}
              customers={customers}
              vendors={vendors}
              can={globalSearchCan}
              onNavigate={handleGlobalSearchNavigate}
              isMobile
              cur={t.cur || localShop?.currency || "AED"}
              canSeeCost={canSeeProductCost}
            />
          )}
          {tabContent}
        </div>
      ) : tabContent}

      {printSettingsOpen && (
        <PrintSettingsWindow lang={lang} isDesktop={isDesktop} toast={toast}
          onClose={()=>setPrintSettingsOpen(false)}
          showCode={siShowCode} setShowCode={(v)=>{ setSiShowCode(v); saveSiShowCode(v); }}
          colorPrint={siColorPrint} setColorPrint={(v)=>{ setSiColorPrint(v); saveSiColor(v); }}
          previewHtml={(kind, style)=>designPreviewHtml(kind, style, localShop, lang, siShowCode, siColorPrint)} />
      )}

      {isDesktop && minTab && tab !== minTab && (
        <MinimizedChip title={tabLabelOf(minTab)} lang={lang} slot={2}
          onRestore={()=>setTab(minTab)} onClose={()=>setMinTab(null)} />
      )}

      {!isDesktop && (
        <MobileMenuDrawer open={menuOpen} onClose={closeMenu}
          items={visibleTabs} activeKey={tab} onSelect={selectFromMenu}
          unreadKey={isOwner?"owner":"shop"} unread={unread}
          lang={lang} theme={theme}
          personName={profile.personName||""} roleLabel={isOwner?t.ownerLabel:(profile.position||t.salesmanLabel)}
          shopName={localShop?.companyName||""} syncState={syncState} onLogout={handleLogout} />
      )}

      {orderReceive&&(()=>{
        const rcOrder = orders.find(o=>o.id===orderReceive.orderId);
        if (!rcOrder) return null;
        const bn = lang==="bn";
        const setRc = (patch) => setOrderReceive(prev => prev ? { ...prev, ...patch } : prev);
        const setLine = (iIdx, patch) => setOrderReceive(prev => prev ? { ...prev, lines:prev.lines.map(l => l.iIdx===iIdx ? { ...l, ...patch } : l) } : prev);
        const total = orderReceive.lines.reduce((sum,l)=>sum + (l.checked ? (Number(l.qty)||0)*(Number(l.unitCost)||0) : 0), 0);
        const lbl = { fontSize:11, color:th.txtMuted, marginBottom:3, display:"block" };
        return (
          <div
            onClick={e=>e.stopPropagation()}
            style={{ position:"fixed", inset:0, zIndex:99998, background:"rgba(2,6,23,0.72)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"56px 12px 18px" }}>
            <div style={{ width:"min(640px,100%)", maxHeight:"calc(100vh - 80px)", display:"flex", flexDirection:"column", border:`1px solid ${th.borderMid}`, borderRadius:16, background:th.bgCard, boxShadow:"0 18px 60px rgba(0,0,0,0.35)", overflow:"hidden" }}>
              <div style={{ padding:"12px 14px", borderBottom:`1px solid ${th.border}`, display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ flex:1, fontWeight:800, fontSize:14, color:th.txtPrimary }}>
                  🚚 {bn?"Invoice দিয়ে ডেলিভারি":"Receive with Invoice"} · {getOrderDisplayNo(rcOrder)}
                </div>
                <button type="button" onClick={()=>!orderReceiveSaving&&setOrderReceive(null)}
                  style={{ width:28, height:28, borderRadius:14, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtMuted, cursor:"pointer" }}>✕</button>
              </div>
              <div style={{ padding:14, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
                <div style={{ fontSize:12, color:th.txtMuted, marginBottom:10, lineHeight:1.5 }}>
                  {bn?"সাপ্লায়ারের বিল দেখে Qty ও দাম মিলিয়ে নিন। Save করলে এটা Purchase List-এ সাধারণ Purchase হিসেবে যাবে এবং স্টকে যোগ হবে।":"Match the qty and cost with the supplier's bill. Saving adds it to the Purchase List as a normal purchase and adds stock."}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:8, marginBottom:12 }}>
                  <label>
                    <span style={lbl}>{bn?"Vendor *":"Vendor *"}</span>
                    <input style={s.inp} value={orderReceive.vendorName} readOnly={!!findOrderSupplier(orderReceive.supplierKey)}
                      onChange={e=>setRc({ vendorName:e.target.value })} />
                  </label>
                  <label>
                    <span style={lbl}>{bn?"সাপ্লায়ারের Invoice No *":"Supplier Invoice No *"}</span>
                    <input style={s.inp} value={orderReceive.supplierInvoiceNo} autoFocus
                      onChange={e=>setRc({ supplierInvoiceNo:e.target.value })} />
                  </label>
                  <label>
                    <span style={lbl}>{bn?"Invoice তারিখ":"Invoice Date"}</span>
                    <input type="date" style={s.inp} value={orderReceive.invoiceDate}
                      onChange={e=>setRc({ invoiceDate:e.target.value })} />
                  </label>
                  <label>
                    <span style={lbl}>{bn?"পেমেন্ট":"Payment"}</span>
                    <select style={s.inp} value={orderReceive.paymentMethod} onChange={e=>setRc({ paymentMethod:e.target.value })}>
                      <option value="credit">{bn?"বাকি (Credit)":"Credit"}</option>
                      <option value="cash">{bn?"নগদ (Cash)":"Cash"}</option>
                    </select>
                  </label>
                </div>
                {orderReceive.lines.map(l=>{
                  const it = rcOrder.items[l.iIdx]; if (!it) return null;
                  return (
                    <div key={l.iIdx} style={{ ...s.oiCard, opacity:l.checked?1:0.55 }}>
                      <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, fontWeight:700, color:th.txtPrimary, marginBottom:6, cursor:"pointer" }}>
                        <input type="checkbox" checked={l.checked} onChange={e=>setLine(l.iIdx,{ checked:e.target.checked })} />
                        <span style={{ flex:1 }}>
                          {it.name}
                          {it.code&&<span style={{ fontSize:11, color:"#71717a", marginLeft:6 }}>📋 {it.code}</span>}
                          {it.brand&&<span style={{ fontSize:11, color:"#71717a", marginLeft:6 }}>🏷️ {it.brand}</span>}
                        </span>
                      </label>
                      <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
                        <label style={{ flex:1 }}>
                          <span style={lbl}>Qty ({it.unit||"Pcs"})</span>
                          <input style={s.inp} inputMode="decimal" value={l.qty} disabled={!l.checked}
                            onChange={e=>setLine(l.iIdx,{ qty:e.target.value })} />
                        </label>
                        <label style={{ flex:1 }}>
                          <span style={lbl}>{bn?"দাম (৳)":"Cost (৳)"}</span>
                          <input style={s.inp} inputMode="decimal" value={l.unitCost} disabled={!l.checked}
                            onChange={e=>setLine(l.iIdx,{ unitCost:e.target.value })} />
                        </label>
                        <div style={{ flex:1, fontSize:13, fontWeight:700, color:th.txtPrimary, textAlign:"right", paddingBottom:10 }}>
                          ৳ {((Number(l.qty)||0)*(Number(l.unitCost)||0)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding:"10px 14px", borderTop:`1px solid ${th.border}`, display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ flex:1, fontSize:14, fontWeight:800, color:th.txtPrimary }}>
                  {bn?"মোট":"Total"}: ৳ {total.toFixed(2)}
                </div>
                <button type="button" style={s.stBtn} disabled={orderReceiveSaving} onClick={()=>setOrderReceive(null)}>
                  {bn?"বাতিল":"Cancel"}
                </button>
                <button type="button" style={s.sendBtn} disabled={orderReceiveSaving} onClick={saveOrderReceive}>
                  {orderReceiveSaving ? "..." : (bn?"✅ Save ও ডেলিভারি":"✅ Save & Deliver")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {supplierPickerTarget&&(
        <div
          onClick={e=>e.stopPropagation()}
          onMouseDown={e=>e.stopPropagation()}
          onPointerDown={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()}
          style={{ position:"fixed", inset:0, zIndex:99999, background:"rgba(2,6,23,0.72)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"72px 12px 18px" }}>
          <div style={{ width:"min(560px,100%)", maxHeight:"calc(100vh - 96px)", display:"flex", flexDirection:"column", border:`1px solid ${th.borderMid}`, borderRadius:16, background:th.bgCard, boxShadow:"0 18px 60px rgba(0,0,0,0.35)", overflow:"hidden" }}>
            <div style={{ padding:12, borderBottom:`1px solid ${th.border}` }}>
              <div style={{ position:"relative" }}>
                <input
                  ref={supplierPickerInputRef}
                  style={{ ...s.inp, paddingLeft:34, paddingRight:44 }}
                  value={supplierPickerQuery}
                  autoComplete="off"
                  inputMode="search"
                  placeholder={lang==="bn"?"ভেন্ডর নাম বা নম্বর দিয়ে খুঁজুন":"Search vendor by name or number"}
                  onChange={e=>setSupplierPickerQuery(e.target.value)}
                  onInput={e=>setSupplierPickerQuery(e.currentTarget.value)}
                  onKeyDown={e=>e.stopPropagation()}
                />
                <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", fontSize:14, pointerEvents:"none", color:th.txtMuted }}>🔍</span>
                <button
                  type="button"
                  onClick={closeOrderSupplierPicker}
                  style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", width:28, height:28, borderRadius:14, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtMuted, cursor:"pointer" }}>
                  ✕
                </button>
              </div>
            </div>
            <div style={{ overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
              {supplierPickerResults.length===0&&(
                <div style={{ padding:"12px", fontSize:12, color:th.txtMuted }}>
                  {lang==="bn"?"কোনো ভেন্ডর পাওয়া যায়নি":"No vendor found"}
                </div>
              )}
              {supplierPickerResults.map(supplier=>(
                <button
                  key={supplier.id}
                  type="button"
                  onClick={(event)=>{
                    event.stopPropagation();
                    selectOrderSupplierFromPicker(supplier.id);
                  }}
                  style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"12px", border:"none", borderTop:`1px solid ${th.border}`, background:supplier.id===supplierPickerSelectedId?th.accentDim:"transparent", color:th.txtPrimary, cursor:"pointer", textAlign:"left", fontFamily:"inherit" }}>
                  <span style={{ minWidth:0 }}>
                    <span style={{ fontSize:13, fontWeight:800 }}>{supplier.name}</span>
                    <span style={{ fontSize:10, color:"#f97316", marginLeft:6 }}>{supplier.source}</span>
                  </span>
                  <span style={{ fontSize:11, color:th.txtMuted, whiteSpace:"nowrap" }}>{supplier.phone?`+${supplier.phone}`:"No number"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {priceEditorTarget&&(
        <div
          onClick={e=>e.stopPropagation()}
          onMouseDown={e=>e.stopPropagation()}
          onPointerDown={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()}
          style={{ position:"fixed", inset:0, zIndex:99999, background:"rgba(2,6,23,0.72)", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"88px 12px 18px" }}>
          <div style={{ width:"min(420px,100%)", border:`1px solid ${th.borderMid}`, borderRadius:16, background:th.bgCard, boxShadow:"0 18px 60px rgba(0,0,0,0.35)", padding:14 }}>
            <div style={{ fontSize:14, fontWeight:900, color:th.txtPrimary, marginBottom:10 }}>
              {lang==="bn"?"Company price":"Company price"}
            </div>
            <input
              ref={priceEditorInputRef}
              style={{ ...s.inp, marginBottom:10 }}
              value={priceEditorValue}
              inputMode="decimal"
              autoComplete="off"
              placeholder={t.price}
              onChange={e=>setPriceEditorValue(e.target.value)}
              onInput={e=>setPriceEditorValue(e.currentTarget.value)}
              onKeyDown={e=>{
                e.stopPropagation();
                if (e.key === "Enter") savePriceEditor();
                if (e.key === "Escape") closePriceEditor();
              }}
            />
            <div style={{ display:"flex", gap:8 }}>
              <button type="button" style={{ ...s.stBtn, flex:1 }} onClick={closePriceEditor}>{lang==="bn"?"বন্ধ":"Cancel"}</button>
              <button type="button" style={{ ...s.savBtn, flex:1 }} onClick={savePriceEditor}>{t.save}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
