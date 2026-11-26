import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import ProductPicker from "../components/ProductPicker.jsx";
import { offlineCreate, offlineGetById, offlinePatch, offlineRemove } from "../offline/offlineRepository";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { computeStockMap, invalidateInvoiceRowsCache, loadInvoiceRows } from "../inventory/stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";
import { useEscapeKey } from "../components/WindowChrome.jsx";
import { donePatch } from "../reminders/reminders.js";
import {
  REMINDER_DAY_PRESETS, WARRANTY_META, WARRANTY_MONTH_PRESETS, WARRANTY_REASONS, WARRANTY_STATUSES,
  addDaysYmd, buildWarrantyReminder, canAdvance, claimInvoiceFields, claimInvoiceLabel,
  claimBatteryFields, claimSummary, claimWarrantyPeriodFields, productBatteryAh,
  productBatteryBrand, productWarrantyMonths, warrantyCandidateInvoices,
  warrantyReasonLabel, warrantyStatusLabel, warrantyWindow, ymd,
} from "./warrantyClaim.js";
import {
  CUSTOMER_SETTLE_KINDS, canRecordCustomerSettle, claimCustomerSettleFields,
  customerSettleErrorText, customerSettleLabel, hasCustomerSettle, invoiceBalanceDue,
  validateCustomerSettle,
} from "./warrantyCustomerSettle.js";
import {
  applyWarrantyCustomerCredit, createWarrantyCustomerRefundVoucher,
} from "./warrantyCustomerSettleApply.js";
import {
  VENDOR_SETTLE_KINDS, canRecordVendorSettle, claimVendorSettleFields,
  hasVendorSettle, purchaseBalanceDue, validateVendorSettle, vendorOpenPurchaseBills,
  vendorSettleErrorText, vendorSettleLabel,
} from "./warrantyVendorSettle.js";
import {
  applyWarrantyVendorDebit, createWarrantyVendorReceiveVoucher,
} from "./warrantyVendorSettleApply.js";
import {
  WARRANTY_ATTACH_KINDS, WARRANTY_ATTACH_MAX, attachKindLabel, buildAttachment,
  canAddAttachment, claimAttachments, withAttachmentAdded, withAttachmentRemoved,
} from "./warrantyAttachments.js";
import DateField from "../components/DateField.jsx";
import { useFormSaveShortcut } from "../utils/useDesktopFormShortcuts.js";
import { hintSave } from "../utils/desktopFormShortcuts.js";
import BillLocationPicker from "../inventory/BillLocationPicker.jsx";
import { billLocationFields, billLocationsOf, hasGodowns } from "../inventory/billLocation.js";
import { MAIN_LOCATION_ID } from "../inventory/stockLocations.js";
import { openDocFile, readDocFile } from "../utils/docFiles.js";
import WhatsAppButton from "../share/WhatsAppButton.jsx";
import { docMessage, pdfFileName } from "../share/whatsappDocShare.js";
import { warrantyClaimShareExtra, warrantyClaimSharePhone } from "./warrantyClaimShare.js";
import { buildClaimEditPatch, canEditOpenClaim } from "./warrantyClaimEdit.js";

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fq = (v) => String(parseFloat(n2(v).toFixed(4)));
const ACCENT = "#b45309";

