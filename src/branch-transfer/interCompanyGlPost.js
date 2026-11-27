import { offlineGetById, offlineUpsert } from "../offline/offlineRepository.js";
import { buildHqInterCompanyJournal, buildSenderInterCompanyJournal } from "./interCompanyGl.js";
import { isPeerTransfer } from "./branchTransferDomain.js";

export async function postHqInterCompanyJournal({ transfer, receipt, branchName, actor }) {
  if (isPeerTransfer(transfer)) return null;
  const journal = buildHqInterCompanyJournal({ transfer, receipt, branchName, actor });
  if (!journal) return null;
  const existing = await offlineGetById("accountVouchers", journal.id);
  if (existing?.data) return { ...existing.data, id: journal.id };
  const result = await offlineUpsert("accountVouchers", journal.id, journal);
  return { ...result.data, id: journal.id };
}

export async function postSenderInterCompanyJournal({ transfer, receipt, destinationBranchName, actor }) {
  const journal = buildSenderInterCompanyJournal({ transfer, receipt, destinationBranchName, actor });
  if (!journal) return null;
  const existing = await offlineGetById("accountVouchers", journal.id);
  if (existing?.data) return { ...existing.data, id: journal.id };
  const result = await offlineUpsert("accountVouchers", journal.id, journal);
  return { ...result.data, id: journal.id };
}