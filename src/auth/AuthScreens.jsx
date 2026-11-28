import { _globalS, DEFAULT_PERMISSIONS, LOGO_URL, APP_NAME } from "../shared/appShared.jsx";
import { useState, useEffect } from "react";
import { auth, friendlyAuthError, COUNTRIES } from "../firebase-config";
import { sendEmailVerification, requestSignupCode, sendPasswordResetEmail } from "../backend/auth";
import { Header } from "../components/AppHeader.jsx";
import { registerLocalOwnerAccount, registerLocalSalesmanAccount, friendlyLocalAuthError, loginWithCredentials } from "./localAuthBootstrap";
import { saveShopRecord } from "../offline/shopService";
import { isAcceptablePassword, PASSWORD_HINT } from "./passwordRules.js";
import { updateLocalUserPassword } from "./localAuthService";
import { shouldOfferCloudSignup } from "../offline/cloudAccessPolicy.js";
import { getLocalAccessStatus } from "./licenseService.js";

const AUTH_PAGE_BG =
  "linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.60)), url('https://raw.githubusercontent.com/s4businessthinking-cmyk/S4BUSINESSTHINKING/main/WhatsApp%20Image%202026-04-09%20at%2011.44.45%20AM.jpeg')";

function useAuthCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 520px)");
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return compact;
}

function authTwinPanel(compact, minTall) {
  return {
    flex: "1 1 50%",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    padding: compact ? "12px 12px 10px" : "16px 16px 14px",
    borderRadius: 12,
    background: "rgba(15, 23, 42, 0.88)",
    border: "1px solid rgba(255,255,255,0.16)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
    textAlign: "left",
    boxSizing: "border-box",
    minHeight: minTall ? (compact ? 380 : 420) : compact ? 320 : 360,
  };
}

function authPanelHeading(compact) {
  return {
    fontSize: compact ? 10 : 11,
    fontWeight: 800,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#94a3b8",
    marginBottom: compact ? 10 : 12,
    paddingBottom: compact ? 6 : 8,
    borderBottom: "1px solid rgba(255,255,255,0.12)",
  };
}

function authGuideItem(compact) {
  return {
    fontSize: compact ? 10 : 12,
    lineHeight: 1.4,
    color: "#e2e8f0",
    margin: "0 0 8px",
    padding: 0,
    listStyle: "none",
  };
}

function authGuideLabel(compact) {
  return {
    display: "block",
    fontSize: compact ? 10 : 11,
    fontWeight: 800,
    color: "#f97316",
    marginBottom: 2,
  };
}

function authPageWrap(compact, baseWrap) {
  return {
    ...baseWrap,
    maxWidth: 940,
    width: "100%",
    boxSizing: "border-box",
    padding: compact ? "12px 10px 24px" : "20px 18px 40px",
    paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px) + 16px)",
  };
}

function AuthLogoBlock({ compact, bigLogoStyle }) {
  return (
    <div style={{ textAlign: "center", marginBottom: compact ? 10 : 16 }}>
      <img
        src={LOGO_URL}
        alt={APP_NAME}
        style={{
          ...bigLogoStyle,
          width: compact ? 88 : 110,
          height: compact ? 88 : 110,
          margin: "0 auto",
          display: "block",
        }}
      />
    </div>
  );
}

// ─── SETUP ───────────────────────────────────────────────────
export function SetupScreen({ t, lang, setLang, s:sp, theme, setTheme }) {
  const _s = sp||_globalS;
  return (
    <div style={_s.root}><Header t={t} lang={lang} setLang={setLang} s={_s} theme={theme} setTheme={setTheme} />
      <div style={_s.authWrap}>
        <div style={_s.authIcon}></div>
        <div style={{ ..._s.authTitle, color:"#f97316" }}>Firebase Setup Required</div>
        <div style={_s.authSub}>SETUP.md ফাইল দেখে Firebase config যোগ করুন।</div>
      </div>
    </div>
  );
}

