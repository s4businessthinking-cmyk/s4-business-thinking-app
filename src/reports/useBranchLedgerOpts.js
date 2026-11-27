import { useEffect, useMemo, useState } from "react";
import { ledgerOptsWithBranches, loadBranchMaster } from "../branch-transfer/branchLedgerOpts.js";

/** Branch cash split + default bank account for buildGlobalLedger in reports. */
export function useBranchLedgerOpts(shopId, shop) {
  const [branchMaster, setBranchMaster] = useState([]);
  useEffect(() => {
    let cancelled = false;
    loadBranchMaster(shopId, shop).then((rows) => {
      if (!cancelled) setBranchMaster(rows || []);
    });
    return () => { cancelled = true; };
  }, [shopId, shop?.branchTransferSettings?.enabled]);
  return useMemo(() => ledgerOptsWithBranches(shop, branchMaster), [shop, branchMaster]);
}