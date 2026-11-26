// Payment reminder channels (accounts/overdueReminders.js builds the list; this file says how each one leaves S4).
// - WhatsApp: (a) opens the chat with the message typed in (openWhatsAppText); the person presses Send.  -> "openedWhatsApp"
//         (b) the owner's own HTTPS WhatsApp / WABA gateway (shop.overdueReminders.whatsappProvider) -> "handedOffWhatsApp"
// - SMS:  (a) opens the phone's messages app with the text (sms: link)                                  -> "openedSms"
//         (b) the owner's own HTTPS SMS provider (shop.overdueReminders.smsProvider: { url, token })      -> "handedOffSms"
// - Email:(a) opens the mail app with subject and text (mailto: link)                                  -> "openedEmail"
//         (b) the owner's own HTTPS email provider (shop.overdueReminders.emailProvider: { url, token })  -> "handedOffEmail"
// "handedOff" means the provider answered 2xx to our request (its message id is kept when it gives one); it is never
// called delivered - S4 has no proof a phone or inbox received it. A failed call is reported with its real error and
// saves nothing. Automatic run (share/autoReminders.js): owner's https SMS / email / WhatsApp provider only, once a day.
// Settings live under shop.overdueReminders, which keeps its case on save (utils/capsSavedText.js), tokens included.
import { normalizeWaPhone, partyPhone } from "./whatsappDocShare.js";

const clean = (v) => String(v ?? "").trim();
export const CHANNELS = ["whatsapp", "sms", "email"];
export const REMINDER_STATUS = {
  openedWhatsApp: { en: "Opened in WhatsApp - press Send there", bn: "WhatsApp-এ খোলা হয়েছে - সেখানে Send চাপুন" },
  openedSms: { en: "Opened in the messages app - press Send there", bn: "মেসেজ অ্যাপে খোলা হয়েছে - সেখানে Send চাপুন" },
  openedEmail: { en: "Opened in the mail app - press Send there", bn: "মেইল অ্যাপে খোলা হয়েছে - সেখানে Send চাপুন" },
  handedOffSms: { en: "Accepted by your SMS provider (not proof it was received)", bn: "আপনার SMS প্রোভাইডার গ্রহণ করেছে (পৌঁছানোর প্রমাণ নয়)" },
  handedOffEmail: { en: "Accepted by your email provider (not proof it was received)", bn: "আপনার ইমেইল প্রোভাইডার গ্রহণ করেছে (পৌঁছানোর প্রমাণ নয়)" },
  handedOffWhatsApp: { en: "Accepted by your WhatsApp provider (not proof it was received)", bn: "আপনার WhatsApp প্রোভাইডার গ্রহণ করেছে (পৌঁছানোর প্রমাণ নয়)" },
};
export const DEFAULT_EMAIL_SUBJECT = { en: "Payment reminder from {shop}", bn: "{shop} থেকে বকেয়ার রিমাইন্ডার" };

const provider = (p) => ({ url: clean(p?.url), token: clean(p?.token) });
/** Channel settings: WhatsApp on unless switched off; SMS and email off unless switched on. */
export function channelSettingsOf(shop) {
  const s = shop?.overdueReminders || {};
  const c = s.channels || {};
  return {
    whatsapp: c.whatsapp !== false, sms: c.sms === true, email: c.email === true,
    whatsappProvider: provider(s.whatsappProvider), smsProvider: provider(s.smsProvider), emailProvider: provider(s.emailProvider),
    emailSubjectEn: clean(s.emailSubjectEn) || DEFAULT_EMAIL_SUBJECT.en, emailSubjectBn: clean(s.emailSubjectBn) || DEFAULT_EMAIL_SUBJECT.bn,
  };
}

export const customerEmail = (c) => { const e = clean(c?.email); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ""; };

/**
 * What each switched-on channel can do for one customer. -> [{ channel, ok, via: "open" | "provider", reason }]
 * reason: "off" (not switched on), "noPhone", "noEmail", "providerUrl" (the provider address is not https).
 */
