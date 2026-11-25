// Fixed asset register: shop furniture, equipment, vehicles, computers... kept on the shop record (shop.fixedAssets).
// Every money effect is an ordinary accountVouchers journal (source "fixedAsset") the ledger reads like any other:
//   buy        Dr "Fixed Assets - <category>" (+ VAT Input)        Cr Cash / Bank / supplier / Opening Balance
//   dep        Dr Depreciation                                    Cr "Accumulated Depreciation - <category>"  (one journal a month)
//   disposal   Dr Accumulated Depreciation + money received (+ loss) Cr Fixed Assets (+ gain)
// Straight line: (cost - residual value) / useful life in months, a full month from the month the asset is booked.
// The Balance Sheet shows the two account families as "Fixed assets" (cost less accumulated depreciation).
import { CASH_ACCOUNT } from "../vouchers/accountVoucherDomain.js";

const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const clean = (v) => String(v ?? "").trim();
const pad = (v) => String(v).padStart(2, "0");

export const DEPRECIATION = "Depreciation";
export const DISPOSAL_GAIN = "Gain on Asset Disposal";
export const DISPOSAL_LOSS = "Loss on Asset Disposal";
export const OPENING = "Opening Balance";
export const assetAccount = (category) => `Fixed Assets - ${clean(category)}`;
export const accumAccount = (category) => `Accumulated Depreciation - ${clean(category)}`;
/** The two balance-sheet account families of the register (also when typed by hand in a journal). */
export const isFixedAssetAccount = (name) => /^(fixed assets?|accumulated depreciation)\s+-\s+\S/i.test(clean(name));

export const ASSET_CATEGORIES = [
  { key: "Furniture & Fittings", bn: "আসবাব ও ফিটিংস" },
  { key: "Shop Equipment", bn: "দোকানের যন্ত্রপাতি" },
  { key: "Computers & IT", bn: "কম্পিউটার ও আইটি" },
  { key: "Vehicles", bn: "গাড়ি" },
  { key: "Tools & Machinery", bn: "টুলস ও মেশিন" },
  { key: "Leasehold Improvements", bn: "দোকান সাজানো (লিজ)" },
];
export const PAID_FROM = [CASH_ACCOUNT, "Bank", OPENING];

