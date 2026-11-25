import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { eInvoiceRecord, eInvoiceState } from "./uaeEInvoice.js";
import { aspState, buildAspRequest, connectionDigest, isAspConnected, normalizeAspConfig, readAspReply, submissionRecord, submitEInvoiceXml, testAspConnection, validateAspConfig } from "./uaeEInvoiceAsp.js";

const base = { provider: "generic", displayName: "Demo ASP LLC", apiBaseUrl: "https://api.asp.example/", submitPath: "/v1/invoices", testPath: "/v1/ping", authType: "bearer", apiKey: "tok-123" };
// a recorded transport: answers with the given reply (or throws it) and keeps every request it got
const transport = (reply) => {
  const calls = [];
  const fn = async (req) => { calls.push(req); if (reply instanceof Error) throw reply; return reply; };
  fn.calls = calls;
  return fn;
};
const connect = async (cfg = base) => ({ ...cfg, ...(await testAspConnection({ config: cfg, transport: transport({ status: 200, text: "{}" }) })).patch });

test("config: required fields per type, https only, paths, the three login types", () => {
  assert.deepEqual(validateAspConfig({}), ["displayName", "apiBaseUrl", "apiKey"]);
  assert.deepEqual(validateAspConfig(base), []);
  assert.deepEqual(validateAspConfig({ ...base, apiBaseUrl: "http://api.asp.example" }), ["apiHttps"]);
  assert.deepEqual(validateAspConfig({ ...base, apiBaseUrl: "http://localhost:8080" }), [], "plain http only to this computer");
  assert.deepEqual(validateAspConfig({ ...base, apiBaseUrl: "https://u:p@api.asp.example" }), ["apiUserinfo"]);
  assert.deepEqual(validateAspConfig({ ...base, submitPath: "v1/invoices" }), ["paths"]);
  assert.deepEqual(validateAspConfig({ ...base, authType: "basic", apiKey: "" }), ["basic"]);
  assert.deepEqual(validateAspConfig({ ...base, authType: "basic", clientId: "id", clientSecret: "sec" }), []);
  assert.deepEqual(validateAspConfig({ ...base, authType: "apiKey", apiKeyHeader: "X Key" }), ["apiKeyHeader"]);
  // portal only: a name is enough, the portal link must be a real https link
  assert.deepEqual(validateAspConfig({ provider: "portal", displayName: "Demo ASP" }), []);
  assert.deepEqual(validateAspConfig({ provider: "portal", displayName: "Demo ASP", portalUrl: "asp.example" }), ["portalUrl"]);
  assert.equal(normalizeAspConfig({ provider: "nope" }).provider, "generic");
  assert.equal(normalizeAspConfig({ provider: "custom" }).authType, "apiKey");
});

test("state: none -> portal / invalid / untested -> connected only after a passing test of the saved details", async () => {
  assert.equal(aspState(null), "none");
  assert.equal(aspState({ provider: "portal", displayName: "Demo ASP", portalUrl: "https://portal.asp.example" }), "portal");
  assert.equal(aspState({ ...base, apiKey: "" }), "invalid");
  assert.equal(aspState(base), "untested");
  const ok = await connect();
  assert.equal(aspState(ok), "connected");
  assert.ok(isAspConnected(ok));
  // a changed key or address needs a new test; switching off stops sending
  assert.equal(aspState({ ...ok, apiKey: "tok-999" }), "untested");
  assert.equal(aspState({ ...ok, apiBaseUrl: "https://other.asp.example" }), "untested");
  assert.equal(aspState({ ...ok, enabled: false }), "off");
  assert.equal(aspState({ ...ok, notes: "changed notes only" }), "connected");
  assert.equal(ok.testedDigest, connectionDigest(normalizeAspConfig(base)));
});

