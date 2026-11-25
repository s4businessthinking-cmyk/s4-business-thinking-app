import test from "node:test";
import assert from "node:assert/strict";
import { STATUS_GROUPS, buildSerialRegistry, filterSerials, normSerial } from "./serialRegistry.js";

const S = "s1";
const products = [{ id: "p1", code: "BAT-70", name: "Battery 70Ah" }, { id: "p2", code: "PH-1", name: "Phone X" }];
const data = {
  products,
  purchaseInvoices: [
    { id: "pi1", shopId: S, status: "confirmed", invoiceNo: "PI-1", invoiceDate: "2026-09-01", vendorName: "Gulf", items: [{ productId: "p2", serialNo: "35-111 222", qty: 1 }] },
    { id: "pid", shopId: S, status: "draft", invoiceNo: "PI-D", invoiceDate: "2026-09-02", items: [{ productId: "p2", serialNo: "DRAFT-1" }] },
  ],
  salesInvoices: [
    { id: "si1", shopId: S, status: "paid", invoiceNo: "SI-1", invoiceDate: "2026-09-10", customerName: "Al Noor", items: [{ productId: "p2", serialNo: "35111222" }] },
    { id: "six", shopId: S, status: "cancelled", invoiceNo: "SI-X", invoiceDate: "2026-09-11", items: [{ productId: "p2", serialNo: "CANCEL-1" }] },
  ],
  salesReturns: [
    { id: "sr1", shopId: S, status: "confirmed", returnNo: "SR-1", returnDate: "2026-09-20", partyName: "Al Noor", invoiceNo: "SI-1", items: [{ productId: "p2", name: "Phone X", serialNo: "35111222" }, { productId: "p1", name: "Battery 70Ah" }] },
  ],
  purchaseReturns: [
    { id: "pr1", shopId: S, status: "confirmed", returnNo: "PR-1", returnDate: "2026-09-25", partyName: "Gulf", items: [{ productId: "p2", serialNo: "35111222" }] },
    { id: "prx", shopId: S, status: "cancelled", returnNo: "PR-X", returnDate: "2026-09-26", items: [{ productId: "p2", serialNo: "GONE-1" }] },
  ],
  warrantyClaims: [
    { id: "w1", shopId: S, status: "replaced", claimNo: "WC-1", claimDate: "2026-10-01", sentDate: "2026-10-03", replacedDate: "2026-10-12", productId: "p1", productName: "Battery 70Ah", customerName: "Star", vendorName: "Amaron", serialNo: "bt 9001" },
    { id: "w2", shopId: S, status: "cancelled", claimNo: "WC-2", claimDate: "2026-10-01", productId: "p1", serialNo: "BT9002" },
    { id: "w3", shopId: S, status: "received", claimNo: "WC-3", claimDate: "2026-10-05", productId: "p1", serialNo: "" },
  ],
  jobOrders: [
    { id: "j1", shopId: S, status: "inProgress", jobNo: "JO-1", jobDate: "2026-10-20", customerName: "Rahim", itemDesc: "Alternator", serialNo: "ALT-55",
      statusHistory: [{ status: "received", at: "2026-10-20T09:00:00Z" }, { status: "inProgress", at: "2026-10-22T10:00:00Z" }] },
    { id: "j2", shopId: S, status: "cancelled", jobNo: "JO-2", jobDate: "2026-10-21", serialNo: "ALT-66" },
  ],
};
const rows = buildSerialRegistry(data, { shopId: S });
const find = (serial) => rows.find((r) => r.key === normSerial(serial));

test("one row per serial, spaces, dashes and case ignored; drafts and cancelled left out", () => {
  assert.deepEqual(rows.map((r) => r.key).sort(), ["35111222", "ALT55", "BT9001"]);
  assert.equal(normSerial(" bt 9001 "), "BT9001");
  assert.equal(normSerial("35-111 222"), "35111222");
  assert.equal(find("ALT-55").serial, "ALT-55");
});

test("lifecycle: latest document decides the status, full history kept", () => {
  const phone = find("35111222");
  assert.deepEqual(phone.events.map((e) => [e.kind, e.no]), [["purchase", "PI-1"], ["sale", "SI-1"], ["salesReturn", "SR-1"], ["purchaseReturn", "PR-1"]]);
  assert.equal(phone.status, "purchaseReturn");
  assert.equal(phone.group, "returnedOut");
  assert.equal(phone.last.party, "Gulf");
  assert.equal(phone.productName, "Phone X");
  assert.equal(phone.events[2].detail, "SI-1");
});

test("warranty steps come from the claim dates and status", () => {
  const bat = find("BT9001");
  assert.deepEqual(bat.events.map((e) => [e.kind, e.date]), [["warrantyReceived", "2026-10-01"], ["warrantySent", "2026-10-03"], ["warrantyReplaced", "2026-10-12"]]);
  assert.equal(bat.status, "warrantyReplaced");
  assert.equal(bat.productCode, "BAT-70");
});

test("job card serials use the last status change", () => {
  const alt = find("ALT-55");
  assert.equal(alt.status, "service");
  assert.equal(alt.last.date, "2026-10-22");
  assert.equal(alt.last.detail, "inProgress");
  assert.equal(alt.productName, "Alternator");
  assert.equal(rows[0].key, "ALT55");
});

