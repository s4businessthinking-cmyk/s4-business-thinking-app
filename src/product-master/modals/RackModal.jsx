import React, { useState } from "react";
import Modal from "../Modal";

export default function RackModal({ form, upd, onClose, notify }) {
  const parts = String(form.rackLocation || "").split("/").map((p) => p.trim());
  const [rack, setRack] = useState(parts[0] || "");
  const [shelf, setShelf] = useState(parts[1] || "");
  const [bin, setBin] = useState(parts[2] || "");

  function save() {
    const value = [rack.trim(), shelf.trim(), bin.trim()].filter(Boolean).join(" / ");
    upd("rackLocation", value);
    notify("Rack location set — press Save to store it");
    onClose();
  }

  return (
    <Modal title="Set Rack / Shelf / Bin Location" onClose={onClose} width="sm">
      <div className="pm-field">
        <label className="pm-label">Rack</label>
        <input className="pm-input" value={rack} onChange={(e) => setRack(e.target.value)} autoFocus />
      </div>
      <div className="pm-field">
        <label className="pm-label">Shelf</label>
        <input className="pm-input" value={shelf} onChange={(e) => setShelf(e.target.value)} />
      </div>
      <div className="pm-field">
        <label className="pm-label">Bin</label>
        <input className="pm-input" value={bin} onChange={(e) => setBin(e.target.value)} />
      </div>
      <div className="pm-window-foot">
        <button type="button" className="pm-btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="pm-btn" onClick={save}>Save</button>
      </div>
    </Modal>
  );
}
