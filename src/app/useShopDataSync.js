import { DEFAULT_PERMISSIONS } from "../shared/appShared.jsx";
import { SHOP_PULL_COLLECTIONS, getCloudSyncBlockReason, getShopCloudPulledAt, shouldAutoPullShop } from "../offline/cloudPullService";
import { assembleShopTeam, backfillLegacyTeamMembers, backfillShopStaffCloudRecords, listShopTeamMembers } from "../auth/userManagementService";
import { auth, db } from "../firebase-config";
import { backfillPartyCodes } from "./mainAppHelpers.js";
import { collection, doc, onSnapshot, orderBy, query, where } from "../backend/firestore";
import { loadShopRecord } from "../offline/shopService";
import { offlineCacheCloudRecords, offlineList } from "../offline/offlineRepository";
import { onAuthStateChanged } from "../backend/auth";
import { startAutoBackup } from "../backup/backupService.js";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { useChequeDueNotifications } from "../dashboard/chequeNotifications.js";
import { useEffect, useRef, useState } from "react";
import { useEmployeeAlerts } from "../employees/useEmployeeAlerts.js";
import { usePartnerAlerts } from "../partners/usePartnerAlerts.js";
import { useReminderAlerts } from "../reminders/useReminderAlerts.js";
import { useShopFinance } from "../dashboard/shopFinance.js";