// ─── LOGIN ───────────────────────────────────────────────────
export function LoginScreen({ t, lang, setLang, toast, s:sp, theme, setTheme, onLoginSuccess, onSwitchToSignup, onEmailVerificationRequired }) {
  const _s = sp||_globalS;
  const [cloudSignupAllowed, setCloudSignupAllowed] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState(null);
  const [trialStatus, setTrialStatus] = useState("");
  const [username,setUsername]=useState("");
  const [pw,setPw]=useState("");
  const [busy,setBusy]=useState(false);
  const [showPw,setShowPw]=useState(false);
  const compact = useAuthCompact();

  const refreshAccessState = async () => {
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    const access = await getLocalAccessStatus();
    setCloudSignupAllowed(shouldOfferCloudSignup(access, { online }));
    setTrialStatus(access?.trialStatus || access?.trial?.status || "");
    const days = access?.trial?.daysRemaining;
    setTrialDaysLeft(typeof days === "number" ? days : null);
  };

  useEffect(() => {
    refreshAccessState().catch(() => {});
    const onOnline = () => {
      refreshAccessState().catch(() => {});
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
    };
  }, []);

  const twinPanel = authTwinPanel(compact, false);
  const panelHeading = authPanelHeading(compact);
  const guideItem = authGuideItem(compact);
  const guideLabel = authGuideLabel(compact);
  const loginGuideItems = [
    { key: "owner", label: t.loginGuideOwnerLbl, text: t.loginOfflineHint },
    ...(!cloudSignupAllowed
      ? [{ key: "trial", label: t.loginGuideTrialLbl, text: t.localOnlyLoginHint }]
      : []),
    ...(cloudSignupAllowed ? [{ key: "staff", label: t.loginGuideStaffLbl, text: t.loginStaffHint }] : []),
    { key: "branch", label: t.loginGuideBranchLbl, text: t.loginBranchHint },
  ];

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
    backgroundImage: AUTH_PAGE_BG,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  }}
