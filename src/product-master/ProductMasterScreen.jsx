import React, { useEffect, useRef, useState } from "react";
import { PM_CSS } from "./pmStyles";
import ProductDetailsForm from "./ProductDetailsForm";
import PricingPanel from "./PricingPanel";
import SellingRatesPanel from "./SellingRatesPanel";
import ActionButtonsRow from "./ActionButtonsRow";
import ProductListGrid from "./ProductListGrid";
import NewLookupModal from "./modals/NewLookupModal";
import MoreBarcodesModal from "./modals/MoreBarcodesModal";
import OpeningStockModal from "./modals/OpeningStockModal";
import ReorderLevelModal from "./modals/ReorderLevelModal";
import RackModal from "./modals/RackModal";
import DefaultDiscountModal from "./modals/DefaultDiscountModal";
import SpecificationModal from "./modals/SpecificationModal";
import PhotoModal from "./modals/PhotoModal";
import BarcodePrintModal from "./modals/BarcodePrintModal";
import ImportModal from "./modals/ImportModal";
import GlobalSearchModal from "./modals/GlobalSearchModal";
import AdditionalBarcodeConfirmModal from "./modals/AdditionalBarcodeConfirmModal";
import ClearProductsModal from "./modals/ClearProductsModal";

const DEFAULT_UNIT_RECORDS = [
  ["COUNT", "Number", "Number", "1", "Number"],
  ["COUNT", "Pieces", "Pcs", "1", "Number"],
  ["COUNT", "Set", "Set", "1", "Number"],
  ["COUNT", "Numbers", "Nos", "1", "Number"],
  ["WEIGHT", "Kilogram", "Kg", "1000", "Gram"],
  ["WEIGHT", "Gram", "Gram", "1000", "Milligram"],
  ["WEIGHT", "Milligram", "Milligram", "1", "Milligram"],
  ["VOLUME", "Litre", "Litre", "1000", "Millilitre"],
  ["VOLUME", "Litre", "Ltr", "1000", "Millilitre"],
  ["VOLUME", "Millilitre", "Millilitre", "1", "Millilitre"],
  ["COUNT", "Box", "Box", "1", "Number"],
  ["COUNT", "Pair", "Pair", "2", "Number"],
  ["LENGTH", "Centimetre", "Cm", "10", "Mm"],
  ["LENGTH", "Metre", "Mtr", "100", "Cm"],
  ["LENGTH", "Millimetre", "Mm", "1", "Mm"],
  ["LENGTH", "Feet", "Feet", "12", "Inch"],
  ["LENGTH", "Inch", "Inch", "1", "Inch"],
  ["AREA", "Square Feet", "Sq.Feet", "144", "Sq.Inch"],
  ["AREA", "Square Inch", "Sq.Inch", "1", "Sq.Inch"],
  ["AREA", "Square Metre", "Sq.Metre", "10000", "Sq.Cm"],
  ["AREA", "Square Centimetre", "Sq.Cm", "1", "Sq.Cm"],
  ["COUNT", "Dozen", "Dozen", "12", "Number"],
  ["WEIGHT", "Ton", "Ton", "1000", "Kg"],
].map(([category, name, symbol, factor, equalsUnit], index) => ({
  id: index + 1,
  category,
  name,
  symbol,
  alternateName: "",
  factor,
  equalsUnit,
  printNameInBill: false,
}));

const DEFAULT_CUSTOMER_TYPE_RECORDS = [
  { id: 1, name: "Customer" },
  { id: 2, name: "Wholesale" },
  { id: 3, name: "Retail" },
  { id: 4, name: "Dealer" },
];

