import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { employeeAlerts, alertText } from "./employeeAlerts.js";

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
    const show = () => { const n = new Notification(title, { body, tag: "s4-employee-alerts" }); n.onclick = () => { window.focus(); onClick?.(); n.close(); }; };
    if (Notification.permission === "granted") show();
    else if (Notification.permission === "default") Notification.requestPermission().then((p) => p === "granted" && show()).catch(() => {});
  } catch { /* not supported */ }
}

/**
 * Live employee alerts for the bell and the Employees screen; each new alert is announced once a day
 * (toast + system notification) so the owner hears about it without opening the screen.
 */
export function useEmployeeAlerts({ shopId, enabled, shopCountry = "", lang = "en", cur = "AED", toast, onOpen }) {
  const [data, setData] = useState({ employees: [], docs: [], expenses: [], attendance: [] });
  const [clock, setClock] = useState(() => ({ today: localDay(), hour: new Date().getHours() }));
  const latest = useRef({ toast, onOpen });
  latest.current = { toast, onOpen };

  useEffect(() => {
    if (!enabled || !shopId) return undefined;
    const sub = (collectionName, key) => subscribeShopCollection({ collectionName, shopId, onRows: (rows) => setData((d) => ({ ...d, [key]: rows || [] })) });
    const subs = [sub("employees", "employees"), sub("employeeDocs", "docs"), sub("expenses", "expenses"), sub("attendance", "attendance")];
    return () => subs.forEach((u) => { try { u?.(); } catch { /* ignore */ } });
  }, [enabled, shopId]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setClock((c) => {
      const next = { today: localDay(), hour: new Date().getHours() };
      return next.today === c.today && next.hour === c.hour ? c : next;
    }), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [enabled]);

  const alerts = useMemo(
    () => (enabled && data.employees.length ? employeeAlerts({ ...data, shopId, shopCountry, today: clock.today, nowHour: clock.hour }) : []),
    [enabled, data, shopId, shopCountry, clock],
  );

  const keys = alerts.map((a) => a.key).join("|");
  useEffect(() => {
    if (!enabled || !shopId || !alerts.length) return;
    const storeKey = `s4-employee-alerted:${shopId}`;
    const sent = readJson(storeKey, {});
    for (const [k, day] of Object.entries(sent)) if (day !== clock.today) delete sent[k];
    const fresh = alerts.filter((a) => a.tone !== "info" || a.daysLeft === 0).filter((a) => !sent[a.key]);
    if (!fresh.length) return;
    fresh.forEach((a) => { sent[a.key] = clock.today; });
    writeJson(storeKey, sent);
    const bn = lang === "bn";
    const first = alertText(fresh[0], bn, cur);
    const title = fresh.length === 1 ? `${first.icon} ${first.title}` : bn ? `👷 কর্মচারীদের ${fresh.length}টি বিষয় দেখতে হবে` : `👷 ${fresh.length} employee matters need attention`;
    const body = fresh.length === 1 ? first.sub : fresh.slice(0, 3).map((a) => alertText(a, bn, cur).title).join("\n") + (fresh.length > 3 ? (bn ? `\n…আরও ${fresh.length - 3}টি` : `\n…and ${fresh.length - 3} more`) : "");
    latest.current.toast?.(`${title}\n${body}`);
    systemNotify(title, body, latest.current.onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, shopId, keys, clock.today, lang, cur]);

  return alerts;
}