export const monthOf = (day) => String(day || "").slice(0, 7);
export const monthEnd = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };
export const nextMonth = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`; };

export const buyJournalId = (id) => `fa-buy-${id}`;
export const depJournalId = (ym) => `fa-dep-${ym}`;
export const disposalJournalId = (id) => `fa-disp-${id}`;
const liveFa = (v) => v && !v.isDeleted && v.status !== "cancelled" && v.source === "fixedAsset";

export function normalizeAssets(saved) {
  return (Array.isArray(saved) ? saved : []).filter((a) => a && clean(a.id) && clean(a.name)).map((a) => ({
    ...a, cost: r2(a.cost), vatAmount: r2(a.vatAmount), residual: r2(a.residual), openingAccum: r2(a.openingAccum), lifeMonths: Math.round(num(a.lifeMonths)),
    status: a.disposal ? "disposed" : "active",
  }));
}

/** Monthly straight-line charge. */
export const monthlyCharge = (a) => (a.lifeMonths > 0 ? r2((num(a.cost) - num(a.residual)) / a.lifeMonths) : 0);

/**
 * Depreciation already in the books per asset, from live register journals (and the opening figure):
 * Map(assetId -> { total, months: Set(ym) })
 */
export function depreciationPosted(assets, vouchers, upTo = "") {
  const map = new Map((assets || []).map((a) => [a.id, { total: r2(a.openingAccum), months: new Set() }]));
  (vouchers || []).filter((v) => liveFa(v) && v.faKind === "dep" && (!upTo || v.voucherDate <= upTo)).forEach((v) => {
    (v.lines || []).forEach((l) => {
      if (!l.assetId || l.account !== DEPRECIATION) return;
      const cur = map.get(l.assetId) || { total: 0, months: new Set() };
      cur.total = r2(cur.total + num(l.debit) - num(l.credit));
      cur.months.add(v.faMonth);
      map.set(l.assetId, cur);
    });
  });
  return map;
}

/** One asset's charge for month ym (0 when not in use that month or fully written down). */
export function chargeFor(asset, ym, postedTotal) {
  if (!asset?.lifeMonths || ym < monthOf(asset.purchaseDate)) return 0;
  if (asset.disposal && ym >= monthOf(asset.disposal.date)) return 0;
  const remaining = r2(num(asset.cost) - num(asset.residual) - num(postedTotal));
  if (remaining <= 0) return 0;
  const m = monthlyCharge(asset);
  // the last month takes the rounding cents
  return remaining - m <= asset.lifeMonths * 0.01 ? remaining : Math.min(m, remaining);
}

/** Months from the first booked asset up to `upTo` with no depreciation journal yet. */
export function unpostedMonths(assets, vouchers, upTo) {
  const live = (assets || []).filter((a) => a.lifeMonths > 0);
  if (!live.length || !upTo) return [];
  const done = new Set((vouchers || []).filter((v) => liveFa(v) && v.faKind === "dep").map((v) => v.faMonth));
  const out = [];
  for (let ym = live.map((a) => monthOf(a.purchaseDate)).sort()[0]; ym <= upTo; ym = nextMonth(ym)) if (!done.has(ym)) out.push(ym);
  return out;
}

/** The month's depreciation journal, or null when nothing to charge. */
export function depreciationJournal({ assets, vouchers, ym, shopId = "", uid = "", by = "", now = new Date() }) {
  const posted = depreciationPosted(assets, vouchers, monthEnd(ym));
  const lines = [];
  (assets || []).forEach((a) => {
    const amt = r2(chargeFor(a, ym, posted.get(a.id)?.total || 0));
    if (!(amt > 0)) return;
    lines.push({ account: DEPRECIATION, debit: amt, credit: 0, assetId: a.id, note: `${a.code || ""} ${a.name}`.trim() });
    lines.push({ account: accumAccount(a.category), debit: 0, credit: amt, assetId: a.id, note: `${a.code || ""} ${a.name}`.trim() });
  });
  if (!lines.length) return null;
  const total = r2(lines.reduce((t, l) => t + l.debit, 0));
  const at = new Date(now).toISOString();
  return {
    id: depJournalId(ym), total,
    doc: {
      shopId, voucherType: "journal", voucherNo: `FA-DEP-${ym}`, voucherDate: monthEnd(ym), narration: `Depreciation ${ym} (fixed asset register)`,
      lines, totalAmount: total, status: "active", source: "fixedAsset", faKind: "dep", faMonth: ym,
      createdBy: uid, createdByName: by, createdAt: at, updatedAt: at, updatedBy: uid,
    },
  };
}

/** The booking journal of an asset (bought now, on credit, or already owned before the books started). */
export function purchaseJournal(asset, { shopId = "", uid = "", by = "", now = new Date() } = {}) {
  const cost = r2(asset.cost), vat = r2(asset.vatAmount), opening = asset.paidFrom === OPENING;
  const accum = opening ? r2(asset.openingAccum) : 0;
  const lines = [{ account: assetAccount(asset.category), debit: cost, credit: 0, assetId: asset.id, note: asset.name }];
  if (vat > 0) lines.push({ account: "VAT Input", debit: vat, credit: 0, assetId: asset.id, note: "VAT on fixed asset" });
  if (accum > 0) lines.push({ account: accumAccount(asset.category), debit: 0, credit: accum, assetId: asset.id, note: "Depreciation before the books started" });
  lines.push({ account: asset.paidFrom, debit: 0, credit: r2(cost + vat - accum), assetId: asset.id, note: asset.supplierBillNo ? `Bill ${asset.supplierBillNo}` : "" });
  const at = new Date(now).toISOString();
  return {
    id: buyJournalId(asset.id),
    doc: {
      shopId, voucherType: "journal", voucherNo: `FA-${asset.code || asset.id}`, voucherDate: asset.purchaseDate,
      narration: `${opening ? "Fixed asset brought in" : "Fixed asset bought"}: ${asset.name}`, lines, totalAmount: r2(cost + vat),
      status: "active", source: "fixedAsset", faKind: "buy", assetId: asset.id,
      vatAmount: vat, supplierTrn: clean(asset.supplierTrn), paidTo: opening ? "" : clean(asset.paidFrom), refNo: clean(asset.supplierBillNo),
      createdBy: uid, createdByName: by, createdAt: at, updatedAt: at, updatedBy: uid,
    },
  };
}

/** Sale / scrapping of an asset: removes cost and accumulated depreciation, books the gain or loss. */
export function disposalJournal(asset, { date, proceeds = 0, receivedIn = CASH_ACCOUNT, posted = 0, shopId = "", uid = "", by = "", now = new Date() }) {
  const cost = r2(asset.cost), acc = r2(posted), got = r2(proceeds);
  const result = r2(got - (cost - acc));
  const note = `${asset.code || ""} ${asset.name}`.trim();
  const lines = [];
  if (acc > 0) lines.push({ account: accumAccount(asset.category), debit: acc, credit: 0, assetId: asset.id, note });
  if (got > 0) lines.push({ account: receivedIn, debit: got, credit: 0, assetId: asset.id, note: "Sale proceeds" });
  if (result < 0) lines.push({ account: DISPOSAL_LOSS, debit: -result, credit: 0, assetId: asset.id, note });
  lines.push({ account: assetAccount(asset.category), debit: 0, credit: cost, assetId: asset.id, note });
  if (result > 0) lines.push({ account: DISPOSAL_GAIN, debit: 0, credit: result, assetId: asset.id, note });
  const at = new Date(now).toISOString();
  return {
    id: disposalJournalId(asset.id), result,
    doc: {
      shopId, voucherType: "journal", voucherNo: `FA-OUT-${asset.code || asset.id}`, voucherDate: date, narration: `Fixed asset ${got > 0 ? "sold" : "written off"}: ${asset.name}`,
      lines, totalAmount: r2(lines.reduce((t, l) => t + l.debit, 0)), status: "active", source: "fixedAsset", faKind: "disposal", assetId: asset.id,
      createdBy: uid, createdByName: by, createdAt: at, updatedAt: at, updatedBy: uid,
    },
  };
}

/**
 * Add / change an asset. draft fields: name, category, purchaseDate, cost, vatAmount, supplierTrn, supplierBillNo, paidFrom,
 * lifeMonths, residual, openingAccum, note. locked: the asset already has depreciation or a disposal (only name / note change).
 * -> { error } | { ok, asset }
 */
export function validateAsset(draft, assets = [], { locked = false, today = "", lockDate = "" } = {}) {
  const prev = assets.find((a) => a.id === draft.id) || null;
  const name = clean(draft.name);
  if (!name) return { error: "name" };
  if (locked && prev) return { ok: true, asset: { ...prev, name, note: clean(draft.note) } };
  const category = clean(draft.category);
  const purchaseDate = clean(draft.purchaseDate).slice(0, 10);
  const cost = r2(draft.cost), vatAmount = r2(draft.vatAmount), residual = r2(draft.residual), lifeMonths = Math.round(num(draft.lifeMonths));
  const paidFrom = clean(draft.paidFrom);
  const opening = paidFrom === OPENING;
  const openingAccum = opening ? r2(draft.openingAccum) : 0;
  if (!category) return { error: "category" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) return { error: "date" };
  if (today && purchaseDate > today) return { error: "future" };
  if (lockDate && purchaseDate <= lockDate) return { error: "locked" };
  if (!(cost > 0)) return { error: "cost" };
  if (vatAmount < 0 || (opening && vatAmount > 0)) return { error: "vat" };
  if (!(lifeMonths >= 1 && lifeMonths <= 600)) return { error: "life" };
  if (residual < 0 || residual >= cost) return { error: "residual" };
  if (openingAccum < 0 || openingAccum > r2(cost - residual)) return { error: "openingAccum" };
  if (!paidFrom) return { error: "paidFrom" };
  const code = prev?.code || nextAssetCode(assets);
  return {
    ok: true,
    asset: {
      ...(prev || {}), id: prev?.id || clean(draft.id) || `fa${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, code, name, category, purchaseDate,
      cost, vatAmount, supplierTrn: vatAmount > 0 ? clean(draft.supplierTrn) : "", supplierBillNo: clean(draft.supplierBillNo), paidFrom, lifeMonths, residual,
      openingAccum, note: clean(draft.note), disposal: prev?.disposal || null,
    },
  };
}

