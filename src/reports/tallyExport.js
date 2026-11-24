// Tally export: S4 vouchers for a date range as a Tally XML import file (TallyPrime / Tally.ERP 9, "Import Data" ->
// Vouchers) and a CSV sheet with the same lines. Export only: nothing in S4 is written or changed, and nothing is read
// back from Tally. The source is the Global Ledger (read only), so every voucher carries exactly the debit / credit
// lines S4 itself posts, cancelled and draft documents are already left out, and each voucher balances.
//
// Which vouchers:
// - Journal / Contra: journal and contra vouchers (Accounts -> Vouchers), same type in Tally.
// - Receipt: customer receipts, and refunds received from a supplier.
// - Payment: supplier payments (a discount goes to "Discount Received"), and refunds paid to a customer.
// - Day book (off unless asked): every other posting - bills, returns, expenses, bill-time payments, partner money,
//   bank entries - one voucher per document entry. Money in only -> Receipt, money out only -> Payment, cash <-> bank
//   -> Contra, no cash / bank -> Journal. Accounting lines only: no stock items, godowns or inventory values.
//
// Ledger names: exactly the S4 account names (the chart of accounts names, "Cash in Hand", "Bank", "Sales", ...) and
// customer / supplier names as they are in S4. Tally needs a ledger of that exact name before import; ledgerList()
// gives the list with a suggested Tally group. Amounts are in the shop currency (the Tally company's base currency).
// Tally's sign rule: a debit line is ISDEEMEDPOSITIVE Yes with a negative AMOUNT, a credit line No with a positive one.
import { r2 } from "./reportFilters.js";

export const TALLY_KINDS = ["journal", "contra", "receipt", "payment"];
export const TALLY_VCH = { journal: "Journal", contra: "Contra", receipt: "Receipt", payment: "Payment" };
const VOUCHER_COLS = new Set(["accountVouchers", "salesReceipts", "purchasePayments"]);
const VOUCHER_KIND = { journal: "journal", contra: "contra", receipt: "receipt", refundReceived: "receipt", payment: "payment", refundPaid: "payment" };

const day = (v) => String(v || "").slice(0, 10);

/** Tally kind of a day-book entry from its cash / bank lines. */
function kindByMoney(lines, isMoney) {
  const moneyDr = lines.some((l) => isMoney(l.key) && l.dr > 0);
  const moneyCr = lines.some((l) => isMoney(l.key) && l.cr > 0);
  if (moneyDr && moneyCr) return "contra";
  if (moneyDr) return "receipt";
  if (moneyCr) return "payment";
  return "journal";
}

/**
 * ledger: buildGlobalLedger result. opts: { from, to, kind: ""|journal|contra|receipt|payment, dayBook }
 * -> { vouchers: [{ id, kind, source: "voucher"|"daybook", type, col, date, no, narration, lines: [{ key, ledger, dr, cr }], amount }],
 *      kpi: { [kind]: { count, amount } }, total: { count, amount }, unbalanced: [voucher], cashInJournal: count }
 * amount = the voucher's debit total. A voucher whose lines do not balance is held back and listed in unbalanced.
 */
export function buildTallyVouchers(ledger, { from = "", to = "", kind = "", dayBook = false } = {}) {
  const accounts = ledger?.accounts || new Map();
  const isMoney = (key) => accounts.get(key)?.group === "money";
  const byDoc = new Map();
  (ledger?.postings || []).forEach((p) => {
    if ((from && p.date < from) || (to && p.date > to)) return;
    const isVoucher = VOUCHER_COLS.has(p.col) && VOUCHER_KIND[p.type];
    if (!isVoucher && !dayBook) return;
    const id = `${p.col}|${p.docId}|${p.type}`;
    if (!byDoc.has(id)) byDoc.set(id, { id, source: isVoucher ? "voucher" : "daybook", type: p.type, col: p.col, date: day(p.date), no: p.no || "", narration: p.narration || "", lines: [] });
    byDoc.get(id).lines.push({ key: p.key, ledger: accounts.get(p.key)?.name || p.key, dr: r2(p.dr), cr: r2(p.cr) });
  });
  const all = [...byDoc.values()].map((v) => {
    const lines = [...v.lines.filter((l) => l.dr > 0), ...v.lines.filter((l) => !(l.dr > 0))];
    const dr = r2(lines.reduce((t, l) => t + l.dr, 0)), cr = r2(lines.reduce((t, l) => t + l.cr, 0));
    return { ...v, kind: v.source === "voucher" ? VOUCHER_KIND[v.type] : kindByMoney(lines, isMoney), lines, amount: dr, balanced: lines.length >= 2 && Math.abs(dr - cr) < 0.005 };
  }).filter((v) => !kind || v.kind === kind)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.no).localeCompare(String(b.no), undefined, { numeric: true }));
  const vouchers = all.filter((v) => v.balanced);
  const kpi = Object.fromEntries(TALLY_KINDS.map((k) => {
    const list = vouchers.filter((v) => v.kind === k);
    return [k, { count: list.length, amount: r2(list.reduce((t, v) => t + v.amount, 0)) }];
  }));
  return {
    vouchers, kpi,
    total: { count: vouchers.length, amount: r2(vouchers.reduce((t, v) => t + v.amount, 0)) },
    unbalanced: all.filter((v) => !v.balanced),
    // Tally.ERP 9 takes cash / bank lines in a Journal only with "Allow cash accounts in journals" switched on
    cashInJournal: vouchers.filter((v) => v.kind === "journal" && v.lines.some((l) => isMoney(l.key))).length,
  };
}