function loadMasterRecords(key, defaults, legacyValues, valueField, definitions = []) {
  let saved = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    if (Array.isArray(parsed)) saved = parsed;
    if (!saved.length && key.includes("-default") === false) {
      const legacyKey = valueField === "symbol" ? "s4-product-master-units" : "s4-product-master-customer-types";
      const legacy = JSON.parse(localStorage.getItem(legacyKey) || "[]");
      if (Array.isArray(legacy)) saved = legacy;
    }
  } catch {
    saved = [];
  }
  const records = (saved.length ? saved : defaults).map((record) => ({ ...record }));
  const seen = new Set(records.map((record) => String(record[valueField] || "").toLowerCase()));
  let id = Math.max(0, ...records.map((record) => Number(record.id) || 0));
  definitions.forEach((definition) => {
    if (!definition || typeof definition !== "object") return;
    const value = String(definition[valueField] || "").trim();
    if (!value) return;
    const index = records.findIndex((record) => String(record[valueField] || "").toLowerCase() === value.toLowerCase());
    if (index >= 0) {
      records[index] = { ...records[index], ...definition, id: records[index].id };
      return;
    }
    id += 1;
    records.push({ ...definition, id });
    seen.add(value.toLowerCase());
  });
  const migrated = legacyValues
    .map((value) => String(value || "").trim())
    .filter((value) => value && !seen.has(value.toLowerCase()))
    .map((value) => {
      seen.add(value.toLowerCase());
      id += 1;
      return valueField === "symbol"
        ? { id, category: "OTHER", name: value, symbol: value, alternateName: "", factor: "1", equalsUnit: "Number", printNameInBill: false }
        : { id, name: value };
    });
  return [...records, ...migrated];
}

