/** Avoid dropdown mousedown stealing focus while the user drags to select/copy text. */

function inputHasSelection(input) {
  if (!input) return false;
  if (input.selectionStart != null && input.selectionEnd != null) {
    return input.selectionStart !== input.selectionEnd;
  }
  return false;
}

export function isDocumentTextSelecting() {
  try {
    const sel = window.getSelection?.();
    return !!(sel && sel.type === "Range" && String(sel).length > 0);
  } catch {
    return false;
  }
}

export function shouldPreserveTextSelection(inputRef) {
  if (isDocumentTextSelecting()) return true;
  const input = inputRef?.current;
  if (inputHasSelection(input)) return true;
  if (input && document.activeElement === input && inputHasSelection(input)) return true;
  return false;
}

/** Call from typeahead row mousedown — skips preventDefault/pick while selecting text. */
export function dropdownMouseDown(e, inputRef, onPick) {
  if (shouldPreserveTextSelection(inputRef)) return;
  e.preventDefault();
  onPick?.(e);
}
