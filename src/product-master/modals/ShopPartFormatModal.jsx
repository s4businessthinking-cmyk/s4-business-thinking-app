import React, { useMemo, useRef, useState } from "react";
import Modal from "../Modal";
import {
  DEFAULT_SHOP_PART_FORMAT,
  formatShopPartNumber,
  normalizeShopPartFormat,
} from "../shopPartNumbers";

export default function ShopPartFormatModal({ value, featureEnabled = true, onSave, onClose, notify }) {
  const [draft, setDraft] = useState(() => normalizeShopPartFormat(value));
  const [sampleOriginal, setSampleOriginal] = useState("ME013343");
  const [tokenLength, setTokenLength] = useState(4);
  const [sampleSerial, setSampleSerial] = useState(1233);
  const [applyToExisting, setApplyToExisting] = useState(featureEnabled);
  const patternRef = useRef(null);

  const preview = useMemo(
    () => formatShopPartNumber(sampleSerial, sampleOriginal, draft),
    [draft, sampleOriginal, sampleSerial]
  );

  const update = (field, nextValue) => setDraft((current) => ({ ...current, [field]: nextValue }));

  const insertToken = (token) => {
    const input = patternRef.current;
    const pattern = draft.pattern || "";
    const start = input?.selectionStart ?? pattern.length;
    const end = input?.selectionEnd ?? start;
    update("pattern", `${pattern.slice(0, start)}${token}${pattern.slice(end)}`);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    const normalized = normalizeShopPartFormat(draft);
    if (!/[A-Za-z0-9{}]/.test(normalized.pattern)) {
      notify("Enter a valid Shop Part Number pattern", "err");
      return;
    }
    if (applyToExisting && !window.confirm(
      "Apply this format to all existing Shop Part Numbers? Products with the same Original Part Number will remain grouped under one number."
    )) return;
    await onSave(normalized, { applyToExisting });
    onClose();
  };

  return (
    <Modal title="SHOP PART NUMBER FORMAT SETTINGS" onClose={onClose} width="xl">
      <div className="pm-shop-part-format">
        <div className="pm-shop-part-format__builder">
          <label className="pm-field">
            <span className="pm-label">Format Pattern</span>
            <input
              ref={patternRef}
              className="pm-input"
              value={draft.pattern}
              maxLength={80}
              onChange={(event) => update("pattern", event.target.value)}
              autoFocus
            />
          </label>

          <div className="pm-shop-part-format__tokens">
            <span>Insert at cursor:</span>
            <button type="button" className="pm-btn-secondary" onClick={() => insertToken("{ORIGINAL}")}>Full Original</button>
            <button type="button" className="pm-btn-secondary" onClick={() => insertToken(`{FIRST${tokenLength}}`)}>First {tokenLength}</button>
            <button type="button" className="pm-btn-secondary" onClick={() => insertToken(`{LAST${tokenLength}}`)}>Last {tokenLength}</button>
            <button type="button" className="pm-btn-secondary" onClick={() => insertToken(`{SERIAL${tokenLength}}`)}>Serial {tokenLength}</button>
          </div>

          <div className="pm-shop-part-format__options">
            <label className="pm-field">
              <span className="pm-label">Token Length</span>
              <input
                className="pm-input"
                type="number"
                min="1"
                max="30"
                value={tokenLength}
                onChange={(event) => setTokenLength(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
              />
            </label>
            <label className="pm-field">
              <span className="pm-label">Letter Style</span>
              <select className="pm-input" value={draft.caseStyle} onChange={(event) => update("caseStyle", event.target.value)}>
                <option value="upper">UPPERCASE</option>
                <option value="lower">lowercase</option>
                <option value="asis">As typed</option>
              </select>
            </label>
            <label className="pm-field">
              <span className="pm-label">Duplicate Suffix Separator</span>
              <input
                className="pm-input"
                value={draft.collisionSeparator}
                maxLength={3}
                onChange={(event) => update("collisionSeparator", event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="pm-shop-part-format__preview">
          <strong>Live Preview</strong>
          <label className="pm-field">
            <span className="pm-label">Sample Original Part Number</span>
            <input className="pm-input" value={sampleOriginal} onChange={(event) => setSampleOriginal(event.target.value)} />
          </label>
          <label className="pm-field">
            <span className="pm-label">Sample Serial</span>
            <input
              className="pm-input"
              type="number"
              min="1"
              value={sampleSerial}
              onChange={(event) => setSampleSerial(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <div className="pm-shop-part-format__result">{preview}</div>
          <div className="pm-shop-part-format__examples">
            <span><b>UBP-3343:</b> UBP-{"{LAST4}"}</span>
            <span><b>13343-UBP:</b> {"{LAST5}"}-UBP</span>
            <span><b>ME-UBP-3343:</b> {"{FIRST2}"}-UBP-{"{LAST4}"}</span>
            <span><b>UBP-1233-3343:</b> UBP-{"{SERIAL4}"}-{"{LAST4}"}</span>
          </div>
        </div>

        <label className="pm-check pm-shop-part-format__apply">
          <input
            type="checkbox"
            checked={applyToExisting}
            disabled={!featureEnabled}
            onChange={(event) => setApplyToExisting(event.target.checked)}
          />
          {featureEnabled
            ? "Apply this new format to all existing products. Products sharing the same Original Part Number will still receive one identical Shop Part Number."
            : "The feature is currently OFF. This format will be applied when Shop Part Number is enabled."}
        </label>

        <div className="pm-master-actions">
          <button type="button" className="pm-btn-secondary" onClick={() => setDraft({ ...DEFAULT_SHOP_PART_FORMAT })}>Reset Default</button>
          <button type="button" className="pm-btn pm-btn--primary" onClick={save}>Save Format</button>
          <button type="button" className="pm-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
