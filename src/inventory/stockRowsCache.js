// Shared cache so Sales, Purchase, StockBadge and save-checks do not each
// re-read every invoice table from SQLite on the same screen.

let rows = null;
let rowsAt = 0;
let inflight = null;
let gen = 0;
const listeners = new Set();
const TTL_MS = 4000;

export function invoiceRowsCacheGen() {
  return gen;
}

export function subscribeInvoiceRowsCache(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function peekInvoiceRowsCache(opts = {}) {
  if (!rows) return null;
  if (opts.allowStale || Date.now() - rowsAt < TTL_MS) return rows;
  return null;
}

export function beginInvoiceRowsLoad(loader) {
  const hit = peekInvoiceRowsCache();
  if (hit) return Promise.resolve(hit);
  if (inflight) return inflight;
  inflight = Promise.resolve()
    .then(loader)
    .then((data) => {
      rows = data;
      rowsAt = Date.now();
      return data;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function invalidateInvoiceRowsCache() {
  rows = null;
  rowsAt = 0;
  gen += 1;
  listeners.forEach((fn) => { try { fn(gen); } catch { /* ignore listener errors */ } });
}
