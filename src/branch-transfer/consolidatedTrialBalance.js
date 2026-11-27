import { r2 } from "../reports/reportFilters.js";

const lc = (v) => String(v || "").trim().toLowerCase();

/** Sum trial-balance account rows across company files (match by ledger group + account name). */
export function mergeConsolidatedTrialBalance(fileResults = []) {
  const map = new Map();
  for (const { file, tb } of fileResults) {
    if (!tb?.accounts?.length) continue;
    for (const a of tb.accounts) {
      const k = `${a.group}::${lc(a.name)}`;
      if (!map.has(k)) {
        map.set(k, {
          key: k,
          name: a.name,
          group: a.group,
          code: a.code || "",
          opening: 0,
          dr: 0,
          cr: 0,
          closing: 0,
          fileCount: 0,
        });
      }
      const row = map.get(k);
      row.opening = r2(row.opening + a.opening);
      row.dr = r2(row.dr + a.dr);
      row.cr = r2(row.cr + a.cr);
      row.closing = r2(row.closing + a.closing);
      row.fileCount += 1;
      if (!row.code && a.code) row.code = a.code;
      if (!row._files) row._files = [];
      if (file?.label) row._files.push(file.label);
    }
  }
  const accounts = [...map.values()].sort(
    (a, b) => (a.code || "~").localeCompare(b.code || "~", undefined, { numeric: true }) || a.name.localeCompare(b.name)
  );
  const totals = accounts.reduce(
    (t, a) => ({
      opening: r2(t.opening + a.opening),
      dr: r2(t.dr + a.dr),
      cr: r2(t.cr + a.cr),
      closing: r2(t.closing + a.closing),
    }),
  { opening: 0, dr: 0, cr: 0, closing: 0 }
  );
  const closingDr = r2(accounts.reduce((sum, a) => sum + (a.closing > 0 ? a.closing : 0), 0));
  const closingCr = r2(accounts.reduce((sum, a) => sum + (a.closing < 0 ? -a.closing : 0), 0));
  return {
    accounts,
    totals,
    difference: r2(closingDr - closingCr),
    fileCount: fileResults.length,
  };
}