import { PI_PREFIX, deviceSerialTag, reserveShopSerial } from "../shared/appShared.jsx";
import { PMT_PREFIX } from "./purchaseShared.js";
import { db } from "../firebase-config";
import { doc, runTransaction } from "../backend/firestore";

export function createPiNumbering({ editInvoiceId, invoices, isOwner, payments, piInvoiceNo, setPiInvoiceNo, shop, shopId }) {
  // ── Generate invoice no — preview instantly, commit on save ──
  const piMaxLocalSerial = () => invoices.reduce((mx, inv) => {
    const m = String(inv.invoiceNo || "").match(/PI-?(\d+)(?:-[A-Z]{2})?$/i);
    return m ? Math.max(mx, Number(m[1])) : mx;
  }, Number(shop?.lastPISerial || 0));

  const piFormatInvoiceNo = (serial) =>
    `${PI_PREFIX}${String(serial).padStart(4, "0")}`;

  const piPreviewNextInvoiceNo = () =>
    piFormatInvoiceNo(piMaxLocalSerial() + 1);

  const reservePiInvoiceNo = async () => {
    if (editInvoiceId) return piInvoiceNo;
    const local = piMaxLocalSerial();
    const serial = await reserveShopSerial(shopId, "lastPISerial", local);
    const no = serial ? piFormatInvoiceNo(serial)
      : isOwner ? piFormatInvoiceNo(local + 1)
      : `${piFormatInvoiceNo(local + 1)}-${deviceSerialTag()}`;
    setPiInvoiceNo(no);
    return no;
  };

  const bumpShopPiSerial = (invoiceNo) => {
    const m = String(invoiceNo || "").match(/PI-?(\d+)$/i);
    if (!m || !navigator.onLine) return;
    const serial = Number(m[1]);
    if (!Number.isFinite(serial) || serial <= 0) return;
    runTransaction(db, async tx => {
      const shopRef = doc(db, "shops", shopId);
      const shopSnap = await tx.get(shopRef);
      const current = Number(shopSnap.data()?.lastPISerial || 0);
      if (serial > current) tx.update(shopRef, { lastPISerial: serial });
    }).catch(err => console.warn("[S4 PI] lastPISerial background bump failed", err));
  };

  // ── Generate payment voucher no (local-first, cloud when online) ──
  const piMaxLocalPaymentSerial = () => payments.reduce((mx, payment) => {
    const m = String(payment.paymentNo || "").match(/PMT-?(\d+)(?:-[A-Z]{2})?$/i);
    return m ? Math.max(mx, Number(m[1])) : mx;
  }, Number(shop?.lastPaymentSerial || 0));

  const piFormatPaymentNo = (serial) =>
    `${PMT_PREFIX}${String(serial).padStart(4, "0")}`;

  const genPaymentNo = async () => {
    const local = piMaxLocalPaymentSerial();
    const serial = await reserveShopSerial(shopId, "lastPaymentSerial", local);
    if (serial) return piFormatPaymentNo(serial);
    return isOwner ? piFormatPaymentNo(local + 1) : `${piFormatPaymentNo(local + 1)}-${deviceSerialTag()}`;
  };
  return { bumpShopPiSerial, genPaymentNo, piFormatPaymentNo, piMaxLocalPaymentSerial, piPreviewNextInvoiceNo, reservePiInvoiceNo };
}