>
  <Header t={t} lang={lang} setLang={setLang} s={_s} theme={theme} setTheme={setTheme} />
      <div style={authPageWrap(compact, _s.authWrap)}>
        <AuthLogoBlock compact={compact} bigLogoStyle={_s.bigLogo} />

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            gap: compact ? 10 : 16,
            width: "100%",
          }}
        >
          <div style={twinPanel}>
            <div style={panelHeading}>{t.loginPanelTitle}</div>
            <div style={{ fontSize: compact ? 18 : 22, fontWeight: 800, color: _s.authTitle?.color || "#60a5fa", marginBottom: 4 }}>
              {t.welcomeBack}
            </div>
            <div style={{ fontSize: compact ? 11 : 13, color: "#cbd5e1", marginBottom: compact ? 8 : 10, lineHeight: 1.4 }}>
              {t.welcomeBackSub}
            </div>
            {trialStatus === "TRIAL_ACTIVE" && trialDaysLeft != null && (
              <div
                style={{
                  marginBottom: compact ? 10 : 12,
                  fontSize: compact ? 10 : 12,
                  color: "#4ade80",
                  fontWeight: 700,
                  lineHeight: 1.4,
                }}
              >
                {(t.trialLoginBanner || "").replace("{days}", String(trialDaysLeft))}
              </div>
            )}
            <form
              onSubmit={submit}
              style={{ display: "flex", flexDirection: "column", flex: 1, margin: 0, padding: 0, border: "none", background: "transparent" }}
            >
              <input
                style={{ ..._s.inp, marginBottom: compact ? 8 : 10, fontSize: compact ? 13 : 14 }}
                type="text"
                placeholder={t.usernameOrEmailLbl}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
              />
              <input
                style={{ ..._s.inp, marginBottom: compact ? 6 : 8, fontSize: compact ? 13 : 14 }}
                type={showPw ? "text" : "password"}
                placeholder={t.passwordLbl}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="current-password"
              />
              <label style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: compact ? 10 : 12, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={showPw}
                  onChange={(e) => setShowPw(e.target.checked)}
                  style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#f97316" }}
                />
                <span style={{ fontSize: compact ? 11 : 12, color: "#94a3b8" }}>
                  {lang === "bn" ? "পাসওয়ার্ড দেখুন" : "Show Password"}
                </span>
              </label>
              <div style={{ flex: 1, minHeight: compact ? 4 : 8 }} />
              <button type="submit" style={{ ..._s.sendBtn, padding: compact ? "11px" : "12px", marginTop: "auto" }} disabled={busy}>
                {busy ? t.loggingIn : t.signIn}
              </button>
            </form>
            {cloudSignupAllowed && (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: "1px solid rgba(255,255,255,0.12)",
                  color: "#cbd5e1",
                  fontSize: compact ? 11 : 12,
                }}
              >
                {t.noAccount}{" "}
                <button type="button" style={_s.linkBtnInline} onClick={onSwitchToSignup}>
                  {t.createAccount}
                </button>
              </div>
            )}
          </div>

          <div style={twinPanel}>
            <div style={panelHeading}>{t.loginGuideTitle}</div>
            <ul style={{ margin: 0, padding: 0, flex: 1 }}>
              {loginGuideItems.map((item) => (
                <li key={item.key} style={guideItem}>
                  <span style={guideLabel}>{item.label}</span>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
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
      return toast(PASSWORD_HINT[lang === "bn" ? "bn" : "en"], "err");
    }
    if (newPw !== newPw2) {
      return toast(lang === "bn" ? "পাসওয়ার্ড দুটো একই হতে হবে" : "Passwords must match", "err");
    }
    setBusy(true);
    if (!profile?.localUserId) {
      return toast(lang === "bn" ? "Local user পাওয়া যায়নি — Logout করে আবার Login করুন" : "Local user missing — log out and sign in again", "err");
    }
    try {
      const updatedUser = await updateLocalUserPassword(profile.localUserId, newPw, {
        mustChangePassword: false,
        clearEmergencyBootstrap: true,
      });
      if (!updatedUser?.id) {
        return toast(lang === "bn" ? "পাসওয়ার্ড সেভ হয়নি" : "Password was not saved", "err");
      }
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
        <div style={_s.authIcon}></div>
        <div style={_s.authTitle}>{t.changePwTitle}</div>
        <div style={_s.authSub}>{t.changePwSub}</div>
        <div style={{ ..._s.authSub, marginBottom:8, fontSize:11 }}>{t.changePwMatchHint || PASSWORD_HINT[lang === "bn" ? "bn" : "en"]}</div>
        <form onSubmit={submit} style={_s.authCard}>
          <div style={{ fontSize:11, color:"#a1a1aa", marginBottom:4 }}>{t.changePwNewLbl || (lang==="bn"?"নতুন পাসওয়ার্ড":"New password")}</div>
          <input style={{ ..._s.inp, marginBottom:10 }} type={showPw?"text":"password"} placeholder={t.changePwNewLbl || t.passwordLbl} value={newPw} onChange={e=>setNewPw(e.target.value)} autoComplete="new-password" />
          <div style={{ fontSize:11, color:"#a1a1aa", marginBottom:4 }}>{t.changePwConfirmLbl || (lang==="bn"?"আবার একই পাসওয়ার্ড":"Confirm same password")}</div>
          <input style={{ ..._s.inp, marginBottom:6 }} type={showPw?"text":"password"} placeholder={t.changePwConfirmLbl || t.confirmPwLbl} value={newPw2} onChange={e=>setNewPw2(e.target.value)} autoComplete="new-password" />
          <label style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12, cursor:"pointer", userSelect:"none" }}>
            <input type="checkbox"checked={showPw} onChange={e=>setShowPw(e.target.checked)} style={{ width:15, height:15, cursor:"pointer", accentColor:"#f97316" }} />
            <span style={{ fontSize:12, color:"#71717a" }}>{lang==="bn"?"পাসওয়ার্ড দেখুন":"Show Password"}</span>
          </label>
          <button type="submit"style={_s.sendBtn} disabled={busy}>{busy?"...":t.changePwBtn}</button>
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
      toast(lang==="bn"?"দোকান সেটআপ সম্পন্ন!":"Shop setup complete!");
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
        <div style={_s.authIcon}></div>
        <div style={_s.authTitle}>{t.shopSetupTitle}</div>
        <div style={_s.authSub}>{t.shopSetupSub}</div>
        <form onSubmit={submit} style={_s.authCard}>
          <input style={sinp} placeholder={t.companyName} value={form.companyName} onChange={e=>setForm(p=>({...p,companyName:e.target.value}))} />
          <select style={{ ..._s.sel, marginBottom: 10, width: "100%" }} value={form.country} onChange={e=>setForm(p=>({...p,country:e.target.value}))}>
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.dial})</option>)}
          </select>
          <input style={sinp} placeholder={t.areaLbl} value={form.area} onChange={e=>setForm(p=>({...p,area:e.target.value}))} />
          <input style={sinp} type="tel"placeholder={t.mobileLbl} value={form.mobile} onChange={e=>setForm(p=>({...p,mobile:e.target.value}))} />
          <input style={sinp} type="email"placeholder={lang==="bn"?"ইমেইল (ঐচ্ছিক)":"Email (optional)"} value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} />
          <button type="submit"style={_s.sendBtn} disabled={busy}>{busy?"...":t.shopSetupBtn}</button>
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
        <div style={_s.authIcon}></div>
        <div style={_s.authTitle}>{t.resetTitle}</div>
        <div style={_s.authSub}>{t.resetMsg}</div>
        <form onSubmit={submit} style={_s.authCard}>
          <input style={{ ..._s.inp, marginBottom:10 }} type="email"placeholder={t.emailLbl} value={email} onChange={e=>setEmail(e.target.value)} />
          <button type="submit"style={_s.sendBtn} disabled={busy}>{busy?"...":t.resetBtn}</button>
        </form>
        <button style={{ ..._s.linkBtn, marginTop:16 }} onClick={onBack}>{t.backBtn}</button>
      </div>
    </div>
  );
}

