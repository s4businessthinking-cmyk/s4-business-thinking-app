import test from "node:test";
import assert from "node:assert/strict";
import { clearPiSuspended, loadPiSuspended, piSuspendHasContent, savePiSuspended } from "./piSuspendedDraft.js";

const shopId = "shop-test";

function stubLocalStorage() {
  const storage = {};
  globalThis.localStorage = {
    getItem: (k) => storage[k] ?? null,
    setItem: (k, v) => { storage[k] = v; },
    removeItem: (k) => { delete storage[k]; },
  };
  return storage;
}

test("piSuspendHasContent", () => {
  assert.equal(piSuspendHasContent({}, [], {}), false);
  assert.equal(piSuspendHasContent({ vendorName: "Acme" }, [], {}), true);
  assert.equal(piSuspendHasContent({}, [{ name: "Item" }], {}), true);
});

test("save, load, clear suspended PI draft", () => {
  stubLocalStorage();
  clearPiSuspended(shopId);
  const payload = {
    piForm: { vendorName: "Acme" },
    piLines: [{ name: "Widget", qty: "1" }],
    piCurrent: {},
    piInvoiceNo: "PI-0001",
    editInvoiceId: null,
  };
  assert.equal(savePiSuspended(shopId, payload), true);
  const loaded = loadPiSuspended(shopId);
  assert.equal(loaded?.piForm?.vendorName, "Acme");
  assert.equal(loaded?.piLines?.length, 1);
  clearPiSuspended(shopId);
  assert.equal(loadPiSuspended(shopId), null);
});