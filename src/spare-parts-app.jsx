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
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  getDocs,
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
    itemName:"আইটেমের নাম", code:"কোড / মডেল / সাইজ", brand:"ব্র্যান্ডের নাম",
    qty:"পরিমাণ", unitPcs: "পিস", unitSet: "সেট", unitDoz: "ডজন", unitGram: "গ্রাম", unitCm: "সেমি", unitInch: "ইঞ্চি", unitFt: "ফুট", unitMtr: "মিটার", unitLtr: "লিটার", unitPkt: "প্যাকেট", unitBox: "বক্স",
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
    status:{ pending:"অপেক্ষায়", confirmed:"✅ কনফার্মড", no_stock:"❌ স্টক নেই", delivered:"🚚 ডেলিভারি হয়েছে" },
    n1:"✅ অর্ডার পাঠানো হয়েছে!", n2:"দাম সেভ হয়েছে ✅", n3:"🚚 ডেলিভারি সম্পন্ন!",
    n4:"কোম্পানি যোগ হয়েছে ✅", n5:"কোম্পানি আপডেট হয়েছে ✅",
    n6:"কোম্পানি মুছে ফেলা হয়েছে।", n7:"অর্ডার মুছে ফেলা হয়েছে।",
    n9:"অ্যাকাউন্ট তৈরি হয়েছে! ইমেইল যাচাই করুন।",
    n10:"✅ ইমেইল যাচাই সম্পন্ন!", n11:"📤 যাচাই ইমেইল আবার পাঠানো হয়েছে।",
    e1:"অন্তত একটা আইটেম দিন!", e2:"নাম খালি রাখা যাবে না!", e3:"নাম দিন!",
    delConfirm:"এই অর্ডারটি মুছে ফেলবেন?",
    // positions & permissions
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
    itemName:"Item Name", code:"Code / Model / Size", brand:"Brand Name",
    qty:"Quantity", unitPcs: "Pcs", unitSet: "Set", unitDoz: "Doz", unitGram: "Gram", unitCm: "Cm", unitInch: "Inch", unitFt: "Ft", unitMtr: "Mtr", unitLtr: "Ltr", unitPkt: "Pkt", unitBox: "Box",
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
    items:" items", newTag:"🔔 New", cur:"৳",
    status:{ pending:"Pending", confirmed:"✅ Confirmed", no_stock:"❌ No Stock", delivered:"🚚 Delivered" },
    n1:"✅ Order sent!", n2:"Price saved ✅", n3:"🚚 Delivery completed!",
    n4:"Company added ✅", n5:"Company updated ✅",
    n6:"Company deleted.", n7:"Order deleted.",
    n9:"Account created! Please verify your email.",
    n10:"✅ Email verified successfully!", n11:"📤 Verification email resent.",
    e1:"Add at least one item!", e2:"Name cannot be empty!", e3:"Please enter a name!",
    delConfirm:"Delete this order?",
    // positions & permissions
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
  pending:   { color:"#f59e0b", bg:"#451a03" },
  confirmed: { color:"#22c55e", bg:"#052e16" },
  no_stock:  { color:"#ef4444", bg:"#450a0a" },
  delivered: { color:"#818cf8", bg:"#1e1b4b" },
};

const LANG_KEY = "sparetrack-lang";
const loadLang = () => { try { return localStorage.getItem(LANG_KEY)||"bn"; } catch { return "bn"; } };
const saveLang = (l) => { try { localStorage.setItem(LANG_KEY,l); } catch {} };
const newItem  = () => ({ id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, name:"", code:"", brand:"", qty:"", unit:"Pcs" });

// ─── HEADER ──────────────────────────────────────────────────
function Header({ t, lang, setLang, children }) {
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
        {children}
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
        const q = query(collection(db,"shops"), where("inviteCode","==",inviteCode.trim().toUpperCase()));
        const snap = await getDocs(q);
        if (snap.empty) throw { code:"invite/not-found" };
        shopId=snap.docs[0].id; shopData=snap.docs[0].data();
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
            inviteCode:generateInviteCode(),
            positions:[], // empty — owner will add positions later
            createdAt:serverTimestamp(),
          });
        } catch(e) {
          if (userCreated) { try { await deleteDoc(doc(db,"users",uid)); } catch {} }
          try { await cred.user.delete(); } catch {}
          throw {code:"shop/create-failed",message:e.message};
        }
      }
      try { await sendEmailVerification(cred.user); } catch(e) { console.warn(e); }
      toast(t.n9);
    } catch(err) { toast(friendlyAuthError(err,lang),"err"); }
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

