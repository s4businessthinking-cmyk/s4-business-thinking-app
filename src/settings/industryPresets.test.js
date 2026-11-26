import test from "node:test";
import assert from "node:assert/strict";
import { INDUSTRY_PRESETS, PRESET_KEYS, planPreset } from "./industryPresets.js";
import { costCentresOf } from "../accounts/costCentres.js";
import { normalizeGroups } from "../ledger/coaGroups.js";
import { reminderSettingsOf } from "../accounts/overdueReminders.js";
import { invoiceArabicMode } from "../print/arabicPrint.js";

const NOW = new Date("2026-11-25T08:00:00Z");
const emptyShop = { country: "AE", companyName: "Gulf Parts" };
const apply = (shop, patch) => ({ ...shop, ...patch });

test("auto parts on an empty shop: every starter item is added and listed", () => {
  const plan = planPreset(emptyShop, "autoParts", { now: NOW, by: "u1" });
  assert.deepEqual(plan.changes.map((c) => c.id), ["expenseNames", "coaGroup", "costCentres", "reminderText", "invoiceArabic"]);
  assert.deepEqual(plan.patch.expenseNameSuggestions, INDUSTRY_PRESETS.autoParts.expenseNames);
  const after = apply(emptyShop, plan.patch);
  assert.deepEqual(normalizeGroups(after.coaGroups).map((g) => [g.nameEn, g.nature]), [["Workshop & Parts Costs", "expense"]]);
  assert.deepEqual(costCentresOf(after).map((c) => [c.code, c.type, c.branchId]), [["SHOP", "branch", "main"], ["WORKSHOP", "department", ""]]);
  assert.equal(reminderSettingsOf(after).enabled, false, "reminders stay off");
  assert.match(reminderSettingsOf(after).textEn, /parts \/ service/);
  assert.equal(invoiceArabicMode(after), "both");
  assert.deepEqual(plan.patch.industryPreset, { key: "autoParts", appliedAt: "2026-11-25T08:00:00.000Z", by: "u1" });
  assert.ok(plan.tips.some((t) => /Serial \/ IMEI/.test(t.en)), "serials stay a per-product choice: a tip");
});

test("applying twice adds nothing the second time", () => {
  const once = apply(emptyShop, planPreset(emptyShop, "autoParts", { now: NOW }).patch);
  const again = planPreset(once, "autoParts", { now: NOW });
  assert.deepEqual(again.changes, []);
  assert.deepEqual(again.patch, {}, "not even the preset stamp");
});

test("what the owner already has is kept and skipped", () => {
  const shop = {
    country: "AE", invoiceArabic: "en",
    expenseNameSuggestions: ["oil & lubricants", "My Own Type"],
    coaGroups: [{ id: "g1", code: "6500", nameEn: "Garage costs", nature: "expense" }],
    costCentres: [{ id: "c1", code: "MAIN", name: "Main shop", type: "branch", branchId: "main" }],
    overdueReminders: { textEn: "My own words {name}" },
  };
  const plan = planPreset(shop, "autoParts", { now: NOW });
  assert.deepEqual(plan.changes.map((c) => c.id), ["expenseNames", "costCentres"]);
  assert.deepEqual(plan.patch.expenseNameSuggestions.slice(0, 2), ["oil & lubricants", "My Own Type"], "existing names first, unchanged");
  assert.equal(plan.patch.expenseNameSuggestions.filter((n) => n.toLowerCase() === "oil & lubricants").length, 1);
  assert.deepEqual(plan.patch.costCentres.map((c) => [c.code, c.branchId]), [["MAIN", "main"], ["SHOP", ""], ["WORKSHOP", ""]], "the main branch already has a centre: the new one is not linked");
  assert.equal("coaGroups" in plan.patch, false, "a group with the same code is kept");
  assert.equal("overdueReminders" in plan.patch, false, "the owner's own wording is kept");
  assert.equal("invoiceArabic" in plan.patch, false, "the owner's print choice is kept");
});

test("retail is lighter; a shop outside the UAE gets no Arabic change; unknown preset refused", () => {
  const retail = planPreset(emptyShop, "retail", { now: NOW });
  assert.deepEqual(retail.changes.map((c) => c.id), ["expenseNames", "reminderText", "invoiceArabic"]);
  assert.equal("costCentres" in retail.patch || "coaGroups" in retail.patch, false);
  assert.equal("invoiceArabic" in planPreset({ country: "BD" }, "autoParts", { now: NOW }).patch, false);
  assert.equal(planPreset(emptyShop, "nope").error, "preset");
  assert.deepEqual(PRESET_KEYS, ["autoParts", "retail"]);
});

test("a preset only writes its own shop fields - never products, bills or balances", () => {
  const plan = planPreset(emptyShop, "autoParts", { now: NOW });
  const allowed = new Set(["expenseNameSuggestions", "coaGroups", "costCentres", "overdueReminders", "invoiceArabic", "industryPreset"]);
  Object.keys(plan.patch).forEach((k) => assert.ok(allowed.has(k), k));
});
