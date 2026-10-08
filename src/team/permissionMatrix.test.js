import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GROUP_PRESETS, groupPermissions, matrixKeys, memberGroupState, rowSpans, userGroupsOf } from "./permissionMatrix.js";

test("matrix covers every permission in PERMISSIONS_LIST", () => {
  const src = readFileSync(fileURLToPath(new URL("../spare-parts-app.jsx", import.meta.url)), "utf8");
  const block = src.slice(src.indexOf("const PERMISSIONS_LIST = ["), src.indexOf("const DEFAULT_PERMISSIONS"));
  const keys = [...block.matchAll(/key:\s*"([a-zA-Z]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 20);
  const inMatrix = new Set(matrixKeys());
  assert.deepEqual(keys.filter((k) => !inMatrix.has(k)), []);
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
