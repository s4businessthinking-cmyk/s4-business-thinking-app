import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { normalizeChart } from "../ledger/chartOfAccounts.js";
import { buildTrialBalance } from "../reports/trialBalance.js";
import { buildBalanceSheet } from "../reports/balanceSheet.js";
import { OPENING_ACCOUNT, currentOpenings, matchImport, openingAccounts, openingJournalId, openingTotals, parseOpeningRows, parseTallyLedgers, planOpenings, reconcileOpenings } from "./openingHub.js";

const S = "s1";
const customers = [{ id: "c1", customerName: "Ali Garage" }, { id: "c2", customerName: "Bilal" }];
const vendors = [{ id: "v1", vendorName: "Gulf Parts" }];
const chart = normalizeChart([{ name: "Bank - ADCB" }, { name: "Loan - Rahman" }, { name: "Furniture" }]);
const empty = { accounts: new Map(), customers: new Map(), vendors: new Map(), journalIds: new Set() };
const rows = [
  { kind: "account", name: "Cash in Hand", net: 2000 },
  { kind: "account", name: "Bank - ADCB", net: 15000 },
  { kind: "account", name: "Loan - Rahman", net: -10000 },
  { kind: "account", name: "Capital", net: -5000 },
  { kind: "customer", id: "c1", name: "Ali Garage", net: 1200 },
  { kind: "customer", id: "c2", name: "Bilal", net: -300 },
  { kind: "vendor", id: "v1", name: "Gulf Parts", net: -2900 },
];
// what the save does: journals as accountVouchers, party amounts as opening bills (as syncOpeningBill writes them)
const applyPlan = (plan, date) => ({
  accountVouchers: plan.journals.filter((j) => j.doc).map((j) => ({ id: j.id, ...j.doc })),
  salesInvoices: plan.parties.filter((p) => p.kind === "customer" && p.amount > 0).map((p) => ({ id: `customer-opening-${p.id}`, shopId: S, source: "openingBalance", customerId: p.id, customerName: p.name, invoiceNo: "OB", invoiceDate: date, status: "confirmed", grandTotal: p.amount, totalVat: 0, amountPaid: 0 })),
  purchaseInvoices: plan.parties.filter((p) => p.kind === "vendor" && p.amount > 0).map((p) => ({ id: `vendor-opening-${p.id}`, shopId: S, source: "openingBalance", vendorId: p.id, vendorName: p.name, invoiceNo: "OB", invoiceDate: date, status: "confirmed", grandTotal: p.amount, totalTax: 0, amountPaid: 0 })),
});

test("plan: one journal per account against Opening Balance, party normal side as opening bill, advances as journals", () => {
  const plan = planOpenings(rows, { date: "2026-12-31", existing: empty, shopId: S, uid: "u1", by: "Owner" });
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.parties.map((p) => [p.id, p.amount]).sort(), [["c1", 1200], ["v1", 2900]]);
  const ids = plan.journals.map((j) => j.id).sort();
  assert.deepEqual(ids, [openingJournalId("account", "Bank - ADCB"), openingJournalId("account", "Capital"), openingJournalId("account", "Cash in Hand"), openingJournalId("account", "Loan - Rahman"), openingJournalId("customer", "c2")].sort());
  const bank = plan.journals.find((j) => j.id === openingJournalId("account", "Bank - ADCB")).doc;
  assert.deepEqual(bank.lines.map((l) => [l.account, l.debit, l.credit]), [["Bank - ADCB", 15000, 0], [OPENING_ACCOUNT, 0, 15000]]);
  assert.deepEqual([bank.source, bank.voucherType, bank.voucherDate, bank.status], ["opening", "journal", "2026-12-31", "active"]);
  const adv = plan.journals.find((j) => j.id === openingJournalId("customer", "c2")).doc;
  assert.deepEqual(adv.lines.map((l) => [l.account, l.debit, l.credit]), [[OPENING_ACCOUNT, 300, 0], ["Bilal", 0, 300]]);
  assert.deepEqual(plan.totals, { dr: 18200, cr: 18200, toOpeningBalance: 0 });
});

