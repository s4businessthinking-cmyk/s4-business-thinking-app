// Payment reminders: customers with overdue bills today (accounts/overdueReminders.js), reminded on the channels the
// owner switches on (share/reminderChannels.js): WhatsApp / SMS / email opened with the message typed in, or SMS /
// email handed to the owner's own HTTPS provider. S4 records "opened" or "accepted by your provider", never "sent" or
// "delivered". A person starts each reminder, except the owner's optional automatic run (share/autoReminders.js): SMS /
// email through the HTTPS provider only, once a day while S4 is open on the chosen device. Owner settings.
import React, { useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineCreate } from "../offline/offlineRepository";
import { saveShopRecord } from "../offline/shopService";
import { logAudit } from "../utils/auditLog.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { csvText } from "../reports/vatExport.js";
import { openWhatsAppText } from "./whatsappDocShare.js";
import { openLink } from "../utils/openLink.js";
import { REMINDER_STATUS, channelSettingsOf, mailtoUrl, providerConfigForChannel, sendViaProvider, smsUrl, statusWord } from "./reminderChannels.js";
import { useOverdueReminders } from "./useOverdueReminders.js";
import { useAutoReminders } from "./useAutoReminders.js";
import { autoProblems, autoSettingsOf } from "./autoReminders.js";
import { DEFAULT_REMINDER_TEXT, REMINDER_VARS, fillReminder, reminderProviderMessage, reminderRecord, reminderRows, reminderSettingsOf, reminderText } from "../accounts/overdueReminders.js";

const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
// an ISO time as the local dd/mm/yyyy hh:mm
const localStamp = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const OR_CSS = `
.or-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.or-table th { text-align: left; background: #e8eef7; padding: 4px 6px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; }
.or-table td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.or-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
`;

