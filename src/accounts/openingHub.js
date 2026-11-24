// Opening & migration: the balances a shop brings into S4 on its start date (from Tally, Excel or by hand), entered
// on one screen. Nothing new in the ledger - they are saved as the documents it already reads:
// - a cash / bank / VAT / capital / loan / other account: one opening journal per account (accountVouchers,
//   source "opening", fixed id), the account against "Opening Balance";
// - a customer who owes / a supplier who is owed: the party's opening bill (utils/openingBill.js, the same as the
//   opening balance on the customer / supplier master), dated the opening day so ageing starts from it;
// - an advance (customer in credit, supplier in debit): an opening journal against the party's own ledger.
// Income and expense accounts take no opening (start on a year start, or put the profit so far into Capital) and
// stock comes from the products' opening stock, so neither can be entered here.
// Sign: debit positive, credit negative throughout. Tally exports debit balances as negative numbers.
import { GROUPS } from "../ledger/globalLedger.js";

export const OPENING_ACCOUNT = "Opening Balance";
export const OPENING_NATURES = ["money", "tax", "equity", "other"];
const lc = (v) => String(v || "").trim().toLowerCase();
const r2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const slug = (v) => lc(v).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "x";
const live = (d) => d && !d.isDeleted && d.status !== "cancelled";

export const openingJournalId = (kind, key) => (kind === "account" ? `opening-acc-${slug(key)}` : `opening-${kind === "customer" ? "cus" : "ven"}-${key}`);
export const isOpeningJournal = (v) => v?.source === "opening";

/** Chart accounts that can carry an opening balance (balance-sheet side only, not "Opening Balance" itself). */
export const openingAccounts = (chart) => (chart || []).filter((a) => a.active !== false && OPENING_NATURES.includes(a.group) && a.name !== OPENING_ACCOUNT);

/**
 * What is saved now. data: { accountVouchers, salesInvoices, purchaseInvoices }.
 * -> { accounts: Map(lowerName -> net), customers: Map(id -> net), vendors: Map(id -> net), date, journalIds: Set(live opening journal ids) }
 */
export function currentOpenings(data, { customers = [], vendors = [] } = {}) {
  const accounts = new Map(), cust = new Map(), vend = new Map(), journalIds = new Set();
  let date = "";
  const custByName = new Map(customers.map((c) => [lc(c.customerName), c.id]));
  const vendByName = new Map(vendors.map((v) => [lc(v.vendorName), v.id]));
  (data.accountVouchers || []).filter((v) => live(v) && isOpeningJournal(v)).forEach((v) => {
    date = date || v.voucherDate || "";
    journalIds.add(v.id);
    (v.lines || []).filter((l) => l.account !== OPENING_ACCOUNT).forEach((l) => {
      const net = r2((Number(l.debit) || 0) - (Number(l.credit) || 0));
      const cid = v.openingKind === "customer" ? v.openingPartyId || custByName.get(lc(l.account)) : "";
      const vid = v.openingKind === "vendor" ? v.openingPartyId || vendByName.get(lc(l.account)) : "";
      if (cid) cust.set(cid, r2((cust.get(cid) || 0) + net));
      else if (vid) vend.set(vid, r2((vend.get(vid) || 0) + net));
      else accounts.set(lc(l.account), r2((accounts.get(lc(l.account)) || 0) + net));
    });
  });
  (data.salesInvoices || []).filter((b) => live(b) && b.source === "openingBalance" && b.customerId).forEach((b) => cust.set(b.customerId, r2((cust.get(b.customerId) || 0) + (Number(b.grandTotal) || 0))));
  (data.purchaseInvoices || []).filter((b) => live(b) && b.source === "openingBalance" && b.vendorId).forEach((b) => vend.set(b.vendorId, r2((vend.get(b.vendorId) || 0) - (Number(b.grandTotal) || 0))));
  return { accounts, customers: cust, vendors: vend, date, journalIds };
}

/** Debit and credit totals of the entered rows and what is left for "Opening Balance" (equity). */
export function openingTotals(rows) {
  const dr = r2(rows.reduce((t, r) => t + Math.max(0, r2(r.net)), 0));
  const cr = r2(rows.reduce((t, r) => t + Math.max(0, -r2(r.net)), 0));
  return { dr, cr, toOpeningBalance: r2(dr - cr) };
}

/**
 * Plan the save. rows: [{ kind: "account"|"customer"|"vendor", id, name, net }] (net: debit positive).
 * existing: currentOpenings(); bills: { customers: Map(id -> opening bill), vendors: Map(id -> opening bill) }.
 * -> { blockers: [{ code, names? }], journals: [{ id, doc } | { id, cancel: true }], parties: [{ kind, id, amount }], totals }
 * parties.amount = the opening bill amount (0 cancels it); an advance becomes a journal instead.
 */
