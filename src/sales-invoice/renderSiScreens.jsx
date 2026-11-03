import { AutoTA, PI_VOUCHER_METHODS } from "../shared/appShared.jsx";
import BatchPickModal from "./BatchPickModal";
import PartyPickerWindow, { CUSTOMER_PICKER_COLS } from "../components/PartyPickerWindow.jsx";
import { MinimizedChip, WindowButtons } from "../components/WindowChrome.jsx";
import { PM_CSS } from "../product-master/pmStyles";
import { PM_TH, SI_CSS } from "./siSkin.js";
import ProductInvoiceEntryInfo from "./ProductInvoiceEntryInfo.jsx";
import { ProductTypeaheadInput } from "../components/ProductTypeaheadInput.jsx";
import { SI_PAY, siCalcLine, siCalcTotals, siFmt2, siInvoiceExtras, siIsSettledPay, siN2, siR2, siSettledPayLabel, siUnitOptionsFor } from "./salesInvoiceShared.js";
import SalesInvoiceDesktopForm from "./SalesInvoiceDesktopForm.jsx";
import { SiCustomerPicker } from "./SiCustomerPicker.jsx";
import { SiItemsTable } from "./SiItemsTable.jsx";
import StockBadge from "../inventory/StockBadge.jsx";
import { groupInvoicesByParty } from "../invoices/PartyFolderList.jsx";
import { itemBaseQty } from "../inventory/unitConversion";
import { printMoneyReceipt, qtIsExpired } from "./siHelpers.js";
import { salesSpecs } from "../product-master/productSpecs";

