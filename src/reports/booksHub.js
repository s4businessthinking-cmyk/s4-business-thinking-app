// Books hub: Day Book, Cash Book and Bank Book from the same global-ledger postings
// as Global Ledger / Balance Sheet. Read-only; draft and cancelled docs are already left out of postings.
import { CASH_ACCOUNT } from "../vouchers/accountVoucherDomain.js";
import { accountStatement } from "../ledger/globalLedger.js";
import { r2 } from "./reportFilters.js";

export const BANK_ACCOUNT = "Bank";

const entryId = (p) => `${p.col || ""}:${p.docId || ""}:${p.date || ""}:${p.type || ""}:${p.no || ""}`;

/** Find ledger account key by exact display name (e.g. "Cash in Hand", "Bank"). */
export function accountKeyByName(accounts, name) {
  const want = String(name || "").trim().toLowerCase();
  if (!want || !accounts) return "";
  for (const a of accounts.values()) {
    if (String(a.name || "").trim().toLowerCase() === want) return a.key;
  }
  return "";
}

/** Money-group accounts for Cash / Bank book picker (Cash in Hand first, then Bank, then others). */
export function moneyAccounts(accounts) {
  const list = [...(accounts?.values?.() || [])].filter((a) => a.group === "money");
  const rank = (name) => {
    const n = String(name || "").trim().toLowerCase();
    if (n === CASH_ACCOUNT.toLowerCase()) return 0;
    if (n === BANK_ACCOUNT.toLowerCase()) return 1;
    return 2;
  };
  return list.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/**
 * Day Book: one journal entry per saved document in the date range.
 * -> { entries: [{ id, date, type, no, narration, lines: [{ key, name, dr, cr }], totalDr, totalCr }], totalDr, totalCr }
 */
export function buildDayBook(postings, accounts, { from = "", to = "" } = {}) {
  const map = new Map();
  (postings || []).forEach((p) => {
    if (!p?.date) return;
    if (from && p.date < from) return;
    if (to && p.date > to) return;
    const id = entryId(p);
    let e = map.get(id);
    if (!e) {
      e = { id, date: p.date, type: p.type || "", no: p.no || "", narration: p.narration || "", lines: [], totalDr: 0, totalCr: 0 };
      map.set(id, e);
    }
    const name = accounts?.get(p.key)?.name || p.key;
    e.lines.push({ key: p.key, name, dr: r2(p.dr), cr: r2(p.cr) });
    e.totalDr = r2(e.totalDr + p.dr);
    e.totalCr = r2(e.totalCr + p.cr);
    if (!e.narration && p.narration) e.narration = p.narration;
  });
  const entries = [...map.values()].sort((a, b) => a.date.localeCompare(b.date)
    || String(a.no).localeCompare(String(b.no), undefined, { numeric: true })
    || a.id.localeCompare(b.id));
  const totalDr = r2(entries.reduce((t, e) => t + e.totalDr, 0));
  const totalCr = r2(entries.reduce((t, e) => t + e.totalCr, 0));
  return { entries, totalDr, totalCr };
}

/**
 * Cash or Bank book for one money account: opening before `from`, lines in range, closing.
 * Same shape as accountStatement, plus accountName.
 */
export function buildMoneyBook(postings, accounts, accountName, { from = "", to = "" } = {}) {
  const key = accountKeyByName(accounts, accountName);
  if (!key) {
    return { accountKey: "", accountName: accountName || "", opening: 0, lines: [], dr: 0, cr: 0, closing: 0 };
  }
  const st = accountStatement(postings, key, { from, to });
  return { accountKey: key, accountName: accounts.get(key)?.name || accountName, ...st };
}

export function buildCashBook(postings, accounts, range) {
  return buildMoneyBook(postings, accounts, CASH_ACCOUNT, range);
}

export function buildBankBook(postings, accounts, range, accountName = BANK_ACCOUNT) {
  return buildMoneyBook(postings, accounts, accountName || BANK_ACCOUNT, range);
}
