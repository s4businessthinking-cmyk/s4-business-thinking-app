import { compressImage } from "../vouchers/chequeDocs.js";

export const MAX_PDF_BYTES = 1.5 * 1024 * 1024;

/** Reads a picked photo (shrunk) or PDF (≤ 1.5 MB) as a data URL; `L(bn, en)` picks the error language. */
export function readDocFile(file, L = (b, e) => e) {
  return new Promise((resolve, reject) => {
    if (String(file.type || "").startsWith("image/")) { compressImage(file, { maxSide: 1500, quality: 0.68 }).then(resolve, reject); return; }
    if (file.type !== "application/pdf") { reject(new Error(L("শুধু ছবি বা PDF দেওয়া যাবে", "Only images or PDF files"))); return; }
    if (file.size > MAX_PDF_BYTES) { reject(new Error(L("PDF ১.৫ MB-এর বেশি — ছোট করে দিন বা ছবি তুলে দিন", "PDF is over 1.5 MB — shrink it or attach a photo instead"))); return; }
    const rd = new FileReader();
    rd.onload = () => resolve(rd.result);
    rd.onerror = () => reject(new Error("read failed"));
    rd.readAsDataURL(file);
  });
}

export const readProfilePhoto = (file) => compressImage(file, { maxSide: 360, quality: 0.7 });

/** Opens a stored document (PDF or image data URL) in a new window. */
export function openDocFile(d) {
  const src = String(d?.file || "");
  if (src.startsWith("data:application/pdf")) {
    const bin = atob(src.split(",")[1] || "");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    window.open(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), "_blank");
    return;
  }
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(src)) return;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.title = d.label || "Document";
  const img = w.document.createElement("img");
  img.src = src;
  img.style.cssText = "max-width:100%;display:block;margin:0 auto";
  w.document.body.style.margin = "0";
  w.document.body.appendChild(img);
}
