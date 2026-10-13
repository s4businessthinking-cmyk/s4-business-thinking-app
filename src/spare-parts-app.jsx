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
import { DEFAULT_PERMISSIONS, piN2, piR2, nsmatch, piFmt2, PI_VOUCHER_METHODS, AutoTA, PARTY_CODE, partyCodeNumber, reserveShopSerial, formatPartyCode, deviceSerialTag, STOCK_AFFECTING_INVOICE_STATUSES, billLeaveGuard, applyInvoiceStockEffect, unlinkedStockOk, voucherParties, toVoucherView, nsq, nextPartyCode } from "./shared/appShared.jsx";
import { generatePaymentVoucherHTML, generateSalesInvoiceHTML, printPaymentVoucher, siUnitOptionsFor, productRatesEnabled, SI_PAY } from "./sales-invoice/salesInvoiceShared.js";
import { SalesInvoiceTab } from "./sales-invoice/SalesInvoiceTab.jsx";

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

const LOGO_URL = s4LogoUrl;
const APP_NAME = "S4 Business Thinking";

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

// ─── THEME PALETTES ──────────────────────────────────────────
const THEMES = {
  dark: {
    bgRoot:"#071427",
    bgCard:"#132238",
    bgInp:"#1e3350",
    bgSel:"#172a44",
    bgHdr:"#132238",
    bgSidebar:"#0f2a4f",
    bgOiCard:"#14243a",
    border:"#34506f",
    borderMid:"#4f6f92",
    txtPrimary:"#f8fafc",
    txtSecondary:"#dbeafe",
    txtMuted:"#b6c7df",
    txtFaint:"#8fa8c6",
    accent:"#60a5fa",
    accentDim:"#0b3b6a",
  },
  light: {
    bgRoot:"#eef6ff", bgCard:"#ffffff", bgInp:"#f8fbff", bgSel:"#ffffff",
    bgHdr:"#ffffff", bgSidebar:"#ffffff", bgOiCard:"#f8fbff",
    border:"#dbeafe", borderMid:"#bfdbfe",
    txtPrimary:"#0f172a", txtSecondary:"#1e293b", txtMuted:"#475569", txtFaint:"#64748b",
    accent:"#2563eb", accentDim:"#dbeafe",
  },
  // Product Master's Windows/ERP skin; applied to every menu on mobile.
  erp: {
    bgRoot:"#f3e6c8", bgCard:"#fbf5e6", bgInp:"#ffffff", bgSel:"#ffffff",
    bgHdr:"#d9e7f7", bgSidebar:"#d9e7f7", bgOiCard:"#fffaf0",
    border:"#b9c5d6", borderMid:"#7d94b7",
    txtPrimary:"#07101c", txtSecondary:"#1f2937", txtMuted:"#475569", txtFaint:"#64748b",
    accent:"#315eb8", accentDim:"#d4e3f4",
  },
  erpDark: {
    bgRoot:"#121b29", bgCard:"#1b2738", bgInp:"#0d1522", bgSel:"#0d1522",
    bgHdr:"#16243a", bgSidebar:"#16243a", bgOiCard:"#18233a",
    border:"#2f4766", borderMid:"#4f6f92",
    txtPrimary:"#f8fafc", txtSecondary:"#dbeafe", txtMuted:"#b6c7df", txtFaint:"#8fa8c6",
    accent:"#6b9cf0", accentDim:"#1e3a68",
  },
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

// ─── HEADER ──────────────────────────────────────────────────
function Header({ t, lang, setLang, children, isDesktop, s, theme, setTheme, shopName, personName, rightSlot, onBack }) {
  const _s = s || _globalS;
  const [titleFx, setTitleFx] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTitleFx(v => (v + 1) % 4), 2400);
    return () => clearInterval(timer);
  }, []);
  const titleStyle = { ..._s.title3dBase, ..._s.title3dVariants[titleFx] };
  return (
    <div style={_s.hdr}>
      <style>{`
        @keyframes s4TitleFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-1px) scale(1.015); }
        }
        @keyframes s4TitleShine {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes s4TitleGlowPulse {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(96,165,250,.55)); }
          50% { filter: drop-shadow(0 0 10px rgba(96,165,250,.95)); }
        }
      `}</style>
      <div style={{ ..._s.hLeft, ...(shopName ? { minWidth:0, flex:"1 1 auto" } : {}) }}>
        {onBack && (
          <button type="button" onClick={onBack} title={lang==="bn"?"পেছনে":"Back"}
            style={{ height:38, padding:"0 10px", borderRadius:10, border:`1px solid ${theme==="dark"?"#3f3f46":"#cbd5e1"}`, background:theme==="dark"?"#27272a":"#f1f5f9", color:theme==="dark"?"#f4f4f5":"#0f172a", fontSize:15, fontWeight:900, cursor:"pointer", flexShrink:0, fontFamily:"inherit" }}>
            ← {lang==="bn"?"পেছনে":"Back"}
          </button>
        )}
        <img src={LOGO_URL} alt="S4" style={_s.headerLogo} />
        {shopName ? (
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:isDesktop?20:15, fontWeight:900, lineHeight:1.15, letterSpacing:-0.3, color:theme==="dark"?"#f8fafc":"#0f172a", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              🏪 {shopName}
            </div>
            <div style={{ ..._s.sub, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              {personName && <span style={{ color:"#3b82f6", fontWeight:800 }}>👤 {personName.toUpperCase()}</span>}
              {personName && " · "}{APP_NAME}
            </div>
          </div>
        ) : (
          <div>
            <div className="s4-live-3d-title" style={titleStyle}>{APP_NAME}</div>
            <div style={_s.sub}>{t.appSub}</div>
          </div>
        )}
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        {rightSlot}
        {!rightSlot && setTheme && (
          <button
            onClick={() => setTheme(theme==="dark"?"light":"dark")}
            title={theme==="dark"?"Light Mode":"Dark Mode"}
            style={{
              width:34, height:34, borderRadius:8,
              border:`1px solid ${theme==="dark"?"#3f3f46":"#cbd5e1"}`,
              background:theme==="dark"?"#27272a":"#f1f5f9",
              cursor:"pointer", fontSize:16, display:"flex",
              alignItems:"center", justifyContent:"center",
              flexShrink:0, transition:"all 0.2s",
            }}>
            {theme==="dark" ? "☀️" : "🌙"}
          </button>
        )}
        {!rightSlot && (
          <div style={_s.langSw}>
            <button style={{ ..._s.lBtn, ...(lang==="bn"?_s.lBtnA:{}) }} onClick={() => setLang("bn")}>বাং</button>
            <button style={{ ..._s.lBtn, ...(lang==="en"?_s.lBtnA:{}) }} onClick={() => setLang("en")}>EN</button>
          </div>
        )}
        {!isDesktop && children}
      </div>
    </div>
  );
}

// ─── SETUP ───────────────────────────────────────────────────
function SetupScreen({ t, lang, setLang, s:sp, theme, setTheme }) {
  const _s = sp||_globalS;
  return (
    <div style={_s.root}><Header t={t} lang={lang} setLang={setLang} s={_s} theme={theme} setTheme={setTheme} />
      <div style={_s.authWrap}>
        <div style={_s.authIcon}>🔥</div>
        <div style={{ ..._s.authTitle, color:"#f97316" }}>Firebase Setup Required</div>
        <div style={_s.authSub}>SETUP.md ফাইল দেখে Firebase config যোগ করুন।</div>
      </div>
    </div>
  );
}

// ─── LOGIN ───────────────────────────────────────────────────
function LoginScreen({ t, lang, setLang, toast, s:sp, theme, setTheme, onLoginSuccess, onSwitchToSignup, onEmailVerificationRequired }) {
  const _s = sp||_globalS;
  const [username,setUsername]=useState("");
  const [pw,setPw]=useState("");
  const [busy,setBusy]=useState(false);
  const [showPw,setShowPw]=useState(false);
  const submit = async (e) => {
    e?.preventDefault?.();
    if (!username.trim()||!pw) {
      return toast(lang==="bn"?"ইউজারনেম/ইমেইল ও পাসওয়ার্ড দিন":"Username/email and password required","err");
    }
    setBusy(true);
    try {
      const result = await loginWithCredentials(username.trim(), pw);
      if (!result.ok) {
        if (result.reason === "EMAIL_NOT_VERIFIED" && result.rawFirebaseUser) {
          onEmailVerificationRequired(result.rawFirebaseUser);
          return;
        }
        toast(friendlyLocalAuthError(result, lang), "err");
        return;
      }
      onLoginSuccess(result);
    } catch(err) {
      const msg = err?.code === "permission-denied"
        ? (lang==="bn" ? "সাময়িক সার্ভার সমস্যা হয়েছে — আবার Login করুন" : "Temporary server issue — please try logging in again")
        : (err?.message || String(err));
      toast(msg, "err");
    } finally { setBusy(false); }
  };
  return (
    <div
  style={{
    ..._s.root,
    minHeight: "100vh",
    backgroundImage:
      "linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.60)), url('https://raw.githubusercontent.com/s4businessthinking-cmyk/S4BUSINESSTHINKING/main/WhatsApp%20Image%202026-04-09%20at%2011.44.45%20AM.jpeg')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  }}
>
  <Header t={t} lang={lang} setLang={setLang} s={_s} theme={theme} setTheme={setTheme} />
      <div style={_s.authWrap}>
        <img src={LOGO_URL} alt={APP_NAME} style={_s.bigLogo} />
        <div style={_s.authTitle}>{t.welcomeBack}</div>
        <div style={_s.authSub}>{t.welcomeBackSub}</div>
        <form onSubmit={submit} style={_s.authCard}>
          <input style={{ ..._s.inp, marginBottom:10 }} type="text" placeholder={t.usernameOrEmailLbl} value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" />
          <input style={{ ..._s.inp, marginBottom:6 }} type={showPw?"text":"password"} placeholder={t.passwordLbl} value={pw} onChange={e=>setPw(e.target.value)} autoComplete="current-password" />
          <label style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12, cursor:"pointer", userSelect:"none" }}>
            <input type="checkbox" checked={showPw} onChange={e=>setShowPw(e.target.checked)} style={{ width:15, height:15, cursor:"pointer", accentColor:"#f97316" }} />
            <span style={{ fontSize:12, color:"#71717a" }}>{lang==="bn"?"পাসওয়ার্ড দেখুন":"Show Password"}</span>
          </label>
          <button type="submit" style={_s.sendBtn} disabled={busy}>{busy?t.loggingIn:t.signIn}</button>
        </form>
        <div style={{ ..._s.authSub, marginTop:14, fontSize:11, color:"#a1a1aa", lineHeight:1.5 }}>{t.loginOfflineHint}</div>
        <div style={{ ..._s.authSub, marginTop:6, fontSize:11, color:"#a1a1aa", lineHeight:1.5 }}>{t.loginStaffHint}</div>
        <div style={{ ..._s.authFooter, marginTop:16 }}>{t.noAccount}{" "}
          <button type="button" style={_s.linkBtnInline} onClick={onSwitchToSignup}>{t.createAccount}</button>
        </div>
      </div>
    </div>
  );
}

// ─── CHANGE PASSWORD (bootstrap / forced) ────────────────────
function ChangePasswordScreen({ t, lang, setLang, profile, toast, s:sp, theme, setTheme, onPasswordChanged, onLogout }) {
  const _s = sp||_globalS;
  const [newPw,setNewPw]=useState("");
  const [newPw2,setNewPw2]=useState("");
  const [busy,setBusy]=useState(false);
  const [showPw,setShowPw]=useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!newPw || !newPw2) {
      return toast(lang==="bn"?"নতুন পাসওয়ার্ড দিন":"Enter a new password","err");
    }
    if (!isAcceptablePassword(newPw)) {
      return toast(friendlyAuthError({ code:"validation/short-password" }, lang), "err");
    }
    if (newPw !== newPw2) {
      return toast(friendlyAuthError({ code:"validation/password-mismatch" }, lang), "err");
    }
    setBusy(true);
    try {
      const updatedUser = await updateLocalUserPassword(profile.localUserId, newPw, {
        mustChangePassword: false,
        clearEmergencyBootstrap: true,
      });
      toast(t.changePwSaved);
      onPasswordChanged(updatedUser);
    } catch(err) {
      toast(err?.message || String(err), "err");
    } finally { setBusy(false); }
  };

  return (
    <div style={_s.root}>
      <Header t={t} lang={lang} setLang={setLang} s={_s} theme={theme} setTheme={setTheme} />
      <div style={_s.authWrap}>
        <div style={_s.authIcon}>🔐</div>
        <div style={_s.authTitle}>{t.changePwTitle}</div>
        <div style={_s.authSub}>{t.changePwSub}</div>
        <form onSubmit={submit} style={_s.authCard}>
          <input style={{ ..._s.inp, marginBottom:10 }} type={showPw?"text":"password"} placeholder={t.passwordLbl} value={newPw} onChange={e=>setNewPw(e.target.value)} autoComplete="new-password" />
          <input style={{ ..._s.inp, marginBottom:6 }} type={showPw?"text":"password"} placeholder={t.confirmPwLbl} value={newPw2} onChange={e=>setNewPw2(e.target.value)} autoComplete="new-password" />
          <label style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12, cursor:"pointer", userSelect:"none" }}>
            <input type="checkbox" checked={showPw} onChange={e=>setShowPw(e.target.checked)} style={{ width:15, height:15, cursor:"pointer", accentColor:"#f97316" }} />
            <span style={{ fontSize:12, color:"#71717a" }}>{lang==="bn"?"পাসওয়ার্ড দেখুন":"Show Password"}</span>
          </label>
          <button type="submit" style={_s.sendBtn} disabled={busy}>{busy?"...":t.changePwBtn}</button>
        </form>
        <button style={{ ..._s.linkBtn, marginTop:16 }} onClick={onLogout}>{t.logout}</button>
      </div>
    </div>
  );
}

// ─── SHOP SETUP (first-time owner) ───────────────────────────
function ShopSetupWizard({ t, lang, setLang, localShop, shopId, profile, user, toast, s:sp, theme, setTheme, onShopSaved }) {
  const _s = sp||_globalS;
  const [form, setForm] = useState({
    companyName: localShop?.companyName || "",
    mobile: localShop?.mobile || profile?.mobile || "",
    email: localShop?.email || profile?.email || "",
    area: localShop?.area || profile?.area || "",
    country: localShop?.country || profile?.country || "BD",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.companyName.trim() || !form.mobile.trim() || !form.area.trim()) {
      return toast(lang==="bn"?"দোকানের নাম, মোবাইল ও এলাকা দিন":"Shop name, mobile and area are required","err");
    }

    setBusy(true);
    try {
      const countryObj = COUNTRIES.find(c => c.code === form.country);
      const updated = await saveShopRecord(
        shopId,
        {
          companyName: form.companyName.trim(),
          ownerName: profile?.personName || localShop?.ownerName || "",
          mobile: form.mobile.trim(),
          email: form.email.trim(),
          area: form.area.trim(),
          country: form.country,
          countryName: countryObj?.name || form.country,
        },
        { ownerUid: user?.uid, profile, user }
      );
      toast(lang==="bn"?"✅ দোকান সেটআপ সম্পন্ন!":"✅ Shop setup complete!");
      onShopSaved(updated);
    } catch (err) {
      toast(err?.message || String(err), "err");
    } finally {
      setBusy(false);
    }
  };

  const sinp = { ..._s.inp, marginBottom: 10, width: "100%", boxSizing: "border-box" };

  return (
    <div style={_s.root}>
      <Header t={t} lang={lang} setLang={setLang} s={_s} theme={theme} setTheme={setTheme} />
      <div style={_s.authWrap}>
        <div style={_s.authIcon}>🏢</div>
        <div style={_s.authTitle}>{t.shopSetupTitle}</div>
        <div style={_s.authSub}>{t.shopSetupSub}</div>
        <form onSubmit={submit} style={_s.authCard}>
          <input style={sinp} placeholder={t.companyName} value={form.companyName} onChange={e=>setForm(p=>({...p,companyName:e.target.value}))} />
          <select style={{ ..._s.sel, marginBottom: 10, width: "100%" }} value={form.country} onChange={e=>setForm(p=>({...p,country:e.target.value}))}>
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.dial})</option>)}
          </select>
          <input style={sinp} placeholder={t.areaLbl} value={form.area} onChange={e=>setForm(p=>({...p,area:e.target.value}))} />
          <input style={sinp} type="tel" placeholder={t.mobileLbl} value={form.mobile} onChange={e=>setForm(p=>({...p,mobile:e.target.value}))} />
          <input style={sinp} type="email" placeholder={lang==="bn"?"ইমেইল (ঐচ্ছিক)":"Email (optional)"} value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} />
          <button type="submit" style={_s.sendBtn} disabled={busy}>{busy?"...":t.shopSetupBtn}</button>
        </form>
      </div>
    </div>
  );
}

// ─── PASSWORD RESET ──────────────────────────────────────────
function ResetScreen({ t, lang, setLang, onBack, toast, s:sp, theme, setTheme }) {
  const _s = sp||_globalS;
  const [email,setEmail]=useState(""); const [busy,setBusy]=useState(false);
  const submit = async (e) => {
    e?.preventDefault?.();
    if (!email.trim()) return toast(friendlyAuthError({code:"validation/required"},lang),"err");
    setBusy(true);
    try { await sendPasswordResetEmail(auth,email.trim()); toast(t.resetSent); setTimeout(onBack,2000); }
    catch(err) { toast(friendlyAuthError(err,lang),"err"); }
    finally { setBusy(false); }
  };
  return (
    <div style={_s.root}><Header t={t} lang={lang} setLang={setLang} s={_s} theme={theme} setTheme={setTheme} />
      <div style={_s.authWrap}>
        <div style={_s.authIcon}>🔑</div>
        <div style={_s.authTitle}>{t.resetTitle}</div>
        <div style={_s.authSub}>{t.resetMsg}</div>
        <form onSubmit={submit} style={_s.authCard}>
          <input style={{ ..._s.inp, marginBottom:10 }} type="email" placeholder={t.emailLbl} value={email} onChange={e=>setEmail(e.target.value)} />
          <button type="submit" style={_s.sendBtn} disabled={busy}>{busy?"...":t.resetBtn}</button>
        </form>
        <button style={{ ..._s.linkBtn, marginTop:16 }} onClick={onBack}>{t.backBtn}</button>
      </div>
    </div>
  );
}

// ─── ROLE PICKER ─────────────────────────────────────────────
function SignupRolePicker({ t, lang, setLang, onPick, onSwitchToLogin, s:sp, theme, setTheme }) {
  const _s = sp||_globalS;
  return (
    <div style={_s.root}><Header t={t} lang={lang} setLang={setLang} s={_s} theme={theme} setTheme={setTheme} />
      <div style={_s.authWrap}>
        <img src={LOGO_URL} alt={APP_NAME} style={_s.bigLogo} />
        <div style={_s.authTitle}>{t.chooseRole}</div>
        <div style={_s.authSub}>{t.chooseRoleSub}</div>
        <div style={{ ..._s.roleGrid, marginTop:24 }}>
          <button style={_s.roleCard} onClick={() => onPick("owner")}>
            <div style={_s.roleEmoji}>🏢</div>
            <div style={_s.roleName}>{t.roleOwnerCard}</div>
            <div style={_s.roleDesc}>{t.roleOwnerDesc}</div>
          </button>
          <button style={_s.roleCard} onClick={() => onPick("salesman")}>
            <div style={_s.roleEmoji}>👨‍💼</div>
            <div style={_s.roleName}>{t.roleSalesCard}</div>
            <div style={_s.roleDesc}>{t.roleSalesDesc}</div>
          </button>
        </div>
        <div style={{ ..._s.authFooter, marginTop:24 }}>{t.haveAccount}{" "}
          <button style={_s.linkBtnInline} onClick={onSwitchToLogin}>{t.loginNow}</button>
        </div>
      </div>
    </div>
  );
}

// ─── SIGNUP FORM ─────────────────────────────────────────────
function SignupForm({ t, lang, setLang, role, onBack, onSwitchToLogin, toast, s:sp, theme, setTheme, onSignupSuccess, onEmailVerificationRequired }) {
  const _s = sp||_globalS;
  const [companyName,setCompanyName]=useState("");
  const [personName,setPersonName]=useState("");
  const [username,setUsername]=useState("");
  const [country,setCountry]=useState("BD");
  const [area,setArea]=useState("");
  const [mobile,setMobile]=useState("");
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [pw2,setPw2]=useState("");
  const [inviteCode,setInviteCode]=useState("");
  const [busy,setBusy]=useState(false);
  const [showPw,setShowPw]=useState(false);
  const [emailCode,setEmailCode]=useState("");
  const [codeSentTo,setCodeSentTo]=useState("");
  const [resendIn,setResendIn]=useState(0);
  const isOwner = role==="owner";
  const bnL = lang==="bn";
  const cleanEmail = email.trim().toLowerCase();
  const codeStep = !!codeSentTo && codeSentTo===cleanEmail;

  useEffect(()=>{
    if (resendIn<=0) return undefined;
    const tm = setTimeout(()=>setResendIn(n=>n-1),1000);
    return ()=>clearTimeout(tm);
  },[resendIn]);

  // Returns true when sign-up may go ahead without a code (server has no email set up yet).
  const sendCode = async () => {
    try {
      const res = await requestSignupCode(cleanEmail);
      if (res?.required===false) return true;
      setCodeSentTo(cleanEmail);
      setEmailCode("");
      setResendIn(60);
      toast(bnL?`📧 ${cleanEmail} এ ৬ সংখ্যার কোড পাঠানো হয়েছে`:`📧 A 6-digit code was sent to ${cleanEmail}`);
      return false;
    } catch(err) {
      if (err?.code==="auth/not-found") return true;
      if (err?.code==="auth/code-resend-too-soon") toast(bnL?"এক মিনিট পর আবার কোড চান":"Wait a minute before asking for another code","err");
      else if (err?.code==="auth/invalid-email") toast(bnL?"সঠিক ইমেইল দিন":"Enter a valid email","err");
      else toast(friendlyAuthError(err,lang),"err");
      return false;
    }
  };

  const resend = async () => {
    setBusy(true);
    try { await sendCode(); } finally { setBusy(false); }
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!personName.trim()||!username.trim()||!pw||!pw2||!mobile.trim()||!area.trim()||!cleanEmail)
      return toast(friendlyAuthError({code:"validation/required"},lang),"err");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
      return toast(bnL?"সঠিক ইমেইল দিন":"Enter a valid email","err");
    if (isOwner&&!companyName.trim())
      return toast(friendlyAuthError({code:"validation/required"},lang),"err");
    if (!isOwner&&!inviteCode.trim())
      return toast(friendlyAuthError({code:"invite/required"},lang),"err");
    if (pw.length<6) return toast(friendlyAuthError({code:"validation/short-password"},lang),"err");
    if (pw!==pw2) return toast(friendlyAuthError({code:"validation/password-mismatch"},lang),"err");
    if (codeStep&&!/^\d{6}$/.test(emailCode))
      return toast(bnL?"ইমেইলে আসা ৬ সংখ্যার কোড দিন":"Enter the 6-digit code from the email","err");
    setBusy(true);
    if (!codeStep && !(await sendCode())) { setBusy(false); return; }
    try {
      const countryObj = COUNTRIES.find(c=>c.code===country);
      const payload = {
        username: username.trim(),
        password: pw,
        personName: personName.trim(),
        country,
        countryName: countryObj?.name || country,
        area: area.trim(),
        mobile: mobile.trim(),
        email: cleanEmail,
        emailCode: codeStep ? emailCode : "",
      };

      const result = isOwner
        ? await registerLocalOwnerAccount({
            ...payload,
            companyName: companyName.trim(),
          })
        : await registerLocalSalesmanAccount({
            ...payload,
            inviteCode: inviteCode.trim(),
            permissions: { ...DEFAULT_PERMISSIONS },
          });

      if (!result.ok) {
        if (result.code === "invite/already-used") {
          toast(lang==="bn"?"❌ এই Invite Code আগেই ব্যবহার হয়ে গেছে। মালিকের কাছ থেকে নতুন code নিন।":"❌ This invite code has already been used. Please get a new one from the owner.","err");
        } else if (result.code === "invite/not-found") {
          toast(lang==="bn"?"❌ Invite Code সঠিক নয়":"❌ Invalid invite code","err");
        } else {
          toast(result.message || friendlyLocalAuthError(result, lang), "err");
        }
        return;
      }

      if (result.needsEmailVerification && result.rawFirebaseUser && onEmailVerificationRequired) {
        toast(t.n11);
        onEmailVerificationRequired(result.rawFirebaseUser);
        return;
      }

      toast(t.n9);
      onSignupSuccess(result);
    } catch(err) {
      if (err.code === "invite/already-used") {
        toast(lang==="bn"?"❌ এই Invite Code আগেই ব্যবহার হয়ে গেছে। মালিকের কাছ থেকে নতুন code নিন।":"❌ This invite code has already been used. Please get a new one from the owner.","err");
      } else if (err.code === "invite/not-found") {
        toast(lang==="bn"?"❌ Invite Code সঠিক নয়":"❌ Invalid invite code","err");
      } else if (err.code === "OFFLINE_REQUIRED") {
        toast(friendlyLocalAuthError({ reason: "OFFLINE_REQUIRED" }, lang), "err");
      } else if (err.code === "auth/email-already-in-use") {
        toast(friendlyAuthError(err, lang), "err");
      } else if (err.code === "auth/invalid-email-code") {
        setEmailCode("");
        toast(bnL?"❌ কোড ভুল — ইমেইলের কোডটা আবার দেখে দিন":"❌ Wrong code — check the email again","err");
      } else if (err.code === "auth/email-code-expired") {
        setCodeSentTo("");
        toast(bnL?"কোডের মেয়াদ শেষ — আবার \"অ্যাকাউন্ট তৈরি\" চাপুন, নতুন কোড যাবে":"The code expired — press Create account again for a new code","err");
      } else {
        toast(err?.message || friendlyAuthError(err,lang),"err");
      }
    }
    finally { setBusy(false); }
  };

  return (
    <div style={_s.root}><Header t={t} lang={lang} setLang={setLang} s={_s} theme={theme} setTheme={setTheme} />
      <div style={_s.authWrap}>
        <div style={_s.authIcon}>{isOwner?"🏢":"👨‍💼"}</div>
        <div style={_s.authTitle}>{isOwner?t.roleOwnerCard:t.roleSalesCard}</div>
        <form onSubmit={submit} style={_s.authCard}>
          {isOwner && <input style={{ ..._s.inp, marginBottom:10 }} placeholder={t.companyName} value={companyName} onChange={e=>setCompanyName(e.target.value)} />}
          {!isOwner && (
            <>
              <input
                style={{ ..._s.inp, marginBottom:4, textTransform:"uppercase", fontWeight:700, letterSpacing:1 }}
                placeholder="INVITE CODE"
                value={inviteCode}
                onChange={e=>setInviteCode(e.target.value.toUpperCase())}
              />
              <div style={{ fontSize:11, color:"#71717a", marginBottom:10 }}>💡 {t.inviteCodeLbl}</div>
            </>
          )}
          <input style={{ ..._s.inp, marginBottom:10 }} placeholder={t.personName} value={personName} onChange={e=>setPersonName(e.target.value)} />
          <input style={{ ..._s.inp, marginBottom:10 }} type="text" placeholder={t.usernameLbl} value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" />
          <select style={{ ..._s.sel, marginBottom:10, width:"100%" }} value={country} onChange={e=>setCountry(e.target.value)}>
            {COUNTRIES.map(c=><option key={c.code} value={c.code}>{c.name} ({c.dial})</option>)}
          </select>
          <input style={{ ..._s.inp, marginBottom:10 }} placeholder={t.areaLbl} value={area} onChange={e=>setArea(e.target.value)} />
          <input style={{ ..._s.inp, marginBottom:10 }} type="tel" placeholder={t.mobileLbl} value={mobile} onChange={e=>setMobile(e.target.value)} />
          <input style={{ ..._s.inp, marginBottom:10 }} type="email" placeholder={bnL?"ইমেইল (যাচাই কোড যাবে)":"Email (a code will be sent)"} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" />
          <input style={{ ..._s.inp, marginBottom:6 }} type={showPw?"text":"password"} placeholder={t.passwordLbl} value={pw} onChange={e=>setPw(e.target.value)} autoComplete="new-password" />
          <input style={{ ..._s.inp, marginBottom:6 }} type={showPw?"text":"password"} placeholder={t.confirmPwLbl} value={pw2} onChange={e=>setPw2(e.target.value)} autoComplete="new-password" />
          <label style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12, cursor:"pointer", userSelect:"none" }}>
            <input type="checkbox" checked={showPw} onChange={e=>setShowPw(e.target.checked)} style={{ width:15, height:15, cursor:"pointer", accentColor:"#f97316" }} />
            <span style={{ fontSize:12, color:"#71717a" }}>{lang==="bn"?"পাসওয়ার্ড দেখুন":"Show Password"}</span>
          </label>
          {codeStep&&(
            <div style={{ border:"1px solid #bfdbfe", background:"#eff6ff", borderRadius:10, padding:"10px 12px", marginBottom:12 }}>
              <div style={{ fontSize:12, color:"#1e3a8a", fontWeight:700, marginBottom:6 }}>
                📧 {bnL?`${codeSentTo} এ পাঠানো ৬ সংখ্যার কোড দিন (১০ মিনিট চলবে, Spam ফোল্ডারও দেখুন)`:`Enter the 6-digit code sent to ${codeSentTo} (valid 10 min, check spam too)`}
              </div>
              <input style={{ ..._s.inp, marginBottom:6, textAlign:"center", fontSize:22, letterSpacing:8, fontWeight:800 }}
                type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="000000"
                value={emailCode} onChange={e=>setEmailCode(e.target.value.replace(/\D/g,"").slice(0,6))} />
              <button type="button" style={{ ..._s.linkBtn, margin:0, opacity:resendIn>0?0.5:1 }} disabled={busy||resendIn>0} onClick={resend}>
                {resendIn>0?(bnL?`আবার কোড পাঠান (${resendIn}s)`:`Resend code (${resendIn}s)`):(bnL?"আবার কোড পাঠান":"Resend code")}
              </button>
            </div>
          )}
          <button type="submit" style={_s.sendBtn} disabled={busy}>
            {busy?t.creatingAccount:codeStep?t.createAccount:(bnL?"📧 ইমেইল যাচাই করে এগিয়ে যান":"📧 Verify email & continue")}
          </button>
        </form>
        <button style={{ ..._s.linkBtn, marginTop:16 }} onClick={onBack}>{t.backBtn}</button>
        <div style={{ ..._s.authFooter, marginTop:8 }}>{t.haveAccount}{" "}
          <button style={_s.linkBtnInline} onClick={onSwitchToLogin}>{t.loginNow}</button>
        </div>
      </div>
    </div>
  );
}

