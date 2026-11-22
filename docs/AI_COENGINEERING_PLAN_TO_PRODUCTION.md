# Roadmap: AI Co-Engineering Plan To Production

Locked process for all S4 work in this repository. Follow in order. Do not skip steps.

1. Project requirement and feature analysis / planning first
2. Design data model according to requirements
3. Use / keep the standard project structure
4. Follow coding standards and existing reference code patterns
5. Prefer development kit / reusable services / shared components
6. Implement with AI assistance (production code only)
7. Code review and refactor
8. Final project QA
9. Fix problems, bugs, and mismatches
10. Deployment (only when the user explicitly asks)

## Hard constraints

- No fake APIs, placeholder UI, stub handlers, or demo-only paths
- Do not invent schema; extend existing collections / offline sync safely
- Prefer services + reusable components over one-off screens
- Match existing file layout, naming, and UI patterns in `src/`
- Django `erp/` stack follows `ARCHITECTURE_LOCK.md` separately; React shop app work lives under `src/`
- Feature roadmap for Tradeasy gaps is locked in workspace root: `S4-TRADEASY-LOCKED-ROADMAP.md` and `S4-LOCKED-WORK-PLAN.md`

## Professional craft (mandatory)

- Output must look like senior engineer work, not AI-generated samples
- No emoji in UI labels, buttons, menus, toasts, prints, or source strings
- No decorative comments, hype text, or "AI wrote this" markers
- Prefer clear names, small diffs, and the same visual language as existing screens
- Do not ask the user to restate these rules each session