// ─── MAIN APP ─────────────────────────────────────────────────
function MainApp({ t, lang, setLang, user, profile, shop:shopProp, toast }) {
  const isOwner = profile.role==="owner";
  const shopId  = profile.shopId;
  const perms   = profile.permissions||DEFAULT_PERMISSIONS;
  const can     = (key) => isOwner||perms[key]===true;
  // non-owner with management permissions sees all orders (not just their own)
  const isOrderManager = !isOwner&&(can("setStatus")||can("setPrices")||can("markDelivery")||can("deleteOrder"));

  const [orders,setOrders]=useState([]);
  const [cos,setCos]=useState([]);
  const [team,setTeam]=useState([]);
  const [syncState,setSyncState]=useState("connecting");
  const [localShop,setLocalShop]=useState(shopProp);

  const [tab,setTab]=useState(isOwner?"owner":"shop");
  const [items,setItems]=useState([newItem()]);
  const [note,setNote]=useState("");
  const [selOrder,setSelOrder]=useState(null);
  const [prices,setPrices]=useState({});

  const [editId,setEditId]=useState(null);
  const [editNm,setEditNm]=useState(""); const [editPh,setEditPh]=useState("");
  const [newNm,setNewNm]=useState(""); const [newPh,setNewPh]=useState("");
  const [showAdd,setShowAdd]=useState(false);
  const [copyState,setCopyState]=useState(false);

  // positions
  const [newPosition,setNewPosition]=useState("");
  const [showAddPos,setShowAddPos]=useState(false);

  // real-time shop (catches position changes live)
  useEffect(() => {
    if (!shopId) return;
    return onSnapshot(doc(db,"shops",shopId),
      snap => { if (snap.exists()) setLocalShop({id:snap.id,...snap.data()}); },
      err  => console.error(err)
    );
  },[shopId]);

  // orders
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

  const hErr  = (e) => { console.error(e); toast(e.message||String(e),"err"); };
  const addIt = () => setItems(p=>[...p,newItem()]);
  const delIt = (id) => setItems(p=>p.filter(it=>it.id!==id));
  const updIt = (id,f,v) => setItems(p=>p.map(it=>it.id===id?{...it,[f]:v}:it));

  const sendOrder = async () => {
    const valid = items.filter(it=>it.name.trim());
    if (!valid.length) return toast(t.e1,"err");
    try {
      await addDoc(collection(db,"orders"),{
        shopId, createdBy:user.uid, createdByName:profile.personName,
        items:valid.map(it=>({name:it.name,code:it.code||"",brand:it.brand||"",qty:it.qty||"",unit:it.unit||"Pcs",price:"",status:"pending",co:null})),
        note:note||"", createdAt:serverTimestamp(), overall:"pending", read:false,
      });
      setItems([newItem()]); setNote(""); toast(t.n1);
    } catch(e) { hErr(e); }
  };

  const savePrice = async (oId,iIdx) => {
    const order = orders.find(o=>o.id===oId); if (!order) return;
    const p = prices[`${oId}-${iIdx}`]??"";
    const upd = order.items.map((it,x)=>x===iIdx?{...it,price:p}:it);
    try { await updateDoc(doc(db,"orders",oId),{items:upd}); toast(t.n2); } catch(e) { hErr(e); }
  };

  const setStatus = async (oId,iIdx,status) => {
    const order = orders.find(o=>o.id===oId); if (!order) return;
    const upd = order.items.map((it,x)=>x===iIdx?{...it,status}:it);
    const allNoStock = upd.every(it=>it.status==="no_stock");
    const allHandled = upd.every(it=>it.status==="confirmed"||it.status==="no_stock");
    const overall = allNoStock?"no_stock":allHandled?"confirmed":"pending";
    try { await updateDoc(doc(db,"orders",oId),{items:upd,overall}); } catch(e) { hErr(e); }
  };

  const deliver = async (oId) => {
    const order = orders.find(o=>o.id===oId); if (!order) return;
    const upd = order.items.map(it=>({...it,status:it.status==="no_stock"?"no_stock":"delivered"}));
    try { await updateDoc(doc(db,"orders",oId),{overall:"delivered",items:upd}); toast(t.n3); } catch(e) { hErr(e); }
  };

  const delOrder = async (oId) => {
    if (!window.confirm(t.delConfirm)) return;
    try {
      await deleteDoc(doc(db,"orders",oId));
      setPrices(p=>{ const n={...p}; Object.keys(n).forEach(k=>{if(k.startsWith(`${oId}-`)) delete n[k];}); return n; });
      if (selOrder===oId) setSelOrder(null); toast(t.n7,"err");
    } catch(e) { hErr(e); }
  };

  const setCo = async (oId,iIdx,coId) => {
    const order = orders.find(o=>o.id===oId); if (!order) return;
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

  // ── POSITIONS ──────────────────────────────────────────────
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

  // ── PERMISSIONS ────────────────────────────────────────────
  const savePermissions = async (memberId, newPerms) => {
    try { await updateDoc(doc(db,"users",memberId),{permissions:newPerms}); toast(t.permSaved); }
    catch(e) { hErr(e); }
  };

  const shortId  = (id) => id.slice(-6).toUpperCase();
  const waLink   = (phone,order,item) => {
    const codeLine  = item.code  ? (lang==="bn"?`কোড/মডেল: ${item.code}\n`:`Code/Model: ${item.code}\n`) : "";
    const brandLine = item.brand ? (lang==="bn"?`ব্র্যান্ড: ${item.brand}\n`:`Brand: ${item.brand}\n`) : "";
    const txt = encodeURIComponent(lang==="bn"
      ? `🔧 PO #${shortId(order.id)}\n\nআইটেম: ${item.name}\n${codeLine}${brandLine}পরিমাণ: ${item.qty} ${item.unit}\n\nদয়া করে দাম ও স্টক জানান।`
      : `🔧 PO #${shortId(order.id)}\n\nItem: ${item.name}\n${codeLine}${brandLine}Qty: ${item.qty} ${item.unit}\n\nPlease share price and stock availability.`
    );
    return `https://wa.me/${phone}?text=${txt}`;
  };

  const handleLogout = async () => {
    if (!window.confirm(t.confirmLogout)) return;
    try { await signOut(auth); } catch(e) { hErr(e); }
  };

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(localShop.inviteCode); setCopyState(true); setTimeout(()=>setCopyState(false),2000); }
    catch { toast("Copy failed","err"); }
  };

  const unread = orders.filter(o=>o.overall==="pending"&&!o.read).length;

  const visibleTabs = isOwner
    ? [["owner",t.tabOwner],["companies",t.tabCompany],["settings",t.tabSettings]]
    : [
        ["shop",t.tabShop],
        ...(can("manageCompanies")?[["companies",t.tabCompany]]:[]),
        ["settings",t.tabSettings],
      ];

  // ── SHARED ORDER ITEMS RENDERER ────────────────────────────
  const renderOrderItems = (order) => (
    <>
      {order.items.map((item,idx) => {
        const selCo = cos.find(c=>c.id===item.co);
        return (
          <div key={idx} style={s.oiCard}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:14, fontWeight:700, color:"#f4f4f5" }}>{item.name}</span>
              <span style={{ fontSize:13, color:"#f97316", fontWeight:700 }}>{item.qty} {item.unit}</span>
            </div>
            {(item.code||item.brand) && (
              <div style={{ fontSize:11, color:"#a1a1aa", marginBottom:10, display:"flex", gap:10, flexWrap:"wrap" }}>
                {item.code&&<span>📋 {item.code}</span>}
                {item.brand&&<span>🏷️ {item.brand}</span>}
              </div>
            )}
            {can("manageCompanies") && (
              <div style={s.row}>
                <select style={s.sel} value={item.co||""} onChange={e=>setCo(order.id,idx,e.target.value)}>
                  <option value="">{t.selectCo}</option>
                  {cos.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {selCo&&<a href={waLink(selCo.phone,order,item)} target="_blank" rel="noreferrer" style={s.waBtn} onClick={e=>e.stopPropagation()}>💬 WA</a>}
              </div>
            )}
            {can("setPrices") && (
              <div style={s.row}>
                <input style={{ ...s.inp, flex:1 }} placeholder={t.price}
                  value={prices[`${order.id}-${idx}`]??item.price??""}
                  onChange={e=>setPrices(p=>({...p,[`${order.id}-${idx}`]:e.target.value}))} />
                <button style={s.savBtn} onClick={()=>savePrice(order.id,idx)}>{t.save}</button>
              </div>
            )}
            {can("setStatus") && (
              <div style={s.sRow}>
                <button style={{ ...s.stBtn, ...(item.status==="confirmed"?s.stBtnC:{}) }} onClick={()=>setStatus(order.id,idx,"confirmed")}>{t.confirmed}</button>
                <button style={{ ...s.stBtn, ...(item.status==="no_stock"?s.stBtnN:{}) }} onClick={()=>setStatus(order.id,idx,"no_stock")}>{t.noStock}</button>
              </div>
            )}
          </div>
        );
      })}
      {can("markDelivery")&&order.overall==="confirmed"&&(
        <button style={s.delBtn} onClick={()=>deliver(order.id)}>{t.deliver}</button>
      )}
      {can("deleteOrder")&&(
        <button style={s.delOrderBtn} onClick={()=>delOrder(order.id)}>{t.delOrder}</button>
      )}
    </>
  );

  const canExpand = isOwner||isOrderManager||can("deleteOrder");

  // ── ORDER CARD ─────────────────────────────────────────────
  const OrderCard = ({ order, showSenderName }) => (
    <div style={{ ...s.card, cursor:canExpand?"pointer":"default" }}
      onClick={() => { if (!canExpand) return; markRead(order.id); setSelOrder(selOrder===order.id?null:order.id); }}>
      <div style={s.oHdr}>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span style={s.oId}>Order #{shortId(order.id)}</span>
          {!order.read&&(isOwner||isOrderManager)&&<span style={s.nBadge}>{t.newTag}</span>}
        </div>
        <div style={{ display:"flex", gap:7, alignItems:"center" }}>
          <span style={{ color:"#6b7280", fontSize:11 }}>{order.createdAt.toLocaleTimeString()}</span>
          <span style={{ ...s.sBadge, color:SC[order.overall]?.color, background:SC[order.overall]?.bg }}>{t.status[order.overall]}</span>
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
          <span style={{ fontSize:11, fontWeight:700, color:SC[it.status]?.color }}>{t.status[it.status]}</span>
        </div>
      ))}
      {selOrder===order.id&&canExpand&&(
        <div onClick={e=>e.stopPropagation()} style={{ cursor:"default" }}>
          <div style={s.div} />
          {renderOrderItems(order)}
        </div>
      )}
    </div>
  );

  return (
    <div style={s.root}>
      <Header t={t} lang={lang} setLang={setLang}>
        <div style={s.tabs}>
          {visibleTabs.map(([k,label])=>(
            <button key={k} style={{ ...s.tab, ...(tab===k?s.tabA:{}) }} onClick={()=>setTab(k)}>
              {label}
              {((isOwner&&k==="owner")||(!isOwner&&k==="shop"))&&unread>0&&<span style={s.badge}>{unread}</span>}
            </button>
          ))}
        </div>
      </Header>

      {/* ── SALESMAN SHOP TAB ── */}
{!isOwner && tab === "shop" && (
  <div style={s.panel}>
    {can("sendOrder") && (
      <>
        <div style={s.secTitle}>{t.newOrder}</div>
        <div style={s.card}>
          {items.map((item, i) => (
            <div key={item.id} style={s.itemBlock}>
              <div style={s.itemHead}>
                <div style={s.iNum}>{i + 1}</div>
                <input 
                  style={{ ...s.inp, flex: 1 }} 
                  placeholder={t.itemName} 
                  value={item.name} 
                  onChange={e => updItem(item.id, "name", e.target.value)} 
                />
                {items.length > 1 && (
                  <button style={s.rmBtn} onClick={() => delItem(item.id)}>✕</button>
                )}
              </div>
              
              <input 
                style={{ ...s.inp, marginTop: 6 }} 
                placeholder={t.code} 
                value={item.code} 
                onChange={e => updItem(item.id, "code", e.target.value)} 
              />
              
              <input 
                style={{ ...s.inp, marginTop: 6 }} 
                placeholder={t.brand} 
                value={item.brand} 
                onChange={e => updItem(item.id, "brand", e.target.value)} 
              />
              
              <div style={{ display: "flex", gap: 7, marginTop: 6 }}>
                <input 
                  style={{ ...s.inp, flex: 2 }} 
                  placeholder={t.qty} 
                  inputMode="numeric" 
                  value={item.qty} 
                  onChange={e => updItem(item.id, "qty", e.target.value)} 
                />
                
                <select 
                  style={{ ...s.sel, flex: 1 }} 
                  value={item.unit} 
                  onChange={e => updItem(item.id, "unit", e.target.value)}
                >
                  <option value="Pcs">{t.unitPcs}</option>
                  <option value="Set">{t.unitSet}</option>
                  <option value="Doz">{t.unitDoz}</option>
                  <option value="Gram">{t.unitGram}</option>
                  <option value="Cm">{t.unitCm}</option>
                  <option value="Inch">{t.unitInch}</option>
                  <option value="Ft">{t.unitFt}</option>
                  <option value="Mtr">{t.unitMtr}</option>
                  <option value="Ltr">{t.unitLtr}</option>
                  <option value="Pkt">{t.unitPkt}</option>
                  <option value="Box">{t.unitBox}</option>
                </select>
              </div>
            </div>
          ))}
          
          <button style={s.addBtn} onClick={addItem}>{t.addItem}</button>
          
          <textarea 
            style={s.ta} 
            placeholder={t.noteP} 
            value={note} 
            onChange={e => setNote(e.target.value)} 
            rows={2} 
          />
          
          <button style={s.sendBtn} onClick={sendOrder}>{t.sendOrder}</button>
        </div>
      </>
    )}

    {orders.length > 0 && (
      <>
        <div style={{ ...s.secTitle, marginTop: 18 }}>{t.sentOrders}</div>
        {/* সার্চ বক্স চাইলে এখানে বসাতে পারেন */}
        {orders.map(o => (
          <OrderCard key={o.id} order={o} showSenderName={isOrderManager} />
        ))}
      </>
    )}
  </div>
)}

      {/* ── OWNER ORDERS TAB ── */}
      {isOwner&&tab==="owner"&&(
        <div style={s.panel}>
          {orders.length===0&&<div style={s.empty}><div style={{ fontSize:42 }}>📭</div><div>{t.noOrders}</div></div>}
          {orders.map(o=><OrderCard key={o.id} order={o} showSenderName={true} />)}
        </div>
      )}

      {/* ── COMPANIES TAB ── */}
      {(isOwner||can("manageCompanies"))&&tab==="companies"&&(
        <div style={s.panel}>
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

      {/* ── SETTINGS TAB ── */}
      {tab==="settings"&&(
        <div style={s.panel}>
          <div style={s.secTitle}>{t.settingsTitle}</div>

          {/* Profile card */}
          <div style={s.card}>
            <div style={s.settingsLbl}>{t.profileTitle}</div>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ ...s.coIcon, fontSize:24 }}>{isOwner?"🏢":"👨‍💼"}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:"#f4f4f5" }}>{profile.personName}</div>
                <div style={{ fontSize:12, color:"#71717a", marginTop:2 }}>
                  {profile.email} · {isOwner?t.ownerLabel:(profile.position||t.salesmanLabel)}
                </div>
                <div style={{ fontSize:12, color:"#71717a" }}>📱 {profile.mobile} · {profile.area}, {profile.countryName}</div>
              </div>
            </div>
          </div>

          {/* Shop info */}
          {localShop&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{t.shopInfoTitle}</div>
              <div style={{ fontSize:15, fontWeight:700, color:"#f4f4f5", marginBottom:4 }}>🏢 {localShop.companyName}</div>
              <div style={{ fontSize:12, color:"#71717a" }}>{t.ownerLabel}: {localShop.ownerName}</div>
              <div style={{ fontSize:12, color:"#71717a" }}>📱 {localShop.mobile} · {localShop.area}</div>
            </div>
          )}

          {/* Invite code (owner only) */}
          {isOwner&&localShop?.inviteCode&&(
            <div style={{ ...s.card, border:"1px solid #f97316" }}>
              <div style={s.settingsLbl}>{t.inviteCodeTitle}</div>
              <div style={{ fontSize:11, color:"#a1a1aa", marginBottom:12 }}>{t.inviteCodeDesc}</div>
              <div style={s.inviteBox}>{localShop.inviteCode}</div>
              <button style={{ ...s.sendBtn, marginTop:10 }} onClick={copyCode}>{copyState?t.codeCopied:t.copyCode}</button>
            </div>
          )}

          {/* ── POSITIONS MANAGEMENT (owner only) ── */}
          {isOwner&&(
            <div style={s.card}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={s.settingsLbl}>{t.managePositionsTitle}</div>
                <button style={s.addCoBtn} onClick={()=>setShowAddPos(!showAddPos)}>
                  {showAddPos?`✕ ${t.cancel}`:t.addPositionBtn}
                </button>
              </div>
              {showAddPos&&(
                <div style={{ marginBottom:10 }}>
                  {/* Preset list */}
                  <div style={{ fontSize:11, color:"#71717a", marginBottom:6 }}>
                    {lang==="bn"?"👇 বেছে নিন বা নিজে লিখুন:":"👇 Pick one or type custom:"}
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8 }}>
                    {PRESET_POSITIONS[lang].map(p=>(
                      <button key={p} onClick={()=>setNewPosition(p)}
                        style={{ padding:"5px 11px", borderRadius:20, border:"1px solid #3f3f46", background:newPosition===p?"#f97316":"transparent", color:newPosition===p?"#fff":"#a1a1aa", cursor:"pointer", fontSize:12, fontWeight:600 }}>
                        {p}
                      </button>
                    ))}
                  </div>
                  <div style={s.row}>
                    <input style={{ ...s.inp, flex:1 }} placeholder={t.positionNameP}
                      value={newPosition} onChange={e=>setNewPosition(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&addPosition()} />
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

          {/* ── TEAM MEMBERS + PERMISSIONS (owner sees toggles) ── */}
          {team.length>0&&(
            <div style={s.card}>
              <div style={s.settingsLbl}>{t.teamTitle} ({team.length})</div>
              {team.map((m,idx)=>(
                <div key={m.id} style={{ padding:"10px 0", borderTop:idx>0?"1px solid #27272a":"none" }}>
                  {/* member header */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:isOwner&&m.role!=="owner"&&m.uid!==user.uid?10:0 }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background:"#27272a", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {m.role==="owner"?"🏢":"👨‍💼"}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#f4f4f5" }}>
                        {m.personName}
                        {m.uid===user.uid&&<span style={{ color:"#f97316", fontSize:11 }}> ({t.youLabel})</span>}
                      </div>
                      <div style={{ fontSize:11, color:"#71717a" }}>
                        {m.role==="owner"?t.ownerLabel:(m.position||t.salesmanLabel)} · {m.email}
                      </div>
                    </div>
                  </div>

                  {/* permission toggles — owner only, non-owner members only */}
                  {isOwner&&m.role!=="owner"&&m.uid!==user.uid&&(
                    <div style={{ background:"#09090b", borderRadius:10, padding:"10px 12px" }}>
                      {/* Position change */}
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                        <span style={{ fontSize:12, color:"#71717a", fontWeight:700, textTransform:"uppercase", letterSpacing:0.5 }}>
                          {t.positionLbl}
                        </span>
                        <select
                          style={{ ...s.sel, flex:"unset", width:"auto", fontSize:12, padding:"5px 8px" }}
                          value={m.position||"Salesman"}
                          onChange={async e=>{
                            try { await updateDoc(doc(db,"users",m.id),{position:e.target.value}); toast(t.permSaved); }
                            catch(err) { hErr(err); }
                          }}>
                          <option value="Salesman">{t.defaultPosition}</option>
                          {(localShop?.positions||[]).map(p=><option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div style={{ height:1, background:"#1f1f23", marginBottom:8 }} />
                      <div style={{ fontSize:10, color:"#71717a", marginBottom:8, textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 }}>
                        {t.permissionsTitle}
                      </div>
                      {PERMISSIONS_LIST.map((perm,pi)=>{
                        const mPerms = m.permissions||DEFAULT_PERMISSIONS;
                        const isOn   = mPerms[perm.key]===true;
                        return (
                          <div key={perm.key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 0", borderTop:pi>0?"1px solid #1f1f23":"none" }}>
                            <span style={{ fontSize:12, color:"#d4d4d8" }}>{perm[lang]}</span>
                            <PermToggle isOn={isOn} onToggle={()=>{
                              const newPerms = { ...mPerms, [perm.key]:!isOn };
                              savePermissions(m.id,newPerms);
                            }} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Language */}
          <div style={s.card}>
            <div style={s.settingsLbl}>{t.languageLbl}</div>
            <div style={s.langSw}>
              <button style={{ ...s.lBtn, padding:"10px 18px", flex:1, ...(lang==="bn"?s.lBtnA:{}) }} onClick={()=>setLang("bn")}>বাংলা</button>
              <button style={{ ...s.lBtn, padding:"10px 18px", flex:1, ...(lang==="en"?s.lBtnA:{}) }} onClick={()=>setLang("en")}>English</button>
            </div>
          </div>

          {/* Sync status */}
          <div style={s.card}>
            <div style={s.settingsLbl}>{t.syncStatus}</div>
            <div style={{ fontSize:14, fontWeight:700, color:syncState==="connected"?"#22c55e":syncState==="offline"?"#ef4444":"#f59e0b" }}>
              {syncState==="connected"?t.connected:syncState==="offline"?t.offline:t.connecting}
            </div>
          </div>

          <button style={s.logoutBtn} onClick={handleLogout}>🚪 {t.logout}</button>
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
  root:    { minHeight:"100vh", background:"#09090b", color:"#e4e4e7", fontFamily:"'Segoe UI', system-ui, sans-serif" },
  notif:   { position:"fixed", top:16, right:16, zIndex:999, padding:"12px 20px", borderRadius:10, border:"1px solid", fontSize:13, fontWeight:600, maxWidth:320, boxShadow:"0 4px 20px rgba(0,0,0,0.5)" },
  hdr:     { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderBottom:"1px solid #27272a", background:"#18181b", position:"sticky", top:0, zIndex:10, flexWrap:"wrap", gap:8 },
  hLeft:   { display:"flex", alignItems:"center", gap:10 },
  title:   { fontSize:14, fontWeight:800, color:"#f97316", lineHeight:1.1 },
  sub:     { fontSize:10, color:"#71717a" },
  langSw:  { display:"flex", borderRadius:8, overflow:"hidden", border:"1px solid #3f3f46" },
  lBtn:    { padding:"6px 12px", border:"none", background:"transparent", color:"#a1a1aa", cursor:"pointer", fontSize:12, fontWeight:700 },
  lBtnA:   { background:"#f97316", color:"#fff" },
  tabs:    { display:"flex", gap:5 },
  tab:     { padding:"7px 11px", borderRadius:8, border:"1px solid #3f3f46", background:"transparent", color:"#a1a1aa", cursor:"pointer", fontSize:12, fontWeight:600, position:"relative" },
  tabA:    { background:"#f97316", color:"#fff", border:"1px solid #f97316" },
  badge:   { position:"absolute", top:-6, right:-6, background:"#ef4444", color:"#fff", borderRadius:"50%", width:16, height:16, fontSize:9, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800 },
  panel:   { maxWidth:660, margin:"0 auto", padding:"18px 14px 60px" },
  secTitle:{ fontSize:14, fontWeight:700, color:"#f97316", marginBottom:10 },
  card:    { background:"#18181b", border:"1px solid #27272a", borderRadius:12, padding:14, marginBottom:10 },
  itemBlock:{ background:"#0f0f12", border:"1px solid #27272a", borderRadius:10, padding:10, marginBottom:10 },
  itemHead:{ display:"flex", alignItems:"center", gap:8 },
  iNum:    { width:22, height:22, borderRadius:"50%", background:"#27272a", color:"#f97316", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  inp:     { padding:"10px 12px", borderRadius:8, border:"1px solid #3f3f46", background:"#09090b", color:"#e4e4e7", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" },
  rmBtn:   { padding:"7px 9px", borderRadius:8, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:11, flexShrink:0 },
  addBtn:  { width:"100%", padding:"8px", borderRadius:8, border:"1px dashed #3f3f46", background:"transparent", color:"#71717a", cursor:"pointer", fontSize:12, marginBottom:8 },
  ta:      { width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #3f3f46", background:"#09090b", color:"#e4e4e7", fontSize:13, outline:"none", resize:"none", marginBottom:8, boxSizing:"border-box", fontFamily:"inherit" },
  sendBtn: { width:"100%", padding:"12px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" },
  oHdr:    { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 },
  oId:     { fontSize:14, fontWeight:800, color:"#f4f4f5" },
  sBadge:  { padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:700 },
  iSum:    { display:"flex", gap:8, alignItems:"center", padding:"5px 0", borderTop:"1px solid #27272a", flexWrap:"wrap" },
  iName:   { fontSize:13, color:"#d4d4d8", fontWeight:600 },
  iMeta:   { fontSize:10, color:"#71717a", marginTop:2, display:"flex", flexWrap:"wrap", gap:4 },
  iQty:    { fontSize:12, color:"#71717a" },
  iPrice:  { fontSize:13, fontWeight:700, color:"#22c55e" },
  empty:   { textAlign:"center", padding:"50px 20px", color:"#52525b", fontSize:14 },
  nBadge:  { fontSize:10, background:"#451a03", color:"#f97316", padding:"2px 7px", borderRadius:10, fontWeight:700 },
  div:     { height:1, background:"#27272a", margin:"10px 0" },
  oiCard:  { background:"#09090b", borderRadius:10, padding:12, marginBottom:8, border:"1px solid #27272a" },
  row:     { display:"flex", gap:7, marginBottom:7, alignItems:"center" },
  sel:     { flex:1, padding:"10px 12px", borderRadius:8, border:"1px solid #3f3f46", background:"#18181b", color:"#e4e4e7", fontSize:14, outline:"none", fontFamily:"inherit" },
  waBtn:   { display:"flex", alignItems:"center", gap:4, padding:"8px 12px", borderRadius:8, background:"#15803d", color:"#fff", textDecoration:"none", fontSize:12, fontWeight:700, whiteSpace:"nowrap", flexShrink:0 },
  savBtn:  { padding:"8px 14px", borderRadius:8, border:"none", background:"#1d4ed8", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", flexShrink:0 },
  sRow:    { display:"flex", gap:7 },
  stBtn:   { flex:1, padding:"10px", borderRadius:8, border:"1px solid #3f3f46", background:"#18181b", color:"#a1a1aa", fontSize:12, fontWeight:700, cursor:"pointer" },
  stBtnC:  { background:"#052e16", color:"#22c55e", border:"1px solid #22c55e" },
  stBtnN:  { background:"#450a0a", color:"#ef4444", border:"1px solid #ef4444" },
  delBtn:  { width:"100%", padding:"11px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", marginTop:4 },
  delOrderBtn:{ width:"100%", padding:"10px", borderRadius:10, border:"1px solid #450a0a", background:"transparent", color:"#ef4444", fontSize:12, fontWeight:700, cursor:"pointer", marginTop:8 },
  addCoBtn:{ padding:"7px 14px", borderRadius:8, border:"1px solid #f97316", background:"transparent", color:"#f97316", cursor:"pointer", fontSize:12, fontWeight:700 },
  coIcon:  { width:40, height:40, background:"#27272a", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 },
  edBtn:   { padding:"6px 10px", borderRadius:8, border:"1px solid #3f3f46", background:"#27272a", color:"#e4e4e7", cursor:"pointer", fontSize:13 },
  dlBtn:   { padding:"6px 9px", borderRadius:8, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:13 },
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
  roleCard:    { background:"#18181b", border:"1px solid #27272a", borderRadius:14, padding:"22px 18px", cursor:"pointer", color:"#e4e4e7", textAlign:"left", fontFamily:"inherit" },
  roleEmoji:   { fontSize:38, marginBottom:8 },
  roleName:    { fontSize:16, fontWeight:700, color:"#f4f4f5", marginBottom:4 },
  roleDesc:    { fontSize:12, color:"#a1a1aa" },
  settingsLbl: { fontSize:11, color:"#71717a", marginBottom:10, textTransform:"uppercase", letterSpacing:0.5, fontWeight:700 },
  inviteBox:   { fontSize:22, fontWeight:800, color:"#f97316", textAlign:"center", padding:"16px", background:"#09090b", borderRadius:10, border:"2px dashed #f97316", letterSpacing:2, fontFamily:"monospace" },
  logoutBtn:   { width:"100%", padding:"13px", borderRadius:10, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", fontSize:14, fontWeight:700, cursor:"pointer", marginTop:16 },
};