// Suggested Tally group for an S4 ledger (only a hint for creating the ledger in Tally; the export never sets it).
const TALLY_GROUP = {
  customer: "Sundry Debtors", vendor: "Sundry Creditors", tax: "Duties & Taxes", equity: "Capital Account",
  income: "Indirect Incomes", expense: "Indirect Expenses", other: "Current Assets / Current Liabilities",
};
export function tallyGroupOf(name, group) {
  if (group === "money") return /^bank\b/i.test(String(name || "")) ? "Bank Accounts" : "Cash-in-Hand";
  if (name === "Sales" || name === "Sales Return") return "Sales Accounts";
  if (name === "Purchase" || name === "Purchase Return") return "Purchase Accounts";
  return TALLY_GROUP[group] || TALLY_GROUP.other;
}

/** Every ledger the vouchers use: { name, group, tallyGroup, code, lines }, sorted by suggested group then name. */
export function ledgerList(result, ledger, chart = []) {
  const codeOf = new Map((Array.isArray(chart) ? chart : []).filter((a) => a?.code && a?.name).map((a) => [String(a.name).trim().toLowerCase(), a.code]));
  const seen = new Map();
  (result?.vouchers || []).forEach((v) => v.lines.forEach((l) => {
    if (!seen.has(l.ledger)) {
      const group = ledger?.accounts?.get(l.key)?.group || "other";
      seen.set(l.ledger, { name: l.ledger, group, tallyGroup: tallyGroupOf(l.ledger, group), code: codeOf.get(l.ledger.trim().toLowerCase()) || "", lines: 0 });
    }
    seen.get(l.ledger).lines += 1;
  }));
  return [...seen.values()].sort((a, b) => a.tallyGroup.localeCompare(b.tallyGroup) || a.name.localeCompare(b.name));
}

/** Text for an XML element or attribute: &, <, >, quotes escaped; characters XML 1.0 does not allow dropped. */
export function xmlEscape(v) {
  return String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
const tallyDate = (d) => String(d || "").replace(/-/g, "");
const amt = (v) => r2(v).toFixed(2);

function voucherXml(v) {
  const t = TALLY_VCH[v.kind];
  const party = v.kind === "receipt" || v.kind === "payment" ? (v.kind === "receipt" ? v.lines.find((l) => l.cr > 0) : v.lines.find((l) => l.dr > 0)) : null;
  const lines = v.lines.map((l) => {
    const debit = l.dr > 0;
    return [
      "     <ALLLEDGERENTRIES.LIST>",
      `      <LEDGERNAME>${xmlEscape(l.ledger)}</LEDGERNAME>`,
      `      <ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
      `      <AMOUNT>${debit ? `-${amt(l.dr)}` : amt(l.cr)}</AMOUNT>`,
      "     </ALLLEDGERENTRIES.LIST>",
    ].join("\n");
  });
  return [
    "    <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">",
    `     <VOUCHER VCHTYPE="${t}" ACTION="Create" OBJVIEW="Accounting Voucher View">`,
    `      <DATE>${tallyDate(v.date)}</DATE>`,
    `      <VOUCHERTYPENAME>${t}</VOUCHERTYPENAME>`,
    `      <VOUCHERNUMBER>${xmlEscape(v.no)}</VOUCHERNUMBER>`,
    ...(party ? [`      <PARTYLEDGERNAME>${xmlEscape(party.ledger)}</PARTYLEDGERNAME>`] : []),
    `      <NARRATION>${xmlEscape(v.narration)}</NARRATION>`,
    `      <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>`,
    ...lines,
    "     </VOUCHER>",
    "    </TALLYMESSAGE>",
  ].join("\n");
}

/**
 * Tally XML import file. company: the Tally company name (SVCURRENTCOMPANY; left out when empty, Tally then uses the
 * company that is open). currency / from / to only go into the header comment.
 */
export function tallyXml(result, { company = "", currency = "", from = "", to = "" } = {}) {
  const note = `S4 voucher export${from || to ? ` ${from || "start"} to ${to || "today"}` : ""}; ${result.vouchers.length} voucher(s)${currency ? `; amounts in ${currency}` : ""}`;
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    `<!-- ${note.replace(/--/g, "- -")} -->`,
    "<ENVELOPE>",
    " <HEADER>",
    "  <TALLYREQUEST>Import Data</TALLYREQUEST>",
    " </HEADER>",
    " <BODY>",
    "  <IMPORTDATA>",
    "   <REQUESTDESC>",
    "    <REPORTNAME>Vouchers</REPORTNAME>",
    ...(String(company).trim() ? ["    <STATICVARIABLES>", `     <SVCURRENTCOMPANY>${xmlEscape(String(company).trim())}</SVCURRENTCOMPANY>`, "    </STATICVARIABLES>"] : []),
    "   </REQUESTDESC>",
    "   <REQUESTDATA>",
    ...result.vouchers.map(voucherXml),
    "   </REQUESTDATA>",
    "  </IMPORTDATA>",
    " </BODY>",
    "</ENVELOPE>",
    "",
  ].join("\r\n").replace(/\r?\n/g, "\r\n");
}

export const TALLY_CSV_COLS = ["Date", "Voucher Type", "Voucher No", "Ledger", "Dr", "Cr", "Narration"];
/** CSV rows: one per ledger line, plain-number amounts, the narration on every line of its voucher. */
export const tallyCsvRows = (result) => [
  TALLY_CSV_COLS,
  ...result.vouchers.flatMap((v) => v.lines.map((l) => [v.date, TALLY_VCH[v.kind], v.no, l.ledger, l.dr > 0 ? amt(l.dr) : "", l.cr > 0 ? amt(l.cr) : "", v.narration])),
];

/** voucher-export-{from}-{to}.xml / .csv (the file name does not name the target software) */
export const tallyFileName = (from, to, ext = "xml") => `voucher-export-${from || "start"}-${to || "today"}.${ext}`;
