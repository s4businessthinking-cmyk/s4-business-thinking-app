import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GROUP_PRESETS, MATRIX_ACTIONS, MATRIX_ROWS, groupDraftDirty, groupPermissions, matrixKeys, memberGroupState, rowSpans, setMatrixFlags, unusedGroupPresets, userGroupsOf } from "./permissionMatrix.js";

test("matrix covers every permission in PERMISSIONS_LIST", () => {
  const src = readFileSync(fileURLToPath(new URL("../app/mainAppHelpers.js", import.meta.url)), "utf8");
  const start = src.indexOf("const PERMISSIONS_LIST = [");
  const block = src.slice(start, src.indexOf("\n];", start));
  const keys = [...block.matchAll(/key:\s*"([a-zA-Z]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 20);
  const inMatrix = new Set(matrixKeys());
  assert.deepEqual(keys.filter((k) => !inMatrix.has(k)), []);
});

test("every menu row has a tick key in view/add/edit/delete/print", () => {
  for (const row of MATRIX_ROWS) {
    for (const a of MATRIX_ACTIONS) {
      assert.ok(row[a.key], `${row.key}.${a.key}`);
    }
  }
  const sales = GROUP_PRESETS.find((p) => p.id === "preset_salesman");
  assert.equal(sales.permissions.manageSales, true);
  assert.equal(sales.permissions.printSales, true);
  assert.equal(sales.permissions.deleteProducts, false);
  assert.equal(sales.permissions.printAccounts, false);
});

test("row spans merge neighbouring cells with the same key", () => {
  const spans = rowSpans({ view: "a", add: "b", edit: "b", del: "c" });
  assert.deepEqual(spans, [
    { key: "a", from: 0, span: 1 },
    { key: "b", from: 1, span: 2 },
    { key: "c", from: 3, span: 1 },
    { key: "", from: 4, span: 1 },
  ]);
});

test("group permissions and custom state", () => {
  const sales = GROUP_PRESETS.find((p) => p.id === "preset_salesman");
  const g = { id: "g1", name: "Sales", permissions: sales.permissions };
  const perms = groupPermissions(g, { extraFlag: true });
  assert.equal(perms.manageSales, true);
  assert.equal(perms.cancelInvoices, false);
  assert.equal(perms.extraFlag, true);
  assert.deepEqual(memberGroupState({ groupId: "g1", permissions: perms }, [g]).custom, false);
  assert.deepEqual(memberGroupState({ groupId: "g1", permissions: { ...perms, cancelInvoices: true } }, [g]).custom, true);
  assert.equal(memberGroupState({ groupId: "gone" }, [g]).group, null);
  assert.deepEqual(userGroupsOf({ userGroups: [g, { id: "", name: "x" }, null] }), [g]);
});

test("legacy groups without edit ticks keep manage* edit behavior", () => {
  const oldSales = groupPermissions({ id: "g", name: "S", permissions: { manageSales: true, printSales: true } });
  assert.equal(oldSales.editDraftSales, true);
  assert.equal(oldSales.editConfirmedSales, true);
  assert.equal(oldSales.viewAllSalesInvoices, false);
  const oldBuy = groupPermissions({ id: "g2", name: "B", permissions: { managePurchase: true } });
  assert.equal(oldBuy.editDraftPurchase, true);
  assert.equal(oldBuy.editConfirmedPurchase, true);
  const explicitOff = groupPermissions({ id: "g3", name: "X", permissions: { manageSales: true, editDraftSales: false, editConfirmedSales: false } });
  assert.equal(explicitOff.editDraftSales, false);
  assert.equal(explicitOff.editConfirmedSales, false);
});

test("unused presets match both English and Bangla saved names", () => {
  const leftover = unusedGroupPresets([{ id: "g1", name: "Salesman", permissions: {} }]);
  assert.equal(leftover.some((p) => p.id === "preset_salesman"), false);
  const leftoverBn = unusedGroupPresets([{ id: "g1", name: "সেলসম্যান", permissions: {} }]);
  assert.equal(leftoverBn.some((p) => p.id === "preset_salesman"), false);
  assert.equal(unusedGroupPresets([]).length, GROUP_PRESETS.length);
});

test("owner-grantable report keys are in the matrix and default off on salesman", () => {
  const extra = ["viewAccounts", "viewTax", "viewPartners", "managePartners", "viewGlobalLedger", "viewAuditLog", "manageBackup"];
  const inMatrix = new Set(matrixKeys());
  extra.forEach((k) => assert.equal(inMatrix.has(k), true, k));
  const sales = GROUP_PRESETS.find((p) => p.id === "preset_salesman");
  extra.forEach((k) => assert.equal(sales.permissions[k], false, k));
});

test("select all turns every matrix key on without dropping extra defaults", () => {
  const sales = GROUP_PRESETS.find((p) => p.id === "preset_salesman");
  const all = setMatrixFlags(true, sales.permissions);
  assert.ok(matrixKeys().every((k) => all[k] === true));
  const none = setMatrixFlags(false, sales.permissions);
  assert.ok(matrixKeys().every((k) => none[k] === false));
  assert.equal(sales.permissions.manageSales, true);
  assert.equal(sales.permissions.giveDiscount, false);
});

test("new group draft is discarded by empty selId only when it is not a create", () => {
  const defaults = { viewProducts: true };
  const blank = { id: "grp_new", name: "", permissions: groupPermissions({ permissions: defaults }, defaults), isNew: true };
  assert.equal(groupDraftDirty(blank, [], defaults), false);
  assert.equal(groupDraftDirty({ ...blank, name: "Cashier" }, [], defaults), true);
  const saved = { id: "g1", name: "Sales", permissions: { manageSales: true } };
  assert.equal(groupDraftDirty({ ...saved, name: "Sales X", permissions: groupPermissions(saved, defaults) }, [saved], defaults), true);
  assert.equal(groupDraftDirty({ ...saved, permissions: groupPermissions(saved, defaults) }, [saved], defaults), false);
});
