import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_RUN_EVENT, autoDue, autoDueServer, autoPlan, autoProblems, autoRunText, autoSettingsOf, readAutoRun, remindedOn, runAutoReminders, writeAutoRun } from "./autoReminders.js";
import { REMINDER_STATUS, channelOptions, channelSettingsOf } from "./reminderChannels.js";
import { reminderSettingsOf } from "../accounts/overdueReminders.js";

const SHOP = (over = {}) => ({ overdueReminders: {
  enabled: true, channels: { whatsapp: true, sms: true, email: true },
  whatsappProvider: { url: "https://waba.example/send", token: "W-1" },
  smsProvider: { url: "https://sms.example.ae/send", token: "T-1" }, emailProvider: { url: "https://mail.example.ae/send" },
  auto: { on: true, whatsapp: true, sms: true, email: true, hour: 9, deviceId: "dev-A" }, ...over,
} });
const customers = [
  { id: "c1", customerName: "Al Noor", mobile: "0501234567", email: "accounts@alnoor.ae" },
  { id: "c2", customerName: "Gulf Motors", email: "pay@gulf.ae" },
  { id: "c3", customerName: "Walk-in Ali" },
];
const rowFor = (c, channels, over = {}) => ({ customerId: c.id, partyKey: c.id, name: c.customerName, amount: 1500, bills: 2, oldestDue: "2026-10-01", days: 56,
  options: channelOptions(c, channels, { countryCode: "971" }), status: "ready", ...over });
const queueOf = (channels) => customers.map((c) => rowFor(c, channels));
const ok = (id) => async () => ({ status: 202, text: JSON.stringify({ id }) });

test("settings: off by default, hour 0-23 with a default, unknown values ignored", () => {
  assert.deepEqual(autoSettingsOf(null), { on: false, whatsapp: false, sms: false, email: false, when: "device", hour: 10, deviceId: "", deviceName: "", lastServerRun: null });
  assert.equal(autoSettingsOf({ overdueReminders: { auto: { on: "yes", hour: 25 } } }).on, false);
  assert.equal(autoSettingsOf({ overdueReminders: { auto: { on: true, hour: 25 } } }).hour, 10);
  assert.equal(autoSettingsOf({ overdueReminders: { auto: { on: true, hour: 0 } } }).hour, 0);
  assert.deepEqual(autoProblems(autoSettingsOf(null), channelSettingsOf(null)), [], "off: nothing to check");
});

test("cannot switch on without an https provider, a channel, or a device", () => {
  const bad = (over, auto) => autoProblems(autoSettingsOf(SHOP({ ...over, auto: { ...SHOP().overdueReminders.auto, ...auto } })), channelSettingsOf(SHOP({ ...over, auto: { ...SHOP().overdueReminders.auto, ...auto } }))).map((x) => x.id);
  assert.deepEqual(bad({}, {}), []);
  assert.deepEqual(bad({ smsProvider: { url: "http://sms.example.ae" } }, { email: false }), ["smsProvider"], "http:// is refused");
  assert.deepEqual(bad({ smsProvider: {} }, { email: false }), ["smsProvider"], "no provider = the phone app, which needs a person");
  assert.deepEqual(bad({ channels: { whatsapp: true, sms: false, email: true } }, { email: false }), ["smsOff"]);
  assert.deepEqual(bad({}, { whatsapp: false, sms: false, email: false }), ["noChannel"]);
  assert.deepEqual(bad({}, { deviceId: "" }), ["device"]);
  assert.deepEqual(bad({}, { deviceId: "", when: "server" }), [], "server: no device pick");
});

test("server mode: due without device; device timer treats server as off", () => {
  const shop = SHOP({ auto: { on: true, sms: true, email: false, hour: 9, when: "server", deviceId: "" } });
  const channels = channelSettingsOf(shop);
  const auto = autoSettingsOf(shop);
  assert.deepEqual(autoDueServer({ auto, channels, enabled: true, today: "2026-11-26", hour: 9 }), { due: true, reason: "" });
  assert.equal(autoDue({ auto, channels, enabled: true, deviceId: "dev-A", today: "2026-11-26", hour: 9 }).reason, "serverMode");
});

