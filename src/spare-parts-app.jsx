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
    return [p.name,p.code,p.brand,p.category,p.barcode,...(p.moreBarcodes||[])].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase());
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
        <span style={{ fontSize:15, fontWeight:800, color:"#f97316" }}>৳ {piFmt2(total)}</span>
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
        <span style={{ fontSize:13, fontWeight:700, color:total>0?"#f97316":th.txtFaint }}>৳ {piFmt2(total)}</span>
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
              <div style={{ fontSize:14, fontWeight:900, color:k.c }}>৳{k.v}</div>
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
              <span style={{ fontSize:13, fontWeight:700, color:"#f97316" }}>৳{piFmt2(inv.grandTotal)}</span>
              {inv.amountPaid>0&&<span style={{ fontSize:11, color:"#22c55e" }}>✅ ৳{piFmt2(inv.amountPaid)}</span>}
              {inv.balanceDue>0.01&&<span style={{ fontSize:11, color:"#ef4444" }}>⚠️ ৳{piFmt2(inv.balanceDue)}</span>}
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
                <div style={{ fontSize:13, fontWeight:800, color:"#f97316" }}>৳{piFmt2(vd.total)}</div>
                <div style={{ fontSize:9, color:"#a1a1aa", fontWeight:700, textTransform:"uppercase", marginTop:2 }}>{lang==="bn"?"মোট ক্রয়":"Total"}</div>
              </div>
              <div style={{ textAlign:"center", padding:"8px 6px", background:"rgba(34,197,94,0.06)", borderRadius:8 }}>
                <div style={{ fontSize:13, fontWeight:800, color:"#22c55e" }}>৳{piFmt2(vd.paid)}</div>
                <div style={{ fontSize:9, color:"#a1a1aa", fontWeight:700, textTransform:"uppercase", marginTop:2 }}>{lang==="bn"?"পরিশোধ":"Paid"}</div>
              </div>
              <div style={{ textAlign:"center", padding:"8px 6px", background:vd.balance>0?"rgba(239,68,68,0.06)":"rgba(34,197,94,0.06)", borderRadius:8, border:vd.balance>0?"1px solid rgba(239,68,68,0.2)":"none" }}>
                <div style={{ fontSize:13, fontWeight:800, color:vd.balance>0?"#ef4444":"#22c55e" }}>৳{piFmt2(vd.balance)}</div>
                <div style={{ fontSize:9, color:"#a1a1aa", fontWeight:700, textTransform:"uppercase", marginTop:2 }}>{lang==="bn"?"বাকি":"Balance"}</div>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ height:6, background:th.bgInp, borderRadius:6, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${paidPerc}%`, background:"linear-gradient(90deg,#22c55e,#16a34a)", borderRadius:6, transition:"width 0.4s" }} />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
              <span style={{ fontSize:9, color:"#22c55e", fontWeight:700 }}>{paidPerc.toFixed(0)}% {lang==="bn"?"পরিশোধ":"paid"}</span>
              {vd.balance>0&&<span style={{ fontSize:9, color:"#ef4444", fontWeight:700 }}>{lang==="bn"?"বাকি আছে":"outstanding"} ৳{piFmt2(vd.balance)}</span>}
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
  const q = searchQ.trim().toLowerCase();
  const filtered = q
    ? allItems.filter(it=>[it.name,it.code,it.brand].filter(Boolean).join(" ").toLowerCase().includes(q))
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
                  ৳ {piFmt2(it.unitCost)}
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
                  <span style={{ fontSize:15, fontWeight:700, color:th.txtPrimary }}>৳ {piFmt2(saleEx)}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:12, color:"#06b6d4" }}>🧾 {t.pi_vatAmount} ({vatPerc}%)</span>
                  <span style={{ fontSize:14, fontWeight:700, color:"#06b6d4" }}>+ ৳ {piFmt2(vatAmt)}</span>
                </div>
                <div style={{ height:1, background:"rgba(34,197,94,0.3)", marginBottom:8 }} />
                {/* Total inc VAT — the big number */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:13, fontWeight:800, color:"#22c55e" }}>{t.pi_saleIncVat}</span>
                  <span style={{ fontSize:26, fontWeight:900, color:"#22c55e", letterSpacing:0.5 }}>৳ {piFmt2(saleInc)}</span>
                </div>
                {/* Margin info */}
                {margin>0&&(
                  <div style={{ marginTop:8, padding:"5px 10px", background:"rgba(34,197,94,0.1)", borderRadius:8, display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:11, color:"#22c55e", fontWeight:700 }}>{t.pi_margin}</span>
                    <span style={{ fontSize:12, fontWeight:800, color:"#22c55e" }}>৳ {piFmt2(margin)} ({marginPerc}%)</span>
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
      setPiInvoiceNo(no); setPiForm(piEmptyForm()); setPiLines([piEmptyLine()]); setEditInvoiceId(null); setPiView("form");
    } catch(e) {
      toast(lang==="bn"?"ইনভয়েস খুলতে সমস্যা হয়েছে!":"Failed to open invoice form!","err");
    }
  };

  // ── Open edit form ──
  const piOpenEdit = (inv) => {
    setPiInvoiceNo(inv.invoiceNo);
    setPiForm({ invoiceDate:inv.invoiceDate, supplierInvoiceNo:inv.supplierInvoiceNo||"", vendorId:inv.vendorId||"", vendorName:inv.vendorName||"", vendorMobile:inv.vendorMobile||"", paymentMethod:inv.paymentMethod||"cash", amountPaid:inv.amountPaid>0?String(inv.amountPaid):"", note:inv.note||"" });
    setPiLines((inv.items||[]).map(it=>({ id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:it.productId||null, name:it.name||"", code:it.code||"", brand:it.brand||"", qty:String(it.qty||""), unit:it.unit||"Pcs", unitCost:String(it.unitCost||""), discountPerc:String(it.discountPerc||"0"), taxPerc:String(it.taxPerc||"5"), salePrice:String(it.salePrice||"") })));
    setEditInvoiceId(inv.id); setPiView("form");
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
    try { if (editInvoiceId){ await updateDoc(doc(db,"purchaseInvoices",editInv