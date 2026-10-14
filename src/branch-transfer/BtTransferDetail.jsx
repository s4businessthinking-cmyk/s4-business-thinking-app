import { bt, TransferRemaining, acceptedQty, fq, BT_ACCENT, fmtDay, transferSentDate, sentQty, f2, transferTotalValue } from "./btShared.jsx";
import { numberValue, receivedQuantityForLine, remainingQuantityForLine } from "./branchTransferDomain.js";

export function damagedQuantityForLine(transfer, lineId) {
  return (transfer?.receipts || []).reduce((total, receipt) => {
    const line = (receipt?.lines || []).find((entry) => entry.lineId === lineId);
    return total + numberValue(line?.damagedQty);
  }, 0);
}

export function TransferDetail({ lang, mobile, transfer, isOwner, canManage, canReceive, canCreateInvoice, busy, onStatus, onDelete, onReceive, onCreateInvoice, onPrint, onBack }) {
  const t = bt(lang);
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const remaining = TransferRemaining(transfer);
  const status = transfer.status;
  const receipts = transfer.receipts || [];
  const vRow = (label, value, opts = {}) => (
    <div className="pm-form-row">
      <span className="pm-label">{label}</span>
      <div className={`si-val${opts.strong ? " is-strong" : ""}`} style={opts.color ? { color: opts.color } : undefined}>{value}</div>
    </div>
  );
  const issueNotesOf = (lineId) => receipts.flatMap((receipt) => receipt.lines || []).filter((line) => line.lineId === lineId && line.issueNote).map((line) => line.issueNote).join(" · ");
  const askCancel = () => {
    const received = acceptedQty(transfer) > 0;
    const msg = received
      ? L(`${transfer.transferNo} বাতিল করবেন?\nযা আগে রিসিভ হয়েছে তা Branch-এই থাকবে। বাকি ${fq(remaining)} টা আর পাঠানো হবে না (মেইন দোকানেই থাকবে)।`, `Cancel ${transfer.transferNo}?\nWhat was already received stays at the branch. The remaining ${fq(remaining)} will not be sent (stays in the main shop).`)
      : L(`${transfer.transferNo} বাতিল করবেন?\nকোনো পণ্য Branch-এ যাবে না, সব মেইন দোকানেই থাকবে।`, `Cancel ${transfer.transferNo}?\nNothing goes to the branch; everything stays in the main shop.`);
    if (window.confirm(msg)) onStatus(transfer, "cancelled");
  };
  const billNo = (receipt) => `PI-BT-${transfer.transferNo || transfer.id}-${receipt.sequence || 1}`;
  const billCell = (receipt) => {
    if (receipt.purchaseInvoiceId) return <span style={{ color: "#15803d", fontWeight: 700 }}>✓ {billNo(receipt)}</span>;
    if (numberValue(receipt.acceptedTotal) <= 0) return <span className="si-muted">—</span>;
    if (canCreateInvoice) return <button type="button" className="pm-btn-secondary" disabled={busy} onClick={() => onCreateInvoice(transfer, receipt)}>🧾 {t.createInvoice}</button>;
    return <span className="si-muted">{L("বিল হয়নি", "No bill")}</span>;
  };

  return (
    <>
      <div className="si-body">
        <fieldset className="pm-panel" style={{ margin: 0 }}>
          <legend className="pm-panel-legend">{L("তথ্য", "Details")}</legend>
          <div className={mobile ? "si-panel-body" : "si-cols"} style={{ paddingTop: 3, ...(mobile ? {} : { gridTemplateColumns: "repeat(3,minmax(0,1fr))" }) }}>
            <div className="si-panel-body" style={{ paddingTop: 0 }}>
              {vRow(L("নম্বর", "No"), transfer.transferNo, { strong: true, color: BT_ACCENT })}
              {vRow(t.transferDate, fmtDay(transferSentDate(transfer)) || "—")}
              {vRow(t.branch, transfer.branchName || "—", { strong: true })}
              {vRow(t.assignedTo, transfer.receiverName || "—")}
          </div>
            <div className="si-panel-body" style={{ paddingTop: 0 }}>
              {vRow(t.createdBy, transfer.createdByName || "—")}
              {vRow(L("ভেন্ডর", "Vendor"), [transfer.vendorName, transfer.supplierInvoiceNo && `🧾 ${transfer.supplierInvoiceNo}`].filter(Boolean).join(" · ") || "—")}
              {vRow(t.expectedDate, fmtDay(transfer.expectedDeliveryDate) || "—")}
              {vRow(t.note, transfer.note || "—")}
            </div>
            <div className="si-panel-body" style={{ paddingTop: 0 }}>
              {vRow(t.sent, `${fq(sentQty(transfer))} · ${(transfer.items || []).length} ${t.itemsCount}`)}
              {vRow(t.received, fq(acceptedQty(transfer)), { color: "#15803d" })}
              {vRow(t.remaining, fq(remaining), { strong: true, color: remaining > 0 && status !== "cancelled" ? "#d97706" : undefined })}
              {vRow(t.totalValue, f2(transferTotalValue(transfer)), { strong: true })}
            </div>
          </div>
        </fieldset>
        {receipts.some((receipt) => numberValue(receipt.damagedTotal) > 0) && (
          <div className="si-note" style={{ color: "#b45309" }}>
            ⚠️ {L(
              `পথে নষ্ট ${fq(receipts.reduce((sum, receipt) => sum + numberValue(receipt.damagedTotal), 0))} টা এখনো দোকানের মোট স্টকে ধরা আছে — Stock Adjustment-এ "নষ্ট / ভাঙা" দিয়ে কমিয়ে দিন।`,
              `${fq(receipts.reduce((sum, receipt) => sum + numberValue(receipt.damagedTotal), 0))} damaged on the way are still in the shop's total stock — reduce them in Stock Adjustment as "Damaged".`
          )}
        </div>
        )}
        {status === "cancelled" && (
          <div className="si-note" style={{ color: "#b91c1c" }}>
            🚫 {L("বাতিল", "Cancelled")} {fmtDay(transfer.cancelledAt)} — {acceptedQty(transfer) > 0
              ? L("যা রিসিভ হয়েছিল তা Branch-এ আছে; বাকিটা মেইন দোকানে।", "What was received stays at the branch; the rest is in the main shop.")
              : L("কোনো পণ্য Branch-এ যায়নি।", "Nothing went to the branch.")}
      </div>
        )}
        <div className="si-box">
          {mobile ? (transfer.items || []).map((item, index) => (
            <div key={item.lineId} className="si-mrow" style={{ cursor: "default" }}>
              <div className="si-mrow-top"><span>{index + 1}. {item.name}</span><b>{f2(numberValue(item.quantity) * numberValue(item.unitCost))}</b></div>
              <div className="si-mrow-sub"><span>{[item.code, item.brand].filter(Boolean).join(" · ")}</span><span>{f2(item.unitCost)} / {item.unit}</span></div>
              <div className="si-mrow-sub">
                <span>{t.sent} <b>{fq(item.quantity)}</b> · {t.received} <b style={{ color: "#15803d" }}>{fq(receivedQuantityForLine(transfer, item.lineId))}</b></span>
                <span>{damagedQuantityForLine(transfer, item.lineId) > 0 && <>{t.damaged} <b style={{ color: "#b91c1c" }}>{fq(damagedQuantityForLine(transfer, item.lineId))}</b> · </>}{t.remaining} <b>{fq(remainingQuantityForLine(transfer, item))}</b></span>
      </div>
              {issueNotesOf(item.lineId) && <div className="si-mrow-sub" style={{ color: "#b91c1c" }}><span>⚠️ {issueNotesOf(item.lineId)}</span></div>}
            </div>
          )) : (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 28 }} className="si-center">#</th>
                <th>{L("পণ্য", "Item")}</th>
                <th style={{ width: 110 }}>{L("কোড", "Code")}</th>
                <th style={{ width: 60 }}>{t.unit}</th>
                <th style={{ width: 80 }} className="si-num">{t.unitCost}</th>
                <th style={{ width: 70 }} className="si-num">{t.sent}</th>
                <th style={{ width: 70 }} className="si-num">{t.received}</th>
                <th style={{ width: 70 }} className="si-num">{t.damaged}</th>
                <th style={{ width: 70 }} className="si-num">{t.remaining}</th>
                <th style={{ width: 90 }} className="si-num">{L("মূল্য", "Value")}</th>
                <th style={{ width: 160 }}>{t.issueNote}</th>
              </tr></thead>
              <tbody>
          {(transfer.items || []).map((item, index) => {
            const damaged = damagedQuantityForLine(transfer, item.lineId);
                  const left = remainingQuantityForLine(transfer, item);
            return (
                    <tr key={item.lineId}>
                      <td className="si-center">{index + 1}</td>
                      <td className="si-strong" title={item.name}>{item.name}{item.brand ? <span className="si-muted"> · {item.brand}</span> : null}</td>
                      <td>{item.code || ""}</td>
                      <td>{item.unit || ""}</td>
                      <td className="si-num">{f2(item.unitCost)}</td>
                      <td className="si-num">{fq(item.quantity)}</td>
                      <td className="si-num" style={{ color: "#15803d" }}>{fq(receivedQuantityForLine(transfer, item.lineId))}</td>
                      <td className="si-num" style={damaged > 0 ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{fq(damaged)}</td>
                      <td className="si-num si-strong" style={left > 0 && status !== "cancelled" ? { color: "#d97706" } : undefined}>{fq(left)}</td>
                      <td className="si-num">{f2(numberValue(item.quantity) * numberValue(item.unitCost))}</td>
                      <td title={issueNotesOf(item.lineId)} style={{ color: "#b91c1c" }}>{issueNotesOf(item.lineId)}</td>
                    </tr>
            );
          })}
              </tbody>
            </table>
          )}
            </div>
        {receipts.length > 0 && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{t.receiptHistory}</legend>
            <div className="si-box" style={{ border: 0 }}>
              {mobile ? receipts.map((receipt) => (
                <div key={receipt.id} className="si-mrow" style={{ cursor: "default" }}>
                  <div className="si-mrow-top"><span>R{receipt.sequence} · {fmtDay(receipt.receivedAt)}</span><span>{receipt.receivedByName || "—"}</span></div>
                  <div className="si-mrow-sub"><span>{L("ভালো", "Good")} <b>{fq(receipt.acceptedTotal)}</b>{numberValue(receipt.damagedTotal) > 0 && <> · {t.damaged} <b style={{ color: "#b91c1c" }}>{fq(receipt.damagedTotal)}</b></>}</span>{billCell(receipt)}</div>
                </div>
              )) : (
                <table className="pm-table">
                  <thead><tr>
                    <th style={{ width: 50 }}>R#</th>
                    <th style={{ width: 90 }}>{L("তারিখ", "Date")}</th>
                    <th>{L("রিসিভ করেছেন", "Received by")}</th>
                    <th style={{ width: 80 }} className="si-num">{L("ভালো", "Good")}</th>
                    <th style={{ width: 80 }} className="si-num">{t.damaged}</th>
                    <th style={{ width: 230 }}>{L("রিসিভ বিল", "Receipt bill")}</th>
                  </tr></thead>
                  <tbody>
                    {receipts.map((receipt) => (
                      <tr key={receipt.id}>
                        <td className="si-strong">R{receipt.sequence}</td>
                        <td>{fmtDay(receipt.receivedAt)}</td>
                        <td>{receipt.receivedByName || "—"}</td>
                        <td className="si-num" style={{ color: "#15803d" }}>{fq(receipt.acceptedTotal)}</td>
                        <td className="si-num" style={numberValue(receipt.damagedTotal) > 0 ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{fq(receipt.damagedTotal)}</td>
                        <td style={{ padding: "1px 4px" }}>{billCell(receipt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
        </div>
          </fieldset>
        )}
      </div>
      <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
        <button type="button" className="pm-btn-secondary" disabled={busy} onClick={onBack}>← {L("তালিকা", "List")}</button>
        <button type="button" className="pm-btn-secondary" onClick={() => onPrint(transfer)}>🖨️ {L("চালান প্রিন্ট", "Print")}</button>
        <span className="si-toolbar-gap" />
        {canManage && status === "draft" && <button type="button" className="pm-btn-secondary" disabled={busy} onClick={() => onStatus(transfer, "packed")}>📦 {t.packed}</button>}
        {canManage && ["draft", "packed"].includes(status) && <button type="button" className="pm-btn pm-btn--primary" disabled={busy} onClick={() => onStatus(transfer, "dispatched")}>🚚 {t.dispatch}</button>}
        {canManage && status === "dispatched" && <button type="button" className="pm-btn-secondary" disabled={busy} onClick={() => onStatus(transfer, "in_transit")}>🛣️ {t.inTransit}</button>}
        {canManage && status === "discrepancy" && remaining === 0 && <button type="button" className="pm-btn pm-btn--primary" disabled={busy} onClick={() => onStatus(transfer, "received")}>✓ {t.completed}</button>}
        {canManage && !["received", "cancelled"].includes(status) && <button type="button" className="pm-btn-secondary pm-btn--danger" disabled={busy} onClick={askCancel}>⛔ {t.cancel}</button>}
        {isOwner && status === "cancelled" && <button type="button" className="pm-btn-secondary pm-btn--danger" disabled={busy} onClick={() => { if (window.confirm(L(`ট্রান্সফার ${transfer.transferNo || ""} একেবারে মুছে ফেলবেন?`, `Delete transfer ${transfer.transferNo || ""} permanently?`))) onDelete(transfer); }}>🗑️ {L("মুছুন", "Delete")}</button>}
        {canReceive && <button type="button" className="pm-btn pm-btn--primary" disabled={busy} onClick={() => onReceive(transfer)}>📥 {t.receive}</button>}
    </div>
    </>
  );
}
