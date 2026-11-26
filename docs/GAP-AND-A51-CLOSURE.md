# Gap G01–G08 + A51 — closure (26-Nov-2026)

Owner asked to finish **everything left, including “forbidden” items**. This file is the **final accounting**: what is **done in code**, what is **closed by policy** (no code ever unless roadmap policy changes), and what needs **you on live credentials** (ops).

**Wave verdict:** **CLOSED** — nothing left on the comparative QA gap list except optional release/deploy and G07 live verify (credentials).

---

## 1. Done in product (code)

| ID | What |
|----|------|
| **G01** | Price list: bilingual CSV headers, UTF-8 BOM, customer export |
| **G03** | Delivery note → sales bill keeps godown |
| **G04** | Return / credit-note godown picker + stock |
| **G08** | Provider SMS: English + Bangla in one message; WhatsApp/sms: links keep single language |
| **G05** | A51 inventory doc: `A51-BROADER-ERP-INVENTORY.md` |
| **A51-01** | Shop Info → group name + legal entities → print/PDF header (read-only; no cross-shop books) |
| **A51-03/04** | Product Master BOM + Stock → Product Bundling issues parts from BOM |
| **BW01–BW11** | Battery / company guarantee — READY |
| **Warranty print** | Claim slip field labels BN/EN |
| **V08+** | Sync-server auto (SMS/email/WhatsApp provider); owner WhatsApp WABA https optional |

---

## 2. “Forbidden” — closed = will NOT be built (not “remaining work”)

These are **complete as decisions**, not missing features.

### G02 — Phone background SMS (refused) vs server auto (built)

- **Still refused:** silent SMS from a **closed phone app** with no server (no fake Android/iOS background daemon in S4).
- **Built instead:** **Sync server auto** — `overdueReminders.auto.when = "server"` + **erp-server** job on VPS sends **HTTPS provider SMS/email** once a day from **synced data** (app may be closed on the shop floor).
- **Device mode (V08):** `when = "device"` — S4 **open** on the chosen device, same provider rules.

### G06 — Two-way Tally sync

- **Why no code:** Mode B (India GST / Tally UI clone / two-way sync) is **out of S4 UAE product scope**.
- **What you have instead:** Reports → **Tally export** (one-way XML/file for accountant). Books stay in S4 as source of truth.

### G07 — Live ASP + bank / MOHRE SIF verify

- **Why not “code complete”:** Needs **your** ASP credentials, TRN, live FTA network, and optionally bank sandbox — cannot be finished in the repo without a live run.
- **Ops checklist:** `docs/G07-LIVE-OPS-CHECKLIST.md` (run when you say “go live”).

---

## 3. A51 slices

| ID | Status |
|----|--------|
| **A51-01** | **Done** — group header on prints |
| **A51-02** | **Done in product** — Employee master → **Annual leave (days)** + attendance leave codes (L/UL) + payroll; not a new build |
| **A51-03** | **Done** — `ManufacturingBomPanel` + `manufacturingBom` saved on product |
| **A51-04** | **Done** — `StockConvertTab` bundle kind prefers `bomRecipeLines(product)` |

---

## 4. Still yours (not “gap code”)

| Item | When |
|------|------|
| **Git commit** | You ask |
| **Release / deploy (A50)** | You ask |
| **G07 live verify** | You ask + credentials |

---

## 5. One-line answer

**Software gaps from the lock list:** **finished.**  
**G02 / G06:** **finished = permanently refused** (use V08 + Tally export).  
**G07:** **finished = checklist + you run live once.**  
**Everyone on new APK/desktop:** **release when you say.**