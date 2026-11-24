import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { normalizeChart } from "../ledger/chartOfAccounts.js";
import { buildTallyVouchers, ledgerList, tallyCsvRows, tallyFileName, tallyGroupOf, tallyXml, xmlEscape } from "./tallyExport.js";

const S = "s1";
const customers = [{ id: "c1", customerName: "Al Noor & Sons" }];
const vendors = [{ id: "v1", vendorName: "Gulf <Parts>" }];
const data = () => ({
  accountVouchers: [
    { id: "j1", shopId: S, voucherType: "journal", voucherNo: "JV-1", voucherDate: "2026-11-02", narration: "Office desk", totalAmount: 500,
      lines: [{ account: "Furniture", debit: 500 }, { account: "Capital", credit: 500 }] },
    { id: "k1", shopId: S, voucherType: "contra", voucherNo: "CV-1", voucherDate: "2026-11-03", totalAmount: 300, fromAccount: "Cash in Hand", toAccount: "Bank - ADCB" },
    { id: "j9", shopId: S, voucherType: "journal", voucherNo: "JV-9", voucherDate: "2026-11-04", status: "cancelled", totalAmount: 70,
      lines: [{ account: "Furniture", debit: 70 }, { account: "Capital", credit: 70 }] },
  ],
  receipts: [
    { id: "r1", shopId: S, receiptNo: "RV-1", receiptDate: "2026-11-05", customerId: "c1", customerName: "Al Noor & Sons", method: "cash", totalAmount: 200, note: "Part payment" },
    { id: "r9", shopId: S, receiptNo: "RV-9", receiptDate: "2026-11-05", customerId: "c1", method: "cash", totalAmount: 40, status: "cancelled" },
  ],
  payments: [
    { id: "p1", shopId: S, paymentNo: "PV-1", paymentDate: "2026-11-06", vendorId: "v1", vendorName: "Gulf <Parts>", method: "bank_transfer", totalAmount: 1000, discountAmount: 50 },
  ],
  salesInvoices: [
    { id: "s1", shopId: S, invoiceNo: "SI-1", invoiceDate: "2026-11-07", status: "final", customerId: "c1", grandTotal: 105, totalVat: 5, amountPaid: 0, paymentMethod: "credit" },
  ],
});
const ledgerOf = () => buildGlobalLedger(data(), { shopId: S, customers, vendors });

test("journal, contra, receipt and payment vouchers; cancelled left out; each balances", () => {
  const res = buildTallyVouchers(ledgerOf(), { from: "2026-11-01", to: "2026-11-30" });
  assert.deepEqual(res.vouchers.map((v) => [v.kind, v.no]), [["journal", "JV-1"], ["contra", "CV-1"], ["receipt", "RV-1"], ["payment", "PV-1"]]);
  assert.equal(res.vouchers.some((v) => v.no === "JV-9" || v.no === "RV-9"), false);
  res.vouchers.forEach((v) => assert.equal(v.lines.reduce((t, l) => t + l.dr, 0), v.lines.reduce((t, l) => t + l.cr, 0), v.no));
  const pay = res.vouchers.find((v) => v.no === "PV-1");
  assert.deepEqual(pay.lines.map((l) => [l.ledger, l.dr, l.cr]), [["Gulf <Parts>", 1000, 0], ["Bank", 0, 950], ["Discount Received", 0, 50]]);
  assert.deepEqual(res.kpi.payment, { count: 1, amount: 1000 });
  assert.deepEqual(res.total, { count: 4, amount: 2000 });
  assert.equal(res.unbalanced.length, 0);
  assert.equal(res.cashInJournal, 0);
});

test("type and date filters; day book is off unless asked and then follows the money", () => {
  const ledger = ledgerOf();
  assert.deepEqual(buildTallyVouchers(ledger, { kind: "contra" }).vouchers.map((v) => v.no), ["CV-1"]);
  assert.deepEqual(buildTallyVouchers(ledger, { from: "2026-11-05", to: "2026-11-05" }).vouchers.map((v) => v.no), ["RV-1"]);
  assert.equal(buildTallyVouchers(ledger, { from: "2026-12-01", to: "2026-12-31" }).total.count, 0);
  assert.equal(buildTallyVouchers(ledger).vouchers.some((v) => v.no === "SI-1"), false);
  const sale = buildTallyVouchers(ledger, { dayBook: true }).vouchers.find((v) => v.no === "SI-1");
  assert.equal(sale.source, "daybook");
  assert.equal(sale.kind, "journal");
  assert.deepEqual(sale.lines.map((l) => [l.ledger, l.dr, l.cr]), [["Al Noor & Sons", 105, 0], ["Sales", 0, 100], ["VAT Output", 0, 5]]);
});

