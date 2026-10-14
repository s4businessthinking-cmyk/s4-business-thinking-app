import AgainstInvoiceVoucherWindow from "../vouchers/AgainstInvoiceVoucherWindow.jsx";
import { CURRENCIES } from "../reports/taxDomain.js";
import ChequeHandoverModal from "../vouchers/ChequeHandoverModal.jsx";
import { MinimizedChip, WindowButtons } from "../components/WindowChrome.jsx";
import { PI_CHEQUE_STATUSES, PI_PAY_METHODS, PI_STATUSES, PI_UNITS, piCalcLine, piCalcTotals, piEmptyCurrent } from "./purchaseShared.js";
import { PI_VOUCHER_METHODS, piFmt2, piN2, toVoucherView, voucherParties } from "../shared/appShared.jsx";
import { PM_CSS } from "../product-master/pmStyles";
import { PM_TH, SI_CSS } from "../sales-invoice/siSkin.js";
import PartyLedgerWindow from "../vouchers/PartyLedgerWindow.jsx";
import { PiItemsTable } from "./PiItemsTable.jsx";
import { PiNewPaymentForm, PiPaymentsListTab, PiVoucherDetailView } from "./PiPayments.jsx";
import ProductInvoiceEntryInfo from "../sales-invoice/ProductInvoiceEntryInfo.jsx";
import { ProductTypeaheadInput } from "../components/ProductTypeaheadInput.jsx";
import PurchaseInvoiceDesktopForm from "./PurchaseInvoiceDesktopForm.jsx";
import StockBadge from "../inventory/StockBadge.jsx";
import { UAE_BANKS, amountToWordsAED } from "../cheque/chequeConfig.js";
import VendorChequeWizard from "../vouchers/VendorChequeWizard.jsx";
import { groupInvoicesByParty } from "../invoices/PartyFolderList.jsx";
import { isBranchTransferBill } from "../branch-transfer/branchTransferDomain.js";
import { isForeign } from "./purchaseOptions.js";
import { isOpeningBill } from "../utils/openingBill.js";
import { printPaymentVoucher, siUnitOptionsFor } from "../sales-invoice/salesInvoiceShared.js";
import { returnsAsLedgerVouchers } from "../returns/ReturnsTab.jsx";

