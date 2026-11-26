// Shared cache so Sales, Purchase, StockBadge and save-checks do not each
// re-read every invoice table from SQLite on the same screen.

let rows = null;
let rowsAt = 0; // wall-clock of last successful load (STALE_MAX measured from here)
let freshUntil = 0; // normal peek accepted until this time
let inflight = null;
let gen = 0;
const listeners = new Set();
const TTL_MS = 4000;
const STALE_MAX_MS = 15000;

export function invoiceRowsCacheGen() {
  return gen;
}

export function subscribeInvoiceRowsCache(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function peekInvoiceRowsCache(opts = {}) {
  if (!rows) return null;
  const age = Date.now() - rowsAt;
  // Hard cap from original load — invalidate must not reset this clock.
  if (age >= STALE_MAX_MS) return null;
  if (opts.allowStale) return rows;
  if (Date.now() < freshUntil) return rows;
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
      freshUntil = rowsAt + TTL_MS;
      return data;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function invalidateInvoiceRowsCache() {
  // Drop fresh peek; keep rows for allowStale until STALE_MAX from original load.
  freshUntil = 0;
  if (rows && Date.now() - rowsAt >= STALE_MAX_MS) {
    rows = null;
    rowsAt = 0;
  }
  gen += 1;
  listeners.forEach((fn) => { try { fn(gen); } catch { /* ignore listener errors */ } });
}

/**
 * Rows for a check that must not hang: peek() (the cache), else load() given waitMs to finish.
 * -> the rows, or null when they did not arrive in time (the caller then says the check did not run).
 */
export async function rowsWithin(peek, load, waitMs = 4000) {
  try { const hit = peek(); if (hit) return hit; } catch { /* cache unreadable: load below */ }
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(load).catch(() => null),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), waitMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
