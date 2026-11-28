const VERSION = 1;

function storageKey(shopId) {
  return `s4-pi-suspended-v${VERSION}:${String(shopId || "").trim()}`;
}

export function piSuspendHasContent(form, lines, current) {
  if (Array.isArray(lines) && lines.length > 0) return true;
  const f = form || {};
  if (String(f.vendorName || "").trim()) return true;
  if (String(f.vendorId || "").trim()) return true;
  if (String(f.supplierInvoiceNo || "").trim()) return true;
  if (String(current?.name || "").trim()) return true;
  return false;
}

export function loadPiSuspended(shopId) {
  if (!shopId || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(shopId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== VERSION) return null;
    if (!piSuspendHasContent(data.piForm, data.piLines, data.piCurrent)) return null;
    return data;
  } catch {
    return null;
  }
}

export function savePiSuspended(shopId, payload) {
  if (!shopId || typeof localStorage === "undefined") return false;
  const { piForm, piLines, piCurrent, piInvoiceNo, editInvoiceId } = payload || {};
  if (!piSuspendHasContent(piForm, piLines, piCurrent)) {
    clearPiSuspended(shopId);
    return false;
  }
  try {
    localStorage.setItem(
      storageKey(shopId),
      JSON.stringify({
        v: VERSION,
        savedAt: new Date().toISOString(),
        piForm,
        piLines: (piLines || []).map(({ id, ...rest }) => rest),
        piCurrent,
        piInvoiceNo: piInvoiceNo || "",
        editInvoiceId: editInvoiceId || null,
      }),
    );
    return true;
  } catch (error) {
    console.warn("[S4 PI] suspend save failed", error);
    return false;
  }
}

export function clearPiSuspended(shopId) {
  if (!shopId || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(shopId));
  } catch {}
}