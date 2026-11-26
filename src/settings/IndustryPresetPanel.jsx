// Shop Info: industry starter preset (rules in industryPresets.js). The owner picks a preset, sees exactly what will be
// added, confirms, and only the missing items are saved. Nothing is deleted or rewritten; products and bills are not touched.
import React, { useMemo, useState } from "react";
import { loadShopRecord, saveShopRecord } from "../offline/shopService";
import { logAudit } from "../utils/auditLog.js";
import { INDUSTRY_PRESETS, PRESET_KEYS, planPreset } from "./industryPresets.js";

const fmtTime = (v) => (v ? `${String(v).slice(0, 10).split("-").reverse().join("/")} ${String(v).slice(11, 16)}` : "");

export default function IndustryPresetPanel({ localShop, shopId, user, profile, th = {}, lang = "en", toast, onShopUpdated, readOnly = false }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const applied = localShop?.industryPreset;
  const [key, setKey] = useState(() => (PRESET_KEYS.includes(String(applied?.key || "")) ? applied.key : "autoParts"));
  const [busy, setBusy] = useState(false);
  const plan = useMemo(() => planPreset(localShop, key), [localShop, key]);
  const preset = INDUSTRY_PRESETS[key];

  const apply = async () => {
    if (readOnly || busy) return;
    setBusy(true);
    try {
      // plan against the saved record, so lists saved elsewhere a moment ago are kept
      const fresh = (await loadShopRecord(shopId)) || localShop;
      const p = planPreset(fresh, key, { by: user?.uid || "" });
      if (!p.changes.length) { toast?.(L("সব আগে থেকেই আছে - কিছু যোগ করার নেই", "Everything is already there - nothing to add")); return; }
      const list = p.changes.map((c) => `- ${bn ? c.bn : c.en}`).join("\n");
      if (!window.confirm(L(`"${preset.bn}" প্রিসেট এগুলো যোগ করবে:\n${list}\n\nকোনো পণ্য, বিল বা হিসাব মুছবে বা বদলাবে না। চালাবেন?`,
        `The "${preset.en}" preset will add:\n${list}\n\nNo product, bill or account is deleted or changed. Continue?`))) return;
      const updated = await saveShopRecord(shopId, p.patch, { ownerUid: user?.uid || localShop?.ownerUid });
      onShopUpdated?.(updated);
      logAudit({ shopId, user, profile, action: "edit", collection: "shops", docId: shopId, docNo: "Industry preset", note: `${preset.en}: ${p.changes.map((c) => c.id).join(", ")}` });
      toast?.(L("প্রিসেট যোগ হয়েছে", "Preset applied"));
    } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(false); }
  };

  const box = { border: `1px solid ${th.border || "#cbd5e1"}`, borderRadius: 10, padding: 12, marginTop: 14 };
  return (
    <div style={box}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{L("ব্যবসার ধরন অনুযায়ী শুরুর সেটিং", "Industry starter preset")}</div>
      {applied?.key && INDUSTRY_PRESETS[applied.key] && (
        <div style={{ fontSize: 12, color: th.txtMuted, marginBottom: 6 }}>
          {L("দেওয়া হয়েছে", "Applied")}: {bn ? INDUSTRY_PRESETS[applied.key].bn : INDUSTRY_PRESETS[applied.key].en} · {fmtTime(applied.appliedAt)}
        </div>
      )}
      <select value={key} disabled={readOnly || busy} onChange={(e) => setKey(e.target.value)}
        style={{ width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${th.border || "#cbd5e1"}`, background: th.inputBg || "#fff", color: th.txt || "#111" }}>
        {PRESET_KEYS.map((k) => <option key={k} value={k}>{bn ? INDUSTRY_PRESETS[k].bn : INDUSTRY_PRESETS[k].en}{INDUSTRY_PRESETS[k].recommended ? L(" (প্রস্তাবিত)", " (recommended)") : ""}</option>)}
      </select>
      <div style={{ fontSize: 12, marginTop: 8 }}>
        <div style={{ fontWeight: 700 }}>{plan.changes.length ? L("যা যোগ হবে:", "What it adds:") : L("এই প্রিসেটের সব কিছু আগে থেকেই আছে।", "Everything in this preset is already there.")}</div>
        {plan.changes.map((c) => <div key={c.id}>- {bn ? c.bn : c.en}</div>)}
        {plan.tips.length > 0 && <div style={{ fontWeight: 700, marginTop: 6 }}>{L("পরামর্শ (নিজে করতে হবে):", "Tips (yours to do):")}</div>}
        {plan.tips.map((t, i) => <div key={i} style={{ color: th.txtMuted }}>- {bn ? t.bn : t.en}</div>)}
      </div>
      {!readOnly && (
        <button type="button" onClick={apply} disabled={busy || !plan.changes.length}
          style={{ marginTop: 10, width: "100%", padding: 10, borderRadius: 8, border: "none", background: plan.changes.length ? "#1d4ed8" : "#94a3b8", color: "#fff", fontWeight: 800, cursor: plan.changes.length ? "pointer" : "default" }}>
          {busy ? "..." : L("প্রিসেট যোগ করুন", "Apply preset")}
        </button>
      )}
      <div style={{ fontSize: 11, color: th.txtMuted, marginTop: 6 }}>
        {L("শুধু যা নেই তা যোগ হয়; আবার দিলে কিছু দুবার হয় না। পণ্য, বিল, ভাউচার বা ব্যালেন্স ছোঁয় না।", "Only what is missing is added; applying again adds nothing twice. Products, bills, vouchers and balances are not touched.")}
      </div>
    </div>
  );
}
