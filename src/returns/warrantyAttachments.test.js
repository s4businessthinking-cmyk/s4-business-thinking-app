import assert from "node:assert/strict";
import test from "node:test";
import {
  WARRANTY_ATTACH_MAX, attachKindLabel, buildAttachment, canAddAttachment,
  claimAttachments, withAttachmentAdded, withAttachmentRemoved,
} from "./warrantyAttachments.js";

test("attach kinds and empty claim", () => {
  assert.equal(attachKindLabel("battery", false), "Battery / unit photo");
  assert.equal(claimAttachments({}).length, 0);
  assert.equal(canAddAttachment({ status: "received" }), true);
  assert.equal(canAddAttachment({ status: "cancelled" }), false);
});

test("build + add + remove attachments up to max", () => {
  const att = buildAttachment({ kind: "serial", file: "data:image/jpeg;base64,xx", fileName: "a.jpg", fileType: "image/jpeg" });
  assert.ok(att.id);
  assert.equal(att.kind, "serial");
  let list = [];
  const add1 = withAttachmentAdded(list, att);
  assert.equal(add1.error, "");
  list = add1.list;
  assert.equal(list.length, 1);
  assert.equal(withAttachmentAdded(list, null).error, "EMPTY");
  for (let i = 1; i < WARRANTY_ATTACH_MAX; i += 1) {
    const next = withAttachmentAdded(list, buildAttachment({ kind: "other", file: `data:x${i}` }));
    assert.equal(next.error, "");
    list = next.list;
  }
  assert.equal(list.length, WARRANTY_ATTACH_MAX);
  assert.equal(canAddAttachment({ status: "sent", attachments: list }), false);
  assert.equal(withAttachmentAdded(list, buildAttachment({ kind: "other", file: "data:more" })).error, "MAX");
  const trimmed = withAttachmentRemoved(list, list[0].id);
  assert.equal(trimmed.length, WARRANTY_ATTACH_MAX - 1);
});
