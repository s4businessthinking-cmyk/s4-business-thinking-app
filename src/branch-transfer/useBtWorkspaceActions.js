import { BRANCH_TRANSFER_COLLECTIONS, createBranchTransfer, createPurchaseInvoiceFromReceipt, deleteBranchTransfer, listShopRecords, receiveBranchTransfer, updateTransferStatus } from "./branchTransferService.js";
import { acceptedQty, f2, fmtDay, fq, normalizeError, sentQty, transferSentDate, transferTotalValue } from "./btShared.jsx";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";
import { numberValue, receivedQuantityForLine, statusLabel } from "./branchTransferDomain.js";
import { printWithSettings } from "../print/printSettings.js";
import { useEffect } from "react";
import { useEscapeKey } from "../components/WindowChrome.jsx";

export function useBtWorkspaceActions({ L, actor, busy, dirtyRef, lang, leaveGuard, profile, receiving, setBranches, setBusy, setReceiving, setSelId, setTransfers, setView, settings, shop, shopId, t, toast, user, view }) {
  const upsertTransfer = (next) => {
    if (next?.id) setTransfers((list) => [next, ...(list || []).filter((row) => row.id !== next.id)]);
  };
  const reload = async () => {
    const [nextBranches, nextTransfers] = await Promise.all([
      listShopRecords(BRANCH_TRANSFER_COLLECTIONS.BRANCHES, shopId),
      listShopRecords(BRANCH_TRANSFER_COLLECTIONS.TRANSFERS, shopId),
    ]);
    setBranches(nextBranches);
    setTransfers(nextTransfers);
  };
  const run = async (work, success) => {
    if (busy) return null;
    setBusy(true);
    try {
      const result = await work();
      if (success) toast(success);
      return result;
    } catch (error) {
      console.error("[S4 Branch Transfer] action failed", error);
      toast(normalizeError(error, lang), "err");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const leaveOk = () => view !== "new" || !dirtyRef.current || window.confirm(L("এই ট্রান্সফার সেভ হয়নি। তবুও চলে যাবেন?", "This transfer is not saved. Leave anyway?"));
  const backToList = () => {
    if (!leaveOk()) return;
    dirtyRef.current = false;
    setSelId(null);
    setView("list");
  };
  useEffect(() => {
    if (!leaveGuard || view === "list") return undefined;
    const guard = { leave: () => leaveOk(), back: () => { backToList(); return true; } };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });
  useEscapeKey(backToList, { enabled: view !== "list" && !receiving, level: view === "new" ? 2 : 1 });

  const openNew = () => { dirtyRef.current = false; setView("new"); };
  const openDetail = (transfer) => { setSelId(transfer.id); setView("detail"); };

  const createTransfer = (payload) => run(async () => {
    const created = await createBranchTransfer({ ...payload, shopId, shop, actor });
    upsertTransfer(created);
    logAudit({ shopId, user, profile, action: "create", collection: "branchTransfers", docId: created.id, docNo: created.transferNo, amount: transferTotalValue(created), note: created.branchName || "" });
    dirtyRef.current = false;
    setSelId(created.id);
    setView("detail");
    return created;
  }, t.transferSaved);
  const changeStatus = (transfer, status) => run(async () => {
    const updated = await updateTransferStatus({ transfer, status, actor });
    upsertTransfer(updated);
    logAudit({ shopId, user, profile, action: status === "cancelled" ? "cancel" : "edit", collection: "branchTransfers", docId: transfer.id, docNo: transfer.transferNo, note: `${statusLabel(status, "en")} · ${transfer.branchName || ""}` });
    return updated;
  }, status === "cancelled" ? L("🚫 ট্রান্সফার বাতিল হয়েছে", "🚫 Transfer cancelled") : t.statusUpdated);
  const deleteTransfer = (transfer) => run(async () => {
    await deleteBranchTransfer({ transfer, actor });
    setTransfers((list) => (list || []).filter((row) => row.id !== transfer.id));
    logAudit({ shopId, user, profile, action: "delete", collection: "branchTransfers", docId: transfer.id, docNo: transfer.transferNo, note: transfer.branchName || "" });
    setSelId(null);
    setView("list");
  }, L("ট্রান্সফার মুছে ফেলা হয়েছে", "Transfer deleted"));
  const confirmReceive = (transfer, inputLines) => run(async () => {
    const result = await receiveBranchTransfer({ transfer, inputLines, settings, shop, actor });
    upsertTransfer(result.transfer);
    setReceiving(null);
    logAudit({ shopId, user, profile, action: "receive", collection: "branchTransfers", docId: transfer.id, docNo: transfer.transferNo, note: `R${result.receipt?.sequence || ""} · ${transfer.branchName || ""}` });
    return result;
  }, settings?.autoCreatePurchaseInvoiceOnReceive === true ? t.autoInvoiceCreated : t.receiveSaved);
  const createInvoice = (transfer, receipt) => run(async () => {
    const result = await createPurchaseInvoiceFromReceipt({ transfer, receiptId: receipt.id, shop, actor });
    upsertTransfer(result.transfer);
    return result;
  }, t.invoiceCreated);

  const printTransfer = (transfer) => {
    const cols = [{ label: "#" }, { label: "Item" }, { label: "Unit" }, { label: "Sent", align: "right" }, { label: "Received", align: "right" }, { label: "Cost", align: "right" }, { label: "Value", align: "right" }];
    const body = (transfer.items || []).map((item, index) => [
      String(index + 1),
      [item.name, item.code].filter(Boolean).join(" · "),
      item.unit || "",
      fq(item.quantity),
      fq(receivedQuantityForLine(transfer, item.lineId)),
      f2(item.unitCost),
      f2(numberValue(item.quantity) * numberValue(item.unitCost)),
    ]);
    body.push(["", "TOTAL", "", fq(sentQty(transfer)), fq(acceptedQty(transfer)), "", f2(transferTotalValue(transfer))]);
    const subtitle = [
      transfer.transferNo,
      fmtDay(transferSentDate(transfer)),
      `${transfer.sourceShopName || "Main Shop"} → ${transfer.branchName || ""}`,
      transfer.receiverName && `Receiver: ${transfer.receiverName}`,
      transfer.vendorName,
      statusLabel(transfer.status, "en"),
    ].filter(Boolean).join(" · ");
    printWithSettings(generateStatementHTML({ shopName: shop?.companyName || "", title: "BRANCH TRANSFER", subtitle, cols, rows: body }), { lang });
  };
  return { backToList, changeStatus, confirmReceive, createInvoice, createTransfer, deleteTransfer, openDetail, openNew, printTransfer, reload };
}
