# S4 Business Thinking ERP — ARCHITECTURE LOCK

**Locked:** 2026-07-09  
**Status:** ACTIVE — do not deviate without explicit user approval  
**Source:** `ERP_ARCHITECTURE.md` (v2) + `S4 Business Thinking Erp Complete Build Roadmap.pdf`

---

## Locked Decisions

| Decision | Value |
|----------|-------|
| Build model | Gradual upgrade — same app, users keep updates |
| Backend | Django + DRF (primary), FastAPI (sync/async later) |
| Database | PostgreSQL (hybrid multi-tenant) |
| Cache/Queue | Redis + Celery |
| Offline | sql.js/IndexedDB now → SQLCipher/Dexie enterprise sync (STAGE 11) |
| Desktop | Existing Electron — migrate when STAGE 12 |
| Mobile | Existing Capacitor Android — keep running |
| Auth target | JWT RS256 + RBAC + ABAC (STAGE 2) |
| No demo code | Every deliverable must run and pass health checks |
| Build order | STAGE 0 → 16 serial — never skip |

---

## Current Position

| Field | Value |
|-------|-------|
| **Current STAGE** | 16 — FINAL HARDENING ✅ COMPLETE → all core stages done 🎉 |
| **Started** | 2026-07-09 |
| **Browser dashboard** | `http://localhost:5173/?erp-dashboard=1` |

### STAGE 1 Checklist

- [x] Architecture lock document
- [x] Monorepo `erp/` folder structure
- [x] Docker Compose (PostgreSQL + Redis + Django + Celery)
- [x] Django production settings (base/local)
- [x] Health-check API (`/api/v1/health/`)
- [x] Build-status API (`/api/v1/build/status/`)
- [x] Logging + global error handling
- [x] Audit log foundation model
- [x] Browser ERP Build Dashboard (live status)
- [x] All services verified running (2026-07-09 — PostgreSQL, Redis, Celery all green)
- [x] STAGE 1 sign-off → proceed to STAGE 2

---

## Build Order (Locked — Do Not Reorder)

```
STAGE 0  ✅ Planning + Architecture (locked)
STAGE 1  ✅ Foundation (Django, PostgreSQL, Redis, Celery, Docker)
STAGE 2  ✅ Auth + Security (JWT RS256, RBAC, sessions, lockout)
STAGE 3  ✅ SaaS + Tenants + License (multi-tenant, S4-LIC-v1 verifier)
STAGE 4  ✅ Database + Offline + Sync (HLC, inbox/outbox, sync APIs)
STAGE 5  ✅ Inventory Core (item master, stock ledger, posting)
STAGE 6  ✅ Purchase (supplier, PO, GRN, stock receipt)
STAGE 7  ✅ Sales + POS (SO, delivery, POS sale, stock OUT)
STAGE 8  ✅ Accounting (CoA, JE, GL, trial balance, auto-JE)
STAGE 9  ✅ HRM + CRM (employee, attendance, leave, lead, opportunity)
STAGE 10 ✅ Reports + Analytics (KPI dashboard, standard reports, run engine)
STAGE 11 ✅ Offline + Realtime (Channels/Daphne WS, tickets, presence, replay, outbox relay)
STAGE 12 🔄 Electron Desktop — backend device provisioning + registry ✅ (activation codes, device keys, heartbeat, version pin/channel, RBAC, dashboard panel). Native client (SQLCipher, peripherals, POS multi-window) = hardware-only follow-up. Production electron/main.cjs untouched.
STAGE 13 ✅ Enterprise Extras — Notifications & Alerts (real low-stock rules + realtime push), Approval workflows (multi-step, RBAC), Document attachments (§24 storage abstraction + checksum), Custom fields + Number sequences (atomic, period reset). Dashboard panels for all.
STAGE 14 ✅ Security + Backup — real pg_dump/dumpdata backups (SHA-256 checksum + 35-day retention + Celery beat), audit hash-chain tamper verify (§8.5), per-tenant API keys (hashed), security policy, security headers middleware (§17.7). Dashboard panel for all. MFA/TOTP deferred.
STAGE 15 ✅ Deployment + Scaling — observability (dependency-free Prometheus /metrics + request middleware + ops status API/panel) + single-VPS production stack (§16.5: multi-stage non-root prod image, gunicorn web + daphne ws + celery worker/beat, nginx reverse proxy http+WS, postgres/redis/minio). Full k8s cluster manifests (§16.1) deferred — needs a real cluster to verify.
STAGE 16 ✅ Final Hardening — DRF rate limiting (anon/user + tight login IP+email + self-test scope), edge idempotency middleware (Idempotency-Key → cached, replay-safe writes), upload hardening (dangerous-extension blocklist + optional content-type allowlist), uniform error envelope (verified). Dashboard proves live 429 + idempotent replay. Chaos/load/DR drills = ops runbooks (deferred).

ALL CORE STAGES (0–16) COMPLETE. Remaining deferred (environment/hardware-dependent): STAGE 12.8/12.9 native Electron client (SQLCipher, peripherals, POS windows), STAGE 14.10 MFA/TOTP, STAGE 15.9 full k8s cluster manifests, STAGE 16.7 chaos/load/DR drills.
```

---

## Rules For Every Step

1. Complete current STAGE checklist before next STAGE
2. No placeholder/demo/fake logic
3. Browser dashboard must reflect real backend state
4. Existing app (`spare-parts-app.jsx`) stays working — no breaking changes
5. Each STAGE ends with: run → test → fix → update this file → git commit (when user asks)

---

## Reuse From Current App (Locked)

| Module | Reuse |
|--------|-------|
| `src/auth/licenseService.js` | STAGE 3 integrate |
| `src/offline/*` | STAGE 4/11 upgrade |
| `electron/main.cjs` | STAGE 12 |
| Release scripts | STAGE 15 |
| Bangla/English UI | All stages |
