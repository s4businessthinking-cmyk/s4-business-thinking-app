import { _globalS, DEFAULT_PERMISSIONS, LOGO_URL, APP_NAME } from "../shared/appShared.jsx";
import { useState, useEffect } from "react";
import { auth, friendlyAuthError, COUNTRIES } from "../firebase-config";
import { sendEmailVerification, requestSignupCode, sendPasswordResetEmail } from "../backend/auth";
import { Header } from "../components/AppHeader.jsx";
import { registerLocalOwnerAccount, registerLocalSalesmanAccount, friendlyLocalAuthError, loginWithCredentials } from "./localAuthBootstrap";
import { saveShopRecord } from "../offline/shopService";
import { isAcceptablePassword } from "./passwordRules.js";
import { updateLocalUserPassword } from "./localAuthService";

// ─── SETUP ───────────────────────────────────────────────────
export function SetupScreen({ t, lang, setLang, s:sp, theme, setTheme }) {
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
export function LoginScreen({ t, lang, setLang, toast, s:sp, theme, setTheme, onLoginSuccess, onSwitchToSignup, onEmailVerificationRequired }) {
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
export function ChangePasswordScreen({ t, lang, setLang, profile, toast, s:sp, theme, setTheme, onPasswordChanged, onLogout }) {
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
export function ShopSetupWizard({ t, lang, setLang, localShop, shopId, profile, user, toast, s:sp, theme, setTheme, onShopSaved }) {
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
export function ResetScreen({ t, lang, setLang, onBack, toast, s:sp, theme, setTheme }) {
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
export function SignupRolePicker({ t, lang, setLang, onPick, onSwitchToLogin, s:sp, theme, setTheme }) {
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
export function SignupForm({ t, lang, setLang, role, onBack, onSwitchToLogin, toast, s:sp, theme, setTheme, onSignupSuccess, onEmailVerificationRequired }) {
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
export function VerifyGate({ t, lang, setLang, user, toast, onLogout, s:sp, theme, setTheme }) {
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
