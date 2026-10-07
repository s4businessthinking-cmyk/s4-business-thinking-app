import test from "node:test";
import assert from "node:assert/strict";
import { splitNewRecords } from "./importMatch.js";

test("only products missing from the master are imported", () => {
  const products = [
    { id: "1", name: "AC COMPRESSOR", code: "8098 MITSUBISHI", barcode: "111", moreBarcodes: ["M-1", "M-2"] },
    { id: "2", name: "AC COMPRESSOR", code: "55512/508 SAN" },
    { id: "3", name: "AC FILTER", code: "10234", unitPrices: [{ barcode: "BOX-9" }] },
  ];
  const records = [
    { name: "  ac compressor ", code: "8098  MITSUBISHI" },
    { name: "AC COMPRESSOR", code: "55512/508 SAN", barcode: "" },
    { name: "AC COMPRESSOR", code: "NEW-1" },
    { name: "AC FILTER RENAMED", code: "x", barcode: "box-9" },
    { name: "Other", code: "z", moreBarcodes: "q;M-2" },
    { name: "AC COMPRESSOR", code: "NEW-1" },
    { name: "Brand new", code: "", barcode: "555" },
    { name: "Brand new copy", code: "", barcode: "555" },
    { name: "", code: "blank" },
  ];
  const { fresh, existing, repeated } = splitNewRecords(records, products);
  assert.deepEqual(fresh.map((r) => r.name), ["AC COMPRESSOR", "Brand new"]);
  assert.equal(fresh[0].code, "NEW-1");
  assert.equal(existing.length, 4);
  assert.equal(repeated.length, 2);
});
