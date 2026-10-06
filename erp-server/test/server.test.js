import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { startServer } from "../src/app.js";

let app;
let base;

const cfg = {
  production: false,
  host: "127.0.0.1",
  port: 0,
  dbDriver: "sqlite",
  sqlitePath: ":memory:",
  jwtSecret: "test-secret-test-secret-test-secret-123",
  idTokenTtlSec: 3600,
  refreshTokenTtlSec: 3600,
  maxBodyBytes: 1024 * 1024,
  trustProxy: false,
  sendMail: async (message) => { sentMail.push(message); },
};
const sentMail = [];

async function api(path, body, token) {
  const res = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, ...json };
}

const lastCode = () => sentMail.at(-1).text.match(/\b(\d{6})\b/)[1];

async function signup(email, password) {
  assert.equal((await api("/v1/auth/signup-code", { email })).status, 200);
  return api("/v1/auth/signup", { email, password, code: lastCode() });
}

const commit = (token, writes, preconditions) => api("/v1/db/commit", { writes, preconditions }, token);
const set = (collection, id, data, merge = false) => ({ op: "set", collection, id, data, merge });

let owner;
let sales;
let outsider;

before(async () => {
  app = await startServer(cfg);
  base = `http://127.0.0.1:${app.port}`;

  owner = await signup("Owner@Shop.com", "secret1");
  sales = await signup("sales@shop.com", "secret2");
  outsider = await signup("x@other.com", "secret3");

  assert.equal((await commit(owner.idToken, [
    set("users", owner.uid, { shopId: "shop1", role: "owner", personName: "Owner" }),
    set("shops", "shop1", { ownerUid: owner.uid, companyName: "S4 Parts" }),
  ])).status, 200);
  assert.equal((await commit(owner.idToken, [set("inviteCodes", "JOIN1", { shopId: "shop1", used: false })])).status, 200);
  assert.equal((await commit(sales.idToken, [set("inviteCodes", "JOIN1", { shopId: "shop1", used: true, usedBy: sales.uid })])).status, 200);
  assert.equal((await commit(sales.idToken, [set("users", sales.uid, { shopId: "shop1", role: "salesman", inviteCode: "JOIN1" })])).status, 200);
  assert.equal((await commit(outsider.idToken, [set("users", outsider.uid, { shopId: "shop2", role: "owner" })])).status, 200);
});

after(async () => {
  await app.close();
});

test("auth: login, wrong password, refresh, duplicate email", async () => {
  const ok = await api("/v1/auth/login", { email: "owner@shop.com", password: "secret1" });
  assert.equal(ok.status, 200);
  assert.equal(ok.uid, owner.uid);

  const bad = await api("/v1/auth/login", { email: "owner@shop.com", password: "nope00" });
  assert.equal(bad.status, 401);
  assert.equal(bad.error.message, "auth/invalid-credential");

  const refreshed = await api("/v1/auth/refresh", { refreshToken: ok.refreshToken });
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.idToken);

  assert.equal((await api("/v1/auth/signup-code", { email: "owner@shop.com" })).status, 409, "no code for a taken email");

  const noCode = await api("/v1/auth/signup", { email: "new@shop.com", password: "secret9" });
  assert.equal(noCode.status, 400);
  assert.equal(noCode.error.message, "auth/email-code-expired");
  assert.equal((await api("/v1/auth/signup-code", { email: "new@shop.com" })).status, 200);
  const realCode = lastCode();
  assert.equal(sentMail.at(-1).to, "new@shop.com");
  const wrongCode = await api("/v1/auth/signup", { email: "new@shop.com", password: "secret9", code: realCode === "000000" ? "111111" : "000000" });
  assert.equal(wrongCode.error.message, "auth/invalid-email-code");
  assert.equal((await api("/v1/auth/signup", { email: "new@shop.com", password: "secret9", code: realCode })).status, 200);

  const usernameOnly = await api("/v1/auth/signup", { email: "rahim.shop1@s4local.app", password: "secret9" });
  assert.equal(usernameOnly.status, 200, "placeholder addresses cannot receive a code");

  const byOwner = await api("/v1/auth/signup", { email: "staff@shop.com", password: "secret9" }, owner.idToken);
  assert.equal(byOwner.status, 200, "an owner adding staff needs no code");
  const byStaff = await api("/v1/auth/signup", { email: "staff2@shop.com", password: "secret9" }, sales.idToken);
  assert.equal(byStaff.status, 400, "staff cannot skip the code");

  const noToken = await commit(undefined, [set("products", "p0", { shopId: "shop1", name: "x" })]);
  assert.equal(noToken.status, 401);
});

