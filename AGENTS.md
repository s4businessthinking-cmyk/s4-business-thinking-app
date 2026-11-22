# AGENTS.md — S4 Business Thinking

Read and obey before any change. Do not wait for the user to repeat these rules.

**Claude Code:** also read and obey `CLAUDE.md` in this folder (mandatory, full strength).

## Process

Follow `docs/AI_COENGINEERING_PLAN_TO_PRODUCTION.md` (steps 1–10) in order.
State which step you are on when starting a multi-step feature.

## Locked product roadmap

Workspace root (parent of this app):

- `S4-TRADEASY-LOCKED-ROADMAP.md`
- `S4-LOCKED-WORK-PLAN.md`

Do not expand to a 1:1 Tradeasy menu copy. Build modern hubs per that lock.
To change priorities the user must say `roadmap unlock`.

## App boundaries

- Shipped shop ERP UI: `src/` (React / Electron / Capacitor)
- Optional Django ERP experiments: `erp/` — only if working there, also read `ARCHITECTURE_LOCK.md`
- Do not break offline SQLite, sync, permissions, or existing SI/PI/stock flows

## Coding standards

- Production-ready only: validation, error handling, permissions, BN/EN where siblings have them
- Reuse existing tabs, domain modules, print/export patterns
- Menu: `src/dashboard/menuGroups.js` + `src/app/useNavigationState.jsx` + `src/app/renderTabContent.jsx`
- Permissions: `src/shared/appShared.jsx` + `src/team/permissionMatrix.js`
- No emoji anywhere in product UI or new source strings
- No push / release / deploy unless the user explicitly asks

## QA before stop

- Happy path with real collections
- Draft/cancelled handling
- Permission gates
- Desktop + mobile shell not broken
- Report what changed and how to verify