export function renderPiScreens({ onProductPatched, balance, billReturns, bnL, can, canManagePurchase, canVendorPayments, canViewSupplierLedger, chqHandover, chqHandoverSaving, chqWizard, editInvoiceId, filteredVendorOpts, getRelatedPayments, getVendorOpenInvoices, invoices, isDesktop, isOwner, lang, onOpenChequePrinter, onOpenProductMaster, openChequeHandover, openVoucherInChequePrinter, paid, payments, piAccent, piAddCurrentItem, piBadge, piBaseCur, piBtTag, piCanEditInv, piCancelInv, piCancelPaymentVoucher, piChangeCurrentUnit, piClearVendor, piConfirm, piCurrent, piDelLine, piDelete, piDeletePaymentVoucher, piEditLine, piEditLineId, piFiltered, piForm, piFormatPaymentNo, piGoToMakePayment, piGroupMode, piInvoiceNo, piKPIs, piLeaveDetail, piLeaveMinOk, piLeaveUnsavedOk, piLedgerHidden, piLines, piLoading, piMatchBlock, piMaxLocalPaymentSerial, piMobile, piMoneyInvoices, piNameRef, piOpenEdit, piOpenFromDesktop, piOpenInvoice, piOpenNew, piOpenParty, piPickVendor, piQtyRef, piRootRef, piRootStyle, piRowDue, piSaveChequeHandover, piSaveDraft, piSavePaymentVoucher, piSaving, piSearch, piSelectProduct, piSetVoucherChequeStatus, piSource, piStatusF, piSubTab, piUpd, piView, piWin, pickVendors, pmtLoading, pmtPrefillInvoiceId, pmtPrefillVendorId, pmtSaving, pmtView, printChequeHandover, printChequePaymentVoucher, products, purchaseOpts, savePurchaseOptions, selInvoice, selVoucher, setChqHandover, setChqWizard, setPiCurrent, setPiEditLineId, setPiForm, setPiGroupMode, setPiLedgerHidden, setPiLines, setPiNavReturn, setPiOpenParty, setPiSearch, setPiStatusF, setPiSubTab, setPiView, setPmtPrefillInvoiceId, setPmtPrefillVendorId, setPmtView, setSelInvoice, setSelVoucher, setVendorDropOpen, setVendorSearchQ, shop, shopId, t, th, toast, totals, vendorDropOpen, vendorSearchQ, vendorSearchRef, vendors, wideDesktop, withSupRefs }) {
  if (piView==="list" || (piView==="form" && piWin.min && wideDesktop)) {
    const groups = groupInvoicesByParty(piFiltered, { idField:"vendorId", nameField:"vendorName" });
    const openGroup = piGroupMode==="folders" && piOpenParty ? (groups.find(g=>g.key===piOpenParty) || null) : null;
    const rows = openGroup ? openGroup.invoices : piFiltered;
    const groupName = (g) => g.isCash ? (bnL?"নাম ছাড়া":"No name") : g.name;
    const rowsSum = rows.reduce((a,inv)=>{
      if (!["cancelled","draft"].includes(inv.status) && !isBranchTransferBill(inv)) { a.total += piN2(inv.grandTotal); a.due += piRowDue(inv); }
      if (inv.status==="draft") a.drafts += 1;
      return a;
    }, { total:0, due:0, drafts:0 });
    const showParties = piGroupMode==="folders" && (!piMobile || !openGroup);
    const showInvoices = piGroupMode==="all" || !piMobile || !!openGroup;
    const subTabs = [
      ...(canManagePurchase ? [{ key:"invoices", icon:"📋", bn:"ইনভয়েস", en:"Invoices" }] : []),
      ...(canViewSupplierLedger ? [{ key:"ledger", icon:"🏭", bn:"সাপ্লায়ার লেজার", en:"Supplier Ledger" }] : []),
      ...(canVendorPayments ? [{ key:"payments", icon:"💳", bn:"পেমেন্ট", en:"Payments" }] : []),
    ];
    return (
      <div ref={piRootRef} className="si-root" style={piRootStyle}>
        <style>{PM_CSS}</style>
        <style>{SI_CSS}</style>
        {piView==="form"&&piWin.min&&(
          <MinimizedChip lang={lang} onRestore={piWin.restore}
            title={`PURCHASE INVOICE ${piInvoiceNo||""}`}
            onClose={()=>{ if (piLeaveUnsavedOk()) setPiView("list"); }} />
        )}

        <div className="pm-reference-title">
          <strong style={{ color:piAccent }}>{bnL?"ক্রয় ইনভয়েস":"PURCHASE INVOICE"}</strong>
          <span>{invoices.length} {bnL?"টি":"total"}</span>
        </div>

        <div className="si-toolbar">
          {canManagePurchase&&piSubTab==="invoices"&&(
            <button type="button" className="pm-btn pm-btn--primary" onClick={()=>{ if (piLeaveMinOk()) piOpenNew(); }} disabled={piSaving}>
              {piSaving?"...":(bnL?"+ নতুন ইনভয়েস":"+ New Invoice")}{!piMobile&&!piSaving?" (F3)":""}
            </button>
          )}
          {canVendorPayments&&piSubTab==="payments"&&pmtView==="list"&&(
            <button type="button" className="pm-btn pm-btn--primary" onClick={()=>{ setPmtPrefillVendorId(null); setSelVoucher(null); setPmtView("new"); }}>{t.pi_newPayment}</button>
          )}
          {canVendorPayments&&piSubTab==="payments"&&pmtView==="list"&&(
            <button type="button" className="pm-btn-secondary" onClick={()=>setChqWizard({ vendorId:null })}>🖨️ {bnL?"ভেন্ডর চেক":"Vendor Cheque"}</button>
          )}
          <span className="si-toolbar-gap" />
          {subTabs.length>1&&(
            <div className="si-pills">
              {subTabs.map(tab=>(
                <button key={tab.key} type="button" className={`pm-btn-secondary${piSubTab===tab.key?" is-active":""}`}
                  onClick={()=>{ setPiSubTab(tab.key); if(tab.key==="ledger") setPiLedgerHidden(false); if(tab.key==="payments"){ setPmtView("list"); setSelVoucher(null); } }}>
                  {tab.icon} {bnL?tab.bn:tab.en}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={piSubTab==="invoices"?undefined:"si-body"} style={piSubTab==="invoices"?{ display:"contents" }:undefined}>
          {/* ── SUB-TAB: SUPPLIER LEDGER ── */}
          {piSubTab==="ledger"&&canViewSupplierLedger&&piLedgerHidden&&(
            <div style={{ textAlign:"center", padding:"40px 16px" }}>
              <button onClick={()=>setPiLedgerHidden(false)} style={{ padding:"12px 22px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                📒 {lang==="bn"?"সাপ্লায়ার লেজার খুলুন":"Open Supplier Ledger"}
              </button>
            </div>
          )}
          {piSubTab==="ledger"&&canViewSupplierLedger&&!piLedgerHidden&&(
            <PartyLedgerWindow lang={lang} mode="supplier" cur={t.cur||"AED"} shopName={shop?.companyName||""}
              partyCodes={Object.fromEntries((vendors||[]).filter(v=>v.vendorCode).map(v=>[v.id, v.vendorCode]))}
              partyTrns={Object.fromEntries((vendors||[]).filter(v=>v.trnNumber).map(v=>[v.id, v.trnNumber]))}
              invoices={piMoneyInvoices.map(inv=>({ id:inv.id, no:inv.invoiceNo, date:String(inv.invoiceDate||"").slice(0,10), partyId:inv.vendorId||null, partyName:inv.vendorName||"", partyMobile:inv.vendorMobile||"", total:inv.grandTotal, paid:inv.amountPaid, status:inv.status, ref:inv.supplierInvoiceNo||"", method:inv.paymentMethod, raw:inv }))}
              vouchers={(canVendorPayments ? payments.map(p=>({ id:p.id, no:p.paymentNo, date:String(p.paymentDate||"").slice(0,10), partyId:p.vendorId||null, partyName:p.vendorName||"", partyMobile:p.vendorMobile||"", method:p.method, amount:p.totalAmount, status:p.status, allocations:withSupRefs(p).allocations, raw:p })) : [])
                .concat(returnsAsLedgerVouchers(billReturns, "purchase"))}
              onOpenInvoice={(inv)=>{ setPiNavReturn("ledger"); setSelInvoice(inv); setPiView("detail"); }}
              onOpenVoucher={canVendorPayments ? (v)=>{ if (v?.raw?.__return) return; setPiNavReturn("ledger"); setSelVoucher(v); setPmtView("detail"); setPiSubTab("payments"); } : undefined}
              onNewVoucher={canVendorPayments ? (p)=>{ setPmtPrefillVendorId(p.id||p.name); setPmtPrefillInvoiceId(null); setSelVoucher(null); setPmtView("new"); setPiSubTab("payments"); } : undefined}
              onClose={()=>{ if (canManagePurchase||canVendorPayments) setPiSubTab(canManagePurchase?"invoices":"payments"); else setPiLedgerHidden(true); }} />
          )}
          {/* ── SUB-TAB: PAYMENTS (Vendor Payment Voucher — Cash/Cheque, partial across open invoices) ── */}
          {piSubTab==="payments"&&canVendorPayments&&pmtView==="list"&&(
            <PiPaymentsListTab payments={payments} loading={pmtLoading} t={t} lang={lang} mobile={piMobile}
              onOpen={(v)=>{ setSelVoucher(v); setPmtView("detail"); }} />
          )}
          {piSubTab==="payments"&&canVendorPayments&&pmtView==="new"&&isDesktop&&(()=>{
            const openAll = piMoneyInvoices.filter(inv => ["confirmed","partial"].includes(inv.status) && piN2(inv.balanceDue)>0.01);
            const prefParty = pmtPrefillVendorId ? (vendors.find(v=>v.id===pmtPrefillVendorId) ? { partyId:pmtPrefillVendorId } : { partyName:pmtPrefillVendorId }) : null;
            return (
              <AgainstInvoiceVoucherWindow
                lang={lang} mode="payment" cur={t.cur||"AED"}
                voucherNo={piFormatPaymentNo(piMaxLocalPaymentSerial() + 1)}
                parties={voucherParties(vendors, openAll, "vendorId", "vendorName", v=>v.vendorName, v=>v.mobileNumber||v.whatsappNumber)}
                banks={UAE_BANKS.map(b=>b.name)}
                getOpenInvoices={(p)=>getVendorOpenInvoices(p.id, p.name)}
                vouchers={payments.map(p=>toVoucherView(withSupRefs(p),"payment"))}
                prefill={prefParty ? { ...prefParty, invoiceId:pmtPrefillInvoiceId } : null}
                saving={pmtSaving}
                onSave={async (d)=>{
                  const created = await piSavePaymentVoucher({ vendorId:d.partyId, vendorName:d.partyName, vendorMobile:d.partyMobile, method:d.method, paymentDate:d.date, note:d.note, chequeNo:d.chequeNo, chequeBank:d.chequeBank, chequeDate:d.chequeDate, chequeReceivedBy:d.chequeReceivedBy, vendorReceiptNo:d.vendorReceiptNo, chequeMonth:d.chequeMonth, refNo:d.refNo, refBank:d.refBank, refDate:d.refDate, allocations:d.allocations }, { stayOpen:true });
                  return created ? toVoucherView(withSupRefs(created),"payment") : null;
                }}
                onCancelVoucher={(isOwner||canVendorPayments) ? async (v)=>{ const u = await piCancelPaymentVoucher(v.raw); return u ? toVoucherView(u,"payment") : null; } : undefined}
                onDeleteVoucher={isOwner ? (v)=>piDeletePaymentVoucher(v.raw) : undefined}
                onSetChequeStatus={isOwner ? async (v,st)=>{ const u = await piSetVoucherChequeStatus(v.raw, st); return u ? toVoucherView(u,"payment") : null; } : undefined}
                onPrint={(v)=>printPaymentVoucher(v.raw, shop, lang)}
                onClose={()=>{ setPmtView("list"); setPmtPrefillVendorId(null); setPmtPrefillInvoiceId(null); }}
              />
            );
          })()}
          {piSubTab==="payments"&&canVendorPayments&&pmtView==="new"&&!isDesktop&&(
            <PiNewPaymentForm prefillVendorId={pmtPrefillVendorId}
              vendors={[
                ...(vendors||[]),
                ...[...new Set(piMoneyInvoices
                  .filter(inv => !inv.vendorId && inv.vendorName && ["confirmed","partial"].includes(inv.status) && piN2(inv.balanceDue)>0.01)
                  .map(inv => inv.vendorName))]
                  .filter(name => !(vendors||[]).some(v => v.vendorName===name))
                  .map(name => ({ id:null, vendorName:name, mobileNumber:invoices.find(inv=>inv.vendorName===name)?.vendorMobile||"" })),
              ]}
              getVendorOpenInvoices={getVendorOpenInvoices} saving={pmtSaving}
              onSave={piSavePaymentVoucher} onCancel={()=>{ setPmtView("list"); setPmtPrefillVendorId(null); }}
              t={t} th={th} lang={lang} isDesktop={isDesktop} />
          )}
          {piSubTab==="payments"&&canVendorPayments&&pmtView==="detail"&&selVoucher&&(
            <PiVoucherDetailView voucher={withSupRefs(selVoucher)} t={t} th={th} lang={lang} isOwner={isOwner}
              onBack={()=>{ setPmtView("list"); setSelVoucher(null); }}
              onCancel={(isOwner||canVendorPayments) ? ()=>piCancelPaymentVoucher(selVoucher) : undefined}
              onDelete={isOwner ? async ()=>{ if (await piDeletePaymentVoucher(selVoucher)) { setPmtView("list"); setSelVoucher(null); } } : undefined}
              onSetChequeStatus={(st)=>piSetVoucherChequeStatus(selVoucher,st)}
              onPrint={()=>printPaymentVoucher(withSupRefs(selVoucher), shop, lang)}
              onPrintCheque={onOpenChequePrinter ? ()=>openVoucherInChequePrinter(selVoucher) : undefined}
              onPrintChequeVoucher={()=>printChequePaymentVoucher(selVoucher)}
              onHandover={()=>openChequeHandover(selVoucher)}
              onViewInvoice={(invoiceId)=>{ const inv=invoices.find(i=>i.id===invoiceId); if(inv){ setSelInvoice(inv); setPiSubTab("invoices"); setPiView("detail"); } }}
            />
          )}
          {chqWizard&&canVendorPayments&&(
            <VendorChequeWizard
              lang={lang} cur={t.cur||"AED"}
              vendors={voucherParties(vendors, piMoneyInvoices.filter(inv => ["confirmed","partial"].includes(inv.status) && piN2(inv.balanceDue)>0.01), "vendorId", "vendorName", v=>v.vendorName, v=>v.mobileNumber||v.whatsappNumber)}
              banks={UAE_BANKS.map(b=>b.name)}
              getOpenInvoices={(p)=>getVendorOpenInvoices(p.id, p.name)}
              amountWords={(n)=>`${amountToWordsAED(n)} Only`}
              initialVendorId={chqWizard.vendorId}
              saving={pmtSaving}
              onSave={(payload)=>piSavePaymentVoucher(payload, { stayOpen:true })}
              onPrintCheque={onOpenChequePrinter ? (v)=>{ setChqWizard(null); openVoucherInChequePrinter(v); } : undefined}
              onPrintVoucher={(v)=>printChequePaymentVoucher(v)}
              onHandover={(v)=>openChequeHandover(v)}
              onClose={()=>setChqWizard(null)}
            />
          )}
          {chqHandover&&(
            <ChequeHandoverModal
              lang={lang} cur={t.cur||"AED"}
              voucher={chqHandover}
              saving={chqHandoverSaving}
              onSave={(h)=>piSaveChequeHandover(chqHandover, h)}
              onPrint={(h)=>printChequeHandover(chqHandover, h)}
              onClose={()=>setChqHandover(null)}
            />
          )}
        </div>

        {piSubTab==="invoices"&&canManagePurchase&&(<>
          {invoices.length>0&&(
            <div className="si-kpis">
              {[
                { l:t.pi_totalInvoices, v:piKPIs.total, c:"#07101c", pre:"" },
                { l:t.pi_totalAmount,   v:piFmt2(piKPIs.amount), c:piAccent, pre:`${t.cur} ` },
                { l:t.pi_totalPaid,     v:piFmt2(piKPIs.paid),   c:"#15803d", pre:`${t.cur} ` },
                { l:t.pi_totalDue,      v:piFmt2(piKPIs.due),    c:piKPIs.due>0?"#b91c1c":"#15803d", pre:`${t.cur} ` },
              ].map((k,i)=>(
                <div key={i} className="si-kpi"><span>{k.l}</span><b style={{ color:k.c }}>{k.pre}{k.v}</b></div>
              ))}
            </div>
          )}

          <div className="si-filters">
            <div className="si-search">
              <input className="pm-input" placeholder={t.pi_searchPh} value={piSearch} onChange={e=>setPiSearch(e.target.value)} />
              {piSearch&&<button type="button" aria-label="Clear" onClick={()=>setPiSearch("")}>✕</button>}
            </div>
            <div className="si-pills">
              {["ALL",...Object.keys(PI_STATUSES)].map(st=>(
                <button key={st} type="button" className={`pm-btn-secondary${piStatusF===st?" is-active":""}`} onClick={()=>setPiStatusF(st)}>
                  {st==="ALL"?t.pi_allStatus:PI_STATUSES[st]?.[lang]}
                </button>
              ))}
            </div>
            <div className="si-pills">
              {[["folders", bnL?"📁 নাম অনুযায়ী":"📁 By name"], ["all", bnL?"📋 সব":"📋 All"]].map(([m,label])=>(
                <button key={m} type="button" className={`pm-btn-secondary${piGroupMode===m?" is-active":""}`} onClick={()=>{ setPiGroupMode(m); setPiOpenParty(null); }}>{label}</button>
              ))}
            </div>
          </div>

          <div className={`si-main${piGroupMode==="all" || piMobile ? " is-all" : ""}`}>
            {showParties&&(
              <div className="si-box">
                <table className="pm-table">
                  <colgroup><col /><col style={{ width:piMobile?96:76 }} /><col style={{ width:piMobile?84:68 }} /></colgroup>
                  <thead><tr><th>{t.pi_vendor}</th><th className="si-num">{bnL?"মোট":"Total"}</th><th className="si-num">{bnL?"বাকি":"Due"}</th></tr></thead>
                  <tbody>
                    {!piMobile&&groups.length>0&&(
                      <tr className={`pm-clickable${!openGroup?" pm-selected":""}`} onClick={()=>setPiOpenParty(null)}>
                        <td className="si-strong">{bnL?"সব ভেন্ডর":"All vendors"} ({piFiltered.length})</td><td /><td />
                      </tr>
                    )}
                    {groups.map(g=>(
                      <tr key={g.key} className={`pm-clickable si-party-row${openGroup?.key===g.key?" pm-selected":""}`} onClick={()=>setPiOpenParty(g.key)}>
                        <td className="si-wrap">
                          {groupName(g)}
                          <div className="si-muted" style={{ fontWeight:400, fontSize:"0.9em" }}>
                            {g.invoices.length} {bnL?"টি":(g.invoices.length===1?"bill":"bills")}{g.lastDate?` · ${g.lastDate}`:""}
                          </div>
                        </td>
                        <td className="si-num">{piFmt2(g.total)}</td>
                        <td className={`si-num${g.due>0.01?" si-due":""}`}>{g.due>0.01?piFmt2(g.due):"-"}</td>
                      </tr>
                    ))}
                    {groups.length===0&&<tr><td colSpan={3} className="si-empty">{piLoading?"⏳":invoices.length===0?t.pi_noInvoices:t.pi_noResults}</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {showInvoices&&(
              <div className="si-box">
                {piMobile&&openGroup&&(
                  <button type="button" className="pm-btn-secondary" style={{ width:"100%", minHeight:36, marginBottom:3 }} onClick={()=>setPiOpenParty(null)}>
                    ← {bnL?"সব ভেন্ডর":"All vendors"} · {groupName(openGroup)}
                  </button>
                )}
                {piLoading ? <div className="si-empty">⏳ {t.pi_loading}</div>
                  : invoices.length===0 ? <div className="si-empty">{t.pi_noInvoices}</div>
                  : rows.length===0 ? <div className="si-empty">🔍 {t.pi_noResults}</div>
                  : piMobile ? rows.map(inv=>{
                    const due = piRowDue(inv);
                    return (
                      <button key={inv.id} type="button" className="si-mrow" onClick={()=>piOpenInvoice(inv)}>
                        <div className="si-mrow-top">
                          <span style={{ color:piAccent }}>{inv.invoiceNo}{piBtTag(inv)}</span>
                          <span>{piBadge(inv.status)}</span>
                        </div>
                        <div className="si-mrow-sub"><span>{inv.vendorName||"—"}</span><b>{t.cur} {piFmt2(inv.grandTotal)}</b></div>
                        <div className="si-mrow-sub">
                          <span>{inv.invoiceDate}{inv.supplierInvoiceNo?` · ${inv.supplierInvoiceNo}`:""}</span>
                          {due>0.01&&<span className="si-due">{bnL?"বাকি":"Due"} {piFmt2(due)}</span>}
                        </div>
                        {piMatchBlock(inv)}
                      </button>
                    );
                  })
                  : (
                    <table className="pm-table">
                      <colgroup>
                        <col style={{ width:96 }} /><col style={{ width:78 }} /><col /><col style={{ width:96 }} /><col style={{ width:84 }} />
                        <col style={{ width:42 }} /><col style={{ width:84 }} /><col style={{ width:84 }} /><col style={{ width:84 }} /><col style={{ width:100 }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>{t.pi_invoiceNo}</th><th>{t.pi_date}</th><th>{t.pi_vendor}</th><th>{bnL?"সাপ্লায়ার বিল":"Supplier Inv"}</th><th>{bnL?"স্ট্যাটাস":"Status"}</th>
                          <th className="si-num">{bnL?"আইটেম":"Items"}</th><th className="si-num">{bnL?"মোট":"Total"}</th><th className="si-num">{bnL?"পরিশোধ":"Paid"}</th>
                          <th className="si-num">{bnL?"বাকি":"Due"}</th><th>{t.pi_createdBy}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(inv=>{
                          const due = piRowDue(inv);
                          const matches = piMatchBlock(inv);
                          return (
                            <tr key={inv.id} className="pm-clickable" onClick={()=>piOpenInvoice(inv)} title={inv.note||""}>
                              <td className="si-strong" style={{ color:piAccent }} title={inv.invoiceNo}>{inv.invoiceNo}{piBtTag(inv)}</td>
                              <td>{inv.invoiceDate}</td>
                              <td className={matches.length?"si-wrap":""} title={inv.vendorName||""}>{inv.vendorName||"—"}{matches}</td>
                              <td title={inv.supplierInvoiceNo||""}>{inv.supplierInvoiceNo||"-"}</td>
                              <td>{piBadge(inv.status)}</td>
                              <td className="si-num">{inv.items?.length||0}</td>
                              <td className="si-num si-strong">{piFmt2(inv.grandTotal)}</td>
                              <td className="si-num">{piN2(inv.amountPaid)>0?piFmt2(inv.amountPaid):"-"}</td>
                              <td className={`si-num${due>0.01?" si-due":""}`}>{due>0.01?piFmt2(due):"-"}</td>
                              <td title={inv.createdByName||""}>{inv.createdByName||"-"}</td>
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
            <span>{bnL?"মোট":"Total"}: <b>{t.cur} {piFmt2(rowsSum.total)}</b></span>
            <span>{bnL?"বাকি":"Due"}: <b style={{ color:rowsSum.due>0.01?"#b91c1c":undefined }}>{t.cur} {piFmt2(rowsSum.due)}</b></span>
            {rowsSum.drafts>0&&<span style={{ color:"#b45309" }}>{bnL?`${rowsSum.drafts}টি ড্রাফট মোটে ধরা হয়নি`:`${rowsSum.drafts} draft(s) not counted in totals`}</span>}
          </div>
        </>)}
      </div>
    );
  }

  // ══════ DETAIL VIEW ══════
  if (piView==="detail"&&selInvoice) {
    const inv = invoices.find(x=>x.id===selInvoice.id) || selInvoice;
    const items = inv.items||[];
    const calc = piCalcTotals(items);
    const grand = items.length ? calc.grand : piN2(inv.grandTotal);
    const bal = grand - piN2(inv.amountPaid);
    const isOB = isOpeningBill(inv);
    const isBT = isBranchTransferBill(inv);
    const canEdit = !isOB && !isBT && piCanEditInv(inv) && ["draft","confirmed"].includes(inv.status);
    const canPay = !isBT && canVendorPayments && ["confirmed","partial"].includes(inv.status) && bal>0.01;
    const canCancel = !isOB && !isBT && isOwner && ["draft","confirmed","partial","paid"].includes(inv.status);
    const canDel = !isOB && !isBT && isOwner && ["draft","cancelled"].includes(inv.status);
    const related = getRelatedPayments(inv.id);
    const vendorCode = inv.vendorId ? (vendors||[]).find(v=>v.id===inv.vendorId)?.vendorCode : "";
    const vRow = (label, value, opts={}) => (
      <div className="pm-form-row">
        <label className="pm-label">{label}</label>
        <div className={`si-val${opts.strong?" is-strong":""}`} style={opts.color?{ color:opts.color }:undefined}>{value}</div>
      </div>
    );
    const totalRows = [
      [t.pi_subtotal, piFmt2(items.length ? calc.sub : grand)],
      ...(calc.disc>0?[[t.pi_totalDiscount, `- ${piFmt2(calc.disc)}`, "#b91c1c"]]:[]),
      ...(calc.tax>0?[[t.pi_totalTax, `+ ${piFmt2(calc.tax)}`, "#0e7490"]]:[]),
    ];
    const back = () => piLeaveDetail();
    return (
      <div ref={piRootRef} className="si-root" style={piRootStyle}>
        <style>{PM_CSS}</style>
        <style>{SI_CSS}</style>

        <div className="pm-reference-title">
          <strong style={{ color:piAccent }}>{bnL?"ক্রয় ইনভয়েস":"PURCHASE INVOICE"} — {inv.invoiceNo}</strong>
          <span>{piBadge(inv.status)}</span>
        </div>

        <div className="si-body">
          <div className="si-cols">
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{bnL?"ডকুমেন্ট":"Document"}</legend>
              <div className="si-panel-body">
                {vRow(t.pi_invoiceNo, inv.invoiceNo, { strong:true, color:piAccent })}
                {inv.supplierInvoiceNo&&vRow(t.pi_supplierInvoiceNo, inv.supplierInvoiceNo, { color:"#7e22ce" })}
                {inv.refNo&&vRow("Ref. No", inv.refNo)}
                {inv.purchaseOrderNo&&vRow(bnL?"পারচেজ অর্ডার":"Purchase Order", inv.purchaseOrderNo, { color:"#1d4ed8" })}
                {inv.goodsReceiptNo&&vRow(bnL?"মাল গ্রহণ (DN)":"Goods Received (DN)", inv.goodsReceiptNo, { color:"#0f766e" })}
                {inv.currency&&vRow(bnL?"মুদ্রা":"Currency", `${inv.currency} ${piFmt2(inv.fcGrandTotal)} @ ${inv.exchangeRate}`, { color:"#0e7490" })}
                {vRow(t.pi_date, inv.invoiceDate||"-")}
                {vRow(t.pi_createdBy, inv.createdByName||"-")}
                {isOB&&<div className="si-note">{bnL?"এটা ভেন্ডরের শুরুর ব্যালেন্স (Opening Balance) — বদলাতে ভেন্ডর মাস্টারে যান।":"This is the vendor's opening balance — change it in Vendor Master."}</div>}
                {isBT&&<div className="si-note">🚚 {bnL?`Branch Transfer ${inv.branchTransferNo||""} → ${inv.branchName||""} রিসিভের বিল। এটা দোকানের ভেতরে মাল সরানোর হিসাব — স্টক, ক্রয়ের মোট আর সাপ্লায়ারের বাকিতে ধরা হয় না। আসল সাপ্লায়ার বিল আলাদা Purchase Invoice-এ থাকবে।`:`Receipt bill of Branch Transfer ${inv.branchTransferNo||""} → ${inv.branchName||""}. It only records goods moving inside the shop — not counted in stock, purchase totals or supplier dues. The real supplier bill stays a separate Purchase Invoice.`}</div>}
              </div>
            </fieldset>
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">🏭 {t.pi_vendor}</legend>
              <div className="si-panel-body">
                {vRow(bnL?"নাম":"Name", inv.vendorName||"—", { strong:true })}
                {vendorCode&&vRow(bnL?"কোড":"Code", vendorCode)}
                {vRow(bnL?"মোবাইল":"Mobile", inv.vendorMobile||"-")}
                {inv.note&&<div className="si-note">📝 {inv.note}</div>}
              </div>
            </fieldset>
          </div>

          {items.length>0&&(
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">📦 {t.pi_items} ({items.length})</legend>
              <div className="si-panel-body"><PiItemsTable items={items} lang={lang} /></div>
            </fieldset>
          )}

          <div className="si-cols">
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{t.pi_summary}</legend>
              <div className="si-panel-body">
                {totalRows.map(([l,v,c],i)=>(
                  <div key={i} className="si-total-row"><span>{l}</span><b style={c?{ color:c }:undefined}>{t.cur} {v}</b></div>
                ))}
                <div className="si-total-row is-grand"><span>{t.pi_grandTotal}</span><span style={{ color:piAccent }}>{t.cur} {piFmt2(grand)}</span></div>
              </div>
            </fieldset>
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">💳 {t.pi_payment}</legend>
              <div className="si-panel-body">
                <div className="si-total-row"><span>{t.pi_paymentMethod}</span><b>{PI_PAY_METHODS[inv.paymentMethod]?.icon} {PI_PAY_METHODS[inv.paymentMethod]?.[lang]||"-"}</b></div>
                <div className="si-total-row"><span>{t.pi_amountPaid}</span><b style={{ color:"#15803d" }}>{t.cur} {piFmt2(inv.amountPaid)}</b></div>
                <div className={`si-paid-box${bal>0.01?" is-due":""}`}><span>{bal>0.01?t.pi_balanceDue:t.pi_alreadyFullyPaid}</span><span>{t.cur} {piFmt2(Math.max(0,bal))}</span></div>
                {related.length>0&&(
                  <div className="pm-table-wrap" style={{ marginTop:3 }}>
                    <table className="pm-table">
                      <colgroup><col /><col style={{ width:80 }} /><col style={{ width:84 }} /></colgroup>
                      <thead><tr><th>💳 {t.pi_relatedPayments}</th><th>{t.pi_date}</th><th className="si-num">{bnL?"টাকা":"Amount"}</th></tr></thead>
                      <tbody>
                        {related.map(({ payment, allocAmount })=>{
                          const off = payment.status==="cancelled";
                          const chq = payment.method==="cheque" && !off ? (PI_CHEQUE_STATUSES[payment.chequeStatus]||PI_CHEQUE_STATUSES.pending) : null;
                          return (
                            <tr key={payment.id} className="pm-clickable" style={off?{ opacity:0.55 }:undefined}
                              onClick={()=>{ setSelVoucher(payment); setPmtView("detail"); setPiSubTab("payments"); setPiView("list"); }}>
                              <td>{PI_VOUCHER_METHODS[payment.method]?.icon||"💵"} {payment.paymentNo}{off?(bnL?" (বাতিল)":" (cancelled)"):""}{chq?<span style={{ color:chq.color }}> · {chq[lang]}</span>:null}</td>
                              <td>{payment.paymentDate}</td>
                              <td className="si-num si-strong" style={off?{ textDecoration:"line-through" }:{ color:"#15803d" }}>{piFmt2(allocAmount)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </fieldset>
          </div>
        </div>

        <div className="si-actions">
          <button type="button" className="pm-btn-secondary" onClick={back}>← {bnL?"তালিকা":"List"}</button>
          {canEdit&&<button type="button" className="pm-btn pm-btn--primary" onClick={()=>piOpenEdit(inv)}>✏️ {t.pi_editBtn}</button>}
          {canPay&&<button type="button" className="pm-btn" onClick={()=>piGoToMakePayment(inv)}>{t.pi_makePayment}</button>}
          {canCancel&&<button type="button" className="pm-btn pm-btn--danger" onClick={()=>piCancelInv(inv)}>{bnL?"বাতিল":"Cancel"}</button>}
          {canDel&&<button type="button" className="pm-btn pm-btn--danger" onClick={()=>piDelete(inv)}>🗑 {bnL?"মুছুন":"Delete"}</button>}
          {canCancel&&inv.status!=="draft"&&<span className="si-hint">{bnL?"মুছতে চাইলে আগে বাতিল করুন (স্টক ঠিক থাকবে)":"To delete, cancel first (keeps stock correct)"}</span>}
        </div>
      </div>
    );
  }

  // ══════ FORM VIEW ══════
  if (wideDesktop) return (
    <div style={{ position:"fixed", inset:piWin.max?0:"28px 40px", zIndex:1500, background:"#c7d8ee", padding:piWin.max?6:"0 6px 6px", boxSizing:"border-box", overflowX:"auto", overflowY:"hidden", display:"flex", flexDirection:"column", border:piWin.max?"none":"1px solid #2854ad", boxShadow:piWin.max?"none":"0 18px 50px rgba(2,6,23,0.45)" }}>
      <div onDoubleClick={piWin.toggleMax} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, margin:piWin.max?"-6px -6px 6px":"0 -6px 6px", padding:"4px 6px 4px 12px", background:"linear-gradient(180deg,#3f69bd,#2854ad)", color:"#fff", fontSize:13, fontWeight:800, userSelect:"none", flexShrink:0, fontFamily:"Segoe UI, Tahoma, sans-serif" }}>
        <span>PURCHASE INVOICE{piInvoiceNo?` — ${piInvoiceNo}`:""}</span>
        <WindowButtons win={piWin} lang={lang} onClose={()=>{ if (piLeaveUnsavedOk()) setPiView("list"); }} />
      </div>
      <PurchaseInvoiceDesktopForm
        lang={lang} t={t} shopId={shopId} products={products} vendors={pickVendors} invoices={invoices}
        form={piForm} setField={piUpd} lines={piLines} setLines={setPiLines} current={piCurrent} setCurrent={setPiCurrent}
        totals={totals} paid={paid} balance={balance}
        invoiceNo={piInvoiceNo} editInvoiceId={editInvoiceId} saving={piSaving} nameRef={piNameRef} qtyRef={piQtyRef}
        helpers={{ piCalcLine, piFmt2, piN2, PI_PAY_METHODS, PI_STATUSES, PI_UNITS, emptyCurrent:piEmptyCurrent }}
        purchaseOptions={purchaseOpts} baseCurrency={piBaseCur} onSaveOptions={isOwner ? savePurchaseOptions : undefined}
        sourceNote={piSource ? `${piSource.kind==="grn" ? (bnL?"মাল গ্রহণ থেকে":"From Goods Received") : (bnL?"পারচেজ অর্ডার থেকে":"From Purchase Order")}: ${piSource.no}` : ""}
        onSelectProduct={piSelectProduct} onChangeCurrentUnit={piChangeCurrentUnit} onAddCurrent={piAddCurrentItem} onDelLine={piDelLine} onPickVendor={piPickVendor}
        onConfirm={piConfirm} onSaveDraft={piSaveDraft}
        onClose={()=>{ if (piLeaveUnsavedOk()) setPiView("list"); }}
        onNew={()=>{ if (piLeaveUnsavedOk()) piOpenNew(); }}
        onOpenInvoice={piOpenFromDesktop}
        canEditInvoice={piCanEditInv}
        onCancelInvoice={isOwner ? async (inv)=>{ if (await piCancelInv(inv)) setPiView("detail"); } : undefined}
        onDeleteInvoice={isOwner ? (inv)=>piDelete(inv) : undefined}
        onOpenProductMaster={onOpenProductMaster}
        onProductPatched={onProductPatched}
        toast={toast}
      />
    </div>
  );

  const pmInputStyle = piMobile
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
  const closeForm = ()=>{ if (piLeaveUnsavedOk()) setPiView("list"); };
  const priorDoc = editInvoiceId ? invoices.find(inv=>inv.id===editInvoiceId) : null;
  const enterAdd = (e)=>{ if (e.key==="Enter") piAddCurrentItem(); };

  return (
    <div ref={piRootRef} className="si-root" style={piRootStyle}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>

      <div className="pm-reference-title">
        <strong style={{ color:piAccent }}>{editInvoiceId?(bnL?"ক্রয় ইনভয়েস এডিট":"EDIT PURCHASE INVOICE"):(bnL?"নতুন ক্রয় ইনভয়েস":"NEW PURCHASE INVOICE")}</strong>
        <span>{piInvoiceNo}</span>
      </div>

      <div className="si-body">
        {fPanel(`${t.pi_invoiceNo} & ${t.pi_date}`, <>
          {fRow(t.pi_invoiceNo, <div className="si-val is-strong" style={{ color:piAccent, fontFamily:"Consolas, monospace" }}>{piInvoiceNo}</div>)}
          {fRow(t.pi_date, <input type="date" className="pm-input" value={piForm.invoiceDate} onChange={e=>piUpd("invoiceDate",e.target.value)} />)}
          {fRow(<>{t.pi_supplierInvoiceNo} <span style={{ color:"#b91c1c" }}>*</span></>,
            <input className="pm-input" style={piForm.supplierInvoiceNo.trim()?undefined:{ borderColor:"#b91c1c" }} placeholder={t.pi_supplierInvoiceNoPh} value={piForm.supplierInvoiceNo} onChange={e=>piUpd("supplierInvoiceNo",e.target.value)} />)}
          {(purchaseOpts.refNo||piForm.refNo)&&fRow("Ref. No", <input className="pm-input" value={piForm.refNo||""} onChange={e=>piUpd("refNo",e.target.value)} placeholder={bnL?"PO / চালান নং":"PO / challan no"} />)}
          {(purchaseOpts.multiCurrency||piForm.currency)&&fRow(bnL?"মুদ্রা":"Currency", (
            <div style={{ display:"flex", gap:4 }}>
              <select className="pm-input" style={{ flex:1 }} value={piForm.currency||""} onChange={e=>{ piUpd("currency",e.target.value); if (!e.target.value) piUpd("exchangeRate",""); }}>
                <option value="">{piBaseCur}</option>
                {CURRENCIES.filter(([c])=>c!==piBaseCur).map(([c,label])=><option key={c} value={c}>{label}</option>)}
              </select>
              {isForeign(piForm, piBaseCur)&&<input className="pm-input" style={{ flex:1 }} inputMode="decimal" value={piForm.exchangeRate||""} onChange={e=>piUpd("exchangeRate",e.target.value)} placeholder={`1 ${piForm.currency} = ? ${piBaseCur}`} />}
            </div>
          ))}
          {isForeign(piForm, piBaseCur)&&<div className="si-hint" style={{ marginLeft:0 }}>{bnL?`দাম ${piForm.currency}-এ লিখুন; সেভের সময় ${piBaseCur}-এ বদলে stock আর হিসাবে যাবে।`:`Enter prices in ${piForm.currency}; they are converted to ${piBaseCur} for stock and accounts when saved.`}</div>}
        </>)}

        {fPanel(`🏭 ${t.pi_vendor}`, <>
          {vendors.length>0&&(
            <div ref={vendorSearchRef} style={{ position:"relative" }}>
              <div style={{ display:"flex", gap:3 }}>
                <input className="pm-input" style={{ flex:1 }} autoComplete="off"
                  placeholder={bnL?"ভেন্ডর খুঁজুন (নাম / কোড / মোবাইল)...":"Search vendor (name / code / mobile)..."}
                  value={vendorSearchQ}
                  onChange={e=>{ setVendorSearchQ(e.target.value); setVendorDropOpen(true); if(!e.target.value.trim()){ piUpd("vendorId",""); piUpd("vendorName",""); piUpd("vendorMobile",""); } }}
                  onFocus={()=>setVendorDropOpen(true)} />
                {piForm.vendorId&&<button type="button" className="pm-btn-secondary" title="Clear vendor" onClick={piClearVendor}>✕</button>}
                <button type="button" className="pm-btn-secondary" onClick={()=>setVendorDropOpen(o=>!o)}>▾</button>
              </div>
              {piForm.vendorId&&!vendorDropOpen&&(
                <div className="si-paid-box" style={{ marginTop:3 }}><span>✅ {piForm.vendorName}</span><span style={{ fontWeight:400 }}>{piForm.vendorMobile}</span></div>
              )}
              {vendorDropOpen&&(
                <div className="si-box" style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:999, maxHeight:240, boxShadow:"0 6px 18px rgba(0,0,0,0.25)" }}>
                  {filteredVendorOpts.length===0
                    ? <div className="si-empty">{bnL?"কোনো ভেন্ডর পাওয়া যায়নি":"No vendors found"}</div>
                    : filteredVendorOpts.map(v=>(
                      <button key={v.id} type="button" className="si-mrow" style={{ display:"block", width:"100%", textAlign:"left", padding:"5px 7px", border:0, borderBottom:"1px solid #cbd5e1", background:piForm.vendorId===v.id?"#dbeafe":"#fff", font:"inherit", cursor:"pointer" }}
                        onClick={()=>piPickVendor(v)}>
                        <div className="si-strong">{v.vendorName}{piForm.vendorId===v.id?" ✓":""}</div>
                        <div className="si-muted" style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          {v.vendorCode&&<span style={{ fontFamily:"Consolas, monospace" }}>{v.vendorCode}</span>}
                          {(v.mobileNumber||v.whatsappNumber)&&<span>📱 {v.mobileNumber||v.whatsappNumber}</span>}
                          {v.city&&<span>📍 {v.city}</span>}
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
          {fRow(<>{bnL?"নাম":"Name"} <span style={{ color:"#b91c1c" }}>*</span></>,
            <input className="pm-input" style={piForm.vendorName.trim()?undefined:{ borderColor:"#b91c1c" }} placeholder={t.pi_vendorManual} value={piForm.vendorName} onChange={e=>{ piUpd("vendorName",e.target.value); if (piForm.vendorId) piUpd("vendorId",""); }} />)}
          {fRow(bnL?"মোবাইল":"Mobile", <input className="pm-input" inputMode="tel" value={piForm.vendorMobile} onChange={e=>piUpd("vendorMobile",e.target.value)} />)}
        </>)}

        {fPanel(`📦 ${t.pi_items}`, <>
          <div className="si-entry">
            {fField(t.pi_itemName, (
              <ProductTypeaheadInput
                products={products}
                value={piCurrent.name}
                onChange={(value)=>setPiCurrent((p)=>({ ...p, name:value, productId:null }))}
                onSelectProduct={piSelectProduct}
                field="name"
                inputRef={piNameRef}
                placeholder={t.pi_itemName}
                th={PM_TH}
                lang={lang}
                onKeyDown={enterAdd}
                style={{ ...pmInputStyle, fontWeight:700 }}
              />
            ))}
            <div className="si-grid2">
              {fField("Code / Model", (
                <ProductTypeaheadInput
                  products={products}
                  value={piCurrent.code}
                  onChange={(value)=>setPiCurrent((p)=>({ ...p, code:value }))}
                  onSelectProduct={piSelectProduct}
                  field="code"
                  placeholder="Code / Model"
                  th={PM_TH}
                  lang={lang}
                  onKeyDown={enterAdd}
                  style={pmInputStyle}
                />
              ))}
              {fField(t.pi_brand, <input className="pm-input" value={piCurrent.brand} onChange={e=>setPiCurrent(p=>({...p,brand:e.target.value}))} />)}
            </div>
            {piCurrent.productId && <StockBadge product={products.find(pr=>pr.id===piCurrent.productId)} products={products} shopId={shopId} refreshKey={invoices} lang={lang} />}
            {piCurrent.productId && (
              <ProductInvoiceEntryInfo
                product={products.find((pr) => pr.id === piCurrent.productId)}
                lang={lang}
                fmt={piFmt2}
                canSeeCost={canManagePurchase || can("manageProducts")}
              />
            )}
            <div className="si-grid3" style={{ gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)" }}>
              {fField(t.pi_qty, <input className="pm-input" style={{ textAlign:"center" }} inputMode="decimal" placeholder="0" value={piCurrent.qty}
                ref={piQtyRef} onChange={e=>setPiCurrent(p=>({...p,qty:e.target.value}))} onKeyDown={enterAdd} />)}
              {fField(t.pi_unit, (
                <select className="pm-input" value={piCurrent.unit} onChange={e=>piChangeCurrentUnit(e.target.value)}>
                  {siUnitOptionsFor(products.find(pr=>pr.id===piCurrent.productId), piCurrent.unit).map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              ))}
              {fField(t.pi_unitCost, <input className="pm-input" style={{ fontWeight:700 }} inputMode="decimal" placeholder="0.00" value={piCurrent.unitCost}
                onChange={e=>setPiCurrent(p=>({...p,unitCost:e.target.value}))} onKeyDown={enterAdd} />)}
            </div>
            <div className="si-grid3" style={{ gridTemplateColumns:"62px 74px 56px minmax(0,1fr)" }}>
              {fField(t.pi_discPerc, <input className="pm-input" inputMode="decimal" placeholder="0" value={piCurrent.discountPerc} onChange={e=>setPiCurrent(p=>({...p,discountPerc:e.target.value}))} />)}
              {fField(bnL?"ছাড় (টাকা)":"Dis Amt", <input className="pm-input" inputMode="decimal" placeholder="0.00" value={piCurrent.discountFlat||""} disabled={piN2(piCurrent.discountPerc)>0} onChange={e=>setPiCurrent(p=>({...p,discountFlat:e.target.value}))} />)}
              {fField("VAT%", <input className="pm-input" inputMode="decimal" placeholder="5" value={piCurrent.taxPerc} onChange={e=>setPiCurrent(p=>({...p,taxPerc:e.target.value}))} />)}
              {fField(`💰 ${t.pi_salePrice}`, <input className="pm-input" style={{ color:"#15803d", fontWeight:700 }} inputMode="decimal" placeholder={t.pi_salePricePh} value={piCurrent.salePrice}
                onChange={e=>setPiCurrent(p=>({...p,salePrice:e.target.value}))} onKeyDown={enterAdd} />)}
            </div>
            <div style={{ display:"flex", gap:4, alignItems:"center" }}>
              <button type="button" className="pm-btn pm-btn--primary" style={{ flex:1, minHeight:piMobile?38:24 }} onClick={piAddCurrentItem}>
                {piEditLineId ? (bnL?"✅ আপডেট করুন":"✅ Update Item") : (bnL?"✅ পণ্য যোগ করুন":"✅ Add Item")}
              </button>
              {piEditLineId&&<button type="button" className="pm-btn-secondary" style={{ minHeight:piMobile?38:24 }} onClick={()=>{ setPiEditLineId(null); setPiCurrent(piEmptyCurrent()); }}>{bnL?"বাদ":"Cancel"}</button>}
              {(piN2(piCurrent.qty)>0&&piN2(piCurrent.unitCost)>0)&&(
                <b style={{ color:piAccent, whiteSpace:"nowrap" }}>= {t.cur} {piFmt2(piCalcLine(piCurrent).total)}</b>
              )}
            </div>
          </div>
          {piLines.length===0
            ? <div className="pm-hint" style={{ textAlign:"center" }}>{bnL?"↑ উপরে পণ্য যোগ করুন":"↑ Add items above"}</div>
            : <PiItemsTable items={piLines} lang={lang} onEdit={piEditLine} onDelete={piDelLine} editId={piEditLineId} />}
        </>, piLines.length>0 ? ` (${piLines.length})` : "")}

        {fPanel(`📊 ${t.pi_summary}`, <>
          <div className="si-total-row"><span>{t.pi_subtotal}</span><b>{t.cur} {piFmt2(totals.sub)}</b></div>
          {totals.disc>0&&<div className="si-total-row"><span>{t.pi_totalDiscount}</span><b style={{ color:"#b91c1c" }}>- {t.cur} {piFmt2(totals.disc)}</b></div>}
          {totals.tax>0&&<div className="si-total-row"><span>{t.pi_totalTax}</span><b style={{ color:"#0e7490" }}>+ {t.cur} {piFmt2(totals.tax)}</b></div>}
          <div className="si-total-row is-grand"><span>{t.pi_grandTotal}</span><span style={{ color:piAccent }}>{t.cur} {piFmt2(totals.grand)}</span></div>
        </>)}

        {fPanel(`💳 ${t.pi_payment}`, <>
          {fRow(bnL?"পেমেন্টের ধরন":"Payment method", (
            <select className="pm-input" value={piForm.paymentMethod} onChange={e=>{
              const key = e.target.value;
              setPiForm(p=>({ ...p, paymentMethod:key, ...(p.paymentMethod==="cash"&&key!=="cash" ? { amountPaid:"" } : {}) }));
            }}>
              {Object.entries(PI_PAY_METHODS).map(([key,pm])=><option key={key} value={key}>{pm.icon} {pm[lang]}</option>)}
            </select>
          ))}
          {piForm.paymentMethod==="cash" ? (
            <div className="si-paid-box"><span>✅ {bnL?"নগদে সম্পূর্ণ পরিশোধিত":"Fully paid (cash)"}</span><span>{t.cur} {piFmt2(totals.grand)}</span></div>
          ) : (
            <>
              {fRow(t.pi_amountPaid, (
                <div style={{ display:"flex", gap:4 }}>
                  <input className="pm-input" inputMode="decimal" placeholder="0.00" value={piForm.amountPaid} onChange={e=>piUpd("amountPaid",e.target.value)} />
                  {totals.grand>0&&<button type="button" className="pm-btn-secondary" onClick={()=>piUpd("amountPaid",piFmt2(totals.grand))}>{bnL?"পুরো":"Full"}</button>}
                </div>
              ))}
              {totals.grand>0&&<div className={`si-paid-box${balance>0.01?" is-due":""}`}><span>{t.pi_balanceDue}</span><span>{t.cur} {piFmt2(balance)}</span></div>}
            </>
          )}
        </>)}

        {fPanel(`📝 ${t.pi_note}`, (
          <textarea className="pm-input" placeholder={t.pi_notePh} value={piForm.note} onChange={e=>piUpd("note",e.target.value)} />
        ))}
      </div>

      <div className="si-actions si-sticky-actions">
        <button type="button" className="pm-btn pm-btn--primary" onClick={piConfirm} disabled={piSaving}>{piSaving?"...":t.pi_confirm}</button>
        {(!priorDoc || priorDoc.status==="draft")&&<button type="button" className="pm-btn" onClick={piSaveDraft} disabled={piSaving}>{t.pi_saveDraft}</button>}
        <button type="button" className="pm-btn-secondary" onClick={closeForm}>{t.pi_cancelForm}</button>
      </div>
    </div>
  );
}