export default function WarrantyClaimTab({
  lang = "en", shopId, user, profile, isOwner, canManage, canDelete = false, canPrint = false,
  products = [], customers = [], vendors = [], shop = null, toast, shopName = "", makeNo, leaveGuard = null,
  openClaimId = null, onOpenClaimHandled = null,
}) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);

  const [rows, setRows] = useState([]);
  const [view, setView] = useState("list");
  const [sel, setSel] = useState(null);
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("open");
  const [saving, setSaving] = useState(false);
  const [stockMap, setStockMap] = useState(null);

  const [date, setDate] = useState(ymd(new Date()));
  const [reason, setReason] = useState("battery");
  const [note, setNote] = useState("");
  const [qty, setQty] = useState("1");
  const [serialNo, setSerialNo] = useState("");
  const [reminderDays, setReminderDays] = useState(15);
  const [product, setProduct] = useState(null);
  const [customerQ, setCustomerQ] = useState("");
  const [customer, setCustomer] = useState(null);
  const [vendorQ, setVendorQ] = useState("");
  const [vendor, setVendor] = useState(null);
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [invoiceLink, setInvoiceLink] = useState(null);
  const [invBillQ, setInvBillQ] = useState("");
  const [warrantyMonths, setWarrantyMonths] = useState(12);
  const [batteryAh, setBatteryAh] = useState("");
  const [batteryBrand, setBatteryBrand] = useState("");
  const [replaceProduct, setReplaceProduct] = useState(null);
  const [replacedSerialNo, setReplacedSerialNo] = useState("");
  const [custSettleKind, setCustSettleKind] = useState("refund");
  const [custSettleAmount, setCustSettleAmount] = useState("");
  const [custSettleMethod, setCustSettleMethod] = useState("cash");
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [vendSettleKind, setVendSettleKind] = useState("receive");
  const [vendSettleAmount, setVendSettleAmount] = useState("");
  const [vendSettleMethod, setVendSettleMethod] = useState("cash");
  const [vendDebitInvoiceId, setVendDebitInvoiceId] = useState("");
  const [sendLocationId, setSendLocationId] = useState(MAIN_LOCATION_ID);
  const [replaceLocationId, setReplaceLocationId] = useState(MAIN_LOCATION_ID);
  const [attachKind, setAttachKind] = useState("battery");
  const [attachBusy, setAttachBusy] = useState(false);
  const attachFileRef = useRef(null);
  const [editForm, setEditForm] = useState(null);

  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, view);
  const locations = useMemo(() => billLocationsOf(shop), [shop]);
  const godownsOn = hasGodowns(locations);

  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName: "warrantyClaims", shopId, onRows: (list) => setRows(list || []) });
    const unsubInv = subscribeShopCollection({ collectionName: "salesInvoices", shopId, onRows: (list) => setSalesInvoices(list || []) });
    const unsubPi = subscribeShopCollection({ collectionName: "purchaseInvoices", shopId, onRows: (list) => setPurchaseInvoices(list || []) });
    return () => {
      try { unsub?.(); } catch { /* ignore */ }
      try { unsubInv?.(); } catch { /* ignore */ }
      try { unsubPi?.(); } catch { /* ignore */ }
    };
  }, [shopId]);

  useEffect(() => {
    if (!openClaimId) return;
    const hit = rows.find((r) => r.id === openClaimId);
    if (hit) { setSel(hit); setView("detail"); }
    onOpenClaimHandled?.();
  }, [openClaimId, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    loadInvoiceRows()
      .then((r) => {
        if (!cancelled) setStockMap(computeStockMap(products, r.purchaseInvoices, r.salesInvoices, shopId, r.deliveryNotes, r.extras));
      })
      .catch((err) => console.warn("[S4 Warranty] stock load failed", err));
    return () => { cancelled = true; };
  }, [view, products, shopId, rows]);

  const stockOf = (id) => (stockMap?.has(id) ? stockMap.get(id) : null);

  const dirty = (view === "form" && (product || customer || vendor || note.trim()))
    || (view === "edit" && !!editForm);
  const leaveOk = () => !dirty || window.confirm(L("এটা সেভ হয়নি। তবুও চলে যাবেন?", "This is not saved. Leave anyway?"));
  const backToList = () => {
    if (!leaveOk()) return;
    setSel(null); setEditForm(null); setView("list");
  };
  const backFromEdit = () => {
    if (!leaveOk()) return;
    setEditForm(null); setView("detail");
  };
  useEffect(() => {
    if (!leaveGuard || view === "list") return undefined;
    const guard = { leave: () => leaveOk(), back: () => { if (view === "edit") backFromEdit(); else backToList(); return true; } };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });
  useEscapeKey(view === "edit" ? backFromEdit : backToList, { enabled: view !== "list", level: view === "form" || view === "edit" ? 2 : 1 });

  const openNew = () => {
    setDate(ymd(new Date())); setReason("battery"); setNote(""); setQty("1"); setSerialNo("");
    setReminderDays(15); setProduct(null); setCustomer(null); setCustomerQ(""); setVendor(null); setVendorQ("");
    setInvoiceLink(null); setInvBillQ(""); setWarrantyMonths(12);
    setBatteryAh(""); setBatteryBrand("");
    setView("form");
  };

  const applyProductBatteryDefaults = (p) => {
    const ah = productBatteryAh(p);
    const brand = productBatteryBrand(p);
    setBatteryAh(ah != null ? String(ah) : "");
    setBatteryBrand(brand || "");
  };

  const saleDay = invoiceLink?.invoiceDate || date;
  const periodPreview = warrantyWindow({ saleDate: saleDay, claimDate: date, months: warrantyMonths });

  const billCandidates = useMemo(() => {
    if (!product?.productId) return [];
    const list = warrantyCandidateInvoices({
      invoices: salesInvoices,
      productId: product.productId,
      customerId: customer?.id || null,
      customerName: customer?.customerName || customerQ,
    });
    const q = invBillQ.trim().toLowerCase();
    if (!q) return list;
    return list.filter((x) => [x.invoiceNo, x.invoiceDate, x.customerName].join(" ").toLowerCase().includes(q));
  }, [salesInvoices, product, customer, customerQ, invBillQ]);

  const pickBill = (link) => {
    setInvoiceLink(link);
    setInvBillQ("");
    if (!customer && link.customerId) {
      const hit = (customers || []).find((c) => c.id === link.customerId);
      if (hit) setCustomer(hit);
      else setCustomerQ(link.customerName || "");
    }
  };

  const custHits = useMemo(() => {
    const q = customerQ.trim().toLowerCase();
    if (!q) return [];
    return (customers || []).filter((c) => !c.isDeleted && !c.deleted && [c.customerName, c.mobileNumber, c.whatsappNumber, c.customerCode].join(" ").toLowerCase().includes(q)).slice(0, 12);
  }, [customers, customerQ]);
  const vendHits = useMemo(() => {
    const q = vendorQ.trim().toLowerCase();
    if (!q) return [];
    return (vendors || []).filter((v) => !v.isDeleted && !v.deleted && [v.vendorName, v.mobileNumber, v.whatsappNumber, v.vendorCode].join(" ").toLowerCase().includes(q)).slice(0, 12);
  }, [vendors, vendorQ]);

  const saveNew = async () => {
    if (saving) return;
    if (!product?.productId) return toast?.(L("পণ্য বেছে নিন", "Pick the product"), "err");
    if (!vendor?.id && !String(vendorQ || "").trim()) return toast?.(L("কোম্পানি / সাপ্লায়ার বেছে নিন", "Pick the company / supplier"), "err");
    const q = n2(qty);
    if (!(q > 0)) return toast?.(L("পরিমাণ লিখুন", "Enter quantity"), "err");
    if (!invoiceLink?.invoiceId) {
      const ok = window.confirm(L(
        "মূল সেলস বিল লিংক করা হয়নি। গ্যারান্টি ট্র্যাকিং দুর্বল হবে। তবুও ক্লেইম খুলবেন?",
        "No original sales bill linked. Warranty tracking will be weaker. Open claim anyway?",
      ));
      if (!ok) return;
    }
    const months = Math.max(0, Math.min(120, Number(warrantyMonths) || 0));
    const period = claimWarrantyPeriodFields({
      saleDate: invoiceLink?.invoiceDate || date,
      claimDate: date,
      months,
    });
    if (period.warrantyExpiredAtOpen) {
      const ok = window.confirm(L(
        `গ্যারান্টি মেয়াদ শেষ (${String(period.warrantyEndDate || "").split("-").reverse().join("/")})। তবুও ক্লেইম খুলবেন?`,
        `Warranty period ended (${period.warrantyEndDate || "—"}). Open claim anyway?`,
      ));
      if (!ok) return;
    }
    const days = Math.max(1, Math.min(365, Number(reminderDays) || 15));
    setSaving(true);
    try {
      const claimNo = await makeNo(WARRANTY_META.serial, WARRANTY_META.prefix, rows.map((r) => r.claimNo));
      const nowIso = new Date().toISOString();
      const vName = vendor?.vendorName || vendorQ.trim();
      const cName = customer?.customerName || customerQ.trim();
      const bill = claimInvoiceFields(invoiceLink);
      const payload = {
        shopId, claimNo, claimDate: date, status: "received", reason,
        productId: product.productId, productName: product.name || "", productCode: product.code || "",
        qty: q, unit: product.unit || "Pcs", serialNo: serialNo.trim(),
        customerId: customer?.id || null, customerName: cName, customerMobile: customer?.mobileNumber || customer?.whatsappNumber || "",
        vendorId: vendor?.id || null, vendorName: vName,
        ...bill,
        ...period,
        ...claimBatteryFields({ ah: batteryAh, brand: batteryBrand }),
        reminderDays: days, reminderDueDate: "", reminderId: null,
        note: note.trim(),
        createdAt: nowIso, createdBy: user?.uid || "", createdByName: profile?.personName || "",
        updatedAt: nowIso, updatedBy: user?.uid || "",
      };
      const res = await offlineCreate("warrantyClaims", payload);
      const created = { ...res.data, id: res.documentId };
      logAudit({ shopId, user, profile, action: "create", collection: "warrantyClaims", docId: created.id, docNo: claimNo, note: claimSummary(created) });
      setRows((list) => [created, ...list.filter((r) => r.id !== created.id)]);
      toast?.(L(` ${claimNo} খোলা হয়েছে — এখন কোম্পানিতে পাঠান`, ` ${claimNo} opened — now send to company`));
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
      setSel(created); setView("detail");
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const patchClaim = async (r, patch, auditNote) => {
    const nowIso = new Date().toISOString();
    const full = { ...patch, updatedAt: nowIso, updatedBy: user?.uid || "" };
    await offlinePatch("warrantyClaims", r.id, full, r);
    const updated = { ...r, ...full };
    setRows((list) => list.map((x) => (x.id === r.id ? updated : x)));
    setSel((s) => (s?.id === r.id ? updated : s));
    logAudit({ shopId, user, profile, action: "update", collection: "warrantyClaims", docId: r.id, docNo: r.claimNo, note: auditNote });
    if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    return updated;
  };

  const closeReminder = async (r) => {
    if (!r.reminderId) return;
    try {
      const stored = await offlineGetById("reminders", r.reminderId).catch(() => null);
      const rem = stored?.data ? { ...stored.data, id: r.reminderId } : null;
      if (!rem || rem.status === "done") return;
      const patch = donePatch(rem, { uid: user?.uid || "", name: profile?.personName || "", stop: true });
      await offlinePatch("reminders", r.reminderId, patch, rem);
    } catch (err) {
      console.warn("[S4 Warranty] reminder close failed", err);
    }
  };

  const sendToCompany = async (r) => {
    if (!canAdvance(r.status, "send") || saving) return;
    const days = Math.max(1, Math.min(365, Number(r.reminderDays) || reminderDays || 15));
    const sentDate = ymd(new Date());
    const due = addDaysYmd(sentDate, days);
    if (!window.confirm(L(
      `${r.claimNo} কোম্পানিতে পাঠাবেন?\n\n${days} দিনের মধ্যে চেঞ্জ না এলে জোরে রিমাইন্ডার আসবে (${due.split("-").reverse().join("/")})।\nস্টক এখন বাড়বে না — কোম্পানি নতুন দিলে বাড়বে।`,
      `Send ${r.claimNo} to company?\n\nA loud reminder fires if no change within ${days} day(s) (due ${due}).\nStock does NOT increase yet — only when company gives the new unit.`,
    ))) return;
    setSaving(true);
    try {
      // Claim first so a failed send never leaves an orphan reminder.
      const sentLoc = godownsOn ? billLocationFields(sendLocationId, locations) : {};
      const updated = await patchClaim(r, {
        status: "sent", sentAt: new Date().toISOString(), sentDate,
        reminderDays: days, reminderDueDate: due,
        sentLocationId: sentLoc.locationId || "",
        sentLocationName: sentLoc.locationName || "",
      }, `Sent to company · remind ${due}${sentLoc.locationName ? ` · ${sentLoc.locationName}` : ""}`);
      let reminderId = updated.reminderId || null;
      const remPayload = buildWarrantyReminder({
        claim: updated, claimNo: updated.claimNo, dueDate: due, shopId, user, profile,
      });
      if (reminderId) {
        await offlinePatch("reminders", reminderId, {
          title: remPayload.title, note: remPayload.note, dueDate: due, dueTime: "09:00",
          status: "open", snoozedUntil: "", remindBefore: 1, updatedAt: remPayload.updatedAt, updatedBy: remPayload.updatedBy,
        }, { id: reminderId, status: "open" });
      } else {
        const res = await offlineCreate("reminders", remPayload);
        reminderId = res.documentId;
        await patchClaim(updated, { reminderId }, `Reminder linked ${reminderId}`);
      }
      toast?.(L(`পাঠানো হয়েছে · রিমাইন্ডার ${due.split("-").reverse().join("/")}`, `Sent · reminder ${due}`));
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const markReplaced = async (r) => {
    if (!canAdvance(r.status, "replace") || saving) return;
    const rp = replaceProduct?.productId
      ? replaceProduct
      : { productId: r.productId, name: r.productName || "", code: r.productCode || "", unit: r.unit || "Pcs" };
    if (!rp.productId) return toast?.(L("রিপ্লেসমেন্ট পণ্য বেছে নিন", "Pick the replacement product"), "err");
    const same = rp.productId === r.productId;
    if (!window.confirm(L(
      `${r.claimNo}: কোম্পানি নতুন পণ্য দিয়েছে?\n\nস্টকে +${fq(r.qty)} ${rp.name || rp.productId}${same ? "" : ` (${L("আলাদা মডেল", "different model")})`} যোগ হবে।\nকাস্টমারকে দিলে পরে ধাপ ৪ চাপুন — তখন স্টক কমবে।`,
      `${r.claimNo}: company gave the new unit?\n\nStock +${fq(r.qty)} ${rp.name || rp.productId}${same ? "" : " (different model)"}.\nThen step 4 when you give it to the customer — stock goes down.`,
    ))) return;
    setSaving(true);
    try {
      const inSerial = String(replacedSerialNo || "").trim() || String(r.serialNo || "").trim();
      const locFields = godownsOn ? billLocationFields(replaceLocationId, locations) : {};
      const updated = await patchClaim(r, {
        status: "replaced",
        replacedAt: new Date().toISOString(),
        replacedDate: ymd(new Date()),
        replacedProductId: rp.productId,
        replacedProductName: rp.name || "",
        replacedProductCode: rp.code || "",
        replacedUnit: rp.unit || r.unit || "Pcs",
        replacedSerialNo: inSerial,
        ...locFields,
      }, same
        ? `Company replaced · stock +${locFields.locationName ? ` · ${locFields.locationName}` : ""}`
        : `Company replaced different SKU ${rp.code || rp.productId} · stock +${locFields.locationName ? ` · ${locFields.locationName}` : ""}`);
      await closeReminder(updated);
      invalidateInvoiceRowsCache();
      setReplaceProduct(null);
      setReplacedSerialNo("");
      toast?.(L(`নতুন পণ্য স্টকে যোগ · এখন কাস্টমারকে দিতে পারেন`, `New unit in stock · you can give it to the customer`));
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const markDelivered = async (r) => {
    if (!canAdvance(r.status, "deliver") || saving) return;
    if (!window.confirm(L(
      `${r.claimNo}: কাস্টমারকে নতুন পণ্য দিয়ে দিলেন?\n\nস্টক থেকে −${fq(r.qty)} কমবে (নেট শূন্য — কোম্পানি দিয়েছিল, কাস্টমার নিল)।`,
      `${r.claimNo}: gave the new unit to the customer?\n\nStock −${fq(r.qty)} (net zero — company in, customer out).`,
    ))) return;
    setSaving(true);
    try {
      await patchClaim(r, {
        status: "delivered",
        deliveredAt: new Date().toISOString(),
        deliveredDate: ymd(new Date()),
      }, "Delivered to customer · stock −");
      invalidateInvoiceRowsCache();
      toast?.(L("কাস্টমারকে দেওয়া হয়েছে", "Delivered to customer"));
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const cancelClaim = async (r) => {
    if (!canAdvance(r.status, "cancel")) return;
    if (!window.confirm(L(`${r.claimNo} বাতিল করবেন? স্টক হিসাব আগের অবস্থায় ফিরবে।`, `Cancel ${r.claimNo}? Stock effect reverses.`))) return;
    setSaving(true);
    try {
      const updated = await patchClaim(r, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelledBy: user?.uid || "",
      }, "Cancelled");
      await closeReminder(updated);
      if (r.status === "replaced") invalidateInvoiceRowsCache();
      toast?.(L("বাতিল", "Cancelled"), "err");
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const deleteClaim = async (r) => {
    if (!canDelete || r.status !== "cancelled") return;
    if (!window.confirm(L(`${r.claimNo} একেবারে মুছবেন?`, `Delete ${r.claimNo} permanently?`))) return;
    try {
      await closeReminder(r);
      await offlineRemove("warrantyClaims", r.id);
      setRows((list) => list.filter((x) => x.id !== r.id));
      logAudit({ shopId, user, profile, action: "delete", collection: "warrantyClaims", docId: r.id, docNo: r.claimNo });
      toast?.(L("মুছে ফেলা হয়েছে", "Deleted"), "err");
      setSel(null); setView("list");
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    }
  };

  const PAY_METHODS = [
    { key: "cash", bn: "নগদ", en: "Cash" },
    { key: "bank_transfer", bn: "ব্যাংক ট্রান্সফার", en: "Bank Transfer" },
    { key: "cheque", bn: "চেক", en: "Cheque" },
  ];

  const recordCustomerSettle = async (r) => {
    if (!canManage || !canRecordCustomerSettle(r) || saving) return;
    const kind = custSettleKind;
    const amount = n2(custSettleAmount);
    const method = custSettleMethod;
    const invoice = kind === "credit" && r.invoiceId
      ? (salesInvoices.find((x) => x.id === r.invoiceId) || null)
      : null;
    const code = validateCustomerSettle({ claim: r, kind, amount, method, invoice });
    if (code) {
      const [msg, tone] = customerSettleErrorText(code, bn);
      toast?.(msg, tone);
      return;
    }
    const settleDate = ymd(new Date());
    const label = customerSettleLabel(kind, bn);
    if (!window.confirm(L(
      `${r.claimNo}: ${label} — ${amount.toFixed(2)}?\n\nস্টক বদলাবে না (পণ্য পথ আলাদা)। একবারই রেকর্ড হবে।`,
      `${r.claimNo}: ${label} — ${amount.toFixed(2)}?\n\nStock does not change (product path is separate). Recorded once only.`,
    ))) return;
    setSaving(true);
    // Lock claim first so a failed money write cannot be retried into a double settle.
    let locked = null;
    let moneyDone = false;
    try {
      const lockFields = claimCustomerSettleFields({ kind, amount, method, settleDate, voucher: null });
      locked = await patchClaim(r, lockFields, `Customer settle lock ${kind} ${amount}`);
      let voucher = null;
      if (kind === "refund") {
        voucher = await createWarrantyCustomerRefundVoucher({
          shopId, user, profile, isOwner, claim: locked, amount, method, settleDate,
        });
      } else if (kind === "credit") {
        await applyWarrantyCustomerCredit({ claim: locked, invoice, amount, user });
      }
      moneyDone = true;
      if (voucher) {
        await patchClaim(locked, claimCustomerSettleFields({ kind, amount, method, settleDate, voucher }),
          `Customer settle voucher ${voucher.no}`);
      }
      setCustSettleAmount("");
      toast?.(L(
        kind === "refund"
          ? `রিফান্ড রেকর্ড · ${voucher?.no || ""}`
          : `বিল ক্রেডিট · ${r.invoiceNo || ""}`,
        kind === "refund"
          ? `Refund recorded · ${voucher?.no || ""}`
          : `Bill credited · ${r.invoiceNo || ""}`,
      ));
    } catch (e) {
      if (locked && !moneyDone) {
        try {
          await patchClaim(locked, {
            customerSettleKind: "", customerSettleAmount: 0, customerSettleMethod: "",
            customerSettleDate: "", customerSettleAt: "",
            customerRefundVoucherId: null, customerRefundVoucherNo: "", customerRefundVoucherCol: "",
          }, "Customer settle unlock after failure");
        } catch (unlockErr) {
          console.warn("[S4 Warranty] customer settle unlock failed", unlockErr);
        }
      }
      toast?.(` ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (r) => {
    if (!canEditOpenClaim(r)) return;
    setEditForm({
      note: r.note || "",
      reason: r.reason || "battery",
      serialNo: r.serialNo || "",
      reminderDays: String(r.reminderDays || 15),
      qty: String(r.qty || 1),
      productId: r.productId || "",
      productName: r.productName || "",
      productCode: r.productCode || "",
      unit: r.unit || "Pcs",
      customerId: r.customerId || null,
      customerName: r.customerName || "",
      customerMobile: r.customerMobile || "",
      vendorId: r.vendorId || null,
      vendorName: r.vendorName || "",
      invoiceId: r.invoiceId || null,
      invoiceNo: r.invoiceNo || "",
      invoiceDate: r.invoiceDate || "",
      warrantyMonths: String(r.warrantyMonths || productWarrantyMonths(null, r.reason || "battery")),
      batteryAh: r.batteryAh != null ? String(r.batteryAh) : "",
      batteryBrand: r.batteryBrand || "",
    });
    setCustomer(r.customerId ? { id: r.customerId, customerName: r.customerName, mobileNumber: r.customerMobile } : null);
    setCustomerQ("");
    setVendor(r.vendorId ? { id: r.vendorId, vendorName: r.vendorName } : null);
    setVendorQ("");
    setProduct(r.productId ? { productId: r.productId, name: r.productName, code: r.productCode, unit: r.unit } : null);
    setInvoiceLink(r.invoiceId || r.invoiceNo ? { invoiceId: r.invoiceId, invoiceNo: r.invoiceNo, invoiceDate: r.invoiceDate } : null);
    setSel(r);
    setView("edit");
  };

  const saveEdit = async () => {
    const r = rows.find((x) => x.id === sel?.id) || sel;
    if (!r || !editForm || !canEditOpenClaim(r) || saving) return;
    const form = {
      ...editForm,
      customerId: customer?.id || editForm.customerId || null,
      customerName: customer?.customerName || editForm.customerName || "",
      customerMobile: customer?.mobileNumber || editForm.customerMobile || "",
      vendorId: vendor?.id || editForm.vendorId || null,
      vendorName: vendor?.vendorName || editForm.vendorName || "",
    };
    if (r.status === "received" && product?.productId) {
      form.productId = product.productId;
      form.productName = product.name || "";
      form.productCode = product.code || "";
      form.unit = product.unit || form.unit || "Pcs";
    }
    if (invoiceLink) {
      Object.assign(form, claimInvoiceFields(invoiceLink));
    } else {
      form.invoiceId = null;
      form.invoiceNo = "";
      form.invoiceDate = "";
    }
    const months = Math.max(0, Number(editForm.warrantyMonths) || 0);
    const period = claimWarrantyPeriodFields({
      saleDate: form.invoiceDate || r.claimDate,
      claimDate: r.claimDate,
      months,
    });
    Object.assign(form, period, claimBatteryFields({ ah: editForm.batteryAh, brand: editForm.batteryBrand }));
    const patch = buildClaimEditPatch(r, form);
    if (!Object.keys(patch).length) {
      toast?.(L("কোনো পরিবর্তন নেই", "No changes"));
      setView("detail");
      return;
    }
    setSaving(true);
    try {
      await patchClaim(r, patch, `Edit open claim · ${Object.keys(patch).join(",")}`);
      setEditForm(null);
      setView("detail");
      toast?.(L("ক্লেইম আপডেট হয়েছে", "Claim updated"));
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };
  useFormSaveShortcut({ active: view === "form", saving, disabled: saving || !product, onSave: saveNew });
  useFormSaveShortcut({ active: view === "edit", saving, disabled: saving, onSave: saveEdit });

  const addClaimAttachment = async (r, file) => {
    if (!canManage || !canAddAttachment(r) || !file) return;
    setAttachBusy(true);
    try {
      const data = await readDocFile(file, L);
      const att = buildAttachment({
        kind: attachKind, label: attachKindLabel(attachKind, bn),
        file: data, fileName: file.name || "", fileType: file.type || "", user,
      });
      const next = withAttachmentAdded(r.attachments, att);
      if (next.error === "MAX") {
        toast?.(L(`সর্বোচ্চ ${WARRANTY_ATTACH_MAX}টি ফাইল`, `Max ${WARRANTY_ATTACH_MAX} files`), "err");
        return;
      }
      if (next.error) {
        toast?.(L("ফাইল যোগ হয়নি", "Could not add file"), "err");
        return;
      }
      await patchClaim(r, { attachments: next.list }, `Attachment ${att.kind} ${att.fileName}`);
      toast?.(L("প্রমাণ যোগ হয়েছে", "Proof attached"));
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    } finally {
      setAttachBusy(false);
    }
  };

  const removeClaimAttachment = async (r, id) => {
    if (!canManage || !id) return;
    if (!window.confirm(L("এই ফাইল সরবেন?", "Remove this file?"))) return;
    try {
      const list = withAttachmentRemoved(r.attachments, id);
      await patchClaim(r, { attachments: list }, `Attachment removed ${id}`);
      toast?.(L("সরানো হয়েছে", "Removed"));
    } catch (e) {
      toast?.(` ${e?.message || e}`, "err");
    }
  };

  const recordVendorSettle = async (r) => {
    if (!canManage || !canRecordVendorSettle(r) || saving) return;
    const kind = vendSettleKind;
    const amount = n2(vendSettleAmount);
    const method = vendSettleMethod;
    const invoice = kind === "debit" && vendDebitInvoiceId
      ? (purchaseInvoices.find((x) => x.id === vendDebitInvoiceId) || null)
      : null;
    const code = validateVendorSettle({ claim: r, kind, amount, method, invoice });
    if (code) {
      const [msg, tone] = vendorSettleErrorText(code, bn);
      toast?.(msg, tone);
      return;
    }
    const settleDate = ymd(new Date());
    const label = vendorSettleLabel(kind, bn);
    if (!window.confirm(L(
      `${r.claimNo}: ${label} — ${amount.toFixed(2)}?\n\nস্টক বদলাবে না। একবারই রেকর্ড।`,
      `${r.claimNo}: ${label} — ${amount.toFixed(2)}?\n\nStock does not change. Recorded once only.`,
    ))) return;
    setSaving(true);
    let locked = null;
    let moneyDone = false;
    try {
      const lockFields = claimVendorSettleFields({ kind, amount, method, settleDate, voucher: null, invoice });
      locked = await patchClaim(r, lockFields, `Vendor settle lock ${kind} ${amount}`);
      let voucher = null;
      if (kind === "receive") {
        voucher = await createWarrantyVendorReceiveVoucher({
          shopId, user, profile, isOwner, claim: locked, amount, method, settleDate,
        });
      } else if (kind === "debit") {
        await applyWarrantyVendorDebit({ invoice, amount, user });
      }
      moneyDone = true;
      if (voucher) {
        await patchClaim(locked, claimVendorSettleFields({ kind, amount, method, settleDate, voucher, invoice }),
          `Vendor settle voucher ${voucher.no}`);
      }
      setVendSettleAmount("");
      setVendDebitInvoiceId("");
      toast?.(L(
        kind === "receive"
          ? `কোম্পানি থেকে পাওয়া · ${voucher?.no || ""}`
          : `বিল ডেবিট · ${invoice?.invoiceNo || ""}`,
        kind === "receive"
          ? `Received from company · ${voucher?.no || ""}`
          : `Vendor bill debited · ${invoice?.invoiceNo || ""}`,
      ));
    } catch (e) {
      if (locked && !moneyDone) {
        try {
          await patchClaim(locked, {
            vendorSettleKind: "", vendorSettleAmount: 0, vendorSettleMethod: "",
            vendorSettleDate: "", vendorSettleAt: "",
            vendorReceiveVoucherId: null, vendorReceiveVoucherNo: "", vendorReceiveVoucherCol: "",
            vendorDebitInvoiceId: null, vendorDebitInvoiceNo: "",
          }, "Vendor settle unlock after failure");
        } catch (unlockErr) {
          console.warn("[S4 Warranty] vendor settle unlock failed", unlockErr);
        }
      }
      toast?.(` ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
  const badge = (r) => {
    const st = WARRANTY_STATUSES[r.status] || WARRANTY_STATUSES.received;
    return <span className="si-badge"style={{ color: st.tone }}>{st[bn ? "bn" : "en"]}</span>;
  };

  const sorted = useMemo(() => [...rows].sort((a, b) => String(b.claimDate || b.createdAt || "").localeCompare(String(a.claimDate || a.createdAt || ""))), [rows]);
  const filtered = useMemo(() => sorted.filter((r) => {
    if (statusF === "open" && ["delivered", "cancelled"].includes(r.status)) return false;
    if (statusF === "sent" && r.status !== "sent") return false;
    if (statusF === "done" && !["delivered", "cancelled"].includes(r.status)) return false;
    if (statusF !== "all" && statusF !== "open" && statusF !== "sent" && statusF !== "done" && r.status !== statusF) return false;
    const q = search.trim().toLowerCase();
      return !q || [r.claimNo, r.productName, r.productCode, r.customerName, r.vendorName, r.serialNo, r.invoiceNo, r.note, claimSummary(r)].join(" ").toLowerCase().includes(q);
  }), [sorted, statusF, search]);
  const liveOpen = useMemo(() => rows.filter((r) => !["delivered", "cancelled"].includes(r.status)).length, [rows]);
  const overdue = useMemo(() => {
    const today = ymd(new Date());
    return rows.filter((r) => r.status === "sent" && r.reminderDueDate && String(r.reminderDueDate).slice(0, 10) <= today).length;
  }, [rows]);

  const claimHtml = (r) => {
    const cols = [{ label: L("তথ্য", "Field") }, { label: L("মান", "Value") }];
    const yesNo = (v) => (v ? L("হ্যাঁ", "yes") : L("না", "no"));
    const body = [
      [L("নম্বর", "No"), r.claimNo], [L("তারিখ", "Date"), fmtDay(r.claimDate)], [L("অবস্থা", "Status"), warrantyStatusLabel(r.status)],
      [L("কারণ", "Reason"), warrantyReasonLabel(r.reason)], [L("পণ্য", "Product"), `${r.productName || ""} ${r.productCode || ""}`.trim()],
      [L("পরিমাণ", "Qty"), fq(r.qty)],
      [L("ব্যাটারি Ah", "Battery Ah"), r.batteryAh != null ? String(r.batteryAh) : "—"],
      [L("ব্যাটারি ব্র্যান্ড", "Battery brand"), r.batteryBrand || "—"],
      [L("বেরোনো সিরিয়াল", "Serial out"), r.serialNo || "—"], [L("প্রতিস্থাপন সিরিয়াল", "Serial in"), r.replacedSerialNo || r.serialNo || "—"], [L("কাস্টমার", "Customer"), r.customerName || "—"],
      [L("কোম্পানি", "Company"), r.vendorName || "—"],
      [L("সেলস বিল", "Sales bill"), r.invoiceNo || "—"], [L("বিক্রির তারিখ", "Sale date"), r.invoiceDate ? fmtDay(r.invoiceDate) : "—"],
      [L("ওয়ারেন্টি (মাস)", "Warranty months"), String(r.warrantyMonths || "")],
      [L("ওয়ারেন্টি শেষ", "Warranty end"), r.warrantyEndDate ? fmtDay(r.warrantyEndDate) : "—"],
      [L("খোলার সময় মেয়াদোত্তীর্ণ", "Expired at open"), yesNo(r.warrantyExpiredAtOpen)],
      [L("রিমাইন্ডার দিন", "Remind days"), String(r.reminderDays || "")],
      [L("রিমাইন্ডার তারিখ", "Remind due"), fmtDay(r.reminderDueDate)], [L("নোট", "Note"), r.note || ""],
      [L("কাস্টমার সেটল", "Customer settle"), hasCustomerSettle(r) ? `${r.customerSettleKind} ${r.customerSettleAmount}` : "—"],
      [L("কাস্টমার রিফান্ড ভাউচার", "Customer refund voucher"), r.customerRefundVoucherNo || "—"],
      [L("ভেন্ডর সেটল", "Vendor settle"), hasVendorSettle(r) ? `${r.vendorSettleKind} ${r.vendorSettleAmount}` : "—"],
      [L("ভেন্ডর রিসিভ ভাউচার", "Vendor receive voucher"), r.vendorReceiveVoucherNo || "—"],
      [L("ভেন্ডর ডেবিট বিল", "Vendor debit bill"), r.vendorDebitInvoiceNo || "—"],
      [L("পাঠানো গুদাম", "Sent location"), r.sentLocationName || r.sentLocationId || "—"],
      [L("রিপ্লেস গুদাম", "Replace location"), r.locationName || r.locationId || "—"],
      [L("সংযুক্তি", "Attachments"), String(claimAttachments(r).length)],
    ];
    return generateStatementHTML({
      shopName, title: L("ওয়ারেন্টি / গ্যারান্টি ক্লেইম", "WARRANTY / GUARANTEE CLAIM"), subtitle: [r.claimNo, fmtDay(r.claimDate), r.status].join(" · "),
      cols, rows: body,
    });
  };
  const print = (r) => printWithSettings(claimHtml(r), { lang });
  const claimWhatsAppDoc = (r) => ({
    html: claimHtml(r),
    fileName: pdfFileName(r.claimNo, r.customerName || r.vendorName),
    phone: warrantyClaimSharePhone(r),
    text: docMessage({
      bn, shop: shopName || shop?.companyName || "",
      docType: L("গ্যারান্টি ক্লেইম", "Warranty claim"),
      no: r.claimNo, date: r.claimDate, party: r.customerName || "",
      extra: warrantyClaimShareExtra(r, bn),
    }),
  });

  const shell = (titleLeft, titleRight, children) => (
    <div ref={rootRef} className="si-root"style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title"><strong style={{ color: ACCENT }}>{titleLeft}</strong><span>{titleRight}</span></div>
      {children}
    </div>
  );

  if (view === "form") {
    return shell(L("নতুন গ্যারান্টি ক্লেইম", "New guarantee claim"), L("ব্যাটারি / কোম্পানি গ্যারান্টি", "Battery / Company Guarantee"), (
      <>
        <div className="si-body">
          <div className="si-hint"style={{ padding: "8px 10px", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 8, lineHeight: 1.45 }}>
            <b>{L("৪ ধাপ", "4 steps")}:</b>{" "}
            {L("১ নিলাম → ২ কোম্পানিতে পাঠালাম → ৩ কোম্পানি নতুন দিল (+স্টক) → ৪ কাস্টমারকে দিলাম (−স্টক)।",
              "1 Receive → 2 Sent to company → 3 Company replaced (+stock) → 4 Given to customer (−stock).")}
            <div style={{ marginTop: 4, color: "#9a3412", fontWeight: 700 }}>
              {L("না: দোকানেই ভুল পণ্য বদল → মেনু “দোকানে পণ্য বদল”.", "Not for: in-shop wrong-item swap → menu “Shop Stock Swap”.")}
            </div>
          </div>
          <fieldset className="pm-panel"style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("তথ্য", "Details")}</legend>
            <div className={mobile ? "si-panel-body" : "si-grid2"} style={mobile ? undefined : { gridTemplateColumns: "1fr 1fr 1fr", paddingTop: 3, gap: 8 }}>
              <div className="si-field"><span className="pm-label">{L("তারিখ", "Date")} *</span>
                <DateField className="pm-input"value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="si-field"><span className="pm-label">{L("কারণ", "Reason")} *</span>
                <select className="pm-input"value={reason} onChange={(e) => {
                  const next = e.target.value;
                  setReason(next);
                  setWarrantyMonths(productWarrantyMonths(product || {}, next));
                }}>
                  {WARRANTY_REASONS.map((r) => <option key={r.key} value={r.key}>{r[bn ? "bn" : "en"]}</option>)}
                </select>
              </div>
              <div className="si-field"><span className="pm-label">{L("চেঞ্জ না এলে কত দিনে রিমাইন্ডার", "Remind after (days)")} *</span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <input type="number"min="1"max="365"className="pm-input"style={{ width: 72 }} value={reminderDays}
                    onChange={(e) => setReminderDays(e.target.value)} />
                  {REMINDER_DAY_PRESETS.map((d) => (
                    <button key={d} type="button"className="pm-btn-secondary"style={{ minHeight: 28, padding: "0 8px", fontWeight: reminderDays == d ? 900 : 600 }}
                      onClick={() => setReminderDays(d)}>{d}d</button>
                  ))}
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="pm-panel"style={{ margin: 0 }}>
            <legend className="pm-panel-legend">− {L("পণ্য (কাস্টমার ফেরত এনেছে)", "Product (customer returned)")}</legend>
            <div className="si-panel-body">
              {!product && <ProductPicker products={products} stockOf={stockOf} onPick={(p) => {
                setProduct({ productId: p.id, name: p.name || "", code: p.code || "", unit: p.unit || "Pcs", warrantyMonths: p.warrantyMonths || p.guaranteeMonths || "" });
                setInvoiceLink(null);
                setWarrantyMonths(productWarrantyMonths(p, reason));
                applyProductBatteryDefaults(p);
              }}
                autoFocus={!mobile} mobile={mobile} lang={lang} placeholder={L("নাম / কোড / বারকোড…", "Name / code / barcode…")} />}
              {product && (
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1fr) 100px 140px auto", gap: 6, alignItems: "center" }}>
                  <div><b>{product.name}</b>{product.code ? <span className="si-muted"> · {product.code}</span> : null}
                    <div className="si-muted">{L("দোকান স্টক", "Shop stock")}: {stockOf(product.productId) == null ? "…" : fq(stockOf(product.productId))}</div>
                  </div>
                  <input type="number"min="0"step="any"className="pm-input"style={{ textAlign: "right" }} value={qty} onChange={(e) => setQty(e.target.value)} />
                  <input className="pm-input"placeholder={L("কাস্টমার ইউনিট সিরিয়াল (out)", "Customer unit serial (out)")} value={serialNo} onChange={(e) => setSerialNo(e.target.value)} />
                  <button type="button"className="pm-btn-secondary pm-btn--danger"onClick={() => { setProduct(null); setInvoiceLink(null); setBatteryAh(""); setBatteryBrand(""); }}>✕</button>
                </div>
              )}
              {product && (reason === "battery" || batteryAh || batteryBrand) && (
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "120px minmax(0,1fr)", gap: 6, marginTop: 8 }}>
                  <div className="si-field">
                    <span className="pm-label">{L("অ্যাম্পিয়ার (Ah)", "Amp-hour (Ah)")}</span>
                    <input className="pm-input" inputMode="numeric" value={batteryAh}
                      onChange={(e) => setBatteryAh(e.target.value)} placeholder="70" />
                  </div>
                  <div className="si-field">
                    <span className="pm-label">{L("ব্র্যান্ড", "Brand")}</span>
                    <input className="pm-input" value={batteryBrand}
                      onChange={(e) => setBatteryBrand(e.target.value)} placeholder={L("Amaron / Exide…", "Amaron / Exide…")} />
                  </div>
                </div>
              )}
            </div>
          </fieldset>

          {product && (
            <fieldset className="pm-panel"style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("গ্যারান্টি মেয়াদ (BW02)", "Warranty period (BW02)")}</legend>
              <div className="si-panel-body">
                <div className="si-field"><span className="pm-label">{L("মেয়াদ (মাস)", "Period (months)")} *</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <input type="number"min="0"max="120"className="pm-input"style={{ width: 72 }} value={warrantyMonths}
                      onChange={(e) => setWarrantyMonths(e.target.value)} />
                    {WARRANTY_MONTH_PRESETS.map((m) => (
                      <button key={m} type="button"className="pm-btn-secondary"style={{ minHeight: 28, padding: "0 8px", fontWeight: Number(warrantyMonths) === m ? 900 : 600 }}
                        onClick={() => setWarrantyMonths(m)}>{m}m</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 6, fontWeight: 700, color: periodPreview.expired ? "#b91c1c" : "#0f766e" }}>
                  {periodPreview.end
                    ? (periodPreview.expired
                      ? L(`মেয়াদ শেষ ${String(periodPreview.end).split("-").reverse().join("/")} (বিক্রি ${String(periodPreview.start).split("-").reverse().join("/")})`,
                        `Expired ${periodPreview.end} (sold ${periodPreview.start})`)
                      : L(`মেয়াদ আছে · শেষ ${String(periodPreview.end).split("-").reverse().join("/")} (শুরু ${String(periodPreview.start).split("-").reverse().join("/")})`,
                        `In period · ends ${periodPreview.end} (from ${periodPreview.start})`))
                    : L("বিল/তারিখ ও মাস দিন — শেষ তারিখ দেখাবে", "Set bill/date and months to see end date")}
                </div>
              </div>
            </fieldset>
          )}

          {product && (
            <fieldset className="pm-panel"style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("মূল সেলস বিল (BW01)", "Original sales bill (BW01)")}</legend>
              <div className="si-panel-body">
                {invoiceLink ? (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <b style={{ color: ACCENT }}>{invoiceLink.invoiceNo || "—"}</b>
                      <div className="si-muted">
                        {invoiceLink.invoiceDate ? String(invoiceLink.invoiceDate).split("-").reverse().join("/") : "—"}
                        {invoiceLink.customerName ? ` · ${invoiceLink.customerName}` : ""}
                      </div>
                    </div>
                    <button type="button"className="pm-btn-secondary"onClick={() => setInvoiceLink(null)}>{L("বদলান", "Change")}</button>
                  </div>
                ) : (
                  <>
                    <div className="si-muted"style={{ marginBottom: 4 }}>
                      {L("এই পণ্য যে বিলে বিক্রি হয়েছিল সেটা বেছে নিন (তারিখ = বিক্রির দিন)।", "Pick the bill that sold this item (date = sale day).")}
                    </div>
                    <input className="pm-input"value={invBillQ} onChange={(e) => setInvBillQ(e.target.value)}
                      placeholder={L("বিল নং / কাস্টমার খুঁজুন…", "Search bill no / customer…")} />
                    {billCandidates.length === 0 && (
                      <div className="si-empty"style={{ padding: 8 }}>{L("মিলিয়ে কোনো সেলস বিল পাওয়া যায়নি — পরেও লিংক ছাড়া খোলা যাবে", "No matching sales bill — you can still open without a link")}</div>
                    )}
                    {billCandidates.map((b) => (
                      <button key={b.invoiceId} type="button"className="si-mrow"style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}
                        onClick={() => pickBill(b)}>
                        <b style={{ color: ACCENT }}>{b.invoiceNo}</b>
                        <span className="si-muted"> · {String(b.invoiceDate || "").split("-").reverse().join("/")} · {b.customerName || "—"}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </fieldset>
          )}

          <fieldset className="pm-panel"style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("কাস্টমার (ঐচ্ছিক)", "Customer (optional)")}</legend>
            <div className="si-panel-body">
              {customer ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <b>{customer.customerName}</b>
                  <button type="button"className="pm-btn-secondary"onClick={() => { setCustomer(null); setCustomerQ(""); }}>{L("বদলান", "Change")}</button>
                </div>
              ) : (
                <>
                  <input className="pm-input"value={customerQ} onChange={(e) => setCustomerQ(e.target.value)} placeholder={L("নাম বা মোবাইল…", "Name or mobile…")} />
                  {custHits.map((c) => (
                    <button key={c.id} type="button"className="si-mrow"style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}
                      onClick={() => { setCustomer(c); setCustomerQ(""); }}>{c.customerName} <span className="si-muted">{c.mobileNumber || ""}</span></button>
                  ))}
                </>
              )}
            </div>
          </fieldset>

          <fieldset className="pm-panel"style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("কোম্পানি / সাপ্লায়ার *", "Company / Supplier *")}</legend>
            <div className="si-panel-body">
              {vendor ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <b>{vendor.vendorName}</b>
                  <button type="button"className="pm-btn-secondary"onClick={() => { setVendor(null); setVendorQ(""); }}>{L("বদলান", "Change")}</button>
                </div>
              ) : (
                <>
                  <input className="pm-input"value={vendorQ} onChange={(e) => setVendorQ(e.target.value)} placeholder={L("কোম্পানির নাম…", "Company name…")} />
                  {vendHits.map((v) => (
                    <button key={v.id} type="button"className="si-mrow"style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}
                      onClick={() => { setVendor(v); setVendorQ(""); }}>{v.vendorName}</button>
                  ))}
                </>
              )}
            </div>
          </fieldset>

          <fieldset className="pm-panel"style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("নোট", "Note")}</legend>
            <div className="si-panel-body">
              <input className="pm-input"value={note} onChange={(e) => setNote(e.target.value)} placeholder={L("ঐচ্ছিক", "Optional")} />
            </div>
          </fieldset>
        </div>
        <div className={`si-actions${mobile ? "si-sticky-actions" : ""}`}>
          <button type="button"className="pm-btn-secondary"disabled={saving} onClick={backToList}>← {L("তালিকা", "List")}</button>
          <span className="si-toolbar-gap" />
          <button type="button"title="Ctrl+S" className="pm-btn pm-btn--primary"disabled={saving || !product} onClick={saveNew}>
            {saving ? "…" : ` ${L("ক্লেইম খুলুন", "Open claim")}${hintSave(saving)}`}
          </button>
        </div>
      </>
    ));
  }

  if (view === "edit" && sel && editForm) {
    const r = rows.find((x) => x.id === sel.id) || sel;
    const received = r.status === "received";
    return shell(<>{r.claimNo} · {L("এডিট", "Edit")}</>, L("খোলা ক্লেইম সম্পাদনা (BW10)", "Edit open claim (BW10)"), (
      <>
        <div className="si-body" style={{ display: "grid", gap: 10 }}>
          <div className="si-hint" style={{ padding: "8px 10px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8 }}>
            {received
              ? L("রিসিভড অবস্থায় পণ্য/পরিমাণও বদলানো যায়। পাঠানোর পর পণ্য লক।", "While received you can change product/qty. After send, product is locked.")
              : L("পাঠানো অবস্থা — পণ্য/পরিমাণ লক; সিরিয়াল, কাস্টমার, কোম্পানি, নোট সম্পাদনযোগ্য।", "Sent — product/qty locked; serial, customer, company, note editable.")}
          </div>
          {received && (
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("পণ্য", "Product")}</legend>
              <div className="si-panel-body">
                {product ? (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b>{product.name}{product.code ? ` · ${product.code}` : ""}</b>
                    <button type="button" className="pm-btn-secondary" onClick={() => setProduct(null)}>{L("বদলান", "Change")}</button>
                  </div>
                ) : (
                  <ProductPicker products={products} stockOf={stockOf}
                    onPick={(p) => {
                      setProduct({ productId: p.id, name: p.name || "", code: p.code || "", unit: p.unit || "Pcs" });
                      const ah = productBatteryAh(p);
                      const brand = productBatteryBrand(p);
                      setEditForm((f) => ({
                        ...f,
                        batteryAh: ah != null ? String(ah) : f.batteryAh,
                        batteryBrand: brand || f.batteryBrand,
                      }));
                    }}
                    mobile={mobile} lang={lang} />
                )}
                <div className="si-field" style={{ marginTop: 8 }}>
                  <span className="pm-label">{L("পরিমাণ", "Qty")}</span>
                  <input className="pm-input" inputMode="decimal" value={editForm.qty}
                    onChange={(e) => setEditForm((f) => ({ ...f, qty: e.target.value }))} />
                </div>
              </div>
            </fieldset>
          )}
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("বিবরণ", "Details")}</legend>
            <div className="si-panel-body" style={{ display: "grid", gap: 8 }}>
              <div className="si-field">
                <span className="pm-label">{L("কারণ", "Reason")}</span>
                <select className="pm-input" value={editForm.reason}
                  onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))}>
                  {WARRANTY_REASONS.map((x) => (
                    <option key={x.key} value={x.key}>{x[bn ? "bn" : "en"]}</option>
                  ))}
                </select>
              </div>
              <div className="si-field">
                <span className="pm-label">{L("সিরিয়াল (out)", "Serial (out)")}</span>
                <input className="pm-input" value={editForm.serialNo}
                  onChange={(e) => setEditForm((f) => ({ ...f, serialNo: e.target.value }))} />
              </div>
              <div className="si-field">
                <span className="pm-label">{L("রিমাইন্ডার দিন", "Reminder days")}</span>
                <input className="pm-input" inputMode="numeric" value={editForm.reminderDays}
                  onChange={(e) => setEditForm((f) => ({ ...f, reminderDays: e.target.value }))} />
              </div>
              <div className="si-field">
                <span className="pm-label">{L("গ্যারান্টি মাস", "Warranty months")}</span>
                <input className="pm-input" inputMode="numeric" value={editForm.warrantyMonths}
                  onChange={(e) => setEditForm((f) => ({ ...f, warrantyMonths: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "120px minmax(0,1fr)", gap: 6 }}>
                <div className="si-field">
                  <span className="pm-label">{L("Ah", "Ah")}</span>
                  <input className="pm-input" inputMode="numeric" value={editForm.batteryAh}
                    onChange={(e) => setEditForm((f) => ({ ...f, batteryAh: e.target.value }))} />
                </div>
                <div className="si-field">
                  <span className="pm-label">{L("ব্র্যান্ড", "Brand")}</span>
                  <input className="pm-input" value={editForm.batteryBrand}
                    onChange={(e) => setEditForm((f) => ({ ...f, batteryBrand: e.target.value }))} />
                </div>
              </div>
              <div className="si-field">
                <span className="pm-label">{L("নোট", "Note")}</span>
                <input className="pm-input" value={editForm.note}
                  onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
          </fieldset>
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("কাস্টমার", "Customer")}</legend>
            <div className="si-panel-body">
              {customer ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <b>{customer.customerName}</b>
                  <button type="button" className="pm-btn-secondary" onClick={() => { setCustomer(null); setCustomerQ(""); }}>{L("বদলান", "Change")}</button>
                </div>
              ) : (
                <>
                  <input className="pm-input" value={customerQ} onChange={(e) => setCustomerQ(e.target.value)} placeholder={L("নাম বা মোবাইল…", "Name or mobile…")} />
                  {custHits.map((c) => (
                    <button key={c.id} type="button" className="si-mrow" style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}
                      onClick={() => { setCustomer(c); setCustomerQ(""); }}>{c.customerName} <span className="si-muted">{c.mobileNumber || ""}</span></button>
                  ))}
                </>
              )}
            </div>
          </fieldset>
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("কোম্পানি", "Company")}</legend>
            <div className="si-panel-body">
              {vendor ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <b>{vendor.vendorName}</b>
                  <button type="button" className="pm-btn-secondary" onClick={() => { setVendor(null); setVendorQ(""); }}>{L("বদলান", "Change")}</button>
                </div>
              ) : (
                <>
                  <input className="pm-input" value={vendorQ} onChange={(e) => setVendorQ(e.target.value)} placeholder={L("কোম্পানির নাম…", "Company name…")} />
                  {vendHits.map((v) => (
                    <button key={v.id} type="button" className="si-mrow" style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}
                      onClick={() => { setVendor(v); setVendorQ(""); }}>{v.vendorName}</button>
                  ))}
                </>
              )}
            </div>
          </fieldset>
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("মূল বিল", "Original bill")}</legend>
            <div className="si-panel-body">
              {invoiceLink ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b>{claimInvoiceLabel({ ...invoiceLink }, bn)}</b>
                  <button type="button" className="pm-btn-secondary" onClick={() => setInvoiceLink(null)}>{L("সরান", "Clear")}</button>
                </div>
              ) : (
                <>
                  <input className="pm-input" value={invBillQ} onChange={(e) => setInvBillQ(e.target.value)} placeholder={L("বিল নম্বর…", "Bill no…")} />
                  {billCandidates.slice(0, 8).map((b) => (
                    <button key={b.invoiceId} type="button" className="si-mrow" style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}
                      onClick={() => pickBill(b)}>{b.invoiceNo} · {fmtDay(b.invoiceDate)} · {b.customerName}</button>
                  ))}
                </>
              )}
            </div>
          </fieldset>
        </div>
        <div className={`si-actions${mobile ? "si-sticky-actions" : ""}`}>
          <button type="button" className="pm-btn-secondary" disabled={saving} onClick={backFromEdit}>← {L("বিস্তারিত", "Detail")}</button>
          <span className="si-toolbar-gap" />
          <button type="button" title="Ctrl+S" className="pm-btn pm-btn--primary" disabled={saving} onClick={saveEdit}>
            {saving ? "…" : `${L("সেভ", "Save")}${hintSave(saving)}`}
          </button>
        </div>
      </>
    ));
  }

  if (view === "detail" && sel) {
    const r = rows.find((x) => x.id === sel.id) || sel;
    const st = WARRANTY_STATUSES[r.status] || WARRANTY_STATUSES.received;
    const today = ymd(new Date());
    const isOverdue = r.status === "sent" && r.reminderDueDate && String(r.reminderDueDate).slice(0, 10) <= today;
    const stepOf = { received: 1, sent: 2, replaced: 3, delivered: 4, cancelled: 0 };
    const step = stepOf[r.status] || 0;
    const stepLabel = [
      L("১/৪ নিলাম", "1/4 Received"),
      L("২/৪ পাঠানো", "2/4 Sent"),
      L("৩/৪ কোম্পানি নতুন (+স্টক)", "3/4 Company replaced (+stock)"),
      L("৪/৪ কাস্টমারকে দেওয়া (−স্টক)", "4/4 Given to customer (−stock)"),
    ];
    return shell(<>{r.claimNo} {badge(r)}</>, L("ব্যাটারি / কোম্পানি গ্যারান্টি", "Battery / Company Guarantee"), (
      <>
        <div className="si-body">
          {isOverdue && (
            <div style={{ padding: 12, marginBottom: 8, borderRadius: 10, background: "#fef2f2", border: "2px solid #dc2626", color: "#991b1b", fontWeight: 800 }}>
              {L("কোম্পানি এখনো নতুন দেয়নি — এখনই ফলো-আপ করুন!", "Company has not replaced yet — follow up NOW!")}
              <div style={{ fontWeight: 600, marginTop: 4 }}>{L("রিমাইন্ডার তারিখ", "Reminder date")}: {fmtDay(r.reminderDueDate)}</div>
            </div>
          )}
          {step > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
              {stepLabel.map((lab, i) => (
                <span key={lab} style={{
                  fontSize: 11, fontWeight: 800, padding: "4px 8px", borderRadius: 999,
                  background: i + 1 === step ? st.tone : (i + 1 < step ? "#dcfce7" : "#e2e8f0"),
                  color: i + 1 === step ? "#fff" : (i + 1 < step ? "#166534" : "#64748b"),
                }}>{lab}</span>
              ))}
            </div>
          )}
          <fieldset className="pm-panel"style={{ margin: 0 }}>
            <legend className="pm-panel-legend"style={{ background: st.tone }}>{st[bn ? "bn" : "en"]}</legend>
            <div className="si-panel-body"style={{ paddingTop: 4, display: "grid", gap: 4 }}>
              <div><b style={{ color: ACCENT }}>{r.claimNo}</b> · {fmtDay(r.claimDate)} · {warrantyReasonLabel(r.reason, bn)}</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{r.productName}{r.productCode ? ` · ${r.productCode}` : ""} × {fq(r.qty)} {r.unit || ""}</div>
              {(r.batteryAh || r.batteryBrand) && (
                <div className="si-muted">
                  {r.batteryBrand ? <b>{r.batteryBrand}</b> : null}
                  {r.batteryBrand && r.batteryAh ? " · " : ""}
                  {r.batteryAh ? `${r.batteryAh} Ah` : ""}
                </div>
              )}
              {r.serialNo && <div className="si-muted">{L("কাস্টমার ইউনিট সিরিয়াল (out)", "Customer unit serial (out)")}: {r.serialNo}</div>}
              {(r.replacedSerialNo || r.serialNo || (r.status === "replaced" || r.status === "delivered")) && (
                <div className="si-muted">{L("কোম্পানি নতুন সিরিয়াল (in)", "Company new serial (in)")}: {r.replacedSerialNo || r.serialNo || "—"}</div>
              )}
              <div>{L("মূল বিল", "Original bill")}: <b>{claimInvoiceLabel(r, bn) || "—"}</b></div>
              <div style={{ color: r.warrantyExpiredAtOpen ? "#b91c1c" : undefined }}>
                {L("গ্যারান্টি মেয়াদ", "Warranty period")}:{" "}
                <b>
                  {r.warrantyMonths ? `${r.warrantyMonths} ${L("মাস", "mo")}` : "—"}
                  {r.warrantyEndDate ? ` · ${L("শেষ", "ends")} ${fmtDay(r.warrantyEndDate)}` : ""}
                  {r.warrantyExpiredAtOpen ? ` · ${L("মেয়াদোত্তীর্ণ", "expired")}` : ""}
                </b>
              </div>
              {(r.status === "replaced" || r.status === "delivered") && (
                <div>
                  {L("কোম্পানির নতুন পণ্য", "Company replacement")}:{" "}
                  <b>{r.replacedProductName || r.productName || "—"}</b>
                  {(r.replacedProductCode || r.productCode) ? ` · ${r.replacedProductCode || r.productCode}` : ""}
                  {r.replacedProductId && r.replacedProductId !== r.productId ? ` · ${L("আলাদা SKU", "different SKU")}` : ""}
                </div>
              )}
              {r.status === "received" && canManage && godownsOn && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
                  <BillLocationPicker locations={locations} value={sendLocationId}
                    onChange={setSendLocationId} bn={bn} side="sale"
                    className="si-field" />
                  <div className="si-muted">{L("পাঠানোর গুদাম (রেকর্ড) — স্টক এখনো বাড়ে না", "Send-from godown (record) — stock still does not rise")}</div>
                </div>
              )}
              {(r.sentLocationName || r.sentLocationId) && (
                <div className="si-muted">{L("পাঠানোর গুদাম", "Sent from")}: {r.sentLocationName || r.sentLocationId}</div>
              )}
              {(r.locationName || r.locationId) && (r.status === "replaced" || r.status === "delivered") && (
                <div className="si-muted">{L("রিপ্লেস স্টক গুদাম", "Replace stock godown")}: {r.locationName || r.locationId}</div>
              )}
              {r.status === "sent" && canManage && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
                  <div className="pm-label"style={{ marginBottom: 4 }}>{L("রিপ্লেসমেন্ট পণ্য (BW03) — আলাদা মডেলও হতে পারে", "Replacement product (BW03) — may be a different model")}</div>
                  {!replaceProduct && (
                    <ProductPicker products={products} stockOf={stockOf}
                      onPick={(p) => setReplaceProduct({ productId: p.id, name: p.name || "", code: p.code || "", unit: p.unit || "Pcs" })}
                      mobile={mobile} lang={lang}
                      placeholder={L("নতুন পণ্য খুঁজুন (খালি রাখলে আগেরটাই)…", "Find new product (leave blank = same)…")} />
                  )}
                  {replaceProduct && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <b>{replaceProduct.name}{replaceProduct.code ? ` · ${replaceProduct.code}` : ""}</b>
                      <button type="button"className="pm-btn-secondary"onClick={() => setReplaceProduct(null)}>{L("বদলান", "Change")}</button>
                    </div>
                  )}
                  {!replaceProduct && (
                    <button type="button"className="pm-btn-secondary"style={{ marginTop: 6 }}
                      onClick={() => setReplaceProduct({ productId: r.productId, name: r.productName || "", code: r.productCode || "", unit: r.unit || "Pcs" })}>
                      {L("আগের পণ্যই রাখুন", "Keep same product")}
                    </button>
                  )}
                  <div className="si-field"style={{ marginTop: 8 }}>
                    <span className="pm-label">{L("নতুন সিরিয়াল (in) — BW04", "New serial (in) — BW04")}</span>
                    <input className="pm-input"value={replacedSerialNo} onChange={(e) => setReplacedSerialNo(e.target.value)}
                      placeholder={r.serialNo ? L(`খালি = আগেরটা (${r.serialNo})`, `blank = same (${r.serialNo})`) : L("কোম্পানির নতুন সিরিয়াল", "Company new serial")} />
                  </div>
                  {godownsOn && (
                    <div style={{ marginTop: 8 }}>
                      <BillLocationPicker locations={locations} value={replaceLocationId}
                        onChange={setReplaceLocationId} bn={bn} side="purchase"
                        className="si-field" />
                      <div className="si-muted">{L("নতুন ইউনিট এই গুদামে স্টকে ঢুকবে (BW07)", "New unit stock lands in this godown (BW07)")}</div>
                    </div>
                  )}
                </div>
              )}
              <div>{L("কাস্টমার", "Customer")}: <b>{r.customerName || "—"}</b>{r.customerMobile ? ` · ${r.customerMobile}` : ""}</div>
              <div>{L("কোম্পানি", "Company")}: <b>{r.vendorName || "—"}</b></div>
              <div>{L("রিমাইন্ডার", "Reminder")}: <b>{r.reminderDays || "—"} {L("দিন", "days")}</b>
                {r.reminderDueDate ? ` · ${L("শেষ তারিখ", "due")} ${fmtDay(r.reminderDueDate)}` : ` · ${L("কোম্পানিতে পাঠালে শুরু", "starts when sent")}`}</div>
              {r.note && <div className="si-note">{r.note}</div>}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e2e8f0", display: "grid", gap: 8 }}>
                <div className="pm-label">{L("প্রমাণ / ছবি / PDF (BW08)", "Proof / photo / PDF (BW08)")}
                  {" · "}{claimAttachments(r).length}/{WARRANTY_ATTACH_MAX}</div>
                {claimAttachments(r).map((a) => {
                  const isPdf = String(a.file || "").startsWith("data:application/pdf");
                  return (
                    <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", border: "1px solid #e2e8f0", borderRadius: 8, padding: 6 }}>
                      {isPdf ? (
                        <span className="si-muted" style={{ fontWeight: 800, minWidth: 48 }}>PDF</span>
                      ) : (
                        <img src={a.file} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, background: "#f1f5f9" }} />
                      )}
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <b>{a.label || attachKindLabel(a.kind, bn)}</b>
                        <div className="si-muted">{a.fileName || a.kind}</div>
                      </div>
                      <button type="button" className="pm-btn-secondary" onClick={() => openDocFile({ file: a.file, label: a.label || a.fileName })}>
                        {L("দেখুন", "View")}
                      </button>
                      {canManage && r.status !== "cancelled" && (
                        <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => removeClaimAttachment(r, a.id)}>
                          {L("সরান", "Remove")}
                        </button>
                      )}
                    </div>
                  );
                })}
                {canManage && canAddAttachment(r) && (
                  <>
                    <div className="si-field">
                      <span className="pm-label">{L("ধরন", "Kind")}</span>
                      <select className="pm-input" value={attachKind} onChange={(e) => setAttachKind(e.target.value)}>
                        {WARRANTY_ATTACH_KINDS.map((k) => (
                          <option key={k.key} value={k.key}>{k[bn ? "bn" : "en"]}</option>
                        ))}
                      </select>
                    </div>
                    <input ref={attachFileRef} type="file" accept="image/*,application/pdf" capture="environment"
                      style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) addClaimAttachment(r, f); }} />
                    <button type="button" className="pm-btn-secondary" disabled={attachBusy || saving}
                      onClick={() => attachFileRef.current?.click()}>
                      {attachBusy ? "…" : L("ছবি / PDF যোগ", "Add photo / PDF")}
                    </button>
                  </>
                )}
                {!claimAttachments(r).length && (
                  <div className="si-muted">{L("কোম্পানির জন্য ব্যাটারি/সিরিয়াল/বিলের প্রমাণ যোগ করুন", "Attach battery / serial / bill proof for the company")}</div>
                )}
              </div>
              {hasCustomerSettle(r) && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
                  <div className="pm-label">{L("কাস্টমার টাকা (BW05)", "Customer money (BW05)")}</div>
                  <div>
                    <b>{customerSettleLabel(r.customerSettleKind, bn)}</b>
                    {" · "}
                    {Number(r.customerSettleAmount || 0).toFixed(2)}
                    {r.customerSettleMethod ? ` · ${PAY_METHODS.find((m) => m.key === r.customerSettleMethod)?.[bn ? "bn" : "en"] || r.customerSettleMethod}` : ""}
                    {r.customerRefundVoucherNo ? ` · ${r.customerRefundVoucherNo}` : ""}
                    {r.customerSettleDate ? ` · ${fmtDay(r.customerSettleDate)}` : ""}
                  </div>
                </div>
              )}
              {canManage && canRecordCustomerSettle(r) && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e2e8f0", display: "grid", gap: 8 }}>
                  <div className="pm-label">{L("কাস্টমার টাকা — রিফান্ড / বিল ক্রেডিট (স্টক নয়)", "Customer money — refund / bill credit (no stock)")}</div>
                  <div className="si-field">
                    <span className="pm-label">{L("ধরন", "Kind")}</span>
                    <select className="pm-input" value={custSettleKind} onChange={(e) => setCustSettleKind(e.target.value)}>
                      {Object.values(CUSTOMER_SETTLE_KINDS).map((k) => (
                        <option key={k.key} value={k.key}>{k[bn ? "bn" : "en"]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="si-field">
                    <span className="pm-label">{L("পরিমাণ", "Amount")}</span>
                    <input className="pm-input" inputMode="decimal" value={custSettleAmount}
                      onChange={(e) => setCustSettleAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  {custSettleKind === "refund" && (
                    <div className="si-field">
                      <span className="pm-label">{L("মাধ্যম", "Method")}</span>
                      <select className="pm-input" value={custSettleMethod} onChange={(e) => setCustSettleMethod(e.target.value)}>
                        {PAY_METHODS.map((m) => (
                          <option key={m.key} value={m.key}>{m[bn ? "bn" : "en"]}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {custSettleKind === "credit" && (
                    <div className="si-muted">
                      {r.invoiceId
                        ? (() => {
                          const inv = salesInvoices.find((x) => x.id === r.invoiceId);
                          const due = inv ? invoiceBalanceDue(inv) : null;
                          return L(
                            `মূল বিল ${r.invoiceNo || "—"} · বাকি ${due == null ? "—" : due.toFixed(2)}`,
                            `Bill ${r.invoiceNo || "—"} · due ${due == null ? "—" : due.toFixed(2)}`,
                          );
                        })()
                        : L("মূল বিল লিংক নেই — আগে বিল বেঁধে নিন বা রিফান্ড ব্যবহার করুন", "No linked bill — link a bill first or use refund")}
                    </div>
                  )}
                  <button type="button" className="pm-btn-secondary" disabled={saving}
                    onClick={() => recordCustomerSettle(r)}>
                    {L("কাস্টমার টাকা রেকর্ড", "Record customer money")}
                  </button>
                </div>
              )}
              {hasVendorSettle(r) && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
                  <div className="pm-label">{L("কোম্পানি টাকা (BW06)", "Company money (BW06)")}</div>
                  <div>
                    <b>{vendorSettleLabel(r.vendorSettleKind, bn)}</b>
                    {" · "}
                    {Number(r.vendorSettleAmount || 0).toFixed(2)}
                    {r.vendorSettleMethod ? ` · ${PAY_METHODS.find((m) => m.key === r.vendorSettleMethod)?.[bn ? "bn" : "en"] || r.vendorSettleMethod}` : ""}
                    {r.vendorReceiveVoucherNo ? ` · ${r.vendorReceiveVoucherNo}` : ""}
                    {r.vendorDebitInvoiceNo ? ` · ${r.vendorDebitInvoiceNo}` : ""}
                    {r.vendorSettleDate ? ` · ${fmtDay(r.vendorSettleDate)}` : ""}
                  </div>
                </div>
              )}
              {canManage && canRecordVendorSettle(r) && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e2e8f0", display: "grid", gap: 8 }}>
                  <div className="pm-label">{L("কোম্পানি টাকা — রিসিভ / বিল ডেবিট (স্টক নয়)", "Company money — receive / bill debit (no stock)")}</div>
                  <div className="si-field">
                    <span className="pm-label">{L("ধরন", "Kind")}</span>
                    <select className="pm-input" value={vendSettleKind} onChange={(e) => setVendSettleKind(e.target.value)}>
                      {Object.values(VENDOR_SETTLE_KINDS).map((k) => (
                        <option key={k.key} value={k.key}>{k[bn ? "bn" : "en"]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="si-field">
                    <span className="pm-label">{L("পরিমাণ", "Amount")}</span>
                    <input className="pm-input" inputMode="decimal" value={vendSettleAmount}
                      onChange={(e) => setVendSettleAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  {vendSettleKind === "receive" && (
                    <div className="si-field">
                      <span className="pm-label">{L("মাধ্যম", "Method")}</span>
                      <select className="pm-input" value={vendSettleMethod} onChange={(e) => setVendSettleMethod(e.target.value)}>
                        {PAY_METHODS.map((m) => (
                          <option key={m.key} value={m.key}>{m[bn ? "bn" : "en"]}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {vendSettleKind === "debit" && (() => {
                    const bills = vendorOpenPurchaseBills({
                      invoices: purchaseInvoices,
                      vendorId: r.vendorId || null,
                      vendorName: r.vendorName || "",
                    });
                    return (
                      <div className="si-field">
                        <span className="pm-label">{L("কোম্পানির বাকি বিল", "Vendor open bill")}</span>
                        <select className="pm-input" value={vendDebitInvoiceId}
                          onChange={(e) => setVendDebitInvoiceId(e.target.value)}>
                          <option value="">{L("বিল বেছে নিন…", "Pick a bill…")}</option>
                          {bills.map((b) => (
                            <option key={b.invoiceId} value={b.invoiceId}>
                              {b.invoiceNo} · {L("বাকি", "due")} {b.balanceDue.toFixed(2)} · {fmtDay(b.invoiceDate)}
                            </option>
                          ))}
                        </select>
                        {!bills.length && (
                          <div className="si-muted">{L("এই কোম্পানির বাকি বিল নেই", "No open bills for this company")}</div>
                        )}
                        {vendDebitInvoiceId && (() => {
                          const inv = purchaseInvoices.find((x) => x.id === vendDebitInvoiceId);
                          return inv ? (
                            <div className="si-muted">{L("বাকি", "Due")}: {purchaseBalanceDue(inv).toFixed(2)}</div>
                          ) : null;
                        })()}
                      </div>
                    );
                  })()}
                  <button type="button" className="pm-btn-secondary" disabled={saving}
                    onClick={() => recordVendorSettle(r)}>
                    {L("কোম্পানি টাকা রেকর্ড", "Record company money")}
                  </button>
                </div>
              )}
            </div>
          </fieldset>
        </div>
        <div className={`si-actions${mobile ? "si-sticky-actions" : ""}`} style={{ flexWrap: "wrap" }}>
          <button type="button"className="pm-btn-secondary"onClick={backToList}>← {L("তালিকা", "List")}</button>
          {canPrint && <button type="button"className="pm-btn-secondary"onClick={() => print(r)}>{L("প্রিন্ট", "Print")}</button>}
          {canPrint && r.status !== "cancelled" && (
            <WhatsAppButton lang={lang} toast={toast} className="pm-btn-secondary" build={() => claimWhatsAppDoc(r)} />
          )}
          {canManage && canEditOpenClaim(r) && (
            <button type="button" className="pm-btn-secondary" disabled={saving} onClick={() => openEdit(r)}>
              {L("এডিট", "Edit")}
            </button>
          )}
          <span className="si-toolbar-gap" />
          {canManage && canAdvance(r.status, "send") && (
            <button type="button"className="pm-btn pm-btn--primary"disabled={saving} onClick={() => sendToCompany(r)}>
              {L("২) কোম্পানিতে পাঠালাম", "2) Sent to company")}
            </button>
          )}
          {canManage && canAdvance(r.status, "replace") && (
            <button type="button"className="pm-btn pm-btn--primary"disabled={saving} onClick={() => markReplaced(r)}
              style={{ background: "#15803d" }}>
              {L("৩) কোম্পানি নতুন দিয়েছে (+স্টক)", "3) Company replaced (+stock)")}
            </button>
          )}
          {canManage && canAdvance(r.status, "deliver") && (
            <button type="button"className="pm-btn pm-btn--primary"disabled={saving} onClick={() => markDelivered(r)}
              style={{ background: "#0f766e" }}>
              {L("৪) কাস্টমারকে দিয়েছি (−স্টক)", "4) Given to customer (−stock)")}
            </button>
          )}
          {canManage && canAdvance(r.status, "cancel") && (
            <button type="button"className="pm-btn-secondary pm-btn--danger"disabled={saving} onClick={() => cancelClaim(r)}>{L("বাতিল", "Cancel")}</button>
          )}
          {canDelete && r.status === "cancelled" && (
            <button type="button"className="pm-btn-secondary pm-btn--danger"onClick={() => deleteClaim(r)}>{L("মুছুন", "Delete")}</button>
          )}
        </div>
      </>
    ));
  }

  return shell(L("ব্যাটারি / কোম্পানি গ্যারান্টি", "Battery / Company Guarantee"), `${liveOpen} ${L("খোলা", "open")}${overdue ? ` · ${overdue}` : ""}`, (
    <>
      <div className="si-hint"style={{ margin: "0 8px 8px", padding: "8px 10px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8, lineHeight: 1.45 }}>
        <b>{L("কোম্পানি গ্যারান্টি", "Company guarantee")}</b>
        {" — "}
        {L("কাস্টমার → কোম্পানি → নতুন পণ্য। দোকানেই বদল এখানে নয়।", "Customer → company → new unit. In-shop swap is a different menu.")}
      </div>
      <div className="si-toolbar">
        {canManage && <button type="button"className="pm-btn pm-btn--primary"onClick={openNew}>+ {L("নতুন ক্লেইম", "New Claim")}</button>}
        <span className="si-toolbar-gap" />
        <div className="si-search"style={{ minWidth: mobile ? "100%" : 240 }}>
          <input className="pm-input"value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("নম্বর, পণ্য, কাস্টমার, কোম্পানি…", "No, product, customer, company…")} />
          {search && <button type="button"onClick={() => setSearch("")}>✕</button>}
        </div>
        <select className="pm-input"style={{ width: mobile ? "100%" : 160 }} value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="open">{L("চলমান", "In progress")}</option>
          <option value="sent">{L("কোম্পানিতে বাকি", "Waiting on company")}</option>
          <option value="done">{L("শেষ / বাতিল", "Done / cancelled")}</option>
          <option value="all">{L("সব", "All")}</option>
        </select>
      </div>
      {overdue > 0 && (
        <div style={{ margin: "0 8px 8px", padding: 10, borderRadius: 10, background: "#fef2f2", border: "2px solid #dc2626", fontWeight: 800, color: "#991b1b" }}>
           {L(`${overdue}টি ক্লেইমে কোম্পানি এখনো চেঞ্জ দেয়নি — বেল/নোটিফ দেখুন`, `${overdue} claim(s) still waiting on company change — check bell/notify`)}
        </div>
      )}
      <div className="si-main is-all">
        <div className="si-box">
          {filtered.length > 0 && (mobile ? filtered.map((r) => (
            <button key={r.id} type="button"className="si-mrow"onClick={() => { setSel(r); setView("detail"); }}
              style={r.status === "cancelled" ? { opacity: 0.55 } : r.status === "sent" && r.reminderDueDate && String(r.reminderDueDate) <= ymd(new Date()) ? { borderLeft: "4px solid #dc2626" } : undefined}>
              <div className="si-mrow-top"><span style={{ color: ACCENT }}>{r.claimNo}</span>{badge(r)}</div>
              <div className="si-mrow-sub"><span>{fmtDay(r.claimDate)} · {warrantyReasonLabel(r.reason, bn)}</span><span>{r.vendorName || ""}</span></div>
              <div className="si-mrow-sub"><span>{claimSummary(r)}</span></div>
            </button>
          )) : (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 78 }}>{L("তারিখ", "Date")}</th>
                <th style={{ width: 88 }}>{L("নম্বর", "No")}</th>
                <th style={{ width: 110 }}>{L("কারণ", "Reason")}</th>
                <th>{L("পণ্য / পার্টি", "Product / parties")}</th>
                <th style={{ width: 90 }}>{L("রিমাইন্ডার", "Remind")}</th>
                <th style={{ width: 130 }} className="si-center">{L("অবস্থা", "Status")}</th>
              </tr></thead>
              <tbody>
                {filtered.map((r) => {
                  const late = r.status === "sent" && r.reminderDueDate && String(r.reminderDueDate).slice(0, 10) <= ymd(new Date());
                  return (
                    <tr key={r.id} className="pm-clickable"onClick={() => { setSel(r); setView("detail"); }}
                      style={r.status === "cancelled" ? { color: "#6b7280" } : late ? { background: "#fef2f2" } : undefined}>
                      <td>{fmtDay(r.claimDate)}</td>
                      <td className="si-strong"style={{ color: r.status === "cancelled" ? undefined : ACCENT }}>{r.claimNo}</td>
                      <td>{warrantyReasonLabel(r.reason, bn)}</td>
                      <td title={claimSummary(r)}>{claimSummary(r)}</td>
                      <td style={late ? { color: "#b91c1c", fontWeight: 800 } : undefined}>
                        {r.reminderDueDate ? fmtDay(r.reminderDueDate) : `${r.reminderDays || "—"}d`}
                        {late ? " " : ""}
                      </td>
                      <td className="si-center">{badge(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}
          {!filtered.length && (
            <div className="si-empty">
              {rows.length
                ? L("এই ফিল্টারে কিছু নেই", "Nothing matches")
                : L("ব্যাটারি/কোম্পানি গ্যারান্টি এখানে — নতুন ক্লেইম চাপুন", "Battery / company guarantee here — tap New Claim")}
            </div>
          )}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{L("দেখাচ্ছে", "Showing")} <b>{filtered.length}</b> / {rows.length}</span>
        <span>{L("১ নিলাম → ২ পাঠাও → ৩ নতুন (+স্টক) → ৪ দাও (−স্টক)", "1 Receive → 2 Send → 3 Replace (+stock) → 4 Deliver (−stock)")}</span>
      </div>
    </>
  ));
}
