// Cash-drawer kick for ESC/POS printers attached to the Windows desktop app.
// Browser / Android without a raw bridge must return a real error — never a fake "opened".

export const DRAWER_PIN2 = [0x1b, 0x70, 0x00, 0x19, 0xfa];
export const DRAWER_PIN5 = [0x1b, 0x70, 0x01, 0x19, 0xfa];

export function drawerKickBytes({ pin = 2 } = {}) {
  const p = Number(pin) === 5 ? 5 : 2;
  return Uint8Array.from(p === 5 ? DRAWER_PIN5 : DRAWER_PIN2);
}

export function normalizeDrawerSettings(raw = {}) {
  const pin = Number(raw.drawerPin) === 5 ? 5 : 2;
  return {
    drawerPrinter: String(raw.drawerPrinter || "").trim(),
    billPrinter: String(raw.billPrinter || "").trim(),
    drawerPin: pin,
    openDrawerAfterCash: raw.openDrawerAfterCash === true,
  };
}

export function drawerPrinterName(settings) {
  const s = normalizeDrawerSettings(settings);
  return s.drawerPrinter || s.billPrinter || "";
}

/**
 * @param {{ settings?: object, transport?: (req:{ printer:string, bytes:Uint8Array }) => Promise<{ ok:boolean, error?:string }>, lang?: string }} opts
 * @returns {Promise<{ ok:boolean, error?:string, code?:string }>}
 */
export async function openCashDrawer({ settings = {}, transport, lang = "en" } = {}) {
  const bn = lang === "bn";
  const s = normalizeDrawerSettings(settings);
  const printer = drawerPrinterName(s);
  if (!printer) {
    return {
      ok: false,
      code: "no_printer",
      error: bn
        ? "ড্রয়ার খুলতে প্রিন্ট সেটিংসে বিল বা ড্রয়ার প্রিন্টার বাছুন (Windows ডেস্কটপ অ্যাপ)"
        : "Choose a bill or drawer printer in Print Settings (Windows desktop app) to open the drawer",
    };
  }
  if (typeof transport !== "function") {
    return {
      ok: false,
      code: "no_bridge",
      error: bn
        ? "ক্যাশ ড্রয়ার শুধু Windows ডেস্কটপ অ্যাপে খোলে — ব্রাউজার বা মোবাইলে কাঁচা ESC/POS পাঠানো যায় না"
        : "Cash drawer opens only in the Windows desktop app — browser/mobile cannot send raw ESC/POS",
    };
  }
  const bytes = drawerKickBytes({ pin: s.drawerPin });
  try {
    const result = await transport({ printer, bytes });
    if (result?.ok) return { ok: true };
    return {
      ok: false,
      code: "transport",
      error: String(result?.error || (bn ? "ড্রয়ার খোলা যায়নি" : "Could not open the drawer")),
    };
  } catch (err) {
    return {
      ok: false,
      code: "transport",
      error: String(err?.message || err || (bn ? "ড্রয়ার খোলা যায়নি" : "Could not open the drawer")),
    };
  }
}
