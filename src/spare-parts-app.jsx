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
    pmCategory:"Category", pmPrice:"Price (AED)", pmUnit:"Unit",
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
      <div style={row}><span style={{ fontSize:12, color:th.txtMuted }}>{t.pi_subtotal}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{t.cur} {piFmt2(sub)}</span></div>
      {disc>0&&<div style={row}><span style={{ fontSize:12, color:th.txtMuted }}>{t.pi_totalDiscount}</span><span style={{ fontSize:13, fontWeight:700, color:"#ef4444" }}>- {t.cur} {piFmt2(disc)}</span></div>}
      {tax>0&&<div style={row}><span style={{ fontSize:12, color:th.txtMuted }}>{t.pi_totalTax}</span><span style={{ fontSize:13, fontWeight:700, color:"#06b6d4" }}>+ {t.cur} {piFmt2(tax)}</span></div>}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0 0" }}>
        <span style={{ fontSize:15, fontWeight:800, color:th.txtPrimary }}>{t.pi_grandTotal}</span>
        <span style={{ fontSize:20, fontWeight:900, color:"#f97316" }}>{t.cur} {piFmt2(grand)}</span>
      </div>
      {paid>0&&(<>
        <div style={{ height:1, background:th.border, margin:"8px 0" }} />
        <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0" }}>
          <span style={{ fontSize:12, fontWeight:700, color:"#22c55e" }}>{t.pi_amountPaid}</span>
          <span style={{ fontSize:13, fontWeight:700, color:"#22c55e" }}>{t.cur} {piFmt2(paid)}</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0" }}>
          <span style={{ fontSize:13, fontWeight:700, color:balance>0.001?"#ef4444":"#22c55e" }}>{t.pi_balanceDue}</span>
          <span style={{ fontSize:15, fontWeight:900, color:balance>0.001?"#ef4444":"#22c55e" }}>{t.cur} {piFmt2(Math.max(0,balance))}</span>
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
                {p.vatExclusive&&<span style={{ color:"#22c55e" }}>{t.cur}{p.vatExclusive}</span>}
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
  const { disc, tax, total } = piCalcLine(item);
  const inp=(e={})=>({ padding:"7px 9px", borderRadius:6, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:12, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...e });
  const lbl={ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:2 };
  return (
    <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:12, marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:12, fontWeight:800, color:"#f97316" }}>#{idx+1}</span>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={()=>onPick(idx)} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #6366f1", background:"rgba(99,102,241,0.08)", color:"#818cf8", cursor:"pointer", fontSize:11, fontWeight:700 }}>📦</button>
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
        <span style={{ fontSize:15, fontWeight:800, color:"#f97316" }}>{t.cur} {piFmt2(total)}</span>
      </div>
    </div>
  );
}

