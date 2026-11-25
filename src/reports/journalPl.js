import { CASH_ACCOUNT } from "../vouchers/accountVoucherDomain.js";
import { n, dayOf, inRange, isLive, r2 } from "./reportFilters.js";
import { DEPRECIATION, DISPOSAL_GAIN, DISPOSAL_LOSS, isFixedAssetAccount } from "../accounts/fixedAssets.js";
import { FX_GAIN, FX_LOSS } from "./forex.js";

const JOURNAL_BS = new Set([CASH_ACCOUNT, "Capital", "Drawings", "Sales", "Purchase", "Discount Allowed", "Discount Received"]);
const isBankLedger = (a) => /^Bank - /i.test(String(a || "").trim());
// a fixed asset register journal is P&L only on its depreciation and disposal gain / loss lines
const FA_PL = new Set([DEPRECIATION, DISPOSAL_GAIN, DISPOSAL_LOSS]);
// a forex journal is P&L only on its exchange gain / loss lines (the other side is the supplier)
const FX_PL = new Set([FX_GAIN, FX_LOSS]);

/** Journal lines on non–balance-sheet accounts hit P&L; contra vouchers do not. */
export function journalPlByAccount(vouchers, shopId, from, to) {
  const map = new Map();
  (vouchers || []).forEach((v) => {
    // the year-end closing journal only moves the year's result into Capital - it is not income or expense
    if (v?.voucherType !== "journal" || v.status === "cancelled" || v.source === "yearEnd" || !isLive(v, shopId)) return;
    const d = dayOf(v.voucherDate || v.createdAt);
    if (!inRange(d, from, to)) return;
    (v.lines || []).forEach((l) => {
      const ac = String(l?.account || "").trim();
      if (!ac || JOURNAL_BS.has(ac) || isBankLedger(ac) || isFixedAssetAccount(ac)) return;
      if (v.source === "fixedAsset" && !FA_PL.has(ac)) return;
      if (v.source === "forex" && !FX_PL.has(ac)) return;
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