export function renderSiScreens({ STATUSES, balance, billReturns, bnL, canCancelInv, canCustBalance, canDiscount, canManageCustomers, canPrintInv = false, canSeeCost, cashReceiptWindow, customerPickerProps, customers, editInvId, formIsCash, formIsDelivery, formIsSettled, formIsTax, formPaid, invoices, isDN, isOwner, isQuote, isSO, kind, kpiCards, lang, ledgerWindow, mobileTypeOptions, onConvertQuote, onConvertToDN, onOpenProductMaster, onStartReturn, products, receiptWindow, receipts, selInv, setCashReceiptWin, setLedgerWin, setReceiptWin, setShowCustPicker, setSiCurrent, setSiEditLineId, setSiForm, setSiGroupMode, setSiLines, setSiOpenParty, setSiPrintModal, setSiPrintPayAsk, setSiSearch, setSiStatusF, setSiView, shop, shopId, showCustPicker, siAccent, siAddCurrentItem, siBadge, siBatchAsk, siCanDeleteDoc, siCanEditDoc, siCancel, siChangeCurrentUnit, siConfirm, siCurrent, siDelLine, siDelete, siDocTitle, siEditLineId, siEmptyCurrent, siExpiredBadge, siFiltered, siFindProduct, siForm, siGroupMode, siInvoiceNo, siLeaveDetail, siLeaveMinOk, siLeaveUnsavedOk, siLightC, siLines, siLoading, siMatchedLines, siMobile, siNameRef, siOpenEdit, siOpenFromDesktop, siOpenInvoice, siOpenNew, siOpenParty, siPickCustomers, siPrint, siPrintAs, siPrintModal, siPrintPayAsk, siQtyRef, siQuickAddCustomer, siReminderForm, siOpenReminderForm, siRequestPrint, siSaveReminder, setSiReminderForm, siRootRef, siRootStyle, siRowDue, siSaveDraft, siSaving, siSearch, siSelectCustomer, siSelectProduct, siStatusF, siUpd, siView, siWin, sourceQuote, t, team, toast, totals, wideDesktop }) {
  // Confirming a document opens a fresh form (or the detail view after an edit), so the print prompt
  // is rendered on every screen, not only on the list.
  const siPrintPrompt = canPrintInv&&siPrintModal&&(
      <div className="pm-backdrop" style={{ zIndex:10000, alignItems:"center" }}>
        <style>{PM_CSS}</style>
        <div className="pm-window" style={{ maxWidth:380 }} role="dialog" aria-modal="true">
          <div className="pm-window-title">
            <span>✅ {isSO ? (bnL?"সেলস অর্ডার সেভ হয়েছে":"Sales order saved") : isQuote ? (bnL?"কোটেশন সেভ হয়েছে":"Quotation saved") : isDN ? (bnL?"ডেলিভারি নোট সেভ হয়েছে":"Delivery note saved") : (bnL?"ইনভয়েস সেভ হয়েছে":"Invoice saved")}</span>
            <button type="button" className="pm-window-close" onClick={()=>setSiPrintModal(null)}>✕</button>
          </div>
          <div className="pm-window-body">
            <div style={{ fontWeight:700, marginBottom:8 }}>🖨️ {bnL?"প্রিন্ট করবেন?":"Print now?"}</div>
            <div className="si-total-row"><span>{t.si_invoiceNo}</span><b>{siPrintModal.invoiceNo}</b></div>
            <div className="si-total-row"><span>{t.si_customer}</span><b>{siPrintModal.customerName||"—"}</b></div>
            <div className="si-total-row is-grand"><span>{t.si_grandTotal}</span><b>{t.cur} {siFmt2(siPrintModal.grandTotal)}</b></div>
            <div className="pm-window-foot">
              <button type="button" className="pm-btn-secondary" onClick={()=>setSiPrintModal(null)}>{bnL?"না":"No"}</button>
              <button type="button" className="pm-btn pm-btn--primary" autoFocus onClick={()=>{ siPrint(siPrintModal); setSiPrintModal(null); }}>🖨️ {bnL?"হ্যাঁ, প্রিন্ট":"Yes, print"}</button>
            </div>
          </div>
        </div>
      </div>
  );
  const siPrintPayPrompt = canPrintInv&&siPrintPayAsk&&(
      <div className="pm-backdrop" style={{ zIndex:10000, alignItems:"center" }}>
        <style>{PM_CSS}</style>
        <div className="pm-window" style={{ maxWidth:400 }} role="dialog" aria-modal="true">
          <div className="pm-window-title">
            <span>🖨️ {bnL?"কীভাবে প্রিন্ট করবেন?":"Print as Cash or Credit?"}</span>
            <button type="button" className="pm-window-close" onClick={()=>setSiPrintPayAsk(false)}>✕</button>
          </div>
          <div className="pm-window-body">
            <div style={{ fontWeight:700, marginBottom:10 }}>{bnL?"এই বিল ক্যাশ না ক্রেডিট?":"Is this bill Cash or Credit?"}</div>
            <div className="pm-window-foot" style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button type="button" className="pm-btn-secondary" onClick={()=>setSiPrintPayAsk(false)}>{bnL?"বাতিল":"Cancel"}</button>
              <button type="button" className="pm-btn" style={{ background:"#b45309", color:"#fff" }} onClick={()=>siPrintAs("credit")}>📅 {bnL?"ক্রেডিট":"Credit"}</button>
              <button type="button" className="pm-btn pm-btn--primary" autoFocus onClick={()=>siPrintAs("cash")}>💵 {bnL?"ক্যাশ":"Cash"}</button>
            </div>
          </div>
        </div>
      </div>
  );
  if (siView==="list" || (siView==="form" && siWin.min && wideDesktop)) {
    const groups = groupInvoicesByParty(siFiltered, { idField:"customerId", nameField:"customerName" });
    const openGroup = siGroupMode==="folders" && siOpenParty ? (groups.find(g=>g.key===siOpenParty) || null) : null;
    const allRows = openGroup ? openGroup.invoices : siFiltered;
    // Thousands of rows in one flat table makes the page heavy to open and scroll — cap it
    // (newest first, invoices are already sorted that way) and point to search/filter instead.
    const LIST_ROW_LIMIT = 300;
    const rows = !openGroup && allRows.length > LIST_ROW_LIMIT ? allRows.slice(0, LIST_ROW_LIMIT) : allRows;
    const rowsTruncated = rows.length < allRows.length;
    const cashName = bnL ? "ক্যাশ (নাম ছাড়া)" : "Cash (no name)";
    const groupName = (g) => g.isCash ? cashName : g.name;
    const rowsSum = allRows.reduce((a,inv)=>{
      if (!["cancelled","draft"].includes(inv.status)) { a.total += siN2(inv.grandTotal); a.due += siRowDue(inv); }
      if (inv.status==="draft") a.drafts += 1;
      return a;
    }, { total:0, due:0, drafts:0 });
    const showParties = siGroupMode==="folders" && (!siMobile || !openGroup);
    const showInvoices = siGroupMode==="all" || !siMobile || !!openGroup;
    const newLabel = isSO ? (bnL?"+ নতুন সেলস অর্ডার":"+ New Sales Order") : isQuote ? (bnL?"+ নতুন কোটেশন":"+ New Quotation") : isDN ? (bnL?"+ নতুন ডেলিভারি নোট":"+ New Delivery Note") : (bnL?"+ নতুন ইনভয়েস":"+ New Invoice");
    const emptyText = isSO ? (bnL?"এখনো কোনো সেলস অর্ডার নেই":"No sales orders yet") : isQuote ? (bnL?"এখনো কোনো কোটেশন নেই":"No quotations yet") : isDN ? (bnL?"এখনো কোনো ডেলিভারি নোট নেই":"No delivery notes yet") : t.si_noInvoices;
    const matchBlock = (inv) => siMatchedLines(inv).map(({ it, net }, i)=>(
      <div key={i} className="si-match">📦 {it.name}{it.code?` · ${it.code}`:""} — {it.qty} {it.unit} × {siFmt2(net)}</div>
    ));
    return (
      <div ref={siRootRef} className="si-root" style={siRootStyle}>
        <style>{PM_CSS}</style>
        <style>{SI_CSS}</style>
        {siView==="form"&&siWin.min&&(
          <MinimizedChip lang={lang} onRestore={siWin.restore}
            title={`${isSO?"SALES ORDER":isQuote?"QUOTATION":isDN?"DELIVERY NOTE":"SALES INVOICE"} ${siInvoiceNo||""}`}
            onClose={()=>{ if (siLeaveUnsavedOk()) setSiView("list"); }} />
        )}
        {showCustPicker&&<SiCustomerPicker {...customerPickerProps} />}
        {siPrintPrompt}{siPrintPayPrompt}
        {receiptWindow}
        {cashReceiptWindow}
        {ledgerWindow}

        <div className="pm-reference-title">
          <strong style={{ color:siAccent }}>{siDocTitle}</strong>
          <span>
            {invoices.length} {bnL?"টি":"total"}
            {!isOwner ? ` · ${bnL?"শুধু আমার":"Mine only"}` : ""}
          </span>
        </div>

        <div className="si-toolbar">
          <button type="button" className="pm-btn pm-btn--primary" onClick={()=>{ if (siLeaveMinOk()) siOpenNew(); }} disabled={siSaving}>
            {newLabel}{kind==="sales"&&!siMobile?" (F4)":""}
          </button>
          {kind==="sales"&&canCustBalance&&<button type="button" className="pm-btn-secondary" onClick={()=>setLedgerWin(true)}>📒 {bnL?"কাস্টমার লেজার":"Customer Ledger"}</button>}
          {kind==="sales"&&<button type="button" className="pm-btn-secondary" onClick={()=>setReceiptWin({})}>💰 {bnL?"রিসিট (টাকা গ্রহণ)":"Receipts"}</button>}
        </div>

        {invoices.length>0&&(
          <div className="si-kpis">
            {kpiCards.map((k,i)=>(
              <div key={i} className="si-kpi"><span>{k.l}</span><b style={{ color:siLightC[k.c]||k.c }}>{k.pre}{k.v}</b></div>
            ))}
          </div>
        )}

        <div className="si-filters">
          <div className="si-search">
            <input className="pm-input" placeholder={t.si_searchPh} value={siSearch} onChange={e=>setSiSearch(e.target.value)} />
            {siSearch&&<button type="button" aria-label="Clear" onClick={()=>setSiSearch("")}>✕</button>}
          </div>
          <div className="si-pills">
            {["ALL",...Object.keys(STATUSES)].map(st=>(
              <button key={st} type="button" className={`pm-btn-secondary${siStatusF===st?" is-active":""}`} onClick={()=>setSiStatusF(st)}>
                {st==="ALL"?t.si_allStatus:STATUSES[st]?.[lang]}
              </button>
            ))}
          </div>
          <div className="si-pills">
            {[["folders", bnL?"📁 নাম অনুযায়ী":"📁 By name"], ["all", bnL?"📋 সব":"📋 All"]].map(([m,label])=>(
              <button key={m} type="button" className={`pm-btn-secondary${siGroupMode===m?" is-active":""}`} onClick={()=>{ setSiGroupMode(m); setSiOpenParty(null); }}>{label}</button>
            ))}
          </div>
        </div>

        <div className={`si-main${siGroupMode==="all" || siMobile ? " is-all" : ""}`}>
          {showParties&&(
            <div className="si-box">
              <table className="pm-table">
                <colgroup><col /><col style={{ width:siMobile?96:76 }} /><col style={{ width:siMobile?84:68 }} /></colgroup>
                <thead><tr><th>{t.si_customer}</th><th className="si-num">{bnL?"মোট":"Total"}</th><th className="si-num">{bnL?"বাকি":"Due"}</th></tr></thead>
                <tbody>
                  {!siMobile&&groups.length>0&&(
                    <tr className={`pm-clickable${!openGroup?" pm-selected":""}`} onClick={()=>setSiOpenParty(null)}>
                      <td className="si-strong">{bnL?"সব কাস্টমার":"All customers"} ({siFiltered.length})</td><td /><td />
                    </tr>
                  )}
                  {groups.map(g=>{
                    const stCounts = {};
                    g.invoices.forEach(inv=>{ stCounts[inv.status] = (stCounts[inv.status]||0)+1; });
                    return (
                    <tr key={g.key} className={`pm-clickable si-party-row${openGroup?.key===g.key?" pm-selected":""}`} onClick={()=>setSiOpenParty(g.key)}>
                      <td className="si-wrap">
                        {g.isCash?"💵 ":""}{groupName(g)}
                        <div className="si-muted" style={{ fontWeight:400, fontSize:"0.9em" }}>
                          {g.invoices.length} {bnL?"টি":(g.invoices.length===1?"doc":"docs")}{g.lastDate?` · ${g.lastDate}`:""}
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:3 }}>
                          {Object.keys(STATUSES).filter(st=>stCounts[st]).map(st=>(
                            <span key={st} style={{ fontSize:"0.78em", fontWeight:700, padding:"1px 6px", borderRadius:8, color:STATUSES[st]?.color, background:STATUSES[st]?.bg }}>
                              {STATUSES[st]?.[lang]||st}: {stCounts[st]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="si-num">{siFmt2(g.total)}</td>
                      <td className={`si-num${g.due>0.01?" si-due":""}`}>{g.due>0.01?siFmt2(g.due):"-"}</td>
                    </tr>
                    );
                  })}
                  {groups.length===0&&<tr><td colSpan={3} className="si-empty">{siLoading?"⏳":invoices.length===0?emptyText:t.si_noResults}</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {showInvoices&&(
            <div className="si-box">
              {siMobile&&openGroup&&(
                <button type="button" className="pm-btn-secondary" style={{ width:"100%", minHeight:36, marginBottom:3 }} onClick={()=>setSiOpenParty(null)}>
                  ← {bnL?"সব কাস্টমার":"All customers"} · {groupName(openGroup)}
                </button>
              )}
              {rowsTruncated&&(
                <div className="si-hint" style={{ padding:"4px 8px" }}>
                  {bnL?`প্রথম ${rows.length}টি দেখানো হচ্ছে (মোট ${allRows.length}) — খুঁজে বা ফিল্টার করে কমান`:`Showing the latest ${rows.length} of ${allRows.length} — search or filter to narrow it down`}
                </div>
              )}
              {siLoading ? <div className="si-empty">⏳</div>
                : invoices.length===0 ? <div className="si-empty">{emptyText}</div>
                : rows.length===0 ? <div className="si-empty">🔍 {t.si_noResults}</div>
                : siMobile ? rows.map(inv=>{
                  const due = siRowDue(inv);
                  return (
                    <button key={inv.id} type="button" className="si-mrow" onClick={()=>siOpenInvoice(inv)}>
                      <div className="si-mrow-top">
                        <span style={{ color:siAccent }}>{inv.invoiceNo}</span>
                        <span>{siExpiredBadge(inv)}{siBadge(inv.status)}</span>
                      </div>
                      <div className="si-mrow-sub"><span>{inv.customerName||"—"}</span><b>{t.cur} {siFmt2(inv.grandTotal)}</b></div>
                      <div className="si-mrow-sub">
                        <span>{inv.invoiceDate}{inv.createdByName?` · ${inv.createdByName}`:""}</span>
                        {due>0.01 ? <span className="si-due">{bnL?"বাকি":"Due"} {siFmt2(due)}</span>
                          : (isQuote||isDN)&&inv.convertedInvoiceNo ? <span style={{ color:"#15803d" }}>→ {inv.convertedInvoiceNo}</span> : null}
                      </div>
                      {matchBlock(inv)}
                    </button>
                  );
                })
                : (
                  <table className="pm-table">
                    <colgroup>
                      <col style={{ width:96 }} /><col style={{ width:78 }} /><col style={{ width:140 }} />
                      {Object.keys(STATUSES).map(st=><col key={st} style={{ width:74 }} />)}
                      {(isQuote||isDN) ? <col style={{ width:110 }} /> : <><col style={{ width:42 }} /><col style={{ width:84 }} /><col style={{ width:84 }} /></>}
                      <col style={{ width:88 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>{t.si_invoiceNo}</th><th>{t.si_date}</th><th>{t.si_customer}</th>
                        {Object.keys(STATUSES).map(st=><th key={st} className="si-center" style={{ textOverflow:"ellipsis" }} title={STATUSES[st]?.[lang]||st}>{STATUSES[st]?.[lang]||st}</th>)}
                        {(isQuote||isDN) ? <th>{isSO?(bnL?"ডেলিভারি / বিল":"Delivery / Bill"):isQuote?(bnL?"মেয়াদ / ইনভয়েস":"Valid / Invoice"):(bnL?"ইনভয়েস":"Invoice")}</th>
                          : <><th className="si-num">{bnL?"আইটেম":"Items"}</th><th className="si-num">{bnL?"মোট":"Total"}</th><th className="si-num">{bnL?"পরিশোধ":"Paid"}</th></>}
                        <th className="si-num">{(isQuote||isDN)?(bnL?"মোট":"Total"):(bnL?"বাকি":"Due")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(inv=>{
                        const due = siRowDue(inv);
                        const matches = matchBlock(inv);
                        return (
                          <tr key={inv.id} className="pm-clickable" onClick={()=>siOpenInvoice(inv)} title={inv.note||""}>
                            <td className="si-strong" style={{ color:siAccent }}>{inv.invoiceNo}</td>
                            <td>{inv.invoiceDate}</td>
                            <td title={inv.customerName||""}>{inv.customerName||"—"}{matches}</td>
                            {Object.keys(STATUSES).map(st=>(
                              <td key={st} className="si-center">
                                {inv.status===st && <span style={{ color:STATUSES[st]?.color, fontWeight:900, fontSize:12 }}>{STATUSES[st]?.[lang]||st}</span>}
                                {st==="open" && siExpiredBadge(inv)}
                              </td>
                            ))}
                            {(isQuote||isDN) ? (
                              <td>{inv.convertedInvoiceNo ? <span style={{ color:"#15803d" }}>→ {inv.convertedInvoiceNo}</span> : (isQuote ? (inv.validUntil||"-") : "-")}</td>
                            ) : (
                              <>
                                <td className="si-num">{inv.items?.length||0}</td>
                                <td className="si-num si-strong">{siFmt2(inv.grandTotal)}</td>
                                <td className="si-num">{siN2(inv.amountPaid)>0?siFmt2(inv.amountPaid):"-"}</td>
                              </>
                            )}
                            <td className={`si-num${(isQuote||isDN)?" si-strong":due>0.01?" si-due":""}`}>
                              {(isQuote||isDN) ? siFmt2(inv.grandTotal) : due>0.01 ? siFmt2(due) : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
            </div>
          )}
        </div>

        <div className="si-statusbar">
          <span>{bnL?"দেখানো":"Showing"}: <b>{rows.length}</b>{openGroup?` · ${groupName(openGroup)}`:""}</span>
          <span>{bnL?"মোট":"Total"}: <b>{t.cur} {siFmt2(rowsSum.total)}</b></span>
          {!isQuote&&!isDN&&<span>{bnL?"বাকি":"Due"}: <b style={{ color:rowsSum.due>0.01?"#b91c1c":undefined }}>{t.cur} {siFmt2(rowsSum.due)}</b></span>}
          {rowsSum.drafts>0&&<span style={{ color:"#b45309" }}>{bnL?`${rowsSum.drafts}টি ড্রাফট মোটে ধরা হয়নি`:`${rowsSum.drafts} draft(s) not counted in totals`}</span>}
        </div>
      </div>
    );
  }

  // ══ DETAIL ══
  if (siView==="detail"&&selInv) {
    const inv=invoices.find(x=>x.id===selInv.id)||selInv;
    const isTax       = inv.invoiceType==="tax";
    const isInvSettled = siIsSettledPay(inv.paymentMethod, inv.cashPartial);
    const isInvCash   = inv.paymentMethod==="cash";
    const isInvDelivery = inv.invoiceType==="delivery";
    const { sub, disc, vat, grand, adjustment, roundOff } = siCalcTotals(inv.items||[], isTax&&!isInvDelivery, siInvoiceExtras(inv));
    const bal=grand-siN2(inv.amountPaid);
    const canEdit=siCanEditDoc(inv);
    // settled cash/bank/card is always fully paid → no mark paid button; "partial cash" tracks a real balance instead
    const canPay=!isQuote&&!isInvSettled&&!isInvCash&&["confirmed","partial"].includes(inv.status);
    const canPayCash=!isQuote&&isInvCash&&inv.cashPartial&&["confirmed","partial"].includes(inv.status);
    const canConvert=!!onConvertQuote&&((isQuote&&["draft","open"].includes(inv.status)&&!qtIsExpired(inv))||(isDN&&inv.status==="confirmed"));
    const related = kind==="sales" ? receipts.filter(r=>(r.allocations||[]).some(a=>a.invoiceId===inv.id)) : [];
    const paidOnBill = kind!=="sales" || ["draft","cancelled"].includes(inv.status) ? 0 : siR2(siN2(inv.amountPaid)
      - related.filter(r=>r.status!=="cancelled").reduce((s,r)=>s+siN2((r.allocations||[]).find(a=>a.invoiceId===inv.id)?.amount),0)
      - billReturns.filter(r=>r.status!=="cancelled"&&r.invoiceId===inv.id).reduce((s,r)=>s+siN2(r.appliedToInvoice),0));
    const typeLabel = { regular:t.si_regular, tax:t.si_tax, delivery:t.si_delivery }[inv.invoiceType] || inv.invoiceType || "-";
    const vRow = (label, value, opts={}) => (
      <div className="pm-form-row">
        <label className="pm-label">{label}</label>
        <div className={`si-val${opts.strong?" is-strong":""}`} style={opts.color?{ color:opts.color }:undefined}>{value}</div>
      </div>
    );
    const totalRows = [
      [t.si_subtotal, siFmt2(sub)],
      ...(disc>0?[[t.si_totalDiscount, `- ${siFmt2(disc)}`, "#b91c1c"]]:[]),
      ...(vat>0?[["VAT", `+ ${siFmt2(vat)}`, "#0e7490"]]:[]),
      ...(adjustment?[[bnL?"সমন্বয়":"Adjustment", `${adjustment>0?"+":"-"} ${siFmt2(Math.abs(adjustment))}`]]:[]),
      ...(roundOff?[["Round Off", `${roundOff>0?"+":"-"} ${siFmt2(Math.abs(roundOff))}`]]:[]),
    ];
    const back = () => siLeaveDetail();
    return (
      <div ref={siRootRef} className="si-root" style={siRootStyle}>
        {siPrintPrompt}{siPrintPayPrompt}
        <style>{PM_CSS}</style>
        <style>{SI_CSS}</style>
        {receiptWindow}
        {cashReceiptWindow}

        <div className="pm-reference-title">
          <strong style={{ color:siAccent }}>{siDocTitle} — {inv.invoiceNo}</strong>
          <span>{siExpiredBadge(inv)}{siBadge(inv.status)}</span>
        </div>

        <div className="si-body">
          <div className="si-cols">
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{bnL?"ডকুমেন্ট":"Document"}</legend>
              <div className="si-panel-body">
                {vRow(t.si_invoiceNo, inv.invoiceNo, { strong:true, color:siAccent })}
                {vRow(t.si_date, inv.invoiceDate||"-")}
                {!isQuote&&!isDN&&vRow(t.si_invoiceType, typeLabel)}
                {isQuote&&!isSO&&vRow(bnL?"মেয়াদ":"Valid until", `${inv.validUntil||"—"}${qtIsExpired(inv)?(bnL?" (মেয়াদ শেষ)":" (Expired)"):""}`, { color:qtIsExpired(inv)?"#b91c1c":undefined })}
                {isSO&&vRow(bnL?"ডেলিভারির তারিখ":"Delivery by", inv.validUntil||"—")}
                {!isSO&&inv.salesOrderNo&&vRow(bnL?"সেলস অর্ডার":"Sales Order", inv.salesOrderNo, { color:"#0e7490" })}
                {inv.jobOrderNo&&vRow(bnL?"জব কার্ড":"Job Card", inv.jobOrderNo, { color:"#c2410c" })}
                {!isSO&&inv.deliveryNoteId&&vRow(bnL?"ডেলিভারি নোট":"Delivery Note", inv.deliveryNoteNo, { color:"#7e22ce" })}
                {!isSO&&!inv.deliveryNoteId&&(inv.deliveryNoteNo||inv.vehicleNo)&&vRow(t.si_deliverySection, [inv.deliveryNoteNo, inv.vehicleNo].filter(Boolean).join(" · "))}
                {(isQuote||isDN)&&inv.convertedInvoiceNo&&vRow(isSO&&inv.status==="delivered"?(bnL?"ডেলিভারি নোট":"Delivery Note"):(bnL?"ইনভয়েস":"Invoice"), inv.convertedInvoiceNo, { strong:true, color:"#15803d" })}
                {!isQuote&&inv.quotationNo&&vRow(bnL?"কোটেশন":"Quotation", inv.quotationNo, { color:"#b45309" })}
                {inv.salesmanName&&vRow(bnL?"সেলসম্যান":"Salesman", inv.salesmanName)}
                {vRow(t.si_createdBy, inv.createdByName||"-")}
              </div>
            </fieldset>
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{t.si_customer}</legend>
              <div className="si-panel-body">
                {vRow(bnL?"নাম":"Name", inv.customerName||"—", { strong:true })}
                {(()=>{ const code = inv.customerCode || (customers||[]).find(c=>c.id===inv.customerId)?.customerCode; return code ? vRow(bnL?"কোড":"Code", code) : null; })()}
                {vRow(bnL?"মোবাইল":"Mobile", inv.customerMobile||"-")}
                {vRow(bnL?"ঠিকানা":"Address", inv.customerAddress||"-")}
                {(isTax||inv.customerTrn)&&vRow("TRN", inv.customerTrn||"-")}
                {!isQuote&&!isDN&&siN2(inv.creditDays)>0&&vRow(bnL?"বাকির দিন":"Credit Days", inv.creditDays)}
                {inv.note&&<div className="si-note">📝 {inv.note}</div>}
              </div>
            </fieldset>
          </div>

          <fieldset className="pm-panel">
            <legend className="pm-panel-legend">📦 {t.si_items} ({inv.items?.length||0})</legend>
            <div className="si-panel-body">
              <SiItemsTable items={inv.items||[]} lang={lang} isTax={isTax&&!isInvDelivery} showDisc={!isInvDelivery} />
            </div>
          </fieldset>

          <div className="si-cols">
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{t.si_summary}</legend>
              <div className="si-panel-body">
                {totalRows.map(([l,v,c],i)=>(
                  <div key={i} className="si-total-row"><span>{l}</span><b style={c?{ color:c }:undefined}>{t.cur} {v}</b></div>
                ))}
                <div className="si-total-row is-grand"><span>{t.si_grandTotal}</span><span style={{ color:siAccent }}>{t.cur} {siFmt2(grand)}</span></div>
              </div>
            </fieldset>
            {!isQuote&&!isDN&&(
              <fieldset className="pm-panel">
                <legend className="pm-panel-legend">💳 {t.si_payment}</legend>
                <div className="si-panel-body">
                  <div className="si-total-row"><span>{t.si_paymentMethod}</span><b>{SI_PAY[inv.paymentMethod]?.icon} {SI_PAY[inv.paymentMethod]?.[lang]||"-"}</b></div>
                  {isInvSettled ? (
                    <div className="si-paid-box"><span>✅ {siSettledPayLabel(inv.paymentMethod, lang)}</span><span>{t.cur} {siFmt2(inv.amountPaid||grand)}</span></div>
                  ) : !isInvDelivery && (
                    <>
                      <div className="si-total-row"><span>{t.si_amountPaid}</span><b style={{ color:"#15803d" }}>{t.cur} {siFmt2(inv.amountPaid)}</b></div>
                      <div className={`si-paid-box${bal>0.01?" is-due":""}`}><span>{t.si_balanceDue}</span><span>{t.cur} {siFmt2(Math.max(0,bal))}</span></div>
                    </>
                  )}
                  {related.length>0&&(
                    <div className="pm-table-wrap" style={{ marginTop:3 }}>
                      <table className="pm-table">
                        <colgroup><col /><col style={{ width:80 }} /><col style={{ width:84 }} /></colgroup>
                        <thead><tr><th>💰 {bnL?"রিসিট":"Receipt"}</th><th>{t.si_date}</th><th className="si-num">{bnL?"টাকা":"Amount"}</th></tr></thead>
                        <tbody>
                          {related.map(r=>{
                            const amt=(r.allocations||[]).find(a=>a.invoiceId===inv.id)?.amount||0;
                            const off=r.status==="cancelled";
                            return (
                              <tr key={r.id} className="pm-clickable" style={off?{ opacity:0.55 }:undefined} onClick={()=>setReceiptWin({ viewId:r.id })}>
                                <td>{r.receiptNo} {PI_VOUCHER_METHODS[r.method]?.icon||"💵"}{off?(bnL?" (বাতিল)":" (cancelled)"):""}</td>
                                <td>{r.receiptDate}</td>
                                <td className="si-num si-strong" style={off?{ textDecoration:"line-through" }:{ color:"#15803d" }}>{siFmt2(amt)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </fieldset>
            )}
          </div>
        </div>

        <div className="si-actions">
          <button type="button" className="pm-btn-secondary" onClick={back}>← {bnL?"তালিকা":"List"}</button>
          {canPrintInv&&<button type="button" className="pm-btn pm-btn--primary" onClick={()=>siRequestPrint(inv)}>🖨️ {bnL?"প্রিন্ট":"Print"}</button>}
          {paidOnBill>0.01&&<button type="button" className="pm-btn" onClick={()=>printMoneyReceipt(inv, paidOnBill, shop, lang)} title={bnL?"বিলের সাথে নেওয়া টাকার রশিদ":"Receipt for the money taken with this bill"}>🧾 {bnL?"মানি রিসিট":"Money Receipt"}</button>}
          {canConvert&&isSO&&onConvertToDN&&<button type="button" className="pm-btn" onClick={()=>onConvertToDN(inv)}>🚚 {bnL?"ডেলিভারি নোট বানান":"Make Delivery Note"}</button>}
          {canConvert&&<button type="button" className="pm-btn" onClick={()=>onConvertQuote(inv)}>🧾 {bnL?"ইনভয়েসে রূপান্তর":"Convert to Invoice"}</button>}
          {canEdit&&<button type="button" className="pm-btn" onClick={()=>siOpenEdit(inv)}>✏️ {bnL?"এডিট":"Edit"}</button>}
          <button type="button" className="pm-btn-secondary" onClick={()=>siOpenReminderForm(inv)}>⏰ {bnL?"রিমাইন্ডার":"Remind me"}</button>
          {kind==="sales"&&onStartReturn&&["confirmed","partial","paid"].includes(inv.status)&&<button type="button" className="pm-btn" onClick={()=>onStartReturn(inv)}>↩️ {bnL?"রিটার্ন":"Return"}</button>}
          {canPay&&kind==="sales"&&<button type="button" className="pm-btn" onClick={()=>setReceiptWin({ partyId:inv.customerId||null, partyName:inv.customerName||"", invoiceId:inv.id })}>💰 {bnL?"টাকা গ্রহণ":"Receive Payment"}</button>}
          {canPayCash&&kind==="sales"&&<button type="button" className="pm-btn" onClick={()=>setCashReceiptWin({ partyId:inv.customerId||null, partyName:inv.customerName||"", invoiceId:inv.id })}>💵 {bnL?"ক্যাশ রিসিট ভাউচার":"Cash Receipt Voucher"}</button>}
          {canCancelInv&&["confirmed","partial","paid","draft","open"].includes(inv.status)&&<button type="button" className="pm-btn pm-btn--danger" onClick={()=>siCancel(inv)}>{bnL?"বাতিল":"Cancel"}</button>}
          {siCanDeleteDoc(inv)&&<button type="button" className="pm-btn pm-btn--danger" onClick={()=>siDelete(inv)}>🗑 {bnL?"মুছুন":"Delete"}</button>}
          {isOwner&&!["draft","cancelled"].includes(inv.status)&&<span className="si-hint">{bnL?"মুছতে চাইলে আগে বাতিল করুন (স্টক ঠিক থাকবে)":"To delete, cancel first (keeps stock correct)"}</span>}
          {!canEdit&&!isOwner&&["confirmed","paid","partial"].includes(inv.status)&&related.some(r=>r.status!=="cancelled")&&(
            <span className="si-hint">{bnL?"টাকা নেওয়া হয়েছে — এডিট করতে আগে রিসিট বাতিল করুন":"Payment received — cancel the receipt first to edit"}</span>
          )}
        </div>
        {siReminderForm&&siReminderForm.invoiceId===inv.id&&(
          <fieldset className="pm-panel" style={{ margin:"0 0 6px" }}>
            <legend className="pm-panel-legend">⏰ {bnL?"রিমাইন্ডার সেট করুন":"Set a reminder"}</legend>
            <div className="si-panel-body" style={{ gap:6 }}>
              <div className="si-grid2">
                <input type="date" className="pm-input" value={siReminderForm.date} onChange={e=>setSiReminderForm(p=>({ ...p, date:e.target.value }))} />
                <input type="time" className="pm-input" value={siReminderForm.time} onChange={e=>setSiReminderForm(p=>({ ...p, time:e.target.value }))} />
              </div>
              <input className="pm-input" placeholder={bnL?"নোট (ঐচ্ছিক)":"Note (optional)"} value={siReminderForm.note} onChange={e=>setSiReminderForm(p=>({ ...p, note:e.target.value }))} />
              <div style={{ display:"flex", gap:6 }}>
                <button type="button" className="pm-btn pm-btn--primary" disabled={!siReminderForm.date} onClick={siSaveReminder}>✅ {bnL?"সেভ করুন":"Save"}</button>
                <button type="button" className="pm-btn-secondary" onClick={()=>setSiReminderForm(null)}>{bnL?"বাতিল":"Cancel"}</button>
              </div>
            </div>
          </fieldset>
        )}
      </div>
    );
  }

  // ══ FORM ══
  if (wideDesktop) return (
    <div style={{ position:"fixed", inset:siWin.max?0:"28px 40px", zIndex:1500, background:"#c7d8ee", padding:siWin.max?6:"0 6px 6px", boxSizing:"border-box", overflowX:"auto", overflowY:"hidden", display:"flex", flexDirection:"column", border:siWin.max?"none":"1px solid #2854ad", boxShadow:siWin.max?"none":"0 18px 50px rgba(2,6,23,0.45)" }}>
      {siPrintPrompt}{siPrintPayPrompt}
      <div onDoubleClick={siWin.toggleMax} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, margin:siWin.max?"-6px -6px 6px":"0 -6px 6px", padding:"4px 6px 4px 12px", background:"linear-gradient(180deg,#3f69bd,#2854ad)", color:"#fff", fontSize:13, fontWeight:800, userSelect:"none", flexShrink:0, fontFamily:"Segoe UI, Tahoma, sans-serif" }}>
        <span>{isSO?"SALES ORDER":isQuote?"QUOTATION":isDN?"DELIVERY NOTE":"SALES INVOICE"}{siInvoiceNo?` — ${siInvoiceNo}`:""}</span>
        <WindowButtons win={siWin} lang={lang} onClose={()=>{ if (siLeaveUnsavedOk()) setSiView("list"); }} />
      </div>
      {siBatchAsk&&<BatchPickModal lang={lang} product={siBatchAsk.product} choices={siBatchAsk.choices} onPick={c=>siBatchAsk.resolve(c)} onClose={()=>siBatchAsk.resolve(null)} />}
      {showCustPicker&&(
        <PartyPickerWindow title="Select Customer" columns={CUSTOMER_PICKER_COLS} items={siPickCustomers} lang={lang}
          partyWord="customer" modalId="customer-picker"
          onPick={(c)=>{ siSelectCustomer(c); setTimeout(()=>siNameRef.current?.focus(), 60); }}
          onClose={()=>{ setShowCustPicker(false); setTimeout(()=>siNameRef.current?.focus(), 30); }}
          onQuickAdd={canManageCustomers ? siQuickAddCustomer : null} />
      )}
      <SalesInvoiceDesktopForm
        lang={lang} t={t} shopId={shopId} products={products} customers={siPickCustomers} onSelectCustomer={siSelectCustomer} team={team} invoices={invoices}
        form={siForm} setField={siUpd} lines={siLines} setLines={setSiLines} current={siCurrent} setCurrent={setSiCurrent}
        totals={totals} formPaid={formPaid} balance={balance}
        invoiceNo={siInvoiceNo} editInvId={editInvId} saving={siSaving} nameRef={siNameRef} qtyRef={siQtyRef}
        helpers={{ siCalcLine, siFmt2, siN2, siUnitOptionsFor, SI_PAY, SI_STATUSES:STATUSES, emptyCurrent:siEmptyCurrent }}
        kind={kind}
        sourceQuoteNo={sourceQuote?.invoiceNo||""}
        sourceIsDN={sourceQuote?.docKind==="delivery"}
        sourceKind={sourceQuote?.docKind||""}
        onConvertQuote={(isQuote||isDN)&&onConvertQuote ? (inv)=>{ if (siLeaveUnsavedOk()) onConvertQuote(inv); } : undefined}
        onConvertToDN={isSO&&onConvertToDN ? (inv)=>{ if (siLeaveUnsavedOk()) onConvertToDN(inv); } : undefined}
        onSelectProduct={siSelectProduct} onChangeCurrentUnit={siChangeCurrentUnit} onAddCurrent={siAddCurrentItem} onDelLine={siDelLine}
        onOpenCustomerPicker={()=>setShowCustPicker(true)}
        onConfirm={siConfirm} onSaveDraft={siSaveDraft}
        onClose={()=>{ if (siLeaveUnsavedOk()) setSiView("list"); }}
        onNew={()=>{ if (siLeaveUnsavedOk()) siOpenNew(); }}
        onOpenInvoice={siOpenFromDesktop}
        canEditInvoice={siCanEditDoc}
        onCancelInvoice={canCancelInv ? async (inv)=>{ if (await siCancel(inv)) setSiView("detail"); } : undefined}
        onDeleteInvoice={(inv)=>{ if (siCanDeleteDoc(inv)) siDelete(inv); }}
        canDeleteInvoice={siCanDeleteDoc}
        canDiscount={canDiscount}
        canSeeCost={canSeeCost}
        onPrintInvoice={canPrintInv ? (inv)=>siRequestPrint(inv) : undefined}
        onOpenProductMaster={onOpenProductMaster}
        toast={toast}
        onOpenReminder={siOpenReminderForm}
        reminderForm={siReminderForm}
        onChangeReminder={setSiReminderForm}
        onSaveReminder={siSaveReminder}
        onCloseReminder={()=>setSiReminderForm(null)}
      />
    </div>
  );


  const pmInputStyle = siMobile
    ? { width:"100%", height:42, padding:"6px 10px", border:"1px solid #cbd5e1", borderRadius:8, background:"#fff", color:"#07101c", font:"15px Tahoma, Arial, sans-serif", outline:"none", boxSizing:"border-box" }
    : { width:"100%", height:20, padding:"1px 4px", border:"1px solid #8797a9", borderRadius:0, background:"#fff", color:"#07101c", font:"11px Tahoma, Arial, sans-serif", outline:"none", boxSizing:"border-box" };
  const fPanel = (title, children, extra) => (
    <fieldset className="pm-panel">
      <legend className="pm-panel-legend">{title}{extra}</legend>
      <div className="si-panel-body">{children}</div>
    </fieldset>
  );
  const fRow = (label, control) => (
    <div className="pm-form-row"><label className="pm-label">{label}</label>{control}</div>
  );
  const fField = (label, control) => (
    <div className="si-field"><label className="pm-label">{label}</label>{control}</div>
  );
  const formTitle = isSO
    ? (editInvId?(bnL?"সেলস অর্ডার এডিট":"EDIT SALES ORDER"):(bnL?"নতুন সেলস অর্ডার":"NEW SALES ORDER"))
    : isQuote
    ? (editInvId?(bnL?"কোটেশন এডিট":"EDIT QUOTATION"):(bnL?"নতুন কোটেশন":"NEW QUOTATION"))
    : isDN
    ? (editInvId?(bnL?"ডেলিভারি নোট এডিট":"EDIT DELIVERY NOTE"):(bnL?"নতুন ডেলিভারি নোট":"NEW DELIVERY NOTE"))
    : (editInvId?(bnL?"ইনভয়েস এডিট":"EDIT SALES INVOICE"):(bnL?"নতুন সেলস ইনভয়েস":"NEW SALES INVOICE"));
  const selectedType = mobileTypeOptions.find(([type])=>type===siForm.invoiceType);
  const priceCols = formIsTax&&!formIsDelivery ? (canDiscount?"minmax(0,1fr) 70px 62px":"minmax(0,1fr) 62px") : (!formIsDelivery&&canDiscount ? "minmax(0,1fr) 70px" : "1fr");
  const summaryRows = [
    [t.si_subtotal, siFmt2(totals.sub)],
    ...(totals.disc>0?[[t.si_totalDiscount, `- ${siFmt2(totals.disc)}`, "#b91c1c"]]:[]),
    ...(totals.vat>0?[["VAT", `+ ${siFmt2(totals.vat)}`, "#0e7490"]]:[]),
    ...(totals.adjustment?[[bnL?"সমন্বয়":"Adjustment", `${totals.adjustment>0?"+":"-"} ${siFmt2(Math.abs(totals.adjustment))}`]]:[]),
    ...(totals.roundOff?[["Round Off", `${totals.roundOff>0?"+":"-"} ${siFmt2(Math.abs(totals.roundOff))}`]]:[]),
  ];
  const closeForm = ()=>{ if (siLeaveUnsavedOk()) setSiView("list"); };

  return (
    <div ref={siRootRef} className="si-root" style={siRootStyle}>
      {siPrintPrompt}{siPrintPayPrompt}
      <style>{PM_CSS}</style>
      {siBatchAsk&&<BatchPickModal lang={lang} product={siBatchAsk.product} choices={siBatchAsk.choices} onPick={c=>siBatchAsk.resolve(c)} onClose={()=>siBatchAsk.resolve(null)} />}
      <style>{SI_CSS}</style>
      {showCustPicker&&<SiCustomerPicker {...customerPickerProps} />}

      <div className="pm-reference-title">
        <strong style={{ color:siAccent }}>{formTitle}{sourceQuote?` (${sourceQuote.invoiceNo})`:""}</strong>
        <span>{siInvoiceNo}</span>
      </div>

      <div className="si-body">
        {mobileTypeOptions.length>1&&fPanel(t.si_invoiceType, <>
          <select className="pm-input" value={siForm.invoiceType} onChange={e=>siUpd("invoiceType",e.target.value)}>
            {mobileTypeOptions.map(([type,icon,label])=><option key={type} value={type}>{icon} {label}</option>)}
          </select>
          {selectedType&&<div className="pm-hint">{selectedType[3]}</div>}
        </>)}

        {fPanel(`${t.si_invoiceNo} & ${t.si_date}`, <>
          <div className="si-grid2">
            {fField(t.si_invoiceNo, <div className="si-val is-strong" style={{ color:siAccent, fontFamily:"Consolas, monospace" }}>{siInvoiceNo}</div>)}
            {fField(t.si_date, <input type="date" className="pm-input" value={siForm.invoiceDate} onChange={e=>siUpd("invoiceDate",e.target.value)} />)}
          </div>
          {isQuote&&(
            <div className="si-grid2">
              {fField(isSO?(bnL?"ডেলিভারির তারিখ":"Delivery by"):(bnL?"মেয়াদ":"Valid Until"), <input type="date" className="pm-input" value={siForm.validUntil||""} onChange={e=>siUpd("validUntil",e.target.value)} />)}
              <div />
            </div>
          )}
        </>)}

        {fPanel(t.si_customer, <>
          <button type="button" className="pm-btn" style={{ width:"100%", minHeight:siMobile?36:24, textAlign:"left" }} onClick={()=>setShowCustPicker(true)}>
            {siForm.customerId ? `✅ ${siForm.customerName} — ${bnL?"বদলান":"change"}` : `👥 ${t.si_selectCustomer}`}
          </button>
          {!siForm.customerId&&fRow(bnL?"নাম":"Name", <input className="pm-input" placeholder={t.si_customerManual} value={siForm.customerName} onChange={e=>{
            siUpd("customerName",e.target.value);
            if (siForm.customerId) ["customerId","customerMobile","customerAddress","customerTrn","customerType","creditDays"].forEach(f=>siUpd(f,""));
          }} />)}
        </>)}

        {fPanel(`📦 ${t.si_items}`, <>
          <div className="si-entry">
            {fField(t.si_itemName, (
              <ProductTypeaheadInput
                products={products}
                value={siCurrent.name}
                onChange={(value)=>setSiCurrent((p)=>({ ...p, name:value, productId:null }))}
                onSelectProduct={siSelectProduct}
                field="name"
                inputRef={siNameRef}
                placeholder={t.si_itemName}
                th={PM_TH}
                lang={lang}
                onKeyDown={(e)=>e.key==="Enter"&&siAddCurrentItem()}
                style={{ ...pmInputStyle, fontWeight:700 }}
              />
            ))}
            <div className="si-grid2">
              {fField("Code / Model", (
                <ProductTypeaheadInput
                  products={products}
                  value={siCurrent.code}
                  onChange={(value)=>setSiCurrent((p)=>({ ...p, code:value }))}
                  onSelectProduct={siSelectProduct}
                  field="code"
                  placeholder="Code / Model"
                  th={PM_TH}
                  lang={lang}
                  onKeyDown={(e)=>e.key==="Enter"&&siAddCurrentItem()}
                  style={pmInputStyle}
                />
              ))}
              {fField(t.si_brand, <input className="pm-input" value={siCurrent.brand} onChange={e=>setSiCurrent(p=>({...p,brand:e.target.value}))} />)}
            </div>
            {siCurrent.productId && !isQuote && (()=>{
              const prod = siFindProduct(siCurrent.productId);
              const inBill = [...siLines.filter(it=>it.productId===siCurrent.productId && it.id!==siEditLineId), siCurrent].reduce((sum,it)=>sum+itemBaseQty(it, prod),0);
              return <StockBadge product={prod} products={products} shopId={shopId} refreshKey={invoices.length} lang={lang} extraQty={editInvId ? 0 : inBill} />;
            })()}
            {siCurrent.productId && (
              <ProductInvoiceEntryInfo
                product={siFindProduct(siCurrent.productId)}
                lang={lang}
                fmt={siFmt2}
                canSeeCost={canSeeCost}
              />
            )}
            {siCurrent.productId && (()=>{
              const spec = salesSpecs(siFindProduct(siCurrent.productId));
              return spec ? (
                <div style={{ margin:"6px 0", padding:"6px 10px", background:"#fff8db", border:"1px solid #e6c65c", borderRadius:6, fontSize:13, fontWeight:700, color:"#5b4300", lineHeight:1.5 }}>
                  📐 {spec}
                </div>
              ) : null;
            })()}
            {siCurrent.productId && (siForm.customerId || String(siForm.customerName||"").trim()) && (()=>{
              const custName = String(siForm.customerName||"").trim().toLowerCase();
              const history = invoices
                .filter(inv => inv.id!==editInvId && !["cancelled","draft"].includes(inv.status)
                  && (siForm.customerId ? inv.customerId===siForm.customerId : !inv.customerId && String(inv.customerName||"").trim().toLowerCase()===custName))
                .flatMap(inv => (inv.items||[]).filter(it=>it.productId===siCurrent.productId).map(it=>({ inv, it })))
                .sort((a,b)=>String(b.inv.invoiceDate||"").localeCompare(String(a.inv.invoiceDate||"")))
                .slice(0,3);
              if (!history.length) return <div className="pm-hint">🕘 {bnL?"এই কাস্টমারকে আগে এই পণ্য বিক্রি হয়নি":"Not sold to this customer before"}</div>;
              return (
                <div className="si-history">
                  <div className="pm-label" style={{ color:"#15803d" }}>🕘 {bnL?"এই কাস্টমারকে আগের দাম (চাপ দিলে বসবে)":"Previous price to this customer (tap to use)"}</div>
                  {history.map(({ inv, it }, i)=>{
                    const { disc, gross } = siCalcLine(it, false);
                    const qty = siN2(it.qty);
                    const net = qty>0 ? (gross - disc)/qty : siN2(it.unitPrice);
                    return (
                      <button key={i} type="button"
                        onClick={()=>setSiCurrent(p=>({ ...p, unit:it.unit||p.unit, unitPrice:String(it.unitPrice??p.unitPrice), discountPerc:String(it.discountPerc??p.discountPerc??"0") }))}>
                        <span className="si-muted">{inv.invoiceDate} · {inv.invoiceNo}</span>
                        <b style={{ color:"#15803d", whiteSpace:"nowrap" }}>{siFmt2(qty)} {it.unit||""} × {t.cur} {siFmt2(net)}</b>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            <div className="si-grid2">
              {fField(t.si_qty, <input className="pm-input" style={{ textAlign:"center" }} inputMode="decimal" placeholder="1" value={siCurrent.qty}
                ref={siQtyRef}
                onChange={e=>setSiCurrent(p=>({...p,qty:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&siAddCurrentItem()} />)}
              {fField(t.si_unit, (
                <select className="pm-input" value={siCurrent.unit} onChange={e=>siChangeCurrentUnit(e.target.value)}>
                  {siUnitOptionsFor(siFindProduct(siCurrent.productId), siCurrent.unit).map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              ))}
            </div>
            <div className="si-grid3" style={{ gridTemplateColumns:priceCols }}>
              {fField(`${t.si_unitPrice} (${t.cur})`, <input className="pm-input" style={{ fontWeight:700 }} inputMode="decimal" placeholder="0.00" value={siCurrent.unitPrice}
                onChange={e=>setSiCurrent(p=>({...p,unitPrice:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&siAddCurrentItem()} />)}
              {!formIsDelivery&&canDiscount&&fField(t.si_discPerc, <input className="pm-input" inputMode="decimal" placeholder="0" value={siCurrent.discountPerc} onChange={e=>setSiCurrent(p=>({...p,discountPerc:e.target.value}))} />)}
              {formIsTax&&!formIsDelivery&&fField("VAT%", <input className="pm-input" inputMode="decimal" placeholder="5" value={siCurrent.vatPerc} onChange={e=>setSiCurrent(p=>({...p,vatPerc:e.target.value}))} />)}
            </div>
            <div style={{ display:"flex", gap:4, alignItems:"center" }}>
              <button type="button" className="pm-btn pm-btn--primary" style={{ flex:1, minHeight:siMobile?38:24 }} onClick={siAddCurrentItem}>
                {siEditLineId ? (bnL?"✅ আপডেট করুন":"✅ Update Item") : (bnL?"✅ পণ্য যোগ করুন":"✅ Add Item")}
              </button>
              {siEditLineId&&<button type="button" className="pm-btn-secondary" style={{ minHeight:siMobile?38:24 }} onClick={()=>{ setSiEditLineId(null); setSiCurrent(siEmptyCurrent()); }}>{bnL?"বাদ":"Cancel"}</button>}
              {(siN2(siCurrent.qty)>0&&siN2(siCurrent.unitPrice)>0)&&(
                <b style={{ color:siAccent, whiteSpace:"nowrap" }}>= {t.cur} {siFmt2(siCalcLine(siCurrent, formIsTax&&!formIsDelivery).total)}</b>
              )}
            </div>
          </div>
          {siLines.length===0
            ? <div className="pm-hint" style={{ textAlign:"center" }}>{bnL?"↑ উপরে পণ্য যোগ করুন":"↑ Add items above"}</div>
            : <SiItemsTable items={siLines} lang={lang} isTax={formIsTax&&!formIsDelivery} showDisc={!formIsDelivery}
                editId={siEditLineId}
                onEdit={(item)=>{
                  setSiCurrent({ productId:item.productId||null, name:item.name, code:item.code||"", brand:item.brand||"", qty:String(item.qty), unit:item.unit||"Pcs", unitPrice:String(item.unitPrice||""), discountPerc:String(item.discountPerc||"0"), discountFlat:siN2(item.discountFlat)>0?String(item.discountFlat):"", vatPerc:item.vatPerc!=null&&item.vatPerc!==""?String(item.vatPerc):"5", batchNo:item.batchNo||"", ...(item.isService?{ isService:true }:{}) });
                  setSiEditLineId(item.id);
                  setTimeout(()=>siNameRef.current?.focus(), 80);
                }}
                onDelete={(item)=>{ setSiLines(p=>p.filter(x=>x.id!==item.id)); if (siEditLineId===item.id) { setSiEditLineId(null); setSiCurrent(siEmptyCurrent()); } }} />}
        </>, siLines.length>0 ? ` (${siLines.length})` : "")}

        {!formIsDelivery&&siLines.length>0&&fPanel(bnL?"বিলের ছাড় ও সমন্বয়":"Bill Discount & Adjustment", (
          <div className="si-grid2">
            {[
              ["billDiscPerc", bnL?"বিলের ছাড় %":"Bill Disc %", !canDiscount, "decimal"],
              ["billDiscAmt", bnL?"বিলের ছাড় টাকা":"Bill Disc Amt", !canDiscount || siN2(siForm.billDiscPerc)>0, "decimal"],
              ["adjustment", bnL?"সমন্বয় (+/-)":"Adjustment (+/-)", false, "text"],
              ["roundOff", "Round Off", false, "text"],
              ...(!isQuote?[["creditDays", bnL?"বাকির দিন":"Credit Days", false, "numeric"]]:[]),
            ].map(([key,label,disabled,mode])=>(
              <div key={key}>{fField(label, <input className="pm-input" inputMode={mode} disabled={disabled} placeholder="0" value={siForm[key]||""}
                title={disabled&&!canDiscount&&key.startsWith("billDisc")?(bnL?"ডিসকাউন্টের অনুমতি নেই":"No discount permission"):undefined}
                onChange={e=>setSiForm(p=>({ ...p, [key]:e.target.value, ...(key==="billDiscPerc"&&e.target.value?{ billDiscAmt:"" }:{}) }))} />)}</div>
            ))}
          </div>
        ))}

        {fPanel(`📊 ${t.si_summary}`, <>
          {summaryRows.map(([l,v,c],i)=>(
            <div key={i} className="si-total-row"><span>{l}</span><b style={c?{ color:c }:undefined}>{t.cur} {v}</b></div>
          ))}
          <div className="si-total-row is-grand"><span>{t.si_grandTotal}</span><span style={{ color:siAccent }}>{t.cur} {siFmt2(totals.grand)}</span></div>
        </>)}

        {!formIsDelivery&&!isQuote&&fPanel(`💳 ${t.si_payment}`, <>
          {fRow(bnL?"পেমেন্টের ধরন":"Payment method", (
            <select className="pm-input" value={siForm.paymentMethod} onChange={e=>{
              const key = e.target.value;
              setSiForm(p=>({...p, paymentMethod:key, amountPaid:"", ...(key!=="cash" ? { cashPartial:false } : {})}));
            }}>
              {Object.entries(SI_PAY).map(([key,pm])=><option key={key} value={key}>{pm.icon} {pm[lang]}</option>)}
            </select>
          ))}
          {formIsCash&&(
            <label style={{ display:"flex", gap:6, alignItems:"center", fontSize:12.5 }}>
              <input type="checkbox" checked={!!siForm.cashPartial} onChange={e=>setSiForm(p=>({ ...p, cashPartial:e.target.checked, amountPaid:"" }))} />
              {bnL?"আংশিক নগদ — বাকিটা পরে নেব (একাধিক বিল একসাথে মেটানো যাবে)":"Partial cash — I'll collect the rest later (several bills can be settled together)"}
            </label>
          )}
          {formIsSettled ? (
            <div className="si-paid-box"><span>✅ {siSettledPayLabel(siForm.paymentMethod, lang)}</span><span>{t.cur} {siFmt2(totals.grand)}</span></div>
          ) : (
            <>
              {fRow(t.si_amountPaid, (
                <div style={{ display:"flex", gap:4 }}>
                  <input className="pm-input" inputMode="decimal" placeholder="0.00" value={siForm.amountPaid} onChange={e=>siUpd("amountPaid",e.target.value)} />
                  {totals.grand>0&&<button type="button" className="pm-btn-secondary" onClick={()=>siUpd("amountPaid",siFmt2(totals.grand))}>{bnL?"পুরো":"Full"}</button>}
                </div>
              ))}
              {totals.grand>0&&<div className={`si-paid-box${balance>0.01?" is-due":""}`}><span>{t.si_balanceDue}</span><span>{t.cur} {siFmt2(balance)}</span></div>}
            </>
          )}
        </>)}

        {!isSO&&fPanel(`🚚 ${t.si_deliverySection}`, <>
          {fRow(t.si_deliveryNote, <input className="pm-input" placeholder="DN-0001" value={siForm.deliveryNoteNo} onChange={e=>siUpd("deliveryNoteNo",e.target.value)} />)}
          {fRow(t.si_vehicleNo, <input className="pm-input" placeholder="ABC-1234" value={siForm.vehicleNo} onChange={e=>siUpd("vehicleNo",e.target.value)} />)}
        </>)}

        {fPanel(`📝 ${t.si_note}`, (
          <AutoTA className="pm-input" style={{ height:"auto", minHeight:siMobile?64:42 }} placeholder={t.si_notePh} value={siForm.note} onChange={e=>siUpd("note",e.target.value)} />
        ))}
      </div>

      {siReminderForm&&editInvId&&siReminderForm.invoiceId===editInvId&&(
        <fieldset className="pm-panel" style={{ margin:"8px 10px 0" }}>
          <legend className="pm-panel-legend">⏰ {bnL?"রিমাইন্ডার সেট করুন":"Set a reminder"}</legend>
          <div className="si-panel-body" style={{ gap:6 }}>
            <div className="si-grid2">
              <input type="date" className="pm-input" value={siReminderForm.date} onChange={e=>setSiReminderForm(p=>({ ...p, date:e.target.value }))} />
              <input type="time" className="pm-input" value={siReminderForm.time} onChange={e=>setSiReminderForm(p=>({ ...p, time:e.target.value }))} />
            </div>
            <input className="pm-input" placeholder={bnL?"নোট (ঐচ্ছিক)":"Note (optional)"} value={siReminderForm.note} onChange={e=>setSiReminderForm(p=>({ ...p, note:e.target.value }))} />
            <div style={{ display:"flex", gap:6 }}>
              <button type="button" className="pm-btn pm-btn--primary" disabled={!siReminderForm.date} onClick={siSaveReminder}>✅ {bnL?"সেভ করুন":"Save"}</button>
              <button type="button" className="pm-btn-secondary" onClick={()=>setSiReminderForm(null)}>{bnL?"বাতিল":"Cancel"}</button>
            </div>
          </div>
        </fieldset>
      )}
      <div className="si-actions si-sticky-actions">
        {canPrintInv && <button type="button" className="pm-btn-secondary" onClick={()=>siRequestPrint(editInvId ? invoices.find(i=>i.id===editInvId) : null)} disabled={siSaving}>🖨️ {bnL?"প্রিন্ট":"Print"}</button>}
        {editInvId && <button type="button" className="pm-btn-secondary" onClick={()=>siOpenReminderForm(invoices.find(i=>i.id===editInvId)||{ id:editInvId, invoiceNo:siInvoiceNo, customerName:siForm.customerName })}>⏰ {bnL?"রিমাইন্ডার":"Remind me"}</button>}
        <button type="button" className="pm-btn pm-btn--primary" onClick={siConfirm} disabled={siSaving}>
          {siSaving?"...":(isSO?(bnL?"✓ অর্ডার সেভ":"✓ Save Order"):isQuote?(bnL?"✅ কোটেশন সেভ":"✅ Save Quotation"):isDN?(bnL?"✅ ডেলিভারি নোট সেভ":"✅ Save Delivery Note"):(bnL?"✅ ইনভয়েস নিশ্চিত":"✅ Confirm Invoice"))}
        </button>
        <button type="button" className="pm-btn-secondary" onClick={siSaveDraft} disabled={siSaving}>{bnL?"ড্রাফট সেভ":"Save Draft"}</button>
        <button type="button" className="pm-btn pm-btn--danger" onClick={closeForm}>{bnL?"বাতিল":"Cancel"}</button>
      </div>
    </div>
  );
}