export function useShopDataSync({ applyShopRecord, authSyncReady, can, customers, inviteCodes, isOrderManager, isOwner, lang, localShop, mergeVisibleOrders, refreshLicenseAccess, refreshSyncDashboard, runCloudDownload, setCos, setCustomers, setInviteCodes, setLastCloudPullAt, setSettingsPage, setSyncRefreshKey, setSyncState, setTab, setTeam, setVendors, settingsPage, shopId, shopProp, syncState, t, team, toast, user, vendors }) {
  useEffect(() => {
    refreshLicenseAccess();
  }, []);

  useEffect(() => {
    if (!shopId) {
      setSyncState("offline");
      return;
    }

    setLastCloudPullAt(getShopCloudPulledAt(shopId));
    refreshSyncDashboard();

    const handleConnectivity = () => {
      refreshSyncDashboard();
      if (typeof navigator !== "undefined" && navigator.onLine && !getCloudSyncBlockReason()) {
        window.S4Offline?.syncNow?.().catch((err) =>
          console.warn("[S4 Sync] auto upload on reconnect failed", err)
        );
      }
    };

    window.addEventListener("online", handleConnectivity);
    window.addEventListener("offline", handleConnectivity);
    return () => {
      window.removeEventListener("online", handleConnectivity);
      window.removeEventListener("offline", handleConnectivity);
    };
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;

    const runAutoUpload = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (getCloudSyncBlockReason()) return;
      window.S4Offline?.syncNow?.().catch((err) =>
        console.warn("[S4 Sync] periodic auto upload failed", err)
      );
    };

    runAutoUpload();
    const timer = window.setInterval(runAutoUpload, 15000);

    return () => window.clearInterval(timer);
  }, [shopId, user?.uid]);

  // Cold-start / catch-up pull only. Continuous freshness is now handled by the
  // real-time onSnapshot listeners above and the background collection sync
  // below — this just covers a brand-new install (empty local catalog) or a
  // very stale local cache, and re-runs once when a genuine Firebase Auth
  // session becomes available (it can't do anything useful before that).
  // Manual "Cloud Download" in Settings > Sync (runCloudDownload) remains the
  // user-triggered fallback for a full re-pull at any time.
  useEffect(() => {
    if (!shopId || !authSyncReady) return;
    let cancelled = false;

    const tryAutoPull = async ({ force = false } = {}) => {
      try {
        const forceKey = `s4-force-cloud-pull:${shopId}`;
        const forced =
          force ||
          (typeof sessionStorage !== "undefined" && sessionStorage.getItem(forceKey) === "1");
        if (!forced && !(await shouldAutoPullShop(shopId))) return;
        if (forced && typeof sessionStorage !== "undefined") {
          try { sessionStorage.removeItem(forceKey); } catch {}
        }
        const result = await runCloudDownload({ silent: !forced });
        if (!cancelled && result?.ok && !forced) {
          toast(t.syncAutoPullOk);
        }
      } catch (error) {
        console.warn("[S4 Sync] auto cloud pull failed", error);
      }
    };

    tryAutoPull({ force: false });

    return () => {
      cancelled = true;
    };
  }, [shopId, isOwner, isOrderManager, user?.uid, authSyncReady]);

  const finance = useShopFinance(shopId, { enabled: isOwner, live: !!authSyncReady });
  useChequeDueNotifications({
    shopId, enabled: isOwner, cheques: finance.dueCheques, upcoming: finance.upcomingCheques, pending: finance.pendingCheques, today: finance.today,
    lang, toast, cur: t.cur || "AED", onOpen: () => setTab("dashboard"),
  });
  const [empFocus, setEmpFocus] = useState(null);
  const employeeAlertList = useEmployeeAlerts({
    shopId, enabled: isOwner || can("manageEmployees"), shopCountry: localShop?.country || "",
    lang, toast, cur: t.cur || "AED", onOpen: () => { setSettingsPage(null); setTab("employees"); },
  });
  const partnerAlertList = usePartnerAlerts({
    shopId, enabled: isOwner, shop: localShop, lang, toast, cur: t.cur || "AED", onOpen: () => { setSettingsPage(null); setTab("partners"); },
  });
  const reminderAlertList = useReminderAlerts({
    shopId, uid: user?.uid, isOwner, lang, toast, onOpen: () => { setSettingsPage(null); setTab("reminders"); },
  });
  const [calcMode, setCalcMode] = useState(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "F12" || (!e.ctrlKey && !e.shiftKey)) return;
      e.preventDefault();
      const want = e.shiftKey ? "fx" : "calc";
      setCalcMode((m) => (m === want ? null : want));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const openEmployeeAlert = (a) => {
    setSettingsPage(null);
    if (a.kind === "attendance") { setTab("attendance"); return; }
    if ((a.kind === "salaryDue" || a.kind === "salarySoon") && (isOwner || can("manageExpenses"))) { setTab("employeeExpense"); return; }
    if (a.employeeId) setEmpFocus({ id: a.employeeId, section: a.section || "basic", at: Date.now() });
    setTab("employees");
  };

  useEffect(() => {
    if (!shopId || !isOwner || !authSyncReady) return;
    return startAutoBackup(shopId, {
      onReminder: () => toast(lang==="bn"
        ? "💾 অনেকদিন ব্যাকআপ নেওয়া হয়নি — সেটিংস › ব্যাকআপ ও রিস্টোর থেকে Google Drive-এ ব্যাকআপ নিন"
        : "💾 No recent backup — go to Settings › Backup & restore to save one to Google Drive"),
    });
  }, [shopId, isOwner, authSyncReady]);

  // ── Background real-time sync for collections that don't have their own
  // always-mounted listener above (purchaseInvoices/purchasePayments/
  // salesInvoices already get true real-time UI updates from their own tab
  // components while that tab is open; this keeps their local SQLite cache
  // live even while the user is on a different tab, so switching to that tab
  // — or working fully offline — never shows minutes-old data). Gated on
  // genuine Firebase auth + auto-retry with backoff via subscribeShopCollection. ──
  useEffect(() => {
    if (!shopId) return;

    const backgroundCollections = SHOP_PULL_COLLECTIONS.filter(
      (name) => !["products", "companies", "customers", "vendors", "orders", "users"].includes(name)
    );

    const unsubscribers = backgroundCollections.map((collectionName) =>
      subscribeShopCollection({
        collectionName,
        shopId,
        onRows: () => {}, // cache-only: no MainApp-level UI state for these
        onStatus: ({ state }) => {
          if (state === "connected") {
            setLastCloudPullAt(new Date().toISOString());
          }
        },
      })
    );

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [shopId]);

  useEffect(() => {
    if (!auth || !shopId) return;

    return onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) return;
      setSyncRefreshKey((value) => value + 1);
      if (typeof navigator !== "undefined" && navigator.onLine) {
        window.S4Offline?.syncNow?.().catch((err) =>
          console.warn("[S4 Sync] auth restore upload failed", err)
        );
        const forceKey = `s4-force-cloud-pull:${shopId}`;
        const forced = typeof sessionStorage !== "undefined" && sessionStorage.getItem(forceKey) === "1";
        (forced ? Promise.resolve(true) : shouldAutoPullShop(shopId)).then((shouldPull) => {
          if (!shouldPull) return null;
          if (forced && typeof sessionStorage !== "undefined") {
            try { sessionStorage.removeItem(forceKey); } catch {}
          }
          return runCloudDownload({ silent: !forced });
        }).catch((err) => console.warn("[S4 Sync] auth restore cloud pull failed", err));
      }
    });
  }, [shopId]);

  useEffect(() => {
    if (settingsPage !== "sync") return;
    refreshSyncDashboard();
  }, [settingsPage]);

  useEffect(() => {
    if (settingsPage !== "team" || !isOwner || !shopId || !team.length) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    let cancelled = false;

    (async () => {
      try {
        const result = await backfillShopStaffCloudRecords(shopId, team);
        if (!cancelled && result?.updated > 0) {
          rebuildTeam();
        }
      } catch (error) {
        console.warn("[S4 Team] staff cloud backfill on team page failed", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [settingsPage, isOwner, shopId]);

  const [showChequePrinter,setShowChequePrinter]=useState(false);
  useEffect(() => {
    if (shopProp) applyShopRecord(shopProp);
  }, [shopProp]);

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;

    (async () => {
      try {
        const local = await loadShopRecord(shopId);
        if (!cancelled && local) applyShopRecord(local);
      } catch (err) {
        console.warn("[S4 Shop] local load failed", err);
      }
    })();

    let unsub = () => {};
    if (authSyncReady) {
      unsub = onSnapshot(
        doc(db, "shops", shopId),
        (snap) => {
          if (!snap.exists()) return;
          const data = { id: snap.id, ...snap.data() };
          applyShopRecord(data, { cache: true });
        },
        (err) => console.warn("[S4 Shop] online listener failed", err)
      );
    }

    return () => {
      cancelled = true;
      unsub();
    };
  }, [shopId, authSyncReady]);

  // ── Orders real-time listener with offline cache fallback ──
  useEffect(() => {
    if (!shopId) return;

    const applyOrderRecords = (incoming) => {
      mergeVisibleOrders(incoming);
    };

    const loadLocalOrders = async () => {
      try {
        const local = await offlineList("orders");

        let docs = local.records
          .map(r => ({ id: r.document_id, ...(r.data || {}) }))
          .filter(o => o.shopId === shopId);

        if (!isOwner && !isOrderManager) {
          docs = docs.filter(o => o.createdBy === user.uid);
        }

        applyOrderRecords(docs);
        setSyncState("offline");
      } catch (err) {
        console.error("orders offline fallback:", err);
        setSyncState("offline");
      }
    };

    const applyDocs = (snap) => {
      if (snap.metadata?.fromCache && snap.empty) {
        loadLocalOrders();
        return;
      }

      const docs = snap.docs.map(d => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
        };
      });

      applyOrderRecords(docs);
      offlineCacheCloudRecords("orders", docs).catch(err => console.warn("[S4 Offline] order cache failed", err));
      setSyncState("connected");
    };

    let unsub = () => {};
    if (authSyncReady) {
      const q = (isOwner||isOrderManager)
        ? query(collection(db,"orders"), where("shopId","==",shopId), orderBy("createdAt","desc"))
        : query(collection(db,"orders"), where("shopId","==",shopId), where("createdBy","==",user.uid), orderBy("createdAt","desc"));

      unsub = onSnapshot(
        q,
        applyDocs,
        err => {
          console.error("orders listener:", err);
          loadLocalOrders();
        }
      );
    }

    loadLocalOrders();

    return () => unsub();
  },[shopId,isOwner,isOrderManager,user?.uid,authSyncReady]);

  // ── Companies real-time listener with offline fallback ──
  useEffect(() => {
    if (!shopId) return;

    const loadLocalCompanies = async () => {
      try {
        const local = await offlineList("companies");
        const docs = local.records
          .map(r => ({ id: r.document_id, ...(r.data || {}) }))
          .filter(c => c.shopId === shopId)
          .sort((a,b)=>(a.name||"").localeCompare(b.name||""));

        setCos(docs);
        setSyncState("offline");
      } catch (err) {
        console.error("companies offline fallback:", err);
      }
    };

    const applyDocs = (snap) => {
      if (snap.metadata?.fromCache && snap.empty) {
        loadLocalCompanies();
        return;
      }

      const docs = snap.docs
        .map(d=>({...d.data(),id:d.id}))
        .sort((a,b)=>(a.name||"").localeCompare(b.name||""));

      setCos(docs);
      offlineCacheCloudRecords("companies", docs).catch(err => console.warn("[S4 Offline] company cache failed", err));
      setSyncState("connected");
    };

    let unsub = () => {};
    if (authSyncReady) {
      unsub = onSnapshot(
        query(collection(db,"companies"), where("shopId","==",shopId), orderBy("name")),
        applyDocs,
        (err) => {
          console.error("companies listener:", err);
          loadLocalCompanies();
        }
      );
    }

    loadLocalCompanies();

    return () => unsub();
  },[shopId,authSyncReady]);
  
  // ── Vendors real-time listener with offline fallback ──
  useEffect(() => {
    if (!shopId) return;

    const loadLocalVendors = async () => {
      try {
        const local = await offlineList("vendors");
        const docs = local.records
          .map(r => ({ id: r.document_id, ...(r.data || {}) }))
          .filter(v => v.shopId === shopId)
          .sort((a,b)=>(a.vendorName||"").localeCompare(b.vendorName||""));

        setVendors(docs);
        setSyncState("offline");
      } catch (err) {
        console.error("vendors offline fallback:", err);
      }
    };

    const applyDocs = (snap) => {
      if (snap.metadata?.fromCache && snap.empty) {
        loadLocalVendors();
        return;
      }

      const docs = snap.docs
        .map(d => ({ id:d.id, ...d.data() }))
        .sort((a,b)=>(a.vendorName||"").localeCompare(b.vendorName||""));

      setVendors(docs);
      offlineCacheCloudRecords("vendors", docs).catch(err => console.warn("[S4 Offline] vendor cache failed", err));
      setSyncState("connected");
    };

    let unsub1 = () => {};
    let unsub2 = null;

    if (authSyncReady) {
      unsub1 = onSnapshot(
        query(collection(db,"vendors"), where("shopId","==",shopId), orderBy("vendorName")),
        applyDocs,
        () => {
          unsub2 = onSnapshot(
            query(collection(db,"vendors"), where("shopId","==",shopId)),
            applyDocs,
            (err) => {
              console.error("vendors listener error:", err);
              loadLocalVendors();
            }
          );
        }
      );
    }

    loadLocalVendors();

    return () => { unsub1(); unsub2 && unsub2(); };
  }, [shopId, authSyncReady]);

  // ── Customers real-time listener with offline fallback ──
  useEffect(() => {
    if (!shopId) return;

    const loadLocalCustomers = async () => {
      try {
        const local = await offlineList("customers");
        const docs = local.records
          .map(r => ({ id: r.document_id, ...(r.data || {}) }))
          .filter(c => c.shopId === shopId)
          .sort((a,b)=>(a.customerName||"").localeCompare(b.customerName||""));

        setCustomers(docs);
        setSyncState("offline");
      } catch (err) {
        console.error("customers offline fallback:", err);
      }
    };

    const applyDocs = (snap) => {
      if (snap.metadata?.fromCache && snap.empty) {
        loadLocalCustomers();
        return;
      }

      const docs = snap.docs
        .map(d=>({ id:d.id, ...d.data() }))
        .sort((a,b)=>(a.customerName||"").localeCompare(b.customerName||""));

      setCustomers(docs);
      offlineCacheCloudRecords("customers", docs).catch(err => console.warn("[S4 Offline] customer cache failed", err));
      setSyncState("connected");
    };

    let unsub1 = () => {};
    let unsub2 = null;

    if (authSyncReady) {
      unsub1 = onSnapshot(
        query(collection(db,"customers"), where("shopId","==",shopId), orderBy("customerName")),
        applyDocs,
        () => {
          unsub2 = onSnapshot(
            query(collection(db,"customers"), where("shopId","==",shopId)),
            applyDocs,
            (err) => {
              console.error("customers listener:", err);
              loadLocalCustomers();
            }
          );
        }
      );
    }

    loadLocalCustomers();

    return () => { unsub1(); unsub2 && unsub2(); };
  }, [shopId, authSyncReady]);

  // Owner, online: give vendors/customers without a code (old, quick-added, imported, offline) a shop code.
  const partyCodeBusy = useRef({});
  useEffect(() => {
    if (!isOwner || !shopId || !authSyncReady || syncState !== "connected") return;
    const timer = setTimeout(() => {
      [["vendors", vendors], ["customers", customers]].forEach(([kind, list]) => {
        if (partyCodeBusy.current[kind] || !list.length) return;
        partyCodeBusy.current[kind] = true;
        backfillPartyCodes(shopId, kind, list)
          .catch(err => console.warn(`[S4] ${kind} code backfill failed`, err))
          .finally(() => { partyCodeBusy.current[kind] = false; });
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, [isOwner, shopId, authSyncReady, syncState, vendors, customers]);

  const cloudTeamRef = useRef([]);
  const inviteCodesRef = useRef([]);
  const teamPermissionOverridesRef = useRef({});

  const rebuildTeam = async () => {
    if (!shopId) return;
    try {
      if (isOwner && inviteCodesRef.current.length) {
        await backfillLegacyTeamMembers({
          cloudUsers: cloudTeamRef.current,
          usedInvites: inviteCodesRef.current,
          shopId,
        });
      }

      const localTeam = await listShopTeamMembers(shopId);
      let nextTeam = assembleShopTeam({
        cloudUsers: cloudTeamRef.current,
        localTeam,
        usedInvites: inviteCodesRef.current,
      });

      const overrides = teamPermissionOverridesRef.current;
      nextTeam = nextTeam.map((member) => {
        const memberId = member.uid || member.id;
        const override = overrides[memberId];
        if (!override) return member;

        const mergedCloud = { ...DEFAULT_PERMISSIONS, ...(member.permissions || {}) };
        const mergedOverride = { ...DEFAULT_PERMISSIONS, ...override };
        if (JSON.stringify(mergedCloud) === JSON.stringify(mergedOverride)) {
          delete overrides[memberId];
          return member;
        }

        return { ...member, permissions: override };
      });

      setTeam(nextTeam);
    } catch (err) {
      console.error("[S4 Team] rebuild failed", err);
    }
  };

  useEffect(() => {
    inviteCodesRef.current = inviteCodes;
    rebuildTeam();
  }, [inviteCodes, shopId]);

  useEffect(() => {
    if (!shopId) return;

    rebuildTeam();

    if (!authSyncReady) return undefined;

    return onSnapshot(
      query(collection(db,"users"), where("shopId","==",shopId)),
      (snap) => {
        cloudTeamRef.current = snap.docs.map((d) => ({
          ...d.data(),
          id: d.id,
          uid: d.data().uid || d.id,
        }));
        rebuildTeam();
      },
      (err) => {
        console.error(err);
        rebuildTeam();
      }
    );
  },[shopId, authSyncReady]);

  // ── Invite codes listener (owner only) ──
  useEffect(() => {
    if (!isOwner || !authSyncReady) return undefined;
    return onSnapshot(
      query(collection(db,"inviteCodes"), where("shopId","==",shopId)),
      snap => setInviteCodes(snap.docs.map(d=>({...d.data(), code:d.id}))),
      err  => console.error(err)
    );
  },[shopId, isOwner, authSyncReady]);

  // ── Products — realtime listener with offline cache fallback ──
  const [productsLoading,setProductsLoading]=useState(false);
  const [productMaintenance,setProductMaintenance]=useState({ active:false, catalogEpoch:0 });
  const [productReplacementActive,setProductReplacementActive]=useState(false);
  const productMaintenanceRef=useRef({ active:false, catalogEpoch:0 });
  const productMaintenanceId=shopId;

  useEffect(() => {
    if (!shopId || !db || !authSyncReady) return undefined;
    return onSnapshot(
      doc(db, "productMaintenance", productMaintenanceId),
      (snap) => {
        const next = snap.exists()
          ? { active:!!snap.data().active, catalogEpoch:Number(snap.data().catalogEpoch)||0, ...snap.data() }
          : { active:false, catalogEpoch:0 };
        productMaintenanceRef.current = next;
        setProductMaintenance(next);
        if (next.active) window.S4Offline?.pauseCollectionSync?.("products");
        else if (!productReplacementActive) window.S4Offline?.resumeCollectionSync?.("products");
      },
      (err) => console.warn("[Product Master] maintenance lock listener failed", err)
    );
  }, [shopId, productMaintenanceId, productReplacementActive, authSyncReady]);
  return { calcMode, empFocus, employeeAlertList, finance, openEmployeeAlert, partnerAlertList, productMaintenance, productMaintenanceId, productMaintenanceRef, productReplacementActive, productsLoading, rebuildTeam, reminderAlertList, setCalcMode, setEmpFocus, setProductMaintenance, setProductReplacementActive, setProductsLoading, teamPermissionOverridesRef };
}
