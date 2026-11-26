// Desktop keyboard shortcuts for ERP-style windows (bills, vouchers).
// Only binds keys that map to existing actions — no settings UI; keys are fixed.

export function billModalOpen() {
  if (typeof document === "undefined") return false;
  return !!document.querySelector("[data-si-modal-open]");
}

/** @param {KeyboardEvent} e @param {object} actions */
export function runDesktopBillShortcuts(e, actions) {
  if (e.isComposing || e.keyCode === 229) return false;
  if (billModalOpen()) return false;

  const mod = e.ctrlKey || e.metaKey;
  const key = String(e.key).toLowerCase();

  if (mod && !e.altKey && key === "s" && e.shiftKey) {
    if (actions.canSaveDraft?.() && actions.onSaveDraft) {
      e.preventDefault();
      actions.onSaveDraft();
      return true;
    }
    return false;
  }
  if (mod && !e.altKey && !e.shiftKey && key === "s") {
    if (actions.canConfirm?.() && actions.onConfirm) {
      e.preventDefault();
      actions.onConfirm();
      return true;
    }
    return false;
  }
  if (mod && !e.altKey && !e.shiftKey && key === "n") {
    if (actions.canNew?.() && actions.onNew) {
      e.preventDefault();
      actions.onNew();
      return true;
    }
    return false;
  }
  if (mod && !e.altKey && !e.shiftKey && key === "p") {
    if (actions.canPrint?.() && actions.onPrint) {
      e.preventDefault();
      actions.onPrint();
      return true;
    }
    return false;
  }
  if (mod && !e.altKey && !e.shiftKey && key === "e") {
    if (actions.canEdit?.() && actions.onEdit) {
      e.preventDefault();
      actions.onEdit();
      return true;
    }
    return false;
  }
  if (e.key === "F7" && !mod && !e.altKey) {
    if (actions.onSearch) {
      e.preventDefault();
      actions.onSearch();
      return true;
    }
    return false;
  }
  if (mod && !e.altKey && e.shiftKey && key === "o") {
    if (actions.canOptions?.() && actions.onOptions) {
      e.preventDefault();
      actions.onOptions();
      return true;
    }
    return false;
  }
  return false;
}

/** Receipt / payment against-invoice window (modal has its own listener). */
export function runVoucherFormShortcuts(e, { saving, readOnly, onSave, onFind }) {
  if (e.isComposing || e.keyCode === 229) return false;
  const mod = e.ctrlKey || e.metaKey;
  const key = String(e.key).toLowerCase();
  if (mod && !e.altKey && !e.shiftKey && key === "s") {
    if (!readOnly && !saving && onSave) {
      e.preventDefault();
      onSave();
      return true;
    }
  }
  if (e.key === "F7" && !mod && onFind) {
    e.preventDefault();
    onFind();
    return true;
  }
  return false;
}

/** Button / placeholder suffix — same style as PI/SI desktop toolbars. */
export function hintSave(saving) { return saving ? "" : " (Ctrl+S)"; }
export function hintPrint() { return " (Ctrl+P)"; }
export function hintFind() { return " (F7)"; }
export function hintApply() { return " (Ctrl+Enter)"; }