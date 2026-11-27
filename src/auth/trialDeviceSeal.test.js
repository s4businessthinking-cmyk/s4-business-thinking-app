import test from "node:test";
import assert from "node:assert/strict";
import {
  sealHasTrialRecord,
  sealMatchesFingerprint,
} from "./trialDeviceSeal.js";

test("seal matches same device fingerprint only", () => {
  const seal = { deviceFingerprint: "fp-a", trialEndsAt: "2026-01-01T00:00:00.000Z" };
  assert.equal(sealMatchesFingerprint(seal, "fp-a"), true);
  assert.equal(sealMatchesFingerprint(seal, "fp-b"), false);
  assert.equal(sealMatchesFingerprint(null, "fp-a"), false);
});

test("sealHasTrialRecord needs core dates", () => {
  assert.equal(
    sealHasTrialRecord({
      firstInstalledAt: "a",
      trialStartedAt: "b",
      trialEndsAt: "c",
    }),
    true
  );
  assert.equal(sealHasTrialRecord({ trialEndsAt: "c" }), false);
});