export default function ProductMasterScreen({
  shopId,
  products,
  filteredProducts,
  productsLoading,
  companies,
  form,
  upd,
  selectedId,
  canDelete,
  saving,
  onNew,
  onSave,
  onDelete,
  onClose,
  onSelectProduct,
  onExport,
  onImportRecords,
  onClearAll,
  clearingProducts,
  replacementActive,
  onFinishReplacement,
  productMaintenanceActive,
  onGenerateWeighingFile,
  onPrintBarcodes,
  notify,
  shopPartEnabled,
}) {
  const [activeModal, setActiveModal] = useState(null);
  const [unitRecords, setUnitRecords] = useState(() => loadMasterRecords(
    `s4-product-master-units-${shopId || "default"}`,
    DEFAULT_UNIT_RECORDS,
    [...(form.customUnits || []), ...products.flatMap((product) => product.customUnits || [])],
    "symbol",
    [...(form.unitDefinitions || []), ...products.flatMap((product) => product.unitDefinitions || [])]
  ));
  const [customerTypeRecords, setCustomerTypeRecords] = useState(() => loadMasterRecords(
    `s4-product-master-customer-types-${shopId || "default"}`,
    DEFAULT_CUSTOMER_TYPE_RECORDS,
    [...(form.customerTypes || []), ...products.flatMap((product) => product.customerTypes || [])],
    "name"
  ));
  const saveRef = useRef(onSave);
  const closeRef = useRef(onClose);
  const modalRef = useRef(activeModal);
  const screenRef = useRef(null);

  useEffect(() => { saveRef.current = onSave; }, [onSave]);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { modalRef.current = activeModal; }, [activeModal]);
  useEffect(() => {
    localStorage.setItem(`s4-product-master-units-${shopId || "default"}`, JSON.stringify(unitRecords));
  }, [shopId, unitRecords]);
  useEffect(() => {
    localStorage.setItem(`s4-product-master-customer-types-${shopId || "default"}`, JSON.stringify(customerTypeRecords));
  }, [shopId, customerTypeRecords]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !modalRef.current) {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key === "F10") {
        e.preventDefault();
        setActiveModal("search");
      }
      if (!modalRef.current && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => setActiveModal(null);

  function showDuplicateBarcode(message) {
    window.alert(`Duplicate Barcode / EAN\n\n${message}`);
  }

  function validateIdentityCode(field, rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) return true;
    const normalized = value.toLowerCase();
    const otherCurrentValues = [
      ...(field === "barcode" ? [] : [form.barcode]),
      ...(field === "ean" ? [] : [form.ean]),
      ...(Array.isArray(form.moreBarcodes) ? form.moreBarcodes : []),
    ].map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean);

    if (otherCurrentValues.includes(normalized)) {
      showDuplicateBarcode(`The number "${value}" is already entered in this product. The same number cannot be used in Barcode, EAN Code, or More Barcodes.`);
      return false;
    }

    const owner = products.find((product) => product.id !== selectedId && [
      product.barcode,
      product.ean,
      ...(Array.isArray(product.moreBarcodes) ? product.moreBarcodes : []),
    ].map((entry) => String(entry || "").trim().toLowerCase()).includes(normalized));
    if (owner) {
      showDuplicateBarcode(`The number "${value}" already belongs to product "${owner.name}".`);
      return false;
    }
    return true;
  }

  function validateSellingRateBarcode(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) return true;
    const normalized = value.toLowerCase();
    const currentValues = [
      form.barcode,
      form.ean,
      ...(Array.isArray(form.moreBarcodes) ? form.moreBarcodes : []),
      ...(Array.isArray(form.unitPrices) ? form.unitPrices.map((row) => row.barcode) : []),
    ].map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean);
    if (currentValues.includes(normalized)) {
      showDuplicateBarcode(`The number "${value}" is already entered in this product. The same number cannot be used again as an alternate unit barcode.`);
      return false;
    }
    const owner = products.find((product) => product.id !== selectedId && [
      product.barcode,
      product.ean,
      ...(Array.isArray(product.moreBarcodes) ? product.moreBarcodes : []),
      ...(Array.isArray(product.unitPrices) ? product.unitPrices.map((row) => row.barcode) : []),
    ].map((entry) => String(entry || "").trim().toLowerCase()).includes(normalized));
    if (owner) {
      showDuplicateBarcode(`The number "${value}" already belongs to product "${owner.name}".`);
      return false;
    }
    return true;
  }

  function printAlternateUnitBarcodes() {
    const rows = (Array.isArray(form.unitPrices) ? form.unitPrices : [])
      .filter((row) => String(row.barcode || "").trim())
      .map((row) => ({
        id: row.id,
        name: [form.name, row.unit, row.customerType].filter(Boolean).join(" / "),
        barcode: row.barcode,
        mrp: row.mrp || row.vatInclusive || form.mrp || form.vatInclusive || "",
      }));
    if (!rows.length) {
      notify("No alternate unit barcode found to print", "err");
      return;
    }
    onPrintBarcodes(rows);
  }

  async function clearAndOpenImport() {
    const result = await onClearAll?.();
    if (result?.ok) setActiveModal("import");
  }

  async function closeImport() {
    if (replacementActive) await onFinishReplacement?.();
    close();
  }

  function moveToNextField(event) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.nativeEvent?.isComposing ||
      !event.target.matches(".pm-nav-control")
    ) return;

    event.preventDefault();
    const controls = [...screenRef.current.querySelectorAll(".pm-nav-control:not(:disabled)")];
    const next = controls[controls.indexOf(event.target) + 1];
    if (!next) {
      event.target.blur();
      return;
    }
    next.focus();
    if (window.matchMedia?.("(pointer: coarse)").matches) {
      next.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <div ref={screenRef} className="pm-root" onKeyDown={moveToNextField}>
      <style>{PM_CSS}</style>

      <div className="pm-reference-title">
        <strong>PRODUCT MASTER</strong>
        <span>
          {products.length} products
          {productMaintenanceActive ? " · Replacement lock active" : ""}
        </span>
      </div>

      <div className="pm-quick-bar">
        <button type="button" className="pm-btn" onClick={onNew}>New</button>
        <button type="button" className="pm-btn" onClick={onSave} disabled={saving || productMaintenanceActive}>{saving ? "Saving..." : "Save"}</button>
        <button type="button" className="pm-btn-secondary" onClick={() => setActiveModal("search")}>Search</button>
        <button type="button" className="pm-btn-secondary" onClick={onClose}>Close</button>
      </div>

      <div className="pm-reference-grid">
        <div className="pm-reference-left">
          <ProductDetailsForm
            form={form}
            upd={upd}
            products={products}
            companies={companies}
            masterUnits={unitRecords.map((record) => record.symbol)}
            onOpenMoreBarcodes={() => setActiveModal("confirmMoreBarcodes")}
            onOpenNewUnit={() => setActiveModal("newUnit")}
            onPickSuggestion={onSelectProduct}
            onValidateIdentityCode={validateIdentityCode}
            shopPartEnabled={shopPartEnabled}
          />
        </div>

        <div className="pm-reference-middle">
          <PricingPanel form={form} upd={upd} />
          <SellingRatesPanel
            form={form}
            upd={upd}
            notify={notify}
            masterUnits={unitRecords.map((record) => record.symbol)}
            masterCustomerTypes={customerTypeRecords.map((record) => record.name)}
            onOpenNewUnit={() => setActiveModal("newUnit")}
            onOpenNewCustomerType={() => setActiveModal("newCustomerType")}
            onPrintAlternateBarcode={printAlternateUnitBarcodes}
            validateBarcode={validateSellingRateBarcode}
            enabled={!!form.multiCustomerRatesEnabled}
          />
        </div>

        <div className="pm-reference-right">
          <ProductListGrid
            rows={filteredProducts}
            selectedId={selectedId}
            onSelect={onSelectProduct}
            loading={productsLoading}
            shopPartEnabled={shopPartEnabled}
          />
        </div>

        <ActionButtonsRow
          form={form}
          upd={upd}
          canDelete={canDelete}
          hasProduct={!!selectedId}
          busy={saving}
          productMaintenanceActive={productMaintenanceActive}
          onNew={onNew}
          onSave={onSave}
          onDelete={onDelete}
          onClose={onClose}
          onPrintBarcode={() => setActiveModal("printBarcode")}
          onSearch={() => setActiveModal("search")}
          onDefaultDiscount={() => setActiveModal("defaultDiscount")}
          onSetReorderLevel={() => setActiveModal("reorderLevel")}
          onSetRack={() => setActiveModal("rack")}
          onImport={() => setActiveModal("import")}
          onExport={onExport}
          onClearAndImport={() => setActiveModal("clearProducts")}
          canClearAll={canDelete}
          onSpecification={() => setActiveModal("specification")}
          onPhotoSetting={() => setActiveModal("photo")}
          onOpeningStockEntry={() => setActiveModal("openingStock")}
          onPrintOpeningStockBarcodes={() => onPrintBarcodes(filteredProducts.filter((p) => parseFloat(p.openingStock || 0) > 0))}
          onGenerateWeighingFile={onGenerateWeighingFile}
        />
      </div>

      {activeModal === "newUnit" && (
        <NewLookupModal
          isUnit
          records={unitRecords}
          notify={notify}
          onClose={close}
          onRecordsChange={(records) => {
            setUnitRecords(records);
            upd("customUnits", records.map((record) => record.symbol));
            upd("unitDefinitions", records);
          }}
        />
      )}
      {activeModal === "newCustomerType" && (
        <NewLookupModal
          records={customerTypeRecords}
          notify={notify}
          onClose={close}
          onRecordsChange={(records) => {
            setCustomerTypeRecords(records);
            upd("customerTypes", records.map((record) => record.name));
          }}
        />
      )}
      {activeModal === "confirmMoreBarcodes" && (
        <AdditionalBarcodeConfirmModal
          onClose={close}
          onYes={() => setActiveModal("moreBarcodes")}
        />
      )}
      {activeModal === "moreBarcodes" && (
        <MoreBarcodesModal
          form={form}
          products={products}
          currentProductId={selectedId}
          upd={upd}
          notify={notify}
          onDuplicate={showDuplicateBarcode}
          onClose={close}
        />
      )}
      {activeModal === "openingStock" && <OpeningStockModal form={form} upd={upd} notify={notify} onClose={close} />}
      {activeModal === "reorderLevel" && <ReorderLevelModal form={form} upd={upd} notify={notify} onClose={close} />}
      {activeModal === "rack" && <RackModal form={form} upd={upd} notify={notify} onClose={close} />}
      {activeModal === "defaultDiscount" && <DefaultDiscountModal form={form} upd={upd} onClose={close} />}
      {activeModal === "specification" && <SpecificationModal form={form} upd={upd} notify={notify} onClose={close} />}
      {activeModal === "photo" && <PhotoModal form={form} upd={upd} notify={notify} onClose={close} />}
      {activeModal === "printBarcode" && (
        <BarcodePrintModal
          productName={form.name}
          barcode={form.barcode || form.ean || form.code || ""}
          mrp={form.mrp || form.vatInclusive || ""}
          notify={notify}
          onClose={close}
        />
      )}
      {activeModal === "clearProducts" && (
        <ClearProductsModal
          productCount={products.length}
          busy={clearingProducts}
          onClear={clearAndOpenImport}
          onClose={close}
        />
      )}
      {activeModal === "import" && (
        <ImportModal
          onImport={onImportRecords}
          notify={notify}
          replacementMode={replacementActive}
          onClose={closeImport}
        />
      )}
      {activeModal === "search" && (
        <GlobalSearchModal
          products={products}
          shopPartEnabled={shopPartEnabled}
          onSelect={onSelectProduct}
          onClose={close}
        />
      )}
    </div>
  );
}