test("owner PIN reset: emailed code, owner only, wrong code and resend limits", async () => {
  assert.equal((await api("/v1/pin/request-code", {}, sales.idToken)).status, 403, "staff cannot reset the owner PIN");
  assert.equal((await api("/v1/pin/request-code", {})).status, 401);

  const sent = await api("/v1/pin/request-code", {}, owner.idToken);
  assert.equal(sent.status, 200);
  assert.equal(sent.email, "ow***@shop.com");
  assert.equal(sentMail.at(-1).to, "owner@shop.com");
  const code = lastCode();

  assert.equal((await api("/v1/pin/request-code", {}, owner.idToken)).status, 429, "one code per minute");
  const wrong = code === "000000" ? "111111" : "000000";
  assert.equal((await api("/v1/pin/verify-code", { code: wrong }, owner.idToken)).status, 400);
  assert.equal((await api("/v1/pin/verify-code", { code }, owner.idToken)).status, 200);
  assert.equal((await api("/v1/pin/verify-code", { code }, owner.idToken)).status, 404, "a code works once");
});

test("users: no self-promotion, no joining a shop without an invite", async () => {
  const promote = await commit(sales.idToken, [set("users", sales.uid, { role: "owner" }, true)]);
  assert.equal(promote.status, 403);
  const grant = await commit(sales.idToken, [set("users", sales.uid, { permissions: { printCheques: true } }, true)]);
  assert.equal(grant.status, 403);
  assert.equal((await commit(sales.idToken, [set("users", sales.uid, { personName: "Ali" }, true)])).status, 200);
  assert.equal((await commit(owner.idToken, [set("users", sales.uid, { permissions: { printCheques: true } }, true)])).status, 200);

  const intruder = await signup("intruder@x.com", "secret4");
  const join = await commit(intruder.idToken, [set("users", intruder.uid, { shopId: "shop1", role: "salesman" })]);
  assert.equal(join.status, 403);
  const reuse = await commit(intruder.idToken, [set("users", intruder.uid, { shopId: "shop1", role: "salesman", inviteCode: "JOIN1" })]);
  assert.equal(reuse.status, 403);
  const hijack = await commit(intruder.idToken, [set("users", intruder.uid, { shopId: "shop1", role: "owner" })]);
  assert.equal(hijack.status, 403);
});

test("products: shop members write and read; other shop cannot", async () => {
  assert.equal((await commit(owner.idToken, [set("products", "p1", { shopId: "shop1", name: "Brake Pad", code: "BP1" })])).status, 200);
  assert.equal((await commit(sales.idToken, [set("products", "p2", { shopId: "shop1", name: "Air Filter" })])).status, 403, "products need manageProducts");
  assert.equal((await commit(owner.idToken, [set("users", sales.uid, { permissions: { manageProducts: true } }, true)])).status, 200);
  assert.equal((await commit(sales.idToken, [set("products", "p2", { shopId: "shop1", name: "Air Filter" })])).status, 200);
  assert.equal((await commit(sales.idToken, [set("products", "p3", { shopId: "shop1", code: "NO-NAME" })])).status, 200);

  const list = await api("/v1/db/query", { collection: "products", filters: [["shopId", "==", "shop1"]], orderBy: [["name", "asc"]] }, sales.idToken);
  assert.deepEqual(list.docs.map((d) => d.id), ["p2", "p1"], "orderBy drops docs without the field, like Firestore");

  const spy = await api("/v1/db/query", { collection: "products", filters: [["shopId", "==", "shop1"]] }, outsider.idToken);
  assert.equal(spy.docs.length, 0);
  const spyGet = await api("/v1/db/get", { collection: "products", id: "p1" }, outsider.idToken);
  assert.equal(spyGet.status, 403);

  const wrongShop = await commit(outsider.idToken, [set("products", "p9", { shopId: "shop1", name: "Fake" })]);
  assert.equal(wrongShop.status, 403);

  const unscoped = await api("/v1/db/query", { collection: "products" }, owner.idToken);
  assert.equal(unscoped.status, 400);
});