test("saved openings come out of the ledger as entered; TB balances; Opening Balance holds the difference", () => {
  const date = "2026-12-31";
  const plan = planOpenings(rows, { date, existing: empty, shopId: S });
  const data = applyPlan(plan, date);
  const ledger = buildGlobalLedger(data, { shopId: S, customers, vendors });
  const bal = balances(ledger.postings, date);
  const by = (name) => [...ledger.accounts.values()].find((a) => a.name === name)?.key;
  assert.equal(bal.get(by("Cash in Hand")), 2000);
  assert.equal(bal.get(by("Bank - ADCB")), 15000);
  assert.equal(bal.get(by("Loan - Rahman")), -10000);
  assert.equal(bal.get("c:c1"), 1200);
  assert.equal(bal.get("c:c2"), -300);
  assert.equal(bal.get("v:v1"), -2900);
  assert.ok(Math.abs(bal.get(by(OPENING_ACCOUNT)) || 0) < 0.005, "entered Dr = Cr, nothing left in Opening Balance");
  const tb = buildTrialBalance(ledger, { to: date });
  assert.equal(tb.difference, 0);
  assert.equal(buildBalanceSheet({ accounts: ledger.accounts, bal }).difference, 0);
  // read back: the screen shows what was saved
  const now = currentOpenings(data, { customers, vendors });
  assert.equal(now.accounts.get("bank - adcb"), 15000);
  assert.equal(now.customers.get("c1"), 1200);
  assert.equal(now.customers.get("c2"), -300);
  assert.equal(now.vendors.get("v1"), -2900);
  assert.equal(now.journalIds.size, 5);
  // uneven entry: the difference is parked in Opening Balance and shown
  assert.equal(openingTotals([{ net: 100 }, { net: -40 }]).toOpeningBalance, 60);
});

test("re-plan: zero cancels the earlier journal; blockers for date, lock, duplicates, a paid opening bill", () => {
  const date = "2026-12-31";
  const first = planOpenings(rows, { date, existing: empty, shopId: S });
  const saved = currentOpenings(applyPlan(first, date), { customers, vendors });
  const again = planOpenings([{ kind: "account", name: "Bank - ADCB", net: 0 }, { kind: "customer", id: "c2", name: "Bilal", net: 0 }], { date, existing: saved });
  assert.deepEqual(again.journals.map((j) => [j.id, !!j.cancel]).sort(), [[openingJournalId("account", "Bank - ADCB"), true], [openingJournalId("customer", "c2"), true]]);
  assert.deepEqual(planOpenings(rows, { date: "", existing: empty }).blockers.map((b) => b.code), ["date"]);
  assert.ok(planOpenings(rows, { date, existing: empty, lockDate: "2026-12-31" }).blockers.some((b) => b.code === "locked"));
  assert.ok(planOpenings([...rows, rows[0]], { date, existing: empty }).blockers.some((b) => b.code === "duplicate"));
  assert.ok(planOpenings([{ kind: "account", name: OPENING_ACCOUNT, net: 5 }], { date, existing: empty }).blockers.some((b) => b.code === "openingAccount"));
  const bills = { customers: new Map([["c1", { status: "partial", grandTotal: 1200, amountPaid: 800 }]]), vendors: new Map() };
  const paid = planOpenings([{ kind: "customer", id: "c1", name: "Ali Garage", net: 500 }], { date, existing: empty, bills });
  assert.deepEqual(paid.blockers, [{ code: "paid", names: ["Ali Garage"] }]);
  assert.equal(planOpenings([{ kind: "customer", id: "c1", name: "Ali Garage", net: 1200 }], { date, existing: empty, bills }).parties.length, 0, "unchanged bill is left alone");
  assert.deepEqual(openingAccounts(chart).map((a) => a.name).includes("Sales"), false, "income takes no opening");
  assert.equal(openingAccounts(chart).some((a) => a.name === OPENING_ACCOUNT), false);
});