export function channelOptions(customer, channels, { countryCode } = {}) {
  const phone = customer ? normalizeWaPhone(partyPhone(customer), countryCode) : "";
  const email = customerEmail(customer);
  const via = (p) => (p.url ? (/^https:\/\//i.test(p.url) ? "provider" : "bad") : "open");
  return CHANNELS.map((ch) => {
    if (!channels[ch]) return { channel: ch, ok: false, via: "", reason: "off" };
    if (ch === "whatsapp") {
      const v = via(channels.whatsappProvider || {});
      if (v === "bad") return { channel: ch, ok: false, via: "provider", reason: "providerUrl" };
      return phone ? { channel: ch, ok: true, via: v, reason: "", to: phone } : { channel: ch, ok: false, via: v, reason: "noPhone" };
    }
    const v = via(ch === "sms" ? channels.smsProvider : channels.emailProvider);
    if (v === "bad") return { channel: ch, ok: false, via: "provider", reason: "providerUrl" };
    if (ch === "sms") return phone ? { channel: ch, ok: true, via: v, reason: "", to: phone } : { channel: ch, ok: false, via: v, reason: "noPhone" };
    return email ? { channel: ch, ok: true, via: v, reason: "", to: email } : { channel: ch, ok: false, via: v, reason: "noEmail" };
  });
}

/** sms: link for the phone's messages app (RFC 5724). */
export const smsUrl = (phone, text) => `sms:+${String(phone || "").replace(/\D/g, "")}?body=${encodeURIComponent(String(text || ""))}`;
/** mailto: link with subject and text. */
export const mailtoUrl = (email, subject, body) => `mailto:${encodeURIComponent(clean(email)).replace(/%40/g, "@")}?subject=${encodeURIComponent(String(subject || ""))}&body=${encodeURIComponent(String(body || ""))}`;

/** Provider credentials for sms / email / whatsapp automatic or manual provider sends. */
export function providerConfigForChannel(channels, ch) {
  if (ch === "whatsapp") return channels?.whatsappProvider;
  if (ch === "email") return channels?.emailProvider;
  return channels?.smsProvider;
}

/** The request to the owner's provider: POST JSON { to, message, subject? } with the token as a Bearer header. */
export function providerRequest(p, { to, message, subject = "" }) {
  const url = clean(p?.url);
  if (!/^https:\/\//i.test(url)) return { error: "providerUrl" };
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (clean(p?.token)) headers.Authorization = `Bearer ${clean(p.token)}`;
  return { url, method: "POST", headers, body: JSON.stringify(subject ? { to, subject, message } : { to, message }) };
}

/** The desktop app's HTTPS bridge (no browser CORS), else fetch. Same shape: req -> { status, text }. */
export function defaultProviderTransport(timeoutMs = 20000) {
  const desk = typeof window !== "undefined" ? window.S4Desktop?.asp?.request : null;
  // purpose: the desktop bridge words its errors for the SMS / email provider, not the e-invoice ASP
  if (typeof desk === "function") return (req) => desk({ ...req, purpose: req.purpose || "provider" });
  return async (req) => {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, redirect: "error", signal: ctrl?.signal });
      return { status: res.status, text: await res.text() };
    } catch (e) {
      throw new Error(ctrl?.signal.aborted ? `The provider did not answer within ${timeoutMs / 1000} seconds` : String(e?.message || e));
    } finally { if (timer) clearTimeout(timer); }
  };
}

/**
 * Hand one message to the owner's provider. -> { ok: true, status: "handedOffSms" | "handedOffEmail", httpStatus, providerId }
 * | { ok: false, error, httpStatus, message }. Only a 2xx reply is a hand-off; the reply text never makes it "delivered".
 */
const HANDED_OFF = { sms: "handedOffSms", email: "handedOffEmail", whatsapp: "handedOffWhatsApp" };
const PROVIDER_PURPOSE = { sms: "sms", email: "email", whatsapp: "whatsapp" };

export async function sendViaProvider(kind, p, { to, message, subject = "", transport = defaultProviderTransport() } = {}) {
  const req = providerRequest(p, { to, message, subject: kind === "email" ? subject : "" });
  if (!req.error) req.purpose = PROVIDER_PURPOSE[kind] || "provider";
  if (req.error) return { ok: false, error: req.error, httpStatus: 0, message: "The provider address must start with https://" };
  let res;
  try { res = await transport(req); } catch (e) { return { ok: false, error: "network", httpStatus: 0, message: String(e?.message || e) }; }
  const httpStatus = Number(res?.status) || 0;
  let body = null;
  try { body = res?.text ? JSON.parse(res.text) : null; } catch { body = null; }
  if (httpStatus < 200 || httpStatus >= 300) {
    const msg = clean(body?.message || body?.error?.message || body?.error || res?.text).slice(0, 200);
    return { ok: false, error: "http", httpStatus, message: msg || `The provider answered ${httpStatus}` };
  }
  const providerId = clean(body?.id || body?.messageId || body?.message_id || body?.sid || body?.data?.id || body?.data?.messageId);
  return { ok: true, status: HANDED_OFF[kind] || "handedOffSms", httpStatus, providerId };
}

/** The status words a reminder record can carry. */
export const statusWord = (channel, via) => {
  if (via === "provider") return HANDED_OFF[channel] || "handedOffSms";
  if (channel === "whatsapp") return "openedWhatsApp";
  if (channel === "email") return "openedEmail";
  return "openedSms";
};