test("due only once a day, after the hour, on the chosen device, with reminders on", () => {
  const shop = SHOP();
  const base = { auto: autoSettingsOf(shop), channels: channelSettingsOf(shop), enabled: true, deviceId: "dev-A", today: "2026-11-26", hour: 9 };
  assert.deepEqual(autoDue(base), { due: true, reason: "" });
  assert.equal(autoDue({ ...base, hour: 8 }).reason, "early");
  assert.equal(autoDue({ ...base, lastRunDay: "2026-11-26" }).reason, "doneToday");
  assert.equal(autoDue({ ...base, lastRunDay: "2026-11-25" }).due, true);
  assert.equal(autoDue({ ...base, deviceId: "dev-B" }).reason, "otherDevice");
  assert.equal(autoDue({ ...base, enabled: false }).reason, "remindersOff");
  assert.equal(autoDue({ ...base, auto: { ...base.auto, on: false } }).reason, "off");
  assert.equal(autoDue({ ...base, channels: { ...base.channels, smsProvider: { url: "http://x" } } }).reason, "problems");
});

test("auto off or no https provider: nothing is planned or sent", async () => {
  const offShop = SHOP({ auto: { on: false } });
  const ch = channelSettingsOf(offShop);
  let calls = 0;
  const transport = async () => { calls += 1; return { status: 200, text: "{}" }; };
  // the sms: / mailto: path (no provider) is never automatic
  const linkCh = channelSettingsOf(SHOP({ whatsappProvider: {}, smsProvider: {}, emailProvider: {} }));
  const linkAuto = autoSettingsOf(SHOP({ auto: { ...SHOP().overdueReminders.auto, whatsapp: false } }));
  assert.deepEqual(autoPlan(queueOf(linkCh), linkAuto).send, []);
  const res = await runAutoReminders({ queue: queueOf(linkCh), auto: linkAuto, channels: linkCh, settings: reminderSettingsOf(SHOP()), today: "2026-11-26", shopId: "s1", save: async () => { throw new Error("must not save"); }, transport });
  assert.equal(calls, 0);
  assert.equal(res.handedOff.length, 0);
  assert.equal(autoPlan(queueOf(ch), autoSettingsOf(offShop)).send.length, 0, "auto off: no channel picked");
});

test("2xx hand-off saves an honest record; failure saves nothing and tries the next channel; once a day", async () => {
  const shop = SHOP();
  const ch = channelSettingsOf(shop);
  const saved = [];
  const reqs = [];
  const transport = async (req) => {
    reqs.push(req);
    const to = JSON.parse(req.body).to;
    if (to === "971501234567") return { status: 503, text: JSON.stringify({ message: "Gateway busy" }) };
    return { status: 202, text: JSON.stringify({ messageId: `m-${to}` }) };
  };
  const res = await runAutoReminders({ queue: queueOf(ch), auto: autoSettingsOf(shop), channels: ch, settings: reminderSettingsOf(shop), today: "2026-11-26",
    shopId: "s1", user: { uid: "owner" }, profile: { personName: "Owner" }, shopName: "S4 Parts", save: async (r) => { saved.push(r); }, transport, now: () => new Date("2026-11-26T09:05:00Z") });
  // Al Noor: WhatsApp + SMS refused (503) then email accepted; Gulf Motors: email accepted; Walk-in: no contact
  assert.deepEqual(res.failed.map((x) => [x.name, x.channel]), [["Al Noor", "whatsapp"], ["Al Noor", "sms"]]);
  assert.match(res.failed[0].message, /503: Gateway busy/);
  assert.deepEqual(res.handedOff.map((x) => [x.name, x.channel, x.status, x.providerId]), [["Al Noor", "email", "handedOffEmail", "m-accounts@alnoor.ae"], ["Gulf Motors", "email", "handedOffEmail", "m-pay@gulf.ae"]]);
  assert.deepEqual(res.skipped.map((x) => x.name), ["Walk-in Ali"]);
  assert.equal(saved.length, 2, "only accepted hand-offs are saved");
  const r = saved[0];
  assert.deepEqual([r.source, r.auto, r.channel, r.sendStatus, r.status, r.customerId, r.shareMode], ["overdueReminder", true, "email", "handedOffEmail", "done", "c1", "auto"]);
  assert.equal(r.title, "Auto payment reminder accepted by your email provider - Al Noor");
  assert.equal(r.doneByName, "Owner (auto)");
  assert.equal(JSON.parse(reqs.find((q) => q.url.includes("mail")).body).subject, "Payment reminder from S4 Parts");
  assert.equal(reqs.find((q) => q.url.includes("sms")).headers.Authorization, "Bearer T-1");
  // one text per send, in the single language setting
  const bnShop = SHOP({ language: "bn" });
  const bnSaved = [];
  await runAutoReminders({ queue: [rowFor(customers[1], ch)], auto: autoSettingsOf(bnShop), channels: channelSettingsOf(bnShop), settings: reminderSettingsOf(bnShop), today: "2026-11-26", shopId: "s1", save: async (x) => { bnSaved.push(x); }, transport: async (req) => { bnSaved.push(JSON.parse(req.body)); return ok("b")(); } });
  assert.match(bnSaved[0].message, /প্রিয় Gulf Motors/);
  assert.doesNotMatch(bnSaved[0].message, /Dear/);

  // the records just saved stop a second run today, even if the queue still says ready
  const again = await runAutoReminders({ queue: queueOf(ch), auto: autoSettingsOf(shop), channels: ch, settings: reminderSettingsOf(shop), reminders: saved, today: "2026-11-26", shopId: "s1", save: async (x) => saved.push(x), transport });
  assert.deepEqual(again.handedOff.map((x) => x.name), [], "Gulf Motors and Al Noor already reminded today");
  assert.deepEqual(again.failed.map((x) => x.name), []);
  assert.deepEqual([...remindedOn(saved, "2026-11-26")].sort(), ["c1", "c2"]);
  assert.equal(remindedOn(saved, "2026-11-27").size, 0, "tomorrow they are due again");
  // a row the queue already marks done (reminded by hand today) is not planned
  assert.equal(autoPlan([rowFor(customers[1], ch, { status: "done" })], autoSettingsOf(shop)).send.length, 0);
});