// ─── ROLE PICKER ─────────────────────────────────────────────
export function SignupRolePicker({ t, lang, setLang, onPick, onSwitchToLogin, s:sp, theme, setTheme }) {
  const _s = sp||_globalS;
  const compact = useAuthCompact();
  const twinPanel = authTwinPanel(compact, false);
  const panelHeading = authPanelHeading(compact);
  const guideItem = authGuideItem(compact);
  const guideLabel = authGuideLabel(compact);
  const roleBtn = {
    ..._s.roleCard,
    padding: compact ? "14px 12px" : "18px 14px",
    marginBottom: compact ? 8 : 10,
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        ..._s.root,
        minHeight: "100vh",
        backgroundImage: AUTH_PAGE_BG,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <Header t={t} lang={lang} setLang={setLang} s={_s} theme={theme} setTheme={setTheme} />
      <div style={authPageWrap(compact, _s.authWrap)}>
        <AuthLogoBlock compact={compact} bigLogoStyle={_s.bigLogo} />
        <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch", gap: compact ? 10 : 16, width: "100%" }}>
          <div style={twinPanel}>
            <div style={panelHeading}>{t.signupPanelTitle}</div>
            <div style={{ fontSize: compact ? 18 : 22, fontWeight: 800, color: _s.authTitle?.color || "#60a5fa", marginBottom: 4 }}>
              {t.chooseRole}
            </div>
            <div style={{ fontSize: compact ? 11 : 13, color: "#cbd5e1", marginBottom: compact ? 10 : 14, lineHeight: 1.4 }}>
              {t.chooseRoleSub}
            </div>
            <div style={{ ..._s.roleGrid, marginTop: 0, flex: 1 }}>
              <button type="button" style={roleBtn} onClick={() => onPick("owner")}>
                <div style={{ ..._s.roleName, fontSize: compact ? 14 : 16 }}>{t.roleOwnerCard}</div>
                <div style={{ ..._s.roleDesc, fontSize: compact ? 10 : 12 }}>{t.roleOwnerDesc}</div>
              </button>
              <button type="button" style={roleBtn} onClick={() => onPick("salesman")}>
                <div style={{ ..._s.roleName, fontSize: compact ? 14 : 16 }}>{t.roleSalesCard}</div>
                <div style={{ ..._s.roleDesc, fontSize: compact ? 10 : 12 }}>{t.roleSalesDesc}</div>
              </button>
            </div>
            <div
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: "1px solid rgba(255,255,255,0.12)",
                color: "#cbd5e1",
                fontSize: compact ? 11 : 12,
              }}
            >
              {t.haveAccount}{" "}
              <button type="button" style={_s.linkBtnInline} onClick={onSwitchToLogin}>
                {t.loginNow}
              </button>
            </div>
          </div>
          <div style={twinPanel}>
            <div style={panelHeading}>{t.signupGuideRoleTitle}</div>
            <ul style={{ margin: 0, padding: 0, flex: 1 }}>
              <li style={guideItem}>
                <span style={guideLabel}>{t.loginGuideOwnerLbl}</span>
                {t.signupGuidePickOwner}
              </li>
              <li style={guideItem}>
                <span style={guideLabel}>{t.loginGuideStaffLbl}</span>
                {t.signupGuidePickStaff}
              </li>
              <li style={guideItem}>
                <span style={guideLabel}>{lang === "bn" ? "অনলাইন" : "Online"}</span>
                {t.signupGuideOnline}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SIGNUP FORM ─────────────────────────────────────────────
