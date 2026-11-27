// WhatsApp a document: the same HTML that prints, as a PDF, with a short message, to the party's number.
// - Windows app: Electron prints the PDF, copies the file to the clipboard and opens the party's chat in WhatsApp
//   Desktop with the message typed in - the user presses Ctrl+V to attach the PDF and Send (S4Desktop.share).
// - Windows app built before this feature (no S4Desktop.share): the PDF is made here and saved, and wa.me opens in
//   the system browser (a link opened inside the app window would never reach WhatsApp).
// - Android app: the PDF is shared with the message through the Android share sheet (pick WhatsApp, then the chat).
// - Browser: the PDF downloads and the chat opens on wa.me with the message; the user attaches the PDF.
// Nothing is sent by itself and nothing reports "sent": WhatsApp only opens ready to send.
import { openLink } from "../utils/openLink.js";
import { whatsappAutoPasteEnabled } from "./whatsappShareSettings.js";

/** WhatsApp number of a customer / vendor / partner record: WhatsApp field first, then mobile, then phone. */
export const partyPhone = (p) => String(p?.whatsappNumber || p?.mobileNumber || p?.mobile || p?.phoneNumber || p?.phone || "").trim();

// Country code for local numbers (0...): the shop's, set once from the shop record (setShareCountryCode).
const CODES = ["971", "966", "968", "974", "965", "973", "880", "977", "92", "91", "94", "20", "44", "1"];
const CURRENCY_CODE = { AED: "971", SAR: "966", OMR: "968", QAR: "974", KWD: "965", BHD: "973", BDT: "880", NPR: "977", PKR: "92", INR: "91", LKR: "94", EGP: "20", GBP: "44", USD: "1" };
let defaultCode = "971";
/** The shop's calling code: its own setting, else the code on the shop mobile (+971 / 00971), else from the currency. */
export function countryCodeOf(shop) {
  const own = String(shop?.countryCode || shop?.phoneCode || "").replace(/\D/g, "");
  if (own) return own;
  const m = String(shop?.mobile || shop?.phone || "").trim();
  if (/^(\+|00)/.test(m)) {
    const d = m.replace(/\D/g, "").replace(/^00/, "");
    const hit = CODES.find((c) => d.startsWith(c));
    if (hit) return hit;
  }
  return CURRENCY_CODE[String(shop?.currency || shop?.cur || "").toUpperCase()] || "971";
}
export const setShareCountryCode = (code) => { const d = String(code || "").replace(/\D/g, ""); if (d) defaultCode = d; };

/**
 * Digits WhatsApp wants (country code, no +). 00 prefix is dropped; a local number starting with 0 gets the
 * shop's country code (UAE 971 unless the shop says otherwise). "" when it cannot be a phone number.
 */
export function normalizeWaPhone(raw, countryCode = defaultCode) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = `${String(countryCode || "").replace(/\D/g, "")}${d.slice(1)}`;
  return d.length >= 8 && d.length <= 15 ? d : "";
}

const fmtDay = (d) => (/^\d{4}-\d{2}-\d{2}/.test(String(d || "")) ? String(d).slice(0, 10).split("-").reverse().join("/") : String(d || ""));
const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Short message that goes with the PDF. doc: { bn, shop, docType, no, date, total, cur, party, extra } */
export function docMessage({ bn = false, shop = "", docType = "", no = "", date = "", total = null, cur = "AED", party = "", extra = "" } = {}) {
  const lines = bn
    ? [party ? `প্রিয় ${party},` : "", [docType, no].filter(Boolean).join(" ") + (date ? `, তারিখ ${fmtDay(date)}` : ""),
      total != null && total !== "" ? `মোট: ${cur} ${money(total)}` : "", extra, "PDF সংযুক্ত করা হলো।", shop ? `- ${shop}` : ""]
    : [party ? `Dear ${party},` : "", [docType, no].filter(Boolean).join(" ") + (date ? ` dated ${fmtDay(date)}` : ""),
      total != null && total !== "" ? `Total: ${cur} ${money(total)}` : "", extra, "Please find the PDF attached.", shop ? `- ${shop}` : ""];
  return lines.filter((l) => String(l).trim()).join("\n");
}

