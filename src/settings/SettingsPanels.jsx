import { useState, useEffect } from "react";
import { getFailingSyncSamples } from "../offline/cloudPullService";
import { isAcceptablePassword } from "../auth/passwordRules.js";
import { updateOwnPassword } from "../auth/userManagementService";
import { licenseActivationErrorText } from "../auth/licensePayloadRules.js";
import {
  activateLicenseOffline,
  getLocalAccessStatus,
  getLocalLicenseStatus,
} from "../auth/licenseService.js";

export const SUPPORT_CONTACTS = {
  whatsapp: "8801860531723",
  whatsappDisplay: "+8801860531723",
  facebook: "https://www.facebook.com/share/18rxnEiW3b/",
  email: "s4businessthinking@gmail.com",
  website: "https://s4businessthinking.com",
  websiteDisplay: "s4businessthinking.com",
};

export function openExternalLink(url) {
  if (typeof window === "undefined" || !url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function buildSupportWhatsappUrl(lang) {
  const text = lang === "bn"
    ? "S4 Business Thinking - সাহায্য/complaint: "
    : "S4 Business Thinking - Help/complaint: ";
  return `https://wa.me/${SUPPORT_CONTACTS.whatsapp}?text=${encodeURIComponent(text)}`;
}

export function buildLicenseSupportWhatsappUrl(lang, { deviceId = "", accessReason = "", licenseStatus = "" } = {}) {
  const bits = [
    lang === "bn"
      ? "S4 Business Thinking — লাইসেন্স/ট্রায়াল নিয়ে সাহায্য চাই।"
      : "S4 Business Thinking — need help with license/trial.",
    deviceId ? `${lang === "bn" ? "ডিভাইস আইডি" : "Device ID"}: ${deviceId}` : "",
    accessReason ? `${lang === "bn" ? "স্ট্যাটাস" : "Status"}: ${accessReason}${licenseStatus ? ` / ${licenseStatus}` : ""}` : "",
  ].filter(Boolean);
  return `https://wa.me/${SUPPORT_CONTACTS.whatsapp}?text=${encodeURIComponent(bits.join("\n"))}`;
}

/** Shown when trial/license blocks the app — same contacts as Settings → Help. */
export function LicenseSupportContactsPanel({ t, lang, th, s, licenseAccess, toast }) {
  const isBn = lang === "bn";
  const deviceId = licenseAccess?.trial?.deviceId || licenseAccess?.license?.deviceId || "";
  const accessReason = licenseAccess?.accessReason || "";
  const licenseStatus = licenseAccess?.licenseStatus || "";

  const contactBtn = {
    ...s.stBtn,
    width: "100%",
    textAlign: "left",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    marginBottom: 8,
  };

  const copyDevice = async () => {
    if (!deviceId) return;
    try {
      await navigator.clipboard.writeText(deviceId);
      toast?.(isBn ? "ডিভাইস আইডি কপি হয়েছে" : "Device ID copied");
    } catch {
      toast?.(isBn ? "কপি হয়নি" : "Copy failed", "err");
    }
  };

  return (
    <div style={{ ...s.card, marginTop: 12, border: "1px solid rgba(249,115,22,0.35)" }}>
      <div style={s.settingsLbl}>{t?.helpTitle || (isBn ? "সাহায্য ও সাপোর্ট" : "Help & Support")}</div>
      <div style={{ fontSize: 12, color: th.txtMuted, lineHeight: 1.55, marginBottom: 12 }}>
        {isBn
          ? "নতুন লাইসেন্স বা রিনিউ করতে, অথবা ডিভাইস আইডি পাঠাতে — নিচের যেকোনো উপায়ে আমাদের লিখুন।"
          : "For a new license, renewal, or to send your device ID — contact us using any option below."}
      </div>

      <button
        type="button"
        style={{ ...contactBtn, background: "rgba(34,197,94,0.12)", borderColor: "#22c55e", color: "#22c55e" }}
        onClick={() => openExternalLink(buildLicenseSupportWhatsappUrl(lang, { deviceId, accessReason, licenseStatus }))}
      >
        <span>{t?.helpWhatsappBtn || "WhatsApp Message"}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.9 }}>{SUPPORT_CONTACTS.whatsappDisplay}</span>
      </button>
      {t?.helpWhatsappNote && (
        <div style={{ fontSize: 10, color: "#f59e0b", margin: "-4px 0 10px", lineHeight: 1.4 }}>{t.helpWhatsappNote}</div>
      )}

      <button
        type="button"
        style={contactBtn}
        onClick={() => openExternalLink(`mailto:${SUPPORT_CONTACTS.email}?subject=${encodeURIComponent("S4 Business Thinking - License renewal")}&body=${encodeURIComponent(deviceId ? `Device ID: ${deviceId}\n` : "")}`)}
      >
        <span>{t?.helpEmailBtn || "Email"}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.85 }}>{SUPPORT_CONTACTS.email}</span>
      </button>

      <button
        type="button"
        style={contactBtn}
        onClick={() => openExternalLink(SUPPORT_CONTACTS.website)}
      >
        <span>{t?.helpWebsiteBtn || (isBn ? "ওয়েবসাইট" : "Website")}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.85 }}>{SUPPORT_CONTACTS.websiteDisplay}</span>
      </button>

      {deviceId && (
        <div style={{ marginTop: 4, padding: 10, borderRadius: 10, background: th.bgInp, border: `1px solid ${th.border}` }}>
          <div style={{ fontSize: 10, color: th.txtMuted, fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>
            {isBn ? "ডিভাইস আইডি (সাপোর্টে পাঠান)" : "Device ID (send to support)"}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{ flex: 1, fontSize: 11, wordBreak: "break-all", color: th.txtPrimary }}>{deviceId}</code>
            <button type="button" style={s.addCoBtn} onClick={copyDevice}>{isBn ? "কপি" : "Copy"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LicenseActivationPanel({ lang, th, s, toast, locked = false, onActivated, localShop = null, profile = null }) {
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
    bindTitle: isBn ? "কী বানানোর সময় বসতেছে (অবশ্যই মিলতে হবে)" : "Required in the license key (must match)",
    company: isBn ? "কোম্পানি" : "Company",
    mobile: isBn ? "মোবাইল" : "Mobile",
    bindHint: isBn
      ? "কী generator-এ Company Name, Mobile, Device ID ও Fingerprint বসিয়ে কী বানান। অন্য ডিভাইসে কাজ করবে না।"
      : "Generate the key with company name, mobile, device ID and fingerprint. It will not work on another device.",
  };

  const companyForKey = String(localShop?.companyName || "").trim();
  const mobileForKey = String(profile?.mobile || localShop?.mobile || "").trim();

  const loadStatus = async () => {
    setLoading(true);
    try {
      const latestLicense = await getLocalLicenseStatus();
      const latestAccess = await getLocalAccessStatus();
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
      toast(` ${label}: ${txt.copied}`);
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
      const result = await activateLicenseOffline(key, {
        shopName: companyForKey,
        phone: mobileForKey,
      });
      const latestLicense = helper.getStatus ? await helper.getStatus() : result;
      const latestAccess = helper.accessStatus ? await helper.accessStatus() : null;
      setStatus(latestLicense);
      setAccessStatus(latestAccess);
      const failText = licenseActivationErrorText(result?.reason, lang) || txt.invalid;
      setMessage({
        type: result?.ok ? "ok" : "err",
        text: result?.ok ? txt.activated : failText,
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

      <div style={{ background:th.bgInp, borderRadius:10, padding:12, marginBottom:12, border:`1px solid ${th.border}` }}>
        <div style={{ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:800, marginBottom:6 }}>{txt.bindTitle}</div>
        <div style={{ fontSize:12, color:th.txtPrimary, lineHeight:1.55 }}>
          <div>{txt.company}: <b>{companyForKey || "—"}</b></div>
          <div>{txt.mobile}: <b>{mobileForKey || "—"}</b></div>
        </div>
        <div style={{ fontSize:11, color:th.txtMuted, marginTop:8, lineHeight:1.45 }}>{txt.bindHint}</div>
      </div>

      <form onSubmit={activate}>
        <div style={{ fontSize:10, color:th.txtMuted, fontWeight:800, textTransform:"uppercase", marginBottom:4 }}>{txt.keyLabel}</div>
        <textarea
          style={{ ...s.ta, minHeight:92, fontFamily:"monospace", fontSize:11 }}
          value={licenseKey}
          onChange={e=>setLicenseKey(e.target.value)}
          placeholder={txt.keyPlaceholder}
        />
        <button type="submit"style={s.sendBtn} disabled={activating}>
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

// ─── PROFILE PASSWORD ────────────────────────────────────────
export function ProfilePasswordSettings({ t, lang, profile, toast, th, s }) {
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
      return toast(lang==="bn"?"নতুন password অন্তত ৮ অক্ষর":"New password must be at least 8 characters","err");
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
      <div style={s.settingsLbl}>{lang==="bn"?"পাসওয়ার্ড পরিবর্তন":"Change Password"}</div>
      <form onSubmit={submit}>
        <input style={inp} type="password"placeholder={t.currentPwLbl} value={currentPw} onChange={e=>setCurrentPw(e.target.value)} autoComplete="current-password" />
        <input style={inp} type="password"placeholder={t.newPwLbl} value={newPw} onChange={e=>setNewPw(e.target.value)} autoComplete="new-password" />
        <input style={inp} type="password"placeholder={t.confirmPwLbl} value={newPw2} onChange={e=>setNewPw2(e.target.value)} autoComplete="new-password" />
        <button type="submit"style={s.sendBtn} disabled={busy}>{busy?"...":t.changePwSettingsBtn}</button>
      </form>
    </div>
  );
}

// ─── HELP SETTINGS ─────────────────────────────────────────────
export function HelpSettingsPanel({ t, lang, th, s }) {
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
import { isCloudAccessAllowedSync } from "../offline/cloudAccessPolicy.js";

export function SyncSettingsPanel({
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

  const cloudLicensed = isCloudAccessAllowedSync();

  if (!cloudLicensed) {
    return (
      <div style={s.card}>
        <div style={s.settingsLbl}>{t.syncStatus}</div>
        <div style={{ fontSize:13, fontWeight:700, color:"#22c55e", marginBottom:10 }}>{t.localOnlyLoginHint}</div>
        <div style={{ fontSize:12, color:th.txtMuted, lineHeight:1.55 }}>
          {lang === "bn"
            ? "এই লাইসেন্সে Cloud চালু নেই। হিসাব, স্টক ও ব্যাকআপ শুধু এই কম্পিউটার/ফোনে local থাকবে।"
            : "Cloud is not enabled on this license. Books, stock, and backups stay on this device only."}
        </div>
      </div>
    );
  }

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
              {lang==="bn" ? "বারবার ব্যর্থ (retry চলছে)" : "Repeatedly failing (still retrying)"}: <strong style={{ color:"#f59e0b" }}>{syncDashboard.failingSync}</strong>{" "}
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
        <button type="button"onClick={onRefresh} style={s.stBtn}>
          {lang==="bn"?"রিফ্রেশ":"Refresh"}
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