test("requests: url join, auth header per type, XML body on submit", () => {
  const sub = buildAspRequest(base, { xml: "<Invoice/>" });
  assert.equal(sub.url, "https://api.asp.example/v1/invoices");
  assert.equal(sub.method, "POST");
  assert.equal(sub.headers.Authorization, "Bearer tok-123");
  assert.equal(sub.headers["Content-Type"], "application/xml; charset=utf-8");
  assert.equal(sub.body, "<Invoice/>");
  assert.deepEqual(buildAspRequest({ ...base, authType: "apiKey", apiKeyHeader: "X-Asp-Key" }).headers["X-Asp-Key"], "tok-123");
  assert.equal(buildAspRequest({ ...base, authType: "basic", clientId: "shop", clientSecret: "s3cr3t" }).headers.Authorization, `Basic ${Buffer.from("shop:s3cr3t").toString("base64")}`);
  const t = buildAspRequest(base, { kind: "test" });
  assert.deepEqual([t.url, t.method, t.body], ["https://api.asp.example/v1/ping", "GET", undefined]);
});

test("test connection: pass on 2xx, fail with the ASP's message on 401, fail on no answer; nothing sent while incomplete", async () => {
  const good = await testAspConnection({ config: base, transport: transport({ status: 204, text: "" }), now: new Date("2026-11-25T08:00:00Z") });
  assert.deepEqual([good.ok, good.patch.testStatus, good.patch.testedAt], [true, "ok", "2026-11-25T08:00:00.000Z"]);
  const denied = await testAspConnection({ config: base, transport: transport({ status: 401, text: JSON.stringify({ error: { message: "invalid token" } }) }) });
  assert.deepEqual([denied.ok, denied.httpStatus, denied.message, denied.patch.testStatus], [false, 401, "invalid token", "failed"]);
  assert.equal(aspState({ ...base, ...denied.patch }), "failed");
  const down = await testAspConnection({ config: base, transport: transport(new Error("getaddrinfo ENOTFOUND api.asp.example")) });
  assert.deepEqual([down.ok, down.network, down.httpStatus, down.patch.lastError], [false, true, 0, "getaddrinfo ENOTFOUND api.asp.example"]);
  const t = transport({ status: 200, text: "" });
  const incomplete = await testAspConnection({ config: { ...base, apiKey: "" }, transport: t });
  assert.deepEqual([incomplete.ok, incomplete.patch, t.calls.length], [false, null, 0]);
});

test("submit: accepted / submitted only from a 2xx reply; rejected, server error and no answer are not sent", async () => {
  const cfg = await connect();
  const xml = "<Invoice><cbc:ID>SI-1</cbc:ID></Invoice>";
  const acc = await submitEInvoiceXml({ config: cfg, xml, transport: transport({ status: 200, text: JSON.stringify({ submissionId: "A-77", status: "Accepted" }) }) });
  assert.deepEqual([acc.ok, acc.outcome, acc.aspRef, acc.httpStatus], [true, "accepted", "A-77", 200]);
  // a 2xx with no status the app can read: submitted, nothing more is claimed
  const plain = await submitEInvoiceXml({ config: cfg, xml, transport: transport({ status: 202, text: "queued for processing" }) });
  assert.deepEqual([plain.ok, plain.outcome, plain.raw], [true, "submitted", "queued for processing"]);
  // XML replies are read too
  const xmlReply = await submitEInvoiceXml({ config: cfg, xml, transport: transport({ status: 201, text: "<Reply><ns:reference>R-9</ns:reference><Status>received</Status></Reply>" }) });
  assert.deepEqual([xmlReply.outcome, xmlReply.aspRef], ["submitted", "R-9"]);
  const rej = await submitEInvoiceXml({ config: cfg, xml, transport: transport({ status: 200, text: JSON.stringify({ status: "REJECTED", errors: [{ code: "BR-AE-01", message: "Buyer TRN invalid" }] }) }) });
  assert.deepEqual([rej.ok, rej.outcome, rej.message], [false, "rejected", "Buyer TRN invalid"]);
  const err = await submitEInvoiceXml({ config: cfg, xml, transport: transport({ status: 500, text: "" }) });
  assert.deepEqual([err.ok, err.outcome, err.message], [false, "failed", "HTTP 500"]);
  const net = await submitEInvoiceXml({ config: cfg, xml, transport: transport(new Error("Failed to fetch")) });
  assert.deepEqual([net.ok, net.network, net.message], [false, true, "Failed to fetch"]);
  // not connected (never tested, or changed since): no request at all
  for (const c of [base, { ...cfg, apiKey: "changed" }, null]) {
    const t = transport({ status: 200, text: "" });
    const r = await submitEInvoiceXml({ config: c, xml, transport: t });
    assert.deepEqual([r.ok, r.notConnected, t.calls.length], [false, true, 0]);
  }
  assert.equal(readAspReply({ status: 200, text: JSON.stringify({ status: "cleared" }) }).outcome, "accepted", "never shown as cleared - accepted at most");
});