export const nextAssetCode = (assets) => `FA-${String((assets || []).reduce((m, a) => Math.max(m, Number(String(a.code || "").match(/(\d+)$/)?.[1] || 0)), 0) + 1).padStart(4, "0")}`;

/** Can the asset be disposed on `date`? -> [{ id, en, bn }] */
export function disposalBlockers(asset, { date, today = "", lockDate = "", vouchers = [] }) {
  const out = [];
  if (!date) return [{ id: "date", en: "Pick the date", bn: "তারিখ দিন" }];
  if (asset.disposal) out.push({ id: "done", en: "Already disposed", bn: "আগেই বিক্রি / বাদ" });
  if (date < asset.purchaseDate) out.push({ id: "early", en: "Before the asset was booked", bn: "সম্পদ বুক হওয়ার আগের তারিখ" });
  if (today && date > today) out.push({ id: "future", en: "The date is in the future", bn: "তারিখ ভবিষ্যতে" });
  if (lockDate && date <= lockDate) out.push({ id: "locked", en: `The books are locked up to ${lockDate}`, bn: `${lockDate} পর্যন্ত হিসাব লক` });
  const ym = monthOf(date);
  const missing = unpostedMonths([asset], vouchers, ym).filter((m) => m < ym && chargeFor(asset, m, 0) > 0);
  if (missing.length) out.push({ id: "depMissing", en: `Post depreciation up to ${missing[missing.length - 1]} first`, bn: `আগে ${missing[missing.length - 1]} পর্যন্ত অবচয় দিন` });
  const later = (vouchers || []).some((v) => liveFa(v) && v.faKind === "dep" && v.faMonth >= ym && (v.lines || []).some((l) => l.assetId === asset.id));
  if (later) out.push({ id: "depLater", en: `Depreciation from ${ym} on is already posted - cancel those months first`, bn: `${ym} থেকে অবচয় আগেই দেওয়া - আগে সেই মাসগুলো বাতিল করুন` });
  return out;
}

