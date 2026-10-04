import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { chequeTypeLabel } from "./ChequeDueAlert.jsx";

const money = (v) => (Math.round((parseFloat(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? d.split("-").reverse().join("/") : "");
const isNative = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };

// Reminders go out this many days before the cheque date, then daily from the date on.
const REMIND_BEFORE = [7, 2, 1];
const NOTIFY_HOUR = 9;

function showSystemNotification(title, body, onClick, tag = "s4-cheque-due") {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const show = () => {
      const n = new Notification(title, { body, tag });
      n.onclick = () => {
        window.focus();
        onClick?.();
        n.close();
      };
    };
    if (Notification.permission === "granted") show();
    else if (Notification.permission === "default") Notification.requestPermission().then((p) => p === "granted" && show()).catch(() => {});
  } catch (error) {
    console.warn("[S4 Cheque] system notification unavailable", error);
  }
}

const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "") ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full */ } };

const stageFor = (daysLeft) => REMIND_BEFORE.slice().sort((a, b) => a - b).find((d) => daysLeft <= d) ?? null;

const describe = (c, bn, cur) =>
  `${chequeTypeLabel(c.type, bn)}: ${c.party || "—"} · ${bn ? "চেক" : "Cheque"} ${c.chequeNo || c.no} · ${cur} ${money(c.amount)}`;

function idFor(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2000000000) + 1;
}

// Phone: schedule system notifications ahead of time so they arrive even when
// the app is closed. Needs the local-notifications plugin in the installed APK.
async function scheduleNative({ shopId, cheques, bn, cur }) {
  const storeKey = `s4-cheque-native:${shopId}`;
  const previous = readJson(storeKey, []);
  try {
    if (previous.length) await LocalNotifications.cancel({ notifications: previous.map((id) => ({ id })) });
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      const asked = await LocalNotifications.requestPermissions();
      if (asked.display !== "granted") return;
    }
    const now = Date.now();
    const list = [];
    for (const c of cheques) {
      for (const before of [...REMIND_BEFORE, 0]) {
        const at = new Date(`${c.chequeDate}T00:00:00`);
        at.setDate(at.getDate() - before);
        at.setHours(NOTIFY_HOUR, 0, 0, 0);
        if (at.getTime() <= now) continue;
        list.push({
          id: idFor(`${c.key}|${c.chequeDate}|${before}`),
          title: before === 0
            ? (bn ? "🔔 আজ চেকের তারিখ — ক্লিয়ার হয়েছে কিনা দেখুন" : "🔔 Cheque date today — check if it cleared")
            : (bn ? `⏳ ${before} দিন পর চেকের তারিখ` : `⏳ Cheque due in ${before} day(s)`),
          body: `${describe(c, bn, cur)} · 📅 ${fmtDay(c.chequeDate)}`,
          schedule: { at, allowWhileIdle: true },
          extra: { chequeKey: c.key },
        });
      }
    }
    const capped = list.sort((a, b) => a.schedule.at - b.schedule.at).slice(0, 60);
    if (capped.length) await LocalNotifications.schedule({ notifications: capped });
    writeJson(storeKey, capped.map((n) => n.id));
  } catch (error) {
    console.warn("[S4 Cheque] phone notifications unavailable", error?.message || error);
  }
}

// Tells the owner about pending cheques: 7, 2 and 1 day before the cheque
// date, then once a day from the date until it is cleared, bounced or moved.
export function useChequeDueNotifications({ shopId, enabled, cheques = [], upcoming = [], pending = [], today, lang, toast, onOpen, cur = "AED" }) {
  const latest = useRef({ toast, onOpen });
  latest.current = { toast, onOpen };
  const bn = lang === "bn";
  const keys = cheques.map((c) => c.key).join(",");
  const upcomingKeys = upcoming.map((c) => `${c.key}@${c.chequeDate}`).join(",");
  const pendingKeys = pending.map((c) => `${c.key}@${c.chequeDate}`).join(",");

  useEffect(() => {
    if (!enabled || !isNative()) return undefined;
    let handle;
    LocalNotifications.addListener("localNotificationActionPerformed", () => latest.current.onOpen?.())
      .then((h) => { handle = h; })
      .catch(() => {});
    return () => { handle?.remove?.(); };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !shopId || !isNative()) return;
    scheduleNative({ shopId, cheques: pending, bn, cur });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, shopId, pendingKeys, bn, cur]);

  useEffect(() => {
    if (!enabled || !shopId || !today || !cheques.length) return;
    const prefix = `s4-cheque-notified:${shopId}:`;
    const storeKey = prefix + today;
    let notified;
    try {
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix) && k !== storeKey) localStorage.removeItem(k);
      }
      notified = new Set(JSON.parse(localStorage.getItem(storeKey) || "[]"));
    } catch {
      notified = new Set();
    }
    const fresh = cheques.filter((c) => !notified.has(c.key));
    if (!fresh.length) return;
    fresh.forEach((c) => notified.add(c.key));
    writeJson(storeKey, [...notified]);

    const total = fresh.reduce((a, c) => a + c.amount, 0);
    const title = bn ? "🔔 চেকের তারিখ হয়েছে — ক্লিয়ার হয়েছে কিনা দেখুন" : "🔔 Cheque date reached — check if it cleared";
    const body = fresh.length === 1
      ? describe(fresh[0], bn, cur)
      : bn ? `${fresh.length}টি চেক · মোট ${cur} ${money(total)} — ড্যাশবোর্ড থেকে ক্লিয়ার করুন` : `${fresh.length} cheques · ${cur} ${money(total)} — clear them from the dashboard`;
    latest.current.toast?.(`${title}\n${body}`);
    if (!isNative()) showSystemNotification(title, body, latest.current.onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, shopId, today, keys]);

  useEffect(() => {
    if (!enabled || !shopId || !today || !upcoming.length) return;
    const storeKey = `s4-cheque-reminded:${shopId}`;
    const sent = readJson(storeKey, {});
    for (const [k, day] of Object.entries(sent)) if (!(Date.parse(today) - Date.parse(day) <= 40 * 86400000)) delete sent[k];
    const fresh = [];
    for (const c of upcoming) {
      const left = -c.daysLate;
      const stage = stageFor(left);
      if (stage == null) continue;
      const k = `${c.key}|${c.chequeDate}|${stage}`;
      if (sent[k]) continue;
      sent[k] = today;
      fresh.push({ ...c, left });
    }
    writeJson(storeKey, sent);
    if (!fresh.length) return;

    const soonest = Math.min(...fresh.map((c) => c.left));
    const title = bn ? `⏳ ${soonest} দিন পর চেকের তারিখ` : `⏳ Cheque due in ${soonest} day(s)`;
    const body = fresh.length === 1
      ? `${describe(fresh[0], bn, cur)} · 📅 ${fmtDay(fresh[0].chequeDate)}`
      : bn
        ? `${fresh.length}টি চেক সামনে আসছে · মোট ${cur} ${money(fresh.reduce((a, c) => a + c.amount, 0))}`
        : `${fresh.length} cheques coming up · ${cur} ${money(fresh.reduce((a, c) => a + c.amount, 0))}`;
    latest.current.toast?.(`${title}\n${body}`);
    if (!isNative()) showSystemNotification(title, body, latest.current.onOpen, "s4-cheque-upcoming");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, shopId, today, upcomingKeys]);
}