// ─── PI: LINE ITEM ROW (desktop table row) ────────────────────
function PiLineItemDesktop({ item, idx, onUpdate, onDelete, onPick, t, th }) {
  const { disc, tax, total } = piCalcLine(item);
  const inp=(e={})=>({ padding:"7px 9px", borderRadius:6, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:12, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...e });
  return (
    <tr style={{ borderBottom:`1px solid ${th.border}` }}>
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
        <span style={{ fontSize:13, fontWeight:700, color:total>0?"#f97316":th.txtFaint }}>{t.cur} {piFmt2(total)}</span>
        {(piN2(item.discountPerc)>0||piN2(item.taxPerc)>0)&&(
          <div style={{ fontSize:9, color:th.txtMuted, marginTop:2 }}>
            {piN2(item.discountPerc)>0&&<span style={{ color:"#ef4444" }}>-{piFmt2(disc)} </span>}
            {piN2(item.taxPerc)>0&&<span style={{ color:"#06b6d4" }}>+{piFmt2(tax)}</span>}
          </div>
        )}
      </td>
      <td style={{ padding:"8px 6px", width:36, textAlign:"center" }}>
        <button onClick={()=>onDelete(item.id)} style={{ width:28, height:28, borderRadius:6, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:13, fontWeight:700 }}>✕</button>
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
        <span style={{ fontSize:14, fontWeight:800, color:"#f97316" }}>{t.cur} {piFmt2(invoice.grandTotal)}</span>
        {invoice.amountPaid>0&&<span style={{ fontSize:11, color:"#22c55e", fontWeight:700 }}>✅ {t.cur} {piFmt2(invoice.amountPaid)}</span>}
        {balance>0.01&&<span style={{ fontSize:11, color:"#ef4444", fontWeight:700 }}>⚠️ {t.cur} {piFmt2(balance)}</span>}
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
                  {it.salePrice>0&&<span style={{ color:"#22c55e", fontWeight:700 }}>💰 Sale: {t.cur}{piFmt2(it.salePrice)}</span>}
                </div>
              </div>
              <span style={{ width:60, textAlign:"center", fontSize:12, color:th.txtPrimary, flexShrink:0 }}>{it.qty} {it.unit}</span>
              <span style={{ width:90, textAlign:"right", fontSize:12, color:th.txtMuted, flexShrink:0 }}>{t.cur} {piFmt2(it.unitCost)}</span>
              <span style={{ width:100, textAlign:"right", fontSize:13, fontWeight:700, color:"#f97316", flexShrink:0 }}>{t.cur} {piFmt2(tot)}</span>
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
          <div key={i} style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>{label}</span><span style={{ fontSize:13, fontWeight:700, color:col }}>{t.cur} {val}</span></div>
        ))}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0 0" }}>
          <span style={{ fontSize:15, fontWeight:800, color:th.txtPrimary }}>{t.pi_grandTotal}</span>
          <span style={{ fontSize:20, fontWeight:900, color:"#f97316" }}>{t.cur} {piFmt2(grand)}</span>
        </div>
        <div style={{ height:1, background:th.border, margin:"10px 0" }} />
        <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>💳 {t.pi_paymentMethod}</span><span style={{ fontSize:12, fontWeight:700, color:th.txtPrimary }}>{PI_PAY_METHODS[invoice.paymentMethod]?.icon} {PI_PAY_METHODS[invoice.paymentMethod]?.[lang]}</span></div>
        <div style={dr}><span style={{ fontSize:12, color:"#22c55e", fontWeight:700 }}>✅ {t.pi_amountPaid}</span><span style={{ fontSize:14, fontWeight:800, color:"#22c55e" }}>{t.cur} {piFmt2(invoice.amountPaid)}</span></div>
        <div style={{ ...dr, borderBottom:"none" }}>
          <span style={{ fontSize:13, fontWeight:700, color:balance>0.01?"#ef4444":"#22c55e" }}>{t.pi_balanceDue}</span>
          <span style={{ fontSize:16, fontWeight:900, color:balance>0.01?"#ef4444":"#22c55e" }}>{t.cur} {piFmt2(Math.max(0,balance))}</span>
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
      const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
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
    let imp=0, skip=0;
    const BATCH_SIZE = 400;
    try {
      for (let i=0; i<rows.length; i+=BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = rows.slice(i, i+BATCH_SIZE);
        for (const row of chunk) {
          // Map columns
          const mapped = { ...defaultFields, shopId, createdBy:user.uid, createdAt:serverTimestamp() };
          for (const [xlsCol, dbField] of Object.entries(columnMap)) {
            const v = cleanVal(row[xlsCol]);
            if (v) mapped[dbField] = v;
          }
          const name = mapped[nameKey]||"";
          if (!name) { skip++; continue; }
          const ref = doc(collection(db, colName));
          batch.set(ref, mapped);
          imp++;
        }
        await batch.commit();
        setProgress(Math.round(((i+BATCH_SIZE)/rows.length)*100));
        setImported(imp); setSkipped(skip);
      }
      setStatus("done"); setImported(imp); setSkipped(skip);
      onImported && onImported(imp);
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

const emptyVendor = {
  vendorName:"", vendorCode:"", category:"", status:"active",
  contactPerson:"",
  mobileNumber:"", phoneNumber:"", whatsappNumber:"", fax:"", email:"",
  address:"", emirate:"", area:"", city:"", country:"", mapLink:"",
  trnNumber:"", tradeLicenseNumber:"", tinNumber:"", binNumber:"", vatNumber:"",
  bankName:"", bankBranch:"", accountName:"", accountNumber:"", ibanNumber:"", swiftCode:"",
  creditLimit:"", openingBalance:"", paymentTerms:"",
  notes:"",
};

function VendorMasterWindow({ t, lang, th, shopId, user, vendors, toast, isDesktop, onGoToPurchase }) {
  const [vmView,setVmView]           = useState("list"); // list|form|detail
  const [showVmImport,setShowVmImport] = useState(false);
  const VM_COL_MAP = {
    VendorName:"vendorName", Address:"address", LedgerCode:"vendorCode",
    Emirate:"emirate", Area:"area", PhoneNo:"phoneNumber", MobileNo:"mobileNumber",
    Fax:"fax", Email:"email", LicenseNo:"tradeLicenseNumber", TRN:"trnNumber",
    CreditLimit:"creditLimit", CreditPeriod:"paymentTerms", OpeningBal:"openingBalance",
  };
  const VM_DEFAULTS = { ...emptyVendor, status:"active", country:"UAE" };
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
      address:vmForm.address.trim(), area:vmForm.area.trim(),
      city:vmForm.city.trim(), country:vmForm.country.trim(), mapLink:vmForm.mapLink.trim(),
      emirate:(vmForm.emirate||"").trim(), fax:(vmForm.fax||"").trim(),
      trnNumber:vmForm.trnNumber.trim(),
      tradeLicenseNumber:vmForm.tradeLicenseNumber.trim(),
      tinNumber:vmForm.tinNumber.trim(), binNumber:vmForm.binNumber.trim(), vatNumber:vmForm.vatNumber.trim(),
      bankName:vmForm.bankName.trim(), bankBranch:vmForm.bankBranch.trim(),
      accountName:vmForm.accountName.trim(), accountNumber:vmForm.accountNumber.trim(),
      ibanNumber:vmForm.ibanNumber.trim(), swiftCode:vmForm.swiftCode.trim(),
      creditLimit:Number(vmForm.creditLimit||0), openingBalance:Number(vmForm.openingBalance||0),
      paymentTerms:Number(vmForm.paymentTerms||0), notes:vmForm.notes.trim(),
    };
    try {
      if (editVendorId) {
        await updateDoc(doc(db,"vendors",editVendorId),payload);
        toast(t.vm_updated);
        setSelVendor({...payload, id:editVendorId});
        setVmView("detail");
      } else {
        const ref = await addDoc(collection(db,"vendors"),{...payload,createdBy:user.uid,createdAt:serverTimestamp()});
        toast(t.vm_saved);
        setSelVendor({...payload, id:ref.id});
        setVmView("detail");
      }
      setVmForm({...emptyVendor});
      setEditVendorId(null);
    } catch(e) { toast(e.message,"err"); }
    finally { setVmSaving(false); }
  };

  const vmDelete = async (v) => {
    if (!window.confirm(t.vm_confirmDelete)) return;
    try {
      await deleteDoc(doc(db,"vendors",v.id));
      toast(t.vm_deleted,"err");
      setVmView("list"); setSelVendor(null);
    } catch(e) { toast(e.message,"err"); }
  };

  const openEdit = (v) => {
    setVmForm({
      vendorName:v.vendorName||"", vendorCode:v.vendorCode||"",
      category:v.category||"", status:v.status||"active",
      contactPerson:v.contactPerson||"",
      mobileNumber:v.mobileNumber||"", phoneNumber:v.phoneNumber||"",
      whatsappNumber:v.whatsappNumber||"", email:v.email||"",
      address:v.address||"", area:v.area||"", city:v.city||"",
      country:v.country||"", mapLink:v.mapLink||"",
      trnNumber:v.trnNumber||"", tradeLicenseNumber:v.tradeLicenseNumber||"",
      tinNumber:v.tinNumber||"", binNumber:v.binNumber||"", vatNumber:v.vatNumber||"",
      bankName:v.bankName||"", bankBranch:v.bankBranch||"",
      accountName:v.accountName||"", accountNumber:v.accountNumber||"",
      ibanNumber:v.ibanNumber||"", swiftCode:v.swiftCode||"",
      creditLimit:String(v.creditLimit||""), openingBalance:String(v.openingBalance||""),
      paymentTerms:String(v.paymentTerms||""), notes:v.notes||"",
    });
    setEditVendorId(v.id);
    setVmView("form");
  };

  // ══════════════════════════════════
  // LIST VIEW
  // ══════════════════════════════════
  if (vmView==="list") return (
    <div style={panel}>
      {showVmImport&&<ExcelImportModal t={t} lang={lang} th={th} shopId={shopId} user={user}
        type="vendor" columnMap={VM_COL_MAP} defaultFields={VM_DEFAULTS}
        collection="vendors"
        onClose={()=>setShowVmImport(false)}
        onImported={(n)=>{ setShowVmImport(false); toast(`✅ ${n} ${lang==="bn"?"জন ভেন্ডর ইমপোর্ট হয়েছে":"vendors imported!"}`) }} />}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:16, fontWeight:800, color:"#f97316" }}>{t.vm_title}</div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>setShowVmImport(true)}
            style={{ padding:"9px 14px", borderRadius:10, border:"1px solid #f97316", background:"rgba(249,115,22,0.08)", color:"#f97316", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            {t.vm_import}
          </button>
          <button onClick={()=>{ setVmForm({...emptyVendor}); setEditVendorId(null); setVmView("form"); }}
            style={{ padding:"9px 16px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            {t.vm_new}
          </button>
        </div>
      </div>

      {/* KPI */}
      {vendors.length>0&&(
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
          {[
            { l:t.vm_totalVendors,  v:kpi.total,             c:"#a1a1aa", pre:"" },
            { l:t.vm_activeVendors, v:kpi.active,            c:"#22c55e", pre:"" },
            { l:t.vm_totalCredit,   v:`${t.cur}${(kpi.credit/1000).toFixed(0)}k`, c:"#f97316", pre:"" },
          ].map((k,i)=>(
            <div key={i} style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
              <div style={{ fontSize:17, fontWeight:900, color:k.c }}>{k.pre}{k.v}</div>
              <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginTop:2, letterSpacing:0.4 }}>{k.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ position:"relative", marginBottom:10 }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
        <input style={{ ...inp(), paddingLeft:38, background:th.bgCard }} placeholder={t.vm_searchPh} value={vmSearch} onChange={e=>setVmSearch(e.target.value)} />
        {vmSearch&&<button onClick={()=>setVmSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:th.txtMuted, cursor:"pointer", fontSize:16 }}>✕</button>}
      </div>

      {/* Status pills */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {["ALL","active","inactive","blocked"].map(st=>(
          <button key={st} onClick={()=>setVmStatusF(st)} style={{ padding:"5px 13px", borderRadius:20, border:"1px solid", whiteSpace:"nowrap", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit", background:vmStatusF===st?"#f97316":"transparent", borderColor:vmStatusF===st?"#f97316":th.borderMid, color:vmStatusF===st?"#fff":th.txtMuted }}>
            {st==="ALL"?t.vm_allStatus:(VM_STATUS[st]?.[lang]||st)}
          </button>
        ))}
      </div>

      {/* Empty states */}
      {vendors.length===0&&<div style={{ textAlign:"center", padding:"60px 20px", color:th.txtFaint }}><div style={{ fontSize:46, marginBottom:10 }}>🏭</div><div>{t.vm_noVendors}</div></div>}
      {vendors.length>0&&filtered.length===0&&<div style={{ textAlign:"center", padding:"40px 20px", color:th.txtFaint }}><div style={{ fontSize:36 }}>🔍</div><div>{t.vm_noResults}</div></div>}

      {/* Vendor cards */}
      {filtered.map(v=>(
        <div key={v.id} onClick={()=>{ setSelVendor(v); setVmView("detail"); }}
          style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:"12px 14px", marginBottom:8, cursor:"pointer" }}
          onMouseEnter={e=>e.currentTarget.style.borderColor="#f97316"}
          onMouseLeave={e=>e.currentTarget.style.borderColor=th.border}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:5 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:th.txtPrimary }}>{v.vendorName}</div>
              {v.vendorCode&&<div style={{ fontSize:11, color:"#a1a1aa", marginTop:1, fontFamily:"monospace" }}>#{v.vendorCode}</div>}
            </div>
            <VmStatusBadge status={v.status||"active"} lang={lang} />
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginTop:5 }}>
            {v.mobileNumber&&<span style={{ fontSize:12, color:th.txtMuted }}>📱 {v.mobileNumber}</span>}
            {v.city&&<span style={{ fontSize:12, color:th.txtMuted }}>📍 {v.city}</span>}
            {v.trnNumber&&<span style={{ fontSize:12, color:"#f59e0b", fontFamily:"monospace" }}>TRN: {v.trnNumber}</span>}
            {v.creditLimit>0&&<span style={{ fontSize:12, color:"#f97316", fontWeight:700 }}>💳 {t.cur}{v.creditLimit.toLocaleString()}</span>}
            {v.category&&<span style={{ fontSize:11, color:th.txtFaint, background:th.bgInp, padding:"2px 7px", borderRadius:6 }}>{v.category}</span>}
          </div>
        </div>
      ))}
    </div>
  );

  // ══════════════════════════════════
  // DETAIL VIEW
  // ══════════════════════════════════
  if (vmView==="detail"&&selVendor) {
    const v = vendors.find(x=>x.id===selVendor.id)||selVendor;
    const dr = { display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"8px 0", borderBottom:`1px solid ${th.border}` };
    const row = (label, val, color=th.txtPrimary) => val ? (
      <div style={dr}>
        <span style={{ fontSize:12, color:th.txtMuted, flexShrink:0, width:130 }}>{label}</span>
        <span style={{ fontSize:13, fontWeight:600, color, textAlign:"right", wordBreak:"break-word", maxWidth:"60%" }}>{val}</span>
      </div>
    ) : null;
    return (
      <div style={panel}>
        <button onClick={()=>{ setVmView("list"); setSelVendor(null); }} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:13, fontWeight:700, padding:"0 0 14px 0", fontFamily:"inherit" }}>{t.vm_backToList}</button>

        {/* Header */}
        <div style={card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
            <div>
              <div style={{ fontSize:20, fontWeight:900, color:th.txtPrimary }}>{v.vendorName}</div>
              {v.vendorCode&&<div style={{ fontSize:12, color:"#a1a1aa", fontFamily:"monospace", marginTop:2 }}>#{v.vendorCode}</div>}
              {v.category&&<div style={{ fontSize:11, color:th.txtFaint, marginTop:3 }}>{v.category}</div>}
            </div>
            <VmStatusBadge status={v.status||"active"} lang={lang} />
          </div>
          {row(t.vm_contactPerson, v.contactPerson)}
          {row(t.vm_mobile, v.mobileNumber, "#06b6d4")}
          {row(t.vm_phone, v.phoneNumber)}
          {row(t.vm_whatsapp, v.whatsappNumber, "#22c55e")}
          {row(t.vm_email, v.email)}
        </div>

        {/* Address */}
        {(v.address||v.city||v.country||v.mapLink)&&(
          <div style={card}>
            {secLabel("📍", t.vm_secAddress)}
            {row(t.vm_address, v.address)}
            {row(t.vm_area, v.area)}
            {row(t.vm_city, v.city)}
            {row(t.vm_country, v.country)}
            {v.mapLink&&<div style={{ ...dr, borderBottom:"none" }}>
              <span style={{ fontSize:12, color:th.txtMuted }}>{t.vm_mapLink}</span>
              <a href={v.mapLink} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:"#6366f1" }}>🗺️ {lang==="bn"?"ম্যাপ দেখুন":"View Map"}</a>
            </div>}
          </div>
        )}

        {/* Tax */}
        {(v.trnNumber||v.tradeLicenseNumber||v.tinNumber||v.binNumber||v.vatNumber)&&(
          <div style={card}>
            {secLabel("🧾", t.vm_secTax)}
            {row(t.vm_trnNumber, v.trnNumber, "#f59e0b")}
            {row(t.vm_tradeLicense, v.tradeLicenseNumber)}
            {row(t.vm_tinNumber, v.tinNumber)}
            {row(t.vm_binNumber, v.binNumber)}
            {row(t.vm_vatNumber, v.vatNumber)}
          </div>
        )}

        {/* Bank */}
        {(v.bankName||v.accountNumber||v.ibanNumber)&&(
          <div style={card}>
            {secLabel("🏦", t.vm_secBank)}
            {row(t.vm_bankName, v.bankName)}
            {row(t.vm_bankBranch, v.bankBranch)}
            {row(t.vm_accountName, v.accountName)}
            {row(t.vm_accountNumber, v.accountNumber, "#06b6d4")}
            {row(t.vm_iban, v.ibanNumber)}
            {row(t.vm_swift, v.swiftCode)}
          </div>
        )}

        {/* Credit */}
        {(v.creditLimit>0||v.paymentTerms>0)&&(
          <div style={card}>
            {secLabel("💳", t.vm_secCredit)}
            {v.creditLimit>0&&<div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>{t.vm_creditLimit}</span><span style={{ fontSize:16, fontWeight:800, color:"#f97316" }}>{t.cur}{v.creditLimit.toLocaleString()}</span></div>}
            {v.openingBalance>0&&row(t.vm_openingBalance, `{t.cur}${v.openingBalance.toLocaleString()}`)}
            {v.paymentTerms>0&&row(t.vm_paymentTerms, `NET ${v.paymentTerms} ${lang==="bn"?"দিন":"Days"}`)}
          </div>
        )}

        {/* Notes */}
        {v.notes&&(
          <div style={{ ...card, borderLeft:"3px solid #f97316" }}>
            <div style={{ fontSize:10, color:"#f97316", fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>📝 {t.vm_secNotes}</div>
            <div style={{ fontSize:13, color:th.txtSecondary, lineHeight:1.6 }}>{v.notes}</div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {onGoToPurchase&&<button onClick={()=>onGoToPurchase(v)} style={{ padding:"13px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>{t.vm_createInvoice}</button>}
          <button onClick={()=>openEdit(v)} style={{ padding:"12px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#1d4ed8,#2563eb)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>{t.vm_editBtn}</button>
          <button onClick={()=>vmDelete(v)} style={{ padding:"11px", borderRadius:12, border:"1px solid #450a0a", background:"transparent", color:"#ef4444", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.vm_delete}</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════
  // FORM VIEW
  // ══════════════════════════════════
  return (
    <div style={panel}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <button onClick={()=>{ setVmView(editVendorId?"detail":"list"); }} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:13, fontWeight:700, padding:0, fontFamily:"inherit" }}>{t.vm_backToList}</button>
        <div style={{ fontSize:13, fontWeight:800, color:"#f97316" }}>{editVendorId?t.vm_edit:t.vm_new}</div>
      </div>

      {/* Section 1: Basic Info */}
      <div style={card}>
        {secLabel("📋", t.vm_secBasic)}
        <div style={grid2}>
          {fieldWrap(t.vm_vendorName, <input style={inp()} placeholder={lang==="bn"?"ভেন্ডরের নাম...":"Vendor name..."} value={vmForm.vendorName} onChange={e=>upd("vendorName",e.target.value)} />, false)}
          {fieldWrap(t.vm_vendorCode, <input style={inp()} placeholder="V-001" value={vmForm.vendorCode} onChange={e=>upd("vendorCode",e.target.value)} />)}
          {fieldWrap(t.vm_category,
            <select style={{ ...inp(), background:th.bgCard }} value={vmForm.category} onChange={e=>upd("category",e.target.value)}>
              <option value="">{lang==="bn"?"ক্যাটাগরি বেছে নিন":"Select category"}</option>
              {(t.vm_categories||[]).map((c,i)=><option key={i} value={c}>{c}</option>)}
            </select>
          )}
          {fieldWrap(t.vm_status,
            <select style={{ ...inp(), background:th.bgCard }} value={vmForm.status} onChange={e=>upd("status",e.target.value)}>
              <option value="active">{VM_STATUS.active[lang]}</option>
              <option value="inactive">{VM_STATUS.inactive[lang]}</option>
              <option value="blocked">{VM_STATUS.blocked[lang]}</option>
            </select>
          )}
        </div>
      </div>

      {/* Section 2: Contact */}
      <div style={card}>
        {secLabel("📱", t.vm_secContact)}
        <div style={grid2}>
          {fieldWrap(t.vm_contactPerson, <input style={inp()} placeholder={lang==="bn"?"যোগাযোগ ব্যক্তির নাম":"Contact person name"} value={vmForm.contactPerson} onChange={e=>upd("contactPerson",e.target.value)} />, false)}
          {fieldWrap(t.vm_mobile, <input style={inp()} inputMode="tel" placeholder="017XXXXXXXX" value={vmForm.mobileNumber} onChange={e=>upd("mobileNumber",e.target.value)} />)}
          {fieldWrap(t.vm_phone, <input style={inp()} inputMode="tel" placeholder="02XXXXXXXX" value={vmForm.phoneNumber} onChange={e=>upd("phoneNumber",e.target.value)} />)}
          {fieldWrap(t.vm_whatsapp, <input style={inp()} inputMode="tel" placeholder="017XXXXXXXX" value={vmForm.whatsappNumber} onChange={e=>upd("whatsappNumber",e.target.value)} />)}
          {fieldWrap(t.vm_email, <input style={inp()} inputMode="email" placeholder="vendor@email.com" value={vmForm.email} onChange={e=>upd("email",e.target.value)} />, false)}
        </div>
      </div>

      {/* Section 3: Address */}
      <div style={card}>
        {secLabel("📍", t.vm_secAddress)}
        <div style={{ marginBottom:10 }}>
          {fieldWrap(t.vm_address,
            <AutoTA style={taStyle} placeholder={lang==="bn"?"সম্পূর্ণ ঠিকানা লিখুন...":"Full address..."} value={vmForm.address} onChange={e=>upd("address",e.target.value)} />,
            true
          )}
        </div>
        <div style={grid2}>
          {fieldWrap(t.vm_emirate, <input style={inp()} placeholder="ABU DHABI / DUBAI..." value={vmForm.emirate||""} onChange={e=>upd("emirate",e.target.value)} />)}
          {fieldWrap(t.vm_area, <input style={inp()} placeholder={lang==="bn"?"এলাকা":"Area"} value={vmForm.area} onChange={e=>upd("area",e.target.value)} />)}
          {fieldWrap(t.vm_city, <input style={inp()} placeholder={lang==="bn"?"শহর":"City"} value={vmForm.city} onChange={e=>upd("city",e.target.value)} />)}
          {fieldWrap(t.vm_country, <input style={inp()} placeholder="UAE..." value={vmForm.country} onChange={e=>upd("country",e.target.value)} />)}
          {fieldWrap(t.vm_fax, <input style={inp()} inputMode="tel" placeholder={lang==="bn"?"ফ্যাক্স নম্বর":"Fax number"} value={vmForm.fax||""} onChange={e=>upd("fax",e.target.value)} />)}
          {fieldWrap(t.vm_mapLink, <input style={inp()} placeholder="https://maps.google.com/..." value={vmForm.mapLink} onChange={e=>upd("mapLink",e.target.value)} />)}
        </div>
      </div>

      {/* Section 4: Tax & Legal */}
      <div style={card}>
        {secLabel("🧾", t.vm_secTax)}
        <div style={grid2}>
          {fieldWrap(t.vm_trnNumber, <input style={{ ...inp(), borderColor:"#f59e0b", fontFamily:"monospace" }} placeholder="100XXXXXXXXX" value={vmForm.trnNumber} onChange={e=>upd("trnNumber",e.target.value)} />, false)}
          {fieldWrap(t.vm_tradeLicense, <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="TL-XXXXXXXX" value={vmForm.tradeLicenseNumber} onChange={e=>upd("tradeLicenseNumber",e.target.value)} />)}
          {fieldWrap(t.vm_tinNumber, <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="TIN Number" value={vmForm.tinNumber} onChange={e=>upd("tinNumber",e.target.value)} />)}
          {fieldWrap(t.vm_binNumber, <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="BIN Number" value={vmForm.binNumber} onChange={e=>upd("binNumber",e.target.value)} />)}
          {fieldWrap(t.vm_vatNumber, <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="VAT Number" value={vmForm.vatNumber} onChange={e=>upd("vatNumber",e.target.value)} />)}
        </div>
      </div>

      {/* Section 5: Bank */}
      <div style={card}>
        {secLabel("🏦", t.vm_secBank)}
        <div style={grid2}>
          {fieldWrap(t.vm_bankName, <input style={inp()} placeholder={lang==="bn"?"ব্যাংকের নাম":"Bank name"} value={vmForm.bankName} onChange={e=>upd("bankName",e.target.value)} />)}
          {fieldWrap(t.vm_bankBranch, <input style={inp()} placeholder={lang==="bn"?"শাখা":"Branch"} value={vmForm.bankBranch} onChange={e=>upd("bankBranch",e.target.value)} />)}
          {fieldWrap(t.vm_accountName, <input style={inp()} placeholder={lang==="bn"?"অ্যাকাউন্টের নাম":"Account name"} value={vmForm.accountName} onChange={e=>upd("accountName",e.target.value)} />, false)}
          {fieldWrap(t.vm_accountNumber, <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="Account number" value={vmForm.accountNumber} onChange={e=>upd("accountNumber",e.target.value)} />)}
          {fieldWrap(t.vm_iban, <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="AE070331234567890123456" value={vmForm.ibanNumber} onChange={e=>upd("ibanNumber",e.target.value)} />, false)}
          {fieldWrap(t.vm_swift, <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="BOMLAEADXXX" value={vmForm.swiftCode} onChange={e=>upd("swiftCode",e.target.value)} />)}
        </div>
      </div>

      {/* Section 6: Credit */}
      <div style={card}>
        {secLabel("💳", t.vm_secCredit)}
        <div style={grid2}>
          {fieldWrap(t.vm_creditLimit, <input style={inp()} inputMode="numeric" placeholder="50000" value={vmForm.creditLimit} onChange={e=>upd("creditLimit",e.target.value)} />)}
          {fieldWrap(t.vm_openingBalance, <input style={inp()} inputMode="numeric" placeholder="0" value={vmForm.openingBalance} onChange={e=>upd("openingBalance",e.target.value)} />)}
          {fieldWrap(t.vm_paymentTerms, <input style={inp()} inputMode="numeric" placeholder="30" value={vmForm.paymentTerms} onChange={e=>upd("paymentTerms",e.target.value)} />)}
        </div>
      </div>

      {/* Section 7: Notes */}
      <div style={{ ...card, marginBottom:16 }}>
        {secLabel("📝", t.vm_secNotes)}
        <AutoTA style={taStyle} placeholder={lang==="bn"?"যেকোনো বিশেষ নোট বা মন্তব্য...":"Any special notes or remarks..."} value={vmForm.notes} onChange={e=>upd("notes",e.target.value)} />
      </div>

      {/* Action buttons */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <button onClick={vmSave} disabled={vmSaving} style={{ padding:"14px", borderRadius:12, border:"none", background:vmSaving?"#1e3a5f":"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:15, fontWeight:800, cursor:vmSaving?"not-allowed":"pointer" }}>
          {vmSaving?"...":(editVendorId?t.vm_save:t.vm_save)}
        </button>
        <button onClick={()=>setVmView(editVendorId?"detail":"list")} style={{ padding:"12px", borderRadius:12, border:`1px solid ${th.borderMid}`, background:"transparent", color:th.txtMuted, fontSize:14, fontWeight:700, cursor:"pointer" }}>
          {t.vm_cancel}
        </button>
      </div>
    </div>
  );
}

// ─── CUSTOMER MASTER WINDOW ───────────────────────────────────
const CM_STATUS = {
  active:   { bn:"সক্রিয়",   en:"Active",   color:"#22c55e", bg:"#052e16" },
  inactive: { bn:"নিষ্ক্রিয়", en:"Inactive", color:"#f59e0b", bg:"#451a03" },
  blocked:  { bn:"ব্লক করা",  en:"Blocked",  color:"#ef4444", bg:"#450a0a" },
};
const CM_PAY = {
  cash:   { bn:"নগদ",         en:"Cash",   color:"#22c55e", icon:"💵" },
  credit: { bn:"ক্রেডিট",    en:"Credit", color:"#f97316", icon:"📅" },
};

const emptyCustomer = {
  customerName:"", customerCode:"", customerType:"", status:"active",
  paymentType:"cash",
  contactPerson:"",
  mobileNumber:"", phoneNumber:"", whatsappNumber:"", fax:"", email:"",
  address:"", emirate:"", area:"", city:"", country:"", mapLink:"",
  trnNumber:"", tradeLicenseNumber:"", tinNumber:"", binNumber:"", vatNumber:"",
  bankName:"", bankBranch:"", accountName:"", accountNumber:"", ibanNumber:"", swiftCode:"",
  creditLimit:"", openingBalance:"", paymentTerms:"",
  discountPerc:"", assignedSalesman:"",
  notes:"",
};

function CmStatusBadge({ status, lang }) {
  const st = CM_STATUS[status]||CM_STATUS.active;
  return <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, color:st.color, background:st.bg, whiteSpace:"nowrap" }}>{st[lang]}</span>;
}

function CustomerMasterWindow({ t, lang, th, shopId, user, customers, team, toast, isDesktop }) {
  const [cmView,setCmView]             = useState("list");
  const [showCmImport,setShowCmImport] = useState(false);
  const CM_COL_MAP = {
    CustomerName:"customerName", Address:"address", LedgerCode:"customerCode",
    Emirate:"emirate", Area:"area", PhoneNo:"phoneNumber", MobileNo:"mobileNumber",
    Fax:"fax", Email:"email", LicenseNo:"tradeLicenseNumber", TRN:"trnNumber",
    CreditLimit:"creditLimit", CreditPeriod:"paymentTerms", OpeningBal:"openingBalance",
  };
  const CM_DEFAULTS = { ...emptyCustomer, customerType:"corporate", status:"active", country:"UAE", paymentType:"credit" };
  const [selCustomer,setSelCustomer]   = useState(null);
  const [editCustomerId,setEditCustomerId] = useState(null);
  const [cmForm,setCmForm]             = useState({...emptyCustomer});
  const [cmSaving,setCmSaving]         = useState(false);
  const [cmSearch,setCmSearch]         = useState("");
  const [cmStatusF,setCmStatusF]       = useState("ALL");
  const [cmPayF,setCmPayF]             = useState("ALL"); // ALL|cash|credit

  const upd = (k,v) => setCmForm(p=>({...p,[k]:v}));

  const panel = isDesktop
    ? {maxWidth:860,margin:"0 auto",padding:"24px 28px 80px"}
    : {maxWidth:640,margin:"0 auto",padding:"16px 14px 80px"};

  const inp = (ex={}) => ({
    padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`,
    background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none",
    width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...ex,
  });
  const taStyle = { ...inp(), minHeight:52, resize:"none", overflow:"hidden", lineHeight:1.6 };
  const secLbl = (icon, label) => (
    <div style={{ fontSize:11, color:"#f97316", fontWeight:700, textTransform:"uppercase",
      letterSpacing:0.5, padding:"8px 0 8px", borderBottom:`1px solid ${th.border}`, marginBottom:12 }}>
      {icon} {label}
    </div>
  );
  const fw = (label, node, full=false) => (
    <div style={{ gridColumn:full?"1/-1":"auto" }}>
      <div style={{ fontSize:10, color:th.txtMuted, fontWeight:700, textTransform:"uppercase", letterSpacing:0.4, marginBottom:4 }}>{label}</div>
      {node}
    </div>
  );
  const grid2 = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:4 };
  const card  = { background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:12 };

  // ── filter ──
  const cmFiltered = customers.filter(c=>{
    const matchSt  = cmStatusF==="ALL" || c.status===cmStatusF;
    const matchPay = cmPayF==="ALL"    || c.paymentType===cmPayF;
    const hay = [c.customerName,c.customerCode,c.mobileNumber,c.trnNumber,c.city,c.contactPerson,c.email].filter(Boolean).join(" ");
    return matchSt && matchPay && nsmatch(hay, cmSearch.trim());
  });

  const kpi = {
    total:  customers.length,
    active: customers.filter(c=>c.status==="active").length,
    credit: customers.filter(c=>c.paymentType==="credit").length,
    totalCL: customers.reduce((s,c)=>s+(c.creditLimit||0),0),
  };

  // ── save ──
  const cmSave = async () => {
    if (!cmForm.customerName.trim()) { toast(t.cm_errName,"err"); return; }
    if (!cmForm.mobileNumber.trim()) { toast(t.cm_errMobile,"err"); return; }
    setCmSaving(true);
    const payload = {
      shopId, updatedBy:user.uid, updatedAt:serverTimestamp(),
      customerName:cmForm.customerName.trim(), customerCode:cmForm.customerCode.trim(),
      customerType:cmForm.customerType||"", status:cmForm.status||"active",
      paymentType:cmForm.paymentType||"cash",
      contactPerson:cmForm.contactPerson.trim(),
      mobileNumber:cmForm.mobileNumber.trim(), phoneNumber:cmForm.phoneNumber.trim(),
      whatsappNumber:cmForm.whatsappNumber.trim(), email:cmForm.email.trim(),
      address:cmForm.address.trim(), area:cmForm.area.trim(),
      city:cmForm.city.trim(), country:cmForm.country.trim(), mapLink:cmForm.mapLink.trim(),
      emirate:(cmForm.emirate||"").trim(), fax:(cmForm.fax||"").trim(),
      trnNumber:cmForm.trnNumber.trim(), tradeLicenseNumber:cmForm.tradeLicenseNumber.trim(),
      tinNumber:cmForm.tinNumber.trim(), binNumber:cmForm.binNumber.trim(), vatNumber:cmForm.vatNumber.trim(),
      bankName:cmForm.bankName.trim(), bankBranch:cmForm.bankBranch.trim(),
      accountName:cmForm.accountName.trim(), accountNumber:cmForm.accountNumber.trim(),
      ibanNumber:cmForm.ibanNumber.trim(), swiftCode:cmForm.swiftCode.trim(),
      creditLimit:Number(cmForm.creditLimit||0),
      openingBalance:Number(cmForm.openingBalance||0),
      paymentTerms:Number(cmForm.paymentTerms||0),
      discountPerc:Number(cmForm.discountPerc||0),
      assignedSalesman:cmForm.assignedSalesman.trim(),
      notes:cmForm.notes.trim(),
    };
    try {
      if (editCustomerId) {
        await updateDoc(doc(db,"customers",editCustomerId),payload);
        toast(t.cm_updated);
        const updated = {...payload, id:editCustomerId};
        setSelCustomer(updated);
        setCmView("detail");
      } else {
        const ref = await addDoc(collection(db,"customers"),{...payload,createdBy:user.uid,createdAt:serverTimestamp()});
        toast(t.cm_saved);
        setSelCustomer({...payload, id:ref.id});
        setCmView("detail");
      }
      setCmForm({...emptyCustomer});
      setEditCustomerId(null);
    } catch(e) { toast(e.message,"err"); }
    finally { setCmSaving(false); }
  };

  const cmDelete = async (c) => {
    if (!window.confirm(t.cm_confirmDelete)) return;
    try {
      await deleteDoc(doc(db,"customers",c.id));
      toast(t.cm_deleted,"err");
      setCmView("list"); setSelCustomer(null);
    } catch(e) { toast(e.message,"err"); }
  };

  const openEdit = (c) => {
    setCmForm({
      customerName:c.customerName||"", customerCode:c.customerCode||"",
      customerType:c.customerType||"", status:c.status||"active",
      paymentType:c.paymentType||"cash",
      contactPerson:c.contactPerson||"",
      mobileNumber:c.mobileNumber||"", phoneNumber:c.phoneNumber||"",
      whatsappNumber:c.whatsappNumber||"", email:c.email||"",
      address:c.address||"", area:c.area||"", city:c.city||"",
      country:c.country||"", mapLink:c.mapLink||"",
      trnNumber:c.trnNumber||"", tradeLicenseNumber:c.tradeLicenseNumber||"",
      tinNumber:c.tinNumber||"", binNumber:c.binNumber||"", vatNumber:c.vatNumber||"",
      bankName:c.bankName||"", bankBranch:c.bankBranch||"",
      accountName:c.accountName||"", accountNumber:c.accountNumber||"",
      ibanNumber:c.ibanNumber||"", swiftCode:c.swiftCode||"",
      creditLimit:String(c.creditLimit||""), openingBalance:String(c.openingBalance||""),
      paymentTerms:String(c.paymentTerms||""), discountPerc:String(c.discountPerc||""),
      assignedSalesman:c.assignedSalesman||"", notes:c.notes||"",
    });
    setEditCustomerId(c.id);
    setCmView("form");
  };

  // ══════ LIST VIEW ══════
  if (cmView==="list") return (
    <div style={panel}>
      {showCmImport&&<ExcelImportModal t={t} lang={lang} th={th} shopId={shopId} user={user}
        type="customer" columnMap={CM_COL_MAP} defaultFields={CM_DEFAULTS}
        collection="customers"
        onClose={()=>setShowCmImport(false)}
        onImported={(n)=>{ setShowCmImport(false); toast(`✅ ${n} ${lang==="bn"?"জন কাস্টমার ইমপোর্ট হয়েছে":"customers imported!"}`) }} />}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:16, fontWeight:800, color:"#f97316" }}>{t.cm_title}</div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>setShowCmImport(true)}
            style={{ padding:"9px 14px", borderRadius:10, border:"1px solid #f97316", background:"rgba(249,115,22,0.08)", color:"#f97316", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            {t.cm_import}
          </button>
          <button onClick={()=>{ setCmForm({...emptyCustomer}); setEditCustomerId(null); setCmView("form"); }}
            style={{ padding:"9px 16px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            {t.cm_new}
          </button>
        </div>
      </div>

      {/* KPI */}
      {customers.length>0&&(
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
          {[
            { l:t.cm_totalCustomers, v:kpi.total,  c:"#a1a1aa" },
            { l:t.cm_activeCustomers,v:kpi.active, c:"#22c55e" },
            { l:lang==="bn"?"ক্রেডিট":"Credit",   v:kpi.credit,c:"#f97316" },
            { l:lang==="bn"?"মোট ক্রেডিট":"Total CL", v:`${t.cur}${Math.round(kpi.totalCL/1000)}k`, c:"#06b6d4" },
          ].map((k,i)=>(
            <div key={i} style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:10, padding:"10px 8px", textAlign:"center" }}>
              <div style={{ fontSize:15, fontWeight:900, color:k.c }}>{k.v}</div>
              <div style={{ fontSize:8, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginTop:2, letterSpacing:0.3 }}>{k.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ position:"relative", marginBottom:10 }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
        <input style={{ ...inp(), paddingLeft:38, background:th.bgCard }} placeholder={t.cm_searchPh}
          value={cmSearch} onChange={e=>setCmSearch(e.target.value)} />
        {cmSearch&&<button onClick={()=>setCmSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:th.txtMuted, cursor:"pointer", fontSize:16 }}>✕</button>}
      </div>

      {/* Filter pills */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
        {/* Status */}
        {["ALL","active","inactive","blocked"].map(st=>(
          <button key={st} onClick={()=>setCmStatusF(st)} style={{ padding:"5px 12px", borderRadius:20, border:"1px solid", whiteSpace:"nowrap", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit", background:cmStatusF===st?"#f97316":"transparent", borderColor:cmStatusF===st?"#f97316":th.borderMid, color:cmStatusF===st?"#fff":th.txtMuted }}>
            {st==="ALL"?t.cm_allStatus:(CM_STATUS[st]?.[lang]||st)}
          </button>
        ))}
        <div style={{ width:1, background:th.border, margin:"0 4px" }} />
        {/* Payment type */}
        {["ALL","cash","credit"].map(pt=>(
          <button key={pt} onClick={()=>setCmPayF(pt)} style={{ padding:"5px 12px", borderRadius:20, border:"1px solid", whiteSpace:"nowrap", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit", background:cmPayF===pt?(pt==="cash"?"#22c55e":pt==="credit"?"#f97316":"#6366f1"):"transparent", borderColor:cmPayF===pt?"transparent":th.borderMid, color:cmPayF===pt?"#fff":th.txtMuted }}>
            {pt==="ALL"?(lang==="bn"?"সব ধরন":"All Types"):CM_PAY[pt]?.[lang]}
          </button>
        ))}
      </div>

      {/* Empty */}
      {customers.length===0&&<div style={{ textAlign:"center", padding:"60px 20px", color:th.txtFaint }}><div style={{ fontSize:46, marginBottom:10 }}>👥</div><div>{t.cm_noCustomers}</div></div>}
      {customers.length>0&&cmFiltered.length===0&&<div style={{ textAlign:"center", padding:"40px 20px", color:th.txtFaint }}><div style={{ fontSize:36 }}>🔍</div><div>{t.cm_noResults}</div></div>}

      {/* Customer cards */}
      {cmFiltered.map(c=>(
        <div key={c.id} onClick={()=>{ setSelCustomer(c); setCmView("detail"); }}
          style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:"12px 14px", marginBottom:8, cursor:"pointer" }}
          onMouseEnter={e=>e.currentTarget.style.borderColor="#f97316"}
          onMouseLeave={e=>e.currentTarget.style.borderColor=th.border}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:5 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:800, color:th.txtPrimary, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.customerName}</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:3, alignItems:"center" }}>
                {c.customerCode&&<span style={{ fontSize:11, color:"#a1a1aa", fontFamily:"monospace" }}>#{c.customerCode}</span>}
                {c.customerType&&<span style={{ fontSize:10, color:th.txtFaint, background:th.bgInp, padding:"1px 7px", borderRadius:10 }}>{c.customerType}</span>}
                <span style={{ fontSize:11, fontWeight:700, color:CM_PAY[c.paymentType||"cash"]?.color }}>
                  {CM_PAY[c.paymentType||"cash"]?.icon} {CM_PAY[c.paymentType||"cash"]?.[lang]}
                </span>
              </div>
            </div>
            <CmStatusBadge status={c.status||"active"} lang={lang} />
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginTop:5 }}>
            {c.mobileNumber&&<span style={{ fontSize:12, color:th.txtMuted }}>📱 {c.mobileNumber}</span>}
            {c.city&&<span style={{ fontSize:12, color:th.txtMuted }}>📍 {c.city}</span>}
            {c.trnNumber&&<span style={{ fontSize:11, color:"#f59e0b", fontFamily:"monospace" }}>TRN: {c.trnNumber}</span>}
            {c.paymentType==="credit"&&c.creditLimit>0&&<span style={{ fontSize:12, color:"#f97316", fontWeight:700 }}>💳 {t.cur}{c.creditLimit.toLocaleString()}</span>}
            {c.discountPerc>0&&<span style={{ fontSize:11, color:"#22c55e", fontWeight:700 }}>🏷️ {c.discountPerc}% off</span>}
          </div>
        </div>
      ))}
    </div>
  );

  // ══════ DETAIL VIEW ══════
  if (cmView==="detail"&&selCustomer) {
    const c = customers.find(x=>x.id===selCustomer.id)||selCustomer;
    const dr = { display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"8px 0", borderBottom:`1px solid ${th.border}` };
    const row = (label, val, color=th.txtPrimary) => val ? (
      <div style={dr}>
        <span style={{ fontSize:12, color:th.txtMuted, flexShrink:0, width:140 }}>{label}</span>
        <span style={{ fontSize:13, fontWeight:600, color, textAlign:"right", wordBreak:"break-word", maxWidth:"58%" }}>{val}</span>
      </div>
    ) : null;
    return (
      <div style={panel}>
        <button onClick={()=>{ setCmView("list"); setSelCustomer(null); }} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:13, fontWeight:700, padding:"0 0 14px 0", fontFamily:"inherit" }}>{t.cm_backToList}</button>

        {/* Header */}
        <div style={card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
            <div>
              <div style={{ fontSize:20, fontWeight:900, color:th.txtPrimary }}>{c.customerName}</div>
              <div style={{ display:"flex", gap:8, marginTop:4, flexWrap:"wrap", alignItems:"center" }}>
                {c.customerCode&&<span style={{ fontSize:12, color:"#a1a1aa", fontFamily:"monospace" }}>#{c.customerCode}</span>}
                {c.customerType&&<span style={{ fontSize:11, color:th.txtFaint, background:th.bgInp, padding:"2px 8px", borderRadius:10 }}>{c.customerType}</span>}
                <span style={{ fontSize:12, fontWeight:700, color:CM_PAY[c.paymentType||"cash"]?.color, background:`${CM_PAY[c.paymentType||"cash"]?.color}15`, padding:"2px 10px", borderRadius:10 }}>
                  {CM_PAY[c.paymentType||"cash"]?.icon} {CM_PAY[c.paymentType||"cash"]?.[lang]}
                </span>
              </div>
            </div>
            <CmStatusBadge status={c.status||"active"} lang={lang} />
          </div>
          {row(t.cm_contactPerson, c.contactPerson)}
          {row(t.cm_mobile, c.mobileNumber, "#06b6d4")}
          {row(t.cm_phone, c.phoneNumber)}
          {row(t.cm_whatsapp, c.whatsappNumber, "#22c55e")}
          {row(t.cm_email, c.email)}
        </div>

        {/* Credit box — featured prominently */}
        {(c.paymentType==="credit"||c.creditLimit>0)&&(
          <div style={{ background:"linear-gradient(135deg,rgba(249,115,22,0.1),rgba(249,115,22,0.04))", border:"1.5px solid #f97316", borderRadius:14, padding:"14px 16px", marginBottom:12 }}>
            <div style={{ fontSize:10, color:"#f97316", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginBottom:10 }}>💳 {t.cm_secCredit}</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
              <div style={{ textAlign:"center", padding:"10px 8px", background:"rgba(0,0,0,0.2)", borderRadius:10 }}>
                <div style={{ fontSize:16, fontWeight:900, color:"#f97316" }}>{t.cur}{(c.creditLimit||0).toLocaleString()}</div>
                <div style={{ fontSize:9, color:"#a1a1aa", textTransform:"uppercase", fontWeight:700, marginTop:2 }}>{t.cm_creditLimit}</div>
              </div>
              <div style={{ textAlign:"center", padding:"10px 8px", background:"rgba(0,0,0,0.2)", borderRadius:10 }}>
                <div style={{ fontSize:16, fontWeight:900, color:"#22c55e" }}>{t.cur}{(c.openingBalance||0).toLocaleString()}</div>
                <div style={{ fontSize:9, color:"#a1a1aa", textTransform:"uppercase", fontWeight:700, marginTop:2 }}>{t.cm_openingBalance}</div>
              </div>
              <div style={{ textAlign:"center", padding:"10px 8px", background:"rgba(0,0,0,0.2)", borderRadius:10 }}>
                <div style={{ fontSize:16, fontWeight:900, color:"#06b6d4" }}>{c.paymentTerms||0} {lang==="bn"?"দিন":"Days"}</div>
                <div style={{ fontSize:9, color:"#a1a1aa", textTransform:"uppercase", fontWeight:700, marginTop:2 }}>{t.cm_paymentTerms}</div>
              </div>
            </div>
          </div>
        )}

        {/* Address */}
        {(c.address||c.city||c.country||c.mapLink)&&(
          <div style={card}>
            {secLbl("📍", t.cm_secAddress)}
            {row(t.cm_address, c.address)}
            {row(t.cm_area, c.area)}
            {row(t.cm_city, c.city)}
            {row(t.cm_country, c.country)}
            {c.mapLink&&<div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0" }}>
              <span style={{ fontSize:12, color:th.txtMuted }}>{t.cm_mapLink}</span>
              <a href={c.mapLink} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:"#6366f1" }}>🗺️ {lang==="bn"?"ম্যাপ দেখুন":"View Map"}</a>
            </div>}
          </div>
        )}

        {/* Tax */}
        {(c.trnNumber||c.tradeLicenseNumber||c.tinNumber||c.binNumber||c.vatNumber)&&(
          <div style={card}>
            {secLbl("🧾", t.cm_secTax)}
            {row(t.cm_trnNumber, c.trnNumber, "#f59e0b")}
            {row(t.cm_tradeLicense, c.tradeLicenseNumber)}
            {row(t.cm_tinNumber, c.tinNumber)}
            {row(t.cm_binNumber, c.binNumber)}
            {row(t.cm_vatNumber, c.vatNumber)}
          </div>
        )}

        {/* Bank */}
        {(c.bankName||c.accountNumber||c.ibanNumber)&&(
          <div style={card}>
            {secLbl("🏦", t.cm_secBank)}
            {row(t.cm_bankName, c.bankName)}
            {row(t.cm_bankBranch, c.bankBranch)}
            {row(t.cm_accountName, c.accountName)}
            {row(t.cm_accountNumber, c.accountNumber, "#06b6d4")}
            {row(t.cm_iban, c.ibanNumber)}
            {row(t.cm_swift, c.swiftCode)}
          </div>
        )}

        {/* Sales info */}
        {(c.discountPerc>0||c.assignedSalesman)&&(
          <div style={card}>
            {secLbl("💰", t.cm_secSales)}
            {c.discountPerc>0&&<div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>{t.cm_discountPerc}</span><span style={{ fontSize:16, fontWeight:800, color:"#22c55e" }}>{c.discountPerc}%</span></div>}
            {row(t.cm_assignedSalesman, c.assignedSalesman)}
          </div>
        )}

        {/* Notes */}
        {c.notes&&(
          <div style={{ ...card, borderLeft:"3px solid #f97316" }}>
            <div style={{ fontSize:10, color:"#f97316", fontWeight:700, textTransform:"uppercase", marginBottom:6 }}>📝 {t.cm_secNotes}</div>
            <div style={{ fontSize:13, color:th.txtSecondary, lineHeight:1.7 }}>{c.notes}</div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <button onClick={()=>openEdit(c)} style={{ padding:"13px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#1d4ed8,#2563eb)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>{t.cm_editBtn}</button>
          <button onClick={()=>cmDelete(c)} style={{ padding:"11px", borderRadius:12, border:"1px solid #450a0a", background:"transparent", color:"#ef4444", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.cm_delete}</button>
        </div>
      </div>
    );
  }

  // ══════ FORM VIEW ══════
  return (
    <div style={panel}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <button onClick={()=>setCmView(editCustomerId?"detail":"list")} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:13, fontWeight:700, padding:0, fontFamily:"inherit" }}>{t.cm_backToList}</button>
        <div style={{ fontSize:13, fontWeight:800, color:"#f97316" }}>{editCustomerId?t.cm_edit:t.cm_new}</div>
      </div>

      {/* Section 1: Basic + Payment Type */}
      <div style={card}>
        {secLbl("📋", t.cm_secBasic)}

        {/* Cash / Credit toggle — prominent */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
          {["cash","credit"].map(pt=>(
            <button key={pt} onClick={()=>upd("paymentType",pt)} style={{ padding:"14px 10px", borderRadius:12, cursor:"pointer", fontFamily:"inherit", border:`2px solid ${cmForm.paymentType===pt?CM_PAY[pt].color:th.borderMid}`, background:cmForm.paymentType===pt?`${CM_PAY[pt].color}18`:"transparent", display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <span style={{ fontSize:24 }}>{CM_PAY[pt].icon}</span>
              <span style={{ fontSize:13, fontWeight:800, color:cmForm.paymentType===pt?CM_PAY[pt].color:th.txtMuted }}>{CM_PAY[pt][lang]}</span>
              <span style={{ fontSize:10, color:th.txtFaint }}>{pt==="cash"?(lang==="bn"?"নগদে পেমেন্ট":"Pay on delivery"):(lang==="bn"?"বাকিতে বিক্রি":"Sell on credit")}</span>
            </button>
          ))}
        </div>

        <div style={grid2}>
          {fw(t.cm_customerName, <input style={inp()} placeholder={lang==="bn"?"কাস্টমারের নাম...":"Customer name..."} value={cmForm.customerName} onChange={e=>upd("customerName",e.target.value)} />, false)}
          {fw(t.cm_customerCode, <input style={inp()} placeholder="C-001" value={cmForm.customerCode} onChange={e=>upd("customerCode",e.target.value)} />)}
          {fw(t.cm_customerType,
            <select style={{ ...inp(), background:th.bgCard }} value={cmForm.customerType} onChange={e=>upd("customerType",e.target.value)}>
              <option value="">{lang==="bn"?"ধরন বেছে নিন":"Select type"}</option>
              {(t.cm_types||[]).map((c,i)=><option key={i} value={c}>{c}</option>)}
            </select>
          )}
          {fw(t.cm_status,
            <select style={{ ...inp(), background:th.bgCard }} value={cmForm.status} onChange={e=>upd("status",e.target.value)}>
              <option value="active">{CM_STATUS.active[lang]}</option>
              <option value="inactive">{CM_STATUS.inactive[lang]}</option>
              <option value="blocked">{CM_STATUS.blocked[lang]}</option>
            </select>
          )}
        </div>
      </div>

      {/* Section 2: Contact */}
      <div style={card}>
        {secLbl("📱", t.cm_secContact)}
        <div style={grid2}>
          {fw(t.cm_contactPerson, <input style={inp()} placeholder={lang==="bn"?"যোগাযোগ ব্যক্তির নাম":"Contact person"} value={cmForm.contactPerson} onChange={e=>upd("contactPerson",e.target.value)} />, false)}
          {fw(t.cm_mobile, <input style={inp()} inputMode="tel" placeholder="017XXXXXXXX" value={cmForm.mobileNumber} onChange={e=>upd("mobileNumber",e.target.value)} />)}
          {fw(t.cm_phone, <input style={inp()} inputMode="tel" placeholder="02XXXXXXXX" value={cmForm.phoneNumber} onChange={e=>upd("phoneNumber",e.target.value)} />)}
          {fw(t.cm_whatsapp, <input style={inp()} inputMode="tel" placeholder="017XXXXXXXX" value={cmForm.whatsappNumber} onChange={e=>upd("whatsappNumber",e.target.value)} />)}
          {fw(t.cm_email, <input style={inp()} inputMode="email" placeholder="customer@email.com" value={cmForm.email} onChange={e=>upd("email",e.target.value)} />, false)}
        </div>
      </div>

      {/* Section 3: Address */}
      <div style={card}>
        {secLbl("📍", t.cm_secAddress)}
        <div style={{ marginBottom:10 }}>
          {fw(t.cm_address, <AutoTA style={taStyle} placeholder={lang==="bn"?"সম্পূর্ণ ঠিকানা...":"Full address..."} value={cmForm.address} onChange={e=>upd("address",e.target.value)} />, true)}
        </div>
        <div style={grid2}>
          {fw(t.cm_emirate,  <input style={inp()} placeholder="ABU DHABI / DUBAI..." value={cmForm.emirate||""} onChange={e=>upd("emirate",e.target.value)} />)}
          {fw(t.cm_area,     <input style={inp()} placeholder={lang==="bn"?"এলাকা":"Area"} value={cmForm.area}    onChange={e=>upd("area",e.target.value)} />)}
          {fw(t.cm_city,     <input style={inp()} placeholder={lang==="bn"?"শহর":"City"} value={cmForm.city}    onChange={e=>upd("city",e.target.value)} />)}
          {fw(t.cm_country,  <input style={inp()} placeholder="UAE..." value={cmForm.country} onChange={e=>upd("country",e.target.value)} />)}
          {fw(t.cm_fax,      <input style={inp()} inputMode="tel" placeholder={lang==="bn"?"ফ্যাক্স নম্বর":"Fax number"} value={cmForm.fax||""} onChange={e=>upd("fax",e.target.value)} />)}
          {fw(t.cm_mapLink,  <input style={inp()} placeholder="https://maps.google.com/..." value={cmForm.mapLink} onChange={e=>upd("mapLink",e.target.value)} />)}
        </div>
      </div>

      {/* Section 4: Tax */}
      <div style={card}>
        {secLbl("🧾", t.cm_secTax)}
        <div style={grid2}>
          {fw(t.cm_trnNumber,    <input style={{ ...inp(), borderColor:"#f59e0b", fontFamily:"monospace" }} placeholder="100XXXXXXXXX" value={cmForm.trnNumber} onChange={e=>upd("trnNumber",e.target.value)} />, false)}
          {fw(t.cm_tradeLicense, <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="TL-XXXXXXXX" value={cmForm.tradeLicenseNumber} onChange={e=>upd("tradeLicenseNumber",e.target.value)} />)}
          {fw(t.cm_tinNumber,    <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="TIN Number" value={cmForm.tinNumber} onChange={e=>upd("tinNumber",e.target.value)} />)}
          {fw(t.cm_binNumber,    <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="BIN Number" value={cmForm.binNumber} onChange={e=>upd("binNumber",e.target.value)} />)}
          {fw(t.cm_vatNumber,    <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="VAT Number" value={cmForm.vatNumber} onChange={e=>upd("vatNumber",e.target.value)} />)}
        </div>
      </div>

      {/* Section 5: Bank */}
      <div style={card}>
        {secLbl("🏦", t.cm_secBank)}
        <div style={grid2}>
          {fw(t.cm_bankName,      <input style={inp()} placeholder={lang==="bn"?"ব্যাংকের নাম":"Bank name"} value={cmForm.bankName} onChange={e=>upd("bankName",e.target.value)} />)}
          {fw(t.cm_bankBranch,    <input style={inp()} placeholder={lang==="bn"?"শাখা":"Branch"} value={cmForm.bankBranch} onChange={e=>upd("bankBranch",e.target.value)} />)}
          {fw(t.cm_accountName,   <input style={inp()} placeholder={lang==="bn"?"অ্যাকাউন্টের নাম":"Account name"} value={cmForm.accountName} onChange={e=>upd("accountName",e.target.value)} />, false)}
          {fw(t.cm_accountNumber, <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="Account number" value={cmForm.accountNumber} onChange={e=>upd("accountNumber",e.target.value)} />)}
          {fw(t.cm_iban,  <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="AE070331234567890123456" value={cmForm.ibanNumber} onChange={e=>upd("ibanNumber",e.target.value)} />, false)}
          {fw(t.cm_swift, <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="BOMLAEADXXX" value={cmForm.swiftCode} onChange={e=>upd("swiftCode",e.target.value)} />)}
        </div>
      </div>

      {/* Section 6: Credit — only show if credit customer */}
      {cmForm.paymentType==="credit"&&(
        <div style={{ ...card, border:"1.5px solid #f97316" }}>
          {secLbl("💳", t.cm_secCredit)}
          <div style={grid2}>
            {fw(t.cm_creditLimit,    <input style={{ ...inp(), borderColor:"#f97316" }} inputMode="numeric" placeholder="50000" value={cmForm.creditLimit} onChange={e=>upd("creditLimit",e.target.value)} />)}
            {fw(t.cm_openingBalance, <input style={inp()} inputMode="numeric" placeholder="0" value={cmForm.openingBalance} onChange={e=>upd("openingBalance",e.target.value)} />)}
            {fw(t.cm_paymentTerms,   <input style={inp()} inputMode="numeric" placeholder="30" value={cmForm.paymentTerms} onChange={e=>upd("paymentTerms",e.target.value)} />)}
          </div>
        </div>
      )}

      {/* Section 7: Sales */}
      <div style={card}>
        {secLbl("💰", t.cm_secSales)}
        <div style={grid2}>
          {fw(t.cm_discountPerc, <input style={inp()} inputMode="numeric" placeholder="0" value={cmForm.discountPerc} onChange={e=>upd("discountPerc",e.target.value)} />)}
          {fw(t.cm_assignedSalesman,
            <select style={{ ...inp(), background:th.bgCard }} value={cmForm.assignedSalesman} onChange={e=>upd("assignedSalesman",e.target.value)}>
              <option value="">{lang==="bn"?"সেলসম্যান বেছে নিন":"Select salesman"}</option>
              {(team||[]).map(m=><option key={m.id} value={m.personName}>{m.personName} ({m.position||"Staff"})</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Section 8: Notes */}
      <div style={{ ...card, marginBottom:16 }}>
        {secLbl("📝", t.cm_secNotes)}
        <AutoTA style={taStyle} placeholder={lang==="bn"?"যেকোনো বিশেষ নোট...":"Any special notes..."} value={cmForm.notes} onChange={e=>upd("notes",e.target.value)} />
      </div>

      {/* Buttons */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <button onClick={cmSave} disabled={cmSaving} style={{ padding:"14px", borderRadius:12, border:"none", background:cmSaving?"#1e3a5f":"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:15, fontWeight:800, cursor:cmSaving?"not-allowed":"pointer" }}>
          {cmSaving?"...":t.cm_save}
        </button>
        <button onClick={()=>setCmView(editCustomerId?"detail":"list")} style={{ padding:"12px", borderRadius:12, border:`1px solid ${th.borderMid}`, background:"transparent", color:th.txtMuted, fontSize:14, fontWeight:700, cursor:"pointer" }}>
          {t.cm_cancel}
        </button>
      </div>
    </div>
  );
}

// ─── PI: SUPPLIER LEDGER ──────────────────────────────────────
function PiSupplierLedger({ invoices, t, th, lang, onViewInvoices }) {
  const [selVendor,setSelVendor] = useState(null);

  // Aggregate invoices by vendor
  const ledger = {};
  invoices.forEach(inv=>{
    const key = inv.vendorId||inv.vendorName||"—";
    if (!ledger[key]) ledger[key]={ vendorName:inv.vendorName||"—", vendorMobile:inv.vendorMobile||"", invoices:[], total:0, paid:0, balance:0 };
    ledger[key].invoices.push(inv);
    ledger[key].total   += inv.grandTotal||0;
    ledger[key].paid    += inv.amountPaid||0;
    ledger[key].balance += inv.balanceDue||0;
  });
  const vendors = Object.values(ledger).sort((a,b)=>b.balance-a.balance);

  if (selVendor) {
    const vd = vendors.find(v=>v.vendorName===selVendor);
    if (!vd) { setSelVendor(null); return null; }
    return (
      <div>
        <button onClick={()=>setSelVendor(null)} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:13, fontWeight:700, padding:"0 0 14px 0", fontFamily:"inherit" }}>
          ← {lang==="bn"?"লেজারে ফিরুন":"Back to Ledger"}
        </button>
        <div style={{ fontSize:15, fontWeight:800, color:"#f97316", marginBottom:4 }}>🏭 {vd.vendorName}</div>
        {vd.vendorMobile&&<div style={{ fontSize:12, color:"#a1a1aa", marginBottom:12 }}>📱 {vd.vendorMobile}</div>}
        {/* Summary row */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
          {[
            { l:lang==="bn"?"মোট ক্রয়":"Total",   v:piFmt2(vd.total),   c:"#f97316" },
            { l:lang==="bn"?"পরিশোধ":"Paid",       v:piFmt2(vd.paid),    c:"#22c55e" },
            { l:lang==="bn"?"বাকি":"Balance",       v:piFmt2(vd.balance), c:vd.balance>0?"#ef4444":"#22c55e" },
          ].map((k,i)=>(
            <div key={i} style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:10, padding:"10px 10px", textAlign:"center" }}>
              <div style={{ fontSize:14, fontWeight:900, color:k.c }}>{t.cur}{k.v}</div>
              <div style={{ fontSize:9, color:"#a1a1aa", textTransform:"uppercase", fontWeight:700, marginTop:2 }}>{k.l}</div>
            </div>
          ))}
        </div>
        {/* Invoice list for this vendor */}
        {vd.invoices.map(inv=>(
          <div key={inv.id} onClick={()=>onViewInvoices(inv)} style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:"12px 14px", marginBottom:8, cursor:"pointer" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#f97316"}
            onMouseLeave={e=>e.currentTarget.style.borderColor=th.border}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
              <span style={{ fontSize:13, fontWeight:800, color:"#f97316" }}>{inv.invoiceNo}</span>
              <PiStatusBadge status={inv.status} lang={lang} />
            </div>
            <div style={{ fontSize:11, color:"#a1a1aa" }}>📅 {inv.invoiceDate} · {inv.items?.length||0}{lang==="bn"?"টি পণ্য":" items"}</div>
            <div style={{ display:"flex", gap:10, marginTop:6, flexWrap:"wrap" }}>
              <span style={{ fontSize:13, fontWeight:700, color:"#f97316" }}>{t.cur}{piFmt2(inv.grandTotal)}</span>
              {inv.amountPaid>0&&<span style={{ fontSize:11, color:"#22c55e" }}>✅ {t.cur}{piFmt2(inv.amountPaid)}</span>}
              {inv.balanceDue>0.01&&<span style={{ fontSize:11, color:"#ef4444" }}>⚠️ {t.cur}{piFmt2(inv.balanceDue)}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize:16, fontWeight:800, color:"#f97316", marginBottom:4 }}>🏭 {lang==="bn"?"সাপ্লায়ার লেজার":"Supplier Ledger"}</div>
      <div style={{ fontSize:12, color:"#a1a1aa", marginBottom:16 }}>{lang==="bn"?"প্রতিটি সাপ্লায়ারের মোট ক্রয়, পরিশোধ ও বাকি":"Total purchase, paid & balance per supplier"}</div>

      {vendors.length===0&&(
        <div style={{ textAlign:"center", padding:"60px 20px", color:"#3f3f46" }}>
          <div style={{ fontSize:40, marginBottom:10 }}>🏭</div>
          <div style={{ fontSize:13 }}>{lang==="bn"?"এখনো কোনো সাপ্লায়ার নেই":"No suppliers yet"}</div>
        </div>
      )}

      {vendors.map((vd,i)=>{
        const paidPerc = vd.total>0 ? Math.min(100, vd.paid/vd.total*100) : 0;
        return (
          <div key={i} onClick={()=>setSelVendor(vd.vendorName)} style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:"14px 16px", marginBottom:10, cursor:"pointer" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#f97316"}
            onMouseLeave={e=>e.currentTarget.style.borderColor=th.border}>
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:"#f2f2f2" }}>🏭 {vd.vendorName}</div>
                {vd.vendorMobile&&<div style={{ fontSize:11, color:"#a1a1aa", marginTop:2 }}>📱 {vd.vendorMobile}</div>}
              </div>
              <span style={{ fontSize:11, color:"#a1a1aa", background:th.bgInp, padding:"3px 8px", borderRadius:8, whiteSpace:"nowrap" }}>
                {vd.invoices.length}{lang==="bn"?"টি ইনভয়েস":" invoices"}
              </span>
            </div>
            {/* 3 KPI boxes */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
              <div style={{ textAlign:"center", padding:"8px 6px", background:th.bgInp, borderRadius:8 }}>
                <div style={{ fontSize:13, fontWeight:800, color:"#f97316" }}>{t.cur}{piFmt2(vd.total)}</div>
                <div style={{ fontSize:9, color:"#a1a1aa", fontWeight:700, textTransform:"uppercase", marginTop:2 }}>{lang==="bn"?"মোট ক্রয়":"Total"}</div>
              </div>
              <div style={{ textAlign:"center", padding:"8px 6px", background:"rgba(34,197,94,0.06)", borderRadius:8 }}>
                <div style={{ fontSize:13, fontWeight:800, color:"#22c55e" }}>{t.cur}{piFmt2(vd.paid)}</div>
                <div style={{ fontSize:9, color:"#a1a1aa", fontWeight:700, textTransform:"uppercase", marginTop:2 }}>{lang==="bn"?"পরিশোধ":"Paid"}</div>
              </div>
              <div style={{ textAlign:"center", padding:"8px 6px", background:vd.balance>0?"rgba(239,68,68,0.06)":"rgba(34,197,94,0.06)", borderRadius:8, border:vd.balance>0?"1px solid rgba(239,68,68,0.2)":"none" }}>
                <div style={{ fontSize:13, fontWeight:800, color:vd.balance>0?"#ef4444":"#22c55e" }}>{t.cur}{piFmt2(vd.balance)}</div>
                <div style={{ fontSize:9, color:"#a1a1aa", fontWeight:700, textTransform:"uppercase", marginTop:2 }}>{lang==="bn"?"বাকি":"Balance"}</div>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ height:6, background:th.bgInp, borderRadius:6, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${paidPerc}%`, background:"linear-gradient(90deg,#22c55e,#16a34a)", borderRadius:6, transition:"width 0.4s" }} />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
              <span style={{ fontSize:9, color:"#22c55e", fontWeight:700 }}>{paidPerc.toFixed(0)}% {lang==="bn"?"পরিশোধ":"paid"}</span>
              {vd.balance>0&&<span style={{ fontSize:9, color:"#ef4444", fontWeight:700 }}>{lang==="bn"?"বাকি আছে":"outstanding"} {t.cur}{piFmt2(vd.balance)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── PI: SALESMAN READ-ONLY VIEW ──────────────────────────────
function PiSalesmanView({ t, lang, th, shopId }) {
  const [invoices,setInvoices]   = useState([]);
  const [loading,setLoading]     = useState(true);
  const [searchQ,setSearchQ]     = useState("");
  const [dateRange,setDateRange] = useState("30"); // 7 | 30 | 90 | "all"

  // real-time listener with fallback
  useEffect(()=>{
    if (!shopId) return;
    setLoading(true);
    let unsub2=null;
    const q=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId),orderBy("createdAt","desc"));
    const unsub1=onSnapshot(q,snap=>{
      setInvoices(snap.docs.map(d=>({...d.data(),id:d.id,createdAt:d.data().createdAt?.toDate?.()||new Date()})));
      setLoading(false);
    },()=>{
      const q2=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId));
      unsub2=onSnapshot(q2,snap=>{
        const docs=snap.docs.map(d=>({...d.data(),id:d.id,createdAt:d.data().createdAt?.toDate?.()||new Date()}));
        docs.sort((a,b)=>b.createdAt-a.createdAt);
        setInvoices(docs);
        setLoading(false);
      },err2=>{ console.error(err2); setLoading(false); });
    });
    return ()=>{ unsub1(); unsub2&&unsub2(); };
  },[shopId]);

  // flatten all items from all confirmed/paid invoices
  const allItems = [];
  const cutoff = dateRange==="all" ? null : new Date(Date.now() - Number(dateRange)*24*60*60*1000);
  invoices.forEach(inv=>{
    if (!["confirmed","paid","partial"].includes(inv.status)) return;
    if (cutoff && inv.createdAt < cutoff) return;
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
        const saleEx  = piN2(it.salePrice);
        const vatPerc = piN2(it.taxPerc)||5;
        const vatAmt  = saleEx * vatPerc / 100;
        const saleInc = saleEx + vatAmt;
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
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
              <div style={{ background:th.bgInp, borderRadius:10, padding:"10px 12px" }}>
                <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, letterSpacing:0.5, marginBottom:4 }}>
                  {lang==="bn"?"📦 ক্রয় পরিমাণ":"📦 Purchased Qty"}
                </div>
                <div style={{ fontSize:20, fontWeight:900, color:"#06b6d4" }}>
                  {it.qty} <span style={{ fontSize:13, color:th.txtMuted }}>{it.unit}</span>
                </div>
              </div>
              <div style={{ background:th.bgInp, borderRadius:10, padding:"10px 12px" }}>
                <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, letterSpacing:0.5, marginBottom:4 }}>
                  {t.pi_purchasePrice}
                </div>
                <div style={{ fontSize:20, fontWeight:900, color:"#a1a1aa" }}>
                  t.cur {piFmt2(it.unitCost)}
                </div>
              </div>
            </div>

            {/* Sale price — big prominent box */}
            {saleEx>0 ? (
              <div style={{ background:"linear-gradient(135deg,rgba(34,197,94,0.12),rgba(34,197,94,0.05))", border:"1.5px solid #22c55e", borderRadius:12, padding:"14px 16px" }}>
                <div style={{ fontSize:10, color:"#22c55e", textTransform:"uppercase", fontWeight:700, letterSpacing:0.5, marginBottom:10 }}>
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
                  <span style={{ fontSize:26, fontWeight:900, color:"#22c55e", letterSpacing:0.5 }}>{t.cur} {piFmt2(saleInc)}</span>
                </div>
                {/* Margin info */}
                {margin>0&&(
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

// ─── PI: MAIN PURCHASE INVOICE TAB ────────────────────────────
function PurchaseInvoiceTab({ t, lang, th, s, shopId, user, profile, vendors, products, toast, isDesktop }) {
  const isOwner = profile?.role==="owner";

  // ── Firestore state ──
  const [invoices,setInvoices]     = useState([]);
  const [piLoading,setPiLoading]   = useState(true);

  // ── View state: "list" | "form" | "detail" ──
  const [piView,setPiView]         = useState("list");
  const [piSubTab,setPiSubTab]     = useState("invoices"); // "invoices" | "ledger"
  const [selInvoice,setSelInvoice] = useState(null);
  const [editInvoiceId,setEditInvoiceId] = useState(null);

  // ── Form state ──
  const [piInvoiceNo,setPiInvoiceNo] = useState("");
  const [piForm,setPiForm]           = useState(piEmptyForm());
  const [piLines,setPiLines]         = useState([piEmptyLine()]);
  const [pickerTarget,setPickerTarget] = useState(null);
  const [piSaving,setPiSaving]       = useState(false);

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

  // ── Real-time listener (fallback if index missing) ──
  useEffect(()=>{
    if (!shopId) return;
    setPiLoading(true);
    let unsub2=null;
    const q=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId),orderBy("createdAt","desc"));
    const unsub1=onSnapshot(q,snap=>{
      setInvoices(snap.docs.map(d=>({ ...d.data(), id:d.id, createdAt:d.data().createdAt?.toDate?.()||new Date() })));
      setPiLoading(false);
    },()=>{
      // Index নেই — orderBy ছাড়া fallback query, client-side sort
      const q2=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId));
      unsub2=onSnapshot(q2,snap=>{
        const docs=snap.docs.map(d=>({ ...d.data(), id:d.id, createdAt:d.data().createdAt?.toDate?.()||new Date() }));
        docs.sort((a,b)=>b.createdAt-a.createdAt);
        setInvoices(docs);
        setPiLoading(false);
      },err2=>{ console.error(err2); setPiLoading(false); });
    });
    return ()=>{ unsub1(); unsub2&&unsub2(); };
  },[shopId]);

  // ── Generate invoice no (3-layer fallback) ──
  const genInvoiceNo = async () => {
    // Layer 1: runTransaction on shops doc
    try {
      const serial = await runTransaction(db,async tx=>{
        const shopRef=doc(db,"shops",shopId), shopSnap=await tx.get(shopRef);
        const next=Number(shopSnap.data()?.lastPISerial||0)+1;
        tx.update(shopRef,{lastPISerial:next}); return next;
      });
      return `${PI_PREFIX}${String(serial).padStart(4,"0")}`;
    } catch(e1) {
      // Layer 2: scan purchaseInvoices WITHOUT orderBy (no index needed)
      try {
        const snap=await getDocs(query(collection(db,"purchaseInvoices"),where("shopId","==",shopId)));
        const max=snap.docs.reduce((mx,d)=>{ const m=String(d.data().invoiceNo||"").match(/PI-?(\d+)$/); return m?Math.max(mx,Number(m[1])):mx; },0);
        return `${PI_PREFIX}${String(max+1).padStart(4,"0")}`;
      } catch(e2) {
        // Layer 3: timestamp fallback — never fails
        return `${PI_PREFIX}${String(Date.now()).slice(-4)}`;
      }
    }
  };

  // ── Open new form ──
  const piOpenNew = async () => {
    try {
      const no=await genInvoiceNo();
      setPiInvoiceNo(no); setPiForm(piEmptyForm()); setPiLines([piEmptyLine()]); setEditInvoiceId(null); setPiView("form"); setVendorSearchQ(""); setVendorDropOpen(false);
    } catch(e) {
      toast(lang==="bn"?"ইনভয়েস খুলতে সমস্যা হয়েছে!":"Failed to open invoice form!","err");
    }
  };

  // ── Open edit form ──
  const piOpenEdit = (inv) => {
    setPiInvoiceNo(inv.invoiceNo);
    setPiForm({ invoiceDate:inv.invoiceDate, supplierInvoiceNo:inv.supplierInvoiceNo||"", vendorId:inv.vendorId||"", vendorName:inv.vendorName||"", vendorMobile:inv.vendorMobile||"", paymentMethod:inv.paymentMethod||"cash", amountPaid:inv.amountPaid>0?String(inv.amountPaid):"", note:inv.note||"" });
    setPiLines((inv.items||[]).map(it=>({ id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:it.productId||null, name:it.name||"", code:it.code||"", brand:it.brand||"", qty:String(it.qty||""), unit:it.unit||"Pcs", unitCost:String(it.unitCost||""), discountPerc:String(it.discountPerc||"0"), taxPerc:String(it.taxPerc||"5"), salePrice:String(it.salePrice||"") })));
    setEditInvoiceId(inv.id); setPiView("form"); setVendorSearchQ(inv.vendorName||""); setVendorDropOpen(false);
  };

  // ── Form helpers ──
  const piUpd=(k,v)=>setPiForm(p=>({...p,[k]:v}));
  const piAddLine=()=>setPiLines(p=>[...p,piEmptyLine()]);
  const piUpdLine=(id,f,v)=>setPiLines(p=>p.map(it=>it.id===id?{...it,[f]:v}:it));
  const piDelLine=(id)=>setPiLines(p=>p.filter(it=>it.id!==id));

  const piSelectProduct=(prod,idx)=>{
    setPiLines(p=>p.map((it,i)=>i===idx?{ ...it, productId:prod.id, name:prod.name, code:prod.code||prod.barcode||"", brand:prod.brand||"", unit:prod.unit||"Pcs", unitCost:prod.landingCost||prod.vatExclusive||it.unitCost, salePrice:prod.vatInclusive||prod.mrp||prod.vatExclusive||it.salePrice, taxPerc:prod.salesVat||prod.purchaseVat||it.taxPerc||"5" }:it));
    setPickerTarget(null);
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
  const filteredVendorOpts = vendors.filter(v=>{
    if (!vendorSearchQ.trim()) return true;
    const q=vendorSearchQ.trim().toLowerCase();
    return (v.vendorName||"").toLowerCase().includes(q)
      ||(v.vendorCode||"").toLowerCase().includes(q)
      ||(v.mobileNumber||"").includes(q)
      ||(v.city||"").toLowerCase().includes(q);
  });

  // ── Build payload ──
  const piBuild=(status)=>{
    const valid=piLines.filter(it=>it.name.trim());
    if (!valid.length){ toast(t.pi_errItems,"err"); return null; }
    for (const it of valid){
      if (!it.name.trim()){ toast(t.pi_errName,"err"); return null; }
      if (!it.qty.toString().trim()||piN2(it.qty)<=0){ toast(t.pi_errQty,"err"); return null; }
      if (piN2(it.unitCost)<0){ toast(t.pi_errCost,"err"); return null; }
    }
    const builtItems=valid.map(it=>{ const { disc, tax, total }=piCalcLine(it); return { productId:it.productId||null, name:it.name.trim(), code:it.code.trim(), brand:it.brand.trim(), qty:piN2(it.qty), unit:it.unit, unitCost:piN2(it.unitCost), discountPerc:piN2(it.discountPerc), discountAmt:parseFloat(piFmt2(disc)), taxPerc:piN2(it.taxPerc), taxAmt:parseFloat(piFmt2(tax)), lineTotal:parseFloat(piFmt2(total)), salePrice:piN2(it.salePrice)||null }; });
    const { sub, disc, tax, grand } = piCalcTotals(piLines);
    const paid=piN2(piForm.amountPaid), balanceDue=Math.max(0,grand-paid);
    const derivedStatus = status==="confirmed" ? (balanceDue<0.01?"paid":paid>0?"partial":"confirmed") : status;
    return { shopId, invoiceNo:piInvoiceNo, supplierInvoiceNo:piForm.supplierInvoiceNo.trim(), invoiceDate:piForm.invoiceDate, vendorId:piForm.vendorId||null, vendorName:piForm.vendorName.trim(), vendorMobile:piForm.vendorMobile.trim(), items:builtItems, subtotal:parseFloat(piFmt2(sub)), totalDiscount:parseFloat(piFmt2(disc)), totalTax:parseFloat(piFmt2(tax)), grandTotal:parseFloat(piFmt2(grand)), paymentMethod:piForm.paymentMethod, amountPaid:parseFloat(piFmt2(paid)), balanceDue:parseFloat(piFmt2(balanceDue)), status:derivedStatus, note:piForm.note.trim(), createdBy:user.uid, createdByName:profile.personName };
  };

  // ── Save ──
  const piSaveDraft = async () => {
    const payload=piBuild("draft"); if (!payload) return;
    setPiSaving(true);
    try { if (editInvoiceId){ await updateDoc(doc(db,"purchaseInvoices",editInvoiceId),{...payload,updatedAt:serverTimestamp()}); toast(t.pi_updated); } else { await addDoc(collection(db,"purchaseInvoices"),{...payload,createdAt:serverTimestamp()}); toast(t.pi_saved); } setPiView("list"); } catch(e){ toast(e.message,"err"); } finally { setPiSaving(false); }
  };
  const piConfirm = async () => {
    const payload=piBuild("confirmed"); if (!payload) return;
    setPiSaving(true);
    try { if (editInvoiceId){ await updateDoc(doc(db,"purchaseInvoices",editInvoiceId),{...payload,updatedAt:serverTimestamp()}); toast(t.pi_updated); } else { await addDoc(collection(db,"purchaseInvoices"),{...payload,createdAt:serverTimestamp()}); toast(t.pi_confirmed); } setPiView("list"); } catch(e){ toast(e.message,"err"); } finally { setPiSaving(false); }
  };
  const piMarkPaid = async (inv) => {
    try { await updateDoc(doc(db,"purchaseInvoices",inv.id),{amountPaid:inv.grandTotal,balanceDue:0,status:"paid",updatedAt:serverTimestamp()}); setSelInvoice(p=>({...p,amountPaid:inv.grandTotal,balanceDue:0,status:"paid"})); toast(t.pi_paidMarked); } catch(e){ toast(e.message,"err"); }
  };
  const piCancelInv = async (inv) => {
    if (!window.confirm(t.pi_confirmCancel)) return;
    try { await updateDoc(doc(db,"purchaseInvoices",inv.id),{status:"cancelled",updatedAt:serverTimestamp()}); setSelInvoice(p=>({...p,status:"cancelled"})); toast(t.pi_cancelledMsg,"err"); } catch(e){ toast(e.message,"err"); }
  };
  const piDelete = async (inv) => {
    if (!window.confirm(t.pi_confirmDelete)) return;
    try { await deleteDoc(doc(db,"purchaseInvoices",inv.id)); setPiView("list"); setSelInvoice(null); toast(t.pi_deleted,"err"); } catch(e){ toast(e.message,"err"); }
  };

  // ── Filter ──
  const piFiltered = invoices.filter(inv=>{
    const q=piSearch.trim();
    const matchSt=piStatusF==="ALL"||inv.status===piStatusF;
    if (!q) return matchSt;
    const hay=[inv.invoiceNo,inv.vendorName,inv.supplierInvoiceNo,inv.createdByName,...(inv.items||[]).map(it=>it.name+" "+it.code+" "+it.brand)].filter(Boolean).join(" ");
    return matchSt&&nsmatch(hay,q);
  });
  const piKPIs = invoices.reduce((a,inv)=>{ a.total++; a.amount+=inv.grandTotal||0; a.paid+=inv.amountPaid||0; a.due+=inv.balanceDue||0; return a; },{ total:0,amount:0,paid:0,due:0 });

  // ── Styles ──
  const panel = isDesktop?{maxWidth:900,margin:"0 auto",padding:"24px 28px 60px"}:{maxWidth:660,margin:"0 auto",padding:"18px 14px 60px"};
  const inp=(e={})=>({ padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...e });
  const secLbl={ fontSize:11, color:"#f97316", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, padding:"8px 0 6px", borderBottom:`1px solid ${th.border}`, marginBottom:12 };
  const totals=piCalcTotals(piLines);
  const paid=piN2(piForm.amountPaid), balance=Math.max(0,totals.grand-paid);

  // ══════ LIST VIEW ══════
  if (piView==="list") return (
    <div style={panel}>
      {/* Title + New button */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:16, fontWeight:800, color:"#f97316" }}>{t.pi_title}</div>
        {isOwner&&piSubTab==="invoices"&&<button onClick={piOpenNew} disabled={piSaving} style={{ padding:"9px 16px", borderRadius:10, border:"none", background:piSaving?"#7c2d12":"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:13, fontWeight:700, cursor:piSaving?"not-allowed":"pointer", opacity:piSaving?0.7:1 }}>{piSaving?"...":(lang==="bn"?"+ নতুন ইনভয়েস":"+ New Invoice")}</button>}
      </div>

      {/* Sub-tab bar */}
      <div style={{ display:"flex", gap:0, marginBottom:16, background:th.bgInp, borderRadius:12, padding:4 }}>
        {[
          { key:"invoices", icon:"📋", bn:"ইনভয়েস", en:"Invoices" },
          { key:"ledger",   icon:"🏭", bn:"সাপ্লায়ার লেজার", en:"Supplier Ledger" },
        ].map(tab=>(
          <button key={tab.key} onClick={()=>setPiSubTab(tab.key)} style={{ flex:1, padding:"9px 8px", borderRadius:9, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:12, transition:"all 0.15s", background:piSubTab===tab.key?"#f97316":"transparent", color:piSubTab===tab.key?"#fff":th.txtMuted }}>
            {tab.icon} {lang==="bn"?tab.bn:tab.en}
          </button>
        ))}
      </div>

      {/* ── SUB-TAB: SUPPLIER LEDGER ── */}
      {piSubTab==="ledger"&&(
        <PiSupplierLedger invoices={invoices} t={t} th={th} lang={lang}
          onViewInvoices={(inv)=>{ setSelInvoice(inv); setPiView("detail"); }} />
      )}

      {/* ── SUB-TAB: INVOICES ── */}
      {piSubTab==="invoices"&&(<>
        {invoices.length>0&&(
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:8, marginBottom:14 }}>
            {[
              { label:t.pi_totalInvoices, value:piKPIs.total, color:"#a1a1aa", pre:"" },
              { label:t.pi_totalAmount,   value:piFmt2(piKPIs.amount), color:"#f97316", pre:t.cur+" " },
              { label:t.pi_totalPaid,     value:piFmt2(piKPIs.paid),   color:"#22c55e", pre:t.cur+" " },
              { label:t.pi_totalDue,      value:piFmt2(piKPIs.due),    color:piKPIs.due>0?"#ef4444":"#22c55e", pre:t.cur+" " },
            ].map((k,i)=>(
              <div key={i} style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
                <div style={{ fontSize:15, fontWeight:800, color:k.color }}>{k.pre}{k.value}</div>
                <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginTop:2, letterSpacing:0.4 }}>{k.label}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ position:"relative", marginBottom:10 }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
          <input style={{ ...inp(), paddingLeft:38, background:th.bgCard }} placeholder={t.pi_searchPh} value={piSearch} onChange={e=>setPiSearch(e.target.value)} />
          {piSearch&&<button onClick={()=>setPiSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:th.txtMuted, cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>}
        </div>

        <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:10, marginBottom:8 }}>
          {["ALL",...Object.keys(PI_STATUSES)].map(st=>(
            <button key={st} onClick={()=>setPiStatusF(st)} style={{ padding:"5px 13px", borderRadius:20, border:"1px solid", whiteSpace:"nowrap", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit", background:piStatusF===st?"#f97316":"transparent", borderColor:piStatusF===st?"#f97316":th.borderMid, color:piStatusF===st?"#fff":th.txtMuted }}>
              {st==="ALL"?t.pi_allStatus:PI_STATUSES[st]?.[lang]}
            </button>
          ))}
        </div>

        {piLoading&&<div style={{ textAlign:"center", padding:"50px 20px", color:th.txtFaint }}><div style={{ fontSize:36 }}>⏳</div><div>{t.pi_loading}</div></div>}
        {!piLoading&&invoices.length===0&&<div style={{ textAlign:"center", padding:"60px 20px", color:th.txtFaint }}><div style={{ fontSize:46, marginBottom:10 }}>🧾</div><div>{t.pi_noInvoices}</div></div>}
        {!piLoading&&invoices.length>0&&piFiltered.length===0&&<div style={{ textAlign:"center", padding:"40px 20px", color:th.txtFaint }}><div style={{ fontSize:36 }}>🔍</div><div>{t.pi_noResults}</div></div>}
        {!piLoading&&piFiltered.map(inv=>(
          <PiInvoiceCard key={inv.id} invoice={inv} t={t} th={th} lang={lang}
            onClick={()=>{ setSelInvoice(inv); setPiView("detail"); }} />
        ))}
      </>)}
    </div>
  );

  // ══════ DETAIL VIEW ══════
  if (piView==="detail"&&selInvoice) return (
    <div style={panel}>
      <PiDetailView invoice={selInvoice} t={t} th={th} lang={lang} isOwner={isOwner}
        onBack={()=>{ setPiView("list"); setSelInvoice(null); }}
        onEdit={()=>piOpenEdit(selInvoice)}
        onMarkPaid={()=>piMarkPaid(selInvoice)}
        onCancel={()=>piCancelInv(selInvoice)}
        onDelete={()=>piDelete(selInvoice)}
      />
    </div>
  );

  // ══════ FORM VIEW ══════
  return (
    <div style={panel}>
      {pickerTarget!==null&&<PiProductPicker products={products} t={t} th={th} onSelect={p=>piSelectProduct(p,pickerTarget)} onClose={()=>setPickerTarget(null)} />}

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <button onClick={()=>setPiView("list")} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:13, fontWeight:700, padding:0, fontFamily:"inherit" }}>{t.pi_backToList}</button>
        <div style={{ fontSize:13, fontWeight:800, color:"#f97316" }}>{editInvoiceId?t.pi_edit:t.pi_new}</div>
      </div>

      {/* Invoice No + Date */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:12 }}>
        <div style={secLbl}>📄 {t.pi_invoiceNo} & {t.pi_date}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
          <div>
            <div style={{ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>{t.pi_invoiceNo}</div>
            <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(249,115,22,0.08)", border:"1px solid #f97316", fontSize:16, fontWeight:900, color:"#f97316", letterSpacing:1, fontFamily:"monospace" }}>{piInvoiceNo}</div>
          </div>
          <div>
            <div style={{ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>{t.pi_date}</div>
            <input type="date" style={inp()} value={piForm.invoiceDate} onChange={e=>piUpd("invoiceDate",e.target.value)} />
          </div>
        </div>
        <div style={secLbl}>🏭 {t.pi_vendor}</div>
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>{t.pi_supplierInvoiceNo}</div>
          <input style={{ ...inp(), borderColor:"#a855f7", color:"#a855f7" }} placeholder={t.pi_supplierInvoiceNoPh} value={piForm.supplierInvoiceNo} onChange={e=>piUpd("supplierInvoiceNo",e.target.value)} />
        </div>
        {vendors.length>0&&(
          <div ref={vendorSearchRef} style={{ position:"relative", marginBottom:8 }}>
            {/* Search input row */}
            <div style={{ display:"flex", alignItems:"center", gap:0, border:`1.5px solid ${vendorDropOpen?"#f97316":th.border}`, borderRadius:10, background:th.bgInp, overflow:"hidden", transition:"border-color 0.15s" }}>
              <span style={{ padding:"0 10px", fontSize:14, color:"#f97316", userSelect:"none" }}>🔍</span>
              <input
                style={{ flex:1, padding:"10px 4px", border:"none", background:"transparent", color:th.txtPrimary, fontSize:13, outline:"none", fontFamily:"inherit" }}
                placeholder={lang==="bn"?"ভেন্ডর খুঁজুন (নাম / কোড / মোবাইল)...":"Search vendor (name / code / mobile)..."}
                value={vendorSearchQ}
                onChange={e=>{ setVendorSearchQ(e.target.value); setVendorDropOpen(true); if(!e.target.value.trim()){ piUpd("vendorId",""); piUpd("vendorName",""); piUpd("vendorMobile",""); } }}
                onFocus={()=>setVendorDropOpen(true)}
                autoComplete="off"
              />
              {piForm.vendorId&&(
                <button onClick={piClearVendor} style={{ padding:"6px 10px", background:"transparent", border:"none", cursor:"pointer", color:"#f87171", fontSize:16, lineHeight:1 }} title="Clear vendor">✕</button>
              )}
              <button onClick={()=>setVendorDropOpen(o=>!o)} style={{ padding:"8px 12px", background:"transparent", border:"none", cursor:"pointer", color:th.txtMuted, fontSize:12, lineHeight:1 }}>▾</button>
            </div>

            {/* Selected vendor chip */}
            {piForm.vendorId&&!vendorDropOpen&&(
              <div style={{ marginTop:5, padding:"6px 10px", background:"rgba(249,115,22,0.1)", border:"1px solid rgba(249,115,22,0.35)", borderRadius:8, display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:12, color:"#f97316" }}>🏭</span>
                <span style={{ fontSize:12, fontWeight:700, color:"#f97316", flex:1 }}>{piForm.vendorName}</span>
                {piForm.vendorMobile&&<span style={{ fontSize:11, color:th.txtMuted }}>📱 {piForm.vendorMobile}</span>}
              </div>
            )}

            {/* Dropdown list */}
            {vendorDropOpen&&(
              <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:999, background:th.bgCard, border:`1.5px solid #f97316`, borderRadius:10, marginTop:4, maxHeight:220, overflowY:"auto", boxShadow:"0 8px 32px rgba(0,0,0,0.4)" }}>
                {filteredVendorOpts.length===0?(
                  <div style={{ padding:"14px 16px", fontSize:12, color:th.txtMuted, textAlign:"center" }}>
                    {lang==="bn"?"কোনো ভেন্ডর পাওয়া যায়নি":"No vendors found"}
                  </div>
                ):(
                  filteredVendorOpts.map(v=>(
                    <div key={v.id}
                      onClick={()=>piPickVendor(v)}
                      style={{ padding:"10px 14px", cursor:"pointer", borderBottom:`1px solid ${th.border}`, display:"flex", alignItems:"center", gap:10, background:piForm.vendorId===v.id?"rgba(249,115,22,0.12)":"transparent" }}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(249,115,22,0.08)"}
                      onMouseLeave={e=>e.currentTarget.style.background=piForm.vendorId===v.id?"rgba(249,115,22,0.12)":"transparent"}
                    >
                      <span style={{ fontSize:15 }}>🏭</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                          {v.vendorName}
                          {piForm.vendorId===v.id&&<span style={{ marginLeft:6, fontSize:10, color:"#f97316" }}>✓</span>}
                        </div>
                        <div style={{ display:"flex", gap:8, marginTop:2 }}>
                          {v.vendorCode&&<span style={{ fontSize:10, color:"#a1a1aa", fontFamily:"monospace" }}>#{v.vendorCode}</span>}
                          {(v.mobileNumber||v.whatsappNumber)&&<span style={{ fontSize:10, color:th.txtMuted }}>📱 {v.mobileNumber||v.whatsappNumber}</span>}
                          {v.city&&<span style={{ fontSize:10, color:th.txtMuted }}>📍 {v.city}</span>}
                        </div>
                      </div>
                      {v.status&&v.status!=="active"&&<span style={{ fontSize:9, padding:"2px 6px", borderRadius:4, background:"rgba(248,113,113,0.15)", color:"#f87171", fontWeight:700 }}>{v.status.toUpperCase()}</span>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <input style={inp()} placeholder={t.pi_vendorManual} value={piForm.vendorName} onChange={e=>piUpd("vendorName",e.target.value)} />
          <input style={inp()} placeholder="📱 Mobile" value={piForm.vendorMobile} onChange={e=>piUpd("vendorMobile",e.target.value)} inputMode="tel" />
        </div>
      </div>

      {/* Items */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:12, overflowX:"auto" }}>
        <div style={{ ...secLbl, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span>📦 {t.pi_items}</span>
          <span style={{ fontSize:11, color:"#f97316" }}>{piLines.length}{lang==="bn"?"টি":""}</span>
        </div>
        {isDesktop?(
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:700 }}>
            <thead>
              <tr style={{ background:th.bgInp }}>
                {["#",`${t.pi_itemName}`,t.pi_qty,t.pi_unit,t.pi_unitCost,t.pi_discPerc,`VAT%`,`💰 Sale`,t.pi_lineTotal,""].map((h,i)=>(
                  <th key={i} style={{ padding:"7px 6px", fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, textAlign:i>1?"center":"left", letterSpacing:0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {piLines.map((item,idx)=>(
                <PiLineItemDesktop key={item.id} item={item} idx={idx}
                  onUpdate={piUpdLine} onDelete={piDelLine}
                  onPick={(i)=>setPickerTarget(i)} t={t} th={th} />
              ))}
            </tbody>
          </table>
        ):(
          piLines.map((item,idx)=>(
            <PiLineItemMobile key={item.id} item={item} idx={idx}
              onUpdate={piUpdLine} onDelete={piDelLine}
              onPick={(i)=>setPickerTarget(i)} t={t} th={th} />
          ))
        )}
        <button onClick={piAddLine} style={{ width:"100%", marginTop:10, padding:"11px", borderRadius:10, border:`2px dashed ${th.accent}`, background:"rgba(249,115,22,0.06)", color:"#f97316", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.pi_addItem}</button>
      </div>

      {/* Summary */}
      <PiSummaryBox items={piLines} amountPaid={piForm.amountPaid} th={th} t={t} />

      {/* Payment */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:12 }}>
        <div style={secLbl}>💳 {t.pi_payment}</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, marginBottom:12 }}>
          {Object.entries(PI_PAY_METHODS).map(([key,pm])=>(
            <button key={key} onClick={()=>piUpd("paymentMethod",key)} style={{ padding:"10px 8px", borderRadius:10, cursor:"pointer", fontFamily:"inherit", border:`1.5px solid ${piForm.paymentMethod===key?"#f97316":th.borderMid}`, background:piForm.paymentMethod===key?"rgba(249,115,22,0.12)":"transparent", color:piForm.paymentMethod===key?"#f97316":th.txtMuted, fontSize:12, fontWeight:700, display:"flex", alignItems:"center", gap:6, justifyContent:"center" }}>
              <span style={{ fontSize:16 }}>{pm.icon}</span><span>{pm[lang]}</span>
              {piForm.paymentMethod===key&&<span style={{ marginLeft:"auto", fontSize:11 }}>✅</span>}
            </button>
          ))}
        </div>
        <div style={{ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>{t.pi_amountPaid}</div>
        <input style={inp()} inputMode="decimal" placeholder="0.00" value={piForm.amountPaid} onChange={e=>piUpd("amountPaid",e.target.value)} />
        {totals.grand>0&&(
          <div style={{ marginTop:6 }}>
            <button onClick={()=>piUpd("amountPaid",piFmt2(totals.grand))} style={{ padding:"5px 12px", borderRadius:8, border:"1px solid #22c55e", background:"rgba(34,197,94,0.08)", color:"#22c55e", fontSize:11, fontWeight:700, cursor:"pointer" }}>
              {t.pi_fullPay} (t.cur {piFmt2(totals.grand)})
            </button>
          </div>
        )}
        {totals.grand>0&&(
          <div style={{ marginTop:12, padding:"10px 14px", borderRadius:10, background:balance>0.01?"rgba(239,68,68,0.08)":"rgba(34,197,94,0.08)", border:`1px solid ${balance>0.01?"#ef4444":"#22c55e"}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:12, fontWeight:700, color:balance>0.01?"#ef4444":"#22c55e" }}>{t.pi_balanceDue}</span>
            <span style={{ fontSize:18, fontWeight:900, color:balance>0.01?"#ef4444":"#22c55e" }}>{t.cur} {piFmt2(balance)}</span>
          </div>
        )}
      </div>

      {/* Note */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:16 }}>
        <div style={secLbl}>📝 {t.pi_note}</div>
        <AutoTA style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:13, outline:"none", resize:"none", overflow:"hidden", minHeight:72, boxSizing:"border-box", fontFamily:"inherit" }}
          placeholder={t.pi_notePh} value={piForm.note} onChange={e=>piUpd("note",e.target.value)} />
      </div>

      {/* Actions */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <button onClick={piConfirm} disabled={piSaving} style={{ padding:"14px", borderRadius:12, border:"none", background:piSaving?"#1e3a5f":"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:15, fontWeight:800, cursor:piSaving?"not-allowed":"pointer" }}>
          {piSaving?"...":t.pi_confirm}
        </button>
        <button onClick={piSaveDraft} disabled={piSaving} style={{ padding:"12px", borderRadius:12, border:`1.5px solid ${th.borderMid}`, background:"transparent", color:th.txtMuted, fontSize:14, fontWeight:700, cursor:piSaving?"not-allowed":"pointer" }}>{t.pi_saveDraft}</button>
        <button onClick={()=>setPiView("list")} style={{ padding:"11px", borderRadius:12, border:"1px solid #450a0a", background:"transparent", color:"#ef4444", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.pi_cancelForm}</button>
      </div>
    </div>
  );
}

// ─── SALES INVOICE ────────────────────────────────────────────
const SI_PREFIX  = "SI-";
const SI_UNITS   = ["Pcs","Set","Nos","Kg","Ltr","Box","Cm","Mtr","Dz"];
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
const siFmt2 = (n) => (Math.round((parseFloat(n)||0)*100)/100).toFixed(2);
const siN2   = (v) => parseFloat(v)||0;
const siToday= () => new Date().toISOString().split("T")[0];

function siCalcLine(it, isTax=true) {
  const qty=siN2(it.qty), price=siN2(it.unitPrice), dp=siN2(it.discountPerc);
  const vp = isTax ? siN2(it.vatPerc) : 0; // Regular invoice: no VAT
  const gross=qty*price, disc=gross*dp/100, base=gross-disc, vat=base*vp/100;
  return { gross, disc, vat, total:base+vat };
}
function siCalcTotals(items, isTax=true) {
  let sub=0,disc=0,vat=0,grand=0;
  items.forEach(it=>{ const c=siCalcLine(it,isTax); sub+=c.gross; disc+=c.disc; vat+=c.vat; grand+=c.total; });
  return { sub, disc, vat, grand };
}
const SI_SHOW_CODE_KEY = "si-show-code";
const loadSiShowCode = () => { try { return localStorage.getItem(SI_SHOW_CODE_KEY)==="true"; } catch { return false; } };
const saveSiShowCode = (v) => { try { localStorage.setItem(SI_SHOW_CODE_KEY, v?"true":"false"); } catch {} };
const SI_COLOR_KEY = "si-color-print";
const loadSiColor = () => { try { return localStorage.getItem(SI_COLOR_KEY)==="true"; } catch { return false; } };
const saveSiColor = (v) => { try { localStorage.setItem(SI_COLOR_KEY, v?"true":"false"); } catch {} };

function siEmptyLine() {
  return { id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:null, name:"", code:"", brand:"", qty:"", unit:"Pcs", unitPrice:"", discountPerc:"0", vatPerc:"5" };
}
function siEmptyForm() {
  return {
    invoiceType:"regular",
    invoiceDate:siToday(),
    customerId:"", customerName:"", customerMobile:"", customerAddress:"", customerTrn:"",
    paymentMethod:"cash", amountPaid:"",
    deliveryNoteNo:"", vehicleNo:"",
    note:"",
  };
}

// ── Print / PDF Generator ──
function generateSalesInvoiceHTML(invoice, shop, lang, showCode, colorPrint) {
  const isBn       = lang==="bn";
  const invType    = invoice.invoiceType||"regular";
  const isTax      = invType==="tax";
  const isDelivery = invType==="delivery";

  // Delivery note keeps amount columns, but VAT/Tax is not applied.
  const effectiveTax = isTax && !isDelivery;
  const cur = isBn ? "৳" : "AED";
  const { sub, disc, vat, grand } = siCalcTotals(invoice.items||[], effectiveTax);
  const balance = grand - (invoice.amountPaid||0);

  const title = isTax
    ? (isBn?"কর ইনভয়েস":"TAX INVOICE")
    : isDelivery
      ? (isBn?"ডেলিভারি চালান":"DELIVERY CHALLAN")
      : (isBn?"বিক্রয় ইনভয়েস":"SALES INVOICE");

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
    const codeHtml = showCode&&(it.code||it.brand)
      ? `<br><span style="font-size:10px;color:#6b7280">${[it.code&&("📋 "+it.code),it.brand&&("🏷️ "+it.brand)].filter(Boolean).join("  ")}</span>` : "";
    if (isDelivery) {
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center;font-size:15px;font-weight:800;color:#7c3aed">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${siFmt2(it.unitPrice)}</td><td style="text-align:right"><strong>${cur} ${siFmt2(tot)}</strong></td></tr>`;
    } else if (isTax) {
      const base = siN2(it.unitPrice)*siN2(it.qty) - d;
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${siFmt2(it.unitPrice)}</td><td style="text-align:center">${siN2(it.discountPerc)>0?it.discountPerc+"%":"—"}</td><td style="text-align:right">${cur} ${siFmt2(base)}</td><td style="text-align:center">${it.vatPerc||0}%</td><td style="text-align:right">${cur} ${siFmt2(v)}</td><td style="text-align:right"><strong>${cur} ${siFmt2(tot)}</strong></td></tr>`;
    } else {
      return `<tr><td style="text-align:center">${i+1}</td><td><strong>${it.name}</strong>${codeHtml}</td><td style="text-align:center">${it.qty} ${it.unit}</td><td style="text-align:right">${cur} ${siFmt2(it.unitPrice)}</td><td style="text-align:center">${siN2(it.discountPerc)>0?it.discountPerc+"%":"—"}</td><td style="text-align:right"><strong>${cur} ${siFmt2(tot)}</strong></td></tr>`;
    }
  }).join("");

  const tableHeaders = isDelivery
    ? `<th style="width:36px">#</th><th>${isBn?"পণ্যের বিবরণ":"Item Description"}</th><th style="text-align:center;width:95px">${isBn?"পরিমাণ":"Qty"}</th><th style="text-align:right;width:110px">${isBn?"একক মূল্য":"Unit Price"}</th><th style="text-align:right;width:120px">${isBn?"মোট":"Amount"}</th>`
    : isTax
      ? `<th>#</th><th>${isBn?"পণ্য":"Description"}</th><th style="text-align:center">${isBn?"পরিমাণ":"Qty"}</th><th style="text-align:right">${isBn?"একক মূল্য":"Unit Price"}</th><th style="text-align:center">${isBn?"ছাড়":"Disc"}</th><th style="text-align:right">${isBn?"VAT বাদে":"Excl.VAT"}</th><th style="text-align:center">VAT%</th><th style="text-align:right">${isBn?"VAT":"VAT Amt"}</th><th style="text-align:right">${isBn?"মোট":"Total"}</th>`
      : `<th>#</th><th>${isBn?"পণ্য":"Description"}</th><th style="text-align:center">${isBn?"পরিমাণ":"Qty"}</th><th style="text-align:right">${isBn?"একক মূল্য":"Unit Price"}</th><th style="text-align:center">${isBn?"ছাড়":"Disc"}</th><th style="text-align:right">${isBn?"মোট":"Total"}</th>`;

  const totalsHTML = isDelivery
    ? `<div class="grand-row"><span class="gl">${isBn?"মোট Amount":"Total Amount"}</span><span class="gv">${cur} ${siFmt2(grand)}</span></div>`
    : isTax
      ? `<div class="totals-row"><span class="tl">${isBn?"সাব-টোটাল (VAT বাদে)":"Subtotal (Excl. VAT)"}</span><span class="tv">${cur} ${siFmt2(sub)}</span></div>${disc>0?`<div class="totals-row"><span class="tl">${isBn?"ছাড়":"Discount"}</span><span class="tv" style="color:#ef4444">- ${cur} ${siFmt2(disc)}</span></div>`:""}<div class="totals-row" style="background:#fef9c3"><span class="tl" style="color:#92400e;font-weight:700">VAT (${isBn?"মোট":"Total"})</span><span class="tv" style="color:#92400e">+ ${cur} ${siFmt2(vat)}</span></div><div class="grand-row"><span class="gl">${isBn?"সর্বমোট (VAT সহ)":"Grand Total (Incl. VAT)"}</span><span class="gv">${cur} ${siFmt2(grand)}</span></div>`
    : `${disc>0?`<div class="totals-row"><span class="tl">${isBn?"ছাড়":"Discount"}</span><span class="tv" style="color:#ef4444">- ${cur} ${siFmt2(disc)}</span></div>`:""}<div class="grand-row"><span class="gl">${isBn?"সর্বমোট":"Grand Total"}</span><span class="gv">${cur} ${siFmt2(grand)}</span></div>`;

  const custHTML = `<div class="info-box"><div class="info-label">👤 ${isBn?"কাস্টমার":"Customer"}</div><div class="info-value">${invoice.customerName||"—"}</div>${invoice.customerMobile?`<div class="info-sub">📱 ${invoice.customerMobile}</div>`:""} ${invoice.customerAddress?`<div class="info-sub">📍 ${invoice.customerAddress}</div>`:""} ${isTax&&invoice.customerTrn?`<div class="info-sub" style="color:#b45309;font-weight:700;font-size:12px">TRN: ${invoice.customerTrn}</div>`:""}</div>`;

  const payInfoHTML = isDelivery
    ? `<div class="info-box"><div class="info-label">📦 ${isBn?"ডেলিভারি তথ্য":"Delivery Info"}</div><div class="info-value">${invoice.deliveryNoteNo||"—"}</div>${invoice.vehicleNo?`<div class="info-sub">🚗 ${invoice.vehicleNo}</div>`:""}<div class="info-sub">👤 ${invoice.createdByName}</div></div>`
    : `<div class="info-box"><div class="info-label">💳 ${isBn?"পেমেন্ট":"Payment"}</div><div class="info-value">${SI_PAY[invoice.paymentMethod]?.icon||""} ${SI_PAY[invoice.paymentMethod]?.[lang]||invoice.paymentMethod}</div><div class="info-sub">${SI_STATUSES[invoice.status]?.[lang]||invoice.status}</div></div>`;

  const deliveryHTML = !isDelivery&&(invoice.deliveryNoteNo||invoice.vehicleNo)
    ? `<div style="display:flex;gap:16px;margin-bottom:14px">${invoice.deliveryNoteNo?`<div class="info-box" style="flex:1"><div class="info-label">🚚 ${isBn?"ডেলিভারি নোট নং":"Delivery Note No."}</div><div class="info-value">${invoice.deliveryNoteNo}</div></div>`:""} ${invoice.vehicleNo?`<div class="info-box" style="flex:1"><div class="info-label">🚗 ${isBn?"গাড়ির নম্বর":"Vehicle No."}</div><div class="info-value">${invoice.vehicleNo}</div></div>`:""}</div>` : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - ${invoice.invoiceNo}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;700;900&family=Noto+Sans:wght@400;700;900&display=swap" rel="stylesheet">
<style>
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
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:14px">
  <button onclick="window.print()" style="padding:10px 28px;background:${grandBg};color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px">🖨️ ${isBn?"প্রিন্ট / PDF":"Print / PDF"}</button>
  <button onclick="window.close()" style="padding:10px 20px;background:#e5e7eb;color:#374151;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">${isBn?"বন্ধ করুন":"Close"}</button>
</div>
<div class="invoice"><div class="hdr"><div><div class="shop-name">🏢 ${shop?.companyName||"Shop"}</div><div class="shop-sub">${[shop?.area,shop?.countryName].filter(Boolean).join(", ")||""}</div>${shop?.mobile?`<div class="shop-sub">📱 ${shop.mobile}</div>`:""} ${isTax&&shop?.trnNumber?`<div class="shop-sub" style="font-weight:800;margin-top:3px;color:${colorPrint?"inherit":"#b45309"}">TRN: ${shop.trnNumber}</div>`:""} ${isTax&&shop?.vatNumber?`<div class="shop-sub" style="font-weight:700">VAT: ${shop.vatNumber}</div>`:""}</div><div><div class="inv-title" style="color:${colorPrint?"#fff":accentBorder}">${title}</div><div class="inv-no" style="font-size:14px;font-weight:800;color:${colorPrint?"rgba(255,255,255,0.9)":"#333"}">${invoice.invoiceNo}</div><div class="inv-no" style="color:${colorPrint?"rgba(255,255,255,0.8)":"#555"}">📅 ${invoice.invoiceDate}</div><div class="inv-no" style="color:${colorPrint?"rgba(255,255,255,0.8)":"#555"}">👤 ${invoice.createdByName}</div></div></div>
<div class="body"><div class="info-grid">${custHTML}${payInfoHTML}</div>
${deliveryHTML}<table><thead><tr>${tableHeaders}</tr></thead><tbody>${rows}</tbody></table>
${totalsHTML?`<div class="totals"><div class="totals-box">${totalsHTML}</div></div>`:""}
${!isDelivery&&invoice.amountPaid>0?`<div class="pay-box"><span style="font-weight:700;color:#15803d">✅ ${isBn?"পরিশোধিত":"Paid"}</span><span style="font-size:17px;font-weight:900;color:#15803d">${cur} ${siFmt2(invoice.amountPaid)}</span></div>`:""}
${!isDelivery&&balance>0.01?`<div class="bal-box"><span style="font-weight:700;color:#dc2626">⚠️ ${isBn?"বাকি":"Balance Due"}</span><span style="font-size:17px;font-weight:900;color:#dc2626">${cur} ${siFmt2(balance)}</span></div>`:""}
${isDelivery?`<div class="recv-box"><div style="font-size:11px;color:#7c3aed;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px">✅ ${isBn?"মোট পণ্য":"Total Items"}: ${(invoice.items||[]).reduce((s,it)=>s+siN2(it.qty),0)} ${isBn?"পিস":"Pcs"} | ${isBn?"মোট লাইন":"Lines"}: ${(invoice.items||[]).length}</div><div class="recv-grid"><div class="recv-item">${isBn?"প্রেরকের স্বাক্ষর":"Sender Signature"}</div><div class="recv-item">${isBn?"ড্রাইভারের স্বাক্ষর":"Driver Signature"}</div><div class="recv-item">${isBn?"গ্রাহকের স্বাক্ষর":"Receiver Signature"}</div></div></div>`:""}
${invoice.note?`<div class="note-box">📝 ${invoice.note}</div>`:""}
${!isDelivery?`<div class="sigs"><div><div class="sig-line">${isBn?"অনুমোদনকারী স্বাক্ষর":"Authorized Signature"}</div></div><div><div class="sig-line">${isBn?"গ্রাহক স্বাক্ষর":"Customer Signature"}</div></div></div>`:""}
</div><div class="footer">${isDelivery?(isBn?"ডেলিভারি সম্পন্ন হলে এই চালানে স্বাক্ষর করুন 🚚":"Please sign this challan upon delivery 🚚"):(isBn?"ব্যবসার জন্য ধন্যবাদ! 🙏":"Thank you for your business! 🙏")}</div></div></body></html>`;
}

function printSalesInvoice(invoice, shop, lang, showCode, colorPrint) {
  const html = generateSalesInvoiceHTML(invoice, shop, lang, showCode||false, colorPrint||false);
  // Use Blob URL to properly handle UTF-8/Bengali encoding
  const blob = new Blob([html], { type:"text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const w    = window.open(url, "_blank", "width=980,height=780");
  if (!w) {
    URL.revokeObjectURL(url);
    alert(lang==="bn"?"Pop-up block করা আছে। Browser এ allow করুন।":"Popup blocked. Please allow popups.");
    return;
  }
  w.addEventListener("load", () => {
    setTimeout(() => { w.print(); URL.revokeObjectURL(url); }, 400);
  });
}

// ── SI Status Badge ──
function SiStatusBadge({ status, lang }) {
  const st = SI_STATUSES[status]||SI_STATUSES.draft;
  return <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, color:st.color, background:st.bg, whiteSpace:"nowrap" }}>{st[lang]}</span>;
}

// ── SI Customer Picker ──
function SiCustomerPicker({ customers, onSelect, onClose, t, th }) {
  const [q,setQ]=useState("");
  const filtered=customers.filter(c=>{ if (!q) return true; return nsmatch([c.customerName,c.customerCode,c.mobileNumber].filter(Boolean).join(" "),q); });
  const inp={ padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:10000, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ width:"100%", maxWidth:600, background:th.bgCard, borderRadius:"16px 16px 0 0", maxHeight:"70vh", display:"flex", flexDirection:"column", border:`1px solid ${th.border}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:`1px solid ${th.border}` }}>
          <span style={{ fontSize:14, fontWeight:700, color:th.txtPrimary }}>👥 {t.si_customer}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:th.txtMuted, cursor:"pointer", fontSize:20 }}>✕</button>
        </div>
        <div style={{ padding:"10px 14px", borderBottom:`1px solid ${th.border}` }}>
          <input autoFocus style={inp} placeholder={t.si_customerSearch} value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <div style={{ overflowY:"auto", flex:1 }}>
          {filtered.length===0&&<div style={{ textAlign:"center", padding:"30px", color:th.txtFaint }}>{t.si_noResults}</div>}
          {filtered.map(c=>(
            <button key={c.id} onClick={()=>onSelect(c)} style={{ width:"100%", textAlign:"left", padding:"12px 16px", background:"transparent", border:"none", borderBottom:`1px solid ${th.border}`, cursor:"pointer", fontFamily:"inherit" }}>
              <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{c.customerName}</div>
              <div style={{ fontSize:11, color:th.txtMuted, marginTop:2, display:"flex", gap:8 }}>
                {c.mobileNumber&&<span>📱 {c.mobileNumber}</span>}
                {c.customerCode&&<span>#{c.customerCode}</span>}
                {c.city&&<span>📍 {c.city}</span>}
              </div>
            </button>
          ))}
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
            placeholder={lang==="bn"?"পণ্যের নাম, কোড বা ব্র্যান্ড লিখুন...":"Search by name, code or brand..."}
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

// ── SI Invoice Card ──
function SiInvoiceCard({ invoice, onClick, t, th, lang }) {
  const bal = invoice.grandTotal - invoice.amountPaid;
  return (
    <div onClick={onClick} style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:"12px 14px", marginBottom:8, cursor:"pointer" }}
      onMouseEnter={e=>e.currentTarget.style.borderColor="#22c55e"}
      onMouseLeave={e=>e.currentTarget.style.borderColor=th.border}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:800, color:"#22c55e" }}>{invoice.invoiceNo}</div>
          <div style={{ fontSize:12, color:th.txtMuted, marginTop:1 }}>📅 {invoice.invoiceDate} · {invoice.createdByName}</div>
        </div>
        <SiStatusBadge status={invoice.status} lang={lang} />
      </div>
      <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary, marginBottom:4 }}>👤 {invoice.customerName||"—"}</div>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
        <span style={{ fontSize:11, color:th.txtMuted }}>{invoice.items?.length||0} {lang==="bn"?"টি":""} items</span>
        <span style={{ fontSize:14, fontWeight:800, color:"#22c55e" }}>{t.cur} {siFmt2(invoice.grandTotal)}</span>
        {invoice.amountPaid>0&&<span style={{ fontSize:11, color:"#22c55e", fontWeight:700 }}>✅ {t.cur} {siFmt2(invoice.amountPaid)}</span>}
        {bal>0.01&&<span style={{ fontSize:11, color:"#ef4444", fontWeight:700 }}>⚠️ {t.cur} {siFmt2(bal)}</span>}
      </div>
    </div>
  );
}

// ── SALES INVOICE TAB (main) ──
function SalesInvoiceTab({ t, lang, th, s, shopId, user, profile, customers, products, shop, toast, isDesktop, siShowCode, siColorPrint }) {
  const isOwner = profile?.role==="owner";

  const [invoices,setInvoices]     = useState([]);
  const [siLoading,setSiLoading]   = useState(true);
  const [siView,setSiView]         = useState("list");
  const [selInv,setSelInv]         = useState(null);
  const [editInvId,setEditInvId]   = useState(null);
  const [siPrintModal,setSiPrintModal] = useState(null); // invoice to print after confirm
  const [siInvoiceNo,setSiInvoiceNo]= useState("");
  const [siForm,setSiForm]         = useState(siEmptyForm());
  const [siLines,setSiLines]       = useState([]);
  const [pickerTarget,setPickerTarget]= useState(null);
  const [showCustPicker,setShowCustPicker]= useState(false);
  const [showQuickPicker,setShowQuickPicker] = useState(false);
  const siEmptyCurrent = () => ({ productId:null, name:"", code:"", brand:"", qty:"1", unit:"Pcs", unitPrice:"", discountPerc:"0", vatPerc:"5" });
  const [siCurrent,setSiCurrent]   = useState(siEmptyCurrent);
  const siNameRef = useRef(null);

  const [siSaving,setSiSaving]     = useState(false);
  const [siSearch,setSiSearch]     = useState("");
  const [siStatusF,setSiStatusF]   = useState("ALL");
  const [siViewAll,setSiViewAll]   = useState(isOwner);

  // Listener
  useEffect(()=>{
    if (!shopId) return;
    setSiLoading(true);
    let u2=null;
    const baseQ = isOwner
      ? query(collection(db,"salesInvoices"),where("shopId","==",shopId),orderBy("createdAt","desc"))
      : query(collection(db,"salesInvoices"),where("shopId","==",shopId),where("createdBy","==",user.uid),orderBy("createdAt","desc"));
    const u1=onSnapshot(baseQ,snap=>{
      setInvoices(snap.docs.map(d=>({...d.data(),id:d.id,createdAt:d.data().createdAt?.toDate?.()||new Date()})));
      setSiLoading(false);
    },()=>{
      const fbQ=isOwner
        ? query(collection(db,"salesInvoices"),where("shopId","==",shopId))
        : query(collection(db,"salesInvoices"),where("shopId","==",shopId),where("createdBy","==",user.uid));
      u2=onSnapshot(fbQ,snap=>{
        const docs=snap.docs.map(d=>({...d.data(),id:d.id,createdAt:d.data().createdAt?.toDate?.()||new Date()}));
        docs.sort((a,b)=>b.createdAt-a.createdAt);
        setInvoices(docs);
        setSiLoading(false);
      },err=>{ console.error(err); setSiLoading(false); });
    });
    return ()=>{ u1(); u2&&u2(); };
  },[shopId,isOwner,user.uid]);

  // Generate invoice no
  const genSiNo = async () => {
    try {
      const serial=await runTransaction(db,async tx=>{
        const shopRef=doc(db,"shops",shopId), shopSnap=await tx.get(shopRef);
        const next=Number(shopSnap.data()?.lastSISerial||0)+1;
        tx.update(shopRef,{lastSISerial:next}); return next;
      });
      return `${SI_PREFIX}${String(serial).padStart(4,"0")}`;
    } catch(e1) {
      try {
        const snap=await getDocs(query(collection(db,"salesInvoices"),where("shopId","==",shopId)));
        const max=snap.docs.reduce((mx,d)=>{ const m=String(d.data().invoiceNo||"").match(/SI-?(\d+)$/); return m?Math.max(mx,Number(m[1])):mx; },0);
        return `${SI_PREFIX}${String(max+1).padStart(4,"0")}`;
      } catch { return `${SI_PREFIX}${String(Date.now()).slice(-4)}`; }
    }
  };

  const siOpenNew = async () => {
    try {
      const no=await genSiNo();
      setSiInvoiceNo(no); setSiForm(siEmptyForm()); setSiLines([]); setSiCurrent(siEmptyCurrent()); setEditInvId(null); setSiView("form");
    } catch(e) { toast(lang==="bn"?"ইনভয়েস খুলতে সমস্যা!":"Failed to open form!","err"); }
  };

  const siOpenEdit=(inv)=>{
    setSiInvoiceNo(inv.invoiceNo);
    setSiForm({
      invoiceType:inv.invoiceType||"regular", invoiceDate:inv.invoiceDate,
      customerId:inv.customerId||"", customerName:inv.customerName||"",
      customerMobile:inv.customerMobile||"", customerAddress:inv.customerAddress||"",
      customerTrn:inv.customerTrn||"", paymentMethod:inv.paymentMethod||"cash",
      // Cash is always auto-paid — don't pre-fill amountPaid so switching to credit gives 0
      amountPaid: inv.paymentMethod==="cash" ? "" : (inv.amountPaid>0?String(inv.amountPaid):""),
      deliveryNoteNo:inv.deliveryNoteNo||"", vehicleNo:inv.vehicleNo||"", note:inv.note||"",
    });
    setSiLines((inv.items||[]).map(it=>({ id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:it.productId||null, name:it.name||"", code:it.code||"", brand:it.brand||"", qty:String(it.qty||""), unit:it.unit||"Pcs", unitPrice:String(it.unitPrice||""), discountPerc:String(it.discountPerc||"0"), vatPerc:String(it.vatPerc||"5") })));
    setSiCurrent(siEmptyCurrent());
    setEditInvId(inv.id); setSiView("form");
  };

  const siUpd=(k,v)=>setSiForm(p=>({...p,[k]:v}));
  const siAddLine=()=>setSiLines(p=>[...p,siEmptyLine()]);
  const siUpdLine=(id,f,v)=>setSiLines(p=>p.map(it=>it.id===id?{...it,[f]:v}:it));
  const siDelLine=(id)=>setSiLines(p=>p.filter(it=>it.id!==id));

  // Quick add: adds product as new line directly from picker
  const siAddProductLine = (prod) => {
    const newLine = {
      ...siEmptyLine(),
      productId:  prod.id,
      name:       prod.name,
      code:       prod.code||prod.barcode||"",
      brand:      prod.brand||"",
      unit:       prod.unit||"Pcs",
      unitPrice:  prod.vatExclusive||prod.landingCost||prod.mrp||"",
      vatPerc:    prod.salesVat||"5",
      qty:        "1",
    };
    setSiLines(p=>[...p, newLine]);
  };

  const siSelectProduct=(prod)=>{
    setSiCurrent(p=>({
      ...p,
      productId: prod.id,
      name:      prod.name,
      code:      prod.code||prod.barcode||"",
      brand:     prod.brand||"",
      unit:      prod.unit||"Pcs",
      unitPrice: prod.vatExclusive||prod.landingCost||prod.mrp||p.unitPrice,
      vatPerc:   prod.salesVat||"5",
    }));
    setPickerTarget(null);
    setTimeout(()=>siNameRef.current?.focus(), 100);
  };

  const siAddCurrentItem = () => {
    if (!siCurrent.name.trim()) { toast(t.si_errName,"err"); return; }
    if (!siCurrent.qty||siN2(siCurrent.qty)<=0) { toast(t.si_errQty,"err"); return; }
    setSiLines(prev=>[...prev, { ...siCurrent, id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}` }]);
    setSiCurrent(siEmptyCurrent());
    setTimeout(()=>siNameRef.current?.focus(), 80);
  };

  const siSelectCustomer=(c)=>{
    siUpd("customerId",c.id); siUpd("customerName",c.customerName);
    siUpd("customerMobile",c.mobileNumber||"");
    siUpd("customerAddress",[c.address,c.area,c.city].filter(Boolean).join(", ")||"");
    siUpd("customerTrn",c.trnNumber||"");
    setShowCustPicker(false);
  };

  const siBuild=(status)=>{
    const valid=siLines.filter(it=>it.name.trim());
    if (!valid.length){ toast(t.si_errItems,"err"); return null; }
    const isDelivery = siForm.invoiceType==="delivery";
    const isTax      = siForm.invoiceType==="tax";
    for (const it of valid){
      if (!it.qty.toString().trim()||siN2(it.qty)<=0){ toast(t.si_errQty,"err"); return null; }
      if (siN2(it.unitPrice)<0){ toast(t.si_errPrice,"err"); return null; }
    }
    const effectiveIsTax = isTax && !isDelivery;
    const builtItems=valid.map(it=>{
      const item = isDelivery ? {...it, discountPerc:"0", vatPerc:"0"} : it;
      const { disc, vat, total }=siCalcLine(item, effectiveIsTax);
      return { productId:it.productId||null, name:it.name.trim(), code:it.code.trim(), brand:it.brand.trim(), qty:siN2(it.qty), unit:it.unit, unitPrice:siN2(it.unitPrice), discountPerc:isDelivery?0:siN2(it.discountPerc), discountAmt:parseFloat(siFmt2(disc)), vatPerc:effectiveIsTax?siN2(it.vatPerc):0, vatAmt:parseFloat(siFmt2(vat)), lineTotal:parseFloat(siFmt2(total)) };
    });
    const { sub, disc, vat, grand } = siCalcTotals(siLines, effectiveIsTax);
    const isCash     = siForm.paymentMethod==="cash";
    // cash invoice: auto fully paid | delivery: confirmed | credit: normal
    const paid = isDelivery ? 0
               : isCash     ? parseFloat(siFmt2(grand))
               : siN2(siForm.amountPaid);
    const bal  = isDelivery ? 0 : Math.max(0, grand - paid);
    const derivedStatus = isDelivery ? "confirmed"
                        : (status==="confirmed" ? (bal<0.01?"paid":paid>0?"partial":"confirmed") : status);
    return { shopId, invoiceNo:siInvoiceNo, invoiceType:siForm.invoiceType||"regular", invoiceDate:siForm.invoiceDate, customerId:siForm.customerId||null, customerName:siForm.customerName.trim(), customerMobile:siForm.customerMobile.trim(), customerAddress:siForm.customerAddress.trim(), customerTrn:siForm.customerTrn.trim(), items:builtItems, subtotal:parseFloat(siFmt2(sub)), totalDiscount:parseFloat(siFmt2(disc)), totalVat:parseFloat(siFmt2(vat)), grandTotal:parseFloat(siFmt2(grand)), paymentMethod:siForm.paymentMethod, amountPaid:parseFloat(siFmt2(paid)), balanceDue:parseFloat(siFmt2(bal)), status:derivedStatus, deliveryNoteNo:siForm.deliveryNoteNo.trim(), vehicleNo:siForm.vehicleNo.trim(), note:siForm.note.trim(), createdBy:user.uid, createdByName:profile.personName };
  };

  const siSaveDraft=async()=>{ const p=siBuild("draft"); if (!p) return; setSiSaving(true); try { if (editInvId){ await updateDoc(doc(db,"salesInvoices",editInvId),{...p,updatedAt:serverTimestamp()}); toast(t.si_updated); } else { await addDoc(collection(db,"salesInvoices"),{...p,createdAt:serverTimestamp()}); toast(t.si_saved); } setSiView("list"); } catch(e){ toast(e.message,"err"); } finally{ setSiSaving(false); } };
  const siConfirm=async()=>{
    const p=siBuild("confirmed"); if (!p) return;
    setSiSaving(true);
    try {
      let savedInvoice = {...p};
      if (editInvId){
        await updateDoc(doc(db,"salesInvoices",editInvId),{...p,updatedAt:serverTimestamp()});
        savedInvoice = {...p, id:editInvId};
        toast(t.si_updated);
      } else {
        const ref = await addDoc(collection(db,"salesInvoices"),{...p,createdAt:serverTimestamp()});
        savedInvoice = {...p, id:ref.id};
        toast(t.si_confirmed);
      }
      setSiView("list");
      // Show print modal immediately after confirm
      setSiPrintModal(savedInvoice);
    } catch(e){ toast(e.message,"err"); }
    finally{ setSiSaving(false); }
  };
  const siMarkPaid=async(inv)=>{ try { await updateDoc(doc(db,"salesInvoices",inv.id),{amountPaid:inv.grandTotal,balanceDue:0,status:"paid",updatedAt:serverTimestamp()}); setSelInv(p=>({...p,amountPaid:inv.grandTotal,balanceDue:0,status:"paid"})); toast(t.si_paidMarked); } catch(e){ toast(e.message,"err"); } };
  const siCancel=async(inv)=>{ if (!window.confirm(t.si_confirmCancel)) return; try { await updateDoc(doc(db,"salesInvoices",inv.id),{status:"cancelled",updatedAt:serverTimestamp()}); setSelInv(p=>({...p,status:"cancelled"})); toast(t.si_cancelledMsg,"err"); } catch(e){ toast(e.message,"err"); } };
  const siDelete=async(inv)=>{ if (!window.confirm(t.si_confirmDelete)) return; try { await deleteDoc(doc(db,"salesInvoices",inv.id)); setSiView("list"); setSelInv(null); toast(t.si_deleted,"err"); } catch(e){ toast(e.message,"err"); } };

  const siFiltered=invoices.filter(inv=>{
    const matchSt=siStatusF==="ALL"||inv.status===siStatusF;
    const q=siSearch.trim();
    if (!q) return matchSt;
    const hay=[inv.invoiceNo,inv.customerName,inv.createdByName,...(inv.items||[]).map(it=>it.name+" "+it.code)].filter(Boolean).join(" ");
    return matchSt&&nsmatch(hay,q);
  });
  const siKPIs=invoices.reduce((a,inv)=>{ a.total++; a.amount+=inv.grandTotal||0; a.paid+=inv.amountPaid||0; a.due+=inv.balanceDue||0; return a; },{total:0,amount:0,paid:0,due:0});

  const panel=isDesktop?{maxWidth:900,margin:"0 auto",padding:"24px 28px 60px"}:{maxWidth:660,margin:"0 auto",padding:"18px 14px 60px"};
  const inp=(e={})=>({ padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...e });
  const secLbl={ fontSize:11, color:"#22c55e", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, padding:"8px 0 6px", borderBottom:`1px solid ${th.border}`, marginBottom:12 };
  const formIsDelivery = siForm.invoiceType==="delivery";
  const formIsTax      = siForm.invoiceType==="tax";
  const formIsCash     = siForm.paymentMethod==="cash";
  const totals=siCalcTotals(siLines, formIsTax&&!formIsDelivery);
  // cash: auto fully paid, delivery: 0
  const formPaid = formIsDelivery ? 0 : formIsCash ? totals.grand : siN2(siForm.amountPaid);
  const balance  = Math.max(0, totals.grand - formPaid);

  // ══ LIST ══
  if (siView==="list") return (
    <div style={panel}>
      {pickerTarget!==null&&<PiProductPicker products={products} t={{ ...t, pi_fromMaster:t.si_fromMaster, pi_pmSearchPh:t.si_pmSearchPh, pi_noResults:t.si_noResults }} th={th} onSelect={p=>{ setSiCurrent(prev=>({ ...prev, productId:p.id, name:p.name, code:p.code||p.barcode||"", brand:p.brand||"", unit:p.unit||"Pcs", unitPrice:p.vatExclusive||p.landingCost||p.mrp||prev.unitPrice, vatPerc:p.salesVat||"5" })); setPickerTarget(null); }} onClose={()=>setPickerTarget(null)} />}
      {showCustPicker&&<SiCustomerPicker customers={customers} t={t} th={th} onSelect={siSelectCustomer} onClose={()=>setShowCustPicker(false)} />}

      {/* ── Print Modal after Confirm ── */}
      {siPrintModal&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:16, padding:28, maxWidth:380, width:"100%", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
            <div style={{ fontSize:18, fontWeight:800, color:"#22c55e", marginBottom:6 }}>
              {lang==="bn"?"ইনভয়েস সেভ হয়েছে!":"Invoice Saved!"}
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:th.txtMuted, marginBottom:4 }}>
              {siPrintModal.invoiceNo}
            </div>
            <div style={{ fontSize:13, color:th.txtMuted, marginBottom:20 }}>
              {siPrintModal.customerName||"—"} · {t.cur} {siFmt2(siPrintModal.grandTotal)}
            </div>
            <button
              onClick={()=>{ printSalesInvoice(siPrintModal, shop, lang, siShowCode, siColorPrint); setSiPrintModal(null); }}
              style={{ width:"100%", padding:"14px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#7c3aed,#6d28d9)", color:"#fff", fontSize:15, fontWeight:800, cursor:"pointer", marginBottom:10 }}>
              🖨️ {lang==="bn"?"এখনই প্রিন্ট করুন":"Print Now"}
            </button>
            <button
              onClick={()=>setSiPrintModal(null)}
              style={{ width:"100%", padding:"12px", borderRadius:12, border:`1px solid ${th.borderMid}`, background:"transparent", color:th.txtMuted, fontSize:14, fontWeight:700, cursor:"pointer" }}>
              {lang==="bn"?"পরে প্রিন্ট করব":"Print Later"}
            </button>
          </div>
        </div>
      )}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:16, fontWeight:800, color:"#22c55e" }}>{t.si_title}</div>
        <button onClick={siOpenNew} disabled={siSaving} style={{ padding:"9px 16px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.si_new}</button>
      </div>

      {invoices.length>0&&(
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
          {[{l:t.si_totalInvoices,v:siKPIs.total,c:"#a1a1aa",pre:""},{l:t.si_totalSales,v:siFmt2(siKPIs.amount),c:"#22c55e",pre:t.cur+" "},{l:t.si_totalPaid,v:siFmt2(siKPIs.paid),c:"#06b6d4",pre:t.cur+" "},{l:t.si_totalDue,v:siFmt2(siKPIs.due),c:siKPIs.due>0?"#ef4444":"#22c55e",pre:t.cur+" "}].map((k,i)=>(
            <div key={i} style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:10, padding:"10px 8px", textAlign:"center" }}>
              <div style={{ fontSize:14, fontWeight:900, color:k.c }}>{k.pre}{k.v}</div>
              <div style={{ fontSize:8, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginTop:2 }}>{k.l}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ position:"relative", marginBottom:10 }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
        <input style={{ ...inp(), paddingLeft:38, background:th.bgCard }} placeholder={t.si_searchPh} value={siSearch} onChange={e=>setSiSearch(e.target.value)} />
        {siSearch&&<button onClick={()=>setSiSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:th.txtMuted, cursor:"pointer", fontSize:16 }}>✕</button>}
      </div>

      <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:8, marginBottom:8 }}>
        {["ALL",...Object.keys(SI_STATUSES)].map(st=>(
          <button key={st} onClick={()=>setSiStatusF(st)} style={{ padding:"5px 13px", borderRadius:20, border:"1px solid", whiteSpace:"nowrap", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit", background:siStatusF===st?"#22c55e":"transparent", borderColor:siStatusF===st?"#22c55e":th.borderMid, color:siStatusF===st?"#fff":th.txtMuted }}>
            {st==="ALL"?t.si_allStatus:SI_STATUSES[st]?.[lang]}
          </button>
        ))}
      </div>

      {siLoading&&<div style={{ textAlign:"center", padding:"50px", color:th.txtFaint }}><div style={{ fontSize:36 }}>⏳</div></div>}
      {!siLoading&&invoices.length===0&&<div style={{ textAlign:"center", padding:"60px 20px", color:th.txtFaint }}><div style={{ fontSize:46, marginBottom:10 }}>🧾</div><div>{t.si_noInvoices}</div></div>}
      {!siLoading&&invoices.length>0&&siFiltered.length===0&&<div style={{ textAlign:"center", padding:"40px", color:th.txtFaint }}><div style={{ fontSize:36 }}>🔍</div><div>{t.si_noResults}</div></div>}
      {!siLoading&&siFiltered.map(inv=>(
        <SiInvoiceCard key={inv.id} invoice={inv} t={t} th={th} lang={lang} onClick={()=>{ setSelInv(inv); setSiView("detail"); }} />
      ))}
    </div>
  );

  // ══ DETAIL ══
  if (siView==="detail"&&selInv) {
    const inv=invoices.find(x=>x.id===selInv.id)||selInv;
    const isTax       = inv.invoiceType==="tax";
    const isInvCash   = inv.paymentMethod==="cash";
    const isInvDelivery = inv.invoiceType==="delivery";
    const { sub, disc, vat, grand } = siCalcTotals(inv.items||[], isTax&&!isInvDelivery);
    const bal=grand-inv.amountPaid;
    const canEdit=["draft","confirmed","paid","partial"].includes(inv.status);
    // cash invoice is always fully paid → no mark paid button
    const canPay=!isInvCash&&["confirmed","partial"].includes(inv.status);
    const dr={ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${th.border}` };
    return (
      <div style={panel}>
        <button onClick={()=>{ setSiView("list"); setSelInv(null); }} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"#22c55e", cursor:"pointer", fontSize:13, fontWeight:700, padding:"0 0 14px 0", fontFamily:"inherit" }}>{t.si_backToList}</button>

        <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
            <div>
              <div style={{ fontSize:22, fontWeight:900, color:"#22c55e", letterSpacing:1 }}>{inv.invoiceNo}</div>
              <div style={{ fontSize:12, color:th.txtMuted, marginTop:2 }}>📅 {inv.invoiceDate}</div>
            </div>
            <SiStatusBadge status={inv.status} lang={lang} />
          </div>
          <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>👤 {t.si_customer}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{inv.customerName||"—"}</span></div>
          {inv.customerMobile&&<div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>📱</span><span style={{ fontSize:13, color:th.txtPrimary }}>{inv.customerMobile}</span></div>}
          <div style={{ ...dr, borderBottom:"none" }}><span style={{ fontSize:12, color:th.txtMuted }}>👤 {t.si_createdBy}</span><span style={{ fontSize:12, color:th.txtMuted }}>{inv.createdByName}</span></div>
          {inv.note&&<div style={{ marginTop:8, padding:"8px 10px", background:th.bgInp, borderRadius:8, fontSize:12, color:th.txtSecondary, borderLeft:"3px solid #22c55e" }}>📝 {inv.note}</div>}
        </div>

        {/* Items */}
        <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:14, marginBottom:10, overflowX:"auto" }}>
          <div style={{ fontSize:11, color:"#22c55e", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginBottom:10 }}>📦 {t.si_items} ({inv.items?.length||0})</div>
          {(inv.items||[]).map((it,i)=>{
            const { disc:d, vat:v, total:tot }=siCalcLine(it, isTax);
            return (
              <div key={i} style={{ display:"flex", alignItems:"flex-start", padding:"9px 0", borderBottom:i<inv.items.length-1?`1px solid ${th.border}`:"none", gap:6 }}>
                <span style={{ width:24, fontSize:11, fontWeight:800, color:"#22c55e", flexShrink:0 }}>{i+1}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{it.name}</div>
                  <div style={{ fontSize:10, color:th.txtMuted, marginTop:2, display:"flex", gap:6, flexWrap:"wrap" }}>
                    {it.code&&<span>📋 {it.code}</span>}
                    {it.brand&&<span>🏷️ {it.brand}</span>}
                    {siN2(it.discountPerc)>0&&<span style={{ color:"#ef4444" }}>Disc {it.discountPerc}% (-{siFmt2(d)})</span>}
                    {siN2(it.vatPerc)>0&&<span style={{ color:"#06b6d4" }}>VAT {it.vatPerc}% (+{siFmt2(v)})</span>}
                  </div>
                </div>
                <span style={{ width:60, textAlign:"center", fontSize:12, color:th.txtPrimary, flexShrink:0 }}>{it.qty} {it.unit}</span>
                <span style={{ width:90, textAlign:"right", fontSize:12, color:th.txtMuted, flexShrink:0 }}>{t.cur} {siFmt2(it.unitPrice)}</span>
                <span style={{ width:100, textAlign:"right", fontSize:13, fontWeight:700, color:"#22c55e", flexShrink:0 }}>{t.cur} {siFmt2(tot)}</span>
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:14, marginBottom:10 }}>
          {[[t.si_subtotal,siFmt2(sub),th.txtPrimary],...(disc>0?[[t.si_totalDiscount,`- ${siFmt2(disc)}`,"#ef4444"]]:[]),...(vat>0?[["VAT",`+ ${siFmt2(vat)}`,"#06b6d4"]]:[])].map(([l,v,c],i)=>(
            <div key={i} style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>{l}</span><span style={{ fontSize:13, fontWeight:700, color:c }}>{t.cur} {v}</span></div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0 0" }}>
            <span style={{ fontSize:15, fontWeight:800, color:th.txtPrimary }}>{t.si_grandTotal}</span>
            <span style={{ fontSize:20, fontWeight:900, color:"#22c55e" }}>{t.cur} {siFmt2(grand)}</span>
          </div>
          <div style={{ height:1, background:th.border, margin:"10px 0" }} />
          <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>💳 {t.si_paymentMethod}</span><span style={{ fontSize:12, fontWeight:700, color:th.txtPrimary }}>{SI_PAY[inv.paymentMethod]?.icon} {SI_PAY[inv.paymentMethod]?.[lang]}</span></div>
          {!isInvDelivery&&<div style={dr}><span style={{ fontSize:12, color:"#22c55e", fontWeight:700 }}>✅ {t.si_amountPaid}</span><span style={{ fontSize:14, fontWeight:800, color:"#22c55e" }}>{t.cur} {siFmt2(inv.amountPaid)}</span></div>}
          {/* Balance due — only for non-cash, non-delivery */}
          {!isInvCash&&!isInvDelivery&&<div style={{ ...dr, borderBottom:"none" }}><span style={{ fontSize:13, fontWeight:700, color:bal>0.01?"#ef4444":"#22c55e" }}>{t.si_balanceDue}</span><span style={{ fontSize:16, fontWeight:900, color:bal>0.01?"#ef4444":"#22c55e" }}>{t.cur} {siFmt2(Math.max(0,bal))}</span></div>}
          {isInvCash&&<div style={{ padding:"8px 0" }}><span style={{ fontSize:13, fontWeight:700, color:"#22c55e" }}>✅ {lang==="bn"?"নগদে সম্পূর্ণ পরিশোধিত":"Fully Paid (Cash)"}</span></div>}
        </div>

        {/* Actions */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <button onClick={()=>printSalesInvoice(inv,shop,lang,siShowCode,siColorPrint)} style={{ padding:"13px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#7c3aed,#6d28d9)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>{t.si_print}</button>
          {canEdit&&<button onClick={()=>siOpenEdit(inv)} style={{ padding:"12px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#1d4ed8,#2563eb)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>✏️ {t.si_edit}</button>}
          {canPay&&<button onClick={()=>siMarkPaid(inv)} style={{ padding:"12px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#15803d,#16a34a)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>{t.si_markPaid}</button>}
          {["confirmed","partial","draft"].includes(inv.status)&&<button onClick={()=>siCancel(inv)} style={{ padding:"11px", borderRadius:12, border:"1px solid #713f12", background:"transparent", color:"#f59e0b", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.si_cancelBtn}</button>}
          {inv.status==="draft"&&<button onClick={()=>siDelete(inv)} style={{ padding:"11px", borderRadius:12, border:"1px solid #450a0a", background:"transparent", color:"#ef4444", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.si_deleteBtn}</button>}
        </div>
      </div>
    );
  }

  // ══ FORM ══
  return (
    <div style={panel}>
      {pickerTarget!==null&&<PiProductPicker products={products} t={{ ...t, pi_fromMaster:t.si_fromMaster, pi_pmSearchPh:t.si_pmSearchPh, pi_noResults:t.si_noResults }} th={th} onSelect={p=>siSelectProduct(p)} onClose={()=>setPickerTarget(null)} />}
      {showCustPicker&&<SiCustomerPicker customers={customers} t={t} th={th} onSelect={siSelectCustomer} onClose={()=>setShowCustPicker(false)} />}
      {showQuickPicker&&<SiQuickAddPicker products={products} t={t} th={th} lang={lang} onAddLine={siAddProductLine} onClose={()=>setShowQuickPicker(false)} />}

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <button onClick={()=>setSiView("list")} style={{ background:"transparent", border:"none", color:"#22c55e", cursor:"pointer", fontSize:13, fontWeight:700, padding:0, fontFamily:"inherit" }}>{t.si_backToList}</button>
        <div style={{ fontSize:13, fontWeight:800, color:"#22c55e" }}>{editInvId?t.si_edit:t.si_new}</div>
      </div>

      {/* Invoice Type Toggle */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:12 }}>
        <div style={{ fontSize:11, color:"#22c55e", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginBottom:12 }}>📋 {t.si_invoiceType}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
          {[["regular","🧾",t.si_regular,t.si_regularDesc,"#22c55e"],["tax","🏛️",t.si_tax,t.si_taxDesc,"#1d4ed8"],["delivery","🚚",t.si_delivery,t.si_deliveryDesc,"#a855f7"]].map(([type,icon,label,desc,color])=>(
            <button key={type} onClick={()=>siUpd("invoiceType",type)} style={{ padding:"14px 10px", borderRadius:12, cursor:"pointer", fontFamily:"inherit", border:`2px solid ${siForm.invoiceType===type?color:th.borderMid}`, background:siForm.invoiceType===type?`${color}18`:"transparent", display:"flex", flexDirection:"column", alignItems:"center", gap:4, transition:"all 0.15s" }}>
              <span style={{ fontSize:28 }}>{icon}</span>
              <span style={{ fontSize:13, fontWeight:800, color:siForm.invoiceType===type?color:th.txtMuted }}>{label}</span>
              <span style={{ fontSize:10, color:th.txtFaint, textAlign:"center" }}>{desc}</span>
              {siForm.invoiceType===type&&<span style={{ fontSize:11, color:color }}>✅</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice No + Date + Customer */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:12 }}>
        <div style={secLbl}>📄 {t.si_invoiceNo} & {t.si_date}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
          <div>
            <div style={{ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>{t.si_invoiceNo}</div>
            <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(34,197,94,0.08)", border:"1px solid #22c55e", fontSize:16, fontWeight:900, color:"#22c55e", letterSpacing:1, fontFamily:"monospace" }}>{siInvoiceNo}</div>
          </div>
          <div>
            <div style={{ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>{t.si_date}</div>
            <input type="date" style={inp()} value={siForm.invoiceDate} onChange={e=>siUpd("invoiceDate",e.target.value)} />
          </div>
        </div>

        <div style={secLbl}>👤 {t.si_customer}</div>
        <button onClick={()=>setShowCustPicker(true)} style={{ width:"100%", padding:"11px 14px", borderRadius:8, border:`1px solid ${siForm.customerName?"#22c55e":th.borderMid}`, background:th.bgInp, color:siForm.customerName?"#22c55e":th.txtMuted, fontSize:14, cursor:"pointer", fontFamily:"inherit", textAlign:"left", marginBottom:8, fontWeight:siForm.customerName?700:400 }}>
          {siForm.customerName?`✅ ${siForm.customerName}`:t.si_selectCustomer}
        </button>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
          <input style={inp()} placeholder={t.si_customerManual} value={siForm.customerName} onChange={e=>siUpd("customerName",e.target.value)} />
          <input style={inp()} placeholder="📱 Mobile" value={siForm.customerMobile} onChange={e=>siUpd("customerMobile",e.target.value)} inputMode="tel" />
        </div>
        <div style={{ marginBottom: siForm.invoiceType==="tax"?8:0 }}>
          <input style={inp()} placeholder={`📍 ${lang==="bn"?"ঠিকানা":"Address"}`} value={siForm.customerAddress} onChange={e=>siUpd("customerAddress",e.target.value)} />
        </div>
        {siForm.invoiceType==="tax"&&(
          <input style={{ ...inp(), borderColor:"#f59e0b", fontFamily:"monospace", marginTop:8 }} placeholder={`TRN: 100XXXXXXXXX`} value={siForm.customerTrn} onChange={e=>siUpd("customerTrn",e.target.value)} />
        )}
      </div>

      {/* Items — Single Entry + Confirmed List */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:12 }}>
        <div style={{ ...secLbl, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span>📦 {t.si_items}</span>
          {siLines.length>0&&<span style={{ fontSize:12, fontWeight:800, color:"#22c55e", background:"rgba(34,197,94,0.1)", padding:"2px 10px", borderRadius:20 }}>{siLines.length}{lang==="bn"?"টি":""}</span>}
        </div>

        {/* ── Entry Row ── */}
        <div style={{ background:th.bgInp, borderRadius:12, padding:12, marginBottom:10, border:`1px dashed ${th.borderMid}` }}>
          {/* Product name + picker */}
          <div style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center" }}>
            <input
              ref={siNameRef}
              style={{ ...inp(), flex:1, fontSize:14, fontWeight:600 }}
              placeholder={t.si_itemName}
              value={siCurrent.name}
              onChange={e=>setSiCurrent(p=>({...p,name:e.target.value}))}
              onKeyDown={e=>e.key==="Enter"&&siAddCurrentItem()}
            />
            <button onClick={()=>setPickerTarget("current")} title={t.si_fromMaster}
              style={{ padding:"10px 14px", borderRadius:8, border:"1px solid #6366f1", background:"rgba(99,102,241,0.08)", color:"#818cf8", cursor:"pointer", fontSize:14, fontWeight:700, flexShrink:0 }}>
              📦
            </button>
          </div>
          {/* Code + Brand */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
            <input style={inp()} placeholder={t.si_code} value={siCurrent.code} onChange={e=>setSiCurrent(p=>({...p,code:e.target.value}))} />
            <input style={inp()} placeholder={t.si_brand} value={siCurrent.brand} onChange={e=>setSiCurrent(p=>({...p,brand:e.target.value}))} />
          </div>
          {/* Qty + Unit + Price + Disc + VAT + ADD — responsive layout */}
          {isDesktop ? (
            /* ── Desktop: single row ── */
            <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
              <div style={{ flex:"0 0 70px" }}>
                <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:3 }}>{t.si_qty}</div>
                <input style={{ ...inp(), textAlign:"center" }} inputMode="decimal" placeholder="1" value={siCurrent.qty}
                  onChange={e=>setSiCurrent(p=>({...p,qty:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&siAddCurrentItem()} />
              </div>
              <div style={{ flex:"0 0 70px" }}>
                <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:3 }}>{t.si_unit}</div>
                <select style={{ ...inp(), background:th.bgCard, padding:"10px 6px" }} value={siCurrent.unit} onChange={e=>setSiCurrent(p=>({...p,unit:e.target.value}))}>
                  {SI_UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:3 }}>{t.si_unitPrice}</div>
                <input style={inp()} inputMode="decimal" placeholder="0.00" value={siCurrent.unitPrice}
                  onChange={e=>setSiCurrent(p=>({...p,unitPrice:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&siAddCurrentItem()} />
              </div>
              {!formIsDelivery&&<div style={{ flex:"0 0 62px" }}>
                <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:3 }}>{t.si_discPerc}</div>
                <input style={inp()} inputMode="decimal" placeholder="0" value={siCurrent.discountPerc} onChange={e=>setSiCurrent(p=>({...p,discountPerc:e.target.value}))} />
              </div>}
              {formIsTax&&!formIsDelivery&&<div style={{ flex:"0 0 58px" }}>
                <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:3 }}>VAT%</div>
                <input style={inp()} inputMode="decimal" placeholder="5" value={siCurrent.vatPerc} onChange={e=>setSiCurrent(p=>({...p,vatPerc:e.target.value}))} />
              </div>}
              <button onClick={siAddCurrentItem}
                style={{ padding:"10px 18px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff", fontSize:14, fontWeight:800, cursor:"pointer", flexShrink:0, height:42, alignSelf:"flex-end" }}>
                {lang==="bn"?"যোগ →":"Add →"}
              </button>
            </div>
          ) : (
            /* ── Mobile: 2-row layout so Price gets full space ── */
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {/* Row 1: Qty + Unit */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div>
                  <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:3 }}>{t.si_qty}</div>
                  <input style={{ ...inp(), textAlign:"center" }} inputMode="decimal" placeholder="1" value={siCurrent.qty}
                    onChange={e=>setSiCurrent(p=>({...p,qty:e.target.value}))}
                    onKeyDown={e=>e.key==="Enter"&&siAddCurrentItem()} />
                </div>
                <div>
                  <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:3 }}>{t.si_unit}</div>
                  <select style={{ ...inp(), background:th.bgCard, padding:"10px 6px" }} value={siCurrent.unit} onChange={e=>setSiCurrent(p=>({...p,unit:e.target.value}))}>
                    {SI_UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              {/* Row 2: Price (big) + Disc% + VAT% */}
              <div style={{ display:"grid", gridTemplateColumns:formIsTax&&!formIsDelivery?"1fr 72px 62px":!formIsDelivery?"1fr 72px":"1fr", gap:8 }}>
                <div>
                  <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:3 }}>
                    {t.si_unitPrice} <span style={{ color:th.txtFaint, fontWeight:400 }}>({t.cur})</span>
                  </div>
                  <input style={{ ...inp(), fontSize:16, fontWeight:700 }} inputMode="decimal" placeholder="0.00" value={siCurrent.unitPrice}
                    onChange={e=>setSiCurrent(p=>({...p,unitPrice:e.target.value}))}
                    onKeyDown={e=>e.key==="Enter"&&siAddCurrentItem()} />
                </div>
                {!formIsDelivery&&<div>
                  <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:3 }}>{t.si_discPerc}</div>
                  <input style={inp()} inputMode="decimal" placeholder="0" value={siCurrent.discountPerc} onChange={e=>setSiCurrent(p=>({...p,discountPerc:e.target.value}))} />
                </div>}
                {formIsTax&&!formIsDelivery&&<div>
                  <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:3 }}>VAT%</div>
                  <input style={inp()} inputMode="decimal" placeholder="5" value={siCurrent.vatPerc} onChange={e=>setSiCurrent(p=>({...p,vatPerc:e.target.value}))} />
                </div>}
              </div>
              {/* Row 3: Add button full width */}
              <button onClick={siAddCurrentItem}
                style={{ width:"100%", padding:"13px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff", fontSize:15, fontWeight:800, cursor:"pointer" }}>
                {lang==="bn"?"✅ পণ্য যোগ করুন":"✅ Add Item"}
              </button>
            </div>
          )}
          {/* Live total preview */}
          {(siN2(siCurrent.qty)>0&&siN2(siCurrent.unitPrice)>0)&&(()=>{
            const { total } = siCalcLine(siCurrent, formIsTax&&!formIsDelivery);
            return <div style={{ marginTop:8, textAlign:"right", fontSize:13, fontWeight:700, color:formIsDelivery?"#a855f7":"#22c55e" }}>= {t.cur} {siFmt2(total)}</div>;
          })()}
        </div>

        {/* ── Confirmed Items List ── */}
        {siLines.length===0&&<div style={{ textAlign:"center", padding:"16px 10px", color:th.txtFaint, fontSize:13 }}>
          {lang==="bn"?"↑ উপরে পণ্য যোগ করুন":"↑ Add items above"}
        </div>}
        {siLines.map((item,i)=>{
          const { total } = siCalcLine(item, formIsTax&&!formIsDelivery);
          return (
            <div key={item.id} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"10px 12px", background:th.bgInp, borderRadius:10, marginBottom:6, border:`1px solid ${th.border}` }}>
              <span style={{ fontSize:12, fontWeight:800, color:formIsDelivery?"#a855f7":"#22c55e", flexShrink:0, width:20, paddingTop:2 }}>{i+1}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{item.name}</div>
                <div style={{ fontSize:11, color:th.txtMuted, marginTop:2, display:"flex", gap:8, flexWrap:"wrap" }}>
                  {item.code&&<span>📋 {item.code}</span>}
                  {item.brand&&<span>🏷️ {item.brand}</span>}
                  <span>{item.qty} {item.unit}</span>
                  {siN2(item.unitPrice)>0&&<span>{t.cur}{item.unitPrice}</span>}
                  {!formIsDelivery&&siN2(item.discountPerc)>0&&<span style={{ color:"#ef4444" }}>-{item.discountPerc}%</span>}
                  {formIsTax&&!formIsDelivery&&siN2(item.vatPerc)>0&&<span style={{ color:"#06b6d4" }}>VAT {item.vatPerc}%</span>}
                </div>
              </div>
              <span style={{ fontSize:14, fontWeight:800, color:formIsDelivery?"#a855f7":"#22c55e", flexShrink:0, paddingTop:2 }}>{t.cur}{siFmt2(total)}</span>
              {/* ✏️ Edit — loads item back into entry form */}
              <button title={lang==="bn"?"এডিট করুন":"Edit"} onClick={()=>{
                setSiCurrent({ productId:item.productId||null, name:item.name, code:item.code||"", brand:item.brand||"", qty:String(item.qty), unit:item.unit||"Pcs", unitPrice:String(item.unitPrice||""), discountPerc:String(item.discountPerc||"0"), vatPerc:String(item.vatPerc||"5") });
                setSiLines(p=>p.filter(x=>x.id!==item.id));
                setTimeout(()=>siNameRef.current?.focus(), 80);
              }} style={{ width:26, height:26, borderRadius:6, border:"1px solid #1d4ed8", background:"rgba(29,78,216,0.08)", color:"#60a5fa", cursor:"pointer", fontSize:12, flexShrink:0 }}>✏️</button>
              {/* ✕ Delete */}
              <button onClick={()=>setSiLines(p=>p.filter(x=>x.id!==item.id))}
                style={{ width:26, height:26, borderRadius:6, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:12, flexShrink:0 }}>✕</button>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
        <div style={{ fontSize:11, color:"#22c55e", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5, marginBottom:10 }}>📊 {t.si_summary}</div>
        {[[t.si_subtotal,siFmt2(totals.sub),th.txtPrimary],...(totals.disc>0?[[t.si_totalDiscount,`- ${siFmt2(totals.disc)}`,"#ef4444"]]:[]),...(totals.vat>0?[["VAT",`+ ${siFmt2(totals.vat)}`,"#06b6d4"]]:[])].map(([l,v,c],i)=>(
          <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${th.border}` }}><span style={{ fontSize:12, color:th.txtMuted }}>{l}</span><span style={{ fontSize:13, fontWeight:700, color:c }}>{t.cur} {v}</span></div>
        ))}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0 0" }}>
          <span style={{ fontSize:15, fontWeight:800 }}>{t.si_grandTotal}</span>
          <span style={{ fontSize:20, fontWeight:900, color:"#22c55e" }}>{t.cur} {siFmt2(totals.grand)}</span>
        </div>
      </div>

      {/* Payment — hidden for delivery */}
      {!formIsDelivery&&<div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:12 }}>
        <div style={secLbl}>💳 {t.si_payment}</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, marginBottom:12 }}>
          {Object.entries(SI_PAY).map(([key,pm])=>(
            <button key={key} onClick={()=>{
              // Switching away from cash: clear auto-filled paid amount
              if (siForm.paymentMethod==="cash" && key!=="cash") {
                setSiForm(p=>({...p, paymentMethod:key, amountPaid:""}));
              } else {
                siUpd("paymentMethod",key);
              }
            }} style={{ padding:"10px 8px", borderRadius:10, cursor:"pointer", fontFamily:"inherit", border:`1.5px solid ${siForm.paymentMethod===key?"#22c55e":th.borderMid}`, background:siForm.paymentMethod===key?"rgba(34,197,94,0.12)":"transparent", color:siForm.paymentMethod===key?"#22c55e":th.txtMuted, fontSize:12, fontWeight:700, display:"flex", alignItems:"center", gap:6, justifyContent:"center" }}>
              <span style={{ fontSize:16 }}>{pm.icon}</span><span>{pm[lang]}</span>
              {siForm.paymentMethod===key&&<span style={{ marginLeft:"auto", fontSize:11 }}>✅</span>}
            </button>
          ))}
        </div>

        {/* Cash: auto-paid badge | Credit/Bank/Cheque: amount paid input */}
        {formIsCash ? (
          <div style={{ padding:"12px 14px", borderRadius:10, background:"rgba(34,197,94,0.08)", border:"1px solid #22c55e", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#22c55e" }}>✅ {lang==="bn"?"নগদে সম্পূর্ণ পরিশোধিত":"Fully Paid (Cash)"}</span>
            <span style={{ fontSize:18, fontWeight:900, color:"#22c55e" }}>{t.cur} {siFmt2(totals.grand)}</span>
          </div>
        ) : (
          <>
            <div style={{ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>{t.si_amountPaid}</div>
            <input style={inp()} inputMode="decimal" placeholder="0.00" value={siForm.amountPaid} onChange={e=>siUpd("amountPaid",e.target.value)} />
            {totals.grand>0&&<div style={{ marginTop:6 }}><button onClick={()=>siUpd("amountPaid",siFmt2(totals.grand))} style={{ padding:"5px 12px", borderRadius:8, border:"1px solid #22c55e", background:"rgba(34,197,94,0.08)", color:"#22c55e", fontSize:11, fontWeight:700, cursor:"pointer" }}>{t.si_fullPay} ({t.cur} {siFmt2(totals.grand)})</button></div>}
            {totals.grand>0&&<div style={{ marginTop:10, padding:"10px 14px", borderRadius:10, background:balance>0.01?"rgba(239,68,68,0.08)":"rgba(34,197,94,0.08)", border:`1px solid ${balance>0.01?"#ef4444":"#22c55e"}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:12, fontWeight:700, color:balance>0.01?"#ef4444":"#22c55e" }}>{t.si_balanceDue}</span>
              <span style={{ fontSize:18, fontWeight:900, color:balance>0.01?"#ef4444":"#22c55e" }}>{t.cur} {siFmt2(balance)}</span>
            </div>}
          </>
        )}
      </div>}

      {/* Delivery Note */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:12 }}>
        <div style={secLbl}>🚚 {t.si_deliverySection}</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <div>
            <div style={{ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>{t.si_deliveryNote}</div>
            <input style={inp()} placeholder="DN-0001" value={siForm.deliveryNoteNo} onChange={e=>siUpd("deliveryNoteNo",e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>{t.si_vehicleNo}</div>
            <input style={inp()} placeholder="ABC-1234" value={siForm.vehicleNo} onChange={e=>siUpd("vehicleNo",e.target.value)} />
          </div>
        </div>
      </div>

      {/* Note */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:16 }}>
        <div style={secLbl}>📝 {t.si_note}</div>
        <AutoTA style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:13, outline:"none", resize:"none", overflow:"hidden", minHeight:60, boxSizing:"border-box", fontFamily:"inherit" }} placeholder={t.si_notePh} value={siForm.note} onChange={e=>siUpd("note",e.target.value)} />
      </div>

      {/* Actions */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <button onClick={siConfirm} disabled={siSaving} style={{ padding:"14px", borderRadius:12, border:"none", background:siSaving?"#14532d":"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff", fontSize:15, fontWeight:800, cursor:siSaving?"not-allowed":"pointer" }}>{siSaving?"...":t.si_confirm}</button>
        <button onClick={siSaveDraft} disabled={siSaving} style={{ padding:"12px", borderRadius:12, border:`1.5px solid ${th.borderMid}`, background:"transparent", color:th.txtMuted, fontSize:14, fontWeight:700, cursor:"pointer" }}>{t.si_saveDraft}</button>
        <button onClick={()=>setSiView("list")} style={{ padding:"11px", borderRadius:12, border:"1px solid #450a0a", background:"transparent", color:"#ef4444", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.si_cancelForm}</button>
      </div>
    </div>
  );
}

// ─── SHOP INFO SETTINGS ──────────────────────────────────────
function ShopInfoSettings({ localShop, shopId, th, s, lang, toast }) {
  const [shopEdit, setShopEdit] = useState({
    companyName: localShop.companyName||"",
    trnNumber:   localShop.trnNumber||"",
    vatNumber:   localShop.vatNumber||"",
    mobile:      localShop.mobile||"",
    email:       localShop.email||"",
    area:        localShop.area||"",
  });
  const [shopSaving, setShopSaving] = useState(false);

  const saveShop = async () => {
    setShopSaving(true);
    try {
      await updateDoc(doc(db,"shops",shopId),{
        companyName: shopEdit.companyName.trim(),
        trnNumber:   shopEdit.trnNumber.trim(),
        vatNumber:   shopEdit.vatNumber.trim(),
        mobile:      shopEdit.mobile.trim(),
        email:       shopEdit.email.trim(),
        area:        shopEdit.area.trim(),
      });
      toast(lang==="bn"?"✅ দোকানের তথ্য আপডেট হয়েছে!":"✅ Shop info updated!");
    } catch(e) { toast(e.message,"err"); }
    finally { setShopSaving(false); }
  };

  const sinp = { padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" };
  const slbl = { fontSize:10, color:th.txtMuted, fontWeight:700, textTransform:"uppercase", letterSpacing:0.4, marginBottom:4, display:"block" };

  return (
    <div style={s.card}>
      <div style={s.settingsLbl}>{lang==="bn"?"🏢 দোকানের তথ্য":"🏢 Shop Info"}</div>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        <div>
          <span style={slbl}>{lang==="bn"?"দোকানের নাম":"Shop Name"}</span>
          <input style={sinp} value={shopEdit.companyName} onChange={e=>setShopEdit(p=>({...p,companyName:e.target.value}))} />
        </div>
        <div>
          <span style={slbl}>{lang==="bn"?"TRN নম্বর (Tax Registration)":"TRN Number (Tax Registration)"}</span>
          <input style={{ ...sinp, borderColor:shopEdit.trnNumber?"#f59e0b":th.borderMid, fontFamily:"monospace" }} placeholder="100XXXXXXXXX" value={shopEdit.trnNumber} onChange={e=>setShopEdit(p=>({...p,trnNumber:e.target.value}))} />
          {shopEdit.trnNumber&&<div style={{ fontSize:10, color:"#f59e0b", marginTop:4, fontWeight:700 }}>✅ {lang==="bn"?"Tax Invoice এ দেখাবে":"Shows in Tax Invoice"}</div>}
        </div>
        <div>
          <span style={slbl}>{lang==="bn"?"VAT নম্বর":"VAT Number"}</span>
          <input style={{ ...sinp, fontFamily:"monospace" }} placeholder="VAT Number" value={shopEdit.vatNumber} onChange={e=>setShopEdit(p=>({...p,vatNumber:e.target.value}))} />
        </div>
        <div>
          <span style={slbl}>{lang==="bn"?"মোবাইল":"Mobile"}</span>
          <input style={sinp} inputMode="tel" value={shopEdit.mobile} onChange={e=>setShopEdit(p=>({...p,mobile:e.target.value}))} />
        </div>
        <div>
          <span style={slbl}>{lang==="bn"?"ইমেইল":"Email"}</span>
          <input style={sinp} inputMode="email" value={shopEdit.email} onChange={e=>setShopEdit(p=>({...p,email:e.target.value}))} />
        </div>
        <div>
          <span style={slbl}>{lang==="bn"?"এলাকা / শহর":"Area / City"}</span>
          <input style={sinp} value={shopEdit.area} onChange={e=>setShopEdit(p=>({...p,area:e.target.value}))} />
        </div>
        <div style={{ paddingTop:8, borderTop:`1px solid ${th.border}`, fontSize:12, color:th.txtMuted }}>
          👤 {lang==="bn"?"মালিক":"Owner"}: {localShop.ownerName}
        </div>
        <button onClick={saveShop} disabled={shopSaving} style={{ padding:"12px", borderRadius:10, border:"none", background:shopSaving?"#1e3a5f":"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:14, fontWeight:700, cursor:shopSaving?"not-allowed":"pointer" }}>
          {shopSaving?"...":(lang==="bn"?"✅ সেভ করুন":"✅ Save")}
        </button>
      </div>
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

// ─── CHEQUE PRINTER TAB ───────────────────────────────────────────────────────
function ChequePrinterTab({ t, lang, th, s, isDesktop, shopName, shopAccount, shopIban }) {
  const [bank, setBank]         = useState(UAE_BANKS[0]);
  const [payee, setPayee]       = useState("");
  const [amount, setAmount]     = useState("");
  const [words, setWords]       = useState("");
  const [wordsManual, setWordsManual] = useState(false);
  const [dateVal, setDateVal]   = useState(() => new Date().toISOString().split("T")[0]);
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
  const [saveDone, setSaveDone] = useState(false);

  const resetAll = () => {
    setPayeeX(0); setPayeeY(0);
    setWordsX(0); setWordsY(0);
    setAmtX(0);   setAmtY(0);
    setDateX(0);  setDateY(0);
    setMmOff(0);  setYyOff(0);
    setPageW(196); setPageH(99);
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`chq_off2_${bank.id}`);
      if (saved) {
        const o = JSON.parse(saved);
        setPayeeX(o.px||0); setPayeeY(o.py||0);
        setWordsX(o.wx||0); setWordsY(o.wy||0);
        setAmtX(o.ax||0);   setAmtY(o.ay||0);
        setDateX(o.dx||0);  setDateY(o.dy||0);
        setMmOff(o.mo||0);  setYyOff(o.yo||0);
        setPageW(o.w||196); setPageH(o.h||99);
      } else { resetAll(); }
    } catch(e) { resetAll(); }
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
      }));
      setSaveDone(true);
      setTimeout(() => setSaveDone(false), 2500);
    } catch(e) { alert("Save failed — localStorage may be unavailable"); }
  };

  // Helpers — step 1 mm per click
  const adj = (setter) => (d) => setter(v => +((v + d).toFixed(1)));

  // Auto-fill amount in words from numeric amount
  const handleAmountChange = (v) => {
    setAmount(v);
    if (!wordsManual) {
      const n = parseFloat(v);
      setWords(n > 0 ? amountToWordsAED(n) : "");
    }
  };
  const handleWordsChange = (v) => { setWords(v); setWordsManual(true); };
  const handleAmountBlur  = ()  => { setWordsManual(false); };

  // Format number as AED amount
  const fmtAmount = (v) => {
    const n = parseFloat(v);
    if (!n) return "";
    return n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    textTransform:"uppercase", letterSpacing:0.5,
    marginBottom:12, marginTop:4,
  };

  // Helper: single date digit box for preview
  const DateBox = ({ char }) => (
    <div style={{
      width:21, height:20, border:"1px solid #8b7355",
      background:"rgba(255,255,255,0.85)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:11, fontWeight:800, fontFamily:"'Courier New',monospace",
      color:"#1a1a1a",
    }}>
      {char}
    </div>
  );

  // Preview: date boxes — DD  MM  YYYY with space gaps only (no slash/dot)
  const previewDateBoxes = () => {
    const d0 = dd?.[0]||"D", d1 = dd?.[1]||"D";
    const m0 = mm?.[0]||"M", m1 = mm?.[1]||"M";
    const y0 = yyyy?.[0]||"Y", y1 = yyyy?.[1]||"Y",
          y2 = yyyy?.[2]||"Y", y3 = yyyy?.[3]||"Y";
    return (
      <div style={{ display:"flex", gap:2, alignItems:"center" }}>
        <DateBox char={d0}/><DateBox char={d1}/>
        <div style={{ width:8 }} />
        <DateBox char={m0}/><DateBox char={m1}/>
        <div style={{ width:8 }} />
        <DateBox char={y0}/><DateBox char={y1}/><DateBox char={y2}/><DateBox char={y3}/>
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
                <div style={{ fontSize:12, fontWeight:700, color:th.accent, textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>
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

          {/* ── Print + Clear buttons ── */}
          <button
            onClick={() => window.print()}
            style={{ ...s.sendBtn, marginBottom:10, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
          >
            🖨️ {lang==="bn" ? "চেক প্রিন্ট করুন" : "Print Cheque"}
          </button>
          <button
            onClick={() => {
              setPayee(""); setAmount(""); setWords("");
              setDateVal(new Date().toISOString().split("T")[0]);
              setWordsManual(false);
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
          <div style={{ fontSize:11, fontWeight:700, color:th.txtMuted, textTransform:"uppercase", letterSpacing:0.5, marginBottom:10 }}>
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
                      <div style={{ fontSize:14, fontWeight:800, fontFamily:"'Courier New',monospace", color:"#1a1a1a", letterSpacing:0.5 }}>
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
            <div style={{ fontSize:11, fontWeight:700, color:th.txtSecondary, marginBottom:6, textTransform:"uppercase", letterSpacing:0.5 }}>
              ℹ️ {lang==="bn" ? "প্রিন্ট নির্দেশনা" : "Print Instructions"}
            </div>
            <div>📐 {lang==="bn" ? "UAE চেক সাইজ: 210mm × 90mm" : "UAE standard cheque: 210mm × 90mm"}</div>
            <div>🖨️ {lang==="bn" ? "প্রিন্টার সেটিং: Landscape, Margins → None, Scale → 100%" : "Printer: Landscape · Margins: None · Scale: 100%"}</div>
            <div>📋 {lang==="bn" ? "প্রতিটি ব্যাংকের চেকে field position একটু আলাদা হতে পারে" : "Field positions may vary slightly per bank"}</div>
            <div>✅ {lang==="bn" ? "আসল চেকে দেওয়ার আগে সাদা কাগজে মিলিয়ে নিন" : "Verify alignment on plain paper before printing on real cheque"}</div>
          </div>
        </div>
      </div>

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

        {/* Date — DD (each digit lands in its own pre-printed box on the cheque) */}
        {dd && (
          <div style={{
            position:"absolute",
            top:`${P.dateTop}mm`,
            left:`${P.dateDDLeft}mm`,
            fontSize:"11.5pt", fontWeight:"700",
            fontFamily:"'Courier New', Courier, monospace",
            color:"#000",
            letterSpacing:"0.55em",
            whiteSpace:"nowrap",
          }}>
            {dd}
          </div>
        )}

        {/* Date — MM */}
        {mm && (
          <div style={{
            position:"absolute",
            top:`${P.dateTop}mm`,
            left:`${P.dateMMLeft}mm`,
            fontSize:"11.5pt", fontWeight:"700",
            fontFamily:"'Courier New', Courier, monospace",
            color:"#000",
            letterSpacing:"0.55em",
            whiteSpace:"nowrap",
          }}>
            {mm}
          </div>
        )}

        {/* Date — YYYY */}
        {yyyy && (
          <div style={{
            position:"absolute",
            top:`${P.dateTop}mm`,
            left:`${P.dateYYLeft}mm`,
            fontSize:"11.5pt", fontWeight:"700",
            fontFamily:"'Courier New', Courier, monospace",
            color:"#000",
            letterSpacing:"0.55em",
            whiteSpace:"nowrap",
          }}>
            {yyyy}
          </div>
        )}
      </div>

      {/* ── PRINT STYLES ── */}
      <style>{`
        /* Screen: hide the print layer completely */
        #cheque-print-area {
          display: none;
        }

        @media print {
          /* 1. visibility:hidden hides all content but lets children
                override with visibility:visible — unlike display:none
                which also hides all descendants and can't be overridden */
          body {
            visibility: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* 2. Show ONLY the cheque print area and its children */
          #cheque-print-area,
          #cheque-print-area * {
            visibility: visible !important;
          }

          /* 3. Position the print area at the top-left of the page */
          #cheque-print-area {
            display: block !important;
            position: fixed !important;
            top:    0 !important;
            left:   0 !important;
            width:  ${pageW}mm !important;
            height: ${pageH}mm !important;
            background: transparent !important;
            margin:  0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          /* 4. Each child text field is absolutely positioned in mm */
          #cheque-print-area > div {
            position: absolute !important;
          }

          /* 5. Page = physical cheque size from user measurement */
          @page {
            size: ${pageW}mm ${pageH}mm;
            margin: 0mm;
          }
        }
      `}</style>
    </div>
  );
}
// ─── MAIN APP ─────────────────────────────────────────────────
function MainApp({ t, lang, setLang, user, profile, shop:shopProp, toast, s, th, theme, setTheme }) {
  const isOwner = profile.role==="owner";
  const isSalesman = !isOwner;
  const shopId  = profile.shopId;
  const perms   = profile.permissions||DEFAULT_PERMISSIONS;
  const can     = (key) => isOwner||perms[key]===true;
  const isOrderManager = !isOwner&&(can("setStatus")||can("setPrices")||can("markDelivery")||can("deleteOrder"));

  const [orders,setOrders]=useState([]);
  const [cos,setCos]=useState([]);
  const [team,setTeam]=useState([]);
  const [inviteCodes,setInviteCodes]=useState([]);
  const [products,setProducts]=useState([]);
  const [syncState,setSyncState]=useState("connecting");
  const [localShop,setLocalShop]=useState(shopProp);

  const [tab,setTab]=useState(isOwner?"owner":"shop");

  // ── INVOICE STATE ──
  // items = confirmed invoice list (locked rows)
  // currentItem = the form being filled right now
  const [items,setItems]=useState([]);
  const [currentItem,setCurrentItem]=useState(newItem());
  const [note,setNote]=useState("");
  const [editingOrderId,setEditingOrderId]=useState(null);
  const nameRef = useRef(null);

  const [selOrder,setSelOrder]=useState(null);

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

  const [showChequePrinter,setShowChequePrinter]=useState(false);
  const [newPosition,setNewPosition]=useState("");
  const [showAddPos,setShowAddPos]=useState(false);
  const [settingsPage,setSettingsPage]=useState(null); // null = menu list

  useEffect(() => {
    if (!shopId) return;
    return onSnapshot(doc(db,"shops",shopId),
      snap => { if (snap.exists()) setLocalShop({id:snap.id,...snap.data()}); },
      err  => console.error(err)
    );
  },[shopId]);

  useEffect(() => {
    const q = (isOwner||isOrderManager)
      ? query(collection(db,"orders"), where("shopId","==",shopId), orderBy("createdAt","desc"))
      : query(collection(db,"orders"), where("shopId","==",shopId), where("createdBy","==",user.uid), orderBy("createdAt","desc"));
    return onSnapshot(q,
      snap => { setOrders(snap.docs.map(d=>({...d.data(),id:d.id,createdAt:d.data().createdAt?.toDate?.()||new Date()}))); setSyncState("connected"); },
      err  => { console.error(err); setSyncState("offline"); }
    );
  },[shopId,isOwner,isOrderManager]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db,"companies"), where("shopId","==",shopId), orderBy("name")),
      snap => setCos(snap.docs.map(d=>({...d.data(),id:d.id}))),
      err  => console.error(err)
    );
  },[shopId]);
  
  useEffect(() => {
    if (!shopId) return;
    let unsub2 = null;
    // orderBy("vendorName") needs Firestore index — fallback if missing
    const unsub1 = onSnapshot(
      query(collection(db,"vendors"), where("shopId","==",shopId), orderBy("vendorName")),
      (snap) => {
        setVendors(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      },
      () => {
        // fallback: no orderBy, sort client-side
        unsub2 = onSnapshot(
          query(collection(db,"vendors"), where("shopId","==",shopId)),
          (snap) => {
            const docs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
            docs.sort((a,b) => (a.vendorName||"").localeCompare(b.vendorName||""));
            setVendors(docs);
          },
          (err) => console.error("vendors listener error:", err)
        );
      }
    );
    return () => { unsub1(); unsub2 && unsub2(); };
  }, [shopId]);

  // ── Customers real-time listener ──
  useEffect(() => {
    if (!shopId) return;
    let unsub2 = null;
    const unsub1 = onSnapshot(
      query(collection(db,"customers"), where("shopId","==",shopId), orderBy("customerName")),
      (snap) => setCustomers(snap.docs.map(d=>({ id:d.id, ...d.data() }))),
      () => {
        unsub2 = onSnapshot(
          query(collection(db,"customers"), where("shopId","==",shopId)),
          (snap) => {
            const docs = snap.docs.map(d=>({ id:d.id, ...d.data() }));
            docs.sort((a,b)=>(a.customerName||"").localeCompare(b.customerName||""));
            setCustomers(docs);
          },
          (err) => console.error("customers listener:", err)
        );
      }
    );
    return () => { unsub1(); unsub2 && unsub2(); };
  }, [shopId]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db,"users"), where("shopId","==",shopId)),
      snap => setTeam(snap.docs.map(d=>({...d.data(),id:d.id}))),
      err  => console.error(err)
    );
  },[shopId]);

  // ── Invite codes listener (owner only) ──
  useEffect(() => {
    if (!isOwner) return;
    return onSnapshot(
      query(collection(db,"inviteCodes"), where("shopId","==",shopId)),
      snap => setInviteCodes(snap.docs.map(d=>({...d.data(), code:d.id}))),
      err  => console.error(err)
    );
  },[shopId, isOwner]);

  // ── Products — one-time fetch (not real-time, too heavy for 3000+ items) ──
  const [productsLoading,setProductsLoading]=useState(false);
  const fetchProducts = async () => {
    setProductsLoading(true);
    try {
      const snap = await getDocs(query(collection(db,"products"), where("shopId","==",shopId), orderBy("name")));
      setProducts(snap.docs.map(d=>({...d.data(),id:d.id})));
    } catch(e) { console.error(e); }
    finally { setProductsLoading(false); }
  };
  useEffect(() => { fetchProducts(); },[shopId]);

  const hErr  = (e) => { console.error(e); toast(e.message||String(e),"err"); };

  // ── Generate a new single-use invite code ──
  const generateNewCode = async () => {
    try {
      const code = generateInviteCode();
      await setDoc(doc(db,"inviteCodes",code),{
        shopId, used:false, createdAt:serverTimestamp(),
      });
      toast(lang==="bn"?"✅ নতুন Invite Code তৈরি হয়েছে!":"✅ New invite code created!");
    } catch(e) { hErr(e); }
  };

  const deleteInviteCode = async (code) => {
    try { await deleteDoc(doc(db,"inviteCodes",code)); }
    catch(e) { hErr(e); }
  };

  // ── PRODUCT MASTER STATE ──
  const emptyPmForm = {
    name:"", code:"", barcode:"", ean:"", moreBarcodes:[],
    brand:"", category:"", subcategory:"",
    salesVat:"0", purchaseVat:"0",
    landingCost:"", marginPerc:"", marginAmount:"",
    vatExclusive:"", vatInclusive:"", vatOnMrp:false, mrp:"",
    openingStock:"", unit:"Pcs", description:""
  };
  const [pmSearch,setPmSearch]=useState("");
  const [pmCatFilter,setPmCatFilter]=useState("ALL");
  const [pmShowAdd,setPmShowAdd]=useState(false);
  const [pmEditId,setPmEditId]=useState(null);
  const [pmForm,setPmForm]=useState(emptyPmForm);
  const [pmDetailId,setPmDetailId]=useState(null); // full detail modal
  const [showProductPicker,setShowProductPicker]=useState(false);
  const [productPickerQ,setProductPickerQ]=useState("");

  const pmReset = () => setPmForm(emptyPmForm);
  const pmDetail = products.find(p=>p.id===pmDetailId)||null;

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
          ma = lc>0 && mp>0 ? parseFloat((lc*mp/100).toFixed(4)) : ma;
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
          // VE changed manually → recalc MA and MP
          ma = parseFloat((ve-lc).toFixed(4));
          mp = lc>0 ? parseFloat((ma/lc*100).toFixed(4)) : 0;
          next.marginAmount = ma ? String(ma) : "";
          next.marginPerc = mp ? String(mp) : "";
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

      // vatInclusive manually typed
      if (field==="vatInclusive") {
        // keep as typed, don't override
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

  const addProduct = async () => {
    if (!pmForm.name.trim()) return toast(t.e3,"err");
    try {
      await addDoc(collection(db,"products"),{ shopId, ...pmForm, name:pmForm.name.trim(), createdAt:serverTimestamp() });
      pmReset(); setPmShowAdd(false); toast(t.pmAdded);
      await fetchProducts();
    } catch(e) { hErr(e); }
  };

  const editProduct = async (id) => {
    if (!pmForm.name.trim()) return toast(t.e3,"err");
    try {
      await updateDoc(doc(db,"products",id),{ ...pmForm, name:pmForm.name.trim() });
      pmReset(); setPmEditId(null); setPmDetailId(null); toast(t.pmUpdated);
      await fetchProducts();
    } catch(e) { hErr(e); }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm(lang==="bn"?"এই পণ্যটি মুছে ফেলবেন?":"Delete this product?")) return;
    try {
      await deleteDoc(doc(db,"products",id));
      setProducts(p=>p.filter(x=>x.id!==id));
      setPmDetailId(null); toast(t.pmDeleted,"err");
    } catch(e) { hErr(e); }
  };

  const selectProductToOrder = (prod) => {
    setCurrentItem(p=>({...p, name:prod.name, code:prod.code||prod.barcode||"", brand:prod.brand||"", unit:prod.unit||"Pcs"}));
    setShowProductPicker(false); setProductPickerQ("");
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
        await updateDoc(doc(db,"orders",editingOrderId),{
          items:valid.map(it=>({name:it.name,code:it.code||"",brand:it.brand||"",qty:it.qty||"",unit:it.unit||"Pcs",price:"",status:"pending",co:null})),
          note:note||"",
        });
        setEditingOrderId(null); setItems([]); setCurrentItem(newItem()); setNote("");
        toast(lang==="bn"?"✅ অর্ডার আপডেট হয়েছে!":"✅ Order updated!");
      } catch(e){ hErr(e); }
      return;
    }
    try {
      let serialNo = null;
      let orderNo = "";
      try {
        serialNo = await runTransaction(db, async (tx) => {
          const shopRef = doc(db, "shops", shopId);
          const shopSnap = await tx.get(shopRef);
          const current = Number(shopSnap.data()?.lastOrderSerial || 0);
          const next = current + 1;
          tx.update(shopRef, { lastOrderSerial: next });
          return next;
        });
        orderNo = `${ORDER_PREFIX}${String(serialNo).padStart(4, "0")}`;
      } catch (serialErr) {
        console.warn("Serial transaction failed, using fallback order number", serialErr);
        const recentSnap = await getDocs(query(
          collection(db, "orders"),
          where("shopId", "==", shopId),
          orderBy("createdAt", "desc"),
          limit(25),
        ));
        const maxSerial = recentSnap.docs.reduce((mx, d) => {
          const data = d.data() || {};
          if (Number.isFinite(data.serialNo)) return Math.max(mx, data.serialNo);
          const m = String(data.orderNo || "").match(/^S4-?(\d+)$/);
          return m ? Math.max(mx, Number(m[1])) : mx;
        }, 0);
        serialNo = maxSerial + 1;
        orderNo = `${ORDER_PREFIX}${String(serialNo).padStart(4, "0")}`;
      }
      await addDoc(collection(db,"orders"),{
        shopId, createdBy:user.uid, createdByName:profile.personName,
        serialNo, orderNo,
        items:valid.map(it=>({name:it.name,code:it.code||"",brand:it.brand||"",qty:it.qty||"",unit:it.unit||"Pcs",price:"",status:"pending",co:null})),
        note:note||"", createdAt:serverTimestamp(), overall:"pending", read:false,
      });
      setItems([]); setCurrentItem(newItem()); setNote(""); toast(t.n1);
    } catch(e) { hErr(e); }
  };

  const savePrice = async (oId, iIdx, directVal) => {
    if (!isOwner&&!can("setPrices")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    const current = order.items[iIdx];
    if (!current || current.status==="delivered" || current.status==="cancelled") return;
    if (!["pending","order_confirmed","out_of_stock"].includes(current.status)) return;
    const upd = order.items.map((it,x)=>x===iIdx?{...it,price:String(directVal??"")}:it);
    try { await updateDoc(doc(db,"orders",oId),{items:upd}); toast(t.n2); } catch(e) { hErr(e); }
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
    try { await updateDoc(doc(db,"orders",oId),{overall:newOverall,items:upd}); } catch(e) { hErr(e); }
  };

  const deliverItem = async (oId,iIdx) => {
    if (!isSalesman&&!can("markDelivery")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    if (isSalesman&&!can("markDelivery")&&order.createdBy!==user.uid) return;
    const target = order.items[iIdx];
    if (!target || target.status!=="out_for_branch") return;
    const upd = order.items.map((it,x)=>x===iIdx?{...it,status:"delivered"}:it);
    const activeItems = upd.filter(it=>it.status!=="cancelled" && it.status!=="out_of_stock");
    const allDelivered = activeItems.length>0 && activeItems.every(it=>it.status==="delivered");
    const overall = allDelivered ? "delivered" : order.overall;
    try { await updateDoc(doc(db,"orders",oId),{overall,items:upd}); toast(t.n3); } catch(e) { hErr(e); }
  };

  const delOrder = async (oId) => {
    if (!can("deleteOrder")) return;
    if (!window.confirm(t.delConfirm)) return;
    try {
      await deleteDoc(doc(db,"orders",oId));
      if (selOrder===oId) setSelOrder(null); toast(t.n7,"err");
    } catch(e) { hErr(e); }
  };

  const cancelOrder = async (oId) => {
    if (!window.confirm(lang==="bn"?"এই অর্ডারটি বাতিল করবেন?":"Cancel this order?")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    const cancelledItems = order.items.map(it=>({...it, status:"cancelled"}));
    try {
      await updateDoc(doc(db,"orders",oId),{ overall:"cancelled", items:cancelledItems });
      toast(t.n8,"err");
    } catch(e) { hErr(e); }
  };

  const setCo = async (oId,iIdx,coId) => {
    if (!isOwner&&!can("manageCompanies")) return;
    const order = orders.find(o=>o.id===oId); if (!order) return;
    const current = order.items[iIdx];
    if (!current || current.status==="delivered" || current.status==="cancelled") return;
    if (!["pending","order_confirmed","out_of_stock"].includes(current.status)) return;
    const upd = order.items.map((it,x)=>x===iIdx?{...it,co:coId||null}:it);
    try { await updateDoc(doc(db,"orders",oId),{items:upd}); } catch(e) { hErr(e); }
  };

  const markRead = async (oId) => {
    const order = orders.find(o=>o.id===oId); if (!order||order.read) return;
    try { await updateDoc(doc(db,"orders",oId),{read:true}); } catch(e) { console.error(e); }
  };

  const startEdit = (c) => { setEditId(c.id); setEditNm(c.name); setEditPh(c.phone||""); };
  const cancelEdit = () => { setEditId(null); setEditNm(""); setEditPh(""); };
  const saveEdit = async (id) => {
    if (!editNm.trim()) return toast(t.e2,"err");
    try { await updateDoc(doc(db,"companies",id),{name:editNm.trim(),phone:editPh.trim()}); cancelEdit(); toast(t.n5); } catch(e) { hErr(e); }
  };
  const delCo = async (id) => {
    try { await deleteDoc(doc(db,"companies",id)); toast(t.n6,"err"); } catch(e) { hErr(e); }
  };
  const addCo = async () => {
    if (!newNm.trim()) return toast(t.e3,"err");
    try {
      await addDoc(collection(db,"companies"),{shopId,name:newNm.trim(),phone:newPh.trim()});
      setNewNm(""); setNewPh(""); setShowAdd(false); toast(t.n4);
    } catch(e) { hErr(e); }
  };


  const saveVendor = async (editId=null) => {
    if (!vendorForm.vendorName.trim()) return toast(t.vm_errName||"Enter vendor name!","err");
    if (!vendorForm.mobileNumber.trim()) return toast(t.vm_errMobile||"Enter mobile number!","err");
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
      updatedBy:user.uid, updatedAt:serverTimestamp(),
    };
    try {
      if (editId) {
        await updateDoc(doc(db,"vendors",editId),payload);
        toast(t.vm_updated||"Vendor updated!");
      } else {
        await addDoc(collection(db,"vendors"),{...payload,createdBy:user.uid,createdAt:serverTimestamp()});
        toast(t.vm_saved||"Vendor saved!");
      }
      setVendorForm(emptyVendor);
      setShowVendorModal(false);
    } catch(e) { console.error(e); toast(e.message,"err"); }
  };
  

  const addPosition = async () => {
    if (!newPosition.trim()) return;
    const positions=[...(localShop?.positions||[]),newPosition.trim()];
    try { await updateDoc(doc(db,"shops",shopId),{positions}); setNewPosition(""); setShowAddPos(false); toast(t.positionAdded); }
    catch(e) { hErr(e); }
  };
  const deletePosition = async (pos) => {
    const positions=(localShop?.positions||[]).filter(p=>p!==pos);
    try { await updateDoc(doc(db,"shops",shopId),{positions}); toast(t.positionDeleted,"err"); }
    catch(e) { hErr(e); }
  };

  const savePermissions = async (memberId, newPerms) => {
    try { await updateDoc(doc(db,"users",memberId),{permissions:newPerms}); toast(t.permSaved); }
    catch(e) { hErr(e); }
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

  const handleLogout = async () => {
    if (!window.confirm(t.confirmLogout)) return;
    try { await signOut(auth); } catch(e) { hErr(e); }
  };

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(localShop.inviteCode); setCopyState(true); setTimeout(()=>setCopyState(false),2000); }
    catch { toast("Copy failed","err"); }
  };

  const unread = isOwner || isOrderManager
    ? orders.filter(o=>o.overall==="pending"&&!o.read).length
    : orders.filter(o=>o.items?.some(it=>it.status==="out_for_branch")).length;

  // ── SEARCH FILTER ──
  const filterOrders = (list) => {
    const q = searchQ.trim();
    if (!q) return list;
    return list.filter(o => {
      const noMatch = nsmatch(getOrderDisplayNo(o), q);
      const itemMatch = o.items?.some(it =>
        nsmatch([it.name,it.brand,it.code].filter(Boolean).join(" "), q)
      );
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
      return noMatch || itemMatch || dateMatch;
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

  const visibleTabs = isOwner
    ? [["owner",t.tabOwner],["companies",t.tabCompany],["products",t.tabProducts],["purchase",t.tabPurchase],["sales",t.tabSales],["vendors",t.tabVendor],["customers",t.tabCustomer],["cheque",t.tabCheque],["settings",t.tabSettings]]
    : [
        ["shop",t.tabShop],
        ...(can("manageCompanies")?[["companies",t.tabCompany]]:[]),
        ...(can("viewProducts")?[["products",t.tabProducts]]:[]),
        ["sales", t.tabSales],
        ["purchase", lang==="bn"?"📦 ক্রয় তথ্য":"📦 Purchase Info"],
        ["cheque",t.tabCheque],
        ["settings",t.tabSettings],
      ];

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
    try { await updateDoc(doc(db,"orders",oId),{overall:newStatus,items:newItems}); }
    catch(e) { hErr(e); }
  };

  const canExpand = isOwner || isOrderManager || can("deleteOrder");

  // ── RENDER ORDER ITEMS (expanded detail view) ──
  const renderOrderItems = (order) => {
    return (
      <>
        {order.items.map((it,iIdx)=>{
          const selectedCo = cos.find(c=>c.id===it.co);
          const itemLocked = it.status==="delivered" || it.status==="cancelled";
          const canEditProc = !itemLocked && ["pending","order_confirmed","out_of_stock"].includes(it.status);
          return (
            <div key={iIdx} style={s.oiCard}>
              <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary, marginBottom:6 }}>
                {iIdx+1}. {it.name}
                {it.code&&<span style={{ fontSize:11, color:"#71717a", marginLeft:6 }}>📋 {it.code}</span>}
                {it.brand&&<span style={{ fontSize:11, color:"#71717a", marginLeft:6 }}>🏷️ {it.brand}</span>}
                <span style={{ fontSize:11, color:"#71717a", marginLeft:6 }}>{it.qty} {it.unit}</span>
              </div>
              {(isOwner||can("manageCompanies"))&&(
                <div style={s.row}>
                  <select
                    style={s.sel}
                    value={it.co||""}
                    disabled={!canEditProc}
                    onChange={e=>setCo(order.id,iIdx,e.target.value)}>
                    <option value="">{t.selectCo}</option>
                    {cos.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {(isOwner||can("setPrices"))&&(
                <PriceCell
                  initialValue={it.price ?? ""}
                  disabled={!canEditProc}
                  placeholder={t.price}
                  saveBtnLabel={t.save}
                  onSave={(val) => savePrice(order.id, iIdx, val)}
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
            const co = cos.find(c=>c.id===it.co);
            if (!co?.phone) return;
            if (!groups[it.co]) groups[it.co] = { co, items:[] };
            groups[it.co].items.push(it);
          });
          const entries = Object.values(groups);
          if (!entries.length) return null;
          return (
            <div style={{ marginTop:10, marginBottom:4 }}>
              <div style={{ fontSize:10, color:"#71717a", textTransform:"uppercase", letterSpacing:0.5, fontWeight:700, marginBottom:6 }}>
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
            <div style={{ fontSize:11, color:"#71717a", marginBottom:8, textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 }}>
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
    const canCancel = isMyOrder && !isCancelled && order.overall === "pending";
    const orderAge = Date.now() - (order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt)).getTime();
    const canEditOrder = isSalesman && isMyOrder && order.overall === "pending" && orderAge < 60 * 60 * 1000;
    const canExpandThis = !isCancelled && canExpand;
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
            <span style={{ color:"#6b7280", fontSize:11 }}>{order.createdAt.toLocaleTimeString()}</span>
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
  const tabContent = (
    <>
      {!isOwner&&tab==="shop"&&(
        <div style={isDesktop?s.desktopPanel:s.panel}>
          {can("sendOrder")&&(
            <>
              <div style={s.secTitle}>{t.newOrder}</div>

              {/* ── ITEM ENTRY FORM ── */}
              <div style={{ ...s.card, border:"1px solid #3f3f46" }}>
                {/* Product picker trigger */}
                {products.length>0&&(
                  <div style={{ marginBottom:8 }}>
                    <button style={{ ...s.addInvoiceBtn, background:"rgba(99,102,241,0.08)", borderColor:"#6366f1", color:"#818cf8", padding:"9px" }}
                      onClick={()=>{ setShowProductPicker(!showProductPicker); setProductPickerQ(""); }}>
                      📦 {t.pmFromMaster}
                    </button>
                    {showProductPicker&&(
                      <div style={{ background:th.bgInp, border:"1px solid #3f3f46", borderRadius:10, marginTop:6, overflow:"hidden" }}>
                        <input autoFocus style={{ ...s.inp, borderRadius:0, borderLeft:"none", borderRight:"none", borderTop:"none", borderColor:"#27272a" }}
                          placeholder={t.pmSearch} value={productPickerQ}
                          onChange={e=>setProductPickerQ(e.target.value)} />
                        <div style={{ maxHeight:200, overflowY:"auto" }}>
                          {products
                          .filter(p=> nsmatch([p.name,p.code||'',p.brand||'',p.category||'',p.barcode||'',...(p.moreBarcodes||[])].filter(Boolean).join(' '), productPickerQ))
                            .map(p=>(
                              <button key={p.id} onClick={()=>selectProductToOrder(p)}
                                style={{ width:"100%", textAlign:"left", padding:"10px 14px", background:"transparent", border:"none", borderTop:`1px solid ${th.border}`, color:th.txtSecondary, cursor:"pointer", fontFamily:"inherit" }}>
                                <div style={{ fontSize:13, fontWeight:700 }}>{p.name}</div>
                                <div style={{ fontSize:11, color:"#71717a" }}>
                                  {[p.code,p.brand,p.category].filter(Boolean).join(" · ")}
                                  {p.price&&<span style={{ color:"#22c55e", marginLeft:6 }}>{t.cur}{p.price}</span>}
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <input
                  ref={nameRef}
                  style={{ ...s.inp, marginBottom:8, fontSize:15, fontWeight:600 }}
                  placeholder={t.itemName}
                  value={currentItem.name}
                  onChange={e=>updCurrentItem("name",e.target.value)}
                  onKeyDown={handleEnterAdd}
                />
                <div style={{ display:"flex", gap:7, marginBottom:8 }}>
                  <input style={{ ...s.inp, flex:1 }} placeholder={t.code}
                    value={currentItem.code}
                    onChange={e=>updCurrentItem("code",e.target.value)}
                    onKeyDown={handleEnterAdd}
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
          {/* Search box - always visible */}
          {orders.length>0&&(
            <div style={{ position:"relative", marginBottom:12 }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
              <input
                style={{ ...s.inp, paddingLeft:36, background:th.bgCard }}
                placeholder={lang==="bn"?"অর্ডার নম্বর, পণ্যের নাম বা ব্র্যান্ড দিয়ে খুঁজুন...":"Search by order no, item name or brand..."}
                value={searchQ}
                onChange={e=>setSearchQ(e.target.value)}
              />
              {searchQ&&<button onClick={()=>setSearchQ("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#71717a", cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>}
            </div>
          )}
          {/* Daily grouped orders */}
          {(() => {
              const filtered = filterOrders(orders);
              if (!filtered.length && !searchQ) return null;
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

      {isOwner&&tab==="owner"&&(
        <div style={isDesktop?s.desktopPanel:s.panel}>
          {/* Search box */}
          <div style={{ position:"relative", marginBottom:12 }}>
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
            <input
              style={{ ...s.inp, paddingLeft:36, background:th.bgCard }}
              placeholder={lang==="bn"?"অর্ডার নম্বর, পণ্যের নাম বা ব্র্যান্ড দিয়ে খুঁজুন...":"Search by order no, item name or brand..."}
              value={searchQ}
              onChange={e=>setSearchQ(e.target.value)}
            />
            {searchQ&&<button onClick={()=>setSearchQ("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#71717a", cursor:"pointer", fontSize:16, lineHeight:1 }}>✕</button>}
          </div>
          {/* Daily grouped orders */}
          {orders.length===0
            ? <div style={s.empty}><div style={{ fontSize:42 }}>📭</div><div>{t.noOrders}</div></div>
            : (() => {
                const filtered = filterOrders(orders);
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

      {(isOwner||can("viewProducts"))&&tab==="products"&&(
        <div style={isDesktop?s.desktopPanel:s.panel}>

          {/* ── PRODUCT DETAIL MODAL ── */}
          {pmDetailId&&pmDetail&&(
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:200, overflowY:"auto", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"20px 12px 40px" }}>
              <div style={{ width:"100%", maxWidth:560, background:th.bgCard, borderRadius:16, border:`1px solid ${th.border}`, overflow:"hidden" }}>
                {/* Modal header */}
                <div style={{ background:th.bgInp, padding:"14px 16px", display:"flex", alignItems:"center", gap:10, borderBottom:`1px solid ${th.border}` }}>
                  <div style={{ width:44, height:44, background:th.border, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>📦</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:th.txtPrimary, lineHeight:1.2 }}>{pmDetail.name}</div>
                    {pmDetail.category&&<div style={{ fontSize:11, color:"#f97316", marginTop:2 }}>🗂️ {pmDetail.category}</div>}
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    {isOwner&&<><button style={s.edBtn} onClick={()=>{ setPmForm({name:pmDetail.name,code:pmDetail.code||"",barcode:pmDetail.barcode||"",ean:pmDetail.ean||"",brand:pmDetail.brand||"",category:pmDetail.category||"",subcategory:pmDetail.subcategory||"",landingCost:pmDetail.landingCost||"",vatPerc:pmDetail.vatPerc||"",vatExclusive:pmDetail.vatExclusive||"",vatInclusive:pmDetail.vatInclusive||"",mrp:pmDetail.mrp||"",openingStock:pmDetail.openingStock||"",unit:pmDetail.unit||"Pcs",description:pmDetail.description||""}); setPmEditId(pmDetail.id); setPmShowAdd(false); }}>✏️</button>
                    <button style={s.dlBtn} onClick={()=>deleteProduct(pmDetail.id)}>🗑️</button></>}
                    <button style={{ ...s.stBtn, padding:"6px 12px" }} onClick={()=>{ setPmDetailId(null); setPmEditId(null); pmReset(); }}>✕</button>
                  </div>
                </div>

                {/* Edit form inside modal */}
                {isOwner&&pmEditId===pmDetail.id?(
                  <div style={{ padding:16 }}>
                    <div style={{ fontSize:12, color:"#f97316", fontWeight:700, marginBottom:12 }}>✏️ {t.editTitle}</div>
                    <PmForm pmForm={pmForm} pmUpd={pmUpd} t={t} lang={lang} th={th} />
                    <div style={s.row}>
                      <button style={{ ...s.sendBtn, flex:1 }} onClick={()=>editProduct(pmDetail.id)}>{t.saveEdit}</button>
                      <button style={{ ...s.stBtn, flex:1 }} onClick={()=>{ setPmEditId(null); pmReset(); }}>{t.cancel}</button>
                    </div>
                  </div>
                ):(
                  <div style={{ padding:16 }}>
                    {/* Info grid */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                      {[
                        { lbl:lang==="bn"?"কোড / মডেল":"Code / Model", val:pmDetail.code, icon:"📋" },
                        { lbl:"Barcode", val:pmDetail.barcode, icon:"🔢" },
                        { lbl:"EAN Code", val:pmDetail.ean, icon:"📊" },
                        { lbl:lang==="bn"?"ব্র্যান্ড":"Brand", val:pmDetail.brand, icon:"🏷️" },
                        { lbl:lang==="bn"?"সাব-ক্যাটাগরি":"Sub-Category", val:pmDetail.subcategory, icon:"🗂️" },
                        { lbl:lang==="bn"?"ইউনিট":"Unit", val:pmDetail.unit, icon:"📐" },
                      ].map(({lbl,val,icon})=> val?(
                        <div key={lbl} style={{ background:th.bgInp, borderRadius:10, padding:"10px 12px" }}>
                          <div style={{ fontSize:10, color:"#71717a", marginBottom:4, textTransform:"uppercase", letterSpacing:0.5 }}>{icon} {lbl}</div>
                          <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{val}</div>
                        </div>
                      ):null)}
                    </div>
                    {/* Pricing section */}
                    <div style={{ background:th.bgInp, borderRadius:12, padding:"12px 14px", marginBottom:10 }}>
                      <div style={{ fontSize:11, color:"#f97316", fontWeight:700, marginBottom:10, textTransform:"uppercase", letterSpacing:0.5 }}>💰 {lang==="bn"?"মূল্য তথ্য":"Pricing Info"}</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                        {[
                          { lbl:lang==="bn"?"Landing Cost":"Landing Cost", val:pmDetail.landingCost, color:"#a1a1aa" },
                          { lbl:lang==="bn"?"VAT %":"VAT %", val:pmDetail.vatPerc?`${pmDetail.vatPerc}%`:null, color:"#f59e0b" },
                          { lbl:lang==="bn"?"VAT Excl.":"VAT Excl.", val:pmDetail.vatExclusive, color:"#22c55e" },
                          { lbl:lang==="bn"?"VAT Incl.":"VAT Incl.", val:pmDetail.vatInclusive, color:"#06b6d4" },
                          { lbl:"MRP", val:pmDetail.mrp, color:"#f97316" },
                          { lbl:lang==="bn"?"Opening Stock":"Opening Stock", val:pmDetail.openingStock, color:"#a855f7" },
                        ].map(({lbl,val,color})=>(
                          <div key={lbl} style={{ textAlign:"center", padding:"8px 6px", background:th.bgCard, borderRadius:8 }}>
                            <div style={{ fontSize:9, color:"#71717a", marginBottom:4, textTransform:"uppercase" }}>{lbl}</div>
                            <div style={{ fontSize:14, fontWeight:800, color: val?color:"#3f3f46" }}>{val||"—"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {pmDetail.description&&(
                      <div style={{ background:th.bgInp, borderRadius:10, padding:"10px 12px" }}>
                        <div style={{ fontSize:10, color:"#71717a", marginBottom:4 }}>📝 {lang==="bn"?"বিবরণ":"Description"}</div>
                        <div style={{ fontSize:12, color:"#d4d4d8" }}>{pmDetail.description}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── HEADER ── */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div style={s.secTitle}>{t.pmTitle} {products.length>0&&<span style={{ fontSize:11, color:"#71717a", fontWeight:400 }}>({products.length})</span>}</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              <button style={{ ...s.addCoBtn, borderColor:"#3f3f46", color:"#71717a" }} onClick={fetchProducts} disabled={productsLoading}>{productsLoading?"⏳":"🔄"}</button>
              {isOwner&&products.length>0&&(
                <button style={{ ...s.addCoBtn, borderColor:"#450a0a", color:"#ef4444" }}
                  onClick={async()=>{
                    if (!window.confirm(lang==="bn"?`সব ${products.length}টি পণ্য মুছে ফেলবেন?`:`Delete all ${products.length} products?`)) return;
                    toast(lang==="bn"?"🗑️ মুছা হচ্ছে...":"🗑️ Deleting...");
                    try {
                      for (let i=0;i<products.length;i+=500) {
                        const batch=writeBatch(db);
                        products.slice(i,i+500).forEach(p=>batch.delete(doc(db,"products",p.id)));
                        await batch.commit();
                      }
                      setProducts([]);
                      toast(lang==="bn"?"✅ সব পণ্য মুছে ফেলা হয়েছে":"✅ All products deleted");
                    } catch(e){ hErr(e); }
                  }}>🗑️ {lang==="bn"?"সব মুছুন":"Clear All"}</button>
              )}
              {isOwner&&(<>
              <label style={{ ...s.addCoBtn, cursor:"pointer", background:"rgba(99,102,241,0.1)", borderColor:"#6366f1", color:"#818cf8" }}>
                📥 Import
                <input type="file" accept=".csv" style={{ display:"none" }} onChange={async (e)=>{
                  const file=e.target.files[0]; if (!file) return; e.target.value='';
                  if (products.length>0&&!window.confirm(lang==="bn"?`ইতিমধ্যে ${products.length}টি পণ্য আছে। আগে "সব মুছুন" করুন। তারপরও import করবেন?`:`${products.length} products exist. Clear first. Continue anyway?`)) return;
                  toast(lang==="bn"?"📥 ফাইল পড়া হচ্ছে...":"📥 Reading file...");
                  try {
                    const text=await file.text();
                    const lines=text.split('\n').filter(l=>l.trim());
                    if (lines.length<2) return toast(lang==="bn"?"ফাইলে কোনো ডেটা নেই":"No data","err");
                    const h=lines[0].split(',').map(x=>x.trim().replace(/^"|"$/g,'').toLowerCase());
                    const fi=(kws)=>h.findIndex(x=>kws.some(k=>x.includes(k)));
                    const idx={
                      name:fi(['productname','name']), code:fi(['productcode','code','model']),
                      barcode:fi(['barcode']), ean:fi(['ean']),
                      brand:fi(['company','brand']), category:fi(['category']),
                      subcategory:fi(['subcategory']), landingCost:fi(['landingcost','landing']),
                      vatPerc:fi(['vat_perc','vatperc','vat%']), vatExclusive:fi(['vatexclusive','exclusive']),
                      vatInclusive:fi(['vatinclusive','inclusive']), mrp:fi(['mrp']),
                      openingStock:fi(['openingstock','opening']), unit:fi(['unit']),
                      description:fi(['description']),
                    };
                    if (idx.name<0) return toast(lang==="bn"?"'ProductName' column নেই":"'ProductName' column not found","err");
                    const seen=new Set(); const rows=[];
                    for (const line of lines.slice(1)) {
                      const c=line.split(',').map(x=>x.trim().replace(/^"|"$/g,''));
                      const name=(c[idx.name]||'').trim(); if (!name||name==='nan') continue;
                      const code=(idx.code>=0?c[idx.code]||'':'').trim();
                      const key=`${name}||${code}`.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
                      const clean=(i,zeroEmpty=false)=>{ if (i<0) return ''; let v=(c[i]||'').trim(); if (v==='UNAVAILABLE'||v==='nan') return ''; if (zeroEmpty) { try { if (parseFloat(v)===0) return ''; } catch{} } return v; };
                      rows.push({ shopId, name, code, barcode:clean(idx.barcode), ean:clean(idx.ean),
                        brand:clean(idx.brand), category:clean(idx.category), subcategory:clean(idx.subcategory),
                        landingCost:clean(idx.landingCost,true), vatPerc:clean(idx.vatPerc,true),
                        vatExclusive:clean(idx.vatExclusive,true), vatInclusive:clean(idx.vatInclusive,true),
                        mrp:clean(idx.mrp,true), openingStock:clean(idx.openingStock,true),
                        unit:['Nos','nan',''].includes(clean(idx.unit))?'Pcs':clean(idx.unit),
                        description:clean(idx.description),
                      });
                    }
                    if (!rows.length) return toast(lang==="bn"?"কোনো valid product নেই":"No valid products","err");
                    toast(lang==="bn"?`📥 ${rows.length}টি import হচ্ছে...`:`📥 Importing ${rows.length}...`);
                    let done=0;
                    for (let i=0;i<rows.length;i+=500) {
                      const batch=writeBatch(db);
                      rows.slice(i,i+500).forEach(p=>batch.set(doc(collection(db,"products")),{...p,createdAt:serverTimestamp()}));
                      await batch.commit(); done+=Math.min(500,rows.length-i);
                      toast(`📥 ${done}/${rows.length}...`);
                    }
                    await fetchProducts();
                    toast(lang==="bn"?`✅ ${done}টি পণ্য import সম্পন্ন!`:`✅ ${done} products imported!`);
                  } catch(err){ toast(err.message||"Import failed","err"); }
                }} />
              </label>
              <button style={s.addCoBtn} onClick={()=>{ setPmShowAdd(!pmShowAdd); pmReset(); setPmEditId(null); setPmDetailId(null); }}>
                {pmShowAdd?`✕ ${t.cancel}`:t.pmAdd}
              </button>
              </>)}
            </div>
          </div>

          {/* ── ADD FORM ── */}
          {pmShowAdd&&(
            <div style={{ ...s.card, border:"1px solid #f97316", marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#f97316", marginBottom:12 }}>➕ {t.pmAdd}</div>
              <PmForm pmForm={pmForm} pmUpd={pmUpd} t={t} lang={lang} th={th} />
              <div style={s.row}>
                <button style={{ ...s.sendBtn, flex:1 }} onClick={addProduct}>{t.addBtn}</button>
                <button style={{ ...s.stBtn, flex:1 }} onClick={()=>{ setPmShowAdd(false); pmReset(); }}>{t.cancel}</button>
              </div>
            </div>
          )}

          {/* ── SEARCH + CATEGORY FILTER ── */}
          <div style={{ position:"relative", marginBottom:10 }}>
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}>🔍</span>
            <input style={{ ...s.inp, paddingLeft:36, background:th.bgCard }}
              placeholder={t.pmSearch} value={pmSearch} onChange={e=>setPmSearch(e.target.value)} />
            {pmSearch&&<button onClick={()=>setPmSearch("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#71717a", cursor:"pointer", fontSize:16 }}>✕</button>}
          </div>

          {/* Category filter pills */}
          {!pmSearch&&products.length>0&&(()=>{
            const cats = ["ALL",...[...new Set(products.map(p=>p.category).filter(Boolean))].sort()];
            return (
              <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:10, marginBottom:6 }}>
                {cats.map(cat=>(
                  <button key={cat} onClick={()=>setPmCatFilter(cat)}
                    style={{ padding:"5px 13px", borderRadius:20, border:"1px solid", whiteSpace:"nowrap", cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit",
                      background:pmCatFilter===cat?"#f97316":"transparent",
                      borderColor:pmCatFilter===cat?"#f97316":th.borderMid,
                      color:pmCatFilter===cat?"#fff":th.txtMuted }}>
                    {cat==="ALL"?(lang==="bn"?"সব":"All"):cat}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* ── PRODUCT LIST ── */}
          {productsLoading&&<div style={s.empty}><div style={{ fontSize:36 }}>⏳</div><div>{lang==="bn"?"লোড হচ্ছে...":"Loading..."}</div></div>}
          {!productsLoading&&products.length===0&&<div style={s.empty}><div style={{ fontSize:38 }}>📦</div><div>{t.pmNoProducts}</div></div>}
          {!productsLoading&&(()=>{
            const filtered = products.filter(p=>{
              const refs = (p.moreBarcodes||[]).join(' ');
              const hay = [p.name,p.code,p.barcode,p.ean,p.brand,p.category,refs].filter(Boolean).join(' ');
              const matchQ = nsmatch(hay, pmSearch);
              const matchCat = pmCatFilter==="ALL"||!pmCatFilter||p.category===pmCatFilter;
              return matchQ && matchCat;
            });
            if (filtered.length===0) return <div style={s.empty}><div style={{ fontSize:36 }}>🔍</div><div>{lang==="bn"?"কিছু পাওয়া যায়নি":"No results"}</div></div>;
            return filtered.map(p=>(
              <div key={p.id} style={{ ...s.card, cursor:"pointer", transition:"border-color 0.15s" }}
                onClick={()=>{ setPmDetailId(p.id); setPmEditId(null); pmReset(); }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  {/* Color dot by category */}
                  <div style={{ width:42, height:42, borderRadius:12, background:th.bgInp, border:`1px solid ${th.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>📦</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</div>
                    <div style={{ fontSize:11, color:"#71717a", marginTop:2, display:"flex", flexWrap:"wrap", gap:6 }}>
                      {p.code&&<span>📋 {p.code}</span>}
                      {p.brand&&<span>🏷️ {p.brand}</span>}
                      {p.barcode&&<span>🔢 {p.barcode}</span>}
                    </div>
                    <div style={{ display:"flex", gap:6, marginTop:5, flexWrap:"wrap", alignItems:"center" }}>
                      {p.category&&<span style={{ fontSize:10, background:th.accentDim, color:"#f97316", padding:"2px 8px", borderRadius:20, border:"1px solid #451a03" }}>{p.category}</span>}
                      {p.vatExclusive&&<span style={{ fontSize:11, color:"#22c55e", fontWeight:700 }}>{t.cur}{p.vatExclusive}</span>}
                      {p.mrp&&parseFloat(p.mrp)>0&&<span style={{ fontSize:10, color:"#71717a" }}>MRP {p.mrp}</span>}
                      {p.openingStock&&parseFloat(p.openingStock)>0&&<span style={{ fontSize:10, color:"#818cf8" }}>Stock: {p.openingStock}</span>}
                      <span style={{ fontSize:10, color:"#52525b", marginLeft:"auto" }}>{p.unit}</span>
                    </div>
                  </div>
                  <span style={{ fontSize:20, color:"#3f3f46", flexShrink:0 }}>›</span>
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {(isOwner||can("manageCompanies"))&&tab==="companies"&&(
  <div style={isDesktop?s.desktopPanel:s.panel}>

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
          onClick={() => setShowVendorModal(true)}
        >
          + Vendor
        </button>

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

{vendors.length > 0 && (

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

{showVendorModal && (

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
          style={s.inp}
          placeholder="Vendor Code"
          value={vendorForm.vendorCode}
          onChange={(e) =>
            setVendorForm({
              ...vendorForm,
              vendorCode: e.target.value
            })
          }
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
        <CustomerMasterWindow
          t={t} lang={lang} th={th}
          shopId={shopId} user={user}
          customers={customers} team={team}
          toast={toast} isDesktop={isDesktop}
        />
      )}

      {isOwner&&tab==="vendors"&&(
        <VendorMasterWindow
          t={t} lang={lang} th={th}
          shopId={shopId} user={user}
          vendors={vendors} toast={toast} isDesktop={isDesktop}
          onGoToPurchase={(vendor)=>{
            setTab("purchase");
          }}
        />
      )}

      {isOwner&&tab==="purchase"&&(
        <PurchaseInvoiceTab
          t={t} lang={lang} th={th} s={s}
          shopId={shopId} user={user} profile={profile}
          vendors={vendors} products={products}
          toast={toast} isDesktop={isDesktop}
        />
      )}

      {!isOwner&&tab==="purchase"&&(
        <div style={isDesktop?s.desktopPanel:s.panel}>
          <PiSalesmanView t={t} lang={lang} th={th} shopId={shopId} />
        </div>
      )}

      {tab==="sales"&&(
        <SalesInvoiceTab
          t={t} lang={lang} th={th} s={s}
          shopId={shopId} user={user} profile={profile}
          customers={customers} products={products}
          shop={localShop} toast={toast} isDesktop={isDesktop}
          siShowCode={siShowCode} siColorPrint={siColorPrint}
        />
      )}


      {tab==="cheque"&&(
        <ChequePrinterTab
          t={t} lang={lang} th={th} s={s}
          isDesktop={isDesktop}
          shopName={localShop?.companyName||""}
        />
      )}

      {tab==="settings"&&(
        <div style={isDesktop?s.desktopPanel:s.panel}>
          {/* ── SETTINGS MENU ── */}
          {!settingsPage&&(
            <>
              <div style={s.secTitle}>{t.settingsTitle}</div>

              {/* Profile row */}
              <button style={s.settingsRow} onClick={()=>setSettingsPage("profile")}>
                <span style={s.settingsRowIcon}>👤</span>
                <div style={{ flex:1 }}>
                  <div style={s.settingsRowLabel}>{t.profileTitle}</div>
                  <div style={s.settingsRowSub}>{profile.personName}</div>
                </div>
                <span style={s.settingsArrow}>›</span>
              </button>

              {/* Shop info row */}
              {localShop&&(
                <button style={s.settingsRow} onClick={()=>setSettingsPage("shop")}>
                  <span style={s.settingsRowIcon}>🏢</span>
                  <div style={{ flex:1 }}>
                    <div style={s.settingsRowLabel}>{t.shopInfoTitle}</div>
                    <div style={s.settingsRowSub}>{localShop.companyName}</div>
                  </div>
                  <span style={s.settingsArrow}>›</span>
                </button>
              )}

              {/* Invite codes (owner only) */}
              {isOwner&&(
                <button style={s.settingsRow} onClick={()=>setSettingsPage("invite")}>
                  <span style={s.settingsRowIcon}>🔗</span>
                  <div style={{ flex:1 }}>
                    <div style={s.settingsRowLabel}>{t.inviteCodeTitle}</div>
                    <div style={s.settingsRowSub}>{inviteCodes.filter(c=>!c.used).length} {lang==="bn"?"টি active":"active"}</div>
                  </div>
                  <span style={s.settingsArrow}>›</span>
                </button>
              )}

              {/* Positions (owner only) */}
              {isOwner&&(
                <button style={s.settingsRow} onClick={()=>setSettingsPage("positions")}>
                  <span style={s.settingsRowIcon}>📋</span>
                  <div style={{ flex:1 }}>
                    <div style={s.settingsRowLabel}>{t.managePositionsTitle}</div>
                    <div style={s.settingsRowSub}>{(localShop?.positions||[]).length} {lang==="bn"?"টি পদবী":"positions"}</div>
                  </div>
                  <span style={s.settingsArrow}>›</span>
                </button>
              )}

              {/* Team members */}
              {team.length>0&&(
                <button style={s.settingsRow} onClick={()=>setSettingsPage("team")}>
                  <span style={s.settingsRowIcon}>👥</span>
                  <div style={{ flex:1 }}>
                    <div style={s.settingsRowLabel}>{t.teamTitle}</div>
                    <div style={s.settingsRowSub}>{team.length} {lang==="bn"?"জন সদস্য":"members"}</div>
                  </div>
                  <span style={s.settingsArrow}>›</span>
                </button>
              )}

              {/* Invoice settings */}
              <button style={s.settingsRow} onClick={()=>setSettingsPage("invoice")}>
                <span style={s.settingsRowIcon}>📄</span>
                <div style={{ flex:1 }}>
                  <div style={s.settingsRowLabel}>{t.si_invoiceSettings}</div>
                  <div style={s.settingsRowSub}>{siShowCode?(lang==="bn"?"কোড/মডেল দেখানো চালু":"Show code: ON"):(lang==="bn"?"শুধু পণ্যের নাম":"Product name only")}</div>
                </div>
                <span style={s.settingsArrow}>›</span>
              </button>

              {/* WA style - owner only */}
              {isOwner&&(
              <button style={s.settingsRow} onClick={()=>setSettingsPage("wastyle")}>
                <span style={s.settingsRowIcon}>💬</span>
                <div style={{ flex:1 }}>
                  <div style={s.settingsRowLabel}>{lang==="bn"?"WhatsApp Message Style":"WhatsApp Message Style"}</div>
                  <div style={s.settingsRowSub}>{WA_STYLES.find(s=>s.id===waStyle)?.[lang==="bn"?"labelBn":"labelEn"]||""}</div>
                </div>
                <span style={s.settingsArrow}>›</span>
              </button>
              )}

              {/* Theme */}
              <button style={s.settingsRow} onClick={()=>setSettingsPage("theme")}>
                <span style={s.settingsRowIcon}>{theme==="dark"?"🌙":"☀️"}</span>
                <div style={{ flex:1 }}>
                  <div style={s.settingsRowLabel}>{lang==="bn"?"থিম / রঙ":"Theme"}</div>
                  <div style={s.settingsRowSub}>{theme==="dark"?(lang==="bn"?"ডার্ক মোড":"Dark Mode"):(lang==="bn"?"লাইট মোড":"Light Mode")}</div>
                </div>
                <span style={s.settingsArrow}>›</span>
              </button>

              {/* Sync status */}
              <button style={s.settingsRow} onClick={()=>setSettingsPage("sync")}>
                <span style={s.settingsRowIcon}>{syncState==="connected"?"🟢":syncState==="offline"?"🔴":"🟡"}</span>
                <div style={{ flex:1 }}>
                  <div style={s.settingsRowLabel}>{t.syncStatus}</div>
                  <div style={s.settingsRowSub}>{syncState==="connected"?"Online":syncState==="offline"?"Offline":"Connecting..."}</div>
                </div>
              </button>

              {/* Logout */}
              <button style={{ ...s.logoutBtn, marginTop:16 }} onClick={handleLogout}>🚪 {t.logout}</button>
            </>
          )}

          {/* ── SUB PAGES ── */}
          {settingsPage&&(
            <button style={s.backRowBtn} onClick={()=>setSettingsPage(null)}>
              ← {lang==="bn"?"সেটিংস":"Settings"}
            </button>
          )}

          {settingsPage==="profile"&&(
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
          )}

          {settingsPage==="shop"&&localShop&&(
            <ShopInfoSettings
              localShop={localShop} shopId={shopId}
              th={th} s={s} lang={lang} toast={toast}
            />
          )}

          {settingsPage==="invite"&&isOwner&&(
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
                  <div style={{ fontSize:10, color:"#71717a", textTransform:"uppercase", letterSpacing:0.5, fontWeight:700, marginBottom:8 }}>
                    {lang==="bn"?"ব্যবহৃত Codes":"Used Codes"} ({inviteCodes.filter(c=>c.used).length})
                  </div>
                  {inviteCodes.filter(c=>c.used).map(c=>(
                    <div key={c.code} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderTop:`1px solid ${th.border}` }}>
                      <span style={{ fontSize:13, fontWeight:700, color:"#3f3f46", fontFamily:"monospace", flex:1, letterSpacing:1 }}>{c.code}</span>
                      <span style={{ fontSize:11, color:"#52525b" }}>✅ {c.usedByName||"—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {settingsPage==="positions"&&isOwner&&(
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
                        style={{ padding:"5px 11px", borderRadius:20, border:"1px solid #3f3f46", background:newPosition===p?"#f97316":"transparent", color:newPosition===p?"#fff":"#a1a1aa", cursor:"pointer", fontSize:12, fontWeight:600 }}>
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
                      <span style={{ fontSize:13, color:"#d4d4d8" }}>👤 {pos}</span>
                      <button style={s.dlBtn} onClick={()=>deletePosition(pos)}>🗑️</button>
                    </div>
                  ))
              }
            </div>
          )}

          {settingsPage==="team"&&team.length>0&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{t.teamTitle} ({team.length})</div>
              {team.map((m,idx)=>(
                <div key={m.id} style={{ padding:"10px 0", borderTop:idx>0?`1px solid ${th.border}`:"none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:isOwner&&m.role!=="owner"&&m.uid!==user.uid?10:0 }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background:th.border, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{m.role==="owner"?"🏢":"👨‍💼"}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{m.personName}{m.uid===user.uid&&<span style={{ color:"#f97316", fontSize:11 }}> ({t.youLabel})</span>}</div>
                      <div style={{ fontSize:11, color:"#71717a" }}>
                        {m.role==="owner"?t.ownerLabel:(m.position||t.salesmanLabel)}
                        {m.mobile&&<span> · 📱 {m.mobile}</span>}
                        {m.area&&<span> · {m.area}</span>}
                      </div>
                    </div>
                  </div>
                  {isOwner&&m.role!=="owner"&&m.uid!==user.uid&&(
                    <div style={{ background:th.bgInp, borderRadius:10, padding:"10px 12px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                        <span style={{ fontSize:12, color:"#71717a", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5 }}>{t.positionLbl}</span>
                        <select style={{ ...s.sel, flex:"unset", width:"auto", fontSize:12, padding:"5px 8px" }}
                          value={m.position||"Salesman"}
                          onChange={async e=>{ try { await updateDoc(doc(db,"users",m.id),{position:e.target.value}); toast(t.permSaved); } catch(err) { hErr(err); } }}>
                          <option value="Salesman">{t.defaultPosition}</option>
                          {(localShop?.positions||[]).map(p=><option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div style={{ height:1, background:th.bgCard, marginBottom:8 }} />
                      <div style={{ fontSize:10, color:"#71717a", marginBottom:8, textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 }}>{t.permissionsTitle}</div>
                      {PERMISSIONS_LIST.map((perm,pi)=>{
                        const mPerms = m.permissions||DEFAULT_PERMISSIONS;
                        const isOn   = mPerms[perm.key]===true;
                        return (
                          <div key={perm.key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 0", borderTop:pi>0?`1px solid ${th.border}`:"none" }}>
                            <span style={{ fontSize:12, color:"#d4d4d8" }}>{perm[lang]}</span>
                            <PermToggle isOn={isOn} onToggle={()=>{ savePermissions(m.id,{ ...mPerms, [perm.key]:!isOn }); }} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {settingsPage==="invoice"&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{t.si_invoiceSettings}</div>

              {/* Show Code Toggle */}
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, padding:"14px 0", borderBottom:`1px solid ${th.border}` }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:th.txtPrimary, marginBottom:4 }}>{t.si_showCodeLabel}</div>
                  <div style={{ fontSize:12, color:th.txtMuted }}>{t.si_showCodeDesc}</div>
                  <div style={{ marginTop:8, padding:"8px 12px", background:siShowCode?"rgba(34,197,94,0.08)":"rgba(113,113,122,0.06)", borderRadius:8, fontSize:12, fontWeight:700, color:siShowCode?"#22c55e":th.txtMuted }}>
                    {siShowCode
                      ? (lang==="bn"?"✅ চালু — কোড/মডেল দেখাবে":"✅ ON — Code/Model shows")
                      : (lang==="bn"?"⬜ বন্ধ — শুধু পণ্যের নাম":"⬜ OFF — Product name only")}
                  </div>
                </div>
                <button onClick={()=>{ const nv=!siShowCode; setSiShowCode(nv); saveSiShowCode(nv); }} style={{ width:52, height:30, borderRadius:15, border:"none", cursor:"pointer", background:siShowCode?"#22c55e":"#3f3f46", position:"relative", flexShrink:0, transition:"background 0.2s", marginTop:4 }}>
                  <span style={{ position:"absolute", top:3, left:siShowCode?25:3, width:24, height:24, borderRadius:"50%", background:"#fff", transition:"left 0.15s", display:"block" }} />
                </button>
              </div>

              {/* Color Print Toggle */}
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, padding:"14px 0", borderBottom:`1px solid ${th.border}` }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:th.txtPrimary, marginBottom:4 }}>{t.si_colorLabel}</div>
                  <div style={{ fontSize:12, color:th.txtMuted }}>{t.si_colorDesc}</div>
                  <div style={{ marginTop:8, padding:"8px 12px", background:siColorPrint?"rgba(99,102,241,0.08)":"rgba(113,113,122,0.06)", borderRadius:8, fontSize:12, fontWeight:700, color:siColorPrint?"#818cf8":th.txtMuted }}>
                    {siColorPrint
                      ? (lang==="bn"?"🎨 চালু — রঙিন ইনভয়েস প্রিন্ট হবে":"🎨 ON — Color invoice print")
                      : (lang==="bn"?"🖤 বন্ধ — সাদা-কালো প্রিন্ট (Default)":"🖤 OFF — Black & White print (Default)")}
                  </div>
                </div>
                <button onClick={()=>{ const nv=!siColorPrint; setSiColorPrint(nv); saveSiColor(nv); }} style={{ width:52, height:30, borderRadius:15, border:"none", cursor:"pointer", background:siColorPrint?"#6366f1":"#3f3f46", position:"relative", flexShrink:0, transition:"background 0.2s", marginTop:4 }}>
                  <span style={{ position:"absolute", top:3, left:siColorPrint?25:3, width:24, height:24, borderRadius:"50%", background:"#fff", transition:"left 0.15s", display:"block" }} />
                </button>
              </div>

              {/* Preview */}
              <div style={{ marginTop:16, padding:"12px 14px", background:th.bgInp, borderRadius:10, border:`1px solid ${th.border}` }}>
                <div style={{ fontSize:11, color:th.txtMuted, fontWeight:700, textTransform:"uppercase", marginBottom:8 }}>{lang==="bn"?"উদাহরণ":"Preview"}</div>
                <div style={{ fontSize:13, color:th.txtPrimary, fontWeight:700 }}>Brake Pad</div>
                {siShowCode&&<div style={{ fontSize:11, color:th.txtMuted, marginTop:2 }}>📋 BP-123  🏷️ Toyota</div>}
                <div style={{ marginTop:8, fontSize:11, display:"flex", gap:6, alignItems:"center" }}>
                  <div style={{ width:40, height:14, borderRadius:3, background:siColorPrint?"#16a34a":"#1a1a1a" }} />
                  <span style={{ color:th.txtMuted }}>{siColorPrint?(lang==="bn"?"রঙিন হেডার":"Color header"):(lang==="bn"?"সাদা-কালো হেডার":"B&W header")}</span>
                </div>
              </div>
            </div>
          )}

          {settingsPage==="wastyle"&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{lang==="bn"?"💬 WhatsApp Message Style":"💬 WhatsApp Message Style"}</div>
              <div style={{ fontSize:11, color:"#71717a", marginBottom:12 }}>
                {lang==="bn"?"কোম্পানিকে WhatsApp করার সময় কোন style-এ message যাবে বেছে নিন":"Choose how messages look when sending to companies"}
              </div>
              {WA_STYLES.map(st=>(
                <button key={st.id} onClick={()=>setWaStyle(st.id)}
                  style={{ width:"100%", textAlign:"left", background:waStyle===st.id?"#1c1917":"#09090b",
                    border:`1px solid ${waStyle===st.id?"#f97316":"#27272a"}`, borderRadius:10,
                    padding:"10px 12px", marginBottom:8, cursor:"pointer", fontFamily:"inherit" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:waStyle===st.id?"#f97316":"#a1a1aa" }}>
                      {waStyle===st.id?"✅ ":""}{lang==="bn"?st.labelBn:st.labelEn}
                    </span>
                  </div>
                  <pre style={{ fontSize:11, color:"#71717a", margin:0, fontFamily:"monospace", whiteSpace:"pre-wrap", lineHeight:1.6 }}>
                    {lang==="bn"?`*পণ্যের তালিকা:*\n${st.previewBn}\n\n_দয়া করে দাম ও স্টক জানান।_ 🙏 ধন্যবাদ`:`*Product List:*\n${st.previewEn}\n\n_Please share price and stock._ 🙏 Thanks`}
                  </pre>
                </button>
              ))}
            </div>
          )}

          {settingsPage==="language"&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{t.languageLbl}</div>
              <div style={s.langSw}>
                <button style={{ ...s.lBtn, padding:"10px 18px", flex:1, ...(lang==="bn"?s.lBtnA:{}) }} onClick={()=>setLang("bn")}>বাংলা</button>
                <button style={{ ...s.lBtn, padding:"10px 18px", flex:1, ...(lang==="en"?s.lBtnA:{}) }} onClick={()=>setLang("en")}>English</button>
              </div>
            </div>
          )}

          {settingsPage==="theme"&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{lang==="bn"?"🎨 থিম বেছে নিন":"🎨 Choose Theme"}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <button onClick={()=>setTheme("dark")}
                  style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:12,
                    border:`2px solid ${theme==="dark"?"#f97316":"#3f3f46"}`,
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
                    border:`2px solid ${theme==="light"?"#f97316":"#3f3f46"}`,
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

          {settingsPage==="sync"&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{t.syncStatus}</div>
              <div style={{ fontSize:14, fontWeight:700, color:syncState==="connected"?"#22c55e":syncState==="offline"?"#ef4444":"#f59e0b" }}>
                {syncState==="connected"?t.connected:syncState==="offline"?t.offline:t.connecting}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div style={s.root}>
      <Header t={t} lang={lang} setLang={setLang} isDesktop={isDesktop} s={s} theme={theme} setTheme={setTheme}>
        <div style={s.tabs}>
          {visibleTabs.map(([k,label])=>(
            <button key={k} style={{ ...s.tab, ...(tab===k?s.tabA:{}) }} onClick={()=>setTab(k)}>
              {label}
              {((isOwner&&k==="owner")||(!isOwner&&k==="shop"))&&unread>0&&<span style={s.badge}>{unread}</span>}
            </button>
          ))}
        </div>
      </Header>

      {isDesktop ? (
        <div style={s.desktopLayout}>
          <div style={s.sidebar}>
            <div style={s.sideProfile}>
              <div style={{ fontSize:28, marginBottom:6 }}>{isOwner?"🏢":"👨‍💼"}</div>
              <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary, marginBottom:2 }}>{profile.personName}</div>
              <div style={{ fontSize:11, color:"#71717a" }}>{isOwner?t.ownerLabel:(profile.position||t.salesmanLabel)}</div>
              {localShop&&<div style={{ fontSize:11, color:"#a1a1aa", marginTop:4, fontWeight:600 }}>🏪 {localShop.companyName}</div>}
            </div>
            <div style={s.sideNav}>
              {visibleTabs.map(([k,label])=>(
                <button key={k} style={{ ...s.sideTab, ...(tab===k?s.sideTabA:{}) }} onClick={()=>setTab(k)}>
                  <span style={{ flex:1, textAlign:"left" }}>{label}</span>
                  {((isOwner&&k==="owner")||(!isOwner&&k==="shop"))&&unread>0&&<span style={s.sideBadge}>{unread}</span>}
                </button>
              ))}
            </div>
            <div style={{ flex:1 }} />
            <div style={{ fontSize:11, color:syncState==="connected"?"#22c55e":syncState==="offline"?"#ef4444":"#f59e0b", textAlign:"center", marginBottom:10 }}>
              {syncState==="connected"?"🟢 Online":syncState==="offline"?"🔴 Offline":"🟡 Connecting..."}
            </div>
            <button style={s.sideLogout} onClick={handleLogout}>🚪 {t.logout}</button>
          </div>
          <div style={s.desktopContent}>{tabContent}</div>
        </div>
      ) : tabContent}
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

  const loadProfile = async (u) => {
    setProfileError(null);
    if (!u) { setProfile(null); setShop(null); return; }
    try { await u.getIdToken(true); } catch(e) { console.warn(e); }
    let lastErr=null;
    for (let attempt=0; attempt<5; attempt++) {
      try {
        const profSnap = await getDoc(doc(db,"users",u.uid));
        if (profSnap.exists()) {
          const prof = profSnap.data(); setProfile(prof);
          if (prof.shopId) {
            const shopSnap = await getDoc(doc(db,"shops",prof.shopId));
            if (shopSnap.exists()) setShop({id:shopSnap.id,...shopSnap.data()});
          }
          return;
        }
      } catch(e) { lastErr=e; console.error(`Attempt ${attempt+1} failed:`,e); }
      await new Promise(r=>setTimeout(r,1500));
    }
    setProfileError(lastErr?.message||"Profile not found");
  };

  useEffect(() => {
    if (!FIREBASE_READY||!auth) { setAuthReady(true); return; }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u); await loadProfile(u); setAuthReady(true);
    });
    return ()=>unsub();
  },[]);

  useEffect(()=>()=>{ if (toastTimer.current) clearTimeout(toastTimer.current); },[]);

  if (!FIREBASE_READY||!auth||!db) return <SetupScreen t={t} lang={lang} setLang={setLang} s={s} theme={theme} setTheme={setTheme} />;

  const Notif = notif&&(
    <div style={{ ...s.notif, background:notif.type==="err"?"#450a0a":"#052e16", borderColor:notif.type==="err"?"#ef4444":"#22c55e", color:notif.type==="err"?"#ef4444":"#22c55e" }}>{notif.msg}</div>
  );

  if (!authReady) return <div style={s.root}><Header t={t} lang={lang} setLang={setLang} s={s} theme={theme} setTheme={setTheme} /><div style={{ ...s.empty, paddingTop:80 }}>⏳</div></div>;

  if (!user) {
    let screen;
    if      (authScreen==="reset")      screen=<ResetScreen t={t} lang={lang} setLang={setLang} onBack={()=>setAuthScreen("login")} toast={toast} s={s} theme={theme} setTheme={setTheme} />;
    else if (authScreen==="signupRole") screen=<SignupRolePicker t={t} lang={lang} setLang={setLang} onPick={r=>{ setSignupRole(r); setAuthScreen("signupForm"); }} onSwitchToLogin={()=>setAuthScreen("login")} s={s} theme={theme} setTheme={setTheme} />;
    else if (authScreen==="signupForm") screen=<SignupForm t={t} lang={lang} setLang={setLang} role={signupRole} onBack={()=>setAuthScreen("signupRole")} onSwitchToLogin={()=>setAuthScreen("login")} toast={toast} s={s} theme={theme} setTheme={setTheme} />;
    else                                screen=<LoginScreen t={t} lang={lang} setLang={setLang} onSwitchToSignup={()=>setAuthScreen("signupRole")} onSwitchToReset={()=>setAuthScreen("reset")} toast={toast} s={s} theme={theme} setTheme={setTheme} />;
    return <>{Notif}{screen}</>;
  }

  if (!user.emailVerified) return <>{Notif}<VerifyGate t={t} lang={lang} setLang={setLang} user={user} toast={toast} onLogout={()=>signOut(auth)} s={s} theme={theme} setTheme={setTheme} /></>;

  if (!profile) {
    return (
      <div style={s.root}><Header t={t} lang={lang} setLang={setLang} s={s} theme={theme} setTheme={setTheme} />
        <div style={s.welcomeWrap}>
          {profileError?(
            <>
              <div style={{ fontSize:48, marginBottom:12 }}>⚠️</div>
              <div style={{ ...s.authTitle, color:"#ef4444" }}>{lang==="bn"?"প্রোফাইল পাওয়া যায়নি":"Profile not found"}</div>
              <div style={{ ...s.authSub, marginBottom:8 }}>{lang==="bn"?"আপনার প্রোফাইল ডেটা পাওয়া যায়নি। নতুন করে সাইন আপ করুন।":"Profile data missing. Please sign up again."}</div>
              <div style={{ fontSize:11, color:th.txtMuted, marginBottom:20 }}>{profileError}</div>
              <button style={s.sendBtn} onClick={()=>loadProfile(user)}>{lang==="bn"?"🔄 আবার চেষ্টা করুন":"🔄 Retry"}</button>
              <button style={{ ...s.linkBtn, marginTop:12 }} onClick={()=>signOut(auth)}>{lang==="bn"?"🚪 লগআউট":"🚪 Logout"}</button>
            </>
          ):(
            <>
              <div style={{ fontSize:48, marginBottom:12 }}>⏳</div>
              <div style={s.authTitle}>{lang==="bn"?"প্রোফাইল লোড হচ্ছে...":"Loading profile..."}</div>
              <div style={s.authSub}>{lang==="bn"?"একটু অপেক্ষা করুন":"Please wait"}</div>
            </>
          )}
        </div>
      </div>
    );
  }

  return <>{Notif}<MainApp t={t} lang={lang} setLang={setLang} user={user} profile={profile} shop={shop} toast={toast} s={s} th={th} theme={theme} setTheme={setTheme} /></>;
}

// ─── STYLES FUNCTION ─────────────────────────────────────────
function getStyles(th) { return {
  root:        { minHeight:"100vh", background:th.bgRoot, color:th.txtSecondary, fontFamily:"'Segoe UI', system-ui, sans-serif" },
  notif:       { position:"fixed", top:16, right:16, zIndex:999, padding:"12px 20px", borderRadius:10, border:"1px solid", fontSize:13, fontWeight:600, maxWidth:320, boxShadow:"0 4px 20px rgba(0,0,0,0.3)" },
  hdr:         { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderBottom:`1px solid ${th.border}`, background:th.bgHdr, position:"sticky", top:0, zIndex:10, flexWrap:"wrap", gap:8 },
  hLeft:       { display:"flex", alignItems:"center", gap:10 },
  title:       { fontSize:14, fontWeight:800, color:th.accent, lineHeight:1.1 },
  sub:         { fontSize:10, color:th.txtMuted },
  langSw:      { display:"flex", borderRadius:8, overflow:"hidden", border:`1px solid ${th.borderMid}` },
  lBtn:        { padding:"6px 12px", border:"none", background:"transparent", color:th.txtMuted, cursor:"pointer", fontSize:12, fontWeight:700 },
  lBtnA:       { background:th.accent, color:"#fff" },
  tabs:        { display:"flex", gap:5 },
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
  invHeader:   { display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:th.border, fontSize:10, color:th.txtMuted, textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 },
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
  settingsLbl: { fontSize:11, color:th.txtMuted, marginBottom:10, textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 },
  inviteBox:   { fontSize:22, fontWeight:800, color:th.accent, textAlign:"center", padding:"16px", background:th.bgInp, borderRadius:10, border:`2px dashed ${th.accent}`, letterSpacing:2, fontFamily:"monospace" },
  logoutBtn:   { width:"100%", padding:"13px", borderRadius:10, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", fontSize:14, fontWeight:700, cursor:"pointer", marginTop:16 },
  desktopLayout:  { display:"flex", height:"calc(100vh - 61px)", overflow:"hidden" },
  desktopContent: { flex:1, overflowY:"auto", background:th.bgRoot },
  desktopPanel:   { maxWidth:900, margin:"0 auto", padding:"24px 28px 60px" },
  sidebar:        { width:230, minWidth:230, background:th.bgSidebar, borderRight:`1px solid ${th.border}`, display:"flex", flexDirection:"column", padding:"20px 14px 16px", overflowY:"auto" },
  sideProfile:    { background:th.bgInp, borderRadius:12, padding:14, marginBottom:16, textAlign:"center", border:`1px solid ${th.border}` },
  sideNav:        { display:"flex", flexDirection:"column", gap:6 },
  sideTab:        { display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderRadius:10, border:"none", background:"transparent", color:th.txtMuted, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit" },
  sideTabA:       { background:th.accent, color:"#fff" },
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
