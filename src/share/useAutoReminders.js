// Runs the automatic payment reminders (share/autoReminders.js) while S4 is open: checks once a minute whether today's
// run is due on this device, re-reads the Reminders collection right before sending (so a reminder made by hand a
// moment ago is not repeated), hands the rows to the provider, saves the records and refreshes the queue.
import { useCallback, useEffect, useRef, useState } from "react";
import { offlineCreate, offlineList } from "../offline/offlineRepository";
import { rowsOf } from "../inventory/stockFromInvoices";
import { getOrCreateDeviceId } from "../auth/licenseService";
import { AUTO_RUN_EVENT, autoDue, autoRunText, autoSettingsOf, readAutoRun, runAutoReminders, writeAutoRun } from "./autoReminders.js";

// one run at a time across the app timer and the screen's Run now button
let busy = false;
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function useAutoReminders({ shop, shopId, reminders, user = null, profile = null, cur = "AED", shopName = "", lang = "en", toast, enabled = true, checkMs = 60 * 1000 }) {
  const { settings, channels, on, queue, loaded, refresh } = reminders || {};
  const auto = autoSettingsOf(shop);
  const [deviceId, setDeviceId] = useState("");
  const [lastRun, setLastRun] = useState(() => readAutoRun(shopId));
  const pending = useRef(0); // when the pre-run reload was asked for (0 = none)
  const ranDay = useRef("");
  const latest = useRef({});
  latest.current = { auto, channels, settings, queue, loaded, on, shopId, user, profile, cur, shopName, lang, toast, refresh };

  useEffect(() => {
    let cancelled = false;
    getOrCreateDeviceId().then((id) => { if (!cancelled) setDeviceId(String(id || "")); }).catch((e) => console.warn("[S4 Auto reminders] no device id", e));
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { setLastRun(readAutoRun(shopId)); ranDay.current = ""; }, [shopId]);
  useEffect(() => {
    const onRun = (e) => {
      if ((e?.detail?.shopId || "") !== (shopId || "")) return;
      setLastRun(e.detail.run || readAutoRun(shopId));
      if (e.detail.run?.day) ranDay.current = e.detail.run.day;
    };
    window.addEventListener(AUTO_RUN_EVENT, onRun);
    return () => window.removeEventListener(AUTO_RUN_EVENT, onRun);
  }, [shopId]);

  const run = useCallback(async ({ manual = false } = {}) => {
    const c = latest.current;
    if (busy || !c.loaded || !c.shopId) return null;
    const today = localDay();
    busy = true;
    // marked before sending: a provider that is down is not called again every minute (the owner can press Run now)
    ranDay.current = today;
    try {
      const saved = rowsOf(await offlineList("reminders").catch(() => [])).filter((r) => r && (!r.shopId || r.shopId === c.shopId));
      const result = await runAutoReminders({
        queue: c.queue, auto: c.auto, channels: c.channels, settings: c.settings, reminders: saved, today, shopId: c.shopId,
        user: c.user, profile: c.profile, cur: c.cur, shopName: c.shopName,
        save: (rec) => offlineCreate("reminders", rec),
      });
      const summary = { day: today, at: new Date().toISOString(), manual, handedOff: result.handedOff.length, failed: result.failed.length, skipped: result.skipped.length,
        errors: result.failed.slice(0, 5).map((x) => `${x.name} (${x.channel}) ${x.message}`) };
      writeAutoRun(c.shopId, summary);
      setLastRun(summary);
      if (result.handedOff.length || result.failed.length || manual) c.toast?.(autoRunText(result, c.lang === "bn"), result.failed.length ? "err" : undefined);
      if (result.handedOff.length && navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
      c.refresh?.();
      return result;
    } catch (e) {
      console.warn("[S4 Auto reminders] run failed", e);
      c.toast?.(`${c.lang === "bn" ? "স্বয়ংক্রিয় রিমাইন্ডার চালানো যায়নি" : "Automatic reminders could not run"}: ${e?.message || e}`, "err");
      return null;
    } finally { busy = false; }
  }, []);

  useEffect(() => {
    if (!enabled || !auto.on) return undefined;
    const tick = () => {
      const c = latest.current;
      const now = new Date();
      const today = localDay(now);
      const lastRunDay = ranDay.current === today ? today : readAutoRun(c.shopId)?.day || "";
      // due: reload the queue first (it can be minutes old - a customer may have paid), run once the fresh one is in
      // a reload that never came back (load error) must not block the run for the rest of the session
      if (pending.current && Date.now() - pending.current > 2 * 60 * 1000) pending.current = 0;
      if (!pending.current && autoDue({ auto: c.auto, channels: c.channels, enabled: c.on, deviceId, today, hour: now.getHours(), lastRunDay }).due) {
        pending.current = Date.now();
        c.refresh?.();
      }
    };
    tick();
    const timer = window.setInterval(tick, checkMs);
    return () => window.clearInterval(timer);
  }, [enabled, auto.on, deviceId, checkMs, loaded]);
  useEffect(() => {
    if (!pending.current || !loaded) return;
    pending.current = 0;
    run();
  }, [queue, loaded, run]);

  return { auto, deviceId, isThisDevice: !!deviceId && deviceId === auto.deviceId, lastRun, runNow: () => run({ manual: true }) };
}
