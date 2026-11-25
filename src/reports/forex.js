// Forex: supplier bills in a foreign currency (the purchase invoice's currency / exchange rate / fcGrandTotal) are
// booked in the shop currency at the bill's rate. This module works out what is still owed in the foreign
// currency, and posts the two kinds of exchange difference as ordinary accountVouchers journals (source "forex"),
// each line tied to its bill (billId) - the ledger reads them like any other journal:
//   reval     month-end revaluation of the open part at the closing rate (cumulative: each run posts only the change
//             since the last one, so a bill paid off later winds its unrealised difference back to zero)
//   realised  the difference when a bill was paid at another rate than it was booked at (the extra or short shop
//             currency on the payment sits on the supplier until this journal clears it)
// Loss: Dr Exchange Loss, Cr supplier (we owe more). Gain: Dr supplier, Cr Exchange Gain.

const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const r6 = (v) => Math.round(num(v) * 1e6) / 1e6;
const clean = (v) => String(v ?? "").trim();
const dayOf = (v) => String(v || "").slice(0, 10);
const isLive = (d, shopId) => d && !d.isDeleted && (!shopId || !d.shopId || d.shopId === shopId);

export const FX_GAIN = "Exchange Gain";
export const FX_LOSS = "Exchange Loss";
export const revalJournalId = (day) => `fx-reval-${day}`;
export const liveFx = (v, shopId = "") => isLive(v, shopId) && v.status !== "cancelled" && v.source === "forex";

/** Live supplier bills in a foreign currency (confirmed, not opening / branch transfers). */
export function foreignBills(purchaseInvoices, shopId, baseCurrency = "AED") {
  const base = clean(baseCurrency).toUpperCase();
  return (purchaseInvoices || []).filter((inv) => isLive(inv, shopId) && inv.status !== "draft" && inv.status !== "cancelled" && !inv.internalTransfer
    && inv.sourceType !== "branch_transfer" && clean(inv.currency) && clean(inv.currency).toUpperCase() !== base && num(inv.exchangeRate) > 0 && num(inv.fcGrandTotal) > 0);
}

/**
 * Shop currency settled on a bill up to `asOf`: paid on the bill itself (its date), payment allocations dated up to
 * asOf, and purchase returns applied to it dated up to asOf - the same split the ledger uses.
 */
export function settledOn(inv, { payments = [], purchaseReturns = [], asOf = "" }) {
  const livePay = payments.filter((p) => p && !p.isDeleted && p.status !== "cancelled" && !p.isRefund);
  const liveRet = purchaseReturns.filter((r) => r && !r.isDeleted && r.status !== "cancelled" && r.status !== "draft");
  const allocAll = livePay.reduce((t, p) => t + (p.allocations || []).filter((a) => a.invoiceId === inv.id).reduce((x, a) => x + num(a.amount), 0), 0);
  const retAll = liveRet.filter((r) => r.invoiceId === inv.id).reduce((t, r) => t + num(r.appliedToInvoice), 0);
  const direct = Math.max(0, num(inv.amountPaid) - allocAll - retAll);
  const within = (d) => !asOf || dayOf(d) <= asOf;
  const alloc = livePay.filter((p) => within(p.paymentDate || p.createdAt)).reduce((t, p) => t + (p.allocations || []).filter((a) => a.invoiceId === inv.id).reduce((x, a) => x + num(a.amount), 0), 0);
  const ret = liveRet.filter((r) => r.invoiceId === inv.id && within(r.returnDate)).reduce((t, r) => t + num(r.appliedToInvoice), 0);
  const paidDirect = inv.chequeStatus === "bounced" ? 0 : direct;
  return r2((within(inv.invoiceDate) ? paidDirect : 0) + alloc + ret);
}

/** Exchange difference already posted per bill: Map(billId -> { reval, realised, realisedFc }) */
export function postedFx(vouchers, { shopId = "", asOf = "", skipId = "" } = {}) {
  const map = new Map();
  (vouchers || []).filter((v) => liveFx(v, shopId) && v.id !== skipId && (!asOf || dayOf(v.voucherDate) <= asOf)).forEach((v) => {
    (v.lines || []).forEach((l) => {
      if (!l.billId || (l.account !== FX_GAIN && l.account !== FX_LOSS)) return;
      const cur = map.get(l.billId) || { reval: 0, realised: 0, realisedFc: 0 };
      // a loss (debit on Exchange Loss) raises what we owe: + ; a gain lowers it: -
      const amt = r2(num(l.debit) - num(l.credit));
      if (v.fxKind === "reval") cur.reval = r2(cur.reval + amt);
      else { cur.realised = r2(cur.realised + amt); cur.realisedFc = r6(cur.realisedFc + num(l.fcAmount)); }
      map.set(l.billId, cur);
    });
  });
  return map;
}