test("search by partial serial, product or party, and by status group", () => {
  assert.deepEqual(filterSerials(rows, { query: "1112" }).map((r) => r.key), ["35111222"]);
  assert.deepEqual(filterSerials(rows, { query: "35 111" }).map((r) => r.key), ["35111222"]);
  assert.deepEqual(filterSerials(rows, { query: "battery" }).map((r) => r.key), ["BT9001"]);
  assert.deepEqual(filterSerials(rows, { query: "rahim" }).map((r) => r.key), ["ALT55"]);
  assert.deepEqual(filterSerials(rows, { group: "warranty" }).map((r) => r.key), ["BT9001"]);
  assert.deepEqual(filterSerials(rows, { query: "nothing-here" }), []);
  assert.deepEqual(buildSerialRegistry({}, {}), []);
});

test("sale then customer return: the return is the status; dashes or none find the same row", () => {
  const d = {
    products,
    salesInvoices: [{ id: "a1", shopId: S, status: "partial", invoiceNo: "SI-7", invoiceDate: "2026-11-02", customerName: "Zed", items: [{ productId: "p2", serialNo: "86-0001-22" }] }],
    salesReturns: [{ id: "a2", shopId: S, status: "confirmed", returnNo: "SR-7", returnDate: "2026-11-05", partyName: "Zed", invoiceNo: "SI-7", items: [{ productId: "p2", serialNo: "86000122" }] }],
  };
  const r = buildSerialRegistry(d, { shopId: S });
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].status, r[0].group, r[0].last.no], ["salesReturn", "returnedIn", "SR-7"]);
  for (const q of ["86-0001-22", "860001", "0001 22", "86 000122"]) assert.deepEqual(filterSerials(r, { query: q }).map((x) => x.key), ["86000122"], q);
  // a search of separators only is not a serial and matches nothing
  assert.deepEqual(filterSerials(r, { query: " - - " }), []);
});

test("cancelled, draft, other shops, quotations, deliveries and branch transfers are not events", () => {
  const sn = (serialNo) => [{ productId: "p2", serialNo }];
  const d = {
    salesInvoices: [
      { id: "x1", shopId: S, status: "cancelled", invoiceNo: "SI-C", invoiceDate: "2026-11-01", items: sn("K1") },
      { id: "x2", shopId: S, status: "draft", invoiceNo: "SI-D", invoiceDate: "2026-11-01", items: sn("K1") },
      { id: "x3", shopId: S, status: "paid", docKind: "quotation", invoiceNo: "Q-1", invoiceDate: "2026-11-01", items: sn("K1") },
      { id: "x4", shopId: S, status: "paid", invoiceType: "delivery", invoiceNo: "DN-1", invoiceDate: "2026-11-01", items: sn("K1") },
      { id: "x5", shopId: "s2", status: "paid", invoiceNo: "SI-OTHER", invoiceDate: "2026-11-01", items: sn("K1") },
      { id: "x6", shopId: S, status: "paid", isDeleted: true, invoiceNo: "SI-DEL", invoiceDate: "2026-11-01", items: sn("K1") },
      { id: "x7", shopId: S, status: "paid", invoiceNo: "SI-OK", invoiceDate: "2026-11-03", items: sn("K1") },
    ],
    purchaseInvoices: [
      { id: "y1", shopId: S, status: "confirmed", internalTransfer: true, invoiceNo: "BT-1", invoiceDate: "2026-11-01", items: sn("K1") },
      { id: "y2", shopId: S, status: "confirmed", sourceType: "branch_transfer", invoiceNo: "BT-2", invoiceDate: "2026-11-01", items: sn("K1") },
    ],
    salesReturns: [{ id: "z1", shopId: S, status: "cancelled", returnNo: "SR-C", returnDate: "2026-11-09", items: sn("K1") }],
  };
  const r = buildSerialRegistry(d, { shopId: S });
  assert.deepEqual(r.map((x) => x.events.map((e) => e.no)), [["SI-OK"]]);
  assert.equal(r[0].status, "sale", "the cancelled return does not move it back");
});

test("each status tile count equals the rows that group shows, with and without a search", () => {
  for (const query of ["", "al", "35", "gulf", "zzz"]) {
    const searched = filterSerials(rows, { query });
    const total = STATUS_GROUPS.reduce((t, g) => {
      const n = searched.filter((r) => r.group === g).length;
      assert.equal(n, filterSerials(rows, { query, group: g }).length, `${query}/${g}`);
      return t + n;
    }, 0);
    assert.equal(total, searched.length, query);
  }
  assert.deepEqual(STATUS_GROUPS.map((g) => filterSerials(rows, { group: g }).length), [0, 0, 0, 1, 1, 1]);
});

test("same-day events order the same whatever order the documents load in", () => {
  const bill = (id, no) => ({ id, shopId: S, status: "paid", invoiceNo: no, invoiceDate: "2026-11-10", customerName: no, items: [{ productId: "p2", serialNo: "D1" }] });
  const ret = { id: "r1", shopId: S, status: "confirmed", returnNo: "SR-9", returnDate: "2026-11-10", items: [{ productId: "p2", serialNo: "D1" }] };
  const a = buildSerialRegistry({ salesInvoices: [bill("b10", "SI-10"), bill("b9", "SI-9")], salesReturns: [ret] }, { shopId: S });
  const b = buildSerialRegistry({ salesInvoices: [bill("b9", "SI-9"), bill("b10", "SI-10")], salesReturns: [ret] }, { shopId: S });
  assert.deepEqual(a[0].events.map((e) => e.no), ["SI-9", "SI-10", "SR-9"]);
  assert.deepEqual(b[0].events.map((e) => e.no), a[0].events.map((e) => e.no));
  assert.equal(a[0].status, "salesReturn");
});
