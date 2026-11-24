import test from "node:test";
import assert from "node:assert/strict";
import { buildSerialRegistry, filterSerials, normSerial } from "./serialRegistry.js";

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
