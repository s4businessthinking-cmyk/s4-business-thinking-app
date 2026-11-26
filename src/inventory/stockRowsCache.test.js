import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { beginInvoiceRowsLoad, invalidateInvoiceRowsCache, invoiceRowsCacheGen, peekInvoiceRowsCache, subscribeInvoiceRowsCache, rowsWithin } from "./stockRowsCache.js";

describe("invoice rows cache", () => {
  it("reuses one in-flight load and then the cached rows", async () => {
    invalidateInvoiceRowsCache();
    let loads = 0;
    const loader = async () => { loads += 1; return { n: loads }; };
    const [a, b] = await Promise.all([beginInvoiceRowsLoad(loader), beginInvoiceRowsLoad(loader)]);
    assert.equal(loads, 1);
    assert.equal(a, b);
    const c = await beginInvoiceRowsLoad(loader);
    assert.equal(loads, 1);
    assert.equal(c, a);
    assert.ok(peekInvoiceRowsCache());
    invalidateInvoiceRowsCache();
    assert.equal(peekInvoiceRowsCache(), null);
    // Stale rows stay briefly for save-checks; age is from original load (not reset by invalidate).
    assert.equal(peekInvoiceRowsCache({ allowStale: true }), a);
    await beginInvoiceRowsLoad(loader);
    assert.equal(loads, 2);
  });

  it("bumps generation so stock screens reload after a save", () => {
    invalidateInvoiceRowsCache();
    const seen = [];
    const stop = subscribeInvoiceRowsCache((n) => seen.push(n));
    const before = invoiceRowsCacheGen();
    invalidateInvoiceRowsCache();
    stop();
    assert.equal(invoiceRowsCacheGen(), before + 1);
    assert.deepEqual(seen, [before + 1]);
  });
});

it("rowsWithin: cache first, else a load that finishes in time, else null (the check did not run - never a silent pass)", async () => {
  const cached = { salesInvoices: [1] };
  let loads = 0;
  assert.equal(await rowsWithin(() => cached, async () => { loads += 1; return {}; }), cached);
  assert.equal(loads, 0, "a warm cache is not reloaded");
  const fresh = { salesInvoices: [2] };
  assert.equal(await rowsWithin(() => null, async () => fresh, 200), fresh, "cold cache: waits for the load");
  assert.equal(await rowsWithin(() => null, () => new Promise((r) => setTimeout(() => r(fresh), 500)), 30), null, "too slow: null, not rows");
  assert.equal(await rowsWithin(() => null, async () => { throw new Error("disk"); }, 200), null, "load error: null");
  assert.equal(await rowsWithin(() => { throw new Error("bad cache"); }, async () => fresh, 200), fresh);
});
