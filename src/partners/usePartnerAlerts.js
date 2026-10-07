import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { partnerAlerts, partnerAlertText, partnerSettingsOf } from "./partners.js";

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isNative = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "") ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full */ } };
// Standing reminders stay in the bell and on the Partners page instead of popping up every day.
const QUIET_KINDS = new Set(["shareTotal", "capitalDue"]);

function systemNotify(title, body, onClick) {
  if (isNative()) {
    LocalNotifications.schedule({ notifications: [{ id: Math.floor(Date.now() % 2000000000), title, body, schedule: { at: new Date(Date.now() + 1000) } }] }).catch(() => {});
    return;
  }
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const show = () => { const n = new Notification(title, { body, tag: "s4-partner-alerts" }); n.onclick = () => { window.focus(); onClick?.(); n.close(); }; };
    if (Notification.permission === "granted") show();
    else if (Notification.permission === "default") Notification.requestPermission().then((p) => p === "granted" && show()).catch(() => {});
  } catch { /* not supported */ }
}

/** Owner-only partner alerts (profit to share, payouts due, overdrawn partners); each is announced once a day. */
export function usePartnerAlerts({ shopId, enabled, shop, lang = "en", cur = "AED", toast, onOpen }) {
  const [data, setData] = useState({ partners: [], entries: [], expenses: [] });
  const [today, setToday] = useState(localDay);
  const latest = useRef({ toast, onOpen });
  latest.current = { toast, onOpen };
  const settings = partnerSettingsOf(shop);
  const settingsKey = JSON.stringify(settings);

  useEffect(() => {
    if (!enabled || !shopId) return undefined;
    const sub = (collectionName, key) => subscribeShopCollection({ collectionName, shopId, onRows: (rows) => setData((d) => ({ ...d, [key]: rows || [] })) });
    const subs = [sub("partners", "partners"), sub("partnerEntries", "entries"), sub("expenses", "expenses"), sub("partnerDocs", "docs")];
    return () => subs.forEach((u) => { try { u?.(); } catch { /* ignore */ } });
  }, [enabled, shopId]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setToday((d) => (localDay() === d ? d : localDay())), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [enabled]);

  const alerts = useMemo(
    () => (enabled && data.partners.length ? partnerAlerts({ partners: data.partners, entries: data.entries, expenses: data.expenses, docs: data.docs || [], shopId, today, settings: JSON.parse(settingsKey) }) : []),
    [enabled, data, shopId, today, settingsKey],
  );

  const keys = alerts.map((a) => a.key).join("|");
  useEffect(() => {
    if (!enabled || !shopId || !alerts.length) return;
    const storeKey = `s4-partner-alerted:${shopId}`;
    const sent = readJson(storeKey, {});
    for (const [k, day] of Object.entries(sent)) if (day !== today) delete sent[k];
    const fresh = alerts.filter((a) => !QUIET_KINDS.has(a.kind) && !sent[a.key]);
    if (!fresh.length) return;
    fresh.forEach((a) => { sent[a.key] = today; });
    writeJson(storeKey, sent);
    const bn = lang === "bn";
    const first = partnerAlertText(fresh[0], bn, cur);
    const title = fresh.length === 1 ? `${first.icon} ${first.title}` : bn ? `🤝 পার্টনারদের ${fresh.length}টি বিষয় দেখতে হবে` : `🤝 ${fresh.length} partner matters need attention`;
    const body = fresh.length === 1 ? first.sub : fresh.slice(0, 3).map((a) => partnerAlertText(a, bn, cur).title).join("\n") + (fresh.length > 3 ? (bn ? `\n…আরও ${fresh.length - 3}টি` : `\n…and ${fresh.length - 3} more`) : "");
    latest.current.toast?.(`${title}\n${body}`);
    systemNotify(title, body, latest.current.onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, shopId, keys, today, lang, cur]);

  return alerts;
}
