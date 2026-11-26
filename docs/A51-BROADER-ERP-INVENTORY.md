# A51 — Broader ERP (unlock inventory)

**Status:** Inventory published 26-Nov-2026. **A51-01 unlocked + done** 26-Nov-2026 (owner). Other slices need **roadmap unlock** + named ID.

Mode V warehouse scope is **done** in S4 for single-shop UAE trading. A51 is everything **beyond** that Vyapar-shaped core.

## Policy (locked)

| Area | S4 today | A51 direction |
|------|----------|----------------|
| Multi-company / consolidation | One shop = one legal entity; branch transfer is **intra-shop** | Per-company books, inter-company eliminations — **separate unlock** |
| Deeper HR | Employee master + alerts (Mode A) | Payroll, MOHRE contracts, leave accrual — **per-item unlock** |
| Manufacturing | Job orders → sales invoice | BOM, work centres, WIP — **per-item unlock** |
| Mode B | **Out** | India GST UI clone, two-way Tally sync |

## Unlock IDs (waiting)

| ID | Slice | Depends on | Acceptance (when unlocked) |
|----|--------|------------|------------------------------|
| **A51-01** | Multi-entity read-only group header on reports | **DONE** | Settings → Shop Info → group + entities; header on invoice / purchase / voucher / statement prints; `printWithSettings(..., { shop })` for other PDFs |
| **A51-02** | HR: employee leave balance field | **DONE in product** | Employee master → Annual leave (days); attendance L/UL; payroll export — no separate unlock build |
| **A51-03** | Manufacturing: BOM on product | **DONE** | Product Master → Manufacturing BOM (`manufacturingBom` on product) |
| **A51-04** | Manufacturing: material issue from BOM | **DONE** | Stock → Product Bundling loads BOM; save posts real `stockAdjustments` (fallback: last bundle recipe) |

**G05** = this file (inventory only) until an A51-xx ID is unlocked.

Ops not in A51: **A50** deploy on ask, **G07** live ASP / bank / MOHRE verify on ask.