/** Can month ym's depreciation be posted? */
export function depreciationBlockers(ym, { today = "", lockDate = "", journal = null, existing = false, earlierMissing = [] }) {
  const out = [];
  if (existing) out.push({ id: "done", en: `${ym} is already posted`, bn: `${ym} আগেই দেওয়া` });
  if (today && monthEnd(ym) > today) out.push({ id: "future", en: `${ym} has not ended yet`, bn: `${ym} এখনো শেষ হয়নি` });
  if (lockDate && monthEnd(ym) <= lockDate) out.push({ id: "locked", en: `The books are locked up to ${lockDate}`, bn: `${lockDate} পর্যন্ত হিসাব লক` });
  if (earlierMissing.length) out.push({ id: "earlier", en: `Post ${earlierMissing[0]} first`, bn: `আগে ${earlierMissing[0]} দিন` });
  if (!journal && !existing) out.push({ id: "nothing", en: "Nothing to depreciate this month", bn: "এই মাসে অবচয় নেই" });
  return out;
}

/** Register as at a date: one row per asset with cost, accumulated depreciation and book value. */
export function registerRows(assets, vouchers, asOf) {
  const posted = depreciationPosted(assets, vouchers, asOf);
  return (assets || []).filter((a) => a.purchaseDate <= asOf).map((a) => {
    const out = a.disposal && a.disposal.date <= asOf;
    const acc = out ? 0 : r2(posted.get(a.id)?.total || 0);
    const cost = out ? 0 : r2(a.cost);
    return { ...a, gone: out, accumulated: acc, bookValue: r2(cost - acc), monthly: monthlyCharge(a), costNow: cost };
  }).sort((x, y) => String(x.code).localeCompare(String(y.code)));
}

export const REGISTER_COLS = (cur) => ["Code", "Asset", "Category", "Booked", "Life (months)", `Cost (${cur})`, `Residual (${cur})`, `Monthly (${cur})`, `Accumulated (${cur})`, `Book value (${cur})`, "Status"];
export function registerCsvRows(rows) {
  const f = (v) => r2(v).toFixed(2);
  const body = rows.map((r) => [r.code, r.name, r.category, r.purchaseDate, String(r.lifeMonths), f(r.cost), f(r.residual), f(r.monthly), f(r.accumulated), f(r.bookValue), r.gone ? `Disposed ${r.disposal.date}` : "In use"]);
  const live = rows.filter((r) => !r.gone);
  return [...body, ["TOTAL", "", "", "", "", f(live.reduce((t, r) => t + r.cost, 0)), "", f(live.reduce((t, r) => t + r.monthly, 0)), f(live.reduce((t, r) => t + r.accumulated, 0)), f(live.reduce((t, r) => t + r.bookValue, 0)), ""]];
}

