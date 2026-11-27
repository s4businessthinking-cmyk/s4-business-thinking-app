// Device-level WhatsApp share preferences (this PC / browser — not synced to shop).
const KEY = "s4-whatsapp-share-v1";

const DEFAULTS = {
  // Windows desktop: after opening WhatsApp Desktop, try Ctrl+V so the PDF attaches without a manual paste.
  whatsappAutoPaste: false,
  // Default tick on "WhatsApp after saving" in receipt / payment voucher windows (like print checkbox memory).
  whatsappOnSaveVoucher: false,
};

function merge(raw = {}) {
  return {
    ...DEFAULTS,
    ...raw,
    whatsappAutoPaste: raw.whatsappAutoPaste === true,
    whatsappOnSaveVoucher: raw.whatsappOnSaveVoucher === true,
  };
}

export function loadWhatsappShareSettings() {
  try {
    return merge(JSON.parse(localStorage.getItem(KEY) || "null") || {});
  } catch {
    return merge();
  }
}

export function saveWhatsappShareSettings(patch = {}) {
  const next = merge({ ...loadWhatsappShareSettings(), ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* quota */ }
  return next;
}

export function whatsappAutoPasteEnabled() {
  return loadWhatsappShareSettings().whatsappAutoPaste;
}