// ─── VERIFY GATE ─────────────────────────────────────────────
function VerifyGate({ t, lang, setLang, user, toast, onLogout, s:sp, theme, setTheme }) {
  const _s = sp||_globalS;
  const [busy,setBusy]=useState(false);
  const recheck = async () => {
    setBusy(true);
    try { await user.reload(); if (auth.currentUser?.emailVerified) { toast(t.n10); window.location.reload(); } else toast(t.notVerified,"err"); }
    catch(err) { toast(friendlyAuthError(err,lang),"err"); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    setBusy(true);
    try { await sendEmailVerification(auth.currentUser); toast(t.n11); }
    catch(err) { toast(friendlyAuthError(err,lang),"err"); }
    finally { setBusy(false); }
  };
  return (
    <div style={_s.root}><Header t={t} lang={lang} setLang={setLang} s={_s} theme={theme} setTheme={setTheme} />
      <div style={_s.authWrap}>
        <div style={_s.authIcon}>📧</div>
        <div style={_s.authTitle}>{t.verifyTitle}</div>
        <div style={_s.authSub}>{t.verifyMsg}</div>
        <div style={{ ..._s.card, marginTop:16, textAlign:"center" }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#f97316", marginBottom:4 }}>{user.email}</div>
          <div style={{ fontSize:12, color:"#71717a", marginBottom:16 }}>{t.verifyMsg2}</div>
          <button style={{ ..._s.sendBtn, marginBottom:10 }} onClick={recheck} disabled={busy}>{t.verifyCheckBtn}</button>
          <button style={{ ..._s.stBtn, width:"100%" }} onClick={resend} disabled={busy}>{t.resendVerify}</button>
        </div>
        <button style={{ ..._s.linkBtn, marginTop:16 }} onClick={onLogout}>{t.logout}</button>
      </div>
    </div>
  );
}

// ─── PERMISSION TOGGLE ───────────────────────────────────────
function PermToggle({ isOn, onToggle, disabled = false }) {
  return (
    <button disabled={disabled} onClick={onToggle} style={{
      width:42, height:24, borderRadius:12, border:"none", cursor:disabled?"not-allowed":"pointer",
      background:isOn?"#f97316":"#3f3f46", position:"relative", flexShrink:0, transition:"background 0.2s", opacity:disabled?0.65:1,
    }}>
      <span style={{
        position:"absolute", top:3, left:isOn?21:3,
        width:18, height:18, borderRadius:"50%", background:"#fff",
        transition:"left 0.15s", display:"block",
      }} />
    </button>
  );
}

// ─── INVITE CODE ROW ─────────────────────────────────────────
function InviteCodeRow({ c, lang, t, onDelete, th }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(c.code); setCopied(true); setTimeout(()=>setCopied(false),2000); }
    catch { alert(c.code); }
  };
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderTop:`1px solid ${th.border}` }}>
      <span style={{ fontSize:16, fontWeight:800, color:"#f97316", fontFamily:"monospace", flex:1, letterSpacing:2 }}>{c.code}</span>
      <button style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"#1d4ed8", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:700 }}
        onClick={copy}>{copied?(lang==="bn"?"✅ কপি":"✅ Copied"):(lang==="bn"?"📋 কপি":"📋 Copy")}</button>
      <button style={{ padding:"6px 8px", borderRadius:8, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:12 }}
        onClick={()=>onDelete(c.code)}>🗑️</button>
    </div>
  );
}

// ─── PURCHASE INVOICE — CONSTANTS ────────────────────────────
const PI_PREFIX       = "PI-";
const PMT_PREFIX      = "PMT-";
const PI_UNITS        = ["Pcs","Set","Nos","Kg","Ltr","Box","Cm","Mtr","Dz"];
const PI_PAY_METHODS  = {
  cash:   { bn:"নগদ",            en:"Cash",          icon:"💵" },
  bank:   { bn:"ব্যাংক ট্রান্সফার", en:"Bank Transfer",  icon:"🏦" },
  cheque: { bn:"চেক",             en:"Cheque",         icon:"📃" },
  credit: { bn:"বাকি (ক্রেডিট)",  en:"Credit",         icon:"📅" },
};
const VOUCHER_CARD_TYPES = ["Visa", "Mastercard", "American Express", "Debit Card", "Other"];
const PI_CHEQUE_STATUSES = {
  pending:  { bn:"⏳ অপেক্ষমান",      en:"⏳ Pending",  color:"#f59e0b", bg:"#451a03" },
  cleared:  { bn:"✅ ক্লিয়ার হয়েছে",  en:"✅ Cleared",  color:"#22c55e", bg:"#052e16" },
  bounced:  { bn:"❌ বাউন্স হয়েছে",   en:"❌ Bounced",  color:"#ef4444", bg:"#450a0a" },
};
const PI_STATUSES = {
  draft:     { bn:"ড্রাফট",        en:"Draft",     color:"#f59e0b", bg:"#451a03" },
  confirmed: { bn:"নিশ্চিত",       en:"Confirmed", color:"#06b6d4", bg:"#083344" },
  partial:   { bn:"আংশিক পরিশোধ", en:"Partial",   color:"#a855f7", bg:"#2e1065" },
  paid:      { bn:"পরিশোধিত",     en:"Paid",      color:"#22c55e", bg:"#052e16" },
  cancelled: { bn:"বাতিল",        en:"Cancelled", color:"#71717a", bg:"#27272a" },
};
const piToday    = () => localIsoDate();

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
function piCalcLine(it) {
  const qty=piN2(it.qty), cost=piN2(it.unitCost), dp=Math.min(Math.max(piN2(it.discountPerc),0),100), tp=Math.max(piN2(it.taxPerc),0);
  const gross=piR2(qty*cost), disc=piR2(gross*dp/100), base=piR2(gross-disc), tax=piR2(base*tp/100);
  return { gross, disc, tax, total:piR2(base+tax) };
}
function piCalcTotals(items) {
  let sub=0,disc=0,tax=0,grand=0;
  items.forEach(it=>{ const c=piCalcLine(it); sub+=c.gross; disc+=c.disc; tax+=c.tax; grand+=c.total; });
  return { sub:piR2(sub), disc:piR2(disc), tax:piR2(tax), grand:piR2(grand) };
}
function piEmptyLine() {
  return { id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:null, name:"", code:"", brand:"", qty:"", unit:"Pcs", unitCost:"", discountPerc:"0", taxPerc:"5", salePrice:"" };
}
function piEmptyCurrent() {
  return { productId:null, name:"", code:"", brand:"", qty:"", unit:"Pcs", unitCost:"", discountPerc:"0", taxPerc:"5", salePrice:"" };
}
function piEmptyForm() {
  return { invoiceDate:piToday(), supplierInvoiceNo:"", refNo:"", currency:"", exchangeRate:"", vendorId:"", vendorName:"", vendorMobile:"", paymentMethod:"cash", amountPaid:"", note:"" };
}

