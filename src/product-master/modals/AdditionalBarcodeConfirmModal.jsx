import React from "react";
import Modal from "../Modal";

export default function AdditionalBarcodeConfirmModal({ onYes, onClose }) {
  return (
    <Modal title="Additional Barcode" width="sm" onClose={onClose}>
      <div className="pm-confirm-dialog">
        <div className="pm-confirm-dialog__icon" aria-hidden="true">?</div>
        <div className="pm-confirm-dialog__message">
          Do you want to enter additional barcode for this product?
        </div>
      </div>
      <div className="pm-confirm-dialog__actions">
        <button type="button" className="pm-btn pm-btn--primary" autoFocus onClick={onYes}>Yes</button>
        <button type="button" className="pm-btn" onClick={onClose}>No</button>
      </div>
    </Modal>
  );
}
