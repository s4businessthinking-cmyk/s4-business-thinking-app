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
];

const DEFAULT_PERMISSIONS = {
  sendOrder: true,
  manageCompanies: false,
  setPrices: false,
  setStatus: false,
  markDelivery: false,
  deleteOrder: false,
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
const ORDER_PREFIX = "S4-";
const loadLang = () => { try { return localStorage.getItem(LANG_KEY)||"bn"; } catch { return "bn"; } };
const saveLang = (l) => { try { localStorage.setItem(LANG_KEY,l); } catch {} };
const loadWaStyle = () => { try { return localStorage.getItem(WA_STYLE_KEY)||"1"; } catch { return "1"; } };
const saveWaStyle = (v) => { try { localStorage.setItem(WA_STYLE_KEY,v); } catch {} };

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
      <input style={s.inp} placeholder={placeholder} inputMode="numeric"
        disabled={disabled} value={val}
        onClick={stop} onMouseDown={stop} onPointerDown={stop} onTouchStart={stop}
        onChange={e => setVal(e.target.value)} />
      {!disabled && <button style={s.savBtn} onClick={() => onSave(val)}>{saveBtnLabel}</button>}
    </div>
  );
}

// ─── HEADER ──────────────────────────────────────────────────
function Header({ t, lang, setLang, children, isDesktop }) {
  return (
    <div style={s.hdr}>
      <div style={s.hLeft}>
        <img src={LOGO_URL} alt="S4" style={s.headerLogo} />
        <div><div style={s.title}>{APP_NAME}</div><div style={s.sub}>{t.appSub}</div></div>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <div style={s.langSw}>
          <button style={{ ...s.lBtn, ...(lang==="bn"?s.lBtnA:{}) }} onClick={() => setLang("bn")}>বাং</button>
          <button style={{ ...s.lBtn, ...(lang==="en"?s.lBtnA:{}) }} onClick={() => setLang("en")}>EN</button>
        </div>
        {!isDesktop && children}
      </div>
    </div>
  );
}

// ─── SETUP ───────────────────────────────────────────────────
function SetupScreen({ t, lang, setLang }) {
  return (
    <div style={s.root}><Header t={t} lang={lang} setLang={setLang} />
      <div style={s.authWrap}>
        <div style={s.authIcon}>🔥</div>
        <div style={{ ...s.authTitle, color:"#f97316" }}>Firebase Setup Required</div>
        <div style={s.authSub}>SETUP.md ফাইল দেখে Firebase config যোগ করুন।</div>
      </div>
    </div>
  );
}

// ─── LOGIN ───────────────────────────────────────────────────
function LoginScreen({ t, lang, setLang, onSwitchToSignup, onSwitchToReset, toast }) {
  const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [busy,setBusy]=useState(false);
  const submit = async (e) => {
    e?.preventDefault?.();
    if (!email.trim()||!pw) return toast(friendlyAuthError({code:"validation/required"},lang),"err");
    setBusy(true);
    try { await signInWithEmailAndPassword(auth,email.trim(),pw); }
    catch(err) { toast(friendlyAuthError(err,lang),"err"); }
    finally { setBusy(false); }
  };
  return (
    <div style={s.root}><Header t={t} lang={lang} setLang={setLang} />
      <div style={s.authWrap}>
        <img src={LOGO_URL} alt={APP_NAME} style={s.bigLogo} />
        <div style={s.authTitle}>{t.welcomeBack}</div>
        <div style={s.authSub}>{t.welcomeBackSub}</div>
        <form onSubmit={submit} style={s.authCard}>
          <input style={{ ...s.inp, marginBottom:10 }} type="email" placeholder={t.emailLbl} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" />
          <input style={{ ...s.inp, marginBottom:10 }} type="password" placeholder={t.passwordLbl} value={pw} onChange={e=>setPw(e.target.value)} autoComplete="current-password" />
          <button type="submit" style={s.sendBtn} disabled={busy}>{busy?t.loggingIn:t.signIn}</button>
          <button type="button" style={s.linkBtn} onClick={onSwitchToReset}>{t.forgotPw}</button>
        </form>
        <div style={s.authFooter}>{t.noAccount}{" "}
          <button style={s.linkBtnInline} onClick={onSwitchToSignup}>{t.createAccount}</button>
        </div>
      </div>
    </div>
  );
}

