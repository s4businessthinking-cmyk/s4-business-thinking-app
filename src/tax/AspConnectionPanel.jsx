// ASP connection of the UAE e-invoice tab: the owner adds the shop's own Accredited Service Provider (name, portal,
// API address, credentials), tests it and clears it; staff only see whether it is connected. Saved on the shop record
// under taxSettings.eInvoiceAsp; the rules and the request live in uaeEInvoiceAsp.js.
import React, { useEffect, useState } from "react";
import { saveShopRecord } from "../offline/shopService";
import { logAudit } from "../utils/auditLog.js";
import { ASP_PRESETS, AUTH_TYPES, aspProblemText, aspState, connectionDigest, hasAspConfig, isApiMode, isDesktopTransport, normalizeAspConfig, testAspConnection, validateAspConfig } from "./uaeEInvoiceAsp.js";

export const ASP_STATE_LABEL = {
  none: ["ASP যোগ করা হয়নি", "No ASP added", "#64748b"],
  off: ["ASP বন্ধ রাখা হয়েছে", "ASP switched off", "#64748b"],
  portal: ["শুধু পোর্টাল - API দেওয়া হয়নি", "Portal only - no API details", "#b45309"],
  invalid: ["API-র তথ্য অসম্পূর্ণ", "API details incomplete", "#b91c1c"],
  untested: ["সংযোগ পরীক্ষা হয়নি", "Connection not tested", "#b45309"],
  failed: ["সংযোগ পরীক্ষা ব্যর্থ", "Connection test failed", "#b91c1c"],
  connected: ["সংযুক্ত", "Connected", "#15803d"],
};
const fmtAt = (v) => (v ? String(v).slice(0, 16).replace("T", " ") : "");