// ─── PI: PRODUCT PICKER MODAL ─────────────────────────────────
function PiProductPicker({ products, onSelect, onClose, t, th }) {
  const [q,setQ]=useState("");
  const filtered=products.filter(p=>{
    if (!q) return true;
    const hay = [p.name,p.code,p.brand,p.category,p.barcode,...(p.moreBarcodes||[])].filter(Boolean).join(" ");
    return nsmatch(hay, q);
  });
  const inp={ padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:10000, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ width:"100%", maxWidth:600, background:th.bgCard, borderRadius:"16px 16px 0 0", maxHeight:"70vh", display:"flex", flexDirection:"column", border:`1px solid ${th.border}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:`1px solid ${th.border}` }}>
          <span style={{ fontSize:14, fontWeight:700, color:th.txtPrimary }}>{t.pi_fromMaster}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:th.txtMuted, cursor:"pointer", fontSize:20, lineHeight:1 }}>✕</button>
        </div>
        <div style={{ padding:"10px 14px", borderBottom:`1px solid ${th.border}` }}>
          <input autoFocus style={inp} placeholder={t.pi_pmSearchPh} value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <div style={{ overflowY:"auto", flex:1 }}>
          {filtered.length===0&&<div style={{ textAlign:"center", padding:"30px 20px", color:th.txtFaint, fontSize:13 }}>{t.pi_noResults}</div>}
          {filtered.map(p=>(
            <button key={p.id} onClick={()=>onSelect(p)} style={{ width:"100%", textAlign:"left", padding:"12px 16px", background:"transparent", border:"none", borderBottom:`1px solid ${th.border}`, color:th.txtSecondary, cursor:"pointer", fontFamily:"inherit" }}>
              <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{p.name}</div>
              <div style={{ fontSize:11, color:th.txtMuted, marginTop:3, display:"flex", gap:8, flexWrap:"wrap" }}>
                {p.code&&<span>📋 {p.code}</span>}
                {p.brand&&<span>🏷️ {p.brand}</span>}
                {p.category&&<span>🗂️ {p.category}</span>}
                {p.vatExclusive&&<span style={{ color:"#22c55e" }}>{t.cur}{p.vatExclusive}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PI: ITEMS TABLE ──────────────────────────────────────────
function PiItemsTable({ items, lang, onEdit, onDelete, editId }) {
  const bn = lang==="bn";
  return (
    <div className="pm-table-wrap">
      <table className="pm-table">
        <colgroup><col style={{ width:24 }} /><col /><col style={{ width:58 }} /><col style={{ width:66 }} /><col style={{ width:76 }} /></colgroup>
        <thead><tr>
          <th className="si-center">#</th>
          <th>{bn?"পণ্য":"Item"}</th>
          <th className="si-num">{bn?"পরিমাণ":"Qty"}</th>
          <th className="si-num">{bn?"দাম":"Cost"}</th>
          <th className="si-num">{bn?"মোট":"Total"}</th>
        </tr></thead>
        <tbody>
          {items.map((it,i)=>{
            const { disc, tax, total } = piCalcLine(it);
            return (
              <tr key={it.id||i} className={editId&&editId===it.id?"is-editing":undefined}>
                <td className="si-center si-strong">{i+1}</td>
                <td className="si-wrap">
                  <div className="si-strong">{it.name}</div>
                  {(it.code||it.brand)&&<div className="si-muted">{[it.code,it.brand].filter(Boolean).join(" · ")}</div>}
                  {it.batchNo&&<div style={{ color:"#7c3aed", fontWeight:700 }}>📦 {bn?"আলাদা ব্যাচ":"Batch"} {it.batchNo}</div>}
                  {(piN2(it.discountPerc)>0||piN2(it.taxPerc)>0||piN2(it.salePrice)>0)&&(
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {piN2(it.discountPerc)>0&&<span style={{ color:"#b91c1c" }}>{bn?"ছাড়":"Disc"} {it.discountPerc}% (-{piFmt2(disc)})</span>}
                      {piN2(it.taxPerc)>0&&<span style={{ color:"#0e7490" }}>VAT {it.taxPerc}% (+{piFmt2(tax)})</span>}
                      {piN2(it.salePrice)>0&&<span style={{ color:"#15803d", fontWeight:700 }}>{bn?"বিক্রয়":"Sale"} {piFmt2(it.salePrice)}</span>}
                    </div>
                  )}
                  {(onEdit||onDelete)&&(
                    <div className="si-line-tools">
                      {onEdit&&<button type="button" className="pm-btn-secondary" onClick={()=>onEdit(it)}>✏️ {bn?"এডিট":"Edit"}</button>}
                      {onDelete&&<button type="button" className="pm-btn-secondary" style={{ color:"#b91c1c" }} onClick={()=>onDelete(it.id)}>✕ {bn?"মুছুন":"Delete"}</button>}
                    </div>
                  )}
                </td>
                <td className="si-num">{it.qty} <span className="si-muted">{it.unit}</span></td>
                <td className="si-num">{piFmt2(it.unitCost)}</td>
                <td className="si-num si-strong" style={{ color:"#c2410c" }}>{piFmt2(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── EXCEL IMPORT MODAL ──────────────────────────────────────
function ExcelImportModal({ t, lang, th, shopId, user, onClose, onImported,
  type, // "customer" | "vendor"
  columnMap, defaultFields, collection: colName }) {

  const [rows,setRows]         = useState([]);
  const [status,setStatus]     = useState("idle"); // idle|parsing|preview|importing|done
  const [progress,setProgress] = useState(0);
  const [imported,setImported] = useState(0);
  const [skipped,setSkipped]   = useState(0);
  const [error,setError]       = useState("");

  const isBn = lang==="bn";
  const nameKey = type==="customer"?"customerName":"vendorName";
  const cleanVal = (v) => {
    if (v===null||v===undefined) return "";
    const s = String(v).trim();
    if (s==="nan"||s==="NaN"||s==="-"||s==="None"||s==="") return "";
    if (/^\d+\.0$/.test(s)) return s.slice(0,-2); // remove .0
    // Large numbers that might be TRN/phone stored as float
    if (/^\d+\.\d+$/.test(s) && s.length > 8) {
      // Convert float to int string
      try { return String(Math.round(parseFloat(s))); } catch { return s; }
    }
    return s;
  };

  const parseFile = async (file) => {
    setStatus("parsing"); setError("");
    try {
      const XLSX = await import("xlsx");
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type:"array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval:"" });
      if (!data.length) { setError(isBn?"ফাইলে কোনো ডেটা নেই":"No data found in file"); setStatus("idle"); return; }
      setRows(data);
      setStatus("preview");
    } catch(e) {
      setError(String(e)); setStatus("idle");
    }
  };

  const doImport = async () => {
    setStatus("importing"); setProgress(0); setImported(0); setSkipped(0);
    let skip=0;
    const NUMBER_FIELDS = ["creditLimit","openingBalance","paymentTerms","discountPerc"];
    const nameOf = (v) => String(v||"").trim().toLowerCase().replace(/\s+/g," ");
    try {
      // Re-importing the same sheet must not duplicate parties that already exist.
      const existing = await offlineList(colName);
      const seen = new Set((existing.records||[])
        .map(r => r.data||{})
        .filter(d => d.shopId===shopId && d.isDeleted!==true)
        .map(d => nameOf(d[nameKey])));
      const nowIso = new Date().toISOString();
      const records = [];
      rows.forEach((row, i) => {
        const mapped = { ...defaultFields, shopId, createdBy:user.uid, createdAt:nowIso, updatedAt:nowIso, updatedBy:user.uid };
        for (const [xlsCol, dbField] of Object.entries(columnMap)) {
          const v = cleanVal(row[xlsCol]);
          if (v) mapped[dbField] = v;
        }
        NUMBER_FIELDS.forEach(k => {
          if (!(k in mapped)) return;
          const n = Number(String(mapped[k]).replace(/,/g,""));
          mapped[k] = Number.isFinite(n) ? n : 0;
        });
        const key = nameOf(mapped[nameKey]);
        if (!key || seen.has(key)) { skip++; return; }
        seen.add(key);
        mapped.id = `${colName}-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2,8)}`;
        records.push(mapped);
      });
      setProgress(50);
      if (records.length) await offlineBulkUpsert(colName, records);
      const withOpening = records.filter(r => Number(r.openingBalance) > 0);
      let obFailed = 0;
      for (let i = 0; i < withOpening.length; i++) {
        const r = withOpening[i];
        try { await syncOpeningBill({ kind:colName, partyId:r.id, party:r, shopId, uid:user.uid, bn:isBn }); }
        catch (err) { obFailed++; console.warn("[S4 Import] opening bill failed", r.id, err); }
        setProgress(50 + Math.round(((i + 1) / withOpening.length) * 50));
      }
      if (obFailed) window.alert(isBn ? `${obFailed}টি opening balance লেজারে যায়নি — পার্টি খুলে আবার সেভ করুন।` : `${obFailed} opening balance(s) did not reach the ledger — open the party and save it again.`);
      setProgress(100);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] import sync failed", err));
      setStatus("done"); setImported(records.length); setSkipped(skip);
      onImported && onImported(records.length);
    } catch(e) { setError(String(e)); setStatus("preview"); }
  };

  const overlay = { position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 };
  const modal   = { background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:16, padding:24, maxWidth:600, width:"100%", maxHeight:"90vh", overflow:"auto" };
  const btn = (bg,col,onClick,label,disabled=false) => (
    <button onClick={onClick} disabled={disabled}
      style={{ padding:"12px 20px", borderRadius:10, border:"none", background:disabled?"#333":bg, color:col, fontSize:14, fontWeight:700, cursor:disabled?"not-allowed":"pointer" }}>
      {label}
    </button>
  );

  return (
    <div style={overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={modal}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:17, fontWeight:800, color:th.txtPrimary }}>
            {type==="customer"?t.cm_importBtn:t.vm_importBtn}
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:th.txtMuted, fontSize:20, cursor:"pointer" }}>✕</button>
        </div>

        {/* File picker */}
        {(status==="idle"||status==="parsing")&&(
          <div>
            <div style={{ border:`2px dashed ${th.borderMid}`, borderRadius:12, padding:32, textAlign:"center", marginBottom:16 }}>
              <div style={{ fontSize:36, marginBottom:8 }}>📂</div>
              <div style={{ fontSize:14, color:th.txtMuted, marginBottom:16 }}>
                {isBn?"XLS / XLSX ফাইল এখানে টেনে আনুন বা ক্লিক করুন":"Drag & drop XLS/XLSX file or click to browse"}
              </div>
              <label style={{ display:"inline-block", padding:"10px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                {status==="parsing"?(isBn?"পড়া হচ্ছে...":"Reading..."):(isBn?"ফাইল বেছে নিন":"Choose File")}
                <input type="file" accept=".xls,.xlsx" style={{ display:"none" }} disabled={status==="parsing"}
                  onChange={e=>e.target.files[0]&&parseFile(e.target.files[0])} />
              </label>
            </div>
            <div style={{ fontSize:12, color:"#f59e0b", background:"rgba(245,158,11,0.08)", borderRadius:8, padding:"8px 12px" }}>
              ⚠️ {isBn?"Import করলে নতুন রেকর্ড যোগ হবে। একই নামের পুরনো রেকর্ড মুছবে না।":"Import adds new records. Existing records with same name are not deleted."}
            </div>
            {error&&<div style={{ marginTop:10, color:"#ef4444", fontSize:13 }}>❌ {error}</div>}
          </div>
        )}

        {/* Preview */}
        {status==="preview"&&(
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#22c55e", marginBottom:12 }}>
              ✅ {rows.length} {isBn?t.cm_importCount:t.cm_importCount}
            </div>
            <div style={{ overflowX:"auto", marginBottom:16, borderRadius:8, border:`1px solid ${th.border}` }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead>
                  <tr style={{ background:th.bgInp }}>
                    {Object.keys(columnMap).slice(0,6).map(col=>(
                      <th key={col} style={{ padding:"6px 8px", textAlign:"left", color:th.txtMuted, fontWeight:700, whiteSpace:"nowrap", fontSize:10 }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0,5).map((row,i)=>(
                    <tr key={i} style={{ borderTop:`1px solid ${th.border}` }}>
                      {Object.keys(columnMap).slice(0,6).map(col=>(
                        <td key={col} style={{ padding:"5px 8px", color:th.txtPrimary, maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {cleanVal(row[col])||"—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length>5&&<div style={{ fontSize:11, color:th.txtMuted, marginBottom:12 }}>...{isBn?"আরও":"and"} {rows.length-5} {isBn?"টি রেকর্ড":"more records"}</div>}
            <div style={{ display:"flex", gap:10 }}>
              {btn("linear-gradient(135deg,#22c55e,#16a34a)","#fff",doImport, isBn?`✅ ${rows.length} টি ইমপোর্ট করুন`:`✅ Import ${rows.length} records`)}
              {btn("transparent","#a1a1aa",()=>{ setRows([]); setStatus("idle"); }, isBn?"বাতিল":"Cancel")}
            </div>
            {error&&<div style={{ marginTop:10, color:"#ef4444", fontSize:13 }}>❌ {error}</div>}
          </div>
        )}

        {/* Progress */}
        {status==="importing"&&(
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
            <div style={{ fontSize:16, fontWeight:700, color:th.txtPrimary, marginBottom:8 }}>
              {isBn?"ইমপোর্ট হচ্ছে...":"Importing..."}
            </div>
            <div style={{ background:th.bgInp, borderRadius:100, height:8, overflow:"hidden", marginBottom:8 }}>
              <div style={{ background:"#22c55e", height:"100%", width:`${progress}%`, transition:"width 0.3s", borderRadius:100 }} />
            </div>
            <div style={{ fontSize:13, color:"#22c55e", fontWeight:700 }}>{imported} {isBn?"টি সম্পন্ন":"done"}</div>
          </div>
        )}

        {/* Done */}
        {status==="done"&&(
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
            <div style={{ fontSize:18, fontWeight:800, color:"#22c55e", marginBottom:6 }}>
              {isBn?t.cm_importDone:t.cm_importDone}
            </div>
            <div style={{ fontSize:14, color:th.txtMuted, marginBottom:20 }}>
              {imported} {isBn?"টি রেকর্ড ইমপোর্ট হয়েছে":"records imported"}
              {skipped>0&&` · ${skipped} ${isBn?"টি skip":"skipped"}`}
            </div>
            {btn("linear-gradient(135deg,#22c55e,#16a34a)","#fff",onClose,isBn?"✅ বন্ধ করুন":"✅ Close")}
          </div>
        )}
      </div>
    </div>
  );
}

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

function PiSalesmanView({ t, lang, th, shopId, syncRefreshKey=0, showCost=false }) {
  const [invoices,setInvoices]   = useState([]);
  const [loading,setLoading]     = useState(true);
  const [searchQ,setSearchQ]     = useState("");
  const [dateRange,setDateRange] = useState("30"); // 7 | 30 | 90 | "all"
  const authSyncReady = useFirebaseAuthReady();

  // Local-first, then Firebase live listener; always cache to SQLite for offline.
  useEffect(()=>{
    if (!shopId) return;
    setLoading(true);
    let unsub1=()=>{};
    let unsub2=null;
    let cancelled=false;

    const normalize = (d) => ({
      ...d.data(),
      id:d.id,
      createdAt:d.data().createdAt?.toDate?.() || d.data().createdAt || new Date(),
    });

    const sortRows = (rows=[]) => [...rows].sort((a,b)=>
      new Date(b.createdAt||0) - new Date(a.createdAt||0)
    );

    const loadLocal = async () => {
      try {
        const res = await offlineList("purchaseInvoices");
        if (cancelled) return;
        const records = Array.isArray(res) ? res : (res.records || []);
        const rows = sortRows(records
          .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }))
          .filter(inv => inv.shopId === shopId));
        if (rows.length) {
          setInvoices(rows);
          setLoading(false);
        }
      } catch (err) {
        console.warn("[S4 Offline] PiSalesmanView local load failed", err);
      }
    };

    const applyCloud = (rows) => {
      if (cancelled) return;
      setInvoices(sortRows(rows));
      setLoading(false);
      offlineCacheCloudRecords("purchaseInvoices", rows)
        .catch(err => console.warn("[S4 Offline] PiSalesmanView cache failed", err));
    };

    loadLocal();

    if (authSyncReady) {
      const q=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId),orderBy("createdAt","desc"));
      unsub1=onSnapshot(q,snap=>{
        applyCloud(snap.docs.map(normalize));
      },()=>{
        const q2=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId));
        unsub2=onSnapshot(q2,snap=>{
          applyCloud(sortRows(snap.docs.map(normalize)));
        },err2=>{
          console.error(err2);
          loadLocal().finally(()=>{ if (!cancelled) setLoading(false); });
        });
      });
    }
    return ()=>{ cancelled=true; unsub1(); unsub2&&unsub2(); };
  },[shopId,syncRefreshKey,authSyncReady]);

  // flatten all items from all confirmed/paid invoices
  const allItems = [];
  const cutoff = dateRange==="all" ? null : new Date(Date.now() - Number(dateRange)*24*60*60*1000);
  invoices.forEach(inv=>{
    if (!["confirmed","paid","partial"].includes(inv.status)) return;
    if (cutoff) {
      const when = new Date(inv.invoiceDate || inv.createdAt || 0);
      if (!Number.isNaN(when.getTime()) && when < cutoff) return;
    }
    (inv.items||[]).forEach(it=>{
      allItems.push({
        ...it,
        invoiceId:    inv.id,
        invoiceNo:    inv.invoiceNo,
        invoiceDate:  inv.invoiceDate,
        vendorName:   inv.vendorName||"—",
        purchaseDate: inv.createdAt,
      });
    });
  });

  // search filter
  const q = searchQ.trim();
  const filtered = q
    ? allItems.filter(it=>{
        const hay = [it.name,it.code,it.brand].filter(Boolean).join(" ");
        return nsmatch(hay, q);
      })
    : allItems;

  const inp = { padding:"11px 14px", borderRadius:10, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" };
  const dateOpts = [
    { val:"7",   label:t.pi_last7  },
    { val:"30",  label:t.pi_last30 },
    { val:"90",  label:t.pi_last90 },
    { val:"all", label:t.pi_allTime},
  ];

  return (
    <div>
      {/* Title */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:18, fontWeight:900, color:"#f97316" }}>{t.pi_salesmanTitle}</div>
        <div style={{ fontSize:12, color:th.txtMuted, marginTop:3 }}>{t.pi_salesmanSub}</div>
      </div>

      {/* Search */}
      <div style={{ position:"relative", marginBottom:10 }}>
        <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:16, pointerEvents:"none" }}>🔍</span>
        <input style={{ ...inp, paddingLeft:42 }} placeholder={t.pi_searchProduct} value={searchQ} onChange={e=>setSearchQ(e.target.value)} autoFocus />
        {searchQ&&<button onClick={()=>setSearchQ("")} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:th.txtMuted, cursor:"pointer", fontSize:18, lineHeight:1 }}>✕</button>}
      </div>

      {/* Date filter pills */}
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        {dateOpts.map(o=>(
          <button key={o.val} onClick={()=>setDateRange(o.val)} style={{ padding:"6px 14px", borderRadius:20, border:"1px solid", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit", background:dateRange===o.val?"#f97316":"transparent", borderColor:dateRange===o.val?"#f97316":th.borderMid, color:dateRange===o.val?"#fff":th.txtMuted }}>
            {o.label}
          </button>
        ))}
      </div>

      {/* Count */}
      {!loading&&filtered.length>0&&(
        <div style={{ fontSize:11, color:th.txtMuted, marginBottom:10, fontWeight:700 }}>
          {filtered.length}{lang==="bn"?"টি পণ্য পাওয়া গেছে":" products found"}
        </div>
      )}

      {/* Loading */}
      {loading&&<div style={{ textAlign:"center", padding:"60px 20px", color:th.txtFaint }}><div style={{ fontSize:40 }}>⏳</div><div style={{ marginTop:8 }}>{t.pi_loading||"Loading..."}</div></div>}

      {/* Empty */}
      {!loading&&filtered.length===0&&(
        <div style={{ textAlign:"center", padding:"60px 20px", color:th.txtFaint }}>
          <div style={{ fontSize:46, marginBottom:10 }}>📦</div>
          <div>{t.pi_noItemFound}</div>
        </div>
      )}

      {/* Item cards */}
      {!loading&&filtered.map((it,idx)=>{
        // Purchase lines store the sale price VAT-inclusive (seeded from the product's vatInclusive/MRP).
        const saleInc = piN2(it.salePrice);
        const vatPerc = it.taxPerc!=null && String(it.taxPerc).trim()!=="" ? piN2(it.taxPerc) : 5;
        const saleEx  = saleInc / (1 + vatPerc/100);
        const vatAmt  = saleInc - saleEx;
        const margin  = saleEx - piN2(it.unitCost);
        const marginPerc = piN2(it.unitCost)>0 ? (margin/piN2(it.unitCost)*100).toFixed(1) : 0;
        const d = it.purchaseDate instanceof Date ? it.purchaseDate : new Date(it.purchaseDate);
        const dateStr = d.toLocaleDateString(lang==="bn"?"bn-BD":"en-GB",{day:"numeric",month:"short",year:"numeric"});
        return (
          <div key={idx} style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:10, overflow:"hidden" }}>

            {/* Product name + meta */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:17, fontWeight:900, color:th.txtPrimary, lineHeight:1.2, marginBottom:4 }}>{it.name}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center" }}>
                {it.code&&<span style={{ fontSize:12, color:th.txtMuted, background:th.bgInp, padding:"2px 8px", borderRadius:6, fontFamily:"monospace" }}>📋 {it.code}</span>}
                {it.brand&&<span style={{ fontSize:12, color:th.txtMuted, background:th.bgInp, padding:"2px 8px", borderRadius:6 }}>🏷️ {it.brand}</span>}
                <span style={{ fontSize:12, color:"#f59e0b", fontWeight:700 }}>📅 {dateStr}</span>
                <span style={{ fontSize:12, color:th.txtMuted }}>🏭 {it.vendorName}</span>
              </div>
            </div>

            {/* Qty + Purchase price row */}
            <div style={{ display:"grid", gridTemplateColumns:showCost?"1fr 1fr":"1fr", gap:8, marginBottom:10 }}>
              <div style={{ background:th.bgInp, borderRadius:10, padding:"10px 12px" }}>
                <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, letterSpacing:0, marginBottom:4 }}>
                  {lang==="bn"?"📦 ক্রয় পরিমাণ":"📦 Purchased Qty"}
                </div>
                <div style={{ fontSize:20, fontWeight:900, color:"#06b6d4" }}>
                  {it.qty} <span style={{ fontSize:13, color:th.txtMuted }}>{it.unit}</span>
                </div>
              </div>
              {showCost&&(
                <div style={{ background:th.bgInp, borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, letterSpacing:0, marginBottom:4 }}>
                    {t.pi_purchasePrice}
                  </div>
                  <div style={{ fontSize:20, fontWeight:900, color:"#a1a1aa" }}>
                    {t.cur} {piFmt2(it.unitCost)}
                  </div>
                </div>
              )}
            </div>

            {/* Sale price — big prominent box */}
            {saleEx>0 ? (
              <div style={{ background:"linear-gradient(135deg,rgba(34,197,94,0.12),rgba(34,197,94,0.05))", border:"1.5px solid #22c55e", borderRadius:12, padding:"14px 16px" }}>
                <div style={{ fontSize:10, color:"#22c55e", textTransform:"uppercase", fontWeight:700, letterSpacing:0, marginBottom:10 }}>
                  💰 {lang==="bn"?"বিক্রয় মূল্য বিবরণ":"Sale Price Details"}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <span style={{ fontSize:12, color:th.txtMuted }}>{t.pi_saleExVat}</span>
                  <span style={{ fontSize:15, fontWeight:700, color:th.txtPrimary }}>{t.cur} {piFmt2(saleEx)}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:12, color:"#06b6d4" }}>🧾 {t.pi_vatAmount} ({vatPerc}%)</span>
                  <span style={{ fontSize:14, fontWeight:700, color:"#06b6d4" }}>+ {t.cur} {piFmt2(vatAmt)}</span>
                </div>
                <div style={{ height:1, background:"rgba(34,197,94,0.3)", marginBottom:8 }} />
                {/* Total inc VAT — the big number */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:13, fontWeight:800, color:"#22c55e" }}>{t.pi_saleIncVat}</span>
                  <span style={{ fontSize:26, fontWeight:900, color:"#22c55e", letterSpacing:0 }}>{t.cur} {piFmt2(saleInc)}</span>
                </div>
                {/* Margin info */}
                {showCost&&margin>0&&(
                  <div style={{ marginTop:8, padding:"5px 10px", background:"rgba(34,197,94,0.1)", borderRadius:8, display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:11, color:"#22c55e", fontWeight:700 }}>{t.pi_margin}</span>
                    <span style={{ fontSize:12, fontWeight:800, color:"#22c55e" }}>{t.cur} {piFmt2(margin)} ({marginPerc}%)</span>
                  </div>
                )}
              </div>
            ):(
              <div style={{ background:th.bgInp, border:`1px dashed ${th.borderMid}`, borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
                <span style={{ fontSize:12, color:th.txtFaint }}>{lang==="bn"?"বিক্রয় মূল্য সেট করা হয়নি":"Sale price not set"}</span>
              </div>
            )}

            {/* Invoice reference */}
            <div style={{ marginTop:8, fontSize:10, color:th.txtFaint, textAlign:"right" }}>
              {it.invoiceNo}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── PI: PAYMENTS TAB — list of Vendor Payment Vouchers ───────
function PiPaymentsListTab({ payments, loading, t, lang, onOpen, mobile=false }) {
  const bn = lang==="bn";
  const [q,setQ] = useState("");
  const filtered = payments.filter(p=>{
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (p.vendorName||"").toLowerCase().includes(s) || (p.paymentNo||"").toLowerCase().includes(s);
  });
  const total = filtered.reduce((sum,p)=>sum+(p.status==="cancelled"?0:piN2(p.totalAmount)), 0);
  const chequeOf = (v) => v.method==="cheque" && v.status!=="cancelled" ? (PI_CHEQUE_STATUSES[v.chequeStatus]||PI_CHEQUE_STATUSES.pending) : null;
  const statusCell = (v) => {
    if (v.status==="cancelled") return <span className="si-badge" style={{ color:"#b91c1c" }}>{bn?"বাতিল":"Cancelled"}</span>;
    const chq = chequeOf(v);
    return chq ? <span className="si-badge" style={{ color:chq.color }}>{chq[lang]}</span> : null;
  };
  return (
    <>
      <div className="si-filters" style={{ padding:0 }}>
        <div className="si-search">
          <input className="pm-input" placeholder={t.pi_searchVoucherPh} value={q} onChange={e=>setQ(e.target.value)} />
          {q&&<button type="button" aria-label="Clear" onClick={()=>setQ("")}>✕</button>}
        </div>
      </div>
      <div className="si-box" style={{ flex:1 }}>
        {loading ? <div className="si-empty">⏳</div>
          : payments.length===0 ? <div className="si-empty">💳 {t.pi_noVouchers}</div>
          : filtered.length===0 ? <div className="si-empty">🔍 {t.pi_noResults}</div>
          : mobile ? filtered.map(v=>(
            <button key={v.id} type="button" className="si-mrow" style={v.status==="cancelled"?{ opacity:0.6 }:undefined} onClick={()=>onOpen(v)}>
              <div className="si-mrow-top">
                <span style={{ color:"#c2410c" }}>{PI_VOUCHER_METHODS[v.method]?.icon||"💵"} {v.paymentNo}</span>
                <span>{statusCell(v)}</span>
              </div>
              <div className="si-mrow-sub"><span>{v.vendorName||"—"}</span><b style={{ color:"#15803d" }}>{t.cur} {piFmt2(v.totalAmount)}</b></div>
              <div className="si-mrow-sub">
                <span>{v.paymentDate} · {(v.allocations||[]).length} {bn?"টি ইনভয়েস":"invoices"}</span>
                {piN2(v.discountAmount)>0&&<span>{bn?"ছাড়":"Disc"} {piFmt2(v.discountAmount)}</span>}
              </div>
            </button>
          ))
          : (
            <table className="pm-table">
              <colgroup><col style={{ width:100 }} /><col style={{ width:80 }} /><col /><col style={{ width:80 }} /><col style={{ width:60 }} /><col style={{ width:90 }} /><col style={{ width:110 }} /></colgroup>
              <thead><tr>
                <th>{bn?"ভাউচার":"Voucher"}</th><th>{bn?"তারিখ":"Date"}</th><th>{bn?"ভেন্ডর":"Vendor"}</th><th>{bn?"পদ্ধতি":"Method"}</th>
                <th className="si-num">{bn?"ইনভয়েস":"Bills"}</th><th className="si-num">{bn?"টাকা":"Amount"}</th><th>{bn?"স্ট্যাটাস":"Status"}</th>
              </tr></thead>
              <tbody>
                {filtered.map(v=>{
                  const off = v.status==="cancelled";
                  return (
                    <tr key={v.id} className="pm-clickable" style={off?{ opacity:0.6 }:undefined} onClick={()=>onOpen(v)}>
                      <td className="si-strong" style={{ color:"#c2410c" }}>{v.paymentNo}</td>
                      <td>{v.paymentDate}</td>
                      <td title={v.vendorName||""}>{v.vendorName||"—"}</td>
                      <td>{PI_VOUCHER_METHODS[v.method]?.icon||"💵"} {PI_VOUCHER_METHODS[v.method]?.[lang]||v.method||"-"}</td>
                      <td className="si-num">{(v.allocations||[]).length}</td>
                      <td className="si-num si-strong" style={off?{ textDecoration:"line-through" }:{ color:"#15803d" }}>{piFmt2(v.totalAmount)}</td>
                      <td>{statusCell(v)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>
      <div className="si-statusbar" style={{ borderTop:0, padding:"2px 0" }}>
        <span>{bn?"দেখানো":"Showing"}: <b>{filtered.length}</b></span>
        <span>{bn?"মোট":"Total"}: <b>{t.cur} {piFmt2(total)}</b></span>
      </div>
    </>
  );
}

// ─── PI: NEW VENDOR PAYMENT VOUCHER FORM ───────────────────────
// Select a vendor → see all their open invoices → allocate Cash/Cheque payment, full or partial, per invoice.
function PiNewPaymentForm({ vendors, prefillVendorId, getVendorOpenInvoices, saving, onSave, onCancel, t, th, lang, isDesktop }) {
  const [vendorQ,setVendorQ]       = useState("");
  const [vendorDropOpen,setVendorDropOpen] = useState(false);
  const [vendor,setVendor]         = useState(null); // { id, name, mobile }
  const [amounts,setAmounts]       = useState({});   // { [invoiceId]: "123.45" }
  const [method,setMethod]         = useState("cash");
  const [paymentDate,setPaymentDate] = useState(piToday());
  const [note,setNote]             = useState("");
  const [chequeNo,setChequeNo]     = useState("");
  const [chequeBank,setChequeBank] = useState("");
  const [chequeReceivedBy,setChequeReceivedBy] = useState("");
  const [vendorReceiptNo,setVendorReceiptNo] = useState("");
  const [refNo,setRefNo] = useState("");
  const [refBank,setRefBank] = useState("");
  const [chequeDate,setChequeDate] = useState(piToday());
  const [distAmt,setDistAmt]       = useState("");
  const vendorBoxRef = useRef(null);

  // Pre-fill vendor if navigated here from an Invoice or the Supplier Ledger
  useEffect(()=>{
    if (!prefillVendorId || !vendors?.length) return;
    const v = vendors.find(x=>x.id===prefillVendorId || x.vendorName===prefillVendorId);
    if (v) setVendor({ id:v.id, name:v.vendorName, mobile:v.mobileNumber||v.whatsappNumber||"" });
  },[prefillVendorId, vendors]);

  useEffect(()=>{
    const handler=(e)=>{ if (vendorBoxRef.current && !vendorBoxRef.current.contains(e.target)) setVendorDropOpen(false); };
    document.addEventListener("mousedown",handler);
    return ()=>document.removeEventListener("mousedown",handler);
  },[]);

  const openInvoices = vendor ? getVendorOpenInvoices(vendor.id, vendor.name) : [];
  const filteredVendors = (vendors||[]).filter(v=>(v.vendorName||"").toLowerCase().includes(vendorQ.toLowerCase())).slice(0,30);

  const setAmt = (invId,val) => setAmounts(p=>({ ...p, [invId]:val }));
  const payFull = (inv) => setAmt(inv.id, piFmt2(piN2(inv.balanceDue)));

  const totalPayment = Object.values(amounts).reduce((s,v)=>s+piN2(v),0);

  // Auto-distribute a lump sum FIFO across open invoices (oldest first), still editable afterward
  const autoDistribute = () => {
    let remaining = piN2(distAmt);
    if (remaining<=0) return;
    const next = {};
    for (const inv of openInvoices) {
      if (remaining<=0) { next[inv.id]=""; continue; }
      const bal = piN2(inv.balanceDue);
      const give = Math.min(bal, remaining);
      next[inv.id] = give>0 ? piFmt2(give) : "";
      remaining = parseFloat((remaining-give).toFixed(2));
    }
    setAmounts(next);
  };

  const inp=(e={})=>({ padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...e });
  const lbl={ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:4 };

  const handleSave = () => {
    const allocations = openInvoices
      .filter(inv => piN2(amounts[inv.id])>0)
      .map(inv => ({ invoiceId:inv.id, invoiceNo:inv.invoiceNo, supplierInvoiceNo:inv.supplierInvoiceNo||"", invoiceDate:inv.invoiceDate||"", amount:piN2(amounts[inv.id]) }));
    onSave({
      vendorId:vendor?.id||null, vendorName:vendor?.name||"", vendorMobile:vendor?.mobile||"",
      method, paymentDate, note,
      chequeNo: method==="cheque"?chequeNo:"",
      chequeBank: method==="cheque"?chequeBank:"",
      chequeDate: method==="cheque"?chequeDate:"",
      chequeReceivedBy: method==="cheque"?chequeReceivedBy:"",
      vendorReceiptNo,
      refNo: (method==="bank_transfer"||method==="card")?refNo:"",
      refBank: (method==="bank_transfer"||method==="card")?refBank:"",
      refDate: (method==="bank_transfer"||method==="card")?paymentDate:"",
      allocations,
    });
  };

  return (
    <div>
      <button onClick={onCancel} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:13, fontWeight:700, padding:"0 0 14px 0", fontFamily:"inherit" }}>{t.pi_backToPayments}</button>

      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:12 }}>
        <div style={{ fontSize:14, fontWeight:800, color:"#f97316", marginBottom:12 }}>💳 {t.pi_paymentVoucherTitle}</div>

        {/* Vendor selector */}
        <div style={{ marginBottom:14 }}>
          <div style={lbl}>{t.pi_selectVendor}</div>
          {!vendor ? (
            <div ref={vendorBoxRef} style={{ position:"relative" }}>
              <input style={inp()} placeholder={t.pi_searchVendor} value={vendorQ}
                onFocus={()=>setVendorDropOpen(true)} onChange={e=>{ setVendorQ(e.target.value); setVendorDropOpen(true); }} />
              {vendorDropOpen&&filteredVendors.length>0&&(
                <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, maxHeight:240, overflowY:"auto", background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:10, zIndex:50, boxShadow:"0 8px 24px rgba(0,0,0,0.3)" }}>
                  {filteredVendors.map(v=>(
                    <div key={v.id||`name:${v.vendorName}`} onClick={()=>{ setVendor({ id:v.id, name:v.vendorName, mobile:v.mobileNumber||v.whatsappNumber||"" }); setVendorDropOpen(false); setVendorQ(""); }}
                      style={{ padding:"10px 12px", cursor:"pointer", borderBottom:`1px solid ${th.border}`, fontSize:13 }}
                      onMouseEnter={e=>e.currentTarget.style.background=th.bgInp}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{ fontWeight:700, color:th.txtPrimary }}>🏭 {v.vendorName}</div>
                      {(v.mobileNumber||v.whatsappNumber)&&<div style={{ fontSize:11, color:th.txtMuted }}>📱 {v.mobileNumber||v.whatsappNumber}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background:th.bgInp, borderRadius:10, border:`1px solid ${th.border}` }}>
              <div>
                <div style={{ fontSize:13, fontWeight:800, color:th.txtPrimary }}>🏭 {vendor.name}</div>
                {vendor.mobile&&<div style={{ fontSize:11, color:th.txtMuted, marginTop:1 }}>📱 {vendor.mobile}</div>}
              </div>
              <button onClick={()=>{ setVendor(null); setAmounts({}); }} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:"transparent", color:th.txtMuted, fontSize:11, fontWeight:700, cursor:"pointer" }}>{t.pi_changeVendor}</button>
            </div>
          )}
        </div>

        {vendor&&(<>
          {/* Method */}
          <div style={lbl}>{t.pi_paymentMethod}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
            {Object.entries(PI_VOUCHER_METHODS).map(([key,pm])=>(
              <button key={key} onClick={()=>setMethod(key)} style={{ padding:"10px 6px", borderRadius:10, cursor:"pointer", fontFamily:"inherit", border:`1.5px solid ${method===key?"#f97316":th.borderMid}`, background:method===key?"rgba(249,115,22,0.12)":"transparent", color:method===key?"#f97316":th.txtMuted, fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                <span style={{ fontSize:17 }}>{pm.icon}</span><span>{pm[lang]}</span>
              </button>
            ))}
          </div>

          <div style={{ marginBottom:14 }}>
            <div style={lbl}>{t.pi_paymentDate}</div>
            <input type="date" style={inp()} value={paymentDate} onChange={e=>setPaymentDate(e.target.value)} />
          </div>

          {method==="cheque"&&(
            <div style={{ background:"rgba(99,102,241,0.06)", border:"1px solid #6366f1", borderRadius:10, padding:12, marginBottom:14 }}>
              <div style={{ fontSize:11, color:"#818cf8", fontWeight:700, marginBottom:10 }}>📃 {lang==="bn"?"চেকের তথ্য":"Cheque Details"}</div>
              <div style={{ marginBottom:8 }}>
                <div style={lbl}>{t.pi_chequeNo}</div>
                <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="000123" value={chequeNo} onChange={e=>setChequeNo(e.target.value)} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div>
                  <div style={lbl}>{t.pi_chequeBank}</div>
                  <select style={{ ...inp(), background:th.bgCard }} value={chequeBank} onChange={e=>setChequeBank(e.target.value)}>
                    <option value="">{lang==="bn"?"নির্বাচন করুন":"Select bank"}</option>
                    {UAE_BANKS.map(b=><option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={lbl}>{t.pi_chequeDate}</div>
                  <input type="date" style={inp()} value={chequeDate} onChange={e=>setChequeDate(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop:8 }}>
                <div style={lbl}>{lang==="bn"?"চেক গ্রহণকারীর নাম (ঐচ্ছিক)":"Cheque Received By (optional)"}</div>
                <input style={inp()} placeholder={lang==="bn"?"যিনি চেক নিয়েছেন":"Person who took the cheque"} value={chequeReceivedBy} onChange={e=>setChequeReceivedBy(e.target.value)} />
              </div>
            </div>
          )}

          <div style={{ marginBottom:14 }}>
            <div style={lbl}>{lang==="bn"?"ভেন্ডরের রিসিট নম্বর (ঐচ্ছিক)":"Vendor Receipt No. (optional)"}</div>
            <input style={{ ...inp(), fontFamily:"monospace" }} placeholder={lang==="bn"?"ভেন্ডর যে রিসিট দিয়েছে":"Receipt number given by the vendor"} value={vendorReceiptNo} onChange={e=>setVendorReceiptNo(e.target.value)} />
          </div>

          {(method==="bank_transfer"||method==="card")&&(
            <div style={{ background:"rgba(14,165,233,0.06)", border:"1px solid #0ea5e9", borderRadius:10, padding:12, marginBottom:14 }}>
              <div style={{ fontSize:11, color:"#38bdf8", fontWeight:700, marginBottom:10 }}>{PI_VOUCHER_METHODS[method].icon} {method==="card"?(lang==="bn"?"কার্ডের তথ্য":"Card Details"):(lang==="bn"?"ট্রান্সফারের তথ্য":"Transfer Details")}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div>
                  <div style={lbl}>{method==="card"?(lang==="bn"?"অনুমোদন / রেফ নং":"Approval / Ref No"):(lang==="bn"?"রেফারেন্স নং":"Reference No")}</div>
                  <input style={{ ...inp(), fontFamily:"monospace" }} value={refNo} onChange={e=>setRefNo(e.target.value)} />
                </div>
                <div>
                  <div style={lbl}>{method==="card"?(lang==="bn"?"কার্ডের ধরন":"Card Type"):(lang==="bn"?"ব্যাংক":"Bank")}</div>
                  <select style={{ ...inp(), background:th.bgCard }} value={refBank} onChange={e=>setRefBank(e.target.value)}>
                    <option value="">—</option>
                    {(method==="card"?VOUCHER_CARD_TYPES:UAE_BANKS.map(b=>b.name)).map(b=><option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Auto-distribute helper */}
          {openInvoices.length>1&&(
            <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"flex-end" }}>
              <div style={{ flex:1 }}>
                <div style={lbl}>{t.pi_autoDistributeAmt}</div>
                <input style={inp()} inputMode="decimal" placeholder={t.pi_autoDistributePh} value={distAmt} onChange={e=>setDistAmt(e.target.value)} />
              </div>
              <button onClick={autoDistribute} style={{ padding:"10px 14px", borderRadius:8, border:"1px solid #f97316", background:"rgba(249,115,22,0.08)", color:"#f97316", fontSize:12, fontWeight:700, cursor:"pointer", height:42 }}>{t.pi_autoDistribute}</button>
            </div>
          )}

          {/* Open invoices */}
          <div style={lbl}>{t.pi_openInvoices} ({openInvoices.length})</div>
          {openInvoices.length===0&&<div style={{ textAlign:"center", padding:"20px", color:th.txtFaint, fontSize:12 }}>{t.pi_noOpenInvoices}</div>}
          {openInvoices.map(inv=>(
            <div key={inv.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", background:th.bgInp, borderRadius:10, marginBottom:6, border:`1px solid ${th.border}` }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#f97316" }}>🧾 {inv.supplierInvoiceNo||inv.invoiceNo}{inv.supplierInvoiceNo&&<span style={{ fontSize:11, fontWeight:600, color:th.txtMuted }}> · {inv.invoiceNo}</span>}</div>
                <div style={{ fontSize:11, color:th.txtMuted, marginTop:2 }}>📅 {inv.invoiceDate} · {t.pi_balanceDue}: <span style={{ color:"#ef4444", fontWeight:700 }}>{t.cur} {piFmt2(inv.balanceDue)}</span></div>
              </div>
              <input style={{ ...inp(), width:100, flex:"0 0 100px", textAlign:"right", fontWeight:700, color:"#22c55e", borderColor:piN2(amounts[inv.id])>0?"#22c55e":th.borderMid }}
                inputMode="decimal" placeholder="0.00" value={amounts[inv.id]||""} onChange={e=>setAmt(inv.id,e.target.value)} />
              <button onClick={()=>payFull(inv)} style={{ padding:"8px 10px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:"transparent", color:th.txtMuted, fontSize:10, fontWeight:700, cursor:"pointer", flexShrink:0 }}>{t.pi_payFull}</button>
            </div>
          ))}

          {/* Note */}
          <div style={{ marginTop:10, marginBottom:4 }}>
            <div style={lbl}>{t.pi_paymentNote}</div>
            <AutoTA style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:13, outline:"none", resize:"none", overflow:"hidden", minHeight:50, boxSizing:"border-box", fontFamily:"inherit" }}
              placeholder={t.pi_paymentNotePh} value={note} onChange={e=>setNote(e.target.value)} />
          </div>
        </>)}
      </div>

      {vendor&&openInvoices.length>0&&(
        <div style={{ position:isDesktop?"static":"sticky", bottom:0, background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:14, marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <span style={{ fontSize:13, fontWeight:700, color:th.txtMuted }}>{t.pi_totalPayment}</span>
            <span style={{ fontSize:20, fontWeight:900, color:"#22c55e" }}>{t.cur} {piFmt2(totalPayment)}</span>
          </div>
          <button onClick={handleSave} disabled={saving||totalPayment<=0} style={{ width:"100%", padding:"13px", borderRadius:10, border:"none", background:(saving||totalPayment<=0)?"#1e3a5f":"linear-gradient(135deg,#15803d,#16a34a)", color:"#fff", fontSize:15, fontWeight:800, cursor:(saving||totalPayment<=0)?"not-allowed":"pointer" }}>
            {saving?"...":t.pi_newPayment}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── PI: VOUCHER DETAIL VIEW ────────────────────────────────────
function PiVoucherDetailView({ voucher, t, th, lang, isOwner, onBack, onCancel, onDelete, onSetChequeStatus, onPrint, onViewInvoice, onPrintCheque, onPrintChequeVoucher, onHandover }) {
  const isCheque = voucher.method==="cheque";
  const isCancelled = voucher.status==="cancelled";
  const chequeSt = PI_CHEQUE_STATUSES[voucher.chequeStatus]||PI_CHEQUE_STATUSES.pending;
  const dr = { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${th.border}` };
  return (
    <div>
      <button onClick={onBack} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:13, fontWeight:700, padding:"0 0 14px 0", fontFamily:"inherit" }}>{t.pi_backToPayments}</button>

      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:900, color:"#f97316", letterSpacing:1 }}>{PI_VOUCHER_METHODS[voucher.method]?.icon} {voucher.paymentNo}</div>
            <div style={{ fontSize:12, color:th.txtMuted, marginTop:2 }}>📅 {voucher.paymentDate}</div>
          </div>
          {isCancelled
            ? <span style={{ fontSize:10, fontWeight:700, color:"#ef4444", background:"#450a0a", padding:"4px 10px", borderRadius:10 }}>{lang==="bn"?"বাতিল":"CANCELLED"}</span>
            : isCheque&&<span style={{ fontSize:10, fontWeight:700, color:chequeSt.color, background:chequeSt.bg, padding:"4px 10px", borderRadius:10 }}>{chequeSt[lang]}</span>}
        </div>
        <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🏭 {t.pi_payToVendor}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.vendorName}</span></div>
        <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>💳 {t.pi_paymentMethod}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{PI_VOUCHER_METHODS[voucher.method]?.icon} {PI_VOUCHER_METHODS[voucher.method]?.[lang]}</span></div>
        {isCheque&&(
          <>
            <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>📃 {t.pi_chequeNo}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.chequeNo||"—"}</span></div>
            <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🏦 {t.pi_chequeBank}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.chequeBank||"—"}</span></div>
            <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>📅 {t.pi_chequeDate}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.chequeDate||"—"}</span></div>
            {voucher.chequeReceivedBy&&<div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🙋 {lang==="bn"?"চেক গ্রহণকারী":"Cheque Received By"}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.chequeReceivedBy}</span></div>}
          </>
        )}
        {voucher.vendorReceiptNo&&<div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🧾 {lang==="bn"?"ভেন্ডরের রিসিট নম্বর":"Vendor Receipt No."}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.vendorReceiptNo}</span></div>}
        {(voucher.method==="bank_transfer"||voucher.method==="card")&&(
          <>
            <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🔖 {voucher.method==="card"?(lang==="bn"?"অনুমোদন / রেফ নং":"Approval / Ref No"):(lang==="bn"?"রেফারেন্স নং":"Reference No")}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.refNo||"—"}</span></div>
            <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>{voucher.method==="card"?(lang==="bn"?"💳 কার্ডের ধরন":"💳 Card Type"):(lang==="bn"?"🏦 ব্যাংক":"🏦 Bank")}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.refBank||"—"}</span></div>
          </>
        )}
        <div style={{ ...dr, borderBottom:"none" }}><span style={{ fontSize:13, fontWeight:700, color:th.txtMuted }}>{t.pi_totalPayment}</span><span style={{ fontSize:18, fontWeight:900, color:isCancelled?th.txtFaint:"#22c55e", textDecoration:isCancelled?"line-through":"none" }}>{t.cur} {piFmt2(voucher.totalAmount)}</span></div>
        {isCheque&&piN2(voucher.discountAmount)>0&&(
          <>
            <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🏷️ {lang==="bn"?"ছাড়":"Discount"}</span><span style={{ fontSize:13, fontWeight:700, color:"#f59e0b" }}>{t.cur} {piFmt2(voucher.discountAmount)}</span></div>
            <div style={{ ...dr, borderBottom:"none" }}><span style={{ fontSize:12, color:th.txtMuted }}>🖋️ {lang==="bn"?"চেকের পরিমাণ":"Cheque Amount"}</span><span style={{ fontSize:15, fontWeight:900, color:"#3b82f6" }}>{t.cur} {piFmt2(voucher.chequeAmount)}</span></div>
          </>
        )}
        {voucher.note&&<div style={{ marginTop:8, padding:"8px 10px", background:th.bgInp, borderRadius:8, fontSize:12, color:th.txtSecondary, borderLeft:"3px solid #f97316" }}>📝 {voucher.note}</div>}
      </div>

      {isCheque&&!isCancelled&&(onPrintCheque||onPrintChequeVoucher||onHandover)&&(
        <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:14, marginBottom:10, display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ fontSize:11, color:"#3b82f6", fontWeight:700, textTransform:"uppercase" }}>🖨️ {lang==="bn"?"চেক ও ডকুমেন্ট":"Cheque & documents"}</div>
          {voucher.chequePrintedAt&&<div style={{ fontSize:11, color:th.txtMuted }}>✅ {lang==="bn"?"চেক প্রিন্ট হয়েছে":"Cheque printed"}: {String(voucher.chequePrintedAt).slice(0,10)}{voucher.chequePrintCount>1?` (×${voucher.chequePrintCount})`:""}</div>}
          {voucher.handover?.receiverName&&<div style={{ fontSize:11, color:th.txtMuted }}>🪪 {lang==="bn"?"হস্তান্তর":"Handed over to"}: <b style={{ color:th.txtPrimary }}>{voucher.handover.receiverName}</b>{voucher.handover.receivedAt?` · ${voucher.handover.receivedAt}`:""}</div>}
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {onPrintCheque&&<button onClick={onPrintCheque} style={{ flex:"1 1 140px", padding:"11px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>🖨️ {lang==="bn"?"চেক প্রিন্ট":"Print Cheque"}</button>}
            {onPrintChequeVoucher&&<button onClick={onPrintChequeVoucher} style={{ flex:"1 1 140px", padding:"11px", borderRadius:10, border:"1px solid #3b82f6", background:"rgba(59,130,246,0.08)", color:"#3b82f6", fontSize:13, fontWeight:700, cursor:"pointer" }}>📄 {lang==="bn"?"চেক পেমেন্ট ভাউচার":"Cheque Payment Voucher"}</button>}
            {onHandover&&<button onClick={onHandover} style={{ flex:"1 1 140px", padding:"11px", borderRadius:10, border:"1px solid #22c55e", background:"rgba(34,197,94,0.08)", color:"#22c55e", fontSize:13, fontWeight:700, cursor:"pointer" }}>🪪 {voucher.handover?(lang==="bn"?"হস্তান্তর ডকুমেন্ট দেখুন":"View Handover"):(lang==="bn"?"হস্তান্তর ডকুমেন্ট":"Handover Document")}</button>}
          </div>
        </div>
      )}

      {/* Allocations table */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:14, marginBottom:10 }}>
        <div style={{ fontSize:11, color:"#f97316", fontWeight:700, textTransform:"uppercase", letterSpacing:0, marginBottom:10 }}>{t.pi_allocations}</div>
        {(voucher.allocations||[]).map((a,i)=>(
          <button key={i} onClick={()=>onViewInvoice(a.invoiceId)} style={{ width:"100%", textAlign:"left", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background:th.bgInp, borderRadius:10, marginBottom:6, border:`1px solid ${th.border}`, cursor:"pointer", fontFamily:"inherit" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:"#f97316" }}>🧾 {a.supplierInvoiceNo||a.invoiceNo}</div>
              <div style={{ fontSize:11, color:th.txtMuted, marginTop:2 }}>{a.supplierInvoiceNo?`${a.invoiceNo} · `:""}{a.invoiceDate?`📅 ${a.invoiceDate}`:""}</div>
            </div>
            <span style={{ fontSize:14, fontWeight:800, color:"#22c55e" }}>{t.cur} {piFmt2(a.amount)}</span>
          </button>
        ))}
      </div>

      {/* Actions */}
      {(isOwner||onCancel)&&(
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <button onClick={onPrint} style={{ padding:"12px", borderRadius:10, border:`1px solid ${th.borderMid}`, background:"transparent", color:th.txtPrimary, fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.pi_printReceipt}</button>
          {isOwner&&!isCancelled&&isCheque&&voucher.chequeStatus==="pending"&&(
            <>
              <button onClick={()=>onSetChequeStatus("cleared")} style={{ padding:"12px", borderRadius:10, border:"1px solid #22c55e", background:"rgba(34,197,94,0.08)", color:"#22c55e", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.pi_markCleared}</button>
              <button onClick={()=>onSetChequeStatus("bounced")} style={{ padding:"12px", borderRadius:10, border:"1px solid #ef4444", background:"rgba(239,68,68,0.08)", color:"#ef4444", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.pi_markBounced}</button>
            </>
          )}
          {!isCancelled&&onCancel&&(
            <button onClick={onCancel} style={{ padding:"11px", borderRadius:10, border:"1px solid #450a0a", background:"transparent", color:"#ef4444", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.pi_cancelVoucher}</button>
          )}
          {isCancelled&&onDelete&&(
            <button onClick={onDelete} style={{ padding:"11px", borderRadius:10, border:"1px solid #7f1d1d", background:"#7f1d1d", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>🗑️ {lang==="bn"?"ভাউচার মুছুন":"Delete Voucher"}</button>
          )}
        </div>
      )}
    </div>
  );
}

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

function PurchaseInvoiceTab({ t, lang, th, s, shopId, user, profile, vendors, products, shop, toast, isDesktop, syncRefreshKey=0, wideDesktop=false, onOpenProductMaster, productFromMaster=null, onOpenChequePrinter, chequeHandoverRequest=null, onChequeHandoverHandled, openNewRequest=0, openNewVendor=null, onOpenNewHandled, voucherRequest=0, onVoucherHandled, onShopUpdated, purchaseSource=null, onPurchaseSourceHandled, openInvoiceId=null, onOpenInvoiceHandled, onProductPatched }) {
  const authSyncReady = useFirebaseAuthReady();
  const isOwner = profile?.role==="owner";
  const perms = { ...DEFAULT_PERMISSIONS, ...(profile?.permissions || {}) };
  const can = (key) => isOwner || perms[key] === true;
  const piBaseCur = String(shop?.currency || "AED").trim().toUpperCase();
  const purchaseOpts = useMemo(() => purchaseOptionsOf(shop), [shop]);
  const savePurchaseOptions = async (next) => {
    const updated = await saveShopRecord(shopId, { purchaseOptions: next }, { ownerUid: user?.uid || shop?.ownerUid, profile, user });
    onShopUpdated?.(updated);
  };

  const canManagePurchase = can("managePurchase");
  const canViewSupplierLedger = can("viewSupplierLedger") || can("viewVendors") || can("vendorPayments") || canManagePurchase;
  const canVendorPayments = can("vendorPayments");

  // ── Firestore state ──
  const [invoices,setInvoices]     = useState([]);
  const [piLoading,setPiLoading]   = useState(true);

  // ── View state: "list" | "form" | "detail" ──
  const [piView,setPiView]         = useState("list");
  const [piGroupMode,setPiGroupMode] = useState("folders");
  const [piOpenParty,setPiOpenParty] = useState(null);
  const piWin = useWindowState({ maximized:true });
  const piMobile = usePmMobile();
  const piRootRef = useRef(null);
  const [piFitH,setPiFitH] = useState(null);
  // On PC the screen fills exactly the space below the window title, so the page itself never scrolls.
  useEffect(() => {
    if (piMobile) { setPiFitH(null); return undefined; }
    const fit = () => {
      const el = piRootRef.current; if (!el) return;
      const top = el.getBoundingClientRect().top + (el.parentElement?.scrollTop || 0);
      setPiFitH(Math.max(420, Math.floor(window.innerHeight - top)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [piMobile, piView]);
  useEffect(() => { if (piView!=="form") piWin.restore(); }, [piView]); // eslint-disable-line react-hooks/exhaustive-deps
  const [piSubTab,setPiSubTab]     = useState(
    canManagePurchase ? "invoices" : (canViewSupplierLedger ? "ledger" : (canVendorPayments ? "payments" : "invoices"))
  ); // "invoices" | "ledger" | "payments"
  const [selInvoice,setSelInvoice] = useState(null);
  const [editInvoiceId,setEditInvoiceId] = useState(null);
  const piSnapRef = useRef(null);
  const [piLedgerHidden,setPiLedgerHidden] = useState(false);
  const [piNavReturn,setPiNavReturn] = useState(null); // null | "ledger"

  // ── Vendor Payment Voucher state (Cash/Cheque, partial payment against open invoices) ──
  const [payments,setPayments]         = useState([]);       // all vouchers for this shop (live)
  const [billReturns,setBillReturns]   = useState([]);
  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName:"purchaseReturns", shopId, onRows:(list)=>setBillReturns(list||[]) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId]);
  const [pmtLoading,setPmtLoading]     = useState(true);
  const [pmtView,setPmtView]           = useState("list");   // "list" | "new" | "detail"
  const [selVoucher,setSelVoucher]     = useState(null);
  const [pmtPrefillVendorId,setPmtPrefillVendorId] = useState(null);
  const [pmtPrefillInvoiceId,setPmtPrefillInvoiceId] = useState(null);
  const [pmtSaving,setPmtSaving]       = useState(false);
  const [chqWizard,setChqWizard]       = useState(null);     // null | { vendorId }
  const [chqHandover,setChqHandover]   = useState(null);     // voucher being documented
  const [chqHandoverSaving,setChqHandoverSaving] = useState(false);

  // ── Form state ──
  const [piInvoiceNo,setPiInvoiceNo] = useState("");
  const [piForm,setPiForm]           = useState(piEmptyForm());
  const [piLines,setPiLines]         = useState([]);
  const [piCurrent,setPiCurrent]     = useState(piEmptyCurrent());
  const [piEditLineId,setPiEditLineId] = useState(null);
  const [piSaving,setPiSaving]       = useState(false);
  const piSaveLockRef = useRef(false);
  const piNameRef = useRef(null);
  const piQtyRef = useRef(null);

  // ── Vendor search state (for purchase invoice form) ──
  const [vendorSearchQ,setVendorSearchQ]     = useState("");
  const [vendorDropOpen,setVendorDropOpen]   = useState(false);
  const vendorSearchRef = useRef(null);

  // Close vendor dropdown when clicking outside
  useEffect(()=>{
    const handler=(e)=>{
      if (vendorSearchRef.current && !vendorSearchRef.current.contains(e.target)){
        setVendorDropOpen(false);
      }
    };
    document.addEventListener("mousedown",handler);
    return ()=>document.removeEventListener("mousedown",handler);
  },[]);

  // ── Filter state ──
  const [piSearch,setPiSearch]       = useState("");
  const [piStatusF,setPiStatusF]     = useState("ALL");

  const allowedPiSubTabs = [
    ...(canManagePurchase ? ["invoices"] : []),
    ...(canViewSupplierLedger ? ["ledger"] : []),
    ...(canVendorPayments ? ["payments"] : []),
  ];

  useEffect(()=>{
    if (!allowedPiSubTabs.length) return;
    if (!allowedPiSubTabs.includes(piSubTab)) {
      setPiSubTab(allowedPiSubTabs[0]);
      setPmtView("list");
      setSelVoucher(null);
    }
  }, [piSubTab, canManagePurchase, canViewSupplierLedger, canVendorPayments]);

  // ── Local-first list, then Firebase; SQLite cache stays in background ──
  useEffect(()=>{
    if (!shopId) return;
    setPiLoading(true);
    let unsub1=()=>{};
    let unsub2=null;
    let cancelled=false;
    let cloudRowsLatest=null;

    const normalizePiInvoice = (d) => ({
      ...d.data(),
      id:d.id,
      createdAt:d.data().createdAt?.toDate?.() || d.data().createdAt || new Date().toISOString(),
    });

    const sortPiInvoices = (rows=[]) => [...rows].sort((a,b)=>
      new Date(b.createdAt||b.invoiceDate||0) - new Date(a.createdAt||a.invoiceDate||0)
    );

    const loadOfflinePiInvoices = async ({ cloudRows = null } = {}) => {
      const mergeSource = cloudRows ?? cloudRowsLatest;
      const res = await offlineList("purchaseInvoices");
      if (cancelled) return 0;
      const records = Array.isArray(res) ? res : (res.records || []);
      const localRows = records
        .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }))
        .filter(inv => inv.shopId === shopId);

      if (Array.isArray(mergeSource)) {
        const merged = new Map(mergeSource.map(inv => [String(inv.id), inv]));
        records
          .filter(r => Number(r?.dirty || 0) === 1)
          .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }))
          .filter(inv => inv.shopId === shopId)
          .forEach(inv => merged.set(String(inv.id), inv));
        const rows = sortPiInvoices([...merged.values()]);
        setInvoices(rows);
        return rows.length;
      }

      if (localRows.length) setInvoices(sortPiInvoices(localRows));
      return localRows.length;
    };

    loadOfflinePiInvoices()
      .then((count) => { if (!cancelled && count > 0) setPiLoading(false); })
      .catch(err => console.warn("[S4 Offline] purchaseInvoices offline load failed", err));

    const applyCloudRows = (rows) => {
      if (cancelled) return;
      cloudRowsLatest = rows;
      setPiLoading(false);
      loadOfflinePiInvoices({ cloudRows: rows }).catch(() => {
        if (!cancelled) setInvoices(sortPiInvoices(rows));
      });
      offlineCacheCloudRecords("purchaseInvoices", rows)
        .catch(err => console.warn("[S4 Offline] purchaseInvoices cache failed", err));
    };

    if (authSyncReady) {
      const q=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId),orderBy("createdAt","desc"));
      unsub1=onSnapshot(q,snap=>{
        applyCloudRows(snap.docs.map(normalizePiInvoice));
      },()=>{
        // Index নেই — orderBy ছাড়া fallback query, client-side sort
        const q2=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId));
        unsub2=onSnapshot(q2,snap=>{
          applyCloudRows(sortPiInvoices(snap.docs.map(normalizePiInvoice)));
        },err2=>{
          console.error(err2);
          loadOfflinePiInvoices().finally(()=>{ if (!cancelled) setPiLoading(false); });
        });
      });
    }
    return ()=>{ cancelled=true; unsub1(); unsub2&&unsub2(); };
  },[shopId,syncRefreshKey,authSyncReady]);

  // ── Generate invoice no — preview instantly, commit on save ──
  const piMaxLocalSerial = () => invoices.reduce((mx, inv) => {
    const m = String(inv.invoiceNo || "").match(/PI-?(\d+)(?:-[A-Z]{2})?$/i);
    return m ? Math.max(mx, Number(m[1])) : mx;
  }, Number(shop?.lastPISerial || 0));

  const piFormatInvoiceNo = (serial) =>
    `${PI_PREFIX}${String(serial).padStart(4, "0")}`;

  const piPreviewNextInvoiceNo = () =>
    piFormatInvoiceNo(piMaxLocalSerial() + 1);

  const reservePiInvoiceNo = async () => {
    if (editInvoiceId) return piInvoiceNo;
    const local = piMaxLocalSerial();
    const serial = await reserveShopSerial(shopId, "lastPISerial", local);
    const no = serial ? piFormatInvoiceNo(serial)
      : isOwner ? piFormatInvoiceNo(local + 1)
      : `${piFormatInvoiceNo(local + 1)}-${deviceSerialTag()}`;
    setPiInvoiceNo(no);
    return no;
  };

  const bumpShopPiSerial = (invoiceNo) => {
    const m = String(invoiceNo || "").match(/PI-?(\d+)$/i);
    if (!m || !navigator.onLine) return;
    const serial = Number(m[1]);
    if (!Number.isFinite(serial) || serial <= 0) return;
    runTransaction(db, async tx => {
      const shopRef = doc(db, "shops", shopId);
      const shopSnap = await tx.get(shopRef);
      const current = Number(shopSnap.data()?.lastPISerial || 0);
      if (serial > current) tx.update(shopRef, { lastPISerial: serial });
    }).catch(err => console.warn("[S4 PI] lastPISerial background bump failed", err));
  };

  // ── Generate payment voucher no (local-first, cloud when online) ──
  const piMaxLocalPaymentSerial = () => payments.reduce((mx, payment) => {
    const m = String(payment.paymentNo || "").match(/PMT-?(\d+)(?:-[A-Z]{2})?$/i);
    return m ? Math.max(mx, Number(m[1])) : mx;
  }, Number(shop?.lastPaymentSerial || 0));

  const piFormatPaymentNo = (serial) =>
    `${PMT_PREFIX}${String(serial).padStart(4, "0")}`;

  const genPaymentNo = async () => {
    const local = piMaxLocalPaymentSerial();
    const serial = await reserveShopSerial(shopId, "lastPaymentSerial", local);
    if (serial) return piFormatPaymentNo(serial);
    return isOwner ? piFormatPaymentNo(local + 1) : `${piFormatPaymentNo(local + 1)}-${deviceSerialTag()}`;
  };

  // ── Payment Vouchers listener + offline SQLite cache fallback ──
  useEffect(()=>{
    if (!shopId) return;
    setPmtLoading(true);
    let unsub1=()=>{};
    let unsub2=null;

    const normalizePiPayment = (d) => ({
      ...d.data(),
      id:d.id,
      createdAt:d.data().createdAt?.toDate?.() || d.data().createdAt || new Date().toISOString(),
    });

    const sortPiPayments = (rows=[]) => [...rows].sort((a,b)=>
      new Date(b.createdAt||b.paymentDate||0) - new Date(a.createdAt||a.paymentDate||0)
    );

    const loadOfflinePiPayments = async () => {
      const res = await offlineList("purchasePayments");
      const rawRows = Array.isArray(res) ? res : (res.records || []).map(r => r.data || r);
      const rows = rawRows.filter(p => p.shopId === shopId);
      if (rows.length) setPayments(sortPiPayments(rows));
      return rows.length;
    };

    loadOfflinePiPayments()
      .then((count) => { if (count > 0 || !authSyncReady) setPmtLoading(false); })
      .catch(err => { console.warn("[S4 Offline] purchasePayments offline load failed", err); if (!authSyncReady) setPmtLoading(false); });

    const applyCloudPayments = async (rows) => {
      let merged = rows;
      try {
        const res = await offlineList("purchasePayments");
        const records = Array.isArray(res) ? res : (res.records || []);
        const dirty = records
          .filter(r => Number(r?.dirty || 0) === 1)
          .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }))
          .filter(p => p.shopId === shopId);
        if (dirty.length) {
          const map = new Map(rows.map(p => [String(p.id), p]));
          dirty.forEach(p => map.set(String(p.id), p));
          merged = sortPiPayments([...map.values()]);
        }
      } catch {}
      setPayments(merged);
      offlineCacheCloudRecords("purchasePayments", rows).catch(err => console.warn("[S4 Offline] purchasePayments cache failed", err));
      setPmtLoading(false);
    };

    if (authSyncReady) {
      const q=query(collection(db,"purchasePayments"),where("shopId","==",shopId),orderBy("createdAt","desc"));
      unsub1=onSnapshot(q,snap=>{
        applyCloudPayments(snap.docs.map(normalizePiPayment));
      },()=>{
        const q2=query(collection(db,"purchasePayments"),where("shopId","==",shopId));
        unsub2=onSnapshot(q2,snap=>{
          applyCloudPayments(sortPiPayments(snap.docs.map(normalizePiPayment)));
        },err2=>{
          console.error(err2);
          loadOfflinePiPayments().finally(()=>setPmtLoading(false));
        });
      });
    }
    return ()=>{ unsub1(); unsub2&&unsub2(); };
  },[shopId, authSyncReady]);

  // ── This vendor's open (payable) invoices — confirmed/partial with balance > 0, oldest first ──
  // Older vouchers stored only our PI number; fill in the vendor's own invoice number from the invoice.
  const withSupRefs = (v) => v && ({ ...v, allocations:(v.allocations||[]).map(a=>({ ...a, supplierInvoiceNo:a.supplierInvoiceNo || invoices.find(i=>i.id===a.invoiceId)?.supplierInvoiceNo || "" })) });

  const piMoneyInvoices = useMemo(() => invoices.filter(inv => !isBranchTransferBill(inv)), [invoices]);
  const getVendorOpenInvoices = (vendorId, vendorName) => piMoneyInvoices
    .filter(inv => ["confirmed","partial"].includes(inv.status) && piN2(inv.balanceDue)>0.01 && (vendorId ? inv.vendorId===vendorId : inv.vendorName===vendorName))
    .sort((a,b) => new Date(a.invoiceDate||0) - new Date(b.invoiceDate||0));

  // ── Vendor cheque documents ──
  const chequeDocVoucher = (v) => {
    const withRefs = withSupRefs(v);
    return { ...withRefs, allocations: withRefs.allocations.map(a => ({ ...a, invoiceAmount: a.invoiceAmount ?? invoices.find(i=>i.id===a.invoiceId)?.grandTotal })) };
  };
  const chequeDocOpts = (v) => ({ cur: t.cur||"AED", amountWords: `${amountToWordsAED(chequeAmountOfVoucher(v))} Only` });
  const printChequePaymentVoucher = (v) => printWithSettings(chequeVoucherHtml(chequeDocVoucher(v), shop, chequeDocOpts(v)), { lang });
  const printChequeHandover = (v, handover) => printWithSettings(chequeHandoverHtml(chequeDocVoucher(v), shop, handover || v.handover || {}, chequeDocOpts(v)), { lang });
  const openVoucherInChequePrinter = (v) => onOpenChequePrinter?.({
    voucher: v, payee: v.vendorName || "", amount: chequeAmountOfVoucher(v), date: v.chequeDate || v.paymentDate || "", bankName: v.chequeBank || "",
  });
  const openChequeHandover = async (v) => {
    const base = payments.find(p=>p.id===v.id) || v;
    setChqHandover({ ...base, handover: await loadHandoverDocs(base) });
  };
  const piSaveChequeHandover = async (v, handover) => {
    setChqHandoverSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const { handover: _full, ...rest } = v;
      const base = payments.find(p=>p.id===v.id) || rest;
      await saveHandoverDocs(base, handover, user?.uid || "");
      const result = await offlinePatch("purchasePayments", v.id, {
        chequeReceivedBy: base.chequeReceivedBy || handover.receiverName,
        handover: { ...handoverSummary(handover), savedAt: nowIso, savedBy: user?.uid || "" },
        updatedAt: nowIso, updatedBy: user?.uid || "",
      }, base);
      const updated = { ...base, ...result.data, id: v.id };
      setPayments(prev => prev.map(p => p.id===v.id ? updated : p));
      setSelVoucher(prev => prev && prev.id===v.id ? updated : prev);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] handover sync failed", err));
      toast(lang==="bn" ? "✅ হস্তান্তর ডকুমেন্ট সেভ হয়েছে" : "✅ Handover document saved");
      setChqHandover(null);
      return updated;
    } catch (e) { toast(e.message, "err"); return null; }
    finally { setChqHandoverSaving(false); }
  };

  useEffect(() => {
    if (!chequeHandoverRequest?.id) return;
    const { at, ...requested } = chequeHandoverRequest;
    setPiView("list"); setPiSubTab("payments"); openChequeHandover(requested);
    onChequeHandoverHandled?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chequeHandoverRequest]);

  useEffect(()=>{
    if (!openNewRequest) return;
    onOpenNewHandled?.();
    if (!(isOwner||canManagePurchase) || piView==="form") return;
    setPiSubTab("invoices");
    piOpenNew();
    if (openNewVendor) piPickVendor(openNewVendor);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNewRequest]);
  useEffect(()=>{
    if (!voucherRequest) return;
    onVoucherHandled?.();
    if (!canVendorPayments || piView==="form") return;
    setPiSubTab("payments");
    setPmtPrefillVendorId(null); setSelVoucher(null); setPmtView("new");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherRequest]);

  // ── Active (non-cancelled) voucher allocations that touch a given invoice — for the read-only trail on Invoice Detail ──
  const getRelatedPayments = (invoiceId) => payments
    .filter(p => (p.allocations||[]).some(a=>a.invoiceId===invoiceId))
    .map(p => ({ payment:p, allocAmount: (p.allocations||[]).find(a=>a.invoiceId===invoiceId)?.amount||0 }))
    .sort((a,b)=>new Date(b.payment.createdAt||0)-new Date(a.payment.createdAt||0));

  // ── Save a Vendor Payment Voucher — offline-first with local invoice updates ──
  const piSavePaymentVoucher = async (payload, { stayOpen = false } = {}) => {
    // payload: { vendorId, vendorName, vendorMobile, method, paymentDate, note, chequeNo, chequeBank, chequeDate, allocations:[{invoiceId,invoiceNo,invoiceDate,amount}] }
    if (!payload.vendorName) { toast(t.pi_vendorRequired,"err"); return null; }
    const allocations = (payload.allocations||[]).filter(a=>piN2(a.amount)>0);
    if (!allocations.length) { toast(t.pi_amountRequired,"err"); return null; }
    if (payload.method==="cheque" && !String(payload.chequeNo||"").trim()) { toast(t.pi_errChequeNo,"err"); return null; }
    if (payload.chequeAmount != null) {
      const allocTotal = allocations.reduce((s,a)=>s+piN2(a.amount),0);
      if (piN2(payload.chequeAmount) <= 0 || piN2(payload.chequeAmount) > allocTotal + 0.001) {
        toast(lang==="bn"?"চেকের অঙ্ক শূন্য বা মোটের চেয়ে বেশি হতে পারবে না":"Cheque amount must be above zero and not more than the total","err");
        return null;
      }
    }

    setPmtSaving(true);
    try {
      const paymentNo = await genPaymentNo();
      const totalAmount = parseFloat(piFmt2(allocations.reduce((s,a)=>s+piN2(a.amount),0)));
      const nowIso = new Date().toISOString();
      const invoiceUpdates = [];

      for (const alloc of allocations) {
        const cur = invoices.find((inv) => inv.id === alloc.invoiceId);
        if (!cur) throw new Error(lang==="bn"?`ইনভয়েস ${alloc.invoiceNo} খুঁজে পাওয়া যায়নি`:`Invoice ${alloc.invoiceNo} not found`);
        if (cur.status==="draft"||cur.status==="cancelled") throw new Error(lang==="bn"?`${alloc.invoiceNo} ড্রাফট বা বাতিল — পেমেন্ট করা যাবে না`:`${alloc.invoiceNo} is draft/cancelled — cannot pay`);
        const curPaid = piN2(cur.amountPaid);
        const grand   = piN2(cur.grandTotal);
        const curBalance = Math.max(0, grand-curPaid);
        const amt = piN2(alloc.amount);
        if (amt > curBalance + 0.01) throw new Error(lang==="bn"?`${alloc.invoiceNo}-এর বাকির চেয়ে বেশি পরিমাণ দেওয়া হয়েছে`:`Amount for ${alloc.invoiceNo} exceeds its balance due`);
        const newAmountPaid = parseFloat(piFmt2(curPaid+amt));
        const newBalance    = Math.max(0, parseFloat(piFmt2(grand-newAmountPaid)));
        const newStatus     = newBalance<0.01 ? "paid" : (newAmountPaid>0 ? "partial" : cur.status);
        invoiceUpdates.push({ invoice: cur, newAmountPaid, newBalance, newStatus });
      }

      const paymentPayload = {
        shopId,
        paymentNo,
        vendorId: payload.vendorId || null,
        vendorName: payload.vendorName,
        vendorMobile: payload.vendorMobile || "",
        method: payload.method,
        paymentDate: payload.paymentDate || piToday(),
        totalAmount,
        chequeNo: payload.method === "cheque" ? (payload.chequeNo || "").trim() : "",
        chequeBank: payload.method === "cheque" ? (payload.chequeBank || "").trim() : "",
        chequeDate: payload.method === "cheque" ? (payload.chequeDate || "") : "",
        chequeStatus: payload.method === "cheque" ? "pending" : null,
        chequeReceivedBy: payload.method === "cheque" ? (payload.chequeReceivedBy || "").trim() : "",
        vendorReceiptNo: (payload.vendorReceiptNo || "").trim(),
        ...(payload.method === "cheque" && payload.chequeAmount != null ? {
          chequeAmount: parseFloat(piFmt2(payload.chequeAmount)),
          discountAmount: parseFloat(piFmt2(Math.max(0, totalAmount - piN2(payload.chequeAmount)))),
        } : {}),
        refNo: (payload.refNo || "").trim(),
        refBank: (payload.refBank || "").trim(),
        refDate: payload.refDate || "",
        note: (payload.note || "").trim(),
        allocations: allocations.map((a) => ({
          invoiceId: a.invoiceId,
          invoiceNo: a.invoiceNo,
          supplierInvoiceNo: a.supplierInvoiceNo || invoices.find((i) => i.id === a.invoiceId)?.supplierInvoiceNo || "",
          invoiceDate: a.invoiceDate || "",
          invoiceAmount: piN2(invoices.find((i) => i.id === a.invoiceId)?.grandTotal),
          amount: parseFloat(piFmt2(a.amount)),
        })),
        status: "active",
        createdBy: user.uid,
        createdByName: profile.personName,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: user?.uid || "",
      };

      // Voucher first: if anything fails afterwards, a voucher exists rather than a bill marked paid without one.
      const result = await offlineCreate("purchasePayments", paymentPayload);
      const created = { ...result.data, id: result.documentId, createdAt: nowIso };
      setPayments((prev) => [created, ...prev]);

      for (const update of invoiceUpdates) {
        const patched = await offlinePatch("purchaseInvoices", update.invoice.id, {
          amountPaid: update.newAmountPaid,
          balanceDue: update.newBalance,
          status: update.newStatus,
          updatedAt: nowIso,
          updatedBy: user?.uid || "",
        }, update.invoice);
        const updated = { ...update.invoice, ...patched.data, id: update.invoice.id };
        setInvoices((prev) => prev.map((inv) => (inv.id === update.invoice.id ? updated : inv)));
        setSelInvoice((prev) => prev && prev.id === update.invoice.id ? updated : prev);
      }

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch((err) => console.warn("[S4 Sync] purchase payment save sync failed", err));
      }

      toast(t.pi_voucherSaved);
      if (!stayOpen) { setPmtView("list"); setSelVoucher(null); setPmtPrefillVendorId(null); }
      return created;
    } catch(e) { toast(e.message,"err"); return null; }
    finally { setPmtSaving(false); }
  };

  const piReversePaymentAllocations = async (payment, { cancelReason = "", chequeStatus = null } = {}) => {
    const nowIso = new Date().toISOString();
    const invoiceUpdates = [];

    for (const alloc of (payment.allocations || [])) {
      const cur = invoices.find((inv) => inv.id === alloc.invoiceId);
      if (!cur || cur.status === "cancelled") continue;
      const grand = piN2(cur.grandTotal);
      const newAmountPaid = Math.max(0, parseFloat(piFmt2(piN2(cur.amountPaid) - piN2(alloc.amount))));
      const newBalance = Math.max(0, parseFloat(piFmt2(grand - newAmountPaid)));
      const newStatus = newBalance < 0.01 ? "paid" : (newAmountPaid > 0 ? "partial" : "confirmed");
      invoiceUpdates.push({ invoice: cur, newAmountPaid, newBalance, newStatus });
    }

    for (const update of invoiceUpdates) {
      const patched = await offlinePatch("purchaseInvoices", update.invoice.id, {
        amountPaid: update.newAmountPaid,
        balanceDue: update.newBalance,
        status: update.newStatus,
        updatedAt: nowIso,
        updatedBy: user?.uid || "",
      }, update.invoice);
      const updated = { ...update.invoice, ...patched.data, id: update.invoice.id };
      setInvoices((prev) => prev.map((inv) => (inv.id === update.invoice.id ? updated : inv)));
      setSelInvoice((prev) => prev && prev.id === update.invoice.id ? updated : prev);
    }

    const paymentPatch = {
      status: "cancelled",
      cancelledAt: nowIso,
      cancelledBy: user?.uid || "",
      updatedAt: nowIso,
      updatedBy: user?.uid || "",
      ...(cancelReason ? { cancelReason } : {}),
      ...(chequeStatus ? { chequeStatus } : {}),
    };

    const result = await offlinePatch("purchasePayments", payment.id, paymentPatch, payment);
    const updatedPayment = { ...payment, ...result.data, id: payment.id };
    setPayments((prev) => prev.map((p) => (p.id === payment.id ? updatedPayment : p)));

    if (navigator.onLine) {
      window.S4Offline?.syncNow?.().catch((err) => console.warn("[S4 Sync] purchase payment reverse sync failed", err));
    }

    return updatedPayment;
  };

  // Only cancelled vouchers can be removed: cancelling already put the amounts back on the bills.
  const piDeletePaymentVoucher = async (payment) => {
    if (!isOwner || payment?.status !== "cancelled") return false;
    if (!window.confirm(lang==="bn" ? `ভাউচার ${payment.paymentNo||""} একেবারে মুছে ফেলবেন?` : `Delete voucher ${payment.paymentNo||""} permanently?`)) return false;
    try {
      await offlineRemove("purchasePayments", payment.id);
      setPayments(prev => prev.filter(p => p.id !== payment.id));
      toast(lang==="bn" ? "🗑️ ভাউচার মুছে ফেলা হয়েছে" : "🗑️ Voucher deleted", "err");
      logAudit({ shopId, user, profile, action:"delete", collection:"purchasePayments", docId:payment.id, docNo:payment.paymentNo, amount:payment.totalAmount, note:payment.vendorName });
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase payment delete sync failed", err));
      return true;
    } catch (e) { toast(e.message, "err"); return false; }
  };

  // ── Cancel a Payment Voucher — reverses every allocation back onto its invoice's balance ──
  const piCancelPaymentVoucher = async (payment) => {
    if (!window.confirm(t.pi_confirmCancelVoucher)) return null;
    try {
      if (payment.status === "cancelled") {
        throw new Error(lang==="bn"?"ভাউচারটি ইতিমধ্যে বাতিল":"Voucher already cancelled");
      }
      const updatedPayment = await piReversePaymentAllocations(payment);
      setSelVoucher((p) => p && p.id === payment.id ? updatedPayment : p);
      toast(t.pi_voucherCancelled,"err");
      logAudit({ shopId, user, profile, action:"cancel", collection:"purchasePayments", docId:payment.id, docNo:payment.paymentNo, amount:payment.totalAmount, note:payment.vendorName });
      return updatedPayment;
    } catch(e) { toast(e.message,"err"); return null; }
  };

  // ── Update a voucher's cheque clearance status. Bounced ⇒ auto-reverses every allocation. ──
  const piSetVoucherChequeStatus = async (payment, newChequeStatus, extra = {}) => {
    if (newChequeStatus==="bounced") {
      if (!window.confirm(t.pi_confirmBounce)) return null;
      try {
        if (payment.status === "cancelled") {
          throw new Error(lang==="bn"?"ভাউচারটি ইতিমধ্যে বাতিল":"Voucher already cancelled");
        }
        const updatedPayment = await piReversePaymentAllocations(payment, {
          cancelReason: "cheque_bounced",
          chequeStatus: "bounced",
        });
        setSelVoucher((p) => p && p.id === payment.id ? updatedPayment : p);
        toast(t.pi_chequeBounced,"err");
        return updatedPayment;
      } catch(e) { toast(e.message,"err"); return null; }
    } else {
      try {
        const nowIso = new Date().toISOString();
        const result = await offlinePatch("purchasePayments", payment.id, {
          chequeStatus:newChequeStatus,
          ...(newChequeStatus==="cleared" ? { clearedAt:extra.clearedAt || nowIso, clearedBy:user?.uid || "" } : {}),
          updatedAt:nowIso,
          updatedBy:user?.uid || "",
        }, payment);

        const updated = { ...payment, ...result.data, id: payment.id };
        setPayments(prev => prev.map(p => p.id === payment.id ? updated : p));
        setSelVoucher(p=>p&&p.id===payment.id?{...p,...updated}:p);
        toast(t.pi_chequeUpdated);

        if (navigator.onLine) {
          window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase payment cheque clear sync failed", err));
        }
        return updated;
      } catch(e) { toast(e.message,"err"); return null; }
    }
  };

  // ── Open new form ──
  const piOpenNew = () => {
    setPiInvoiceNo(piPreviewNextInvoiceNo());
    setPiForm(piEmptyForm());
    setPiLines([]);
    setPiCurrent(piEmptyCurrent());
    setEditInvoiceId(null);
    setPiSource(null);
    setPiView("form");
    setVendorSearchQ("");
    setVendorDropOpen(false);
  };

  // A purchase order or a received delivery note becomes a new bill: same vendor, the lines still to be billed.
  const [piSource,setPiSource] = useState(null);
  useEffect(()=>{
    if (!purchaseSource?.doc) return;
    onPurchaseSourceHandled?.();
    const { kind:srcKind, doc, lines } = purchaseSource;
    setPiInvoiceNo(piPreviewNextInvoiceNo());
    setPiForm({ ...piEmptyForm(), vendorId:doc.vendorId||"", vendorName:doc.vendorName||"", vendorMobile:doc.vendorMobile||"",
      supplierInvoiceNo:srcKind==="grn" ? (doc.supplierRef||"") : "", refNo:doc.docNo||"", paymentMethod:"credit", note:doc.note||"" });
    setPiLines((lines||[]).map(l=>({ ...piEmptyLine(), productId:l.productId||null, name:l.name||"", code:l.code||"", brand:l.brand||"", qty:String(l.qty||""), unit:l.unit||"Pcs",
      unitCost:l.unitCost!=null&&l.unitCost!=="" ? String(l.unitCost) : "", taxPerc:String(l.taxPerc ?? "5"), salePrice:l.salePrice ? String(l.salePrice) : "" })));
    setPiCurrent(piEmptyCurrent());
    setEditInvoiceId(null);
    setPiSource({ kind:srcKind, id:doc.id, no:doc.docNo||"", purchaseOrderId:srcKind==="po" ? doc.id : (doc.purchaseOrderId||""), purchaseOrderNo:srcKind==="po" ? (doc.docNo||"") : (doc.purchaseOrderNo||"") });
    setPiView("form"); setVendorSearchQ(doc.vendorName||""); setVendorDropOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[purchaseSource]);

  // ── Open edit form ──
  const piOpenEdit = (inv) => {
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — ভেন্ডর মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Vendor Master.", "err"); return; }
    if (isBranchTransferBill(inv)) { toast(lang==="bn" ? "এটা Branch Transfer রিসিভের বিল — Branch Transfer থেকে নিয়ন্ত্রণ হয়, এখানে বদলানো যাবে না।" : "This bill comes from a Branch Transfer receipt — manage it from Branch Transfer.", "err"); return; }
    piSnapRef.current = "pending";
    setPiInvoiceNo(inv.invoiceNo);
    setPiSource(null);
    const fxRate = inv.currency && Number(inv.exchangeRate) > 0 ? Number(inv.exchangeRate) : 1;
    const fxBack = (v) => String(parseFloat((Number(v||0)/fxRate).toFixed(4)));
    setPiForm({ invoiceDate:inv.invoiceDate, supplierInvoiceNo:inv.supplierInvoiceNo||"", refNo:inv.refNo||"", currency:fxRate!==1?inv.currency:"", exchangeRate:fxRate!==1?String(inv.exchangeRate):"", vendorId:inv.vendorId||"", vendorName:inv.vendorName||"", vendorMobile:inv.vendorMobile||"", paymentMethod:inv.paymentMethod||"cash", amountPaid:(inv.paymentMethod||"cash")!=="cash"&&inv.amountPaid>0?fxBack(inv.amountPaid):"", note:inv.note||"" });
    setPiLines((inv.items||[]).map(it=>({ id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:it.productId||null, name:it.name||"", code:it.code||"", brand:it.brand||"", qty:String(it.qty||""), unit:it.unit||"Pcs", unitCost:fxRate!==1?String(it.fcUnitCost ?? fxBack(it.unitCost)):String(it.unitCost||""), discountPerc:String(it.discountPerc??"0"), taxPerc:String(it.taxPerc??"5"), salePrice:String(it.salePrice||""), ...(it.batchNo?{ batchNo:it.batchNo, batchReasons:it.batchReasons||[] }:{}) })));
    setPiCurrent(piEmptyCurrent());
    setEditInvoiceId(inv.id); setPiView("form"); setVendorSearchQ(inv.vendorName||""); setVendorDropOpen(false);
  };

  // ── Form helpers ──
  const piUpd=(k,v)=>setPiForm(p=>({...p,[k]:v}));
  const piDelLine=(id)=>{
    setPiLines(p=>p.filter(it=>it.id!==id));
    if (piEditLineId===id) { setPiEditLineId(null); setPiCurrent(piEmptyCurrent()); }
  };

  // ── Add the staged entry row into the confirmed items list ──
  // With a Purchase Option on, a product bought from another vendor / at another MRP or cost can be kept as its own batch.
  const piBatchCheck = async (line) => {
    const o = purchaseOpts;
    if (!line.productId || line.batchNo || !(o.batchVendor || o.batchMrp || o.batchCost)) return line;
    const prod = products.find(p => p.id === line.productId);
    if (!prod) return line;
    let stock = 0;
    try {
      const rows = await loadInvoiceRows();
      stock = computeStockMap([prod], rows.purchaseInvoices, rows.salesInvoices, shopId, rows.deliveryNotes, rows.extras).get(prod.id) || 0;
    } catch (err) { console.warn("[S4 PI] batch stock check failed", err); }
    let last = null;
    invoices.forEach(inv => {
      if (inv.id === editInvoiceId || !STOCK_AFFECTING_INVOICE_STATUSES.includes(inv.status) || isBranchTransferBill(inv)) return;
      if (!(inv.items || []).some(it => it.productId === prod.id)) return;
      if (!last || String(inv.invoiceDate || "") > String(last.invoiceDate || "")) last = inv;
    });
    const reasons = batchReasons({ options:o, product:prod, line, rate:rateOf(piForm, piBaseCur), vendorId:piForm.vendorId, vendorName:piForm.vendorName, lastVendor:last ? { id:last.vendorId, name:last.vendorName } : null, stock });
    if (!reasons.length) return line;
    const bnM = lang==="bn";
    const said = reasons.map(r => r.key==="vendor" ? (bnM?`সাপ্লায়ার: ${r.from} → ${r.to}`:`Vendor: ${r.from} → ${r.to}`)
      : r.key==="mrp" ? `M.R.P: ${piFmt2(r.from)} → ${piFmt2(r.to)}` : `Landing Cost: ${piFmt2(r.from)} → ${piFmt2(r.to)}`).join("\n");
    const ok = window.confirm(bnM
      ? `"${prod.name}" — দোকানে আগের মাল আছে (${stock} ${prod.unit||"Pcs"})।\n${said}\n\nএই মাল কি আলাদা stock (নতুন ব্যাচ) হিসেবে রাখবেন?\nOK = আলাদা ব্যাচ, Cancel = আগের stock-এর সাথে মিশে যাবে`
      : `"${prod.name}" — ${stock} ${prod.unit||"Pcs"} of earlier stock is on hand.\n${said}\n\nKeep this as separate stock (a new batch)?\nOK = separate batch, Cancel = merge with existing stock`);
    if (!ok) return line;
    return { ...line, batchNo:nextBatchNo(piInvoiceNo, piLines), batchReasons:reasons.map(r => r.key) };
  };

  const piAddCurrentItem = async () => {
    if (!piCurrent.name.trim()) { toast(lang==="bn"?"আইটেমের নাম লিখুন!":"Enter item name!","err"); return; }
    if (!piCurrent.qty || piN2(piCurrent.qty)<=0) { toast(lang==="bn"?"সঠিক পরিমাণ লিখুন!":"Enter valid quantity!","err"); return; }
    const editId = piEditLineId;
    const entry = await piBatchCheck(piCurrent);
    setPiLines(prev=>editId && prev.some(x=>x.id===editId)
      ? prev.map(x=>x.id===editId ? { ...entry, id:editId } : x)
      : [...prev, { ...entry, id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}` }]);
    setPiEditLineId(null);
    setPiCurrent(piEmptyCurrent());
    setTimeout(()=>piNameRef.current?.focus(), 80);
  };

  // ── Load a confirmed item into the entry row for editing; it stays in the bill until Add updates it ──
  const piEditLine = (item) => {
    setPiCurrent({ productId:item.productId||null, name:item.name||"", code:item.code||"", brand:item.brand||"", qty:String(item.qty||""), unit:item.unit||"Pcs", unitCost:String(item.unitCost||""), discountPerc:String(item.discountPerc??"0"), taxPerc:String(item.taxPerc??"5"), salePrice:String(item.salePrice||""), ...(item.batchNo?{ batchNo:item.batchNo, batchReasons:item.batchReasons||[] }:{}) });
    setPiEditLineId(item.id);
    setTimeout(()=>piNameRef.current?.focus(), 80);
  };

  const piChangeCurrentUnit=(unit)=>setPiCurrent(p=>{
    const prod = p.productId ? products.find(x=>x.id===p.productId) : null;
    return { ...p, unit, unitCost: rescaleForUnit(p.unitCost, prod, p.unit, unit), salePrice: rescaleForUnit(p.salePrice, prod, p.unit, unit) };
  });

  const piSelectProduct=(prod)=>{
    const fx = rateOf(piForm, piBaseCur);
    const knownCost = prod.landingCost||prod.averageCost;
    setPiCurrent(p=>({ ...p, productId:prod.id, name:prod.name, code:prod.code||prod.barcode||"", brand:prod.brand||"", unit:prod.unit||"Pcs", unitCost:knownCost ? (fx!==1&&fx>0 ? String(parseFloat((Number(knownCost)/fx).toFixed(4))) : knownCost) : p.unitCost, salePrice:prod.vatInclusive||prod.mrp||prod.vatExclusive||p.salePrice, taxPerc:prod.purchaseVat||prod.salesVat||p.taxPerc||"5" }));
    setTimeout(()=>piQtyRef.current?.focus(), 100);
  };

  useEffect(()=>{
    if (productFromMaster?.product && piView==="form") piSelectProduct(productFromMaster.product);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[productFromMaster]);

  const piSnapKey = () => JSON.stringify({ f:piForm, l:piLines.map(({ id, ...rest })=>rest) });
  useEffect(()=>{ if (piSnapRef.current==="pending") piSnapRef.current = piSnapKey(); });
  const piIsDirty = () => {
    if (piView!=="form") return false;
    if (String(piCurrent.name||"").trim()) return true;
    if (!editInvoiceId) return piLines.length>0;
    return piSnapRef.current!==piSnapKey();
  };
  const piLeaveUnsavedOk = () =>
    !piIsDirty() || window.confirm(lang==="bn"?"এই বিলের পরিবর্তন সেভ হয়নি। তবুও চলে যাবেন?":"This bill has unsaved changes. Leave anyway?");
  const piLeaveDetail = () => {
    setSelInvoice(null);
    setPiView("list");
    if (piNavReturn === "ledger") {
      setPiSubTab("ledger");
      setPiLedgerHidden(false);
      setPiNavReturn(null);
    }
  };
  const piApplyVendorPayment = (vendor) => {
    const pm = (vendor?.paymentType || "cash") === "credit" ? "credit" : "cash";
    setPiForm((p) => ({ ...p, paymentMethod: pm, amountPaid: pm === "credit" ? "" : p.amountPaid }));
  };
  // Phone back / header back steps out one level at a time instead of leaving Purchase.
  useEffect(()=>{
    const inPayment = piSubTab==="payments" && pmtView!=="list";
    const inFolder = piMobile && piView==="list" && !!piOpenParty;
    if (piView==="list" && !inPayment && !inFolder) return undefined;
    const guard = {
      leave: () => piView!=="form" || piLeaveUnsavedOk(),
      back: () => {
        if (piView==="form") { if (piLeaveUnsavedOk()) setPiView("list"); }
        else if (piView==="detail") { piLeaveDetail(); }
        else if (inPayment) {
          setPmtView("list"); setSelVoucher(null); setPmtPrefillVendorId(null);
          if (piNavReturn === "ledger") {
            setPiSubTab("ledger");
            setPiLedgerHidden(false);
            setPiNavReturn(null);
          }
        } else setPiOpenParty(null);
        return true;
      },
    };
    billLeaveGuard.current = guard;
    return () => { if (billLeaveGuard.current===guard) billLeaveGuard.current = null; };
  });

  useEffect(() => {
    if (piView === "form") {
      cancelStaleClear("pi-draft");
      cancelStaleClear("pi-search");
      return undefined;
    }
    scheduleStaleClear("pi-draft", () => {
      setPiForm(piEmptyForm());
      setPiLines([]);
      setPiCurrent(piEmptyCurrent());
      setEditInvoiceId(null);
      setPiInvoiceNo("");
    }, STALE_DRAFT_MS);
    scheduleStaleClear("pi-search", () => setPiSearch(""), STALE_DRAFT_MS);
    return () => {
      cancelStaleClear("pi-draft");
      cancelStaleClear("pi-search");
    };
  }, [piView]);

  // A minimized bill must be confirmed away before the list opens another one.
  const piLeaveMinOk = () => {
    if (!(piWin.min && piView==="form")) return true;
    if (!piLeaveUnsavedOk()) return false;
    piWin.restore();
    return true;
  };
  useEscapeKey(() => {
    if (piView==="form") { if (piLeaveUnsavedOk()) setPiView("list"); }
    else if (piView==="detail") { piLeaveDetail(); }
    else { setPmtView("list"); setSelVoucher(null); setPmtPrefillVendorId(null); }
  }, {
    enabled: !piWin.min && (piView!=="list" || (piSubTab==="payments" && pmtView!=="list")),
    level: piView==="form" ? 2 : 1,
  });

  const piCanEditInv = (inv) => ["draft","confirmed"].includes(inv?.status) && (isOwner || (canManagePurchase && inv.createdBy===user?.uid));
  const piOpenFromDesktop = (inv) => {
    if (!piLeaveUnsavedOk()) return;
    if (piCanEditInv(inv)) { piOpenEdit(inv); return; }
    setSelInvoice(inv); setPiView("detail");
  };

  const piHandleVendor=(e)=>{
    const vid=e.target.value;
    if (!vid){ piUpd("vendorId",""); piUpd("vendorName",""); piUpd("vendorMobile",""); return; }
    const v=vendors.find(x=>x.id===vid);
    if (v) {
      piUpd("vendorId", vid);
      piUpd("vendorName", v.vendorName);
      piUpd("vendorMobile", v.mobileNumber || v.whatsappNumber || "");
      piApplyVendorPayment(v);
    }
  };

  // ── Searchable vendor picker handler ──
  const piPickVendor=(v)=>{
    piUpd("vendorId",v.id);
    piUpd("vendorName",v.vendorName);
    piUpd("vendorMobile",v.mobileNumber||v.whatsappNumber||"");
    piApplyVendorPayment(v);
    setVendorSearchQ(v.vendorName);
    setVendorDropOpen(false);
  };
  const piClearVendor=()=>{
    piUpd("vendorId",""); piUpd("vendorName",""); piUpd("vendorMobile","");
    setPiForm((p) => ({ ...p, paymentMethod: "cash", amountPaid: "" }));
    setVendorSearchQ(""); setVendorDropOpen(false);
  };
  // Inactive and blocked vendors stay in the ledger and payments but cannot get new bills.
  const pickVendors = vendors.filter(v => !["inactive","blocked"].includes(v.status || "active"));
  const piVendorRecord = (vendorId, vendorName) => {
    const key = String(vendorName || "").trim().toLowerCase();
    return (vendorId && vendors.find(v => v.id === vendorId))
      || (key ? vendors.find(v => String(v.vendorName || "").trim().toLowerCase() === key) : null)
      || null;
  };
  const filteredVendorOpts = pickVendors.filter(v=>{
    if (!vendorSearchQ.trim()) return true;
    const q=vendorSearchQ.trim().toLowerCase();
    return (v.vendorName||"").toLowerCase().includes(q)
      ||(v.vendorCode||"").toLowerCase().includes(q)
      ||(v.mobileNumber||"").includes(q)
      ||(v.city||"").toLowerCase().includes(q);
  });

  // ── Build payload ──
  const piBuild=(status, invoiceNoOverride)=>{
    if (!piForm.vendorName.trim()){ toast(lang==="bn"?"❌ Vendor / সাপ্লায়ারের নাম দিন — লিস্টে না থাকলে নাম লিখে দিন":"❌ Enter the vendor / supplier name — type it if it's not in the list","err"); return null; }
    if (!piForm.supplierInvoiceNo.trim()){ toast(lang==="bn"?"❌ সাপ্লায়ারের Invoice No দিন — নম্বর না থাকলে যেকোনো একটা রেফারেন্স লিখুন":"❌ Enter the supplier's invoice no — type any reference if there is none","err"); return null; }
    if (piCurrent.name.trim()){ toast(lang==="bn"?"❌ এন্ট্রি সারির আইটেম এখনো যোগ/আপডেট করা হয়নি — Add/Update চাপুন বা সারিটি খালি করুন":"❌ The item in the entry row is not added yet — press Add/Update or clear the row","err"); return null; }
    const priorInv = editInvoiceId ? invoices.find(inv=>inv.id===editInvoiceId) : null;
    if (status==="draft" && priorInv?.status && priorInv.status!=="draft") {
      toast(lang==="bn"?"❌ সেভ করা বিলকে আবার Draft করা যাবে না":"❌ A saved invoice cannot be turned back into a draft","err"); return null;
    }
    const valid=piLines.filter(it=>it.name.trim());
    if (!valid.length){ toast(t.pi_errItems,"err"); return null; }
    for (const it of valid){
      if (!it.name.trim()){ toast(t.pi_errName,"err"); return null; }
      if (!it.qty.toString().trim()||piN2(it.qty)<=0){ toast(t.pi_errQty,"err"); return null; }
      if (piN2(it.unitCost)<0){ toast(t.pi_errCost,"err"); return null; }
      if (piN2(it.taxPerc)<0){ toast(lang==="bn"?"❌ VAT % ঋণাত্মক হতে পারে না":"❌ VAT % cannot be negative","err"); return null; }
      if (piN2(it.discountPerc)<0||piN2(it.discountPerc)>100){ toast(lang==="bn"?`❌ "${it.name}": ছাড় ০–১০০% হতে হবে`:`❌ "${it.name}": discount must be 0–100%`,"err"); return null; }
    }
    const foreign = isForeign(piForm, piBaseCur);
    const rate = rateOf(piForm, piBaseCur);
    if (foreign && !(rate > 0)) { toast(lang==="bn"?`❌ ${piForm.currency} থেকে ${piBaseCur}-এর রেট (Exchange Rate) দিন`:`❌ Enter the exchange rate from ${piForm.currency} to ${piBaseCur}`,"err"); return null; }
    const baseLines = valid.map(it=>lineToBase(it, rate));
    const builtItems=baseLines.map((it,idx)=>{ const { disc, tax, total }=piCalcLine(it); return { productId:it.productId||null, name:it.name.trim(), code:it.code.trim(), brand:it.brand.trim(), qty:piN2(it.qty), unit:it.unit, unitFactor:unitFactorFor(it.productId ? products.find(p=>p.id===it.productId) : null, it.unit), unitCost:piN2(it.unitCost), discountPerc:piN2(it.discountPerc), discountAmt:parseFloat(piFmt2(disc)), taxPerc:piN2(it.taxPerc), taxAmt:parseFloat(piFmt2(tax)), lineTotal:parseFloat(piFmt2(total)), salePrice:piN2(it.salePrice)||null,
      ...(foreign?{ fcUnitCost:piN2(valid[idx].unitCost) }:{}), ...(it.batchNo?{ batchNo:it.batchNo, batchReasons:it.batchReasons||[] }:{}) }; });
    const { sub, disc, tax, grand } = piCalcTotals(baseLines);
    const fcGrand = piCalcTotals(valid).grand;
    // Paying the whole bill in a foreign currency settles it exactly, without a rounding paisa left over.
    const fcPaid = piN2(piForm.amountPaid);
    const typedPaid=piForm.paymentMethod==="cash" ? parseFloat(piFmt2(grand)) : (foreign && Math.abs(fcPaid-fcGrand)<0.01 ? grand : fcPaid*rate);
    if (typedPaid > grand + 0.01) { toast(lang==="bn"?"পরিশোধিত টাকা মোট বিলের চেয়ে বেশি হতে পারে না!":"Amount paid cannot exceed the grand total!","err"); return null; }
    const paid=Math.min(Math.max(typedPaid,0), grand), balanceDue=Math.max(0,grand-paid);
    const derivedStatus = status==="confirmed" ? (balanceDue<0.01?"paid":paid>0?"partial":"confirmed") : status;
    const linkFrom = piSource || priorInv || {};
    const sourceFields = {
      ...((piSource ? piSource.purchaseOrderId : linkFrom.purchaseOrderId) ? { purchaseOrderId:piSource ? piSource.purchaseOrderId : linkFrom.purchaseOrderId, purchaseOrderNo:piSource ? piSource.purchaseOrderNo : (linkFrom.purchaseOrderNo||"") } : {}),
      ...(piSource?.kind==="grn" ? { goodsReceiptId:piSource.id, goodsReceiptNo:piSource.no } : priorInv?.goodsReceiptId ? { goodsReceiptId:priorInv.goodsReceiptId, goodsReceiptNo:priorInv.goodsReceiptNo||"" } : {}),
    };
    return { ...sourceFields, shopId, invoiceNo:invoiceNoOverride ?? piInvoiceNo, supplierInvoiceNo:piForm.supplierInvoiceNo.trim(), refNo:String(piForm.refNo||"").trim(), invoiceDate:piForm.invoiceDate,
      currency:foreign?String(piForm.currency).trim().toUpperCase():"", exchangeRate:foreign?rate:null, fcGrandTotal:foreign?fcGrand:null, vendorId:piForm.vendorId||null, vendorName:piForm.vendorName.trim(), vendorMobile:piForm.vendorMobile.trim(), items:builtItems, subtotal:parseFloat(piFmt2(sub)), totalDiscount:parseFloat(piFmt2(disc)), totalTax:parseFloat(piFmt2(tax)), grandTotal:parseFloat(piFmt2(grand)), paymentMethod:piForm.paymentMethod, amountPaid:parseFloat(piFmt2(paid)), balanceDue:parseFloat(piFmt2(balanceDue)), status:derivedStatus, note:piForm.note.trim(), createdBy:priorInv?.createdBy||user.uid, createdByName:priorInv?.createdByName||profile.personName };
  };

  const savePurchaseInvoiceOffline = async (payload, successMessage) => {
    const nowIso = new Date().toISOString();
    const priorInvoice = editInvoiceId ? invoices.find(inv => inv.id === editInvoiceId) : null;
    let savedId;
    let savedDoc = null;
    const deferPersist = { deferPersist: true };

    if (editInvoiceId) {
      const result = await offlinePatch("purchaseInvoices", editInvoiceId, {
        ...payload,
        updatedAt: nowIso,
        updatedBy: user?.uid || "",
      }, priorInvoice, deferPersist);

      const updated = { ...result.data, id: editInvoiceId };
      savedId = editInvoiceId;
      savedDoc = updated;
      setInvoices(prev => prev.map(inv => inv.id === editInvoiceId ? updated : inv));
      setSelInvoice(prev => prev && prev.id === editInvoiceId ? updated : prev);
      toast(successMessage || t.pi_updated);
      if (priorInvoice && priorInvoice.status !== "draft") {
        logAudit({ shopId, user, profile, action:"edit", collection:"purchaseInvoices", docId:editInvoiceId, docNo:payload.invoiceNo, amount:payload.grandTotal,
          note:`${payload.vendorName||""} · ${piFmt2(priorInvoice.grandTotal)} → ${piFmt2(payload.grandTotal)}` });
      }
    } else {
      const result = await offlineCreate("purchaseInvoices", {
        ...payload,
        createdAt: nowIso,
        updatedAt: nowIso,
      }, deferPersist);

      const created = { ...result.data, id: result.documentId };
      savedId = result.documentId;
      savedDoc = created;
      setInvoices(prev => [created, ...prev]);
      toast(successMessage);
    }

    if (!payload.goodsReceiptId) await applyInvoiceStockEffect({
      oldInvoice: priorInvoice,
      newInvoice: payload,
      invoiceId: savedId,
      applyType: "purchase",
      reverseType: "adjustment",
      referenceType: "purchase_invoice",
      unitCostKey: "unitCost",
      shopId,
      actor: { uid: user?.uid, personName: profile?.personName },
    });

    if (!editInvoiceId) bumpShopPiSerial(payload.invoiceNo);
    if (STOCK_AFFECTING_INVOICE_STATUSES.includes(payload.status)) await piUpdateProductCosts(payload, deferPersist);

    await persistOfflineDb();

    if (navigator.onLine) {
      window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase invoice save sync failed", err));
    }

    if (!editInvoiceId) {
      piOpenNew();
    } else if (savedDoc) {
      setSelInvoice(savedDoc);
      setPiView("detail");
    }
  };

  // A confirmed purchase becomes the product's latest cost, and a sale price typed on the line updates the product's price.
  const piUpdateProductCosts = async (payload, persistOpts = {}) => {
    if (!(canManagePurchase || can("manageProducts"))) return;
    const nowIso = new Date().toISOString();
    const billDay = String(payload.invoiceDate || nowIso).slice(0, 10);
    for (const it of payload.items || []) {
      if (!it.productId) continue;
      try {
        const rec = await offlineGetById("products", it.productId).catch(() => null);
        const prod = rec?.data || products.find(p => p.id === it.productId);
        if (!prod) continue;
        // A back-dated bill must not replace the cost/price of a newer purchase.
        if (prod.lastPurchaseDate && billDay < String(prod.lastPurchaseDate).slice(0, 10)) continue;
        const factor = Number(it.unitFactor) > 0 ? Number(it.unitFactor) : 1;
        const qty = Number(it.qty) || 0;
        const netCost = qty > 0 ? (Number(it.lineTotal) - Number(it.taxAmt || 0)) / qty / factor : Number(it.unitCost) / factor;
        const patch = {
          lastPurchaseVendorId: payload.vendorId || "",
          lastPurchaseVendorName: payload.vendorName || "",
          lastPurchaseInvoiceNo: payload.invoiceNo || "",
        };
        const lastDay = String(prod.lastPurchaseDate || "").slice(0, 10);
        if (!lastDay || billDay >= lastDay) patch.lastPurchaseDate = billDay;
        if (netCost > 0) {
          const lcStr = String(parseFloat(netCost.toFixed(4)));
          const costChanged = Math.abs(netCost - (Number(prod.landingCost) || 0)) > 0.0001;
          if (costChanged) {
            patch.landingCost = lcStr;
            patch.lastPurchaseCost = lcStr;
            Object.assign(patch, pricingPatchFromLanding(prod, netCost));
          } else if (!lastDay || billDay >= lastDay) {
            patch.lastPurchaseCost = lcStr;
          }
        }
        const sale = Number(it.salePrice) || 0;
        if (sale > 0 && factor === 1) {
          const priceKey = prod.vatInclusive ? "vatInclusive" : prod.mrp ? "mrp" : prod.vatExclusive ? "vatExclusive" : "vatInclusive";
          if (Math.abs(sale - (Number(prod[priceKey]) || 0)) > 0.0001) patch[priceKey] = String(sale);
        }
        const keys = Object.keys(patch).filter((k) => patch[k] !== undefined && patch[k] !== prod[k]);
        if (!keys.length) continue;
        const merged = { ...patch, updatedAt: nowIso };
        await offlinePatch("products", it.productId, merged, prod, persistOpts);
        onProductPatched?.(it.productId, merged);
      } catch (err) {
        console.warn("[S4 PI] product cost update failed", it.productId, err);
      }
    }
  };

  // ── Save ──
  const piSupplierInvoiceDuplicateOk = (payload) => {
    const key = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
    const supNo = key(payload.supplierInvoiceNo);
    const day = String(payload.invoiceDate || "").slice(0, 10);
    const sameVendor = (inv) => (payload.vendorId && inv.vendorId === payload.vendorId)
      || (!!key(payload.vendorName) && key(inv.vendorName) === key(payload.vendorName));
    const others = piMoneyInvoices.filter(inv => inv.id !== editInvoiceId && inv.status !== "cancelled" && sameVendor(inv));
    const bn = lang==="bn";

    if (supNo) {
      const same = others.filter(inv => key(inv.supplierInvoiceNo) === supNo);
      const sameDay = same.find(inv => String(inv.invoiceDate || "").slice(0, 10) === day);
      if (sameDay) {
        alert(bn
          ? `❌ ডুপ্লিকেট! এই সাপ্লায়ারের Supplier Invoice No "${payload.supplierInvoiceNo}" একই তারিখে (${day}) আগেই ${sameDay.invoiceNo}-এ এন্ট্রি করা আছে।\nআবার সেভ করা যাবে না।`
          : `❌ Duplicate! Supplier invoice "${payload.supplierInvoiceNo}" from this supplier on ${day} is already entered as ${sameDay.invoiceNo}.\nIt cannot be saved again.`);
        return false;
      }
      if (same.length) {
        const d = same[0];
        return window.confirm(bn
          ? `⚠️ এই সাপ্লায়ারের Supplier Invoice No "${payload.supplierInvoiceNo}" আগেই ${d.invoiceNo} (${d.invoiceDate||""})-এ এন্ট্রি করা আছে।\nতারিখ আলাদা — তবুও সেভ করবেন?`
          : `⚠️ Supplier invoice "${payload.supplierInvoiceNo}" from this supplier is already entered as ${d.invoiceNo} (${d.invoiceDate||""}).\nThe date differs — save anyway?`);
      }
      return true;
    }

    const lookalike = others.find(inv => String(inv.invoiceDate || "").slice(0, 10) === day && Math.abs(piN2(inv.grandTotal) - piN2(payload.grandTotal)) < 0.01);
    if (!lookalike) return true;
    return window.confirm(bn
      ? `⚠️ একই সাপ্লায়ার, একই তারিখ (${day}) আর একই টাকার (${piFmt2(payload.grandTotal)}) বিল আগেই ${lookalike.invoiceNo}-এ আছে।\nডুপ্লিকেট হতে পারে — তবুও সেভ করবেন?`
      : `⚠️ A bill from this supplier on ${day} for ${piFmt2(payload.grandTotal)} already exists as ${lookalike.invoiceNo}.\nIt may be a duplicate — save anyway?`);
  };

  // Vendor Master rules: a blocked vendor gets no new bills, the credit limit warns, credit days set the due date.
  const piVendorTermsOk = (payload, status) => {
    const bn = lang==="bn";
    const vendor = piVendorRecord(payload.vendorId, payload.vendorName);
    const prior = editInvoiceId ? invoices.find(inv => inv.id === editInvoiceId) : null;
    const sameVendorAsPrior = prior && ((vendor && prior.vendorId === vendor.id) || String(prior.vendorName||"").trim().toLowerCase() === String(payload.vendorName||"").trim().toLowerCase());
    if (vendor?.status === "blocked" && !sameVendorAsPrior) {
      toast(bn ? `❌ "${vendor.vendorName}" ব্লক করা — Vendor Master-এ Active না করলে নতুন বিল করা যাবে না` : `❌ "${vendor.vendorName}" is blocked — make it Active in Vendor Master to bill it`, "err");
      return false;
    }
    const days = Math.round(piN2(vendor?.paymentTerms));
    if (days > 0 && payload.invoiceDate) {
      const d = new Date(`${String(payload.invoiceDate).slice(0,10)}T00:00:00`);
      d.setDate(d.getDate() + days);
      payload.dueDate = localIsoDate(d);
      payload.creditDays = days;
    } else {
      payload.dueDate = "";
      payload.creditDays = 0;
    }
    const limit = piN2(vendor?.creditLimit);
    if (status === "draft" || limit <= 0 || piN2(payload.balanceDue) <= 0.01) return true;
    const outstanding = piMoneyInvoices
      .filter(inv => inv.id !== editInvoiceId && ["confirmed","partial"].includes(inv.status)
        && (inv.vendorId === vendor.id || String(inv.vendorName||"").trim().toLowerCase() === String(vendor.vendorName||"").trim().toLowerCase()))
      .reduce((sum, inv) => sum + Math.max(0, piN2(inv.balanceDue)), 0);
    const after = outstanding + piN2(payload.balanceDue);
    if (after <= limit + 0.01) return true;
    return window.confirm(bn
      ? `⚠️ "${vendor.vendorName}"-এর ক্রেডিট লিমিট ${piFmt2(limit)}।\nআগের বাকি ${piFmt2(outstanding)} + এই বিলের বাকি ${piFmt2(payload.balanceDue)} = ${piFmt2(after)} — লিমিট ছাড়িয়ে যাচ্ছে।\nতবুও সেভ করবেন?`
      : `⚠️ "${vendor.vendorName}" has a credit limit of ${piFmt2(limit)}.\nDue so far ${piFmt2(outstanding)} + this bill ${piFmt2(payload.balanceDue)} = ${piFmt2(after)} — over the limit.\nSave anyway?`);
  };

  const piSaveRun = async (status, successMsg) => {
    if (piSaveLockRef.current) return;
    piSaveLockRef.current = true;
    setPiSaving(true);
    try {
      const lockedBy = editInvoiceId ? billReturns.filter(r => r.status !== "cancelled" && r.invoiceId === editInvoiceId) : [];
      if (lockedBy.length) {
        toast(lang==="bn" ? `এই বিলে রিটার্ন আছে (${lockedBy.map(r=>r.returnNo).join(", ")}) — আগে রিটার্ন বাতিল করুন` : `This bill has return(s) ${lockedBy.map(r=>r.returnNo).join(", ")}; cancel them before editing`, "err");
        return;
      }
      const payload = piBuild(status, piInvoiceNo);
      if (!payload) return;
      if (!editInvoiceId && payload.goodsReceiptId) {
        const already = invoices.find(inv => inv.goodsReceiptId===payload.goodsReceiptId && inv.status!=="cancelled");
        if (already) { toast(lang==="bn" ? `❌ ${payload.goodsReceiptNo}-এর বিল আগেই হয়েছে: ${already.invoiceNo}` : `❌ ${payload.goodsReceiptNo} is already billed as ${already.invoiceNo}`, "err"); return; }
      }
      if (status!=="draft" && !unlinkedStockOk(payload.items, lang)) return;
      if (!piVendorTermsOk(payload, status)) return;
      if (!piSupplierInvoiceDuplicateOk(payload)) return;
      if (!editInvoiceId) payload.invoiceNo = await reservePiInvoiceNo();
      await savePurchaseInvoiceOffline(payload, editInvoiceId ? t.pi_updated : successMsg);
      if (!editInvoiceId) setPiSource(null);
    } catch(e) {
      toast(e.message,"err");
    } finally {
      piSaveLockRef.current = false;
      setPiSaving(false);
    }
  };
  const piSaveDraft = () => piSaveRun("draft", t.pi_saved);
  const piConfirm = () => piSaveRun("confirmed", t.pi_confirmed);

  // "Make Payment" from an invoice: jump to the Payments tab, New Voucher form, pre-selected for this vendor.
  // The new voucher form pre-fills this exact invoice's row with its full balance — other open invoices for
  // the same vendor are shown too, so the user can combine them into one voucher if they want.
  const piGoToMakePayment = (inv) => {
    if (!canVendorPayments) return;
    setPmtPrefillVendorId(inv.vendorId || inv.vendorName);
    setPmtPrefillInvoiceId(inv.id);
    setSelVoucher(null);
    setPmtView("new");
    setPiSubTab("payments");
    setPiView("list");
  };
  const piCancelInv = async (inv) => {
    if (!isOwner && !can("managePurchase")) {
      toast(lang==="bn" ? "পারচেজ বিল বাতিল করার অনুমতি নেই" : "You are not allowed to cancel purchase bills", "err");
      return;
    }
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — ভেন্ডর মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Vendor Master.", "err"); return; }
    if (isBranchTransferBill(inv)) { toast(lang==="bn" ? "এটা Branch Transfer রিসিভের বিল — Branch Transfer থেকে নিয়ন্ত্রণ হয়, এখানে বদলানো যাবে না।" : "This bill comes from a Branch Transfer receipt — manage it from Branch Transfer.", "err"); return; }
    const activeVouchers = payments.filter(p => p.status !== "cancelled" && (p.allocations||[]).some(a => a.invoiceId === inv.id));
    if (activeVouchers.length) {
      const nos = activeVouchers.map(p => p.paymentNo).join(", ");
      toast(lang==="bn" ? `আগে পেমেন্ট ভাউচার বাতিল করুন: ${nos}` : `Cancel the payment voucher(s) first: ${nos}`, "err");
      return false;
    }
    const activeReturns = billReturns.filter(r => r.status !== "cancelled" && r.invoiceId === inv.id);
    if (activeReturns.length) {
      const nos = activeReturns.map(r => r.returnNo).join(", ");
      toast(lang==="bn" ? `আগে পারচেজ রিটার্ন বাতিল করুন: ${nos}` : `Cancel the purchase return(s) first: ${nos}`, "err");
      return false;
    }
    if (!window.confirm(t.pi_confirmCancel)) return false;
    try {
      const nowIso = new Date().toISOString();
      const result = await offlinePatch("purchaseInvoices", inv.id, {
        status:"cancelled",
        updatedAt:nowIso,
        updatedBy:user?.uid || "",
      }, inv);

      const updated = { ...result.data, id: inv.id };
      setInvoices(prev => prev.map(x => x.id === inv.id ? updated : x));
      setSelInvoice(updated);

      if (!inv.goodsReceiptId) await applyInvoiceStockEffect({
        oldInvoice: inv,
        newInvoice: updated,
        invoiceId: inv.id,
        applyType: "purchase",
        reverseType: "adjustment",
        referenceType: "purchase_invoice",
        unitCostKey: "unitCost",
        shopId,
        actor: { uid: user?.uid, personName: profile?.personName },
      });

      if (canManagePurchase || can("manageProducts")) {
        const ids = [...new Set((inv.items || []).map((it) => it.productId).filter(Boolean))];
        const live = piMoneyInvoices.filter((i) => i.id !== inv.id && i.status !== "cancelled" && i.status !== "draft");
        for (const pid of ids) {
          let latest = null;
          for (const row of live) {
            if (!(row.items || []).some((it) => it.productId === pid)) continue;
            if (!latest || String(row.invoiceDate) > String(latest.invoiceDate)) latest = row;
          }
          if (latest) await piUpdateProductCosts(latest);
        }
      }

      toast(t.pi_cancelledMsg,"err");
      logAudit({ shopId, user, profile, action:"cancel", collection:"purchaseInvoices", docId:inv.id, docNo:inv.invoiceNo, amount:inv.grandTotal, note:inv.vendorName });

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase invoice cancel sync failed", err));
      }
      return true;
    } catch(e){ toast(e.message,"err"); return false; }
  };
  const piDelete = async (inv) => {
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — ভেন্ডর মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Vendor Master.", "err"); return; }
    if (isBranchTransferBill(inv)) { toast(lang==="bn" ? "এটা Branch Transfer রিসিভের বিল — Branch Transfer থেকে নিয়ন্ত্রণ হয়, এখানে বদলানো যাবে না।" : "This bill comes from a Branch Transfer receipt — manage it from Branch Transfer.", "err"); return; }
    if (!window.confirm(t.pi_confirmDelete)) return;
    try {
      await offlineRemove("purchaseInvoices", inv.id);

      setInvoices(prev => prev.filter(x => x.id !== inv.id));
      setPiView("list");
      setSelInvoice(null);
      toast(t.pi_deleted,"err");
      logAudit({ shopId, user, profile, action:"delete", collection:"purchaseInvoices", docId:inv.id, docNo:inv.invoiceNo, amount:inv.grandTotal, note:inv.vendorName });

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase invoice delete sync failed", err));
      }
    } catch(e){ toast(e.message,"err"); }
  };

  // ── Filter ──
  const piFiltered = invoices.filter(inv=>{
    const q=piSearch.trim();
    const matchSt=piStatusF==="ALL"||inv.status===piStatusF;
    if (!q) return matchSt;
    const hay=[inv.invoiceNo,inv.vendorName,inv.supplierInvoiceNo,inv.refNo,inv.createdByName,...(inv.items||[]).map(it=>it.name+" "+it.code+" "+it.brand)].filter(Boolean).join(" ");
    return matchSt&&nsmatch(hay,q);
  });
  const piKPIs = invoices.reduce((a,inv)=>{ a.total++; if (inv.status==="cancelled"||inv.status==="draft"||isBranchTransferBill(inv)) return a; if (!isOpeningBill(inv)) a.amount+=inv.grandTotal||0; a.paid+=inv.amountPaid||0; a.due+=inv.balanceDue||0; return a; },{ total:0,amount:0,paid:0,due:0 });

  const totals=piCalcTotals(piLines);
  const paid=piForm.paymentMethod==="cash" ? totals.grand : piN2(piForm.amountPaid), balance=Math.max(0,totals.grand-paid);

  // ══════ LIST VIEW ══════
  const bnL = lang==="bn";
  const piAccent = "#c2410c";
  const piBadge = (st) => <span className="si-badge" style={{ color:SI_STATUS_COLOR[st]||"#475569" }}>{PI_STATUSES[st]?.[lang]||st}</span>;
  const piRowDue = (inv) => ["cancelled","draft"].includes(inv.status) || isBranchTransferBill(inv) ? 0 : Math.max(0, piN2(inv.grandTotal) - piN2(inv.amountPaid));
  const piBtTag = (inv) => isBranchTransferBill(inv) ? <span className="si-badge" style={{ color:"#0e7490", marginLeft:4 }} title={bnL?"Branch Transfer — মোট/বাকিতে ধরা হয় না":"Branch Transfer — not in totals/dues"}>🚚 Branch</span> : null;
  const piOpenInvoice = (inv) => { if (!piLeaveMinOk()) return; setSelInvoice(inv); setPiView("detail"); };
  useEffect(() => {
    if (!openInvoiceId) return;
    onOpenInvoiceHandled?.();
    const inv = invoices.find((i) => i.id === openInvoiceId);
    if (!inv) return;
    setPiSubTab("invoices");
    piOpenInvoice(inv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInvoiceId, invoices]);
  const piRootStyle = piFitH && !piMobile ? { height:piFitH } : undefined;
  const piMatchBlock = (inv) => {
    const q = piSearch.trim();
    if (!q) return [];
    return (inv.items||[]).filter(it=>nsmatch([it.name,it.code,it.brand].filter(Boolean).join(" "), q)).slice(0,3).map((it,i)=>{
      const qty = piN2(it.qty);
      const { tax, total } = piCalcLine(it);
      const landing = qty>0 ? (total - tax)/qty : piN2(it.unitCost);
      return <div key={i} className="si-match" style={{ color:piAccent }}>📦 {it.name}{it.code?` · ${it.code}`:""} — {it.qty} {it.unit} × {piFmt2(landing)} ({bnL?"ল্যান্ডিং":"landing"})</div>;
    });
  };

  if (piView==="list" || (piView==="form" && piWin.min && wideDesktop)) {
    const groups = groupInvoicesByParty(piFiltered, { idField:"vendorId", nameField:"vendorName" });
    const openGroup = piGroupMode==="folders" && piOpenParty ? (groups.find(g=>g.key===piOpenParty) || null) : null;
    const rows = openGroup ? openGroup.invoices : piFiltered;
    const groupName = (g) => g.isCash ? (bnL?"নাম ছাড়া":"No name") : g.name;
    const rowsSum = rows.reduce((a,inv)=>{
      if (!["cancelled","draft"].includes(inv.status) && !isBranchTransferBill(inv)) { a.total += piN2(inv.grandTotal); a.due += piRowDue(inv); }
      if (inv.status==="draft") a.drafts += 1;
      return a;
    }, { total:0, due:0, drafts:0 });
    const showParties = piGroupMode==="folders" && (!piMobile || !openGroup);
    const showInvoices = piGroupMode==="all" || !piMobile || !!openGroup;
    const subTabs = [
      ...(canManagePurchase ? [{ key:"invoices", icon:"📋", bn:"ইনভয়েস", en:"Invoices" }] : []),
      ...(canViewSupplierLedger ? [{ key:"ledger", icon:"🏭", bn:"সাপ্লায়ার লেজার", en:"Supplier Ledger" }] : []),
      ...(canVendorPayments ? [{ key:"payments", icon:"💳", bn:"পেমেন্ট", en:"Payments" }] : []),
    ];
    return (
      <div ref={piRootRef} className="si-root" style={piRootStyle}>
        <style>{PM_CSS}</style>
        <style>{SI_CSS}</style>
        {piView==="form"&&piWin.min&&(
          <MinimizedChip lang={lang} onRestore={piWin.restore}
            title={`PURCHASE INVOICE ${piInvoiceNo||""}`}
            onClose={()=>{ if (piLeaveUnsavedOk()) setPiView("list"); }} />
        )}

        <div className="pm-reference-title">
          <strong style={{ color:piAccent }}>{bnL?"ক্রয় ইনভয়েস":"PURCHASE INVOICE"}</strong>
          <span>{invoices.length} {bnL?"টি":"total"}</span>
        </div>

        <div className="si-toolbar">
          {canManagePurchase&&piSubTab==="invoices"&&(
            <button type="button" className="pm-btn pm-btn--primary" onClick={()=>{ if (piLeaveMinOk()) piOpenNew(); }} disabled={piSaving}>
              {piSaving?"...":(bnL?"+ নতুন ইনভয়েস":"+ New Invoice")}{!piMobile&&!piSaving?" (F3)":""}
            </button>
          )}
          {canVendorPayments&&piSubTab==="payments"&&pmtView==="list"&&(
            <button type="button" className="pm-btn pm-btn--primary" onClick={()=>{ setPmtPrefillVendorId(null); setSelVoucher(null); setPmtView("new"); }}>{t.pi_newPayment}</button>
          )}
          {canVendorPayments&&piSubTab==="payments"&&pmtView==="list"&&(
            <button type="button" className="pm-btn-secondary" onClick={()=>setChqWizard({ vendorId:null })}>🖨️ {bnL?"ভেন্ডর চেক":"Vendor Cheque"}</button>
          )}
          <span className="si-toolbar-gap" />
          {subTabs.length>1&&(
            <div className="si-pills">
              {subTabs.map(tab=>(
                <button key={tab.key} type="button" className={`pm-btn-secondary${piSubTab===tab.key?" is-active":""}`}
                  onClick={()=>{ setPiSubTab(tab.key); if(tab.key==="ledger") setPiLedgerHidden(false); if(tab.key==="payments"){ setPmtView("list"); setSelVoucher(null); } }}>
                  {tab.icon} {bnL?tab.bn:tab.en}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={piSubTab==="invoices"?undefined:"si-body"} style={piSubTab==="invoices"?{ display:"contents" }:undefined}>
          {/* ── SUB-TAB: SUPPLIER LEDGER ── */}
          {piSubTab==="ledger"&&canViewSupplierLedger&&piLedgerHidden&&(
            <div style={{ textAlign:"center", padding:"40px 16px" }}>
              <button onClick={()=>setPiLedgerHidden(false)} style={{ padding:"12px 22px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                📒 {lang==="bn"?"সাপ্লায়ার লেজার খুলুন":"Open Supplier Ledger"}
              </button>
            </div>
          )}
          {piSubTab==="ledger"&&canViewSupplierLedger&&!piLedgerHidden&&(
            <PartyLedgerWindow lang={lang} mode="supplier" cur={t.cur||"AED"} shopName={shop?.companyName||""}
              partyCodes={Object.fromEntries((vendors||[]).filter(v=>v.vendorCode).map(v=>[v.id, v.vendorCode]))}
              partyTrns={Object.fromEntries((vendors||[]).filter(v=>v.trnNumber).map(v=>[v.id, v.trnNumber]))}
              invoices={piMoneyInvoices.map(inv=>({ id:inv.id, no:inv.invoiceNo, date:String(inv.invoiceDate||"").slice(0,10), partyId:inv.vendorId||null, partyName:inv.vendorName||"", partyMobile:inv.vendorMobile||"", total:inv.grandTotal, paid:inv.amountPaid, status:inv.status, ref:inv.supplierInvoiceNo||"", method:inv.paymentMethod, raw:inv }))}
              vouchers={(canVendorPayments ? payments.map(p=>({ id:p.id, no:p.paymentNo, date:String(p.paymentDate||"").slice(0,10), partyId:p.vendorId||null, partyName:p.vendorName||"", partyMobile:p.vendorMobile||"", method:p.method, amount:p.totalAmount, status:p.status, allocations:withSupRefs(p).allocations, raw:p })) : [])
                .concat(returnsAsLedgerVouchers(billReturns, "purchase"))}
              onOpenInvoice={(inv)=>{ setPiNavReturn("ledger"); setSelInvoice(inv); setPiView("detail"); }}
              onOpenVoucher={canVendorPayments ? (v)=>{ if (v?.raw?.__return) return; setPiNavReturn("ledger"); setSelVoucher(v); setPmtView("detail"); setPiSubTab("payments"); } : undefined}
              onNewVoucher={canVendorPayments ? (p)=>{ setPmtPrefillVendorId(p.id||p.name); setPmtPrefillInvoiceId(null); setSelVoucher(null); setPmtView("new"); setPiSubTab("payments"); } : undefined}
              onClose={()=>{ if (canManagePurchase||canVendorPayments) setPiSubTab(canManagePurchase?"invoices":"payments"); else setPiLedgerHidden(true); }} />
          )}
          {/* ── SUB-TAB: PAYMENTS (Vendor Payment Voucher — Cash/Cheque, partial across open invoices) ── */}
          {piSubTab==="payments"&&canVendorPayments&&pmtView==="list"&&(
            <PiPaymentsListTab payments={payments} loading={pmtLoading} t={t} lang={lang} mobile={piMobile}
              onOpen={(v)=>{ setSelVoucher(v); setPmtView("detail"); }} />
          )}
          {piSubTab==="payments"&&canVendorPayments&&pmtView==="new"&&isDesktop&&(()=>{
            const openAll = piMoneyInvoices.filter(inv => ["confirmed","partial"].includes(inv.status) && piN2(inv.balanceDue)>0.01);
            const prefParty = pmtPrefillVendorId ? (vendors.find(v=>v.id===pmtPrefillVendorId) ? { partyId:pmtPrefillVendorId } : { partyName:pmtPrefillVendorId }) : null;
            return (
              <AgainstInvoiceVoucherWindow
                lang={lang} mode="payment" cur={t.cur||"AED"}
                voucherNo={piFormatPaymentNo(piMaxLocalPaymentSerial() + 1)}
                parties={voucherParties(vendors, openAll, "vendorId", "vendorName", v=>v.vendorName, v=>v.mobileNumber||v.whatsappNumber)}
                banks={UAE_BANKS.map(b=>b.name)}
                getOpenInvoices={(p)=>getVendorOpenInvoices(p.id, p.name)}
                vouchers={payments.map(p=>toVoucherView(withSupRefs(p),"payment"))}
                prefill={prefParty ? { ...prefParty, invoiceId:pmtPrefillInvoiceId } : null}
                saving={pmtSaving}
                onSave={async (d)=>{
                  const created = await piSavePaymentVoucher({ vendorId:d.partyId, vendorName:d.partyName, vendorMobile:d.partyMobile, method:d.method, paymentDate:d.date, note:d.note, chequeNo:d.chequeNo, chequeBank:d.chequeBank, chequeDate:d.chequeDate, chequeReceivedBy:d.chequeReceivedBy, vendorReceiptNo:d.vendorReceiptNo, refNo:d.refNo, refBank:d.refBank, refDate:d.refDate, allocations:d.allocations }, { stayOpen:true });
                  return created ? toVoucherView(withSupRefs(created),"payment") : null;
                }}
                onCancelVoucher={(isOwner||canVendorPayments) ? async (v)=>{ const u = await piCancelPaymentVoucher(v.raw); return u ? toVoucherView(u,"payment") : null; } : undefined}
                onDeleteVoucher={isOwner ? (v)=>piDeletePaymentVoucher(v.raw) : undefined}
                onSetChequeStatus={isOwner ? async (v,st)=>{ const u = await piSetVoucherChequeStatus(v.raw, st); return u ? toVoucherView(u,"payment") : null; } : undefined}
                onPrint={(v)=>printPaymentVoucher(v.raw, shop, lang)}
                onClose={()=>{ setPmtView("list"); setPmtPrefillVendorId(null); setPmtPrefillInvoiceId(null); }}
              />
            );
          })()}
          {piSubTab==="payments"&&canVendorPayments&&pmtView==="new"&&!isDesktop&&(
            <PiNewPaymentForm prefillVendorId={pmtPrefillVendorId}
              vendors={[
                ...(vendors||[]),
                ...[...new Set(piMoneyInvoices
                  .filter(inv => !inv.vendorId && inv.vendorName && ["confirmed","partial"].includes(inv.status) && piN2(inv.balanceDue)>0.01)
                  .map(inv => inv.vendorName))]
                  .filter(name => !(vendors||[]).some(v => v.vendorName===name))
                  .map(name => ({ id:null, vendorName:name, mobileNumber:invoices.find(inv=>inv.vendorName===name)?.vendorMobile||"" })),
              ]}
              getVendorOpenInvoices={getVendorOpenInvoices} saving={pmtSaving}
              onSave={piSavePaymentVoucher} onCancel={()=>{ setPmtView("list"); setPmtPrefillVendorId(null); }}
              t={t} th={th} lang={lang} isDesktop={isDesktop} />
          )}
          {piSubTab==="payments"&&canVendorPayments&&pmtView==="detail"&&selVoucher&&(
            <PiVoucherDetailView voucher={withSupRefs(selVoucher)} t={t} th={th} lang={lang} isOwner={isOwner}
              onBack={()=>{ setPmtView("list"); setSelVoucher(null); }}
              onCancel={(isOwner||canVendorPayments) ? ()=>piCancelPaymentVoucher(selVoucher) : undefined}
              onDelete={isOwner ? async ()=>{ if (await piDeletePaymentVoucher(selVoucher)) { setPmtView("list"); setSelVoucher(null); } } : undefined}
              onSetChequeStatus={(st)=>piSetVoucherChequeStatus(selVoucher,st)}
              onPrint={()=>printPaymentVoucher(withSupRefs(selVoucher), shop, lang)}
              onPrintCheque={onOpenChequePrinter ? ()=>openVoucherInChequePrinter(selVoucher) : undefined}
              onPrintChequeVoucher={()=>printChequePaymentVoucher(selVoucher)}
              onHandover={()=>openChequeHandover(selVoucher)}
              onViewInvoice={(invoiceId)=>{ const inv=invoices.find(i=>i.id===invoiceId); if(inv){ setSelInvoice(inv); setPiSubTab("invoices"); setPiView("detail"); } }}
            />
          )}
          {chqWizard&&canVendorPayments&&(
            <VendorChequeWizard
              lang={lang} cur={t.cur||"AED"}
              vendors={voucherParties(vendors, piMoneyInvoices.filter(inv => ["confirmed","partial"].includes(inv.status) && piN2(inv.balanceDue)>0.01), "vendorId", "vendorName", v=>v.vendorName, v=>v.mobileNumber||v.whatsappNumber)}
              banks={UAE_BANKS.map(b=>b.name)}
              getOpenInvoices={(p)=>getVendorOpenInvoices(p.id, p.name)}
              amountWords={(n)=>`${amountToWordsAED(n)} Only`}
              initialVendorId={chqWizard.vendorId}
              saving={pmtSaving}
              onSave={(payload)=>piSavePaymentVoucher(payload, { stayOpen:true })}
              onPrintCheque={onOpenChequePrinter ? (v)=>{ setChqWizard(null); openVoucherInChequePrinter(v); } : undefined}
              onPrintVoucher={(v)=>printChequePaymentVoucher(v)}
              onHandover={(v)=>openChequeHandover(v)}
              onClose={()=>setChqWizard(null)}
            />
          )}
          {chqHandover&&(
            <ChequeHandoverModal
              lang={lang} cur={t.cur||"AED"}
              voucher={chqHandover}
              saving={chqHandoverSaving}
              onSave={(h)=>piSaveChequeHandover(chqHandover, h)}
              onPrint={(h)=>printChequeHandover(chqHandover, h)}
              onClose={()=>setChqHandover(null)}
            />
          )}
        </div>

        {piSubTab==="invoices"&&canManagePurchase&&(<>
          {invoices.length>0&&(
            <div className="si-kpis">
              {[
                { l:t.pi_totalInvoices, v:piKPIs.total, c:"#07101c", pre:"" },
                { l:t.pi_totalAmount,   v:piFmt2(piKPIs.amount), c:piAccent, pre:`${t.cur} ` },
                { l:t.pi_totalPaid,     v:piFmt2(piKPIs.paid),   c:"#15803d", pre:`${t.cur} ` },
                { l:t.pi_totalDue,      v:piFmt2(piKPIs.due),    c:piKPIs.due>0?"#b91c1c":"#15803d", pre:`${t.cur} ` },
              ].map((k,i)=>(
                <div key={i} className="si-kpi"><span>{k.l}</span><b style={{ color:k.c }}>{k.pre}{k.v}</b></div>
              ))}
            </div>
          )}

          <div className="si-filters">
            <div className="si-search">
              <input className="pm-input" placeholder={t.pi_searchPh} value={piSearch} onChange={e=>setPiSearch(e.target.value)} />
              {piSearch&&<button type="button" aria-label="Clear" onClick={()=>setPiSearch("")}>✕</button>}
            </div>
            <div className="si-pills">
              {["ALL",...Object.keys(PI_STATUSES)].map(st=>(
                <button key={st} type="button" className={`pm-btn-secondary${piStatusF===st?" is-active":""}`} onClick={()=>setPiStatusF(st)}>
                  {st==="ALL"?t.pi_allStatus:PI_STATUSES[st]?.[lang]}
                </button>
              ))}
            </div>
            <div className="si-pills">
              {[["folders", bnL?"📁 নাম অনুযায়ী":"📁 By name"], ["all", bnL?"📋 সব":"📋 All"]].map(([m,label])=>(
                <button key={m} type="button" className={`pm-btn-secondary${piGroupMode===m?" is-active":""}`} onClick={()=>{ setPiGroupMode(m); setPiOpenParty(null); }}>{label}</button>
              ))}
            </div>
          </div>

          <div className={`si-main${piGroupMode==="all" || piMobile ? " is-all" : ""}`}>
            {showParties&&(
              <div className="si-box">
                <table className="pm-table">
                  <colgroup><col /><col style={{ width:piMobile?96:76 }} /><col style={{ width:piMobile?84:68 }} /></colgroup>
                  <thead><tr><th>{t.pi_vendor}</th><th className="si-num">{bnL?"মোট":"Total"}</th><th className="si-num">{bnL?"বাকি":"Due"}</th></tr></thead>
                  <tbody>
                    {!piMobile&&groups.length>0&&(
                      <tr className={`pm-clickable${!openGroup?" pm-selected":""}`} onClick={()=>setPiOpenParty(null)}>
                        <td className="si-strong">{bnL?"সব ভেন্ডর":"All vendors"} ({piFiltered.length})</td><td /><td />
                      </tr>
                    )}
                    {groups.map(g=>(
                      <tr key={g.key} className={`pm-clickable si-party-row${openGroup?.key===g.key?" pm-selected":""}`} onClick={()=>setPiOpenParty(g.key)}>
                        <td className="si-wrap">
                          {groupName(g)}
                          <div className="si-muted" style={{ fontWeight:400, fontSize:"0.9em" }}>
                            {g.invoices.length} {bnL?"টি":(g.invoices.length===1?"bill":"bills")}{g.lastDate?` · ${g.lastDate}`:""}
                          </div>
                        </td>
                        <td className="si-num">{piFmt2(g.total)}</td>
                        <td className={`si-num${g.due>0.01?" si-due":""}`}>{g.due>0.01?piFmt2(g.due):"-"}</td>
                      </tr>
                    ))}
                    {groups.length===0&&<tr><td colSpan={3} className="si-empty">{piLoading?"⏳":invoices.length===0?t.pi_noInvoices:t.pi_noResults}</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {showInvoices&&(
              <div className="si-box">
                {piMobile&&openGroup&&(
                  <button type="button" className="pm-btn-secondary" style={{ width:"100%", minHeight:36, marginBottom:3 }} onClick={()=>setPiOpenParty(null)}>
                    ← {bnL?"সব ভেন্ডর":"All vendors"} · {groupName(openGroup)}
                  </button>
                )}
                {piLoading ? <div className="si-empty">⏳ {t.pi_loading}</div>
                  : invoices.length===0 ? <div className="si-empty">{t.pi_noInvoices}</div>
                  : rows.length===0 ? <div className="si-empty">🔍 {t.pi_noResults}</div>
                  : piMobile ? rows.map(inv=>{
                    const due = piRowDue(inv);
                    return (
                      <button key={inv.id} type="button" className="si-mrow" onClick={()=>piOpenInvoice(inv)}>
                        <div className="si-mrow-top">
                          <span style={{ color:piAccent }}>{inv.invoiceNo}{piBtTag(inv)}</span>
                          <span>{piBadge(inv.status)}</span>
                        </div>
                        <div className="si-mrow-sub"><span>{inv.vendorName||"—"}</span><b>{t.cur} {piFmt2(inv.grandTotal)}</b></div>
                        <div className="si-mrow-sub">
                          <span>{inv.invoiceDate}{inv.supplierInvoiceNo?` · ${inv.supplierInvoiceNo}`:""}</span>
                          {due>0.01&&<span className="si-due">{bnL?"বাকি":"Due"} {piFmt2(due)}</span>}
                        </div>
                        {piMatchBlock(inv)}
                      </button>
                    );
                  })
                  : (
                    <table className="pm-table">
                      <colgroup>
                        <col style={{ width:96 }} /><col style={{ width:78 }} /><col /><col style={{ width:96 }} /><col style={{ width:84 }} />
                        <col style={{ width:42 }} /><col style={{ width:84 }} /><col style={{ width:84 }} /><col style={{ width:84 }} /><col style={{ width:100 }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>{t.pi_invoiceNo}</th><th>{t.pi_date}</th><th>{t.pi_vendor}</th><th>{bnL?"সাপ্লায়ার বিল":"Supplier Inv"}</th><th>{bnL?"স্ট্যাটাস":"Status"}</th>
                          <th className="si-num">{bnL?"আইটেম":"Items"}</th><th className="si-num">{bnL?"মোট":"Total"}</th><th className="si-num">{bnL?"পরিশোধ":"Paid"}</th>
                          <th className="si-num">{bnL?"বাকি":"Due"}</th><th>{t.pi_createdBy}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(inv=>{
                          const due = piRowDue(inv);
                          const matches = piMatchBlock(inv);
                          return (
                            <tr key={inv.id} className="pm-clickable" onClick={()=>piOpenInvoice(inv)} title={inv.note||""}>
                              <td className="si-strong" style={{ color:piAccent }} title={inv.invoiceNo}>{inv.invoiceNo}{piBtTag(inv)}</td>
                              <td>{inv.invoiceDate}</td>
                              <td className={matches.length?"si-wrap":""} title={inv.vendorName||""}>{inv.vendorName||"—"}{matches}</td>
                              <td title={inv.supplierInvoiceNo||""}>{inv.supplierInvoiceNo||"-"}</td>
                              <td>{piBadge(inv.status)}</td>
                              <td className="si-num">{inv.items?.length||0}</td>
                              <td className="si-num si-strong">{piFmt2(inv.grandTotal)}</td>
                              <td className="si-num">{piN2(inv.amountPaid)>0?piFmt2(inv.amountPaid):"-"}</td>
                              <td className={`si-num${due>0.01?" si-due":""}`}>{due>0.01?piFmt2(due):"-"}</td>
                              <td title={inv.createdByName||""}>{inv.createdByName||"-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
              </div>
            )}
          </div>

          <div className="si-statusbar">
            <span>{bnL?"দেখানো":"Showing"}: <b>{rows.length}</b>{openGroup?` · ${groupName(openGroup)}`:""}</span>
            <span>{bnL?"মোট":"Total"}: <b>{t.cur} {piFmt2(rowsSum.total)}</b></span>
            <span>{bnL?"বাকি":"Due"}: <b style={{ color:rowsSum.due>0.01?"#b91c1c":undefined }}>{t.cur} {piFmt2(rowsSum.due)}</b></span>
            {rowsSum.drafts>0&&<span style={{ color:"#b45309" }}>{bnL?`${rowsSum.drafts}টি ড্রাফট মোটে ধরা হয়নি`:`${rowsSum.drafts} draft(s) not counted in totals`}</span>}
          </div>
        </>)}
      </div>
    );
  }

  // ══════ DETAIL VIEW ══════
  if (piView==="detail"&&selInvoice) {
    const inv = invoices.find(x=>x.id===selInvoice.id) || selInvoice;
    const items = inv.items||[];
    const calc = piCalcTotals(items);
    const grand = items.length ? calc.grand : piN2(inv.grandTotal);
    const bal = grand - piN2(inv.amountPaid);
    const isOB = isOpeningBill(inv);
    const isBT = isBranchTransferBill(inv);
    const canEdit = !isOB && !isBT && piCanEditInv(inv) && ["draft","confirmed"].includes(inv.status);
    const canPay = !isBT && canVendorPayments && ["confirmed","partial"].includes(inv.status) && bal>0.01;
    const canCancel = !isOB && !isBT && isOwner && ["draft","confirmed","partial","paid"].includes(inv.status);
    const canDel = !isOB && !isBT && isOwner && ["draft","cancelled"].includes(inv.status);
    const related = getRelatedPayments(inv.id);
    const vendorCode = inv.vendorId ? (vendors||[]).find(v=>v.id===inv.vendorId)?.vendorCode : "";
    const vRow = (label, value, opts={}) => (
      <div className="pm-form-row">
        <label className="pm-label">{label}</label>
        <div className={`si-val${opts.strong?" is-strong":""}`} style={opts.color?{ color:opts.color }:undefined}>{value}</div>
      </div>
    );
    const totalRows = [
      [t.pi_subtotal, piFmt2(items.length ? calc.sub : grand)],
      ...(calc.disc>0?[[t.pi_totalDiscount, `- ${piFmt2(calc.disc)}`, "#b91c1c"]]:[]),
      ...(calc.tax>0?[[t.pi_totalTax, `+ ${piFmt2(calc.tax)}`, "#0e7490"]]:[]),
    ];
    const back = () => piLeaveDetail();
    return (
      <div ref={piRootRef} className="si-root" style={piRootStyle}>
        <style>{PM_CSS}</style>
        <style>{SI_CSS}</style>

        <div className="pm-reference-title">
          <strong style={{ color:piAccent }}>{bnL?"ক্রয় ইনভয়েস":"PURCHASE INVOICE"} — {inv.invoiceNo}</strong>
          <span>{piBadge(inv.status)}</span>
        </div>

        <div className="si-body">
          <div className="si-cols">
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{bnL?"ডকুমেন্ট":"Document"}</legend>
              <div className="si-panel-body">
                {vRow(t.pi_invoiceNo, inv.invoiceNo, { strong:true, color:piAccent })}
                {inv.supplierInvoiceNo&&vRow(t.pi_supplierInvoiceNo, inv.supplierInvoiceNo, { color:"#7e22ce" })}
                {inv.refNo&&vRow("Ref. No", inv.refNo)}
                {inv.purchaseOrderNo&&vRow(bnL?"পারচেজ অর্ডার":"Purchase Order", inv.purchaseOrderNo, { color:"#1d4ed8" })}
                {inv.goodsReceiptNo&&vRow(bnL?"মাল গ্রহণ (DN)":"Goods Received (DN)", inv.goodsReceiptNo, { color:"#0f766e" })}
                {inv.currency&&vRow(bnL?"মুদ্রা":"Currency", `${inv.currency} ${piFmt2(inv.fcGrandTotal)} @ ${inv.exchangeRate}`, { color:"#0e7490" })}
                {vRow(t.pi_date, inv.invoiceDate||"-")}
                {vRow(t.pi_createdBy, inv.createdByName||"-")}
                {isOB&&<div className="si-note">{bnL?"এটা ভেন্ডরের শুরুর ব্যালেন্স (Opening Balance) — বদলাতে ভেন্ডর মাস্টারে যান।":"This is the vendor's opening balance — change it in Vendor Master."}</div>}
                {isBT&&<div className="si-note">🚚 {bnL?`Branch Transfer ${inv.branchTransferNo||""} → ${inv.branchName||""} রিসিভের বিল। এটা দোকানের ভেতরে মাল সরানোর হিসাব — স্টক, ক্রয়ের মোট আর সাপ্লায়ারের বাকিতে ধরা হয় না। আসল সাপ্লায়ার বিল আলাদা Purchase Invoice-এ থাকবে।`:`Receipt bill of Branch Transfer ${inv.branchTransferNo||""} → ${inv.branchName||""}. It only records goods moving inside the shop — not counted in stock, purchase totals or supplier dues. The real supplier bill stays a separate Purchase Invoice.`}</div>}
              </div>
            </fieldset>
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">🏭 {t.pi_vendor}</legend>
              <div className="si-panel-body">
                {vRow(bnL?"নাম":"Name", inv.vendorName||"—", { strong:true })}
                {vendorCode&&vRow(bnL?"কোড":"Code", vendorCode)}
                {vRow(bnL?"মোবাইল":"Mobile", inv.vendorMobile||"-")}
                {inv.note&&<div className="si-note">📝 {inv.note}</div>}
              </div>
            </fieldset>
          </div>

          {items.length>0&&(
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">📦 {t.pi_items} ({items.length})</legend>
              <div className="si-panel-body"><PiItemsTable items={items} lang={lang} /></div>
            </fieldset>
          )}

          <div className="si-cols">
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{t.pi_summary}</legend>
              <div className="si-panel-body">
                {totalRows.map(([l,v,c],i)=>(
                  <div key={i} className="si-total-row"><span>{l}</span><b style={c?{ color:c }:undefined}>{t.cur} {v}</b></div>
                ))}
                <div className="si-total-row is-grand"><span>{t.pi_grandTotal}</span><span style={{ color:piAccent }}>{t.cur} {piFmt2(grand)}</span></div>
              </div>
            </fieldset>
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">💳 {t.pi_payment}</legend>
              <div className="si-panel-body">
                <div className="si-total-row"><span>{t.pi_paymentMethod}</span><b>{PI_PAY_METHODS[inv.paymentMethod]?.icon} {PI_PAY_METHODS[inv.paymentMethod]?.[lang]||"-"}</b></div>
                <div className="si-total-row"><span>{t.pi_amountPaid}</span><b style={{ color:"#15803d" }}>{t.cur} {piFmt2(inv.amountPaid)}</b></div>
                <div className={`si-paid-box${bal>0.01?" is-due":""}`}><span>{bal>0.01?t.pi_balanceDue:t.pi_alreadyFullyPaid}</span><span>{t.cur} {piFmt2(Math.max(0,bal))}</span></div>
                {related.length>0&&(
                  <div className="pm-table-wrap" style={{ marginTop:3 }}>
                    <table className="pm-table">
                      <colgroup><col /><col style={{ width:80 }} /><col style={{ width:84 }} /></colgroup>
                      <thead><tr><th>💳 {t.pi_relatedPayments}</th><th>{t.pi_date}</th><th className="si-num">{bnL?"টাকা":"Amount"}</th></tr></thead>
                      <tbody>
                        {related.map(({ payment, allocAmount })=>{
                          const off = payment.status==="cancelled";
                          const chq = payment.method==="cheque" && !off ? (PI_CHEQUE_STATUSES[payment.chequeStatus]||PI_CHEQUE_STATUSES.pending) : null;
                          return (
                            <tr key={payment.id} className="pm-clickable" style={off?{ opacity:0.55 }:undefined}
                              onClick={()=>{ setSelVoucher(payment); setPmtView("detail"); setPiSubTab("payments"); setPiView("list"); }}>
                              <td>{PI_VOUCHER_METHODS[payment.method]?.icon||"💵"} {payment.paymentNo}{off?(bnL?" (বাতিল)":" (cancelled)"):""}{chq?<span style={{ color:chq.color }}> · {chq[lang]}</span>:null}</td>
                              <td>{payment.paymentDate}</td>
                              <td className="si-num si-strong" style={off?{ textDecoration:"line-through" }:{ color:"#15803d" }}>{piFmt2(allocAmount)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </fieldset>
          </div>
        </div>

        <div className="si-actions">
          <button type="button" className="pm-btn-secondary" onClick={back}>← {bnL?"তালিকা":"List"}</button>
          {canEdit&&<button type="button" className="pm-btn pm-btn--primary" onClick={()=>piOpenEdit(inv)}>✏️ {t.pi_editBtn}</button>}
          {canPay&&<button type="button" className="pm-btn" onClick={()=>piGoToMakePayment(inv)}>{t.pi_makePayment}</button>}
          {canCancel&&<button type="button" className="pm-btn pm-btn--danger" onClick={()=>piCancelInv(inv)}>{bnL?"বাতিল":"Cancel"}</button>}
          {canDel&&<button type="button" className="pm-btn pm-btn--danger" onClick={()=>piDelete(inv)}>🗑 {bnL?"মুছুন":"Delete"}</button>}
          {canCancel&&inv.status!=="draft"&&<span className="si-hint">{bnL?"মুছতে চাইলে আগে বাতিল করুন (স্টক ঠিক থাকবে)":"To delete, cancel first (keeps stock correct)"}</span>}
        </div>
      </div>
    );
  }

  // ══════ FORM VIEW ══════
  if (wideDesktop) return (
    <div style={{ position:"fixed", inset:piWin.max?0:"28px 40px", zIndex:1500, background:"#c7d8ee", padding:piWin.max?6:"0 6px 6px", boxSizing:"border-box", overflowX:"auto", overflowY:"hidden", display:"flex", flexDirection:"column", border:piWin.max?"none":"1px solid #2854ad", boxShadow:piWin.max?"none":"0 18px 50px rgba(2,6,23,0.45)" }}>
      <div onDoubleClick={piWin.toggleMax} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, margin:piWin.max?"-6px -6px 6px":"0 -6px 6px", padding:"4px 6px 4px 12px", background:"linear-gradient(180deg,#3f69bd,#2854ad)", color:"#fff", fontSize:13, fontWeight:800, userSelect:"none", flexShrink:0, fontFamily:"Segoe UI, Tahoma, sans-serif" }}>
        <span>PURCHASE INVOICE{piInvoiceNo?` — ${piInvoiceNo}`:""}</span>
        <WindowButtons win={piWin} lang={lang} onClose={()=>{ if (piLeaveUnsavedOk()) setPiView("list"); }} />
      </div>
      <PurchaseInvoiceDesktopForm
        lang={lang} t={t} shopId={shopId} products={products} vendors={pickVendors} invoices={invoices}
        form={piForm} setField={piUpd} lines={piLines} setLines={setPiLines} current={piCurrent} setCurrent={setPiCurrent}
        totals={totals} paid={paid} balance={balance}
        invoiceNo={piInvoiceNo} editInvoiceId={editInvoiceId} saving={piSaving} nameRef={piNameRef} qtyRef={piQtyRef}
        helpers={{ piCalcLine, piFmt2, piN2, PI_PAY_METHODS, PI_STATUSES, PI_UNITS, emptyCurrent:piEmptyCurrent }}
        purchaseOptions={purchaseOpts} baseCurrency={piBaseCur} onSaveOptions={isOwner ? savePurchaseOptions : undefined}
        sourceNote={piSource ? `${piSource.kind==="grn" ? (bnL?"মাল গ্রহণ থেকে":"From Goods Received") : (bnL?"পারচেজ অর্ডার থেকে":"From Purchase Order")}: ${piSource.no}` : ""}
        onSelectProduct={piSelectProduct} onChangeCurrentUnit={piChangeCurrentUnit} onAddCurrent={piAddCurrentItem} onDelLine={piDelLine} onPickVendor={piPickVendor}
        onConfirm={piConfirm} onSaveDraft={piSaveDraft}
        onClose={()=>{ if (piLeaveUnsavedOk()) setPiView("list"); }}
        onNew={()=>{ if (piLeaveUnsavedOk()) piOpenNew(); }}
        onOpenInvoice={piOpenFromDesktop}
        onCancelInvoice={isOwner ? async (inv)=>{ if (await piCancelInv(inv)) setPiView("detail"); } : undefined}
        onDeleteInvoice={isOwner ? (inv)=>piDelete(inv) : undefined}
        onOpenProductMaster={onOpenProductMaster}
        toast={toast}
      />
    </div>
  );

  const pmInputStyle = piMobile
    ? { width:"100%", height:42, padding:"6px 10px", border:"1px solid #cbd5e1", borderRadius:8, background:"#fff", color:"#07101c", font:"15px Tahoma, Arial, sans-serif", outline:"none", boxSizing:"border-box" }
    : { width:"100%", height:20, padding:"1px 4px", border:"1px solid #8797a9", borderRadius:0, background:"#fff", color:"#07101c", font:"11px Tahoma, Arial, sans-serif", outline:"none", boxSizing:"border-box" };
  const fPanel = (title, children, extra) => (
    <fieldset className="pm-panel">
      <legend className="pm-panel-legend">{title}{extra}</legend>
      <div className="si-panel-body">{children}</div>
    </fieldset>
  );
  const fRow = (label, control) => (
    <div className="pm-form-row"><label className="pm-label">{label}</label>{control}</div>
  );
  const fField = (label, control) => (
    <div className="si-field"><label className="pm-label">{label}</label>{control}</div>
  );
  const closeForm = ()=>{ if (piLeaveUnsavedOk()) setPiView("list"); };
  const priorDoc = editInvoiceId ? invoices.find(inv=>inv.id===editInvoiceId) : null;
  const enterAdd = (e)=>{ if (e.key==="Enter") piAddCurrentItem(); };

  return (
    <div ref={piRootRef} className="si-root" style={piRootStyle}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>

      <div className="pm-reference-title">
        <strong style={{ color:piAccent }}>{editInvoiceId?(bnL?"ক্রয় ইনভয়েস এডিট":"EDIT PURCHASE INVOICE"):(bnL?"নতুন ক্রয় ইনভয়েস":"NEW PURCHASE INVOICE")}</strong>
        <span>{piInvoiceNo}</span>
      </div>

      <div className="si-body">
        {fPanel(`${t.pi_invoiceNo} & ${t.pi_date}`, <>
          {fRow(t.pi_invoiceNo, <div className="si-val is-strong" style={{ color:piAccent, fontFamily:"Consolas, monospace" }}>{piInvoiceNo}</div>)}
          {fRow(t.pi_date, <input type="date" className="pm-input" value={piForm.invoiceDate} onChange={e=>piUpd("invoiceDate",e.target.value)} />)}
          {fRow(<>{t.pi_supplierInvoiceNo} <span style={{ color:"#b91c1c" }}>*</span></>,
            <input className="pm-input" style={piForm.supplierInvoiceNo.trim()?undefined:{ borderColor:"#b91c1c" }} placeholder={t.pi_supplierInvoiceNoPh} value={piForm.supplierInvoiceNo} onChange={e=>piUpd("supplierInvoiceNo",e.target.value)} />)}
          {(purchaseOpts.refNo||piForm.refNo)&&fRow("Ref. No", <input className="pm-input" value={piForm.refNo||""} onChange={e=>piUpd("refNo",e.target.value)} placeholder={bnL?"PO / চালান নং":"PO / challan no"} />)}
          {(purchaseOpts.multiCurrency||piForm.currency)&&fRow(bnL?"মুদ্রা":"Currency", (
            <div style={{ display:"flex", gap:4 }}>
              <select className="pm-input" style={{ flex:1 }} value={piForm.currency||""} onChange={e=>{ piUpd("currency",e.target.value); if (!e.target.value) piUpd("exchangeRate",""); }}>
                <option value="">{piBaseCur}</option>
                {CURRENCIES.filter(([c])=>c!==piBaseCur).map(([c,label])=><option key={c} value={c}>{label}</option>)}
              </select>
              {isForeign(piForm, piBaseCur)&&<input className="pm-input" style={{ flex:1 }} inputMode="decimal" value={piForm.exchangeRate||""} onChange={e=>piUpd("exchangeRate",e.target.value)} placeholder={`1 ${piForm.currency} = ? ${piBaseCur}`} />}
            </div>
          ))}
          {isForeign(piForm, piBaseCur)&&<div className="si-hint" style={{ marginLeft:0 }}>{bnL?`দাম ${piForm.currency}-এ লিখুন; সেভের সময় ${piBaseCur}-এ বদলে stock আর হিসাবে যাবে।`:`Enter prices in ${piForm.currency}; they are converted to ${piBaseCur} for stock and accounts when saved.`}</div>}
        </>)}

        {fPanel(`🏭 ${t.pi_vendor}`, <>
          {vendors.length>0&&(
            <div ref={vendorSearchRef} style={{ position:"relative" }}>
              <div style={{ display:"flex", gap:3 }}>
                <input className="pm-input" style={{ flex:1 }} autoComplete="off"
                  placeholder={bnL?"ভেন্ডর খুঁজুন (নাম / কোড / মোবাইল)...":"Search vendor (name / code / mobile)..."}
                  value={vendorSearchQ}
                  onChange={e=>{ setVendorSearchQ(e.target.value); setVendorDropOpen(true); if(!e.target.value.trim()){ piUpd("vendorId",""); piUpd("vendorName",""); piUpd("vendorMobile",""); } }}
                  onFocus={()=>setVendorDropOpen(true)} />
                {piForm.vendorId&&<button type="button" className="pm-btn-secondary" title="Clear vendor" onClick={piClearVendor}>✕</button>}
                <button type="button" className="pm-btn-secondary" onClick={()=>setVendorDropOpen(o=>!o)}>▾</button>
              </div>
              {piForm.vendorId&&!vendorDropOpen&&(
                <div className="si-paid-box" style={{ marginTop:3 }}><span>✅ {piForm.vendorName}</span><span style={{ fontWeight:400 }}>{piForm.vendorMobile}</span></div>
              )}
              {vendorDropOpen&&(
                <div className="si-box" style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:999, maxHeight:240, boxShadow:"0 6px 18px rgba(0,0,0,0.25)" }}>
                  {filteredVendorOpts.length===0
                    ? <div className="si-empty">{bnL?"কোনো ভেন্ডর পাওয়া যায়নি":"No vendors found"}</div>
                    : filteredVendorOpts.map(v=>(
                      <button key={v.id} type="button" className="si-mrow" style={{ display:"block", width:"100%", textAlign:"left", padding:"5px 7px", border:0, borderBottom:"1px solid #cbd5e1", background:piForm.vendorId===v.id?"#dbeafe":"#fff", font:"inherit", cursor:"pointer" }}
                        onClick={()=>piPickVendor(v)}>
                        <div className="si-strong">{v.vendorName}{piForm.vendorId===v.id?" ✓":""}</div>
                        <div className="si-muted" style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          {v.vendorCode&&<span style={{ fontFamily:"Consolas, monospace" }}>{v.vendorCode}</span>}
                          {(v.mobileNumber||v.whatsappNumber)&&<span>📱 {v.mobileNumber||v.whatsappNumber}</span>}
                          {v.city&&<span>📍 {v.city}</span>}
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
          {fRow(<>{bnL?"নাম":"Name"} <span style={{ color:"#b91c1c" }}>*</span></>,
            <input className="pm-input" style={piForm.vendorName.trim()?undefined:{ borderColor:"#b91c1c" }} placeholder={t.pi_vendorManual} value={piForm.vendorName} onChange={e=>{ piUpd("vendorName",e.target.value); if (piForm.vendorId) piUpd("vendorId",""); }} />)}
          {fRow(bnL?"মোবাইল":"Mobile", <input className="pm-input" inputMode="tel" value={piForm.vendorMobile} onChange={e=>piUpd("vendorMobile",e.target.value)} />)}
        </>)}

        {fPanel(`📦 ${t.pi_items}`, <>
          <div className="si-entry">
            {fField(t.pi_itemName, (
              <ProductTypeaheadInput
                products={products}
                value={piCurrent.name}
                onChange={(value)=>setPiCurrent((p)=>({ ...p, name:value, productId:null }))}
                onSelectProduct={piSelectProduct}
                field="name"
                inputRef={piNameRef}
                placeholder={t.pi_itemName}
                th={PM_TH}
                lang={lang}
                onKeyDown={enterAdd}
                style={{ ...pmInputStyle, fontWeight:700 }}
              />
            ))}
            <div className="si-grid2">
              {fField("Code / Model", (
                <ProductTypeaheadInput
                  products={products}
                  value={piCurrent.code}
                  onChange={(value)=>setPiCurrent((p)=>({ ...p, code:value }))}
                  onSelectProduct={piSelectProduct}
                  field="code"
                  placeholder="Code / Model"
                  th={PM_TH}
                  lang={lang}
                  onKeyDown={enterAdd}
                  style={pmInputStyle}
                />
              ))}
              {fField(t.pi_brand, <input className="pm-input" value={piCurrent.brand} onChange={e=>setPiCurrent(p=>({...p,brand:e.target.value}))} />)}
            </div>
            {piCurrent.productId && <StockBadge product={products.find(pr=>pr.id===piCurrent.productId)} products={products} shopId={shopId} refreshKey={invoices} lang={lang} />}
            {piCurrent.productId && (
              <ProductInvoiceEntryInfo
                product={products.find((pr) => pr.id === piCurrent.productId)}
                lang={lang}
                fmt={piFmt2}
                canSeeCost={canManagePurchase || can("manageProducts")}
              />
            )}
            <div className="si-grid3" style={{ gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)" }}>
              {fField(t.pi_qty, <input className="pm-input" style={{ textAlign:"center" }} inputMode="decimal" placeholder="0" value={piCurrent.qty}
                ref={piQtyRef} onChange={e=>setPiCurrent(p=>({...p,qty:e.target.value}))} onKeyDown={enterAdd} />)}
              {fField(t.pi_unit, (
                <select className="pm-input" value={piCurrent.unit} onChange={e=>piChangeCurrentUnit(e.target.value)}>
                  {siUnitOptionsFor(products.find(pr=>pr.id===piCurrent.productId), piCurrent.unit).map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              ))}
              {fField(t.pi_unitCost, <input className="pm-input" style={{ fontWeight:700 }} inputMode="decimal" placeholder="0.00" value={piCurrent.unitCost}
                onChange={e=>setPiCurrent(p=>({...p,unitCost:e.target.value}))} onKeyDown={enterAdd} />)}
            </div>
            <div className="si-grid3" style={{ gridTemplateColumns:"70px 62px minmax(0,1fr)" }}>
              {fField(t.pi_discPerc, <input className="pm-input" inputMode="decimal" placeholder="0" value={piCurrent.discountPerc} onChange={e=>setPiCurrent(p=>({...p,discountPerc:e.target.value}))} />)}
              {fField("VAT%", <input className="pm-input" inputMode="decimal" placeholder="5" value={piCurrent.taxPerc} onChange={e=>setPiCurrent(p=>({...p,taxPerc:e.target.value}))} />)}
              {fField(`💰 ${t.pi_salePrice}`, <input className="pm-input" style={{ color:"#15803d", fontWeight:700 }} inputMode="decimal" placeholder={t.pi_salePricePh} value={piCurrent.salePrice}
                onChange={e=>setPiCurrent(p=>({...p,salePrice:e.target.value}))} onKeyDown={enterAdd} />)}
            </div>
            <div style={{ display:"flex", gap:4, alignItems:"center" }}>
              <button type="button" className="pm-btn pm-btn--primary" style={{ flex:1, minHeight:piMobile?38:24 }} onClick={piAddCurrentItem}>
                {piEditLineId ? (bnL?"✅ আপডেট করুন":"✅ Update Item") : (bnL?"✅ পণ্য যোগ করুন":"✅ Add Item")}
              </button>
              {piEditLineId&&<button type="button" className="pm-btn-secondary" style={{ minHeight:piMobile?38:24 }} onClick={()=>{ setPiEditLineId(null); setPiCurrent(piEmptyCurrent()); }}>{bnL?"বাদ":"Cancel"}</button>}
              {(piN2(piCurrent.qty)>0&&piN2(piCurrent.unitCost)>0)&&(
                <b style={{ color:piAccent, whiteSpace:"nowrap" }}>= {t.cur} {piFmt2(piCalcLine(piCurrent).total)}</b>
              )}
            </div>
          </div>
          {piLines.length===0
            ? <div className="pm-hint" style={{ textAlign:"center" }}>{bnL?"↑ উপরে পণ্য যোগ করুন":"↑ Add items above"}</div>
            : <PiItemsTable items={piLines} lang={lang} onEdit={piEditLine} onDelete={piDelLine} editId={piEditLineId} />}
        </>, piLines.length>0 ? ` (${piLines.length})` : "")}

        {fPanel(`📊 ${t.pi_summary}`, <>
          <div className="si-total-row"><span>{t.pi_subtotal}</span><b>{t.cur} {piFmt2(totals.sub)}</b></div>
          {totals.disc>0&&<div className="si-total-row"><span>{t.pi_totalDiscount}</span><b style={{ color:"#b91c1c" }}>- {t.cur} {piFmt2(totals.disc)}</b></div>}
          {totals.tax>0&&<div className="si-total-row"><span>{t.pi_totalTax}</span><b style={{ color:"#0e7490" }}>+ {t.cur} {piFmt2(totals.tax)}</b></div>}
          <div className="si-total-row is-grand"><span>{t.pi_grandTotal}</span><span style={{ color:piAccent }}>{t.cur} {piFmt2(totals.grand)}</span></div>
        </>)}

        {fPanel(`💳 ${t.pi_payment}`, <>
          {fRow(bnL?"পেমেন্টের ধরন":"Payment method", (
            <select className="pm-input" value={piForm.paymentMethod} onChange={e=>{
              const key = e.target.value;
              setPiForm(p=>({ ...p, paymentMethod:key, ...(p.paymentMethod==="cash"&&key!=="cash" ? { amountPaid:"" } : {}) }));
            }}>
              {Object.entries(PI_PAY_METHODS).map(([key,pm])=><option key={key} value={key}>{pm.icon} {pm[lang]}</option>)}
            </select>
          ))}
          {piForm.paymentMethod==="cash" ? (
            <div className="si-paid-box"><span>✅ {bnL?"নগদে সম্পূর্ণ পরিশোধিত":"Fully paid (cash)"}</span><span>{t.cur} {piFmt2(totals.grand)}</span></div>
          ) : (
            <>
              {fRow(t.pi_amountPaid, (
                <div style={{ display:"flex", gap:4 }}>
                  <input className="pm-input" inputMode="decimal" placeholder="0.00" value={piForm.amountPaid} onChange={e=>piUpd("amountPaid",e.target.value)} />
                  {totals.grand>0&&<button type="button" className="pm-btn-secondary" onClick={()=>piUpd("amountPaid",piFmt2(totals.grand))}>{bnL?"পুরো":"Full"}</button>}
                </div>
              ))}
              {totals.grand>0&&<div className={`si-paid-box${balance>0.01?" is-due":""}`}><span>{t.pi_balanceDue}</span><span>{t.cur} {piFmt2(balance)}</span></div>}
            </>
          )}
        </>)}

        {fPanel(`📝 ${t.pi_note}`, (
          <textarea className="pm-input" placeholder={t.pi_notePh} value={piForm.note} onChange={e=>piUpd("note",e.target.value)} />
        ))}
      </div>

      <div className="si-actions si-sticky-actions">
        <button type="button" className="pm-btn pm-btn--primary" onClick={piConfirm} disabled={piSaving}>{piSaving?"...":t.pi_confirm}</button>
        {(!priorDoc || priorDoc.status==="draft")&&<button type="button" className="pm-btn" onClick={piSaveDraft} disabled={piSaving}>{t.pi_saveDraft}</button>}
        <button type="button" className="pm-btn-secondary" onClick={closeForm}>{t.pi_cancelForm}</button>
      </div>
    </div>
  );
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

// ─── STYLES FUNCTION ─────────────────────────────────────────
function getStyles(th) { return {
  root:        { minHeight:"100vh", background:th.bgRoot, color:th.txtSecondary, fontFamily:"'Segoe UI', system-ui, sans-serif" },
  notif:       { position:"fixed", top:16, right:16, zIndex:20000, padding:"12px 20px", borderRadius:10, border:"1px solid", fontSize:13, fontWeight:600, maxWidth:320, boxShadow:"0 4px 20px rgba(0,0,0,0.3)" },
  hdr:         { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderBottom:`1px solid ${th.border}`, background:th.bgHdr, position:"sticky", top:0, zIndex:10, flexWrap:"wrap", gap:8 },
  hLeft:       { display:"flex", alignItems:"center", gap:10 },
  title:       { fontSize:14, fontWeight:800, color:th.accent, lineHeight:1.1 },
  title3dBase: {
    fontSize:16,
    fontWeight:900,
    lineHeight:1.08,
    letterSpacing:.2,
    display:"inline-block",
    color:th.accent,
    backgroundClip:"text",
    WebkitBackgroundClip:"text",
    WebkitTextFillColor:"transparent",
    backgroundSize:"250% 250%",
    animation:"s4TitleFloat 2.4s ease-in-out infinite, s4TitleShine 4.8s ease-in-out infinite, s4TitleGlowPulse 2.8s ease-in-out infinite",
    transition:"all .45s ease",
    transformStyle:"preserve-3d",
    whiteSpace:"nowrap",
  },
  title3dVariants: [
    { backgroundImage:"linear-gradient(135deg,#bfdbfe,#60a5fa,#2563eb,#93c5fd)", textShadow:"0 1px 0 #0b1220, 0 2px 0 #0f172a, 0 8px 16px rgba(37,99,235,.45)" },
    { backgroundImage:"linear-gradient(135deg,#fff7ed,#fbbf24,#f97316,#fde68a)", textShadow:"0 1px 0 #451a03, 0 2px 0 #78350f, 0 8px 18px rgba(251,191,36,.38)" },
    { backgroundImage:"linear-gradient(135deg,#ecfeff,#22d3ee,#3b82f6,#a78bfa)", textShadow:"0 1px 0 #082f49, 0 2px 0 #1e1b4b, 0 0 18px rgba(34,211,238,.55)" },
    { backgroundImage:"linear-gradient(135deg,#ffffff,#cbd5e1,#60a5fa,#ffffff)", textShadow:"0 1px 0 #1e293b, 0 2px 0 #334155, 0 10px 20px rgba(148,163,184,.36)" },
  ],
  sub:         { fontSize:10, color:th.txtMuted },
  langSw:      { display:"flex", borderRadius:8, overflow:"hidden", border:`1px solid ${th.borderMid}` },
  lBtn:        { padding:"6px 12px", border:"none", background:"transparent", color:th.txtMuted, cursor:"pointer", fontSize:12, fontWeight:700 },
  lBtnA:       { background:th.accent, color:"#fff" },
  tabs:        { display:"flex", gap:5, flexWrap:"wrap", maxWidth:"100%", overflowX:"auto" },
  tab:         { padding:"7px 11px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:"transparent", color:th.txtMuted, cursor:"pointer", fontSize:12, fontWeight:600, position:"relative" },
  tabA:        { background:th.accent, color:"#fff", border:`1px solid ${th.accent}` },
  badge:       { position:"absolute", top:-6, right:-6, background:"#ef4444", color:"#fff", borderRadius:"50%", width:16, height:16, fontSize:9, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800 },
  panel:       { maxWidth:660, margin:"0 auto", padding:"18px 14px 60px" },
  secTitle:    { fontSize:14, fontWeight:700, color:th.accent, marginBottom:10 },
  card:        { background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:14, marginBottom:10 },
  inp:         { padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" },
  ta:          { width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:13, outline:"none", resize:"none", marginBottom:8, boxSizing:"border-box", fontFamily:"inherit" },
  sendBtn:     { width:"100%", padding:"12px", borderRadius:10, border:"none", background:"linear-gradient(135deg, #f97316, #ea580c)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" },
  addInvoiceBtn:{ width:"100%", padding:"11px", borderRadius:10, border:`2px dashed ${th.accent}`, background:"rgba(249,115,22,0.08)", color:th.accent, fontSize:14, fontWeight:700, cursor:"pointer", letterSpacing:0.3 },
  invoiceCard: { background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, overflow:"hidden", marginBottom:4 },
  invHeader:   { display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:th.border, fontSize:10, color:th.txtMuted, textTransform:"uppercase", letterSpacing:0, fontWeight:700 },
  invRow:      { display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderTop:`1px solid ${th.border}` },
  invSerial:   { fontSize:12, fontWeight:800, color:th.accent },
  invDelBtn:   { width:26, height:26, borderRadius:6, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:11, fontWeight:700, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" },
  oHdr:        { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 },
  oId:         { fontSize:14, fontWeight:800, color:th.txtPrimary },
  sBadge:      { padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:700 },
  iSum:        { display:"flex", gap:8, alignItems:"center", padding:"5px 0", borderTop:`1px solid ${th.border}`, flexWrap:"wrap" },
  iName:       { fontSize:13, color:th.txtSecondary, fontWeight:600 },
  iMeta:       { fontSize:10, color:th.txtMuted, marginTop:2, display:"flex", flexWrap:"wrap", gap:4 },
  iQty:        { fontSize:12, color:th.txtMuted },
  iPrice:      { fontSize:13, fontWeight:700, color:"#22c55e" },
  empty:       { textAlign:"center", padding:"50px 20px", color:th.txtFaint, fontSize:14 },
  nBadge:      { fontSize:10, background:th.accentDim, color:th.accent, padding:"2px 7px", borderRadius:10, fontWeight:700 },
  div:         { height:1, background:th.border, margin:"10px 0" },
  oiCard:      { background:th.bgOiCard, borderRadius:10, padding:12, marginBottom:8, border:`1px solid ${th.border}` },
  row:         { display:"flex", gap:7, marginBottom:7, alignItems:"center" },
  sel:         { flex:1, padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgSel, color:th.txtPrimary, fontSize:14, outline:"none", fontFamily:"inherit" },
  waBtn:       { display:"flex", alignItems:"center", gap:4, padding:"8px 12px", borderRadius:8, background:"#15803d", color:"#fff", textDecoration:"none", fontSize:12, fontWeight:700, whiteSpace:"nowrap", flexShrink:0 },
  savBtn:      { padding:"8px 14px", borderRadius:8, border:"none", background:"#1d4ed8", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", flexShrink:0 },
  sRow:        { display:"flex", gap:7, marginBottom:7 },
  stBtn:       { flex:1, padding:"10px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgCard, color:th.txtMuted, fontSize:12, fontWeight:700, cursor:"pointer" },
  stBtnC:      { background:"#052e16", color:"#22c55e", border:"1px solid #22c55e" },
  stBtnN:      { background:"#450a0a", color:"#ef4444", border:"1px solid #ef4444" },
  delBtn:      { width:"100%", padding:"11px", borderRadius:10, border:"none", background:"linear-gradient(135deg, #4f46e5, #7c3aed)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", marginTop:4 },
  delOrderBtn: { width:"100%", padding:"10px", borderRadius:10, border:"1px solid #450a0a", background:"transparent", color:"#ef4444", fontSize:12, fontWeight:700, cursor:"pointer", marginTop:8 },
  flowBtn:     { width:"100%", padding:"11px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:6 },
  addCoBtn:    { padding:"7px 14px", borderRadius:8, border:`1px solid ${th.accent}`, background:"transparent", color:th.accent, cursor:"pointer", fontSize:12, fontWeight:700 },
  coIcon:      { width:40, height:40, background:th.border, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 },
  edBtn:       { padding:"6px 10px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgCard, color:th.txtSecondary, cursor:"pointer", fontSize:13 },
  dlBtn:       { padding:"6px 9px", borderRadius:8, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:13 },
  authWrap:    { maxWidth:440, margin:"0 auto", padding:"32px 18px 60px", textAlign:"center" },
  welcomeWrap: { maxWidth:440, margin:"0 auto", padding:"60px 18px", textAlign:"center" },
  authIcon:    { fontSize:48, marginBottom:8 },
  headerLogo:  { width:36, height:36, borderRadius:8, objectFit:"cover" },
  bigLogo:     { width:130, height:130, borderRadius:20, objectFit:"cover", marginBottom:16, boxShadow:"0 4px 20px rgba(0,0,0,0.4)" },
  authTitle:   { fontSize:24, fontWeight:800, color:th.accent, marginBottom:6 },
  authSub:     { fontSize:13, color:th.txtMuted, marginBottom:20 },
  authCard:    { background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:16, textAlign:"left" },
  authFooter:  { fontSize:12, color:th.txtMuted, marginTop:16 },
  linkBtn:     { background:"transparent", border:"none", color:th.accent, cursor:"pointer", fontSize:12, fontWeight:700, padding:"10px", marginTop:8, fontFamily:"inherit" },
  linkBtnInline:{ background:"transparent", border:"none", color:th.accent, cursor:"pointer", fontSize:12, fontWeight:700, padding:0, fontFamily:"inherit", textDecoration:"underline" },
  roleGrid:    { display:"flex", flexDirection:"column", gap:12 },
  roleCard:    { background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:"22px 18px", cursor:"pointer", color:th.txtSecondary, textAlign:"left", fontFamily:"inherit" },
  roleEmoji:   { fontSize:38, marginBottom:8 },
  roleName:    { fontSize:16, fontWeight:700, color:th.txtPrimary, marginBottom:4 },
  roleDesc:    { fontSize:12, color:th.txtMuted },
  settingsLbl: { fontSize:11, color:th.txtMuted, marginBottom:10, textTransform:"uppercase", letterSpacing:0, fontWeight:700 },
  inviteBox:   { fontSize:22, fontWeight:800, color:th.accent, textAlign:"center", padding:"16px", background:th.bgInp, borderRadius:10, border:`2px dashed ${th.accent}`, letterSpacing:2, fontFamily:"monospace" },
  logoutBtn:   { width:"100%", padding:"13px", borderRadius:10, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", fontSize:14, fontWeight:700, cursor:"pointer", marginTop:16 },
  desktopLayout:  { display:"flex", height:"calc(100vh - 61px)", overflow:"hidden" },
  desktopContent: { flex:1, overflowY:"auto", background:th.bgRoot },
  desktopPanel:   { maxWidth:900, margin:"0 auto", padding:"24px 28px 60px" },
  sidebar:        { width:230, minWidth:230, background:th.bgSidebar, borderRight:`1px solid ${th.border}`, display:"flex", flexDirection:"column", padding:"20px 14px 16px", overflowY:"auto" },
  sideNav:        { display:"flex", flexDirection:"column", gap:6 },
  sideTab:        { display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderRadius:10, border:"none", background:"transparent", color:th.txtMuted, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit" },
  sideTabA:       { background:th.accent, color:"#fff" },
  sideKey:        { flexShrink:0, padding:"1px 6px", borderRadius:5, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtMuted, fontSize:10, fontWeight:700, fontFamily:"Consolas, monospace", whiteSpace:"nowrap" },
  sideKeyA:       { background:"rgba(255,255,255,0.18)", borderColor:"rgba(255,255,255,0.45)", color:"#fff" },
  sideBadge:      { background:"#ef4444", color:"#fff", borderRadius:10, padding:"2px 7px", fontSize:10, fontWeight:800, marginLeft:"auto" },
  sideLogout:     { width:"100%", padding:"11px", borderRadius:10, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" },
  dayHeader:      { display:"flex", alignItems:"center", gap:8, margin:"18px 0 8px", paddingBottom:6, borderBottom:`1px solid ${th.border}` },
  dayDot:         { width:8, height:8, borderRadius:"50%", background:th.accent, flexShrink:0 },
  dayLabel:       { fontSize:13, fontWeight:700, color:th.accent, flex:1 },
  dayCount:       { fontSize:11, color:th.txtMuted, background:th.border, padding:"2px 8px", borderRadius:10 },
  settingsRow:    { width:"100%", display:"flex", alignItems:"center", gap:12, padding:"14px 16px", background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, marginBottom:8, cursor:"pointer", fontFamily:"inherit", textAlign:"left" },
  settingsRowIcon:{ fontSize:22, flexShrink:0, width:32, textAlign:"center" },
  settingsRowLabel:{ fontSize:14, fontWeight:700, color:th.txtPrimary, marginBottom:2 },
  settingsRowSub: { fontSize:11, color:th.txtMuted },
  settingsArrow:  { fontSize:20, color:th.borderMid, flexShrink:0 },
  backRowBtn: {
  display:"flex",
  alignItems:"center",
  gap:8,
  background:"transparent",
  border:"none",
  color:th.accent,
  cursor:"pointer",
  fontSize:13,
  fontWeight:700,
  fontFamily:"inherit",
  padding:"0 0 14px 0"
},

modalOverlay: {
  position:"fixed",
  inset:0,
  background:"rgba(0,0,0,0.7)",
  zIndex:9999,
  display:"flex",
  justifyContent:"center",
  alignItems:"center",
  padding:20,
},

vendorModal: {
  width:"100%",
  maxWidth:1200,
  background:"#18181b",
  borderRadius:18,
  padding:20,
  maxHeight:"95vh",
  overflowY:"auto",
},

vendorHeader: {
  display:"flex",
  justifyContent:"space-between",
  alignItems:"center",
  marginBottom:20,
},

vendorTitle: {
  fontSize:24,
  fontWeight:700,
  color:"#fff",
},

modalCloseBtn: {
  width:40,
  height:40,
  borderRadius:10,
  border:"none",
  cursor:"pointer",
  background:"#27272a",
  color:"#fff",
},

vendorGrid: {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",
  gap:12,
},

vendorFooter: {
  display:"flex",
  justifyContent:"flex-end",
  gap:10,
  marginTop:20,
},

};}

// Fallback styles (dark) used by components before theme prop arrives
const _globalS = getStyles(THEMES.dark);
const _erpS = getStyles(THEMES.erp);
const _erpDarkS = getStyles(THEMES.erpDark);
