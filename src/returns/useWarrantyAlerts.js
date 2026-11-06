import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { systemNotify } from "../reminders/useReminderAlerts.js";
import { warrantyAlertText, warrantyOverdueAlerts, ymd } from "./warrantyClaim.js";

const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "") ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } };

/** Big toast + system notify for warranty claims still waiting on company change. */
export function useWarrantyAlerts({ shopId, enabled = true, lang = "en", toast, onOpen }) {
  const [rows, setRows] = useState([]);
  const [today, setToday] = useState(() => ymd(new Date()));
  const latest = useRef({ toast, onOpen });
  latest.current = { toast, onOpen };

  useEffect(() => {
    if (!enabled || !shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName: "warrantyClaims", shopId, onRows: (list) => setRows(list || []) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [enabled, shopId]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setToday(ymd(new Date())), 60 * 1000);
    return () => clearInterval(id);
  }, [enabled]);

  const alerts = useMemo(
    () => (enabled && rows.length ? warrantyOverdueAlerts(rows, today) : []),
    [enabled, rows, today],
  );

  const sig = alerts.map((a) => `${a.key}:${a.state}`).join("|");
  useEffect(() => {
    if (!enabled || !shopId || !alerts.length) return;
    const storeKey = `s4-warranty-alerted:${shopId}`;
    const sent = readJson(storeKey, {});
    for (const [k, v] of Object.entries(sent)) if (!String(v).startsWith(today)) delete sent[k];
    const fresh = alerts.filter((a) => sent[a.key] !== `${today}:${a.state}`);
    if (!fresh.length) return;
    fresh.forEach((a) => { sent[a.key] = `${today}:${a.state}`; });
    writeJson(storeKey, sent);
    const bn = lang === "bn";
    const first = warrantyAlertText(fresh[0], bn);
    const title = fresh.length === 1
      ? `${first.icon} ${first.title}`
      : (bn ? `🔋 ${fresh.length}টি গ্যারান্টি চেঞ্জ বাকি!` : `🔋 ${fresh.length} warranty changes pending!`);
    const body = fresh.length === 1
      ? first.sub
      : fresh.slice(0, 4).map((a) => `${a.claimNo} · ${a.productName || ""}`).join("\n")
        + (fresh.length > 4 ? (bn ? `\n…আরও ${fresh.length - 4}টি` : `\n…and ${fresh.length - 4} more`) : "");
    latest.current.toast?.(`${title}\n${body}`, "err");
    systemNotify(title, body, latest.current.onOpen, "s4-warranty");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, shopId, sig, today, lang]);

  return alerts;
}