test("import: Tally XML signs, CSV / Excel columns, matching, reconcile", () => {
  const xml = `<ENVELOPE><BODY><DATA><TALLYMESSAGE>
    <LEDGER NAME="Cash" RESERVEDNAME=""><PARENT>Cash-in-Hand</PARENT><OPENINGBALANCE>-2000.00</OPENINGBALANCE></LEDGER>
    <LEDGER NAME="Ali Garage"><PARENT>Sundry Debtors</PARENT><OPENINGBALANCE>-1200.00</OPENINGBALANCE></LEDGER>
    <LEDGER NAME="Gulf Parts"><PARENT>Sundry Creditors</PARENT><OPENINGBALANCE>2900.00</OPENINGBALANCE></LEDGER>
    <LEDGER NAME="Al Noor &amp; Sons"><PARENT>Sundry Debtors</PARENT><OPENINGBALANCE>-50</OPENINGBALANCE></LEDGER>
    <LEDGER NAME="Sales"><PARENT>Sales Accounts</PARENT><OPENINGBALANCE>0</OPENINGBALANCE></LEDGER>
    <LEDGER NAME="Office Rent"><PARENT>Indirect Expenses</PARENT><OPENINGBALANCE>-100</OPENINGBALANCE></LEDGER>
    <LEDGER NAME="Stock"><PARENT>Stock-in-Hand</PARENT><OPENINGBALANCE>-9000</OPENINGBALANCE></LEDGER>
    <LEDGER NAME="Security Deposit"><PARENT>Deposits (Asset)</PARENT><OPENINGBALANCE>-700</OPENINGBALANCE></LEDGER>
  </TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
  const items = parseTallyLedgers(xml);
  assert.deepEqual(items.slice(0, 4).map((i) => [i.name, i.opening]), [["Cash", 2000], ["Ali Garage", 1200], ["Gulf Parts", -2900], ["Al Noor & Sons", 50]]);
  assert.equal(parseTallyLedgers(xml, { tallySigns: false })[0].opening, -2000);
  const matched = matchImport(items, { chart, customers, vendors });
  assert.deepEqual(matched.map((m) => [m.name, m.match]), [
    ["Cash", "account"], ["Ali Garage", "customer"], ["Gulf Parts", "vendor"], ["Al Noor & Sons", "missingParty"],
    ["Sales", "zero"], ["Office Rent", "pl"], ["Stock", "stock"], ["Security Deposit", "newAccount"],
  ]);
  assert.equal(matched[0].target, "Cash in Hand");
  const csv = parseOpeningRows([["Ledger Name", "Under", "Debit", "Credit"], ["Bank - ADCB", "Bank Accounts", "15,000.00", ""], ["Loan - Rahman", "Loans", "", "10000"], ["", "", "", ""]]);
  assert.deepEqual(csv.items.map((i) => [i.name, i.parent, i.opening]), [["Bank - ADCB", "Bank Accounts", 15000], ["Loan - Rahman", "Loans", -10000]]);
  const one = parseOpeningRows([["Account", "Opening Balance"], ["Capital", "5,000.00 Cr"], ["Cash", "(20)"], ["Bank", "abc"]]);
  assert.deepEqual(one.items.map((i) => i.opening), [-5000, -20, NaN]);
  assert.equal(matchImport(one.items, { chart })[2].match, "invalid");
  assert.equal(parseOpeningRows([["Foo"], ["x"]]).error, "noName");
  assert.equal(parseOpeningRows([["Name", "Note"], ["x", "y"]]).error, "noAmount");
  const rec = reconcileOpenings(matched, new Map([["cash in hand", 2000], ["ali garage", 1000]]));
  assert.deepEqual(rec.map((r) => [r.name, r.difference]), [["Cash", 0], ["Ali Garage", -200], ["Gulf Parts", 2900]]);
});