/**
 * Open foreign bills as at `asOf`: [{ id, no, vendorId, vendorName, currency, billRate, fc, fcSettled, fcOpen, bookOpen,
 * settledAed, reval, realised, realisedFc, unrealisedFc }]. bookOpen: what the bill still carries in shop currency at its
 * own rate.
 */
export function fxPosition({ purchaseInvoices, payments = [], purchaseReturns = [], vouchers = [], vendors = [], shopId = "", baseCurrency = "AED", asOf = "", skipId = "" }) {
  const posted = postedFx(vouchers, { shopId, asOf, skipId });
  // journal lines name the supplier as the master has it, so the ledger puts them on that supplier
  const masterName = new Map((vendors || []).filter((v) => v?.id && !v.isDeleted && v.vendorName).map((v) => [v.id, v.vendorName]));
  return foreignBills(purchaseInvoices, shopId, baseCurrency).filter((inv) => !asOf || dayOf(inv.invoiceDate) <= asOf).map((inv) => {
    const rate = num(inv.exchangeRate), fc = r2(inv.fcGrandTotal), gt = r2(inv.grandTotal);
    const settledAed = settledOn(inv, { payments, purchaseReturns, asOf });
    const fcSettled = gt > 0 ? Math.min(fc, r2((settledAed / gt) * fc)) : 0;
    const fcOpen = r2(fc - fcSettled);
    const p = posted.get(inv.id) || { reval: 0, realised: 0, realisedFc: 0 };
    return {
      id: inv.id, no: inv.invoiceNo || "", supplierNo: inv.supplierInvoiceNo || "", date: dayOf(inv.invoiceDate), vendorId: inv.vendorId || "", vendorName: masterName.get(inv.vendorId) || inv.vendorName || "",
      currency: clean(inv.currency).toUpperCase(), billRate: rate, fc, grandTotal: gt, settledAed, fcSettled, fcOpen, bookOpen: r2(gt - settledAed),
      reval: p.reval, realised: p.realised, realisedFc: r2(p.realisedFc), unrealisedFc: r2(fcSettled - p.realisedFc),
    };
  }).sort((a, b) => a.currency.localeCompare(b.currency) || a.date.localeCompare(b.date) || a.no.localeCompare(b.no));
}

/** Currencies of the open bills. */
export const openCurrencies = (position) => [...new Set(position.filter((b) => b.fcOpen > 0.004 || Math.abs(b.reval) >= 0.005).map((b) => b.currency))].sort();

/**
 * Revaluation lines at closing rates (rates: { USD: 3.6725, ... }). For each bill the unrealised difference should be
 * fcOpen x (closing - bill rate); the line is that less what earlier revaluations already posted.
 * -> [{ bill, target, change }]
 */
export function revaluationLines(position, rates) {
  return position.map((b) => {
    const rc = num(rates?.[b.currency]);
    const target = b.fcOpen > 0.004 ? (rc > 0 ? r2(b.fcOpen * (rc - b.billRate)) : null) : 0;
    return { bill: b, target, change: target == null ? null : r2(target - b.reval), closingRate: rc };
  }).filter((x) => x.change == null || Math.abs(x.change) >= 0.005);
}

const fxLine = (bill, amount, extra = {}) => {
  // amount > 0: loss (we owe more); < 0: gain
  const a = r2(amount);
  const note = `${bill.no}${bill.supplierNo ? ` (${bill.supplierNo})` : ""} ${bill.currency}`;
  return a > 0
    ? [{ account: FX_LOSS, debit: a, credit: 0, billId: bill.id, note, ...extra }, { account: bill.vendorName, debit: 0, credit: a, billId: bill.id, partyId: bill.vendorId, note }]
    : [{ account: bill.vendorName, debit: -a, credit: 0, billId: bill.id, partyId: bill.vendorId, note }, { account: FX_GAIN, debit: 0, credit: -a, billId: bill.id, note, ...extra }];
};

