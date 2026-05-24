import { useState, useEffect, useRef } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "firebase/auth";
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
} from "firebase/firestore";
import {
  auth,
  db,
  FIREBASE_READY,
  COUNTRIES,
  generateInviteCode,
  friendlyAuthError,
} from "./firebase-config";

const LOGO_URL = "https://raw.githubusercontent.com/s4businessthinking-cmyk/S4BUSINESSTHINKING/refs/heads/main/WhatsApp%20Image%202026-04-09%20at%2011.44.43%20AM.jpeg";
const APP_NAME = "S4 Business Thinking";

// ─── PRESET POSITIONS ────────────────────────────────────────
const PRESET_POSITIONS = {
  bn: ["সিনিয়র সেলসম্যান", "জুনিয়র সেলসম্যান", "ম্যানেজার", "ক্যাশিয়ার", "স্টোরকিপার", "ডেলিভারি ম্যান", "অ্যাকাউন্ট্যান্ট", "সুপারভাইজার"],
  en: ["Senior Salesman", "Junior Salesman", "Manager", "Cashier", "Storekeeper", "Delivery Man", "Accountant", "Supervisor"],
};

// ─── PERMISSIONS ────────────────────────────────────────────
const PERMISSIONS_LIST = [
  { key: "sendOrder",       bn: "অর্ডার দেওয়া",           en: "Send Orders" },
  { key: "manageCompanies", bn: "কোম্পানি ম্যানেজ করা",    en: "Manage Companies" },
  { key: "setPrices",       bn: "দাম সেট করা",             en: "Set Prices" },
  { key: "setStatus",       bn: "স্ট্যাটাস পরিবর্তন করা",  en: "Change Item Status" },
  { key: "markDelivery",    bn: "ডেলিভারি মার্ক করা",      en: "Mark as Delivered" },
  { key: "deleteOrder",     bn: "অর্ডার ডিলিট করা",        en: "Delete Orders" },
  { key: "viewProducts",   bn: "পণ্য তালিকা দেখা",          en: "View Product List" },
];