export function SignupForm({ t, lang, setLang, role, onBack, onSwitchToLogin, toast, s:sp, theme, setTheme, onSignupSuccess, onEmailVerificationRequired }) {
  const _s = sp||_globalS;
  const compact = useAuthCompact();
  const twinPanel = authTwinPanel(compact, true);
  const panelHeading = authPanelHeading(compact);
  const guideItem = authGuideItem(compact);
  const guideLabel = authGuideLabel(compact);
  const span2 = { gridColumn: compact ? "1" : "1 / -1" };
  const fieldMb = compact ? 6 : 8;
  const formGrid = {
    display: "grid",
    gridTemplateColumns: compact ? "1fr" : "1fr 1fr",
    columnGap: compact ? 0 : 10,
    rowGap: 0,
    flex: 1,
    alignContent: "start",
  };
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
      toast(bnL?` ${cleanEmail} এ ৬ সংখ্যার কোড পাঠানো হয়েছে`:`A 6-digit code was sent to ${cleanEmail}`);
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
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return toast(
        bnL
          ? "অ্যাকাউন্ট তৈরি করতে ইন্টারনেট চালু করুন"
          : "Turn on internet to create an account",
        "err"
      );
    }
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
          toast(lang==="bn"?"এই Invite Code আগেই ব্যবহার হয়ে গেছে। মালিকের কাছ থেকে নতুন code নিন।":"This invite code has already been used. Please get a new one from the owner.","err");
        } else if (result.code === "invite/not-found") {
          toast(lang==="bn"?"Invite Code সঠিক নয়":"Invalid invite code","err");
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
        toast(lang==="bn"?"এই Invite Code আগেই ব্যবহার হয়ে গেছে। মালিকের কাছ থেকে নতুন code নিন।":"This invite code has already been used. Please get a new one from the owner.","err");
      } else if (err.code === "invite/not-found") {
        toast(lang==="bn"?"Invite Code সঠিক নয়":"Invalid invite code","err");
      } else if (err.code === "OFFLINE_REQUIRED") {
        toast(friendlyLocalAuthError({ reason: "OFFLINE_REQUIRED" }, lang), "err");
      } else if (err.code === "auth/email-already-in-use") {
        toast(friendlyAuthError(err, lang), "err");
      } else if (err.code === "auth/invalid-email-code") {
        setEmailCode("");
        toast(bnL?"কোড ভুল — ইমেইলের কোডটা আবার দেখে দিন":"Wrong code — check the email again","err");
      } else if (err.code === "auth/email-code-expired") {
        setCodeSentTo("");
        toast(bnL?"কোডের মেয়াদ শেষ — আবার \"অ্যাকাউন্ট তৈরি\"চাপুন, নতুন কোড যাবে":"The code expired — press Create account again for a new code","err");
      } else {
        toast(err?.message || friendlyAuthError(err,lang),"err");
      }
    }
    finally { setBusy(false); }
  };

  const signupGuideItems = [
    { key: "online", label: lang === "bn" ? "অনলাইন" : "Online", text: t.signupGuideOnline },
    isOwner
      ? { key: "role", label: t.loginGuideOwnerLbl, text: t.signupGuideOwnerNote }
      : { key: "role", label: t.loginGuideStaffLbl, text: t.signupGuideStaffNote },
    { key: "pwd", label: lang === "bn" ? "পাসওয়ার্ড" : "Password", text: t.signupGuidePwd },
  ];

  const inp = (extra = {}) => ({
    ..._s.inp,
    marginBottom: fieldMb,
    fontSize: compact ? 13 : 14,
    width: "100%",
    boxSizing: "border-box",
    ...extra,
  });

  return (
    <div
      style={{
        ..._s.root,
        minHeight: "100vh",
        backgroundImage: AUTH_PAGE_BG,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <Header t={t} lang={lang} setLang={setLang} s={_s} theme={theme} setTheme={setTheme} />
      <div style={authPageWrap(compact, _s.authWrap)}>
        <AuthLogoBlock compact={compact} bigLogoStyle={_s.bigLogo} />
        <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch", gap: compact ? 10 : 16, width: "100%" }}>
          <div style={twinPanel}>
            <div style={panelHeading}>{t.signupPanelTitle}</div>
            <div style={{ fontSize: compact ? 16 : 20, fontWeight: 800, color: "#60a5fa", marginBottom: compact ? 8 : 10 }}>
              {isOwner ? t.roleOwnerCard : t.roleSalesCard}
            </div>
            <form onSubmit={submit} style={{ ...formGrid, margin: 0, padding: 0, border: "none", background: "transparent" }}>
              {isOwner && (
                <input
                  style={{ ...inp(), ...span2 }}
                  placeholder={t.companyName}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              )}
              {!isOwner && (
                <>
                  <input
                    style={{ ...inp({ textTransform: "uppercase", fontWeight: 700, letterSpacing: 1 }), ...span2 }}
                    placeholder="INVITE CODE"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  />
                  <div style={{ ...span2, fontSize: 10, color: "#94a3b8", marginTop: -4, marginBottom: fieldMb }}>
                    {t.inviteCodeLbl}
                  </div>
                </>
              )}
              <input style={inp()} placeholder={t.personName} value={personName} onChange={(e) => setPersonName(e.target.value)} />
              <input
                style={inp()}
                type="text"
                placeholder={t.usernameLbl}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
              />
              <select style={{ ..._s.sel, ...inp(), ...span2 }} value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.dial})
                  </option>
                ))}
              </select>
              <input style={inp()} placeholder={t.areaLbl} value={area} onChange={(e) => setArea(e.target.value)} />
              <input style={inp()} type="tel" placeholder={t.mobileLbl} value={mobile} onChange={(e) => setMobile(e.target.value)} />
              <input
                style={{ ...inp(), ...span2 }}
                type="email"
                placeholder={bnL ? "ইমেইল (যাচাই কোড যাবে)" : "Email (a code will be sent)"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
              />
              <input style={inp()} type={showPw ? "text" : "password"} placeholder={t.passwordLbl} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
              <input style={inp()} type={showPw ? "text" : "password"} placeholder={t.confirmPwLbl} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
              <label
                style={{
                  ...span2,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  marginBottom: fieldMb,
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={showPw}
                  onChange={(e) => setShowPw(e.target.checked)}
                  style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#f97316" }}
                />
                <span style={{ fontSize: compact ? 11 : 12, color: "#94a3b8" }}>{lang === "bn" ? "পাসওয়ার্ড দেখুন" : "Show Password"}</span>
              </label>
              {codeStep && (
                <div
                  style={{
                    ...span2,
                    border: "1px solid rgba(96,165,250,0.45)",
                    background: "rgba(30,58,138,0.35)",
                    borderRadius: 10,
                    padding: compact ? "8px 10px" : "10px 12px",
                    marginBottom: fieldMb,
                  }}
                >
                  <div style={{ fontSize: compact ? 10 : 11, color: "#bfdbfe", fontWeight: 700, marginBottom: 6, lineHeight: 1.35 }}>
                    {bnL
                      ? `${codeSentTo} এ পাঠানো ৬ সংখ্যার কোড দিন (১০ মিনিট, Spam ফোল্ডার)`
                      : `6-digit code sent to ${codeSentTo} (10 min, check spam)`}
                  </div>
                  <input
                    style={{ ...inp({ marginBottom: 6, textAlign: "center", fontSize: compact ? 18 : 22, letterSpacing: 6, fontWeight: 800 }) }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <button
                    type="button"
                    style={{ ..._s.linkBtn, margin: 0, padding: 0, fontSize: 11, opacity: resendIn > 0 ? 0.5 : 1 }}
                    disabled={busy || resendIn > 0}
                    onClick={resend}
                  >
                    {resendIn > 0
                      ? bnL
                        ? `আবার কোড (${resendIn}s)`
                        : `Resend (${resendIn}s)`
                      : bnL
                        ? "আবার কোড পাঠান"
                        : "Resend code"}
                  </button>
                </div>
              )}
              <button type="submit" style={{ ..._s.sendBtn, ...span2, marginTop: compact ? 4 : 6 }} disabled={busy}>
                {busy ? t.creatingAccount : codeStep ? t.createAccount : bnL ? "ইমেইল যাচাই করে এগিয়ে যান" : "Verify email & continue"}
              </button>
            </form>
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: "1px solid rgba(255,255,255,0.12)",
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                justifyContent: "space-between",
                fontSize: compact ? 11 : 12,
                color: "#cbd5e1",
              }}
            >
              <button type="button" style={{ ..._s.linkBtnInline, padding: 0 }} onClick={onBack}>
                {t.backBtn}
              </button>
              <span>
                {t.haveAccount}{" "}
                <button type="button" style={_s.linkBtnInline} onClick={onSwitchToLogin}>
                  {t.loginNow}
                </button>
              </span>
            </div>
          </div>
          <div style={twinPanel}>
            <div style={panelHeading}>{t.signupGuideTitle}</div>
            <ul style={{ margin: 0, padding: 0, flex: 1 }}>
              {signupGuideItems.map((item) => (
                <li key={item.key} style={guideItem}>
                  <span style={guideLabel}>{item.label}</span>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
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
        <div style={_s.authIcon}></div>
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
