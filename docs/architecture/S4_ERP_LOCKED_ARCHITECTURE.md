# S4 ERP locked architecture (pointer)

## React shop application (primary)

- Entry: `src/spare-parts-app.jsx`
- Menus: `src/dashboard/menuGroups.js`
- Tabs: `src/app/useNavigationState.jsx`, `src/app/renderTabContent.jsx`
- Offline + sync: `src/offline/`
- Domain modules under `src/*` (sales-invoice, purchase, ledger, reports, …)

UI rules:

- No emoji in labels, menus, buttons, alerts, or prints
- Keep professional business-software appearance
- Prefer hub screens with filters/export over dozens of duplicate report menus

## Django ERP package (`erp/`)

When working under `erp/`, also follow repository root `ARCHITECTURE_LOCK.md` and `ERP_ARCHITECTURE.md` stage checklists.

## Product gap roadmap

Tradeasy comparison and build waves are locked outside this file:

- `../../S4-TRADEASY-LOCKED-ROADMAP.md` (workspace root)
- `../../S4-LOCKED-WORK-PLAN.md`