/** File name for the PDF: "SI-0001 Al Noor Garage" -> "SI-0001-Al-Noor-Garage.pdf" */
export function pdfFileName(...parts) {
  const base = parts.map((p) => String(p || "").trim()).filter(Boolean).join(" ").replace(/[^\w\-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return `${base || "document"}.pdf`;
}

export const waTextUrl = (phone, text) => `https://wa.me/${String(phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(String(text || ""))}`;

export const shareMode = () => {
  if (typeof window === "undefined") return "none";
  if (window.S4Desktop?.share?.whatsappPdf) return "desktop";
  if (window.S4Desktop) return "desktop-old";
  if (window.Capacitor?.isNativePlatform?.() === true) return "android";
  return "browser";
};

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] || "");
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/**
 * Call straight from a click (the browser opens the chat tab before the PDF is made, or it would be blocked).
 * -> { mode, path?, clipboard?, desktop?, downloaded?, opened? }
 */
export async function shareDocOnWhatsApp({ html, fileName, phone = "", text = "" }) {
  const mode = shareMode();
  const name = /\.pdf$/i.test(fileName || "") ? fileName : pdfFileName(fileName);
  if (mode === "desktop") {
    const autoPaste = whatsappAutoPasteEnabled();
    const res = await window.S4Desktop.share.whatsappPdf({ html, fileName: name, phone, text, autoPaste });
    return { mode, ...res };
  }
  if (mode === "android") {
    const { htmlToPdfBlob } = await import("./htmlToPdf.js");
    const blob = await htmlToPdfBlob(html);
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const { uri } = await Filesystem.writeFile({ path: `exports/${name}`, data: await blobToBase64(blob), directory: Directory.Cache, recursive: true });
    try {
      await Share.share({ title: name, text, files: [uri], dialogTitle: "WhatsApp" });
    } catch (error) {
      if (/cancel/i.test(String(error?.message || error))) return { mode, opened: false };
      throw error;
    }
    return { mode, opened: true };
  }
  if (mode === "desktop-old") {
    // a window opened by the app stays inside it, so the chat goes to the system browser (wa.me) through openLink
    const { htmlToPdfBlob } = await import("./htmlToPdf.js");
    const blob = await htmlToPdfBlob(html);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    openLink(waTextUrl(phone, text));
    return { mode, downloaded: true, opened: true };
  }
  const tab = window.open("about:blank", "_blank");
  try {
    const { htmlToPdfBlob } = await import("./htmlToPdf.js");
    const blob = await htmlToPdfBlob(html);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (tab) tab.location.href = waTextUrl(phone, text); else openLink(waTextUrl(phone, text));
    return { mode, downloaded: true, opened: !!tab };
  } catch (error) {
    try { tab?.close(); } catch { /* already closed */ }
    throw error;
  }
}

/** Text-only chat (bulk messages). -> { mode, desktop? } */
export async function openWhatsAppText(phone, text) {
  const mode = shareMode();
  if (mode === "desktop" && window.S4Desktop?.share?.whatsappText) return { mode, ...(await window.S4Desktop.share.whatsappText({ phone, text })) };
  openLink(waTextUrl(phone, text));
  return { mode };
}

