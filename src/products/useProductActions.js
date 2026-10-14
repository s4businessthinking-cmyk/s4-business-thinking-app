import { STOCK_COLLECTIONS, buildStockLedgerEntry, createStockLedgerEntry } from "../inventory/stockManagementService";
import { code128SvgMarkup } from "../product-master/code128.js";
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from "../backend/firestore";
import { compareProductNames, isActiveProduct, isBlankProduct, productSearchText } from "../app/mainAppHelpers.js";
import { db } from "../firebase-config";
import { logAudit } from "../utils/auditLog.js";
import { nsmatch } from "../shared/appShared.jsx";
import { offlineBulkUpsert, offlineClearShopCollection, offlineCreate, offlineGetById, offlineList, offlinePurgeLocal, offlineUpdate } from "../offline/offlineRepository";
import { printWithSettings } from "../print/printSettings.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { useMemo } from "react";

export function useProductActions({ canManageProducts, canSeeProductCost, clearingProducts, createEmptyPmForm, hErr, isOwner, lang, pmCatFilter, pmEditId, pmForm, pmOverSales, pmReset, pmSearch, productBulkDeleteRef, productMaintenanceId, productMaintenanceRef, productReplacementActive, products, profile, setClearingProducts, setPmEditId, setPmForm, setPmOverSales, setPmPickForSales, setPmShowAdd, setProductMaintenance, setProductReplacementActive, setProducts, setSavingProduct, setSyncRefreshKey, shopId, t, toast, user }) {
  const collectProductBarcodes = (p) => [
    p.barcode,
    p.ean,
    ...(Array.isArray(p.moreBarcodes)?p.moreBarcodes:[]),
    ...(Array.isArray(p.unitPrices)?p.unitPrices.map(r=>r.barcode):[]),
  ].map(v=>String(v||"").trim()).filter(Boolean);

  const validateProductForm = (skipId=null) => {
    if (!pmForm.name.trim()) return t.e3;
    // Code / Model is intentionally excluded. Barcode, EAN and More Barcodes
    // share one unique namespace, both within this form and across products.
    const identityCodes = [
      pmForm.barcode,
      pmForm.ean,
      ...(Array.isArray(pmForm.moreBarcodes)?pmForm.moreBarcodes:[]),
      ...(Array.isArray(pmForm.unitPrices)?pmForm.unitPrices.map(r=>r.barcode):[]),
    ].map(v=>String(v||"").trim()).filter(Boolean);
    const normalized = identityCodes.map(v=>v.toLowerCase());
    const repeatedAt = normalized.findIndex((code,index)=>normalized.indexOf(code)!==index);
    if (repeatedAt>=0) {
      const code = identityCodes[repeatedAt];
      return lang==="bn"?`একই Barcode/EAN দুইবার দেওয়া যাবে না: ${code}`:`The same Barcode/EAN cannot be entered twice: ${code}`;
    }
    const currentCodes = new Set(normalized);
    const duplicate = products.find(p => p.id !== skipId && [
      p.barcode,
      p.ean,
      ...(Array.isArray(p.moreBarcodes)?p.moreBarcodes:[]),
      ...(Array.isArray(p.unitPrices)?p.unitPrices.map(r=>r.barcode):[]),
    ].map(v=>String(v||"").trim().toLowerCase()).filter(Boolean).some(code=>currentCodes.has(code)));
    if (duplicate) return lang==="bn"?`Barcode/EAN আগে থেকেই আছে: ${duplicate.name}`:`Barcode/EAN already exists: ${duplicate.name}`;
    return "";
  };

  const buildProductPayload = (created=false, productId=null) => {
    const now = new Date().toISOString();
    const cleanName = pmForm.name.trim();
    return {
      ...pmForm,
      shopId,
      productCatalogEpoch: productMaintenanceRef.current.catalogEpoch || 0,
      name: cleanName,
      code: String(pmForm.code || "").trim(),
      brand: pmForm.brand || pmForm.company || "",
      company: pmForm.company || pmForm.brand || "",
      averageCost: pmForm.averageCost || pmForm.landingCost || "",
      moreBarcodes: Array.isArray(pmForm.moreBarcodes) ? pmForm.moreBarcodes.filter(Boolean) : [],
      unitPrices: Array.isArray(pmForm.unitPrices) ? pmForm.unitPrices : [],
      customUnits: Array.isArray(pmForm.customUnits) ? pmForm.customUnits : [],
      unitDefinitions: Array.isArray(pmForm.unitDefinitions) ? pmForm.unitDefinitions : [],
      customerTypes: Array.isArray(pmForm.customerTypes) ? pmForm.customerTypes : [],
      updatedBy: user.uid,
      updatedAt: now,
      ...(created ? { createdBy:user.uid, createdAt:now } : {}),
    };
  };

  const csvCell = (v) => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const filteredProducts = useMemo(() => products.filter(p=>{
    const matchCat = pmCatFilter==="ALL"||!pmCatFilter||p.category===pmCatFilter;
    return matchCat && (!pmSearch || nsmatch(productSearchText(p), pmSearch));
  }), [products, pmSearch, pmCatFilter]);
  const getFilteredProducts = () => filteredProducts;

  const exportProductsCsv = async (rows=getFilteredProducts(), { silent=false } = {}) => {
    if (!canSeeProductCost) {
      toast(productEditDeniedMessage(), "err");
      return false;
    }
    const headers = ["ProductId","ProductName","CodeModel","Barcode","EAN","ProductGroup","Company","Category","SubCategory","CommodityCode","BaseUnit","ProductType","ArabicName","SalesVAT","PurchaseVAT","LandingCost","AverageCost","Margin%","MarginAmount","VATExclusive","VATInclusive","VATOnMrp","MRP","OpeningStock","OpeningRate","Warehouse","Rack","DefaultDiscount","ReorderMin","ReorderMax","ReorderQty","WeightBarcode","RateBarcode","MoreBarcodes","UnitPricesJson","CustomUnitsJson","UnitDefinitionsJson","CustomerTypesJson","MultiCustomerRatesEnabled","SpecificationText","SpecShowInSales","PhotoUrl","Description"];
    const body = rows.map(p => [p.id,p.name,p.code,p.barcode,p.ean,p.productGroup,p.company||p.brand,p.category,p.subcategory,p.commodityCode,p.unit,p.productType,p.arabicName,p.salesVat,p.purchaseVat,p.landingCost,p.averageCost,p.marginPerc,p.marginAmount,p.vatExclusive,p.vatInclusive,p.vatOnMrp,p.mrp,p.openingStock,p.openingRate,p.openingWarehouse,p.rackLocation,p.defaultDiscount,p.reorderMin,p.reorderMax,p.reorderQty,p.weightBarcode?"TRUE":"",p.rateBarcode?"TRUE":"",Array.isArray(p.moreBarcodes)?p.moreBarcodes.join(";"):"",Array.isArray(p.unitPrices)?JSON.stringify(p.unitPrices):"",Array.isArray(p.customUnits)?JSON.stringify(p.customUnits):"",Array.isArray(p.unitDefinitions)?JSON.stringify(p.unitDefinitions):"",Array.isArray(p.customerTypes)?JSON.stringify(p.customerTypes):"",p.multiCustomerRatesEnabled?"TRUE":"",p.specificationText,p.specShowInSales?"TRUE":"",p.photoUrl,p.description].map(csvCell).join(","));
    const saved = await saveTextFile(`product-master-${new Date().toISOString().slice(0,10)}.csv`, [headers.map(csvCell).join(","), ...body].join("\n"));
    if (saved && !silent) toast(lang==="bn"?"✅ Product export হয়েছে":"✅ Products exported");
    return saved;
  };

  // Receives rows already mapped to Product Master fields by the Import window
  // (src/product-master/modals/ImportModal.jsx). Rows are created one by one so a
  // single bad row is reported instead of aborting the whole file.
  const productEditDeniedMessage = () => lang==="bn"
    ? "পণ্য যোগ / এডিট / Import করার অনুমতি নেই। Owner-এর কাছে 'পণ্য যোগ / এডিট / Import' permission চান।"
    : "You don't have permission to add, edit or import products. Ask the Owner for 'Add / Edit / Import Products'.";

  const importProductRecords = async (records) => {
    if (!canManageProducts) {
      const message = productEditDeniedMessage();
      toast(message, "err");
      return { created:0, skipped:records.length, errors:[{ row:"-", reason:message }] };
    }
    if (clearingProducts || productBulkDeleteRef.current) {
      const message = lang==="bn"
        ? "Product clear শেষ হওয়ার আগে import করা যাবে না। একটু অপেক্ষা করুন।"
        : "Wait for product clear to finish before importing.";
      toast(message, "err");
      return { created:0, skipped:records.length, errors:[{ row:"-", reason:message }] };
    }
    const maintenance = productMaintenanceRef.current || {};
    const locker = String(maintenance.startedBy || "");
    const thisDeviceReplacement = productReplacementActive
      || !locker
      || locker === user.uid;
    if (maintenance.active && !thisDeviceReplacement) {
      const message = "Product Master is being replaced on another device. Import is temporarily locked.";
      toast(message, "err");
      return { created:0, skipped:records.length, errors:[{ row:"-", reason:message }] };
    }
    if (maintenance.active && thisDeviceReplacement && !productReplacementActive) {
      setProductReplacementActive(true);
    }
    const summary = { created:0, skipped:0, errors:[] };
    const pending = [];
    const existingIds = new Set(products.map((product) => String(product.id || "").trim()).filter(Boolean));
    const existingCodes = new Set(products.flatMap(product => [
      product.barcode,
      product.ean,
      ...(Array.isArray(product.moreBarcodes)?product.moreBarcodes:[]),
      ...(Array.isArray(product.unitPrices)?product.unitPrices.map(row=>row.barcode):[]),
    ]).map(v=>String(v||"").trim().toLowerCase()).filter(Boolean));

    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      const rowNo = i + 2; // header occupies row 1
      const name = String(record.name||"").trim();
      if (!name) { summary.skipped += 1; summary.errors.push({ row:rowNo, reason:"Product Name is empty" }); continue; }
      const requestedId = String(record.id || "").trim();
      if (requestedId && existingIds.has(requestedId)) {
        summary.skipped += 1;
        summary.errors.push({ row:rowNo, reason:`Product ID is duplicated: ${requestedId}` });
        continue;
      }

      const droppedCodes = [];
      const keepCode = (code) => {
        if (!existingCodes.has(code.toLowerCase())) return true;
        droppedCodes.push(code);
        return false;
      };
      const moreBarcodes = String(record.moreBarcodes || "")
        .split(/[;,|]/)
        .map(v=>v.trim())
        .filter(Boolean)
        .filter((code, index, list) => list.findIndex((other) => other.toLowerCase() === code.toLowerCase()) === index)
        .filter(keepCode);
      const arrayFields = ["unitPrices", "customUnits", "unitDefinitions", "customerTypes"];
      const parsedArrays = {};
      let arrayError = "";
      for (const field of arrayFields) {
        if (!record[field]) {
          parsedArrays[field] = [];
          continue;
        }
        try {
          const parsed = JSON.parse(record[field]);
          if (!Array.isArray(parsed)) throw new Error("must be an array");
          parsedArrays[field] = parsed;
        } catch {
          arrayError = `${field} JSON is invalid`;
          break;
        }
      }
      if (arrayError) {
        summary.skipped += 1;
        summary.errors.push({ row:rowNo, reason:arrayError });
        continue;
      }
      const unitPrices = parsedArrays.unitPrices.map((row) => {
        const barcode = String(row?.barcode || "").trim();
        if (barcode && !keepCode(barcode)) return { ...row, barcode:"" };
        return row;
      });
      let barcode = String(record.barcode || "").trim();
      let ean = String(record.ean || "").trim();
      if (barcode && !keepCode(barcode)) barcode = "";
      if (ean && !keepCode(ean)) ean = "";
      if (ean && barcode && ean.toLowerCase() === barcode.toLowerCase()) ean = "";
      const rowCodes = [barcode, ean, ...moreBarcodes, ...unitPrices.map(row=>row?.barcode)]
        .map(v=>String(v||"").trim()).filter(Boolean);
      if (droppedCodes.length) {
        summary.errors.push({ row:rowNo, reason:`Imported without barcode(s) already used by another product: ${droppedCodes.join(", ")}` });
      }
      const rawOpening = String(record.openingStock ?? "").trim();
      const openingNum = rawOpening === "" ? 0 : Number(rawOpening.replace(/,/g, ""));
      const openingValid = Number.isFinite(openingNum) && openingNum >= 0;
      if (!openingValid) {
        summary.errors.push({ row:rowNo, reason:`Opening stock "${rawOpening}" is not valid — imported with 0` });
      }

      const now = new Date().toISOString();
      try {
        const draftId = requestedId || globalThis.crypto?.randomUUID?.() || `import-${Date.now()}-${i}`;
        const payload = {
          ...createEmptyPmForm(), ...record, shopId, name,
          id: draftId,
          barcode,
          ean,
          productCatalogEpoch: productMaintenanceRef.current.catalogEpoch || 0,
          code: String(record.code || "").trim(),
          brand: record.company || "",
          unit: record.unit || "Pcs",
          productType: record.productType || "Goods",
          salesVat: record.salesVat || "0",
          purchaseVat: record.purchaseVat || "0",
          moreBarcodes,
          unitPrices,
          customUnits:parsedArrays.customUnits,
          unitDefinitions:parsedArrays.unitDefinitions,
          customerTypes:parsedArrays.customerTypes,
          multiCustomerRatesEnabled: ["true","1","yes","y"].includes(String(record.multiCustomerRatesEnabled || "").trim().toLowerCase()) || unitPrices.length > 0,
          weightBarcode: ["true","1","yes","y"].includes(String(record.weightBarcode || "").trim().toLowerCase()),
          rateBarcode: ["true","1","yes","y"].includes(String(record.rateBarcode || "").trim().toLowerCase()),
          specShowInSales: ["true","1","yes","y"].includes(String(record.specShowInSales || "").trim().toLowerCase()),
          createdBy:user.uid, createdAt:now, updatedAt:now,
        };
        const openingQty = openingValid ? openingNum : 0;
        payload.openingStock = openingQty ? String(openingQty) : "";
        payload.openingStockPosted = openingQty;
        let ledgerEntry = null;
        if (openingQty > 0) {
          ledgerEntry = buildStockLedgerEntry({
            productId: draftId,
            shopId,
            quantity: openingQty,
            movementType: "opening",
            referenceType: "opening_stock",
            referenceId: draftId,
            unitCost: parseFloat(payload.openingRate || payload.landingCost) || 0,
            actor: { uid:user.uid, personName:profile.personName },
          });
        }
        pending.push({ rowNo, payload, ledgerEntry });
        rowCodes.forEach(code=>existingCodes.add(code.toLowerCase()));
        existingIds.add(draftId);
      } catch (err) {
        summary.skipped += 1;
        summary.errors.push({ row:rowNo, reason:String(err?.message||err) });
      }
    }

    // Saved in chunks: one local transaction and one database write per chunk instead of per row.
    const IMPORT_CHUNK = 500;
    const createdRows = [];
    for (let i = 0; i < pending.length; i += IMPORT_CHUNK) {
      const chunk = pending.slice(i, i + IMPORT_CHUNK);
      try {
        await offlineBulkUpsert("products", chunk.map((row) => row.payload));
      } catch (err) {
        chunk.forEach((row) => {
          summary.skipped += 1;
          summary.errors.push({ row:row.rowNo, reason:String(err?.message||err) });
        });
        continue;
      }
      createdRows.push(...chunk);
      const ledgerRows = chunk.filter((row) => row.ledgerEntry);
      if (!ledgerRows.length) continue;
      try {
        await offlineBulkUpsert(STOCK_COLLECTIONS.STOCK_LEDGER, ledgerRows.map((row) => row.ledgerEntry));
      } catch (ledgerErr) {
        console.warn("[S4 Stock] import opening stock ledger entries failed", ledgerErr);
        await offlineBulkUpsert("products", ledgerRows.map((row) => ({ ...row.payload, openingStockPosted:0 }))).catch(() => null);
        ledgerRows.forEach((row) => {
          row.payload.openingStockPosted = 0;
          summary.errors.push({ row:row.rowNo, reason:"Imported, but opening stock was not posted to the ledger — open and Save this product once" });
        });
      }
    }
    summary.created = createdRows.length;
    if (createdRows.length) {
      const createdById = new Map(createdRows.map((row) => [row.payload.id, row.payload]));
      setProducts(prev => [...createdById.values(), ...prev.filter(p=>!createdById.has(p.id))].sort(compareProductNames));
    }

    toast(lang==="bn"?`✅ ${summary.created} import, ${summary.skipped} skip`:`✅ ${summary.created} imported, ${summary.skipped} skipped`);
    if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] product import sync failed", err));
    return summary;
  };

  const exportWeighingBarcodeCsv = async (rows=getFilteredProducts()) => {
    try {
      const body = rows.filter(p=>p.weightBarcode||p.rateBarcode).map(p => [p.barcode||p.ean||p.code, p.name, p.vatInclusive||p.mrp||p.vatExclusive||0, p.unit||"Pcs", p.weightBarcode?"WEIGHT":"RATE"].map(csvCell).join(","));
      const saved = await saveTextFile(`weighing-barcode-${new Date().toISOString().slice(0,10)}.csv`, [["Barcode","ProductName","Rate","Unit","Type"].map(csvCell).join(","), ...body].join("\n"));
      if (saved) toast(lang==="bn"?"✅ Weighing barcode file তৈরি হয়েছে":"✅ Weighing barcode file generated");
    } catch (e) { hErr(e); }
  };

  const printProductBarcodes = (rows) => {
    const list = (Array.isArray(rows)?rows:[rows]).filter(Boolean);
    if (!list.length) return toast(lang==="bn"?"Print করার product নেই":"No product to print", "err");
    const skipped = [];
    const labels = list.map(p => {
      const code = p.barcode||p.ean||p.code||p.name;
      const barcodeSvg = code128SvgMarkup(code, { moduleWidth: 2, height: 48, fontSize: 11 });
      if (!barcodeSvg) {
        skipped.push(p.name || code || "Unnamed product");
        return "";
      }
      return `<div class="label"><div class="name">${String(p.name||"").replace(/[<>&]/g,"")}</div>${barcodeSvg}<div class="price">MRP ${String(p.mrp||p.vatInclusive||"").replace(/[<>&]/g,"")}</div></div>`;
    }).filter(Boolean).join("");
    if (!labels) return toast(lang==="bn"?"CODE128 print করার মতো barcode নেই":"No CODE128-compatible barcode to print", "err");
    if (skipped.length) toast(`Skipped ${skipped.length} unsupported barcode(s): ${skipped.slice(0,5).join(", ")}${skipped.length>5?"...":""}`, "err");
    printWithSettings(`<html><head><meta charset="UTF-8"><title>Product Barcodes</title><style>body{font-family:Arial,sans-serif;margin:16px}.sheet{display:flex;flex-wrap:wrap;gap:10px}.label{width:190px;border:1px solid #111;padding:8px;text-align:center;page-break-inside:avoid}.name{font-size:12px;font-weight:700;height:30px;overflow:hidden}.label svg{max-width:100%;height:auto;margin:4px 0}.price{font-size:11px;margin-top:3px}@media print{.label{break-inside:avoid}}</style></head><body><div class="sheet">${labels}</div></body></html>`, { lang, kind:"barcode" });
  };

  // Smart pmUpd — triggers auto-calculations
  const pmUpd = (field, val) => {
    setPmForm(prev => {
      const next = { ...prev, [field]: val };
      const n = (v) => parseFloat(v)||0;

      if (field==="landingCost"||field==="marginPerc"||field==="marginAmount"||field==="vatExclusive"||field==="salesVat"||field==="vatOnMrp") {
        const lc = n(field==="landingCost"?val:next.landingCost);
        let mp = n(field==="marginPerc"?val:next.marginPerc);
        let ma = n(field==="marginAmount"?val:next.marginAmount);
        let ve = n(field==="vatExclusive"?val:next.vatExclusive);
        const sv = n(field==="salesVat"?val:next.salesVat);

        if (field==="landingCost"||field==="marginPerc") {
          // LC or MP changed → recalc MA and VE
          if (field==="marginPerc" && lc>0) ma = parseFloat((lc*mp/100).toFixed(4));
          else ma = lc>0 && mp>0 ? parseFloat((lc*mp/100).toFixed(4)) : ma;
          ve = lc>0 ? parseFloat((lc+ma).toFixed(4)) : ve;
          next.marginAmount = ma||ma===0 ? String(ma) : "";
          next.vatExclusive = ve ? String(ve) : "";
        } else if (field==="marginAmount") {
          // MA changed → recalc MP and VE
          mp = lc>0 ? parseFloat((ma/lc*100).toFixed(4)) : 0;
          ve = parseFloat((lc+ma).toFixed(4));
          next.marginPerc = mp ? String(mp) : "";
          next.vatExclusive = ve ? String(ve) : "";
        } else if (field==="vatExclusive") {
          // VE changed manually → recalc MA and MP (no landing cost means margin is unknown)
          if (lc>0) {
            ma = parseFloat((ve-lc).toFixed(4));
            mp = parseFloat((ma/lc*100).toFixed(4));
            next.marginAmount = ma ? String(ma) : "";
            next.marginPerc = mp ? String(mp) : "";
          }
        }

        // Always recalc VAT Inclusive from current VE
        const currentVe = n(next.vatExclusive);
        if (currentVe>0) {
          const vi = parseFloat((currentVe + currentVe*sv/100).toFixed(4));
          next.vatInclusive = String(vi);
          // MRP auto-fill based on vatOnMrp
          const vatOn = field==="vatOnMrp"?val:next.vatOnMrp;
          next.mrp = vatOn ? String(vi) : String(currentVe);
        }
      }

      // vatInclusive typed → back-calculate VE, margin and MRP; VI itself stays as typed
      if (field==="vatInclusive") {
        const vi = n(val);
        const sv = n(next.salesVat);
        const lc = n(next.landingCost);
        if (vi>0) {
          const ve = parseFloat((vi/(1+sv/100)).toFixed(4));
          next.vatExclusive = String(ve);
          if (lc>0) {
            const ma = parseFloat((ve-lc).toFixed(4));
            next.marginAmount = ma ? String(ma) : "";
            next.marginPerc = ma ? String(parseFloat((ma/lc*100).toFixed(4))) : "";
          }
          next.mrp = next.vatOnMrp ? String(vi) : String(ve);
        }
      }

      // vatOnMrp toggled → update MRP
      if (field==="vatOnMrp") {
        const vi = n(next.vatInclusive);
        const ve = n(next.vatExclusive);
        next.mrp = val ? (vi?String(vi):"") : (ve?String(ve):"");
      }

      return next;
    });
  };

  // Posts only the change since the last posting, so re-saving a product never double-counts opening stock.
  const postOpeningStockDelta = async (product) => {
    const wanted = parseFloat(product?.openingStock) || 0;
    const posted = parseFloat(product?.openingStockPosted) || 0;
    const delta = parseFloat((wanted - posted).toFixed(4));
    if (!product?.id || !delta) return;
    // Marked as posted before the ledger write: if the ledger write fails the mark is reverted,
    // so a failure can under-post (fixed by saving again) but never double-post.
    const savePosted = async (value) => {
      const result = await offlineUpdate("products", product.id, {
        ...product,
        openingStockPosted: value,
        productCatalogEpoch: productMaintenanceRef.current.catalogEpoch || 0,
        updatedAt: new Date().toISOString(),
      });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, ...result.data, id: product.id } : p));
    };
    try {
      await savePosted(wanted);
    } catch (err) {
      console.warn("[S4 Stock] opening stock mark failed", product.id, err);
      toast(lang==="bn"?"⚠️ Opening stock ledger-এ যোগ হয়নি, আবার Save করুন":"⚠️ Opening stock was not posted to the ledger. Save again.", "err");
      return;
    }
    try {
      await createStockLedgerEntry({
        productId: product.id,
        shopId,
        quantity: Math.abs(delta),
        movementType: delta > 0 ? "opening" : "adjustment",
        referenceType: "opening_stock",
        referenceId: product.id,
        unitCost: parseFloat(product.openingRate || product.landingCost) || 0,
        actor: { uid:user.uid, personName:profile.personName },
      });
    } catch (err) {
      console.warn("[S4 Stock] opening stock ledger entry failed", product.id, err);
      await savePosted(posted).catch((revertErr) => console.warn("[S4 Stock] opening stock mark revert failed", product.id, revertErr));
      toast(lang==="bn"?"⚠️ Opening stock ledger-এ যোগ হয়নি, আবার Save করুন":"⚠️ Opening stock was not posted to the ledger. Save again.", "err");
    }
  };

  const addProduct = async () => {
    if (!canManageProducts) return toast(productEditDeniedMessage(), "err");
    if (productMaintenanceRef.current.active) {
      return toast("Product Master replacement is in progress. Saving is temporarily locked.", "err");
    }
    const validationError = validateProductForm();
    if (validationError) return toast(validationError,"err");

    const draftId = globalThis.crypto?.randomUUID?.() || `product-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const payload = { ...buildProductPayload(true, draftId), id: draftId, openingStockPosted: 0 };

    setSavingProduct(true);
    try {
      const result = await offlineCreate("products", payload);
      const created = { ...result.data, id: result.documentId };

      setProducts(prev =>
        [created, ...prev.filter(p => p.id !== created.id)]
          .sort(compareProductNames)
      );

      pmReset();
      setPmShowAdd(false);
      toast(t.pmAdded);
      if (pmOverSales) {
        setPmPickForSales({ product: created, at: Date.now() });
        setPmEditId(null);
        setPmOverSales(false);
      }
      await postOpeningStockDelta(created);

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] product sync failed", err));
      }
    } catch(e) {
      hErr(e);
    } finally {
      setSavingProduct(false);
    }
  };

  const editProduct = async (id) => {
    if (!canManageProducts) return toast(productEditDeniedMessage(), "err");
    if (productMaintenanceRef.current.active) {
      return toast("Product Master replacement is in progress. Saving is temporarily locked.", "err");
    }
    const validationError = validateProductForm(id);
    if (validationError) return toast(validationError,"err");

    const payload = buildProductPayload(false, id);

    setSavingProduct(true);
    try {
      const stored = (await offlineGetById("products", id).catch(() => null))?.data
        || products.find(p => p.id === id);
      payload.openingStockPosted = parseFloat(stored?.openingStockPosted) || 0;
      const result = await offlineUpdate("products", id, payload);
      const updated = { ...result.data, id };

      setProducts(prev =>
        prev
          .map(p => p.id === id ? updated : p)
          .sort(compareProductNames)
      );

      pmReset();
      setPmEditId(null);
      setPmShowAdd(false);
      toast(t.pmUpdated);
      if (pmOverSales) {
        setPmPickForSales({ product: updated, at: Date.now() });
        setPmOverSales(false);
      }
      await postOpeningStockDelta(updated);

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] product update sync failed", err));
      }
    } catch(e) {
      hErr(e);
    } finally {
      setSavingProduct(false);
    }
  };

  const deleteProduct = async (id) => {
    if (!isOwner) {
      toast(lang==="bn"?"শুধু মালিক পণ্য মুছতে পারেন।":"Only the owner can delete products.","err");
      return;
    }
    if (productMaintenanceRef.current.active) {
      toast(lang==="bn"?"Product replacement চলছে, এখন মোছা যাবে না।":"Product replacement is running; deleting is locked.","err");
      return;
    }
    if (!window.confirm(lang==="bn"?"এই পণ্যটি মুছে ফেলবেন?":"Delete this product?")) return;
    const delProd = products.find(p => p.id === id);
    logAudit({ shopId, user, profile, action:"delete", collection:"products", docId:id, docNo:delProd?.code || "", note:delProd?.name || "" });

    const now = new Date().toISOString();
    const tombstone = {
      shopId,
      isDeleted:true,
      deletedAt:now,
      updatedAt:now,
      updatedBy:user.uid,
      productCatalogEpoch:productMaintenanceRef.current.catalogEpoch || 0,
    };

    try {
      if (navigator.onLine && db) {
        try {
          await deleteDoc(doc(db, "products", id));
          await offlinePurgeLocal("products", id);
        } catch (cloudErr) {
          const denied = String(cloudErr?.code || cloudErr?.message || "").includes("permission");
          if (!denied) throw cloudErr;
          await setDoc(doc(db, "products", id), tombstone, { merge: true });
          await offlineUpdate("products", id, tombstone);
        }
      } else {
        // A hard delete queued offline is refused once a catalog epoch exists; a tombstone always syncs.
        await offlineUpdate("products", id, tombstone);
      }

      setProducts(p=>p.filter(x=>x.id!==id));
      if (pmEditId === id) { setPmEditId(null); pmReset(); }
      toast(t.pmDeleted,"err");

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] product delete sync failed", err));
      }
    } catch(e) {
      hErr(e);
    }
  };

  const removeBlankProducts = async () => {
    if (!isOwner) return toast(lang==="bn"?"শুধু Owner এটা করতে পারবে":"Only the Shop Owner can do this","err");
    if (!navigator.onLine || !db || !shopId) return toast(t.syncNeedInternet,"err");
    try {
      const snap = await getDocs(query(collection(db, "products"), where("shopId", "==", shopId)));
      const cloudBlank = snap.docs.filter((d) => isBlankProduct(d.data()) && d.data().isDeleted !== true);
      const local = await offlineList("products");
      const localBlank = local.records.filter((r) => {
        const data = r.data || {};
        return (!data.shopId || data.shopId === shopId) && isBlankProduct(data) && data.isDeleted !== true;
      });
      const ids = new Set([...cloudBlank.map((d) => d.id), ...localBlank.map((r) => r.document_id)]);
      if (!ids.size) {
        toast(lang==="bn"?"✅ কোনো খালি প্রোডাক্ট নেই":"✅ No blank products found");
        return;
      }
      const msg = lang==="bn"
        ? `নাম, কোড আর বারকোড ছাড়া ${ids.size}টা খালি প্রোডাক্ট পাওয়া গেছে (cloud: ${cloudBlank.length}, এই ডিভাইস: ${localBlank.length})। এগুলো মুছে ফেলবেন? আসল প্রোডাক্টে হাত দেওয়া হবে না।`
        : `Found ${ids.size} blank products with no name, code or barcode (cloud: ${cloudBlank.length}, this device: ${localBlank.length}). Delete them? Real products are not touched.`;
      if (!window.confirm(msg)) return;
      const cloudIds = cloudBlank.map((d) => d.id);
      const now = new Date().toISOString();
      const tombstone = {
        isDeleted:true, deletedAt:now, updatedAt:now, updatedBy:user.uid,
        productCatalogEpoch:productMaintenanceRef.current.catalogEpoch || 0,
      };
      for (let i = 0; i < cloudIds.length; i += 400) {
        const chunk = cloudIds.slice(i, i + 400);
        try {
          const batch = writeBatch(db);
          chunk.forEach((id) => batch.delete(doc(db, "products", id)));
          await batch.commit();
        } catch (err) {
          if (!String(err?.code || err?.message || "").includes("permission")) throw err;
          const batch = writeBatch(db);
          chunk.forEach((id) => batch.set(doc(db, "products", id), tombstone, { merge:true }));
          await batch.commit();
        }
      }
      for (const id of ids) await offlinePurgeLocal("products", id);
      setProducts((prev) => prev.filter((p) => !ids.has(p.id)));
      toast(lang==="bn"?`🗑️ ${ids.size}টা খালি প্রোডাক্ট মুছে ফেলা হয়েছে`:`🗑️ Removed ${ids.size} blank products`);
    } catch (e) {
      hErr(e);
    }
  };

  const clearAllShopProducts = async () => {
    if (clearingProducts) return;
    if (!isOwner) {
      toast("Only the Shop Owner can clear Product Master data.", "err");
      return { ok:false, reason:"OWNER_REQUIRED" };
    }
    if (!navigator.onLine || !db || !shopId) {
      toast("Internet connection is required for a safe Clear & Import.", "err");
      return { ok:false, reason:"ONLINE_REQUIRED" };
    }

    setClearingProducts(true);
    productBulkDeleteRef.current = true;
    window.S4Offline?.pauseCollectionSync?.("products");
    let done = 0;
    let lockAcquired = false;
    const chunkSize = 200;
    const operationId = globalThis.crypto?.randomUUID?.() || `replace-${Date.now()}`;
    const nextEpoch = (Number(productMaintenanceRef.current.catalogEpoch) || 0) + 1;

    const reportProgress = (total) => {
      toast(lang==="bn"?`🗑️ ${done}/${total}...`:`🗑️ ${done}/${total}...`);
    };

    const commitBatchWithRetry = async (buildBatch, retries = 4) => {
      let lastErr;
      for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
          const batch = writeBatch(db);
          buildBatch(batch);
          await batch.commit();
          return;
        } catch (err) {
          lastErr = err;
          const message = String(err?.message || err?.code || "").toLowerCase();
          const retryable = message.includes("fetch")
            || message.includes("network")
            || message.includes("unavailable")
            || message.includes("deadline");
          if (!retryable || attempt === retries) throw err;
          await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
        }
      }
      throw lastErr;
    };

    try {
      if (!(await exportProductsCsv(products, { silent:true }))) {
        toast(lang==="bn"?"Backup ফাইল সেভ হয়নি, তাই কিছু মোছা হয়নি।":"Backup file was not saved, so nothing was deleted.", "err");
        return { ok:false, reason:"BACKUP_NOT_SAVED" };
      }
      await setDoc(doc(db, "productMaintenance", productMaintenanceId), {
        shopId,
        type:"productMaintenance",
        active:true,
        catalogEpoch:nextEpoch,
        operationId,
        startedBy:user.uid,
        startedAt:serverTimestamp(),
        updatedAt:serverTimestamp(),
      }, { merge:true });
      lockAcquired = true;
      const activeMaintenance = {
        active:true,
        catalogEpoch:nextEpoch,
        operationId,
        startedBy:user.uid,
      };
      productMaintenanceRef.current = activeMaintenance;
      setProductMaintenance(activeMaintenance);
      setProductReplacementActive(true);

      const snap = await getDocs(query(collection(db, "products"), where("shopId", "==", shopId)));
      const rows = snap.docs.map((d) => ({ id:d.id, ...d.data() }));
      setProducts([]);
      setPmEditId(null);

      toast(lang==="bn"?"🗑️ মুছা হচ্ছে...":"🗑️ Deleting...");
      reportProgress(rows.length);

      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await commitBatchWithRetry((batch) => {
          chunk.forEach((p) => batch.delete(doc(db, "products", p.id)));
        });
        done += chunk.length;
        reportProgress(rows.length);
      }

      await offlineClearShopCollection("products", shopId);
      const verifyCloud = await getDocs(query(collection(db, "products"), where("shopId", "==", shopId)));
      const verifyLocal = await offlineList("products");
      const localRemaining = verifyLocal.records.filter((row) => row.data?.shopId === shopId);
      if (!verifyCloud.empty || localRemaining.length) {
        throw new Error(`Clear verification failed (cloud ${verifyCloud.size}, local ${localRemaining.length}).`);
      }
      toast("✅ Backup downloaded and Product Master cleared. Select the new import file.");
      return { ok:true, deleted:rows.length, catalogEpoch:nextEpoch };
    } catch (e) {
      hErr(e);
      if (lockAcquired && db && shopId && isOwner) {
        try {
          await setDoc(doc(db, "productMaintenance", productMaintenanceId), {
            shopId,
            type: "productMaintenance",
            active: false,
            catalogEpoch: nextEpoch,
            failedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
          const released = { active: false, catalogEpoch: nextEpoch };
          productMaintenanceRef.current = released;
          setProductMaintenance(released);
          setProductReplacementActive(false);
          window.S4Offline?.resumeCollectionSync?.("products");
        } catch (releaseErr) {
          console.warn("[Product Master] maintenance lock release failed", releaseErr);
        }
      }
      toast(lang === "bn" ? "মুছতে সমস্যা — লক খুলে দেওয়া হয়েছে, আবার চেষ্টা করুন" : "Clear failed — lock released; please retry.", "err");
      return { ok:false, reason:String(e?.message||e) };
    } finally {
      productBulkDeleteRef.current = false;
      setClearingProducts(false);
      if (!lockAcquired) window.S4Offline?.resumeCollectionSync?.("products");
      setSyncRefreshKey((value) => value + 1);
    }
  };

  const finishProductReplacement = async () => {
    if (!productReplacementActive || !isOwner || !db || !shopId) return;
    const catalogEpoch = Number(productMaintenanceRef.current.catalogEpoch) || 0;
    try {
      await setDoc(doc(db, "productMaintenance", productMaintenanceId), {
        shopId,
        type:"productMaintenance",
        active:false,
        catalogEpoch,
        completedBy:user.uid,
        completedAt:serverTimestamp(),
        updatedAt:serverTimestamp(),
      }, { merge:true });
      const completed = { ...productMaintenanceRef.current, active:false, catalogEpoch };
      productMaintenanceRef.current = completed;
      setProductMaintenance(completed);
      setProductReplacementActive(false);
      window.S4Offline?.resumeCollectionSync?.("products");

      let syncResult = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        syncResult = await window.S4Offline?.syncNow?.();
        if (!syncResult?.skipped) break;
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
      setSyncRefreshKey((value) => value + 1);
      if (syncResult?.failed) {
        toast(`Import saved locally, but ${syncResult.failed} product sync item(s) need retry.`, "err");
      } else {
        const [cloudSnap, localResult] = await Promise.all([
          getDocs(query(collection(db, "products"), where("shopId", "==", shopId))),
          offlineList("products"),
        ]);
        const cloudCount = cloudSnap.docs.filter((item) => isActiveProduct(item.data())).length;
        const localCount = localResult.records.filter(
          (row) => row.data?.shopId === shopId && isActiveProduct(row.data)
        ).length;
        if (cloudCount !== localCount) {
          toast(`Replacement saved, but verification differs (local ${localCount}, cloud ${cloudCount}). Sync will retry.`, "err");
        } else {
          toast(`✅ Product replacement completed. Verified ${localCount} products locally and in Firebase.`);
        }
      }
    } catch (error) {
      hErr(error);
      toast("Could not finish replacement. Product sync remains locked for safety.", "err");
    }
  };
  return { addProduct, clearAllShopProducts, deleteProduct, editProduct, exportProductsCsv, exportWeighingBarcodeCsv, filteredProducts, finishProductReplacement, getFilteredProducts, importProductRecords, pmUpd, printProductBarcodes, removeBlankProducts };
}
