// HTML document -> PDF in the page itself, for the Android app and the browser (the Windows app prints the PDF in
// Electron instead, see electron/main.cjs). The print HTML is laid out in a hidden frame at A4 width, drawn with
// html2canvas and cut into A4 pages with jsPDF, so the PDF looks like the printed page (as an image of it).
const A4_PX = 794; // 210 mm at 96 dpi

const settle = (win) => new Promise((resolve) => (win.requestAnimationFrame ? win.requestAnimationFrame(() => setTimeout(resolve, 120)) : setTimeout(resolve, 120)));

export async function htmlToPdfBlob(html) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-12000px;top:0;width:${A4_PX}px;height:1123px;border:0;background:#fff`;
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    await Promise.all([...doc.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
    try { await doc.fonts?.ready; } catch { /* fonts API missing */ }
    await settle(frame.contentWindow);
    const body = doc.body;
    const width = Math.max(A4_PX, body.scrollWidth);
    frame.style.width = `${width}px`;
    frame.style.height = `${Math.max(1123, body.scrollHeight)}px`;
    await settle(frame.contentWindow);
    const canvas = await html2canvas(body, { scale: 2, backgroundColor: "#ffffff", width, windowWidth: width, useCORS: true, logging: false });
    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const slicePx = Math.floor((canvas.width * pageH) / pageW);
    for (let y = 0, page = 0; y < canvas.height; y += slicePx, page += 1) {
      const part = document.createElement("canvas");
      part.width = canvas.width;
      part.height = Math.min(slicePx, canvas.height - y);
      const ctx = part.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, part.width, part.height);
      ctx.drawImage(canvas, 0, -y);
      if (page) pdf.addPage();
      pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageW, (part.height * pageW) / canvas.width);
    }
    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}
