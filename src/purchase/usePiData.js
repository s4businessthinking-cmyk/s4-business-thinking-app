import { collection, onSnapshot, orderBy, query, where } from "../backend/firestore";
import { db } from "../firebase-config";
import { offlineCacheCloudRecords, offlineList } from "../offline/offlineRepository";
import { piEmptyCurrent, piEmptyForm } from "./purchaseShared.js";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { useEffect, useRef, useState } from "react";

export function usePiData({ authSyncReady, canManagePurchase, canVendorPayments, canViewSupplierLedger, piMobile, piRootRef, piView, piWin, setInvoices, setPiFitH, setPiLoading, shopId, syncRefreshKey }) {
  // On PC the screen fills exactly the space below the window title, so the page itself never scrolls.
  useEffect(() => {
    if (piMobile) { setPiFitH(null); return undefined; }
    const fit = () => {
      const el = piRootRef.current; if (!el) return;
      const top = el.getBoundingClientRect().top + (el.parentElement?.scrollTop || 0);
      setPiFitH(Math.max(420, Math.floor(window.innerHeight - top)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [piMobile, piView]);
  useEffect(() => { if (piView!=="form") piWin.restore(); }, [piView]); // eslint-disable-line react-hooks/exhaustive-deps
  const [piSubTab,setPiSubTab]     = useState(
    canManagePurchase ? "invoices" : (canViewSupplierLedger ? "ledger" : (canVendorPayments ? "payments" : "invoices"))
  ); // "invoices" | "ledger" | "payments"
  const [selInvoice,setSelInvoice] = useState(null);
  const [editInvoiceId,setEditInvoiceId] = useState(null);
  const piSnapRef = useRef(null);
  const [piLedgerHidden,setPiLedgerHidden] = useState(false);
  const [piNavReturn,setPiNavReturn] = useState(null); // null | "ledger"

  // ── Vendor Payment Voucher state (Cash/Cheque, partial payment against open invoices) ──
  const [payments,setPayments]         = useState([]);       // all vouchers for this shop (live)
  const [billReturns,setBillReturns]   = useState([]);
  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName:"purchaseReturns", shopId, onRows:(list)=>setBillReturns(list||[]) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId]);
  const [pmtLoading,setPmtLoading]     = useState(true);
  const [pmtView,setPmtView]           = useState("list");   // "list" | "new" | "detail"
  const [selVoucher,setSelVoucher]     = useState(null);
  const [pmtPrefillVendorId,setPmtPrefillVendorId] = useState(null);
  const [pmtPrefillInvoiceId,setPmtPrefillInvoiceId] = useState(null);
  const [pmtSaving,setPmtSaving]       = useState(false);
  const [chqWizard,setChqWizard]       = useState(null);     // null | { vendorId }
  const [chqHandover,setChqHandover]   = useState(null);     // voucher being documented
  const [chqHandoverSaving,setChqHandoverSaving] = useState(false);

  // ── Form state ──
  const [piInvoiceNo,setPiInvoiceNo] = useState("");
  const [piForm,setPiForm]           = useState(piEmptyForm());
  const [piLines,setPiLines]         = useState([]);
  const [piCurrent,setPiCurrent]     = useState(piEmptyCurrent());
  const [piEditLineId,setPiEditLineId] = useState(null);
  const [piSaving,setPiSaving]       = useState(false);
  const piSaveLockRef = useRef(false);
  const piNameRef = useRef(null);
  const piQtyRef = useRef(null);

  // ── Vendor search state (for purchase invoice form) ──
  const [vendorSearchQ,setVendorSearchQ]     = useState("");
  const [vendorDropOpen,setVendorDropOpen]   = useState(false);
  const vendorSearchRef = useRef(null);

  // Close vendor dropdown when clicking outside
  useEffect(()=>{
    const handler=(e)=>{
      if (vendorSearchRef.current && !vendorSearchRef.current.contains(e.target)){
        setVendorDropOpen(false);
      }
    };
    document.addEventListener("mousedown",handler);
    return ()=>document.removeEventListener("mousedown",handler);
  },[]);

  // ── Filter state ──
  const [piSearch,setPiSearch]       = useState("");
  const [piStatusF,setPiStatusF]     = useState("ALL");

  const allowedPiSubTabs = [
    ...(canManagePurchase ? ["invoices"] : []),
    ...(canViewSupplierLedger ? ["ledger"] : []),
    ...(canVendorPayments ? ["payments"] : []),
  ];

  useEffect(()=>{
    if (!allowedPiSubTabs.length) return;
    if (!allowedPiSubTabs.includes(piSubTab)) {
      setPiSubTab(allowedPiSubTabs[0]);
      setPmtView("list");
      setSelVoucher(null);
    }
  }, [piSubTab, canManagePurchase, canViewSupplierLedger, canVendorPayments]);

  // ── Local-first list, then Firebase; SQLite cache stays in background ──
  useEffect(()=>{
    if (!shopId) return;
    setPiLoading(true);
    let unsub1=()=>{};
    let unsub2=null;
    let cancelled=false;
    let cloudRowsLatest=null;

    const normalizePiInvoice = (d) => ({
      ...d.data(),
      id:d.id,
      createdAt:d.data().createdAt?.toDate?.() || d.data().createdAt || new Date().toISOString(),
    });

    const sortPiInvoices = (rows=[]) => [...rows].sort((a,b)=>
      new Date(b.createdAt||b.invoiceDate||0) - new Date(a.createdAt||a.invoiceDate||0)
    );

    const loadOfflinePiInvoices = async ({ cloudRows = null } = {}) => {
      const mergeSource = cloudRows ?? cloudRowsLatest;
      const res = await offlineList("purchaseInvoices");
      if (cancelled) return 0;
      const records = Array.isArray(res) ? res : (res.records || []);
      const localRows = records
        .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }))
        .filter(inv => inv.shopId === shopId);

      if (Array.isArray(mergeSource)) {
        const merged = new Map(mergeSource.map(inv => [String(inv.id), inv]));
        records
          .filter(r => Number(r?.dirty || 0) === 1)
          .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }))
          .filter(inv => inv.shopId === shopId)
          .forEach(inv => merged.set(String(inv.id), inv));
        const rows = sortPiInvoices([...merged.values()]);
        setInvoices(rows);
        return rows.length;
      }

      if (localRows.length) setInvoices(sortPiInvoices(localRows));
      return localRows.length;
    };

    loadOfflinePiInvoices()
      .then((count) => { if (!cancelled && count > 0) setPiLoading(false); })
      .catch(err => console.warn("[S4 Offline] purchaseInvoices offline load failed", err));

    const applyCloudRows = (rows) => {
      if (cancelled) return;
      cloudRowsLatest = rows;
      setPiLoading(false);
      loadOfflinePiInvoices({ cloudRows: rows }).catch(() => {
        if (!cancelled) setInvoices(sortPiInvoices(rows));
      });
      offlineCacheCloudRecords("purchaseInvoices", rows)
        .catch(err => console.warn("[S4 Offline] purchaseInvoices cache failed", err));
    };

    if (authSyncReady) {
      const q=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId),orderBy("createdAt","desc"));
      unsub1=onSnapshot(q,snap=>{
        applyCloudRows(snap.docs.map(normalizePiInvoice));
      },()=>{
        // Index নেই — orderBy ছাড়া fallback query, client-side sort
        const q2=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId));
        unsub2=onSnapshot(q2,snap=>{
          applyCloudRows(sortPiInvoices(snap.docs.map(normalizePiInvoice)));
        },err2=>{
          console.error(err2);
          loadOfflinePiInvoices().finally(()=>{ if (!cancelled) setPiLoading(false); });
        });
      });
    }
    return ()=>{ cancelled=true; unsub1(); unsub2&&unsub2(); };
  },[shopId,syncRefreshKey,authSyncReady]);
  return { billReturns, chqHandover, chqHandoverSaving, chqWizard, editInvoiceId, payments, piCurrent, piEditLineId, piForm, piInvoiceNo, piLedgerHidden, piLines, piNameRef, piNavReturn, piQtyRef, piSaveLockRef, piSaving, piSearch, piSnapRef, piStatusF, piSubTab, pmtLoading, pmtPrefillInvoiceId, pmtPrefillVendorId, pmtSaving, pmtView, selInvoice, selVoucher, setChqHandover, setChqHandoverSaving, setChqWizard, setEditInvoiceId, setPayments, setPiCurrent, setPiEditLineId, setPiForm, setPiInvoiceNo, setPiLedgerHidden, setPiLines, setPiNavReturn, setPiSaving, setPiSearch, setPiStatusF, setPiSubTab, setPmtLoading, setPmtPrefillInvoiceId, setPmtPrefillVendorId, setPmtSaving, setPmtView, setSelInvoice, setSelVoucher, setVendorDropOpen, setVendorSearchQ, vendorDropOpen, vendorSearchQ, vendorSearchRef };
}