test("rules: a username entry cannot be taken over by another account", async () => {
  const entry = { username: "rahim", shopId: "shop1", authEmail: "owner@shop.com", firebaseUid: owner.uid };
  assert.equal((await commit(owner.idToken, [set("staffLoginIndex", "rahim", entry)])).status, 200);
  const hijack = await commit(outsider.idToken, [set("staffLoginIndex", "rahim", { ...entry, shopId: "shop2", firebaseUid: outsider.uid })]);
  assert.equal(hijack.status, 403);
  const lookup = await api("/v1/db/get", { collection: "staffLoginIndex", id: "rahim" });
  assert.equal(lookup.doc.data.firebaseUid, owner.uid);
});

test("rules: salesman may only touch payment fields of a purchase invoice", async () => {
  assert.equal((await commit(owner.idToken, [set("purchaseInvoices", "pi1", { shopId: "shop1", invoiceNo: "PI-1", grandTotal: 100, amountPaid: 0, balanceDue: 100, status: "confirmed", createdBy: owner.uid })])).status, 200);

  const pay = await commit(sales.idToken, [{ op: "update", collection: "purchaseInvoices", id: "pi1", data: { amountPaid: 40, balanceDue: 60, status: "partial", updatedBy: sales.uid } }]);
  assert.equal(pay.status, 200);

  const tamper = await commit(sales.idToken, [{ op: "update", collection: "purchaseInvoices", id: "pi1", data: { grandTotal: 1 } }]);
  assert.equal(tamper.status, 403);

  const del = await commit(sales.idToken, [{ op: "delete", collection: "purchaseInvoices", id: "pi1" }]);
  assert.equal(del.status, 403);

  const doc = await api("/v1/db/get", { collection: "purchaseInvoices", id: "pi1" }, owner.idToken);
  assert.equal(doc.doc.data.amountPaid, 40);
  assert.equal(doc.doc.data.grandTotal, 100);
});

test("batch is all-or-nothing", async () => {
  const res = await commit(sales.idToken, [
    set("customers", "c1", { shopId: "shop1", customerName: "Ali" }),
    set("purchaseInvoices", "pi2", { shopId: "shop1", invoiceNo: "PI-2", createdBy: owner.uid }),
  ]);
  assert.equal(res.status, 403);
  const customers = await api("/v1/db/query", { collection: "customers", filters: [["shopId", "==", "shop1"]] }, owner.idToken);
  assert.deepEqual(customers.docs, []);
});

test("field ops, merge and transactions", async () => {
  await commit(owner.idToken, [set("shops", "shop1", { lastSISerial: 5, meta: { a: 1, b: 2 } }, true)]);
  const r1 = await commit(sales.idToken, [{ op: "update", collection: "shops", id: "shop1", data: { lastSISerial: { __s4op: "increment", n: 1 } } }]);
  assert.equal(r1.status, 200);
  const shop = (await api("/v1/db/get", { collection: "shops", id: "shop1" }, owner.idToken)).doc;
  assert.equal(shop.data.lastSISerial, 6);
  assert.equal(shop.data.companyName, "S4 Parts", "merge keeps other fields");

  await commit(owner.idToken, [set("shops", "shop1", { meta: { b: { __s4op: "delete" } }, stamp: { __s4op: "serverTimestamp" } }, true)]);
  const shop2 = (await api("/v1/db/get", { collection: "shops", id: "shop1" }, owner.idToken)).doc;
  assert.deepEqual(shop2.data.meta, { a: 1 });
  assert.match(shop2.data.stamp, /^\d{4}-\d{2}-\d{2}T/);

  const stale = await commit(owner.idToken, [{ op: "update", collection: "shops", id: "shop1", data: { lastSISerial: 7 } }], [{ collection: "shops", id: "shop1", version: shop.version }]);
  assert.equal(stale.status, 409);
  const fresh = await commit(owner.idToken, [{ op: "update", collection: "shops", id: "shop1", data: { lastSISerial: 7 } }], [{ collection: "shops", id: "shop1", version: shop2.version }]);
  assert.equal(fresh.status, 200);

  const tamper = await commit(sales.idToken, [{ op: "update", collection: "shops", id: "shop1", data: { companyName: "Hacked" } }]);
  assert.equal(tamper.status, 403);
});

