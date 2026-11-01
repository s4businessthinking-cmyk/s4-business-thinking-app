import { readDocFile } from "./docFiles.js";

const isNative = () => typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
const isPhone = () => {
  if (isNative()) return true;
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
};

function shrinkDataUrl(dataUrl, maxSide = 1500, quality = 0.68) {
  return new Promise((resolve) => {
    if (!dataUrl || !String(dataUrl).startsWith("data:image/")) { resolve(dataUrl || ""); return; }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
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
export async function acquireScanImage({ folder = false } = {}) {
  if (folder) return pickFile({ camera: false });

  const desktop = typeof window !== "undefined" ? window.S4Desktop : null;
  if (desktop && typeof desktop.scan?.acquire !== "function") {
    throw new Error("এই ইনস্টল করা অ্যাপে স্ক্যানার ব্রিজ নেই। নতুন ডেস্কটপ অ্যাপ চালান, অথবা আপাতত ফোল্ডার বাটন দিয়ে ছবি দিন।");
  }
  if (typeof desktop?.scan?.acquire === "function") {
    const r = await desktop.scan.acquire();
    if (r?.ok && r.dataUrl) return shrinkDataUrl(r.dataUrl);
    if (r?.cancelled) return "";
    throw new Error(r?.error || "স্ক্যানার ছবি দেয়নি / Scanner did not return an image");
  }

  return pickFile({ camera: isPhone() });
}