export function planOpenings(rows, { date, existing, bills = { customers: new Map(), vendors: new Map() }, lockDate = "", uid = "", by = "", shopId = "", now = new Date() }) {
  const blockers = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) blockers.push({ code: "date" });
  if (lockDate && date && date <= lockDate) blockers.push({ code: "locked" });
  const seen = new Map();
  rows.forEach((r) => { const k = `${r.kind}|${r.kind === "account" ? lc(r.name) : r.id}`; seen.set(k, (seen.get(k) || 0) + 1); });
  const dups = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k.split("|")[1]);
  if (dups.length) blockers.push({ code: "duplicate", names: dups });
  const bad = rows.filter((r) => r.kind === "account" && r.name === OPENING_ACCOUNT);
  if (bad.length) blockers.push({ code: "openingAccount" });
  const at = new Date(now).toISOString();
  const journal = (id, kind, partyId, name, net) => ({
    id,
    doc: {
      shopId, voucherType: "journal", voucherNo: `OB-${String(name).slice(0, 24)}`, voucherDate: date, narration: `Opening balance as on ${date}`,
      lines: net > 0 ? [{ account: name, debit: net, credit: 0, note: "" }, { account: OPENING_ACCOUNT, debit: 0, credit: net, note: "" }]
        : [{ account: OPENING_ACCOUNT, debit: -net, credit: 0, note: "" }, { account: name, debit: 0, credit: -net, note: "" }],
      totalAmount: Math.abs(net), status: "active", source: "opening", openingKind: kind, openingPartyId: partyId || "",
      createdBy: uid, createdByName: by, createdAt: at, updatedAt: at, updatedBy: uid,
    },
  });
  const journals = [], parties = [], paidTooMuch = [];
  const hadJournal = (id) => !!existing?.journalIds?.has(id);
  rows.forEach((r) => {
    const net = r2(r.net);
    if (r.kind === "account") {
      const id = openingJournalId("account", r.name);
      if (Math.abs(net) >= 0.005) journals.push(journal(id, "account", "", r.name, net));
      else if (hadJournal(id)) journals.push({ id, cancel: true });
      return;
    }
    // party: the normal side goes on the opening bill, the other side is an advance journal
    const normal = r.kind === "customer" ? Math.max(0, net) : Math.max(0, -net);
    const advance = r.kind === "customer" ? Math.min(0, net) : Math.max(0, net);
    const bill = (r.kind === "customer" ? bills.customers : bills.vendors)?.get(r.id);
    const paid = bill && live(bill) ? Number(bill.amountPaid) || 0 : 0;
    if (normal < paid - 0.01) paidTooMuch.push(r.name);
    const billNow = bill && live(bill) ? Number(bill.grandTotal) || 0 : 0;
    if (Math.abs(billNow - normal) >= 0.005) parties.push({ kind: r.kind, id: r.id, name: r.name, amount: normal });
    const jid = openingJournalId(r.kind, r.id);
    if (Math.abs(advance) >= 0.005) journals.push(journal(jid, r.kind, r.id, r.name, advance));
    else if (hadJournal(jid)) journals.push({ id: jid, cancel: true });
  });
  if (paidTooMuch.length) blockers.push({ code: "paid", names: paidTooMuch });
  return { blockers, journals, parties, totals: openingTotals(rows) };
}

// ── import ──
const decode = (s) => String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, "&");
const amountOf = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  const n = Number(s.replace(/[(),\s]|Dr|Cr/gi, "").replace(/^-/, ""));
  if (!Number.isFinite(n)) return NaN;
  const signed = neg ? -n : n;
  if (/cr\b/i.test(s)) return -Math.abs(signed);
  if (/dr\b/i.test(s)) return Math.abs(signed);
  return signed;
};

/**
 * Ledgers from a Tally XML export (Masters / List of Accounts): [{ name, parent, opening }] with opening debit
 * positive. tallySigns: Tally writes debit balances as negative numbers (the default); false keeps the file's sign.
 */
export function parseTallyLedgers(xml, { tallySigns = true } = {}) {
  const out = [];
  const re = /<LEDGER\b([^>]*)>([\s\S]*?)<\/LEDGER>/gi;
  let m;
  while ((m = re.exec(String(xml || "")))) {
    const attrName = /NAME="([^"]*)"/i.exec(m[1])?.[1];
    const body = m[2];
    const name = decode(attrName || /<NAME>([^<]*)<\/NAME>/i.exec(body)?.[1] || "").trim();
    if (!name) continue;
    const parent = decode(/<PARENT>([^<]*)<\/PARENT>/i.exec(body)?.[1] || "").trim();
    const raw = amountOf(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i.exec(body)?.[1] || "0");
    out.push({ name, parent, opening: Number.isFinite(raw) ? r2(tallySigns ? -raw : raw) : NaN });
  }
  return out;
}

