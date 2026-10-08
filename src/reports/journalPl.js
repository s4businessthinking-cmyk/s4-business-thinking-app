import { CASH_ACCOUNT } from "../vouchers/accountVoucherDomain.js";
import { n, dayOf, inRange, isLive, r2 } from "./reportFilters.js";

const JOURNAL_BS = new Set([CASH_ACCOUNT, "Capital", "Drawings", "Sales", "Purchase", "Discount Allowed", "Discount Received"]);
const isBankLedger = (a) => /^Bank - /i.test(String(a || "").trim());

/** Journal lines on non–balance-sheet accounts hit P&L; contra vouchers do not. */
export function journalPlByAccount(vouchers, shopId, from, to) {
  const map = new Map();
  (vouchers || []).forEach((v) => {
    if (v?.voucherType !== "journal" || v.status === "cancelled" || !isLive(v, shopId)) return;
    const d = dayOf(v.voucherDate || v.createdAt);
    if (!inRange(d, from, to)) return;
    (v.lines || []).forEach((l) => {
      const ac = String(l?.account || "").trim();
      if (!ac || JOURNAL_BS.has(ac) || isBankLedger(ac)) return;
      const delta = r2(n(l.debit) - n(l.credit));
      if (!delta) return;
      map.set(ac, r2((map.get(ac) || 0) + delta));
    });
  });
  return map;
}

export function journalPlTotal(map) {
  let t = 0;
  map.forEach((amt) => { t = r2(t + amt); });
  return t;
}
