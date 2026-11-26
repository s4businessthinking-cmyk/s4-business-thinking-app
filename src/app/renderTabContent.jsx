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
import BalanceSheetReport from "../reports/BalanceSheetReport.jsx";
import BooksHubReport from "../reports/BooksHubReport.jsx";
import CashFlowReport from "../reports/CashFlowReport.jsx";
import FundsSummaryReport from "../reports/FundsSummaryReport.jsx";
import CostCentreReport from "../reports/CostCentreReport.jsx";
import RatioAnalysisReport from "../reports/RatioAnalysisReport.jsx";
import BudgetReport from "../reports/BudgetReport.jsx";
import OverdueInterestReport from "../reports/OverdueInterestReport.jsx";
import TallyExportReport from "../reports/TallyExportReport.jsx";
import ChartOfAccountsScreen from "../ledger/ChartOfAccountsScreen.jsx";
import CounterHub from "../counter/CounterHub.jsx";
import BulkMessageScreen from "../share/BulkMessageScreen.jsx";
import MastersHub from "../masters/MastersHub.jsx";
import TrialBalanceReport from "../reports/TrialBalanceReport.jsx";
import OpeningHub from "../accounts/OpeningHub.jsx";
import { countryCodeOf, setShareCountryCode } from "../share/whatsappDocShare.js";
import PartyAgingReport from "../reports/PartyAgingReport.jsx";
import StockHubReport from "../reports/StockHubReport.jsx";
import SalesAnalyticsReport from "../reports/SalesAnalyticsReport.jsx";
import PurchaseAnalyticsReport from "../reports/PurchaseAnalyticsReport.jsx";
import SerialRegistryReport from "../reports/SerialRegistryReport.jsx";
import PriceListScreen from "../product-master/PriceListScreen.jsx";
import GlobalLedgerWindow from "../ledger/GlobalLedgerWindow.jsx";
import PurchaseDocsTab from "../purchase/PurchaseDocsTab.jsx";
import RemindersTab from "../reminders/RemindersTab.jsx";
import ReorderAlertCard from "../inventory/ReorderAlertCard";
import ReorderReport from "../reports/ReorderReport.jsx";
import OverdueRemindersScreen from "../share/OverdueRemindersScreen.jsx";
import ReturnsTab from "../returns/ReturnsTab.jsx";
import { SalesInvoiceTab } from "../sales-invoice/SalesInvoiceTab.jsx";
import SecurityChequeTab from "../securityCheque/SecurityChequeTab.jsx";
import { SettingsPage } from "../settings/SettingsPage.jsx";
import { ShopOrderScreen } from "../orders/ShopOrderScreen.jsx";
import ProductExchangeTab from "../returns/ProductExchangeTab.jsx";
import StockAdjustmentTab from "../returns/StockAdjustmentTab.jsx";
import StockConvertTab from "../returns/StockConvertTab.jsx";
import WarrantyClaimTab from "../returns/WarrantyClaimTab.jsx";
import TaxReport from "../reports/TaxReport.jsx";
import { UAE_BANKS } from "../cheque/chequeConfig.js";
import VendorMasterScreen from "../vendor-master/VendorMasterScreen.jsx";
import VouchersTab from "../vouchers/VouchersTab.jsx";
import { billLeaveGuard, nextPartyCode } from "../shared/appShared.jsx";
import { printPaymentVoucher } from "../sales-invoice/salesInvoiceShared.js";

