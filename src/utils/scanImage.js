import { readDocFile } from "./docFiles.js";

const isNative = () => typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
const isPhone = () => {
  if (isNative()) return true;
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
};

export const SCAN_ASPECT = { cheque: 2.4, id: 85.6 / 54 };

export function isPdfScanData(dataUrl) {
  const s = String(dataUrl || "");
  if (s.startsWith("data:application/pdf")) return true;
  const comma = s.indexOf(",");
  if (comma < 0 || !s.startsWith("data:") || !/;base64/i.test(s.slice(0, comma))) return false;
  try {
    return atob(s.slice(comma + 1, comma + 9)).startsWith("%PDF");
  } catch { return false; }
}

function absUrl(href) {
  if (!href) return href;
  try { return new URL(href, document.baseURI).href; } catch { return href; }
}

let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise ||= Promise.all([
  import("pdfjs-dist"),
  import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
]).then(([pdfjs, worker]) => {
  pdfjs.GlobalWorkerOptions.workerSrc = absUrl(worker.default);
  return pdfjs;
}));

async function openPdf(pdfjs, bytes) {
  const data = bytes.slice(0);
  try {
    return await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  } catch {
    return pdfjs.getDocument({ data: bytes.slice(0), verbosity: 0, disableWorker: true }).promise;
  }
}

function dataUrlToBytes(dataUrl) {
  const b64 = String(dataUrl).split(",")[1] || "";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** First page of a scanned PDF, as a JPEG data URL. */
export async function rasterizePdfFirstPage(dataUrl) {
  if (!isPdfScanData(dataUrl)) return "";
  const pdfjs = await loadPdfjs();
  const doc = await openPdf(pdfjs, dataUrlToBytes(dataUrl));
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.2, 1800 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}

function isContentPixel(r, g, b, threshold) {
  const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
  const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
  return min < threshold || max - min > 12;
}

/** Bounding box of the document on a scanner bed (skips the white/gray margin). */
export function scanContentBounds(data, width, height, opts = {}) {
  const threshold = opts.threshold ?? 236;
  const padRatio = opts.padRatio ?? 0.05;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 400));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (isContentPixel(data[i], data[i + 1], data[i + 2], threshold)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: width, h: height };
  const padX = Math.max(step, Math.round((maxX - minX + 1) * padRatio));
  const padY = Math.max(step, Math.round((maxY - minY + 1) * padRatio));
  const x = Math.max(0, minX - padX);
  const y = Math.max(0, minY - padY);
  const w = Math.min(width - x, maxX - minX + 1 + padX * 2);
  const h = Math.min(height - y, maxY - minY + 1 + padY * 2);
  if (w >= width * 0.92 && h >= height * 0.92) return { x: 0, y: 0, w: width, h: height };
  return { x, y, w, h };
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("scan image"));
    img.src = dataUrl;
  });
}

/** Crop scanner margin, then sit the cheque/ID in its box aspect (no stretch). */
export async function fitScanImage(dataUrl, kind = "id") {
  if (!dataUrl) return "";
  let imageUrl = dataUrl;
  if (isPdfScanData(imageUrl)) {
    try { imageUrl = await rasterizePdfFirstPage(imageUrl) || imageUrl; } catch { return dataUrl; }
  }
  if (!String(imageUrl).startsWith("data:image/")) return imageUrl;
  try {
    const img = await loadImage(imageUrl);
    const src = document.createElement("canvas");
    const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
    src.width = Math.max(1, Math.round(img.width * scale));
    src.height = Math.max(1, Math.round(img.height * scale));
    const sctx = src.getContext("2d", { willReadFrequently: true });
    sctx.fillStyle = "#fff";
    sctx.fillRect(0, 0, src.width, src.height);
    sctx.drawImage(img, 0, 0, src.width, src.height);
    const { data } = sctx.getImageData(0, 0, src.width, src.height);
    const b = scanContentBounds(data, src.width, src.height);
    const aspect = SCAN_ASPECT[kind] || SCAN_ASPECT.id;
    const outW = kind === "cheque" ? 1600 : 1200;
    const outH = Math.max(1, Math.round(outW / aspect));
    const fitted = document.createElement("canvas");
    fitted.width = outW;
    fitted.height = outH;
    const fctx = fitted.getContext("2d");
    fctx.fillStyle = "#fff";
    fctx.fillRect(0, 0, outW, outH);
    const fit = Math.min(outW / b.w, outH / b.h);
    const dw = Math.max(1, Math.round(b.w * fit));
    const dh = Math.max(1, Math.round(b.h * fit));
    fctx.drawImage(src, b.x, b.y, b.w, b.h, Math.round((outW - dw) / 2), Math.round((outH - dh) / 2), dw, dh);
    return fitted.toDataURL("image/jpeg", 0.72);
  } catch {
    return String(imageUrl).startsWith("data:image/") ? imageUrl : dataUrl;
  }
}

function pickFile({ camera = false } = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = camera ? "image/*" : "image/*,application/pdf";
    if (camera) input.setAttribute("capture", "environment");
    input.style.display = "none";
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) { resolve(""); return; }
      try { resolve(await readDocFile(file)); } catch (err) { reject(err); }
    };
    document.body.appendChild(input);
    input.click();
  });
}

/** Scan: PC scanner/printer, or phone camera. Folder button is a separate pick. */
export async function acquireScanImage({ folder = false, kind = "id" } = {}) {
  let raw = "";
  if (folder) {
    raw = await pickFile({ camera: false });
  } else {
    const desktop = typeof window !== "undefined" ? window.S4Desktop : null;
    if (desktop && typeof desktop.scan?.acquire !== "function") {
      throw new Error("এই ইনস্টল করা অ্যাপে স্ক্যানার ব্রিজ নেই। নতুন ডেস্কটপ অ্যাপ চালান, অথবা আপাতত ফোল্ডার বাটন দিয়ে ছবি দিন।");
    }
    if (typeof desktop?.scan?.acquire === "function") {
      const r = await desktop.scan.acquire();
      if (r?.ok && r.dataUrl) raw = r.dataUrl;
      else if (r?.cancelled) return "";
      else throw new Error(r?.error || "স্ক্যানার ছবি দেয়নি / Scanner did not return an image");
    } else {
      raw = await pickFile({ camera: isPhone() });
    }
  }
  if (!raw) return "";
  return fitScanImage(raw, kind);
}