// ─── PASSWORD RESET ──────────────────────────────────────────
function ResetScreen({ t, lang, setLang, onBack, toast }) {
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
    <div style={s.root}><Header t={t} lang={lang} setLang={setLang} />
      <div style={s.authWrap}>
        <div style={s.authIcon}>🔑</div>
        <div style={s.authTitle}>{t.resetTitle}</div>
        <div style={s.authSub}>{t.resetMsg}</div>
        <form onSubmit={submit} style={s.authCard}>
          <input style={{ ...s.inp, marginBottom:10 }} type="email" placeholder={t.emailLbl} value={email} onChange={e=>setEmail(e.target.value)} />
          <button type="submit" style={s.sendBtn} disabled={busy}>{busy?"...":t.resetBtn}</button>
        </form>
        <button style={{ ...s.linkBtn, marginTop:16 }} onClick={onBack}>{t.backBtn}</button>
      </div>
    </div>
  );
}

// ─── ROLE PICKER ─────────────────────────────────────────────
function SignupRolePicker({ t, lang, setLang, onPick, onSwitchToLogin }) {
  return (
    <div style={s.root}><Header t={t} lang={lang} setLang={setLang} />
      <div style={s.authWrap}>
        <img src={LOGO_URL} alt={APP_NAME} style={s.bigLogo} />
        <div style={s.authTitle}>{t.chooseRole}</div>
        <div style={s.authSub}>{t.chooseRoleSub}</div>
        <div style={{ ...s.roleGrid, marginTop:24 }}>
          <button style={s.roleCard} onClick={() => onPick("owner")}>
            <div style={s.roleEmoji}>🏢</div>
            <div style={s.roleName}>{t.roleOwnerCard}</div>
            <div style={s.roleDesc}>{t.roleOwnerDesc}</div>
          </button>
          <button style={s.roleCard} onClick={() => onPick("salesman")}>
            <div style={s.roleEmoji}>👨‍💼</div>
            <div style={s.roleName}>{t.roleSalesCard}</div>
            <div style={s.roleDesc}>{t.roleSalesDesc}</div>
          </button>
        </div>
        <div style={{ ...s.authFooter, marginTop:24 }}>{t.haveAccount}{" "}
          <button style={s.linkBtnInline} onClick={onSwitchToLogin}>{t.loginNow}</button>
        </div>
      </div>
    </div>
  );
}

// ─── SIGNUP FORM ─────────────────────────────────────────────
function SignupForm({ t, lang, setLang, role, onBack, onSwitchToLogin, toast }) {
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
    <div style={s.root}><Header t={t} lang={lang} setLang={setLang} />
      <div style={s.authWrap}>
        <div style={s.authIcon}>{isOwner?"🏢":"👨‍💼"}</div>
        <div style={s.authTitle}>{isOwner?t.roleOwnerCard:t.roleSalesCard}</div>
        <form onSubmit={submit} style={s.authCard}>
          {isOwner && <input style={{ ...s.inp, marginBottom:10 }} placeholder={t.companyName} value={companyName} onChange={e=>setCompanyName(e.target.value)} />}
          {!isOwner && (
            <>
              <input
                style={{ ...s.inp, marginBottom:4, textTransform:"uppercase", fontWeight:700, letterSpacing:1 }}
                placeholder="INVITE CODE"
                value={inviteCode}
                onChange={e=>setInviteCode(e.target.value.toUpperCase())}
              />
              <div style={{ fontSize:11, color:"#71717a", marginBottom:10 }}>💡 {t.inviteCodeLbl}</div>
            </>
          )}
          <input style={{ ...s.inp, marginBottom:10 }} placeholder={t.personName} value={personName} onChange={e=>setPersonName(e.target.value)} />
          <select style={{ ...s.sel, marginBottom:10, width:"100%" }} value={country} onChange={e=>setCountry(e.target.value)}>
            {COUNTRIES.map(c=><option key={c.code} value={c.code}>{c.name} ({c.dial})</option>)}
          </select>
          <input style={{ ...s.inp, marginBottom:10 }} placeholder={t.areaLbl} value={area} onChange={e=>setArea(e.target.value)} />
          <input style={{ ...s.inp, marginBottom:10 }} type="tel" placeholder={t.mobileLbl} value={mobile} onChange={e=>setMobile(e.target.value)} />
          <input style={{ ...s.inp, marginBottom:10 }} type="email" placeholder={t.emailLbl} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" />
          <input style={{ ...s.inp, marginBottom:10 }} type="password" placeholder={t.passwordLbl} value={pw} onChange={e=>setPw(e.target.value)} autoComplete="new-password" />
          <input style={{ ...s.inp, marginBottom:12 }} type="password" placeholder={t.confirmPwLbl} value={pw2} onChange={e=>setPw2(e.target.value)} autoComplete="new-password" />
          <button type="submit" style={s.sendBtn} disabled={busy}>{busy?t.creatingAccount:t.createAccount}</button>
        </form>
        <button style={{ ...s.linkBtn, marginTop:16 }} onClick={onBack}>{t.backBtn}</button>
        <div style={{ ...s.authFooter, marginTop:8 }}>{t.haveAccount}{" "}
          <button style={s.linkBtnInline} onClick={onSwitchToLogin}>{t.loginNow}</button>
        </div>
      </div>
    </div>
  );
}

