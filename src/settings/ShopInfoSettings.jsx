import React, { useEffect, useState } from "react";
import { saveShopRecord } from "../offline/shopService";
import { normUrl, openLink } from "../utils/openLink.js";
import { CURRENCIES, TAX_PRESETS, UAE_EMIRATES } from "../reports/taxDomain.js";
import { getLocalAccessStatus } from "../auth/licenseService.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COUNTRY_NAMES = { ae: "UAE", sa: "Saudi Arabia", om: "Oman", bh: "Bahrain", qa: "Qatar", kw: "Kuwait", bd: "Bangladesh", in: "India", custom: "Other" };

const fromShop = (shop) => ({
  companyName: shop.companyName || "",
  companyNameAr: shop.companyNameAr || "",
  address: shop.address || shop.area || "",
  addressAr: shop.addressAr || "",
  country: shop.country || shop.taxSettings?.country || "ae",
  emirate: shop.emirate || "",
  mobile: shop.mobile || "",
  fax: shop.fax || "",
  email: shop.email || "",
  website: shop.website || "",
  currency: shop.currency || shop.taxSettings?.currency || "AED",
  fyStartMonth: Number(shop.fyStartMonth || shop.taxSettings?.fyStartMonth) || 1,
  taxApplicable: shop.taxApplicable === "none" ? "none" : "yes",
  trnNumber: shop.trnNumber || "",
  vatNumber: shop.vatNumber || "",
  tradeLicenseNumber: shop.tradeLicenseNumber || "",
});

