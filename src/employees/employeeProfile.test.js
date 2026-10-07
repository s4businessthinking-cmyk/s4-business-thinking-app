import test from "node:test";
import assert from "node:assert/strict";
import { isExpat, grossSalary, expiringItems, countryRule, serviceLength } from "./employeeProfile.js";

test("isExpat uses the explicit choice first, then nationality vs shop country", () => {
  assert.equal(isExpat({ nationalityCode: "BD" }, "AE"), true);
  assert.equal(isExpat({ nationalityCode: "AE" }, "AE"), false);
  assert.equal(isExpat({ nationalityCode: "BD", workerType: "local" }, "AE"), false);
  assert.equal(isExpat({ workerType: "expat" }, "BD"), true);
  assert.equal(isExpat({}, "AE"), false);
});

test("country rules name the papers per country", () => {
  assert.equal(countryRule("AE").residentId, "Emirates ID");
  assert.equal(countryRule("SA").residentId, "Iqama");
  assert.equal(countryRule("BD").localId, "NID");
  assert.equal(countryRule("ZZ").localId, "National ID");
});

test("grossSalary sums the breakdown and falls back to salary", () => {
  assert.equal(grossSalary({ basicSalary: 1500, housingAllowance: 500, transportAllowance: 200 }), 2200);
  assert.equal(grossSalary({ salary: 1800 }), 1800);
});

test("expiringItems picks expat papers for expats and local ID for locals", () => {
  const emps = [
    { id: "a", name: "Rahim", nationalityCode: "BD", visaExpiry: "2026-10-20", localIdExpiry: "2026-10-10", passportExpiry: "2030-01-01" },
    { id: "b", name: "Ahmed", nationalityCode: "AE", localIdExpiry: "2026-10-01", visaExpiry: "2026-10-05" },
    { id: "c", name: "Left", status: "inactive", nationalityCode: "BD", visaExpiry: "2026-10-08" },
  ];
  const docs = [{ id: "d1", employeeId: "a", label: "Driving licence", expiryDate: "2026-11-01" }, { id: "d2", employeeId: "c", expiryDate: "2026-10-09" }];
  const items = expiringItems(emps, docs, { today: "2026-10-07", withinDays: 30, shopCountry: "AE" });
  assert.deepEqual(items.map((i) => `${i.name}:${i.label}:${i.daysLeft}`), ["Ahmed:Emirates ID:-6", "Rahim:Visa:13", "Rahim:Driving licence:25"]);
});

test("serviceLength counts whole months", () => {
  assert.deepEqual(serviceLength({ joinDate: "2024-03-15" }, "2026-10-07"), { years: 2, months: 6 });
  assert.equal(serviceLength({}, "2026-10-07"), null);
});
