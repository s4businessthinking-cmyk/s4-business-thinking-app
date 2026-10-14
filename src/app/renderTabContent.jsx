import AttendanceTab from "../employees/AttendanceTab.jsx";
import AuditLogTab from "../returns/AuditLogTab.jsx";
import BankRecTab from "../accounts/BankRecTab.jsx";
import BarcodeLabelsTab from "../labels/BarcodeLabelsTab.jsx";
import { BranchTransferWorkspace } from "../branch-transfer/BranchTransferNative.jsx";
import { CM_IMPORT_COLUMNS, VM_IMPORT_COLUMNS, WA_STYLES, emptyVendor, mergePartyRow } from "./mainAppHelpers.js";
import CalculatorWindow from "../tools/CalculatorWindow.jsx";
import ChequePrinterTab from "../cheque/ChequePrinterTab.jsx";
import { CompaniesScreen } from "../orders/CompaniesScreen.jsx";
import CustomerMasterScreen, { EMPTY_CUSTOMER } from "../customer-master/CustomerMasterScreen.jsx";
import { DashboardTab } from "../dashboard/DashboardTab.jsx";
import EmployeesTab from "../employees/EmployeesTab.jsx";
import { ExcelImportModal } from "../components/ExcelImportModal.jsx";
import ExpensesTab from "../expenses/ExpensesTab.jsx";
import JobCardTab from "../jobcard/JobCardTab.jsx";
import { OwnerOrdersScreen } from "../orders/OwnerOrdersScreen.jsx";
import OwnerPinModal from "../auth/OwnerPinModal.jsx";
import PartnersTab from "../partners/PartnersTab.jsx";
import PdcWindow from "../vouchers/PdcWindow.jsx";
import { PurchaseInvoiceTab } from "../purchase/PurchaseInvoiceTab.jsx";
import { PiSalesmanView } from "../purchase/PiSalesmanView.jsx";
import ProductMasterScreen from "../product-master/ProductMasterScreen.jsx";
import ProfitLossReport from "../reports/ProfitLossReport.jsx";
import GlobalLedgerWindow from "../ledger/GlobalLedgerWindow.jsx";
import PurchaseDocsTab from "../purchase/PurchaseDocsTab.jsx";
import RemindersTab from "../reminders/RemindersTab.jsx";
import ReorderAlertCard from "../inventory/ReorderAlertCard";
import ReturnsTab from "../returns/ReturnsTab.jsx";
import { SalesInvoiceTab } from "../sales-invoice/SalesInvoiceTab.jsx";
import { SettingsPage } from "../settings/SettingsPage.jsx";
import { ShopOrderScreen } from "../orders/ShopOrderScreen.jsx";
import StockAdjustmentTab from "../returns/StockAdjustmentTab.jsx";
import StockConvertTab from "../returns/StockConvertTab.jsx";
import TaxReport from "../reports/TaxReport.jsx";
import { UAE_BANKS } from "../cheque/chequeConfig.js";
import VendorMasterScreen from "../vendor-master/VendorMasterScreen.jsx";
import VouchersTab from "../vouchers/VouchersTab.jsx";
import { billLeaveGuard, nextPartyCode } from "../shared/appShared.jsx";
import { printPaymentVoucher } from "../sales-invoice/salesInvoiceShared.js";