export default function ShopInfoSettings({ localShop, shopId, profile, user, th, s, lang, toast, onShopUpdated, readOnly = false }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [f, setF] = useState(() => fromShop(localShop));
  const [arabicAddr, setArabicAddr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 760);

  const [access, setAccess] = useState(null);
  useEffect(() => { setF(fromShop(localShop)); }, [localShop]);
  useEffect(() => {
    let alive = true;
    getLocalAccessStatus().then((a) => { if (alive) setAccess(a); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const pickCountry = (country) => setF((p) => ({
    ...p, country,
    currency: TAX_PRESETS[country]?.currency || p.currency,
    emirate: country === "ae" && !UAE_EMIRATES.includes(p.emirate) ? "" : p.emirate,
  }));
  const isUae = f.country === "ae";
  const taxName = TAX_PRESETS[f.country]?.taxName || "VAT";

  const save = async () => {
    if (readOnly) return toast(L("শুধু মালিক দোকানের তথ্য বদলাতে পারবেন", "Only the owner can edit shop info"), "err");
    if (!f.companyName.trim()) return toast(L("দোকানের নাম দিন", "Shop name is required"), "err");
    const email = f.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast(L("ইমেইল ঠিক নেই", "Email looks wrong"), "err");
    const address = f.address.split("\n").map((x) => x.trim()).filter(Boolean).join("\n");
    setSaving(true);
    try {
      const updated = await saveShopRecord(shopId, {
        companyName: f.companyName.trim(), companyNameAr: f.companyNameAr.trim(),
        address, addressAr: f.addressAr.trim(),
        // Invoices and vouchers print `area` as the shop address line.
        area: address.split("\n").join(", "),
        country: f.country, emirate: f.emirate.trim(),
        mobile: f.mobile.trim(), fax: f.fax.trim(), email, website: normUrl(f.website),
        currency: f.currency, fyStartMonth: Number(f.fyStartMonth) || 1, taxApplicable: f.taxApplicable,
        trnNumber: f.trnNumber.trim(), vatNumber: f.vatNumber.trim(), tradeLicenseNumber: f.tradeLicenseNumber.trim(),
        ownerName: localShop.ownerName || profile?.personName || "",
      }, { ownerUid: user?.uid || localShop.ownerUid, profile, user });
      onShopUpdated?.(updated);
      toast(L("✅ দোকানের তথ্য আপডেট হয়েছে!", "✅ Shop info updated!"));
    } catch (e) {
      toast(e.message || String(e), "err");
    } finally {
      setSaving(false);
    }
  };

  const blue = "#2f5cb8";
  const inp = { padding: "8px 10px", borderRadius: 6, border: `1px solid ${th.borderMid}`, background: readOnly ? th.bgCard : th.bgInp, color: th.txtPrimary, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit" };
  const chip = { display: "inline-block", background: blue, color: "#fff", fontSize: 11, fontWeight: 800, padding: "3px 12px", borderRadius: "6px 6px 0 0", letterSpacing: 0.2 };
  const dis = readOnly ? { readOnly: true, disabled: true } : {};
  const field = (label, control, extra) => (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, ...extra }}>
      <span style={chip}>{label}</span>
      {control}
    </div>
  );
  const text = (k, props = {}) => <input style={{ ...inp, ...(props.style || {}) }} {...dis} {...props} value={f[k]} onChange={(e) => set(k, e.target.value)} />;
  const fyEnd = MONTHS[(Number(f.fyStartMonth) + 10) % 12];

  const dmy = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${String(d.getDate()).padStart(2, "0")}/${MONTHS[d.getMonth()]}/${d.getFullYear()}`; };
  const daysLeft = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  const PLAN_NAMES = { LIFETIME: L("লাইফটাইম", "Lifetime"), YEARLY: L("বাৎসরিক", "Yearly"), MONTHLY: L("মাসিক", "Monthly"), CUSTOM: L("কাস্টম", "Custom") };
  const licenseLine = (() => {
    if (!access) return null;
    const lic = access.license;
    if (access.licenseStatus === "ACTIVE" && lic) {
      const plan = String(lic.payload?.plan || "").toUpperCase();
      const planName = PLAN_NAMES[plan] || plan;
      if (plan === "LIFETIME" || !lic.expiresAt) return { color: "#15803d", text: `🔑 ${L("লাইসেন্স", "License")}: ${planName}${lic.activatedAt ? ` · ${L("চালু", "since")} ${dmy(lic.activatedAt)}` : ""} · ${L("মেয়াদ শেষ হবে না", "never expires")}` };
      const left = daysLeft(lic.expiresAt);
      return { color: left <= 15 ? "#b45309" : "#15803d", text: `🔑 ${L("লাইসেন্স", "License")}: ${planName}${lic.activatedAt ? ` · ${L("চালু", "since")} ${dmy(lic.activatedAt)}` : ""} · ${L(`মেয়াদ শেষ ${dmy(lic.expiresAt)} (${left} দিন বাকি)`, `ends on ${dmy(lic.expiresAt)} (${left} days left)`)}` };
    }
    if (access.trial?.trialEndsAt && access.accessAllowed) return { color: "#b45309", text: `⏳ ${L(`ট্রায়াল চলছে — শেষ ${dmy(access.trial.trialEndsAt)} (${Math.max(0, daysLeft(access.trial.trialEndsAt))} দিন বাকি)`, `Trial — ends on ${dmy(access.trial.trialEndsAt)} (${Math.max(0, daysLeft(access.trial.trialEndsAt))} days left)`)}` };
    return { color: "#b91c1c", text: `⚠ ${L("লাইসেন্স চালু নেই — ⚙️ সেটিংস → লাইসেন্স থেকে চালু করুন", "No active license — activate it in ⚙️ Settings → License")}` };
  })();

  const left = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {field(L("দোকানের নাম (Company Name)", "Company Name"), text("companyName", { style: { fontWeight: 800 } }))}
      {field(L("আরবি নাম (Arabic Company Name)", "Arabic Company Name"), text("companyNameAr", { dir: "rtl", placeholder: "اسم الشركة" }))}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 2 }}>
          <button type="button" onClick={() => setArabicAddr(false)} style={{ ...chip, border: "none", cursor: "pointer", opacity: arabicAddr ? 0.55 : 1 }}>{L("ঠিকানা (Address)", "Address")}</button>
          <button type="button" onClick={() => setArabicAddr(true)} style={{ ...chip, border: "none", cursor: "pointer", opacity: arabicAddr ? 1 : 0.55 }}>{L("আরবি ঠিকানা", "Arabic Address")}</button>
        </div>
        {arabicAddr
          ? <textarea style={{ ...inp, minHeight: 92, resize: "vertical" }} dir="rtl" {...dis} value={f.addressAr} onChange={(e) => set("addressAr", e.target.value)} placeholder="العنوان" />
          : <textarea style={{ ...inp, minHeight: 92, resize: "vertical" }} {...dis} value={f.address} onChange={(e) => set("address", e.target.value)} placeholder={"MUSSAFAH M/33\nABU DHABI - UAE"} />}
      </div>
      {field(L("দেশ (Country)", "Country"), (
        <select style={inp} {...dis} value={f.country} onChange={(e) => pickCountry(e.target.value)}>
          {Object.keys(TAX_PRESETS).map((k) => <option key={k} value={k}>{COUNTRY_NAMES[k] || k}</option>)}
        </select>
      ))}
      {field(L("ফোন / মোবাইল (Phone)", "Phone"), text("mobile", { inputMode: "tel" }))}
      {field("Fax", text("fax", { inputMode: "tel" }))}
      {field(L("ইমেইল (Email)", "Email"), text("email", { inputMode: "email" }))}
    </div>
  );

  const right = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {field(L("ওয়েবসাইট (Web Site)", "Web Site"), (
        <div style={{ display: "flex", gap: 6 }}>
          {text("website", { placeholder: "http://" })}
          <button type="button" disabled={!f.website.trim()} onClick={() => openLink(normUrl(f.website))} style={{ padding: "0 14px", borderRadius: 6, border: `1px solid ${blue}`, background: "#e8efff", color: blue, fontWeight: 800, cursor: f.website.trim() ? "pointer" : "not-allowed" }}>Go</button>
        </div>
      ))}
      {field(L("মুদ্রা (Currency)", "Currency"), (
        <select style={inp} {...dis} value={f.currency} onChange={(e) => set("currency", e.target.value)}>
          {CURRENCIES.some(([c]) => c === f.currency) ? null : <option value={f.currency}>{f.currency}</option>}
          {CURRENCIES.map(([c, label]) => <option key={c} value={c}>{label}</option>)}
        </select>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {field(L("হিসাবের বছর শুরু", "Financial Year starts"), (
          <select style={inp} {...dis} value={f.fyStartMonth} onChange={(e) => set("fyStartMonth", Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>01 / {m}</option>)}
          </select>
        ))}
        {field(L("শেষ হয়", "Financial Year ends"), <input style={{ ...inp, background: th.bgCard, color: th.txtMuted }} disabled value={`${L("মাসের শেষ", "end of")} ${fyEnd}`} />)}
      </div>
      {field(L("ট্যাক্স প্রযোজ্য (TAX Applicable)", "TAX Applicable"), (
        <select style={inp} {...dis} value={f.taxApplicable} onChange={(e) => set("taxApplicable", e.target.value)}>
          <option value="yes">{taxName === "GST" ? "Goods and Services Tax (GST)" : `Value Added Tax (${taxName})`}</option>
          <option value="none">{L("নেই (None)", "None")}</option>
        </select>
      ))}
      {field("TRN", (
        <>
          {text("trnNumber", { placeholder: "100XXXXXXXXXXXX", style: { fontFamily: "monospace", borderColor: f.trnNumber ? "#f59e0b" : th.borderMid } })}
          {f.trnNumber && <span style={{ fontSize: 10, color: "#f59e0b", marginTop: 3, fontWeight: 700 }}>✅ {L("Tax Invoice এ দেখাবে", "Shows in Tax Invoice")}</span>}
        </>
      ))}
      {field(L("VAT নম্বর", "VAT Number"), text("vatNumber", { style: { fontFamily: "monospace" } }))}
      {field(L("লাইসেন্স নং (License No.)", "License No."), text("tradeLicenseNumber"))}
      {field(isUae ? "Emirates" : L("রাজ্য / এলাকা", "State / Region"), isUae ? (
        <select style={inp} {...dis} value={f.emirate} onChange={(e) => set("emirate", e.target.value)}>
          <option value="">—</option>
          {UAE_EMIRATES.map((e) => <option key={e} value={e}>{e.toUpperCase()}</option>)}
        </select>
      ) : text("emirate"))}
    </div>
  );

  return (
    <div style={s.card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 1, color: blue }}>🏢 {L("দোকানের তথ্য", "COMPANY INFORMATION")}</div>
        {localShop.ownerName && <div style={{ fontSize: 12, color: th.txtMuted }}>👤 {L("মালিক", "Owner")}: {localShop.ownerName}</div>}
      </div>
      {readOnly && <div style={{ fontSize: 12, color: th.txtMuted, marginBottom: 10 }}>{L("শুধু দেখার জন্য — সম্পাদনা শুধু মালিক করতে পারবেন", "View only — only the owner can edit shop info")}</div>}
      <div style={{ display: "grid", gridTemplateColumns: wide ? "1fr 1fr" : "1fr", gap: wide ? 22 : 10 }}>
        {left}
        {right}
      </div>
      <div style={{ fontSize: 11, color: th.txtMuted, marginTop: 10, lineHeight: 1.5 }}>
        {L("হিসাবের বছর = আপনার ব্যবসার হিসাব কোন মাস থেকে কোন মাস (Corporate Tax ও বছরের লাভের জন্য) — সফটওয়্যারের লাইসেন্সের সাথে এর কোনো সম্পর্ক নেই। দেশ, মুদ্রা, হিসাবের বছর আর ট্যাক্স প্রযোজ্য 🏛️ ট্যাক্স / VAT পাতাও ব্যবহার করে। আরবি নাম, ঠিকানা আর লাইসেন্স নং ইনভয়েস প্রিন্টে দেখাবে।",
          "Financial year = the months your business accounts cover (for Corporate Tax and yearly profit) — it has nothing to do with the software license. Country, currency, financial year and tax applicable are also used by the 🏛️ Tax / VAT page. Arabic name, address and license no. show on printed invoices.")}
      </div>
      {licenseLine && <div style={{ fontSize: 12, fontWeight: 700, color: licenseLine.color, marginTop: 8 }}>{licenseLine.text}</div>}
      {!readOnly && (
        <button type="button" onClick={save} disabled={saving} style={{ marginTop: 12, width: "100%", padding: 12, borderRadius: 10, border: "none", background: saving ? "#1e3a5f" : "linear-gradient(135deg,#f97316,#ea580c)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "..." : L("✅ সেভ করুন", "✅ Save")}
        </button>
      )}
    </div>
  );
}
