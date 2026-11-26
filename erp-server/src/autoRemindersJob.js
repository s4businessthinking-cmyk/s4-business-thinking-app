import { randomUUID } from "node:crypto";
import { autoDueServer, autoSettingsOf, runAutoReminders } from "../../src/share/autoReminders.js";
import { channelSettingsOf } from "../../src/share/reminderChannels.js";
import { reminderSettingsOf } from "../../src/accounts/overdueReminders.js";
import { prepareOverdueAutoQueue, shopLocalParts } from "../../src/share/prepareOverdueAutoQueue.js";

const clean = (v) => String(v ?? "").trim();

const COLLECTIONS = [
  "customers",
  "salesInvoices",
  "purchaseInvoices",
  "salesReturns",
  "purchaseReturns",
  "salesReceipts",
  "purchasePayments",
  "accountVouchers",
  "partnerEntries",
  "bankReconciliations",
  "reminders",
];

const live = (rows) => rows
  .map((r) => (r?.data ? { ...r.data, id: r.id || r.data.id } : null))
  .filter((r) => r && !r.isDeleted && !r.deleted);

const nodeTransport = async (req) => {
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, redirect: "error" });
  return { status: res.status, text: await res.text() };
};

async function loadShopCollections(db, shopId) {
  const out = {};
  await Promise.all(COLLECTIONS.map(async (name) => {
    out[name] = live(await db.listDocs(name, shopId));
  }));
  return out;
}

async function saveReminder(db, shopId, rec, now) {
  const id = randomUUID();
  const existing = await db.getDoc("reminders", id);
  const version = (existing?.version || 0) + 1;
  await db.putDoc({
    collection: "reminders",
    id,
    shopId,
    data: rec,
    version,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
}

async function patchShopLastRun(db, shop, shopId, summary, now) {
  const row = await db.getDoc("shops", shopId);
  const base = row?.data || shop;
  const auto = { ...(base.overdueReminders?.auto || {}), lastServerRun: summary };
  const overdueReminders = { ...(base.overdueReminders || {}), auto };
  const data = { ...base, overdueReminders };
  await db.putDoc({
    collection: "shops",
    id: shopId,
    shopId,
    data,
    version: (row?.version || 0) + 1,
    createdAt: row?.createdAt || now,
    updatedAt: now,
  });
}

export async function runAutoRemindersForShop(db, shopId, shop, { now = new Date(), envTz = "" } = {}) {
  const auto = autoSettingsOf(shop);
  if (!auto.on || auto.when !== "server") return { skipped: true, reason: "notServer" };
  const channels = channelSettingsOf(shop);
  const settings = reminderSettingsOf(shop);
  if (!settings.enabled) return { skipped: true, reason: "remindersOff" };
  const { today, hour } = shopLocalParts(shop, now, envTz);
  const lastRunDay = clean(auto.lastServerRun?.day);
  const due = autoDueServer({ auto, channels, enabled: true, today, hour, lastRunDay });
  if (!due.due) return { skipped: true, reason: due.reason };

  const cols = await loadShopCollections(db, shopId);
  const { queue } = prepareOverdueAutoQueue({
    shop,
    shopId,
    customers: cols.customers,
    salesInvoices: cols.salesInvoices,
    purchaseInvoices: cols.purchaseInvoices,
    salesReturns: cols.salesReturns,
    purchaseReturns: cols.purchaseReturns,
    receipts: cols.salesReceipts,
    payments: cols.purchasePayments,
    accountVouchers: cols.accountVouchers,
    partnerEntries: cols.partnerEntries,
    bankReconciliations: cols.bankReconciliations,
    reminders: cols.reminders,
    asOf: today,
  });

  const nowIso = new Date(now).toISOString();
  const ownerUid = String(shop.ownerUid || shop.owner || "");
  const cur = String(shop.currency || shop.cur || "AED").toUpperCase();
  const shopName = String(shop.companyName || shop.name || "").trim();

  const result = await runAutoReminders({
    queue,
    auto,
    channels,
    settings,
    reminders: cols.reminders,
    today,
    shopId,
    user: ownerUid ? { uid: ownerUid } : null,
    profile: { personName: "Server auto" },
    cur,
    shopName,
    save: (rec) => saveReminder(db, shopId, rec, nowIso),
    transport: nodeTransport,
    now: () => new Date(now),
  });

  const summary = {
    day: today,
    at: nowIso,
    handedOff: result.handedOff.length,
    failed: result.failed.length,
    skipped: result.skipped.length,
    errors: result.failed.slice(0, 5).map((x) => `${x.name} (${x.channel}) ${x.message}`),
  };
  await patchShopLastRun(db, shop, shopId, summary, nowIso);
  return { skipped: false, summary, result };
}

export function startAutoRemindersJob({ db, cfg }) {
  if (cfg.autoRemindersEnabled === false) return { stop: () => {} };
  const ms = Math.max(60_000, Number(cfg.autoRemindersIntervalMs) || 15 * 60_000);
  const envTz = cfg.autoRemindersTz || "";
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const shops = await db.listDocs("shops");
      for (const row of shops) {
        const shopId = row.id;
        const shop = row.data;
        if (!shop || typeof shop !== "object") continue;
        try {
          const run = await runAutoRemindersForShop(db, shopId, shop, { envTz });
          if (!run.skipped && (run.summary?.handedOff || run.summary?.failed)) {
            console.log(`[S4 Auto reminders] shop ${shopId}: handedOff=${run.summary.handedOff} failed=${run.summary.failed}`);
          }
        } catch (e) {
          console.warn(`[S4 Auto reminders] shop ${shopId} failed`, e?.message || e);
        }
      }
    } finally {
      busy = false;
    }
  };
  tick().catch((e) => console.warn("[S4 Auto reminders] tick failed", e));
  const timer = setInterval(() => { tick().catch((e) => console.warn("[S4 Auto reminders] tick failed", e)); }, ms);
  return { stop: () => clearInterval(timer) };
}