test("the document record: submitted keeps the reference; a failure keeps Ready / Queued with the ASP's error", () => {
  const state = { digest: "abc123", status: "queued" };
  const saved = { status: "queued", digest: "abc123", validatedAt: "2026-11-20T10:00:00.000Z", queuedAt: "2026-11-20T10:00:00.000Z" };
  const now = new Date("2026-11-25T09:00:00Z");
  const ok = submissionRecord(saved, state, { ok: true, outcome: "submitted", httpStatus: 202, aspRef: "A-1", aspStatus: "" }, { aspName: "Demo ASP", by: "Owner", uid: "u1", now });
  assert.deepEqual([ok.status, ok.aspRef, ok.submittedAt, ok.submittedBy, ok.digest, ok.queuedAt], ["submitted", "A-1", "2026-11-25T09:00:00.000Z", "Owner", "abc123", saved.queuedAt]);
  assert.equal(submissionRecord(saved, state, { ok: true, outcome: "accepted", httpStatus: 200 }).status, "accepted");
  const bad = submissionRecord(saved, state, { ok: false, outcome: "rejected", httpStatus: 200, message: "Buyer TRN invalid", aspStatus: "REJECTED" }, { now });
  assert.deepEqual([bad.status, bad.lastError, bad.aspOutcome, bad.submittedAt], ["queued", "Buyer TRN invalid", "rejected", undefined]);
  assert.equal(submissionRecord({ status: "ready", digest: "abc123" }, state, { ok: false, outcome: "failed", httpStatus: 0, message: "Failed to fetch" }).status, "ready");
  // no credential ever lands on the document
  assert.ok(!JSON.stringify([ok, bad]).includes("tok-123"));
});

test("a submitted document stays submitted after a bill change (flagged), and cannot be checked or queued again", () => {
  const shop = { companyName: "Shop", trnNumber: "100000000000003", address: "Street 1", city: "Dubai", emirate: "Dubai" };
  const doc = { id: "SI-1", invoiceNo: "SI-1", invoiceType: "tax", invoiceDate: "2026-11-10", status: "paid", currency: "AED", items: [], totalVat: 0, grandTotal: 0,
    eInvoice: { status: "submitted", digest: "old-digest", aspRef: "A-1" } };
  const st = eInvoiceState({ kind: "invoice", doc, original: null, shop, customer: null, today: "2026-11-25" });
  assert.deepEqual([st.status, st.stale], ["submitted", true]);
  assert.equal(eInvoiceRecord(st, { action: "validate" }).error, "sent");
  assert.equal(eInvoiceRecord(st, { action: "queue" }).error, "sent");
});

test("over real HTTP (local server, default fetch transport): test, accepted submit with the XML body and bearer header, 401", async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers["content-type"], body });
      if (req.headers.authorization !== "Bearer tok-123") { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ message: "bad token" })); return; }
      if (req.url === "/v1/ping") { res.writeHead(200); res.end("pong"); return; }
      res.writeHead(201, { "Content-Type": "application/json" }); res.end(JSON.stringify({ id: "SUB-1", status: "accepted" }));
    });
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  try {
    const cfg0 = { ...base, apiBaseUrl: `http://127.0.0.1:${server.address().port}` };
    const t = await testAspConnection({ config: cfg0 });
    assert.deepEqual([t.ok, t.httpStatus], [true, 200]);
    const res = await submitEInvoiceXml({ config: { ...cfg0, ...t.patch }, xml: "<Invoice>SI-1</Invoice>" });
    assert.deepEqual([res.ok, res.outcome, res.aspRef, res.httpStatus], [true, "accepted", "SUB-1", 201]);
    assert.deepEqual(seen[1], { method: "POST", url: "/v1/invoices", auth: "Bearer tok-123", type: "application/xml; charset=utf-8", body: "<Invoice>SI-1</Invoice>" });
    const denied = await testAspConnection({ config: { ...cfg0, apiKey: "wrong" } });
    assert.deepEqual([denied.ok, denied.httpStatus, denied.message], [false, 401, "bad token"]);
  } finally { server.close(); }
});