export function renderTabContent({ OrderCard, addCo, addItToInvoice, addProduct, applyGroupToMember, branchTransferSettings, btInbox, calcMode, can, canManageProducts, canSeeProductCost, canStaffSupplierArea, canStaffVouchers, canUseBranchTransfer, cancelEdit, cancelEditOrder, chequeHandoverReq, chequePrefill, clearAllShopProducts, clearingProducts, closeTeamMember, cloudPullBusy, cloudUploadBusy, confirmPmDiscard, cos, createEmptyPmForm, createStaffMember, currentItem, customers, delCo, delIt, deleteInviteCode, deleteProduct, editId, editNm, editPh, editProduct, editingOrderId, empFocus, employeeAlertList, exportProductsCsv, exportWeighingBarcodeCsv, fetchProducts, filterOrders, filterOrdersByStatusPage, filteredProducts, finance, finishProductReplacement, generateNewCode, getFilteredProducts, globalFocusCustomerId, globalFocusVendorId, globalOpenPurchaseInvoiceId, globalOpenSalesInvoiceId, globalSearchCan, grnIncoming, groupByDay, hErr, handleEnterAdd, handleGlobalSearchNavigate, handleLogout, importProductRecords, inviteCodes, isDesktop, isOrderManager, isOwner, items, lang, lastCloudPullAt, loadPmForm, localShop, makeShopNo, mergeShopRecord, nameRef, newNm, newPh, note, openEmployeeAlert, orderModuleEnabled, orderSettingsSaving, orders, ownerLockedPanel, ownerUnlocked, partnerAlertList, patchProductInList, periodLock, piNewReq, piNewVendor, piVoucherReq, pinModal, pmCatFilter, pmEditId, pmForm, pmOverSales, pmPickForSales, pmReset, pmSearch, pmUpd, printProductBarcodes, productMaintenance, productReplacementActive, products, productsLoading, profile, purchaseSource, quoteToConvert, refreshSyncDashboard, reloadCustomersFromOffline, reloadVendorsFromOffline, removeBlankProducts, renderOrderPageTabs, resetStaffPassword, runCloudDownload, runCloudUpload, s, saveEdit, saveMemberDefaults, saveMemberPosition, saveOrderModuleEnabled, savePermissions, saveUserGroups, savingProduct, searchQ, selectProductToOrder, sendOrder, setBranchTransferSettings, setCalcMode, setChequeHandoverReq, setChequePrefill, setCustomers, setEditNm, setEditPh, setEmpFocus, setGlobalFocusCustomerId, setGlobalFocusVendorId, setGlobalOpenPurchaseInvoiceId, setGlobalOpenSalesInvoiceId, setGrnIncoming, setLang, setLocalShop, setMenuOpen, setNewNm, setNewPh, setNote, setOwnerUnlocked, setPiNewReq, setPiNewVendor, setPiVoucherReq, setPinModal, setPmCatFilter, setPmEditId, setPmOverSales, setPmSearch, setPmShowAdd, setPrintSettingsOpen, setPurchaseSource, setQuoteToConvert, setSearchQ, setSettingsPage, setShowAdd, setSiNewCustomer, setSiNewReq, setSiVoucherReq, setStaffForm, setStaffPwReset, setTab, setTabState, setTheme, setVendors, setWaStyle, settingsPage, shopId, showAdd, siColorPrint, siNewCustomer, siNewReq, siShowCode, siVoucherReq, stPage, staffForm, staffPwReset, staffQuickNavKeys, staffSaving, startEdit, startProductEdit, syncDashboard, syncRefreshKey, syncState, t, tab, tabRef, team, teamEmployees, th, theme, toast, unread, updCurrentItem, user, userGroups, vendors, waStyle, windowWidth }) {
  const tabContent = (
    <>
      {pinModal&&isOwner&&(
        <OwnerPinModal lang={lang} uid={user.uid} localUserId={profile.localUserId} initialMode={pinModal}
          onUnlocked={()=>{ setOwnerUnlocked(true); setPinModal(null); toast(lang==="bn"?"🔓 খোলা হয়েছে":"🔓 Unlocked"); }}
          onClose={()=>setPinModal(null)} />
      )}
      {tab==="dashboard"&&(
        <DashboardTab
          t={t} lang={lang} th={th} s={s}
          profile={profile} userUid={user.uid} localShop={localShop}
          orders={orders} cos={cos} products={products}
          team={team} vendors={vendors} customers={customers}
          isOwner={isOwner} isDesktop={isDesktop}
          setTab={setTab} unread={unread}
          staffQuickNavKeys={staffQuickNavKeys}
          canUseBranchTransfer={canUseBranchTransfer}
          btInbox={btInbox}
          orderModuleEnabled={orderModuleEnabled}
          finance={finance}
          moneyLocked={isOwner&&!ownerUnlocked}
          onUnlockMoney={()=>setPinModal("unlock")}
          onLockMoney={()=>setOwnerUnlocked(false)}
          toast={toast}
          onOpenMenu={()=>setMenuOpen(true)}
          globalSearchCan={globalSearchCan}
          onGlobalSearchNavigate={handleGlobalSearchNavigate}
          globalSearchCur={t.cur || localShop?.currency || "AED"}
          globalSearchCanSeeCost={canSeeProductCost}
        />
      )}
      {tab==="dashboard"&&(isOwner||can("viewProducts"))&&(
        <ReorderAlertCard
          products={products} shopId={shopId} lang={lang} s={s}
          wrapStyle={isDesktop?s.desktopPanel:s.panel}
          onOpenProducts={()=>setTab("products")}
        />
      )}
      {!isOwner&&orderModuleEnabled&&tab==="shop"&&(
        <ShopOrderScreen {...{ OrderCard, addItToInvoice, can, cancelEditOrder, currentItem, delIt, editingOrderId, filterOrders, filterOrdersByStatusPage, groupByDay, handleEnterAdd, isDesktop, isOrderManager, items, lang, nameRef, note, orders, products, renderOrderPageTabs, s, searchQ, selectProductToOrder, sendOrder, setNote, setSearchQ, t, th, updCurrentItem }} />
      )}

      {isOwner&&orderModuleEnabled&&tab==="owner"&&(
        <OwnerOrdersScreen {...{ OrderCard, filterOrders, filterOrdersByStatusPage, groupByDay, isDesktop, lang, orders, renderOrderPageTabs, s, searchQ, setSearchQ, t, th }} />
      )}

      {(isOwner||can("viewProducts"))&&(tab==="products"||(pmOverSales&&["sales","quotation","delivery","purchase"].includes(tab)))&&(
        <div data-si-modal-open={pmOverSales ? "" : undefined} style={{
          position:"fixed",
          inset:0,
          zIndex:2000,
          width:"100vw",
          height:"100dvh",
          margin:0,
          padding:0,
          overflow:"auto",
          background:"#adc3e3"
        }}>
          <ProductMasterScreen
            key={shopId || "default-shop"}
            shopId={shopId}
            products={products}
            filteredProducts={filteredProducts}
            productsLoading={productsLoading}
            clearingProducts={clearingProducts}
            companies={cos}
            form={pmForm}
            upd={pmUpd}
            selectedId={pmEditId}
            search={pmSearch}
            onSearchChange={setPmSearch}
            category={pmCatFilter}
            onCategoryChange={setPmCatFilter}
            canDelete={isOwner}
            canEdit={canManageProducts}
            canSeeCost={canSeeProductCost}
            saving={savingProduct}
            onNew={()=>{ if (!confirmPmDiscard()) return; pmReset(); setPmEditId(null); setPmShowAdd(true); }}
            onSave={()=>{ if (pmEditId) editProduct(pmEditId); else addProduct(); }}
            onDelete={()=>{ if (pmEditId) deleteProduct(pmEditId); }}
            onClose={()=>{
              if (!confirmPmDiscard()) return;
              setPmShowAdd(false); setPmEditId(null); pmReset();
              if (pmOverSales) setPmOverSales(false); else setTab("dashboard");
            }}
            onSelectProduct={(p)=>{ if (p.id !== pmEditId && confirmPmDiscard()) startProductEdit(p); }}
            onRefresh={fetchProducts}
            onClearAll={clearAllShopProducts}
            onRemoveBlank={isOwner ? removeBlankProducts : undefined}
            replacementActive={productReplacementActive}
            onFinishReplacement={finishProductReplacement}
            productMaintenanceActive={productMaintenance.active}
            onExport={canSeeProductCost ? ()=>exportProductsCsv(getFilteredProducts()).catch(hErr) : undefined}
            onImportRecords={importProductRecords}
            onGenerateWeighingFile={()=>exportWeighingBarcodeCsv(getFilteredProducts())}
            onPrintBarcodes={printProductBarcodes}
            notify={(message,kind)=>toast(message, kind==="err"?"err":"ok")}
          />
        </div>
      )}

      {orderModuleEnabled&&(isOwner||can("manageCompanies"))&&tab==="companies"&&(
  <CompaniesScreen {...{ addCo, cancelEdit, cos, delCo, editId, editNm, editPh, isDesktop, isOwner, lang, newNm, newPh, s, saveEdit, setEditNm, setEditPh, setNewNm, setNewPh, setShowAdd, setTab, showAdd, startEdit, t, th, vendors }} />
      )}

      {isOwner&&tab==="customers"&&(
        <CustomerMasterScreen
          t={t} lang={lang} cur={t.cur||"AED"}
          shopId={shopId} user={user}
          customers={customers} team={team} toast={toast}
          canEdit canDelete canSales
          actorName={profile?.personName||""}
          leaveGuard={billLeaveGuard}
          focusPartyId={globalFocusCustomerId}
          onFocusPartyHandled={()=>setGlobalFocusCustomerId(null)}
          onPartySaved={(row)=>setCustomers((prev)=>mergePartyRow(prev, row, "customerName"))}
          onPartyRemoved={(id)=>setCustomers((prev)=>prev.filter((c)=>c.id!==id))}
          onClose={()=>setTab("dashboard")}
          nextCode={()=>nextPartyCode(shopId, "customers", customers)}
          onGoToSales={(customer)=>{
            if (tabRef.current !== "sales" && billLeaveGuard.current && !billLeaveGuard.current.leave()) return;
            setTabState("sales");
            setSiNewCustomer(customer||null);
            setSiNewReq(Date.now());
          }}
          renderImport={(close)=>(
            <ExcelImportModal t={t} lang={lang} th={th} shopId={shopId} user={user}
              type="customer" columnMap={CM_IMPORT_COLUMNS} defaultFields={{ ...EMPTY_CUSTOMER, customerType:"Customer", status:"active", country:"UAE", paymentType:"cash" }}
              collection="customers"
              onClose={close}
              onImported={(n)=>{ close(); toast(`✅ ${n} ${lang==="bn"?"জন কাস্টমার ইমপোর্ট হয়েছে":"customers imported!"}`); reloadCustomersFromOffline(); }} />
          )}
        />
      )}

      {(isOwner || can("viewVendors") || can("manageVendors"))&&tab==="vendors"&&(
        <VendorMasterScreen
          t={t} lang={lang} cur={t.cur||"AED"}
          shopId={shopId} user={user}
          vendors={vendors} toast={toast} canDelete={isOwner} canEdit={isOwner||can("manageVendors")}
          leaveGuard={billLeaveGuard}
          focusPartyId={globalFocusVendorId}
          onFocusPartyHandled={()=>setGlobalFocusVendorId(null)}
          onPartySaved={(row)=>setVendors((prev)=>mergePartyRow(prev, row, "vendorName"))}
          onPartyRemoved={(id)=>setVendors((prev)=>prev.filter((v)=>v.id!==id))}
          onClose={()=>setTab("dashboard")}
          nextCode={()=>nextPartyCode(shopId, "vendors", vendors)}
          canPurchase={isOwner||can("managePurchase")}
          actorName={profile?.personName||""}
          onGoToPurchase={(isOwner||can("managePurchase")) ? (vendor)=>{
            if (tabRef.current !== "purchase" && billLeaveGuard.current && !billLeaveGuard.current.leave()) return;
            setTabState("purchase");
            setPiNewVendor(vendor||null);
            setPiNewReq(Date.now());
          } : undefined}
          renderImport={(close)=>(
            <ExcelImportModal t={t} lang={lang} th={th} shopId={shopId} user={user}
              type="vendor" columnMap={VM_IMPORT_COLUMNS} defaultFields={{ ...emptyVendor, status:"active", country:"UAE" }}
              collection="vendors"
              onClose={close}
              onImported={(n)=>{ close(); toast(`✅ ${n} ${lang==="bn"?"জন ভেন্ডর ইমপোর্ট হয়েছে":"vendors imported!"}`); reloadVendorsFromOffline(); }} />
          )}
        />
      )}

      {tab==="purchase"&&canStaffSupplierArea&&(
        <PurchaseInvoiceTab
          t={t} lang={lang} th={th} s={s}
          shopId={shopId} user={user} profile={profile}
          vendors={vendors} products={products}
          shop={localShop} toast={toast} isDesktop={isDesktop} wideDesktop={windowWidth >= 1100}
          onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))}
          syncRefreshKey={syncRefreshKey}
          onOpenProductMaster={canManageProducts ? (name) => {
            loadPmForm({ ...createEmptyPmForm(), ...(name ? { name } : {}) });
            setPmEditId(null); setPmShowAdd(true); setPmOverSales(true);
          } : undefined}
          productFromMaster={pmPickForSales}
          onOpenChequePrinter={(isOwner||can("printCheques")) ? (p)=>{ setChequePrefill({ ...p, at:Date.now() }); setTab("cheque"); } : undefined}
          chequeHandoverRequest={chequeHandoverReq}
          onChequeHandoverHandled={()=>setChequeHandoverReq(null)}
          openNewRequest={piNewReq}
          openNewVendor={piNewVendor}
          onOpenNewHandled={()=>{ setPiNewReq(0); setPiNewVendor(null); }}
          voucherRequest={piVoucherReq}
          onVoucherHandled={()=>setPiVoucherReq(0)}
          purchaseSource={purchaseSource}
          onPurchaseSourceHandled={()=>setPurchaseSource(null)}
          openInvoiceId={globalOpenPurchaseInvoiceId}
          onOpenInvoiceHandled={()=>setGlobalOpenPurchaseInvoiceId(null)}
          onProductPatched={patchProductInList}
        />
      )}

      {(tab==="purchaseOrder"||tab==="goodsReceipt")&&(isOwner||can("managePurchase"))&&(
        <PurchaseDocsTab key={tab} kind={tab==="purchaseOrder"?"po":"grn"} lang={lang} shopId={shopId} user={user} profile={profile}
          isOwner={isOwner} canManage={isOwner||can("managePurchase")} products={products} vendors={vendors} toast={toast}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} makeNo={makeShopNo} leaveGuard={billLeaveGuard}
          incoming={tab==="goodsReceipt"?grnIncoming:null} onIncomingHandled={()=>setGrnIncoming(null)}
          onMakePurchase={(k,doc,lines)=>{ setPurchaseSource({ kind:k, doc, lines, at:Date.now() }); setTabState("purchase"); }}
          onMakeReceipt={(doc,lines)=>{ setGrnIncoming({ doc, lines, at:Date.now() }); setTabState("goodsReceipt"); }} />
      )}

      {tab==="purchase"&&!canStaffSupplierArea&&(
        <div style={isDesktop?s.desktopPanel:s.panel}>
          <PiSalesmanView t={t} lang={lang} th={th} shopId={shopId} syncRefreshKey={syncRefreshKey} showCost={isOwner||canSeeProductCost} />
        </div>
      )}

      {(isOwner || can("manageSales")) && ["sales","quotation","delivery","salesOrder"].includes(tab)&&(
        <SalesInvoiceTab
          key={tab}
          kind={tab}
          quoteToConvert={tab==="sales"||tab==="delivery" ? quoteToConvert : null}
          onConvertQuote={(q)=>{ setQuoteToConvert(q); setTabState("sales"); }}
          onConvertToDN={(q)=>{ setQuoteToConvert(q); setTabState("delivery"); }}
          onQuoteConvertHandled={()=>setQuoteToConvert(null)}
          openNewRequest={tab==="sales" ? siNewReq : 0}
          openNewCustomer={siNewCustomer}
          onOpenNewHandled={()=>{ setSiNewReq(0); setSiNewCustomer(null); }}
          voucherRequest={tab==="sales" ? siVoucherReq : 0}
          onVoucherHandled={()=>setSiVoucherReq(0)}
          openInvoiceId={tab === "sales" ? globalOpenSalesInvoiceId : null}
          onOpenInvoiceHandled={()=>setGlobalOpenSalesInvoiceId(null)}
          t={t} lang={lang} th={th} s={s}
          shopId={shopId} user={user} profile={profile}
          customers={customers} products={products}
          shop={localShop} toast={toast} isDesktop={isDesktop} wideDesktop={windowWidth >= 1100}
          siShowCode={siShowCode} siColorPrint={siColorPrint}
          canManageCustomers={can("manageCustomers")}
          syncRefreshKey={syncRefreshKey}
          team={team}
          onOpenProductMaster={canManageProducts ? (name) => {
            loadPmForm({ ...createEmptyPmForm(), ...(name ? { name } : {}) });
            setPmEditId(null); setPmShowAdd(true); setPmOverSales(true);
          } : undefined}
          productFromMaster={pmPickForSales}
          onCustomerCreated={(created) => setCustomers((prev) => [...prev, created].sort((a,b)=>(a.customerName||"").localeCompare(b.customerName||"")))}
        />
      )}


      {tab==="cheque"&&(isOwner||can("printCheques"))&&(
        <ChequePrinterTab
          t={t} lang={lang} th={th} s={s}
          isDesktop={isDesktop}
          shopName={localShop?.companyName||""}
          shopAccount={localShop?.accountNumber||""}
          shopIban={localShop?.ibanNumber||""}
          shopId={shopId} user={user} shop={localShop}
          syncRefreshKey={syncRefreshKey}
          prefill={chequePrefill}
          onPrefillDone={()=>setChequePrefill(null)}
          onOpenHandover={canStaffSupplierArea&&(isOwner||can("vendorPayments")) ? (v)=>{ setChequeHandoverReq({ ...v, at:Date.now() }); setTab("purchase"); } : undefined}
          foldersVisible={isOwner&&ownerUnlocked}
          onUnlockFolders={isOwner ? ()=>setPinModal("unlock") : undefined}
          onLockFolders={isOwner ? ()=>setOwnerUnlocked(false) : undefined}
        />
      )}

      {tab==="pdc"&&(isOwner||can("managePdc"))&&(
        <PdcWindow inline lang={lang} cur={t.cur||"AED"} shopId={shopId} userId={user?.uid||""}
          shopName={localShop?.companyName||""}
          onOpenVoucher={(raw)=>printPaymentVoucher(raw, localShop, lang)} />
      )}

      {(tab==="expenses"||tab==="employeeExpense")&&(isOwner||can("manageExpenses"))&&(
        <ExpensesTab key={tab} employeeMode={tab==="employeeExpense"} lang={lang} th={th} s={s} shopId={shopId} user={user} profile={profile} isOwner={isOwner}
          cur={t.cur||"AED"} isDesktop={isDesktop} toast={toast} shopName={localShop?.companyName||""} leaveGuard={billLeaveGuard} shop={localShop} />
      )}

      {tab==="employees"&&(isOwner||can("manageEmployees"))&&(
        <EmployeesTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner} canManage={isOwner||can("manageEmployees")}
          cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""} shop={localShop} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} leaveGuard={billLeaveGuard}
          alerts={employeeAlertList} focus={empFocus} onFocusHandled={()=>setEmpFocus(null)} onOpenAlert={openEmployeeAlert} />
      )}

      {tab==="jobCard"&&(isOwner||can("manageJobs"))&&(
        <JobCardTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner} canManage={isOwner||can("manageJobs")}
          cur={t.cur||"AED"} toast={toast} shop={localShop} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))}
          customers={customers} products={products} makeNo={makeShopNo} leaveGuard={billLeaveGuard}
          onMakeInvoice={(isOwner||can("manageSales")) ? (src)=>{ setQuoteToConvert(src); setTabState("sales"); } : undefined} />
      )}

      {tab==="bankRec"&&(isOwner||can("bankReconcile"))&&(
        <BankRecTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner} canManage={isOwner||can("bankReconcile")}
          cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""} />
      )}

      {tab==="attendance"&&(isOwner||can("manageEmployees"))&&(
        <AttendanceTab lang={lang} shopId={shopId} user={user} profile={profile} canManage={isOwner||can("manageEmployees")}
          cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""} leaveGuard={billLeaveGuard} />
      )}

      {tab==="vouchers"&&(isOwner||canStaffVouchers)&&(
        <VouchersTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner}
          canJournal={isOwner||can("accountVouchers")} cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""}
          makeNo={makeShopNo} leaveGuard={billLeaveGuard} customers={customers} vendors={vendors} banks={UAE_BANKS.map(b=>b.name)}
          onOpenReceipts={(isOwner||can("manageSales")) ? ()=>{ setTab("sales"); setSiVoucherReq(Date.now()); } : undefined}
          onOpenPayments={canStaffSupplierArea&&(isOwner||can("vendorPayments")) ? ()=>{ setTab("purchase"); setPiVoucherReq(Date.now()); } : undefined}
          onOpenDebitNote={(isOwner||can("manageReturns")) ? ()=>setTab("purchaseReturn") : undefined}
          onOpenCreditNote={(isOwner||can("manageReturns")) ? ()=>setTab("salesReturn") : undefined} />
      )}

      {(tab==="salesReturn"||tab==="purchaseReturn")&&(isOwner||can("manageReturns"))&&(
        <ReturnsTab key={tab} kind={tab==="salesReturn"?"sales":"purchase"} lang={lang} th={th} shopId={shopId} user={user} profile={profile}
          isOwner={isOwner} canManage={isOwner||can("manageReturns")} cur={t.cur||"AED"} isDesktop={isDesktop} toast={toast}
          shopName={localShop?.companyName||""} makeNo={makeShopNo} leaveGuard={billLeaveGuard} />
      )}

      {tab==="stockAdjust"&&(isOwner||can("stockAdjust"))&&(
        <StockAdjustmentTab lang={lang} th={th} shopId={shopId} user={user} profile={profile} products={products}
          isOwner={isOwner} canManage={isOwner||can("stockAdjust")} isDesktop={isDesktop} toast={toast}
          shopName={localShop?.companyName||""} makeNo={makeShopNo} leaveGuard={billLeaveGuard} />
      )}
      {tab==="reminders"&&(
        <RemindersTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner} team={team} toast={toast} />
      )}
      {tab==="calculator"&&(
        <CalculatorWindow inline lang={lang} baseCurrency={String(localShop?.currency||t.cur||"AED").toUpperCase()} />
      )}
      {calcMode&&tab!=="calculator"&&(
        <CalculatorWindow lang={lang} baseCurrency={String(localShop?.currency||t.cur||"AED").toUpperCase()} initialMode={calcMode} onClose={()=>setCalcMode(null)} />
      )}
      {tab==="labels"&&(isOwner||can("viewProducts"))&&(
        <BarcodeLabelsTab lang={lang} shopId={shopId} user={user} profile={profile} shop={localShop} products={products} toast={toast}
          isOwner={isOwner} cur={t.cur||""} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} />
      )}
      {(tab==="loosen"||tab==="bundle")&&(isOwner||can("stockAdjust"))&&(
        <StockConvertTab key={tab} kind={tab} lang={lang} shopId={shopId} user={user} profile={profile} products={products}
          isOwner={isOwner} canManage={isOwner||can("stockAdjust")} toast={toast}
          shopName={localShop?.companyName||""} makeNo={makeShopNo} leaveGuard={billLeaveGuard} />
      )}

      {tab==="auditLog"&&isOwner&&(
        <AuditLogTab lang={lang} th={th} shopId={shopId} cur={t.cur||"AED"} isDesktop={isDesktop} />
      )}

      {tab==="globalLedger"&&isOwner&&(
        <GlobalLedgerWindow embedded lang={lang} shopId={shopId} shopName={localShop?.companyName||""} cur={t.cur||"AED"} customers={customers} vendors={vendors} />
      )}
      {tab==="accounts"&&isOwner&&ownerUnlocked&&(
        <ProfitLossReport lang={lang} th={th} s={s} shopId={shopId} products={products}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} isDesktop={isDesktop} />
      )}
      {tab==="accounts"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"হিসাব নিকাশ (Accounts) লক করা":"Accounts are locked")}
      {tab==="tax"&&isOwner&&ownerUnlocked&&(
        <TaxReport lang={lang} shopId={shopId} shop={localShop} user={user} products={products} customers={customers} vendors={vendors}
          shopName={localShop?.companyName||""} toast={toast} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} />
      )}
      {tab==="tax"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"ট্যাক্স / VAT লক করা":"Tax / VAT is locked")}
      {tab==="partners"&&isOwner&&ownerUnlocked&&(
        <PartnersTab lang={lang} shopId={shopId} user={user} profile={profile} cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""}
          shop={localShop} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} products={products} alerts={partnerAlertList} isOwner={isOwner} />
      )}
      {tab==="partners"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"পার্টনারের হিসাব লক করা":"Partners are locked")}

      {tab==="branchTransfer"&&canUseBranchTransfer&&(
        <BranchTransferWorkspace
          lang={lang}
          shopId={shopId} user={user} profile={profile}
          team={team} products={products} vendors={vendors} shop={localShop}
          settings={branchTransferSettings} toast={toast}
          leaveGuard={billLeaveGuard}
        />
      )}

      {tab==="settings"&&<SettingsPage {...{ WA_STYLES, applyGroupToMember, branchTransferSettings, closeTeamMember, cloudPullBusy, cloudUploadBusy, createStaffMember, deleteInviteCode, generateNewCode, handleLogout, inviteCodes, isDesktop, isOwner, lang, lastCloudPullAt, localShop, mergeShopRecord, orderModuleEnabled, orderSettingsSaving, periodLock, products, profile, refreshSyncDashboard, resetStaffPassword, runCloudDownload, runCloudUpload, s, saveMemberDefaults, saveMemberPosition, saveOrderModuleEnabled, savePermissions, saveUserGroups, setBranchTransferSettings, setLang, setLocalShop, setPinModal, setPrintSettingsOpen, setSettingsPage, setStaffForm, setStaffPwReset, setTheme, setWaStyle, settingsPage, shopId, stPage, staffForm, staffPwReset, staffSaving, syncDashboard, syncState, t, team, teamEmployees, th, theme, toast, user, userGroups, waStyle }} />}
    </>
  );
  return { tabContent };
}