export function renderTabContent({ OrderCard, addCo, addItToInvoice, addProduct, applyGroupToMember, branchTransferSettings, btInbox, calcMode, can, canManageProducts, canSeeProductCost, canStaffSupplierArea, canStaffVouchers, canUseBranchTransfer, cancelEdit, cancelEditOrder, chequeHandoverReq, chequePrefill, clearAllShopProducts, clearingProducts, closeTeamMember, cloudPullBusy, cloudUploadBusy, confirmPmDiscard, cos, createEmptyPmForm, createStaffMember, currentItem, customers, delCo, delIt, deleteInviteCode, deleteProduct, editId, editNm, editPh, editProduct, editingOrderId, empFocus, employeeAlertList, exportProductsCsv, exportWeighingBarcodeCsv, fetchProducts, filterOrders, filterOrdersByStatusPage, filteredProducts, finance, finishProductReplacement, generateNewCode, getFilteredProducts, globalFocusCustomerId, globalFocusVendorId, globalOpenPurchaseInvoiceId, globalOpenReturnInvoiceId, globalOpenWarrantyClaimId, globalOpenSalesInvoiceId, globalSearchCan, grnIncoming, groupByDay, hErr, handleEnterAdd, handleGlobalSearchNavigate, handleLogout, importProductRecords, inviteCodes, isDesktop, isOrderManager, isOwner, items, lang, lastCloudPullAt, loadPmForm, localShop, makeShopNo, mergeShopRecord, nameRef, newNm, newPh, note, openEmployeeAlert, orderModuleEnabled, orderSettingsSaving, orders, ownerLockedPanel, ownerUnlocked, partnerAlertList, patchProductInList, periodLock, piNewReq, piNewVendor, piVoucherReq, pinModal, pmCatFilter, pmEditId, pmForm, pmOverSales, pmPickForSales, pmReset, pmSearch, pmUpd, printProductBarcodes, productMaintenance, productReplacementActive, products, productsLoading, profile, purchaseSource, quoteToConvert, refreshSyncDashboard, reloadCustomersFromOffline, reloadVendorsFromOffline, removeBlankProducts, renderOrderPageTabs, resetStaffPassword, runCloudDownload, runCloudUpload, s, saveEdit, saveMemberDefaults, saveMemberPosition, saveOrderModuleEnabled, savePermissions, saveUserGroups, savingProduct, searchQ, securityChequeAlertList, securityChequeFocusParty, selectProductToOrder, sendOrder, setBranchTransferSettings, setSecurityChequeFocusParty, setCalcMode, setChequeHandoverReq, setChequePrefill, setCustomers, setEditNm, setEditPh, setEmpFocus, setGlobalFocusCustomerId, setGlobalFocusVendorId, setGlobalOpenPurchaseInvoiceId, setGlobalOpenReturnInvoiceId, setGlobalOpenWarrantyClaimId, setGlobalOpenSalesInvoiceId, setGrnIncoming, setLang, setLocalShop, setMenuOpen, setNewNm, setNewPh, setNote, setOwnerUnlocked, setPiNewReq, setPiNewVendor, setPiVoucherReq, setPinModal, setPmCatFilter, setPmEditId, setPmOverSales, setPmSearch, setPmShowAdd, setPrintSettingsOpen, setPurchaseSource, setQuoteToConvert, setSearchQ, setSettingsPage, setShowAdd, setSiNewCustomer, setSiNewReq, setSiVoucherReq, setStaffForm, setStaffPwReset, setTab, setTabState, setTheme, setVendors, setWaStyle, settingsPage, shopId, showAdd, siColorPrint, siNewCustomer, siNewReq, siShowCode, siVoucherReq, stPage, staffForm, staffPwReset, staffQuickNavKeys, staffSaving, startEdit, startProductEdit, syncDashboard, syncRefreshKey, syncState, t, tab, tabRef, team, teamEmployees, th, theme, toast, unread, updCurrentItem, user, userGroups, vendors, waStyle, windowWidth }) {
  // local numbers (05...) on WhatsApp get the shop's country code
  setShareCountryCode(countryCodeOf(localShop));
  const tabContent = (
    <>
      {pinModal&&isOwner&&(
        <OwnerPinModal lang={lang} uid={user.uid} localUserId={profile.localUserId} initialMode={pinModal}
          onUnlocked={()=>{ setOwnerUnlocked(true); setPinModal(null); toast(lang==="bn"?"খোলা হয়েছে":"Unlocked"); }}
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
          shopId={shopId}
        />
      )}
      {tab==="dashboard"&&(isOwner||can("viewProducts"))&&(
        <ReorderAlertCard
          products={products} shopId={shopId} lang={lang} s={s}
          wrapStyle={isDesktop?s.desktopPanel:s.panel}
          onOpenProducts={()=>setTab("products")}
          onOpenList={(isOwner||can("viewProducts")||can("stockAdjust"))?()=>setTab("reorderAlerts"):null}
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
            canDelete={isOwner||can("deleteProducts")}
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
            onPrintBarcodes={(isOwner||can("printProducts")) ? printProductBarcodes : undefined}
            notify={(message,kind)=>toast(message, kind==="err"?"err":"ok")}
            lang={lang}
          />
        </div>
      )}

      {orderModuleEnabled&&(isOwner||can("manageCompanies"))&&tab==="companies"&&(
  <CompaniesScreen {...{ addCo, cancelEdit, cos, delCo, editId, editNm, editPh, isDesktop, isOwner, lang, newNm, newPh, s, saveEdit, setEditNm, setEditPh, setNewNm, setNewPh, setShowAdd, setTab, showAdd, startEdit, t, th, vendors, canDelete: isOwner||can("deleteCompanies"), canPrint: isOwner||can("printCompanies"), shopName: localShop?.companyName||"" }} />
      )}

      {(isOwner||can("manageCustomers"))&&tab==="customers"&&(
        <CustomerMasterScreen
          t={t} lang={lang} cur={t.cur||"AED"}
          shopId={shopId} user={user}
          customers={customers} vendors={vendors} team={team} toast={toast}
          canEdit={isOwner||can("manageCustomers")} canDelete={isOwner||can("deleteCustomers")} canPrint={isOwner||can("printCustomers")} canSales={isOwner||can("manageSales")}
          shopName={localShop?.companyName||""}
          actorName={profile?.personName||""}
          leaveGuard={billLeaveGuard}
          focusPartyId={globalFocusCustomerId}
          onFocusPartyHandled={()=>setGlobalFocusCustomerId(null)}
          onPartySaved={(row)=>setCustomers((prev)=>mergePartyRow(prev, row, "customerName"))}
          onPartyRemoved={(id)=>setCustomers((prev)=>prev.filter((c)=>c.id!==id))}
          onVendorSaved={(row)=>setVendors((prev)=>mergePartyRow(prev, row, "vendorName"))}
          onVendorRemoved={(id)=>setVendors((prev)=>prev.filter((v)=>v.id!==id))}
          onClose={()=>setTab("dashboard")}
          nextCode={()=>nextPartyCode(shopId, "customers", customers)}
          nextVendorCode={()=>nextPartyCode(shopId, "vendors", vendors)}
          onGoToSales={(customer)=>{
            if (tabRef.current !== "sales" && billLeaveGuard.current && !billLeaveGuard.current.leave()) return;
            setTabState("sales");
            setSiNewCustomer(customer||null);
            setSiNewReq(Date.now());
          }}
          onGoToSecurityCheques={(isOwner||can("manageSecurityCheques")) ? (customer)=>{
            if (tabRef.current !== "securityCheque" && billLeaveGuard.current && !billLeaveGuard.current.leave()) return;
            setSecurityChequeFocusParty({ id: customer?.id||"", type: "customer" });
            setTabState("securityCheque");
          } : undefined}
          renderImport={(close)=>(
            <ExcelImportModal t={t} lang={lang} th={th} shopId={shopId} user={user}
              type="customer"columnMap={CM_IMPORT_COLUMNS} defaultFields={{ ...EMPTY_CUSTOMER, customerType:"Customer", status:"active", country:"UAE", paymentType:"cash" }}
              collection="customers"
              onClose={close}
              onImported={(n)=>{ close(); toast(` ${n} ${lang==="bn"?"জন কাস্টমার ইমপোর্ট হয়েছে":"customers imported!"}`); reloadCustomersFromOffline(); }} />
          )}
        />
      )}

      {(isOwner || can("viewVendors") || can("manageVendors"))&&tab==="vendors"&&(
        <VendorMasterScreen
          t={t} lang={lang} cur={t.cur||"AED"}
          shopId={shopId} user={user}
          vendors={vendors} customers={customers} toast={toast} canDelete={isOwner||can("deleteVendors")} canPrint={isOwner||can("printVendors")} canEdit={isOwner||can("manageVendors")}
          shopName={localShop?.companyName||""}
          leaveGuard={billLeaveGuard}
          focusPartyId={globalFocusVendorId}
          onFocusPartyHandled={()=>setGlobalFocusVendorId(null)}
          onPartySaved={(row)=>setVendors((prev)=>mergePartyRow(prev, row, "vendorName"))}
          onPartyRemoved={(id)=>setVendors((prev)=>prev.filter((v)=>v.id!==id))}
          onCustomerSaved={(row)=>setCustomers((prev)=>mergePartyRow(prev, row, "customerName"))}
          onCustomerRemoved={(id)=>setCustomers((prev)=>prev.filter((c)=>c.id!==id))}
          onClose={()=>setTab("dashboard")}
          nextCode={()=>nextPartyCode(shopId, "vendors", vendors)}
          nextCustomerCode={()=>nextPartyCode(shopId, "customers", customers)}
          canPurchase={isOwner||can("managePurchase")}
          actorName={profile?.personName||""}
          onGoToPurchase={(isOwner||can("managePurchase")) ? (vendor)=>{
            if (tabRef.current !== "purchase" && billLeaveGuard.current && !billLeaveGuard.current.leave()) return;
            setTabState("purchase");
            setPiNewVendor(vendor||null);
            setPiNewReq(Date.now());
          } : undefined}
          onGoToSecurityCheques={(isOwner||can("manageSecurityCheques")) ? (vendor)=>{
            if (tabRef.current !== "securityCheque" && billLeaveGuard.current && !billLeaveGuard.current.leave()) return;
            setSecurityChequeFocusParty({ id: vendor?.id||"", type: "vendor" });
            setTabState("securityCheque");
          } : undefined}
          renderImport={(close)=>(
            <ExcelImportModal t={t} lang={lang} th={th} shopId={shopId} user={user}
              type="vendor"columnMap={VM_IMPORT_COLUMNS} defaultFields={{ ...emptyVendor, status:"active", country:"UAE" }}
              collection="vendors"
              onClose={close}
              onImported={(n)=>{ close(); toast(` ${n} ${lang==="bn"?"জন ভেন্ডর ইমপোর্ট হয়েছে":"vendors imported!"}`); reloadVendorsFromOffline(); }} />
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
          onStartReturn={(isOwner||can("manageReturns")) ? (inv)=>{ setGlobalOpenReturnInvoiceId(inv.id); setTab("purchaseReturn"); } : undefined}
          onProductPatched={patchProductInList}
        />
      )}

      {(tab==="purchaseOrder"||tab==="goodsReceipt")&&(isOwner||can("managePurchase"))&&(
        <PurchaseDocsTab key={tab} kind={tab==="purchaseOrder"?"po":"grn"} lang={lang} shopId={shopId} user={user} profile={profile}
          isOwner={isOwner} canManage={isOwner||can("managePurchase")} canDelete={isOwner||can("deletePurchase")} canPrint={isOwner||can("printPurchase")||can("managePurchase")} products={products} vendors={vendors} toast={toast}
          wideDesktop={windowWidth >= 1100}
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
          openInvoiceId={globalOpenSalesInvoiceId}
          onOpenInvoiceHandled={()=>setGlobalOpenSalesInvoiceId(null)}
          onStartReturn={(isOwner||can("manageReturns")) ? (inv)=>{ setGlobalOpenReturnInvoiceId(inv.id); setTab("salesReturn"); } : undefined}
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
          onCustomerCreated={(created) => setCustomers((prev) => mergePartyRow(prev, created, "customerName"))}
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
          canPrint={isOwner||can("printPdc")} canDelete={isOwner||can("deletePdc")}
          onOpenVoucher={(isOwner||can("printPayments")) ? (raw)=>printPaymentVoucher(raw, localShop, lang) : undefined} />
      )}

      {tab==="securityCheque"&&(isOwner||can("manageSecurityCheques"))&&(
        <SecurityChequeTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner}
          canManage={isOwner||can("manageSecurityCheques")} canDelete={isOwner||can("deleteSecurityCheques")} canPrint={isOwner||can("printSecurityCheques")} cur={t.cur||"AED"} toast={toast}
          shopName={localShop?.companyName||""} shop={localShop} alerts={securityChequeAlertList}
          customers={customers} vendors={vendors}
          focusParty={securityChequeFocusParty} onFocusPartyHandled={()=>setSecurityChequeFocusParty(null)}
          leaveGuard={billLeaveGuard} />
      )}

      {(tab==="expenses"||tab==="employeeExpense")&&(isOwner||can("manageExpenses"))&&(
        <ExpensesTab key={tab} employeeMode={tab==="employeeExpense"} lang={lang} th={th} s={s} shopId={shopId} user={user} profile={profile} isOwner={isOwner}
          canDelete={isOwner||can("deleteExpenses")} canPrint={isOwner||can("printExpenses")}
          cur={t.cur||"AED"} isDesktop={isDesktop} toast={toast} shopName={localShop?.companyName||""} leaveGuard={billLeaveGuard} shop={localShop} />
      )}

      {tab==="employees"&&(isOwner||can("manageEmployees"))&&(
        <EmployeesTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner} canManage={isOwner||can("manageEmployees")}
          canDelete={isOwner||can("deleteEmployees")} canPrint={isOwner||can("printEmployees")}
          cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""} shop={localShop} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} leaveGuard={billLeaveGuard}
          alerts={employeeAlertList} focus={empFocus} onFocusHandled={()=>setEmpFocus(null)} onOpenAlert={openEmployeeAlert} />
      )}

      {tab==="jobCard"&&(isOwner||can("manageJobs"))&&(
        <JobCardTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner} canManage={isOwner||can("manageJobs")}
          canDelete={isOwner||can("deleteJobs")} canPrint={isOwner||can("printJobs")}
          cur={t.cur||"AED"} toast={toast} shop={localShop} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))}
          customers={customers} products={products} makeNo={makeShopNo} leaveGuard={billLeaveGuard}
          onMakeInvoice={(isOwner||can("manageSales")) ? (src)=>{ setQuoteToConvert(src); setTabState("sales"); } : undefined} />
      )}

      {tab==="bankRec"&&(isOwner||can("bankReconcile"))&&(
        <BankRecTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner} canManage={isOwner||can("bankReconcile")}
          canDelete={isOwner||can("deleteBankRec")} canPrint={isOwner||can("printBankRec")}
          cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""} />
      )}

      {tab==="attendance"&&(isOwner||can("manageEmployees"))&&(
        <AttendanceTab lang={lang} shopId={shopId} user={user} profile={profile} canManage={isOwner||can("manageEmployees")}
          cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""} leaveGuard={billLeaveGuard}
          isOwner={isOwner} shop={localShop} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} />
      )}

      {tab==="vouchers"&&(isOwner||canStaffVouchers)&&(
        <VouchersTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner}
          canJournal={isOwner||can("accountVouchers")} canDelete={isOwner||can("deleteVouchers")} canPrint={isOwner||can("printVouchers")} cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""}
          makeNo={makeShopNo} leaveGuard={billLeaveGuard} customers={customers} vendors={vendors} banks={UAE_BANKS.map(b=>b.name)} savedChart={localShop?.chartOfAccounts} savedGroups={localShop?.coaGroups}
          onOpenReceipts={(isOwner||can("manageSales")) ? ()=>{ setTab("sales"); setSiVoucherReq(Date.now()); } : undefined}
          onOpenPayments={canStaffSupplierArea&&(isOwner||can("vendorPayments")) ? ()=>{ setTab("purchase"); setPiVoucherReq(Date.now()); } : undefined}
          onOpenDebitNote={(isOwner||can("manageReturns")) ? ()=>setTab("purchaseReturn") : undefined}
          onOpenCreditNote={(isOwner||can("manageReturns")) ? ()=>setTab("salesReturn") : undefined}
          canSeeReceipts={isOwner||can("manageSales")} canSeePayments={isOwner||can("vendorPayments")} />
      )}

      {(tab==="salesReturn"||tab==="purchaseReturn")&&(isOwner||can("manageReturns"))&&(
        <ReturnsTab key={tab} kind={tab==="salesReturn"?"sales":"purchase"} lang={lang} th={th} shopId={shopId} user={user} profile={profile}
          isOwner={isOwner} canManage={isOwner||can("manageReturns")} canDelete={isOwner||can("deleteReturns")} canPrint={isOwner||can("printReturns")} cur={t.cur||"AED"} isDesktop={isDesktop} toast={toast}
          shopName={localShop?.companyName||""} shop={localShop} products={products} makeNo={makeShopNo} leaveGuard={billLeaveGuard}
          openInvoiceId={globalOpenReturnInvoiceId} onOpenInvoiceHandled={()=>setGlobalOpenReturnInvoiceId(null)} />
      )}

      {tab==="stockAdjust"&&(isOwner||can("stockAdjust"))&&(
        <StockAdjustmentTab lang={lang} th={th} shopId={shopId} user={user} profile={profile} products={products}
          isOwner={isOwner} canManage={isOwner||can("stockAdjust")} canDelete={isOwner||can("deleteStock")} canPrint={isOwner||can("printStock")} isDesktop={isDesktop} wideDesktop={windowWidth >= 1100} toast={toast}
          shopName={localShop?.companyName||""} makeNo={makeShopNo} leaveGuard={billLeaveGuard} />
      )}
      {tab==="reminders"&&(
        <RemindersTab lang={lang} shopId={shopId} user={user} profile={profile} isOwner={isOwner} team={team} toast={toast}
          onOpenLink={(linkType,linkId)=>{
            // documents open on their own tab; a payment reminder log (linkType "customer", accounts/overdueReminders.js) opens the Payment Reminders queue
            if (["sales","quotation","delivery","salesOrder"].includes(linkType)) { setTabState(linkType); setGlobalOpenSalesInvoiceId(linkId); }
            else if (linkType==="customer"&&(isOwner||can("manageCustomers")||can("manageSales"))) setTabState("overdueReminders");
            else toast?.(lang==="bn"?"এই লিংক খোলার অনুমতি নেই":"You do not have access to open this link","err");
          }} />
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
          isOwner={isOwner} canManage={isOwner||can("stockAdjust")} canDelete={isOwner||can("deleteStock")} canPrint={isOwner||can("printStock")} toast={toast}
          shopName={localShop?.companyName||""} makeNo={makeShopNo} leaveGuard={billLeaveGuard} />
      )}
      {tab==="productExchange"&&(isOwner||can("stockAdjust"))&&(
        <ProductExchangeTab lang={lang} shopId={shopId} user={user} profile={profile} products={products}
          isOwner={isOwner} canManage={isOwner||can("stockAdjust")} canDelete={isOwner||can("deleteStock")} canPrint={isOwner||can("printStock")} toast={toast}
          shopName={localShop?.companyName||""} makeNo={makeShopNo} leaveGuard={billLeaveGuard} />
      )}
      {tab==="warrantyClaim"&&(isOwner||can("stockAdjust")||can("manageReturns"))&&(
        <WarrantyClaimTab lang={lang} shopId={shopId} user={user} profile={profile} products={products}
          customers={customers} vendors={vendors} shop={localShop}
          isOwner={isOwner} canManage={isOwner||can("stockAdjust")||can("manageReturns")}
          canDelete={isOwner||can("deleteStock")} canPrint={isOwner||can("printStock")||can("printReturns")} toast={toast}
          shopName={localShop?.companyName||""} makeNo={makeShopNo} leaveGuard={billLeaveGuard}
          openClaimId={globalOpenWarrantyClaimId} onOpenClaimHandled={()=>setGlobalOpenWarrantyClaimId?.(null)} />
      )}

      {tab==="auditLog"&&(isOwner||can("viewAuditLog"))&&(
        <AuditLogTab lang={lang} th={th} shopId={shopId} cur={t.cur||"AED"} isDesktop={isDesktop} canPrint={isOwner||can("printAudit")} shopName={localShop?.companyName||""} />
      )}

      {tab==="globalLedger"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewGlobalLedger")))&&(
        <GlobalLedgerWindow embedded lang={lang} shopId={shopId} shopName={localShop?.companyName||""} cur={t.cur||"AED"} customers={customers} vendors={vendors} products={products} valuation={localShop?.stockValuationMethod==="fifo"?"fifo":"average"} canPrint={isOwner||can("printLedger")} chartOfAccounts={localShop?.chartOfAccounts} coaGroups={localShop?.coaGroups} />
      )}
      {tab==="globalLedger"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"গ্লোবাল লেজার লক করা":"Global Ledger is locked")}
      {tab==="mergeMasters"&&(isOwner||can("manageCustomers")||can("manageEmployees"))&&(
        <MastersHub lang={lang} shopId={shopId} shop={localShop} user={user} profile={profile} isOwner={isOwner} customers={customers} vendors={vendors} cur={t.cur||"AED"} toast={toast}
          onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} onPartiesChanged={(kind)=>{ if (kind==="vendor") reloadVendorsFromOffline(); else reloadCustomersFromOffline(); }} />
      )}
      {tab==="bulkMessage"&&(isOwner||can("manageCustomers")||can("manageSales"))&&(
        <BulkMessageScreen lang={lang} shopId={shopId} shop={localShop} isOwner={isOwner} canSeeDue={isOwner||can("viewCustomerBalance")} customers={customers}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} />
      )}
      {tab==="overdueReminders"&&(isOwner||can("manageCustomers")||can("manageSales"))&&(
        <OverdueRemindersScreen lang={lang} shopId={shopId} shop={localShop} user={user} profile={profile} isOwner={isOwner} customers={customers}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} />
      )}
      {tab==="counter"&&(isOwner||can("manageSales"))&&(
        <CounterHub lang={lang} shopId={shopId} shop={localShop} user={user} profile={profile} isOwner={isOwner} canSell={isOwner||can("manageSales")}
          canPrint={isOwner||can("printSales")||can("manageSales")} customers={customers} shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast}
          onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} onOpenCustomers={()=>setTab("customers")} />
      )}
      {tab==="chartOfAccounts"&&(isOwner||can("viewAccounts")||can("accountVouchers"))&&(
        <ChartOfAccountsScreen lang={lang} shopId={shopId} shop={localShop} isOwner={isOwner} customers={customers} vendors={vendors} banks={UAE_BANKS.map(b=>b.name)}
          shopName={localShop?.companyName||""} canPrint={isOwner||can("printLedger")||can("printAccounts")} toast={toast} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} />
      )}
      {tab==="accounts"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <ProfitLossReport lang={lang} th={th} s={s} shopId={shopId} shop={localShop} products={products}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} isDesktop={isDesktop} canPrint={isOwner||can("printAccounts")} />
      )}
      {tab==="accounts"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"হিসাব নিকাশ (Accounts) লক করা":"Accounts are locked")}
      {tab==="balanceSheet"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <BalanceSheetReport lang={lang} shopId={shopId} products={products} customers={customers} vendors={vendors} yearEnds={localShop?.yearEnds}
          shop={localShop} user={user} profile={profile} isOwner={isOwner} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} canPrint={isOwner||can("printAccounts")}
          fyStartMonth={Number(localShop?.fyStartMonth || localShop?.taxSettings?.fyStartMonth) || 1} />
      )}
      {tab==="balanceSheet"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"ব্যালেন্স শিট লক করা":"Balance Sheet is locked")}
      {tab==="booksHub"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <BooksHubReport lang={lang} shopId={shopId} shop={localShop} customers={customers} vendors={vendors} products={products}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} canPrint={isOwner||can("printAccounts")} />
      )}
      {tab==="booksHub"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"বুকস লক করা":"Books is locked")}
      {tab==="cashFlow"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <CashFlowReport lang={lang} shopId={shopId} shop={localShop} customers={customers} vendors={vendors}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} canPrint={isOwner||can("printAccounts")} />
      )}
      {tab==="cashFlow"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"ক্যাশ ফ্লো লক করা":"Cash Flow is locked")}
      {tab==="openingBalances"&&isOwner&&ownerUnlocked&&(
        <OpeningHub lang={lang} shopId={shopId} shop={localShop} user={user} profile={profile} isOwner={isOwner} customers={customers} vendors={vendors} cur={t.cur||"AED"} toast={toast}
          onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} onPartiesChanged={(kind)=>{ if (kind==="vendor") reloadVendorsFromOffline(); else reloadCustomersFromOffline(); }} />
      )}
      {tab==="openingBalances"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"শুরুর ব্যালেন্স লক করা":"Opening & Migration is locked")}
      {tab==="trialBalance"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <TrialBalanceReport lang={lang} shopId={shopId} shop={localShop} customers={customers} vendors={vendors} products={products} user={user} profile={profile} isOwner={isOwner}
          onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} canPrint={isOwner||can("printAccounts")}
          fyStartMonth={Number(localShop?.fyStartMonth || localShop?.taxSettings?.fyStartMonth) || 1}
          onOpenDoc={{
            can:(col)=>(col==="salesInvoices"&&(isOwner||can("manageSales")))||(col==="purchaseInvoices"&&(isOwner||can("managePurchase"))),
            open:(col,id)=>{ if(col==="salesInvoices"){ setGlobalOpenSalesInvoiceId(id); setTabState("sales"); } else if(col==="purchaseInvoices"){ setGlobalOpenPurchaseInvoiceId(id); setTabState("purchase"); } },
          }} />
      )}
      {tab==="trialBalance"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"ট্রায়াল ব্যালেন্স লক করা":"Trial Balance is locked")}
      {tab==="fundsSummary"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <FundsSummaryReport lang={lang} shopId={shopId} shop={localShop} products={products} customers={customers} vendors={vendors}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} canPrint={isOwner||can("printAccounts")} />
      )}
      {tab==="fundsSummary"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"ফান্ড / ওয়ার্কিং ক্যাপিটাল লক করা":"Funds / Working Capital is locked")}
      {tab==="ratioAnalysis"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <RatioAnalysisReport lang={lang} shopId={shopId} shop={localShop} products={products} customers={customers} vendors={vendors}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} canPrint={isOwner||can("printAccounts")} fyStartMonth={Number(localShop?.fyStartMonth || localShop?.taxSettings?.fyStartMonth) || 1} />
      )}
      {tab==="ratioAnalysis"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"অনুপাত বিশ্লেষণ লক করা":"Ratio Analysis is locked")}
      {tab==="costCentres"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <CostCentreReport lang={lang} shopId={shopId} shop={localShop} user={user} profile={profile} isOwner={isOwner} products={products}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} canPrint={isOwner||can("printAccounts")} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} />
      )}
      {tab==="costCentres"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"কস্ট সেন্টার লক করা":"Cost Centres is locked")}
      {tab==="budget"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <BudgetReport lang={lang} shopId={shopId} shop={localShop} user={user} profile={profile} isOwner={isOwner} products={products}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} canPrint={isOwner||can("printAccounts")} fyStartMonth={Number(localShop?.fyStartMonth || localShop?.taxSettings?.fyStartMonth) || 1}
          onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} />
      )}
      {tab==="budget"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"বাজেট লক করা":"Budget is locked")}
      {tab==="tallyExport"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <TallyExportReport lang={lang} shopId={shopId} shop={localShop} customers={customers} vendors={vendors} products={products} chartOfAccounts={localShop?.chartOfAccounts}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} canExport={isOwner||can("printAccounts")}
          fyStartMonth={Number(localShop?.fyStartMonth || localShop?.taxSettings?.fyStartMonth) || 1} />
      )}
      {tab==="tallyExport"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"হিসাব এক্সপোর্ট লক করা":"Accounting Export is locked")}
      {tab==="partyAging"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <PartyAgingReport lang={lang} shopId={shopId} customers={customers} vendors={vendors}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} canPrint={isOwner||can("printAccounts")} />
      )}
      {tab==="partyAging"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"এজিং রিপোর্ট লক করা":"Ageing report is locked")}
      {tab==="overdueInterest"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <OverdueInterestReport lang={lang} shopId={shopId} shop={localShop} user={user} profile={profile} isOwner={isOwner} customers={customers} vendors={vendors}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} canPrint={isOwner||can("printAccounts")} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} />
      )}
      {tab==="overdueInterest"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"বকেয়া বিলে সুদ লক করা":"Overdue Interest is locked")}
      {tab==="stockHub"&&(isOwner||can("stockAdjust"))&&(
        <StockHubReport lang={lang} shopId={shopId} products={products} shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast}
          canPrint={isOwner||can("printStock")} canSeeCost={isOwner||!!canSeeProductCost}
          shop={localShop} user={user} profile={profile} isOwner={isOwner} canMove={isOwner||can("stockAdjust")} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} />
      )}
      {tab==="reorderAlerts"&&((isOwner&&ownerUnlocked)||(!isOwner&&(can("viewProducts")||can("stockAdjust"))))&&(
        <ReorderReport lang={lang} shopId={shopId} products={products} shopName={localShop?.companyName||""} toast={toast} canPrint={isOwner||can("printStock")}
          onOpenProduct={(isOwner||can("viewProducts"))?(id)=>handleGlobalSearchNavigate({ kind:"product", id }):null} />
      )}
      {tab==="reorderAlerts"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"স্টক কম / রি-অর্ডার লক করা":"Low Stock / Reorder is locked")}
      {tab==="salesAnalytics"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <SalesAnalyticsReport lang={lang} shopId={shopId} products={products} shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast}
          canPrint={isOwner||can("printAccounts")} onOpenInvoice={(isOwner||can("manageSales")) ? (id)=>{ setGlobalOpenSalesInvoiceId(id); setTabState("sales"); } : undefined} />
      )}
      {tab==="salesAnalytics"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"সেলস অ্যানালিটিক্স লক করা":"Sales Analytics is locked")}
      {tab==="purchaseAnalytics"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewAccounts")))&&(
        <PurchaseAnalyticsReport lang={lang} shopId={shopId} products={products} shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast}
          canPrint={isOwner||can("printAccounts")} onOpenInvoice={(isOwner||can("managePurchase")) ? (id)=>{ setGlobalOpenPurchaseInvoiceId(id); setTabState("purchase"); } : undefined} />
      )}
      {tab==="purchaseAnalytics"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"পারচেজ অ্যানালিটিক্স লক করা":"Purchase Analytics is locked")}
      {tab==="serialRegistry"&&((isOwner&&ownerUnlocked)||(!isOwner&&(can("manageReturns")||can("stockAdjust"))))&&(
        <SerialRegistryReport lang={lang} shopId={shopId} shop={localShop} products={products} shopName={localShop?.companyName||""} toast={toast}
          isOwner={isOwner} user={user} profile={profile} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))}
          canPrint={isOwner||can("printReturns")||can("printStock")} includeJobs={isOwner||can("manageJobs")}
          onOpenDoc={{
            can:(col)=>(col==="salesInvoices"&&(isOwner||can("manageSales")))||(col==="purchaseInvoices"&&(isOwner||can("managePurchase")))||(col==="warrantyClaims"&&(isOwner||can("stockAdjust")||can("manageReturns"))),
            open:(col,id)=>{
              if(col==="salesInvoices"){ setGlobalOpenSalesInvoiceId(id); setTabState("sales"); }
              else if(col==="purchaseInvoices"){ setGlobalOpenPurchaseInvoiceId(id); setTabState("purchase"); }
              else if(col==="warrantyClaims"){ setGlobalOpenWarrantyClaimId?.(id); setTabState("warrantyClaim"); }
            },
          }} />
      )}
      {tab==="serialRegistry"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"সিরিয়াল / IMEI লক করা":"Serial / IMEI is locked")}
      {tab==="priceList"&&(isOwner||can("viewProducts"))&&(
        <PriceListScreen lang={lang} products={products} customers={(isOwner||can("manageCustomers")||can("manageSales"))?customers:[]}
          shopName={localShop?.companyName||""} cur={t.cur||"AED"} toast={toast} canPrint={isOwner||can("printProducts")} />
      )}
      {tab==="tax"&&((isOwner&&ownerUnlocked)||(!isOwner&&can("viewTax")))&&(
        <TaxReport lang={lang} shopId={shopId} shop={localShop} user={user} profile={profile} products={products} customers={customers} vendors={vendors}
          shopName={localShop?.companyName||""} toast={toast} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} canPrint={isOwner||can("printTax")}
          isOwner={isOwner} onOpenDoc={{
            can:(col)=>(col==="salesInvoices"&&(isOwner||can("manageSales")))||(col==="purchaseInvoices"&&(isOwner||can("managePurchase"))),
            open:(col,id)=>{ if(col==="salesInvoices"){ setGlobalOpenSalesInvoiceId(id); setTabState("sales"); } else { setGlobalOpenPurchaseInvoiceId(id); setTabState("purchase"); } },
          }} />
      )}
      {tab==="tax"&&isOwner&&!ownerUnlocked&&ownerLockedPanel(lang==="bn"?"ট্যাক্স / VAT লক করা":"Tax / VAT is locked")}
      {tab==="partners"&&((isOwner&&ownerUnlocked)||(!isOwner&&(can("viewPartners")||can("managePartners"))))&&(
        <PartnersTab lang={lang} shopId={shopId} user={user} profile={profile} cur={t.cur||"AED"} toast={toast} shopName={localShop?.companyName||""}
          shop={localShop} onShopUpdated={updated=>setLocalShop(prev=>mergeShopRecord(prev, updated))} products={products} alerts={partnerAlertList} isOwner={isOwner}
          canManage={isOwner||can("managePartners")} canDelete={isOwner||can("deletePartners")} canPrint={isOwner||can("printPartners")} />
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
