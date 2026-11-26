import test from "node:test";
import assert from "node:assert/strict";
import { runDesktopBillShortcuts, runVoucherFormShortcuts } from "./desktopFormShortcuts.js";

const ev = (over = {}) => ({
  key: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
  isComposing: false, keyCode: 0, preventDefault() { this.prevented = true; },
  ...over,
});

test("Ctrl+S confirms when allowed", () => {
  let n = 0;
  const e = ev({ key: "s", ctrlKey: true });
  assert.equal(runDesktopBillShortcuts(e, { canConfirm: () => true, onConfirm: () => { n += 1; } }), true);
  assert.equal(n, 1);
  assert.equal(e.prevented, true);
});

test("Ctrl+Shift+S drafts before plain save", () => {
  let draft = 0;
  let save = 0;
  const e = ev({ key: "s", ctrlKey: true, shiftKey: true });
  assert.equal(runDesktopBillShortcuts(e, {
    canSaveDraft: () => true,
    onSaveDraft: () => { draft += 1; },
    canConfirm: () => true,
    onConfirm: () => { save += 1; },
  }), true);
  assert.equal(draft, 1);
  assert.equal(save, 0);
});

test("F7 opens bill search", () => {
  let hit = 0;
  const e = ev({ key: "F7" });
  assert.equal(runDesktopBillShortcuts(e, { onSearch: () => { hit += 1; } }), true);
  assert.equal(hit, 1);
});

test("voucher Ctrl+S and F7 find", () => {
  let saved = 0;
  let find = 0;
  const s = ev({ key: "s", ctrlKey: true });
  assert.equal(runVoucherFormShortcuts(s, { readOnly: false, saving: false, onSave: () => { saved += 1; } }), true);
  const f = ev({ key: "F7" });
  assert.equal(runVoucherFormShortcuts(f, { onFind: () => { find += 1; } }), true);
  assert.equal(saved, 1);
  assert.equal(find, 1);
});