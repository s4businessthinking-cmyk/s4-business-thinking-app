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
};

async function api(path, body, token) {
  const res = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, ...json };
}

const commit = (token, writes, preconditions) => api("/v1/db/commit", { writes, preconditions }, token);
const set = (collection, id, data, merge = false) => ({ op: "set", collection, id, data, merge });

let owner;
let sales;
let outsider;

before(async () => {
  app = await startServer(cfg);
  base = `http://127.0.0.1:${app.port}`;

  owner = await api("/v1/auth/signup", { email: "Owner@Shop.com", password: "secret1" });
  sales = await api("/v1/auth/signup", { email: "sales@shop.com", password: "secret2" });
  outsider = await api("/v1/auth/signup", { email: "x@other.com", password: "secret3" });

  assert.equal((await commit(owner.idToken, [
    set("users", owner.uid, { shopId: "shop1", role: "owner", personName: "Owner" }),
    set("shops", "shop1", { ownerUid: owner.uid, companyName: "S4 Parts" }),
  ])).status, 200);
  assert.equal((await commit(sales.idToken, [set("users", sales.uid, { shopId: "shop1", role: "salesman" })])).status, 200);
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

  const dup = await api("/v1/auth/signup", { email: "owner@shop.com", password: "secret9" });
  assert.equal(dup.status, 409);

  const noToken = await commit(undefined, [set("products", "p0", { shopId: "shop1", name: "x" })]);
  assert.equal(noToken.status, 401);
});

test("products: shop members write and read; other shop cannot", async () => {
  assert.equal((await commit(owner.idToken, [set("products", "p1", { shopId: "shop1", name: "Brake Pad", code: "BP1" })])).status, 200);
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

  await commit(sales.idToken, [set("vendors", "v1", { shopId: "shop1", vendorName: "Al Futtaim" })]);
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
