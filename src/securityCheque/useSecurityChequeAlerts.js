import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { securityChequeAlerts, securityChequeAlertText } from "./securityCheque.js";

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    const show = () => { const n = new Notification(title, { body, tag: "s4-security-cheque-alerts" }); n.onclick = () => { window.focus(); onClick?.(); n.close(); }; };
    if (Notification.permission === "granted") show();
    else if (Notification.permission === "default") Notification.requestPermission().then((p) => p === "granted" && show()).catch(() => {});
  } catch { /* not supported */ }
}

/** Stale (no-transaction) and closure-pending alerts for security cheques; announced once a day. */
export function useSecurityChequeAlerts({ shopId, enabled, lang = "en", cur = "AED", toast, onOpen }) {
  const [records, setRecords] = useState([]);
  const [today, setToday] = useState(localDay);
  const latest = useRef({ toast, onOpen });
  latest.current = { toast, onOpen };

  useEffect(() => {
    if (!enabled || !shopId) return undefined;
    const sub = subscribeShopCollection({ collectionName: "securityCheques", shopId, onRows: (rows) => setRecords(rows || []) });
    return () => { try { sub?.(); } catch { /* ignore */ } };
  }, [enabled, shopId]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setToday((d) => (localDay() === d ? d : localDay())), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [enabled]);

  const alerts = useMemo(
    () => (enabled && records.length ? securityChequeAlerts({ records, shopId, today }) : []),
    [enabled, records, shopId, today],
  );

  const keys = alerts.map((a) => a.key).join("|");
  useEffect(() => {
    if (!enabled || !shopId || !alerts.length) return;
    const storeKey = `s4-security-cheque-alerted:${shopId}`;
    const sent = readJson(storeKey, {});
    for (const [k, day] of Object.entries(sent)) if (day !== today) delete sent[k];
    const fresh = alerts.filter((a) => !sent[a.key]);
    if (!fresh.length) return;
    fresh.forEach((a) => { sent[a.key] = today; });
    writeJson(storeKey, sent);
    const bn = lang === "bn";
    const first = securityChequeAlertText(fresh[0], bn, cur);
    const title = fresh.length === 1 ? `${first.icon} ${first.title}` : bn ? `🔒 ${fresh.length}টি সিকিউরিটি চেক দেখতে হবে` : `🔒 ${fresh.length} security cheque(s) need attention`;
    const body = fresh.length === 1 ? first.sub : fresh.slice(0, 3).map((a) => securityChequeAlertText(a, bn, cur).title).join("\n") + (fresh.length > 3 ? (bn ? `\n…আরও ${fresh.length - 3}টি` : `\n…and ${fresh.length - 3} more`) : "");
    latest.current.toast?.(`${title}\n${body}`);
    systemNotify(title, body, latest.current.onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, shopId, keys, today, lang, cur]);

  return alerts;
}