// ─── VERIFY GATE ─────────────────────────────────────────────
function VerifyGate({ t, lang, setLang, user, toast, onLogout }) {
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
    <div style={s.root}><Header t={t} lang={lang} setLang={setLang} />
      <div style={s.authWrap}>
        <div style={s.authIcon}>📧</div>
        <div style={s.authTitle}>{t.verifyTitle}</div>
        <div style={s.authSub}>{t.verifyMsg}</div>
        <div style={{ ...s.card, marginTop:16, textAlign:"center" }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#f97316", marginBottom:4 }}>{user.email}</div>
          <div style={{ fontSize:12, color:"#71717a", marginBottom:16 }}>{t.verifyMsg2}</div>
          <button style={{ ...s.sendBtn, marginBottom:10 }} onClick={recheck} disabled={busy}>{t.verifyCheckBtn}</button>
          <button style={{ ...s.stBtn, width:"100%" }} onClick={resend} disabled={busy}>{t.resendVerify}</button>
        </div>
        <button style={{ ...s.linkBtn, marginTop:16 }} onClick={onLogout}>{t.logout}</button>
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
function InviteCodeRow({ c, lang, t, onDelete }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(c.code); setCopied(true); setTimeout(()=>setCopied(false),2000); }
    catch { alert(c.code); }
  };
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderTop:"1px solid #27272a" }}>
      <span style={{ fontSize:16, fontWeight:800, color:"#f97316", fontFamily:"monospace", flex:1, letterSpacing:2 }}>{c.code}</span>
      <button style={{ padding:"6px 12px", borderRadius:8, border:"none", background:"#1d4ed8", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:700 }}
        onClick={copy}>{copied?(lang==="bn"?"✅ কপি":"✅ Copied"):(lang==="bn"?"📋 কপি":"📋 Copy")}</button>
      <button style={{ padding:"6px 8px", borderRadius:8, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:12 }}
        onClick={()=>onDelete(c.code)}>🗑️</button>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────
