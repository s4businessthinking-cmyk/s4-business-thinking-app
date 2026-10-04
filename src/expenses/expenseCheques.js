import { offlineUpdate } from "../offline/offlineRepository";

const stamp = (uid) => ({ updatedAt: new Date().toISOString(), updatedBy: uid || "" });

export async function clearExpenseCheque(expense, clearedAt, uid) {
  await offlineUpdate("expenses", expense.id, { ...expense, chequeStatus: "cleared", clearedAt, clearedBy: uid || "", ...stamp(uid) });
}

// The expense itself stays recorded; only the cheque is marked bounced so it
// stops reminding and shows as unpaid in the expense list.
export async function bounceExpenseCheque(expense, uid) {
  const s = stamp(uid);
  await offlineUpdate("expenses", expense.id, { ...expense, chequeStatus: "bounced", bouncedAt: s.updatedAt, bouncedBy: uid || "", ...s });
}

export async function postponeExpenseCheque(expense, newChequeDate, uid) {
  const s = stamp(uid);
  await offlineUpdate("expenses", expense.id, {
    ...expense, chequeDate: newChequeDate, chequeDateBefore: expense.chequeDate || "", chequePostponedAt: s.updatedAt, chequePostponedBy: uid || "", ...s,
  });
}
