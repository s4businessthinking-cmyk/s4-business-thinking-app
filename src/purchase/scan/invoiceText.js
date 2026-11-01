// Text rows of an invoice file, all on the device (no server, no key):
// - PDF with a text layer: read with pdf.js, exact;
// - photo / screenshot, or a PDF page that is only a picture: OCR with Tesseract (English, bundled in public/ocr).
// Both libraries load only when a scan starts.
// -> { rows: [{ text, cells: [{ x, text }] }], source: "pdf" | "ocr", pages, previewUrl }
//
// EXE / APK / offline: worker URLs must be page-absolute, Blob workers are skipped (importScripts
// from a blob fails in Electron and Android WebView), and PDFs with an empty MIME still read.

const ROW_TOL = 3; // points: items this close vertically are one row

function absUrl(href) {
  if (!href) return href;
  try { return new URL(href, document.baseURI).href; } catch { return href; }
}

function groupRows(items) {
  // items: [{ x, y, text }] with y growing downwards
  const sorted = items.filter((i) => i.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= ROW_TOL);
    if (row) row.cells.push(it); else rows.push({ y: it.y, cells: [it] });
  }
  return rows.map((r) => {
    const cells = r.cells.sort((a, b) => a.x - b.x).map((c) => ({ x: c.x, text: c.text.trim() }));
    return { text: cells.map((c) => c.text).join(" ").replace(/\s{2,}/g, " "), cells };
  });
}

let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise ||= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")])
  .then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = absUrl(worker.default);
    return pdfjs;
  }));

async function wasmSimdSupported() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 26, 11]));
  } catch { return false; }
}

async function createOcrWorker(simd) {
  const [tess, worker, core] = await Promise.all([
    import("tesseract.js"),
    import("tesseract.js/dist/worker.min.js?url"),
    simd ? import("tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url") : import("tesseract.js-core/tesseract-core-lstm.wasm.js?url"),
  ]);
  return tess.createWorker("eng", 1, {
    workerPath: absUrl(worker.default),
    corePath: absUrl(core.default),
    langPath: new URL("ocr", document.baseURI).href.replace(/\/$/, ""),
    gzip: true,
    // Blob+importScripts is blocked on file://, many WebViews, and Capacitor https://localhost.
    workerBlobURL: false,
  });
}

let ocrWorkerPromise = null;
const loadOcr = () => (ocrWorkerPromise ||= (async () => {
  const simd = await wasmSimdSupported();
  try {
    return await createOcrWorker(simd);
  } catch (error) {
    if (simd) return createOcrWorker(false);
    throw error;
  }
})().catch((error) => { ocrWorkerPromise = null; throw error; }));

async function bitmapOf(image) {
  if (image instanceof HTMLCanvasElement) return image;
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(image); } catch { /* Android WebView / HEIC-ish files */ }
  }
  const src = image instanceof Blob ? URL.createObjectURL(image) : "";
  if (!src) throw new Error("Could not open the picture");
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(src); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error("Could not open the picture")); };
    img.src = src;
  });
}

