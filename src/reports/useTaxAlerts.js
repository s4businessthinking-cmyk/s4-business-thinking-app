import { useEffect, useMemo, useRef, useState } from "react";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { computeAccounts } from "./accountsCalc.js";
import { computeVat, corporateTax, ctDueDate, fyRange, periodRange, taxSettingsOf, addDays } from "./taxDomain.js";
import { taxDueAlerts } from "./taxAlerts.js";
import { ymd } from "../reminders/reminders.js";
import { systemNotify } from "../reminders/useReminderAlerts.js";

const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "") ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full */ } };

// Re-notify (system popup) up to 3 times a day — every 8 hours — while a tax alert stays unresolved.
const SLOTS_PER_DAY = 3;
const slotOf = (d = new Date()) => Math.floor(d.getHours() / (24 / SLOTS_PER_DAY));

/** Tax-due alerts (how much VAT/Corporate Tax to pay, or refundable) — system notification up to 3x/day
 * while unresolved; the bell item itself can be dismissed for the day via each alert's `onSeen()`. */
export function useTaxAlerts({ shopId, shop, products = [], customers = [], vendors = [], lang = "en", toast, onOpen }) {
  const bn = lang === "bn";
  const settings = useMemo(() => taxSettingsOf(shop), [shop]);
  const enabled = !!shopId && settings.taxNotify !== false;
  const [data, setData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [day, setDay] = useState(() => ymd(new Date()));
  const [slot, setSlot] = useState(() => slotOf(new Date()));
  const [seenTick, setSeenTick] = useState(0);
  const latest = useRef({ toast, onOpen });
  latest.current = { toast, onOpen };

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    Promise.all([loadInvoiceRows(), offlineList("expenses")])
      .then(([rows, ex]) => { if (!cancelled) setData({ ...rows, expenses: rowsOf(ex) }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled, shopId, day]);

  // Once a payment (or refund) has been recorded for a period — from the Tax Report's own
  // "Payment history" — that period's alert stops nagging, same way marking a reminder done does.
  // Reloaded daily, and right away on save/delete (TaxReport dispatches this event), so the bell
  // and the recurring popup both notice immediately instead of waiting for the next day's refresh.
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const load = () => offlineList("taxPayments").then((rows) => { if (!cancelled) setPayments(rowsOf(rows).filter((p) => p.shopId === shopId)); }).catch(() => {});
    load();
    window.addEventListener("s4-tax-payments-changed", load);
    return () => { cancelled = true; window.removeEventListener("s4-tax-payments-changed", load); };
  }, [enabled, shopId, day]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => { const now = new Date(); setDay(ymd(now)); setSlot(slotOf(now)); }, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [enabled]);

  // The due date only applies once a period has actually closed — same "prev"/"last year" period
  // TaxReport's own filing steps use, not the still-open "cur"/"this year" one (offset 0 is always open).
  const period = useMemo(() => periodRange(settings, -1), [settings, day]);
  const fy = useMemo(() => fyRange(settings, -1), [settings, day]);
  const dueDate = settings.dueDays != null && settings.dueDays !== "" && period.to ? addDays(period.to, Number(settings.dueDays)) : "";
  const ctDue = settings.ctEnabled ? ctDueDate(fy.to) : "";

  const vat = useMemo(
    () => (enabled && data ? computeVat(data, { shopId, from: period.from, to: period.to, customers, vendors, defaultRegion: shop?.emirate }) : null),
    [enabled, data, shopId, period.from, period.to, customers, vendors, shop?.emirate],
  );
  const fyAcc = useMemo(
    () => (enabled && settings.ctEnabled && data ? computeAccounts(data, { products, shopId, from: fy.from, to: fy.to, bn }) : null),
    [enabled, settings.ctEnabled, data, products, shopId, fy.from, fy.to, bn],
  );
  const ct = fyAcc ? corporateTax({ profit: fyAcc.netProfit, revenue: fyAcc.netSales, settings }) : null;

  const vatResolved = payments.some((p) => p.view === "vat" && p.periodFrom === period.from && p.periodTo === period.to);
  const ctResolved = payments.some((p) => p.view === "ct" && p.periodFrom === fy.from && p.periodTo === fy.to);

  const alerts = useMemo(
    () => (enabled ? taxDueAlerts({ vat, ct, tn: settings.taxName || "VAT", cur: settings.currency || "AED", dueDate, ctDue, today: day, bn }) : [])
      .filter((a) => !(a.kind === "vat" && vatResolved) && !(a.kind === "ct" && ctResolved)),
    [enabled, vat, ct, settings.taxName, settings.currency, dueDate, ctDue, day, bn, vatResolved, ctResolved],
  );

  const sig = alerts.map((a) => a.key).join("|");
  useEffect(() => {
    if (!enabled || !shopId || !alerts.length) return;
    const storeKey = `s4-tax-alerted:${shopId}`;
    const sent = readJson(storeKey, {});
    for (const [k, v] of Object.entries(sent)) if (!String(v).startsWith(`${day}-`)) delete sent[k];
    const slotTag = `${day}-${slot}`;
    const fresh = alerts.filter((a) => sent[a.key] !== `${slotTag}:${a.tone || ""}`);
    if (!fresh.length) return;
    fresh.forEach((a) => { sent[a.key] = `${slotTag}:${a.tone || ""}`; });
    writeJson(storeKey, sent);
    fresh.forEach((a) => {
      latest.current.toast?.(`${a.icon} ${a.title}\n${a.sub}`);
      systemNotify(`${a.icon} ${a.title}`, a.sub, latest.current.onOpen, "s4-tax");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, shopId, sig, day, slot]);

  // The bell item disappears once opened (for the rest of the day) — it comes back tomorrow if still unresolved.
  const markSeen = (key) => {
    if (!shopId) return;
    const storeKey = `s4-tax-seen:${shopId}`;
    const seen = readJson(storeKey, {});
    seen[key] = day;
    writeJson(storeKey, seen);
    setSeenTick((v) => v + 1);
  };
  const seenMap = useMemo(() => readJson(`s4-tax-seen:${shopId}`, {}), [shopId, day, seenTick]);

  return alerts.filter((a) => seenMap[a.key] !== day).map((a) => ({ ...a, onSeen: () => markSeen(a.key) }));
}
