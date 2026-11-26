import { useEffect, useRef } from "react";
import { runVoucherFormShortcuts } from "./desktopFormShortcuts.js";

/** Ctrl+S on open forms (master, PO/GRN, returns, stock adjust, PDC, merge editor, …). */
export function useFormSaveShortcut({ active = true, saving = false, disabled = false, onSave }) {
  const ref = useRef(onSave);
  ref.current = onSave;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (String(e.key).toLowerCase() !== "s") return;
      if (saving || disabled) return;
      e.preventDefault();
      ref.current?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, saving, disabled]);
}

/** F7 — list/search (bills, vouchers, party master, global ledger). */
export function useFindShortcut({ active = true, onFind }) {
  const ref = useRef(onFind);
  ref.current = onFind;
  useEffect(() => {
    if (!active || !onFind) return undefined;
    const onKey = (e) => {
      if (e.key !== "F7" || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      ref.current?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, onFind]);
}

/** Ctrl+P — print when the action is available. */
export function usePrintShortcut({ active = true, disabled = false, onPrint }) {
  const ref = useRef(onPrint);
  ref.current = onPrint;
  useEffect(() => {
    if (!active || !onPrint) return undefined;
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (String(e.key).toLowerCase() !== "p") return;
      if (disabled) return;
      e.preventDefault();
      ref.current?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, disabled, onPrint]);
}

/** Receipt/payment against-invoice window: Ctrl+S + F7 find. */
export function useVoucherWindowShortcuts({ active = true, saving = false, readOnly = false, onSave, onFind }) {
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const findRef = useRef(onFind);
  findRef.current = onFind;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => runVoucherFormShortcuts(e, {
      saving,
      readOnly,
      onSave: () => saveRef.current?.(),
      onFind: onFind ? () => findRef.current?.() : undefined,
    });
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, saving, readOnly, onFind]);
}

/** Scan/apply modals: Ctrl+Enter applies to the parent form. */
export function useApplyShortcut({ active = true, disabled = false, onApply }) {
  const ref = useRef(onApply);
  ref.current = onApply;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      const enter = e.key === "Enter";
      if (!enter || !(e.ctrlKey || e.metaKey)) return;
      if (disabled) return;
      e.preventDefault();
      ref.current?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, disabled, onApply]);
}