export default function AspConnectionPanel({ lang = "en", shopId, shop, user, profile, isOwner = false, onShopUpdated, toast, onClose }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const savedRaw = shop?.taxSettings?.eInvoiceAsp || null;
  const saved = normalizeAspConfig(savedRaw);
  const state = aspState(savedRaw);
  const [form, setForm] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => { setForm(normalizeAspConfig(shop?.taxSettings?.eInvoiceAsp)); }, [shop?.taxSettings?.eInvoiceAsp]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const pickProvider = (provider) => setForm((p) => ({ ...p, provider, ...(ASP_PRESETS[provider]?.authType ? { authType: ASP_PRESETS[provider].authType } : {}) }));
  const problems = validateAspConfig(form);
  const api = isApiMode(form);
  const who = profile?.personName || profile?.username || user?.email || "";

  // A change to the address or credentials needs a new test, so the old test result is dropped with it.
  const persist = async (cfg) => {
    const updated = await saveShopRecord(shopId, { taxSettings: { ...(shop?.taxSettings || {}), eInvoiceAsp: cfg } }, { ownerUid: user?.uid || shop?.ownerUid });
    onShopUpdated?.(updated);
    return updated;
  };
  const stamp = (cfg) => {
    const next = { ...normalizeAspConfig(cfg), updatedAt: new Date().toISOString(), updatedBy: who };
    if (next.testedDigest !== connectionDigest(next)) Object.assign(next, { testStatus: "untested", lastError: "" });
    return next;
  };
  const audit = (note) => logAudit({ shopId, user, profile, action: "edit", collection: "shops", docId: shopId, docNo: "e-Invoice ASP", note });
  const run = async (fn) => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); } };

  const save = () => run(async () => {
    if (problems.length) { setShowProblems(true); toast?.(L("আগে লাল লেখাগুলো ঠিক করুন", "Fix the items in red first"), "err"); return; }
    const next = stamp(form);
    await persist(next);
    await audit(`ASP connection saved: ${next.displayName} (${ASP_PRESETS[next.provider].en})`);
    toast?.(isApiMode(next) ? L("ASP সেভ হয়েছে - এখন সংযোগ পরীক্ষা করুন", "ASP saved - now test the connection") : L("ASP সেভ হয়েছে (শুধু পোর্টাল)", "ASP saved (portal only)"));
  });
  const test = () => run(async () => {
    if (problems.length) { setShowProblems(true); toast?.(L("আগে লাল লেখাগুলো ঠিক করুন", "Fix the items in red first"), "err"); return; }
    const next = stamp(form);
    const res = await testAspConnection({ config: next });
    const tested = { ...next, ...(res.patch || {}) };
    await persist(tested);
    await audit(res.ok ? `ASP connection test passed: ${next.displayName} (HTTP ${res.httpStatus})` : `ASP connection test failed: ${next.displayName} (${res.httpStatus ? `HTTP ${res.httpStatus}` : "no answer"})`);
    if (res.ok) toast?.(L(`সংযোগ ঠিক আছে (HTTP ${res.httpStatus})`, `Connection works (HTTP ${res.httpStatus})`));
    else toast?.(L(`সংযোগ হয়নি: ${res.message}`, `Connection failed: ${res.message}`), "err");
  });
  const clear = () => run(async () => {
    await persist(null);
    await audit("ASP connection cleared");
    setConfirmClear(false);
    toast?.(L("ASP সংযোগ মুছে ফেলা হয়েছে", "ASP connection cleared"));
  });

  const stateBadge = (k) => { const x = ASP_STATE_LABEL[k] || ASP_STATE_LABEL.none; return <b style={{ color: x[2] }}>{bn ? x[0] : x[1]}</b>; };
  const inp = { width: "100%" };
  const row = (label, control, problemIds = []) => {
    const bad = showProblems ? problemIds.filter((p) => problems.includes(p)) : [];
    return (
      <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12.5 }}>
        <span className="si-muted">{label}</span>
        {control}
        {bad.map((p) => <span key={p} style={{ color: "#b91c1c", fontWeight: 700 }}>{aspProblemText(p, bn)}</span>)}
      </label>
    );
  };

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <b>{L("ASP সংযোগ", "ASP connection")}</b>
      <span>{stateBadge(state)}</span>
      {hasAspConfig(savedRaw) && <span className="si-muted">{saved.displayName}{saved.testedAt ? ` · ${L("শেষ পরীক্ষা", "last test")} ${fmtAt(saved.testedAt)}` : ""}</span>}
      <span className="si-toolbar-gap" />
      {onClose && <button type="button" className="pm-btn-secondary" onClick={onClose}>{L("বন্ধ", "Close")}</button>}
    </div>
  );

  if (!isOwner) {
    return (
      <div className="si-box" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {header}
        {saved.portalUrl && <div className="si-muted">{L("পোর্টাল", "Portal")}: {saved.portalUrl}</div>}
        {state === "failed" && saved.lastError && <div style={{ color: "#b91c1c" }}>{saved.lastError}</div>}
        <div className="si-muted">{L("ASP যোগ বা বদলাতে পারেন শুধু দোকানের মালিক।", "Only the shop owner can add or change the ASP.")}</div>
      </div>
    );
  }

  return (
    <div className="si-box" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {header}
      {state === "failed" && saved.lastError && <div style={{ color: "#b91c1c", fontWeight: 700 }}>{L("শেষ পরীক্ষার ভুল", "Last test error")}: {saved.lastError}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 6 }}>
        {row(L("ধরন", "Type"), (
          <select className="pm-input" style={inp} value={form.provider} onChange={(e) => pickProvider(e.target.value)} disabled={busy}>
            {Object.entries(ASP_PRESETS).map(([k, p]) => <option key={k} value={k}>{bn ? p.bn : p.en}</option>)}
          </select>
        ))}
        {row(L("ASP-র নাম", "ASP name"), <input className="pm-input" style={inp} value={form.displayName} onChange={(e) => set("displayName", e.target.value)} disabled={busy} />, ["displayName"])}
        {row(L("পোর্টালের ঠিকানা (ঐচ্ছিক)", "Portal address (optional)"), <input className="pm-input" style={inp} value={form.portalUrl} placeholder="https://" onChange={(e) => set("portalUrl", e.target.value)} disabled={busy} />, ["portalUrl"])}
        {api && row(L("API ঠিকানা (ASP যেটা দিয়েছে)", "API address (from your ASP)"), <input className="pm-input" style={inp} value={form.apiBaseUrl} placeholder="https://api.example-asp.ae" onChange={(e) => set("apiBaseUrl", e.target.value)} disabled={busy} />, ["apiBaseUrl", "apiHttps", "apiUserinfo"])}
        {api && row(L("ইনভয়েস পাঠানোর পাথ", "Submit path"), <input className="pm-input" style={inp} value={form.submitPath} placeholder="/v1/invoices" onChange={(e) => set("submitPath", e.target.value)} disabled={busy} />, ["paths"])}
        {api && row(L("সংযোগ পরীক্ষার পাথ", "Test path"), (
          <div style={{ display: "flex", gap: 4 }}>
            <select className="pm-input" style={{ width: 80 }} value={form.testMethod} onChange={(e) => set("testMethod", e.target.value)} disabled={busy}><option value="GET">GET</option><option value="POST">POST</option></select>
            <input className="pm-input" style={{ flex: 1 }} value={form.testPath} placeholder="/v1/health" onChange={(e) => set("testPath", e.target.value)} disabled={busy} />
          </div>
        ))}
        {api && row(L("লগইনের ধরন", "Authentication"), (
          <select className="pm-input" style={inp} value={form.authType} onChange={(e) => set("authType", e.target.value)} disabled={busy}>
            {Object.entries(AUTH_TYPES).map(([k, t]) => <option key={k} value={k}>{bn ? t[0] : t[1]}</option>)}
          </select>
        ))}
        {api && form.authType === "apiKey" && row(L("API key-র হেডার", "API key header"), <input className="pm-input" style={inp} value={form.apiKeyHeader} onChange={(e) => set("apiKeyHeader", e.target.value)} disabled={busy} />, ["apiKeyHeader"])}
        {api && form.authType !== "basic" && row(form.authType === "bearer" ? L("Bearer টোকেন", "Bearer token") : "API key", (
          <input className="pm-input" style={inp} type={showSecret ? "text" : "password"} autoComplete="off" value={form.apiKey} onChange={(e) => set("apiKey", e.target.value)} disabled={busy} />
        ), ["apiKey"])}
        {api && form.authType === "basic" && row("Client ID", <input className="pm-input" style={inp} autoComplete="off" value={form.clientId} onChange={(e) => set("clientId", e.target.value)} disabled={busy} />, ["basic"])}
        {api && form.authType === "basic" && row("Client secret", <input className="pm-input" style={inp} type={showSecret ? "text" : "password"} autoComplete="off" value={form.clientSecret} onChange={(e) => set("clientSecret", e.target.value)} disabled={busy} />)}
      </div>
      {api && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12.5 }}>
          <label><input type="checkbox" checked={showSecret} onChange={(e) => setShowSecret(e.target.checked)} /> {L("গোপন তথ্য দেখান", "Show secret")}</label>
          <label><input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> {L("ASP-র উত্তরের ঘর (অ্যাডভান্সড)", "ASP reply fields (advanced)")}</label>
          <label><input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} /> {L("চালু", "Switched on")}</label>
        </div>
      )}
      {api && advanced && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 6 }}>
          {row(L("রেফারেন্সের ঘর", "Reference field(s)"), <input className="pm-input" style={inp} value={form.refField} onChange={(e) => set("refField", e.target.value)} disabled={busy} />)}
          {row(L("অবস্থার ঘর", "Status field(s)"), <input className="pm-input" style={inp} value={form.statusField} onChange={(e) => set("statusField", e.target.value)} disabled={busy} />)}
          {row(L("বার্তার ঘর", "Message field(s)"), <input className="pm-input" style={inp} value={form.messageField} onChange={(e) => set("messageField", e.target.value)} disabled={busy} />)}
        </div>
      )}
      {row(L("নোট (ঐচ্ছিক)", "Notes (optional)"), <input className="pm-input" style={inp} value={form.notes} onChange={(e) => set("notes", e.target.value)} disabled={busy} />)}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" className="pm-btn pm-btn--primary" onClick={save} disabled={busy}>{L("সেভ", "Save")}</button>
        {api && <button type="button" className="pm-btn-secondary" onClick={test} disabled={busy}>{busy ? L("চলছে…", "Working…") : L("সংযোগ পরীক্ষা", "Test connection")}</button>}
        {hasAspConfig(savedRaw) && !confirmClear && <button type="button" className="pm-btn-secondary" onClick={() => setConfirmClear(true)} disabled={busy}>{L("সংযোগ মুছুন", "Disconnect / clear")}</button>}
        {confirmClear && <button type="button" className="pm-btn-secondary" style={{ color: "#b91c1c", fontWeight: 700 }} onClick={clear} disabled={busy}>{L("নিশ্চিত - মুছে ফেলুন", "Confirm - clear it")}</button>}
        {confirmClear && <button type="button" className="pm-btn-secondary" onClick={() => setConfirmClear(false)} disabled={busy}>{L("না", "Keep")}</button>}
      </div>
      <div className="si-note" style={{ margin: 0 }}>
        {L(
          "API ঠিকানা, পাথ আর লগইনের তথ্য আপনার ASP দেবে। \"সংযোগ পরীক্ষা\" পরীক্ষার পাথে একটা অনুরোধ পাঠায় - 2xx উত্তর এলে সংযুক্ত ধরা হয়। পরে ঠিকানা বা লগইন বদলালে আবার পরীক্ষা করতে হবে। এই তথ্য দোকানের রেকর্ডে সেভ হয় আর দোকানের সব ডিভাইসে sync হয় - API key শুধু e-invoice পাঠানোর অনুমতি দেয় এমন key দিন।",
          "Your ASP gives you the API address, paths and login details. \"Test connection\" sends one request to the test path - a 2xx reply counts as connected. Change the address or login later and it must be tested again. These details are saved on the shop record and sync to every device of the shop - use a key that only allows sending e-invoices.",
        )}
        {!isDesktopTransport() && <div style={{ marginTop: 3, color: "#b45309" }}>{L("ব্রাউজার ভার্সনে ASP নিজে এই সাইট থেকে অনুরোধ নেওয়ার অনুমতি (CORS) না দিলে পাঠানো যাবে না - ডেস্কটপ অ্যাপ সরাসরি পাঠায়।", "In the browser version the ASP must allow requests from this site (CORS); the desktop app sends directly.")}</div>}
      </div>
    </div>
  );
}