function openSocket(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/v1/realtime`);
    const inbox = [];
    const waiters = [];
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      const i = waiters.findIndex((w) => w.match(msg));
      if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
      else inbox.push(msg);
    });
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token })));
    const next = (match, ms = 2000) => {
      const i = inbox.findIndex(match);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((res, rej) => {
        const w = { match, resolve: res };
        waiters.push(w);
        setTimeout(() => {
          const k = waiters.indexOf(w);
          if (k >= 0) {
            waiters.splice(k, 1);
            rej(new Error("timeout"));
          }
        }, ms);
      });
    };
    next((m) => m.t === "ready").then(() => resolve({ ws, next, inbox }), reject);
  });
}

test("realtime: snapshot then added/modified/removed deltas, scoped per shop", async () => {
  const ownerWs = await openSocket(owner.idToken);
  const spyWs = await openSocket(outsider.idToken);

  ownerWs.ws.send(JSON.stringify({ t: "sub", id: "s1", q: { collection: "vendors", filters: [["shopId", "==", "shop1"]], orderBy: [["vendorName", "asc"]] } }));
  spyWs.ws.send(JSON.stringify({ t: "sub", id: "s1", q: { collection: "vendors", filters: [["shopId", "==", "shop1"]] } }));
  assert.deepEqual((await ownerWs.next((m) => m.t === "snap")).docs, []);
  await spyWs.next((m) => m.t === "snap");

  await commit(owner.idToken, [set("vendors", "v1", { shopId: "shop1", vendorName: "Al Futtaim" })]);
  const added = await ownerWs.next((m) => m.t === "chg");
  assert.equal(added.changes[0].type, "added");
  assert.equal(added.changes[0].data.vendorName, "Al Futtaim");

  await commit(owner.idToken, [{ op: "update", collection: "vendors", id: "v1", data: { phone: "050" } }]);
  assert.equal((await ownerWs.next((m) => m.t === "chg")).changes[0].type, "modified");

  await commit(owner.idToken, [{ op: "delete", collection: "vendors", id: "v1" }]);
  assert.equal((await ownerWs.next((m) => m.t === "chg")).changes[0].type, "removed");

  await assert.rejects(spyWs.next((m) => m.t === "chg", 300), /timeout/);

  ownerWs.ws.close();
  spyWs.ws.close();
});

test("backup: owner exports and restores own shop only", async () => {
  await commit(owner.idToken, [
    set("customers", "bc1", { shopId: "shop1", customerName: "Backup Customer", phone: "1" }),
    set("salesInvoices", "bsi1", { shopId: "shop1", invoiceNo: "SI-B1", grandTotal: 50, createdBy: owner.uid }),
  ]);
  await commit(outsider.idToken, [set("customers", "oc1", { shopId: "shop2", customerName: "Other Shop" })]);

  const backup = await api("/v1/backup/export", { shopId: "shop1" }, owner.idToken);
  assert.equal(backup.status, 200);
  assert.equal(backup.format, "s4-shop-backup");
  assert.ok(backup.collections.shops.length === 1 && backup.collections.customers.some((d) => d.id === "bc1"));
  assert.ok(!JSON.stringify(backup).includes("Other Shop"), "export must not leak other shops");

  assert.equal((await api("/v1/backup/export", { shopId: "shop1" }, sales.idToken)).status, 403);
  assert.equal((await api("/v1/backup/export", { shopId: "shop1" }, outsider.idToken)).status, 403);

  await commit(owner.idToken, [
    { op: "update", collection: "customers", id: "bc1", data: { phone: "changed" } },
    { op: "delete", collection: "salesInvoices", id: "bsi1" },
    set("customers", "bc2", { shopId: "shop1", customerName: "Added After Backup" }),
  ]);

  const { status, format, version, shopId, collections } = backup;
  assert.equal(status, 200);
  const file = { format, version, shopId, collections };
  file.collections.customers.push({ id: "oc1", data: { shopId: "shop1", customerName: "Hijack" } });
  file.collections.customers.push({ id: "x9", data: { shopId: "shop2", customerName: "Inject" } });

  assert.equal((await api("/v1/backup/restore", { backup: file }, outsider.idToken)).status, 403);
  assert.equal((await api("/v1/backup/restore", { backup: file }, sales.idToken)).status, 403);

  const gz = (await import("node:zlib")).gzipSync(JSON.stringify({ backup: file }));
  const res = await fetch(`${base}/v1/backup/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Encoding": "gzip", Authorization: `Bearer ${owner.idToken}` },
    body: gz,
  });
  const result = await res.json();
  assert.equal(res.status, 200);
  assert.equal(result.restored, 2);
  assert.equal(result.skipped, 2);

  const after = await api("/v1/db/query", { collection: "customers", filters: [["shopId", "==", "shop1"]] }, owner.idToken);
  const byId = Object.fromEntries(after.docs.map((d) => [d.id, d.data]));
  assert.equal(byId.bc1.phone, "1");
  assert.ok(byId.bc2, "documents created after the backup are kept");
  assert.equal((await api("/v1/db/get", { collection: "salesInvoices", id: "bsi1" }, owner.idToken)).doc.data.invoiceNo, "SI-B1");
  assert.equal((await api("/v1/db/get", { collection: "customers", id: "oc1" }, outsider.idToken)).doc.data.customerName, "Other Shop");
  const shop2 = await api("/v1/db/query", { collection: "customers", filters: [["shopId", "==", "shop2"]] }, outsider.idToken);
  assert.deepEqual(shop2.docs.map((d) => d.id), ["oc1"]);
  assert.ok(!after.docs.some((d) => d.id === "x9"));

  assert.equal((await api("/v1/backup/restore", { backup: { format: "nope" } }, owner.idToken)).status, 400);
});