const DEFAULT_PERMISSIONS = {
  sendOrder: true,
  manageCompanies: false,
  setPrices: false,
  setStatus: false,
  markDelivery: false,
  deleteOrder: false,
  viewProducts: false,
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
    mobileLbl:"মোবাইল নম্বর *", emailLbl:"ইমেইল *",
    passwordLbl:"পাসওয়ার্ড * (অন্তত ৬ অক্ষর)", confirmPwLbl:"পাসওয়ার্ড নিশ্চিত করুন *",
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
    tabSettings:"⚙️ সেটিংস", settingsTitle:"⚙️ অ্যাপ সেটিংস",
    profileTitle:"👤 প্রোফাইল", shopInfoTitle:"🏢 দোকানের তথ্য",
    inviteCodeTitle:"🔗 কর্মী Invite Code",
    inviteCodeDesc:"এই কোডটি আপনার কর্মীদের দিন। তারা signup এর সময় এই কোড দিয়ে আপনার দোকানে যুক্ত হতে পারবে।",
    copyCode:"📋 কপি করুন", codeCopied:"✅ কপি হয়েছে!",
    languageLbl:"ভাষা", syncStatus:"সিঙ্ক স্ট্যাটাস",
    connected:"🟢 সংযুক্ত (রিয়েল-টাইম)", connecting:"🟡 সংযোগ হচ্ছে...", offline:"🔴 অফলাইন",
    teamTitle:"👥 টিম মেম্বার", youLabel:"আপনি", ownerLabel:"মালিক", salesmanLabel:"কর্মী",
    confirmLogout:"লগআউট করতে চান?",
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
    n9:"অ্যাকাউন্ট তৈরি হয়েছে! ইমেইল যাচাই করুন।",
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
    si_delivery:"ডেলিভারি চালান",
    si_deliveryDesc:"শুধু পণ্য ও পরিমাণ, কোনো মূল্য নেই",
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
    pi_pmSearchPh:"পণ্য খুঁজুন...",
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
    mobileLbl:"Mobile Number *", emailLbl:"Email *",
    passwordLbl:"Password * (min 6 characters)", confirmPwLbl:"Confirm Password *",
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
    tabSettings:"⚙️ Settings", settingsTitle:"⚙️ App Settings",
    profileTitle:"👤 Profile", shopInfoTitle:"🏢 Shop Info",
    inviteCodeTitle:"🔗 Staff Invite Code",
    inviteCodeDesc:"Share this code with your staff. They can use it during signup to join your shop.",
    copyCode:"📋 Copy", codeCopied:"✅ Copied!",
    languageLbl:"Language", syncStatus:"Sync Status",
    connected:"🟢 Connected (real-time)", connecting:"🟡 Connecting...", offline:"🔴 Offline",
    teamTitle:"👥 Team Members", youLabel:"You", ownerLabel:"Owner", salesmanLabel:"Staff",
    confirmLogout:"Do you want to logout?",
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
    selectCo:"Select Company", price:"Company price (৳)", save:"Save",
    confirmed:"✅ Confirmed", noStock:"❌ No Stock",
    deliver:"🚚 Mark Delivered", delOrder:"🗑️ Delete Order",
    coList:"🏢 Company List", addNew:"+ New Company",
    cancel:"Cancel", addCoTitle:"Add New Company",
    coName:"Company Name *", waNum:"WhatsApp Number (e.g. 8801712345678)",
    waHint:"💡 Include country code without 0.",
    addBtn:"✅ Add", editTitle:"Edit Company", saveEdit:"✅ Save",
    noPhone:"No number", noCo:"No companies yet",
    items:" items", newTag:"🔔 New", cur:"৳",
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
    n9:"Account created! Please verify your email.",
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
    pmCategory:"Category", pmPrice:"Price (৳)", pmUnit:"Unit",
    pmSearch:"Search products...",
    pmNoProducts:"No products yet. Add one.",
    pmAdded:"Product added ✅", pmUpdated:"Product updated ✅", pmDeleted:"Product deleted.",
    pmSelectHint:"Select a product or type manually",
    pmFromMaster:"📦 Select from Product Master",
    tabPurchase:"🧾 Purchase Invoice",
    tabSales:"🧾 Sales Invoice",
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
    si_unitPrice:"Unit Price (৳) *",
    si_discPerc:"Disc %",
    si_vatPerc:"VAT %",
    si_lineTotal:"Total",
    si_subtotal:"Subtotal",
    si_totalDiscount:"Total Discount",
    si_totalVat:"Total VAT",
    si_grandTotal:"Grand Total",
    si_paymentMethod:"Payment Method",
    si_amountPaid:"Amount Paid (৳)",
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
    si_delivery:"Delivery Challan",
    si_deliveryDesc:"Items & quantity only, no prices",
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
    cm_creditLimit:"Credit Limit (৳)",
    cm_openingBalance:"Opening Balance (৳)",
    cm_paymentTerms:"Payment Terms (Days)",
    cm_discountPerc:"Default Discount (%)",
    cm_assignedSalesman:"Assigned Salesman",
    cm_notes:"Special Notes",
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
    vm_creditLimit:"Credit Limit (৳)",
    vm_openingBalance:"Opening Balance (৳)",
    vm_paymentTerms:"Payment Terms (Days)",
    vm_notes:"Special Notes",
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
    pi_unitCost:"Unit Cost (৳) *",
    pi_discPerc:"Disc %",
    pi_taxPerc:"Tax %",
    pi_lineTotal:"Total",
    pi_subtotal:"Subtotal",
    pi_totalDiscount:"Total Discount",
    pi_totalTax:"Total Tax",
    pi_grandTotal:"Grand Total",
    pi_paymentMethod:"Payment Method",
    pi_amountPaid:"Amount Paid (৳)",
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
    pi_pmSearch:"Search products...",
    pi_totalInvoices:"Total Invoices",
    pi_totalAmount:"Total Purchase",
    pi_totalPaid:"Total Paid",
    pi_totalDue:"Total Due",
    pi_supplierInvoiceNo:"Supplier Invoice No.",
    pi_supplierInvoiceNoPh:"Vendor's invoice / challan number",
    pi_salePrice:"Sale Price (৳)",
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
    pi_pmSearchPh:"Search products...",
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

// ─── THEME PALETTES ──────────────────────────────────────────
const THEMES = {
  dark: {
    bgRoot:"#09090b", bgCard:"#18181b", bgInp:"#09090b", bgSel:"#18181b",
    bgHdr:"#18181b", bgSidebar:"#18181b", bgOiCard:"#09090b",
    border:"#27272a", borderMid:"#3f3f46",
    txtPrimary:"#f4f4f5", txtSecondary:"#e4e4e7", txtMuted:"#71717a", txtFaint:"#52525b",
    accent:"#f97316", accentDim:"#451a03",
  },
  light: {
    bgRoot:"#f1f5f9", bgCard:"#ffffff", bgInp:"#f8fafc", bgSel:"#ffffff",
    bgHdr:"#ffffff", bgSidebar:"#ffffff", bgOiCard:"#f8fafc",
    border:"#e2e8f0", borderMid:"#cbd5e1",
    txtPrimary:"#0f172a", txtSecondary:"#1e293b", txtMuted:"#64748b", txtFaint:"#94a3b8",
    accent:"#f97316", accentDim:"#fff7ed",
  },
};

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
function PriceCell({ initialValue, disabled, placeholder, saveBtnLabel, onSave }) {
  const [val, setVal] = useState(initialValue ?? "");
  const prevRef = useRef(initialValue);
  useEffect(() => {
    if (prevRef.current !== initialValue) {
      prevRef.current = initialValue;
      setVal(initialValue ?? "");
    }
  }, [initialValue]);
  const stop = (e) => e.stopPropagation();
  return (
    <div style={{ display:"flex", gap:7, marginBottom:7, alignItems:"center" }}
      onClick={stop} onMouseDown={stop} onPointerDown={stop} onTouchStart={stop}>
      <input style={_globalS.inp} placeholder={placeholder} inputMode="numeric"
        disabled={disabled} value={val}
        onClick={stop} onMouseDown={stop} onPointerDown={stop} onTouchStart={stop}
        onChange={e => setVal(e.target.value)} />
      {!disabled && <button style={_globalS.savBtn} onClick={() => onSave(val)}>{saveBtnLabel}</button>}
    </div>
  );
}

// ─── HEADER ──────────────────────────────────────────────────
function Header({ t, lang, setLang, children, isDesktop, s, theme, setTheme }) {
  const _s = s || _globalS;
  return (
    <div style={_s.hdr}>
      <div style={_s.hLeft}>
        <img src={LOGO_URL} alt="S4" style={_s.headerLogo} />
        <div><div style={_s.title}>{APP_NAME}</div><div style={_s.sub}>{t.appSub}</div></div>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        {setTheme && (
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
        <div style={_s.langSw}>
          <button style={{ ..._s.lBtn, ...(lang==="bn"?_s.lBtnA:{}) }} onClick={() => setLang("bn")}>বাং</button>
          <button style={{ ..._s.lBtn, ...(lang==="en"?_s.lBtnA:{}) }} onClick={() => setLang("en")}>EN</button>
        </div>
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
function LoginScreen({ t, lang, setLang, onSwitchToSignup, onSwitchToReset, toast, s:sp, theme, setTheme }) {
  const _s = sp||_globalS;
  const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [busy,setBusy]=useState(false); const [showPw,setShowPw]=useState(false);
  const submit = async (e) => {
    e?.preventDefault?.();
    if (!email.trim()||!pw) return toast(friendlyAuthError({code:"validation/required"},lang),"err");
    setBusy(true);
    try { await signInWithEmailAndPassword(auth,email.trim(),pw); }
    catch(err) { toast(friendlyAuthError(err,lang),"err"); }
    finally { setBusy(false); }
  };
  return (
    <div style={_s.root}><Header t={t} lang={lang} setLang={setLang} s={_s} theme={theme} setTheme={setTheme} />
      <div style={_s.authWrap}>
        <img src={LOGO_URL} alt={APP_NAME} style={_s.bigLogo} />
        <div style={_s.authTitle}>{t.welcomeBack}</div>
        <div style={_s.authSub}>{t.welcomeBackSub}</div>
        <form onSubmit={submit} style={_s.authCard}>
          <input style={{ ..._s.inp, marginBottom:10 }} type="email" placeholder={t.emailLbl} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" />
          <input style={{ ..._s.inp, marginBottom:6 }} type={showPw?"text":"password"} placeholder={t.passwordLbl} value={pw} onChange={e=>setPw(e.target.value)} autoComplete="current-password" />
          <label style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12, cursor:"pointer", userSelect:"none" }}>
            <input type="checkbox" checked={showPw} onChange={e=>setShowPw(e.target.checked)} style={{ width:15, height:15, cursor:"pointer", accentColor:"#f97316" }} />
            <span style={{ fontSize:12, color:"#71717a" }}>{lang==="bn"?"পাসওয়ার্ড দেখুন":"Show Password"}</span>
          </label>
          <button type="submit" style={_s.sendBtn} disabled={busy}>{busy?t.loggingIn:t.signIn}</button>
          <button type="button" style={_s.linkBtn} onClick={onSwitchToReset}>{t.forgotPw}</button>
        </form>
        <div style={_s.authFooter}>{t.noAccount}{" "}
          <button style={_s.linkBtnInline} onClick={onSwitchToSignup}>{t.createAccount}</button>
        </div>
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
function SignupForm({ t, lang, setLang, role, onBack, onSwitchToLogin, toast, s:sp, theme, setTheme }) {
  const _s = sp||_globalS;
  const [companyName,setCompanyName]=useState("");
  const [personName,setPersonName]=useState("");
  const [country,setCountry]=useState("BD");
  const [area,setArea]=useState("");
  const [mobile,setMobile]=useState("");
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [pw2,setPw2]=useState("");
  const [inviteCode,setInviteCode]=useState("");
  const [busy,setBusy]=useState(false);
  const [showPw,setShowPw]=useState(false);
  const isOwner = role==="owner";

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!personName.trim()||!email.trim()||!pw||!pw2||!mobile.trim()||!area.trim())
      return toast(friendlyAuthError({code:"validation/required"},lang),"err");
    if (isOwner&&!companyName.trim())
      return toast(friendlyAuthError({code:"validation/required"},lang),"err");
    if (!isOwner&&!inviteCode.trim())
      return toast(friendlyAuthError({code:"invite/required"},lang),"err");
    if (pw.length<6) return toast(friendlyAuthError({code:"validation/short-password"},lang),"err");
    if (pw!==pw2) return toast(friendlyAuthError({code:"validation/password-mismatch"},lang),"err");
    setBusy(true);
    try {
      let shopId=null, shopData=null;
      if (!isOwner) {
        // ── Single-use invite code lookup ──
        const codeRef = doc(db,"inviteCodes", inviteCode.trim().toUpperCase());
        const codeSnap = await getDoc(codeRef);
        if (!codeSnap.exists()) throw { code:"invite/not-found" };
        if (codeSnap.data().used === true) throw { code:"invite/already-used" };
        shopId = codeSnap.data().shopId;
        const shopSnap2 = await getDoc(doc(db,"shops",shopId));
        if (!shopSnap2.exists()) throw { code:"invite/not-found" };
        shopData = shopSnap2.data();
      }
      const cred = await createUserWithEmailAndPassword(auth,email.trim(),pw);
      const uid = cred.user.uid;
      if (isOwner) shopId=uid;
      const countryObj = COUNTRIES.find(c=>c.code===country);
      const userPayload = {
        uid, role:isOwner?"owner":"salesman", shopId,
        personName:personName.trim(), email:email.trim(),
        mobile:mobile.trim(), country,
        countryName:countryObj?.name||country, area:area.trim(),
        createdAt:serverTimestamp(),
        position: isOwner ? "মালিক" : "Salesman",
        permissions: isOwner ? null : { ...DEFAULT_PERMISSIONS },
        ...(isOwner ? {companyName:companyName.trim()} : {joinedShopName:shopData?.companyName||""}),
      };
      let userCreated=false;
      try { await setDoc(doc(db,"users",uid),userPayload); userCreated=true; }
      catch(e) { try { await cred.user.delete(); } catch {} throw {code:"profile/create-failed",message:e.message}; }
      if (isOwner) {
        try {
          await setDoc(doc(db,"shops",shopId),{
            companyName:companyName.trim(), ownerName:personName.trim(), ownerUid:uid,
            country, area:area.trim(), mobile:mobile.trim(), email:email.trim(),
            positions:[],
            createdAt:serverTimestamp(),
          });
          // ── Create 3 initial single-use invite codes ──
          for (let i=0; i<3; i++) {
            const code = generateInviteCode();
            await setDoc(doc(db,"inviteCodes",code),{
              shopId:uid, used:false, createdAt:serverTimestamp(),
            });
          }
        } catch(e) {
          if (userCreated) { try { await deleteDoc(doc(db,"users",uid)); } catch {} }
          try { await cred.user.delete(); } catch {}
          throw {code:"shop/create-failed",message:e.message};
        }
      } else {
        // ── Mark this invite code as used ──
        try {
          await updateDoc(doc(db,"inviteCodes",inviteCode.trim().toUpperCase()),{
            used:true, usedBy:uid, usedByName:personName.trim(), usedAt:serverTimestamp(),
          });
        } catch(e) { console.warn("Could not mark code used:",e); }
      }
      try { await sendEmailVerification(cred.user); } catch(e) { console.warn(e); }
      toast(t.n9);
    } catch(err) {
      // Handle invite/already-used error with friendly message
      if (err.code === "invite/already-used") {
        toast(lang==="bn"?"❌ এই Invite Code আগেই ব্যবহার হয়ে গেছে। মালিকের কাছ থেকে নতুন code নিন।":"❌ This invite code has already been used. Please get a new one from the owner.","err");
      } else {
        toast(friendlyAuthError(err,lang),"err");
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
          <select style={{ ..._s.sel, marginBottom:10, width:"100%" }} value={country} onChange={e=>setCountry(e.target.value)}>
            {COUNTRIES.map(c=><option key={c.code} value={c.code}>{c.name} ({c.dial})</option>)}
          </select>
          <input style={{ ..._s.inp, marginBottom:10 }} placeholder={t.areaLbl} value={area} onChange={e=>setArea(e.target.value)} />
          <input style={{ ..._s.inp, marginBottom:10 }} type="tel" placeholder={t.mobileLbl} value={mobile} onChange={e=>setMobile(e.target.value)} />
          <input style={{ ..._s.inp, marginBottom:10 }} type="email" placeholder={t.emailLbl} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" />
          <input style={{ ..._s.inp, marginBottom:6 }} type={showPw?"text":"password"} placeholder={t.passwordLbl} value={pw} onChange={e=>setPw(e.target.value)} autoComplete="new-password" />
          <input style={{ ..._s.inp, marginBottom:6 }} type={showPw?"text":"password"} placeholder={t.confirmPwLbl} value={pw2} onChange={e=>setPw2(e.target.value)} autoComplete="new-password" />
          <label style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12, cursor:"pointer", userSelect:"none" }}>
            <input type="checkbox" checked={showPw} onChange={e=>setShowPw(e.target.checked)} style={{ width:15, height:15, cursor:"pointer", accentColor:"#f97316" }} />
            <span style={{ fontSize:12, color:"#71717a" }}>{lang==="bn"?"পাসওয়ার্ড দেখুন":"Show Password"}</span>
          </label>
          <button type="submit" style={_s.sendBtn} disabled={busy}>{busy?t.creatingAccount:t.createAccount}</button>
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
function PermToggle({ isOn, onToggle }) {
  return (
    <button onClick={onToggle} style={{
      width:42, height:24, borderRadius:12, border:"none", cursor:"pointer",
      background:isOn?"#f97316":"#3f3f46", position:"relative", flexShrink:0, transition:"background 0.2s",
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

// ─── PRODUCT FORM COMPONENT ──────────────────────────────────
function PmForm({ pmForm, pmUpd, t, lang, th }) {
  const _th  = th || {bgInp:"#09090b",bgCard:"#18181b",txtPrimary:"#f4f4f5",txtMuted:"#71717a",borderMid:"#3f3f46",border:"#27272a",accentDim:"#451a03"};
  const inp  = { padding:"9px 11px", borderRadius:8, border:`1px solid ${_th.borderMid}`, background:_th.bgInp, color:_th.txtPrimary, fontSize:13, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" };
  const calcInp = { ...inp, color:"#22c55e", fontWeight:700 };
  const lbl  = { fontSize:10, color:_th.txtMuted, textTransform:"uppercase", letterSpacing:0.5, fontWeight:700, marginBottom:3, display:"block" };
  const sec  = { fontSize:11, color:"#f97316", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, padding:"8px 0 6px", borderBottom:`1px solid ${_th.border}`, marginBottom:10 };
  const g2   = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 };

  // More barcodes state
  const [newRef, setNewRef] = useState("");
  const mbs = pmForm.moreBarcodes||[];

  return (
    <div>
      {/* ── Basic Info ── */}
      <div style={{ marginBottom:8 }}>
        <label style={lbl}>{t.pmName} *</label>
        <input style={inp} value={pmForm.name} onChange={e=>pmUpd("name",e.target.value)} />
      </div>
      <div style={g2}>
        <div>
          <label style={lbl}>{t.pmCode}</label>
          <input style={inp} value={pmForm.code} onChange={e=>pmUpd("code",e.target.value)} />
        </div>
        <div>
          <label style={lbl}>{t.pmBrand}</label>
          <input style={inp} value={pmForm.brand} onChange={e=>pmUpd("brand",e.target.value)} />
        </div>
      </div>
      <div style={g2}>
        <div>
          <label style={lbl}>{t.pmCategory}</label>
          <input style={inp} value={pmForm.category} onChange={e=>pmUpd("category",e.target.value)} />
        </div>
        <div>
          <label style={lbl}>{lang==="bn"?"সাব-ক্যাটাগরি":"Sub-Category"}</label>
          <input style={inp} value={pmForm.subcategory||""} onChange={e=>pmUpd("subcategory",e.target.value)} />
        </div>
      </div>

      {/* ── Barcode Section ── */}
      <div style={sec}>🔢 Barcode / Reference</div>
      <div style={g2}>
        <div>
          <label style={lbl}>Barcode</label>
          <input style={inp} value={pmForm.barcode||""} onChange={e=>pmUpd("barcode",e.target.value)} />
        </div>
        <div>
          <label style={lbl}>EAN Code</label>
          <input style={inp} value={pmForm.ean||""} onChange={e=>pmUpd("ean",e.target.value)} />
        </div>
      </div>
      {/* More Barcodes */}
      <div style={{ marginBottom:8 }}>
        <label style={lbl}>More Barcodes / Reference Numbers</label>
        <div style={{ display:"flex", gap:6, marginBottom:6 }}>
          <input style={{ ...inp, flex:1 }} placeholder={lang==="bn"?"Reference নম্বর লিখুন...":"Enter reference number..."} value={newRef} onChange={e=>setNewRef(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"&&newRef.trim()){ pmUpd("moreBarcodes",[...mbs,newRef.trim()]); setNewRef(""); } }} />
          <button onClick={()=>{ if(newRef.trim()){ pmUpd("moreBarcodes",[...mbs,newRef.trim()]); setNewRef(""); } }}
            style={{ padding:"9px 14px", borderRadius:8, border:"none", background:"#f97316", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:700, flexShrink:0 }}>+</button>
        </div>
        {mbs.length>0&&(
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {mbs.map((r,i)=>(
              <span key={i} style={{ background:_th.accentDim, border:"1px solid #f97316", color:"#f97316", borderRadius:20, padding:"3px 10px", fontSize:12, display:"flex", alignItems:"center", gap:5 }}>
                {r}
                <button onClick={()=>pmUpd("moreBarcodes",mbs.filter((_,j)=>j!==i))} style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:13, padding:0, lineHeight:1 }}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Tax Settings ── */}
      <div style={sec}>🧾 Tax Settings</div>
      <div style={g2}>
        <div>
          <label style={lbl}>Sales VAT %</label>
          <select style={{ ...inp, background:_th.bgCard }} value={pmForm.salesVat||"0"} onChange={e=>pmUpd("salesVat",e.target.value)}>
            <option value="0">0%</option>
            <option value="5">5%</option>
          </select>
        </div>
        <div>
          <label style={lbl}>Purchase VAT %</label>
          <select style={{ ...inp, background:_th.bgCard }} value={pmForm.purchaseVat||"0"} onChange={e=>pmUpd("purchaseVat",e.target.value)}>
            <option value="0">0%</option>
            <option value="5">5%</option>
          </select>
        </div>
      </div>

      {/* ── Pricing ── */}
      <div style={sec}>💰 Pricing</div>
      <div style={g2}>
        <div>
          <label style={lbl}>Landing Cost</label>
          <input style={inp} inputMode="decimal" value={pmForm.landingCost||""} onChange={e=>pmUpd("landingCost",e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Margin %</label>
          <input style={inp} inputMode="decimal" value={pmForm.marginPerc||""} onChange={e=>pmUpd("marginPerc",e.target.value)} />
        </div>
      </div>
      <div style={g2}>
        <div>
          <label style={{ ...lbl, color:"#22c55e" }}>Margin Amount 🟢 auto</label>
          <input style={calcInp} inputMode="decimal" value={pmForm.marginAmount||""} onChange={e=>pmUpd("marginAmount",e.target.value)} />
        </div>
        <div>
          <label style={{ ...lbl, color:"#22c55e" }}>VAT Exclusive Rate 🟢 auto</label>
          <input style={calcInp} inputMode="decimal" value={pmForm.vatExclusive||""} onChange={e=>pmUpd("vatExclusive",e.target.value)} />
        </div>
      </div>
      <div style={g2}>
        <div>
          <label style={{ ...lbl, color:"#06b6d4" }}>VAT Inclusive Rate 🔵 auto</label>
          <input style={{ ...calcInp, color:"#06b6d4" }} inputMode="decimal" value={pmForm.vatInclusive||""} onChange={e=>pmUpd("vatInclusive",e.target.value)} />
        </div>
        <div>
          {/* VAT on MRP checkbox above MRP box */}
          <label style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer", marginBottom:5 }}>
            <input type="checkbox" checked={!!pmForm.vatOnMrp} onChange={e=>pmUpd("vatOnMrp",e.target.checked)}
              style={{ width:16, height:16, accentColor:"#f97316", cursor:"pointer" }} />
            <span style={{ fontSize:11, color:"#f97316", fontWeight:700 }}>✅ VAT on MRP</span>
          </label>
          <label style={lbl}>MRP</label>
          <input style={inp} inputMode="decimal" value={pmForm.mrp||""} onChange={e=>pmUpd("mrp",e.target.value)} />
        </div>
      </div>

      {/* ── Other ── */}
      <div style={g2}>
        <div>
          <label style={lbl}>Opening Stock</label>
          <input style={inp} inputMode="decimal" value={pmForm.openingStock||""} onChange={e=>pmUpd("openingStock",e.target.value)} />
        </div>
        <div>
          <label style={lbl}>{t.pmUnit}</label>
          <select style={{ ...inp, background:_th.bgCard }} value={pmForm.unit||"Pcs"} onChange={e=>pmUpd("unit",e.target.value)}>
            {["Pcs","Set","Nos","Kg","Ltr","Box","Cm","Mtr"].map(u=><option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={lbl}>{lang==="bn"?"বিবরণ":"Description"}</label>
        <input style={inp} value={pmForm.description||""} onChange={e=>pmUpd("description",e.target.value)} />
      </div>
    </div>
  );
}

// ─── PURCHASE INVOICE — CONSTANTS ────────────────────────────
const PI_PREFIX       = "PI-";
const PI_UNITS        = ["Pcs","Set","Nos","Kg","Ltr","Box","Cm","Mtr","Dz"];
const PI_PAY_METHODS  = {
  cash:   { bn:"নগদ",            en:"Cash",          icon:"💵" },
  bank:   { bn:"ব্যাংক ট্রান্সফার", en:"Bank Transfer",  icon:"🏦" },
  cheque: { bn:"চেক",             en:"Cheque",         icon:"📃" },
  credit: { bn:"বাকি (ক্রেডিট)",  en:"Credit",         icon:"📅" },
};
const PI_STATUSES = {
  draft:     { bn:"ড্রাফট",        en:"Draft",     color:"#f59e0b", bg:"#451a03" },
  confirmed: { bn:"নিশ্চিত",       en:"Confirmed", color:"#06b6d4", bg:"#083344" },
  partial:   { bn:"আংশিক পরিশোধ", en:"Partial",   color:"#a855f7", bg:"#2e1065" },
  paid:      { bn:"পরিশোধিত",     en:"Paid",      color:"#22c55e", bg:"#052e16" },
  cancelled: { bn:"বাতিল",        en:"Cancelled", color:"#71717a", bg:"#27272a" },
};
const piFmt2     = (n) => (Math.round((parseFloat(n)||0)*100)/100).toFixed(2);
const piN2       = (v) => parseFloat(v)||0;
const piToday    = () => new Date().toISOString().split("T")[0];

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
function piCalcLine(it) {
  const qty=piN2(it.qty), cost=piN2(it.unitCost), dp=piN2(it.discountPerc), tp=piN2(it.taxPerc);
  const gross=qty*cost, disc=gross*dp/100, base=gross-disc, tax=base*tp/100;
  return { gross, disc, tax, total:base+tax };
}
function piCalcTotals(items) {
  let sub=0,disc=0,tax=0,grand=0;
  items.forEach(it=>{ const c=piCalcLine(it); sub+=c.gross; disc+=c.disc; tax+=c.tax; grand+=c.total; });
  return { sub, disc, tax, grand };
}
function piEmptyLine() {
  return { id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:null, name:"", code:"", brand:"", qty:"", unit:"Pcs", unitCost:"", discountPerc:"0", taxPerc:"5", salePrice:"" };
}
function piEmptyForm() {
  return { invoiceDate:piToday(), supplierInvoiceNo:"", vendorId:"", vendorName:"", vendorMobile:"", paymentMethod:"cash", amountPaid:"", note:"" };
}

// ─── PI: STATUS BADGE ─────────────────────────────────────────
function PiStatusBadge({ status, lang }) {
  const st = PI_STATUSES[status]||PI_STATUSES.draft;
  return <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, color:st.color, background:st.bg, whiteSpace:"nowrap" }}>{st[lang]}</span>;
}

// ─── PI: SUMMARY BOX ──────────────────────────────────────────
function PiSummaryBox({ items, amountPaid, th, t }) {
  const { sub, disc, tax, grand } = piCalcTotals(items);
  const paid=piN2(amountPaid), balance=grand-paid;
  const row = { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${th.border}` };
  return (
    <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
      <div style={{ fontSize:11, color:"#f97316", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginBottom:10 }}>📊 {t.pi_summary}</div>
      <div style={row}><span style={{ fontSize:12, color:th.txtMuted }}>{t.pi_subtotal}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>৳ {piFmt2(sub)}</span></div>
      {disc>0&&<div style={row}><span style={{ fontSize:12, color:th.txtMuted }}>{t.pi_totalDiscount}</span><span style={{ fontSize:13, fontWeight:700, color:"#ef4444" }}>- ৳ {piFmt2(disc)}</span></div>}
      {tax>0&&<div style={row}><span style={{ fontSize:12, color:th.txtMuted }}>{t.pi_totalTax}</span><span style={{ fontSize:13, fontWeight:700, color:"#06b6d4" }}>+ ৳ {piFmt2(tax)}</span></div>}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0 0" }}>
        <span style={{ fontSize:15, fontWeight:800, color:th.txtPrimary }}>{t.pi_grandTotal}</span>
        <span style={{ fontSize:20, fontWeight:900, color:"#f97316" }}>৳ {piFmt2(grand)}</span>
      </div>
      {paid>0&&(<>
        <div style={{ height:1, background:th.border, margin:"8px 0" }} />
        <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0" }}>
          <span style={{ fontSize:12, fontWeight:700, color:"#22c55e" }}>{t.pi_amountPaid}</span>
          <span style={{ fontSize:13, fontWeight:700, color:"#22c55e" }}>৳ {piFmt2(paid)}</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0" }}>
          <span style={{ fontSize:13, fontWeight:700, color:balance>0.001?"#ef4444":"#22c55e" }}>{t.pi_balanceDue}</span>
          <span style={{ fontSize:15, fontWeight:900, color:balance>0.001?"#ef4444":"#22c55e" }}>৳ {piFmt2(Math.max(0,balance))}</span>
        </div>
      </>)}
    </div>
  );
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
                {p.vatExclusive&&<span style={{ color:"#22c55e" }}>৳{p.vatExclusive}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PI: LINE ITEM ROW (mobile card) ──────────────────────────
function PiLineItemMobile({ item, idx, onUpdate, onDelete, onPick, t, th }) {
  const [editOpen, setEditOpen] = useState(!item.name);
  const { disc, tax, total } = piCalcLine(item);
  const inp=(e={})=>({ padding:"7px 9px", borderRadius:6, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:12, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...e });
  const lbl={ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:2 };

  if (!editOpen) {
    return (
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:"10px 12px", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:11, fontWeight:800, color:"#f97316", flexShrink:0, width:22 }}>#{idx+1}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name||"—"}</div>
            <div style={{ fontSize:10, color:th.txtMuted, marginTop:1, display:"flex", gap:6, flexWrap:"wrap" }}>
              {item.code&&<span>📋 {item.code}</span>}
              {item.brand&&<span>🏷️ {item.brand}</span>}
              <span>{item.qty} {item.unit}</span>
              {piN2(item.unitCost)>0&&<span>৳ {piFmt2(piN2(item.unitCost))}</span>}
              {total>0&&<span style={{ fontWeight:700, color:"#f97316" }}>= ৳ {piFmt2(total)}</span>}
            </div>
          </div>
          <button onClick={()=>setEditOpen(true)} style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtSecondary, cursor:"pointer", fontSize:12, flexShrink:0 }}>✏️</button>
          <button onClick={()=>onDelete(item.id)} style={{ width:28, height:28, borderRadius:6, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:13, flexShrink:0 }}>✕</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background:th.bgCard, border:`2px solid #f97316`, borderRadius:12, padding:12, marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:12, fontWeight:800, color:"#f97316" }}>#{idx+1} ✏️</span>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={()=>onPick(idx)} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #6366f1", background:"rgba(99,102,241,0.08)", color:"#818cf8", cursor:"pointer", fontSize:11, fontWeight:700 }}>📦</button>
          <button onClick={()=>setEditOpen(false)} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #f97316", background:"rgba(249,115,22,0.08)", color:"#f97316", cursor:"pointer", fontSize:11, fontWeight:700 }}>✅</button>
          <button onClick={()=>onDelete(item.id)} style={{ width:28, height:28, borderRadius:6, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:13 }}>✕</button>
        </div>
      </div>
      <input style={{ ...inp(), marginBottom:6, fontSize:13, fontWeight:600 }} placeholder={t.pi_itemName} value={item.name} onChange={e=>onUpdate(item.id,"name",e.target.value)} />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:6 }}>
        <input style={inp()} placeholder={t.pi_code} value={item.code} onChange={e=>onUpdate(item.id,"code",e.target.value)} />
        <input style={inp()} placeholder={t.pi_brand} value={item.brand} onChange={e=>onUpdate(item.id,"brand",e.target.value)} />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:6 }}>
        <div><div style={lbl}>{t.pi_qty}</div><input style={inp()} inputMode="decimal" placeholder="0" value={item.qty} onChange={e=>onUpdate(item.id,"qty",e.target.value)} /></div>
        <div><div style={lbl}>{t.pi_unit}</div><select style={{ ...inp(), background:th.bgCard }} value={item.unit} onChange={e=>onUpdate(item.id,"unit",e.target.value)}>{PI_UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></div>
        <div><div style={lbl}>{t.pi_unitCost}</div><input style={inp()} inputMode="decimal" placeholder="0.00" value={item.unitCost} onChange={e=>onUpdate(item.id,"unitCost",e.target.value)} /></div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
        <div><div style={lbl}>{t.pi_discPerc}</div><input style={inp()} inputMode="decimal" placeholder="0" value={item.discountPerc} onChange={e=>onUpdate(item.id,"discountPerc",e.target.value)} /></div>
        <div><div style={lbl}>{t.pi_vat} (default 5%)</div><input style={inp()} inputMode="decimal" placeholder="5" value={item.taxPerc} onChange={e=>onUpdate(item.id,"taxPerc",e.target.value)} /></div>
      </div>
      <div style={{ marginTop:6 }}>
        <div style={lbl}>💰 {t.pi_salePrice}</div>
        <input style={{ ...inp(), borderColor:"#22c55e", color:"#22c55e" }} inputMode="decimal" placeholder={t.pi_salePricePh} value={item.salePrice} onChange={e=>onUpdate(item.id,"salePrice",e.target.value)} />
      </div>
      <div style={{ marginTop:8, padding:"7px 10px", background:"rgba(249,115,22,0.08)", borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:11, color:th.txtMuted }}>{t.pi_lineTotal}</span>
        <span style={{ fontSize:15, fontWeight:800, color:"#f97316" }}>৳ {piFmt2(total)}</span>
      </div>
    </div>
  );
}

// ─── PI: LINE ITEM ROW (desktop table row) ────────────────────
function PiLineItemDesktop({ item, idx, onUpdate, onDelete, onPick, t, th }) {
  const [editOpen, setEditOpen] = useState(!item.name);
  const { disc, tax, total } = piCalcLine(item);
  const inp=(e={})=>({ padding:"7px 9px", borderRadius:6, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:12, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...e });

  if (!editOpen) {
    return (
      <tr style={{ borderBottom:`1px solid ${th.border}`, background:"transparent" }}>
        <td style={{ padding:"8px 6px", fontSize:12, fontWeight:700, color:"#f97316", textAlign:"center", width:30 }}>{idx+1}</td>
        <td style={{ padding:"8px 6px" }}>
          <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{item.name||"—"}</div>
          {(item.code||item.brand)&&<div style={{ fontSize:10, color:th.txtMuted, marginTop:1 }}>{item.code&&`📋 ${item.code}`} {item.brand&&`🏷️ ${item.brand}`}</div>}
        </td>
        <td style={{ padding:"8px 6px", textAlign:"center", fontWeight:700, color:th.txtPrimary }}>{item.qty}</td>
        <td style={{ padding:"8px 6px", textAlign:"center", color:th.txtMuted }}>{item.unit}</td>
        <td style={{ padding:"8px 6px", textAlign:"right", color:th.txtMuted }}>৳ {piFmt2(piN2(item.unitCost))}</td>
        <td style={{ padding:"8px 6px", textAlign:"center", color:th.txtMuted }}>{piN2(item.discountPerc)>0?`${item.discountPerc}%`:"—"}</td>
        <td style={{ padding:"8px 6px", textAlign:"center", color:th.txtMuted }}>{piN2(item.taxPerc)>0?`${item.taxPerc}%`:"—"}</td>
        <td style={{ padding:"8px 6px", textAlign:"right", color:"#22c55e", fontWeight:700 }}>{piN2(item.salePrice)>0?`৳ ${piFmt2(piN2(item.salePrice))}`:"—"}</td>
        <td style={{ padding:"8px 6px", textAlign:"right", fontWeight:700, color:total>0?"#f97316":th.txtFaint }}>৳ {piFmt2(total)}</td>
        <td style={{ padding:"8px 6px", textAlign:"center" }}>
          <div style={{ display:"flex", gap:4, justifyContent:"center" }}>
            <button onClick={()=>setEditOpen(true)} style={{ width:28, height:28, borderRadius:6, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtSecondary, cursor:"pointer", fontSize:12 }}>✏️</button>
            <button onClick={()=>onDelete(item.id)} style={{ width:28, height:28, borderRadius:6, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:13, fontWeight:700 }}>✕</button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ borderBottom:`1px solid ${th.border}`, background:"rgba(249,115,22,0.03)" }}>
      <td style={{ padding:"8px 6px", fontSize:12, fontWeight:700, color:"#f97316", textAlign:"center", width:30 }}>{idx+1}</td>
      <td style={{ padding:"8px 6px" }}>
        <div style={{ display:"flex", gap:4, marginBottom:4 }}>
          <input style={{ ...inp(), flex:2 }} placeholder={t.pi_itemName} value={item.name} onChange={e=>onUpdate(item.id,"name",e.target.value)} />
          <button onClick={()=>onPick(idx)} title={t.pi_fromMaster} style={{ padding:"0 8px", borderRadius:6, border:"1px solid #6366f1", background:"rgba(99,102,241,0.08)", color:"#818cf8", cursor:"pointer", fontSize:13, flexShrink:0 }}>📦</button>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          <input style={{ ...inp(), flex:1 }} placeholder={t.pi_code} value={item.code} onChange={e=>onUpdate(item.id,"code",e.target.value)} />
          <input style={{ ...inp(), flex:1 }} placeholder={t.pi_brand} value={item.brand} onChange={e=>onUpdate(item.id,"brand",e.target.value)} />
        </div>
      </td>
      <td style={{ padding:"8px 6px", width:70 }}><input style={inp({ textAlign:"center" })} inputMode="decimal" placeholder="0" value={item.qty} onChange={e=>onUpdate(item.id,"qty",e.target.value)} /></td>
      <td style={{ padding:"8px 6px", width:80 }}><select style={{ ...inp(), background:th.bgCard }} value={item.unit} onChange={e=>onUpdate(item.id,"unit",e.target.value)}>{PI_UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></td>
      <td style={{ padding:"8px 6px", width:110 }}><input style={inp({ textAlign:"right" })} inputMode="decimal" placeholder="0.00" value={item.unitCost} onChange={e=>onUpdate(item.id,"unitCost",e.target.value)} /></td>
      <td style={{ padding:"8px 6px", width:70 }}><input style={inp({ textAlign:"center" })} inputMode="decimal" placeholder="0" value={item.discountPerc} onChange={e=>onUpdate(item.id,"discountPerc",e.target.value)} /></td>
      <td style={{ padding:"8px 6px", width:70 }}><input style={inp({ textAlign:"center" })} inputMode="decimal" placeholder="5" value={item.taxPerc} onChange={e=>onUpdate(item.id,"taxPerc",e.target.value)} /></td>
      <td style={{ padding:"8px 6px", width:100 }}><input style={{ ...inp({ textAlign:"right" }), borderColor:"#22c55e", color:"#22c55e" }} inputMode="decimal" placeholder="0.00" value={item.salePrice} onChange={e=>onUpdate(item.id,"salePrice",e.target.value)} /></td>
      <td style={{ padding:"8px 6px", width:110, textAlign:"right" }}>
        <span style={{ fontSize:13, fontWeight:700, color:total>0?"#f97316":th.txtFaint }}>৳ {piFmt2(total)}</span>
        {(piN2(item.discountPerc)>0||piN2(item.taxPerc)>0)&&(
          <div style={{ fontSize:9, color:th.txtMuted, marginTop:2 }}>
            {piN2(item.discountPerc)>0&&<span style={{ color:"#ef4444" }}>-{piFmt2(disc)} </span>}
            {piN2(item.taxPerc)>0&&<span style={{ color:"#06b6d4" }}>+{piFmt2(tax)}</span>}
          </div>
        )}
      </td>
      <td style={{ padding:"8px 6px", width:36, textAlign:"center" }}>
        <div style={{ display:"flex", gap:4, justifyContent:"center" }}>
          <button onClick={()=>setEditOpen(false)} style={{ width:28, height:28, borderRadius:6, border:"1px solid #f97316", background:"rgba(249,115,22,0.1)", color:"#f97316", cursor:"pointer", fontSize:12 }}>✅</button>
          <button onClick={()=>onDelete(item.id)} style={{ width:28, height:28, borderRadius:6, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:13, fontWeight:700 }}>✕</button>
        </div>
      </td>
    </tr>
  );
}

// ─── PI: INVOICE CARD (list) ──────────────────────────────────
function PiInvoiceCard({ invoice, onClick, t, th, lang }) {
  const balance = invoice.grandTotal - invoice.amountPaid;
  return (
    <div onClick={onClick} style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:"12px 14px", marginBottom:8, cursor:"pointer" }}
      onMouseEnter={e=>e.currentTarget.style.borderColor="#f97316"}
      onMouseLeave={e=>e.currentTarget.style.borderColor=th.border}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:800, color:"#f97316" }}>{invoice.invoiceNo}</div>
          <div style={{ fontSize:12, color:th.txtMuted, marginTop:1 }}>📅 {invoice.invoiceDate} · {invoice.createdByName}</div>
        </div>
        <PiStatusBadge status={invoice.status} lang={lang} />
      </div>
      <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary, marginBottom:4 }}>🏭 {invoice.vendorName||"—"}</div>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center", marginTop:6 }}>
        <span style={{ fontSize:11, color:th.txtMuted }}>{invoice.items?.length||0}{lang==="bn"?t.pi_itemsCount:t.pi_itemsCount}</span>
        <span style={{ fontSize:14, fontWeight:800, color:"#f97316" }}>৳ {piFmt2(invoice.grandTotal)}</span>
        {invoice.amountPaid>0&&<span style={{ fontSize:11, color:"#22c55e", fontWeight:700 }}>✅ ৳ {piFmt2(invoice.amountPaid)}</span>}
        {balance>0.01&&<span style={{ fontSize:11, color:"#ef4444", fontWeight:700 }}>⚠️ ৳ {piFmt2(balance)}</span>}
      </div>
    </div>
  );
}

// ─── PI: DETAIL VIEW ──────────────────────────────────────────
function PiDetailView({ invoice, onEdit, onMarkPaid, onCancel, onDelete, onBack, t, th, lang, isOwner }) {
  const { sub, disc, tax, grand } = piCalcTotals(invoice.items||[]);
  const balance = grand - invoice.amountPaid;
  const canEdit   = ["draft","confirmed"].includes(invoice.status);
  const canPay    = ["confirmed","partial"].includes(invoice.status);
  const canCancel = ["draft","confirmed","partial"].includes(invoice.status);
  const dr = { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${th.border}` };
  return (
    <div>
      <button onClick={onBack} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:13, fontWeight:700, padding:"0 0 14px 0", fontFamily:"inherit" }}>{t.pi_backToList}</button>

      {/* Header card */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
          <div>
            <div style={{ fontSize:22, fontWeight:900, color:"#f97316", letterSpacing:1 }}>{invoice.invoiceNo}</div>
            {invoice.supplierInvoiceNo&&<div style={{ fontSize:12, color:"#a855f7", fontWeight:700, marginTop:2 }}>🧾 {invoice.supplierInvoiceNo}</div>}
            <div style={{ fontSize:12, color:th.txtMuted, marginTop:2 }}>{t.pi_date}: {invoice.invoiceDate}</div>
          </div>
          <PiStatusBadge status={invoice.status} lang={lang} />
        </div>
        <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🏭 {t.pi_vendor}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{invoice.vendorName||"—"}</span></div>
        {invoice.vendorMobile&&<div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>📱</span><span style={{ fontSize:13, color:th.txtPrimary }}>{invoice.vendorMobile}</span></div>}
        <div style={{ ...dr, borderBottom:"none" }}><span style={{ fontSize:12, color:th.txtMuted }}>👤 {t.pi_createdBy}</span><span style={{ fontSize:12, color:th.txtMuted }}>{invoice.createdByName}</span></div>
        {invoice.note&&<div style={{ marginTop:8, padding:"8px 10px", background:th.bgInp, borderRadius:8, fontSize:12, color:th.txtSecondary, borderLeft:"3px solid #f97316" }}>📝 {invoice.note}</div>}
      </div>

      {/* Items */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:14, marginBottom:10, overflowX:"auto" }}>
        <div style={{ fontSize:11, color:"#f97316", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginBottom:10 }}>📦 {t.pi_items} ({invoice.items?.length||0})</div>
        <div style={{ display:"flex", fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, letterSpacing:0.4, padding:"7px 0", borderBottom:`1px solid ${th.border}`, gap:6 }}>
          <span style={{ width:24 }}>#</span><span style={{ flex:1 }}>{lang==="bn"?"পণ্য":"Item"}</span>
          <span style={{ width:60, textAlign:"center" }}>{t.pi_qty}</span>
          <span style={{ width:90, textAlign:"right" }}>{t.pi_unitCost}</span>
          <span style={{ width:100, textAlign:"right" }}>{t.pi_lineTotal}</span>
        </div>
        {(invoice.items||[]).map((it,i)=>{
          const { disc:d, tax:tx, total:tot } = piCalcLine(it);
          return (
            <div key={i} style={{ display:"flex", alignItems:"flex-start", padding:"9px 0", borderBottom:i<invoice.items.length-1?`1px solid ${th.border}`:"none", gap:6 }}>
              <span style={{ width:24, fontSize:11, fontWeight:800, color:"#f97316", flexShrink:0 }}>{i+1}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.name}</div>
                <div style={{ fontSize:10, color:th.txtMuted, marginTop:2, display:"flex", gap:6, flexWrap:"wrap" }}>
                  {it.code&&<span>📋 {it.code}</span>}
                  {it.brand&&<span>🏷️ {it.brand}</span>}
                  {piN2(it.discountPerc)>0&&<span style={{ color:"#ef4444" }}>Disc {it.discountPerc}% (-{piFmt2(d)})</span>}
                  {piN2(it.taxPerc)>0&&<span style={{ color:"#06b6d4" }}>VAT {it.taxPerc}% (+{piFmt2(tx)})</span>}
                  {it.salePrice>0&&<span style={{ color:"#22c55e", fontWeight:700 }}>💰 Sale: ৳{piFmt2(it.salePrice)}</span>}
                </div>
              </div>
              <span style={{ width:60, textAlign:"center", fontSize:12, color:th.txtPrimary, flexShrink:0 }}>{it.qty} {it.unit}</span>
              <span style={{ width:90, textAlign:"right", fontSize:12, color:th.txtMuted, flexShrink:0 }}>৳ {piFmt2(it.unitCost)}</span>
              <span style={{ width:100, textAlign:"right", fontSize:13, fontWeight:700, color:"#f97316", flexShrink:0 }}>৳ {piFmt2(tot)}</span>
            </div>
          );
        })}
      </div>

      {/* Totals + Payment */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:14, marginBottom:10 }}>
        {[[t.pi_subtotal, piFmt2(sub), th.txtPrimary],
          ...(disc>0?[[t.pi_totalDiscount,`- ${piFmt2(disc)}`,"#ef4444"]]:[]),
          ...(tax>0?[[t.pi_totalTax,`+ ${piFmt2(tax)}`,"#06b6d4"]]:[]),
        ].map(([label,val,col],i)=>(
          <div key={i} style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>{label}</span><span style={{ fontSize:13, fontWeight:700, color:col }}>৳ {val}</span></div>
        ))}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0 0" }}>
          <span style={{ fontSize:15, fontWeight:800, color:th.txtPrimary }}>{t.pi_grandTotal}</span>
          <span style={{ fontSize:20, fontWeight:900, color:"#f97316" }}>৳ {piFmt2(grand)}</span>
        </div>
        <div style={{ height:1, background:th.border, margin:"10px 0" }} />
        <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>💳 {t.pi_paymentMethod}</span><span style={{ fontSize:12, fontWeight:700, color:th.txtPrimary }}>{PI_PAY_METHODS[invoice.paymentMethod]?.icon} {PI_PAY_METHODS[invoice.paymentMethod]?.[lang]}</span></div>
        <div style={dr}><span style={{ fontSize:12, color:"#22c55e", fontWeight:700 }}>✅ {t.pi_amountPaid}</span><span style={{ fontSize:14, fontWeight:800, color:"#22c55e" }}>৳ {piFmt2(invoice.amountPaid)}</span></div>
        <div style={{ ...dr, borderBottom:"none" }}>
          <span style={{ fontSize:13, fontWeight:700, color:balance>0.01?"#ef4444":"#22c55e" }}>{t.pi_balanceDue}</span>
          <span style={{ fontSize:16, fontWeight:900, color:balance>0.01?"#ef4444":"#22c55e" }}>৳ {piFmt2(Math.max(0,balance))}</span>
        </div>
      </div>

      {/* Actions */}
      {isOwner&&(
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {canEdit&&<button onClick={onEdit} style={{ padding:"12px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#1d4ed8,#2563eb)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>✏️ {t.pi_editBtn}</button>}
          {canPay&&<button onClick={onMarkPaid} style={{ padding:"12px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#15803d,#16a34a)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>{t.pi_markPaid}</button>}
          {canCancel&&<button onClick={onCancel} style={{ padding:"11px", borderRadius:10, border:"1px solid #713f12", background:"transparent", color:"#f59e0b", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.pi_cancelBtn}</button>}
          {invoice.status==="draft"&&<button onClick={onDelete} style={{ padding:"11px", borderRadius:10, border:"1px solid #450a0a", background:"transparent", color:"#ef4444", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.pi_deleteBtn}</button>}
        </div>
      )}
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

// ─── VENDOR STATUS BADGE ─────────────────────────────────────
const VM_STATUS = {
  active:   { bn:"সক্রিয়",   en:"Active",   color:"#22c55e", bg:"#052e16" },
  inactive: { bn:"নিষ্ক্রিয়", en:"Inactive", color:"#f59e0b", bg:"#451a03" },
  blocked:  { bn:"ব্লক করা",  en:"Blocked",  color:"#ef4444", bg:"#450a0a" },
};
function VmStatusBadge({ status, lang }) {
  const st = VM_STATUS[status]||VM_STATUS.active;
  return <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, color:st.color, background:st.bg, whiteSpace:"nowrap" }}>{st[lang]}</span>;
}

// ─── VENDOR MASTER WINDOW ─────────────────────────────────────
const emptyVendor = {
  vendorName:"", vendorCode:"", category:"", status:"active",
  contactPerson:"",
  mobileNumber:"", phoneNumber:"", whatsappNumber:"", email:"",
  address:"", area:"", city:"", country:"", mapLink:"",
  trnNumber:"", tradeLicenseNumber:"", tinNumber:"", binNumber:"", vatNumber:"",
  bankName:"", bankBranch:"", accountName:"", accountNumber:"", ibanNumber:"", swiftCode:"",
  creditLimit:"", openingBalance:"", paymentTerms:"",
  notes:"",
};

function VendorMasterWindow({ t, lang, th, shopId, user, vendors, toast, isDesktop, onGoToPurchase }) {
  const [vmView,setVmView]           = useState("list"); // list|form|detail
  const [selVendor,setSelVendor]     = useState(null);
  const [editVendorId,setEditVendorId] = useState(null);
  const [vmForm,setVmForm]           = useState({...emptyVendor});
  const [vmSaving,setVmSaving]       = useState(false);
  const [vmSearch,setVmSearch]       = useState("");
  const [vmStatusF,setVmStatusF]     = useState("ALL");

  const upd = (k,v) => setVmForm(p=>({...p,[k]:v}));

  const panel = isDesktop
    ? {maxWidth:860,margin:"0 auto",padding:"24px 28px 80px"}
    : {maxWidth:640,margin:"0 auto",padding:"16px 14px 80px"};

  const inp = (ex={}) => ({
    padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`,
    background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none",
    width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...ex,
  });
  const taStyle = {
    ...inp(), minHeight:48, resize:"none", overflow:"hidden", lineHeight:1.5,
  };
  const secLabel = (icon, label) => (
    <div style={{ fontSize:11, color:"#f97316", fontWeight:700, textTransform:"uppercase",
      letterSpacing:0.5, padding:"10px 0 8px", borderBottom:`1px solid ${th.border}`, marginBottom:12 }}>
      {icon} {label}
    </div>
  );
  const fieldWrap = (label, node, full=false) => (
    <div style={{ gridColumn: full?"1/-1":"auto" }}>
      <div style={{ fontSize:10, color:th.txtMuted, fontWeight:700, textTransform:"uppercase", letterSpacing:0.4, marginBottom:4 }}>{label}</div>
      {node}
    </div>
  );
  const grid2 = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:4 };
  const card  = { background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:12 };

  // ── filtered list ──
  const q = vmSearch.trim();
  const filtered = vendors.filter(v=>{
    const matchSt = vmStatusF==="ALL" || v.status===vmStatusF;
    if (!q) return matchSt;
    const hay = [v.vendorName,v.vendorCode,v.mobileNumber,v.trnNumber,v.city,v.contactPerson,v.tradeLicenseNumber,v.tinNumber,v.binNumber,v.vatNumber].filter(Boolean).join(" ");
    return matchSt && nsmatch(hay, q);
  });
  const kpi = {
    total: vendors.length,
    active: vendors.filter(v=>v.status==="active").length,
    credit: vendors.reduce((s,v)=>s+(v.creditLimit||0),0),
  };

  // ── save / update ──
  const vmSave = async () => {
    if (!vmForm.vendorName.trim()) { toast(t.vm_errName,"err"); return; }
    if (!vmForm.mobileNumber.trim()) { toast(t.vm_errMobile,"err"); return; }
    setVmSaving(true);
    const payload = {
      shopId, updatedBy:user.uid, updatedAt:serverTimestamp(),
      vendorName:vmForm.vendorName.trim(), vendorCode:vmForm.vendorCode.trim(),
      category:vmForm.category||"", status:vmForm.status||"active",
      contactPerson:vmForm.contactPerson.trim(),
      mobileNumber:vmForm.mobileNumber.trim(), phoneNumber:vmForm.phoneNumber.trim(),
      whatsappNumber:vmForm.whatsappNumber.trim(), email:vmForm.email.trim(),
 