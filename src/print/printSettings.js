import { registerPlugin } from "@capacitor/core";

// Device-level print settings (like the old desktop ERP: each PC/printer keeps its own).
const KEY = "s4-print-settings-v1";

// Native bridge in the Android app (android/.../S4PrintPlugin.java).
const S4Print = registerPlugin("S4Print");
const isNativeApp = () => typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();

export const PAPER_SIZES = [
  { key: "A4", label: "A4 (210 × 297 mm)", css: "A4", heightMm: 297 },
  { key: "A5", label: "A5 (148 × 210 mm)", css: "A5", heightMm: 210 },
  { key: "letter", label: "Letter 8.5 × 11", css: "8.5in 11in", heightMm: 279.4 },
  { key: "8.5x12", label: "8.5 × 12", css: "8.5in 12in", heightMm: 304.8 },
  { key: "8x6", label: "8 × 6", css: "8in 6in", heightMm: 152.4 },
  { key: "80mm", label: "Thermal 80 mm", css: "80mm auto" },
  { key: "58mm", label: "Thermal 58 mm", css: "58mm auto" },
];

const DOC_DEFAULTS = {
  preprinted: false,
  copies: 1,
  paper: "A4",
  language: "app",
  hideVatDiscCols: false,
  printDiscount: true,
  printRoundOff: true,
  // Stretch the bill to the full page (totals and signatures at the bottom) even with one or two items.
  fullPage: true,
};

export const DEFAULT_PRINT_SETTINGS = {
  defaultBillType: "tax",
  showPreview: true,
  printVatSummary: false,
  printSalesman: true,
  // Off until the user turns it on in Print Settings (must stay after close).
  printCustomerBalance: false,
  printCreditPeriod: false,
  printUserName: true,
  printNarration: true,
  printTime: false,
  billPrinter: "",
  barcodePrinter: "",
  chequePrinter: "",
  retail: { ...DOC_DEFAULTS },
  tax: { ...DOC_DEFAULTS },
};

function mergePrintSettings(raw = {}) {
  return {
    ...DEFAULT_PRINT_SETTINGS,
    ...raw,
    retail: { ...DOC_DEFAULTS, ...(raw.retail || {}) },
    tax: { ...DOC_DEFAULTS, ...(raw.tax || {}) },
  };
}

let memorySettings = null;
let hydratePromise = null;

export function loadPrintSettings() {
  if (memorySettings) return mergePrintSettings(memorySettings);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") || {};
    return mergePrintSettings(raw);
  } catch {
    return mergePrintSettings();
  }
}

export function savePrintSettings(settings) {
  memorySettings = settings;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  // Desktop: also write to disk so printer/due options survive even if the UI origin changes.
  try {
    const p = window.S4Desktop?.printing?.saveSettings?.(settings);
    if (p && typeof p.then === "function") p.catch((err) => console.warn("[S4 Print] disk settings save failed", err));
  } catch {}
}

/** Pull disk copy over localStorage once on desktop (printers/due must survive app close). */
export async function hydratePrintSettingsFromDisk() {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const api = typeof window !== "undefined" ? window.S4Desktop?.printing?.loadSettings : null;
    if (typeof api !== "function") {
      memorySettings = loadPrintSettings();
      return memorySettings;
    }
    try {
      const disk = await api();
      const local = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "null") || {}; } catch { return {}; } })();
      // Disk wins for printer device names; otherwise keep whichever side actually set a field.
      const merged = mergePrintSettings({
        ...disk,
        ...local,
        billPrinter: local.billPrinter || disk?.billPrinter || "",
        barcodePrinter: local.barcodePrinter || disk?.barcodePrinter || "",
        chequePrinter: local.chequePrinter || disk?.chequePrinter || "",
      });
      memorySettings = merged;
      try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch {}
      return merged;
    } catch {
      memorySettings = loadPrintSettings();
      return memorySettings;
    }
  })();
  return hydratePromise;
}

export function docSettingsFor(settings, invoice) {
  return invoice?.invoiceType === "tax" ? settings.tax : settings.retail;
}

// Height of a page-size paper in mm; null for roll (thermal) paper.
export function paperHeightMm(key) {
  return (PAPER_SIZES.find((p) => p.key === key) || PAPER_SIZES[0]).heightMm || null;
}

export function paperCss(key) {
  return (PAPER_SIZES.find((p) => p.key === key) || PAPER_SIZES[0]).css;
}

const desktopPrinting = () => (typeof window !== "undefined" ? window.S4Desktop?.printing : null) || null;

export const canPickPrinter = () => !!desktopPrinting();

export async function listPrinters() {
  const api = desktopPrinting();
  if (!api) return [];
  try { return await api.listPrinters(); } catch { return []; }
}

// Prints an HTML document. On the desktop app with a chosen printer and preview off it goes
// straight to that printer; with preview it opens a window (bill + print dialog); otherwise
// it prints from a hidden frame.
export async function printHtmlDocument(html, { preview = true, lang = "en", printer = "", pageSizeMm = null } = {}) {
  if (isNativeApp()) {
    try {
      const name = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "S4 Document").trim();
      await S4Print.printHtml({ html, name });
      return;
    } catch (error) {
      console.warn("[S4 Print] android print failed", error);
    }
  }
  const api = desktopPrinting();
  if (api && printer && !preview) {
    try {
      const result = await api.printHtml(html, { deviceName: printer, ...(pageSizeMm ? { pageSizeMm } : {}) });
      if (result?.ok) return;
      console.warn("[S4 Print] direct print failed", result?.error);
    } catch (error) {
      console.warn("[S4 Print] direct print failed", error);
    }
  }
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  if (preview) {
    const w = window.open(url, "_blank", "width=980,height=780");
    if (!w) {
      URL.revokeObjectURL(url);
      alert(lang === "bn" ? "Pop-up block করা আছে। Browser এ allow করুন।" : "Popup blocked. Please allow popups.");
      return;
    }
    w.addEventListener("load", () => {
      try { w.print(); } finally { URL.revokeObjectURL(url); }
    });
    return;
  }
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.src = url;
  frame.onload = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch {}
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000);
  };
  document.body.appendChild(frame);
}

// Any document (report, ledger, voucher…) printed per the device print settings.
// kind "barcode" uses the barcode printer; everything else uses the bill printer.
export function printWithSettings(html, { lang = "en", kind = "bill" } = {}) {
  const settings = loadPrintSettings();
  const printer = kind === "barcode" ? settings.barcodePrinter : settings.billPrinter;
  const preview = kind === "barcode" ? !(printer && canPickPrinter()) : settings.showPreview;
  return printHtmlDocument(html, { preview, lang, printer });
}
