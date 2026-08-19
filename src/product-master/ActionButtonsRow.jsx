import React from "react";

export default function ActionButtonsRow({
  form,
  upd,
  canDelete,
  hasProduct,
  busy,
  onNew,
  onSave,
  onDelete,
  onPrintBarcode,
  onSearch,
  onClose,
  onDefaultDiscount,
  onSetReorderLevel,
  onSetRack,
  onImport,
  onExport,
  onClearAndImport,
  canClearAll,
  productMaintenanceActive,
  onSpecification,
  onPhotoSetting,
  onPrintOpeningStockBarcodes,
  onOpeningStockEntry,
  onGenerateWeighingFile,
}) {
  return (
    <div className="pm-actions">
      <div className="pm-actions-left">
        <label className="pm-check pm-multi-rate-check">
          <input type="checkbox" checked={!!form.multiCustomerRatesEnabled}
            onChange={(e) => upd("multiCustomerRatesEnabled", e.target.checked)} />
          Enable Selling rate settings for multiple customer types
        </label>
        <div className="pm-master-tools">
          <button type="button" className="pm-btn-secondary" onClick={onDefaultDiscount}>Default Discount</button>
          <button type="button" className="pm-btn-secondary" onClick={onSetReorderLevel}>Set Reorder Level</button>
          <button type="button" className="pm-btn-secondary" onClick={onSetRack}>Set Rack</button>
          <button type="button" className="pm-btn-secondary" onClick={onImport}>Import</button>
          <button type="button" className="pm-btn-secondary" onClick={onExport}>Export</button>
          {canClearAll && (
            <button type="button" className="pm-btn-danger" onClick={onClearAndImport} disabled={busy}>
              Clear &amp; Import
            </button>
          )}
          <button type="button" className="pm-btn-secondary pm-tool-wide" onClick={onSpecification}>Product Specification</button>
          <button type="button" className="pm-btn-secondary pm-tool-photo" onClick={onPhotoSetting}>Product Photo setting...</button>
        </div>
      </div>

      <div className="pm-actions-middle">
        <div className="pm-opening-tools">
          <button type="button" className="pm-btn-secondary" onClick={onPrintOpeningStockBarcodes}>Print Opening stock Barcodes</button>
          <button type="button" className="pm-btn-secondary" onClick={onOpeningStockEntry}>Opening Stock Entry</button>
        </div>
        <button type="button" className="pm-btn-secondary pm-weighing-btn" onClick={onGenerateWeighingFile}>
          Generate Data file for Weighing barcode machine
        </button>
        <div className="pm-primary-actions">
          <button type="button" className="pm-btn" onClick={onNew}>New</button>
          <button type="button" className="pm-btn" onClick={onSave} disabled={busy || productMaintenanceActive}>{busy ? "Saving..." : "Save"}</button>
          <button type="button" className="pm-btn" onClick={onDelete} disabled={!hasProduct || !canDelete}>Delete</button>
          <button type="button" className="pm-btn" onClick={onPrintBarcode}>Print<br />Barcode</button>
          <button type="button" className="pm-btn" onClick={onSearch}>Search<br />(F10)</button>
          <button type="button" className="pm-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