export default function OverdueRemindersScreen({ lang = "en", shopId, shop = null, user = null, profile = null, isOwner = false, customers = [], shopName = "", cur = "AED", toast, onShopUpdated }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);
  const { settings, channels, on, queue, loaded, error, day, refresh } = useOverdueReminders({ shop, shopId, customers, intervalMs: 60 * 1000 });
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState("");
  const ready = queue.filter((r) => r.status === "ready");
  // the screen's own copy, for the device id, the last run and Run now (the app-wide one runs the timer)
  const autoRun = useAutoReminders({ shop, shopId, reminders: { settings, channels, on, queue, loaded, refresh }, user, profile, cur, shopName, lang, toast, enabled: false });
  const auto = autoRun.auto;

  const send = async (row, { again = false, channel = "whatsapp" } = {}) => {
    const opt = (row.options || []).find((o) => o.channel === channel);
    if (busy || !opt?.ok || (row.status === "done" && !again)) return;
    if (again && !window.confirm(L(`${row.name}-কে আজ আগেই মনে করানো হয়েছে। আবার পাঠাবেন?`, `${row.name} was already reminded today. Send again?`))) return;
    setBusy(`${row.customerId}:${channel}`);
    const text = reminderProviderMessage(row, { settings, shopName, cur, channel, via: opt.via });
    const subject = fillReminder(settings.language === "bn" ? channels.emailSubjectBn : channels.emailSubjectEn, { shop: shopName, name: row.name });
    try {
      let status = statusWord(channel, opt.via), mode = "", providerId = "";
      if (channel === "whatsapp" && opt.via === "provider") {
        const res = await sendViaProvider("whatsapp", channels.whatsappProvider, { to: opt.to, message: text });
        if (!res.ok) { toast?.(L(`প্রোভাইডার নেয়নি (${res.httpStatus || res.error}): ${res.message}`, `The provider did not take it (${res.httpStatus || res.error}): ${res.message}`), "err"); return; }
        status = res.status; providerId = res.providerId; mode = "provider";
      } else if (channel === "whatsapp") {
        const res = await openWhatsAppText(row.phone, text);
        mode = res?.mode || "";
      } else if (opt.via === "provider") {
        const res = await sendViaProvider(channel, providerConfigForChannel(channels, channel), { to: opt.to, message: text, subject });
        if (!res.ok) { toast?.(L(`প্রোভাইডার নেয়নি (${res.httpStatus || res.error}): ${res.message}`, `The provider did not take it (${res.httpStatus || res.error}): ${res.message}`), "err"); return; }
        status = res.status; providerId = res.providerId; mode = "provider";
      } else {
        openLink(channel === "sms" ? smsUrl(opt.to, text) : mailtoUrl(opt.to, subject, text));
        mode = "link";
      }
      // only after the channel was really asked to take it: the record that this customer was reminded today
      await offlineCreate("reminders", reminderRecord(row, { shopId, user, profile, cur, mode, channel, status, providerId }));
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
      const where = channel === "whatsapp" && mode === "provider" ? L(REMINDER_STATUS[status].bn, REMINDER_STATUS[status].en)
        : channel === "whatsapp" && mode === "desktop" ? L("WhatsApp Desktop-এ চ্যাট খুলেছে - Send চাপুন", "The chat is open in WhatsApp Desktop - press Send")
        : channel === "whatsapp" ? L("চ্যাট wa.me-তে খুলেছে (পপ-আপ বন্ধ থাকলে খুলবে না) - Send চাপুন", "The chat opened in wa.me (not if pop-ups are blocked) - press Send")
        : L(REMINDER_STATUS[status].bn, REMINDER_STATUS[status].en);
      toast?.(`${where}${providerId ? ` · ID ${providerId}` : ""}${mode === "link" ? L(" (অ্যাপ না খুললে এই ডিভাইসে মেসেজ / মেইল অ্যাপ নেই)", " (if nothing opened, this device has no messages / mail app)") : ""}`);
      refresh();
    } catch (e) {
      toast?.(L(`খোলা যায়নি: ${e?.message || e}`, `Could not open it: ${e?.message || e}`), "err");
    } finally { setBusy(""); }
  };
  const firstChannel = (r) => (r.options || []).find((o) => o.ok)?.channel || "whatsapp";
  const sendNext = () => { if (ready[0]) send(ready[0], { channel: firstChannel(ready[0]) }); };
  const exportCsv = async () => {
    try { await saveTextFile(`payment-reminders-${day}.csv`, csvText(reminderRows(queue))); } catch (e) { toast?.(e.message || String(e), "err"); }
  };
  const saveSettings = async () => {
    if (!isOwner || !edit || busy) return;
    const next = reminderSettingsOf({ overdueReminders: edit });
    const ch = channelSettingsOf({ overdueReminders: edit });
    const badUrl = [ch.whatsappProvider.url, ch.smsProvider.url, ch.emailProvider.url].find((u) => u && !/^https:\/\//i.test(u));
    if (badUrl) { toast?.(L("প্রোভাইডারের ঠিকানা https:// দিয়ে শুরু হতে হবে", "A provider address must start with https://"), "err"); return; }
    if (!ch.whatsapp && !ch.sms && !ch.email) { toast?.(L("অন্তত একটা উপায় চালু রাখুন", "Keep at least one channel on"), "err"); return; }
    const a = edit.auto || {};
    const keepDevice = a.thisDevice ? autoRun.deviceId : String(a.deviceId || "");
    const when = a.when === "server" ? "server" : "device";
    const nextAuto = autoSettingsOf({ overdueReminders: { auto: { ...a, when, hour: Number(a.hour), deviceId: when === "server" ? "" : keepDevice, deviceName: when === "server" ? "" : (a.thisDevice ? (navigator.userAgent.includes("Electron") ? "S4 Desktop" : "This browser") : a.deviceName) } } });
    const autoBad = autoProblems(nextAuto, ch);
    if (autoBad.length) { toast?.(autoBad.map((x) => (bn ? x.bn : x.en)).join(" · "), "err"); return; }
    setBusy("settings");
    try {
      const updated = await saveShopRecord(shopId, { overdueReminders: { ...next, textEn: next.textEn === DEFAULT_REMINDER_TEXT.en ? "" : next.textEn, textBn: next.textBn === DEFAULT_REMINDER_TEXT.bn ? "" : next.textBn,
        smsProviderBilingual: edit.smsProviderBilingual !== false,
        channels: { whatsapp: ch.whatsapp, sms: ch.sms, email: ch.email }, whatsappProvider: ch.whatsappProvider, smsProvider: ch.smsProvider, emailProvider: ch.emailProvider,
        emailSubjectEn: edit.emailSubjectEn || "", emailSubjectBn: edit.emailSubjectBn || "", auto: nextAuto } }, { ownerUid: user?.uid || shop?.ownerUid });
      onShopUpdated?.(updated);
      logAudit({ shopId, user, profile, action: "edit", collection: "shops", docId: shopId, docNo: "Payment reminders", note: `${next.enabled ? "On" : "Off"} · ${next.minDays} day(s) overdue · minimum ${next.minAmount} · ${next.language.toUpperCase()} · automatic ${nextAuto.on ? `on (${[nextAuto.whatsapp && "WhatsApp", nextAuto.sms && "SMS", nextAuto.email && "email"].filter(Boolean).join(" + ")}, from ${nextAuto.hour}:00)` : "off"}` });
      toast?.(L("সেটিং সেভ হয়েছে", "Settings saved"));
      setEdit(null);
    } catch (e) { toast?.(e?.message || String(e), "err"); } finally { setBusy(""); }
  };
  const statusText = (r) => (r.status === "ready" ? L("মনে করাতে হবে", "To remind") : r.status === "done" ? L("আজ মনে করানো হয়েছে", "Reminded today") : L("পাঠানো যাবে না", "Cannot send"));

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{OR_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("বকেয়ার রিমাইন্ডার", "Payment Reminders")}</strong>
        <span>WhatsApp · {fmtDay(day)}</span>
      </div>
      <div className="si-toolbar">
        {on && <button type="button" className="pm-btn pm-btn--primary" onClick={sendNext} disabled={!ready.length || !!busy}>{L(`পরেরটা খুলুন (${ready.length})`, `Open next (${ready.length})`)}</button>}
        {on && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!queue.length}> Excel</button>}
        {on && <button type="button" className="pm-btn-secondary" onClick={refresh}> {L("রিফ্রেশ", "Refresh")}</button>}
        {isOwner && <button type="button" className="pm-btn-secondary" onClick={() => setEdit(edit ? null : { ...settings, channels: { whatsapp: channels.whatsapp, sms: channels.sms, email: channels.email }, whatsappProvider: { ...channels.whatsappProvider }, smsProvider: { ...channels.smsProvider }, emailProvider: { ...channels.emailProvider }, emailSubjectEn: shop?.overdueReminders?.emailSubjectEn || "", emailSubjectBn: shop?.overdueReminders?.emailSubjectBn || "", auto: { ...auto, thisDevice: !auto.deviceId || autoRun.isThisDevice } })} disabled={!!busy}>{L("রিমাইন্ডার সেটিং", "Reminder settings")}</button>}
      </div>
      <div className="si-body">
        {edit && isOwner && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("রিমাইন্ডার সেটিং", "Reminder settings")}</legend>
            <div className="si-panel-body" style={{ gap: 6 }}>
              <label className="pm-check"><input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit((s) => ({ ...s, enabled: e.target.checked }))} /> {L("প্রতিদিন বকেয়া কাস্টমারের তালিকা বানাও আর বেলে দেখাও", "Build the overdue list every day and show it on the bell")}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <label className="si-field"><span className="pm-label">{L("কত দিন বকেয়া হলে", "Days overdue at least")}</span>
                  <input className="pm-input" style={{ width: 110, textAlign: "right" }} inputMode="numeric" value={edit.minDays} onChange={(e) => setEdit((s) => ({ ...s, minDays: e.target.value }))} /></label>
                <label className="si-field"><span className="pm-label">{L(`সর্বনিম্ন বকেয়া (${cur})`, `Minimum overdue (${cur})`)}</span>
                  <input className="pm-input" style={{ width: 120, textAlign: "right" }} inputMode="decimal" value={edit.minAmount} onChange={(e) => setEdit((s) => ({ ...s, minAmount: e.target.value }))} /></label>
                <label className="si-field"><span className="pm-label">{L("মেসেজের ভাষা", "Message language")}</span>
                  <select className="pm-input" style={{ width: 120 }} value={edit.language} onChange={(e) => setEdit((s) => ({ ...s, language: e.target.value }))}>
                    <option value="en">English</option><option value="bn">বাংলা</option>
                  </select></label>
              </div>
              <label className="si-field"><span className="pm-label">{L("ইংরেজি মেসেজ", "English message")}</span>
                <textarea className="pm-input" style={{ minHeight: 70 }} value={edit.textEn} onChange={(e) => setEdit((s) => ({ ...s, textEn: e.target.value }))} /></label>
              <label className="si-field"><span className="pm-label">{L("বাংলা মেসেজ", "Bangla message")}</span>
                <textarea className="pm-input" style={{ minHeight: 70 }} value={edit.textBn} onChange={(e) => setEdit((s) => ({ ...s, textBn: e.target.value }))} /></label>
              <div className="si-hint" style={{ marginLeft: 0 }}>{L("যা বসানো যায়:", "You can use:")} {REMINDER_VARS.map((v) => `{${v}}`).join(" ")}</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{L("কীভাবে পাঠাবেন", "Channels")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {[["whatsapp", "WhatsApp"], ["sms", "SMS"], ["email", L("ইমেইল", "Email")]].map(([k, label]) => (
                  <label key={k} className="pm-check"><input type="checkbox" checked={!!edit.channels?.[k]} onChange={(e) => setEdit((s) => ({ ...s, channels: { ...s.channels, [k]: e.target.checked } }))} /> {label}</label>
                ))}
              </div>
              {edit.channels?.whatsapp && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <label className="si-field" style={{ flex: "1 1 280px" }}><span className="pm-label">{L("WhatsApp প্রোভাইডার (https, ঐচ্ছিক - না দিলে WhatsApp চ্যাট খোলে)", "WhatsApp provider (https, optional - empty opens the WhatsApp chat)")}</span>
                    <input className="pm-input" value={edit.whatsappProvider?.url || ""} onChange={(e) => setEdit((s) => ({ ...s, whatsappProvider: { ...s.whatsappProvider, url: e.target.value } }))} placeholder="https://" /></label>
                  <label className="si-field"><span className="pm-label">{L("টোকেন", "Token")}</span>
                    <input className="pm-input" type="password" value={edit.whatsappProvider?.token || ""} onChange={(e) => setEdit((s) => ({ ...s, whatsappProvider: { ...s.whatsappProvider, token: e.target.value } }))} /></label>
                </div>
              )}
              {edit.channels?.whatsapp && (
                <div className="si-muted" style={{ fontSize: 12 }}>{L("WABA / BSP গেটওয়ে যেটা POST { to, message } গ্রহণ করে। আপনার নিজের API ও বিল।", "Your WABA / BSP gateway that accepts POST { to, message }. Your own API account and billing.")}</div>
              )}
              {edit.channels?.sms && (
                <label className="pm-check" style={{ width: "100%" }}><input type="checkbox" checked={edit.smsProviderBilingual !== false} onChange={(e) => setEdit((s) => ({ ...s, smsProviderBilingual: e.target.checked }))} />
                  {L("প্রোভাইডার SMS-এ ইংরেজি ও বাংলা একসাথে (লিংকে শুধু বেছে নেওয়া ভাষা)", "Provider SMS sends English and Bangla together (links use the chosen language only)")}
                </label>
              )}
              {edit.channels?.sms && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <label className="si-field" style={{ flex: "1 1 280px" }}><span className="pm-label">{L("SMS প্রোভাইডার (https, ঐচ্ছিক - না দিলে ফোনের মেসেজ অ্যাপ খোলে)", "SMS provider (https, optional - empty opens the phone's messages app)")}</span>
                    <input className="pm-input" value={edit.smsProvider?.url || ""} onChange={(e) => setEdit((s) => ({ ...s, smsProvider: { ...s.smsProvider, url: e.target.value } }))} placeholder="https://" /></label>
                  <label className="si-field"><span className="pm-label">{L("টোকেন", "Token")}</span>
                    <input className="pm-input" type="password" value={edit.smsProvider?.token || ""} onChange={(e) => setEdit((s) => ({ ...s, smsProvider: { ...s.smsProvider, token: e.target.value } }))} /></label>
                </div>
              )}
              {edit.channels?.email && (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <label className="si-field" style={{ flex: "1 1 280px" }}><span className="pm-label">{L("ইমেইল প্রোভাইডার (https, ঐচ্ছিক - না দিলে মেইল অ্যাপ খোলে)", "Email provider (https, optional - empty opens the mail app)")}</span>
                      <input className="pm-input" value={edit.emailProvider?.url || ""} onChange={(e) => setEdit((s) => ({ ...s, emailProvider: { ...s.emailProvider, url: e.target.value } }))} placeholder="https://" /></label>
                    <label className="si-field"><span className="pm-label">{L("টোকেন", "Token")}</span>
                      <input className="pm-input" type="password" value={edit.emailProvider?.token || ""} onChange={(e) => setEdit((s) => ({ ...s, emailProvider: { ...s.emailProvider, token: e.target.value } }))} /></label>
                  </div>
                  <label className="si-field"><span className="pm-label">{L("ইমেইলের বিষয় (ইংরেজি)", "Email subject (English)")}</span>
                    <input className="pm-input" value={edit.emailSubjectEn || ""} onChange={(e) => setEdit((s) => ({ ...s, emailSubjectEn: e.target.value }))} placeholder="Payment reminder from {shop}" /></label>
                  <label className="si-field"><span className="pm-label">{L("ইমেইলের বিষয় (বাংলা)", "Email subject (Bangla)")}</span>
                    <input className="pm-input" value={edit.emailSubjectBn || ""} onChange={(e) => setEdit((s) => ({ ...s, emailSubjectBn: e.target.value }))} placeholder="{shop} থেকে বকেয়ার রিমাইন্ডার" /></label>
                </>
              )}
              {(edit.channels?.whatsapp || edit.channels?.sms || edit.channels?.email) && <div className="si-muted" style={{ fontSize: 12 }}>{L("প্রোভাইডারে আমরা POST JSON { to, message, subject? } আর টোকেন Bearer হিসেবে পাঠাই। দোকানের সব সদস্য টোকেন পড়তে পারে।", "We POST JSON { to, message, subject? } to the provider with the token as a Bearer header. Every member of the shop can read the token.")}</div>}
              <div style={{ fontWeight: 700, marginTop: 4 }}>{L("স্বয়ংক্রিয়ভাবে পাঠানো", "Automatic sending")}</div>
              <label className="pm-check"><input type="checkbox" checked={!!edit.auto?.on} onChange={(e) => setEdit((s) => ({ ...s, auto: { ...s.auto, on: e.target.checked } }))} /> {L("প্রতিদিন নিজে থেকে বকেয়া কাস্টমারদের রিমাইন্ডার প্রোভাইডারকে দিন", "Hand today's overdue reminders to my provider automatically, once a day")}</label>
              {edit.auto?.on && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                  <label className="pm-check"><input type="checkbox" checked={!!edit.auto?.whatsapp} onChange={(e) => setEdit((s) => ({ ...s, auto: { ...s.auto, whatsapp: e.target.checked } }))} /> {L("WhatsApp প্রোভাইডার", "WhatsApp provider")}</label>
                  <label className="pm-check"><input type="checkbox" checked={!!edit.auto?.sms} onChange={(e) => setEdit((s) => ({ ...s, auto: { ...s.auto, sms: e.target.checked } }))} /> {L("SMS প্রোভাইডার", "SMS provider")}</label>
                  <label className="pm-check"><input type="checkbox" checked={!!edit.auto?.email} onChange={(e) => setEdit((s) => ({ ...s, auto: { ...s.auto, email: e.target.checked } }))} /> {L("ইমেইল প্রোভাইডার", "Email provider")}</label>
                  <label className="si-field"><span className="pm-label">{L("এই সময়ের পরে (ঘণ্টা, ০-২৩)", "After this hour (0-23)")}</span>
                    <select className="pm-input" style={{ width: 90 }} value={edit.auto?.hour ?? 10} onChange={(e) => setEdit((s) => ({ ...s, auto: { ...s.auto, hour: Number(e.target.value) } }))}>
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                    </select></label>
                </div>
              )}
              {edit.auto?.on && (
                <fieldset style={{ marginTop: 6, border: "1px solid #cbd5e1", padding: 8 }}>
                  <legend style={{ fontSize: 12, fontWeight: 700 }}>{L("কোথায় চালাবে", "Where it runs")}</legend>
                  <label className="pm-check" style={{ display: "block" }}>
                    <input type="radio" name="autoWhen" checked={(edit.auto?.when || "device") !== "server"} onChange={() => setEdit((s) => ({ ...s, auto: { ...s.auto, when: "device" } }))} />
                    {L("এই ডিভাইস (S4 খোলা থাকতে হবে)", "This device (S4 must stay open)")}
                  </label>
                  {(edit.auto?.when || "device") !== "server" && (
                    <label className="pm-check" style={{ display: "block", marginLeft: 20 }}>
                      <input type="checkbox" checked={!!edit.auto?.thisDevice} onChange={(e) => setEdit((s) => ({ ...s, auto: { ...s.auto, thisDevice: e.target.checked } }))} />
                      {L("এই ডিভাইস চালাবে", "This device runs it")}{!edit.auto?.thisDevice && edit.auto?.deviceId ? ` (${L("এখন", "now")}: ${edit.auto.deviceName || L("অন্য ডিভাইস", "another device")})` : ""}
                    </label>
                  )}
                  <label className="pm-check" style={{ display: "block", marginTop: 6 }}>
                    <input type="radio" name="autoWhen" checked={edit.auto?.when === "server"} onChange={() => setEdit((s) => ({ ...s, auto: { ...s.auto, when: "server", thisDevice: false } }))} />
                    {L("সিঙ্ক সার্ভার (অ্যাপ বন্ধ থাকলেও)", "Sync server (app may be closed)")}
                  </label>
                </fieldset>
              )}
              {edit.auto?.on && (
                <div className="si-muted" style={{ fontSize: 12 }}>{edit.auto?.when === "server"
                  ? L(
                      "শুধু https WhatsApp / SMS / ইমেইল প্রোভাইডার। সিঙ্ক সার্ভার দিনে একবার চালায় — অ্যাপ বন্ধ OK। ডেটা সিঙ্ক ও আপনার WABA/BSP অ্যাকাউন্ট লাগে।",
                      "HTTPS WhatsApp / SMS / email provider only. Sync server runs once a day — app may be closed. Needs synced data and your WABA/BSP account.",
                    )
                  : L(
                      "শুধু https WhatsApp / SMS / ইমেইল প্রোভাইডার নিজে যায়। wa.me / মেসেজ / মেইল লিংকে Send আপনার। ডিভাইস মোডে S4 খোলা লাগে।",
                      "Only https WhatsApp / SMS / email providers run on their own. wa.me / messages / mail links still need you to press Send. Device mode needs S4 open.",
                    )}</div>
              )}
              <div className="si-actions" style={{ background: "transparent", padding: 0 }}>
                <span className="si-toolbar-gap" />
                <button type="button" className="pm-btn-secondary" onClick={() => setEdit(null)} disabled={!!busy}>{L("বন্ধ", "Close")}</button>
                <button type="button" className="pm-btn pm-btn--primary" onClick={saveSettings} disabled={!!busy}>{L("সেভ", "Save")}</button>
              </div>
            </div>
          </fieldset>
        )}
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {on && auto.on && (
          <div className="si-paid-box" style={{ display: "block" }}>
            <b>{L("স্বয়ংক্রিয় রিমাইন্ডার চালু", "Automatic reminders on")}</b>
            {" · "}{[auto.whatsapp && "WhatsApp", auto.sms && "SMS", auto.email && L("ইমেইল", "email")].filter(Boolean).join(" + ")} · {L(`প্রতিদিন ${String(auto.hour).padStart(2, "0")}:00-র পরে`, `daily after ${String(auto.hour).padStart(2, "0")}:00`)}
            {" · "}{auto.when === "server"
              ? L("সিঙ্ক সার্ভারে চলে (অ্যাপ বন্ধ OK)", "runs on sync server (app may be closed)")
              : autoRun.isThisDevice ? L("এই ডিভাইসে চলে (S4 খোলা থাকলে)", "runs on this device (while S4 is open)") : L(`অন্য ডিভাইসে চলে${auto.deviceName ? ` (${auto.deviceName})` : ""}`, `runs on another device${auto.deviceName ? ` (${auto.deviceName})` : ""}`)}
            {auto.when === "server" && auto.lastServerRun && <div>{L("সার্ভার শেষ চালিয়েছে", "Last server run")} {localStamp(auto.lastServerRun.at)} · {L(`প্রোভাইডার গ্রহণ করেছে ${auto.lastServerRun.handedOff}, হয়নি ${auto.lastServerRun.failed}, বাদ ${auto.lastServerRun.skipped}`, `accepted by provider ${auto.lastServerRun.handedOff}, failed ${auto.lastServerRun.failed}, skipped ${auto.lastServerRun.skipped}`)}
              {(auto.lastServerRun.errors || []).map((x, i) => <div key={i} style={{ color: "#b91c1c" }}>{x}</div>)}</div>}
            {auto.when !== "server" && autoRun.lastRun && <div>{L("শেষ চলেছে", "Last run")} {localStamp(autoRun.lastRun.at)} · {L(`প্রোভাইডার গ্রহণ করেছে ${autoRun.lastRun.handedOff}, হয়নি ${autoRun.lastRun.failed}, বাদ ${autoRun.lastRun.skipped}`, `accepted by provider ${autoRun.lastRun.handedOff}, failed ${autoRun.lastRun.failed}, skipped ${autoRun.lastRun.skipped}`)}
              {(autoRun.lastRun.errors || []).map((x, i) => <div key={i} style={{ color: "#b91c1c" }}>{x}</div>)}</div>}
            {auto.when !== "server" && autoRun.isThisDevice && isOwner && !autoProblems(auto, channels).length && <button type="button" className="pm-btn-secondary" style={{ marginTop: 4 }} onClick={() => autoRun.runNow()} disabled={!loaded}>{L("এখনই চালান", "Run now")}</button>}
            {autoProblems(auto, channels).length > 0 && <div style={{ color: "#b91c1c" }}>{autoProblems(auto, channels).map((x) => (bn ? x.bn : x.en)).join(" · ")}</div>}
          </div>
        )}
        {!on && <div className="si-empty">{L("বকেয়ার রিমাইন্ডার বন্ধ। মালিক \"রিমাইন্ডার সেটিং\" থেকে চালু করতে পারেন।", "Payment reminders are switched off. The owner can switch them on under Reminder settings.")}</div>}
        {on && !loaded && !error && <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>}
        {on && loaded && !queue.length && <div className="si-empty">{L(`আজ ${settings.minDays} দিনের বেশি বকেয়া কোনো কাস্টমার নেই`, `No customer is ${settings.minDays} or more days overdue today`)}</div>}
        {on && queue.length > 0 && (
          <div style={{ overflow: "auto" }}>
            <table className="or-table">
              <thead><tr>
                <th>{L("কাস্টমার", "Customer")}</th>{!mobile && <th>{L("মোবাইল / WhatsApp", "Mobile / WhatsApp")}</th>}
                <th className="num">{L("বকেয়া", "Overdue")}</th><th className="num">{L("দিন", "Days")}</th>{!mobile && <th>{L("শেষ মনে করানো", "Last reminded")}</th>}
                <th>{L("অবস্থা", "Status")}</th><th />
              </tr></thead>
              <tbody>
                {queue.map((r) => (
                  <tr key={r.partyKey}>
                    <td className="si-strong">{r.name}<div className="si-muted" style={{ fontWeight: 400, fontSize: 11 }}>{r.bills} {L("টি বিল, পুরোনোটা", "bill(s), oldest due")} {fmtDay(r.oldestDue)}</div></td>
                    {!mobile && <td>{r.phone || "-"}</td>}
                    <td className="num">{cur} {money(r.amount)}</td><td className="num">{r.days}</td>
                    {!mobile && <td>{r.lastAt ? `${fmtDay(r.lastAt)} ${r.lastAt.slice(11, 16)}` : "-"}</td>}
                    <td style={{ color: r.status === "ready" ? "#b45309" : r.status === "done" ? "#15803d" : "#b91c1c" }}>
                      {statusText(r)}{r.status === "noPhone" ? <div style={{ fontSize: 11 }}>{r.reason === "Not on the customer master" ? L("কাস্টমার মাস্টারে নেই", "Not on the customer master") : L("কাস্টমারে WhatsApp / মোবাইল নম্বর নেই", "No WhatsApp or mobile number on the customer")}</div> : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.status !== "noPhone" && <button type="button" className="pm-btn-secondary" onClick={() => setPreview(preview === r.partyKey ? "" : r.partyKey)}>{L("মেসেজ", "Message")}</button>}{" "}
                      {(r.status === "ready" || (r.status === "done" && isOwner)) && (r.options || []).filter((o) => o.reason !== "off").map((o) => (
                        <button key={o.channel} type="button" className={r.status === "ready" ? "pm-btn pm-btn--primary" : "pm-btn-secondary"} style={{ marginRight: 4 }} disabled={!!busy || !o.ok}
                          onClick={() => send(r, { channel: o.channel, again: r.status === "done" })}
                          title={o.ok ? (o.via === "provider" ? L("আপনার প্রোভাইডারে পাঠায়", "Hands it to your provider") : L("অ্যাপ খোলে, Send আপনি চাপবেন", "Opens the app; you press Send"))
                            : o.reason === "noEmail" ? L("কাস্টমারে ইমেইল নেই", "No email on the customer") : o.reason === "providerUrl" ? L("প্রোভাইডারের ঠিকানা https নয়", "The provider address is not https") : L("কাস্টমারে ফোন নম্বর নেই", "No phone number on the customer")}>
                          {busy === `${r.customerId}:${o.channel}` ? "..." : `${r.status === "done" ? L("আবার ", "Again ") : ""}${o.channel === "whatsapp" ? "WhatsApp" : o.channel === "sms" ? "SMS" : L("ইমেইল", "Email")}`}
                        </button>
                      ))}
                      {preview === r.partyKey && <div className="si-hint" style={{ marginLeft: 0, whiteSpace: "pre-wrap", maxWidth: 360 }}>{reminderText(r, { settings, shopName, cur })}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="si-note">
          {L(
            "বকেয়া = ডেটরস এজিংয়ের একই হিসাব (জমা টাকা আগে পুরোনো বিল শোধ করে), শেষ তারিখ বিলের নিজের, না থাকলে কাস্টমারের Credit Days। WhatsApp / SMS / ইমেইল বোতাম মেসেজ লিখে অ্যাপ খোলে - Send আপনি চাপবেন; প্রোভাইডার দেওয়া থাকলে SMS / ইমেইল সেখানে যায় আর \"প্রোভাইডার গ্রহণ করেছে\" লেখা থাকে, এটা পৌঁছানোর প্রমাণ নয়। S4 নিজে থেকে পেছনে কিছু পাঠায় না - প্রতিটা রিমাইন্ডার একজন মানুষ শুরু করেন। একজনকে দিনে একবার (রিমাইন্ডার পাতায় দেখা যায়)।",
            "Overdue = the same as the debtors ageing (money received clears the oldest bills first); due date = the bill's own, else the customer's Credit Days. The WhatsApp / SMS / Email buttons open the app with the message typed in - you press Send; with a provider set, SMS / email go to it and S4 records \"accepted by your provider\", which is not proof it was received. S4 sends nothing in the background - a person starts every reminder. Once a day per customer (see the Reminders page)."
          )}
        </div>
      </div>
    </div>
  );
}
