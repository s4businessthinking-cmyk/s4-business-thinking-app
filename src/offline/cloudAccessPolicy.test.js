import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCloudAccessPolicy,
  setCloudAccessCache,
  isCloudAccessAllowedSync,
} from "./cloudAccessPolicy.js";

function withLocalStorage(run) {
  const store = new Map();
  const prev = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    run(store);
  } finally {
    globalThis.localStorage = prev;
  }
}

test("trial active enables cloud demo", () => {
  withLocalStorage(() => {
    setCloudAccessCache(false);
    applyCloudAccessPolicy({
      license: { status: "NOT_FOUND", payload: null },
      trialStatus: "TRIAL_ACTIVE",
      trial: { status: "TRIAL_ACTIVE" },
    });
    assert.equal(isCloudAccessAllowedSync(), true);
  });
});

test("offline license disables cloud after trial", () => {
  withLocalStorage(() => {
    setCloudAccessCache(true);
    applyCloudAccessPolicy({
      license: {
        status: "ACTIVE",
        payload: { features: ["offline-login", "offline-sync"] },
      },
      trialStatus: "TRIAL_BYPASSED_BY_LICENSE",
    });
    assert.equal(isCloudAccessAllowedSync(), false);
  });
});

test("cloud license enables cloud", () => {
  withLocalStorage(() => {
    setCloudAccessCache(false);
    applyCloudAccessPolicy({
      license: {
        status: "ACTIVE",
        payload: { features: ["offline-login", "firebase-sync"] },
      },
      trialStatus: "TRIAL_BYPASSED_BY_LICENSE",
    });
    assert.equal(isCloudAccessAllowedSync(), true);
  });
});

test("trial expired with no license disables cloud", () => {
  withLocalStorage(() => {
    setCloudAccessCache(true);
    applyCloudAccessPolicy({
      license: { status: "NOT_FOUND" },
      trialStatus: "TRIAL_EXPIRED",
    });
    assert.equal(isCloudAccessAllowedSync(), false);
  });
});