// Small screenshots and phone photos read far better enlarged (~3200 px wide, at most ~16 MP to spare memory),
// in grey with more contrast. binarize: black / white against the local background, for phone photos darker at one
// end than the other (one global threshold loses the faint side); it hurts clean screenshots, so only as a retry.
const MAX_PIXELS = 16e6;
async function prepareImage(image, binarize) {
  const src = await bitmapOf(image);
  const w0 = src.width || 1, h0 = src.height || 1;
  const scale = binarize ? Math.max(1, Math.min(6, 3200 / w0, Math.sqrt(MAX_PIXELS / (w0 * h0)))) : Math.min(3, Math.max(1, 2400 / w0));
  const W = Math.round(w0 * scale), H = Math.round(h0 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.filter = binarize ? "grayscale(1)" : "grayscale(1) contrast(1.4)";
  ctx.drawImage(src, 0, 0, W, H);
  if (!binarize) return canvas;
  const bg = document.createElement("canvas");
  bg.width = W; bg.height = H;
  const bctx = bg.getContext("2d", { willReadFrequently: true });
  bctx.filter = `blur(${Math.round(Math.max(W, H) / 120)}px)`;
  bctx.drawImage(canvas, 0, 0);
  const img = ctx.getImageData(0, 0, W, H), mean = bctx.getImageData(0, 0, W, H).data, d = img.data;
  for (let k = 0; k < d.length; k += 4) d[k] = d[k + 1] = d[k + 2] = d[k] < mean[k] * 0.85 ? 0 : 255;
  ctx.putImageData(img, 0, 0);
  bg.width = bg.height = 0;
  return canvas;
}

const readScore = (rows) => rows.reduce((s, r) => s + (/\d\.\d{2}\b/.test(r.text) ? 2 : 0) + (r.text.match(/\b[A-Z]{0,4}\d{5,}/g) || []).length, 0);

async function ocrImage(image, onProgress) {
  onProgress?.("ocr");
  const worker = await loadOcr();
  await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
  const read = async (binarize) => {
    const { data } = await worker.recognize(await prepareImage(image, binarize));
    return (data.lines || []).map((line) => {
      const cells = (line.words || []).map((w) => ({ x: w.bbox.x0, text: w.text })).filter((c) => c.text.trim());
      return { text: cells.map((c) => c.text).join(" "), cells };
    }).filter((r) => r.text.trim());
  };
  const plain = await read(false);
  if (plain.filter((r) => (r.text.match(/\d\.\d{2}\b/g) || []).length >= 2).length >= 4) return plain;
  const bw = await read(true);
  return readScore(plain) > readScore(bw) * 1.5 ? plain : bw;
}

async function openPdf(pdfjs, bytes) {
  const data = bytes.slice(0);
  try {
    return await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  } catch {
    return pdfjs.getDocument({ data: bytes.slice(0), verbosity: 0, disableWorker: true }).promise;
  }
}

async function readPdf(file, onProgress) {
  onProgress?.("pdf");
  const pdfjs = await loadPdfjs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await openPdf(pdfjs, bytes);
  let rows = [], usedOcr = false, previewUrl = "";
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.map((it) => ({ x: it.transform[4], y: viewport.height - it.transform[5], text: it.str }));
    const text = items.map((i) => i.text).join("").trim();
    const needOcr = text.length < 20;
    if (n === 1 || needOcr) {
      const scale = needOcr ? 2.2 : 1.3;
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      if (n === 1) previewUrl = canvas.toDataURL("image/jpeg", 0.8);
      if (needOcr) { usedOcr = true; rows = rows.concat(await ocrImage(canvas, onProgress)); continue; }
    }
    rows = rows.concat(groupRows(items));
  }
  return { rows, source: usedOcr ? "ocr" : "pdf", pages: doc.numPages, previewUrl };
}

async function looksLikePdf(file) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name || "")) return true;
  if (String(file.type || "").startsWith("image/")) return false;
  try {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    return head.length >= 4 && head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  } catch { return false; }
}

export async function readInvoiceFile(file, onProgress) {
  if (await looksLikePdf(file)) return readPdf(file, onProgress);
  const previewUrl = URL.createObjectURL(file);
  return { rows: await ocrImage(file, onProgress), source: "ocr", pages: 1, previewUrl };
}

export function fileFromDataUrl(dataUrl, name = "scan.jpg") {
  const [meta, b64] = String(dataUrl || "").split(",");
  const mime = /data:([^;]+)/.exec(meta || "")?.[1] || "image/jpeg";
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes("png") ? "png" : mime.includes("pdf") ? "pdf" : "jpg";
  return new File([bytes], name.includes(".") ? name : `${name}.${ext}`, { type: mime });
}

export { groupRows };
