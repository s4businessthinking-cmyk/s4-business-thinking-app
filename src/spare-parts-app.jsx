import { useState, useEffect, useRef, useMemo, Fragment } from "react";
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
import { groupMenuItems } from "./dashboard/menuGroups.js";
import { useEscapeKey, useWindowState, WindowButtons, MinimizedChip } from "./components/WindowChrome.jsx";
import PrintSettingsWindow from "./print/PrintSettingsWindow.jsx";
import { loadPrintSettings, docSettingsFor, paperCss, printHtmlDocument, printWithSettings, canPickPrinter } from "./print/printSettings.js";
import { applyDesign, loadPrintDesign, layoutAppliesTo, renderLayoutDocument, amountInWords, generateStatementHTML, SAMPLE_DATA, shopHeaderExtras } from "./print/printDesign.js";
import { useChequeDueNotifications } from "./dashboard/chequeNotifications.js";
import VendorChequeWizard from "./vouchers/VendorChequeWizard.jsx";
import OwnerPinModal from "./auth/OwnerPinModal.jsx";
import ChequeHandoverModal from "./vouchers/ChequeHandoverModal.jsx";
import { chequeVoucherHtml, chequeHandoverHtml, chequeAmountOfVoucher } from "./vouchers/chequeDocs.js";
import { saveHandoverDocs, loadHandoverDocs, handoverSummary } from "./vouchers/chequeHandoverStore.js";
import { startAutoBackup } from "./backup/backupService.js";
import { saveTextFile } from "./utils/saveTextFile.js";
import { ProductTypeaheadInput } from "./components/ProductTypeaheadInput.jsx";
import SalesInvoiceDesktopForm from "./sales-invoice/SalesInvoiceDesktopForm.jsx";
import PurchaseInvoiceDesktopForm from "./purchase/PurchaseInvoiceDesktopForm.jsx";
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

// Tracks whether there is a genuine Firebase Auth session (auth.currentUser),
// as distinct from the local-only offline session that `restoreLocalAuthSession()`
// can produce before (or without ever) establishing one. Any component that
// attaches a Firestore onSnapshot listener should gate on this — a shopId-scoped
// query without a real auth session just produces a silent permission-denied.
function useFirebaseAuthReady() {
  const [ready, setReady] = useState(() => !!auth?.currentUser);
  useEffect(() => subscribeFirebaseAuthReady(setReady), []);
  return ready;
}

function isBlankProduct(product) {
  return !["name", "code", "barcode"].some((k) => String(product?.[k] ?? "").trim() !== "");
}

function isActiveProduct(product) {
  if (!product) return false;
  return product.isDeleted !== true && product.deleted !== true && !isBlankProduct(product);
}

// Invoice statuses that represent stock actually having moved (draft and
// cancelled invoices never touch stock).
const STOCK_AFFECTING_INVOICE_STATUSES = ["confirmed", "paid", "partial"];

// Lines typed without picking a product (e.g. labour) never move stock, so the user confirms that knowingly.
function unlinkedStockOk(items, lang) {
  const names = (items || []).filter((it) => !it?.productId && String(it?.name || "").trim()).map((it) => it.name.trim());
  if (!names.length) return true;
  const list = names.slice(0, 5).join(", ") + (names.length > 5 ? " …" : "");
  return window.confirm(lang === "bn"
    ? `এই আইটেমগুলো Product Master থেকে বাছাই করা হয়নি, তাই স্টকে যোগ/বিয়োগ হবে না:\n${list}\n\nতবুও সেভ করবেন?`
    : `These items were not picked from the Product Master, so stock will not change:\n${list}\n\nSave anyway?`);
}

// Applies the stock-ledger delta between an invoice's previous saved state
// and its new state: reverses the old line items (if the old status had
// already moved stock) and applies the new line items (if the new status
// moves stock). This covers create, edit (items or status changed), and
// cancel in one place — a plain status change with unchanged items nets to
// zero and simply re-records a reversal + re-application, which is fine
// since we skip calling this when items truly didn't change (see call sites).
async function applyInvoiceStockEffect({
  oldInvoice,
  newInvoice,
  invoiceId,
  applyType,
  reverseType,
  referenceType,
  unitCostKey,
  shopId,
  actor,
}) {
  const oldAffects = oldInvoice && STOCK_AFFECTING_INVOICE_STATUSES.includes(oldInvoice.status);
  const newAffects = newInvoice && STOCK_AFFECTING_INVOICE_STATUSES.includes(newInvoice.status);
  if (!oldAffects && !newAffects) return;
  const sig = (inv) => JSON.stringify((inv?.items || []).map((it) => [it.productId || "", Number(it.qty) || 0, it.unit || "", Number(it.unitFactor) || 1, Number(it[unitCostKey]) || 0]));
  if (oldAffects && newAffects && sig(oldInvoice) === sig(newInvoice)) return;

  const runLine = async (it, movementType) => {
    const qty = itemBaseQty(it);
    if (!it?.productId || qty <= 0) return;
    const factor = Number(it.unitFactor) > 0 ? Number(it.unitFactor) : 1;
    try {
      await createStockLedgerEntry({
        productId: it.productId,
        shopId,
        quantity: qty,
        movementType,
        referenceType,
        referenceId: invoiceId,
        unitCost: (Number(it[unitCostKey]) || 0) / factor,
        actor,
      });
    } catch (err) {
      console.warn(`[S4 Stock] ${movementType} ledger entry failed`, it.productId, err);
    }
  };

  if (oldAffects) {
    for (const it of (oldInvoice.items || [])) await runLine(it, reverseType);
  }
  if (newAffects) {
    for (const it of (newInvoice.items || [])) await runLine(it, applyType);
  }
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
    merged.set(id, product);
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
const PRESET_POSITIONS = {
  bn: ["সিনিয়র সেলসম্যান", "জুনিয়র সেলসম্যান", "ম্যানেজার", "ক্যাশিয়ার", "স্টোরকিপার", "ডেলিভারি ম্যান", "অ্যাকাউন্ট্যান্ট", "সুপারভাইজার"],
  en: ["Senior Salesman", "Junior Salesman", "Manager", "Cashier", "Storekeeper", "Delivery Man", "Accountant", "Supervisor"],
};

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
];

const DEFAULT_PERMISSIONS = {
  sendOrder: true,
  manageCompanies: false,
  setPrices: false,
  setStatus: false,
  markDelivery: false,
  deleteOrder: false,
  viewProducts: true,
  manageProducts: false,
  manageSales: true,
  manageCustomers: true,

  viewVendors: false,
  viewSupplierLedger: false,
  vendorPayments: false,
  managePurchase: false,
  managePdc: false,
  manageExpenses: false,
  sendBranchTransfer: false,
  receiveBranchTransfer: false,
  printCheques: false,
  viewCustomerBalance: false,
  giveDiscount: false,
  cancelInvoices: false,
  manageVendors: false,
  manageReturns: false,
  stockAdjust: false,
  accountVouchers: false,
};

// ─── TRANSLATIONS ────────────────────────────────────────────
const TR = {
  bn: {
    appSub:"পার্টস অর্ডার ম্যানেজমেন্ট",
    signIn:"লগইন", signUp:"নতুন অ্যাকাউন্ট", logout:"লগআউট",
    welcomeBack:"আবার স্বাগতম!", welcomeBackSub:"আপনার অ্যাকাউন্টে লগইন করুন",
    chooseRole:"আপনি কে?", chooseRoleSub:"নতুন অ্যাকাউন্ট তৈরিতে আপনার ভূমিকা বেছে নিন",
    roleOwnerCard:"🏢 আমি দোকানের মালিক", roleOwnerDesc:"নতুন দোকান তৈরি ও সব কিছু ম্যানেজ করব",
    roleSalesCard:"👨‍💼 আমি কর্মী / সেলসম্যান", roleSalesDesc:"মালিকের দেওয়া invite code দিয়ে যোগ দেব",
    backBtn:"← ফিরে যান",
    companyName:"দোকানের নাম *", personName:"আপনার নাম *",
    countryLbl:"দেশ *", areaLbl:"এলাকা / শহর *",
    mobileLbl:"মোবাইল নম্বর *", emailLbl:"ইমেইল *", usernameLbl:"ইউজারনেম *",
    usernameOrEmailLbl:"ইউজারনেম বা ইমেইল *",
    passwordLbl:"পাসওয়ার্ড * (অন্তত ৬ অক্ষর)", confirmPwLbl:"পাসওয়ার্ড নিশ্চিত করুন *",
    loginOfflineHint:"🆕 নতুন দোকান (মালিক): Username admin + Password admin → প্রথম login-এ password বদলান",
    loginStaffHint:"👨‍💼 কর্মী/সেলসম্যান: Create Account → Invite Code দিয়ে join করুন",
    changePwTitle:"নতুন পাসওয়ার্ড সেট করুন",
    changePwSub:"নিরাপত্তার জন্য ডিফল্ট পাসওয়ার্ড পরিবর্তন করুন",
    changePwBtn:"পাসওয়ার্ড সেভ করুন",
    changePwSaved:"✅ পাসওয়ার্ড আপডেট হয়েছে",
    shopSetupTitle:"🏢 দোকান সেটআপ",
    shopSetupSub:"প্রথমে দোকানের মূল তথ্য দিন — internet ছাড়াই save হবে",
    shopSetupBtn:"✅ সেটআপ সম্পন্ন",
    addStaffTitle:"➕ নতুন কর্মী যোগ করুন",
    addStaffBtn:"কর্মী যোগ করুন",
    staffAddedOk:"✅ কর্মী যোগ হয়েছে",
    removeMemberBtn:"🚫 বন্ধ করুন",
    confirmRemoveMember:"এই কর্মীর অ্যাকাউন্ট বন্ধ করবেন? আর login করতে পারবে না।",
    memberRemovedOk:"✅ কর্মীর অ্যাকাউন্ট বন্ধ করা হয়েছে",
    resetPwLbl:"নতুন পাসওয়ার্ড",
    resetPwBtn:"পাসওয়ার্ড রিসেট",
    resetPwOk:"✅ পাসওয়ার্ড আপডেট হয়েছে",
    currentPwLbl:"বর্তমান পাসওয়ার্ড",
    newPwLbl:"নতুন পাসওয়ার্ড",
    changePwSettingsBtn:"পাসওয়ার্ড পরিবর্তন",
    ownPwChangedOk:"✅ আপনার পাসওয়ার্ড আপডেট হয়েছে",
    inviteCodeLbl:"Invite Code * (মালিকের কাছ থেকে নিন)",
    forgotPw:"পাসওয়ার্ড ভুলে গেছেন?",
    noAccount:"অ্যাকাউন্ট নেই?", haveAccount:"ইতিমধ্যে অ্যাকাউন্ট আছে?",
    createAccount:"অ্যাকাউন্ট তৈরি করুন", loginNow:"এখনই লগইন করুন",
    creatingAccount:"অ্যাকাউন্ট তৈরি হচ্ছে...", loggingIn:"লগইন হচ্ছে...",
    verifyTitle:"📧 ইমেইল যাচাই করুন",
    verifyMsg:"আমরা আপনার ইমেইলে একটি লিঙ্ক পাঠিয়েছি। ইমেইল চেক করে লিঙ্কে ক্লিক করুন।",
    verifyMsg2:"যাচাই করার পর নিচের বোতামে ক্লিক করুন।",
    verifyCheckBtn:"✅ যাচাই হয়েছে - এগিয়ে যান", resendVerify:"📤 আবার ইমেইল পাঠান",
    notVerified:"এখনো যাচাই হয়নি। ইমেইল চেক করুন।",
    resetTitle:"🔑 পাসওয়ার্ড রিসেট", resetMsg:"আপনার ইমেইলে একটি রিসেট লিঙ্ক পাঠানো হবে।",
    resetBtn:"📤 রিসেট লিঙ্ক পাঠান", resetSent:"✅ ইমেইল পাঠানো হয়েছে! ইমেইল চেক করুন।",
    tabDashboard:"🏠 ড্যাশবোর্ড",
    dashGreeting:"স্বাগতম", dashShopLabel:"দোকান",
    dashTotalOrders:"মোট অর্ডার", dashPending:"অপেক্ষায়",
    dashDelivered:"ডেলিভারি হয়েছে", dashCancelled:"বাতিল",
    dashInProgress:"প্রসেসে আছে", dashOutForBranch:"ব্রাঞ্চে পাঠানো",
    dashProducts:"পণ্য", dashCompanies:"কোম্পানি",
    dashTeam:"টিম মেম্বার", dashCustomers:"কাস্টমার", dashVendors:"ভেন্ডর",
    dashRecentOrders:"সাম্প্রতিক অর্ডার", dashViewAll:"সব দেখুন →",
    dashQuickNav:"দ্রুত যাওয়া", dashNoOrders:"কোনো অর্ডার নেই",
    dashMyOrders:"আমার অর্ডার",
    tabSettings:"⚙️ সেটিংস", settingsTitle:"⚙️ অ্যাপ সেটিংস",
    profileTitle:"👤 প্রোফাইল", shopInfoTitle:"🏢 দোকানের তথ্য",
    inviteCodeTitle:"🔗 কর্মী Invite Code",
    inviteCodeDesc:"এই কোডটি আপনার কর্মীদের দিন। তারা signup এর সময় এই কোড দিয়ে আপনার দোকানে যুক্ত হতে পারবে।",
    copyCode:"📋 কপি করুন", codeCopied:"✅ কপি হয়েছে!",
    languageLbl:"ভাষা", syncStatus:"সিঙ্ক স্ট্যাটাস",
    updateTitle:"🔄 অ্যাপ আপডেট", updateSub:"স্বয়ংক্রিয় আপডেট",
    syncUploadBtn:"☁️ Local → Cloud Upload",
    syncDownloadBtn:"⬇️ Cloud → Local Download",
    syncPendingLbl:"অপেক্ষমান upload",
    syncLocalRecordsLbl:"Local records",
    syncLastPullLbl:"শেষ cloud download",
    syncDownloadOk:"✅ Cloud data download সম্পন্ন",
    syncUploadOk:"✅ Cloud upload সম্পন্ন",
    syncNeedInternet:"Internet সংযোগ লাগবে",
    syncNeedEmailLogin:"Cloud sync-এর জন্য online থাকা অবস্থায় email + password দিয়ে login করুন",
    syncProductsLbl:"Products (this device)",
    syncShopLbl:"Shop ID",
    syncFirebaseLbl:"Cloud login",
    syncFirebaseOk:"✅ Connected",
    syncFirebaseNo:"❌ Email login needed",
    syncAutoPullOk:"☁️ Cloud data auto-download হয়েছে",
    helpTitle:"❓ সাহায্য ও সাপোর্ট",
    helpIntro:"Software-এ যে সমস্যা, bug বা error দেখছেন—complaint জানান। নতুন feature বা option দরকার হলে idea পাঠান।",
    helpWhatsappNote:"শুধু WhatsApp message বা voice note — call করবেন না",
    helpWhatsappBtn:"💬 WhatsApp Message",
    helpFacebookBtn:"📘 Facebook Page",
    helpEmailBtn:"✉️ Email",
    helpWebsiteBtn:"🌐 Website",
    helpMenuSub:"WhatsApp, Facebook, Email, Website",
    connected:"🟢 সংযুক্ত (রিয়েল-টাইম)", connecting:"🟡 সংযোগ হচ্ছে...", offline:"🔴 অফলাইন", reconnecting:"🟡 Sync পুনরায় সংযোগ হচ্ছে...",
    teamTitle:"👥 টিম মেম্বার", youLabel:"আপনি", ownerLabel:"মালিক", salesmanLabel:"কর্মী",
    confirmLogout:"লগআউট করতে চান?",
    tabCheque:"🖨️ চেক প্রিন্ট",
    tabShop:"🏪 দোকান", tabOwner:"👤 অর্ডার", tabCompany:"🏢 কোম্পানি",
    newOrder:"📋 নতুন Purchase Order",
    itemName:"আইটেমের নাম *", code:"কোড / মডেল / সাইজ", brand:"ব্র্যান্ডের নাম",
    qty:"পরিমাণ *", unitPcs:"পিস", unitSet:"সেট",
    addItem:"✚ Invoice-এ যোগ করুন",
    invoiceList:"📄 Invoice তালিকা",
    invoiceEmpty:"এখনো কোনো আইটেম যোগ হয়নি",
    noItemName:"আইটেমের নাম দিন!",
    noQty:"পরিমাণ দিন!",
    noteP:"বিশেষ নোট (ঐচ্ছিক)...",
    sendOrder:"📤 অর্ডার পাঠান", sentOrders:"📜 পাঠানো অর্ডারসমূহ",
    noOrders:"কোনো অর্ডার আসেনি এখনো",
    selectCo:"কোম্পানি বেছে নিন", price:"কোম্পানির দাম (৳)", save:"সেভ",
    confirmed:"✅ Confirmed", noStock:"❌ No Stock",
    deliver:"🚚 Mark Delivered", delOrder:"🗑️ অর্ডার মুছুন",
    coList:"🏢 কোম্পানির তালিকা", addNew:"+ নতুন কোম্পানি",
    cancel:"বাতিল", addCoTitle:"নতুন কোম্পানি যোগ করুন",
    coName:"কোম্পানির নাম *", waNum:"WhatsApp নম্বর (যেমন: 8801712345678)",
    waHint:"💡 দেশ কোড সহ দিন, 0 ছাড়া।",
    addBtn:"✅ যোগ করুন", editTitle:"এডিট করুন", saveEdit:"✅ সেভ করুন",
    noPhone:"নম্বর নেই", noCo:"কোনো কোম্পানি নেই",
    items:"টি আইটেম", newTag:"🔔 নতুন", cur:"৳",
    status:{
      pending:            "⏳ অপেক্ষায়",
      order_confirmed:    "✅ অর্ডার গ্রহণ",
      ordered_supplier:   "📦 কোম্পানিকে জানানো",
      in_stock:           "✅ স্টকে আছে",
      out_of_stock:       "❌ স্টকে নেই",
      waiting_delivery:   "⏳ মাল আসার অপেক্ষায়",
      arrived_main_shop:  "🏪 মেইন শপে এসেছে",
      out_for_branch:     "🚚 ব্রাঞ্চে পাঠানো হচ্ছে",
      delivered:          "✅ ডেলিভারি সম্পন্ন",
      cancelled:          "🚫 বাতিল",
    },
    n1:"✅ অর্ডার পাঠানো হয়েছে!", n2:"দাম সেভ হয়েছে ✅", n3:"🚚 ডেলিভারি সম্পন্ন!",
    n4:"কোম্পানি যোগ হয়েছে ✅", n5:"কোম্পানি আপডেট হয়েছে ✅",
    n6:"কোম্পানি মুছে ফেলা হয়েছে।", n7:"অর্ডার মুছে ফেলা হয়েছে।", n8:"🚫 অর্ডার বাতিল হয়েছে।",
    n9:"✅ অ্যাকাউন্ট তৈরি হয়েছে!",
    n10:"✅ ইমেইল যাচাই সম্পন্ন!", n11:"📤 যাচাই ইমেইল আবার পাঠানো হয়েছে।",
    e1:"অন্তত একটা আইটেম দিন!", e2:"নাম খালি রাখা যাবে না!", e3:"নাম দিন!",
    delConfirm:"এই অর্ডারটি মুছে ফেলবেন?",
    positionLbl:"পদবী", selectPosition:"পদবী বেছে নিন",
    managePositionsTitle:"📋 পদবী ম্যানেজ", addPositionBtn:"+ পদবী যোগ করুন",
    positionNameP:"পদবীর নাম (যেমন: Manager, Cashier)",
    noPositions:"কোনো পদবী নেই। যোগ করুন।",
    permissionsTitle:"🔐 পারমিশন",
    permSaved:"পারমিশন আপডেট হয়েছে ✅",
    positionAdded:"পদবী যোগ হয়েছে ✅", positionDeleted:"পদবী মুছে ফেলা হয়েছে।",
    defaultPosition:"সেলসম্যান (ডিফল্ট)",
    tabProducts:"📦 পণ্য",
    pmTitle:"📦 Product Master",
    pmAdd:"+ নতুন পণ্য",
    pmName:"পণ্যের নাম *", pmCode:"কোড / মডেল", pmBrand:"ব্র্যান্ড",
    pmCategory:"ক্যাটাগরি", pmPrice:"দাম (৳)", pmUnit:"ইউনিট",
    pmSearch:"পণ্য খুঁজুন...",
    pmNoProducts:"কোনো পণ্য নেই। যোগ করুন।",
    pmAdded:"পণ্য যোগ হয়েছে ✅", pmUpdated:"পণ্য আপডেট হয়েছে ✅", pmDeleted:"পণ্য মুছে ফেলা হয়েছে।",
    pmSelectHint:"পণ্য বেছে নিন বা নিজে লিখুন",
    pmFromMaster:"📦 Product Master থেকে বেছে নিন",
    tabPurchase:"🧾 ক্রয় ইনভয়েস",
    tabSales:"🧾 বিক্রয় ইনভয়েস",
    tabQuotation:"📝 কোটেশন",
    tabDelivery:"🚚 ডেলিভারি নোট",
    si_title:"🧾 বিক্রয় ইনভয়েস",
    si_new:"+ নতুন ইনভয়েস",
    si_edit:"✏️ এডিট",
    si_backToList:"← তালিকায় ফিরুন",
    si_invoiceNo:"ইনভয়েস নং",
    si_date:"তারিখ",
    si_customer:"কাস্টমার",
    si_selectCustomer:"কাস্টমার বেছে নিন...",
    si_customerManual:"কাস্টমারের নাম লিখুন",
    si_items:"পণ্যের তালিকা",
    si_addItem:"+ আইটেম যোগ করুন",
    si_fromMaster:"📦 Product Master থেকে",
    si_itemName:"পণ্যের নাম *",
    si_code:"কোড",
    si_brand:"ব্র্যান্ড",
    si_qty:"পরিমাণ *",
    si_unit:"ইউনিট",
    si_unitPrice:"একক মূল্য (৳) *",
    si_discPerc:"ছাড় %",
    si_vatPerc:"VAT %",
    si_lineTotal:"মোট",
    si_subtotal:"সাব-টোটাল",
    si_totalDiscount:"মোট ছাড়",
    si_totalVat:"মোট VAT",
    si_grandTotal:"সর্বমোট",
    si_paymentMethod:"পেমেন্ট পদ্ধতি",
    si_amountPaid:"পরিশোধিত (৳)",
    si_balanceDue:"বাকি টাকা",
    si_note:"নোট",
    si_notePh:"যেকোনো মন্তব্য...",
    si_saveDraft:"💾 ড্রাফট",
    si_confirm:"✅ নিশ্চিত করুন",
    si_markPaid:"💵 পরিশোধিত",
    si_print:"🖨️ প্রিন্ট / PDF",
    si_searchPh:"ইনভয়েস নং বা কাস্টমার খুঁজুন...",
    si_allStatus:"সব",
    si_noInvoices:"কোনো ইনভয়েস নেই।",
    si_noResults:"কিছু পাওয়া যায়নি",
    si_saved:"✅ ড্রাফট সেভ!",
    si_confirmed:"✅ ইনভয়েস নিশ্চিত!",
    si_updated:"✅ আপডেট হয়েছে!",
    si_deleted:"ইনভয়েস মুছে ফেলা হয়েছে।",
    si_paidMarked:"✅ পরিশোধিত!",
    si_cancelledMsg:"🚫 বাতিল হয়েছে।",
    si_errName:"পণ্যের নাম দিন!",
    si_errQty:"পরিমাণ দিন!",
    si_errPrice:"মূল্য দিন!",
    si_errItems:"অন্তত একটি পণ্য যোগ করুন!",
    si_confirmDelete:"ইনভয়েসটি মুছে ফেলবেন?",
    si_confirmCancel:"ইনভয়েসটি বাতিল করবেন?",
    si_summary:"হিসাব সারসংক্ষেপ",
    si_payment:"পেমেন্ট",
    si_fullPay:"সম্পূর্ণ পরিশোধ",
    si_createdBy:"তৈরি করেছেন",
    si_totalInvoices:"মোট",
    si_totalSales:"মোট বিক্রয়",
    si_totalPaid:"পরিশোধ",
    si_totalDue:"বাকি",
    si_cancelBtn:"🚫 বাতিল করুন",
    si_deleteBtn:"🗑️ মুছুন",
    si_cancelForm:"✕ বাতিল",
    si_pmSearchPh:"পণ্য খুঁজুন...",
    si_customerSearch:"কাস্টমার খুঁজুন...",
    si_myInvoices:"আমার ইনভয়েস",
    si_allInvoices:"সব ইনভয়েস",
    si_invoiceTitle:"বিক্রয় ইনভয়েস",
    si_thankYou:"ব্যবসার জন্য ধন্যবাদ!",
    si_authorizedBy:"অনুমোদনকারী স্বাক্ষর",
    si_receivedBy:"গ্রাহক স্বাক্ষর",
    si_invoiceType:"ইনভয়েস ধরন",
    si_regular:"সাধারণ ইনভয়েস",
    si_regularDesc:"কাস্টমার তথ্য, কোনো VAT/Tax নেই",
    si_tax:"ট্যাক্স ইনভয়েস",
    si_taxDesc:"TRN সহ পূর্ণ VAT বিবরণ",
    si_deliveryChallan:"ডেলিভারি চালান",
    si_delivery:"ডেলিভারি ইনভয়েস",
    si_deliveryDesc:"ডেলিভারি চালান, কোনো ট্যাক্স নেই",
    si_deliveryInvoiceLabel:"ডেলিভারি চালান",
    si_deliveryNote:"ডেলিভারি নোট নং",
    si_vehicleNo:"গাড়ির নম্বর",
    si_deliverySection:"🚚 ডেলিভারি তথ্য",
    si_vatNo:"VAT Registration No.",
    si_trnNo:"TRN নম্বর",
    si_vatExcl:"VAT বাদে",
    si_vatAmt:"VAT পরিমাণ",
    si_vatIncl:"VAT সহ মোট",
    si_taxInvoiceLabel:"কর ইনভয়েস",
    si_regularInvoiceLabel:"বিক্রয় ইনভয়েস",
    si_showCodeLabel:"ইনভয়েসে মডেল/কোড/সাইজ দেখাও",
    si_showCodeDesc:"সক্রিয় করলে ইনভয়েসে পণ্যের নামের সাথে কোড ও ব্র্যান্ড দেখাবে",
    si_colorLabel:"রঙিন ইনভয়েস প্রিন্ট",
    si_colorDesc:"বন্ধ থাকলে সাদা-কালো, চালু করলে রঙিন ইনভয়েস প্রিন্ট হবে",
    si_invoiceSettings:"📄 ইনভয়েস সেটিংস",
    si_invoiceSettingsSub:"ইনভয়েস প্রদর্শন পছন্দ",
    tabVendor:"🏭 ভেন্ডর মাস্টার",
    tabCustomer:"👥 কাস্টমার মাস্টার",
    cm_title:"👥 কাস্টমার মাস্টার",
    cm_new:"+ নতুন কাস্টমার",
    cm_edit:"✏️ কাস্টমার এডিট",
    cm_backToList:"← তালিকায় ফিরুন",
    cm_save:"✅ সেভ করুন",
    cm_cancel:"বাতিল",
    cm_delete:"🗑️ মুছুন",
    cm_confirmDelete:"এই কাস্টমারটি মুছে ফেলবেন?",
    cm_editBtn:"✏️ এডিট",
    cm_searchPh:"নাম, কোড, মোবাইল বা TRN খুঁজুন...",
    cm_allStatus:"সব",
    cm_noCustomers:"এখনো কোনো কাস্টমার নেই।",
    cm_noResults:"কিছু পাওয়া যায়নি",
    cm_loading:"লোড হচ্ছে...",
    cm_saved:"✅ কাস্টমার সেভ হয়েছে!",
    cm_updated:"✅ কাস্টমার আপডেট হয়েছে!",
    cm_deleted:"কাস্টমার মুছে ফেলা হয়েছে।",
    cm_errName:"কাস্টমারের নাম দিন!",
    cm_errMobile:"মোবাইল নম্বর দিন!",
    cm_secBasic:"📋 মূল তথ্য",
    cm_secContact:"📱 যোগাযোগ",
    cm_secAddress:"📍 ঠিকানা",
    cm_secTax:"🧾 ট্যাক্স ও লাইসেন্স",
    cm_secBank:"🏦 ব্যাংক তথ্য",
    cm_secCredit:"💳 ক্রেডিট তথ্য",
    cm_secSales:"💰 বিক্রয় তথ্য",
    cm_secNotes:"📝 নোট",
    cm_customerName:"কাস্টমারের নাম *",
    cm_customerCode:"কাস্টমার কোড",
    cm_customerType:"কাস্টমার ধরন",
    cm_status:"স্ট্যাটাস",
    cm_contactPerson:"যোগাযোগ ব্যক্তি",
    cm_mobile:"মোবাইল নং *",
    cm_phone:"ফোন নং",
    cm_whatsapp:"WhatsApp নং",
    cm_email:"ইমেইল",
    cm_address:"ঠিকানা",
    cm_area:"এলাকা",
    cm_city:"শহর",
    cm_country:"দেশ",
    cm_mapLink:"ম্যাপ লিংক",
    cm_trnNumber:"TRN নম্বর",
    cm_tradeLicense:"ট্রেড লাইসেন্স নং",
    cm_tinNumber:"TIN নম্বর",
    cm_binNumber:"BIN নম্বর",
    cm_vatNumber:"VAT নম্বর",
    cm_bankName:"ব্যাংকের নাম",
    cm_bankBranch:"শাখা",
    cm_accountName:"অ্যাকাউন্টের নাম",
    cm_accountNumber:"অ্যাকাউন্ট নম্বর",
    cm_iban:"IBAN নম্বর",
    cm_swift:"SWIFT কোড",
    cm_creditLimit:"ক্রেডিট লিমিট (৳)",
    cm_openingBalance:"শুরুর ব্যালেন্স (৳)",
    cm_paymentTerms:"পেমেন্ট শর্ত (দিন)",
    cm_discountPerc:"ডিফল্ট ছাড় (%)",
    cm_assignedSalesman:"নির্ধারিত সেলসম্যান",
    cm_notes:"বিশেষ নোট",
    cm_emirate:"এমিরেট", cm_fax:"ফ্যাক্স",
    cm_import:"📥 ইমপোর্ট", cm_importBtn:"এক্সেল থেকে ইমপোর্ট",
    cm_importFile:"XLS/XLSX ফাইল বেছে নিন", cm_importStart:"✅ ইমপোর্ট শুরু করুন",
    cm_importDone:"সফলভাবে ইমপোর্ট হয়েছে!", cm_importProgress:"ইমপোর্ট হচ্ছে...",
    cm_importCount:"টি রেকর্ড", cm_importSkip:"টি skip (duplicate)",
    cm_totalCustomers:"মোট কাস্টমার",
    cm_activeCustomers:"সক্রিয়",
    cm_totalCreditLimit:"মোট ক্রেডিট লিমিট",
    cm_cashCustomer:"নগদ",
    cm_creditCustomer:"ক্রেডিট",
    cm_types:["রিটেইল","হোলসেল","কর্পোরেট","VIP","সরকারি","প্রজেক্ট","অন্যান্য"],
    cm_paymentType:"পেমেন্ট ধরন",
    cm_cash:"নগদ গ্রাহক",
    cm_credit:"ক্রেডিট গ্রাহক",
    vm_title:"🏭 ভেন্ডর মাস্টার",
    vm_new:"+ নতুন ভেন্ডর",
    vm_edit:"✏️ ভেন্ডর এডিট",
    vm_backToList:"← তালিকায় ফিরুন",
    vm_save:"✅ সেভ করুন",
    vm_cancel:"বাতিল",
    vm_delete:"🗑️ মুছুন",
    vm_confirmDelete:"এই ভেন্ডরটি মুছে ফেলবেন?",
    vm_createInvoice:"🧾 ক্রয় ইনভয়েস তৈরি করুন",
    vm_editBtn:"✏️ এডিট",
    vm_searchPh:"ভেন্ডর নাম, কোড বা TRN খুঁজুন...",
    vm_allStatus:"সব",
    vm_active:"সক্রিয়",
    vm_inactive:"নিষ্ক্রিয়",
    vm_blocked:"ব্লক করা",
    vm_noVendors:"এখনো কোনো ভেন্ডর নেই। নতুন ভেন্ডর তৈরি করুন।",
    vm_noResults:"কিছু পাওয়া যায়নি",
    vm_loading:"লোড হচ্ছে...",
    vm_saved:"✅ ভেন্ডর সেভ হয়েছে!",
    vm_updated:"✅ ভেন্ডর আপডেট হয়েছে!",
    vm_deleted:"ভেন্ডর মুছে ফেলা হয়েছে।",
    vm_errName:"ভেন্ডরের নাম দিন!",
    vm_errMobile:"মোবাইল নম্বর দিন!",
    vm_secBasic:"📋 মূল তথ্য",
    vm_secContact:"📱 যোগাযোগ",
    vm_secAddress:"📍 ঠিকানা",
    vm_secTax:"🧾 ট্যাক্স ও লাইসেন্স",
    vm_secBank:"🏦 ব্যাংক তথ্য",
    vm_secCredit:"💳 ক্রেডিট তথ্য",
    vm_secNotes:"📝 নোট",
    vm_vendorName:"ভেন্ডরের নাম *",
    vm_vendorCode:"ভেন্ডর কোড",
    vm_category:"ক্যাটাগরি",
    vm_status:"স্ট্যাটাস",
    vm_contactPerson:"যোগাযোগ ব্যক্তি",
    vm_mobile:"মোবাইল নং *",
    vm_phone:"ফোন নং",
    vm_whatsapp:"WhatsApp নং",
    vm_email:"ইমেইল",
    vm_address:"ঠিকানা",
    vm_area:"এলাকা",
    vm_city:"শহর",
    vm_country:"দেশ",
    vm_mapLink:"ম্যাপ লিংক (Google Maps)",
    vm_trnNumber:"TRN নম্বর (Tax Registration No.)",
    vm_tradeLicense:"ট্রেড লাইসেন্স নং",
    vm_tinNumber:"TIN নম্বর",
    vm_binNumber:"BIN নম্বর",
    vm_vatNumber:"VAT নম্বর",
    vm_bankName:"ব্যাংকের নাম",
    vm_bankBranch:"শাখা",
    vm_accountName:"অ্যাকাউন্টের নাম",
    vm_accountNumber:"অ্যাকাউন্ট নম্বর",
    vm_iban:"IBAN নম্বর",
    vm_swift:"SWIFT কোড",
    vm_creditLimit:"ক্রেডিট লিমিট (৳)",
    vm_openingBalance:"শুরুর ব্যালেন্স (৳)",
    vm_paymentTerms:"পেমেন্ট শর্ত (দিন)",
    vm_notes:"বিশেষ নোট",
    vm_emirate:"এমিরেট", vm_fax:"ফ্যাক্স",
    vm_import:"📥 ইমপোর্ট", vm_importBtn:"এক্সেল থেকে ইমপোর্ট",
    vm_totalVendors:"মোট ভেন্ডর",
    vm_activeVendors:"সক্রিয়",
    vm_totalCredit:"মোট ক্রেডিট লিমিট",
    vm_categories:["ম্যানুফ্যাকচারার","ডিস্ট্রিবিউটর","হোলসেলার","রিটেইলার","আমদানিকারক","সার্ভিস প্রোভাইডার","অন্যান্য"],
    pi_title:"🧾 ক্রয় ইনভয়েস",
    pi_new:"+ নতুন ইনভয়েস",
    pi_edit:"✏️ ইনভয়েস এডিট",
    pi_invoiceNo:"ইনভয়েস নং",
    pi_date:"তারিখ",
    pi_vendor:"সরবরাহকারী / ভেন্ডর",
    pi_vendorSelect:"ভেন্ডর বেছে নিন...",
    pi_vendorManual:"ভেন্ডরের নাম লিখুন",
    pi_items:"পণ্যের তালিকা",
    pi_addItem:"+ আইটেম যোগ করুন",
    pi_fromMaster:"📦 Product Master থেকে",
    pi_itemName:"পণ্যের নাম *",
    pi_code:"কোড",
    pi_brand:"ব্র্যান্ড",
    pi_qty:"পরিমাণ *",
    pi_unit:"ইউনিট",
    pi_unitCost:"একক মূল্য (৳) *",
    pi_discPerc:"ছাড় %",
    pi_taxPerc:"ট্যাক্স %",
    pi_lineTotal:"মোট",
    pi_subtotal:"সাব-টোটাল",
    pi_totalDiscount:"মোট ছাড়",
    pi_totalTax:"মোট ট্যাক্স",
    pi_grandTotal:"সর্বমোট",
    pi_paymentMethod:"পেমেন্ট পদ্ধতি",
    pi_amountPaid:"পরিশোধিত টাকা (৳)",
    pi_balanceDue:"বাকি টাকা",
    pi_note:"বিশেষ নোট (ঐচ্ছিক)",
    pi_notePh:"যেকোনো মন্তব্য বা নোট...",
    pi_saveDraft:"💾 ড্রাফট সেভ করুন",
    pi_confirm:"✅ ইনভয়েস নিশ্চিত করুন",
    pi_markPaid:"💵 পরিশোধিত চিহ্নিত করুন",
    pi_searchPh:"ইনভয়েস নং, ভেন্ডর বা পণ্য খুঁজুন...",
    pi_allStatus:"সব",
    pi_noInvoices:"এখনো কোনো ইনভয়েস নেই। নতুন তৈরি করুন।",
    pi_noResults:"কিছু পাওয়া যায়নি",
    pi_confirmDelete:"এই ইনভয়েসটি মুছে ফেলবেন?",
    pi_confirmCancel:"ইনভয়েসটি বাতিল করবেন?",
    pi_summary:"হিসাব সারসংক্ষেপ",
    pi_payment:"পেমেন্ট তথ্য",
    pi_loading:"লোড হচ্ছে...",
    pi_errName:"পণ্যের নাম দিন!",
    pi_errQty:"পরিমাণ দিন!",
    pi_errCost:"একক মূল্য দিন!",
    pi_errItems:"অন্তত একটি পণ্য যোগ করুন!",
    pi_saved:"✅ ড্রাফট সেভ হয়েছে!",
    pi_confirmed:"✅ ইনভয়েস নিশ্চিত হয়েছে!",
    pi_updated:"✅ ইনভয়েস আপডেট হয়েছে!",
    pi_deleted:"ইনভয়েস মুছে ফেলা হয়েছে।",
    pi_paidMarked:"✅ পরিশোধিত চিহ্নিত হয়েছে!",
    pi_cancelledMsg:"🚫 ইনভয়েস বাতিল হয়েছে।",
    pi_createdBy:"তৈরি করেছেন",
    pi_backToList:"← তালিকায় ফিরুন",
    pi_itemsCount:"টি পণ্য",
    // ── Vendor Payment Voucher (Cash / Cheque, partial payment against open invoices) ──
    pi_makePayment:"💳 পেমেন্ট করুন",
    pi_relatedPayments:"💳 এই ইনভয়েসে পেমেন্ট",
    pi_newPayment:"+ নতুন পেমেন্ট",
    pi_paymentVoucherTitle:"ভেন্ডর পেমেন্ট",
    pi_selectVendor:"ভেন্ডর সিলেক্ট করুন",
    pi_changeVendor:"ভেন্ডর পরিবর্তন করুন",
    pi_searchVendor:"ভেন্ডরের নাম খুঁজুন...",
    pi_vendorTotalDue:"মোট বাকি",
    pi_openInvoices:"বকেয়া ইনভয়েস",
    pi_noOpenInvoices:"এই ভেন্ডরের কোনো বকেয়া ইনভয়েস নেই",
    pi_payFull:"পুরো",
    pi_autoDistribute:"⚡ স্বয়ংক্রিয় বণ্টন",
    pi_autoDistributeAmt:"মোট পরিমাণ লিখে বণ্টন করুন",
    pi_autoDistributePh:"যেমন: 5000",
    pi_totalPayment:"সর্বমোট পেমেন্ট",
    pi_voucherSaved:"✅ পেমেন্ট ভাউচার সেভ হয়েছে!",
    pi_noVouchers:"এখনো কোনো পেমেন্ট ভাউচার নেই",
    pi_allocations:"কোন ইনভয়েসে কত গেলো",
    pi_vendorRequired:"ভেন্ডর সিলেক্ট করুন!",
    pi_amountRequired:"অন্তত একটি ইনভয়েসে পরিমাণ লিখুন!",
    pi_backToPayments:"← পেমেন্ট তালিকায় ফিরুন",
    pi_payToVendor:"যাকে পরিশোধ",
    pi_cancelVoucher:"ভাউচার বাতিল করুন",
    pi_confirmCancelVoucher:"এই পেমেন্ট ভাউচারটি বাতিল করবেন? এতে সংশ্লিষ্ট সব ইনভয়েসের বাকি টাকা আবার আগের মতো হয়ে যাবে।",
    pi_voucherCancelled:"🚫 পেমেন্ট ভাউচার বাতিল হয়েছে।",
    pi_searchVoucherPh:"ভেন্ডর বা ভাউচার নং খুঁজুন...",
    pi_paymentNo:"ভাউচার নং",
    pi_paymentDate:"পেমেন্টের তারিখ",
    pi_paymentNote:"নোট (ঐচ্ছিক)",
    pi_paymentNotePh:"যেকোনো মন্তব্য...",
    pi_fullAmount:"পুরো বাকি টাকা",
    pi_chequeNo:"চেক নম্বর *",
    pi_chequeBank:"ব্যাংকের নাম",
    pi_chequeDate:"চেকের তারিখ",
    pi_chequeStatus:"চেকের অবস্থা",
    pi_chequeStatusPending:"⏳ অপেক্ষমান",
    pi_chequeStatusCleared:"✅ ক্লিয়ার হয়েছে",
    pi_chequeStatusBounced:"❌ বাউন্স হয়েছে",
    pi_markCleared:"✅ ক্লিয়ার চিহ্নিত করুন",
    pi_markBounced:"❌ বাউন্স চিহ্নিত করুন",
    pi_confirmBounce:"চেকটি বাউন্স হয়েছে হিসেবে চিহ্নিত করবেন? এতে এই ভাউচারের সব ইনভয়েসের বাকি টাকা আবার আগের মতো হয়ে যাবে।",
    pi_chequeUpdated:"✅ চেকের অবস্থা আপডেট হয়েছে!",
    pi_chequeBounced:"❌ চেক বাউন্স হিসেবে চিহ্নিত হয়েছে। বাকি টাকা আপডেট হয়েছে।",
    pi_errPaymentAmount:"সঠিক পরিমাণ লিখুন!",
    pi_errPaymentExceeds:"পরিমাণ বাকি টাকার চেয়ে বেশি হতে পারবে না!",
    pi_errChequeNo:"চেক নম্বর লিখুন!",
    pi_printReceipt:"🖨️ প্রিন্ট",
    pi_alreadyFullyPaid:"✅ এই ইনভয়েসটি ইতিমধ্যে সম্পূর্ণ পরিশোধিত!",
    pi_pmSearch:"পণ্য খুঁজুন...",
    pi_totalInvoices:"মোট ইনভয়েস",
    pi_totalAmount:"মোট ক্রয়",
    pi_totalPaid:"মোট পরিশোধ",
    pi_totalDue:"মোট বাকি",
    pi_supplierInvoiceNo:"সরবরাহকারীর ইনভয়েস নং",
    pi_supplierInvoiceNoPh:"ভেন্ডরের ইনভয়েস/চালান নম্বর",
    pi_salePrice:"বিক্রয় মূল্য (৳)",
    pi_salePricePh:"Sale Price",
    pi_vat:"VAT %",
    pi_indexErr:"⚠️ Firestore Index তৈরি করুন। Firebase Console → Firestore → Indexes এ যান।",
    pi_fullPay:"সম্পূর্ণ পরিশোধ",
    pi_tabSalesman:"📦 ক্রয় তথ্য",
    pi_salesmanTitle:"📦 পণ্য ক্রয় তথ্য",
    pi_salesmanSub:"পণ্যের ক্রয় মূল্য, বিক্রয় মূল্য ও তারিখ দেখুন",
    pi_searchProduct:"পণ্যের নাম, কোড বা ব্র্যান্ড লিখুন...",
    pi_dateFilter:"তারিখ ফিল্টার",
    pi_last7:"শেষ ৭ দিন",
    pi_last30:"শেষ ৩০ দিন",
    pi_last90:"শেষ ৯০ দিন",
    pi_allTime:"সব সময়",
    pi_purchaseDate:"ক্রয়ের তারিখ",
    pi_purchasePrice:"ক্রয় মূল্য",
    pi_saleExVat:"বিক্রয় মূল্য (VAT বাদে)",
    pi_vatAmount:"VAT",
    pi_saleIncVat:"মোট বিক্রয় মূল্য (VAT সহ)",
    pi_noItemFound:"কোনো পণ্য পাওয়া যায়নি",
    pi_purchasedOn:"ক্রয় হয়েছে",
    pi_fromVendor:"সরবরাহকারী",
    pi_pcs:"পিস",
    pi_margin:"মার্জিন",
    pi_cancelBtn:"🚫 বাতিল করুন",
    pi_editBtn:"✏️ এডিট",
    pi_deleteBtn:"🗑️ মুছুন",
    pi_cancelForm:"✕ বাতিল",
    pi_pmSearchPh:"নাম / কোড / Barcode খুঁজুন...",
  },
  en: {
    appSub:"Parts Order Management",
    signIn:"Login", signUp:"Sign Up", logout:"Logout",
    welcomeBack:"Welcome Back!", welcomeBackSub:"Login to your account",
    chooseRole:"Who are you?", chooseRoleSub:"Select your role to create a new account",
    roleOwnerCard:"🏢 I am the Shop Owner", roleOwnerDesc:"Create a new shop and manage everything",
    roleSalesCard:"👨‍💼 I am a Staff / Salesman", roleSalesDesc:"Join with the invite code from owner",
    backBtn:"← Back",
    companyName:"Shop / Company Name *", personName:"Your Name *",
    countryLbl:"Country *", areaLbl:"Area / City *",
    mobileLbl:"Mobile Number *", emailLbl:"Email *", usernameLbl:"Username *",
    usernameOrEmailLbl:"Username or Email *",
    passwordLbl:"Password * (min 6 characters)", confirmPwLbl:"Confirm Password *",
    loginOfflineHint:"🆕 New shop (owner): Username admin + Password admin → change password on first login",
    loginStaffHint:"👨‍💼 Staff/Salesman: use Create Account and join with Invite Code",
    changePwTitle:"Set a new password",
    changePwSub:"Replace the default password for security",
    changePwBtn:"Save password",
    changePwSaved:"✅ Password updated",
    shopSetupTitle:"🏢 Shop Setup",
    shopSetupSub:"Enter your shop details first — saves offline and syncs when online",
    shopSetupBtn:"✅ Complete setup",
    addStaffTitle:"➕ Add New Staff",
    addStaffBtn:"Add staff member",
    staffAddedOk:"✅ Staff member added",
    removeMemberBtn:"🚫 Close account",
    confirmRemoveMember:"Close this staff account? They will not be able to login again.",
    memberRemovedOk:"✅ Staff account closed",
    resetPwLbl:"New password",
    resetPwBtn:"Reset password",
    resetPwOk:"✅ Password updated",
    currentPwLbl:"Current password",
    newPwLbl:"New password",
    changePwSettingsBtn:"Change password",
    ownPwChangedOk:"✅ Your password was updated",
    inviteCodeLbl:"Invite Code * (get from your owner)",
    forgotPw:"Forgot password?",
    noAccount:"Don't have an account?", haveAccount:"Already have an account?",
    createAccount:"Create Account", loginNow:"Login Now",
    creatingAccount:"Creating account...", loggingIn:"Logging in...",
    verifyTitle:"📧 Verify Your Email",
    verifyMsg:"We sent a verification link to your email. Please check and click the link.",
    verifyMsg2:"After verifying, click the button below.",
    verifyCheckBtn:"✅ I've Verified - Continue", resendVerify:"📤 Resend Email",
    notVerified:"Not verified yet. Please check your email.",
    resetTitle:"🔑 Password Reset", resetMsg:"A reset link will be sent to your email.",
    resetBtn:"📤 Send Reset Link", resetSent:"✅ Email sent! Please check your inbox.",
    tabDashboard:"🏠 Dashboard",
    dashGreeting:"Welcome", dashShopLabel:"Shop",
    dashTotalOrders:"Total Orders", dashPending:"Pending",
    dashDelivered:"Delivered", dashCancelled:"Cancelled",
    dashInProgress:"In Progress", dashOutForBranch:"Out for Branch",
    dashProducts:"Products", dashCompanies:"Companies",
    dashTeam:"Team Members", dashCustomers:"Customers", dashVendors:"Vendors",
    dashRecentOrders:"Recent Orders", dashViewAll:"View All →",
    dashQuickNav:"Quick Navigate", dashNoOrders:"No orders yet",
    dashMyOrders:"My Orders",
    tabSettings:"⚙️ Settings", settingsTitle:"⚙️ App Settings",
    profileTitle:"👤 Profile", shopInfoTitle:"🏢 Shop Info",
    inviteCodeTitle:"🔗 Staff Invite Code",
    inviteCodeDesc:"Share this code with your staff. They can use it during signup to join your shop.",
    copyCode:"📋 Copy", codeCopied:"✅ Copied!",
    languageLbl:"Language", syncStatus:"Sync Status",
    updateTitle:"🔄 App Update", updateSub:"Automatic updates",
    syncUploadBtn:"☁️ Upload Local → Cloud",
    syncDownloadBtn:"⬇️ Download Cloud → Local",
    syncPendingLbl:"Pending uploads",
    syncLocalRecordsLbl:"Local records",
    syncLastPullLbl:"Last cloud download",
    syncDownloadOk:"✅ Cloud download complete",
    syncUploadOk:"✅ Cloud upload complete",
    syncNeedInternet:"Internet connection required",
    syncNeedEmailLogin:"For cloud sync, log in online with your email and password",
    syncProductsLbl:"Products (this device)",
    syncShopLbl:"Shop ID",
    syncFirebaseLbl:"Cloud login",
    syncFirebaseOk:"✅ Connected",
    syncFirebaseNo:"❌ Email login needed",
    syncAutoPullOk:"☁️ Cloud data auto-downloaded",
    helpTitle:"❓ Help & Support",
    helpIntro:"Report software problems, bugs, or errors. Send new feature ideas if you need extra options.",
    helpWhatsappNote:"WhatsApp message or voice note only — please do not call",
    helpWhatsappBtn:"💬 WhatsApp Message",
    helpFacebookBtn:"📘 Facebook Page",
    helpEmailBtn:"✉️ Email",
    helpWebsiteBtn:"🌐 Website",
    helpMenuSub:"WhatsApp, Facebook, Email, Website",
    connected:"🟢 Connected (real-time)", connecting:"🟡 Connecting...", offline:"🔴 Offline", reconnecting:"🟡 Sync reconnecting...",
    teamTitle:"👥 Team Members", youLabel:"You", ownerLabel:"Owner", salesmanLabel:"Staff",
    confirmLogout:"Do you want to logout?",
    tabCheque:"🖨️ Cheque Print",
    tabShop:"🏪 Shop", tabOwner:"👤 Orders", tabCompany:"🏢 Companies",
    newOrder:"📋 New Purchase Order",
    itemName:"Item Name *", code:"Code / Model / Size", brand:"Brand Name",
    qty:"Quantity *", unitPcs:"Pcs", unitSet:"Set",
    addItem:"✚ Add to Invoice",
    invoiceList:"📄 Invoice List",
    invoiceEmpty:"No items added yet",
    noItemName:"Please enter item name!",
    noQty:"Please enter quantity!",
    noteP:"Special note (optional)...",
    sendOrder:"📤 Send Order", sentOrders:"📜 Sent Orders",
    noOrders:"No orders yet",
    selectCo:"Select Company", price:"Company price (AED)", save:"Save",
    confirmed:"✅ Confirmed", noStock:"❌ No Stock",
    deliver:"🚚 Mark Delivered", delOrder:"🗑️ Delete Order",
    coList:"🏢 Company List", addNew:"+ New Company",
    cancel:"Cancel", addCoTitle:"Add New Company",
    coName:"Company Name *", waNum:"WhatsApp Number (e.g. 8801712345678)",
    waHint:"💡 Include country code without 0.",
    addBtn:"✅ Add", editTitle:"Edit Company", saveEdit:"✅ Save",
    noPhone:"No number", noCo:"No companies yet",
    items:" items", newTag:"🔔 New", cur:"AED",
    status:{
      pending:            "⏳ Pending",
      order_confirmed:    "✅ Order Confirmed",
      ordered_supplier:   "📦 Ordered to Supplier",
      in_stock:           "✅ In Stock",
      out_of_stock:       "❌ Out of Stock",
      waiting_delivery:   "⏳ Waiting for Delivery",
      arrived_main_shop:  "🏪 Arrived at Main Shop",
      out_for_branch:     "🚚 Out for Delivery to Branch",
      delivered:          "✅ Delivered",
      cancelled:          "🚫 Cancelled",
    },
    n1:"✅ Order sent!", n2:"Price saved ✅", n3:"🚚 Delivery completed!",
    n4:"Company added ✅", n5:"Company updated ✅",
    n6:"Company deleted.", n7:"Order deleted.", n8:"🚫 Order cancelled.",
    n9:"✅ Account created!",
    n10:"✅ Email verified successfully!", n11:"📤 Verification email resent.",
    e1:"Add at least one item!", e2:"Name cannot be empty!", e3:"Please enter a name!",
    delConfirm:"Delete this order?",
    positionLbl:"Position", selectPosition:"Select Position",
    managePositionsTitle:"📋 Manage Positions", addPositionBtn:"+ Add Position",
    positionNameP:"Position name (e.g. Manager, Cashier)",
    noPositions:"No positions defined. Add one.",
    permissionsTitle:"🔐 Permissions",
    permSaved:"Permissions updated ✅",
    positionAdded:"Position added ✅", positionDeleted:"Position deleted.",
    defaultPosition:"Salesman (Default)",
    tabProducts:"📦 Products",
    pmTitle:"📦 Product Master",
    pmAdd:"+ New Product",
    pmName:"Product Name *", pmCode:"Code / Model", pmBrand:"Brand",
    pmCategory:"Category", pmPrice:"Price (AED)", pmUnit:"Unit",
    pmSearch:"Search products...",
    pmNoProducts:"No products yet. Add one.",
    pmAdded:"Product added ✅", pmUpdated:"Product updated ✅", pmDeleted:"Product deleted.",
    pmSelectHint:"Select a product or type manually",
    pmFromMaster:"📦 Select from Product Master",
    tabPurchase:"🧾 Purchase Invoice",
    tabSales:"🧾 Sales Invoice",
    tabQuotation:"📝 Quotation",
    tabDelivery:"🚚 Delivery Note",
    si_title:"🧾 Sales Invoice",
    si_new:"+ New Invoice",
    si_edit:"✏️ Edit",
    si_backToList:"← Back to List",
    si_invoiceNo:"Invoice No.",
    si_date:"Date",
    si_customer:"Customer",
    si_selectCustomer:"Select customer...",
    si_customerManual:"Type customer name",
    si_items:"Item List",
    si_addItem:"+ Add Item",
    si_fromMaster:"📦 From Product Master",
    si_itemName:"Item Name *",
    si_code:"Code",
    si_brand:"Brand",
    si_qty:"Qty *",
    si_unit:"Unit",
    si_unitPrice:"Unit Price (AED) *",
    si_discPerc:"Disc %",
    si_vatPerc:"VAT %",
    si_lineTotal:"Total",
    si_subtotal:"Subtotal",
    si_totalDiscount:"Total Discount",
    si_totalVat:"Total VAT",
    si_grandTotal:"Grand Total",
    si_paymentMethod:"Payment Method",
    si_amountPaid:"Amount Paid (AED)",
    si_balanceDue:"Balance Due",
    si_note:"Note",
    si_notePh:"Any remarks...",
    si_saveDraft:"💾 Save Draft",
    si_confirm:"✅ Confirm",
    si_markPaid:"💵 Mark Paid",
    si_print:"🖨️ Print / PDF",
    si_searchPh:"Search by invoice no or customer...",
    si_allStatus:"All",
    si_noInvoices:"No invoices yet.",
    si_noResults:"No results found",
    si_saved:"✅ Draft saved!",
    si_confirmed:"✅ Invoice confirmed!",
    si_updated:"✅ Updated!",
    si_deleted:"Invoice deleted.",
    si_paidMarked:"✅ Marked as paid!",
    si_cancelledMsg:"🚫 Invoice cancelled.",
    si_errName:"Enter item name!",
    si_errQty:"Enter quantity!",
    si_errPrice:"Enter unit price!",
    si_errItems:"Add at least one item!",
    si_confirmDelete:"Delete this invoice?",
    si_confirmCancel:"Cancel this invoice?",
    si_summary:"Invoice Summary",
    si_payment:"Payment",
    si_fullPay:"Full Payment",
    si_createdBy:"Created by",
    si_totalInvoices:"Total",
    si_totalSales:"Total Sales",
    si_totalPaid:"Paid",
    si_totalDue:"Due",
    si_cancelBtn:"🚫 Cancel",
    si_deleteBtn:"🗑️ Delete",
    si_cancelForm:"✕ Cancel",
    si_pmSearchPh:"Search products...",
    si_customerSearch:"Search customers...",
    si_myInvoices:"My Invoices",
    si_allInvoices:"All Invoices",
    si_invoiceTitle:"Sales Invoice",
    si_thankYou:"Thank you for your business!",
    si_authorizedBy:"Authorized Signature",
    si_receivedBy:"Customer Signature",
    si_invoiceType:"Invoice Type",
    si_regular:"Regular Invoice",
    si_regularDesc:"Customer details, no VAT/Tax",
    si_tax:"Tax Invoice",
    si_taxDesc:"Full VAT details with TRN",
    si_deliveryChallan:"DELIVERY CHALLAN",
    si_delivery:"Delivery Invoice",
    si_deliveryDesc:"Delivery challan, no tax",
    si_deliveryInvoiceLabel:"DELIVERY CHALLAN",
    si_deliveryNote:"Delivery Note No.",
    si_vehicleNo:"Vehicle Number",
    si_deliverySection:"🚚 Delivery Info",
    si_vatNo:"VAT Registration No.",
    si_trnNo:"TRN Number",
    si_vatExcl:"Amount Excl. VAT",
    si_vatAmt:"VAT Amount",
    si_vatIncl:"Total Incl. VAT",
    si_taxInvoiceLabel:"TAX INVOICE",
    si_regularInvoiceLabel:"SALES INVOICE",
    si_showCodeLabel:"Show Model / Code / Size in Invoice",
    si_showCodeDesc:"When enabled, product code and brand will appear under product name in invoice",
    si_colorLabel:"Color Invoice Print",
    si_colorDesc:"OFF = Black & White print, ON = Color invoice print",
    si_invoiceSettings:"📄 Invoice Settings",
    si_invoiceSettingsSub:"Invoice display preferences",
    tabVendor:"🏭 Vendor Master",
    tabCustomer:"👥 Customer Master",
    cm_title:"👥 Customer Master",
    cm_new:"+ New Customer",
    cm_edit:"✏️ Edit Customer",
    cm_backToList:"← Back to List",
    cm_save:"✅ Save",
    cm_cancel:"Cancel",
    cm_delete:"🗑️ Delete",
    cm_confirmDelete:"Delete this customer?",
    cm_editBtn:"✏️ Edit",
    cm_searchPh:"Search by name, code, mobile or TRN...",
    cm_allStatus:"All",
    cm_noCustomers:"No customers yet. Add your first customer.",
    cm_noResults:"No results found",
    cm_loading:"Loading...",
    cm_saved:"✅ Customer saved!",
    cm_updated:"✅ Customer updated!",
    cm_deleted:"Customer deleted.",
    cm_errName:"Enter customer name!",
    cm_errMobile:"Enter mobile number!",
    cm_secBasic:"📋 Basic Info",
    cm_secContact:"📱 Contact",
    cm_secAddress:"📍 Address",
    cm_secTax:"🧾 Tax & License",
    cm_secBank:"🏦 Bank Info",
    cm_secCredit:"💳 Credit Info",
    cm_secSales:"💰 Sales Info",
    cm_secNotes:"📝 Notes",
    cm_customerName:"Customer Name *",
    cm_customerCode:"Customer Code",
    cm_customerType:"Customer Type",
    cm_status:"Status",
    cm_contactPerson:"Contact Person",
    cm_mobile:"Mobile No. *",
    cm_phone:"Phone No.",
    cm_whatsapp:"WhatsApp No.",
    cm_email:"Email",
    cm_address:"Address",
    cm_area:"Area",
    cm_city:"City",
    cm_country:"Country",
    cm_mapLink:"Map Link",
    cm_trnNumber:"TRN Number",
    cm_tradeLicense:"Trade License No.",
    cm_tinNumber:"TIN Number",
    cm_binNumber:"BIN Number",
    cm_vatNumber:"VAT Number",
    cm_bankName:"Bank Name",
    cm_bankBranch:"Branch",
    cm_accountName:"Account Name",
    cm_accountNumber:"Account Number",
    cm_iban:"IBAN Number",
    cm_swift:"SWIFT Code",
    cm_creditLimit:"Credit Limit (AED)",
    cm_openingBalance:"Opening Balance (AED)",
    cm_paymentTerms:"Payment Terms (Days)",
    cm_discountPerc:"Default Discount (%)",
    cm_assignedSalesman:"Assigned Salesman",
    cm_notes:"Special Notes",
    cm_emirate:"Emirate", cm_fax:"Fax",
    cm_import:"📥 Import", cm_importBtn:"Import from Excel",
    cm_importFile:"Choose XLS/XLSX file", cm_importStart:"✅ Start Import",
    cm_importDone:"Imported successfully!", cm_importProgress:"Importing...",
    cm_importCount:"records found", cm_importSkip:"skipped (duplicate)",
    cm_totalCustomers:"Total Customers",
    cm_activeCustomers:"Active",
    cm_totalCreditLimit:"Total Credit Limit",
    cm_cashCustomer:"Cash",
    cm_creditCustomer:"Credit",
    cm_types:["Retail","Wholesale","Corporate","VIP","Government","Project","Other"],
    cm_paymentType:"Payment Type",
    cm_cash:"Cash Customer",
    cm_credit:"Credit Customer",
    vm_title:"🏭 Vendor Master",
    vm_new:"+ New Vendor",
    vm_edit:"✏️ Edit Vendor",
    vm_backToList:"← Back to List",
    vm_save:"✅ Save",
    vm_cancel:"Cancel",
    vm_delete:"🗑️ Delete",
    vm_confirmDelete:"Delete this vendor?",
    vm_createInvoice:"🧾 Create Purchase Invoice",
    vm_editBtn:"✏️ Edit",
    vm_searchPh:"Search by name, code or TRN...",
    vm_allStatus:"All",
    vm_active:"Active",
    vm_inactive:"Inactive",
    vm_blocked:"Blocked",
    vm_noVendors:"No vendors yet. Create your first vendor.",
    vm_noResults:"No results found",
    vm_loading:"Loading...",
    vm_saved:"✅ Vendor saved!",
    vm_updated:"✅ Vendor updated!",
    vm_deleted:"Vendor deleted.",
    vm_errName:"Enter vendor name!",
    vm_errMobile:"Enter mobile number!",
    vm_secBasic:"📋 Basic Info",
    vm_secContact:"📱 Contact",
    vm_secAddress:"📍 Address",
    vm_secTax:"🧾 Tax & License",
    vm_secBank:"🏦 Bank Info",
    vm_secCredit:"💳 Credit Info",
    vm_secNotes:"📝 Notes",
    vm_vendorName:"Vendor Name *",
    vm_vendorCode:"Vendor Code",
    vm_category:"Category",
    vm_status:"Status",
    vm_contactPerson:"Contact Person",
    vm_mobile:"Mobile No. *",
    vm_phone:"Phone No.",
    vm_whatsapp:"WhatsApp No.",
    vm_email:"Email",
    vm_address:"Address",
    vm_area:"Area",
    vm_city:"City",
    vm_country:"Country",
    vm_mapLink:"Map Link (Google Maps)",
    vm_trnNumber:"TRN Number (Tax Registration No.)",
    vm_tradeLicense:"Trade License No.",
    vm_tinNumber:"TIN Number",
    vm_binNumber:"BIN Number",
    vm_vatNumber:"VAT Number",
    vm_bankName:"Bank Name",
    vm_bankBranch:"Branch",
    vm_accountName:"Account Name",
    vm_accountNumber:"Account Number",
    vm_iban:"IBAN Number",
    vm_swift:"SWIFT Code",
    vm_creditLimit:"Credit Limit (AED)",
    vm_openingBalance:"Opening Balance (AED)",
    vm_paymentTerms:"Payment Terms (Days)",
    vm_notes:"Special Notes",
    vm_emirate:"Emirate", vm_fax:"Fax",
    vm_import:"📥 Import", vm_importBtn:"Import from Excel",
    vm_totalVendors:"Total Vendors",
    vm_activeVendors:"Active",
    vm_totalCredit:"Total Credit Limit",
    vm_categories:["Manufacturer","Distributor","Wholesaler","Retailer","Importer","Service Provider","Other"],
    pi_title:"🧾 Purchase Invoice",
    pi_new:"+ New Invoice",
    pi_edit:"✏️ Edit Invoice",
    pi_invoiceNo:"Invoice No.",
    pi_date:"Date",
    pi_vendor:"Vendor / Supplier",
    pi_vendorSelect:"Select vendor...",
    pi_vendorManual:"Type vendor name",
    pi_items:"Item List",
    pi_addItem:"+ Add Item",
    pi_fromMaster:"📦 From Product Master",
    pi_itemName:"Item Name *",
    pi_code:"Code",
    pi_brand:"Brand",
    pi_qty:"Qty *",
    pi_unit:"Unit",
    pi_unitCost:"Unit Cost (AED) *",
    pi_discPerc:"Disc %",
    pi_taxPerc:"Tax %",
    pi_lineTotal:"Total",
    pi_subtotal:"Subtotal",
    pi_totalDiscount:"Total Discount",
    pi_totalTax:"Total Tax",
    pi_grandTotal:"Grand Total",
    pi_paymentMethod:"Payment Method",
    pi_amountPaid:"Amount Paid (AED)",
    pi_balanceDue:"Balance Due",
    pi_note:"Special Note (Optional)",
    pi_notePh:"Any remarks or notes...",
    pi_saveDraft:"💾 Save as Draft",
    pi_confirm:"✅ Confirm Invoice",
    pi_markPaid:"💵 Mark as Paid",
    pi_searchPh:"Search by invoice no, vendor or item...",
    pi_allStatus:"All",
    pi_noInvoices:"No invoices yet. Create your first purchase invoice.",
    pi_noResults:"No results found",
    pi_confirmDelete:"Delete this invoice?",
    pi_confirmCancel:"Cancel this invoice?",
    pi_summary:"Invoice Summary",
    pi_payment:"Payment Info",
    pi_loading:"Loading...",
    pi_errName:"Enter item name!",
    pi_errQty:"Enter quantity!",
    pi_errCost:"Enter unit cost!",
    pi_errItems:"Add at least one item!",
    pi_saved:"✅ Draft saved!",
    pi_confirmed:"✅ Invoice confirmed!",
    pi_updated:"✅ Invoice updated!",
    pi_deleted:"Invoice deleted.",
    pi_paidMarked:"✅ Marked as paid!",
    pi_cancelledMsg:"🚫 Invoice cancelled.",
    pi_createdBy:"Created by",
    pi_backToList:"← Back to List",
    pi_itemsCount:" items",
    // ── Vendor Payment Voucher (Cash / Cheque, partial payment against open invoices) ──
    pi_makePayment:"💳 Make Payment",
    pi_relatedPayments:"💳 Payments For This Invoice",
    pi_newPayment:"+ New Payment",
    pi_paymentVoucherTitle:"Vendor Payment",
    pi_selectVendor:"Select Vendor",
    pi_changeVendor:"Change Vendor",
    pi_searchVendor:"Search vendor name...",
    pi_vendorTotalDue:"Total Due",
    pi_openInvoices:"Open Invoices",
    pi_noOpenInvoices:"This vendor has no open invoices",
    pi_payFull:"Full",
    pi_autoDistribute:"⚡ Auto-Distribute",
    pi_autoDistributeAmt:"Enter a total amount to auto-distribute",
    pi_autoDistributePh:"e.g. 5000",
    pi_totalPayment:"Total Payment",
    pi_voucherSaved:"✅ Payment voucher saved!",
    pi_noVouchers:"No payment vouchers yet",
    pi_allocations:"Allocated To Invoices",
    pi_vendorRequired:"Select a vendor!",
    pi_amountRequired:"Enter an amount for at least one invoice!",
    pi_backToPayments:"← Back to Payments",
    pi_payToVendor:"Paid To",
    pi_cancelVoucher:"Cancel Voucher",
    pi_confirmCancelVoucher:"Cancel this payment voucher? The balance due on all its invoices will be restored.",
    pi_voucherCancelled:"🚫 Payment voucher cancelled.",
    pi_searchVoucherPh:"Search vendor or voucher no...",
    pi_paymentNo:"Voucher No.",
    pi_paymentDate:"Payment Date",
    pi_paymentNote:"Note (Optional)",
    pi_paymentNotePh:"Any remarks...",
    pi_fullAmount:"Full Balance Due",
    pi_chequeNo:"Cheque No. *",
    pi_chequeBank:"Bank Name",
    pi_chequeDate:"Cheque Date",
    pi_chequeStatus:"Cheque Status",
    pi_chequeStatusPending:"⏳ Pending",
    pi_chequeStatusCleared:"✅ Cleared",
    pi_chequeStatusBounced:"❌ Bounced",
    pi_markCleared:"✅ Mark Cleared",
    pi_markBounced:"❌ Mark Bounced",
    pi_confirmBounce:"Mark this cheque as bounced? The balance due on all this voucher's invoices will be restored.",
    pi_chequeUpdated:"✅ Cheque status updated!",
    pi_chequeBounced:"❌ Cheque marked as bounced. Balance due updated.",
    pi_errPaymentAmount:"Enter a valid amount!",
    pi_errPaymentExceeds:"Amount cannot exceed the balance due!",
    pi_errChequeNo:"Enter cheque number!",
    pi_printReceipt:"🖨️ Print",
    pi_alreadyFullyPaid:"✅ This invoice is already fully paid!",
    pi_pmSearch:"Search products...",
    pi_totalInvoices:"Total Invoices",
    pi_totalAmount:"Total Purchase",
    pi_totalPaid:"Total Paid",
    pi_totalDue:"Total Due",
    pi_supplierInvoiceNo:"Supplier Invoice No.",
    pi_supplierInvoiceNoPh:"Vendor's invoice / challan number",
    pi_salePrice:"Sale Price (AED)",
    pi_salePricePh:"Sale Price",
    pi_vat:"VAT %",
    pi_indexErr:"⚠️ Firestore Index missing. Go to Firebase Console → Firestore → Indexes to create it.",
    pi_fullPay:"Full Payment",
    pi_tabSalesman:"📦 Purchase Info",
    pi_salesmanTitle:"📦 Product Purchase Info",
    pi_salesmanSub:"View purchase price, sale price and purchase dates",
    pi_searchProduct:"Search by product name, code or brand...",
    pi_dateFilter:"Date Filter",
    pi_last7:"Last 7 Days",
    pi_last30:"Last 30 Days",
    pi_last90:"Last 90 Days",
    pi_allTime:"All Time",
    pi_purchaseDate:"Purchase Date",
    pi_purchasePrice:"Purchase Price",
    pi_saleExVat:"Sale Price (ex-VAT)",
    pi_vatAmount:"VAT",
    pi_saleIncVat:"Total Sale Price (inc-VAT)",
    pi_noItemFound:"No products found",
    pi_purchasedOn:"Purchased on",
    pi_fromVendor:"Vendor",
    pi_pcs:"Pcs",
    pi_margin:"Margin",
    pi_cancelBtn:"🚫 Cancel Invoice",
    pi_editBtn:"✏️ Edit",
    pi_deleteBtn:"🗑️ Delete",
    pi_cancelForm:"✕ Cancel",
    pi_pmSearchPh:"Search name / model / barcode...",
  },
};

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
    if (newPw.length < 6) {
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
// Methods for the Vendor Payment Voucher system — cash & cheque only, as requested
const PI_VOUCHER_METHODS = {
  cash:   { bn:"নগদ", en:"Cash",   icon:"💵" },
  cheque: { bn:"চেক",  en:"Cheque", icon:"📃" },
  bank_transfer: { bn:"ব্যাংক ট্রান্সফার", en:"Bank Transfer", icon:"🏦" },
  card:   { bn:"কার্ড", en:"Card", icon:"💳" },
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
const piR2       = (n) => Math.round(((parseFloat(n)||0)+Number.EPSILON)*100)/100;
const piFmt2     = (n) => piR2(n).toFixed(2);
const piN2       = (v) => parseFloat(String(v??"").replace(/,/g,""))||0;
const localIsoDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().split("T")[0];
const piToday    = () => localIsoDate();

// ─── GLOBAL SEARCH NORMALIZER ─────────────────────────────────
// . - / \ space _ সরিয়ে lowercase করে — code search এর জন্য
const nsq = (str) => String(str||"").replace(/[\.\-\/\\\s_,]+/g,"").toLowerCase();
const nsmatch = (haystack, needle) => {
  if (!needle) return true;
  const n = nsq(needle);
  // exact normalized match
  if (nsq(haystack).includes(n)) return true;
  // also try word-by-word raw lowercase match
  return haystack.toLowerCase().includes(needle.toLowerCase());
};
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
  return { invoiceDate:piToday(), supplierInvoiceNo:"", vendorId:"", vendorName:"", vendorMobile:"", paymentMethod:"cash", amountPaid:"", note:"" };
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

// ─── AUTO-RESIZE TEXTAREA ────────────────────────────────────
function AutoTA({ style, ...props }) {
  const ref = useRef(null);
  const resize = () => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = ref.current.scrollHeight + "px";
  };
  useEffect(()=>{ resize(); },[props.value]);
  return <textarea ref={ref} style={{ resize:"none", overflow:"hidden", ...style }} onInput={resize} {...props} />;
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

// ─── PI: VOUCHER — PRINTABLE HTML ───────────────────────────────
function generatePaymentVoucherHTML(voucherIn, shopIn, lang, opts={}) {
  const usesLayout = !opts.noLayout && !!(opts.design || loadPrintDesign()).layout.voucher?.enabled;
  const rawVoucher = usesLayout ? voucherIn : siEscDeep(voucherIn);
  const shop = usesLayout ? shopIn : siEscDeep(shopIn);
  const isBn = lang==="bn";
  const isReceipt = !!rawVoucher.receiptNo;
  const voucher = isReceipt
    ? { ...rawVoucher, paymentNo:rawVoucher.receiptNo, paymentDate:rawVoucher.receiptDate, vendorName:rawVoucher.customerName }
    : rawVoucher;
  const isCheque = voucher.method==="cheque";
  const methodLabel = PI_VOUCHER_METHODS[voucher.method]?.[lang] || voucher.method;
  const cur = "AED";
  const docNo = a => (!isReceipt && a.supplierInvoiceNo) || a.invoiceNo || "";
  const rows = (voucher.allocations||[]).map(a=>`
    <tr><td><strong>${docNo(a)}</strong>${!isReceipt&&a.supplierInvoiceNo?`<div style="font-size:10px;color:#6b7280">${a.invoiceNo}</div>`:""}</td><td>${a.invoiceDate||"—"}</td><td style="text-align:right">${cur} ${piFmt2(a.amount)}</td></tr>
  `).join("");
  const design = opts.design || loadPrintDesign();
  const layout = design.layout.voucher;
  const vTitle = opts.title || (isReceipt?(isBn?"রিসিট ভাউচার":"RECEIPT VOUCHER"):(isBn?"পেমেন্ট ভাউচার":"PAYMENT VOUCHER"));
  if (!opts.noLayout && layout?.enabled) {
    const isRef = voucher.method==="bank_transfer"||voucher.method==="card";
    const fields = {
      shopName:shop?.companyName||"", shopAddress:[shop?.area,shop?.countryName].filter(Boolean).join(", "), shopPhone:shop?.mobile||"",
      shopNameAr:shop?.companyNameAr||"",
      title:vTitle, voucherNo:voucher.paymentNo||"", date:voucher.paymentDate||"", partyName:voucher.vendorName||"", method:methodLabel||"",
      amount:piFmt2(voucher.totalAmount), amountWords:amountInWords(voucher.totalAmount, cur),
      chequeNo:isCheque?(voucher.chequeNo||""):"", chequeBank:isCheque?(voucher.chequeBank||""):isRef?(voucher.refBank||""):"",
      chequeDate:isCheque?(voucher.chequeDate||""):"", refNo:isRef?(voucher.refNo||""):"", note:voucher.note||"", collectedBy:voucher.collectedByName||"",
    };
    const items = (voucher.allocations||[]).map(a=>({ invoiceNo:docNo(a), ourNo:a.invoiceNo||"", invoiceDate:a.invoiceDate||"", amount:piFmt2(a.amount) }));
    return renderLayoutDocument(layout, "voucher", { fields, items, logo:design.style.voucher?.logo }, { title:`${vTitle} - ${voucher.paymentNo}`, bn:isBn });
  }
  return applyDesign(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${opts.title||`${isReceipt?"Receipt":"Payment"} Voucher`} - ${voucher.paymentNo}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;700;900&family=Noto+Sans:wght@400;700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans Bengali','Noto Sans','Segoe UI',Arial,sans-serif;font-size:13px;color:#111;background:#fff;padding:20px}
.receipt{max-width:600px;margin:0 auto;border:2px solid #f97316;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.12)}
.hdr{background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;padding:18px 22px}
.shop-name{font-size:19px;font-weight:900}
.shop-sub{font-size:11px;opacity:0.85;margin-top:3px}
.title-row{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.3)}
.rc-title{font-size:18px;font-weight:900;letter-spacing:1px}
.rc-no{font-size:13px;font-weight:700;opacity:0.95}
.body{padding:20px 22px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.info-box{background:#f9fafb;border-radius:8px;padding:10px 13px;border:1px solid #e5e7eb}
.info-label{font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-weight:700;margin-bottom:3px}
.info-value{font-size:14px;font-weight:700;color:#111}
.amount-box{background:#f0fdf4;border:2px solid #22c55e;border-radius:10px;padding:16px;text-align:center;margin-bottom:16px}
.amount-label{font-size:11px;color:#15803d;font-weight:700;text-transform:uppercase}
.amount-val{font-size:32px;font-weight:900;color:#15803d;margin-top:4px}
.cheque-box{background:#eef2ff;border:1px solid #6366f1;border-radius:10px;padding:13px;margin-bottom:16px}
.cheque-row{display:flex;justify-content:space-between;padding:5px 0;font-size:12px}
.alloc-table{width:100%;border-collapse:collapse;margin-bottom:16px}
.alloc-table th{background:#f9fafb;text-align:left;font-size:10px;text-transform:uppercase;color:#6b7280;padding:8px 10px;border-bottom:2px solid #e5e7eb}
.alloc-table td{padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:12px}
.note-box{background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:9px 13px;margin-bottom:16px;font-size:12px;color:#92400e}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:30px;padding-top:14px;border-top:1px dashed #e5e7eb}
.sig-line{border-top:1.5px solid #9ca3af;margin-top:44px;padding-top:6px;font-size:11px;color:#6b7280;text-align:center}
.footer{text-align:center;padding:11px 22px;background:#f9fafb;border-top:2px solid #f97316;font-size:11px;color:#f97316;font-weight:700}
@media print{body{padding:0}.no-print{display:none!important}.receipt{border-radius:0;box-shadow:none}}
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:14px">
  <button onclick="window.print()" style="padding:10px 28px;background:#ea580c;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px">🖨️ ${isBn?"প্রিন্ট / PDF":"Print / PDF"}</button>
  <button onclick="window.close()" style="padding:10px 20px;background:#e5e7eb;color:#374151;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">${isBn?"বন্ধ করুন":"Close"}</button>
</div>
<div class="receipt">
  <div class="hdr">
    <div class="shop-name">🏢 ${shop?.companyName||"Shop"}</div>
    ${shopHeaderExtras(shop).arabic}
    <div class="shop-sub">${[shop?.area,shop?.countryName].filter(Boolean).join(", ")||""}</div>
    ${shop?.mobile?`<div class="shop-sub">📱 ${shop.mobile}</div>`:""}
    <div class="title-row"><span class="rc-title">${opts.title||(isReceipt?(isBn?"রিসিট ভাউচার":"Receipt Voucher"):(isBn?"পেমেন্ট ভাউচার":"Payment Voucher"))}</span><span class="rc-no">${voucher.paymentNo}</span></div>
  </div>
  <div class="body">
    <div class="info-grid">
      <div class="info-box"><div class="info-label">📅 ${isBn?"তারিখ":"Date"}</div><div class="info-value">${voucher.paymentDate}</div></div>
      <div class="info-box"><div class="info-label">💳 ${isBn?"পদ্ধতি":"Method"}</div><div class="info-value">${PI_VOUCHER_METHODS[voucher.method]?.icon||""} ${methodLabel}</div></div>
      <div class="info-box" style="grid-column:1/3"><div class="info-label">${isReceipt?(isBn?"👤 গ্রহণ করা হয়েছে":"👤 Received From"):(isBn?"🏭 প্রদান করা হয়েছে":"🏭 Paid To")}</div><div class="info-value">${voucher.vendorName||"—"}</div></div>
    </div>
    <div class="amount-box">
      <div class="amount-label">${isBn?"সর্বমোট পরিমাণ":(isReceipt?"Total Amount Received":"Total Amount Paid")}</div>
      <div class="amount-val">${cur} ${piFmt2(voucher.totalAmount)}</div>
    </div>
    ${isCheque?`<div class="cheque-box">
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">📃 ${isBn?"চেক নম্বর":"Cheque No."}</span><span style="font-weight:700">${voucher.chequeNo||"—"}</span></div>
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">🏦 ${isBn?"ব্যাংক":"Bank"}</span><span style="font-weight:700">${voucher.chequeBank||"—"}</span></div>
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">📅 ${isBn?"চেকের তারিখ":"Cheque Date"}</span><span style="font-weight:700">${voucher.chequeDate||"—"}</span></div>
      ${piN2(voucher.discountAmount)>0?`<div class="cheque-row"><span style="color:#b45309;font-weight:700">🏷️ ${isBn?"ছাড়":"Discount"}</span><span style="font-weight:700">${cur} ${piFmt2(voucher.discountAmount)}</span></div>
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">🖋️ ${isBn?"চেকের পরিমাণ":"Cheque Amount"}</span><span style="font-weight:900">${cur} ${piFmt2(voucher.chequeAmount)}</span></div>`:""}
      ${voucher.chequeReceivedBy?`<div class="cheque-row"><span style="color:#4f46e5;font-weight:700">🙋 ${isBn?"চেক গ্রহণকারী":"Cheque Received By"}</span><span style="font-weight:700">${voucher.chequeReceivedBy}</span></div>`:""}
    </div>`:""}
    ${voucher.vendorReceiptNo?`<div class="cheque-box"><div class="cheque-row"><span style="color:#4f46e5;font-weight:700">🧾 ${isBn?"ভেন্ডরের রিসিট নম্বর":"Vendor Receipt No."}</span><span style="font-weight:700">${voucher.vendorReceiptNo}</span></div></div>`:""}
    ${(voucher.method==="bank_transfer"||voucher.method==="card")&&(voucher.refNo||voucher.refBank)?`<div class="cheque-box">
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">🔖 ${voucher.method==="card"?(isBn?"অনুমোদন / রেফ নং":"Approval / Ref No."):(isBn?"রেফারেন্স নং":"Reference No.")}</span><span style="font-weight:700">${voucher.refNo||"—"}</span></div>
      <div class="cheque-row"><span style="color:#4f46e5;font-weight:700">${voucher.method==="card"?(isBn?"💳 কার্ডের ধরন":"💳 Card Type"):(isBn?"🏦 ব্যাংক":"🏦 Bank")}</span><span style="font-weight:700">${voucher.refBank||"—"}</span></div>
    </div>`:""}
    <table class="alloc-table">
      <thead><tr><th>${isReceipt?(isBn?"ইনভয়েস নং":"Invoice No."):(isBn?"ভেন্ডরের ইনভয়েস নং":"Vendor Invoice No.")}</th><th>${isBn?"তারিখ":"Date"}</th><th style="text-align:right">${isBn?"পরিমাণ":"Amount"}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${voucher.note?`<div class="note-box">📝 ${voucher.note}</div>`:""}
    <div class="sigs">
      <div><div class="sig-line">${isBn?"প্রদানকারীর স্বাক্ষর":"Paid By Signature"}</div></div>${isReceipt&&voucher.collectedByName?`<div style="grid-column:1/3;font-size:11px;color:#6b7280">${isBn?"সংগ্রহকারী":"Collected by"}: ${voucher.collectedByName}</div>`:""}
      <div><div class="sig-line">${isBn?"গ্রহণকারীর স্বাক্ষর":"Received By Signature"}</div></div>
    </div>
  </div>
  <div class="footer">${isBn?"ব্যবসার জন্য ধন্যবাদ! 🙏":"Thank you for your business! 🙏"}</div>
</div>
</body></html>`, "voucher", opts.style || design.style.voucher);
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

function printPaymentVoucher(voucher, shop, lang) {
  printWithSettings(generatePaymentVoucherHTML(voucher, shop, lang), { lang });
}

const SI_PAY_TO_VOUCHER_METHOD = { cash:"cash", bank:"bank_transfer", cheque:"cheque", card:"card" };
// Money taken with the bill itself (not through receipt vouchers or credit notes), printed as a receipt for the customer.
function printMoneyReceipt(inv, amount, shop, lang) {
  const receipt = {
    receiptNo:inv.invoiceNo, receiptDate:inv.invoiceDate, customerName:inv.customerName||"Walk-in",
    method:SI_PAY_TO_VOUCHER_METHOD[inv.paymentMethod]||"cash", totalAmount:amount,
    chequeNo:inv.chequeNo||"", chequeBank:inv.chequeBank||"", chequeDate:inv.chequeDate||"",
    collectedByName:inv.salesmanName||inv.createdByName||"",
    allocations:[{ invoiceNo:inv.invoiceNo, invoiceDate:inv.invoiceDate, amount }],
  };
  printWithSettings(generatePaymentVoucherHTML(receipt, shop, lang, { title:lang==="bn"?"মানি রিসিট":"MONEY RECEIPT" }), { lang });
}

const toVoucherView = (v, kind) => ({
  id:v.id, no:kind==="receipt" ? v.receiptNo : v.paymentNo, date:kind==="receipt" ? v.receiptDate : v.paymentDate,
  partyName:kind==="receipt" ? v.customerName : v.vendorName, method:v.method, totalAmount:v.totalAmount, status:v.status,
  chequeNo:v.chequeNo, chequeBank:v.chequeBank, chequeDate:v.chequeDate, chequeStatus:v.chequeStatus, note:v.note,
  refNo:v.refNo, refBank:v.refBank, refDate:v.refDate,
  chequeReceivedBy:v.chequeReceivedBy, vendorReceiptNo:v.vendorReceiptNo,
  collectedByName:v.collectedByName, allocations:v.allocations||[], raw:v,
});
// Party list for the voucher window: master records plus names that only appear on open bills.
function voucherParties(masters, openInvoices, idKey, nameKey, masterName, masterMobile) {
  const pending = new Map();
  openInvoices.forEach(inv => {
    const k = inv[idKey] ? `i:${inv[idKey]}` : `n:${String(inv[nameKey]||"").trim()}`;
    pending.set(k, (pending.get(k)||0) + (parseFloat(inv.balanceDue)||0));
  });
  const rows = (masters||[]).filter(m=>m&&!m.isDeleted&&!m.deleted).map(m => ({ key:`i:${m.id}`, id:m.id, name:masterName(m)||"", mobile:masterMobile(m)||"", pending:pending.get(`i:${m.id}`)||0 }));
  const seen = new Set(rows.map(r=>r.key));
  openInvoices.forEach(inv => {
    if (inv[idKey]) return;
    const name = String(inv[nameKey]||"").trim();
    const k = `n:${name}`;
    if (!name || seen.has(k)) return;
    seen.add(k);
    rows.push({ key:k, id:null, name, mobile:"", pending:pending.get(k)||0 });
  });
  return rows.sort((a,b)=>(b.pending>0)-(a.pending>0) || a.name.localeCompare(b.name));
}

// ─── PI: MAIN PURCHASE INVOICE TAB ────────────────────────────
// Takes the next shop-wide serial in one server transaction so two devices never hand out the
// same bill number. Returns null when offline or the server does not answer in time.
// Reserves `count` consecutive numbers and returns the first one.
async function reserveShopSerial(shopId, field, localMax, count = 1) {
  if (!shopId || !navigator.onLine) return null;
  const tx = runTransaction(db, async t => {
    const ref = doc(db, "shops", shopId);
    const snap = await t.get(ref);
    const next = Math.max(Number(snap.data()?.[field] || 0), Number(localMax) || 0) + 1;
    t.update(ref, { [field]: next + count - 1 });
    return next;
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("serial reservation timed out")), 6000));
  try {
    return await Promise.race([tx, timeout]);
  } catch (err) {
    console.warn(`[S4] ${field} reservation failed, using an offline number`, err);
    return null;
  }
}

// Offline staff numbers carry this device's tag (e.g. SI-0046-KQ) so phones offline at the same time can't clash.
function deviceSerialTag() {
  try {
    let tag = localStorage.getItem("s4_device_serial_tag");
    if (!/^[A-Z]{2}$/.test(tag || "")) {
      const A = "ABCDEFGHJKLMNPQRSTUVWXYZ";
      tag = A[Math.floor(Math.random()*A.length)] + A[Math.floor(Math.random()*A.length)];
      localStorage.setItem("s4_device_serial_tag", tag);
    }
    return tag;
  } catch { return "XX"; }
}

const PARTY_CODE = {
  vendors:   { prefix:"V", field:"vendorCode",   serial:"lastVendorCode" },
  customers: { prefix:"C", field:"customerCode", serial:"lastCustomerCode" },
};

function partyCodeNumber(kind, code) {
  const m = String(code || "").match(new RegExp(`^${PARTY_CODE[kind].prefix}-(\\d+)`, "i"));
  return m ? Number(m[1]) : 0;
}

function formatPartyCode(kind, n, tag = "") {
  return `${PARTY_CODE[kind].prefix}-${String(n).padStart(4, "0")}${tag ? `-${tag}` : ""}`;
}

// Next vendor/customer code (V-0001 / C-0001). Offline codes carry the device tag so they can't clash.
async function nextPartyCode(shopId, kind, records = []) {
  const { field, serial } = PARTY_CODE[kind];
  const localMax = records.reduce((m, r) => Math.max(m, partyCodeNumber(kind, r?.[field])), 0);
  const n = await reserveShopSerial(shopId, serial, localMax);
  return n ? formatPartyCode(kind, n) : formatPartyCode(kind, localMax + 1, deviceSerialTag());
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

// The open sales/purchase bill form registers here so tab switches and the phone back
// button ask before discarding it. leave(): ok to navigate away; back(): handled the back.
const billLeaveGuard = { current: null };

// Global keyboard shortcuts per menu tab, shown beside the name in the desktop sidebar.
const TAB_SHORTCUT_KEYS = { products:"F2", purchase:"F3", sales:"F4", vendors:"Ctrl+O", customers:"Ctrl+U" };

function pushOrdersNow() {
  const off = window.S4Offline;
  if (!off) return;
  Promise.resolve(off.syncCollectionNow?.("orders"))
    .catch(err => console.warn("[S4 Sync] order quick push failed", err))
    .finally(() => off.syncNow?.().catch(err => console.warn("[S4 Sync] order sync failed", err)));
}

function PurchaseInvoiceTab({ t, lang, th, s, shopId, user, profile, vendors, products, shop, toast, isDesktop, syncRefreshKey=0, wideDesktop=false, onOpenProductMaster, productFromMaster=null, onOpenChequePrinter, chequeHandoverRequest=null, onChequeHandoverHandled, openNewRequest=0, openNewVendor=null, onOpenNewHandled, voucherRequest=0, onVoucherHandled }) {
  const authSyncReady = useFirebaseAuthReady();
  const isOwner = profile?.role==="owner";
  const perms = { ...DEFAULT_PERMISSIONS, ...(profile?.permissions || {}) };
  const can = (key) => isOwner || perms[key] === true;

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
    setPiView("form");
    setVendorSearchQ("");
    setVendorDropOpen(false);
  };

  // ── Open edit form ──
  const piOpenEdit = (inv) => {
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — ভেন্ডর মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Vendor Master.", "err"); return; }
    if (isBranchTransferBill(inv)) { toast(lang==="bn" ? "এটা Branch Transfer রিসিভের বিল — Branch Transfer থেকে নিয়ন্ত্রণ হয়, এখানে বদলানো যাবে না।" : "This bill comes from a Branch Transfer receipt — manage it from Branch Transfer.", "err"); return; }
    piSnapRef.current = "pending";
    setPiInvoiceNo(inv.invoiceNo);
    setPiForm({ invoiceDate:inv.invoiceDate, supplierInvoiceNo:inv.supplierInvoiceNo||"", vendorId:inv.vendorId||"", vendorName:inv.vendorName||"", vendorMobile:inv.vendorMobile||"", paymentMethod:inv.paymentMethod||"cash", amountPaid:(inv.paymentMethod||"cash")!=="cash"&&inv.amountPaid>0?String(inv.amountPaid):"", note:inv.note||"" });
    setPiLines((inv.items||[]).map(it=>({ id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:it.productId||null, name:it.name||"", code:it.code||"", brand:it.brand||"", qty:String(it.qty||""), unit:it.unit||"Pcs", unitCost:String(it.unitCost||""), discountPerc:String(it.discountPerc??"0"), taxPerc:String(it.taxPerc??"5"), salePrice:String(it.salePrice||"") })));
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
  const piAddCurrentItem = () => {
    if (!piCurrent.name.trim()) { toast(lang==="bn"?"আইটেমের নাম লিখুন!":"Enter item name!","err"); return; }
    if (!piCurrent.qty || piN2(piCurrent.qty)<=0) { toast(lang==="bn"?"সঠিক পরিমাণ লিখুন!":"Enter valid quantity!","err"); return; }
    const editId = piEditLineId;
    setPiLines(prev=>editId && prev.some(x=>x.id===editId)
      ? prev.map(x=>x.id===editId ? { ...piCurrent, id:editId } : x)
      : [...prev, { ...piCurrent, id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}` }]);
    setPiEditLineId(null);
    setPiCurrent(piEmptyCurrent());
    setTimeout(()=>piNameRef.current?.focus(), 80);
  };

  // ── Load a confirmed item into the entry row for editing; it stays in the bill until Add updates it ──
  const piEditLine = (item) => {
    setPiCurrent({ productId:item.productId||null, name:item.name||"", code:item.code||"", brand:item.brand||"", qty:String(item.qty||""), unit:item.unit||"Pcs", unitCost:String(item.unitCost||""), discountPerc:String(item.discountPerc??"0"), taxPerc:String(item.taxPerc??"5"), salePrice:String(item.salePrice||"") });
    setPiEditLineId(item.id);
    setTimeout(()=>piNameRef.current?.focus(), 80);
  };

  const piChangeCurrentUnit=(unit)=>setPiCurrent(p=>{
    const prod = p.productId ? products.find(x=>x.id===p.productId) : null;
    return { ...p, unit, unitCost: rescaleForUnit(p.unitCost, prod, p.unit, unit), salePrice: rescaleForUnit(p.salePrice, prod, p.unit, unit) };
  });

  const piSelectProduct=(prod)=>{
    setPiCurrent(p=>({ ...p, productId:prod.id, name:prod.name, code:prod.code||prod.barcode||"", brand:prod.brand||"", unit:prod.unit||"Pcs", unitCost:prod.landingCost||prod.averageCost||p.unitCost, salePrice:prod.vatInclusive||prod.mrp||prod.vatExclusive||p.salePrice, taxPerc:prod.purchaseVat||prod.salesVat||p.taxPerc||"5" }));
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
  // Phone back / header back steps out one level at a time instead of leaving Purchase.
  useEffect(()=>{
    const inPayment = piSubTab==="payments" && pmtView!=="list";
    const inFolder = piMobile && piView==="list" && !!piOpenParty;
    if (piView==="list" && !inPayment && !inFolder) return undefined;
    const guard = {
      leave: () => piView!=="form" || piLeaveUnsavedOk(),
      back: () => {
        if (piView==="form") { if (piLeaveUnsavedOk()) setPiView("list"); }
        else if (piView==="detail") { setPiView("list"); setSelInvoice(null); }
        else if (inPayment) { setPmtView("list"); setSelVoucher(null); setPmtPrefillVendorId(null); }
        else setPiOpenParty(null);
        return true;
      },
    };
    billLeaveGuard.current = guard;
    return () => { if (billLeaveGuard.current===guard) billLeaveGuard.current = null; };
  });
  // A minimized bill must be confirmed away before the list opens another one.
  const piLeaveMinOk = () => {
    if (!(piWin.min && piView==="form")) return true;
    if (!piLeaveUnsavedOk()) return false;
    piWin.restore();
    return true;
  };
  useEscapeKey(() => {
    if (piView==="form") { if (piLeaveUnsavedOk()) setPiView("list"); }
    else if (piView==="detail") { setPiView("list"); setSelInvoice(null); }
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
    if (v){ piUpd("vendorId",vid); piUpd("vendorName",v.vendorName); piUpd("vendorMobile",v.mobileNumber||v.whatsappNumber||""); }
  };

  // ── Searchable vendor picker handler ──
  const piPickVendor=(v)=>{
    piUpd("vendorId",v.id);
    piUpd("vendorName",v.vendorName);
    piUpd("vendorMobile",v.mobileNumber||v.whatsappNumber||"");
    setVendorSearchQ(v.vendorName);
    setVendorDropOpen(false);
  };
  const piClearVendor=()=>{
    piUpd("vendorId",""); piUpd("vendorName",""); piUpd("vendorMobile","");
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
    const builtItems=valid.map(it=>{ const { disc, tax, total }=piCalcLine(it); return { productId:it.productId||null, name:it.name.trim(), code:it.code.trim(), brand:it.brand.trim(), qty:piN2(it.qty), unit:it.unit, unitFactor:unitFactorFor(it.productId ? products.find(p=>p.id===it.productId) : null, it.unit), unitCost:piN2(it.unitCost), discountPerc:piN2(it.discountPerc), discountAmt:parseFloat(piFmt2(disc)), taxPerc:piN2(it.taxPerc), taxAmt:parseFloat(piFmt2(tax)), lineTotal:parseFloat(piFmt2(total)), salePrice:piN2(it.salePrice)||null }; });
    const { sub, disc, tax, grand } = piCalcTotals(piLines);
    const typedPaid=piForm.paymentMethod==="cash" ? parseFloat(piFmt2(grand)) : piN2(piForm.amountPaid);
    if (typedPaid > grand + 0.01) { toast(lang==="bn"?"পরিশোধিত টাকা মোট বিলের চেয়ে বেশি হতে পারে না!":"Amount paid cannot exceed the grand total!","err"); return null; }
    const paid=Math.min(Math.max(typedPaid,0), grand), balanceDue=Math.max(0,grand-paid);
    const derivedStatus = status==="confirmed" ? (balanceDue<0.01?"paid":paid>0?"partial":"confirmed") : status;
    return { shopId, invoiceNo:invoiceNoOverride ?? piInvoiceNo, supplierInvoiceNo:piForm.supplierInvoiceNo.trim(), invoiceDate:piForm.invoiceDate, vendorId:piForm.vendorId||null, vendorName:piForm.vendorName.trim(), vendorMobile:piForm.vendorMobile.trim(), items:builtItems, subtotal:parseFloat(piFmt2(sub)), totalDiscount:parseFloat(piFmt2(disc)), totalTax:parseFloat(piFmt2(tax)), grandTotal:parseFloat(piFmt2(grand)), paymentMethod:piForm.paymentMethod, amountPaid:parseFloat(piFmt2(paid)), balanceDue:parseFloat(piFmt2(balanceDue)), status:derivedStatus, note:piForm.note.trim(), createdBy:priorInv?.createdBy||user.uid, createdByName:priorInv?.createdByName||profile.personName };
  };

  const savePurchaseInvoiceOffline = async (payload, successMessage) => {
    const nowIso = new Date().toISOString();
    const priorInvoice = editInvoiceId ? invoices.find(inv => inv.id === editInvoiceId) : null;
    let savedId;

    if (editInvoiceId) {
      const result = await offlineUpdate("purchaseInvoices", editInvoiceId, {
        ...payload,
        updatedAt: nowIso,
        updatedBy: user?.uid || "",
      });

      const updated = { ...result.data, id: editInvoiceId };
      savedId = editInvoiceId;
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
      });

      const created = { ...result.data, id: result.documentId };
      savedId = result.documentId;
      setInvoices(prev => [created, ...prev]);
      toast(successMessage);
    }

    await applyInvoiceStockEffect({
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
    if (STOCK_AFFECTING_INVOICE_STATUSES.includes(payload.status)) await piUpdateProductCosts(payload);

    if (navigator.onLine) {
      window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase invoice save sync failed", err));
    }

    setPiView("list");
  };

  // A confirmed purchase becomes the product's latest cost, and a sale price typed on the line updates the product's price.
  const piUpdateProductCosts = async (payload) => {
    if (!can("manageProducts")) return;
    const nowIso = new Date().toISOString();
    for (const it of payload.items || []) {
      if (!it.productId) continue;
      try {
        const rec = await offlineGetById("products", it.productId).catch(() => null);
        const prod = rec?.data || products.find(p => p.id === it.productId);
        if (!prod) continue;
        // A back-dated bill must not replace the cost/price of a newer purchase.
        const billDay = String(payload.invoiceDate || nowIso).slice(0, 10);
        if (prod.lastPurchaseDate && billDay < String(prod.lastPurchaseDate).slice(0, 10)) continue;
        const factor = Number(it.unitFactor) > 0 ? Number(it.unitFactor) : 1;
        const qty = Number(it.qty) || 0;
        const netCost = qty > 0 ? (Number(it.lineTotal) - Number(it.taxAmt || 0)) / qty / factor : Number(it.unitCost) / factor;
        const patch = {};
        if (netCost > 0 && Math.abs(netCost - (Number(prod.landingCost) || 0)) > 0.0001) {
          patch.landingCost = String(parseFloat(netCost.toFixed(4)));
          patch.lastPurchaseCost = patch.landingCost;
        }
        if (billDay > String(prod.lastPurchaseDate || "").slice(0, 10)) patch.lastPurchaseDate = billDay;
        const sale = Number(it.salePrice) || 0;
        if (sale > 0 && factor === 1) {
          const priceKey = prod.vatInclusive ? "vatInclusive" : prod.mrp ? "mrp" : prod.vatExclusive ? "vatExclusive" : "vatInclusive";
          if (Math.abs(sale - (Number(prod[priceKey]) || 0)) > 0.0001) patch[priceKey] = String(sale);
        }
        if (!Object.keys(patch).length) continue;
        await offlinePatch("products", it.productId, { ...patch, updatedAt: nowIso }, prod);
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
      if (status!=="draft" && !unlinkedStockOk(payload.items, lang)) return;
      if (!piVendorTermsOk(payload, status)) return;
      if (!piSupplierInvoiceDuplicateOk(payload)) return;
      if (!editInvoiceId) payload.invoiceNo = await reservePiInvoiceNo();
      await savePurchaseInvoiceOffline(payload, editInvoiceId ? t.pi_updated : successMsg);
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

      await applyInvoiceStockEffect({
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
    const hay=[inv.invoiceNo,inv.vendorName,inv.supplierInvoiceNo,inv.createdByName,...(inv.items||[]).map(it=>it.name+" "+it.code+" "+it.brand)].filter(Boolean).join(" ");
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
              invoices={piMoneyInvoices.map(inv=>({ id:inv.id, no:inv.invoiceNo, date:String(inv.invoiceDate||"").slice(0,10), partyId:inv.vendorId||null, partyName:inv.vendorName||"", partyMobile:inv.vendorMobile||"", total:inv.grandTotal, paid:inv.amountPaid, status:inv.status, ref:inv.supplierInvoiceNo||"", method:inv.paymentMethod, raw:inv }))}
              vouchers={(canVendorPayments ? payments.map(p=>({ id:p.id, no:p.paymentNo, date:String(p.paymentDate||"").slice(0,10), partyId:p.vendorId||null, partyName:p.vendorName||"", partyMobile:p.vendorMobile||"", method:p.method, amount:p.totalAmount, status:p.status, allocations:withSupRefs(p).allocations, raw:p })) : [])
                .concat(returnsAsLedgerVouchers(billReturns, "purchase"))}
              onOpenInvoice={(inv)=>{ setSelInvoice(inv); setPiSubTab(canManagePurchase?"invoices":"ledger"); setPiView("detail"); }}
              onOpenVoucher={canVendorPayments ? (v)=>{ if (v?.raw?.__return) return; setSelVoucher(v); setPmtView("detail"); setPiSubTab("payments"); } : undefined}
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
    const back = ()=>{ setPiView("list"); setSelInvoice(null); };
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

// ─── SALES INVOICE ────────────────────────────────────────────
const SI_PREFIX  = "SI-";
const QT_PREFIX  = "QT-";
const DN_PREFIX  = "DN-";
const QT_VALID_DAYS = 15;
const SI_UNITS   = ["Pcs","Set","Nos","Kg","Ltr","Box","Cm","Mtr","Dz"];

// Products saved before the checkbox was ever touched count as enabled.
function productRatesEnabled(p) {
  return p?.multiCustomerRatesChosen ? !!p.multiCustomerRatesEnabled : true;
}

const CUSTOMER_TYPE_ALIASES = {
  "রিটেইল":"retail", "হোলসেল":"wholesale", "কর্পোরেট":"corporate", "vip":"vip",
  "সরকারি":"government", "প্রজেক্ট":"project", "অন্যান্য":"other",
};
const normCustomerType = (v) => {
  const key = String(v || "").trim().toLowerCase();
  return CUSTOMER_TYPE_ALIASES[key] || key;
};
const normUnit = (v) => String(v || "").trim().toLowerCase();

function siProductRateRows(prod) {
  if (!prod || !productRatesEnabled(prod) || !Array.isArray(prod.unitPrices)) return [];
  return prod.unitPrices.filter((row) => row && row.unit);
}

// A picked product only offers units it can convert to its base unit; any other unit would be counted as 1 base unit.
function siUnitOptionsFor(prod, currentUnit) {
  if (!prod) return [...new Set([...SI_UNITS, currentUnit].filter(Boolean))];
  const rows = siProductRateRows(prod).filter((row) => Number(row.factor) > 0).map((row) => row.unit);
  return [...new Set([prod.unit || "Pcs", ...rows, currentUnit].filter(Boolean))];
}

// Exact unit + customer type wins, then the unit's "All / Default" row, then the product's base price.
function siResolveRate(prod, unit, customerType) {
  const basePrice = prod?.vatExclusive || prod?.mrp || "";
  const wantUnit = normUnit(unit || prod?.unit || "Pcs");
  const wantType = normCustomerType(customerType);
  const rows = siProductRateRows(prod).filter((row) => normUnit(row.unit) === wantUnit);
  const match =
    (wantType && rows.find((row) => normCustomerType(row.customerType) === wantType)) ||
    rows.find((row) => !String(row.customerType || "").trim());
  if (!match) return { unitPrice: basePrice, name: prod?.name || "" };
  return {
    unitPrice: match.vatExclusive || match.mrp || match.vatInclusive || basePrice,
    name: String(match.altName || "").trim() || prod?.name || "",
  };
}
const SI_PAY     = {
  cash:   { bn:"নগদ",            en:"Cash",          icon:"💵" },
  bank:   { bn:"ব্যাংক ট্রান্সফার", en:"Bank Transfer",  icon:"🏦" },
  cheque: { bn:"চেক",             en:"Cheque",         icon:"📃" },
  credit: { bn:"বাকি (ক্রেডিট)",  en:"Credit",         icon:"📅" },
};
const SI_STATUSES = {
  draft:     { bn:"ড্রাফট",        en:"Draft",     color:"#f59e0b", bg:"#451a03" },
  confirmed: { bn:"নিশ্চিত",       en:"Confirmed", color:"#06b6d4", bg:"#083344" },
  partial:   { bn:"আংশিক পরিশোধ", en:"Partial",   color:"#a855f7", bg:"#2e1065" },
  paid:      { bn:"পরিশোধিত",     en:"Paid",      color:"#22c55e", bg:"#052e16" },
  cancelled: { bn:"বাতিল",        en:"Cancelled", color:"#71717a", bg:"#27272a" },
};
const QT_STATUSES = {
  draft:     SI_STATUSES.draft,
  open:      { bn:"খোলা",          en:"Open",      color:"#06b6d4", bg:"#083344" },
  converted: { bn:"ইনভয়েস হয়েছে", en:"Converted", color:"#22c55e", bg:"#052e16" },
  cancelled: SI_STATUSES.cancelled,
};
const DN_STATUSES = {
  draft:     SI_STATUSES.draft,
  confirmed: { bn:"ডেলিভারি হয়েছে", en:"Delivered", color:"#06b6d4", bg:"#083344" },
  invoiced:  { bn:"ইনভয়েস হয়েছে",  en:"Invoiced",  color:"#22c55e", bg:"#052e16" },
  cancelled: SI_STATUSES.cancelled,
};
const siR2 = (n) => Math.round(((parseFloat(n)||0)+Number.EPSILON)*100)/100;
const siFmt2 = (n) => siR2(n).toFixed(2);
const siN2   = (v) => parseFloat(v)||0;
const siToday= () => localIsoDate();
const siAddDays = (iso, days) => {
  const d = new Date(`${iso || siToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
};
const qtIsExpired = (q) => q?.status==="open" && !!q.validUntil && q.validUntil < siToday();

// A line discount is either Dis% or a flat Dis Amt; a percentage wins when both are set.
function siCalcLine(it, isTax=true) {
  const qty=siN2(it.qty), price=siN2(it.unitPrice), dp=Math.min(Math.max(siN2(it.discountPerc),0),100);
  const vp = isTax ? siN2(it.vatPerc) : 0; // Regular invoice: no VAT
  const gross=qty*price;
  const disc = dp>0 ? gross*dp/100 : Math.min(Math.max(siN2(it.discountFlat),0), gross);
  const base=gross-disc, vat=base*vp/100;
  return { gross, disc, vat, total:base+vat };
}
// Bill discount reduces the taxable value, so VAT shrinks in the same ratio; adjustment and round off apply last.
function siCalcTotals(items, isTax=true, extra={}) {
  let sub=0,lineDisc=0,lineVat=0;
  items.forEach(it=>{ const c=siCalcLine(it,isTax); sub+=c.gross; lineDisc+=c.disc; lineVat+=c.vat; });
  const base = sub - lineDisc;
  const billPerc = Math.min(Math.max(siN2(extra.billDiscPerc),0),100);
  const billDisc = billPerc>0 ? base*billPerc/100 : Math.min(Math.max(siN2(extra.billDiscAmt),0), Math.max(base,0));
  const ratio = base>0 ? (base-billDisc)/base : 1;
  const vat = siR2(lineVat*ratio);
  const adjustment = siR2(extra.adjustment), roundOff = siR2(extra.roundOff);
  const net = siR2(siR2(base) - siR2(billDisc) + vat);
  const grand = siR2(net + adjustment + roundOff);
  return { sub, disc:lineDisc+billDisc, lineDisc, billDisc, vat, net, adjustment, roundOff, grand };
}
// A delivery note carries no discount or VAT.
const siDeliveryLines = (items) => items.map(it=>({ ...it, discountPerc:"0", discountFlat:"", vatPerc:"0" }));
const siInvoiceExtras = (inv) => ({
  billDiscPerc: inv?.billDiscPerc, billDiscAmt: inv?.billDiscAmt, adjustment: inv?.adjustment, roundOff: inv?.roundOff,
});
const SI_SHOW_CODE_KEY = "si-show-code";
const loadSiShowCode = () => { try { return localStorage.getItem(SI_SHOW_CODE_KEY)==="true"; } catch { return false; } };
const saveSiShowCode = (v) => { try { localStorage.setItem(SI_SHOW_CODE_KEY, v?"true":"false"); } catch {} };
const SI_COLOR_KEY = "si-color-print";
const loadSiColor = () => { try { return localStorage.getItem(SI_COLOR_KEY)==="true"; } catch { return false; } };
const saveSiColor = (v) => { try { localStorage.setItem(SI_COLOR_KEY, v?"true":"false"); } catch {} };

function siEmptyLine() {
  return { id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:null, name:"", code:"", brand:"", qty:"", unit:"Pcs", unitPrice:"", discountPerc:"0", discountFlat:"", vatPerc:"5" };
}
function siEmptyForm() {
  return {
    invoiceType:loadPrintSettings().defaultBillType==="regular" ? "regular" : "tax",
    invoiceDate:siToday(),
    customerId:"", customerName:"", customerMobile:"", customerAddress:"", customerTrn:"", customerType:"",
    paymentMethod:"cash", amountPaid:"",
    deliveryNoteNo:"", vehicleNo:"",
    note:"",
    refNo:"", salesmanId:"", salesmanName:"", currency:"AED", stockLocation:"main", stockLocationName:"Main",
    billDiscPerc:"", billDiscAmt:"", adjustment:"", roundOff:"", creditDays:"", hideCodeInPrint:false,
    validUntil:"",
  };
}

// ── Print / PDF Generator ──
const siEscHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const siEscDeep = (v) => typeof v === "string" ? siEscHtml(v)
  : Array.isArray(v) ? v.map(siEscDeep)
  : v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, siEscDeep(x)]))
  : v;

// The classic template interpolates text straight into HTML; layout designs escape on their own.
function generateSalesInvoiceHTML(invoice, shop, appLang, showCode, colorPrint, opts={}) {
  const design = opts.design || loadPrintDesign();
  const raw = !opts.noLayout && layoutAppliesTo(design.layout.invoice, invoice);
  return buildSalesInvoiceHTML(raw ? invoice : siEscDeep(invoice), raw ? shop : siEscDeep(shop), appLang, showCode, colorPrint, { ...opts, design });
}

function buildSalesInvoiceHTML(invoice, shop, appLang, showCode, colorPrint, opts={}) {
  const ps         = opts.settings || loadPrintSettings();
  const ds         = docSettingsFor(ps, invoice);
  const lang       = ds.language==="en"||ds.language==="bn" ? ds.language : appLang;
  const isBn       = lang==="bn";
  const invType    = invoice.invoiceType||"regular";
  const isTax      = invType==="tax";
  const isDelivery = invType==="delivery";
  const isQuote    = invoice.docKind==="quotation";

  // Delivery note keeps amount columns, but VAT/Tax is not applied.
  const effectiveTax = isTax && !isDelivery;
  const cur = invoice.currency || (isBn ? "৳" : "AED");
  const { sub, lineDisc, vat, grand, billDisc, adjustment, roundOff } = siCalcTotals(invoice.items||[], effectiveTax, siInvoiceExtras(invoice));
  const balance = grand - (invoice.amountPaid||0);
  const extraRowsHTML = [
    billDisc>0 ? `<div class="totals-row"><span class="tl">${isBn?"বিলের ছাড়":"Bill Discount"}${siN2(invoice.billDiscPerc)>0?` (${invoice.billDiscPerc}%)`:""}</span><span class="tv" style="color:#ef4444">- ${cur} ${siFmt2(billDisc)}</span></div>` : "",
    adjustment ? `<div class="totals-row"><span class="tl">${isBn?"সমন্বয়":"Adjustment"}</span><span class="tv">${adjustment>0?"+":"-"} ${cur} ${siFmt2(Math.abs(adjustment))}</span></div>` : "",
    roundOff ? `<div class="totals-row"><span class="tl">Round Off</span><span class="tv">${roundOff>0?"+":"-"} ${cur} ${siFmt2(Math.abs(roundOff))}</span></div>` : "",
  ].join("");
  const metaHTML = [
    invoice.refNo ? `Ref: ${invoice.refNo}` : "",
    invoice.quotationNo ? `${isBn?"কোটেশন":"Quotation"}: ${invoice.quotationNo}` : "",
    ps.printSalesman&&invoice.salesmanName ? `${isBn?"বিক্রেতা":"Salesman"}: ${invoice.salesmanName}` : "",
    ps.printCreditPeriod&&siN2(invoice.creditDays)>0 ? `${isBn?"বাকির মেয়াদ":"Credit"}: ${invoice.creditDays} ${isBn?"দিন":"days"}` : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const hideVatCols = isTax && !isDelivery && ds.hideVatDiscCols;
  const userNameHTML = ps.printUserName && invoice.createdByName ? invoice.createdByName : "";
  const timeText = ps.printTime && invoice.createdAt
    ? (()=>{ const d=new Date(invoice.createdAt); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB",{ hour:"2-digit", minute:"2-digit" }); })()
    : "";
  const vatSummaryHTML = (()=>{
    if (!ps.printVatSummary || !effectiveTax) return "";
    const byRate = new Map();
    const lineBase = sub - lineDisc;
    const ratio = lineBase>0 ? (lineBase-billDisc)/lineBase : 1;
    (invoice.items||[]).forEach(it=>{
      const { gross:gr, disc:d, vat:v } = siCalcLine(it, true);
      const rate = siN2(it.vatPerc);
      const g = byRate.get(rate) || { base:0, vat:0 };
      g.base += (gr - d)*ratio;
      g.vat  += v*ratio;
      byRate.set(rate, g);
    });
    if (!byRate.size) return "";
    const rowsV = [...byRate.entries()].sort((a,b)=>a[0]-b[0]).map(([r,g])=>`<tr><td style="text-align:center">${r}%</td><td style="text-align:right">${siFmt2(g.base)}</td><td style="text-align:right">${siFmt2(g.vat)}</td><td style="text-align:right">${siFmt2(g.base+g.vat)}</td></tr>`).join("");
    return `<div style="max-width:420px;margin:0 0 14px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#374151;margin-bottom:4px">${isBn?"VAT সারাংশ":"VAT Summary"}</div><table style="margin:0"><thead><tr><th style="text-align:center">VAT%</th><th style="text-align:right">${isBn?"করযোগ্য":"Taxable"}</th><th style="text-align:right">VAT</th><th style="text-align:right">${isBn?"মোট":"Total"}</th></tr></thead><tbody>${rowsV}</tbody></table></div>`;
  })();
  const custBalance = siN2(opts.customerBalance);
  const custBalanceHTML = ps.printCustomerBalance && !isQuote && !isDelivery && invoice.customerName && custBalance>0.01
    ? `<div class="bal-box" style="background:#fff7ed;border-color:#f59e0b"><span style="font-weight:700;color:#b45309">📒 ${isBn?"কাস্টমারের মোট বাকি (সব বিল)":"Customer's total balance (all bills)"}</span><span style="font-size:15px;font-weight:900;color:#b45309">${cur} ${siFmt2(custBalance)}</span></div>`
    : "";

  const title = isQuote
    ? (isBn?"কোটেশন":"QUOTATION")
    : isTax
    ? (isBn?"কর ইনভয়েস":"TAX INVOICE")
    : isDelivery
      ? (isBn?"ডেলিভারি চালান":"DELIVERY CHALLAN")
      : (isBn?"বিক্রয় ইনভয়েস":"SALES INVOICE");

  const design = opts.design || loadPrintDesign();
  const layout = design.layout.invoice;
  if (!opts.noLayout && layoutAppliesTo(layout, invoice)) {
    const items = (invoice.items||[]).map((it,i)=>{
      const { disc:d, vat:v, total:tot } = siCalcLine(it, effectiveTax);
      return {
        sl:String(i+1), code:it.code||"", name:it.name||"", qty:String(it.qty??""), unit:it.unit||"", rate:siFmt2(it.unitPrice),
        disc:siN2(it.discountPerc)>0?`${it.discountPerc}%`:d>0?siFmt2(d):"", excl:siFmt2(siN2(it.unitPrice)*siN2(it.qty)-d),
        vatPerc:effectiveTax?`${siN2(it.vatPerc)}%`:"", vatAmt:effectiveTax?siFmt2(v):"", total:siFmt2(tot),
      };
    });
    const noMoney = isQuote || isDelivery;
    const fields = {
      shopName:shop?.companyName||"", shopAddress:[shop?.area,shop?.countryName].filter(Boolean).join(", "), shopPhone:shop?.mobile||"",
      shopNameAr:shop?.companyNameAr||"", shopLicense:shop?.tradeLicenseNumber||"", shopEmail:shop?.email||"",
      shopTrn:isTax?(shop?.trnNumber||shop?.vatNumber||""):"", title, invoiceNo:invoice.invoiceNo||"", date:invoice.invoiceDate||"", time:timeText,
      customerName:invoice.customerName||"", customerMobile:invoice.customerMobile||"", customerAddress:invoice.customerAddress||"",
      customerTrn:isTax?(invoice.customerTrn||""):"", customerCode:invoice.customerCode||"", refNo:invoice.refNo||"", salesman:ps.printSalesman?(invoice.salesmanName||""):"",
      payment:noMoney?"":(SI_PAY[invoice.paymentMethod]?.[lang]||invoice.paymentMethod||""), userName:userNameHTML,
      deliveryNo:invoice.deliveryNoteNo||"", vehicleNo:invoice.vehicleNo||"", validUntil:isQuote?(invoice.validUntil||""):"",
      totalQty:String((invoice.items||[]).reduce((s,it)=>s+siN2(it.qty),0)), subtotal:siFmt2(sub),
      discount:lineDisc+billDisc>0?siFmt2(lineDisc+billDisc):"", vat:effectiveTax?siFmt2(vat):"", grandTotal:`${cur} ${siFmt2(grand)}`,
      paid:!noMoney&&invoice.amountPaid>0?siFmt2(invoice.amountPaid):"", balance:!noMoney&&balance>0.01?siFmt2(balance):"",
      customerBalance:custBalanceHTML?siFmt2(custBalance):"", amountWords:amountInWords(grand, cur), note:ps.printNarration?(invoice.note||""):"",
    };
    return renderLayoutDocument(layout, "invoice", { fields, items, logo:design.style.invoice?.logo }, { copies:ds.copies, title:`${title} - ${invoice.invoiceNo}`, bn:isBn });
  }

  // B&W vs Color — clearly distinct
  const headerColor  = colorPrint ? (isTax?"#1d4ed8": isDelivery?"#7c3aed":"#16a34a") : "#374151";
  const headerGrad   = colorPrint
    ? (isTax?"linear-gradient(135deg,#1d4ed8,#1e40af)":
       isDelivery?"linear-gradient(135deg,#7c3aed,#6d28d9)":
       "linear-gradient(135deg,#16a34a,#15803d)")
    : "#f8f9fa"; // B&W: light grey header
  const headerText   = colorPrint ? "#ffffff" : "#111111"; // B&W: black text
  const theadBg      = colorPrint ? "#1f2937" : "#e5e7eb";
  const theadText    = colorPrint ? "#ffffff" : "#111111";
  const accentBorder = colorPrint ? headerColor : "#6b7280";
  const grandBg      = colorPrint ? headerColor : "#374151";

  const rows = (invoice.items||[]).map((it,i)=>{
    const { disc:d, vat:v, total:tot } = siCalcLine(it, effectiveTax);
    const codeHtml = showCode&&!invoice.hideCodeInPrint&&(it.code||it.brand)
      ? `<br><span style="font-size:10px;color:#6b7280">${[it.code&&("📋 "+it.code),it.brand&&("🏷️ "+it.brand)].filter(Boolean).join("  ")}</span>` : "";
    if (isDelivery) {
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center;font-size:15px;font-weight:800;color:#7c3aed">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${siFmt2(it.unitPrice)}</td><td style="text-align:right"><strong>${cur} ${siFmt2(tot)}</strong></td></tr>`;
    } else if (hideVatCols) {
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${siFmt2(it.unitPrice)}</td><td style="text-align:right"><strong>${cur} ${siFmt2(tot)}</strong></td></tr>`;
    } else if (isTax) {
      const base = siN2(it.unitPrice)*siN2(it.qty) - d;
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${siFmt2(it.unitPrice)}</td><td style="text-align:center">${siN2(it.discountPerc)>0?it.discountPerc+"%":d>0?siFmt2(d):"—"}</td><td style="text-align:right">${cur} ${siFmt2(base)}</td><td style="text-align:center">${it.vatPerc||0}%</td><td style="text-align:right">${cur} ${siFmt2(v)}</td><td style="text-align:right"><strong>${cur} ${siFmt2(tot)}</strong></td></tr>`;
    } else {
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${siFmt2(it.unitPrice)}</td><td style="text-align:center">${siN2(it.discountPerc)>0?it.discountPerc+"%":d>0?siFmt2(d):"—"}</td><td style="text-align:right"><strong>${cur} ${siFmt2(tot)}</strong></td></tr>`;
    }
  }).join("");

  const tableHeaders = isDelivery || hideVatCols
    ? `<th style="width:36px">#</th><th>${isBn?"পণ্যের বিবরণ":"Item Description"}</th><th style="text-align:center;width:95px">${isBn?"পরিমাণ":"Qty"}</th><th style="text-align:right;width:110px">${isBn?"একক মূল্য":"Unit Price"}</th><th style="text-align:right;width:120px">${isBn?"মোট":"Amount"}</th>`
    : isTax
      ? `<th>#</th><th>${isBn?"পণ্য":"Description"}</th><th style="text-align:center">${isBn?"পরিমাণ":"Qty"}</th><th style="text-align:right">${isBn?"একক মূল্য":"Unit Price"}</th><th style="text-align:center">${isBn?"ছাড়":"Disc"}</th><th style="text-align:right">${isBn?"VAT বাদে":"Excl.VAT"}</th><th style="text-align:center">VAT%</th><th style="text-align:right">${isBn?"VAT":"VAT Amt"}</th><th style="text-align:right">${isBn?"মোট":"Total"}</th>`
      : `<th>#</th><th>${isBn?"পণ্য":"Description"}</th><th style="text-align:center">${isBn?"পরিমাণ":"Qty"}</th><th style="text-align:right">${isBn?"একক মূল্য":"Unit Price"}</th><th style="text-align:center">${isBn?"ছাড়":"Disc"}</th><th style="text-align:right">${isBn?"মোট":"Total"}</th>`;

  const totalsHTML = isDelivery
    ? `${extraRowsHTML}<div class="grand-row"><span class="gl">${isBn?"মোট Amount":"Total Amount"}</span><span class="gv">${cur} ${siFmt2(grand)}</span></div>`
    : isTax
      ? `<div class="totals-row"><span class="tl">${isBn?"সাব-টোটাল (VAT বাদে)":"Subtotal (Excl. VAT)"}</span><span class="tv">${cur} ${siFmt2(sub)}</span></div>${lineDisc>0?`<div class="totals-row"><span class="tl">${isBn?"ছাড়":"Discount"}</span><span class="tv" style="color:#ef4444">- ${cur} ${siFmt2(lineDisc)}</span></div>`:""}<div class="totals-row" style="background:#fef9c3"><span class="tl" style="color:#92400e;font-weight:700">VAT (${isBn?"মোট":"Total"})</span><span class="tv" style="color:#92400e">+ ${cur} ${siFmt2(vat)}</span></div>${extraRowsHTML}<div class="grand-row"><span class="gl">${isBn?"সর্বমোট (VAT সহ)":"Grand Total (Incl. VAT)"}</span><span class="gv">${cur} ${siFmt2(grand)}</span></div>`
    : `${lineDisc>0?`<div class="totals-row"><span class="tl">${isBn?"ছাড়":"Discount"}</span><span class="tv" style="color:#ef4444">- ${cur} ${siFmt2(lineDisc)}</span></div>`:""}${extraRowsHTML}<div class="grand-row"><span class="gl">${isBn?"সর্বমোট":"Grand Total"}</span><span class="gv">${cur} ${siFmt2(grand)}</span></div>`;

  const custHTML = `<div class="info-box"><div class="info-label">👤 ${isBn?"কাস্টমার":"Customer"}</div><div class="info-value">${invoice.customerName||"—"}</div>${invoice.customerCode?`<div class="info-sub">${isBn?"কোড":"Code"}: ${invoice.customerCode}</div>`:""}${invoice.customerMobile?`<div class="info-sub">📱 ${invoice.customerMobile}</div>`:""} ${invoice.customerAddress?`<div class="info-sub">📍 ${invoice.customerAddress}</div>`:""} ${isTax&&invoice.customerTrn?`<div class="info-sub" style="color:#b45309;font-weight:700;font-size:12px">TRN: ${invoice.customerTrn}</div>`:""}</div>`;

  const payInfoHTML = isQuote
    ? `<div class="info-box"><div class="info-label">📅 ${isBn?"মেয়াদ":"Valid Until"}</div><div class="info-value">${invoice.validUntil||"—"}</div><div class="info-sub">👤 ${invoice.createdByName||""}</div></div>`
    : isDelivery
    ? `<div class="info-box"><div class="info-label">📦 ${isBn?"ডেলিভারি তথ্য":"Delivery Info"}</div><div class="info-value">${invoice.deliveryNoteNo||(invoice.docKind==="delivery"?invoice.invoiceNo:"—")}</div>${invoice.vehicleNo?`<div class="info-sub">🚗 ${invoice.vehicleNo}</div>`:""}<div class="info-sub">👤 ${invoice.createdByName}</div></div>`
    : `<div class="info-box"><div class="info-label">💳 ${isBn?"পেমেন্ট":"Payment"}</div><div class="info-value">${SI_PAY[invoice.paymentMethod]?.icon||""} ${SI_PAY[invoice.paymentMethod]?.[lang]||invoice.paymentMethod}</div><div class="info-sub">${SI_STATUSES[invoice.status]?.[lang]||invoice.status}</div></div>`;

  const deliveryHTML = !isDelivery&&(invoice.deliveryNoteNo||invoice.vehicleNo)
    ? `<div style="display:flex;gap:16px;margin-bottom:14px">${invoice.deliveryNoteNo?`<div class="info-box" style="flex:1"><div class="info-label">🚚 ${isBn?"ডেলিভারি নোট নং":"Delivery Note No."}</div><div class="info-value">${invoice.deliveryNoteNo}</div></div>`:""} ${invoice.vehicleNo?`<div class="info-box" style="flex:1"><div class="info-label">🚗 ${isBn?"গাড়ির নম্বর":"Vehicle No."}</div><div class="info-value">${invoice.vehicleNo}</div></div>`:""}</div>` : "";

  const thermal = ds.paper==="80mm" || ds.paper==="58mm";
  const rawDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - ${invoice.invoiceNo}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;700;900&family=Noto+Sans:wght@400;700;900&display=swap" rel="stylesheet">
<style>
@page{size:${paperCss(ds.paper)};margin:${thermal?"3mm":"8mm"}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans Bengali','Noto Sans','Segoe UI',Arial,sans-serif;font-size:13px;color:#111;background:#fff;padding:20px}
.invoice{max-width:820px;margin:0 auto;border:2px solid ${accentBorder};border-radius:${colorPrint?"12px":"4px"};overflow:hidden;box-shadow:${colorPrint?"0 4px 20px rgba(0,0,0,0.12)":"none"}}
.hdr{background:${headerGrad};color:${headerText};padding:18px 22px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:${colorPrint?"none":"2px solid #dee2e6"}}
.shop-name{font-size:20px;font-weight:900}
.shop-sub{font-size:11px;opacity:${colorPrint?"0.85":"0.7"};margin-top:3px}
.inv-title{font-size:24px;font-weight:900;text-align:right;letter-spacing:2px}
.inv-no{font-size:12px;text-align:right;margin-top:3px;opacity:0.9}
.body{padding:18px 22px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.info-box{background:#f9fafb;border-radius:8px;padding:10px 13px;border:1px solid #e5e7eb}
.info-label{font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-weight:700;margin-bottom:3px}
.info-value{font-size:14px;font-weight:700;color:#111}
.info-sub{font-size:11px;color:#6b7280;margin-top:2px}
table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12px}
thead tr{background:${theadBg};color:${theadText}}
th{padding:9px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;font-weight:700}
td{padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top}
tbody tr:nth-child(even){background:#f9fafb}
.totals{display:flex;justify-content:flex-end;margin-bottom:14px}
.totals-box{width:300px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
.totals-row{display:flex;justify-content:space-between;padding:8px 13px;border-bottom:1px solid #f3f4f6}
.tl{color:#6b7280;font-size:12px}
.tv{font-weight:700;font-size:12px}
.grand-row{display:flex;justify-content:space-between;padding:11px 13px;background:${grandBg}}
.gl{color:#fff;font-size:13px;font-weight:800}
.gv{color:#fff;font-size:17px;font-weight:900}
.pay-box{background:#f0fdf4;border:1px solid #22c55e;border-radius:8px;padding:9px 13px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
.bal-box{background:#fef2f2;border:1px solid #ef4444;border-radius:8px;padding:9px 13px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
.note-box{background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:9px 13px;margin-bottom:14px;font-size:12px;color:#92400e}
${isDelivery?`.recv-box{background:${colorPrint?"#f3e8ff":"#f8f9fa"};border:2px solid ${colorPrint?"#7c3aed":"#6b7280"};border-radius:8px;padding:14px;margin-bottom:14px}.recv-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center}.recv-item{border-top:1.5px solid #9ca3af;margin-top:36px;padding-top:6px;font-size:11px;color:#6b7280}`:""}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px;padding-top:14px;border-top:1px dashed #e5e7eb}
.sig-line{border-top:1.5px solid #9ca3af;margin-top:44px;padding-top:6px;font-size:11px;color:#6b7280;text-align:center}
.footer{text-align:center;padding:11px 22px;background:${colorPrint?"#f9fafb":"#f0f0f0"};border-top:2px solid ${accentBorder};font-size:12px;color:${accentBorder};font-weight:700}
@media print{body{padding:0}.no-print{display:none!important}.invoice{border-radius:0;box-shadow:none}}
${thermal?`body{padding:4px;font-size:11px}.invoice{max-width:100%;border-width:1px}.hdr{flex-direction:column;gap:6px;padding:10px}.inv-title,.inv-no{text-align:left}.body{padding:8px}.info-grid{grid-template-columns:1fr;gap:6px}.totals-box{width:100%}table{font-size:10px}th,td{padding:4px 3px}.sigs{display:none}`:""}
${ds.preprinted?`.hdr .shop-block{visibility:hidden}.hdr{min-height:110px}`:""}
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:14px">
  <button onclick="window.print()" style="padding:10px 28px;background:${grandBg};color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px">🖨️ ${isBn?"প্রিন্ট / PDF":"Print / PDF"}</button>
  <button onclick="window.close()" style="padding:10px 20px;background:#e5e7eb;color:#374151;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">${isBn?"বন্ধ করুন":"Close"}</button>
</div>
<div class="invoice"><div class="hdr"><div class="shop-block"><div class="shop-name">🏢 ${shop?.companyName||"Shop"}</div>${shopHeaderExtras(shop).arabic}<div class="shop-sub">${[shop?.area,shop?.countryName].filter(Boolean).join(", ")||""}</div>${shop?.mobile?`<div class="shop-sub">📱 ${shop.mobile}</div>`:""}${shopHeaderExtras(shop).details} ${isTax&&shop?.trnNumber?`<div class="shop-sub" style="font-weight:800;margin-top:3px;color:${colorPrint?"inherit":"#b45309"}">TRN: ${shop.trnNumber}</div>`:""} ${isTax&&shop?.vatNumber?`<div class="shop-sub" style="font-weight:700">VAT: ${shop.vatNumber}</div>`:""}</div><div><div class="inv-title" style="color:${colorPrint?"#fff":accentBorder}">${title}</div><div class="inv-no" style="font-size:14px;font-weight:800;color:${colorPrint?"rgba(255,255,255,0.9)":"#333"}">${invoice.invoiceNo}</div><div class="inv-no" style="color:${colorPrint?"rgba(255,255,255,0.8)":"#555"}">📅 ${invoice.invoiceDate}${timeText?` &nbsp;🕒 ${timeText}`:""}</div>${userNameHTML?`<div class="inv-no" style="color:${colorPrint?"rgba(255,255,255,0.8)":"#555"}">👤 ${userNameHTML}</div>`:""}</div></div>
<div class="body"><div class="info-grid">${custHTML}${payInfoHTML}</div>${metaHTML?`<div style="margin:-4px 0 12px;font-size:12px;color:#374151">${metaHTML}</div>`:""}
${deliveryHTML}<table><thead><tr>${tableHeaders}</tr></thead><tbody>${rows}</tbody></table>
${totalsHTML?`<div class="totals"><div class="totals-box">${totalsHTML}</div></div>`:""}
${vatSummaryHTML}
${!isDelivery&&!isQuote&&invoice.amountPaid>0?`<div class="pay-box"><span style="font-weight:700;color:#15803d">✅ ${isBn?"পরিশোধিত":"Paid"}</span><span style="font-size:17px;font-weight:900;color:#15803d">${cur} ${siFmt2(invoice.amountPaid)}</span></div>`:""}
${!isDelivery&&!isQuote&&balance>0.01?`<div class="bal-box"><span style="font-weight:700;color:#dc2626">⚠️ ${isBn?"বাকি":"Balance Due"}</span><span style="font-size:17px;font-weight:900;color:#dc2626">${cur} ${siFmt2(balance)}</span></div>`:""}
${isDelivery?`<div class="recv-box"><div style="font-size:11px;color:#7c3aed;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px">✅ ${isBn?"মোট পণ্য":"Total Items"}: ${(invoice.items||[]).reduce((s,it)=>s+siN2(it.qty),0)} ${isBn?"পিস":"Pcs"} | ${isBn?"মোট লাইন":"Lines"}: ${(invoice.items||[]).length}</div><div class="recv-grid"><div class="recv-item">${isBn?"প্রেরকের স্বাক্ষর":"Sender Signature"}</div><div class="recv-item">${isBn?"ড্রাইভারের স্বাক্ষর":"Driver Signature"}</div><div class="recv-item">${isBn?"গ্রাহকের স্বাক্ষর":"Receiver Signature"}</div></div></div>`:""}
${custBalanceHTML}
${ps.printNarration&&invoice.note?`<div class="note-box">📝 ${invoice.note}</div>`:""}
${!isDelivery?`<div class="sigs"><div><div class="sig-line">${isBn?"অনুমোদনকারী স্বাক্ষর":"Authorized Signature"}</div></div><div><div class="sig-line">${isBn?"গ্রাহক স্বাক্ষর":"Customer Signature"}</div></div></div>`:""}
</div><div class="footer">${isQuote?(isBn?`এই কোটেশন ${invoice.validUntil||""} পর্যন্ত বৈধ। ধন্যবাদ! 🙏`:`This quotation is valid until ${invoice.validUntil||"—"}. Thank you! 🙏`):isDelivery?(isBn?"ডেলিভারি সম্পন্ন হলে এই চালানে স্বাক্ষর করুন 🚚":"Please sign this challan upon delivery 🚚"):(isBn?"ব্যবসার জন্য ধন্যবাদ! 🙏":"Thank you for your business! 🙏")}</div></div></body></html>`;
  const doc = applyDesign(rawDoc, "invoice", opts.style || design.style.invoice);
  const copies = Math.max(1, Math.min(10, parseInt(ds.copies, 10) || 1));
  if (copies === 1) return doc;
  const start = doc.indexOf('<div class="invoice">');
  const end = doc.lastIndexOf("</body>");
  const block = doc.slice(start, end);
  const repeated = Array.from({ length:copies }, (_, i) =>
    i ? block.replace('<div class="invoice">', '<div class="invoice" style="page-break-before:always;break-before:page;margin-top:20px">') : block).join("");
  return doc.slice(0, start) + repeated + doc.slice(end);
}

function printSalesInvoice(invoice, shop, lang, showCode, colorPrint, opts={}) {
  const settings = loadPrintSettings();
  const html = generateSalesInvoiceHTML(invoice, shop, lang, showCode||false, colorPrint||false, { ...opts, settings });
  printHtmlDocument(html, { preview:settings.showPreview, lang, printer:settings.billPrinter });
}

// ── SI Customer Picker ──
const CUSTOMER_PICKER_LIMIT = 200;
function SiCustomerPicker({ customers, onSelect, onClose, onQuickAdd, canQuickAdd=false, t, th, lang }) {
  const [q,setQ]=useState("");
  const [newName,setNewName]=useState("");
  const [adding,setAdding]=useState(false);
  const [active,setActive]=useState(0);
  const listRef=useRef(null);
  const [isPhone]=useState(()=>typeof window!=="undefined" && (window.innerWidth<768 || !!window.matchMedia?.("(pointer: coarse) and (max-width: 1100px)").matches));
  const matched=useMemo(()=>customers.filter(c=>{ if (!q) return true; return nsmatch([c.customerName,c.customerCode,c.mobileNumber].filter(Boolean).join(" "),q); }),[customers,q]);
  const filtered=matched.length>CUSTOMER_PICKER_LIMIT ? matched.slice(0,CUSTOMER_PICKER_LIMIT) : matched;
  useEffect(()=>{ setActive(0); },[q]);
  useEffect(()=>{ listRef.current?.querySelectorAll("[data-cust-row]")[active]?.scrollIntoView({ block:"nearest" }); },[active]);
  useEscapeKey(onClose, { level: 3 });
  const onSearchKey=(e)=>{
    if (e.key==="Escape") { e.preventDefault(); onClose(); }
    else if (e.key==="ArrowDown") { e.preventDefault(); setActive(i=>Math.min(filtered.length-1, i+1)); }
    else if (e.key==="ArrowUp") { e.preventDefault(); setActive(i=>Math.max(0, i-1)); }
    else if (e.key==="Enter" && filtered[active]) { e.preventDefault(); onSelect(filtered[active]); }
  };
  const inp={ padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:isPhone?16:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" };

  const handleQuickAdd = async () => {
    const name = newName.trim();
    if (!name || !onQuickAdd || adding) return;
    setAdding(true);
    try {
      await onQuickAdd(name);
      setNewName("");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div data-si-modal-open="customer-picker" onMouseDown={e=>{ if (e.target===e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, background:isPhone?th.bgCard:"rgba(15,23,42,0.45)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:isPhone?0:16 }}>
      <div role="dialog" aria-modal="true" style={isPhone
        ? { width:"100%", height:"100dvh", background:th.bgCard, display:"flex", flexDirection:"column", paddingTop:"env(safe-area-inset-top)", paddingBottom:"env(safe-area-inset-bottom)", boxSizing:"border-box" }
        : { width:"100%", maxWidth:560, background:th.bgCard, borderRadius:14, maxHeight:"80vh", display:"flex", flexDirection:"column", border:`1px solid ${th.border}`, boxShadow:"0 20px 50px rgba(0,0,0,0.3)", overflow:"hidden" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:isPhone?"10px 12px":"14px 16px", borderBottom:`1px solid ${th.border}` }}>
          <span style={{ fontSize:isPhone?16:14, fontWeight:700, color:th.txtPrimary }}>👥 {t.si_customer}</span>
          <button onClick={onClose} aria-label="Close" style={{ background:"none", border:"none", color:th.txtMuted, cursor:"pointer", fontSize:22, minWidth:44, minHeight:44 }}>✕</button>
        </div>
        <div style={{ padding:"10px 14px", borderBottom:`1px solid ${th.border}` }}>
          <input autoFocus={!isPhone} style={inp} placeholder={t.si_customerSearch} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={onSearchKey} enterKeyHint="search" />
          {!isPhone&&<div style={{ fontSize:10.5, color:th.txtFaint, marginTop:5 }}>↑ ↓ {lang==="bn"?"বাছাই":"move"} · Enter {lang==="bn"?"নির্বাচন":"select"} · Esc {lang==="bn"?"বন্ধ":"close"}</div>}
        </div>
        {canQuickAdd&&(
          <div style={{ display:"flex", gap:8, padding:"10px 14px", borderBottom:`1px solid ${th.border}` }}>
            <input
              style={{ ...inp, flex:1 }}
              placeholder={lang==="bn"?"নতুন কাস্টমারের নাম":"New customer name"}
              value={newName}
              onChange={e=>setNewName(e.target.value)}
              onKeyDown={e=>{ if (e.key==="Enter") handleQuickAdd(); }}
            />
            <button
              onClick={handleQuickAdd}
              disabled={adding || !newName.trim()}
              style={{ padding:"10px 14px", borderRadius:8, border:"none", background:adding?"#14532d":"#22c55e", color:"#fff", fontWeight:700, cursor:adding?"not-allowed":"pointer", whiteSpace:"nowrap" }}
            >
              {adding ? "..." : (lang==="bn"?"+ যোগ":"+ Add")}
            </button>
          </div>
        )}
        <div ref={listRef} style={{ overflowY:"auto", flex:1, WebkitOverflowScrolling:"touch" }}>
          {filtered.length===0&&<div style={{ textAlign:"center", padding:"30px", color:th.txtFaint }}>{t.si_noResults}</div>}
          {filtered.map((c,i)=>(
            <button key={c.id} data-cust-row onClick={()=>onSelect(c)} onMouseEnter={()=>!isPhone&&setActive(i)}
              style={{ width:"100%", textAlign:"left", padding:isPhone?"14px 16px":"10px 16px", minHeight:isPhone?56:0, background:i===active&&!isPhone?"rgba(37,99,235,0.12)":"transparent", border:"none", borderBottom:`1px solid ${th.border}`, cursor:"pointer", fontFamily:"inherit" }}>
              <div style={{ fontSize:isPhone?15:13, fontWeight:700, color:th.txtPrimary }}>{c.customerName}</div>
              <div style={{ fontSize:11, color:th.txtMuted, marginTop:2, display:"flex", gap:8 }}>
                {c.mobileNumber&&<span>📱 {c.mobileNumber}</span>}
                {c.customerCode&&<span>#{c.customerCode}</span>}
                {c.city&&<span>📍 {c.city}</span>}
              </div>
            </button>
          ))}
          {matched.length>filtered.length&&(
            <div style={{ textAlign:"center", padding:"12px", fontSize:12, color:th.txtFaint }}>
              {lang==="bn"?`প্রথম ${filtered.length}টি দেখানো হচ্ছে (মোট ${matched.length}) — নাম/মোবাইল লিখে খুঁজুন`:`Showing first ${filtered.length} of ${matched.length} — type a name or mobile to narrow`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SI Line Item Mobile ──
// ── SI Quick Add Picker (multi-add, stays open) ──
function SiQuickAddPicker({ products, onAddLine, onClose, t, th, lang }) {
  const [q, setQ]         = useState("");
  const [addedCount, setAddedCount] = useState(0);
  const [lastAdded, setLastAdded]   = useState(null);

  const filtered = products.filter(p=>{
    if (!q) return true;
    const hay = [p.name,p.code,p.brand,p.category,p.barcode,...(p.moreBarcodes||[])].filter(Boolean).join(" ");
    return nsmatch(hay, q);
  });

  const handleAdd = (prod) => {
    onAddLine(prod);
    setAddedCount(c=>c+1);
    setLastAdded(prod.name);
    // briefly show feedback then clear
    setTimeout(()=>setLastAdded(null), 1500);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:10000, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ width:"100%", maxWidth:620, background:th.bgCard, borderRadius:"16px 16px 0 0", maxHeight:"80vh", display:"flex", flexDirection:"column", border:`1px solid ${th.border}` }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:`1px solid ${th.border}` }}>
          <div>
            <span style={{ fontSize:14, fontWeight:700, color:th.txtPrimary }}>📦 {lang==="bn"?"পণ্য যোগ করুন":"Add Products"}</span>
            {addedCount>0&&<span style={{ marginLeft:8, padding:"2px 10px", borderRadius:20, background:"rgba(34,197,94,0.15)", color:"#22c55e", fontSize:12, fontWeight:700 }}>✅ {addedCount}{lang==="bn"?"টি যোগ হয়েছে":" added"}</span>}
          </div>
          <button onClick={onClose} style={{ background:"#22c55e", border:"none", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700, padding:"6px 14px", borderRadius:8 }}>
            {lang==="bn"?"সম্পন্ন ✓":"Done ✓"}
          </button>
        </div>

        {/* Last added feedback */}
        {lastAdded&&(
          <div style={{ padding:"8px 16px", background:"rgba(34,197,94,0.08)", borderBottom:`1px solid ${th.border}`, fontSize:12, color:"#22c55e", fontWeight:600 }}>
            ✅ {lastAdded} {lang==="bn"?"যোগ হয়েছে":"added to list"}
          </div>
        )}

        {/* Search */}
        <div style={{ padding:"10px 14px", borderBottom:`1px solid ${th.border}` }}>
          <input autoFocus style={{ padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" }}
            placeholder={lang==="bn"?"পণ্যের নাম, কোড বা ব্র্যান্ড...":"Search by name, code or brand..."}
            value={q} onChange={e=>setQ(e.target.value)} />
        </div>

        {/* Product list */}
        <div style={{ overflowY:"auto", flex:1 }}>
          {filtered.length===0&&<div style={{ textAlign:"center", padding:"30px", color:th.txtFaint, fontSize:13 }}>{lang==="bn"?"কিছু পাওয়া যায়নি":"No products found"}</div>}
          {filtered.map(p=>(
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 16px", borderBottom:`1px solid ${th.border}`, background:"transparent" }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</div>
                <div style={{ fontSize:11, color:th.txtMuted, marginTop:2, display:"flex", gap:8, flexWrap:"wrap" }}>
                  {p.code&&<span>📋 {p.code}</span>}
                  {p.brand&&<span>🏷️ {p.brand}</span>}
                  {p.vatExclusive&&<span style={{ color:"#22c55e", fontWeight:700 }}>{t.cur}{p.vatExclusive}</span>}
                </div>
              </div>
              {/* The ✚ Add button */}
              <button onClick={()=>handleAdd(p)} style={{ flexShrink:0, padding:"8px 16px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                ✚ {lang==="bn"?"যোগ":"Add"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SiLineItemMobile({ item, idx, onUpdate, onDelete, onPick, t, th, isTax, isDelivery }) {
  const effectiveTax = isTax && !isDelivery;
  const { disc, vat, total } = siCalcLine(item, effectiveTax);
  const inp=(e={})=>({ padding:"7px 9px", borderRadius:6, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:12, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...e });
  const lbl={ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:2 };
  return (
    <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:12, marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:12, fontWeight:800, color:isDelivery?"#a855f7":"#22c55e" }}>#{idx+1}</span>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={()=>onPick(idx)} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #6366f1", background:"rgba(99,102,241,0.08)", color:"#818cf8", cursor:"pointer", fontSize:11, fontWeight:700 }}>📦</button>
          <button onClick={()=>onDelete(item.id)} style={{ width:28, height:28, borderRadius:6, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:13 }}>✕</button>
        </div>
      </div>
      <input style={{ ...inp(), marginBottom:6, fontSize:13, fontWeight:600 }} placeholder={t.si_itemName} value={item.name} onChange={e=>onUpdate(item.id,"name",e.target.value)} />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:6 }}>
        <input style={inp()} placeholder={t.si_code} value={item.code} onChange={e=>onUpdate(item.id,"code",e.target.value)} />
        <input style={inp()} placeholder={t.si_brand} value={item.brand} onChange={e=>onUpdate(item.id,"brand",e.target.value)} />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:6 }}>
        <div><div style={lbl}>{t.si_qty}</div><input style={inp()} inputMode="decimal" placeholder="0" value={item.qty} onChange={e=>onUpdate(item.id,"qty",e.target.value)} /></div>
        <div><div style={lbl}>{t.si_unit}</div><select style={{ ...inp(), background:th.bgCard }} value={item.unit} onChange={e=>onUpdate(item.id,"unit",e.target.value)}>{SI_UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></div>
        <div><div style={lbl}>{t.si_unitPrice}</div><input style={inp()} inputMode="decimal" placeholder="0.00" value={item.unitPrice} onChange={e=>onUpdate(item.id,"unitPrice",e.target.value)} /></div>
      </div>
      {!isDelivery&&(
        <div style={{ display:"grid", gridTemplateColumns:isTax?"1fr 1fr":"1fr", gap:6 }}>
          <div><div style={lbl}>{t.si_discPerc}</div><input style={inp()} inputMode="decimal" placeholder="0" value={item.discountPerc} onChange={e=>onUpdate(item.id,"discountPerc",e.target.value)} /></div>
          {isTax&&<div><div style={lbl}>VAT %</div><input style={inp()} inputMode="decimal" placeholder="5" value={item.vatPerc} onChange={e=>onUpdate(item.id,"vatPerc",e.target.value)} /></div>}
        </div>
      )}
      <div style={{ marginTop:8, padding:"8px 10px", background:isDelivery?"rgba(168,85,247,0.08)":"rgba(34,197,94,0.08)", borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:11, color:th.txtMuted }}>{t.si_lineTotal}</span>
          <span style={{ fontSize:15, fontWeight:800, color:isDelivery?"#a855f7":"#22c55e" }}>{t.cur} {siFmt2(total)}</span>
        </div>
    </div>
  );
}

// ── SI Line Item Desktop ──
function SiLineItemDesktop({ item, idx, onUpdate, onDelete, onPick, t, th, isTax, isDelivery }) {
  const effectiveTax = isTax && !isDelivery;
  const { disc, vat, total } = siCalcLine(item, effectiveTax);
  const inp=(e={})=>({ padding:"7px 9px", borderRadius:6, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:12, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...e });
  return (
    <tr style={{ borderBottom:`1px solid ${th.border}` }}>
      <td style={{ padding:"8px 6px", fontSize:12, fontWeight:700, color:isDelivery?"#a855f7":"#22c55e", textAlign:"center", width:30 }}>{idx+1}</td>
      <td style={{ padding:"8px 6px" }}>
        <div style={{ display:"flex", gap:4, marginBottom:4 }}>
          <input style={{ ...inp(), flex:2 }} placeholder={t.si_itemName} value={item.name} onChange={e=>onUpdate(item.id,"name",e.target.value)} />
          <button onClick={()=>onPick(idx)} style={{ padding:"0 8px", borderRadius:6, border:"1px solid #6366f1", background:"rgba(99,102,241,0.08)", color:"#818cf8", cursor:"pointer", fontSize:13, flexShrink:0 }}>📦</button>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          <input style={{ ...inp(), flex:1 }} placeholder={t.si_code} value={item.code} onChange={e=>onUpdate(item.id,"code",e.target.value)} />
          <input style={{ ...inp(), flex:1 }} placeholder={t.si_brand} value={item.brand} onChange={e=>onUpdate(item.id,"brand",e.target.value)} />
        </div>
      </td>
      <td style={{ padding:"8px 6px", width:70 }}><input style={inp({ textAlign:"center" })} inputMode="decimal" placeholder="0" value={item.qty} onChange={e=>onUpdate(item.id,"qty",e.target.value)} /></td>
      <td style={{ padding:"8px 6px", width:80 }}><select style={{ ...inp(), background:th.bgCard }} value={item.unit} onChange={e=>onUpdate(item.id,"unit",e.target.value)}>{SI_UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></td>
      <td style={{ padding:"8px 6px", width:110 }}><input style={inp({ textAlign:"right" })} inputMode="decimal" placeholder="0.00" value={item.unitPrice} onChange={e=>onUpdate(item.id,"unitPrice",e.target.value)} /></td>
      {!isDelivery&&<td style={{ padding:"8px 6px", width:70 }}><input style={inp({ textAlign:"center" })} inputMode="decimal" placeholder="0" value={item.discountPerc} onChange={e=>onUpdate(item.id,"discountPerc",e.target.value)} /></td>}
      {isTax&&!isDelivery&&<td style={{ padding:"8px 6px", width:70 }}><input style={inp({ textAlign:"center" })} inputMode="decimal" placeholder="5" value={item.vatPerc} onChange={e=>onUpdate(item.id,"vatPerc",e.target.value)} /></td>}
      <td style={{ padding:"8px 6px", width:110, textAlign:"right" }}>
        <span style={{ fontSize:13, fontWeight:700, color:total>0?"#22c55e":th.txtFaint }}>{t.cur} {siFmt2(total)}</span>
        {effectiveTax&&siN2(item.discountPerc)>0&&<div style={{ fontSize:9, color:th.txtMuted, marginTop:2 }}>{siN2(item.discountPerc)>0&&<span style={{ color:"#ef4444" }}>-{siFmt2(disc)} </span>}{siN2(item.vatPerc)>0&&<span style={{ color:"#06b6d4" }}>+{siFmt2(vat)}</span>}</div>}
      </td>
      <td style={{ padding:"8px 6px", width:36, textAlign:"center" }}><button onClick={()=>onDelete(item.id)} style={{ width:28, height:28, borderRadius:6, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:13, fontWeight:700 }}>✕</button></td>
    </tr>
  );
}

// Product Master-style item table: full names wrap, numbers stay in aligned columns.
function SiItemsTable({ items, lang, isTax, showDisc=true, onEdit, onDelete, editId }) {
  const bn = lang==="bn";
  return (
    <div className="pm-table-wrap">
      <table className="pm-table">
        <colgroup><col style={{ width:26 }} /><col /><col style={{ width:64 }} /><col style={{ width:70 }} /><col style={{ width:80 }} /></colgroup>
        <thead><tr>
          <th className="si-center">#</th>
          <th>{bn?"পণ্য":"Item"}</th>
          <th className="si-num">{bn?"পরিমাণ":"Qty"}</th>
          <th className="si-num">{bn?"দাম":"Price"}</th>
          <th className="si-num">{bn?"মোট":"Total"}</th>
        </tr></thead>
        <tbody>
          {items.map((it,i)=>{
            const { disc, vat, total } = siCalcLine(it, isTax);
            const active = editId && editId===it.id;
            return (
              <tr key={it.id||i} className={active?"is-editing":""}>
                <td className="si-center si-strong" style={{ verticalAlign:"top" }}>{i+1}</td>
                <td className="si-wrap">
                  <div className="si-strong">{it.name}</div>
                  {(it.code||it.brand)&&<div className="si-muted">{[it.code,it.brand].filter(Boolean).join(" · ")}</div>}
                  {((showDisc&&disc>0)||(isTax&&siN2(it.vatPerc)>0))&&(
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {showDisc&&disc>0&&<span style={{ color:"#b91c1c" }}>{bn?"ছাড়":"Disc"} {siN2(it.discountPerc)>0?`${it.discountPerc}% `:""}(-{siFmt2(disc)})</span>}
                      {isTax&&siN2(it.vatPerc)>0&&<span style={{ color:"#0e7490" }}>VAT {it.vatPerc}% (+{siFmt2(vat)})</span>}
                    </div>
                  )}
                  {(onEdit||onDelete)&&(
                    <div className="si-line-tools">
                      {onEdit&&<button type="button" className="pm-btn-secondary" onClick={()=>onEdit(it)}>✏️ {bn?"এডিট":"Edit"}</button>}
                      {onDelete&&<button type="button" className="pm-btn-secondary" style={{ color:"#b91c1c" }} onClick={()=>onDelete(it)}>✕ {bn?"মুছুন":"Delete"}</button>}
                    </div>
                  )}
                </td>
                <td className="si-num si-wrap" style={{ verticalAlign:"top" }}>{it.qty} <span className="si-muted">{it.unit}</span></td>
                <td className="si-num" style={{ verticalAlign:"top" }}>{siFmt2(it.unitPrice)}</td>
                <td className="si-num si-strong" style={{ verticalAlign:"top" }}>{siFmt2(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Delivery notes used to be saved inside salesInvoices; move them keeping the same id so their stock-ledger entries still match.
const dnMigratedIds = new Set();
async function migrateLegacyDeliveryNotes(rows) {
  const legacy = (rows || []).filter(r => r?.id && r.invoiceType==="delivery" && r.docKind!=="delivery" && !dnMigratedIds.has(r.id));
  const moved = [];
  for (const inv of legacy) {
    dnMigratedIds.add(inv.id);
    try {
      const createdAt = inv.createdAt instanceof Date ? inv.createdAt.toISOString() : inv.createdAt;
      await offlineCreate("deliveryNotes", { ...inv, docKind:"delivery", createdAt });
      await offlineRemove("salesInvoices", inv.id);
      moved.push(inv.id);
    } catch (err) {
      dnMigratedIds.delete(inv.id);
      console.warn("[S4 DN] legacy delivery note move failed", inv.id, err);
    }
  }
  if (moved.length && navigator.onLine) {
    window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] delivery note move sync failed", err));
  }
  return moved;
}

// ── SALES INVOICE TAB (main) ──
function SalesInvoiceTab({ t, lang, th, s, shopId, user, profile, customers, products, shop, toast, isDesktop, siShowCode, siColorPrint, canManageCustomers=false, onCustomerCreated, syncRefreshKey=0, team=[], onOpenProductMaster, productFromMaster=null, wideDesktop=false, kind="sales", quoteToConvert=null, onConvertQuote, onQuoteConvertHandled, openNewRequest=0, openNewCustomer=null, onOpenNewHandled, voucherRequest=0, onVoucherHandled }) {
  const authSyncReady = useFirebaseAuthReady();
  const isOwner = profile?.role==="owner";
  const siPerm = (key) => isOwner || { ...DEFAULT_PERMISSIONS, ...(profile?.permissions||{}) }[key] === true;
  const canDiscount = siPerm("giveDiscount");
  const canCancelInv = siPerm("cancelInvoices");
  const canCustBalance = siPerm("viewCustomerBalance");
  const canSeeCost = siPerm("manageProducts") || siPerm("managePurchase");
  const isQuote = kind==="quotation";
  const isDN = kind==="delivery";
  const COL = isQuote ? "quotations" : isDN ? "deliveryNotes" : "salesInvoices";
  const DOC_PREFIX = isQuote ? QT_PREFIX : isDN ? DN_PREFIX : SI_PREFIX;
  const STATUSES = isQuote ? QT_STATUSES : isDN ? DN_STATUSES : SI_STATUSES;
  const serialRe = isQuote ? /QT-?(\d+)(?:-[A-Z]{2})?$/i : isDN ? /DN-?(\d+)(?:-[A-Z]{2})?$/i : /SI-?(\d+)(?:-[A-Z]{2})?$/i;
  const serialField = isQuote ? "lastQTSerial" : isDN ? "lastDNSerial" : "lastSISerial";
  // The quotation or delivery note this new sales invoice is being made from.
  const [sourceQuote,setSourceQuote] = useState(null);
  const [dnMigrateTick,setDnMigrateTick] = useState(0);

  const [invoices,setInvoices]     = useState([]);
  const [siLoading,setSiLoading]   = useState(true);
  const [siView,setSiView]         = useState("list");
  const [siGroupMode,setSiGroupMode] = useState("folders");
  const [siOpenParty,setSiOpenParty] = useState(null);
  const siWin = useWindowState({ maximized:true });
  useEffect(() => { if (siView!=="form") siWin.restore(); }, [siView]); // eslint-disable-line react-hooks/exhaustive-deps
  const siMobile = usePmMobile();
  const siRootRef = useRef(null);
  const [siFitH,setSiFitH] = useState(null);
  // On PC the screen fills exactly the space below the window title, so the page itself never scrolls.
  useEffect(() => {
    if (siMobile) { setSiFitH(null); return undefined; }
    const fit = () => {
      const el = siRootRef.current; if (!el) return;
      const top = el.getBoundingClientRect().top + (el.parentElement?.scrollTop || 0);
      setSiFitH(Math.max(420, Math.floor(window.innerHeight - top)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [siMobile, siView]);
  useEscapeKey(() => {
    if (siView==="form") { if (siLeaveUnsavedOk()) setSiView("list"); }
    else { setSiView("list"); setSelInv(null); }
  }, { enabled: siView!=="list" && !siWin.min, level: siView==="form" ? 2 : 1 });
  const [selInv,setSelInv]         = useState(null);
  const [editInvId,setEditInvId]   = useState(null);
  const [siPrintModal,setSiPrintModal] = useState(null); // invoice to print after confirm
  const [siInvoiceNo,setSiInvoiceNo]= useState("");
  const [siForm,setSiForm]         = useState(siEmptyForm());
  const [siLines,setSiLines]       = useState([]);
  const [showCustPicker,setShowCustPicker]= useState(false);
  const siSnapRef = useRef(null);
  const siEmptyCurrent = () => ({ productId:null, name:"", code:"", brand:"", qty:"1", unit:"Pcs", unitPrice:"", discountPerc:"0", discountFlat:"", vatPerc:"5" });
  const [siCurrent,setSiCurrent]   = useState(siEmptyCurrent);
  const [siEditLineId,setSiEditLineId] = useState(null);
  const siNameRef = useRef(null);
  const siQtyRef = useRef(null);

  const [siSaving,setSiSaving]     = useState(false);
  const siSaveLockRef = useRef(false);
  const [siSearch,setSiSearch]     = useState("");
  const [siStatusF,setSiStatusF]   = useState("ALL");
  const [siViewAll,setSiViewAll]   = useState(isOwner);

  // Customer receipt vouchers (Receipts against Bill) — only the sales kind collects money.
  const [receipts,setReceipts]         = useState([]);
  const [billReturns,setBillReturns]   = useState([]);
  useEffect(() => {
    if (!shopId || kind!=="sales") return undefined;
    const unsub = subscribeShopCollection({ collectionName:"salesReturns", shopId, onRows:(list)=>setBillReturns(list||[]) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId, kind]);
  const siLoadedPaidRef = useRef(0);
  const [rcptSaving,setRcptSaving]     = useState(false);
  const [receiptWin,setReceiptWin]     = useState(null); // null | {} | { partyId, partyName, invoiceId } | { viewId }
  const [ledgerWin,setLedgerWin]       = useState(false);

  useEffect(()=>{
    if (!shopId || kind!=="sales") return;
    let unsub1=()=>{};
    let unsub2=null;
    let cancelled=false;
    const normalize = (d) => ({ ...d.data(), id:d.id, createdAt:d.data().createdAt?.toDate?.()?.toISOString?.() || d.data().createdAt || new Date().toISOString() });
    const sortRows = (rows=[]) => [...rows].sort((a,b)=>new Date(b.createdAt||b.receiptDate||0)-new Date(a.createdAt||a.receiptDate||0));
    const applyRows = (rows) => {
      if (cancelled) return;
      setReceipts(sortRows(rows));
      offlineCacheCloudRecords("salesReceipts", rows).catch(err => console.warn("[S4 Offline] salesReceipts cache failed", err));
    };
    offlineList("salesReceipts").then(res => {
      if (cancelled) return;
      const rows = (Array.isArray(res) ? res : (res.records || [])).map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) })).filter(r => r.shopId===shopId);
      if (rows.length) setReceipts(sortRows(rows));
    }).catch(err => console.warn("[S4 Offline] salesReceipts offline load failed", err));
    if (authSyncReady) {
      const q=query(collection(db,"salesReceipts"),where("shopId","==",shopId),orderBy("createdAt","desc"));
      unsub1=onSnapshot(q, snap=>applyRows(snap.docs.map(normalize)), ()=>{
        const q2=query(collection(db,"salesReceipts"),where("shopId","==",shopId));
        unsub2=onSnapshot(q2, snap=>applyRows(snap.docs.map(normalize)), err=>console.error(err));
      });
    }
    return ()=>{ cancelled=true; unsub1(); unsub2&&unsub2(); };
  },[shopId, kind, authSyncReady, syncRefreshKey]);

  // Local-first list, then Firebase; SQLite cache stays in background
  useEffect(()=>{
    if (!shopId) return;
    setSiLoading(true);
    let u1=()=>{};
    let u2=null;
    let cancelled=false;
    let cloudRowsLatest=null;

    const normalizeSiInvoice = (d) => ({
      ...d.data(),
      id:d.id,
      createdAt:d.data().createdAt?.toDate?.() || d.data().createdAt || new Date().toISOString(),
    });

    const sortSiInvoices = (rows=[]) => [...rows].sort((a,b)=>
      new Date(b.createdAt||b.invoiceDate||0) - new Date(a.createdAt||a.invoiceDate||0)
    );

    const filterSiRows = (rows=[]) => rows.filter(inv =>
      inv.shopId === shopId && (isOwner || inv.createdBy === user.uid)
    );

    const loadOfflineSiInvoices = async ({ cloudRows = null } = {}) => {
      const mergeSource = cloudRows ?? cloudRowsLatest;
      const res = await offlineList(COL);
      if (cancelled) return 0;
      const records = Array.isArray(res) ? res : (res.records || []);
      const localRows = filterSiRows(records
        .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) })));

      if (Array.isArray(mergeSource)) {
        const merged = new Map(mergeSource.map(inv => [String(inv.id), inv]));
        records
          .filter(r => Number(r?.dirty || 0) === 1)
          .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }))
          .filter(inv => inv.shopId === shopId && (isOwner || inv.createdBy === user.uid))
          .forEach(inv => merged.set(String(inv.id), inv));
        const rows = sortSiInvoices(filterSiRows([...merged.values()]));
        setInvoices(rows);
        return rows.length;
      }

      if (localRows.length) setInvoices(sortSiInvoices(localRows));
      return localRows.length;
    };

    loadOfflineSiInvoices()
      .then((count) => { if (!cancelled && count > 0) setSiLoading(false); })
      .catch(err => console.warn("[S4 Offline] salesInvoices offline load failed", err));

    const applyCloudRows = (rows) => {
      if (cancelled) return;
      cloudRowsLatest = rows;
      setSiLoading(false);
      loadOfflineSiInvoices({ cloudRows: rows }).catch(() => {
        if (!cancelled) setInvoices(sortSiInvoices(filterSiRows(rows)));
      });
      offlineCacheCloudRecords(COL, rows)
        .catch(err => console.warn("[S4 Offline] salesInvoices cache failed", err));
    };

    if (authSyncReady) {
      const baseQ = isOwner
        ? query(collection(db,COL),where("shopId","==",shopId),orderBy("createdAt","desc"))
        : query(collection(db,COL),where("shopId","==",shopId),where("createdBy","==",user.uid),orderBy("createdAt","desc"));

      u1=onSnapshot(baseQ,snap=>{
        applyCloudRows(snap.docs.map(normalizeSiInvoice));
      },()=>{
        const fbQ=isOwner
          ? query(collection(db,COL),where("shopId","==",shopId))
          : query(collection(db,COL),where("shopId","==",shopId),where("createdBy","==",user.uid));
        u2=onSnapshot(fbQ,snap=>{
          applyCloudRows(sortSiInvoices(snap.docs.map(normalizeSiInvoice)));
        },err=>{
          console.error(err);
          loadOfflineSiInvoices().finally(()=>{ if (!cancelled) setSiLoading(false); });
        });
      });
    }
    return ()=>{ cancelled=true; u1(); u2&&u2(); };
  },[shopId,isOwner,user.uid,syncRefreshKey,authSyncReady,COL,dnMigrateTick]);

  useEffect(()=>{
    if (kind!=="sales" || !invoices.some(inv=>inv.invoiceType==="delivery")) return;
    migrateLegacyDeliveryNotes(invoices).then(moved=>{
      if (moved.length) setInvoices(prev=>prev.filter(inv=>!moved.includes(inv.id)));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[invoices]);

  useEffect(()=>{
    if (!isDN || !shopId) return;
    let cancelled=false;
    offlineList("salesInvoices").then(res=>{
      const records = Array.isArray(res) ? res : (res.records || []);
      const rows = records.map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) })).filter(r => r.shopId===shopId);
      return migrateLegacyDeliveryNotes(rows);
    }).then(moved=>{ if (!cancelled && moved?.length) setDnMigrateTick(n=>n+1); })
      .catch(err=>console.warn("[S4 DN] legacy delivery note scan failed", err));
    return ()=>{ cancelled=true; };
  },[isDN, shopId]);

  const siMaxLocalSerial = () => invoices.reduce((mx, inv) => {
    const m = String(inv.invoiceNo || "").match(serialRe);
    return m ? Math.max(mx, Number(m[1])) : mx;
  }, Number(shop?.[serialField] || 0));

  const siFormatInvoiceNo = (serial) =>
    `${DOC_PREFIX}${String(serial).padStart(4, "0")}`;

  const siPreviewNextInvoiceNo = () =>
    siFormatInvoiceNo(siMaxLocalSerial() + 1);

  const reserveSiInvoiceNo = async () => {
    if (editInvId) return siInvoiceNo;
    const local = siMaxLocalSerial();
    const serial = await reserveShopSerial(shopId, serialField, local);
    const no = serial ? siFormatInvoiceNo(serial)
      : isOwner ? siFormatInvoiceNo(local + 1)
      : `${siFormatInvoiceNo(local + 1)}-${deviceSerialTag()}`;
    setSiInvoiceNo(no);
    return no;
  };

  const bumpShopSiSerial = (invoiceNo) => {
    const m = String(invoiceNo || "").match(serialRe);
    if (!m || !navigator.onLine) return;
    const serial = Number(m[1]);
    if (!Number.isFinite(serial) || serial <= 0) return;
    runTransaction(db, async tx => {
      const shopRef = doc(db, "shops", shopId);
      const shopSnap = await tx.get(shopRef);
      const current = Number(shopSnap.data()?.[serialField] || 0);
      if (serial > current) tx.update(shopRef, { [serialField]: serial });
    }).catch(err => console.warn(`[S4 SI] ${serialField} background bump failed`, err));
  };

  const siOpenNew = (customer=null) => {
    setSiInvoiceNo(siPreviewNextInvoiceNo());
    const termDays = customer ? parseInt(String(customer.paymentTerms||"").replace(/[^\d]/g,""),10) : 0;
    const customerFields = customer ? {
      customerId:customer.id, customerName:customer.customerName||"", customerMobile:customer.mobileNumber||"",
      customerAddress:[customer.address,customer.area,customer.city].filter(Boolean).join(", "),
      customerTrn:customer.trnNumber||"", customerType:customer.customerType||"",
      creditDays:Number.isFinite(termDays)&&termDays>0 ? String(termDays) : "",
      ...(kind==="sales" && customer.paymentType==="credit" ? { paymentMethod:"credit", amountPaid:"" } : {}),
    } : {};
    setSiForm({ ...siEmptyForm(), ...(isDN?{ invoiceType:"delivery" }:{}), salesmanId:user?.uid||"", salesmanName:profile?.personName||"", validUntil:isQuote?siAddDays(siToday(), QT_VALID_DAYS):"", ...customerFields });
    setSiLines([]);
    setSiCurrent(siEmptyCurrent());
    setEditInvId(null);
    setSourceQuote(null);
    setSiView("form");
  };

  const siLoadDoc=(inv)=>{
    siLoadedPaidRef.current = inv.paymentMethod==="cash" ? 0 : siN2(inv.amountPaid);
    setSiForm({
      invoiceType:inv.invoiceType||"regular", invoiceDate:inv.invoiceDate,
      customerId:inv.customerId||"", customerName:inv.customerName||"",
      customerMobile:inv.customerMobile||"", customerAddress:inv.customerAddress||"",
      customerTrn:inv.customerTrn||"", paymentMethod:inv.paymentMethod||"cash",
      customerType:(customers||[]).find(c=>c.id===inv.customerId)?.customerType||"",
      // Cash is always auto-paid — don't pre-fill amountPaid so switching to credit gives 0
      amountPaid: inv.paymentMethod==="cash" ? "" : (inv.amountPaid>0?String(inv.amountPaid):""),
      deliveryNoteNo:inv.deliveryNoteNo||"", vehicleNo:inv.vehicleNo||"", note:inv.note||"",
      refNo:inv.refNo||"", salesmanId:inv.salesmanId||"", salesmanName:inv.salesmanName||"",
      currency:inv.currency||"AED", stockLocation:inv.stockLocation||"main", stockLocationName:inv.stockLocationName||"Main",
      billDiscPerc:siN2(inv.billDiscPerc)>0?String(inv.billDiscPerc):"",
      billDiscAmt:siN2(inv.billDiscPerc)>0?"":(siN2(inv.billDiscAmt)>0?String(inv.billDiscAmt):""),
      adjustment:siN2(inv.adjustment)?String(inv.adjustment):"", roundOff:siN2(inv.roundOff)?String(inv.roundOff):"",
      creditDays:siN2(inv.creditDays)>0?String(inv.creditDays):"",
      hideCodeInPrint:!!inv.hideCodeInPrint,
      validUntil:inv.validUntil||"",
    });
    setSiLines((inv.items||[]).map(it=>({ id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:it.productId||null, name:it.name||"", code:it.code||"", brand:it.brand||"", qty:String(it.qty||""), unit:it.unit||"Pcs", unitPrice:String(it.unitPrice||""), discountPerc:String(it.discountPerc||"0"), discountFlat:siN2(it.discountFlat)>0?String(it.discountFlat):"", vatPerc:it.vatPerc!=null&&it.vatPerc!==""?String(it.vatPerc):"5" })));
    setSiCurrent(siEmptyCurrent());
  };
  const siOpenEdit=(inv)=>{
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — কাস্টমার মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Customer Master.", "err"); return; }
    siSnapRef.current = "pending";
    siLoadDoc(inv);
    setSiInvoiceNo(inv.invoiceNo);
    setSourceQuote(null);
    setEditInvId(inv.id); setSiView("form");
  };
  useEffect(()=>{
    if (!openNewRequest) return;
    onOpenNewHandled?.();
    if (kind!=="sales" || siView==="form") return;
    siOpenNew(openNewCustomer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNewRequest]);
  useEffect(()=>{
    if (!voucherRequest) return;
    onVoucherHandled?.();
    if (kind==="sales") setReceiptWin({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherRequest]);
  // Quotation → new sales invoice: same customer, items and discounts, fresh invoice number and today's date.
  useEffect(()=>{
    if (isQuote || !quoteToConvert) return;
    siLoadDoc(quoteToConvert);
    // Delivery notes store every line at 0% VAT; the invoice needs each product's real VAT rate.
    if (quoteToConvert.docKind==="delivery" || quoteToConvert.invoiceType==="delivery") {
      setSiLines(prev=>prev.map(l=>{
        const vat = siFindProduct(l.productId)?.salesVat;
        return { ...l, vatPerc: vat!=null && String(vat).trim()!=="" ? String(vat) : "5" };
      }));
    }
    setSiForm(p=>({ ...p, invoiceDate:siToday(), validUntil:"", refNo:p.refNo||quoteToConvert.invoiceNo||"",
      invoiceType:quoteToConvert.invoiceType==="regular"?"regular":"tax",
      ...(p.invoiceType==="delivery" ? { deliveryNoteNo:quoteToConvert.invoiceNo||"" } : {}) }));
    setSiInvoiceNo(siPreviewNextInvoiceNo());
    setEditInvId(null);
    setSourceQuote(quoteToConvert);
    setSiView("form");
    onQuoteConvertHandled?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[quoteToConvert]);
  // The invoice list may still be loading when a quotation arrives; keep the preview number current.
  useEffect(()=>{
    if (sourceQuote && !editInvId && siView==="form") setSiInvoiceNo(siPreviewNextInvoiceNo());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[invoices]);

  const siUpd=(k,v)=>setSiForm(p=>({...p,[k]:v}));
  const siAddLine=()=>setSiLines(p=>[...p,siEmptyLine()]);
  const siFindProduct = (productId) => productId ? products.find(p=>p.id===productId) : null;
  // Re-price a line for a new unit; keep a hand-typed name unless it is the product's own/alternate name.
  const siRepriceForUnit = (item, unit, customerType = siForm.customerType) => {
    const prod = siFindProduct(item.productId);
    if (!prod) return { ...item, unit };
    const rate = siResolveRate(prod, unit, customerType);
    const autoNames = new Set([prod.name, ...siProductRateRows(prod).map(r=>String(r.altName||"").trim())].filter(Boolean));
    return {
      ...item,
      unit,
      unitPrice: String(rate.unitPrice || item.unitPrice || ""),
      name: autoNames.has(item.name) ? rate.name : item.name,
    };
  };
  const siUpdLine=(id,f,v)=>setSiLines(p=>p.map(it=>{
    if (it.id!==id) return it;
    return f==="unit" ? siRepriceForUnit(it, v) : {...it,[f]:v};
  }));
  const siChangeCurrentUnit=(unit)=>setSiCurrent(p=>siRepriceForUnit(p, unit));
  const siDelLine=(id)=>setSiLines(p=>p.filter(it=>it.id!==id));

  // A line starts with the larger of the product's default discount and the customer's discount.
  const siAutoDisc = (prod, customer) => {
    if (isDN || siForm.invoiceType==="delivery" || !prod) return 0;
    const c = customer !== undefined ? customer : (customers||[]).find(x=>x.id===siForm.customerId);
    return Math.max(0, Math.min(100, Math.max(siN2(prod.defaultDiscount), siN2(c?.discountPerc))));
  };

  // Quick add: adds product as new line directly from picker
  const siAddProductLine = (prod) => {
    const unit = prod.unit||"Pcs";
    const rate = siResolveRate(prod, unit, siForm.customerType);
    const newLine = {
      ...siEmptyLine(),
      productId:  prod.id,
      name:       rate.name,
      code:       prod.code||prod.barcode||"",
      brand:      prod.brand||"",
      unit,
      unitPrice:  rate.unitPrice,
      discountPerc: String(siAutoDisc(prod)),
      vatPerc:    prod.salesVat||"5",
      qty:        "1",
    };
    setSiLines(p=>[...p, newLine]);
  };

  const siSelectProduct=(prod)=>{
    const unit = prod.unit||"Pcs";
    const rate = siResolveRate(prod, unit, siForm.customerType);
    setSiCurrent(p=>({
      ...p,
      productId: prod.id,
      name:      rate.name,
      code:      prod.code||prod.barcode||"",
      brand:     prod.brand||"",
      unit,
      unitPrice: rate.unitPrice||p.unitPrice,
      discountPerc: String(siAutoDisc(prod)),
      vatPerc:   prod.salesVat||"5",
    }));
    setTimeout(()=>siQtyRef.current?.focus(), 100);
  };

  const siAddCurrentItem = () => {
    if (!siCurrent.name.trim()) { toast(t.si_errName,"err"); return; }
    if (!siCurrent.qty||siN2(siCurrent.qty)<=0) { toast(t.si_errQty,"err"); return; }
    const editId = siEditLineId;
    setSiLines(prev=>editId && prev.some(x=>x.id===editId)
      ? prev.map(x=>x.id===editId ? { ...siCurrent, id:editId } : x)
      : [...prev, { ...siCurrent, id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}` }]);
    setSiEditLineId(null);
    setSiCurrent(siEmptyCurrent());
    setTimeout(()=>siNameRef.current?.focus(), 80);
  };

  const siSelectCustomer=(c)=>{
    siUpd("customerId",c.id); siUpd("customerName",c.customerName);
    siUpd("customerMobile",c.mobileNumber||"");
    siUpd("customerAddress",[c.address,c.area,c.city].filter(Boolean).join(", ")||"");
    siUpd("customerTrn",c.trnNumber||"");
    siUpd("customerType",c.customerType||"");
    const termDays = parseInt(String(c.paymentTerms||"").replace(/[^\d]/g,""),10);
    siUpd("creditDays", Number.isFinite(termDays)&&termDays>0 ? String(termDays) : "");
    if (kind==="sales" && c.paymentType==="credit") setSiForm(p=>p.paymentMethod==="cash" ? { ...p, paymentMethod:"credit", amountPaid:"" } : p);
    setShowCustPicker(false);
    // Lines still on the old automatic discount move to the new customer's; hand-typed discounts stay.
    const oldCustomer = (customers||[]).find(x=>x.id===siForm.customerId) || null;
    const applyDisc = (it) => {
      const prod = siFindProduct(it.productId);
      if (!prod) return it;
      const before = siAutoDisc(prod, oldCustomer);
      const after = siAutoDisc(prod, c);
      return before !== after && Math.abs(siN2(it.discountPerc) - before) < 0.001 ? { ...it, discountPerc:String(after) } : it;
    };
    const newType = c.customerType||"";
    if (normCustomerType(newType) === normCustomerType(siForm.customerType)) {
      setSiLines(p=>p.map(applyDisc));
      setSiCurrent(p=>applyDisc(p));
      return;
    }
    let changed = 0;
    const reprice = (raw) => {
      const it = applyDisc(raw);
      if (!it.productId) return it;
      const next = siRepriceForUnit(it, it.unit, newType);
      if (String(next.unitPrice) !== String(it.unitPrice) || next.name !== it.name) changed += 1;
      return next;
    };
    const repricedLines = siLines.map(reprice);
    const repricedCurrent = reprice(siCurrent);
    setSiLines(repricedLines);
    setSiCurrent(repricedCurrent);
    if (changed) toast(lang==="bn"
      ? `${changed}টি item-এর দাম নতুন customer type অনুযায়ী বদলানো হয়েছে`
      : `Prices of ${changed} item(s) updated for the new customer type`);
  };

  const siQuickAddCustomer = async (customerName) => {
    if (!canManageCustomers) {
      toast(lang==="bn"?"কাস্টমার যোগ করার permission নেই":"No permission to add customers","err");
      return;
    }
    const name = String(customerName || "").trim();
    if (!name) return;

    try {
      const now = new Date().toISOString();
      const result = await offlineCreate("customers", {
        shopId,
        customerName: name,
        customerCode: await nextPartyCode(shopId, "customers", customers),
        mobileNumber: "",
        createdBy: user.uid,
        createdAt: now,
      });
      const created = { ...result.data, id: result.documentId, customerName: name };
      onCustomerCreated?.(created);
      siSelectCustomer(created);
      toast(lang==="bn"?"✅ কাস্টমার যোগ হয়েছে":"✅ Customer added");

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] customer quick-add sync failed", err));
      }
    } catch (error) {
      toast(error?.message || String(error), "err");
    }
  };

  useEffect(()=>{
    if (productFromMaster?.product && siView==="form") siSelectProduct(productFromMaster.product);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[productFromMaster]);

  const siSnapKey = () => JSON.stringify({ f:siForm, l:siLines.map(({ id, ...rest })=>rest) });
  useEffect(()=>{ if (siSnapRef.current==="pending") siSnapRef.current = siSnapKey(); });
  const siIsDirty = () => {
    if (siView!=="form") return false;
    if (String(siCurrent.name||"").trim()) return true;
    if (!editInvId) return siLines.length>0;
    return siSnapRef.current!==siSnapKey();
  };
  const siLeaveUnsavedOk = () =>
    !siIsDirty() || window.confirm(lang==="bn"?"এই বিলের পরিবর্তন সেভ হয়নি। তবুও চলে যাবেন?":"This bill has unsaved changes. Leave anyway?");
  // Phone back / header back steps out one level at a time instead of leaving Sales.
  useEffect(()=>{
    const inFolder = siMobile && siView==="list" && !!siOpenParty;
    if (siView==="list" && !inFolder) return undefined;
    const guard = {
      leave: () => siView!=="form" || siLeaveUnsavedOk(),
      back: () => {
        if (siView==="form") { if (siLeaveUnsavedOk()) setSiView("list"); }
        else if (siView==="detail") { setSiView("list"); setSelInv(null); }
        else setSiOpenParty(null);
        return true;
      },
    };
    billLeaveGuard.current = guard;
    return () => { if (billLeaveGuard.current===guard) billLeaveGuard.current = null; };
  });
  // A minimized bill must be confirmed away before the list opens another one.
  const siLeaveMinOk = () => {
    if (!(siWin.min && siView==="form")) return true;
    if (!siLeaveUnsavedOk()) return false;
    siWin.restore();
    return true;
  };
  const siPrint = (doc) => {
    const code = doc.customerId ? (customers||[]).find(c=>c.id===doc.customerId)?.customerCode : "";
    const inv = code && !doc.customerCode ? { ...doc, customerCode:code } : doc;
    if (!siPerm("viewCustomerBalance")) { printSalesInvoice(inv, shop, lang, siShowCode, siColorPrint); return; }
    const nameKey = String(inv.customerName||"").trim().toLowerCase();
    const customerBalance = invoices
      .filter(x => x.status!=="cancelled" && x.status!=="draft" && x.docKind!=="quotation" && x.invoiceType!=="delivery"
        && (inv.customerId ? x.customerId===inv.customerId : String(x.customerName||"").trim().toLowerCase()===nameKey))
      .reduce((sum,x)=>sum+Math.max(0, siN2(x.balanceDue)), 0);
    printSalesInvoice(inv, shop, lang, siShowCode, siColorPrint, { customerBalance });
  };

  // A bill with money received against it changes only through the owner; staff cancel the receipt first.
  const siCanEditDoc = (inv) => (isQuote?["draft","open"]:isDN?["draft","confirmed"]:["draft","confirmed","paid","partial"]).includes(inv?.status)
    && (isOwner || !receipts.some(r => r.status!=="cancelled" && (r.allocations||[]).some(a => a.invoiceId===inv.id)));
  const siCanDeleteDoc = (inv) => !!inv && (isOwner
    ? ["draft","cancelled"].includes(inv.status)
    : canCancelInv && inv.status==="draft" && inv.createdBy===user?.uid);
  const siOpenFromDesktop = (inv) => {
    if (!siLeaveUnsavedOk()) return;
    if (!siCanEditDoc(inv)) { setSelInv(inv); setSiView("detail"); return; }
    siOpenEdit(inv);
  };

  const siPickCustomers = (customers||[]).filter(c=>!["inactive","blocked"].includes(c.status));
  const customerPickerProps = {
    customers: siPickCustomers,
    t,
    th: PM_TH,
    lang,
    onSelect: siSelectCustomer,
    onClose: () => setShowCustPicker(false),
    canQuickAdd: canManageCustomers,
    onQuickAdd: siQuickAddCustomer,
  };

  const siBuild=(status, invoiceNoOverride)=>{
    if (String(siCurrent.name||"").trim()) {
      toast(lang==="bn"?"❌ উপরের ঘরে একটা আইটেম আছে যা বিলে যোগ হয়নি — Add চাপুন বা ঘরটা খালি করুন":"❌ An item in the entry row is not added to the bill yet — press Add or clear it","err");
      return null;
    }
    const valid=siLines.filter(it=>it.name.trim());
    if (!valid.length){ toast(t.si_errItems,"err"); return null; }
    const badLine = valid.find(it => siN2(it.discountPerc)<0 || siN2(it.discountPerc)>100 || siN2(it.discountFlat)<0 || siN2(it.vatPerc)<0 || siN2(it.unitPrice)<0);
    if (badLine) { toast(lang==="bn"?`❌ "${badLine.name}": ছাড় ০–১০০% আর দাম/VAT মাইনাস হতে পারে না`:`❌ "${badLine.name}": discount must be 0–100% and price/VAT cannot be negative`,"err"); return null; }
    const isDelivery = isDN || (kind==="sales" && siForm.invoiceType==="delivery");
    const isTax      = siForm.invoiceType==="tax";
    for (const it of valid){
      if (!it.qty.toString().trim()||siN2(it.qty)<=0){ toast(t.si_errQty,"err"); return null; }
      if (siN2(it.unitPrice)<0){ toast(t.si_errPrice,"err"); return null; }
    }
    const effectiveIsTax = isTax && !isDelivery;
    const builtItems=valid.map(it=>{
      const item = isDelivery ? siDeliveryLines([it])[0] : it;
      const { disc, vat, total }=siCalcLine(item, effectiveIsTax);
      return { productId:it.productId||null, name:it.name.trim(), code:it.code.trim(), brand:it.brand.trim(), qty:siN2(it.qty), unit:it.unit, unitFactor:unitFactorFor(siFindProduct(it.productId), it.unit), unitPrice:siN2(it.unitPrice), discountPerc:isDelivery?0:siN2(it.discountPerc), discountFlat:isDelivery||siN2(it.discountPerc)>0?0:siN2(it.discountFlat), discountAmt:parseFloat(siFmt2(disc)), vatPerc:effectiveIsTax?siN2(it.vatPerc):0, vatAmt:parseFloat(siFmt2(vat)), lineTotal:parseFloat(siFmt2(total)) };
    });
    const formTotals = isDelivery ? siCalcTotals(siDeliveryLines(valid), false) : siCalcTotals(valid, effectiveIsTax, siInvoiceExtras(siForm));
    const { sub, disc, vat, grand } = formTotals;
    if (grand < -0.001) { toast(lang==="bn"?"❌ সর্বমোট মাইনাস হতে পারে না — সমন্বয়/ছাড় ঠিক করুন":"❌ Grand total cannot be negative — check adjustment/discount","err"); return null; }
    const priorDoc = editInvId ? invoices.find(inv=>inv.id===editInvId) : null;
    if (!canDiscount && !isDelivery) {
      const reduction = (d, adj) => siN2(d) + Math.max(0, -siN2(adj));
      const baseDoc = priorDoc || sourceQuote;
      // The owner-set product/customer discount is automatic, so it never needs the discount permission.
      const autoAllowed = valid.reduce((sum, it) => {
        const auto = siAutoDisc(siFindProduct(it.productId));
        if (!auto) return sum;
        return sum + siCalcLine({ ...it, discountPerc: Math.min(siN2(it.discountPerc), auto), discountFlat: 0 }, effectiveIsTax).disc;
      }, 0);
      const allowed = Math.max(baseDoc ? reduction(baseDoc.totalDiscount, baseDoc.adjustment) : 0, autoAllowed);
      const noDiscountMsg = lang==="bn"?"❌ ডিসকাউন্ট দেওয়ার অনুমতি নেই — মালিকের কাছে পারমিশন নিন":"❌ You are not allowed to give discounts — ask the owner for permission";
      if (reduction(disc, formTotals.adjustment) > allowed + 0.01) {
        toast(noDiscountMsg,"err"); return null;
      }
      // Round Off is for coins only; a larger cut is a discount.
      const roundOff = siN2(siForm.roundOff);
      if (roundOff < -1 && roundOff < siN2(baseDoc?.roundOff) - 0.005) {
        toast(noDiscountMsg,"err"); return null;
      }
      // Lowering the rate below the product's price is a discount too, unless the line already had that rate.
      const underPriced = valid.find((it) => {
        const prod = siFindProduct(it.productId);
        if (!prod) return false;
        const listRate = siN2(siResolveRate(prod, it.unit, siForm.customerType).unitPrice);
        const prior = (baseDoc?.items || []).find((x) => x.productId === it.productId && (x.unit || "") === (it.unit || ""));
        const floor = prior ? Math.min(listRate, siN2(prior.unitPrice)) : listRate;
        return floor > 0 && siN2(it.unitPrice) < floor - 0.005;
      });
      if (underPriced) {
        toast(lang==="bn"?`❌ "${underPriced.name}"-এর দাম কমানোর অনুমতি নেই — মালিকের কাছে পারমিশন নিন`:`❌ You are not allowed to lower the price of "${underPriced.name}" — ask the owner for permission`,"err"); return null;
      }
    }
    if (status==="draft" && priorDoc && !isQuote && !isDN && priorDoc.status && priorDoc.status!=="draft") {
      toast(lang==="bn"?"❌ সেভ করা বিলকে আবার Draft করা যাবে না":"❌ A saved invoice cannot be turned back into a draft","err"); return null;
    }
    const isCash     = siForm.paymentMethod==="cash";
    // Receipts may have been posted since the form was opened: apply only the user's change on top of the latest paid amount.
    const typedPaid  = siN2(siForm.amountPaid);
    const creditPaid = priorDoc && priorDoc.paymentMethod!=="cash"
      ? siN2(priorDoc.amountPaid) + (typedPaid - siLoadedPaidRef.current)
      : typedPaid;
    const receiptsOnBill = priorDoc ? (receipts||[]).filter(r=>r.status!=="cancelled")
      .reduce((s,r)=>s+(r.allocations||[]).filter(a=>a.invoiceId===priorDoc.id).reduce((x,a)=>x+siN2(a.amount),0),0) : 0;
    if (!isDelivery && !isQuote && !isCash && priorDoc && receiptsOnBill > grand + 0.01) {
      toast(lang==="bn"?`❌ এই বিলে আগেই ${siFmt2(receiptsOnBill)} টাকা নেওয়া হয়েছে — সর্বমোট এর চেয়ে কম করা যাবে না`:`❌ ${siFmt2(receiptsOnBill)} has already been received on this bill — the total cannot go below it`,"err"); return null;
    }
    if (!isDelivery && !isQuote && isCash && receiptsOnBill > 0.01) {
      toast(lang==="bn"?"❌ এই বিলে Receipt Voucher আছে — Cash করা যাবে না, আগে Receipt বাতিল করুন":"❌ This bill has receipt vouchers — it cannot be made cash; cancel the receipts first","err"); return null;
    }
    if (!isDelivery && !isQuote && !isCash && (typedPaid < 0 || creditPaid > grand + 0.01)) {
      toast(lang==="bn"?"❌ পরিশোধিত টাকা মোট বিলের চেয়ে বেশি বা ঋণাত্মক হতে পারে না!":"❌ Amount paid cannot exceed the grand total or be negative!","err"); return null;
    }
    // cash invoice: auto fully paid | delivery: confirmed | credit: normal; receipts already posted on the bill always stay counted
    const paid = isDelivery || isQuote ? 0
               : isCash     ? parseFloat(siFmt2(grand))
               : Math.min(Math.max(creditPaid,receiptsOnBill,0), Math.max(grand,0));
    const bal  = isDelivery || isQuote ? 0 : Math.max(0, grand - paid);
    const derivedStatus = isQuote ? (status==="confirmed" ? "open" : status)
                        : isDN ? status
                        : isDelivery ? "confirmed"
                        : (status==="confirmed" ? (bal<0.01?"paid":paid>0?"partial":"confirmed") : status);
    const keepConverted = priorDoc?.convertedInvoiceNo ? { convertedInvoiceId:priorDoc.convertedInvoiceId||"", convertedInvoiceNo:priorDoc.convertedInvoiceNo } : {};
    const sourceLink = (src) => src?.docKind==="delivery"
      ? { deliveryNoteId:src.id, deliveryNoteNo:src.invoiceNo||"" }
      : { quotationId:src.id, quotationNo:src.invoiceNo||"" };
    const quoteFields = isQuote ? { docKind:"quotation", validUntil:siForm.validUntil||"", ...keepConverted }
      : isDN ? { docKind:"delivery", ...keepConverted }
      : sourceQuote ? sourceLink(sourceQuote)
      : priorDoc?.deliveryNoteId ? { deliveryNoteId:priorDoc.deliveryNoteId, deliveryNoteNo:priorDoc.deliveryNoteNo||"" }
      : priorDoc?.quotationId ? { quotationId:priorDoc.quotationId, quotationNo:priorDoc.quotationNo||"" } : {};
    const docType = isDN ? "delivery" : isQuote ? (isTax ? "tax" : "regular") : (siForm.invoiceType||"tax");
    return { ...quoteFields, shopId, invoiceNo:invoiceNoOverride ?? siInvoiceNo, invoiceType:docType, invoiceDate:siForm.invoiceDate, customerId:siForm.customerId||null, customerCode:siForm.customerId?((customers||[]).find(c=>c.id===siForm.customerId)?.customerCode||""):"", customerName:siForm.customerName.trim(), customerMobile:siForm.customerMobile.trim(), customerAddress:siForm.customerAddress.trim(), customerTrn:siForm.customerTrn.trim(), items:builtItems, subtotal:parseFloat(siFmt2(sub)), totalDiscount:parseFloat(siFmt2(disc)), totalVat:parseFloat(siFmt2(vat)), grandTotal:parseFloat(siFmt2(grand)), paymentMethod:siForm.paymentMethod, amountPaid:parseFloat(siFmt2(paid)), balanceDue:parseFloat(siFmt2(bal)), status:derivedStatus, deliveryNoteNo:siForm.deliveryNoteNo.trim(), vehicleNo:siForm.vehicleNo.trim(), note:siForm.note.trim(), createdBy:priorDoc?.createdBy||user.uid, createdByName:priorDoc?.createdByName||profile.personName,
      refNo:String(siForm.refNo||"").trim(),
      salesmanId:siForm.salesmanId||"", salesmanName:String(siForm.salesmanName||"").trim(),
      currency:siForm.currency||"AED",
      stockLocation:siForm.stockLocation||"main", stockLocationName:siForm.stockLocationName||"Main",
      billDiscPerc:isDelivery?0:Math.min(Math.max(siN2(siForm.billDiscPerc),0),100),
      billDiscAmt:isDelivery?0:parseFloat(siFmt2(formTotals.billDisc)),
      billDiscount:isDelivery?0:parseFloat(siFmt2(formTotals.billDisc)),
      adjustment:isDelivery?0:siN2(siForm.adjustment),
      roundOff:isDelivery?0:siN2(siForm.roundOff),
      creditDays:Math.max(0, Math.round(siN2(siForm.creditDays))),
      dueDate:!isDelivery && !isQuote && siN2(siForm.creditDays)>0 && siForm.invoiceDate ? siAddDays(siForm.invoiceDate, Math.round(siN2(siForm.creditDays))) : "",
      hideCodeInPrint:!!siForm.hideCodeInPrint,
    };
  };

  // The customer's master settings: blocked customers can't be billed; cash-only and credit limit ask first.
  const siCustomerTermsOk = (p) => {
    if (kind!=="sales" || p.status==="draft" || p.invoiceType==="delivery" || !p.customerId) return true;
    const cust = (customers||[]).find(c=>c.id===p.customerId);
    if (!cust) return true;
    const priorDoc = editInvId ? invoices.find(inv=>inv.id===editInvId) : null;
    if (cust.status==="blocked" && priorDoc?.customerId!==cust.id) {
      toast(lang==="bn"?`❌ "${cust.customerName}" ব্লক করা কাস্টমার — বিক্রি করা যাবে না`:`❌ "${cust.customerName}" is a blocked customer — cannot be billed`,"err");
      return false;
    }
    if (p.balanceDue<=0.01) return true;
    if (cust.paymentType==="cash" && !window.confirm(lang==="bn"
      ? `"${cust.customerName}" শুধু নগদের কাস্টমার। তবুও বাকিতে ${siFmt2(p.balanceDue)} দেবেন?`
      : `"${cust.customerName}" is a cash-only customer. Give ${siFmt2(p.balanceDue)} on credit anyway?`)) return false;
    const limit = siN2(cust.creditLimit);
    if (limit>0) {
      const outstanding = invoices
        .filter(inv=>inv.id!==editInvId && inv.customerId===cust.id && !["cancelled","draft"].includes(inv.status))
        .reduce((s,inv)=>s+Math.max(0, siN2(inv.balanceDue)), 0);
      if (outstanding + p.balanceDue > limit + 0.01 && !window.confirm(lang==="bn"
        ? `ক্রেডিট লিমিট ছাড়িয়ে যাচ্ছে!\nলিমিট: ${siFmt2(limit)}\nআগের বাকি: ${siFmt2(outstanding)}\nএই বিলের বাকি: ${siFmt2(p.balanceDue)}\nতবুও সেভ করবেন?`
        : `Credit limit exceeded!\nLimit: ${siFmt2(limit)}\nOutstanding: ${siFmt2(outstanding)}\nThis bill due: ${siFmt2(p.balanceDue)}\nSave anyway?`)) return false;
    }
    return true;
  };

  const saveSalesInvoiceOffline = async (payload, successMessage, options = {}) => {
    const nowIso = new Date().toISOString();
    const priorInvoice = editInvId ? invoices.find(inv => inv.id === editInvId) : null;
    let savedInvoice;

    if (editInvId) {
      const result = await offlineUpdate(COL, editInvId, {
        ...payload,
        updatedAt: nowIso,
        updatedBy: user?.uid || "",
      });

      savedInvoice = { ...result.data, id: editInvId };
      setInvoices(prev => prev.map(inv => inv.id === editInvId ? savedInvoice : inv));
      setSelInv(prev => prev && prev.id === editInvId ? savedInvoice : prev);
      toast(successMessage || t.si_updated);
      if (priorInvoice && priorInvoice.status !== "draft") {
        logAudit({ shopId, user, profile, action:"edit", collection:COL, docId:editInvId, docNo:payload.invoiceNo, amount:payload.grandTotal,
          note:`${payload.customerName||""} · ${siFmt2(priorInvoice.grandTotal)} → ${siFmt2(payload.grandTotal)}` });
      }
    } else {
      const result = await offlineCreate(COL, {
        ...payload,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      savedInvoice = { ...result.data, id: result.documentId };
      setInvoices(prev => [savedInvoice, ...prev]);
      toast(successMessage);
    }

    // Goods on an invoice made from a delivery note already left stock with the delivery note.
    if (!isQuote && !payload.deliveryNoteId) await applyInvoiceStockEffect({
      oldInvoice: priorInvoice,
      newInvoice: payload,
      invoiceId: savedInvoice.id,
      applyType: "sale",
      reverseType: "return",
      referenceType: isDN ? "delivery_note" : "sales_invoice",
      unitCostKey: "unitPrice",
      shopId,
      actor: { uid: user?.uid, personName: profile?.personName },
    });

    if (!editInvId) bumpShopSiSerial(payload.invoiceNo);

    if (kind==="sales" && !editInvId && sourceQuote?.id) {
      const fromDN = sourceQuote.docKind==="delivery";
      try {
        await offlineUpdate(fromDN ? "deliveryNotes" : "quotations", sourceQuote.id, {
          ...sourceQuote,
          status: fromDN ? "invoiced" : "converted",
          convertedInvoiceId: savedInvoice.id,
          convertedInvoiceNo: payload.invoiceNo,
          updatedAt: nowIso,
          updatedBy: user?.uid || "",
        });
      } catch (err) {
        console.warn("[S4 SI] mark source document converted failed", err);
      }
      setSourceQuote(null);
    }

    if (navigator.onLine) {
      window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales invoice save sync failed", err));
    }

    setSiView("list");

    if (options.print) {
      setSiPrintModal(savedInvoice);
    }

    return savedInvoice;
  };

  const siSaveRun = async (status, successMsg, options) => {
    if (siSaveLockRef.current) return;
    siSaveLockRef.current = true;
    setSiSaving(true);
    try {
      const lockedBy = editInvId ? billReturns.filter(r => r.status !== "cancelled" && r.invoiceId === editInvId) : [];
      if (lockedBy.length) {
        toast(lang==="bn" ? `এই বিলে রিটার্ন আছে (${lockedBy.map(r=>r.returnNo).join(", ")}) — আগে রিটার্ন বাতিল করুন` : `This bill has return(s) ${lockedBy.map(r=>r.returnNo).join(", ")}; cancel them before editing`, "err");
        return;
      }
      if (kind==="sales" && !editInvId && sourceQuote?.id) {
        const fromDN = sourceQuote.docKind==="delivery";
        const latest = await offlineGetById(fromDN ? "deliveryNotes" : "quotations", sourceQuote.id).catch(() => null);
        const src = latest?.data || null;
        if (src && ["converted","invoiced"].includes(src.status)) {
          const msg = lang==="bn"
            ? `${sourceQuote.invoiceNo} আগেই ইনভয়েস ${src.convertedInvoiceNo||""} হয়ে গেছে। তবুও আরেকটা ইনভয়েস বানাবেন?`
            : `${sourceQuote.invoiceNo} was already invoiced as ${src.convertedInvoiceNo||"another invoice"}. Create another invoice anyway?`;
          if (!window.confirm(msg)) return;
        }
        if (src?.status==="cancelled") {
          toast(lang==="bn" ? `${sourceQuote.invoiceNo} বাতিল করা হয়েছে` : `${sourceQuote.invoiceNo} has been cancelled`, "err");
          return;
        }
      }
      const p = siBuild(status, siInvoiceNo);
      if (!p) return;
      if (!siCustomerTermsOk(p)) return;
      if (status!=="draft" && kind!=="quotation" && !unlinkedStockOk(p.items, lang)) return;
      if (!editInvId) p.invoiceNo = await reserveSiInvoiceNo();
      await saveSalesInvoiceOffline(p, editInvId ? t.si_updated : successMsg, options);
    } catch(e) {
      toast(e.message,"err");
    } finally {
      siSaveLockRef.current = false;
      setSiSaving(false);
    }
  };
  const siSaveDraft = () => siSaveRun("draft", t.si_saved);
  const siConfirm = () => siSaveRun("confirmed", t.si_confirmed, { print:true });

  // ── Receipts against Bill ──
  const getCustomerOpenInvoices = (partyId, partyName) => invoices
    .filter(inv => ["confirmed","partial"].includes(inv.status) && siN2(inv.balanceDue)>0.01
      && (partyId ? inv.customerId===partyId : !inv.customerId && String(inv.customerName||"").trim()===String(partyName||"").trim()))
    .sort((a,b) => String(a.invoiceDate||"").localeCompare(String(b.invoiceDate||"")));

  const rcptMaxLocalSerial = () => receipts.reduce((mx, r) => {
    const m = String(r.receiptNo || "").match(/RCT-?(\d+)(?:-[A-Z]{2})?$/i);
    return m ? Math.max(mx, Number(m[1])) : mx;
  }, Number(shop?.lastReceiptSerial || 0));
  const rcptFormatNo = (serial) => `RCT-${String(serial).padStart(4, "0")}`;
  const genReceiptNo = async () => {
    const local = rcptMaxLocalSerial();
    const serial = await reserveShopSerial(shopId, "lastReceiptSerial", local);
    if (serial) return rcptFormatNo(serial);
    return isOwner ? rcptFormatNo(local + 1) : `${rcptFormatNo(local + 1)}-${deviceSerialTag()}`;
  };

  const applyInvoicePayments = async (changes, nowIso) => {
    for (const { invoice, newAmountPaid } of changes) {
      const grand = siN2(invoice.grandTotal);
      const newBalance = Math.max(0, parseFloat(siFmt2(grand - newAmountPaid)));
      const newStatus = newBalance < 0.01 ? "paid" : (newAmountPaid > 0 ? "partial" : "confirmed");
      const result = await offlinePatch("salesInvoices", invoice.id, { amountPaid:newAmountPaid, balanceDue:newBalance, status:newStatus, updatedAt:nowIso, updatedBy:user?.uid || "" }, invoice);
      const updated = { ...invoice, ...result.data, id: invoice.id };
      setInvoices(prev => prev.map(x => x.id === invoice.id ? updated : x));
      setSelInv(prev => prev && prev.id === invoice.id ? updated : prev);
    }
  };

  const siSaveReceipt = async (d) => {
    const allocations = (d.allocations||[]).filter(a => siN2(a.amount) > 0);
    if (!d.partyName || !allocations.length) return null;
    setRcptSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const changes = allocations.map(a => {
        const cur = invoices.find(inv => inv.id === a.invoiceId);
        if (!cur) throw new Error(lang==="bn" ? `বিল ${a.invoiceNo} পাওয়া যায়নি` : `Bill ${a.invoiceNo} not found`);
        if (!["confirmed","partial"].includes(cur.status)) throw new Error(lang==="bn" ? `${a.invoiceNo}-এ টাকা নেওয়া যাবে না` : `${a.invoiceNo} cannot take a receipt`);
        const balance = Math.max(0, siN2(cur.grandTotal) - siN2(cur.amountPaid));
        if (siN2(a.amount) > balance + 0.01) throw new Error(lang==="bn" ? `${a.invoiceNo}-এর বাকির চেয়ে বেশি` : `Amount for ${a.invoiceNo} exceeds its balance`);
        return { invoice: cur, newAmountPaid: parseFloat(siFmt2(siN2(cur.amountPaid) + siN2(a.amount))) };
      });
      const receiptNo = await genReceiptNo();
      const payload = {
        shopId, receiptNo,
        customerId: d.partyId || null, customerName: d.partyName, customerMobile: d.partyMobile || "",
        receiptDate: d.date || siToday(), method: d.method,
        totalAmount: parseFloat(siFmt2(allocations.reduce((s,a)=>s+siN2(a.amount),0))),
        chequeNo: d.chequeNo || "", chequeBank: d.chequeBank || "", chequeDate: d.chequeDate || "",
        chequeStatus: d.method === "cheque" ? "pending" : null,
        refNo: d.refNo || "", refBank: d.refBank || "", refDate: d.refDate || "",
        collectedById: d.collectedById || "", collectedByName: d.collectedByName || "",
        note: d.note || "",
        allocations: allocations.map(a => ({ invoiceId:a.invoiceId, invoiceNo:a.invoiceNo, invoiceDate:a.invoiceDate||"", amount:parseFloat(siFmt2(a.amount)) })),
        status: "active",
        createdBy: user.uid, createdByName: profile.personName,
        createdAt: nowIso, updatedAt: nowIso, updatedBy: user?.uid || "",
      };
      const result = await offlineCreate("salesReceipts", payload);
      const created = { ...result.data, id: result.documentId, createdAt: nowIso };
      setReceipts(prev => [created, ...prev]);
      await applyInvoicePayments(changes, nowIso);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales receipt save sync failed", err));
      toast(lang==="bn" ? `✅ রিসিট ${receiptNo} সেভ হয়েছে` : `✅ Receipt ${receiptNo} saved`);
      return created;
    } catch (e) { toast(e.message, "err"); return null; }
    finally { setRcptSaving(false); }
  };

  const siReverseReceipt = async (receipt, patch) => {
    const nowIso = new Date().toISOString();
    const changes = (receipt.allocations||[]).map(a => {
      const cur = invoices.find(inv => inv.id === a.invoiceId);
      if (!cur || cur.status === "cancelled") return null;
      return { invoice: cur, newAmountPaid: Math.max(0, parseFloat(siFmt2(siN2(cur.amountPaid) - siN2(a.amount)))) };
    }).filter(Boolean);
    await applyInvoicePayments(changes, nowIso);
    const result = await offlinePatch("salesReceipts", receipt.id, { status:"cancelled", cancelledAt:nowIso, cancelledBy:user?.uid || "", updatedAt:nowIso, updatedBy:user?.uid || "", ...patch }, receipt);
    const updated = { ...receipt, ...result.data, id: receipt.id };
    setReceipts(prev => prev.map(r => r.id === receipt.id ? updated : r));
    if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales receipt cancel sync failed", err));
    return updated;
  };

  const siCancelReceipt = async (receipt) => {
    if (receipt.status === "cancelled") return null;
    if (!window.confirm(lang==="bn" ? "এই রিসিট বাতিল করবেন? বিলগুলোর বাকি আবার ফিরে আসবে।" : "Cancel this receipt? The bills' balances will be restored.")) return null;
    try {
      const updated = await siReverseReceipt(receipt, {});
      toast(lang==="bn" ? "🚫 রিসিট বাতিল হয়েছে" : "🚫 Receipt cancelled", "err");
      logAudit({ shopId, user, profile, action:"cancel", collection:"salesReceipts", docId:receipt.id, docNo:receipt.receiptNo, amount:receipt.totalAmount, note:receipt.customerName });
      return updated;
    } catch (e) { toast(e.message, "err"); return null; }
  };

  // Only cancelled receipts can be removed: cancelling already gave the money back to the bills.
  const siDeleteReceipt = async (receipt) => {
    if (!isOwner || receipt?.status !== "cancelled") return false;
    if (!window.confirm(lang==="bn" ? `রিসিট ${receipt.receiptNo||""} একেবারে মুছে ফেলবেন?` : `Delete receipt ${receipt.receiptNo||""} permanently?`)) return false;
    try {
      await offlineRemove("salesReceipts", receipt.id);
      setReceipts(prev => prev.filter(r => r.id !== receipt.id));
      toast(lang==="bn" ? "🗑️ রিসিট মুছে ফেলা হয়েছে" : "🗑️ Receipt deleted", "err");
      logAudit({ shopId, user, profile, action:"delete", collection:"salesReceipts", docId:receipt.id, docNo:receipt.receiptNo, amount:receipt.totalAmount, note:receipt.customerName });
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales receipt delete sync failed", err));
      return true;
    } catch (e) { toast(e.message, "err"); return false; }
  };

  const siSetReceiptCheque = async (receipt, chequeStatus, extra = {}) => {
    try {
      if (chequeStatus === "bounced") {
        if (!window.confirm(lang==="bn" ? "চেক বাউন্স? রিসিট বাতিল হবে আর বিলের বাকি ফিরে আসবে।" : "Cheque bounced? The receipt is cancelled and the bills' balances restored.")) return null;
        const updated = await siReverseReceipt(receipt, { chequeStatus:"bounced", cancelReason:"cheque_bounced" });
        toast(lang==="bn" ? "❌ চেক বাউন্স" : "❌ Cheque bounced", "err");
        return updated;
      }
      const nowIso = new Date().toISOString();
      const result = await offlinePatch("salesReceipts", receipt.id, { chequeStatus, ...(chequeStatus==="cleared" ? { clearedAt:extra.clearedAt || nowIso, clearedBy:user?.uid || "" } : {}), updatedAt:nowIso, updatedBy:user?.uid || "" }, receipt);
      const updated = { ...receipt, ...result.data, id: receipt.id };
      setReceipts(prev => prev.map(r => r.id === receipt.id ? updated : r));
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales receipt cheque sync failed", err));
      toast(lang==="bn" ? "✅ চেক ক্লিয়ার" : "✅ Cheque cleared");
      return updated;
    } catch (e) { toast(e.message, "err"); return null; }
  };

  const receiptWindow = receiptWin && kind==="sales" ? (() => {
    const openAll = invoices.filter(inv => ["confirmed","partial"].includes(inv.status) && siN2(inv.balanceDue)>0.01);
    const salesmen = (team||[]).filter(m=>m && m.status!=="disabled" && m.active!==false)
      .map(m=>({ id:m.uid||m.id, name:m.personName||m.name||m.email||"" })).filter(m=>m.id&&m.name);
    return (
      <AgainstInvoiceVoucherWindow
        lang={lang} mode="receipt" cur={t.cur||"AED"}
        voucherNo={rcptFormatNo(rcptMaxLocalSerial() + 1)}
        parties={voucherParties(customers, openAll, "customerId", "customerName", c=>c.customerName, c=>c.mobileNumber)}
        salesmen={salesmen}
        banks={UAE_BANKS.map(b=>b.name)}
        getOpenInvoices={(p)=>getCustomerOpenInvoices(p.id, p.name)}
        vouchers={receipts.map(r=>toVoucherView(r,"receipt"))}
        prefill={receiptWin.partyId||receiptWin.partyName ? receiptWin : null}
        initialViewId={receiptWin.viewId||null}
        saving={rcptSaving}
        onSave={async (d)=>{ const c = await siSaveReceipt(d); return c ? toVoucherView(c,"receipt") : null; }}
        onCancelVoucher={canCancelInv ? async (v)=>{ const u = await siCancelReceipt(v.raw); return u ? toVoucherView(u,"receipt") : null; } : undefined}
        onDeleteVoucher={isOwner ? (v)=>siDeleteReceipt(v.raw) : undefined}
        onSetChequeStatus={async (v,st)=>{
          if (st==="bounced" && !canCancelInv) { toast(lang==="bn"?"❌ চেক বাউন্স করার অনুমতি নেই":"❌ You don't have permission to bounce cheques","err"); return null; }
          const u = await siSetReceiptCheque(v.raw, st); return u ? toVoucherView(u,"receipt") : null;
        }}
        onPrint={(v)=>printPaymentVoucher(v.raw, shop, lang)}
        onClose={()=>setReceiptWin(null)}
      />
    );
  })() : null;

  const ledgerWindow = ledgerWin && kind==="sales" ? (
    <PartyLedgerWindow lang={lang} mode="customer" cur={t.cur||"AED"} shopName={shop?.companyName||""}
      partyCodes={Object.fromEntries((customers||[]).filter(c=>c.customerCode).map(c=>[c.id, c.customerCode]))}
      invoices={invoices.map(inv=>({ id:inv.id, no:inv.invoiceNo, date:String(inv.invoiceDate||"").slice(0,10), partyId:inv.customerId||null, partyName:inv.customerName||"", partyMobile:inv.customerMobile||"", total:inv.grandTotal, paid:inv.amountPaid, status:inv.status, ref:inv.deliveryNoteNo||"", method:inv.paymentMethod, raw:inv }))}
      vouchers={(isOwner ? receipts : (()=>{
        const visible = new Set(invoices.map(inv=>inv.id));
        return receipts.map(r=>{
          const allocations = (r.allocations||[]).filter(a=>visible.has(a.invoiceId));
          return allocations.length ? { ...r, allocations, totalAmount:allocations.reduce((s,a)=>s+siN2(a.amount),0) } : null;
        }).filter(Boolean);
      })()).map(r=>({ id:r.id, no:r.receiptNo, date:String(r.receiptDate||"").slice(0,10), partyId:r.customerId||null, partyName:r.customerName||"", partyMobile:r.customerMobile||"", method:r.method, amount:r.totalAmount, status:r.status, allocations:r.allocations||[], raw:r }))
        .concat(returnsAsLedgerVouchers(isOwner ? billReturns : billReturns.filter(r=>invoices.some(inv=>inv.id===r.invoiceId)), "sales"))}
      onOpenInvoice={(inv)=>{ setLedgerWin(false); setSelInv(inv); setSiView("detail"); }}
      onOpenVoucher={(r)=>{ if (r?.raw?.__return) return; setLedgerWin(false); setReceiptWin({ viewId:r.id }); }}
      onNewVoucher={(p)=>{ setLedgerWin(false); setReceiptWin({ partyId:p.id||null, partyName:p.name }); }}
      onClose={()=>setLedgerWin(false)} />
  ) : null;

  const siCancel = async (inv) => {
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — কাস্টমার মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Customer Master.", "err"); return; }
    const activeReceipts = receipts.filter(r => r.status !== "cancelled" && (r.allocations||[]).some(a => a.invoiceId === inv.id));
    if (activeReceipts.length) {
      const nos = activeReceipts.map(r => r.receiptNo).join(", ");
      toast(lang==="bn" ? `আগে রিসিট বাতিল করুন: ${nos}` : `Cancel the receipt(s) first: ${nos}`, "err");
      return false;
    }
    const activeReturns = billReturns.filter(r => r.status !== "cancelled" && r.invoiceId === inv.id);
    if (activeReturns.length) {
      const nos = activeReturns.map(r => r.returnNo).join(", ");
      toast(lang==="bn" ? `আগে সেলস রিটার্ন বাতিল করুন: ${nos}` : `Cancel the sales return(s) first: ${nos}`, "err");
      return false;
    }
    if (!window.confirm(t.si_confirmCancel)) return false;
    try {
      const nowIso = new Date().toISOString();
      const result = await offlineUpdate(COL, inv.id, {
        ...inv,
        status:"cancelled",
        updatedAt:nowIso,
        updatedBy:user?.uid || "",
      });

      const updated = { ...result.data, id: inv.id };
      setInvoices(prev => prev.map(x => x.id === inv.id ? updated : x));
      setSelInv(updated);

      if (inv.deliveryNoteId) {
        // The goods are still out with the delivery note; it just becomes open for invoicing again.
        try {
          const res = await offlineList("deliveryNotes");
          const records = Array.isArray(res) ? res : (res.records || []);
          const rec = records.find(r => (r.data?.id || r.document_id || r.id) === inv.deliveryNoteId);
          const dn = rec ? { ...(rec.data || rec), id: inv.deliveryNoteId } : null;
          if (dn && dn.status==="invoiced") {
            await offlineUpdate("deliveryNotes", dn.id, { ...dn, status:"confirmed", convertedInvoiceId:"", convertedInvoiceNo:"", updatedAt:nowIso, updatedBy:user?.uid || "" });
          }
        } catch (err) {
          console.warn("[S4 SI] reopen delivery note failed", err);
        }
      }

      if (inv.quotationId) {
        try {
          const res = await offlineList("quotations");
          const records = Array.isArray(res) ? res : (res.records || []);
          const rec = records.find(r => (r.data?.id || r.document_id || r.id) === inv.quotationId);
          const qt = rec ? { ...(rec.data || rec), id: inv.quotationId } : null;
          if (qt && qt.status==="converted") {
            await offlineUpdate("quotations", qt.id, { ...qt, status:"open", convertedInvoiceId:"", convertedInvoiceNo:"", updatedAt:nowIso, updatedBy:user?.uid || "" });
          }
        } catch (err) {
          console.warn("[S4 SI] reopen quotation failed", err);
        }
      }

      if (!isQuote && !inv.deliveryNoteId) await applyInvoiceStockEffect({
        oldInvoice: inv,
        newInvoice: updated,
        invoiceId: inv.id,
        applyType: "sale",
        reverseType: "return",
        referenceType: isDN ? "delivery_note" : "sales_invoice",
        unitCostKey: "unitPrice",
        shopId,
        actor: { uid: user?.uid, personName: profile?.personName },
      });

      toast(t.si_cancelledMsg,"err");
      logAudit({ shopId, user, profile, action:"cancel", collection:COL, docId:inv.id, docNo:inv.invoiceNo, amount:inv.grandTotal, note:inv.customerName });

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales invoice cancel sync failed", err));
      }
      return true;
    } catch(e){ toast(e.message,"err"); return false; }
  };

  const siDelete = async (inv) => {
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — কাস্টমার মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Customer Master.", "err"); return; }
    if (!window.confirm(t.si_confirmDelete)) return;
    try {
      await offlineRemove(COL, inv.id);

      setInvoices(prev => prev.filter(x => x.id !== inv.id));
      setSiView("list");
      setSelInv(null);
      toast(t.si_deleted,"err");
      logAudit({ shopId, user, profile, action:"delete", collection:COL, docId:inv.id, docNo:inv.invoiceNo, amount:inv.grandTotal, note:inv.customerName });

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales invoice delete sync failed", err));
      }
    } catch(e){ toast(e.message,"err"); }
  };

  const siFiltered=invoices.filter(inv=>{
    const matchSt=siStatusF==="ALL"||inv.status===siStatusF;
    const q=siSearch.trim();
    if (!q) return matchSt;
    const hay=[inv.invoiceNo,inv.customerName,inv.createdByName,...(inv.items||[]).map(it=>it.name+" "+it.code)].filter(Boolean).join(" ");
    return matchSt&&nsmatch(hay,q);
  });
  const siKPIs=invoices.reduce((a,inv)=>{ a.total++; if (inv.status!=="cancelled"&&inv.status!=="draft") { if (!isOpeningBill(inv)) a.amount+=inv.grandTotal||0; a.paid+=inv.amountPaid||0; a.due+=inv.balanceDue||0; } if (inv.status==="open") a.open++; if (inv.status==="converted") a.converted++; if (inv.status==="confirmed") a.delivered++; if (inv.status==="invoiced") a.invoiced++; return a; },{total:0,amount:0,paid:0,due:0,open:0,converted:0,delivered:0,invoiced:0});
  const kpiCards = isDN
    ? [{l:lang==="bn"?"মোট ডেলিভারি নোট":"Delivery Notes",v:siKPIs.total,c:"#a1a1aa",pre:""},{l:lang==="bn"?"মোট মূল্য":"Total Value",v:siFmt2(siKPIs.amount),c:"#a855f7",pre:t.cur+" "},{l:lang==="bn"?"ইনভয়েস বাকি":"Not Invoiced",v:siKPIs.delivered,c:"#06b6d4",pre:""},{l:DN_STATUSES.invoiced[lang],v:siKPIs.invoiced,c:"#22c55e",pre:""}]
    : isQuote
    ? [{l:lang==="bn"?"মোট কোটেশন":"Quotations",v:siKPIs.total,c:"#a1a1aa",pre:""},{l:lang==="bn"?"মোট মূল্য":"Total Value",v:siFmt2(siKPIs.amount),c:"#f59e0b",pre:t.cur+" "},{l:QT_STATUSES.open[lang],v:siKPIs.open,c:"#06b6d4",pre:""},{l:QT_STATUSES.converted[lang],v:siKPIs.converted,c:"#22c55e",pre:""}]
    : [{l:t.si_totalInvoices,v:siKPIs.total,c:"#a1a1aa",pre:""},{l:t.si_totalSales,v:siFmt2(siKPIs.amount),c:"#22c55e",pre:t.cur+" "},{l:t.si_totalPaid,v:siFmt2(siKPIs.paid),c:"#06b6d4",pre:t.cur+" "},{l:t.si_totalDue,v:siFmt2(siKPIs.due),c:siKPIs.due>0?"#ef4444":"#22c55e",pre:t.cur+" "}];

  const formIsDelivery = isDN || (kind==="sales" && siForm.invoiceType==="delivery");
  const mobileTypeOptions = (isDN||isQuote) ? [] : [
    ...(siForm.invoiceType==="regular" ? [["regular","🧾",t.si_regular,t.si_regularDesc,"#22c55e"]] : []),
    ["tax","🏛️",t.si_tax,t.si_taxDesc,"#1d4ed8"],
    ...((kind==="sales"&&siForm.invoiceType==="delivery") ? [["delivery","🚚",t.si_delivery,t.si_deliveryDesc,"#a855f7"]] : []),
  ];
  const formIsTax      = siForm.invoiceType==="tax";
  const formIsCash     = siForm.paymentMethod==="cash";
  const totals=formIsDelivery ? siCalcTotals(siDeliveryLines(siLines), false) : siCalcTotals(siLines, formIsTax, siInvoiceExtras(siForm));
  // cash: auto fully paid, delivery: 0
  const formPaid = formIsDelivery || isQuote ? 0 : formIsCash ? totals.grand : siN2(siForm.amountPaid);
  const balance  = Math.max(0, totals.grand - formPaid);

  // ══ LIST ══
  const bnL = lang==="bn";
  const siAccent = isQuote ? "#b45309" : isDN ? "#7e22ce" : "#15803d";
  const siLightC = { "#a1a1aa":"#07101c", "#22c55e":"#15803d", "#06b6d4":"#0e7490", "#ef4444":"#b91c1c", "#a855f7":"#7e22ce", "#f59e0b":"#b45309" };
  const siBadge = (st) => <span className="si-badge" style={{ color:SI_STATUS_COLOR[st]||"#475569" }}>{STATUSES[st]?.[lang]||st}</span>;
  const siExpiredBadge = (inv) => isQuote && qtIsExpired(inv) ? <span className="si-badge" style={{ color:"#b91c1c", marginRight:3 }}>{bnL?"মেয়াদ শেষ":"Expired"}</span> : null;
  const siRowDue = (inv) => (isQuote || isDN || ["cancelled","draft"].includes(inv.status)) ? 0 : Math.max(0, siN2(inv.grandTotal) - siN2(inv.amountPaid));
  const siMatchedLines = (inv) => {
    const q = siSearch.trim();
    if (!q) return [];
    return (inv.items||[]).filter(it=>nsmatch([it.name,it.code,it.brand].filter(Boolean).join(" "), q)).slice(0,3).map((it)=>{
      const { disc, gross } = siCalcLine(it, false);
      const qty = siN2(it.qty);
      return { it, net: qty>0 ? (gross - disc)/qty : siN2(it.unitPrice) };
    });
  };
  const siOpenInvoice = (inv) => { if (!siLeaveMinOk()) return; setSelInv(inv); setSiView("detail"); };
  const siDocTitle = isQuote ? (bnL?"কোটেশন":"QUOTATION") : isDN ? (bnL?"ডেলিভারি নোট":"DELIVERY NOTE") : (bnL?"সেলস ইনভয়েস":"SALES INVOICE");
  const siRootStyle = siFitH && !siMobile ? { height:siFitH } : undefined;

  if (siView==="list" || (siView==="form" && siWin.min && wideDesktop)) {
    const groups = groupInvoicesByParty(siFiltered, { idField:"customerId", nameField:"customerName" });
    const openGroup = siGroupMode==="folders" && siOpenParty ? (groups.find(g=>g.key===siOpenParty) || null) : null;
    const rows = openGroup ? openGroup.invoices : siFiltered;
    const cashName = bnL ? "ক্যাশ (নাম ছাড়া)" : "Cash (no name)";
    const groupName = (g) => g.isCash ? cashName : g.name;
    const rowsSum = rows.reduce((a,inv)=>{
      if (!["cancelled","draft"].includes(inv.status)) { a.total += siN2(inv.grandTotal); a.due += siRowDue(inv); }
      if (inv.status==="draft") a.drafts += 1;
      return a;
    }, { total:0, due:0, drafts:0 });
    const showParties = siGroupMode==="folders" && (!siMobile || !openGroup);
    const showInvoices = siGroupMode==="all" || !siMobile || !!openGroup;
    const newLabel = isQuote ? (bnL?"+ নতুন কোটেশন":"+ New Quotation") : isDN ? (bnL?"+ নতুন ডেলিভারি নোট":"+ New Delivery Note") : (bnL?"+ নতুন ইনভয়েস":"+ New Invoice");
    const emptyText = isQuote ? (bnL?"এখনো কোনো কোটেশন নেই":"No quotations yet") : isDN ? (bnL?"এখনো কোনো ডেলিভারি নোট নেই":"No delivery notes yet") : t.si_noInvoices;
    const matchBlock = (inv) => siMatchedLines(inv).map(({ it, net }, i)=>(
      <div key={i} className="si-match">📦 {it.name}{it.code?` · ${it.code}`:""} — {it.qty} {it.unit} × {siFmt2(net)}</div>
    ));
    return (
      <div ref={siRootRef} className="si-root" style={siRootStyle}>
        <style>{PM_CSS}</style>
        <style>{SI_CSS}</style>
        {siView==="form"&&siWin.min&&(
          <MinimizedChip lang={lang} onRestore={siWin.restore}
            title={`${isQuote?"QUOTATION":isDN?"DELIVERY NOTE":"SALES INVOICE"} ${siInvoiceNo||""}`}
            onClose={()=>{ if (siLeaveUnsavedOk()) setSiView("list"); }} />
        )}
        {showCustPicker&&<SiCustomerPicker {...customerPickerProps} />}
        {siPrintModal&&(
          <div className="pm-backdrop" style={{ zIndex:10000, alignItems:"center" }}>
            <div className="pm-window" style={{ maxWidth:380 }} role="dialog" aria-modal="true">
              <div className="pm-window-title">
                <span>✅ {isQuote ? (bnL?"কোটেশন সেভ হয়েছে":"Quotation saved") : isDN ? (bnL?"ডেলিভারি নোট সেভ হয়েছে":"Delivery note saved") : (bnL?"ইনভয়েস সেভ হয়েছে":"Invoice saved")}</span>
                <button type="button" className="pm-window-close" onClick={()=>setSiPrintModal(null)}>✕</button>
              </div>
              <div className="pm-window-body">
                <div className="si-total-row"><span>{t.si_invoiceNo}</span><b>{siPrintModal.invoiceNo}</b></div>
                <div className="si-total-row"><span>{t.si_customer}</span><b>{siPrintModal.customerName||"—"}</b></div>
                <div className="si-total-row is-grand"><span>{t.si_grandTotal}</span><b>{t.cur} {siFmt2(siPrintModal.grandTotal)}</b></div>
                <div className="pm-window-foot">
                  <button type="button" className="pm-btn-secondary" onClick={()=>setSiPrintModal(null)}>{bnL?"পরে প্রিন্ট করব":"Print later"}</button>
                  <button type="button" className="pm-btn pm-btn--primary" autoFocus onClick={()=>{ siPrint(siPrintModal); setSiPrintModal(null); }}>🖨️ {bnL?"এখনই প্রিন্ট":"Print now"}</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {receiptWindow}
        {ledgerWindow}

        <div className="pm-reference-title">
          <strong style={{ color:siAccent }}>{siDocTitle}</strong>
          <span>
            {invoices.length} {bnL?"টি":"total"}
            {!isOwner ? ` · ${bnL?"শুধু আমার":"Mine only"}` : ""}
          </span>
        </div>

        <div className="si-toolbar">
          <button type="button" className="pm-btn pm-btn--primary" onClick={()=>{ if (siLeaveMinOk()) siOpenNew(); }} disabled={siSaving}>
            {newLabel}{kind==="sales"&&!siMobile?" (F4)":""}
          </button>
          {kind==="sales"&&canCustBalance&&<button type="button" className="pm-btn-secondary" onClick={()=>setLedgerWin(true)}>📒 {bnL?"কাস্টমার লেজার":"Customer Ledger"}</button>}
          {kind==="sales"&&<button type="button" className="pm-btn-secondary" onClick={()=>setReceiptWin({})}>💰 {bnL?"রিসিট (টাকা গ্রহণ)":"Receipts"}</button>}
        </div>

        {invoices.length>0&&(
          <div className="si-kpis">
            {kpiCards.map((k,i)=>(
              <div key={i} className="si-kpi"><span>{k.l}</span><b style={{ color:siLightC[k.c]||k.c }}>{k.pre}{k.v}</b></div>
            ))}
          </div>
        )}

        <div className="si-filters">
          <div className="si-search">
            <input className="pm-input" placeholder={t.si_searchPh} value={siSearch} onChange={e=>setSiSearch(e.target.value)} />
            {siSearch&&<button type="button" aria-label="Clear" onClick={()=>setSiSearch("")}>✕</button>}
          </div>
          <div className="si-pills">
            {["ALL",...Object.keys(STATUSES)].map(st=>(
              <button key={st} type="button" className={`pm-btn-secondary${siStatusF===st?" is-active":""}`} onClick={()=>setSiStatusF(st)}>
                {st==="ALL"?t.si_allStatus:STATUSES[st]?.[lang]}
              </button>
            ))}
          </div>
          <div className="si-pills">
            {[["folders", bnL?"📁 নাম অনুযায়ী":"📁 By name"], ["all", bnL?"📋 সব":"📋 All"]].map(([m,label])=>(
              <button key={m} type="button" className={`pm-btn-secondary${siGroupMode===m?" is-active":""}`} onClick={()=>{ setSiGroupMode(m); setSiOpenParty(null); }}>{label}</button>
            ))}
          </div>
        </div>

        <div className={`si-main${siGroupMode==="all" || siMobile ? " is-all" : ""}`}>
          {showParties&&(
            <div className="si-box">
              <table className="pm-table">
                <colgroup><col /><col style={{ width:siMobile?96:76 }} /><col style={{ width:siMobile?84:68 }} /></colgroup>
                <thead><tr><th>{t.si_customer}</th><th className="si-num">{bnL?"মোট":"Total"}</th><th className="si-num">{bnL?"বাকি":"Due"}</th></tr></thead>
                <tbody>
                  {!siMobile&&groups.length>0&&(
                    <tr className={`pm-clickable${!openGroup?" pm-selected":""}`} onClick={()=>setSiOpenParty(null)}>
                      <td className="si-strong">{bnL?"সব কাস্টমার":"All customers"} ({siFiltered.length})</td><td /><td />
                    </tr>
                  )}
                  {groups.map(g=>(
                    <tr key={g.key} className={`pm-clickable si-party-row${openGroup?.key===g.key?" pm-selected":""}`} onClick={()=>setSiOpenParty(g.key)}>
                      <td className="si-wrap">
                        {g.isCash?"💵 ":""}{groupName(g)}
                        <div className="si-muted" style={{ fontWeight:400, fontSize:"0.9em" }}>
                          {g.invoices.length} {bnL?"টি":(g.invoices.length===1?"doc":"docs")}{g.lastDate?` · ${g.lastDate}`:""}
                        </div>
                      </td>
                      <td className="si-num">{siFmt2(g.total)}</td>
                      <td className={`si-num${g.due>0.01?" si-due":""}`}>{g.due>0.01?siFmt2(g.due):"-"}</td>
                    </tr>
                  ))}
                  {groups.length===0&&<tr><td colSpan={3} className="si-empty">{siLoading?"⏳":invoices.length===0?emptyText:t.si_noResults}</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {showInvoices&&(
            <div className="si-box">
              {siMobile&&openGroup&&(
                <button type="button" className="pm-btn-secondary" style={{ width:"100%", minHeight:36, marginBottom:3 }} onClick={()=>setSiOpenParty(null)}>
                  ← {bnL?"সব কাস্টমার":"All customers"} · {groupName(openGroup)}
                </button>
              )}
              {siLoading ? <div className="si-empty">⏳</div>
                : invoices.length===0 ? <div className="si-empty">{emptyText}</div>
                : rows.length===0 ? <div className="si-empty">🔍 {t.si_noResults}</div>
                : siMobile ? rows.map(inv=>{
                  const due = siRowDue(inv);
                  return (
                    <button key={inv.id} type="button" className="si-mrow" onClick={()=>siOpenInvoice(inv)}>
                      <div className="si-mrow-top">
                        <span style={{ color:siAccent }}>{inv.invoiceNo}</span>
                        <span>{siExpiredBadge(inv)}{siBadge(inv.status)}</span>
                      </div>
                      <div className="si-mrow-sub"><span>{inv.customerName||"—"}</span><b>{t.cur} {siFmt2(inv.grandTotal)}</b></div>
                      <div className="si-mrow-sub">
                        <span>{inv.invoiceDate}{inv.createdByName?` · ${inv.createdByName}`:""}</span>
                        {due>0.01 ? <span className="si-due">{bnL?"বাকি":"Due"} {siFmt2(due)}</span>
                          : (isQuote||isDN)&&inv.convertedInvoiceNo ? <span style={{ color:"#15803d" }}>→ {inv.convertedInvoiceNo}</span> : null}
                      </div>
                      {matchBlock(inv)}
                    </button>
                  );
                })
                : (
                  <table className="pm-table">
                    <colgroup>
                      <col style={{ width:96 }} /><col style={{ width:78 }} /><col /><col style={{ width:84 }} />
                      {(isQuote||isDN) ? <col style={{ width:110 }} /> : <><col style={{ width:42 }} /><col style={{ width:84 }} /><col style={{ width:84 }} /></>}
                      <col style={{ width:88 }} /><col style={{ width:100 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>{t.si_invoiceNo}</th><th>{t.si_date}</th><th>{t.si_customer}</th><th>{bnL?"স্ট্যাটাস":"Status"}</th>
                        {(isQuote||isDN) ? <th>{isQuote?(bnL?"মেয়াদ / ইনভয়েস":"Valid / Invoice"):(bnL?"ইনভয়েস":"Invoice")}</th>
                          : <><th className="si-num">{bnL?"আইটেম":"Items"}</th><th className="si-num">{bnL?"মোট":"Total"}</th><th className="si-num">{bnL?"পরিশোধ":"Paid"}</th></>}
                        <th className="si-num">{(isQuote||isDN)?(bnL?"মোট":"Total"):(bnL?"বাকি":"Due")}</th>
                        <th>{t.si_createdBy}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(inv=>{
                        const due = siRowDue(inv);
                        const matches = matchBlock(inv);
                        return (
                          <tr key={inv.id} className="pm-clickable" onClick={()=>siOpenInvoice(inv)} title={inv.note||""}>
                            <td className="si-strong" style={{ color:siAccent }}>{inv.invoiceNo}</td>
                            <td>{inv.invoiceDate}</td>
                            <td className={matches.length?"si-wrap":""} title={inv.customerName||""}>{inv.customerName||"—"}{matches}</td>
                            <td>{siExpiredBadge(inv)}{siBadge(inv.status)}</td>
                            {(isQuote||isDN) ? (
                              <td>{inv.convertedInvoiceNo ? <span style={{ color:"#15803d" }}>→ {inv.convertedInvoiceNo}</span> : (isQuote ? (inv.validUntil||"-") : "-")}</td>
                            ) : (
                              <>
                                <td className="si-num">{inv.items?.length||0}</td>
                                <td className="si-num si-strong">{siFmt2(inv.grandTotal)}</td>
                                <td className="si-num">{siN2(inv.amountPaid)>0?siFmt2(inv.amountPaid):"-"}</td>
                              </>
                            )}
                            <td className={`si-num${(isQuote||isDN)?" si-strong":due>0.01?" si-due":""}`}>
                              {(isQuote||isDN) ? siFmt2(inv.grandTotal) : due>0.01 ? siFmt2(due) : "-"}
                            </td>
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
          <span>{bnL?"মোট":"Total"}: <b>{t.cur} {siFmt2(rowsSum.total)}</b></span>
          {!isQuote&&!isDN&&<span>{bnL?"বাকি":"Due"}: <b style={{ color:rowsSum.due>0.01?"#b91c1c":undefined }}>{t.cur} {siFmt2(rowsSum.due)}</b></span>}
          {rowsSum.drafts>0&&<span style={{ color:"#b45309" }}>{bnL?`${rowsSum.drafts}টি ড্রাফট মোটে ধরা হয়নি`:`${rowsSum.drafts} draft(s) not counted in totals`}</span>}
        </div>
      </div>
    );
  }

  // ══ DETAIL ══
  if (siView==="detail"&&selInv) {
    const inv=invoices.find(x=>x.id===selInv.id)||selInv;
    const isTax       = inv.invoiceType==="tax";
    const isInvCash   = inv.paymentMethod==="cash";
    const isInvDelivery = inv.invoiceType==="delivery";
    const { sub, disc, vat, grand, adjustment, roundOff } = siCalcTotals(inv.items||[], isTax&&!isInvDelivery, siInvoiceExtras(inv));
    const bal=grand-siN2(inv.amountPaid);
    const canEdit=siCanEditDoc(inv);
    // cash invoice is always fully paid → no mark paid button
    const canPay=!isQuote&&!isInvCash&&["confirmed","partial"].includes(inv.status);
    const canConvert=!!onConvertQuote&&((isQuote&&["draft","open"].includes(inv.status))||(isDN&&inv.status==="confirmed"));
    const related = kind==="sales" ? receipts.filter(r=>(r.allocations||[]).some(a=>a.invoiceId===inv.id)) : [];
    const paidOnBill = kind!=="sales" || ["draft","cancelled"].includes(inv.status) ? 0 : siR2(siN2(inv.amountPaid)
      - related.filter(r=>r.status!=="cancelled").reduce((s,r)=>s+siN2((r.allocations||[]).find(a=>a.invoiceId===inv.id)?.amount),0)
      - billReturns.filter(r=>r.status!=="cancelled"&&r.invoiceId===inv.id).reduce((s,r)=>s+siN2(r.appliedToInvoice),0));
    const typeLabel = { regular:t.si_regular, tax:t.si_tax, delivery:t.si_delivery }[inv.invoiceType] || inv.invoiceType || "-";
    const vRow = (label, value, opts={}) => (
      <div className="pm-form-row">
        <label className="pm-label">{label}</label>
        <div className={`si-val${opts.strong?" is-strong":""}`} style={opts.color?{ color:opts.color }:undefined}>{value}</div>
      </div>
    );
    const totalRows = [
      [t.si_subtotal, siFmt2(sub)],
      ...(disc>0?[[t.si_totalDiscount, `- ${siFmt2(disc)}`, "#b91c1c"]]:[]),
      ...(vat>0?[["VAT", `+ ${siFmt2(vat)}`, "#0e7490"]]:[]),
      ...(adjustment?[[bnL?"সমন্বয়":"Adjustment", `${adjustment>0?"+":"-"} ${siFmt2(Math.abs(adjustment))}`]]:[]),
      ...(roundOff?[["Round Off", `${roundOff>0?"+":"-"} ${siFmt2(Math.abs(roundOff))}`]]:[]),
    ];
    const back = ()=>{ setSiView("list"); setSelInv(null); };
    return (
      <div ref={siRootRef} className="si-root" style={siRootStyle}>
        <style>{PM_CSS}</style>
        <style>{SI_CSS}</style>
        {receiptWindow}

        <div className="pm-reference-title">
          <strong style={{ color:siAccent }}>{siDocTitle} — {inv.invoiceNo}</strong>
          <span>{siExpiredBadge(inv)}{siBadge(inv.status)}</span>
        </div>

        <div className="si-body">
          <div className="si-cols">
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{bnL?"ডকুমেন্ট":"Document"}</legend>
              <div className="si-panel-body">
                {vRow(t.si_invoiceNo, inv.invoiceNo, { strong:true, color:siAccent })}
                {vRow(t.si_date, inv.invoiceDate||"-")}
                {!isQuote&&!isDN&&vRow(t.si_invoiceType, typeLabel)}
                {isQuote&&vRow(bnL?"মেয়াদ":"Valid until", `${inv.validUntil||"—"}${qtIsExpired(inv)?(bnL?" (মেয়াদ শেষ)":" (Expired)"):""}`, { color:qtIsExpired(inv)?"#b91c1c":undefined })}
                {!isQuote&&inv.deliveryNoteId&&vRow(bnL?"ডেলিভারি নোট":"Delivery Note", inv.deliveryNoteNo, { color:"#7e22ce" })}
                {!isQuote&&!inv.deliveryNoteId&&(inv.deliveryNoteNo||inv.vehicleNo)&&vRow(t.si_deliverySection, [inv.deliveryNoteNo, inv.vehicleNo].filter(Boolean).join(" · "))}
                {(isQuote||isDN)&&inv.convertedInvoiceNo&&vRow(bnL?"ইনভয়েস":"Invoice", inv.convertedInvoiceNo, { strong:true, color:"#15803d" })}
                {!isQuote&&inv.quotationNo&&vRow(bnL?"কোটেশন":"Quotation", inv.quotationNo, { color:"#b45309" })}
                {inv.salesmanName&&vRow(bnL?"সেলসম্যান":"Salesman", inv.salesmanName)}
                {vRow(t.si_createdBy, inv.createdByName||"-")}
              </div>
            </fieldset>
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{t.si_customer}</legend>
              <div className="si-panel-body">
                {vRow(bnL?"নাম":"Name", inv.customerName||"—", { strong:true })}
                {(()=>{ const code = inv.customerCode || (customers||[]).find(c=>c.id===inv.customerId)?.customerCode; return code ? vRow(bnL?"কোড":"Code", code) : null; })()}
                {vRow(bnL?"মোবাইল":"Mobile", inv.customerMobile||"-")}
                {vRow(bnL?"ঠিকানা":"Address", inv.customerAddress||"-")}
                {(isTax||inv.customerTrn)&&vRow("TRN", inv.customerTrn||"-")}
                {!isQuote&&!isDN&&siN2(inv.creditDays)>0&&vRow(bnL?"বাকির দিন":"Credit Days", inv.creditDays)}
                {inv.note&&<div className="si-note">📝 {inv.note}</div>}
              </div>
            </fieldset>
          </div>

          <fieldset className="pm-panel">
            <legend className="pm-panel-legend">📦 {t.si_items} ({inv.items?.length||0})</legend>
            <div className="si-panel-body">
              <SiItemsTable items={inv.items||[]} lang={lang} isTax={isTax&&!isInvDelivery} showDisc={!isInvDelivery} />
            </div>
          </fieldset>

          <div className="si-cols">
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{t.si_summary}</legend>
              <div className="si-panel-body">
                {totalRows.map(([l,v,c],i)=>(
                  <div key={i} className="si-total-row"><span>{l}</span><b style={c?{ color:c }:undefined}>{t.cur} {v}</b></div>
                ))}
                <div className="si-total-row is-grand"><span>{t.si_grandTotal}</span><span style={{ color:siAccent }}>{t.cur} {siFmt2(grand)}</span></div>
              </div>
            </fieldset>
            {!isQuote&&!isDN&&(
              <fieldset className="pm-panel">
                <legend className="pm-panel-legend">💳 {t.si_payment}</legend>
                <div className="si-panel-body">
                  <div className="si-total-row"><span>{t.si_paymentMethod}</span><b>{SI_PAY[inv.paymentMethod]?.icon} {SI_PAY[inv.paymentMethod]?.[lang]||"-"}</b></div>
                  {isInvCash ? (
                    <div className="si-paid-box"><span>✅ {bnL?"নগদে সম্পূর্ণ পরিশোধিত":"Fully paid (cash)"}</span><span>{t.cur} {siFmt2(inv.amountPaid||grand)}</span></div>
                  ) : !isInvDelivery && (
                    <>
                      <div className="si-total-row"><span>{t.si_amountPaid}</span><b style={{ color:"#15803d" }}>{t.cur} {siFmt2(inv.amountPaid)}</b></div>
                      <div className={`si-paid-box${bal>0.01?" is-due":""}`}><span>{t.si_balanceDue}</span><span>{t.cur} {siFmt2(Math.max(0,bal))}</span></div>
                    </>
                  )}
                  {related.length>0&&(
                    <div className="pm-table-wrap" style={{ marginTop:3 }}>
                      <table className="pm-table">
                        <colgroup><col /><col style={{ width:80 }} /><col style={{ width:84 }} /></colgroup>
                        <thead><tr><th>💰 {bnL?"রিসিট":"Receipt"}</th><th>{t.si_date}</th><th className="si-num">{bnL?"টাকা":"Amount"}</th></tr></thead>
                        <tbody>
                          {related.map(r=>{
                            const amt=(r.allocations||[]).find(a=>a.invoiceId===inv.id)?.amount||0;
                            const off=r.status==="cancelled";
                            return (
                              <tr key={r.id} className="pm-clickable" style={off?{ opacity:0.55 }:undefined} onClick={()=>setReceiptWin({ viewId:r.id })}>
                                <td>{r.receiptNo} {PI_VOUCHER_METHODS[r.method]?.icon||"💵"}{off?(bnL?" (বাতিল)":" (cancelled)"):""}</td>
                                <td>{r.receiptDate}</td>
                                <td className="si-num si-strong" style={off?{ textDecoration:"line-through" }:{ color:"#15803d" }}>{siFmt2(amt)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </fieldset>
            )}
          </div>
        </div>

        <div className="si-actions">
          <button type="button" className="pm-btn-secondary" onClick={back}>← {bnL?"তালিকা":"List"}</button>
          <button type="button" className="pm-btn pm-btn--primary" onClick={()=>siPrint(inv)}>🖨️ {bnL?"প্রিন্ট":"Print"}</button>
          {paidOnBill>0.01&&<button type="button" className="pm-btn" onClick={()=>printMoneyReceipt(inv, paidOnBill, shop, lang)} title={bnL?"বিলের সাথে নেওয়া টাকার রশিদ":"Receipt for the money taken with this bill"}>🧾 {bnL?"মানি রিসিট":"Money Receipt"}</button>}
          {canConvert&&<button type="button" className="pm-btn" onClick={()=>onConvertQuote(inv)}>🧾 {bnL?"ইনভয়েসে রূপান্তর":"Convert to Invoice"}</button>}
          {canEdit&&<button type="button" className="pm-btn" onClick={()=>siOpenEdit(inv)}>✏️ {bnL?"এডিট":"Edit"}</button>}
          {canPay&&kind==="sales"&&<button type="button" className="pm-btn" onClick={()=>setReceiptWin({ partyId:inv.customerId||null, partyName:inv.customerName||"", invoiceId:inv.id })}>💰 {bnL?"টাকা গ্রহণ":"Receive Payment"}</button>}
          {canCancelInv&&["confirmed","partial","paid","draft","open"].includes(inv.status)&&<button type="button" className="pm-btn pm-btn--danger" onClick={()=>siCancel(inv)}>{bnL?"বাতিল":"Cancel"}</button>}
          {siCanDeleteDoc(inv)&&<button type="button" className="pm-btn pm-btn--danger" onClick={()=>siDelete(inv)}>🗑 {bnL?"মুছুন":"Delete"}</button>}
          {isOwner&&!["draft","cancelled"].includes(inv.status)&&<span className="si-hint">{bnL?"মুছতে চাইলে আগে বাতিল করুন (স্টক ঠিক থাকবে)":"To delete, cancel first (keeps stock correct)"}</span>}
          {!canEdit&&!isOwner&&["confirmed","paid","partial"].includes(inv.status)&&related.some(r=>r.status!=="cancelled")&&(
            <span className="si-hint">{bnL?"টাকা নেওয়া হয়েছে — এডিট করতে আগে রিসিট বাতিল করুন":"Payment received — cancel the receipt first to edit"}</span>
          )}
        </div>
      </div>
    );
  }

  // ══ FORM ══
  if (wideDesktop) return (
    <div style={{ position:"fixed", inset:siWin.max?0:"28px 40px", zIndex:1500, background:"#c7d8ee", padding:siWin.max?6:"0 6px 6px", boxSizing:"border-box", overflowX:"auto", overflowY:"hidden", display:"flex", flexDirection:"column", border:siWin.max?"none":"1px solid #2854ad", boxShadow:siWin.max?"none":"0 18px 50px rgba(2,6,23,0.45)" }}>
      <div onDoubleClick={siWin.toggleMax} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, margin:siWin.max?"-6px -6px 6px":"0 -6px 6px", padding:"4px 6px 4px 12px", background:"linear-gradient(180deg,#3f69bd,#2854ad)", color:"#fff", fontSize:13, fontWeight:800, userSelect:"none", flexShrink:0, fontFamily:"Segoe UI, Tahoma, sans-serif" }}>
        <span>{isQuote?"QUOTATION":isDN?"DELIVERY NOTE":"SALES INVOICE"}{siInvoiceNo?` — ${siInvoiceNo}`:""}</span>
        <WindowButtons win={siWin} lang={lang} onClose={()=>{ if (siLeaveUnsavedOk()) setSiView("list"); }} />
      </div>
      {showCustPicker&&(
        <PartyPickerWindow title="Select Customer" columns={CUSTOMER_PICKER_COLS} items={siPickCustomers} lang={lang}
          partyWord="customer" modalId="customer-picker"
          onPick={(c)=>{ siSelectCustomer(c); setTimeout(()=>siNameRef.current?.focus(), 60); }}
          onClose={()=>{ setShowCustPicker(false); setTimeout(()=>siNameRef.current?.focus(), 30); }}
          onQuickAdd={canManageCustomers ? siQuickAddCustomer : null} />
      )}
      <SalesInvoiceDesktopForm
        lang={lang} t={t} shopId={shopId} products={products} customers={siPickCustomers} onSelectCustomer={siSelectCustomer} team={team} invoices={invoices}
        form={siForm} setField={siUpd} lines={siLines} setLines={setSiLines} current={siCurrent} setCurrent={setSiCurrent}
        totals={totals} formPaid={formPaid} balance={balance}
        invoiceNo={siInvoiceNo} editInvId={editInvId} saving={siSaving} nameRef={siNameRef} qtyRef={siQtyRef}
        helpers={{ siCalcLine, siFmt2, siN2, siUnitOptionsFor, SI_PAY, SI_STATUSES:STATUSES, emptyCurrent:siEmptyCurrent }}
        kind={kind}
        sourceQuoteNo={sourceQuote?.invoiceNo||""}
        sourceIsDN={sourceQuote?.docKind==="delivery"}
        onConvertQuote={(isQuote||isDN)&&onConvertQuote ? (inv)=>{ if (siLeaveUnsavedOk()) onConvertQuote(inv); } : undefined}
        onSelectProduct={siSelectProduct} onChangeCurrentUnit={siChangeCurrentUnit} onAddCurrent={siAddCurrentItem} onDelLine={siDelLine}
        onOpenCustomerPicker={()=>setShowCustPicker(true)}
        onConfirm={siConfirm} onSaveDraft={siSaveDraft}
        onClose={()=>{ if (siLeaveUnsavedOk()) setSiView("list"); }}
        onNew={()=>{ if (siLeaveUnsavedOk()) siOpenNew(); }}
        onOpenInvoice={siOpenFromDesktop}
        onCancelInvoice={canCancelInv ? async (inv)=>{ if (await siCancel(inv)) setSiView("detail"); } : undefined}
        onDeleteInvoice={(inv)=>{ if (siCanDeleteDoc(inv)) siDelete(inv); }}
        canDeleteInvoice={siCanDeleteDoc}
        canDiscount={canDiscount}
        canSeeCost={canSeeCost}
        onPrintInvoice={(inv)=>siPrint(inv)}
        onOpenProductMaster={onOpenProductMaster}
        toast={toast}
      />
    </div>
  );


  const pmInputStyle = siMobile
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
  const formTitle = isQuote
    ? (editInvId?(bnL?"কোটেশন এডিট":"EDIT QUOTATION"):(bnL?"নতুন কোটেশন":"NEW QUOTATION"))
    : isDN
    ? (editInvId?(bnL?"ডেলিভারি নোট এডিট":"EDIT DELIVERY NOTE"):(bnL?"নতুন ডেলিভারি নোট":"NEW DELIVERY NOTE"))
    : (editInvId?(bnL?"ইনভয়েস এডিট":"EDIT SALES INVOICE"):(bnL?"নতুন সেলস ইনভয়েস":"NEW SALES INVOICE"));
  const selectedType = mobileTypeOptions.find(([type])=>type===siForm.invoiceType);
  const priceCols = formIsTax&&!formIsDelivery ? (canDiscount?"minmax(0,1fr) 70px 62px":"minmax(0,1fr) 62px") : (!formIsDelivery&&canDiscount ? "minmax(0,1fr) 70px" : "1fr");
  const summaryRows = [
    [t.si_subtotal, siFmt2(totals.sub)],
    ...(totals.disc>0?[[t.si_totalDiscount, `- ${siFmt2(totals.disc)}`, "#b91c1c"]]:[]),
    ...(totals.vat>0?[["VAT", `+ ${siFmt2(totals.vat)}`, "#0e7490"]]:[]),
    ...(totals.adjustment?[[bnL?"সমন্বয়":"Adjustment", `${totals.adjustment>0?"+":"-"} ${siFmt2(Math.abs(totals.adjustment))}`]]:[]),
    ...(totals.roundOff?[["Round Off", `${totals.roundOff>0?"+":"-"} ${siFmt2(Math.abs(totals.roundOff))}`]]:[]),
  ];
  const closeForm = ()=>{ if (siLeaveUnsavedOk()) setSiView("list"); };

  return (
    <div ref={siRootRef} className="si-root" style={siRootStyle}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      {showCustPicker&&<SiCustomerPicker {...customerPickerProps} />}

      <div className="pm-reference-title">
        <strong style={{ color:siAccent }}>{formTitle}{sourceQuote?` (${sourceQuote.invoiceNo})`:""}</strong>
        <span>{siInvoiceNo}</span>
      </div>

      <div className="si-body">
        {mobileTypeOptions.length>1&&fPanel(t.si_invoiceType, <>
          <select className="pm-input" value={siForm.invoiceType} onChange={e=>siUpd("invoiceType",e.target.value)}>
            {mobileTypeOptions.map(([type,icon,label])=><option key={type} value={type}>{icon} {label}</option>)}
          </select>
          {selectedType&&<div className="pm-hint">{selectedType[3]}</div>}
        </>)}

        {fPanel(`${t.si_invoiceNo} & ${t.si_date}`, <>
          {fRow(t.si_invoiceNo, <div className="si-val is-strong" style={{ color:siAccent, fontFamily:"Consolas, monospace" }}>{siInvoiceNo}</div>)}
          {fRow(t.si_date, <input type="date" className="pm-input" value={siForm.invoiceDate} onChange={e=>siUpd("invoiceDate",e.target.value)} />)}
          {isQuote&&fRow(bnL?"মেয়াদ":"Valid Until", <input type="date" className="pm-input" value={siForm.validUntil||""} onChange={e=>siUpd("validUntil",e.target.value)} />)}
        </>)}

        {fPanel(t.si_customer, <>
          <button type="button" className="pm-btn" style={{ width:"100%", minHeight:siMobile?36:24, textAlign:"left" }} onClick={()=>setShowCustPicker(true)}>
            {siForm.customerId ? `✅ ${siForm.customerName} — ${bnL?"বদলান":"change"}` : `👥 ${t.si_selectCustomer}`}
          </button>
          {fRow(bnL?"নাম":"Name", <input className="pm-input" placeholder={t.si_customerManual} value={siForm.customerName} onChange={e=>{
            siUpd("customerName",e.target.value);
            if (siForm.customerId) ["customerId","customerMobile","customerAddress","customerTrn","customerType","creditDays"].forEach(f=>siUpd(f,""));
          }} />)}
          {fRow(bnL?"মোবাইল":"Mobile", <input className="pm-input" inputMode="tel" value={siForm.customerMobile} onChange={e=>siUpd("customerMobile",e.target.value)} />)}
          {fRow(bnL?"ঠিকানা":"Address", <input className="pm-input" value={siForm.customerAddress} onChange={e=>siUpd("customerAddress",e.target.value)} />)}
          {siForm.invoiceType==="tax"&&fRow("TRN", <input className="pm-input" style={{ fontFamily:"Consolas, monospace" }} placeholder="100XXXXXXXXXXXX" value={siForm.customerTrn} onChange={e=>siUpd("customerTrn",e.target.value)} />)}
        </>)}

        {fPanel(`📦 ${t.si_items}`, <>
          <div className="si-entry">
            {fField(t.si_itemName, (
              <ProductTypeaheadInput
                products={products}
                value={siCurrent.name}
                onChange={(value)=>setSiCurrent((p)=>({ ...p, name:value, productId:null }))}
                onSelectProduct={siSelectProduct}
                field="name"
                inputRef={siNameRef}
                placeholder={t.si_itemName}
                th={PM_TH}
                lang={lang}
                onKeyDown={(e)=>e.key==="Enter"&&siAddCurrentItem()}
                style={{ ...pmInputStyle, fontWeight:700 }}
              />
            ))}
            <div className="si-grid2">
              {fField("Code / Model", (
                <ProductTypeaheadInput
                  products={products}
                  value={siCurrent.code}
                  onChange={(value)=>setSiCurrent((p)=>({ ...p, code:value }))}
                  onSelectProduct={siSelectProduct}
                  field="code"
                  placeholder="Code / Model"
                  th={PM_TH}
                  lang={lang}
                  onKeyDown={(e)=>e.key==="Enter"&&siAddCurrentItem()}
                  style={pmInputStyle}
                />
              ))}
              {fField(t.si_brand, <input className="pm-input" value={siCurrent.brand} onChange={e=>setSiCurrent(p=>({...p,brand:e.target.value}))} />)}
            </div>
            {siCurrent.productId && !isQuote && (()=>{
              const prod = siFindProduct(siCurrent.productId);
              const inBill = [...siLines.filter(it=>it.productId===siCurrent.productId && it.id!==siEditLineId), siCurrent].reduce((sum,it)=>sum+itemBaseQty(it, prod),0);
              return <StockBadge product={prod} products={products} shopId={shopId} refreshKey={invoices} lang={lang} extraQty={editInvId ? 0 : inBill} />;
            })()}
            {siCurrent.productId && (()=>{
              const spec = salesSpecs(siFindProduct(siCurrent.productId));
              return spec ? (
                <div style={{ margin:"6px 0", padding:"6px 10px", background:"#fff8db", border:"1px solid #e6c65c", borderRadius:6, fontSize:13, fontWeight:700, color:"#5b4300", lineHeight:1.5 }}>
                  📐 {spec}
                </div>
              ) : null;
            })()}
            {siCurrent.productId && (siForm.customerId || String(siForm.customerName||"").trim()) && (()=>{
              const custName = String(siForm.customerName||"").trim().toLowerCase();
              const history = invoices
                .filter(inv => inv.id!==editInvId && !["cancelled","draft"].includes(inv.status)
                  && (siForm.customerId ? inv.customerId===siForm.customerId : !inv.customerId && String(inv.customerName||"").trim().toLowerCase()===custName))
                .flatMap(inv => (inv.items||[]).filter(it=>it.productId===siCurrent.productId).map(it=>({ inv, it })))
                .sort((a,b)=>String(b.inv.invoiceDate||"").localeCompare(String(a.inv.invoiceDate||"")))
                .slice(0,3);
              if (!history.length) return <div className="pm-hint">🕘 {bnL?"এই কাস্টমারকে আগে এই পণ্য বিক্রি হয়নি":"Not sold to this customer before"}</div>;
              return (
                <div className="si-history">
                  <div className="pm-label" style={{ color:"#15803d" }}>🕘 {bnL?"এই কাস্টমারকে আগের দাম (চাপ দিলে বসবে)":"Previous price to this customer (tap to use)"}</div>
                  {history.map(({ inv, it }, i)=>{
                    const { disc, gross } = siCalcLine(it, false);
                    const qty = siN2(it.qty);
                    const net = qty>0 ? (gross - disc)/qty : siN2(it.unitPrice);
                    return (
                      <button key={i} type="button"
                        onClick={()=>setSiCurrent(p=>({ ...p, unit:it.unit||p.unit, unitPrice:String(it.unitPrice??p.unitPrice), discountPerc:String(it.discountPerc??p.discountPerc??"0") }))}>
                        <span className="si-muted">{inv.invoiceDate} · {inv.invoiceNo}</span>
                        <b style={{ color:"#15803d", whiteSpace:"nowrap" }}>{siFmt2(qty)} {it.unit||""} × {t.cur} {siFmt2(net)}</b>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            <div className="si-grid2">
              {fField(t.si_qty, <input className="pm-input" style={{ textAlign:"center" }} inputMode="decimal" placeholder="1" value={siCurrent.qty}
                ref={siQtyRef}
                onChange={e=>setSiCurrent(p=>({...p,qty:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&siAddCurrentItem()} />)}
              {fField(t.si_unit, (
                <select className="pm-input" value={siCurrent.unit} onChange={e=>siChangeCurrentUnit(e.target.value)}>
                  {siUnitOptionsFor(siFindProduct(siCurrent.productId), siCurrent.unit).map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              ))}
            </div>
            <div className="si-grid3" style={{ gridTemplateColumns:priceCols }}>
              {fField(`${t.si_unitPrice} (${t.cur})`, <input className="pm-input" style={{ fontWeight:700 }} inputMode="decimal" placeholder="0.00" value={siCurrent.unitPrice}
                onChange={e=>setSiCurrent(p=>({...p,unitPrice:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&siAddCurrentItem()} />)}
              {!formIsDelivery&&canDiscount&&fField(t.si_discPerc, <input className="pm-input" inputMode="decimal" placeholder="0" value={siCurrent.discountPerc} onChange={e=>setSiCurrent(p=>({...p,discountPerc:e.target.value}))} />)}
              {formIsTax&&!formIsDelivery&&fField("VAT%", <input className="pm-input" inputMode="decimal" placeholder="5" value={siCurrent.vatPerc} onChange={e=>setSiCurrent(p=>({...p,vatPerc:e.target.value}))} />)}
            </div>
            <div style={{ display:"flex", gap:4, alignItems:"center" }}>
              <button type="button" className="pm-btn pm-btn--primary" style={{ flex:1, minHeight:siMobile?38:24 }} onClick={siAddCurrentItem}>
                {siEditLineId ? (bnL?"✅ আপডেট করুন":"✅ Update Item") : (bnL?"✅ পণ্য যোগ করুন":"✅ Add Item")}
              </button>
              {siEditLineId&&<button type="button" className="pm-btn-secondary" style={{ minHeight:siMobile?38:24 }} onClick={()=>{ setSiEditLineId(null); setSiCurrent(siEmptyCurrent()); }}>{bnL?"বাদ":"Cancel"}</button>}
              {(siN2(siCurrent.qty)>0&&siN2(siCurrent.unitPrice)>0)&&(
                <b style={{ color:siAccent, whiteSpace:"nowrap" }}>= {t.cur} {siFmt2(siCalcLine(siCurrent, formIsTax&&!formIsDelivery).total)}</b>
              )}
            </div>
          </div>
          {siLines.length===0
            ? <div className="pm-hint" style={{ textAlign:"center" }}>{bnL?"↑ উপরে পণ্য যোগ করুন":"↑ Add items above"}</div>
            : <SiItemsTable items={siLines} lang={lang} isTax={formIsTax&&!formIsDelivery} showDisc={!formIsDelivery}
                editId={siEditLineId}
                onEdit={(item)=>{
                  setSiCurrent({ productId:item.productId||null, name:item.name, code:item.code||"", brand:item.brand||"", qty:String(item.qty), unit:item.unit||"Pcs", unitPrice:String(item.unitPrice||""), discountPerc:String(item.discountPerc||"0"), discountFlat:siN2(item.discountFlat)>0?String(item.discountFlat):"", vatPerc:item.vatPerc!=null&&item.vatPerc!==""?String(item.vatPerc):"5" });
                  setSiEditLineId(item.id);
                  setTimeout(()=>siNameRef.current?.focus(), 80);
                }}
                onDelete={(item)=>{ setSiLines(p=>p.filter(x=>x.id!==item.id)); if (siEditLineId===item.id) { setSiEditLineId(null); setSiCurrent(siEmptyCurrent()); } }} />}
        </>, siLines.length>0 ? ` (${siLines.length})` : "")}

        {!formIsDelivery&&siLines.length>0&&fPanel(bnL?"বিলের ছাড় ও সমন্বয়":"Bill Discount & Adjustment", (
          <div className="si-grid2">
            {[
              ["billDiscPerc", bnL?"বিলের ছাড় %":"Bill Disc %", !canDiscount, "decimal"],
              ["billDiscAmt", bnL?"বিলের ছাড় টাকা":"Bill Disc Amt", !canDiscount || siN2(siForm.billDiscPerc)>0, "decimal"],
              ["adjustment", bnL?"সমন্বয় (+/-)":"Adjustment (+/-)", false, "text"],
              ["roundOff", "Round Off", false, "text"],
              ...(!isQuote?[["creditDays", bnL?"বাকির দিন":"Credit Days", false, "numeric"]]:[]),
            ].map(([key,label,disabled,mode])=>(
              <div key={key}>{fField(label, <input className="pm-input" inputMode={mode} disabled={disabled} placeholder="0" value={siForm[key]||""}
                title={disabled&&!canDiscount&&key.startsWith("billDisc")?(bnL?"ডিসকাউন্টের অনুমতি নেই":"No discount permission"):undefined}
                onChange={e=>setSiForm(p=>({ ...p, [key]:e.target.value, ...(key==="billDiscPerc"&&e.target.value?{ billDiscAmt:"" }:{}) }))} />)}</div>
            ))}
          </div>
        ))}

        {fPanel(`📊 ${t.si_summary}`, <>
          {summaryRows.map(([l,v,c],i)=>(
            <div key={i} className="si-total-row"><span>{l}</span><b style={c?{ color:c }:undefined}>{t.cur} {v}</b></div>
          ))}
          <div className="si-total-row is-grand"><span>{t.si_grandTotal}</span><span style={{ color:siAccent }}>{t.cur} {siFmt2(totals.grand)}</span></div>
        </>)}

        {!formIsDelivery&&!isQuote&&fPanel(`💳 ${t.si_payment}`, <>
          {fRow(bnL?"পেমেন্টের ধরন":"Payment method", (
            <select className="pm-input" value={siForm.paymentMethod} onChange={e=>{
              const key = e.target.value;
              // Switching away from cash: clear auto-filled paid amount
              if (siForm.paymentMethod==="cash" && key!=="cash") setSiForm(p=>({...p, paymentMethod:key, amountPaid:""}));
              else siUpd("paymentMethod",key);
            }}>
              {Object.entries(SI_PAY).map(([key,pm])=><option key={key} value={key}>{pm.icon} {pm[lang]}</option>)}
            </select>
          ))}
          {formIsCash ? (
            <div className="si-paid-box"><span>✅ {bnL?"নগদে সম্পূর্ণ পরিশোধিত":"Fully paid (cash)"}</span><span>{t.cur} {siFmt2(totals.grand)}</span></div>
          ) : (
            <>
              {fRow(t.si_amountPaid, (
                <div style={{ display:"flex", gap:4 }}>
                  <input className="pm-input" inputMode="decimal" placeholder="0.00" value={siForm.amountPaid} onChange={e=>siUpd("amountPaid",e.target.value)} />
                  {totals.grand>0&&<button type="button" className="pm-btn-secondary" onClick={()=>siUpd("amountPaid",siFmt2(totals.grand))}>{bnL?"পুরো":"Full"}</button>}
                </div>
              ))}
              {totals.grand>0&&<div className={`si-paid-box${balance>0.01?" is-due":""}`}><span>{t.si_balanceDue}</span><span>{t.cur} {siFmt2(balance)}</span></div>}
            </>
          )}
        </>)}

        {!isQuote&&fPanel(`🚚 ${t.si_deliverySection}`, <>
          {fRow(t.si_deliveryNote, <input className="pm-input" placeholder="DN-0001" value={siForm.deliveryNoteNo} onChange={e=>siUpd("deliveryNoteNo",e.target.value)} />)}
          {fRow(t.si_vehicleNo, <input className="pm-input" placeholder="ABC-1234" value={siForm.vehicleNo} onChange={e=>siUpd("vehicleNo",e.target.value)} />)}
        </>)}

        {fPanel(`📝 ${t.si_note}`, (
          <AutoTA className="pm-input" style={{ height:"auto", minHeight:siMobile?64:42 }} placeholder={t.si_notePh} value={siForm.note} onChange={e=>siUpd("note",e.target.value)} />
        ))}
      </div>

      <div className="si-actions si-sticky-actions">
        <button type="button" className="pm-btn pm-btn--primary" onClick={siConfirm} disabled={siSaving}>
          {siSaving?"...":(isQuote?(bnL?"✅ কোটেশন সেভ":"✅ Save Quotation"):isDN?(bnL?"✅ ডেলিভারি নোট সেভ":"✅ Save Delivery Note"):(bnL?"✅ ইনভয়েস নিশ্চিত":"✅ Confirm Invoice"))}
        </button>
        <button type="button" className="pm-btn-secondary" onClick={siSaveDraft} disabled={siSaving}>{bnL?"ড্রাফট সেভ":"Save Draft"}</button>
        <button type="button" className="pm-btn pm-btn--danger" onClick={closeForm}>{bnL?"বাতিল":"Cancel"}</button>
      </div>
    </div>
  );
}

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


// ─── UAE BANKS DATA ───────────────────────────────────────────
const UAE_BANKS = [
  { id:"enbd",   name:"Emirates NBD",                  short:"ENBD", color:"#CC0000", code:"033", swift:"EBILAEAD",  tag:"Together Unlimited" },
  { id:"fab",    name:"First Abu Dhabi Bank",           short:"FAB",  color:"#00563F", code:"035", swift:"NBADAEAA",  tag:"Advancing Growth" },
  { id:"adcb",   name:"ADCB",                           short:"ADCB", color:"#E31837", code:"030", swift:"ADCBAEAA",  tag:"Abu Dhabi Commercial Bank" },
  { id:"dib",    name:"Dubai Islamic Bank",             short:"DIB",  color:"#006837", code:"240", swift:"DUIBAEAD",  tag:"Always with you" },
  { id:"mashreq",name:"Mashreq Bank",                   short:"MAQ",  color:"#E2211C", code:"031", swift:"BOMLAEAD",  tag:"Moving you forward" },
  { id:"adib",   name:"Abu Dhabi Islamic Bank",         short:"ADIB", color:"#7B2D8B", code:"500", swift:"ADIBAEAA",  tag:"Islamic Banking" },
  { id:"rak",    name:"RAKBANK",                        short:"RAK",  color:"#C8102E", code:"045", swift:"NRAKAEAK",  tag:"National Bank of Ras Al Khaimah" },
  { id:"hsbc",   name:"HSBC UAE",                       short:"HSBC", color:"#DB0011", code:"043", swift:"BBMEAEAD",  tag:"The World's Local Bank" },
  { id:"sc",     name:"Standard Chartered UAE",         short:"SCB",  color:"#0072BC", code:"050", swift:"SCBLAEAD",  tag:"Here for Good" },
  { id:"cbd",    name:"Commercial Bank of Dubai",       short:"CBD",  color:"#005B82", code:"053", swift:"CBDUAEAD",  tag:"Your bank, your life" },
  { id:"cbi",    name:"Commercial Bank International",  short:"CBI",  color:"#003087", code:"054", swift:"CBILAEAA",  tag:"CBI" },
  { id:"nbf",    name:"National Bank of Fujairah",      short:"NBF",  color:"#00529B", code:"055", swift:"NBFUAEAS",  tag:"A better way to bank" },
  { id:"nbq",    name:"National Bank of Umm Al Qaiwain",short:"NBQ",  color:"#005B82", code:"056", swift:"NBUQAEAQ",  tag:"NBQ" },
  { id:"sib",    name:"Sharjah Islamic Bank",           short:"SIB",  color:"#008000", code:"057", swift:"SIBLAEAA",  tag:"Islamic Banking" },
  { id:"alhilal",name:"Al Hilal Bank",                  short:"AHB",  color:"#00529B", code:"225", swift:"ALHIAEAA",  tag:"Islamic Banking" },
  { id:"invest", name:"Invest Bank",                    short:"INV",  color:"#1C4480", code:"095", swift:"INVBAEAS",  tag:"Invest Bank Sharjah" },
  { id:"citiuae",name:"Citibank UAE",                   short:"CITI", color:"#003A78", code:"082", swift:"CITIAEAX",  tag:"Citi — The Citi Never Sleeps" },
  { id:"ubl",    name:"United Bank Limited UAE",        short:"UBL",  color:"#005595", code:"095", swift:"UNILAEAA",  tag:"Pakistan's Global Bank" },
  { id:"emirates_islamic",name:"Emirates Islamic",      short:"EIB",  color:"#006400", code:"236", swift:"MEBLAEADXXX", tag:"Islamic Banking" },
  { id:"ajman",  name:"Ajman Bank",                     short:"AJB",  color:"#006633", code:"140", swift:"AJMAAEAA",  tag:"Ajman Bank" },
];

// ─── AMOUNT TO WORDS ──────────────────────────────────────────
function amountToWordsAED(n) {
  if (!n || n <= 0) return "";
  const a = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const b = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function hun(x) {
    if (x < 20) return a[x];
    if (x < 100) return b[Math.floor(x/10)] + (x%10 ? " " + a[x%10] : "");
    return a[Math.floor(x/100)] + " Hundred" + (x%100 ? " " + hun(x%100) : "");
  }
  const parts = parseFloat(n).toFixed(2).split(".");
  let whole = parseInt(parts[0]), fils = parseInt(parts[1]);
  let res = "";
  if (whole >= 1000000) { res += hun(Math.floor(whole/1000000)) + " Million "; whole %= 1000000; }
  if (whole >= 1000)    { res += hun(Math.floor(whole/1000)) + " Thousand "; whole %= 1000; }
  if (whole > 0)          res += hun(whole) + " ";
  res += "Dirhams";
  if (fils > 0) res += " and " + hun(fils) + " Fils";
  return res.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// REPLACE: Lines 4968–5313  in  spare-parts-app__25_.jsx
// (from the comment "─── CHEQUE PRINTER TAB" through the closing brace of ChequePrinterTab)
//
// UAE_BANKS (lines 4924–4945) and amountToWordsAED (lines 4948–4966) stay UNCHANGED.
//
// ALSO UPDATE the call-site at line ~7261 to pass shopAccount and shopIban:
//
//   {tab==="cheque"&&(
//     <ChequePrinterTab
//       t={t} lang={lang} th={th} s={s}
//       isDesktop={isDesktop}
//       shopName={localShop?.companyName||""}
//       shopAccount={localShop?.accountNumber||""}
//       shopIban={localShop?.ibanNumber||""}
//     />
//   )}
// ─────────────────────────────────────────────────────────────────────────────

// ─── PER-BANK PRINT POSITIONS (millimetres from top/left of cheque) ──────────
// These are calibrated for each bank's standard UAE cheque leaf (210mm × 90mm).
// If a field prints in the wrong spot, increment or decrement the value by 1–2mm
// and re-print a test page until aligned.
//
// Field guide:
//   payeeTop / payeeLeft / payeeMaxW  → "Pay to" beneficiary name line
//   amtTop   / amtRight              → AED amount box (right-aligned)
//   wordsTop / wordsLeft / wordsMaxW → Amount in words line
//   dateTop  / dateDDLeft            → Day digits  (DD)
//   dateTop  / dateMMLeft            → Month digits (MM)
//   dateTop  / dateYYLeft            → Year digits  (YYYY)
// ─────────────────────────────────────────────────────────────────────────────
const CHEQUE_POSITIONS = {
  //               payee             amount          words              date
  enbd:   { payeeTop:31, payeeLeft:52, payeeMaxW:112, amtTop:29, amtRight:13, wordsTop:43, wordsLeft:12, wordsMaxW:148, dateTop:58, dateDDLeft:149, dateMMLeft:163, dateYYLeft:175 },
  fab:    { payeeTop:32, payeeLeft:54, payeeMaxW:110, amtTop:30, amtRight:12, wordsTop:44, wordsLeft:12, wordsMaxW:148, dateTop:58, dateDDLeft:149, dateMMLeft:163, dateYYLeft:175 },
  adcb:   { payeeTop:36, payeeLeft:46, payeeMaxW:118, amtTop:54, amtRight:10, wordsTop:48, wordsLeft:10, wordsMaxW:146, dateTop:22, dateDDLeft:145, dateMMLeft:158, dateYYLeft:170 },
  dib:    { payeeTop:31, payeeLeft:50, payeeMaxW:114, amtTop:28, amtRight:12, wordsTop:43, wordsLeft:11, wordsMaxW:148, dateTop:57, dateDDLeft:149, dateMMLeft:163, dateYYLeft:175 },
  mashreq:{ payeeTop:30, payeeLeft:50, payeeMaxW:115, amtTop:27, amtRight:13, wordsTop:42, wordsLeft:12, wordsMaxW:148, dateTop:57, dateDDLeft:150, dateMMLeft:164, dateYYLeft:176 },
  adib:   { payeeTop:31, payeeLeft:48, payeeMaxW:116, amtTop:28, amtRight:11, wordsTop:43, wordsLeft:10, wordsMaxW:148, dateTop:58, dateDDLeft:148, dateMMLeft:163, dateYYLeft:175 },
  rak:    { payeeTop:30, payeeLeft:50, payeeMaxW:114, amtTop:28, amtRight:12, wordsTop:42, wordsLeft:12, wordsMaxW:148, dateTop:57, dateDDLeft:149, dateMMLeft:163, dateYYLeft:175 },
  hsbc:   { payeeTop:31, payeeLeft:52, payeeMaxW:112, amtTop:29, amtRight:13, wordsTop:43, wordsLeft:12, wordsMaxW:148, dateTop:58, dateDDLeft:150, dateMMLeft:164, dateYYLeft:176 },
  sc:     { payeeTop:31, payeeLeft:52, payeeMaxW:112, amtTop:29, amtRight:13, wordsTop:43, wordsLeft:12, wordsMaxW:148, dateTop:58, dateDDLeft:150, dateMMLeft:164, dateYYLeft:176 },
  cbd:    { payeeTop:30, payeeLeft:50, payeeMaxW:115, amtTop:28, amtRight:12, wordsTop:42, wordsLeft:11, wordsMaxW:148, dateTop:57, dateDDLeft:149, dateMMLeft:163, dateYYLeft:175 },
  default:{ payeeTop:32, payeeLeft:50, payeeMaxW:114, amtTop:29, amtRight:12, wordsTop:43, wordsLeft:11, wordsMaxW:148, dateTop:58, dateDDLeft:149, dateMMLeft:163, dateYYLeft:175 },
};

// ─── PER-BANK USER DEFAULT TEMPLATE VALUES ──────────────────────────────────
// These are user-adjustable defaults. Saved values in localStorage override them.
// Reset returns to these values for the selected bank only.
const CHEQUE_TEMPLATE_DEFAULTS = {
  default: {
    px:0, py:0, wx:0, wy:0, ax:0, ay:0, dx:0, dy:0, mo:0, yo:0,
    w:196, h:99, dm:"slash",
  },
  adcb: {
    // ADCB calibrated from user's real cheque/printer test screenshots.
    px:-12, py:-16,
    wx:19, wy:-18,
    ax:-8, ay:-15,
    dx:14, dy:-19,
    mo:-3, yo:-3,
    w:200, h:90,
    dm:"slash",
  },
};

const DATE_FORMAT_OPTIONS = [
  { id:"slash", label:"DD/MM/YYYY", sep:"/" },
  { id:"dot",   label:"DD.MM.YYYY", sep:"." },
  { id:"dash",  label:"DD-MM-YYYY", sep:"-" },
  { id:"space", label:"DD MM YYYY", sep:" " },
  { id:"box",   label:"Box / digit spacing", sep:null },
];

const getChequeTemplateDefault = (bankId) => ({
  ...CHEQUE_TEMPLATE_DEFAULTS.default,
  ...(CHEQUE_TEMPLATE_DEFAULTS[bankId] || {}),
});

// ─── CHEQUE PRINTER TAB ───────────────────────────────────────────────────────
function ChequePrinterTab({ t, lang, th, s, isDesktop, shopName, shopAccount, shopIban, shopId, user, shop, prefill=null, onPrefillDone, onOpenHandover, syncRefreshKey=0, foldersVisible=false, onUnlockFolders, onLockFolders }) {
  const [bank, setBank]         = useState(UAE_BANKS[0]);
  const [linkedVoucher, setLinkedVoucher] = useState(null);
  const [vendorCheques, setVendorCheques] = useState([]);
  const [openFolder, setOpenFolder]       = useState(null);
  const [folderSearch, setFolderSearch]   = useState("");
  const authSyncReady = useFirebaseAuthReady();
  const [payee, setPayee]       = useState("");
  const [amount, setAmount]     = useState("");
  const [words, setWords]       = useState("");
  const [wordsManual, setWordsManual] = useState(false);
  const [dateVal, setDateVal]   = useState(() => localIsoDate());
  const [showBankList, setShowBankList] = useState(false);

  // ── Per-field calibration offsets (mm) + page size ────────────────────────
  // Each field has independent X (left/right) and Y (up/down) offset
  const [payeeX, setPayeeX] = useState(0);   // Pay-to name → left/right
  const [payeeY, setPayeeY] = useState(0);   // Pay-to name → up/down
  const [wordsX, setWordsX] = useState(0);   // Amount words → left/right
  const [wordsY, setWordsY] = useState(0);   // Amount words → up/down
  const [amtX,   setAmtX]   = useState(0);   // Amount number → left/right
  const [amtY,   setAmtY]   = useState(0);   // Amount number → up/down
  const [dateX,  setDateX]  = useState(0);   // Date DD → left/right (all move together)
  const [dateY,  setDateY]  = useState(0);   // Date → up/down
  const [mmOff,  setMmOff]  = useState(0);   // MM gap from DD (positive = more right)
  const [yyOff,  setYyOff]  = useState(0);   // YYYY gap from MM (positive = more right)
  const [pageW,  setPageW]  = useState(196); // Page width  mm — ADCB cheque measured
  const [pageH,  setPageH]  = useState(99);  // Page height mm — ADCB cheque measured
  const [dateMode, setDateMode] = useState("slash"); // slash/dot/dash/space/box
  const [saveDone, setSaveDone] = useState(false);

  const applyTemplateValues = (o) => {
    const d = getChequeTemplateDefault(bank.id);
    const v = { ...d, ...(o || {}) };
    setPayeeX(Number(v.px) || 0); setPayeeY(Number(v.py) || 0);
    setWordsX(Number(v.wx) || 0); setWordsY(Number(v.wy) || 0);
    setAmtX(Number(v.ax) || 0);   setAmtY(Number(v.ay) || 0);
    setDateX(Number(v.dx) || 0);  setDateY(Number(v.dy) || 0);
    setMmOff(Number(v.mo) || 0);  setYyOff(Number(v.yo) || 0);
    setPageW(Number(v.w) || d.w); setPageH(Number(v.h) || d.h);
    setDateMode(DATE_FORMAT_OPTIONS.some(x => x.id === v.dm) ? v.dm : d.dm);
  };

  const resetAll = () => {
    applyTemplateValues(getChequeTemplateDefault(bank.id));
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`chq_off2_${bank.id}`);
      if (saved) {
        applyTemplateValues(JSON.parse(saved));
      } else {
        applyTemplateValues(getChequeTemplateDefault(bank.id));
      }
    } catch(e) {
      applyTemplateValues(getChequeTemplateDefault(bank.id));
    }
  }, [bank.id]);

  const saveOffsets = () => {
    try {
      localStorage.setItem(`chq_off2_${bank.id}`, JSON.stringify({
        px:payeeX, py:payeeY,
        wx:wordsX, wy:wordsY,
        ax:amtX,   ay:amtY,
        dx:dateX,  dy:dateY,
        mo:mmOff,  yo:yyOff,
        w:pageW,   h:pageH,
        dm:dateMode,
      }));
      setSaveDone(true);
      setTimeout(() => setSaveDone(false), 2500);
    } catch(e) { alert("Save failed — localStorage may be unavailable"); }
  };

  // Helpers — step 1 mm per click
  const adj = (setter) => (d) => setter(v => +((v + d).toFixed(1)));

  // Auto-fill amount in words from numeric amount
  const normalizeChequeAmount = (v) => {
    const raw = String(v ?? "").replace(/[,\s]/g, "");
    const parts = raw.replace(/[^0-9.]/g, "").split(".");
    return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : parts[0];
  };

  const handleAmountChange = (v) => {
    const cleanAmount = normalizeChequeAmount(v);
    setAmount(cleanAmount);
    if (!wordsManual) {
      const n = parseFloat(cleanAmount);
      setWords(n > 0 ? amountToWordsAED(n) : "");
    }
  };
  const handleWordsChange = (v) => { setWords(v); setWordsManual(true); };
  const handleAmountBlur  = ()  => { setWordsManual(false); };

  // Format number as AED amount for cheque: no comma, no spaces, always 2 decimals
  const fmtAmount = (v) => {
    const n = Number(normalizeChequeAmount(v));
    if (!Number.isFinite(n) || n <= 0) return "";
    return n.toFixed(2);
  };

  // Split date into parts
  const [yyyy, mm, dd] = dateVal ? dateVal.split("-") : ["", "", ""];

  // Final print positions = bank baseline + per-field user offsets
  const pos = CHEQUE_POSITIONS[bank.id] || CHEQUE_POSITIONS.default;
  const P = {
    payeeTop:   pos.payeeTop   + payeeY,
    payeeLeft:  pos.payeeLeft  + payeeX,
    payeeMaxW:  pos.payeeMaxW,
    amtTop:     pos.amtTop     + amtY,
    amtRight:   Math.max(1, pos.amtRight - amtX),
    wordsTop:   pos.wordsTop   + wordsY,
    wordsLeft:  pos.wordsLeft  + wordsX,
    wordsMaxW:  pos.wordsMaxW,
    dateTop:    pos.dateTop    + dateY,
    dateDDLeft: pos.dateDDLeft + dateX,
    dateMMLeft: pos.dateMMLeft + dateX + mmOff,   // MM gap adjustable
    dateYYLeft: pos.dateYYLeft + dateX + mmOff + yyOff,  // YYYY gap adjustable
  };

  // Shared styles
  const inp = {
    padding:"10px 12px", borderRadius:8,
    border:`1px solid ${th.borderMid}`,
    background:th.bgInp, color:th.txtPrimary,
    fontSize:14, outline:"none",
    width:"100%", boxSizing:"border-box", fontFamily:"inherit",
  };
  const lbl = {
    fontSize:11, color:th.txtMuted, fontWeight:700,
    textTransform:"uppercase", letterSpacing:0.4,
    marginBottom:4, display:"block",
  };
  const sec = {
    fontSize:12, fontWeight:700, color:th.accent,
    textTransform:"uppercase", letterSpacing:0,
    marginBottom:12, marginTop:4,
  };

  // Date render engine: supports slash, dot, dash, space, and box/digit mode per bank/user
  const selectedDateFormat = DATE_FORMAT_OPTIONS.find(x => x.id === dateMode) || DATE_FORMAT_OPTIONS[0];
  const chequeDateText = selectedDateFormat.id === "box"
    ? ""
    : `${dd}${selectedDateFormat.sep}${mm}${selectedDateFormat.sep}${yyyy}`;

  // ── Vendor-voucher cheques (only cheques printed from a payment voucher are listed) ──
  const mergeVendorCheques = (rows) => setVendorCheques(
    rows.filter(v => v && v.shopId === shopId && v.method === "cheque" && v.chequePrintedAt && v.status !== "cancelled")
      .sort((a,b) => String(b.chequePrintedAt).localeCompare(String(a.chequePrintedAt)))
  );
  useEffect(() => {
    if (!shopId || !foldersVisible) return undefined;
    let alive = true;
    offlineList("purchasePayments").then(res => {
      if (!alive) return;
      const rows = (Array.isArray(res) ? res : (res.records || [])).map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }));
      mergeVendorCheques(rows);
    }).catch(() => {});
    let unsub = null;
    if (authSyncReady) {
      unsub = onSnapshot(query(collection(db,"purchasePayments"), where("shopId","==",shopId)),
        snap => { if (alive) mergeVendorCheques(snap.docs.map(d => ({ ...d.data(), id:d.id }))); },
        err => console.warn("[Cheque] vendor cheque list failed", err));
    }
    return () => { alive = false; unsub?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, authSyncReady, syncRefreshKey, foldersVisible]);

  const loadVoucherIntoForm = (v, { payee:p, amount:a, date, bankName } = {}) => {
    setPayee(p ?? v.vendorName ?? "");
    const amt = Number(a ?? (v.chequeAmount ?? v.totalAmount)) || 0;
    setAmount(amt > 0 ? amt.toFixed(2) : "");
    setWords(amt > 0 ? amountToWordsAED(amt) : "");
    setWordsManual(false);
    const d = date ?? v.chequeDate ?? v.paymentDate;
    if (d) setDateVal(String(d).slice(0,10));
    const bn = String(bankName ?? v.chequeBank ?? "").trim().toLowerCase();
    const matched = bn && UAE_BANKS.find(b => b.name.toLowerCase() === bn || b.short?.toLowerCase() === bn);
    if (matched) setBank(matched);
    setLinkedVoucher(v);
  };
  useEffect(() => {
    if (!prefill?.voucher) return;
    loadVoucherIntoForm(prefill.voucher, prefill);
    onPrefillDone?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const markLinkedPrinted = async () => {
    if (!linkedVoucher?.id) return;
    try {
      const nowIso = new Date().toISOString();
      const local = await offlineGetById("purchasePayments", linkedVoucher.id);
      const base = local?.data || vendorCheques.find(v => v.id === linkedVoucher.id) || linkedVoucher;
      const patch = {
        chequePrintedAt: nowIso,
        chequePrintCount: (Number(base.chequePrintCount) || 0) + 1,
        updatedAt: nowIso, updatedBy: user?.uid || "",
      };
      const result = await offlinePatch("purchasePayments", linkedVoucher.id, patch, base);
      const updated = { ...base, ...result.data, id: linkedVoucher.id };
      setLinkedVoucher(updated);
      setVendorCheques(prev => [updated, ...prev.filter(v => v.id !== updated.id)]);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] cheque print mark failed", err));
    } catch (e) { console.warn("[Cheque] mark printed failed", e); }
  };

  const chequeDocOpts = (v) => ({ cur: t.cur || "AED", amountWords: `${amountToWordsAED(chequeAmountOfVoucher(v))} Only` });

  // Printed from an isolated frame: printing the app window lets the hidden app
  // layout spill onto extra pages and makes the browser shrink the cheque to fit.
  const printCheque = () => {
    const area = document.getElementById("cheque-print-area");
    if (!area) return;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cheque</title><style>
@page{size:${pageW}mm ${pageH}mm;margin:0}
html,body{margin:0;padding:0;background:transparent}
#cheque{position:relative;width:${pageW}mm;height:${pageH}mm;overflow:hidden}
#cheque>div{position:absolute}
</style></head><body><div id="cheque">${area.innerHTML}</div></body></html>`;
    markLinkedPrinted();
    if (window.Capacitor?.isNativePlatform?.()) { printHtmlDocument(html, { preview:true, lang }); return; }
    const chequePrinter = loadPrintSettings().chequePrinter;
    if (chequePrinter && canPickPrinter()) {
      printHtmlDocument(html, { preview:false, lang, printer:chequePrinter, pageSizeMm:{ width:pageW, height:pageH } });
      return;
    }
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    const cleanup = () => setTimeout(() => frame.remove(), 1000);
    frame.contentWindow.addEventListener("afterprint", cleanup, { once:true });
    setTimeout(() => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch (e) {
        console.error("[Cheque] print failed", e);
        frame.remove();
      }
    }, 150);
  };

  const previewDateBoxes = () => {
    if (dateMode === "box") {
      return (
        <div style={{ display:"flex", gap:8, alignItems:"center", fontFamily:"'Courier New', Courier, monospace", fontSize:16, fontWeight:800, color:"#000" }}>
          <span style={{ letterSpacing:"0.18em" }}>{dd}</span>
          <span style={{ letterSpacing:"0.18em" }}>{mm}</span>
          <span style={{ letterSpacing:"0.18em" }}>{yyyy}</span>
        </div>
      );
    }
    return (
      <div style={{
        fontSize:16,
        fontWeight:800,
        fontFamily:"'Courier New', Courier, monospace",
        color:"#000",
        letterSpacing:0,
        wordSpacing:0,
        whiteSpace:"nowrap",
        lineHeight:1,
      }}>
        {chequeDateText}
      </div>
    );
  };

  return (
    <div style={isDesktop ? s.desktopPanel : s.panel}>

      {/* ── PAGE HEADER ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div style={s.secTitle}>
          {lang==="bn" ? "🖨️ UAE ব্যাংক চেক প্রিন্টার" : "🖨️ UAE Bank Cheque Printer"}
        </div>
        <div style={{ fontSize:11, color:th.txtMuted, background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:8, padding:"5px 10px" }}>
          {lang==="bn" ? "প্রিন্টারে চেক লিফ রেখে প্রিন্ট করুন" : "Place cheque leaf in printer then print"}
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:isDesktop?"row":"column", gap:16, alignItems:"flex-start" }}>

        {/* ════════════════════════════════════════
            LEFT PANEL — Form
        ════════════════════════════════════════ */}
        <div style={{ flex:"0 0 300px", minWidth:0 }}>

          {/* ── Bank Selector ── */}
          <div style={{ ...s.card, border:`1px solid ${th.border}`, marginBottom:14 }}>
            <div style={sec}>🏦 {lang==="bn" ? "ব্যাংক বেছে নিন" : "Select Bank"}</div>
            <div
              onClick={() => setShowBankList(!showBankList)}
              style={{
                display:"flex", alignItems:"center", gap:10,
                padding:"10px 12px", borderRadius:8,
                border:`1px solid ${showBankList ? bank.color : th.borderMid}`,
                background:th.bgInp, cursor:"pointer", transition:"border-color 0.2s",
              }}
            >
              <div style={{
                width:36, height:36, borderRadius:8, background:bank.color,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:9, fontWeight:800, color:"#fff", flexShrink:0,
                textAlign:"center", lineHeight:1.2,
              }}>
                {bank.short}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{bank.name}</div>
                <div style={{ fontSize:10, color:th.txtMuted }}>{bank.tag}</div>
              </div>
              <span style={{ fontSize:16, color:th.txtMuted }}>{showBankList ? "▲" : "▼"}</span>
            </div>

            {showBankList && (
              <div style={{ marginTop:8, maxHeight:260, overflowY:"auto", borderRadius:8, border:`1px solid ${th.border}`, background:th.bgCard }}>
                {UAE_BANKS.map(b => (
                  <button
                    key={b.id}
                    onClick={() => { setBank(b); setShowBankList(false); }}
                    style={{
                      width:"100%", textAlign:"left", padding:"9px 12px",
                      background:b.id===bank.id ? th.accentDim : "transparent",
                      border:"none", borderBottom:`1px solid ${th.border}`,
                      cursor:"pointer", fontFamily:"inherit",
                      display:"flex", alignItems:"center", gap:10,
                    }}
                  >
                    <div style={{
                      width:28, height:28, borderRadius:6, background:b.color,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:8, fontWeight:800, color:"#fff", flexShrink:0,
                      textAlign:"center", lineHeight:1.1,
                    }}>{b.short}</div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:b.id===bank.id ? th.accent : th.txtPrimary }}>{b.name}</div>
                      <div style={{ fontSize:10, color:th.txtMuted }}>{b.swift}</div>
                    </div>
                    {b.id===bank.id && <span style={{ marginLeft:"auto", color:th.accent }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Cheque Details Form ── */}
          <div style={{ ...s.card, marginBottom:14 }}>
            <div style={sec}>📝 {lang==="bn" ? "চেকের তথ্য" : "Cheque Details"}</div>

            {/* Date */}
            <div style={{ marginBottom:10 }}>
              <span style={lbl}>{lang==="bn" ? "তারিখ" : "Date"}</span>
              <input
                style={inp} type="date" value={dateVal}
                onChange={e => setDateVal(e.target.value)}
              />
            </div>

            {/* Payee */}
            <div style={{ marginBottom:10 }}>
              <span style={lbl}>{lang==="bn" ? "প্রাপকের নাম (Pay to)" : "Pay to (Beneficiary)"}</span>
              <input
                style={inp}
                value={payee}
                onChange={e => setPayee(e.target.value)}
                placeholder={lang==="bn" ? "ব্যক্তি বা কোম্পানির নাম" : "Person or company name"}
              />
            </div>

            {/* Amount */}
            <div style={{ marginBottom:10 }}>
              <span style={lbl}>{lang==="bn" ? "পরিমাণ (AED)" : "Amount (AED)"}</span>
              <input
                style={{ ...inp, fontWeight:700, fontSize:16, color:"#22c55e" }}
                inputMode="decimal"
                value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                onBlur={handleAmountBlur}
                placeholder="0.00"
              />
            </div>

            {/* Amount in words */}
            <div>
              <span style={lbl}>{lang==="bn" ? "কথায় পরিমাণ (স্বয়ংক্রিয়)" : "Amount in Words (auto)"}</span>
              <input
                style={{ ...inp, fontSize:12 }}
                value={words}
                onChange={e => handleWordsChange(e.target.value)}
                placeholder={lang==="bn" ? "কথায় পরিমাণ..." : "Amount in words..."}
              />
              {!wordsManual && amount && (
                <div style={{ fontSize:10, color:th.txtMuted, marginTop:3 }}>
                  ✨ {lang==="bn" ? "স্বয়ংক্রিয় — এডিট করা যাবে" : "Auto-filled — editable"}
                </div>
              )}
            </div>
          </div>

          {/* ── 🎯 Position Calibration Card ── */}
          {(() => {
            // Reusable 4-direction control for one field
            const FieldCtrl = ({ icon, label, xVal, yVal, onXL, onXR, onYU, onYD }) => {
              const btnSt = {
                padding:"4px 9px", borderRadius:5,
                border:`1px solid ${th.borderMid}`,
                background:th.bgCard, color:th.txtPrimary,
                cursor:"pointer", fontWeight:800, fontSize:12, lineHeight:1,
              };
              const valSt = (v) => ({
                minWidth:42, textAlign:"center", fontSize:11, fontWeight:800,
                color: v!==0 ? th.accent : th.txtMuted,
              });
              return (
                <div style={{ marginBottom:10, background:th.bgInp, borderRadius:8, padding:"8px 10px", border:`1px solid ${th.border}` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:th.txtSecondary, marginBottom:6 }}>
                    {icon} {label}
                  </div>
                  <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                    {/* Up / Down */}
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      <span style={{ fontSize:9, color:th.txtMuted, marginRight:2 }}>↕</span>
                      <button style={btnSt} onClick={onYU}>▲</button>
                      <div style={valSt(yVal)}>{yVal>0?"+":""}{yVal}mm</div>
                      <button style={btnSt} onClick={onYD}>▼</button>
                    </div>
                    <div style={{ width:1, height:24, background:th.border }} />
                    {/* Left / Right */}
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      <span style={{ fontSize:9, color:th.txtMuted, marginRight:2 }}>↔</span>
                      <button style={btnSt} onClick={onXL}>◄</button>
                      <div style={valSt(xVal)}>{xVal>0?"+":""}{xVal}mm</div>
                      <button style={btnSt} onClick={onXR}>►</button>
                    </div>
                  </div>
                </div>
              );
            };

            // Page size row
            const SizeBtn = ({ onClick, label }) => (
              <button onClick={onClick} style={{
                padding:"3px 9px", borderRadius:5,
                border:`1px solid ${th.borderMid}`,
                background:th.bgCard, color:th.txtPrimary,
                cursor:"pointer", fontWeight:800, fontSize:13,
              }}>{label}</button>
            );

            return (
              <div style={{ ...s.card, marginBottom:14, border:`1.5px solid ${th.accent}44` }}>
                <div style={{ fontSize:12, fontWeight:700, color:th.accent, textTransform:"uppercase", letterSpacing:0, marginBottom:4 }}>
                  🎯 {lang==="bn" ? "প্রিন্ট ক্যালিব্রেশন" : "Print Calibration"}
                </div>
                <div style={{ fontSize:10, color:th.txtMuted, marginBottom:10, lineHeight:1.6 }}>
                  {lang==="bn"
                    ? "সাদা কাগজে প্রিন্ট → চেকের উপর রাখুন → নিচের বাটন দিয়ে প্রতিটা field ঠিক করুন → সেভ করুন"
                    : "Print on plain paper → hold over cheque → adjust each field below → save"}
                </div>

                {/* Page size */}
                <div style={{ background:th.bgInp, borderRadius:8, padding:"8px 10px", marginBottom:10, border:`1px solid ${th.border}` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:th.txtSecondary, marginBottom:6 }}>
                    📐 {lang==="bn" ? "চেকের সাইজ" : "Cheque Size (mm)"}
                  </div>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:4, flex:1 }}>
                      <span style={{ fontSize:9, color:th.txtMuted }}>{lang==="bn" ? "প্রস্থ" : "W"}</span>
                      <SizeBtn onClick={() => setPageW(w => Math.max(100,w-1))} label="−" />
                      <div style={{ flex:1, textAlign:"center", fontSize:14, fontWeight:800, color:th.txtPrimary }}>{pageW}</div>
                      <SizeBtn onClick={() => setPageW(w => w+1)} label="+" />
                    </div>
                    <span style={{ color:th.txtMuted }}>×</span>
                    <div style={{ display:"flex", alignItems:"center", gap:4, flex:1 }}>
                      <span style={{ fontSize:9, color:th.txtMuted }}>{lang==="bn" ? "উচ্চতা" : "H"}</span>
                      <SizeBtn onClick={() => setPageH(h => Math.max(50,h-1))} label="−" />
                      <div style={{ flex:1, textAlign:"center", fontSize:14, fontWeight:800, color:th.txtPrimary }}>{pageH}</div>
                      <SizeBtn onClick={() => setPageH(h => h+1)} label="+" />
                    </div>
                  </div>
                </div>

                {/* Per-field controls */}
                <FieldCtrl
                  icon="👤" label={lang==="bn" ? "Pay to — নাম" : "Pay to (Name)"}
                  xVal={payeeX} yVal={payeeY}
                  onYU={() => adj(setPayeeY)(-1)} onYD={() => adj(setPayeeY)(+1)}
                  onXL={() => adj(setPayeeX)(-1)} onXR={() => adj(setPayeeX)(+1)}
                />
                <FieldCtrl
                  icon="📝" label={lang==="bn" ? "কথায় পরিমাণ" : "Amount in Words"}
                  xVal={wordsX} yVal={wordsY}
                  onYU={() => adj(setWordsY)(-1)} onYD={() => adj(setWordsY)(+1)}
                  onXL={() => adj(setWordsX)(-1)} onXR={() => adj(setWordsX)(+1)}
                />
                <FieldCtrl
                  icon="💰" label={lang==="bn" ? "পরিমাণ (AED)" : "Amount (AED)"}
                  xVal={amtX} yVal={amtY}
                  onYU={() => adj(setAmtY)(-1)} onYD={() => adj(setAmtY)(+1)}
                  onXL={() => adj(setAmtX)(-1)} onXR={() => adj(setAmtX)(+1)}
                />
                {/* Date: main position */}
                <FieldCtrl
                  icon="📅" label={lang==="bn" ? "তারিখ (DD উপর/নিচ/বাম/ডান)" : "Date DD (Up/Down/Left/Right)"}
                  xVal={dateX} yVal={dateY}
                  onYU={() => adj(setDateY)(-1)} onYD={() => adj(setDateY)(+1)}
                  onXL={() => adj(setDateX)(-1)} onXR={() => adj(setDateX)(+1)}
                />

                {/* Date format selector */}
                <div style={{ background:th.bgInp, borderRadius:8, padding:"8px 10px", marginBottom:10, border:`1px solid ${th.border}` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:th.txtSecondary, marginBottom:6 }}>
                    📅 {lang==="bn" ? "তারিখের ফরম্যাট" : "Date Format"}
                  </div>
                  <select
                    value={dateMode}
                    onChange={e => setDateMode(e.target.value)}
                    style={{
                      width:"100%",
                      padding:"8px 10px",
                      borderRadius:7,
                      border:`1px solid ${th.borderMid}`,
                      background:th.bgCard,
                      color:th.txtPrimary,
                      fontSize:12,
                      fontWeight:700,
                      outline:"none",
                    }}
                  >
                    {DATE_FORMAT_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                  <div style={{ fontSize:9, color:th.txtMuted, marginTop:6, lineHeight:1.5 }}>
                    {lang==="bn"
                      ? "যে ব্যাংকের চেকে / . - space বা box যেটা লাগে, সেটাই সিলেক্ট করুন। Save All দিলে ওই ব্যাংকের জন্য থাকবে।"
                      : "Select the exact date style required by this bank cheque. Save All stores it per bank."}
                  </div>
                </div>

                {/* Date gap controls */}
                <div style={{ background:th.bgInp, borderRadius:8, padding:"8px 10px", marginBottom:10, border:`1px solid ${th.border}` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:th.txtSecondary, marginBottom:8 }}>
                    📅 {lang==="bn" ? "তারিখের মাঝের gap (MM ও YYYY)" : "Date gap — MM & YYYY spacing"}
                  </div>
                  {/* MM gap */}
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                    <span style={{ fontSize:10, color:th.txtMuted, minWidth:70, fontWeight:600 }}>
                      {lang==="bn" ? "MM gap" : "MM gap"}
                    </span>
                    <button onClick={() => adj(setMmOff)(-1)}
                      style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${th.borderMid}`, background:th.bgCard, color:th.txtPrimary, cursor:"pointer", fontWeight:800, fontSize:12 }}>◄</button>
                    <div style={{ minWidth:46, textAlign:"center", fontSize:12, fontWeight:800, color: mmOff!==0 ? "#f59e0b" : th.txtMuted }}>
                      {mmOff>0?"+":""}{mmOff}mm
                    </div>
                    <button onClick={() => adj(setMmOff)(+1)}
                      style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${th.borderMid}`, background:th.bgCard, color:th.txtPrimary, cursor:"pointer", fontWeight:800, fontSize:12 }}>►</button>
                    <span style={{ fontSize:9, color:th.txtMuted, marginLeft:4 }}>← DD·MM·YYYY</span>
                  </div>
                  {/* YYYY gap */}
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:10, color:th.txtMuted, minWidth:70, fontWeight:600 }}>
                      {lang==="bn" ? "YYYY gap" : "YYYY gap"}
                    </span>
                    <button onClick={() => adj(setYyOff)(-1)}
                      style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${th.borderMid}`, background:th.bgCard, color:th.txtPrimary, cursor:"pointer", fontWeight:800, fontSize:12 }}>◄</button>
                    <div style={{ minWidth:46, textAlign:"center", fontSize:12, fontWeight:800, color: yyOff!==0 ? "#f59e0b" : th.txtMuted }}>
                      {yyOff>0?"+":""}{yyOff}mm
                    </div>
                    <button onClick={() => adj(setYyOff)(+1)}
                      style={{ padding:"4px 10px", borderRadius:5, border:`1px solid ${th.borderMid}`, background:th.bgCard, color:th.txtPrimary, cursor:"pointer", fontWeight:800, fontSize:12 }}>►</button>
                    <span style={{ fontSize:9, color:th.txtMuted, marginLeft:4 }}>← MM·YYYY</span>
                  </div>
                </div>

                {/* Save / Reset */}
                <div style={{ display:"flex", gap:8, marginTop:4 }}>
                  <button
                    onClick={saveOffsets}
                    style={{
                      flex:1, padding:"10px", borderRadius:8, border:"none",
                      background: saveDone ? "#22c55e" : th.accent,
                      color:"#fff", cursor:"pointer", fontWeight:700, fontSize:13,
                      display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                      transition:"background 0.3s",
                    }}
                  >
                    {saveDone
                      ? `✅ ${lang==="bn" ? "সেভ হয়েছে!" : "Saved!"}`
                      : `💾 ${lang==="bn" ? "সেভ করুন" : "Save All"}`}
                  </button>
                  <button
                    onClick={resetAll}
                    style={{ ...s.stBtn, flex:"0 0 76px", padding:"10px", fontSize:12, textAlign:"center" }}
                  >
                    ↺ Reset
                  </button>
                </div>
              </div>
            );
          })()}

          {linkedVoucher&&(
            <div style={{ marginBottom:10, padding:"9px 12px", borderRadius:10, border:"1px solid #2563eb", background:"rgba(37,99,235,0.08)", display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ flex:1, minWidth:0, fontSize:12, color:th.txtPrimary }}>
                🔗 <b>{linkedVoucher.paymentNo}</b> · {linkedVoucher.vendorName}
                <div style={{ fontSize:10, color:th.txtMuted }}>{lang==="bn"?"ভেন্ডর ভাউচারের চেক — প্রিন্ট করলে ভেন্ডরের ফোল্ডারে জমা হবে":"Vendor voucher cheque — saved to the vendor's folder when printed"}</div>
              </div>
              <button onClick={()=>setLinkedVoucher(null)} title={lang==="bn"?"লিংক সরান":"Unlink"} style={{ border:"none", background:"transparent", color:th.txtMuted, fontSize:16, cursor:"pointer" }}>✕</button>
            </div>
          )}

          {/* ── Print + Clear buttons ── */}
          <button
            onClick={printCheque}
            style={{ ...s.sendBtn, marginBottom:10, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
          >
            🖨️ {lang==="bn" ? "চেক প্রিন্ট করুন" : "Print Cheque"}
          </button>
          <button
            onClick={() => {
              setPayee(""); setAmount(""); setWords("");
              setDateVal(localIsoDate());
              setWordsManual(false);
              setLinkedVoucher(null);
            }}
            style={{ ...s.stBtn, width:"100%", padding:"11px", textAlign:"center", fontSize:13 }}
          >
            🗑️ {lang==="bn" ? "ক্লিয়ার করুন" : "Clear All"}
          </button>

          {/* ── Tips card ── */}
          <div style={{ marginTop:14, padding:"10px 12px", background:th.bgCard, borderRadius:8, border:`1px solid ${th.border}`, fontSize:11, color:th.txtMuted, lineHeight:1.8 }}>
            💡 <strong style={{ color:th.txtSecondary }}>{lang==="bn" ? "টিপস:" : "Tips:"}</strong>
            {lang==="bn"
              ? " প্রিন্টারে Paper Size: Custom 210×90mm, Scale: 100%, Margins: None সেট করুন।"
              : " Set printer: Paper Size=Custom 210×90mm, Scale=100%, Margins=None."}
            <div style={{ marginTop:6, padding:"6px 8px", background:"#fef3c7", borderRadius:6, border:"1px solid #fcd34d", color:"#92400e", fontWeight:700 }}>
              ⚠️ {lang==="bn" ? "Chrome → More settings → Paper size → Custom → 210mm × 90mm" : "Chrome → More settings → Paper size → Custom → 210 × 90 mm"}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
            RIGHT PANEL — Cheque Preview (screen only)
        ════════════════════════════════════════ */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:11, fontWeight:700, color:th.txtMuted, textTransform:"uppercase", letterSpacing:0, marginBottom:10 }}>
            {lang==="bn" ? "লাইভ প্রিভিউ" : "Live Preview"} — 210mm × 90mm
          </div>

          <div style={{ overflowX:"auto", paddingBottom:8 }}>
            {/* ─── SCREEN-ONLY CHEQUE PREVIEW ─── */}
            <div
              id="cheque-screen-preview"
              style={{
                width:794, height:302,
                background:"#fdfcf6",
                position:"relative",
                border:"1px solid #c4a87a",
                boxShadow:"0 4px 18px rgba(0,0,0,0.18)",
                fontFamily:"'Times New Roman', Georgia, serif",
                overflow:"hidden", flexShrink:0, marginBottom:8,
              }}
            >
              {/* Guilloche watermark pattern */}
              <div style={{
                position:"absolute", inset:0, opacity:0.04, pointerEvents:"none",
                backgroundImage:"repeating-linear-gradient(45deg,#8b6914 0,#8b6914 1px,transparent 0,transparent 50%)",
                backgroundSize:"80px 80px",
              }} />

              {/* Security micro-strip right edge */}
              <div style={{
                position:"absolute", top:0, right:0, width:7, bottom:0, pointerEvents:"none",
                backgroundImage:"repeating-linear-gradient(180deg,#c0a040 0,#c0a040 3px,#e8d070 3px,#e8d070 6px)",
                opacity:0.45,
              }} />

              {/* Inner border frame */}
              <div style={{ position:"absolute", inset:6, border:"0.75px solid #c8ac82", pointerEvents:"none" }} />

              {/* Bank-name watermark */}
              <div style={{
                position:"absolute", top:"50%", left:"50%",
                transform:"translate(-50%,-50%) rotate(-28deg)",
                fontSize:48, fontWeight:900,
                color:"rgba(139,105,20,0.04)",
                whiteSpace:"nowrap", pointerEvents:"none",
                letterSpacing:5, fontFamily:"Arial Black, sans-serif",
              }}>
                {bank.name.toUpperCase()}
              </div>

              {/* ── CHEQUE CONTENT ── */}
              <div style={{ position:"absolute", inset:0, padding:"14px 20px 34px" }}>

                {/* Row 1: Bank header + Date (top-right) */}
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>

                  {/* Bank identity — NO software branding here */}
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    {/* Bank color badge as logo placeholder */}
                    <div style={{
                      width:40, height:40, borderRadius:7,
                      background:bank.color,
                      display:"flex", flexDirection:"column",
                      alignItems:"center", justifyContent:"center",
                      fontSize:8.5, fontWeight:800, color:"#fff",
                      flexShrink:0, textAlign:"center", lineHeight:1.25,
                      letterSpacing:0.3, padding:2,
                    }}>
                      {bank.short}
                    </div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:"#1a1a1a", letterSpacing:0.2 }}>{bank.name}</div>
                      <div style={{ fontSize:8.5, color:"#666", marginTop:1 }}>SWIFT: {bank.swift} · Bank Code: {bank.code}</div>
                    </div>
                  </div>

                  {/* Date boxes */}
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:8.5, color:"#555", fontStyle:"italic", marginBottom:3 }}>Date</div>
                    {previewDateBoxes()}
                  </div>
                </div>

                {/* Row 2: Account / IBAN (pre-printed on physical cheque, shown dimmed) */}
                <div style={{ display:"flex", gap:18, marginBottom:6, opacity:0.45 }}>
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    <span style={{ fontSize:8.5, color:"#555" }}>Account No.</span>
                    <div style={{
                      borderBottom:"1.5px solid #9b8060", minWidth:130,
                      height:14, background:"rgba(0,0,0,0.03)",
                    }} />
                  </div>
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    <span style={{ fontSize:8.5, color:"#555" }}>IBAN</span>
                    <div style={{
                      borderBottom:"1.5px solid #9b8060", minWidth:190,
                      height:14, background:"rgba(0,0,0,0.03)",
                    }} />
                  </div>
                </div>

                {/* Row 3: Pay to + Amount box */}
                <div style={{ display:"flex", alignItems:"flex-end", gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:10.5, color:"#444", fontStyle:"italic", whiteSpace:"nowrap", flexShrink:0 }}>
                    Pay to the order of
                  </span>
                  <div style={{
                    flex:1, borderBottom:"1.5px solid #9b8060",
                    height:24, display:"flex", alignItems:"flex-end",
                    paddingBottom:2, minWidth:0,
                  }}>
                    <span style={{
                      fontSize:14, fontWeight:800, color:"#1a1a1a",
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%",
                    }}>
                      {payee || "\u00a0"}
                    </span>
                  </div>
                  {/* Amount box */}
                  <div style={{ flexShrink:0 }}>
                    <div style={{ fontSize:7.5, color:"#555", textAlign:"center", marginBottom:1 }}>AED</div>
                    <div style={{ border:"1.5px solid #7a3e0e", background:"#faf3e0", padding:"4px 14px", minWidth:115, textAlign:"center" }}>
                      <div style={{ fontSize:14, fontWeight:800, fontFamily:"'Courier New',monospace", color:"#1a1a1a", letterSpacing:0 }}>
                        {fmtAmount(amount) || "0.00"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 4: Amount in words */}
                <div style={{ display:"flex", alignItems:"flex-end", gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:9.5, color:"#444", fontStyle:"italic", whiteSpace:"nowrap", flexShrink:0 }}>
                    Amount in words
                  </span>
                  <div style={{
                    flex:1, borderBottom:"1.5px solid #9b8060",
                    height:20, display:"flex", alignItems:"flex-end",
                    paddingBottom:2, minWidth:0,
                  }}>
                    <span style={{
                      fontSize:11, color:"#1a1a1a", fontStyle:"italic",
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%",
                    }}>
                      {words ? `${words} Only` : "\u00a0"}
                    </span>
                  </div>
                </div>

                {/* Row 5: Company info (pre-printed) + Signature */}
                <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between" }}>
                  {/* Pre-printed company details on cheque (shown dimmed) */}
                  <div style={{ opacity:0.5, lineHeight:1.5 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:"#222", textTransform:"uppercase", letterSpacing:0.3 }}>
                      {shopName || "YOUR COMPANY NAME"}
                    </div>
                    <div style={{ fontSize:8.5, color:"#555" }}>
                      {shopAccount
                        ? `Account No. ${shopAccount}`
                        : "Account No. ────────────────"}
                    </div>
                    <div style={{ fontSize:8.5, color:"#555", fontFamily:"monospace" }}>
                      {shopIban
                        ? `IBAN: ${shopIban}`
                        : "IBAN: ──────────────────────"}
                    </div>
                  </div>
                  {/* Signature line */}
                  <div style={{ textAlign:"right" }}>
                    <div style={{ width:165, borderBottom:"1px solid #9b8060", marginBottom:3 }} />
                    <div style={{ fontSize:8.5, color:"#555", fontStyle:"italic" }}>Authorised Signatory</div>
                  </div>
                </div>
              </div>

              {/* MICR strip (pre-printed on physical cheque, shown dimmed) */}
              <div style={{
                position:"absolute", bottom:0, left:0, right:0, height:34,
                background:"rgba(0,0,0,0.03)", borderTop:"1px solid #d4b896",
                display:"flex", alignItems:"center", padding:"0 18px",
                justifyContent:"space-between", opacity:0.6,
              }}>
                <div>
                  <div style={{ fontFamily:"'Courier New',monospace", fontSize:11.5, color:"#111", letterSpacing:"0.18em" }}>
                    ⑆────────⑆
                  </div>
                  <div style={{ fontSize:7.5, color:"#888", fontStyle:"italic" }}>Cheque No.</div>
                </div>
                <div>
                  <div style={{ fontFamily:"'Courier New',monospace", fontSize:11.5, color:"#111", letterSpacing:"0.18em" }}>
                    ⑆──────────────⑆
                  </div>
                  <div style={{ fontSize:7.5, color:"#888", fontStyle:"italic" }}>Account No.</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontFamily:"'Courier New',monospace", fontSize:11.5, color:"#111", letterSpacing:"0.18em" }}>
                    ⑆{bank.code}⑆
                  </div>
                  <div style={{ fontSize:7.5, color:"#888", fontStyle:"italic" }}>Bank Code</div>
                </div>
              </div>
            </div>
          </div>

          {/* Info box */}
          <div style={{ ...s.card, fontSize:12, color:th.txtMuted, lineHeight:1.9 }}>
            <div style={{ fontSize:11, fontWeight:700, color:th.txtSecondary, marginBottom:6, textTransform:"uppercase", letterSpacing:0 }}>
              ℹ️ {lang==="bn" ? "প্রিন্ট নির্দেশনা" : "Print Instructions"}
            </div>
            <div>📐 {lang==="bn" ? "UAE চেক সাইজ: 210mm × 90mm" : "UAE standard cheque: 210mm × 90mm"}</div>
            <div>🖨️ {lang==="bn" ? "প্রিন্টার সেটিং: Landscape, Margins → None, Scale → 100%" : "Printer: Landscape · Margins: None · Scale: 100%"}</div>
            <div>📋 {lang==="bn" ? "প্রতিটি ব্যাংকের চেকে field position একটু আলাদা হতে পারে" : "Field positions may vary slightly per bank"}</div>
            <div>✅ {lang==="bn" ? "আসল চেকে দেওয়ার আগে সাদা কাগজে মিলিয়ে নিন" : "Verify alignment on plain paper before printing on real cheque"}</div>
          </div>
        </div>
      </div>

      {/* ── Vendor cheque folders ── */}
      {!foldersVisible&&onUnlockFolders&&(
        <button onClick={onUnlockFolders} style={{ ...s.card, marginTop:16, width:"100%", display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontFamily:"inherit", textAlign:"left", border:`1px solid ${th.border}` }}>
          <span style={{ fontSize:24 }}>🔒</span>
          <span style={{ flex:1, fontSize:13, fontWeight:800, color:th.txtPrimary }}>{lang==="bn"?"ভেন্ডর চেক ফোল্ডার লক করা — দেখতে পিন দিন":"Vendor cheque folders are locked — enter PIN to view"}</span>
          <span style={{ fontSize:13, fontWeight:800, color:"#2563eb" }}>🔓</span>
        </button>
      )}
      {foldersVisible&&(()=>{
        const bn = lang==="bn";
        const cur = t.cur || "AED";
        const folders = new Map();
        vendorCheques.forEach(v => {
          const k = v.vendorId || `n:${v.vendorName||""}`;
          const f = folders.get(k) || { key:k, name:v.vendorName||"—", items:[], total:0 };
          f.items.push(v); f.total += chequeAmountOfVoucher(v);
          folders.set(k, f);
        });
        const q = folderSearch.trim().toLowerCase();
        const list = [...folders.values()].filter(f => !q || f.name.toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name));
        const open = openFolder && folders.get(openFolder);
        const btn = (bg, col, bd) => ({ padding:"7px 10px", borderRadius:8, border:bd||"none", background:bg, color:col, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" });
        return (
          <div style={{ ...s.card, marginTop:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:800, color:th.accent, flex:1 }}>
                {open
                  ? <><button onClick={()=>setOpenFolder(null)} style={{ ...btn("transparent", th.accent), padding:"0 8px 0 0" }}>←</button>📂 {open.name}</>
                  : <>📁 {bn?"ভেন্ডর চেক ফোল্ডার":"Vendor cheque folders"} <span style={{ fontSize:11, color:th.txtMuted, fontWeight:600 }}>({vendorCheques.length})</span></>}
              </div>
              {!open&&<input value={folderSearch} onChange={e=>setFolderSearch(e.target.value)} placeholder={bn?"ভেন্ডর খুঁজুন…":"Search vendor…"} style={{ ...inp, width:isDesktop?220:"100%", padding:"7px 10px", fontSize:13 }} />}
              {onLockFolders&&<button onClick={()=>{ setOpenFolder(null); onLockFolders(); }} style={btn("transparent", th.txtSecondary, `1px solid ${th.borderMid}`)}>🔒 {bn?"লক":"Lock"}</button>}
            </div>
            {!open&&(list.length===0
              ? <div style={{ fontSize:12, color:th.txtMuted, padding:"12px 0" }}>{bn?"এখনো কোনো ভেন্ডর ভাউচারের চেক প্রিন্ট হয়নি। পারচেজ → পেমেন্ট → 🖨️ ভেন্ডর চেক থেকে শুরু করুন।":"No vendor voucher cheques printed yet. Start from Purchase → Payments → 🖨️ Vendor Cheque."}</div>
              : <div style={{ display:"grid", gridTemplateColumns:isDesktop?"repeat(auto-fill,minmax(220px,1fr))":"1fr", gap:8 }}>
                  {list.map(f=>(
                    <button key={f.key} onClick={()=>setOpenFolder(f.key)} style={{ textAlign:"left", padding:"10px 12px", borderRadius:10, border:`1px solid ${th.border}`, background:th.bgInp, cursor:"pointer", fontFamily:"inherit" }}>
                      <div style={{ fontSize:13, fontWeight:800, color:th.txtPrimary }}>📁 {f.name}</div>
                      <div style={{ fontSize:11, color:th.txtMuted, marginTop:2 }}>{f.items.length} {bn?"টি চেক":"cheques"} · {cur} {f.total.toFixed(2)}</div>
                    </button>
                  ))}
                </div>)}
            {open&&(
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {open.items.map(v=>(
                  <div key={v.id} style={{ padding:"10px 12px", borderRadius:10, border:`1px solid ${th.border}`, background:th.bgInp }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:8, flexWrap:"wrap" }}>
                      <div style={{ fontSize:13, fontWeight:800, color:th.txtPrimary }}>{v.paymentNo} · 📃 {v.chequeNo||"—"}</div>
                      <div style={{ fontSize:14, fontWeight:900, color:"#22c55e" }}>{cur} {chequeAmountOfVoucher(v).toFixed(2)}</div>
                    </div>
                    <div style={{ fontSize:11, color:th.txtMuted, marginTop:2 }}>
                      🏦 {v.chequeBank||"—"} · 📅 {v.chequeDate||"—"} · 🖨️ {String(v.chequePrintedAt).slice(0,10)}{v.chequePrintCount>1?` ×${v.chequePrintCount}`:""}
                      {v.handover?.receiverName?` · 🪪 ${v.handover.receiverName}`:""}
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
                      <button onClick={()=>{ loadVoucherIntoForm(v); window.scrollTo?.({ top:0, behavior:"smooth" }); }} style={btn("linear-gradient(135deg,#f97316,#ea580c)", "#fff")}>🖨️ {bn?"আবার প্রিন্ট":"Reprint"}</button>
                      <button onClick={()=>printWithSettings(chequeVoucherHtml(v, shop, chequeDocOpts(v)), { lang })} style={btn("rgba(59,130,246,0.08)", "#3b82f6", "1px solid #3b82f6")}>📄 {bn?"ভাউচার":"Voucher"}</button>
                      {v.handover
                        ? <button onClick={async ()=>printWithSettings(chequeHandoverHtml(v, shop, await loadHandoverDocs(v), chequeDocOpts(v)), { lang })} style={btn("rgba(34,197,94,0.08)", "#22c55e", "1px solid #22c55e")}>🪪 {bn?"হস্তান্তর প্রিন্ট":"Print Handover"}</button>
                        : onOpenHandover&&<button onClick={()=>onOpenHandover(v)} style={btn("rgba(34,197,94,0.08)", "#22c55e", "1px solid #22c55e")}>🪪 {bn?"হস্তান্তর ডকুমেন্ট":"Handover"}</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ════════════════════════════════════════
          PRINT-ONLY AREA
          Hidden on screen. When window.print() is called,
          ONLY this div is shown — positioned on a
          transparent page so the text lands on the
          pre-printed physical cheque leaf.
      ════════════════════════════════════════ */}
      <div id="cheque-print-area">
        {/* Payee name */}
        {payee && (
          <div style={{
            position:"absolute",
            top:`${P.payeeTop}mm`,
            left:`${P.payeeLeft}mm`,
            maxWidth:`${P.payeeMaxW}mm`,
            fontSize:"12.5pt", fontWeight:"700",
            fontFamily:"Arial, Helvetica, sans-serif",
            color:"#000", whiteSpace:"nowrap",
            overflow:"hidden",
          }}>
            {payee}
          </div>
        )}

        {/* Amount in numbers (right-aligned in the AED box) */}
        {amount && (
          <div style={{
            position:"absolute",
            top:`${P.amtTop}mm`,
            right:`${P.amtRight}mm`,
            fontSize:"13pt", fontWeight:"700",
            fontFamily:"'Courier New', Courier, monospace",
            color:"#000",
          }}>
            {fmtAmount(amount)}
          </div>
        )}

        {/* Amount in words */}
        {words && (
          <div style={{
            position:"absolute",
            top:`${P.wordsTop}mm`,
            left:`${P.wordsLeft}mm`,
            maxWidth:`${P.wordsMaxW}mm`,
            fontSize:"11pt",
            fontFamily:"Arial, Helvetica, sans-serif",
            color:"#000", whiteSpace:"nowrap",
            overflow:"hidden",
          }}>
            {words} Only
          </div>
        )}

        {/* Date — selected format printed on cheque */}
        {dateMode !== "box" && chequeDateText && (
          <div style={{
            position:"absolute",
            top:`${P.dateTop}mm`,
            left:`${P.dateDDLeft}mm`,
            fontSize:"11.5pt",
            fontWeight:"700",
            fontFamily:"'Courier New', Courier, monospace",
            color:"#000",
            letterSpacing:0,
            wordSpacing:0,
            whiteSpace:"nowrap",
            lineHeight:1,
          }}>
            {chequeDateText}
          </div>
        )}

        {/* Date — box/digit mode for cheques with date boxes */}
        {dateMode === "box" && (
          <>
            {dd && (
              <div style={{
                position:"absolute",
                top:`${P.dateTop}mm`,
                left:`${P.dateDDLeft}mm`,
                fontSize:"11.5pt", fontWeight:"700",
                fontFamily:"'Courier New', Courier, monospace",
                color:"#000", letterSpacing:"0.18em",
              }}>{dd}</div>
            )}
            {mm && (
              <div style={{
                position:"absolute",
                top:`${P.dateTop}mm`,
                left:`${P.dateMMLeft}mm`,
                fontSize:"11.5pt", fontWeight:"700",
                fontFamily:"'Courier New', Courier, monospace",
                color:"#000", letterSpacing:"0.18em",
              }}>{mm}</div>
            )}
            {yyyy && (
              <div style={{
                position:"absolute",
                top:`${P.dateTop}mm`,
                left:`${P.dateYYLeft}mm`,
                fontSize:"11.5pt", fontWeight:"700",
                fontFamily:"'Courier New', Courier, monospace",
                color:"#000", letterSpacing:"0.18em",
              }}>{yyyy}</div>
            )}
          </>
        )}
      </div>

      {/* ── PRINT STYLES ── */}
      <style>{`
        /* The print layer is only a template; printCheque() prints a copy of it */
        #cheque-print-area {
          display: none;
        }
      `}</style>
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
function DashboardTab({ t, lang, th, s, profile, userUid, localShop, orders, cos, products, team, vendors, customers, isOwner, isDesktop, setTab, unread, staffQuickNavKeys, canUseBranchTransfer, btInbox=[], orderModuleEnabled, finance, moneyLocked=false, onUnlockMoney, onLockMoney, toast, onOpenMenu }) {
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

  const quickCard = (item) => (
    <button
      key={item.key}
      onClick={()=>setTab(item.key)}
      style={{
        ...glassCard,
        borderRadius:16,
        padding:isDesktop?"18px 10px":"14px 8px",
        minHeight:isDesktop?104:94,
        cursor:"pointer",
        fontFamily:"inherit",
        display:"flex",
        flexDirection:"column",
        alignItems:"center",
        justifyContent:"center",
        gap:9,
        position:"relative",
        color:th.txtPrimary,
      }}
    >
      {item.badge>0 && (
        <span style={{ position:"absolute", top:8, right:8, background:"linear-gradient(135deg,#fb7185,#ef4444)", color:"#fff", borderRadius:999, padding:"2px 8px", fontSize:10, fontWeight:900, boxShadow:"0 8px 18px rgba(239,68,68,0.35)" }}>
          {item.badge}
        </span>
      )}
      <span style={{ fontSize:isDesktop?28:25, filter:"drop-shadow(0 8px 14px rgba(96,165,250,0.28))" }}>{item.icon}</span>
      <span style={{ fontSize:isDesktop?13:12, fontWeight:800, color:th.txtSecondary, textAlign:"center", lineHeight:1.2 }}>{item.label}</span>
    </button>
  );

  return (
    <div style={panelStyle}>
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

      <div style={sectionTitle}><span>{t.dashQuickNav}</span></div>
      <div style={{ display:"flex", flexDirection:"column", gap:isDesktop?10:8, marginBottom:!isDesktop?18:0 }}>
        {groupMenuItems(navItems.map(item=>[item.key,item]), lang).map(g=>(
          <div key={g.key}>
            {g.label&&<div style={{ fontSize:11, fontWeight:900, letterSpacing:0.4, textTransform:"uppercase", color:isLightDash?"#1e3a8a":"#cbd5e1", margin:"2px 2px 6px" }}>{g.icon} {g.label}</div>}
            <div style={{ display:"grid", gridTemplateColumns:isDesktop?"repeat(6, minmax(0,1fr))":"repeat(3, minmax(0,1fr))", gap:isDesktop?10:8 }}>
              {g.items.map(([,item])=>quickCard(item))}
            </div>
          </div>
        ))}
      </div>

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
    if (newPw.length < 6) {
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
  const [newPosition,setNewPosition]=useState("");
  const [showAddPos,setShowAddPos]=useState(false);

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
  const [chequePrefill,setChequePrefill]=useState(null);
  const [ownerUnlocked,setOwnerUnlocked]=useState(false);
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
      toast("Product sync remains locked to prevent old data returning. Retry Clear & Import or contact support.", "err");
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
  setEditingOrderId(order.id);
  setSelOrder(null);
  window.scrollTo({top:0,behavior:"smooth"});
};

  const cancelEditOrder = () => {
    setEditingOrderId(null);
    setItems([]);
    setCurrentItem(newItem());
    setNote("");
  };

  const sendOrder = async () => {
    const valid = items.filter(it=>it.name.trim());
    if (!valid.length) return toast(t.e1,"err");
    // ── EDIT MODE: update existing order ──
    if (editingOrderId) {
      try {
        const existing = orders.find(o => o.id === editingOrderId) || {};
        const nowIso = new Date().toISOString();

        const payload = {
          ...existing,
          shopId,
          items: valid.map(it=>({name:it.name,code:it.code||"",brand:it.brand||"",qty:it.qty||"",unit:it.unit||"Pcs",price:"",status:"pending",co:null})),
          note: note || "",
          updatedAt: nowIso,
          updatedBy: user?.uid || "",
        };

        const result = await offlineUpdate("orders", editingOrderId, payload);
        const updated = { ...result.data, id: editingOrderId };

        setOrders(prev => prev.map(o => o.id === editingOrderId ? updated : o));

        setEditingOrderId(null);
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

    const payload = {
      ...existing,
      ...patch,
      shopId,
      updatedAt: nowIso,
      updatedBy: user?.uid || "",
    };

    const result = await offlineUpdate("orders", oId, payload);
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

  const addPosition = async () => {
    if (!newPosition.trim()) return;
    const positions=[...(localShop?.positions||[]),newPosition.trim()];
    try {
      const updated = await saveShopRecord(shopId, { positions }, { ownerUid: user?.uid, profile, user });
      setLocalShop(updated);
      setNewPosition("");
      setShowAddPos(false);
      toast(t.positionAdded);
    } catch(e) { hErr(e); }
  };
  const deletePosition = async (pos) => {
    const positions=(localShop?.positions||[]).filter(p=>p!==pos);
    try {
      const updated = await saveShopRecord(shopId, { positions }, { ownerUid: user?.uid, profile, user });
      setLocalShop(updated);
      toast(t.positionDeleted,"err");
    } catch(e) { hErr(e); }
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
    if (staffForm.password.length < 6) {
      return toast(lang==="bn"?"password অন্তত ৬ অক্ষর":"Password must be at least 6 characters","err");
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
      setStaffForm({ username:"", password:"", personName:"", mobile:"", position:"Salesman" });
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
    if (pw.length < 6) {
      return toast(lang==="bn"?"password অন্তত ৬ অক্ষর":"Password must be at least 6 characters","err");
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
  const returnTabLabels = {
    salesReturn: lang==="bn"?"↩️ সেলস রিটার্ন":"↩️ Sales Return",
    purchaseReturn: lang==="bn"?"↪️ পারচেজ রিটার্ন":"↪️ Purchase Return",
    stockAdjust: lang==="bn"?"⚖️ স্টক সমন্বয়":"⚖️ Stock Adjustment",
    auditLog: lang==="bn"?"🕵️ অডিট লগ":"🕵️ Audit Log",
  };

  const visibleTabs = isOwner
    ? [["dashboard",t.tabDashboard],...(orderModuleEnabled?[["owner",t.tabOwner]]:[]),["products",t.tabProducts],["purchase",t.tabPurchase],["sales",t.tabSales],["quotation",t.tabQuotation],["delivery",t.tabDelivery],["vendors",t.tabVendor],["customers",t.tabCustomer],["cheque",t.tabCheque],["pdc",lang==="bn"?"📃 PDC চেক":"📃 PDC Cheques"],["expenses",lang==="bn"?"💸 খরচ":"💸 Expenses"],["vouchers",lang==="bn"?"🧾 ভাউচার":"🧾 Vouchers"],["salesReturn",returnTabLabels.salesReturn],["purchaseReturn",returnTabLabels.purchaseReturn],["stockAdjust",returnTabLabels.stockAdjust],["accounts",lang==="bn"?"📊 হিসাব নিকাশ":"📊 Accounts"],["tax",lang==="bn"?"🏛️ ট্যাক্স / VAT":"🏛️ Tax / VAT"],["auditLog",returnTabLabels.auditLog],...(canUseBranchTransfer?[["branchTransfer",branchTransferMenuLabel(lang, btInbox.length)]]:[]),["settings",t.tabSettings]]
    : [
        ["dashboard",t.tabDashboard],
        ...(orderModuleEnabled?[["shop",t.tabShop]]:[]),
        ...(can("viewProducts")?[["products",t.tabProducts]]:[]),
        ...(can("manageSales")?[["sales", t.tabSales],["quotation", t.tabQuotation],["delivery", t.tabDelivery]]:[]),
        ["purchase", canStaffSupplierArea ? t.tabPurchase : (lang==="bn"?"📦 ক্রয় তথ্য":"📦 Purchase Info")],
        ...(can("viewVendors")||can("manageVendors")?[["vendors",t.tabVendor]]:[]),
        ...(can("printCheques")?[["cheque",t.tabCheque]]:[]),
        ...(can("managePdc")?[["pdc",lang==="bn"?"📃 PDC চেক":"📃 PDC Cheques"]]:[]),
        ...(can("manageExpenses")?[["expenses",lang==="bn"?"💸 খরচ":"💸 Expenses"]]:[]),
        ...(canStaffVouchers?[["vouchers",lang==="bn"?"🧾 ভাউচার":"🧾 Vouchers"]]:[]),
        ...(can("manageReturns")?[["salesReturn",returnTabLabels.salesReturn],["purchaseReturn",returnTabLabels.purchaseReturn]]:[]),
        ...(can("stockAdjust")?[["stockAdjust",returnTabLabels.stockAdjust]]:[]),
        ...(canUseBranchTransfer?[["branchTransfer",branchTransferMenuLabel(lang, btInbox.length)]]:[]),
        ["settings",t.tabSettings],
      ];
  const validTabs = visibleTabs;

  // Safety: if any old/invalid tab is active after new menu changes, always return to Dashboard.
  useEffect(() => {
    if (!validTabs.some(([k]) => k === tab)) setTabState("dashboard");
  }, [tab, validTabs]);

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
              type="customer" columnMap={CM_IMPORT_COLUMNS} defaultFields={{ ...EMPTY_CUSTOMER, customerType:"Customer", status:"active", country:"UAE", paymentType:"credit" }}
              collection="customers"
              onClose={close}
              onImported={(n)=>{ close(); toast(`✅ ${n} ${lang==="bn"?"জন কাস্টমার ইমপোর্ট হয়েছে":"customers imported!"}`); }} />
          )}
        />
      )}

      {(isOwner || can("viewVendors") || can("manageVendors"))&&tab==="vendors"&&(
        <VendorMasterScreen
          t={t} lang={lang} cur={t.cur||"AED"}
          shopId={shopId} user={user}
          vendors={vendors} toast={toast} canDelete={isOwner} canEdit={isOwner||can("manageVendors")}
          leaveGuard={billLeaveGuard}
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
              onImported={(n)=>{ close(); toast(`✅ ${n} ${lang==="bn"?"জন ভেন্ডর ইমপোর্ট হয়েছে":"vendors imported!"}`); }} />
          )}
        />
      )}

      {tab==="purchase"&&canStaffSupplierArea&&(
        <PurchaseInvoiceTab
          t={t} lang={lang} th={th} s={s}
          shopId={shopId} user={user} profile={profile}
          vendors={vendors} products={products}
          shop={localShop} toast={toast} isDesktop={isDesktop} wideDesktop={windowWidth >= 1100}
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
        />
      )}

      {tab==="purchase"&&!canStaffSupplierArea&&(
        <div style={isDesktop?s.desktopPanel:s.panel}>
          <PiSalesmanView t={t} lang={lang} th={th} shopId={shopId} syncRefreshKey={syncRefreshKey} showCost={isOwner||canSeeProductCost} />
        </div>
      )}

      {(isOwner || can("manageSales")) && ["sales","quotation","delivery"].includes(tab)&&(
        <SalesInvoiceTab
          key={tab}
          kind={tab}
          quoteToConvert={tab==="sales" ? quoteToConvert : null}
          onConvertQuote={(q)=>{ setQuoteToConvert(q); setTabState("sales"); }}
          onQuoteConvertHandled={()=>setQuoteToConvert(null)}
          openNewRequest={tab==="sales" ? siNewReq : 0}
          openNewCustomer={siNewCustomer}
          onOpenNewHandled={()=>{ setSiNewReq(0); setSiNewCustomer(null); }}
          voucherRequest={tab==="sales" ? siVoucherReq : 0}
          onVoucherHandled={()=>setSiVoucherReq(0)}
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

      {tab==="expenses"&&(isOwner||can("manageExpenses"))&&(
        <ExpensesTab lang={lang} th={th} s={s} shopId={shopId} user={user} profile={profile} isOwner={isOwner}
          cur={t.cur||"AED"} isDesktop={isDesktop} toast={toast} shopName={localShop?.companyName||""} leaveGuard={billLeaveGuard} />
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
          isOwner && { id:"pin", icon:"🔒", label:bnS?"মালিকের পিন":"Owner PIN", sub:bnS?"ড্যাশবোর্ডের টাকা, Accounts ও চেক ফোল্ডার — পিন সেট / পরিবর্তন":"Dashboard money, Accounts & cheque folders — set / change PIN", action:()=>setPinModal("reset") },
          localShop && { id:"shop", icon:"🏢", label:plain(t.shopInfoTitle), sub:`${localShop.companyName||""}${!isOwner?(bnS?" · শুধু দেখা":" · View only"):""}` },
          isOwner && { id:"invite", icon:"🔗", label:plain(t.inviteCodeTitle), sub:`${inviteCodes.filter(c=>!c.used).length} ${bnS?"টি active":"active"}` },
          isOwner && { id:"positions", icon:"📋", label:plain(t.managePositionsTitle), sub:`${(localShop?.positions||[]).length} ${bnS?"টি পদবী":"positions"}` },
          (isOwner || team.length>0) && { id:"team", icon:"👥", label:plain(t.teamTitle), sub:`${team.length} ${bnS?"জন সদস্য":"members"}` },
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
          { key:"company", label:bnS?"🏢 অ্যাকাউন্ট ও দোকান":"🏢 Account & Company", ids:["profile","shop","pin","license"] },
          { key:"team", label:bnS?"👥 টিম":"👥 Team", ids:["team","invite","positions"] },
          { key:"features", label:bnS?"🧩 ফিচার":"🧩 Features", ids:["orderModule","branchTransfer","wastyle"] },
          { key:"display", label:bnS?"🎨 দেখা ও প্রিন্ট":"🎨 Display & Print", ids:["print","theme","language"] },
          { key:"data", label:bnS?"💾 ডেটা ও সিস্টেম":"💾 Data & System", ids:["backup","sync","update"] },
          { key:"help", label:bnS?"❓ সাহায্য":"❓ Help", ids:["help"] },
        ].map(g=>({ ...g, items:g.ids.map(id=>items.find(it=>it.id===id)).filter(Boolean) }))
          .concat([{ key:"other", label:"", items:items.filter(it=>!["profile","shop","pin","license","team","invite","positions","orderModule","branchTransfer","wastyle","print","theme","language","backup","sync","update","help"].includes(it.id)) }])
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

          {stPage==="positions"&&isOwner&&(
            <div style={s.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={s.settingsLbl}>{t.managePositionsTitle}</div>
                <button style={s.addCoBtn} onClick={()=>setShowAddPos(!showAddPos)}>{showAddPos?`✕ ${t.cancel}`:t.addPositionBtn}</button>
              </div>
              {showAddPos&&(
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:11, color:"#71717a", marginBottom:6 }}>{lang==="bn"?"👇 বেছে নিন বা নিজে লিখুন:":"👇 Pick one or type custom:"}</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
                    {PRESET_POSITIONS[lang].map(p=>(
                      <button key={p} onClick={()=>setNewPosition(p)}
                        style={{ padding:"5px 11px", borderRadius:20, border:`1px solid ${th.border}`, background:newPosition===p?"#f97316":"transparent", color:newPosition===p?"#fff":th.txtMuted, cursor:"pointer", fontSize:12, fontWeight:600 }}>
                        {p}
                      </button>
                    ))}
                  </div>
                  <div style={s.row}>
                    <input style={{ ...s.inp, flex:1 }} placeholder={t.positionNameP} value={newPosition}
                      onChange={e=>setNewPosition(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addPosition()} />
                    <button style={s.savBtn} onClick={addPosition}>{t.addBtn}</button>
                  </div>
                </div>
              )}
              {(!localShop?.positions||localShop.positions.length===0)
                ? <div style={{ fontSize:12, color:"#71717a" }}>{t.noPositions}</div>
                : localShop.positions.map((pos,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 0", borderTop:i>0?`1px solid ${th.border}`:"none" }}>
                      <span style={{ fontSize:13, color:th.txtPrimary }}>👤 {pos}</span>
                      <button style={s.dlBtn} onClick={()=>deletePosition(pos)}>🗑️</button>
                    </div>
                  ))
              }
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
                      <div style={{ fontSize:10, color:"#71717a", marginBottom:8, textTransform:"uppercase", letterSpacing:0, fontWeight:700 }}>{t.permissionsTitle}</div>
                      {PERMISSIONS_LIST.map((perm,pi)=>{
                        const mPerms = { ...DEFAULT_PERMISSIONS, ...(m.permissions || {}) };
                        const isOn   = mPerms[perm.key]===true;
                        return (
                          <div key={perm.key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 0", borderTop:pi>0?`1px solid ${th.border}`:"none" }}>
                            <span style={{ fontSize:12, color:th.txtPrimary }}>{perm[lang]}</span>
                            <PermToggle isOn={isOn} onToggle={()=>{ savePermissions(m,{ ...mPerms, [perm.key]:!isOn }); }} />
                          </div>
                        );
                      })}
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
            </>
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
        rightSlot={<NotificationBell lang={lang} theme={theme} items={notificationItems} />}
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
