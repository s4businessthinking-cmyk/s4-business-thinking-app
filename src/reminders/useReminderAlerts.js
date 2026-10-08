import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { reminderAlerts, reminderAlertText, ymd } from "./reminders.js";

const hm = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const isNative = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "") ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full */ } };

function systemNotify(title, body, onClick) {
  if (isNative()) {
    LocalNotifications.schedule({ notifications: [{ id: Math.floor(Date.now() % 2000000000), title, body, schedule: { at: new Date(Date.now() + 1000) } }] }).catch(() => {});
    return;
  }
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const show = () => { const n = new Notification(title, { body, tag: "s4-reminders" }); n.onclick = () => { window.focus(); onClick?.(); n.close(); }; };
    if (Notification.permission === "granted") show();
    else if (Notification.permission === "default") Notification.requestPermission().then((p) => p === "granted" && show()).catch(() => {});
  } catch { /* not supported */ }
}

/** Reminders that are due for this user; each one is announced once a day (and again when its time arrives). */
export function useReminderAlerts({ shopId, uid, isOwner, enabled = true, lang = "en", toast, onOpen }) {
  const [rows, setRows] = useState([]);
  const [clock, setClock] = useState(() => ({ day: ymd(new Date()), time: hm() }));
  const latest = useRef({ toast, onOpen });
  latest.current = { toast, onOpen };

  useEffect(() => {
    if (!enabled || !shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName: "reminders", shopId, onRows: (list) => setRows(list || []) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [enabled, shopId]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setClock({ day: ymd(new Date()), time: hm() }), 60 * 1000);
    return () => clearInterval(id);
  }, [enabled]);

  const alerts = useMemo(
    () => (enabled && rows.length ? reminderAlerts(rows, { uid, isOwner, today: clock.day, nowTime: clock.time }) : []),
    [enabled, rows, uid, isOwner, clock],
  );

  const sig = alerts.map((a) => `${a.key}:${a.state}`).join("|");
  useEffect(() => {
    if (!enabled || !shopId || !alerts.length) return;
    const storeKey = `s4-reminder-alerted:${shopId}:${uid || ""}`;
    const sent = readJson(storeKey, {});
    for (const [k, v] of Object.entries(sent)) if (!String(v).startsWith(clock.day)) delete sent[k];
    const fresh = alerts.filter((a) => sent[a.key] !== `${clock.day}:${a.state}`);
    if (!fresh.length) return;
    fresh.forEach((a) => { sent[a.key] = `${clock.day}:${a.state}`; });
    writeJson(storeKey, sent);
    const bn = lang === "bn";
    const first = reminderAlertText(fresh[0], bn);
    const title = fresh.length === 1 ? `${first.icon} ${first.title}` : bn ? `🔔 ${fresh.length}টি রিমাইন্ডার` : `🔔 ${fresh.length} reminders`;
    const body = fresh.length === 1 ? first.sub : fresh.slice(0, 3).map((a) => a.title).join("\n") + (fresh.length > 3 ? (bn ? `\n…আরও ${fresh.length - 3}টি` : `\n…and ${fresh.length - 3} more`) : "");
    latest.current.toast?.(`${title}\n${body}`);
    systemNotify(title, body, latest.current.onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, shopId, uid, sig, clock.day, lang]);

  return alerts;
}