test("realtime: rejects bad token", async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/v1/realtime`);
  const code = await new Promise((resolve) => {
    ws.on("open", () => ws.send(JSON.stringify({ t: "auth", token: "bogus" })));
    ws.on("close", (c) => resolve(c));
  });
  assert.equal(code, 4401);
});

test("rules: sales bills, receipts and customers follow the staff permissions", async () => {
  const si = { shopId: "shop1", invoiceNo: "SI-R1", grandTotal: 100, amountPaid: 0, balanceDue: 100, status: "confirmed", createdBy: sales.uid };
  assert.equal((await commit(sales.idToken, [set("salesInvoices", "rsi1", si)])).status, 200);
  assert.equal((await commit(sales.idToken, [{ op: "update", collection: "salesInvoices", id: "rsi1", data: { note: "fixed" } }])).status, 200);
  assert.equal((await commit(sales.idToken, [{ op: "update", collection: "salesInvoices", id: "rsi1", data: { amountPaid: 500 } }])).status, 403, "paid above the bill total");
  assert.equal((await commit(sales.idToken, [{ op: "update", collection: "salesInvoices", id: "rsi1", data: { status: "cancelled" } }])).status, 403, "cancel needs cancelInvoices");
  assert.equal((await commit(sales.idToken, [{ op: "delete", collection: "salesInvoices", id: "rsi1" }])).status, 403, "only drafts are deleted");

  assert.equal((await commit(owner.idToken, [set("salesInvoices", "rsi2", { ...si, invoiceNo: "SI-R2", createdBy: owner.uid })])).status, 200);
  assert.equal((await commit(sales.idToken, [{ op: "update", collection: "salesInvoices", id: "rsi2", data: { status: "cancelled", updatedBy: sales.uid } }])).status, 403, "payment fields cannot cancel");
  assert.equal((await commit(sales.idToken, [{ op: "update", collection: "salesInvoices", id: "rsi2", data: { amountPaid: 40, balanceDue: 60, status: "partial", _offline_updated_at: "x", _cloud_synced_at: "y" } }])).status, 200);

  const receipt = { shopId: "shop1", receiptNo: "RC-1", customerName: "Ali", method: "cheque", totalAmount: 40, allocations: [{ invoiceId: "rsi2", amount: 40 }], status: "active", chequeStatus: "pending", createdBy: sales.uid };
  assert.equal((await commit(sales.idToken, [set("salesReceipts", "rr1", receipt)])).status, 200);
  assert.equal((await commit(sales.idToken, [{ op: "update", collection: "salesReceipts", id: "rr1", data: { chequeStatus: "cleared" } }])).status, 200);
  assert.equal((await commit(sales.idToken, [{ op: "update", collection: "salesReceipts", id: "rr1", data: { chequeStatus: "bounced", status: "cancelled" } }])).status, 403);
  assert.equal((await commit(sales.idToken, [{ op: "update", collection: "salesReceipts", id: "rr1", data: { chequeDate: "2030-01-01" } }])).status, 403, "postpone needs managePdc");

  assert.equal((await commit(owner.idToken, [set("users", sales.uid, { permissions: { cancelInvoices: true, manageCustomers: false } }, true)])).status, 200);
  assert.equal((await commit(sales.idToken, [{ op: "update", collection: "salesReceipts", id: "rr1", data: { chequeStatus: "bounced", status: "cancelled" } }])).status, 200);
  assert.equal((await commit(sales.idToken, [{ op: "update", collection: "salesInvoices", id: "rsi1", data: { status: "cancelled" } }])).status, 200);

  assert.equal((await commit(owner.idToken, [set("customers", "rc1", { shopId: "shop1", customerName: "Del Me" })])).status, 200);
  assert.equal((await commit(sales.idToken, [{ op: "delete", collection: "customers", id: "rc1" }])).status, 403);
  assert.equal((await commit(owner.idToken, [{ op: "delete", collection: "customers", id: "rc1" }])).status, 200);

  assert.equal((await commit(sales.idToken, [set("purchaseInvoices", "rpi1", { shopId: "shop1", invoiceNo: "PI-R1", status: "confirmed", createdBy: sales.uid })])).status, 403, "purchase needs managePurchase");
  assert.equal((await commit(owner.idToken, [set("users", sales.uid, { permissions: { managePurchase: true } }, true)])).status, 200);
  assert.equal((await commit(sales.idToken, [set("purchaseInvoices", "rpi1", { shopId: "shop1", invoiceNo: "PI-R1", status: "confirmed", createdBy: sales.uid })])).status, 200);
  assert.equal((await commit(sales.idToken, [{ op: "update", collection: "purchaseInvoices", id: "rpi1", data: { note: "edit" } }])).status, 200);
  assert.equal((await commit(sales.idToken, [{ op: "update", collection: "purchaseInvoices", id: "rpi1", data: { status: "cancelled" } }])).status, 403);
});

test("rules: vendors, returns, stock adjustments, audit log and master lists follow the staff permissions", async () => {
  const none = { managePurchase: false, manageVendors: false, manageReturns: false, stockAdjust: false, manageProducts: false };
  const perms = (p) => commit(owner.idToken, [set("users", sales.uid, { permissions: { ...none, ...p } }, true)]);
  const upd = (collection, id, data) => ({ op: "update", collection, id, data });

  assert.equal((await perms({})).status, 200);
  assert.equal((await commit(sales.idToken, [set("vendors", "rv1", { shopId: "shop1", vendorName: "No Perm" })])).status, 403, "vendor create needs a permission");
  assert.equal((await perms({ managePurchase: true })).status, 200);
  assert.equal((await commit(sales.idToken, [set("vendors", "rv1", { shopId: "shop1", vendorName: "From Purchase" })])).status, 200);
  assert.equal((await commit(sales.idToken, [upd("vendors", "rv1", { phone: "1" })])).status, 403, "vendor edit needs manageVendors");
  assert.equal((await perms({ manageVendors: true })).status, 200);
  assert.equal((await commit(sales.idToken, [upd("vendors", "rv1", { phone: "1" })])).status, 200);
  assert.equal((await commit(sales.idToken, [{ op: "delete", collection: "vendors", id: "rv1" }])).status, 403, "only the owner deletes vendors");

  const sr = { shopId: "shop1", returnNo: "SR-0001", invoiceId: "rsi2", total: 10, status: "confirmed", createdBy: sales.uid };
  assert.equal((await commit(sales.idToken, [set("salesReturns", "rsr1", sr)])).status, 403, "returns need manageReturns");
  assert.equal((await perms({ manageReturns: true })).status, 200);
  assert.equal((await commit(sales.idToken, [set("salesReturns", "rsr1", { ...sr, createdBy: owner.uid })])).status, 403, "createdBy must be the caller");
  assert.equal((await commit(sales.idToken, [set("salesReturns", "rsr1", sr)])).status, 200);
  assert.equal((await commit(sales.idToken, [set("purchaseReturns", "rpr1", { ...sr, returnNo: "PR-0001" })])).status, 200);
  assert.equal((await commit(owner.idToken, [set("salesReturns", "rsr2", { ...sr, returnNo: "SR-0002", createdBy: owner.uid })])).status, 200);
  assert.equal((await commit(sales.idToken, [upd("salesReturns", "rsr2", { status: "cancelled" })])).status, 403, "staff cancel only their own returns");
  assert.equal((await commit(sales.idToken, [upd("salesReturns", "rsr1", { status: "cancelled" })])).status, 200);
  assert.equal((await commit(sales.idToken, [{ op: "delete", collection: "salesReturns", id: "rsr1" }])).status, 403);
  assert.equal((await commit(owner.idToken, [{ op: "delete", collection: "salesReturns", id: "rsr1" }])).status, 200);

  const sa = { shopId: "shop1", adjustNo: "SA-0001", status: "confirmed", items: [], createdBy: sales.uid };
  assert.equal((await commit(sales.idToken, [set("stockAdjustments", "rsa1", sa)])).status, 403, "adjustments need stockAdjust");
  assert.equal((await perms({ stockAdjust: true })).status, 200);
  assert.equal((await commit(sales.idToken, [set("stockAdjustments", "rsa1", sa)])).status, 200);
  assert.equal((await commit(sales.idToken, [{ op: "update", collection: "shops", id: "shop1", data: { lastSASerial: 1 } }])).status, 200);

  const log = { shopId: "shop1", action: "cancel", collection: "salesReturns", byUid: sales.uid };
  assert.equal((await commit(sales.idToken, [set("auditLogs", "ra1", { ...log, byUid: owner.uid })])).status, 403, "cannot log as someone else");
  assert.equal((await commit(sales.idToken, [set("auditLogs", "ra1", log)])).status, 200);
  assert.equal((await commit(sales.idToken, [upd("auditLogs", "ra1", { note: "x" })])).status, 403);
  assert.equal((await commit(owner.idToken, [{ op: "delete", collection: "auditLogs", id: "ra1" }])).status, 403, "audit entries are permanent");
  assert.equal((await api("/v1/db/get", { collection: "auditLogs", id: "ra1" }, sales.idToken)).status, 403, "only the owner reads the log");
  assert.equal((await api("/v1/db/get", { collection: "auditLogs", id: "ra1" }, owner.idToken)).status, 200);

  const ml = { shopId: "shop1", kind: "units", records: [{ id: 1, symbol: "Pcs" }], updatedAt: "2026-01-01T00:00:00Z" };
  assert.equal((await commit(sales.idToken, [set("masterLists", "shop1_units", ml)])).status, 403, "lists need manageProducts");
  assert.equal((await commit(owner.idToken, [set("masterLists", "shop1_units", ml)])).status, 200);
  assert.equal((await perms({ manageProducts: true })).status, 200);
  assert.equal((await commit(sales.idToken, [upd("masterLists", "shop1_units", { updatedAt: "2026-01-02T00:00:00Z" })])).status, 200);
});

test("rules: a salesman bills the delivered goods of their own order only", async () => {
  assert.equal((await commit(owner.idToken, [set("users", sales.uid, { permissions: { managePurchase: false, setStatus: false, markDelivery: false } }, true)])).status, 200);
  assert.equal((await commit(sales.idToken, [set("orders", "ro-own", { shopId: "shop1", createdBy: sales.uid, items: [] })])).status, 200);
  assert.equal((await commit(owner.idToken, [set("orders", "ro-other", { shopId: "shop1", createdBy: owner.uid, items: [] })])).status, 200);
  const pi = { shopId: "shop1", invoiceNo: "PI-0900", status: "confirmed", source: "salesmanOrder", createdBy: sales.uid };
  assert.equal((await commit(sales.idToken, [set("purchaseInvoices", "rpo1", { ...pi, sourceOrderId: "ro-other" })])).status, 403, "someone else's order");
  assert.equal((await commit(sales.idToken, [set("purchaseInvoices", "rpo1", { ...pi, sourceOrderId: "missing" })])).status, 403, "unknown order");
  assert.equal((await commit(sales.idToken, [set("purchaseInvoices", "rpo1", { ...pi, sourceOrderId: "ro-own" })])).status, 200);
});
