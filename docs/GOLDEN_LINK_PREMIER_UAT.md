# Golden Link Auto Spare Parts — Premier multi-file UAT

**Scope:** One business, HQ + branch **company files** (`shopId` per branch), separate cash/books, consolidated HQ view.  
**Not Premier `.mdb` per PC** — same S4 engine, multiple `shopId` offline stores.

Run on a **copy** of real data first. Owner sign-off when every row is pass.

---

## A. Setup (one time)

| # | Step | Pass when |
|---|------|-----------|
| A1 | Branch Transfer: **Each branch = separate company file** ON, share parties ON | Child `shopId` shown on branch row |
| A2 | Save Branch 1 + Branch 2, create counter logins (`branch1`, `branch2`, `main`) | Login opens **only** that file’s data |
| A3 | HQ: **Sync products & parties from HQ to branches** (or save one product on HQ) | Child Product Master shows same item |
| A4 | Child shop: CoA has **Bank - (branch name)**, **Due to HQ** (auto-seed on file create) | Chart of Accounts visible on child |
| A5 | HQ Cloud Download (owner, online) | Toast mentions branch files if multi-file ON |

---

## B. Stock path (HQ to branch)

| # | Step | Pass when |
|---|------|-----------|
| B1 | HQ: create transfer, dispatch | HQ main stock **down** (Stock Hub / SA-BT adjustment) |
| B2 | Branch counter: receive (partial OK) | Child stock **up**; status received / partial |
| B3 | Cancel dispatch **before** receive | HQ stock SA cancelled; transfer cancelled |

---

## C. Money path (inter-company)

| # | Step | Pass when |
|---|------|-----------|
| C1 | After receive with value | HQ: **JV-IC** Dr Due from branch, Cr Purchase |
| C2 | Same receive | Child: **PI-IC** Dr Purchase, Cr **Due to HQ** (not vendor payable) |
| C3 | HQ + child Global Ledger | Due from / Due to HQ amounts **match** receipt value |
| C4 | HQ: Consolidated company report, Refresh | **Inter-company elimination** KPI; Due lines net on TB |

---

## D. Daily ops (branch file)

| # | Step | Pass when |
|---|------|-----------|
| D1 | Child: cash SI, confirm | **Cash in Hand** or branch cash (if BT cash split ON) |
| D2 | Child: SI bank transfer, full pay | Ledger **Bank - branch** (not generic Bank only) |
| D3 | Child: PI bank pay at save | Same `paymentBank` line |
| D4 | Child: Receipt / Payment voucher, bank | Default bank pre-selected; posts to branch bank |
| D5 | Counter: open shift, close | Cash vs ledger on **child** shop only |

---

## E. Reports (per file and HQ)

| # | Report | Pass when |
|---|--------|-----------|
| E1 | Trial Balance / BS / Cash Flow (HQ file) | HQ numbers only |
| E2 | Same on child file | Child numbers only; bank name matches branch |
| E3 | HQ Consolidated | Rows per company file; group BS/TB elimination applied |
| E4 | Party Aging | No HQ parties on child unless shared master merged |

---

## F. Automated regression (dev)

From `s4-business-thinking-app`:

```bash
node --test src/branch-transfer/*.test.js src/ledger/globalLedger.test.js src/ledger/interCompanyLedger.test.js src/ledger/ledgerShopOpts.test.js
npm run build
```

All tests pass; build OK.

---

## Known limits (honest)

- Consolidated P&L **subtracts inter-company purchase double-count** in the group total; per-file rows stay additive.
- Inter-company elimination nets **Due from / Due to HQ** on TB and group BS totals.
- Cloud: child PC pulls **its** `shopId`; HQ owner pull also fetches active branch files.
- Automated smoke: `npm run test:branch` (node integration). In-app checklist: Settings → Branch Transfer → Premier UAT.

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Owner | | | |
| Counter Branch 1 | | | |
| Counter Branch 2 | | | |

When A–E pass, Premier-style multi-file is **UAT accepted** for Golden Link.