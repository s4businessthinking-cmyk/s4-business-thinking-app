import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { sendViaProvider } from "./reminderChannels.js";

const require = createRequire(import.meta.url);
const { requestText } = require("../../electron/requestText.cjs");

test("desktop bridge errors name the service that was called: ASP for e-invoice, SMS / email provider for reminders", () => {
  assert.equal(requestText(undefined).timeout(30), "The ASP did not answer within 30 seconds", "e-invoice calls keep their wording");
  assert.equal(requestText("asp").notHttps, "The ASP address must start with https://");
  assert.equal(requestText(undefined).tooLarge, "The document is too large to send");
  assert.equal(requestText("sms").timeout(30), "The SMS provider did not answer within 30 seconds");
  assert.equal(requestText("email").badUrl, "The email provider address is not a valid link");
  assert.equal(requestText("provider").notHttps, "The provider address must start with https://");
  assert.equal(requestText("sms").tooLarge, "The message is too large to send");
  for (const p of ["sms", "email", "provider"]) {
    const t = requestText(p);
    assert.doesNotMatch([t.badUrl, t.notHttps, t.tooLarge, t.timeout(5), t.failed("")].join(" "), /ASP/);
  }
  assert.equal(requestText("sms").failed("getaddrinfo ENOTFOUND sms.example.ae"), "getaddrinfo ENOTFOUND sms.example.ae", "the real network error is kept");
});

test("reminder provider calls tell the bridge what they are", async () => {
  const seen = [];
  const transport = async (req) => { seen.push(req.purpose); return { status: 202, text: "{}" }; };
  await sendViaProvider("sms", { url: "https://sms.example.ae/send" }, { to: "971501234567", message: "x", transport });
  await sendViaProvider("email", { url: "https://mail.example.ae/send" }, { to: "a@b.ae", message: "x", subject: "s", transport });
  assert.deepEqual(seen, ["sms", "email"]);
});
