import { BT_ACCENT, SkinShell, StatusBadge, TransferRemaining, acceptedQty, f2, fmtDay, fq, itemSummary, sentQty, transferSentDate, transferTotalValue } from "./btShared.jsx";
import { BranchStockView } from "./BtBranchStockView.jsx";
import { NewTransferForm } from "./BtNewTransferForm.jsx";
import { TransferDetail } from "./BtTransferDetail.jsx";
import { statusLabel } from "./branchTransferDomain.js";

export function renderBtWorkspace({ L, backToList, branches, busy, canInvoiceRow, canReceiveRow, canReceiveTransfer, canSendTransfer, changeStatus, completed, createInvoice, createTransfer, deleteTransfer, dirtyRef, discrepancies, filtered, fitH, from, incomingList, invoiceRows, isOwner, kpiRows, lang, mainStock, mobile, openDetail, openNew, printTransfer, products, receiveWindow, reload, rootRef, search, section, selId, setFrom, setReceiving, setSearch, setSection, setStatusFilter, setTo, shellTitle, shopStock, statusFilter, stockBranchIds, stockRows, t, team, to, toast, totalValue, transfers, vendors, view, visibleTransfers, waiting }) {
  if (view === "new" && canSendTransfer) {
  return (
      <SkinShell rootRef={rootRef} fitH={fitH} titleLeft={L("নতুন ট্রান্সফার", "New Transfer")} titleRight={shellTitle}>
        <NewTransferForm lang={lang} mobile={mobile} branches={branches} team={team} products={products} vendors={vendors}
          mainStock={mainStock} busy={busy} dirtyRef={dirtyRef} toast={toast} onSave={createTransfer} onBack={backToList} />
      </SkinShell>
    );
  }

  const sel = view === "detail" && selId ? transfers.find((row) => row.id === selId) : null;
  if (sel) {
    return (
      <SkinShell rootRef={rootRef} fitH={fitH} titleLeft={<>{sel.transferNo} <StatusBadge status={sel.status} lang={lang} /></>} titleRight={shellTitle}>
        <TransferDetail lang={lang} mobile={mobile} transfer={sel} isOwner={isOwner} canManage={canSendTransfer}
          canReceive={canReceiveRow(sel)} canCreateInvoice={canInvoiceRow(sel)} busy={busy}
          onStatus={changeStatus} onDelete={deleteTransfer} onReceive={setReceiving} onCreateInvoice={createInvoice}
          onPrint={printTransfer} onBack={backToList} />
        {receiveWindow}
      </SkinShell>
    );
  }

  const statusOptions = [
    ["", L("সব অবস্থা", "All statuses")],
    ["open", L("চলমান (শেষ হয়নি)", "Open (not finished)")],
    ...["draft", "packed", "dispatched", "in_transit", "partially_received", "discrepancy", "received", "cancelled"].map((key) => [key, statusLabel(key, lang)]),
  ];

  return (
    <SkinShell rootRef={rootRef} fitH={fitH} titleLeft={shellTitle} titleRight={section === "stock" ? t.stock : `${filtered.length} ${L("টি", "transfers")}`}>
      <div className="si-toolbar">
        {canSendTransfer && <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {t.newTransfer}</button>}
        <div className="si-pills">
          <button type="button" className={`pm-btn-secondary${section === "all" ? " is-active" : ""}`} onClick={() => setSection("all")}>{canSendTransfer ? L("সব ট্রান্সফার", "All transfers") : L("আমার ট্রান্সফার", "My transfers")}</button>
          {canReceiveTransfer && (
            <button type="button" className={`pm-btn-secondary${section === "incoming" ? " is-active" : ""}`} onClick={() => setSection("incoming")}>
              📥 {t.incoming}{incomingList.length ? ` (${incomingList.length})` : ""}
            </button>
          )}
          <button type="button" className={`pm-btn-secondary${section === "stock" ? " is-active" : ""}`} onClick={() => setSection("stock")}>📦 {t.stock}</button>
        </div>
        <span className="si-toolbar-gap" />
        <button type="button" className="pm-btn-secondary" disabled={busy} onClick={reload}>🔄 {t.refresh}</button>
      </div>

      {section === "stock" ? (
        <BranchStockView lang={lang} mobile={mobile} stockRows={stockRows} shopStock={shopStock} branches={branches} branchIds={stockBranchIds} loading={!invoiceRows} />
      ) : (
        <>
          <div className="si-kpis">
            <div className="si-kpi"><span>{t.totalTransfers}</span><b>{kpiRows.length}</b></div>
            <div className="si-kpi"><span>{t.waitingReceive}</span><b style={{ color: "#d97706" }}>{waiting}</b></div>
            <div className="si-kpi"><span>{t.discrepancy}</span><b style={{ color: "#dc2626" }}>{discrepancies}</b></div>
            <div className="si-kpi"><span>{t.completed}</span><b style={{ color: "#15803d" }}>{completed}</b></div>
            <div className="si-kpi"><span>{t.totalValue}</span><b>{f2(totalValue)}</b></div>
      </div>
          <div className="si-filters">
            <div className="si-search">
              <input className="pm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPlaceholder} />
              {search && <button type="button" onClick={() => setSearch("")}>✕</button>}
          </div>
            <select className="pm-input" style={{ width: mobile ? "100%" : 170 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {statusOptions.map(([key, label]) => <option key={key || "all"} value={key}>{label}</option>)}
            </select>
            <input type="date" className="pm-input" title={t.fromDate} style={{ width: mobile ? "calc(50% - 2px)" : 120 }} value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="pm-input" title={t.toDate} style={{ width: mobile ? "calc(50% - 2px)" : 120 }} value={to} onChange={(e) => setTo(e.target.value)} />
            {(search || statusFilter || from || to) && <button type="button" className="pm-btn-secondary" onClick={() => { setSearch(""); setStatusFilter(""); setFrom(""); setTo(""); }}>{t.clearFilter}</button>}
        </div>
          <div className="si-main is-all">
            <div className="si-box">
              {mobile ? filtered.map((transfer) => (
                <button key={transfer.id} type="button" className="si-mrow" onClick={() => openDetail(transfer)} style={transfer.status === "cancelled" ? { opacity: 0.6 } : undefined}>
                  <div className="si-mrow-top"><span style={{ color: BT_ACCENT }}>{transfer.transferNo}</span><StatusBadge status={transfer.status} lang={lang} /></div>
                  <div className="si-mrow-sub"><span>{fmtDay(transferSentDate(transfer))} · {transfer.branchName}</span><b>{f2(transferTotalValue(transfer))}</b></div>
                  <div className="si-mrow-sub">
                    <span>{transfer.receiverName || "—"}</span>
                    {TransferRemaining(transfer) > 0 && transfer.status !== "cancelled" && <span className="si-due">{t.remaining} {fq(TransferRemaining(transfer))}</span>}
                  </div>
                </button>
              )) : filtered.length > 0 && (
                <table className="pm-table">
                  <thead><tr>
                    <th style={{ width: 80 }}>{L("তারিখ", "Date")}</th>
                    <th style={{ width: 150 }}>{L("নম্বর", "No")}</th>
                    <th style={{ width: 130 }}>{t.branch}</th>
                    <th style={{ width: 120 }}>{t.assignedTo}</th>
                    <th>{L("পণ্য", "Items")}</th>
                    <th style={{ width: 64 }} className="si-num">{t.sent}</th>
                    <th style={{ width: 64 }} className="si-num">{t.received}</th>
                    <th style={{ width: 64 }} className="si-num">{t.remaining}</th>
                    <th style={{ width: 90 }} className="si-num">{L("মূল্য", "Value")}</th>
                    <th style={{ width: 120 }} className="si-center">{L("অবস্থা", "Status")}</th>
                    <th style={{ width: 84 }} />
                  </tr></thead>
                  <tbody>
                    {filtered.map((transfer) => {
                      const left = TransferRemaining(transfer);
                      return (
                        <tr key={transfer.id} className="pm-clickable" onClick={() => openDetail(transfer)} style={transfer.status === "cancelled" ? { color: "#6b7280" } : undefined} title={transfer.note || ""}>
                          <td>{fmtDay(transferSentDate(transfer))}</td>
                          <td className="si-strong" style={{ color: transfer.status === "cancelled" ? undefined : BT_ACCENT }}>{transfer.transferNo}</td>
                          <td title={transfer.branchName || ""}>{transfer.branchName}</td>
                          <td title={transfer.receiverName || ""}>{transfer.receiverName || "—"}</td>
                          <td title={itemSummary(transfer)}>{itemSummary(transfer)}</td>
                          <td className="si-num">{fq(sentQty(transfer))}</td>
                          <td className="si-num" style={{ color: "#15803d" }}>{fq(acceptedQty(transfer))}</td>
                          <td className="si-num si-strong" style={left > 0 && transfer.status !== "cancelled" ? { color: "#d97706" } : undefined}>{fq(left)}</td>
                          <td className="si-num">{f2(transferTotalValue(transfer))}</td>
                          <td className="si-center"><StatusBadge status={transfer.status} lang={lang} /></td>
                          <td className="si-center" style={{ padding: "1px 2px" }}>
                            {canReceiveRow(transfer) && <button type="button" className="pm-btn-secondary" style={{ minHeight: 17, padding: "0 6px" }} disabled={busy} onClick={(e) => { e.stopPropagation(); setReceiving(transfer); }}>📥 {t.receive}</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {!filtered.length && (
                <div className="si-empty">
                  {section === "incoming" ? t.noIncoming
                    : !canSendTransfer && !visibleTransfers.length ? t.notAssigned
                    : visibleTransfers.length ? L("এই ফিল্টারে কিছু নেই", "Nothing matches these filters")
                    : t.noTransfers}
                </div>
              )}
            </div>
          </div>
          <div className="si-statusbar">
            <span>{L("দেখাচ্ছে", "Showing")} <b>{filtered.length}</b> / {visibleTransfers.length}</span>
            <span>{L("ট্রান্সফার = দোকানের ভেতরে মাল সরানো। এতে মোট স্টক, ক্রয় বা সাপ্লায়ারের বাকি বাড়ে না।", "A transfer moves goods inside your shop. It does not change total stock, purchases or supplier dues.")}</span>
          </div>
        </>
      )}
      {receiveWindow}
    </SkinShell>
  );
}
