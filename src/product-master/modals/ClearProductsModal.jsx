import React, { useState } from "react";
import Modal from "../Modal";

export default function ClearProductsModal({
  productCount,
  busy,
  onClear,
  onClose,
}) {
  const [confirmation, setConfirmation] = useState("");
  const confirmed = confirmation.trim().toUpperCase() === "CLEAR";

  return (
    <Modal title="Clear & Import Product Master" width="md" onClose={() => { if (!busy) onClose(); }}>
      <div className="pm-clear-products">
        <div className="pm-clear-products__warning">
          <strong>This will replace the current Product Master.</strong>
          <span>
            A CSV backup will download first. Then this shop&apos;s local and Firebase
            products will be deleted and verified before the Import window opens.
          </span>
        </div>

        <ul className="pm-clear-products__steps">
          <li>Current products: <strong>{productCount}</strong></li>
          <li>Internet connection and Shop Owner access are required.</li>
          <li>Product sync on other devices will be locked during replacement.</li>
        </ul>

        <label className="pm-field">
          <span>Type CLEAR to continue</span>
          <input
            className="pm-input"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={busy}
            autoFocus
          />
        </label>

        <div className="pm-window-foot">
          <button type="button" className="pm-btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="pm-btn pm-btn--danger"
            onClick={onClear}
            disabled={!confirmed || busy}
          >
            {busy ? "Backing up and clearing..." : "Download Backup & Clear"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
