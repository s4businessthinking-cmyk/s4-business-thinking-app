import test from "node:test";
import assert from "node:assert/strict";
import { validateLicensePayload } from "./licensePayloadRules.js";

const basePayload = {
  licenseId: "lic-1",
  customerName: "Test User",
  shopName: "Golden Link Auto",
  phone: "0506438545",
  plan: "LIFETIME",
  status: "ACTIVE",
  issuedAt: "2020-01-01T00:00:00.000Z",
  notBefore: "2020-01-01T00:00:00.000Z",
  maxDevices: 1,
  features: ["web"],
  appId: "com.s4businessthinking.app",
  version: 1,
  deviceId: "device-a",
  deviceFingerprint: "fp-a",
};

test("license rejects key without deviceId in payload", () => {
  const payload = { ...basePayload };
  delete payload.deviceId;
  const r = validateLicensePayload(payload, { deviceId: "device-a", deviceFingerprint: "fp-a" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "MISSING_PAYLOAD_FIELDS");
});

test("license rejects empty deviceId string in payload", () => {
  const payload = { ...basePayload, deviceId: "" };
  const r = validateLicensePayload(payload, { deviceId: "device-a", deviceFingerprint: "fp-a" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "MISSING_PAYLOAD_FIELDS");
});

test("license rejects device mismatch", () => {
  const r = validateLicensePayload(basePayload, { deviceId: "other", deviceFingerprint: "fp-a" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "LICENSE_DEVICE_MISMATCH");
});

test("license rejects shop or phone mismatch", () => {
  const r = validateLicensePayload(basePayload, {
    deviceId: "device-a",
    deviceFingerprint: "fp-a",
    shopName: "Wrong Shop",
    phone: "0506438545",
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "LICENSE_SHOP_MISMATCH");
});

test("license accepts when all bindings match", () => {
  const r = validateLicensePayload(basePayload, {
    deviceId: "device-a",
    deviceFingerprint: "fp-a",
    shopName: "Golden Link Auto",
    phone: "0506438545",
  });
  assert.equal(r.ok, true);
});