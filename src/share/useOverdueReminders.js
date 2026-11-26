// The overdue reminder list (accounts/overdueReminders.js) for the Payment Reminders page and the bell. Built from the
// saved documents with the same ledger as the ageing report, only while the owner has switched reminders on, when the
// window comes back into focus and every few minutes.
import { useEffect, useMemo, useState } from "react";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { buildGlobalLedger } from "../ledger/globalLedger.js";
import { countryCodeOf } from "./whatsappDocShare.js";
import { reminderQueue, reminderSettingsOf } from "../accounts/overdueReminders.js";
import { channelSettingsOf } from "./reminderChannels.js";

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function useOverdueReminders({ shop, shopId, customers = [], enabled = true, intervalMs = 10 * 60 * 1000 } = {}) {
  const settings = useMemo(() => reminderSettingsOf(shop), [shop?.overdueReminders]); // eslint-disable-line react-hooks/exhaustive-deps
  const channels = useMemo(() => channelSettingsOf(shop), [shop?.overdueReminders]); // eslint-disable-line react-hooks/exhaustive-deps
  const on = enabled && settings.enabled && !!shopId;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [nudge, setNudge] = useState(0);

  useEffect(() => {
    if (!on) { setData(null); return undefined; }
    let cancelled = false;
    const load = async () => {
      try {
        const [rows, rc, pm, av, pe, br, rem] = await Promise.all([
          loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("accountVouchers").catch(() => []),
          offlineList("partnerEntries").catch(() => []), offlineList("bankReconciliations").catch(() => []), offlineList("reminders").catch(() => []),
        ]);
        if (cancelled) return;
        setData({
          ledgerData: {
            salesInvoices: rows.salesInvoices, purchaseInvoices: rows.purchaseInvoices, salesReturns: rows.extras?.salesReturns || [], purchaseReturns: rows.extras?.purchaseReturns || [],
            receipts: rowsOf(rc), payments: rowsOf(pm), accountVouchers: rowsOf(av), partnerEntries: rowsOf(pe), bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
          },
          reminders: rowsOf(rem).filter((r) => r && (!shopId || !r.shopId || r.shopId === shopId)),
        });
        setError("");
      } catch (err) {
        console.warn("[S4 Payment reminders] load failed", err);
        if (!cancelled) setError(String(err?.message || err));
      }
    };
    load();
    window.addEventListener("focus", load);
    const timer = window.setInterval(load, intervalMs);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [on, shopId, intervalMs, nudge]);

  const day = localDay();
  const queue = useMemo(() => {
    if (!data) return [];
    const ledger = buildGlobalLedger(data.ledgerData, { shopId, customers });
    return reminderQueue(ledger, { asOf: day, salesInvoices: data.ledgerData.salesInvoices, customers, reminders: data.reminders, settings, channels, countryCode: countryCodeOf(shop) });
  }, [data, shopId, customers, day, settings, channels, shop?.countryCode, shop?.phoneCode, shop?.country]); // eslint-disable-line react-hooks/exhaustive-deps
  return { settings, channels, on, queue, loaded: !!data, error, day, refresh: () => setNudge((v) => v + 1), readyCount: queue.filter((r) => r.status === "ready").length };
}
