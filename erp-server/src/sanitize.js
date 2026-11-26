const SENSITIVE_USER_FIELDS = ["ownerPin"];

export function redactUserDocData(data, viewerUid, docUid) {
  if (!data || typeof data !== "object") return data;
  if (viewerUid && docUid && viewerUid === docUid) return data;
  const out = { ...data };
  for (const key of SENSITIVE_USER_FIELDS) delete out[key];
  return out;
}