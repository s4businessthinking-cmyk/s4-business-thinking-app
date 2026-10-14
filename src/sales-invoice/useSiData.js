import { collection, onSnapshot, orderBy, query, where } from "../backend/firestore";
import { db } from "../firebase-config";
import { migrateLegacyDeliveryNotes, siEmptyForm } from "./siHelpers.js";
import { offlineCacheCloudRecords, offlineList } from "../offline/offlineRepository";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { useEffect, useRef, useState } from "react";

export function useSiData({ COL, authSyncReady, dnMigrateTick, invoices, isDN, isOwner, kind, setDnMigrateTick, setInvoices, setSiLoading, shopId, syncRefreshKey, user }) {
  const [selInv,setSelInv]         = useState(null);
  const [editInvId,setEditInvId]   = useState(null);
  const [siPrintModal,setSiPrintModal] = useState(null); // invoice to print after confirm
  const [siInvoiceNo,setSiInvoiceNo]= useState("");
  const [siForm,setSiForm]         = useState(siEmptyForm());
  const [siLines,setSiLines]       = useState([]);
  const [showCustPicker,setShowCustPicker]= useState(false);
  const siSnapRef = useRef(null);
  const siEmptyCurrent = () => ({ productId:null, name:"", code:"", brand:"", qty:"1", unit:"Pcs", unitPrice:"", discountPerc:"0", discountFlat:"", vatPerc:"5" });
  const [siCurrent,setSiCurrent]   = useState(siEmptyCurrent);
  const [siEditLineId,setSiEditLineId] = useState(null);
  const [siBatchAsk,setSiBatchAsk] = useState(null);
  const siNameRef = useRef(null);
  const siQtyRef = useRef(null);

  const [siSaving,setSiSaving]     = useState(false);
  const siSaveLockRef = useRef(false);
  const [siSearch,setSiSearch]     = useState("");
  const [siStatusF,setSiStatusF]   = useState("ALL");
  const [siViewAll,setSiViewAll]   = useState(isOwner);

  // Customer receipt vouchers (Receipts against Bill) — only the sales kind collects money.
  const [receipts,setReceipts]         = useState([]);
  const [billReturns,setBillReturns]   = useState([]);
  useEffect(() => {
    if (!shopId || kind!=="sales") return undefined;
    const unsub = subscribeShopCollection({ collectionName:"salesReturns", shopId, onRows:(list)=>setBillReturns(list||[]) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId, kind]);
  const siLoadedPaidRef = useRef(0);
  const [rcptSaving,setRcptSaving]     = useState(false);
  const [receiptWin,setReceiptWin]     = useState(null); // null | {} | { partyId, partyName, invoiceId } | { viewId }
  const [ledgerWin,setLedgerWin]       = useState(false);
  const [siNavReturn,setSiNavReturn]   = useState(null); // null | "ledger"

  useEffect(()=>{
    if (!shopId || kind!=="sales") return;
    let unsub1=()=>{};
    let unsub2=null;
    let cancelled=false;
    const normalize = (d) => ({ ...d.data(), id:d.id, createdAt:d.data().createdAt?.toDate?.()?.toISOString?.() || d.data().createdAt || new Date().toISOString() });
    const sortRows = (rows=[]) => [...rows].sort((a,b)=>new Date(b.createdAt||b.receiptDate||0)-new Date(a.createdAt||a.receiptDate||0));
    const applyRows = (rows) => {
      if (cancelled) return;
      setReceipts(sortRows(rows));
      offlineCacheCloudRecords("salesReceipts", rows).catch(err => console.warn("[S4 Offline] salesReceipts cache failed", err));
    };
    offlineList("salesReceipts").then(res => {
      if (cancelled) return;
      const rows = (Array.isArray(res) ? res : (res.records || [])).map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) })).filter(r => r.shopId===shopId);
      if (rows.length) setReceipts(sortRows(rows));
    }).catch(err => console.warn("[S4 Offline] salesReceipts offline load failed", err));
    if (authSyncReady) {
      const q=query(collection(db,"salesReceipts"),where("shopId","==",shopId),orderBy("createdAt","desc"));
      unsub1=onSnapshot(q, snap=>applyRows(snap.docs.map(normalize)), ()=>{
        const q2=query(collection(db,"salesReceipts"),where("shopId","==",shopId));
        unsub2=onSnapshot(q2, snap=>applyRows(snap.docs.map(normalize)), err=>console.error(err));
      });
    }
    return ()=>{ cancelled=true; unsub1(); unsub2&&unsub2(); };
  },[shopId, kind, authSyncReady, syncRefreshKey]);

  // Local-first list, then Firebase; SQLite cache stays in background
  useEffect(()=>{
    if (!shopId) return;
    setSiLoading(true);
    let u1=()=>{};
    let u2=null;
    let cancelled=false;
    let cloudRowsLatest=null;

    const normalizeSiInvoice = (d) => ({
      ...d.data(),
      id:d.id,
      createdAt:d.data().createdAt?.toDate?.() || d.data().createdAt || new Date().toISOString(),
    });

    const sortSiInvoices = (rows=[]) => [...rows].sort((a,b)=>
      new Date(b.createdAt||b.invoiceDate||0) - new Date(a.createdAt||a.invoiceDate||0)
    );

    const filterSiRows = (rows=[]) => rows.filter(inv =>
      inv.shopId === shopId && (isOwner || inv.createdBy === user.uid)
    );

    const loadOfflineSiInvoices = async ({ cloudRows = null } = {}) => {
      const mergeSource = cloudRows ?? cloudRowsLatest;
      const res = await offlineList(COL);
      if (cancelled) return 0;
      const records = Array.isArray(res) ? res : (res.records || []);
      const localRows = filterSiRows(records
        .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) })));

      if (Array.isArray(mergeSource)) {
        const merged = new Map(mergeSource.map(inv => [String(inv.id), inv]));
        records
          .filter(r => Number(r?.dirty || 0) === 1)
          .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }))
          .filter(inv => inv.shopId === shopId && (isOwner || inv.createdBy === user.uid))
          .forEach(inv => merged.set(String(inv.id), inv));
        const rows = sortSiInvoices(filterSiRows([...merged.values()]));
        setInvoices(rows);
        return rows.length;
      }

      if (localRows.length) setInvoices(sortSiInvoices(localRows));
      return localRows.length;
    };

    loadOfflineSiInvoices()
      .then((count) => { if (!cancelled && count > 0) setSiLoading(false); })
      .catch(err => console.warn("[S4 Offline] salesInvoices offline load failed", err));

    const applyCloudRows = (rows) => {
      if (cancelled) return;
      cloudRowsLatest = rows;
      setSiLoading(false);
      loadOfflineSiInvoices({ cloudRows: rows }).catch(() => {
        if (!cancelled) setInvoices(sortSiInvoices(filterSiRows(rows)));
      });
      offlineCacheCloudRecords(COL, rows)
        .catch(err => console.warn("[S4 Offline] salesInvoices cache failed", err));
    };

    if (authSyncReady) {
      const baseQ = isOwner
        ? query(collection(db,COL),where("shopId","==",shopId),orderBy("createdAt","desc"))
        : query(collection(db,COL),where("shopId","==",shopId),where("createdBy","==",user.uid),orderBy("createdAt","desc"));

      u1=onSnapshot(baseQ,snap=>{
        applyCloudRows(snap.docs.map(normalizeSiInvoice));
      },()=>{
        const fbQ=isOwner
          ? query(collection(db,COL),where("shopId","==",shopId))
          : query(collection(db,COL),where("shopId","==",shopId),where("createdBy","==",user.uid));
        u2=onSnapshot(fbQ,snap=>{
          applyCloudRows(sortSiInvoices(snap.docs.map(normalizeSiInvoice)));
        },err=>{
          console.error(err);
          loadOfflineSiInvoices().finally(()=>{ if (!cancelled) setSiLoading(false); });
        });
      });
    }
    return ()=>{ cancelled=true; u1(); u2&&u2(); };
  },[shopId,isOwner,user.uid,syncRefreshKey,authSyncReady,COL,dnMigrateTick]);

  useEffect(()=>{
    if (kind!=="sales" || !invoices.some(inv=>inv.invoiceType==="delivery")) return;
    migrateLegacyDeliveryNotes(invoices).then(moved=>{
      if (moved.length) setInvoices(prev=>prev.filter(inv=>!moved.includes(inv.id)));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[invoices]);

  useEffect(()=>{
    if (!isDN || !shopId) return;
    let cancelled=false;
    offlineList("salesInvoices").then(res=>{
      const records = Array.isArray(res) ? res : (res.records || []);
      const rows = records.map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) })).filter(r => r.shopId===shopId);
      return migrateLegacyDeliveryNotes(rows);
    }).then(moved=>{ if (!cancelled && moved?.length) setDnMigrateTick(n=>n+1); })
      .catch(err=>console.warn("[S4 DN] legacy delivery note scan failed", err));
    return ()=>{ cancelled=true; };
  },[isDN, shopId]);
  return { billReturns, editInvId, ledgerWin, rcptSaving, receiptWin, receipts, selInv, setEditInvId, setLedgerWin, setRcptSaving, setReceiptWin, setReceipts, setSelInv, setShowCustPicker, setSiBatchAsk, setSiCurrent, setSiEditLineId, setSiForm, setSiInvoiceNo, setSiLines, setSiNavReturn, setSiPrintModal, setSiSaving, setSiSearch, setSiStatusF, showCustPicker, siBatchAsk, siCurrent, siEditLineId, siEmptyCurrent, siForm, siInvoiceNo, siLines, siLoadedPaidRef, siNameRef, siNavReturn, siPrintModal, siQtyRef, siSaveLockRef, siSaving, siSearch, siSnapRef, siStatusF };
}
