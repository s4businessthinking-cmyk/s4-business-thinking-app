import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAWER_PIN2,
  DRAWER_PIN5,
  drawerKickBytes,
  drawerPrinterName,
  normalizeDrawerSettings,
  openCashDrawer,
} from "./cashDrawer.js";

test("kick bytes: pin 2 default and pin 5", () => {
  assert.deepEqual([...drawerKickBytes()], DRAWER_PIN2);
  assert.deepEqual([...drawerKickBytes({ pin: 2 })], DRAWER_PIN2);
  assert.deepEqual([...drawerKickBytes({ pin: 5 })], DRAWER_PIN5);
  assert.deepEqual([...drawerKickBytes({ pin: 99 })], DRAWER_PIN2);
});

test("settings: drawer printer falls back to bill printer; auto-open is opt-in", () => {
  assert.equal(drawerPrinterName({ billPrinter: "EPSON" }), "EPSON");
  assert.equal(drawerPrinterName({ billPrinter: "EPSON", drawerPrinter: "DRAWER" }), "DRAWER");
  assert.equal(normalizeDrawerSettings({ openDrawerAfterCash: "yes" }).openDrawerAfterCash, false);
  assert.equal(normalizeDrawerSettings({ openDrawerAfterCash: true, drawerPin: 5 }).drawerPin, 5);
});

test("openCashDrawer: success only from transport ok; no printer / no bridge are honest errors", async () => {
  const ok = await openCashDrawer({
    settings: { billPrinter: "TM-T20" },
    transport: async ({ printer, bytes }) => {
      assert.equal(printer, "TM-T20");
      assert.deepEqual([...bytes], DRAWER_PIN2);
      return { ok: true };
    },
  });
  assert.equal(ok.ok, true);

  const fail = await openCashDrawer({
    settings: { billPrinter: "TM-T20" },
    transport: async () => ({ ok: false, error: "printer offline" }),
  });
  assert.equal(fail.ok, false);
  assert.match(fail.error, /printer offline/);

  const noPrinter = await openCashDrawer({ settings: {}, transport: async () => ({ ok: true }) });
  assert.equal(noPrinter.ok, false);
  assert.equal(noPrinter.code, "no_printer");

  const noBridge = await openCashDrawer({ settings: { billPrinter: "TM-T20" } });
  assert.equal(noBridge.ok, false);
  assert.equal(noBridge.code, "no_bridge");
});

test("openCashDrawer: transport throw becomes error, never success", async () => {
  const r = await openCashDrawer({
    settings: { drawerPrinter: "X", drawerPin: 5 },
    transport: async () => { throw new Error("spooler"); },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /spooler/);
});