test("wording: accepted by the provider, never sent or delivered", async () => {
  const text = [
    autoRunText({ handedOff: [{}], failed: [{}], skipped: [] }, false), autoRunText({ handedOff: [{}], failed: [], skipped: [] }, true),
    autoRunText({ handedOff: [], failed: [], skipped: [] }, false), REMINDER_STATUS.handedOffSms.en, REMINDER_STATUS.handedOffEmail.en,
  ].join(" ");
  assert.match(text, /accepted by your provider \(not proof of receipt\)/);
  assert.doesNotMatch(text, /\b(delivered|received by|sent successfully)\b/i);
  const shop = SHOP();
  const ch = channelSettingsOf(shop);
  const saved = [];
  await runAutoReminders({ queue: [rowFor(customers[1], ch)], auto: autoSettingsOf(shop), channels: ch, settings: reminderSettingsOf(shop), today: "2026-11-26", shopId: "s1", save: async (x) => saved.push(x), transport: ok("z") });
  assert.doesNotMatch(JSON.stringify(saved), /delivered/i);
});

test("last run: saved per shop and announced to every open screen at once", () => {
  const store = new Map();
  const events = [];
  const hadWindow = "window" in globalThis;
  globalThis.window = {
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    dispatchEvent: (e) => { events.push(e); return true; },
  };
  try {
    const run = { day: "2026-11-26", at: "2026-11-26T06:05:00.000Z", handedOff: 2, failed: 1, skipped: 0, errors: ["Al Noor (sms) 503: Gateway busy"] };
    writeAutoRun("s1", run);
    assert.deepEqual(readAutoRun("s1"), run);
    assert.equal(readAutoRun("s2"), null, "per shop");
    assert.equal(events.length, 1);
    assert.equal(events[0].type, AUTO_RUN_EVENT);
    assert.deepEqual(events[0].detail, { shopId: "s1", run });
    globalThis.window.localStorage.setItem = () => { throw new Error("blocked"); };
    assert.doesNotThrow(() => writeAutoRun("s1", { ...run, day: "2026-11-27" }), "blocked storage never breaks the run");
    assert.equal(events.length, 2, "the screen still hears about it");
  } finally { if (!hadWindow) delete globalThis.window; }
});