/**
 * Rows from a CSV / Excel sheet (first row = headers). Columns found by name: Name / Ledger / Account; Group / Parent
 * / Under; either Debit + Credit, or one Opening / Balance / Amount column (negative or "Cr" = credit).
 * -> { items: [{ name, parent, opening }], error? }
 */
export function parseOpeningRows(rows) {
  const head = (rows?.[0] || []).map((h) => lc(h));
  const col = (...names) => head.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const iName = col("name", "ledger", "account", "particulars");
  if (iName < 0) return { items: [], error: "noName" };
  const iParent = col("group", "parent", "under");
  const iDr = col("debit", "dr");
  const iCr = col("credit", "cr");
  const iOne = col("opening", "balance", "amount", "closing");
  if (iDr < 0 && iCr < 0 && iOne < 0) return { items: [], error: "noAmount" };
  const items = rows.slice(1).filter((r) => r && String(r[iName] ?? "").trim()).map((r) => {
    const opening = iDr >= 0 || iCr >= 0
      ? r2((iDr >= 0 ? Math.abs(amountOf(r[iDr]) || 0) : 0) - (iCr >= 0 ? Math.abs(amountOf(r[iCr]) || 0) : 0))
      : amountOf(r[iOne]);
    return { name: String(r[iName]).trim(), parent: iParent >= 0 ? String(r[iParent] ?? "").trim() : "", opening: Number.isFinite(opening) ? r2(opening) : NaN };
  });
  return { items };
}

const DEBTOR = /sundry debtors|debtors|receivable|customer/i;
const CREDITOR = /sundry creditors|creditors|payable|supplier|vendor/i;
const PL = /sales accounts|purchase accounts|direct (expenses|incomes)|indirect (expenses|incomes)|income|expense/i;
const STOCK = /stock[- ]in[- ]hand/i;
const ALIASES = { cash: "Cash in Hand", "cash-in-hand": "Cash in Hand", "profit & loss a/c": "", "profit and loss a/c": "" };

/**
 * Match imported ledgers to S4. -> [{ ...item, match: "account"|"customer"|"vendor"|"newAccount"|"missingParty"|"pl"|"stock"|"invalid"|"zero", id?, target? }]
 * chart: normalized CoA; a Tally "Cash" ledger matches "Cash in Hand".
 */
export function matchImport(items, { chart = [], customers = [], vendors = [] } = {}) {
  const acc = new Map(chart.map((a) => [lc(a.name), a]));
  const cus = new Map(customers.filter((c) => !c.isDeleted && !c.mergedInto).map((c) => [lc(c.customerName), c]));
  const ven = new Map(vendors.filter((v) => !v.isDeleted && !v.mergedInto).map((v) => [lc(v.vendorName), v]));
  return items.map((it) => {
    if (!Number.isFinite(it.opening)) return { ...it, match: "invalid" };
    if (Math.abs(it.opening) < 0.005) return { ...it, match: "zero" };
    const key = lc(it.name);
    const alias = ALIASES[key];
    if (alias === "") return { ...it, match: "pl" };
    if (STOCK.test(it.parent)) return { ...it, match: "stock" };
    const c = cus.get(key), v = ven.get(key);
    if (c && !CREDITOR.test(it.parent)) return { ...it, match: "customer", id: c.id, target: c.customerName };
    if (v) return { ...it, match: "vendor", id: v.id, target: v.vendorName };
    if (c) return { ...it, match: "customer", id: c.id, target: c.customerName };
    const a = acc.get(lc(alias || it.name));
    if (a) return OPENING_NATURES.includes(a.group) ? { ...it, match: "account", target: a.name } : { ...it, match: "pl", target: a.name };
    if (DEBTOR.test(it.parent) || CREDITOR.test(it.parent)) return { ...it, match: "missingParty" };
    if (PL.test(it.parent)) return { ...it, match: "pl" };
    return { ...it, match: "newAccount", target: it.name };
  });
}

/** Imported figure vs the S4 balance on the opening day. s4: Map(lowerName -> balance, debit positive). */
export function reconcileOpenings(matched, s4) {
  return matched.filter((m) => ["account", "customer", "vendor"].includes(m.match)).map((m) => {
    const mine = r2(s4.get(lc(m.target)) || 0);
    return { name: m.name, target: m.target, imported: r2(m.opening), s4: mine, difference: r2(mine - m.opening) };
  });
}

export const natureLabel = (id, bn = false) => { const g = GROUPS.find((x) => x.id === id); return g ? (bn ? g.bn : g.en) : id; };
