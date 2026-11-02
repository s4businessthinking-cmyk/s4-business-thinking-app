import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { invMeta, statementRefValue } from "./partyLedgerMeta.js";

describe("invMeta", () => {
  it("reads invoice Ref.Number separately from the delivery note no", () => {
    const meta = invMeta({
      ref: "",
      raw: { deliveryNoteNo: "DN-0004", refNo: "LPO-778", invoiceNo: "SI-0012" },
    }, true);
    assert.equal(meta.dn, "DN-0004");
    assert.equal(meta.refNo, "LPO-778");
  });

  it("uses the delivery note's own number when the row is a delivery note", () => {
    const meta = invMeta({ no: "DN-0009", raw: { docKind: "delivery", invoiceNo: "DN-0009" } }, true);
    assert.equal(meta.dn, "DN-0009");
    assert.equal(meta.refNo, "");
  });
});

describe("statementRefValue", () => {
  it("prints Ref.Number on the statement even when DN is also shown", () => {
    assert.equal(statementRefValue({ refNo: "LPO-778", dn: "DN-0004" }, { includeDn: true }), "LPO-778 · DN-0004");
    assert.equal(statementRefValue({ refNo: "LPO-778", dn: "DN-0004" }), "LPO-778");
  });

  it("falls back to DN when Ref.Number is empty", () => {
    assert.equal(statementRefValue({ refNo: "", dn: "DN-0004" }, { includeDn: true }), "DN-0004");
  });
});
