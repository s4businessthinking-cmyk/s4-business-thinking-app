import { useEffect, useMemo, useState } from "react";
import {
  BRANCH_TRANSFER_COLLECTIONS,
  createPeerStockRequest,
  listShopRecords,
  loadBranchTransferSettings,
} from "./branchTransferService.js";
import { crossBranchQtyRows, loadCrossBranchStock, resolveHomeShopId } from "./crossBranchStock.js";
import { numberValue } from "./branchTransferDomain.js";
import { actorFrom, fq, normalizeError } from "./btShared.jsx";

export function SiBranchStockRequest({
  lang,
  shop,
  shopId,
  user,
  profile,
  team = [],
  product,
  toast,
  onClose,
  onCreated,
}) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const homeShopId = resolveHomeShopId(shop) || shopId;
  const [branches, setBranches] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [crossRows, setCrossRows] = useState([]);
  const [destBranchId, setDestBranchId] = useState("");
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);

  const actor = useMemo(() => actorFrom(user, profile), [user, profile]);
  const activeBranches = branches.filter((b) => b.active !== false);
  const qtyRows = useMemo(
    () => (product?.id ? crossBranchQtyRows(crossRows, product.id) : []),
    [crossRows, product?.id]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadBranchTransferSettings(homeShopId),
      listShopRecords(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, homeShopId),
    ])
      .then(([settings, rows]) => {
        if (cancelled) return;
        setEnabled(settings?.enabled === true && settings?.companyFilePerBranch !== false);
        setBranches(rows || []);
      })
      .catch(console.warn);
    return () => { cancelled = true; };
  }, [homeShopId]);

  useEffect(() => {
    if (!enabled || !homeShopId || !product?.id) return undefined;
    let cancelled = false;
    loadCrossBranchStock({ homeShopId, branches: activeBranches })
      .then((rows) => { if (!cancelled) setCrossRows(rows); })
      .catch(() => { if (!cancelled) setCrossRows([]); });
    return () => { cancelled = true; };
  }, [enabled, homeShopId, activeBranches, product?.id]);

  const submit = async () => {
    if (busy || !product?.id) return;
    const destinationBranch = activeBranches.find((b) => b.id === destBranchId);
    const sourceBranch = activeBranches.find((b) => b.id === sourceBranchId);
    if (!destinationBranch || !sourceBranch) {
      toast(L("উৎস ও আপনার শাখা বেছে নিন", "Pick source and your branch"), "err");
      return;
    }
    if (sourceBranch.id === destinationBranch.id) {
      toast(L("দুই শাখা আলাদা হতে হবে", "Branches must differ"), "err");
      return;
    }
    const want = numberValue(qty);
    if (want <= 0) {
      toast(L("পরিমাণ দিন", "Enter quantity"), "err");
      return;
    }
    const salesman = team.find((m) => {
      const ids = [m?.uid, m?.firebaseUid, m?.id, m?.localUserId].filter(Boolean).map(String);
      return ids.includes(String(destinationBranch.receiverUserId || "")) || ids.includes(String(destinationBranch.receiverLocalUserId || ""));
    }) || team.find((m) => m?.role !== "owner" && m?.status !== "disabled");
    if (!salesman) {
      toast(L("Receiver salesman খুঁজে পাওয়া যায়নি", "No receiver salesman found"), "err");
      return;
    }
    setBusy(true);
    try {
      const transfer = await createPeerStockRequest({
        shopId: homeShopId,
        shop,
        sourceBranch,
        destinationBranch,
        receiver: {
          receiverUserId: String(salesman.firebaseUid || salesman.uid || salesman.id || ""),
          receiverFirebaseUid: String(salesman.firebaseUid || salesman.uid || ""),
          receiverMemberId: String(salesman.id || ""),
          receiverLocalUserId: String(salesman.localUserId || ""),
          receiverUsername: String(salesman.username || ""),
          receiverEmail: String(salesman.email || salesman.authEmail || ""),
          receiverName: salesman.personName || salesman.username || "",
        },
        items: [{
          productId: product.id,
          name: product.name,
          code: product.code || "",
          unit: product.unit || "Pcs",
          quantity: want,
          unitCost: numberValue(product.landingCost || product.vatExclusive || product.purchasePrice),
        }],
        note: L("Sales Invoice থেকে স্টক অনুরোধ", "Stock request from Sales Invoice"),
        actor,
      });
      toast(L(`অনুরোধ ${transfer.transferNo} পাঠানো হয়েছে`, `Request ${transfer.transferNo} sent`));
      onCreated?.(transfer);
      onClose?.();
    } catch (error) {
      toast(normalizeError(error, lang), "err");
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) {
    return (
      <div className="si-note">{L("Settings → Branch Transfer চালু করুন এবং company file per branch সেট করুন।", "Enable Settings → Branch Transfer and company file per branch.")}</div>
    );
  }

  return (
    <div className="si-panel-body" style={{ display: "grid", gap: 10, maxWidth: 480 }}>
      <div style={{ fontWeight: 800 }}>{product?.name || ""}</div>
      <div className="si-muted" style={{ fontSize: 12 }}>
        {L("অন্য শাখায় স্টক", "Stock at other branches")}
      </div>
      <table className="pm-table">
        <thead><tr><th>{L("শাখা", "Branch")}</th><th className="si-num">{L("আছে", "Qty")}</th></tr></thead>
        <tbody>
          {qtyRows.map((row) => (
            <tr key={row.branchId}>
              <td>{row.name}</td>
              <td className="si-num">{fq(row.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <label className="si-field">
        <span className="pm-label">{L("কোথা থেকে চান", "Request from")}</span>
        <select className="pm-input" value={sourceBranchId} onChange={(e) => setSourceBranchId(e.target.value)}>
          <option value="">{L("শাখা বেছে নিন", "Choose branch")}</option>
          {activeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label className="si-field">
        <span className="pm-label">{L("আমার শাখা (রিসিভ)", "My branch (receive)")}</span>
        <select className="pm-input" value={destBranchId} onChange={(e) => setDestBranchId(e.target.value)}>
          <option value="">{L("শাখা বেছে নিন", "Choose branch")}</option>
          {activeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label className="si-field">
        <span className="pm-label">{L("পরিমাণ", "Quantity")}</span>
        <input className="pm-input" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
      </label>
      <div className="si-actions">
        <button type="button" className="pm-btn-secondary" onClick={onClose} disabled={busy}>{L("বন্ধ", "Close")}</button>
        <button type="button" className="pm-btn pm-btn--primary" onClick={submit} disabled={busy}>
          {L("অনুরোধ পাঠান", "Send request")}
        </button>
      </div>
    </div>
  );
}