/** What to tell the user after a share. -> { text, tone: "ok" | "info" } */
export function shareOutcome(res, bn = false) {
  const L = (b, e) => (bn ? b : e);
  const noAuto = L("PDF নিজে থেকে যুক্ত হয় না।", "The PDF is not attached by itself.");
  if (res?.mode === "desktop") {
    const where = res.desktop ? L("WhatsApp Desktop-এ চ্যাট খুলেছে, মেসেজ লেখা আছে।", "The chat is open in WhatsApp Desktop with the message.")
      : L("WhatsApp Desktop খোলা যায়নি - চ্যাট ব্রাউজারে (wa.me) খুলেছে।", "WhatsApp Desktop could not be opened - the chat opened in the browser (wa.me).");
    if (!res.path) return { tone: "info", text: `${where} ${L("PDF বানানো যায়নি", "The PDF could not be made")}${res.pdfError ? `: ${res.pdfError}` : ""}.` };
    const attach = res.autoPaste
      ? L("PDF চ্যাটে পেস্ট করার চেষ্টা হয়েছে — একবার দেখে Send চাপুন।", "Tried to paste the PDF into the chat — check it and press Send.")
      : res.clipboard && res.desktop
        ? L("PDF কপি করা আছে: চ্যাটে ক্লিক করে Ctrl+V চাপুন, তারপর Send।", "The PDF is copied: click in the chat and press Ctrl+V, then Send.")
        : L("ফোল্ডার থেকে PDF টেনে চ্যাটে দিন, তারপর Send।", "Drag the PDF from the folder into the chat, then Send.");
    return { tone: res.desktop ? "ok" : "info", text: `${where} ${noAuto} ${attach}` };
  }
  if (res?.mode === "android") return res.opened ? { tone: "ok", text: L("শেয়ার থেকে WhatsApp আর চ্যাট বেছে Send করুন।", "Pick WhatsApp and the chat in the share sheet, then Send.") } : { tone: "info", text: L("শেয়ার বাতিল হয়েছে", "Share cancelled") };
  if (res?.mode === "desktop-old") {
    return { tone: "info", text: L(
      "এই ডেস্কটপ অ্যাপটা পুরনো: PDF সেভ হয়েছে আর চ্যাট ব্রাউজারে (wa.me) খুলেছে - 'Continue to chat' চাপলে WhatsApp Desktop খুলবে, তারপর PDF টেনে দিন। নতুন অ্যাপে PDF কপি হয়ে সরাসরি WhatsApp Desktop খোলে।",
      "This desktop app is an older build: the PDF is saved and the chat opened in the browser (wa.me) - press 'Continue to chat' to open WhatsApp Desktop, then drag the PDF in. The updated app copies the PDF and opens WhatsApp Desktop directly.") };
  }
  return { tone: "info", text: L(
    `ব্রাউজার থেকে WhatsApp Desktop-এ ফাইল দেওয়া যায় না। PDF ডাউনলোড হয়েছে, আর ${res?.opened ? "wa.me ট্যাবে চ্যাট খুলেছে" : "পপ-আপ ব্লক থাকায় চ্যাট খোলেনি - পপ-আপ চালু করুন"}। ${noAuto} ডাউনলোড ফোল্ডার থেকে PDF চ্যাটে দিন।`,
    `A browser cannot hand files to WhatsApp Desktop. The PDF is downloaded and ${res?.opened ? "the chat opened in a wa.me tab" : "the chat did not open because pop-ups are blocked - allow pop-ups"}. ${noAuto} Attach it from your Downloads folder.`) };
}

/** WhatsApp doc for a receipt (customer) or payment (supplier) voucher; partyRecord: the customer / vendor master row. */
export function voucherShareDoc({ kind, raw, html, partyRecord = null, bn = false, shop = "", cur = "AED" }) {
  const isReceipt = kind === "receipt";
  const no = (isReceipt ? raw?.receiptNo : raw?.paymentNo) || "";
  const party = (isReceipt ? raw?.customerName : raw?.vendorName) || "";
  const amount = isReceipt ? raw?.totalAmount
    : raw?.chequeAmount != null ? raw.chequeAmount : (Number(raw?.totalAmount) || 0) - (Number(raw?.discountAmount) || 0);
  const docType = raw?.isRefund ? (bn ? "রিফান্ড ভাউচার" : "Refund voucher")
    : isReceipt ? (bn ? "রিসিপ্ট ভাউচার" : "Receipt voucher") : (bn ? "পেমেন্ট ভাউচার" : "Payment voucher");
  return {
    html, fileName: pdfFileName(no, party),
    phone: partyPhone(partyRecord) || String((isReceipt ? raw?.customerMobile : raw?.vendorMobile) || ""),
    text: docMessage({ bn, shop, docType, no, date: (isReceipt ? raw?.receiptDate : raw?.paymentDate) || raw?.createdAt, total: amount, cur, party }),
  };
}
