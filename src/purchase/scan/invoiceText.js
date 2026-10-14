// Text rows of an invoice file, all on the device (no server, no key):
// - PDF with a text layer: read with pdf.js, exact;
// - photo / screenshot, or a PDF page that is only a picture: OCR with Tesseract (English, bundled in public/ocr).
// Both libraries load only when a scan starts.
// -> { rows: [{ text, cells: [{ x, text }] }], source: "pdf" | "ocr", pages, previewUrl }

const ROW_TOL = 3; // points: items this close vertically are one row

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
  .then(([pdfjs, worker]) => { pdfjs.GlobalWorkerOptions.workerSrc = worker.default; return pdfjs; }));

let ocrWorkerPromise = null;
const loadOcr = () => (ocrWorkerPromise ||= Promise.all([
  import("tesseract.js"), import("tesseract.js/dist/worker.min.js?url"), import("tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url"),
]).then(([tess, worker, core]) => tess.createWorker("eng", 1, {
  workerPath: worker.default, corePath: core.default, langPath: `${import.meta.env.BASE_URL || "./"}ocr`, gzip: true,
})).catch((error) => { ocrWorkerPromise = null; throw error; }));

// Small screenshots and phone photos read far better enlarged to ~2400 px wide, in grey with more contrast.
async function prepareImage(image) {
  const src = image instanceof HTMLCanvasElement ? image : await createImageBitmap(image);
  const scale = Math.min(3, Math.max(1, 2400 / (src.width || 1)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(src.width * scale); canvas.height = Math.round(src.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.filter = "grayscale(1) contrast(1.4)";
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function ocrImage(image, onProgress) {
  onProgress?.("ocr");
  const worker = await loadOcr();
  // one uniform block of text keeps a table row on one line; keep the spaces between columns
  await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
  const { data } = await worker.recognize(await prepareImage(image));
  // Tesseract already gives text lines with their words in reading order
  return (data.lines || []).map((line) => {
    const cells = (line.words || []).map((w) => ({ x: w.bbox.x0, text: w.text })).filter((c) => c.text.trim());
    return { text: cells.map((c) => c.text).join(" "), cells };
  }).filter((r) => r.text.trim());
}

async function readPdf(file, onProgress) {
  onProgress?.("pdf");
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
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

export async function readInvoiceFile(file, onProgress) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (isPdf) return readPdf(file, onProgress);
  const previewUrl = URL.createObjectURL(file);
  return { rows: await ocrImage(file, onProgress), source: "ocr", pages: 1, previewUrl };
}

export { groupRows };
