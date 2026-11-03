import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { beginInvoiceRowsLoad, invalidateInvoiceRowsCache, invoiceRowsCacheGen, peekInvoiceRowsCache, subscribeInvoiceRowsCache } from "./stockRowsCache.js";

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
