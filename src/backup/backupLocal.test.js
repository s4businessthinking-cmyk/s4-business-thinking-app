import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BACKUP_FORMAT, buildLocalBackupPayload, docsFromLocalRecords } from "./backupLocal.js";

describe("docsFromLocalRecords", () => {
  it("keeps this shop's rows and skips other shops", () => {
    const docs = docsFromLocalRecords([
      { document_id: "a", data: { id: "a", shopId: "s1", invoiceNo: "SI-1" } },
      { document_id: "b", data: { id: "b", shopId: "s2", invoiceNo: "SI-2" } },
      { id: "c", shopId: "s1", invoiceNo: "SI-3" },
    ], "s1", "salesInvoices");
    assert.deepEqual(docs.map((d) => d.id), ["a", "c"]);
  });

  it("matches shops by document id or shopId", () => {
    const docs = docsFromLocalRecords([
      { document_id: "s1", data: { shopName: "Mine" } },
      { document_id: "s2", data: { shopId: "s2", shopName: "Other" } },
    ], "s1", "shops");
    assert.equal(docs.length, 1);
    assert.equal(docs[0].id, "s1");
  });
});

describe("buildLocalBackupPayload", () => {
  it("counts only collections that have rows", () => {
    const backup = buildLocalBackupPayload("s1", {
      salesInvoices: [{ id: "a", data: { id: "a" } }],
      vendors: [],
    }, "2026-11-02T00:00:00.000Z");
    assert.equal(backup.format, BACKUP_FORMAT);
    assert.equal(backup.version, 1);
    assert.equal(backup.documentCount, 1);
    assert.deepEqual(Object.keys(backup.collections), ["salesInvoices"]);
  });
});
