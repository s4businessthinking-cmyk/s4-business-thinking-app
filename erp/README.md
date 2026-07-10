# S4 ERP — STAGE 1 Foundation

Architecture is **LOCKED**. See `../ARCHITECTURE_LOCK.md`.

## Browser Dashboard (live build status)

```
http://localhost:5173/?erp-dashboard=1
```

Shows:
- Current STAGE + checklist
- Live PostgreSQL / Redis / Celery health (when backend is up)
- Architecture LOCKED badge

## Start Backend (Docker required)

1. Start **Docker Desktop** (daemon must be running)
2. From repo root:

```powershell
npm run erp:up
```

3. Open dashboard URL and verify all 3 services are **green**

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Frontend (main app + dashboard) |
| `npm run erp:up` | Start PostgreSQL + Redis + Django + Celery |
| `npm run erp:down` | Stop ERP stack |
| `npm run erp:logs` | Follow container logs |
| `npm run erp:migrate` | Run Django migrations |
| `npm run erp:dev` | Frontend + ERP stack together |

## API Endpoints

- `GET /api/v1/health/live/` — liveness
- `GET /api/v1/health/ready/` — readiness (DB + Redis + Celery)
- `GET /api/v1/health/` — full health + audit log
- `GET /api/v1/build/status/` — stage progress + health bundle

## STAGE 1 Sign-off

When dashboard shows all services **up**, STAGE 1 is complete → proceed to STAGE 2 (Auth + Security).