test("XML: well-formed envelope, escaped text, Tally signs, company header", () => {
  const res = buildTallyVouchers(ledgerOf());
  const xml = tallyXml(res, { company: "S4 Spare <Parts> & Co", currency: "AED", from: "2026-11-01", to: "2026-11-30" });
  assert.ok(xml.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\r\n"));
  assert.ok(xml.includes("<TALLYREQUEST>Import Data</TALLYREQUEST>"));
  assert.ok(xml.includes("<SVCURRENTCOMPANY>S4 Spare &lt;Parts&gt; &amp; Co</SVCURRENTCOMPANY>"));
  assert.ok(xml.includes("<LEDGERNAME>Al Noor &amp; Sons</LEDGERNAME>"));
  assert.ok(xml.includes("<LEDGERNAME>Gulf &lt;Parts&gt;</LEDGERNAME>"));
  assert.equal(/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml), false);
  assert.ok(xml.includes("<VOUCHER VCHTYPE=\"Payment\" ACTION=\"Create\" OBJVIEW=\"Accounting Voucher View\">"));
  assert.ok(xml.includes("<DATE>20261106</DATE>"));
  assert.ok(xml.includes("<LEDGERNAME>Furniture</LEDGERNAME>\r\n      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\r\n      <AMOUNT>-500.00</AMOUNT>"));
  assert.ok(xml.includes("<LEDGERNAME>Capital</LEDGERNAME>\r\n      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\r\n      <AMOUNT>500.00</AMOUNT>"));
  // every voucher's AMOUNTs add up to zero, and the tags open and close in order
  xml.split("<VOUCHER ").slice(1).forEach((block) => {
    const sum = [...block.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].reduce((t, m) => t + Number(m[1]), 0);
    assert.ok(Math.abs(sum) < 0.005, block.slice(0, 60));
  });
  const stack = [];
  for (const m of xml.replace(/<\?xml[^>]*\?>|<!--[\s\S]*?-->/g, "").matchAll(/<(\/?)([A-Z][A-Z0-9.]*)(?:\s[^>]*)?>/g)) {
    if (m[1]) assert.equal(stack.pop(), m[2]); else stack.push(m[2]);
  }
  assert.equal(stack.length, 0);
  assert.equal(tallyXml(res, {}).includes("SVCURRENTCOMPANY"), false);
});

test("escaping, CSV sheet, file names, ledger list", () => {
  assert.equal(xmlEscape(`a & b < c > d "e" 'f'\u0001`), "a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;");
  const ledger = ledgerOf();
  const res = buildTallyVouchers(ledger);
  const rows = tallyCsvRows(res);
  assert.deepEqual(rows[0], ["Date", "Voucher Type", "Voucher No", "Ledger", "Dr", "Cr", "Narration"]);
  assert.deepEqual(rows[1], ["2026-11-02", "Journal", "JV-1", "Furniture", "500.00", "", "Office desk"]);
  assert.equal(rows.length, 1 + res.vouchers.reduce((t, v) => t + v.lines.length, 0));
  assert.equal(tallyFileName("2026-11-01", "2026-11-30"), "voucher-export-2026-11-01-2026-11-30.xml");
  assert.equal(tallyFileName("", "2026-11-30", "csv"), "voucher-export-start-2026-11-30.csv");
  const chart = normalizeChart([{ name: "Furniture", code: "1500" }]);
  const list = ledgerList(res, ledger, chart);
  const get = (n) => list.find((l) => l.name === n);
  assert.deepEqual([get("Furniture").code, get("Furniture").tallyGroup], ["1500", "Current Assets / Current Liabilities"]);
  assert.equal(get("Cash in Hand").tallyGroup, "Cash-in-Hand");
  assert.equal(get("Bank - ADCB").tallyGroup, "Bank Accounts");
  assert.equal(get("Al Noor & Sons").tallyGroup, "Sundry Debtors");
  assert.equal(get("Gulf <Parts>").tallyGroup, "Sundry Creditors");
  assert.equal(tallyGroupOf("Sales", "income"), "Sales Accounts");
});

test("an unbalanced entry is held back; the export never changes the ledger or the chart", () => {
  const d = data();
  d.payments.push({ id: "p2", shopId: S, paymentNo: "PV-2", paymentDate: "2026-11-08", vendorId: "v1", method: "cash", totalAmount: 100, chequeAmount: 120 });
  const ledger = buildGlobalLedger(d, { shopId: S, customers, vendors });
  const before = JSON.stringify(ledger.postings);
  const bal = [...balances(ledger.postings, "")];
  const chart = normalizeChart([{ name: "Furniture", code: "1500" }]);
  const chartBefore = JSON.stringify(chart);
  const res = buildTallyVouchers(ledger, { dayBook: true });
  tallyXml(res, { company: "X" }); tallyCsvRows(res); ledgerList(res, ledger, chart);
  assert.deepEqual(res.unbalanced.map((v) => v.no), ["PV-2"]);
  assert.equal(res.vouchers.some((v) => v.no === "PV-2"), false);
  assert.equal(JSON.stringify(ledger.postings), before);
  assert.deepEqual([...balances(ledger.postings, "")], bal);
  assert.equal(JSON.stringify(chart), chartBefore);
});