function MainApp({ t, lang, setLang, user, profile, shop:shopProp, toast }) {
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
  const [syncState,setSyncState]=useState("connecting");
  const [localShop,setLocalShop]=useState(shopProp);

  const [tab,setTab]=useState(isOwner?"owner":"shop");

  // ── INVOICE STATE ──
  // items = confirmed invoice list (locked rows)
  // currentItem = the form being filled right now
  const [items,setItems]=useState([]);
  const [currentItem,setCurrentItem]=useState(newItem());
  const [note,setNote]=useState("");
  const nameRef = useRef(null);

  const [selOrder,setSelOrder]=useState(null);

  const [editId,setEditId]=useState(null);
  const [editNm,setEditNm]=useState(""); const [editPh,setEditPh]=useState("");
  const [newNm,setNewNm]=useState(""); const [newPh,setNewPh]=useState("");
  const [showAdd,setShowAdd]=useState(false);
  const [copyState,setCopyState]=useState(false);
  const [searchQ,setSearchQ]=useState("");
  const [waStyle,setWaStyleState]=useState(loadWaStyle());
  const setWaStyle = (v) => { setWaStyleState(v); saveWaStyle(v); };

  const windowWidth = useWindowWidth();
  const isDesktop = windowWidth >= 768;

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

  const sendOrder = async () => {
    const valid = items.filter(it=>it.name.trim());
    if (!valid.length) return toast(t.e1,"err");
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
    const q = searchQ.trim().toLowerCase();
    if (!q) return list;
    return list.filter(o => {
      const noMatch = getOrderDisplayNo(o).toLowerCase().includes(q);
      const itemMatch = o.items?.some(it =>
        it.name?.toLowerCase().includes(q) ||
        it.brand?.toLowerCase().includes(q) ||
        it.code?.toLowerCase().includes(q)
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
    ? [["owner",t.tabOwner],["companies",t.tabCompany],["settings",t.tabSettings]]
    : [
        ["shop",t.tabShop],
        ...(can("manageCompanies")?[["companies",t.tabCompany]]:[]),
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
              <div style={{ fontSize:13, fontWeight:700, color:"#f4f4f5", marginBottom:6 }}>
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
              <div style={{ background:"#1c1917", border:"1px solid #f97316", borderRadius:10, padding:"10px 12px", marginBottom:6 }}>
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
        {canCancel&&(
          <button
            style={{ ...s.delOrderBtn, marginTop:8, borderColor:"#713f12", color:"#f59e0b" }}
            onClick={e=>{ e.stopPropagation(); cancelOrder(order.id); }}>
            🚫 {lang==="bn"?"অর্ডার বাতিল করুন":"Cancel Order"}
          </button>
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
                    <span style={{ fontSize:12, color:"#f97316", fontWeight:700, background:"#451a03", padding:"3px 10px", borderRadius:20 }}>
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
                          <div style={{ fontSize:13, fontWeight:700, color:"#f4f4f5", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
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
                  <button style={s.sendBtn} onClick={sendOrder}>{t.sendOrder}</button>
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
                style={{ ...s.inp, paddingLeft:36, background:"#18181b" }}
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
              style={{ ...s.inp, paddingLeft:36, background:"#18181b" }}
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

      {(isOwner||can("manageCompanies"))&&tab==="companies"&&(
        <div style={isDesktop?s.desktopPanel:s.panel}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div style={s.secTitle}>{t.coList}</div>
            <button style={s.addCoBtn} onClick={()=>setShowAdd(!showAdd)}>{showAdd?`✕ ${t.cancel}`:t.addNew}</button>
          </div>
          {showAdd&&(
            <div style={{ ...s.card, border:"1px solid #f97316", marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#f97316", marginBottom:10 }}>{t.addCoTitle}</div>
              <input style={{ ...s.inp, marginBottom:8 }} placeholder={t.coName} value={newNm} onChange={e=>setNewNm(e.target.value)} />
              <input style={{ ...s.inp, marginBottom:8 }} placeholder={t.waNum} value={newPh} onChange={e=>setNewPh(e.target.value)} />
              <div style={{ fontSize:11, color:"#71717a", marginBottom:10 }}>{t.waHint}</div>
              <div style={s.row}>
                <button style={{ ...s.sendBtn, flex:1, padding:"10px" }} onClick={addCo}>{t.addBtn}</button>
                <button style={{ ...s.stBtn, flex:1 }} onClick={()=>{ setShowAdd(false); setNewNm(""); setNewPh(""); }}>{t.cancel}</button>
              </div>
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
                    <div style={{ fontSize:15, fontWeight:700, color:"#f4f4f5" }}>{c.name}</div>
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

              {/* Language */}
              <button style={s.settingsRow} onClick={()=>setSettingsPage("language")}>
                <span style={s.settingsRowIcon}>🌐</span>
                <div style={{ flex:1 }}>
                  <div style={s.settingsRowLabel}>{t.languageLbl}</div>
                  <div style={s.settingsRowSub}>{lang==="bn"?"বাংলা":"English"}</div>
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
                  <div style={{ fontSize:15, fontWeight:700, color:"#f4f4f5" }}>{profile.personName}</div>
                  <div style={{ fontSize:12, color:"#71717a", marginTop:2 }}>{profile.email} · {isOwner?t.ownerLabel:(profile.position||t.salesmanLabel)}</div>
                  <div style={{ fontSize:12, color:"#71717a" }}>📱 {profile.mobile} · {profile.area}, {profile.countryName}</div>
                </div>
              </div>
            </div>
          )}

          {settingsPage==="shop"&&localShop&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{t.shopInfoTitle}</div>
              <div style={{ fontSize:15, fontWeight:700, color:"#f4f4f5", marginBottom:4 }}>🏢 {localShop.companyName}</div>
              <div style={{ fontSize:12, color:"#71717a" }}>{t.ownerLabel}: {localShop.ownerName}</div>
              <div style={{ fontSize:12, color:"#71717a" }}>📍 {localShop.area}</div>
            </div>
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
                <InviteCodeRow key={c.code} c={c} lang={lang} t={t} onDelete={deleteInviteCode} />
              ))}
              {inviteCodes.filter(c=>c.used).length>0&&(
                <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid #27272a" }}>
                  <div style={{ fontSize:10, color:"#71717a", textTransform:"uppercase", letterSpacing:0.5, fontWeight:700, marginBottom:8 }}>
                    {lang==="bn"?"ব্যবহৃত Codes":"Used Codes"} ({inviteCodes.filter(c=>c.used).length})
                  </div>
                  {inviteCodes.filter(c=>c.used).map(c=>(
                    <div key={c.code} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderTop:"1px solid #1f1f23" }}>
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
                    <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 0", borderTop:i>0?"1px solid #27272a":"none" }}>
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
                <div key={m.id} style={{ padding:"10px 0", borderTop:idx>0?"1px solid #27272a":"none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:isOwner&&m.role!=="owner"&&m.uid!==user.uid?10:0 }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background:"#27272a", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{m.role==="owner"?"🏢":"👨‍💼"}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#f4f4f5" }}>{m.personName}{m.uid===user.uid&&<span style={{ color:"#f97316", fontSize:11 }}> ({t.youLabel})</span>}</div>
                      <div style={{ fontSize:11, color:"#71717a" }}>
                        {m.role==="owner"?t.ownerLabel:(m.position||t.salesmanLabel)}
                        {m.mobile&&<span> · 📱 {m.mobile}</span>}
                        {m.area&&<span> · {m.area}</span>}
                      </div>
                    </div>
                  </div>
                  {isOwner&&m.role!=="owner"&&m.uid!==user.uid&&(
                    <div style={{ background:"#09090b", borderRadius:10, padding:"10px 12px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                        <span style={{ fontSize:12, color:"#71717a", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5 }}>{t.positionLbl}</span>
                        <select style={{ ...s.sel, flex:"unset", width:"auto", fontSize:12, padding:"5px 8px" }}
                          value={m.position||"Salesman"}
                          onChange={async e=>{ try { await updateDoc(doc(db,"users",m.id),{position:e.target.value}); toast(t.permSaved); } catch(err) { hErr(err); } }}>
                          <option value="Salesman">{t.defaultPosition}</option>
                          {(localShop?.positions||[]).map(p=><option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div style={{ height:1, background:"#1f1f23", marginBottom:8 }} />
                      <div style={{ fontSize:10, color:"#71717a", marginBottom:8, textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 }}>{t.permissionsTitle}</div>
                      {PERMISSIONS_LIST.map((perm,pi)=>{
                        const mPerms = m.permissions||DEFAULT_PERMISSIONS;
                        const isOn   = mPerms[perm.key]===true;
                        return (
                          <div key={perm.key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 0", borderTop:pi>0?"1px solid #1f1f23":"none" }}>
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
      <Header t={t} lang={lang} setLang={setLang} isDesktop={isDesktop}>
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
              <div style={{ fontSize:13, fontWeight:700, color:"#f4f4f5", marginBottom:2 }}>{profile.personName}</div>
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

  if (!FIREBASE_READY||!auth||!db) return <SetupScreen t={t} lang={lang} setLang={setLang} />;

  const Notif = notif&&(
    <div style={{ ...s.notif, background:notif.type==="err"?"#450a0a":"#052e16", borderColor:notif.type==="err"?"#ef4444":"#22c55e", color:notif.type==="err"?"#ef4444":"#22c55e" }}>{notif.msg}</div>
  );

  if (!authReady) return <div style={s.root}><Header t={t} lang={lang} setLang={setLang} /><div style={{ ...s.empty, paddingTop:80 }}>⏳</div></div>;

  if (!user) {
    let screen;
    if      (authScreen==="reset")      screen=<ResetScreen t={t} lang={lang} setLang={setLang} onBack={()=>setAuthScreen("login")} toast={toast} />;
    else if (authScreen==="signupRole") screen=<SignupRolePicker t={t} lang={lang} setLang={setLang} onPick={r=>{ setSignupRole(r); setAuthScreen("signupForm"); }} onSwitchToLogin={()=>setAuthScreen("login")} />;
    else if (authScreen==="signupForm") screen=<SignupForm t={t} lang={lang} setLang={setLang} role={signupRole} onBack={()=>setAuthScreen("signupRole")} onSwitchToLogin={()=>setAuthScreen("login")} toast={toast} />;
    else                                screen=<LoginScreen t={t} lang={lang} setLang={setLang} onSwitchToSignup={()=>setAuthScreen("signupRole")} onSwitchToReset={()=>setAuthScreen("reset")} toast={toast} />;
    return <>{Notif}{screen}</>;
  }

  if (!user.emailVerified) return <>{Notif}<VerifyGate t={t} lang={lang} setLang={setLang} user={user} toast={toast} onLogout={()=>signOut(auth)} /></>;

  if (!profile) {
    return (
      <div style={s.root}><Header t={t} lang={lang} setLang={setLang} />
        <div style={s.welcomeWrap}>
          {profileError?(
            <>
              <div style={{ fontSize:48, marginBottom:12 }}>⚠️</div>
              <div style={{ ...s.authTitle, color:"#ef4444" }}>{lang==="bn"?"প্রোফাইল পাওয়া যায়নি":"Profile not found"}</div>
              <div style={{ ...s.authSub, marginBottom:8 }}>{lang==="bn"?"আপনার প্রোফাইল ডেটা পাওয়া যায়নি। নতুন করে সাইন আপ করুন।":"Profile data missing. Please sign up again."}</div>
              <div style={{ fontSize:11, color:"#71717a", marginBottom:20 }}>{profileError}</div>
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

  return <>{Notif}<MainApp t={t} lang={lang} setLang={setLang} user={user} profile={profile} shop={shop} toast={toast} /></>;
}

// ─── STYLES ──────────────────────────────────────────────────
const s = {
  root:        { minHeight:"100vh", background:"#09090b", color:"#e4e4e7", fontFamily:"'Segoe UI', system-ui, sans-serif" },
  notif:       { position:"fixed", top:16, right:16, zIndex:999, padding:"12px 20px", borderRadius:10, border:"1px solid", fontSize:13, fontWeight:600, maxWidth:320, boxShadow:"0 4px 20px rgba(0,0,0,0.5)" },
  hdr:         { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderBottom:"1px solid #27272a", background:"#18181b", position:"sticky", top:0, zIndex:10, flexWrap:"wrap", gap:8 },
  hLeft:       { display:"flex", alignItems:"center", gap:10 },
  title:       { fontSize:14, fontWeight:800, color:"#f97316", lineHeight:1.1 },
  sub:         { fontSize:10, color:"#71717a" },
  langSw:      { display:"flex", borderRadius:8, overflow:"hidden", border:"1px solid #3f3f46" },
  lBtn:        { padding:"6px 12px", border:"none", background:"transparent", color:"#a1a1aa", cursor:"pointer", fontSize:12, fontWeight:700 },
  lBtnA:       { background:"#f97316", color:"#fff" },
  tabs:        { display:"flex", gap:5 },
  tab:         { padding:"7px 11px", borderRadius:8, border:"1px solid #3f3f46", background:"transparent", color:"#a1a1aa", cursor:"pointer", fontSize:12, fontWeight:600, position:"relative" },
  tabA:        { background:"#f97316", color:"#fff", border:"1px solid #f97316" },
  badge:       { position:"absolute", top:-6, right:-6, background:"#ef4444", color:"#fff", borderRadius:"50%", width:16, height:16, fontSize:9, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800 },
  panel:       { maxWidth:660, margin:"0 auto", padding:"18px 14px 60px" },
  secTitle:    { fontSize:14, fontWeight:700, color:"#f97316", marginBottom:10 },
  card:        { background:"#18181b", border:"1px solid #27272a", borderRadius:12, padding:14, marginBottom:10 },
  inp:         { padding:"10px 12px", borderRadius:8, border:"1px solid #3f3f46", background:"#09090b", color:"#e4e4e7", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" },
  ta:          { width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #3f3f46", background:"#09090b", color:"#e4e4e7", fontSize:13, outline:"none", resize:"none", marginBottom:8, boxSizing:"border-box", fontFamily:"inherit" },
  sendBtn:     { width:"100%", padding:"12px", borderRadius:10, border:"none", background:"linear-gradient(135deg, #f97316, #ea580c)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" },
  // ── Invoice button ──
  addInvoiceBtn: { width:"100%", padding:"11px", borderRadius:10, border:"2px dashed #f97316", background:"rgba(249,115,22,0.08)", color:"#f97316", fontSize:14, fontWeight:700, cursor:"pointer", letterSpacing:0.3 },
  // ── Invoice table ──
  invoiceCard: { background:"#18181b", border:"1px solid #27272a", borderRadius:12, overflow:"hidden", marginBottom:4 },
  invHeader:   { display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"#27272a", fontSize:10, color:"#71717a", textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 },
  invRow:      { display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderTop:"1px solid #27272a" },
  invSerial:   { fontSize:12, fontWeight:800, color:"#f97316" },
  invDelBtn:   { width:26, height:26, borderRadius:6, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:11, fontWeight:700, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" },
  // ──
  oHdr:        { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 },
  oId:         { fontSize:14, fontWeight:800, color:"#f4f4f5" },
  sBadge:      { padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:700 },
  iSum:        { display:"flex", gap:8, alignItems:"center", padding:"5px 0", borderTop:"1px solid #27272a", flexWrap:"wrap" },
  iName:       { fontSize:13, color:"#d4d4d8", fontWeight:600 },
  iMeta:       { fontSize:10, color:"#71717a", marginTop:2, display:"flex", flexWrap:"wrap", gap:4 },
  iQty:        { fontSize:12, color:"#71717a" },
  iPrice:      { fontSize:13, fontWeight:700, color:"#22c55e" },
  empty:       { textAlign:"center", padding:"50px 20px", color:"#52525b", fontSize:14 },
  nBadge:      { fontSize:10, background:"#451a03", color:"#f97316", padding:"2px 7px", borderRadius:10, fontWeight:700 },
  div:         { height:1, background:"#27272a", margin:"10px 0" },
  oiCard:      { background:"#09090b", borderRadius:10, padding:12, marginBottom:8, border:"1px solid #27272a" },
  row:         { display:"flex", gap:7, marginBottom:7, alignItems:"center" },
  sel:         { flex:1, padding:"10px 12px", borderRadius:8, border:"1px solid #3f3f46", background:"#18181b", color:"#e4e4e7", fontSize:14, outline:"none", fontFamily:"inherit" },
  waBtn:       { display:"flex", alignItems:"center", gap:4, padding:"8px 12px", borderRadius:8, background:"#15803d", color:"#fff", textDecoration:"none", fontSize:12, fontWeight:700, whiteSpace:"nowrap", flexShrink:0 },
  savBtn:      { padding:"8px 14px", borderRadius:8, border:"none", background:"#1d4ed8", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", flexShrink:0 },
  sRow:        { display:"flex", gap:7, marginBottom:7 },
  stBtn:       { flex:1, padding:"10px", borderRadius:8, border:"1px solid #3f3f46", background:"#18181b", color:"#a1a1aa", fontSize:12, fontWeight:700, cursor:"pointer" },
  stBtnC:      { background:"#052e16", color:"#22c55e", border:"1px solid #22c55e" },
  stBtnN:      { background:"#450a0a", color:"#ef4444", border:"1px solid #ef4444" },
  delBtn:      { width:"100%", padding:"11px", borderRadius:10, border:"none", background:"linear-gradient(135deg, #4f46e5, #7c3aed)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", marginTop:4 },
  delOrderBtn: { width:"100%", padding:"10px", borderRadius:10, border:"1px solid #450a0a", background:"transparent", color:"#ef4444", fontSize:12, fontWeight:700, cursor:"pointer", marginTop:8 },
  flowBtn:     { width:"100%", padding:"11px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:6 },
  addCoBtn:    { padding:"7px 14px", borderRadius:8, border:"1px solid #f97316", background:"transparent", color:"#f97316", cursor:"pointer", fontSize:12, fontWeight:700 },
  coIcon:      { width:40, height:40, background:"#27272a", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 },
  edBtn:       { padding:"6px 10px", borderRadius:8, border:"1px solid #3f3f46", background:"#27272a", color:"#e4e4e7", cursor:"pointer", fontSize:13 },
  dlBtn:       { padding:"6px 9px", borderRadius:8, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:13 },
  authWrap:    { maxWidth:440, margin:"0 auto", padding:"32px 18px 60px", textAlign:"center" },
  welcomeWrap: { maxWidth:440, margin:"0 auto", padding:"60px 18px", textAlign:"center" },
  authIcon:    { fontSize:48, marginBottom:8 },
  headerLogo:  { width:36, height:36, borderRadius:8, objectFit:"cover" },
  bigLogo:     { width:130, height:130, borderRadius:20, objectFit:"cover", marginBottom:16, boxShadow:"0 4px 20px rgba(0,0,0,0.4)" },
  authTitle:   { fontSize:24, fontWeight:800, color:"#f97316", marginBottom:6 },
  authSub:     { fontSize:13, color:"#a1a1aa", marginBottom:20 },
  authCard:    { background:"#18181b", border:"1px solid #27272a", borderRadius:12, padding:16, textAlign:"left" },
  authFooter:  { fontSize:12, color:"#a1a1aa", marginTop:16 },
  linkBtn:     { background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:12, fontWeight:700, padding:"10px", marginTop:8, fontFamily:"inherit" },
  linkBtnInline:{ background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:12, fontWeight:700, padding:0, fontFamily:"inherit", textDecoration:"underline" },
  roleGrid:    { display:"flex", flexDirection:"column", gap:12 },
  roleCard:    { background:"#18181b", border:"1px solid #27272a", borderRadius:14, padding:"22px 18px", cursor:"pointer", color:"#e4e4e7", textAlign:"left", fontFamily:"inherit", transition:"border-color 0.2s" },
  roleEmoji:   { fontSize:38, marginBottom:8 },
  roleName:    { fontSize:16, fontWeight:700, color:"#f4f4f5", marginBottom:4 },
  roleDesc:    { fontSize:12, color:"#a1a1aa" },
  settingsLbl: { fontSize:11, color:"#71717a", marginBottom:10, textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 },
  inviteBox:   { fontSize:22, fontWeight:800, color:"#f97316", textAlign:"center", padding:"16px", background:"#09090b", borderRadius:10, border:"2px dashed #f97316", letterSpacing:2, fontFamily:"monospace" },
  logoutBtn:   { width:"100%", padding:"13px", borderRadius:10, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", fontSize:14, fontWeight:700, cursor:"pointer", marginTop:16 },
  desktopLayout:  { display:"flex", height:"calc(100vh - 61px)", overflow:"hidden" },
  desktopContent: { flex:1, overflowY:"auto", background:"#09090b" },
  desktopPanel:   { maxWidth:900, margin:"0 auto", padding:"24px 28px 60px" },
  sidebar:        { width:230, minWidth:230, background:"#18181b", borderRight:"1px solid #27272a", display:"flex", flexDirection:"column", padding:"20px 14px 16px", overflowY:"auto" },
  sideProfile:    { background:"#09090b", borderRadius:12, padding:14, marginBottom:16, textAlign:"center", border:"1px solid #27272a" },
  sideNav:        { display:"flex", flexDirection:"column", gap:6 },
  sideTab:        { display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderRadius:10, border:"none", background:"transparent", color:"#a1a1aa", cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit" },
  sideTabA:       { background:"#f97316", color:"#fff" },
  sideBadge:      { background:"#ef4444", color:"#fff", borderRadius:10, padding:"2px 7px", fontSize:10, fontWeight:800, marginLeft:"auto" },
  sideLogout:     { width:"100%", padding:"11px", borderRadius:10, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" },
  dayHeader:   { display:"flex", alignItems:"center", gap:8, margin:"18px 0 8px", paddingBottom:6, borderBottom:"1px solid #27272a" },
  dayDot:      { width:8, height:8, borderRadius:"50%", background:"#f97316", flexShrink:0 },
  dayLabel:    { fontSize:13, fontWeight:700, color:"#f97316", flex:1 },
  dayCount:    { fontSize:11, color:"#71717a", background:"#27272a", padding:"2px 8px", borderRadius:10 },
  // ── Settings accordion ──
  settingsRow:      { width:"100%", display:"flex", alignItems:"center", gap:12, padding:"14px 16px", background:"#18181b", border:"1px solid #27272a", borderRadius:12, marginBottom:8, cursor:"pointer", fontFamily:"inherit", textAlign:"left" },
  settingsRowIcon:  { fontSize:22, flexShrink:0, width:32, textAlign:"center" },
  settingsRowLabel: { fontSize:14, fontWeight:700, color:"#f4f4f5", marginBottom:2 },
  settingsRowSub:   { fontSize:11, color:"#71717a" },
  settingsArrow:    { fontSize:20, color:"#3f3f46", flexShrink:0 },
  backRowBtn:       { display:"flex", alignItems:"center", gap:8, background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"inherit", padding:"0 0 14px 0" },
};
