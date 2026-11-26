/** BW08 — photo / PDF proof on a warranty claim (stored on the claim as attachments[]). */

export const WARRANTY_ATTACH_MAX = 6;

export const WARRANTY_ATTACH_KINDS = [
  { key: "battery", bn: "ব্যাটারি / ইউনিট ছবি", en: "Battery / unit photo" },
  { key: "serial", bn: "সিরিয়াল / লেবেল", en: "Serial / label" },
  { key: "invoice", bn: "বিলের কপি", en: "Invoice copy" },
  { key: "company", bn: "কোম্পানি ফর্ম", en: "Company form" },
  { key: "other", bn: "অন্যান্য", en: "Other" },
];

export function attachKindLabel(kind, bn = false) {
  const row = WARRANTY_ATTACH_KINDS.find((k) => k.key === kind) || WARRANTY_ATTACH_KINDS[WARRANTY_ATTACH_KINDS.length - 1];
  return row[bn ? "bn" : "en"];
}

export function claimAttachments(claim) {
  return Array.isArray(claim?.attachments) ? claim.attachments.filter(Boolean) : [];
}

export function canAddAttachment(claim) {
  if (!claim || claim.isDeleted || claim.deleted || claim.status === "cancelled") return false;
  return claimAttachments(claim).length < WARRANTY_ATTACH_MAX;
}

export function buildAttachment({ kind = "other", label = "", file, fileName = "", fileType = "", user = null } = {}) {
  if (!file) return null;
  return {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: WARRANTY_ATTACH_KINDS.some((k) => k.key === kind) ? kind : "other",
    label: String(label || "").trim(),
    file,
    fileName: String(fileName || "").trim(),
    fileType: String(fileType || "").trim(),
    createdAt: new Date().toISOString(),
    createdBy: user?.uid || "",
  };
}

/** { error: "" | "MAX" | "EMPTY", list } */
export function withAttachmentAdded(attachments, att) {
  const list = claimAttachments({ attachments });
  if (!att?.file) return { error: "EMPTY", list };
  if (list.length >= WARRANTY_ATTACH_MAX) return { error: "MAX", list };
  return { error: "", list: [...list, att] };
}

export function withAttachmentRemoved(attachments, id) {
  return claimAttachments({ attachments }).filter((a) => a.id !== id);
}
