// Shared overdue queue for payment reminders (device timer and erp-server job).
import { buildGlobalLedger } from "../ledger/globalLedger.js";
import { reminderQueue, reminderSettingsOf } from "../accounts/overdueReminders.js";
import { channelSettingsOf } from "./reminderChannels.js";
import { countryCodeOf } from "./whatsappDocShare.js";

const clean = (v) => String(v ?? "").trim();

export function shopLocalParts(shop, now = new Date(), envTz = "") {
  const tz = clean(shop?.timezone) || clean(envTz) || "Asia/Dubai";
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    );
    return { tz, today: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
  } catch {
    const d = new Date(now);
    const pad = (n) => String(n).padStart(2, "0");
    return { tz: "UTC", today: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, hour: d.getUTCHours() };
  }
}

export function prepareOverdueAutoQueue({
  shop,
  shopId,
  customers = [],
  salesInvoices = [],
  purchaseInvoices = [],
  salesReturns = [],
  purchaseReturns = [],
  receipts = [],
  payments = [],
  accountVouchers = [],
  partnerEntries = [],
  bankReconciliations = [],
  reminders = [],
  asOf,
}) {
  const settings = reminderSettingsOf(shop);
  const channels = channelSettingsOf(shop);
  if (!settings.enabled) return { queue: [], settings, channels };
  const ledgerData = {
    salesInvoices,
    purchaseInvoices,
    salesReturns,
    purchaseReturns,
    receipts,
    payments,
    accountVouchers,
    partnerEntries,
    bankEntries: bankReconciliations.filter((d) => d?.kind === "entry"),
  };
  const ledger = buildGlobalLedger(ledgerData, { shopId, customers });
  const queue = reminderQueue(ledger, {
    asOf,
    salesInvoices,
    customers,
    reminders,
    settings,
    channels,
    countryCode: countryCodeOf(shop),
  });
  return { queue, settings, channels };
}