const journal = ({ id, no, date, narration, lines, shopId, uid, by, now, extra }) => {
  const at = new Date(now).toISOString();
  return {
    id,
    doc: {
      shopId, voucherType: "journal", voucherNo: no, voucherDate: date, narration, lines, totalAmount: r2(lines.reduce((t, l) => t + l.debit, 0)),
      status: "active", source: "forex", ...extra, createdBy: uid, createdByName: by, createdAt: at, updatedAt: at, updatedBy: uid,
    },
  };
};

/** The month-end revaluation journal on `day` (null when nothing changes). */
export function revaluationJournal({ position, rates, day, shopId = "", uid = "", by = "", now = new Date() }) {
  const rows = revaluationLines(position, rates).filter((x) => x.change != null);
  if (!rows.length) return null;
  const lines = rows.flatMap((x) => fxLine(x.bill, x.change, { closingRate: x.closingRate, fcOpen: x.bill.fcOpen }));
  const used = Object.fromEntries([...new Set(rows.map((x) => x.bill.currency))].map((c) => [c, num(rates[c])]));
  return journal({ id: revalJournalId(day), no: `FX-${day}`, date: day, narration: `Forex revaluation ${day}: ${Object.entries(used).map(([c, r]) => `${c} ${r}`).join(", ")}`,
    lines, shopId, uid, by, now, extra: { fxKind: "reval", rates: used } });
}

/**
 * Realised difference for a bill: fcAmount of its settled part was paid at `rate` instead of the bill rate.
 * -> { error } | { id, doc, amount }
 */
export function realisedJournal({ bill, fcAmount, rate, date, shopId = "", uid = "", by = "", now = new Date(), seq = 1 }) {
  const fc = r2(fcAmount), ra = num(rate);
  if (!(fc > 0)) return { error: "fc" };
  if (fc > r2(bill.unrealisedFc) + 0.004) return { error: "fcMax" };
  if (!(ra > 0)) return { error: "rate" };
  if (!date) return { error: "date" };
  const amount = r2(fc * (ra - bill.billRate));
  if (Math.abs(amount) < 0.005) return { error: "same" };
  const j = journal({ id: `fx-set-${bill.id}-${seq}`, no: `FX-${bill.no}-${seq}`, date, narration: `Exchange difference on ${bill.no}: ${bill.currency} ${fc} paid at ${ra} (booked at ${bill.billRate})`,
    lines: fxLine(bill, amount, { fcAmount: fc, paidRate: ra }), shopId, uid, by, now, extra: { fxKind: "realised", billId: bill.id } });
  return { ...j, amount };
}

/** Why a journal cannot be posted now. */
export function fxBlockers({ day, today = "", lockDate = "", rows = [], vendors = [] }) {
  const out = [];
  if (!day) out.push({ id: "date", en: "Pick the date", bn: "তারিখ দিন" });
  else if (today && day > today) out.push({ id: "future", en: "The date is in the future", bn: "তারিখ ভবিষ্যতে" });
  if (lockDate && day && day <= lockDate) out.push({ id: "locked", en: `The books are locked up to ${lockDate}`, bn: `${lockDate} পর্যন্ত হিসাব লক` });
  const known = new Set((vendors || []).filter((v) => v && !v.isDeleted && v.vendorName).map((v) => clean(v.vendorName).toLowerCase()));
  const missing = [...new Set(rows.filter((b) => !known.has(clean(b.vendorName).toLowerCase())).map((b) => b.vendorName || b.no))];
  if (missing.length) out.push({ id: "vendor", en: `Supplier not in the master: ${missing.join(", ")}`, bn: `সাপ্লায়ার মাস্টারে নেই: ${missing.join(", ")}` });
  return out;
}

export const FX_COLS = (base) => ["Bill", "Supplier bill", "Date", "Supplier", "Currency", "Bill rate", "Bill amount (FC)", "Open (FC)", `Book open (${base})`, `Revalued so far (${base})`, "Closing rate", `Change now (${base})`];
export function fxCsvRows(position, rates) {
  const change = new Map(revaluationLines(position, rates).map((x) => [x.bill.id, x]));
  const f = (v) => r2(v).toFixed(2);
  return position.map((b) => {
    const c = change.get(b.id);
    return [b.no, b.supplierNo, b.date, b.vendorName, b.currency, String(b.billRate), f(b.fc), f(b.fcOpen), f(b.bookOpen), f(b.reval), num(rates?.[b.currency]) ? String(num(rates[b.currency])) : "", c && c.change != null ? f(c.change) : ""];
  });
}
