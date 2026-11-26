import assert from "node:assert/strict";
import test from "node:test";
import { formatDateDmY, isoDateOnly } from "./dateFieldFormat.js";

test("DateField helpers: ISO stays ISO, display is day/month/year", () => {
  assert.equal(isoDateOnly("2026-11-26"), "2026-11-26");
  assert.equal(isoDateOnly("2026-11-26T10:00:00.000Z"), "2026-11-26");
  assert.equal(formatDateDmY("2026-11-26"), "26/11/2026");
  assert.equal(formatDateDmY("2026-01-05"), "05/01/2026");
  assert.notEqual(formatDateDmY("2026-11-26"), "11/26/2026");
  assert.equal(formatDateDmY(""), "");
});
