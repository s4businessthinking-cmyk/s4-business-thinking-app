// Auto WhatsApp on a sales invoice (opt-in per customer: autoWhatsAppInvoice on the customer master, default off).
// When a sales invoice of such a customer becomes a live bill - a new bill confirmed, or a draft confirmed - the same
// PDF + message as the manual WhatsApp button is opened right after the save. Editing a bill that was already live
// never opens it again. Drafts, quotations, sales orders, delivery notes, opening-balance and cancelled bills never do.
// The invoice is saved first; anything that goes wrong with WhatsApp only shows a message.
const LIVE = ["confirmed", "partial", "paid"];

/** The customer master flag; off unless ticked. */
export const autoWhatsAppOn = (customer) => !!customer && !customer.isDeleted && customer.autoWhatsAppInvoice === true;

/** Should saving this bill open WhatsApp? saved: the bill as saved; prior: the same bill before this save (null when new). */
export function autoWhatsAppDue({ kind = "sales", saved, prior = null, customer }) {
  if (kind !== "sales" || !saved) return false;
  if (!LIVE.includes(saved.status) || saved.invoiceType === "delivery" || saved.docKind === "quotation" || saved.source === "openingBalance") return false;
  if (prior && LIVE.includes(prior.status)) return false; // already a live bill: an edit, not a new invoice
  return autoWhatsAppOn(customer);
}

/** Runs the after-save step so that nothing it throws (now or later) can reach the save. */
export function afterInvoiceSaved(fn, ...args) {
  if (typeof fn !== "function") return;
  try {
    const r = fn(...args);
    if (r && typeof r.catch === "function") r.catch((err) => console.warn("[S4 Auto WhatsApp] failed", err));
  } catch (err) {
    console.warn("[S4 Auto WhatsApp] failed", err);
  }
}
