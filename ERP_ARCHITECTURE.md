# ENTERPRISE ERP — PRODUCTION-GRADE ARCHITECTURE SPECIFICATION (v2)

**Stack:** Python · Django · Django REST Framework · FastAPI · PostgreSQL · Redis · Celery · Docker · Kubernetes · Electron · PWA · IndexedDB · SQLite

**Targets:** Multi-Tenant SaaS · Multi-Company · Multi-Branch · Warehouse Management · Offline-First · Real-Time · Thousands of Concurrent Users · Enterprise-Grade Scalability

> Architecture-only specification. No implementation code is generated. All 31 sections describe real, deployable design — no placeholders, no demo simplifications.

---

## TABLE OF CONTENTS

1. Full Scalable Folder Structure
2. Multi-Tenant Database Architecture
3. Multi-Company / Multi-Branch / Warehouse Architecture
4. Inventory Transaction Flow
5. Accounting Transaction Flow
6. Authentication Architecture
7. RBAC Permission Architecture
8. Audit Logging Architecture
9. Offline–Online Synchronization Architecture
10. Sync Conflict Resolution Strategy
11. API Architecture
12. API Versioning Strategy
13. WebSocket Real-Time Architecture
14. Background Job Architecture
15. Queue / Event Architecture
16. Deployment Architecture
17. Security Architecture
18. Licensing Architecture
19. SaaS Architecture
20. Electron Desktop Architecture
21. PWA Architecture
22. Backup & Disaster Recovery Architecture
23. Monitoring & Logging Architecture
24. File / Document Storage Architecture
25. Reporting & Analytics Architecture
26. Caching Architecture
27. Plugin / Module Expansion Architecture
28. Testing Architecture
29. CI/CD Architecture
30. Inventory Valuation Architecture
31. Accounting Journal Engine Architecture

---

# 1. FULL SCALABLE FOLDER STRUCTURE

The system is a **monorepo** containing backend services, desktop client, web/PWA client, mobile, infrastructure, and shared contracts. This is engineered to support 50+ business modules and four independent runtime targets: **Django web, FastAPI async, Celery workers, and offline clients (Electron/PWA)**.

```
erp/
├── backend/
│   ├── django_app/                          # Primary business application (DRF)
│   │   ├── config/
│   │   │   ├── settings/
│   │   │   │   ├── base.py
│   │   │   │   ├── local.py
│   │   │   │   ├── staging.py
│   │   │   │   ├── production.py
│   │   │   │   └── testing.py
│   │   │   ├── urls.py
│   │   │   ├── wsgi.py                      # Gunicorn entry
│   │   │   ├── asgi.py                      # Daphne / Uvicorn entry (Channels)
│   │   │   ├── celery.py                    # Celery app
│   │   │   └── routing.py                   # WebSocket routing
│   │   ├── apps/
│   │   │   ├── core/                        # Cross-cutting primitives
│   │   │   │   ├── models/                  # BaseModel, Audit, SoftDelete, TenantAware
│   │   │   │   ├── managers/
│   │   │   │   ├── mixins/
│   │   │   │   ├── middleware/              # Tenant, Audit, Correlation, Throttle
│   │   │   │   ├── permissions/             # RBAC, ABAC, ObjectPerm, PolicyEngine
│   │   │   │   ├── exceptions/
│   │   │   │   ├── pagination/
│   │   │   │   ├── filters/
│   │   │   │   ├── validators/
│   │   │   │   ├── serializers/
│   │   │   │   ├── signals/
│   │   │   │   ├── utils/                   # money, decimal, ids, hlc clock
│   │   │   │   ├── cache/                   # Cache abstractions
│   │   │   │   ├── outbox/                  # Outbox writer
│   │   │   │   └── tasks/                   # Generic celery tasks
│   │   │   │
│   │   │   ├── tenancy/                     # Tenant/Domain/Plan/Subscription
│   │   │   ├── identity/                    # Users, Teams, Org structure
│   │   │   ├── auth_service/                # Login, MFA, sessions, devices, API keys
│   │   │   ├── rbac/                        # Roles, perms, scopes, policy DSL
│   │   │   ├── audit/                       # Immutable audit log (hash-chained)
│   │   │   ├── notifications/               # Email, SMS, Push, In-App
│   │   │   ├── files/                       # Attachments, S3 abstraction
│   │   │   ├── search/                      # OpenSearch/Meilisearch adapter
│   │   │   ├── reports/                     # Report engine, scheduled reports
│   │   │   ├── analytics/                   # OLAP/aggregation pipelines
│   │   │   ├── localization/                # i18n, l10n, currencies, timezones
│   │   │   ├── settings_app/                # System & tenant settings
│   │   │   ├── webhook/                     # Outbound webhooks
│   │   │   ├── integration/                 # Third-party connectors
│   │   │   ├── workflow/                    # Approval / state-machine engine
│   │   │   ├── custom_fields/               # Tenant-defined custom fields
│   │   │   ├── plugin_host/                 # Module/plugin lifecycle
│   │   │   ├── api_keys/                    # PAT and integration tokens
│   │   │   │
│   │   │   ├── master/
│   │   │   │   ├── company/                 # Legal entities under a tenant
│   │   │   │   ├── branch/                  # Branches (multi-branch)
│   │   │   │   ├── warehouse/               # Warehouse + zones + bins
│   │   │   │   ├── currency/
│   │   │   │   ├── tax/                     # Tax codes, jurisdictions
│   │   │   │   ├── unit_of_measure/
│   │   │   │   ├── price_list/
│   │   │   │   ├── partner/                 # Customers, Suppliers, Contacts
│   │   │   │   ├── employee/
│   │   │   │   ├── item/                    # Item master, variants, BOM links
│   │   │   │   ├── category/
│   │   │   │   └── numbering/               # Document numbering series per branch
│   │   │   │
│   │   │   ├── inventory/
│   │   │   │   ├── stock_ledger/            # Immutable stock movement entries
│   │   │   │   ├── reservation/             # Hard/soft stock reservations
│   │   │   │   ├── valuation/               # FIFO, Avg, Std cost engines
│   │   │   │   ├── batch_serial/            # Lot/Batch/Serial tracking
│   │   │   │   ├── stock_in/                # Goods receipts (non-PO)
│   │   │   │   ├── stock_out/               # Goods issues (non-SO)
│   │   │   │   ├── transfer/                # Inter-warehouse / inter-branch
│   │   │   │   ├── adjustment/              # Stock adjustments
│   │   │   │   ├── cycle_count/             # Cycle counts, physical inventory
│   │   │   │   ├── reorder/                 # Min/Max, reorder rules
│   │   │   │   ├── putaway/                 # Bin placement strategy
│   │   │   │   ├── picking/                 # Pick lists, wave picking
│   │   │   │   ├── packing/                 # Packing slips, cartonization
│   │   │   │   └── reports/                 # Stock balance, ageing, valuation
│   │   │   │
│   │   │   ├── purchase/
│   │   │   │   ├── requisition/
│   │   │   │   ├── rfq/
│   │   │   │   ├── quotation/
│   │   │   │   ├── purchase_order/
│   │   │   │   ├── grn/                     # Goods Receipt Note
│   │   │   │   ├── purchase_invoice/
│   │   │   │   ├── purchase_return/
│   │   │   │   └── supplier_payment/
│   │   │   │
│   │   │   ├── sales/
│   │   │   │   ├── lead/
│   │   │   │   ├── opportunity/
│   │   │   │   ├── quotation/
│   │   │   │   ├── sales_order/
│   │   │   │   ├── delivery/                # Delivery Note / DO
│   │   │   │   ├── sales_invoice/
│   │   │   │   ├── sales_return/
│   │   │   │   └── customer_receipt/
│   │   │   │
│   │   │   ├── pos/                         # Point of Sale
│   │   │   │   ├── terminal/
│   │   │   │   ├── shift/                   # Cashier shift open/close
│   │   │   │   ├── transaction/             # Offline-capable POS sale
│   │   │   │   └── payment/
│   │   │   │
│   │   │   ├── accounting/
│   │   │   │   ├── chart_of_accounts/
│   │   │   │   ├── journal/                 # Journal Entry header + lines
│   │   │   │   ├── posting_engine/          # JE Engine (rules, validators)
│   │   │   │   ├── general_ledger/          # Posted GL view
│   │   │   │   ├── fiscal_year/             # FY, periods, close/lock
│   │   │   │   ├── ar/                      # Accounts Receivable subledger
│   │   │   │   ├── ap/                      # Accounts Payable subledger
│   │   │   │   ├── tax_subledger/
│   │   │   │   ├── bank/                    # Bank accounts, recon
│   │   │   │   ├── cost_center/
│   │   │   │   ├── project_dim/             # Accounting dimension
│   │   │   │   ├── budget/
│   │   │   │   ├── revaluation/             # FX revaluation
│   │   │   │   ├── period_close/            # Period & year-end close engine
│   │   │   │   ├── intercompany/            # Eliminations, allocations
│   │   │   │   └── financials/              # P&L, BS, TB, CashFlow generators
│   │   │   │
│   │   │   ├── manufacturing/
│   │   │   │   ├── bom/
│   │   │   │   ├── routing/
│   │   │   │   ├── work_order/
│   │   │   │   ├── production/
│   │   │   │   └── quality/
│   │   │   │
│   │   │   ├── hr_payroll/
│   │   │   │   ├── employee_lifecycle/
│   │   │   │   ├── attendance/
│   │   │   │   ├── leave/
│   │   │   │   ├── payroll/
│   │   │   │   └── statutory/
│   │   │   │
│   │   │   ├── crm/
│   │   │   ├── projects/
│   │   │   ├── assets/                      # Fixed Assets / Depreciation
│   │   │   ├── ecommerce/                   # Webstore connectors
│   │   │   ├── licensing/                   # License engine integration
│   │   │   └── billing/                     # SaaS subscription billing
│   │   │
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── routers.py               # DRF router aggregator
│   │   │   │   ├── viewsets/                # Per-app viewsets
│   │   │   │   ├── serializers/             # Per-app serializers
│   │   │   │   ├── permissions/
│   │   │   │   ├── throttles/
│   │   │   │   ├── docs/                    # drf-spectacular schema
│   │   │   │   └── exceptions.py
│   │   │   └── v2/                          # Future versions
│   │   │
│   │   ├── ws/                              # Django Channels consumers
│   │   │   ├── consumers/
│   │   │   ├── routing/
│   │   │   └── auth/
│   │   │
│   │   ├── tasks/                           # Cross-app celery orchestrators
│   │   ├── management/commands/             # Tenant ops, data ops, integrity
│   │   ├── migrations_shared/               # Public-schema migrations
│   │   ├── fixtures/                        # Default CoA, taxes, UOM, roles
│   │   ├── locale/
│   │   ├── manage.py
│   │   └── pyproject.toml
│   │
│   ├── fastapi_app/                         # High-throughput async services
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── core/                        # config, db, redis, security, hlc
│   │   │   ├── deps/                        # tenant resolver, auth, db session
│   │   │   ├── routers/
│   │   │   │   ├── sync/                    # /sync/handshake|pull|push|ack
│   │   │   │   ├── reporting/               # async heavy queries
│   │   │   │   ├── search/                  # full-text/aggregation gateway
│   │   │   │   ├── webhooks/                # outbound dispatcher + receiver
│   │   │   │   ├── streaming/               # SSE, long-poll fallbacks
│   │   │   │   └── public/                  # API for storefront/partners
│   │   │   ├── schemas/                     # Pydantic v2 contracts
│   │   │   ├── services/                    # Business orchestrators
│   │   │   ├── repositories/                # Async SQLAlchemy / asyncpg
│   │   │   ├── workers/                     # Background sync coordinators
│   │   │   └── middleware/                  # tenant, audit, rate limit
│   │   ├── alembic/
│   │   └── pyproject.toml
│   │
│   ├── workers/                             # Dedicated Celery worker images
│   │   ├── default/
│   │   ├── sync/                            # Sync queue workers
│   │   ├── reports/                         # Heavy reporting queue
│   │   ├── billing/                         # Subscription/invoice queue
│   │   ├── integrations/
│   │   ├── outbox_relay/                    # Outbox → Broker relay
│   │   └── beat/                            # Celery Beat schedule
│   │
│   ├── eventbus/                            # Event bus abstraction
│   │   ├── publishers/
│   │   ├── consumers/
│   │   └── schemas/                         # Avro/JSON Schema event contracts
│   │
│   └── shared/                              # Shared between django_app + fastapi_app
│       ├── domain/                          # Pure Python domain rules
│       │   ├── inventory/                   # Costing, posting rules
│       │   ├── accounting/                  # Posting policies, balancing
│       │   ├── tax/                         # Tax computation
│       │   └── pricing/
│       ├── events/                          # Domain events, schemas
│       ├── messaging/                       # Broker abstraction (Redis/RMQ/Kafka)
│       ├── observability/                   # OpenTelemetry, metrics, logs
│       └── tests/
│
├── clients/
│   ├── web_pwa/                             # PWA (React/Vue/Vite)
│   │   ├── public/
│   │   │   ├── manifest.webmanifest
│   │   │   └── service-worker.js
│   │   ├── src/
│   │   │   ├── app/                         # Routes, layouts
│   │   │   ├── modules/                     # Feature modules mirroring backend
│   │   │   ├── components/
│   │   │   ├── stores/                      # Pinia/Redux per domain
│   │   │   ├── services/
│   │   │   │   ├── api/                     # Axios with auth + tenant
│   │   │   │   ├── ws/                      # WebSocket client + reconnection
│   │   │   │   ├── sync/                    # Sync engine (pull/push/queue)
│   │   │   │   ├── db/                      # Dexie/IndexedDB schema
│   │   │   │   ├── auth/
│   │   │   │   └── crypto/                  # WebCrypto
│   │   │   ├── workers/                     # Web Workers, Background Sync
│   │   │   └── i18n/
│   │   └── vite.config.ts
│   │
│   ├── desktop_electron/                    # Electron app
│   │   ├── main/                            # Electron main process (Node)
│   │   │   ├── index.ts
│   │   │   ├── window.ts
│   │   │   ├── ipc/                         # IPC handlers
│   │   │   ├── auto_update/
│   │   │   ├── secure_storage/              # keytar
│   │   │   ├── printing/                    # POS / invoice printing
│   │   │   ├── peripherals/                 # Barcode, scale, cash drawer
│   │   │   ├── sqlite/                      # better-sqlite3 driver
│   │   │   └── sync_engine/                 # Native sync coordinator
│   │   ├── preload/                         # Context-isolated bridge
│   │   ├── renderer/                        # Same React/Vue UI as PWA
│   │   ├── resources/                       # Icons, signed app metadata
│   │   ├── builder/                         # electron-builder config
│   │   └── package.json
│   │
│   └── mobile/                              # (Optional) Flutter/React Native
│
├── infra/
│   ├── docker/
│   │   ├── django/Dockerfile
│   │   ├── fastapi/Dockerfile
│   │   ├── worker/Dockerfile
│   │   ├── beat/Dockerfile
│   │   ├── ws/Dockerfile
│   │   ├── nginx/Dockerfile
│   │   └── pwa/Dockerfile
│   ├── compose/
│   │   ├── docker-compose.yml               # Dev
│   │   ├── docker-compose.staging.yml
│   │   └── docker-compose.prod.yml
│   ├── k8s/
│   │   ├── base/                            # Kustomize base
│   │   ├── overlays/dev|staging|prod/
│   │   ├── helm/erp-api|fastapi|worker|ws|pwa/
│   │   └── charts/                          # External: postgres, redis, kafka, etc.
│   ├── terraform/                           # IaC
│   ├── ansible/                             # Single-VPS deployments
│   ├── nginx/                               # Reverse-proxy configs
│   ├── postgres/
│   │   ├── init/                            # extensions, roles
│   │   ├── ha/                              # Patroni configs
│   │   └── pgbouncer/
│   ├── redis/
│   ├── observability/
│   │   ├── prometheus/
│   │   ├── grafana/
│   │   ├── loki/
│   │   ├── tempo/
│   │   └── otel-collector/
│   ├── backups/                             # Backup scripts, restore runbooks
│   └── ci_cd/
│       ├── github-actions/
│       └── gitlab-ci/
│
├── contracts/                               # Cross-runtime contracts
│   ├── openapi/                             # Generated OpenAPI specs (versioned)
│   ├── jsonschema/
│   ├── proto/                               # gRPC (future internal services)
│   └── events/                              # Domain event schemas (Avro/JSON)
│
├── docs/
│   ├── architecture/                        # This document + ADRs
│   ├── adr/                                 # Architecture Decision Records
│   ├── runbooks/
│   ├── api/
│   └── modules/
│
├── tools/                                   # Internal CLIs (tenant ops, sync sim)
├── scripts/                                 # Bash automations
├── tests/                                   # Cross-cutting integration / e2e
│   ├── e2e/                                 # Playwright / Cypress
│   ├── load/                                # k6 / Locust
│   ├── chaos/                               # Litmus / Chaos Mesh
│   ├── contract/                            # Pact / consumer-driven
│   └── sync_sim/                            # Deterministic sync simulator
└── README.md
```

**Layout rationale:**
- **Strict separation** between Django (transactional CRUD + business workflows), FastAPI (high-throughput async: sync, reporting, public API, webhooks), Celery workers, Channels WS.
- `shared/domain/` holds pure business logic (costing, posting, tax) reusable from both Django and FastAPI without circular imports.
- `eventbus/` isolates broker semantics from app logic — switch between Redis Streams / RabbitMQ / Kafka without app rewrites.
- `contracts/` is the **single source of truth** for API and event contracts.
- Modules under `apps/` are organized by **business domain**, not Django technical concerns — every domain has its own models/, services/, tasks/, signals/, tests/.

---

# 2. MULTI-TENANT DATABASE ARCHITECTURE

## 2.1 Tenancy Model — Hybrid

We use a **hybrid model** because no single approach scales economically across plan tiers:

| Plan Tier      | Strategy                          | Reason                                          |
|----------------|-----------------------------------|-------------------------------------------------|
| Starter        | Shared schema, `tenant_id` column | Density: 1000s of small tenants per DB          |
| Professional   | Schema-per-tenant (PostgreSQL)    | Strong isolation, per-tenant backup/restore     |
| Enterprise     | Database-per-tenant + read replica| Hard isolation, custom tuning, compliance       |
| On-Prem        | Single dedicated DB               | Customer-owned infrastructure                   |

The application code is **tenancy-mode agnostic** through a `TenantContext` resolver that returns either a `search_path` (schema mode) or injects a `tenant_id` filter (row-level mode).

## 2.2 Public (Shared) Schema

The `public` schema holds tenant metadata only — never business data.

```
public schema
├── tenant                       (id, slug, name, mode, plan_id, status, region, created_at)
├── tenant_domain                (id, tenant_id, domain, is_primary, is_verified)
├── tenant_database              (id, tenant_id, dsn_secret_ref, schema_name)
├── plan                         (id, code, name, edition, modules[], limits jsonb)
├── subscription                 (id, tenant_id, plan_id, status, period, trial_ends, renews_at)
├── invoice                      (id, tenant_id, period, total, currency, status, pdf_ref)
├── license                      (id, tenant_id, edition, modules[], hw_fingerprint, signature, valid_from, valid_to)
├── feature_flag                 (id, key, scope, tenant_ids[], rollout_pct)
├── system_user                  (id, email, role, mfa_enabled)   -- platform admins
├── audit_platform               (immutable, append-only, partitioned)
├── job_registry                 (id, tenant_id, type, status, payload jsonb)
└── usage_event                  (id, tenant_id, kind, qty, ts)   -- metered billing
```

## 2.3 Tenant Schema (Schema-per-tenant mode)

Each tenant gets a PostgreSQL schema named `t_<tenant_uuid_short>`. All business tables live here.

```
t_<tenant>/
├── company                  (legal entities)
├── branch                   (multi-branch)
├── warehouse / warehouse_zone / warehouse_bin
├── partner / contact / address
├── item / item_variant / item_uom / item_barcode
├── price_list / price_list_item
├── tax_code / tax_jurisdiction
├── chart_of_account / cost_center / project_dimension
├── fiscal_year / fiscal_period
├── numbering_series
├── ...
├── purchase_order / po_line / grn / grn_line / purchase_invoice
├── sales_order / so_line / delivery / sales_invoice
├── stock_ledger_entry        (immutable, partitioned by month)
├── stock_layer               (FIFO/LIFO layers)
├── stock_reservation
├── batch / serial_no
├── journal_entry / journal_line
├── general_ledger_entry      (posted GL, partitioned by period)
├── ar_subledger / ap_subledger
├── audit_log                 (per-tenant, partitioned, hash-chained)
├── outbox                    (event outbox for sync + integrations)
├── inbox                     (idempotent inbound events)
├── sync_cursor               (per-device sync watermark)
├── attachment / attachment_link
└── document_number_sequence  (atomic counters per series/branch)
```

## 2.4 Tenant Routing

```
Request → Edge (CDN/WAF) → Ingress
       → Identify tenant by:
           1. Custom domain    (acme.com)
           2. Subdomain        (acme.erp.app)
           3. JWT claim        (tid)
           4. X-Tenant-Id      (server-to-server only, HMAC-signed)
       → Resolve TenantContext from cache (Redis: tenant:<id>)
       → Set DB search_path or tenant_id filter
       → Open transaction
       → Dispatch to view/router
```

`TenantContext` is stored in a `contextvars.ContextVar` for async safety in FastAPI and middleware-set in Django. **No global state.** **No request-scoped singletons leaking across tenants.**

## 2.5 Connection Pooling

- **PgBouncer** in transaction-pooling mode in front of every PostgreSQL primary.
- Per-tenant search_path is set with `SET LOCAL search_path = ...` inside each transaction (compatible with transaction pooling).
- Application connection pool sizing: `(workers × threads) ≤ pgbouncer pool size`.
- Long-running reports use a **dedicated read-replica DSN** to avoid blocking OLTP.

## 2.6 Partitioning Strategy

Tables that grow unbounded are **range-partitioned**:

| Table                  | Partition Key        | Retention            |
|------------------------|----------------------|----------------------|
| stock_ledger_entry     | posting_date (month) | Forever (archive after 5y) |
| general_ledger_entry   | posting_date (month) | Forever              |
| audit_log              | created_at (month)   | 7 years              |
| outbox                 | created_at (day)     | Trim after consumed + 14d |
| notification           | created_at (week)    | 90 days              |
| pos_transaction        | created_at (day)     | Forever              |

Indexes on partitioned tables are local; queries always include the partition key.

## 2.7 Indexing & Concurrency Rules

- **Every** tenant table has `(tenant_id, ...)` composite indexes (shared-schema) or branch-scoped composite indexes (schema-per-tenant).
- **Optimistic locking** via `row_version` (bigint) on all editable business documents.
- **Pessimistic locking** (`SELECT … FOR UPDATE`) only inside posting paths (stock, GL).
- **Advisory locks** for serial document numbering: `pg_advisory_xact_lock(hashtext('numbering:'||series||':'||branch))`.
- All financial computations done in **`numeric(28,8)`** (NUMERIC, never floats).

## 2.8 Tenant Lifecycle

```
PROVISIONING  →  ACTIVE  →  SUSPENDED  →  ARCHIVED  →  DELETED
                    ↓
                 TRIAL → expired → SUSPENDED
```

- **Provision:** create schema, run migrations on that schema, seed CoA/UOM/roles, create owner user, generate API keys, register license.
- **Suspend:** revoke JWT keys, refuse logins, freeze writes (read-only mode), keep data.
- **Archive:** export full schema to encrypted object storage, drop schema after 30-day grace.
- **Delete:** GDPR-compliant erasure runbook with verifiable proof.

---

# 3. MULTI-COMPANY / MULTI-BRANCH / WAREHOUSE ARCHITECTURE

## 3.1 Hierarchy

```
Tenant
└── Company (legal entity, own CoA optional, currency, tax registration)
    └── Branch (operational unit: store, depot, office, factory)
        └── Warehouse (storage facility, virtual or physical)
            └── Zone (receiving, putaway, picking, dispatch, returns, quarantine)
                └── Bin / Location (rack-row-shelf-bin)
```

A tenant can have **N companies**. A company has **N branches**. A branch has **N warehouses**. POS terminals belong to a branch.

## 3.2 Multi-Company Specifics

- Each `company` has: `base_currency`, `country`, `tax_registration_no`, `fiscal_year_pattern`, **own CoA** (optionally inherited from a tenant template), own document numbering, own posting calendar.
- **Inter-company transactions** go through clearing accounts (e.g., "Due from Company A" / "Due to Company A"). Eliminations handled at consolidation (§31).
- **Consolidation:** roll-up by ownership %; eliminations of inter-company AR/AP, inventory, revenue, payables.
- **Currency translation:** each company posts in its base currency; consolidation translates to group currency at closing/avg/historical rates per IFRS / GAAP.
- **Per-company users:** a user is granted access to one or more companies via `user_company_access`.

## 3.3 Multi-Branch Specifics

Every transactional document carries:

- `tenant_id` (implicit when schema-per-tenant)
- `company_id`
- `branch_id`
- `warehouse_id` (where applicable)
- `cost_center_id` (optional)
- `project_id` (optional)
- `fiscal_period_id`
- `posting_date`

**Cross-branch movement is never an UPDATE — always a TRANSFER document** (Stock Transfer / Internal Transfer Order). **Cross-company movement** additionally posts inter-company JE through clearing accounts.

### Branch numbering

Per-branch document numbering with prefixes:
- `INV/HQ/2026/000123`, `INV/DXB/2026/000045`
- Stored in `numbering_series(company_id, branch_id, doc_type, prefix, padding, current)`.
- Atomic counter under advisory lock for **gap-free** sequences (when required by tax law) or PostgreSQL sequences for non-blocking, gappable IDs.

## 3.4 Warehouse Management

```
warehouse
├── id, code, name, type (REGULAR, TRANSIT, BONDED, QUARANTINE, RETURNS, VIRTUAL)
├── company_id / branch_id
├── address, geo (lat/lng)
├── timezone
├── valuation_method_override (nullable)
├── allow_negative_stock (bool, configurable)
└── status

warehouse_zone     (id, warehouse_id, code, type, capacity_uom, capacity)
warehouse_bin      (id, zone_id, code, full_path, max_qty, max_weight, max_volume,
                    pickable, putawayable, locked, last_count_at)
bin_item_constraint (bin_id, item_id|category_id, allow|deny)   -- e.g., haz-mat zones
```

### Warehouse capabilities

- **Putaway strategy:** fixed bin per item, ABC-class-based, nearest-empty, height-restricted, mixed/single-batch, hazmat-segregation.
- **Picking strategy:** FIFO/FEFO, batch-pick, wave-pick, zone-pick, cluster-pick.
- **Replenishment:** Min/Max, fixed-period, demand-driven (DDMRP-style buffers).
- **Cross-docking:** receipt directly routed to outbound staging.
- **License-plate (LPN):** logical container (pallet/carton) tracked as a movable unit holding bins of stock.
- **Cycle counts:** ABC-frequency, location-based, item-based, blind/non-blind counting with variance posting.

## 3.5 Branch-Scoped Permissions

Permissions resolve in three layers (full detail in §7):

1. **Role permission** — what actions the role can perform (RBAC).
2. **Branch/Company scope** — which branches/companies the user can act on (`user_branch_access`, `user_company_access`).
3. **Object scope** — row-level constraints (e.g., "only own salesperson's quotations") via ABAC predicates.

## 3.6 Inter-Branch Transfers

Transfers post **two** stock ledger entries (out at source, in at destination) and optionally an inter-branch GL entry through a clearing account when companies differ. Transfers have states:

```
DRAFT → ISSUED → IN_TRANSIT → RECEIVED → CLOSED
                       ↘ DISCREPANCY → ADJUSTED → CLOSED
```

In-transit stock sits in a virtual `TRANSIT` warehouse owned by the source company. Discrepancy at receipt creates a variance JE.

## 3.7 Branch Reporting

- All reports take a `branch_id[]` and `company_id[]` filter.
- Consolidation rolls up branches → companies → tenant (group).
- Materialized views per `(branch_id, period)` for stock balance and GL trial balance, refreshed on close-of-day.

---

# 4. INVENTORY TRANSACTION FLOW

## 4.1 Core Principle — Stock Ledger is Immutable

`stock_ledger_entry` is **append-only**. Corrections are made through reversing entries — never by `UPDATE` or `DELETE`. This makes inventory auditable and reconcilable with accounting.

## 4.2 Stock Ledger Entry Schema (logical)

```
stock_ledger_entry
├── id                     uuid
├── posting_datetime       timestamptz   (HLC + wall clock)
├── posting_date           date          (partition key)
├── voucher_type           enum          (GRN, DELIVERY, TRANSFER_OUT, TRANSFER_IN,
│                                          ADJUSTMENT, OPENING, RETURN_IN, RETURN_OUT,
│                                          POS_SALE, MFG_CONSUME, MFG_PRODUCE, REVAL)
├── voucher_id             uuid
├── voucher_line_id        uuid
├── company_id / branch_id / warehouse_id / bin_id
├── item_id / variant_id
├── batch_id / serial_no_id        (nullable)
├── uom_id / qty_in_base_uom       numeric(28,8)
├── direction              enum (IN, OUT)
├── stock_value_change     numeric(28,8) (signed, in company currency)
├── valuation_rate         numeric(28,8)
├── balance_qty            numeric(28,8) (running balance per item/warehouse/batch)
├── balance_value          numeric(28,8)
├── fiscal_period_id
├── posted_by / posted_at
├── reversal_of_id         uuid           (nullable, points to original)
├── is_reversed            boolean
├── correlation_id         uuid           (groups entries from one voucher)
└── meta                   jsonb
```

## 4.3 Posting Pipeline

Every inventory-affecting document goes through a **single posting service**:

```
POST(voucher) {
  1. Validate header + lines (qty > 0, item active, warehouse open, period not locked)
  2. Acquire locks:
       - SELECT FOR UPDATE on item_warehouse_balance(item, warehouse, batch)
       - Advisory lock on (item, warehouse) for valuation safety
  3. For each line:
       a. Compute valuation rate using configured method (see §30):
            - Moving Average / FIFO / LIFO / Standard / Specific
       b. Append stock_ledger_entry (direction, qty, value, rate, balance)
       c. Update item_warehouse_balance (cached running balance)
       d. Update batch_balance / serial_status if applicable
       e. Release/consume reservations linked to this voucher
  4. Build accounting JE (see §5, §31) and append to journal staging
  5. Insert outbox event (StockPosted) — single transaction
  6. Commit
}
```

## 4.4 Reservations

```
SO confirmed → soft reservation (planned demand, doesn't block stock)
Pick list / DO created → hard reservation (decrements available_qty)
Delivery posted → reservation consumed → stock_ledger OUT
SO cancelled → reservation released
```

`available_qty = on_hand_qty − hard_reserved_qty`

Reservations expire on a configurable horizon (e.g., 7 days) to prevent ghost holds.

## 4.5 Negative Stock Policy

Per-item or per-warehouse policy:
- **Strict:** posting blocked if balance would go negative.
- **Allowed with warning:** logged in `stock_anomaly` table, requires re-valuation later.
- **Allowed silently:** for back-dated corrections only, with role permission.

## 4.6 Batch / Serial Tracking

- **Batch:** lot, manufacture date, expiry, supplier ref. Stock entries reference `batch_id`. FEFO supported.
- **Serial:** unique per unit. Each serial transitions: `IN_STOCK → DELIVERED → RETURNED → SCRAPPED`. Movements append to `serial_movement_log`.

## 4.7 Cycle Count & Adjustments

- Cycle counts produce a `count_sheet` (expected vs. counted qty).
- Variance → `stock_adjustment` voucher → posts both stock ledger and inventory variance JE.

## 4.8 Concurrency & Idempotency

- Every posting carries an `idempotency_key`. Re-posting with same key returns the original result, never re-posts.
- Cross-document operations (GRN posts → Bill matches → Payment) use the **outbox pattern** for eventual consistency without 2PC.

## 4.9 Inventory ↔ Accounting Linkage

Every stock ledger entry that has financial impact emits **exactly one** accounting JE through the posting pipeline. The `stock_ledger_entry.correlation_id` equals `journal_entry.correlation_id`, allowing a "Stock Ledger ↔ GL Tie-Out" report.

---

# 5. ACCOUNTING TRANSACTION FLOW

## 5.1 Core Principle — Strict Double-Entry

Every posted journal entry **must balance** (`SUM(debit) = SUM(credit)`) per currency, per company. Enforced at:

- Domain layer (service refuses to build unbalanced JE)
- DB layer (deferred constraint trigger on commit)

## 5.2 Chart of Accounts

```
account
├── id, code, name, type (ASSET/LIABILITY/EQUITY/INCOME/EXPENSE)
├── subtype (CASH, BANK, AR, INVENTORY, COGS, REVENUE, TAX_PAYABLE, …)
├── parent_id (hierarchy)
├── is_group (boolean — group accounts can't be posted to)
├── currency_id (nullable for multi-currency accounts)
├── company_id
├── is_reconcilable (banks, AR, AP)
├── default_dim (cost_center_id, project_id) — optional
└── status
```

Default CoA templates per region (US-GAAP, IFRS, India, GCC, BD) seeded at tenant provisioning.

## 5.3 Journal Entry Schema

```
journal_entry
├── id, voucher_no
├── company_id / branch_id
├── posting_date / fiscal_period_id
├── source_doc_type / source_doc_id     -- e.g. SALES_INVOICE / <id>
├── currency_id / exchange_rate
├── status (DRAFT/POSTED/REVERSED)
├── reversal_of_id
├── correlation_id
├── created_by / posted_by / posted_at
└── meta jsonb

journal_line
├── id, je_id
├── account_id
├── debit / credit                      numeric(28,8)
├── currency_id / fx_amount / fx_rate
├── party_type / party_id               -- customer/supplier/employee
├── cost_center_id / project_id / branch_id
├── reference (against_doc_type, against_doc_id)
├── description
└── line_no
```

## 5.4 Posting Lifecycle

```
DRAFT → VALIDATED → POSTED → (optionally) REVERSED
              ↘ REJECTED
```

- DRAFT: editable.
- VALIDATED: balance check passed, period open, accounts valid, dimensions valid.
- POSTED: written to `general_ledger_entry`, party balances updated, immutable.
- REVERSED: opposite-sign JE posted with `reversal_of_id` link. **Original never deleted.**

## 5.5 Subledger Architecture

Subledgers are derived from posted JEs through outbox events:

| Subledger        | Source                              | Reconciles To           |
|------------------|-------------------------------------|-------------------------|
| AR               | JE lines where account.subtype=AR   | Customer balances       |
| AP               | JE lines where account.subtype=AP   | Supplier balances       |
| Inventory ledger | Stock ledger entries                | Inventory account in GL |
| Tax              | JE lines where account.subtype=TAX  | Tax filings             |
| Bank             | JE lines where account.subtype=BANK | Bank statements (recon) |
| Fixed Assets     | Asset register                      | Asset accounts in GL    |

Tie-out reports run nightly and raise alerts on discrepancy > tolerance.

## 5.6 Multi-Currency

- Every monetary line stores **both** transaction currency and base currency amount.
- Exchange rate fetched from `exchange_rate(currency, date)`.
- **Revaluation** at period-end posts unrealized FX gain/loss on AR/AP/Bank balances using closing rate.
- **Realized** FX gain/loss posted at settlement.

## 5.7 Fiscal Period Control

```
fiscal_period
├── id, fy_id, name, start, end
├── status: OPEN, SOFT_CLOSE, CLOSED, LOCKED
```

Posting rejected when period is CLOSED/LOCKED unless caller has `accounting.post_to_closed_period` permission. Closing a period freezes balances into `period_closing_balance` for fast TB/BS queries.

## 5.8 Standard Posting Rules (Auto-JE templates)

| Source Document        | Debit                          | Credit                         |
|------------------------|--------------------------------|--------------------------------|
| Sales Invoice          | AR                             | Revenue, Tax Payable           |
| Cost of Sale (auto)    | COGS                           | Inventory                      |
| Customer Receipt       | Bank/Cash                      | AR                             |
| Purchase Invoice       | Inventory/Expense, Tax Recv.   | AP                             |
| GRN (perpetual)        | Inventory                      | GR/IR clearing                 |
| Bill against GRN       | GR/IR clearing, Tax Recv.      | AP                             |
| Supplier Payment       | AP                             | Bank/Cash                      |
| Stock Adjustment       | Inv Variance OR Inventory      | Inventory OR Inv Variance      |
| Inter-branch Transfer  | Inv (dest)                     | Inv (source)                   |
| Inter-company Transfer | Inv (dest), IC Receivable      | Inv (source), IC Payable       |
| Payroll Posting        | Salary Exp., Tax Exp., …       | Salary Payable, Tax Payable, … |

Rules encoded in `shared/domain/accounting/posting_rules/` as pure functions `(document, context) → JE`. Full engine in §31.

## 5.9 Financial Statements

Generated by deterministic queries against partitioned `general_ledger_entry`:

- **Trial Balance:** sum debit/credit per account per period.
- **Balance Sheet:** balances on/before date, classified by account.subtype.
- **Profit & Loss:** sums of income/expense in period.
- **Cash Flow:** indirect method using P&L + balance changes.

All reports support multi-currency presentation and cost-center / project / branch dimensions.

---

# 6. AUTHENTICATION ARCHITECTURE

## 6.1 Identity Model

```
user
├── id (uuid)
├── email (unique global) / phone (unique global)
├── password_hash (Argon2id)
├── status (PENDING, ACTIVE, LOCKED, DISABLED)
├── mfa_methods []
├── last_login, failed_attempts, lockout_until
└── platform_role (SUPER_ADMIN, SUPPORT, NONE)

tenant_user                  (id, tenant_id, user_id, status, employee_id, primary_branch_id)
device                       (id, user_id, fingerprint, name, platform, last_seen, trusted)
session                      (id, user_id, device_id, refresh_token_hash, ip, ua, expires_at, revoked)
api_key                      (id, owner_type, owner_id, hashed_secret, scopes[], expires_at)
```

A **user** is global; a user becomes active in a tenant via `tenant_user`. Same email can belong to multiple tenants.

## 6.2 Token Strategy

- **Access token:** JWT, 5 min TTL, signed with **RS256** using a tenant-scoped key (kid) rotated quarterly. Claims: `sub, tid, sid, did, scope, iat, exp, jti`. **Roles/permissions are NOT in the JWT** (they change at runtime; see §7).
- **Refresh token:** opaque random 256-bit, stored hashed in `session`, 30-day sliding TTL, rotated on every use; reuse detection revokes the entire device session family.
- **Service token (S2S):** mTLS client cert + signed JWT.
- **Offline token:** long-lived (configurable, e.g. 30d) device-bound JWT used by Electron/PWA when offline; encrypted at rest in OS keyring (Electron) or non-extractable WebCrypto key (PWA).

## 6.3 Login Flow (Online)

```
1. POST /auth/login {email, password, captcha?}
2. Throttle by IP + email (Redis token bucket)
3. Verify password (Argon2id) — constant time
4. If MFA enabled → respond 200 with mfa_required=true + ticket (60s)
5. POST /auth/mfa/verify {ticket, otp}
6. Issue access + refresh, register/refresh device
7. Audit: AUTH_LOGIN_SUCCESS
```

## 6.4 MFA

Supported methods: **TOTP (RFC 6238), WebAuthn/FIDO2 (preferred for enterprise), SMS, Email OTP, Backup codes.** Tenants can enforce MFA per role.

## 6.5 SSO

- **OIDC** (Google, Microsoft, Okta) — JIT provisioning of `tenant_user` based on email domain mapping.
- **SAML 2.0** for enterprise plans.
- **SCIM 2.0** for user provisioning/deprovisioning from IdP.

## 6.6 Session Management

- All active sessions visible to user; can revoke individually.
- Admin can force logout per user / per device / per tenant.
- Refresh-token theft detection: replay → revoke session family + alert user + audit.

## 6.7 Password & Credential Security

- Argon2id (memCost ≥ 64MB, timeCost ≥ 3, parallelism = 1 per request).
- Password policy per tenant (min length, complexity, no-reuse last N, max age).
- Breach check against HIBP k-anonymity API (optional).
- Credential rotation enforced for service accounts.

## 6.8 Device Trust & Offline Auth

When an Electron/PWA client registers, it generates a device keypair (Ed25519). Public key stored on server, private key in OS keyring / non-extractable WebCrypto. Offline tokens are signed by the server, and the **device proves liveness** by signing local challenges, preventing token theft from disk.

## 6.9 Auth Event Audit

Every auth event (`LOGIN_SUCCESS, LOGIN_FAIL, MFA_FAIL, TOKEN_REFRESH, REVOKE, ROLE_GRANT, …`) appended to `audit_log` with IP, UA, geo, risk score (full pipeline in §8).

---

# 7. RBAC PERMISSION ARCHITECTURE

## 7.1 Three-Layer Model

```
Layer 1: RBAC          — what actions are allowed by role
Layer 2: Scope         — within which company/branch/warehouse boundary
Layer 3: ABAC predicate — row-level conditions (DSL) evaluated per request
```

## 7.2 Schema

```
permission
├── code             text unique (e.g., "sales.invoice.create")
├── module           text (e.g., "sales")
├── object           text (e.g., "invoice")
├── action           text (e.g., "create", "read", "update", "delete", "post", "void", "approve")
├── kind             enum (CRUD, ACTION, REPORT, ADMIN)
└── description

role
├── id, code, name, tenant_id (nullable for system roles)
├── parent_id (inheritance — child inherits parent perms)
├── kind (SYSTEM, TENANT_DEFAULT, CUSTOM)
└── module_scope[] (modules role applies to)

role_permission       (role_id, permission_code)
user_role             (user_id, role_id, tenant_id, valid_from, valid_to)
user_company_access   (user_id, company_id, default)
user_branch_access    (user_id, branch_id, role_id, default)
user_warehouse_access (user_id, warehouse_id)
```

System roles (immutable defaults): `OWNER, ADMIN, ACCOUNTANT, SALES_MANAGER, SALESPERSON, PURCHASER, STORE_KEEPER, CASHIER, AUDITOR_READ_ONLY, API_INTEGRATION`.

## 7.3 Permission Codes

Strict three-part naming: `<module>.<object>.<action>`.

Examples:
```
sales.invoice.create
sales.invoice.update
sales.invoice.post
sales.invoice.void
sales.invoice.read
sales.invoice.report
inventory.stock.adjust
inventory.stock.transfer
accounting.je.post
accounting.period.close
admin.user.invite
admin.role.manage
```

Special codes: `*.*.*` (super), `<module>.*.*` (module admin), `<module>.<object>.*` (object admin).

## 7.4 ABAC Policy DSL

Stored per tenant in `policy_rule`:

```
{
  "subject": { "permission": "sales.quotation.update" },
  "effect":  "ALLOW" | "DENY",
  "when": {
    "all": [
      { "any": [
          { "expr": "resource.owner_id == user.id" },
          { "expr": "user.has_role('SalesManager')" }
      ] },
      { "expr": "resource.branch_id in user.branches" },
      { "expr": "resource.status != 'POSTED'" }
    ]
  },
  "obligations": ["audit:elevated"]
}
```

DSL features:
- safe expression language (no arbitrary code), parsed to AST and evaluated.
- variables: `user.*`, `resource.*`, `tenant.*`, `now`, `request.*`.
- helpers: `has_role`, `in`, `between`, `not`, `match`.
- short-circuit, deterministic, side-effect-free.

## 7.5 Permission Resolution Algorithm

```
authorize(user, action, resource):
  # Layer 1 — RBAC
  perms = roles_to_perms(user.active_roles)         # cached per (tenant, user)
  if action not in perms: return DENY

  # Layer 2 — Scope
  if resource.company_id and resource.company_id not in user.companies: return DENY
  if resource.branch_id  and resource.branch_id  not in user.branches:  return DENY

  # Layer 3 — ABAC
  rules = policy_rules_for(action)
  decision = evaluate(rules, user, resource, now)   # DENY > ALLOW (deny-wins)

  if decision == ALLOW:
      record_obligations(decision.obligations)
      return ALLOW
  return DENY
```

Deny-wins semantics. Default deny.

## 7.6 Enforcement Points

1. **API Gateway / Middleware:** drop early on missing module/permission.
2. **DRF Permission classes & FastAPI dependencies:** route-level RBAC.
3. **Object-level (mixin / dependency):** Layer 2 scope check.
4. **Service layer:** Layer 3 ABAC + business invariants (final defense).
5. **DB Row-Level Security (RLS):** for shared-schema tenants, RLS forces `tenant_id = current_setting('app.tenant_id')` even if app code forgets.

## 7.7 Caching & Invalidation

- `perm:user:<id>` cached in Redis (TTL 5 min).
- Invalidated on: role change, role-perm change, tenant_user status change, password change.
- Push invalidation via pub/sub (`acl_invalidate` channel) so all app pods drop their local LRU.

## 7.8 Delegation & Time-Bound Roles

`user_role` carries `valid_from`/`valid_to`. Useful for:
- Vacation cover (delegate approval temporarily).
- Audit reviewer (read-only access for a quarter).
- Trial admin elevation (auto-expire).

Delegation is itself a permission (`admin.role.delegate`).

## 7.9 Approval Matrix

```
approval_rule
├── id, doc_type, condition (DSL: amount>10000, currency=USD, customer_segment='KEY')
├── steps[]  -- ordered list of approver groups (role or user-list)
└── escalation (timeout → next step)
```

Documents requiring approval enter `PENDING_APPROVAL` status; cannot post until all steps approve. Each approval is audit-logged with reason and signature.

## 7.10 Field-Level Permissions (Optional)

For sensitive fields (salary, cost price), `field_permission(role_id, model, field, mode)` masks/hides data in serializers. Server enforces, client merely reflects.

---

# 8. AUDIT LOGGING ARCHITECTURE

## 8.1 Goals

- **Immutability:** logs cannot be silently modified.
- **Tamper-evidence:** any modification is detectable.
- **Coverage:** auth, data CRUD on sensitive tables, admin, security, and business actions.
- **Performance:** writes must not block business transactions.
- **Searchability:** investigations need fast filtering by actor, target, time, action.

## 8.2 Schema

```
audit_log                    (per-tenant, partitioned by month)
├── id                  uuidv7
├── ts                  timestamptz (with HLC)
├── actor_type          enum (USER, SYSTEM, INTEGRATION, JOB)
├── actor_id            uuid
├── tenant_id, company_id, branch_id
├── action              text (dotted, e.g., "sales.invoice.update")
├── object_type         text
├── object_id           uuid
├── before              jsonb (sensitive fields redacted)
├── after               jsonb (sensitive fields redacted)
├── diff                jsonb (computed)
├── ip / user_agent / device_id / session_id
├── correlation_id      uuid (request id)
├── outcome             enum (SUCCESS, FAILURE, DENIED)
├── reason              text
├── obligations         text[]
├── prev_hash           bytea
├── row_hash            bytea (=H(prev_hash || canonical_row))
└── chain_seq           bigserial
```

The hash chain runs per `(tenant_id, partition_month)` so verification can be parallelized.

## 8.3 Categories

- **AUTH:** login/logout, MFA, token refresh, password change, session revoke.
- **IDENTITY:** user invite, deactivate, role grant, scope change.
- **DATA:** create/update/delete on sensitive entities (invoices, JE, stock, partner, item, payment).
- **ADMIN:** settings change, fiscal period close, approval policy edit, license install.
- **SECURITY:** denied access, anomaly, IP block, key rotation.
- **BUSINESS:** post/void/reverse documents, transfers, manual JE.

Coverage is enforced via:
- Django signals on `AuditedModel` mixin.
- DRF/FastAPI middleware capturing request envelope.
- Service-layer explicit `audit.record(...)` calls for non-CRUD events.

## 8.4 Write Path (Non-Blocking)

```
business txn:
  ... do work ...
  audit_buffer.append(entry)         -- in-memory buffer
  COMMIT
post_commit hook:
  outbox.write(entry)                -- transactional outbox
outbox_relay worker:
  read batch → compute hash chain → INSERT into audit_log
  also publish to SIEM topic
```

Audit writes are separated from business commits to prevent audit pressure from breaking business flow, while the outbox guarantees eventual durability and ordering.

## 8.5 Tamper-Evidence

- Per-tenant **chain root** stored in a separate, write-once table `audit_chain_anchor` and periodically anchored to:
  - An external KMS-signed timestamp (RFC 3161) every hour.
  - Optionally to a managed transparency log / blockchain anchor for high-compliance plans.
- A scheduled `audit_verify` job re-hashes the chain and alerts on mismatch.
- Database role for `audit_log` is **INSERT-only** for the application; only DBA + verify-job can read.

## 8.6 Retention

| Category    | Retention   | Note                                       |
|-------------|-------------|--------------------------------------------|
| AUTH        | 2 years     |                                            |
| SECURITY    | 7 years     | Compliance baseline                        |
| BUSINESS    | 7 years     | Tax / regulatory                           |
| DATA        | 5 years     | Configurable per tenant                    |
| ADMIN       | 7 years     |                                            |

Old partitions detached and archived to encrypted object storage with object-lock (compliance mode). Re-attachable for queries via foreign tables (postgres_fdw).

## 8.7 PII Handling

- Sensitive fields (`password_hash`, `tax_id`, `bank_account`, `salary`) are **never** written to audit; only their **hash** is recorded.
- Free-text `before/after` payloads passed through a redactor with a per-tenant rule set.
- Right-to-be-forgotten: pseudonymize the actor reference but keep audit chain integrity (do not delete rows).

## 8.8 Search & Investigation

- Hot search via OpenSearch (audit index, last 90 days).
- Cold queries via PostgreSQL partitioned table with BRIN indexes on `ts` and GIN indexes on `(actor_id, action, object_id)`.
- Pre-built investigator views: "user activity timeline", "object change history", "denied actions in last 24h", "after-hours admin actions".

## 8.9 SIEM Integration

- Outbound stream to Splunk / Elastic / Datadog / customer-supplied SIEM via Kafka or HTTPS push.
- Format: JSON with normalized fields (ECS-aligned).

## 8.10 Audit UI

- Read-only audit explorer in admin console.
- Permission `admin.audit.read` (rare; auditors only).
- All audit reads themselves are audited (meta-audit).

---

# 9. OFFLINE–ONLINE SYNCHRONIZATION ARCHITECTURE

## 9.1 Design Goals

- Clients (Electron + PWA) operate **fully offline** for sales, POS, stock viewing, basic CRM.
- Reconciliation is **deterministic**, conflict-aware, and **never corrupts financial records**.
- Server remains **authoritative** for transactional posting (stock ledger, GL).
- Sync survives partial failure, network flapping, clock skew, and concurrent edits.

## 9.2 Entity Sync Classes

| Class               | Examples                          | Sync Direction        | Conflict Policy                   |
|---------------------|-----------------------------------|-----------------------|-----------------------------------|
| **Reference (R)**   | items, partners, prices, taxes    | Server → Client       | Server-master, pull-only          |
| **Document (D)**    | quotation, SO drafts, leads       | Bi-directional        | LWW on `row_version` + HLC        |
| **Transactional (T)**| POS sale, GRN, payment           | Client → Server (push)| Server-validate-and-post; conflicts queued for review |
| **Append-only (A)** | activity log, attachments meta    | Bi-directional merge  | Merge by id; no conflict          |
| **Settings (S)**    | preferences, layouts              | Bi-directional        | Per-user, LWW                     |

Detail in §10.

## 9.3 Time & Ordering — Hybrid Logical Clock

All sync-relevant rows carry an HLC timestamp:
`hlc = (wall_ms, logical, node_id)`

- Wall-clock from device (NTP-disciplined; server rejects skew > 5 minutes).
- Logical counter increments on local writes within the same ms.
- Comparable across nodes, monotonic per node, drift-tolerant.

## 9.4 Local Storage

- **Electron:** SQLite (WAL mode), encrypted at rest with SQLCipher. Schema mirrors a curated subset of server schema.
- **PWA:** IndexedDB via Dexie.js with the same logical schema. Sensitive fields encrypted with WebCrypto AES-GCM using a key derived from device key + user passphrase.

## 9.5 Operation Log (Outbox on Client)

Every local write produces an entry in the client `op_log`:

```
op_log
├── id (uuidv7)
├── entity_type, entity_id
├── op (CREATE / UPDATE / DELETE / POST / VOID)
├── payload (jsonb)
├── prev_row_version
├── hlc
├── status (PENDING, UPLOADING, ACKED, FAILED, CONFLICT)
├── server_op_id
└── attempts, last_error
```

## 9.6 Sync Endpoints (FastAPI)

```
POST /sync/handshake
     → returns server time, schema_version, allowed entity classes,
       cursor reset signal, policy bundle.

POST /sync/pull
     body: { cursor, entity_classes[], device_id, hlc }
     → returns: { batch[], next_cursor, has_more, server_hlc }

POST /sync/push
     body: { ops[], client_hlc }
     → returns: { results[ {client_op_id, status, server_id?, conflict?} ],
                  server_hlc }

POST /sync/ack
     body: { acked_op_ids[] }

GET  /sync/status
     → device sync state, lag, last conflicts.
```

Pull is **cursor-based** per entity class: cursor = `(server_hlc, last_id)`. Pagination bounded (e.g., 500 rows/call).

## 9.7 Push Pipeline (Server)

```
For each op (in HLC order):
  1. Authenticate device + user, scope to tenant.
  2. Idempotency: lookup (device_id, client_op_id) in inbox. If found → return cached.
  3. Validate schema + permissions + license + branch scope.
  4. For Reference class: reject (read-only).
  5. For Document class:
       - If server_row.row_version == op.prev_row_version → apply update.
       - Else → conflict (see §10).
  6. For Transactional class:
       - Run domain validators (negative stock, period closed, balanced JE).
       - Post through standard posting service inside its own DB transaction.
       - On any business-rule failure → status=CONFLICT with reason.
  7. Append to inbox; insert into outbox event for downstream consumers.
  8. Return per-op result.
```

## 9.8 Pull Pipeline (Client)

```
1. Handshake (verify schema version; if mismatch → trigger client migration).
2. For each enabled entity class:
     - Pull from cursor, apply rows into local DB inside a transaction.
     - For each pulled row:
          if local row has uncommitted changes → mark CONFLICT_PENDING (do not overwrite).
          else → replace.
     - Advance cursor only after successful commit.
3. Push pending op_log batches (with backoff).
4. Reconcile: re-pull entities affected by acks (server may enrich computed fields).
```

## 9.9 Reservation & Stock Visibility Offline

Offline POS uses a **device stock budget**: server allocates a quantity per item per terminal at sync time. POS can sell up to that budget without contacting server. Re-allocation happens on each sync. This prevents two offline terminals overselling.

## 9.10 Anti-Tampering

- Local SQLite encrypted (SQLCipher) with a key derived from server-issued device key + user secret.
- All ops include a per-device monotonic sequence; gaps trigger investigation.
- Server signs `next_cursor` with HMAC, preventing cursor forgery.

## 9.11 Background Sync

- **PWA:** Background Sync API + periodic Service Worker fetch + Web Push trigger.
- **Electron:** OS-level background process; sync at boot, on focus, on network up, every N minutes.

---

# 10. SYNC CONFLICT RESOLUTION STRATEGY

## 10.1 Conflict Taxonomy

| Code | Type                    | Cause                                                 |
|------|-------------------------|-------------------------------------------------------|
| C1   | Write-Write (LWW)       | Two clients edited same Document field                |
| C2   | Stale Update            | Client uses outdated `row_version`                    |
| C3   | Schema Mismatch         | Client schema_version < server                        |
| C4   | Business-Rule Violation | Posting violates inventory/accounting rule            |
| C5   | Period Closed           | Posting attempted to a closed/locked period           |
| C6   | Permission Denied       | Action no longer allowed                              |
| C7   | Reference Drift         | Local references a server-side entity that changed/was deleted |
| C8   | Idempotency Replay      | Same op replayed (auto-resolved by inbox)             |
| C9   | Numbering Collision     | Two offline terminals issued same document number     |
| C10  | Reservation Conflict    | Stock budget exceeded by simultaneous offline sales   |
| C11  | Out-of-Order Ops        | Ops arrive at server before their causally-prior ops  |

## 10.2 Resolution Strategies (Per Class & Per Code)

| Class | C1            | C2          | C3              | C4–C5         | C6      | C7         | C9               | C10                   | C11           |
|-------|---------------|-------------|-----------------|---------------|---------|------------|------------------|-----------------------|---------------|
| R     | n/a (server-only) | n/a     | force upgrade   | n/a           | reject  | server wins| n/a              | n/a                   | n/a           |
| D     | LWW (HLC)     | server wins, surface diff | force upgrade | per-entity | reject | server wins (with notice)| renumber on sync | n/a   | server reorders by HLC |
| T     | n/a (no edits)| n/a         | force upgrade   | manual review | reject  | manual review | server-side renumber | rebalance budget | server reorders |
| A     | merge by id   | n/a         | tolerate (best-effort) | n/a    | reject  | drop & log    | n/a              | n/a                   | n/a           |
| S     | LWW per user  | LWW         | tolerate        | n/a           | reject  | drop & log    | n/a              | n/a                   | n/a           |

## 10.3 LWW Algorithm

```
winner = max(client_hlc, server_hlc)   # HLC compares (wall, logical, node_id)
losing version preserved in conflict_history for audit & replay.
```

## 10.4 Field-Level Merge (Document Class)

For documents with distinct, non-overlapping fields edited by different users, we apply **3-way merge**:

```
base = common ancestor row (server_row at row_version=op.prev_row_version)
local = client.after
remote = server.current

For each field:
  if local[f] == base[f]:        result[f] = remote[f]   # no local change
  elif remote[f] == base[f]:     result[f] = local[f]    # no remote change
  else:                          conflict_field(f) → LWW by HLC
```

Field-merge is enabled per entity (`merge_strategy: "3way" | "lww" | "manual"`). Financial documents always use `manual`.

## 10.5 Numbering Collision (C9)

- Offline POS uses a **draft prefix** (e.g., `INV/POS01/D000123`) until sync.
- On push, server replaces with **canonical** number from the appropriate `numbering_series`.
- Receipt printed offline shows draft number; reprint after sync replaces it (audit-logged).
- Original draft → canonical mapping stored in `pos_renumber_log` for support lookups.

## 10.6 Reservation/Budget Reallocation (C10)

```
Server keeps stock_budget(device_id, item_id, qty_available).
On sync push:
  consumed = sum of qty in synced sales for (device_id, item_id)
  if consumed > budget → conflict C10:
      excess sales marked CONFLICT_OVERSOLD
      server posts allocations FIFO until budget exhausted
      remaining are returned to user as "needs decision: refund / source from another warehouse / cancel"
```

## 10.7 Out-of-Order Ops (C11)

- Server **reorders within a batch** by HLC before applying.
- Across batches, server checks `prev_row_version` (causal chain). If a dependent op arrives before its cause, it is held in `pending_ops` for up to a grace window (e.g., 60s); if cause never arrives, op is rejected with C11 and surfaced.

## 10.8 Manual Resolution UI

For C4, C5, oversells (C10), and certain C1 cases on sensitive entities:

- A "Sync Issues" inbox is displayed in Electron/PWA.
- Each conflict shows: local version, server version, base, diff, suggested actions.
- Actions: `Retry`, `Discard local`, `Force overwrite`, `Edit & resubmit`, `Open as adjustment`.
- Permission `sync.conflict.resolve` required.
- Every resolution is audit-logged.

## 10.9 Determinism Guarantees

- Same input set + same server state → same resolution outcome.
- Resolution algorithm is pure and unit-tested with the **deterministic sync simulator** (§28) generating thousands of randomized op-graphs.

## 10.10 Compensation for Already-Posted Documents

If a transactional doc is posted and then a conflicting later edit arrives, server **never** silently mutates posted records. Instead:
- Generate a **reverse JE** + corrective doc proposal.
- Surface to user; require approval; audit.

This preserves financial immutability as a hard invariant.

---

# 11. API ARCHITECTURE

## 11.1 Service Topology

```
                                 ┌────────────────┐
                                 │   PWA / App    │
                                 └──────┬─────────┘
                                        │ HTTPS / WSS
                                 ┌──────▼─────────┐       ┌──────────────┐
                                 │    Ingress     │──────►│      WAF     │
                                 │  (Nginx/Envoy) │       └──────────────┘
                                 └──┬───────┬─────┘
              ┌─────────────────────┘       └─────────────┐
              ▼                                           ▼
     ┌──────────────────┐                        ┌────────────────────┐
     │   Django + DRF   │                        │      FastAPI       │
     │ (Business API,   │                        │ (Sync, Reporting,  │
     │  admin, auth)    │                        │ Webhooks, Public)  │
     └────────┬─────────┘                        └──────────┬─────────┘
              │ Channels (WS)                               │
              ▼                                             │
     ┌──────────────────┐                                   │
     │  WebSocket Tier  │                                   │
     │  (real-time)     │                                   │
     └────────┬─────────┘                                   │
              │                                             │
              └──────┬─────────────────────┬────────────────┘
                     ▼                     ▼
              ┌────────────┐        ┌────────────────┐
              │   Redis    │        │   PostgreSQL   │
              │ cache+pubsub        │   primary +    │
              │ +broker    │        │   replicas     │
              └────────────┘        └────────────────┘
                     ▲
                     │
              ┌────────────┐
              │  Celery    │
              │  Workers   │
              └────────────┘
```

## 11.2 API Surfaces

| Surface             | Tech                | Purpose                                                          |
|---------------------|---------------------|------------------------------------------------------------------|
| `/api/v1/...`       | DRF                 | All business CRUD, admin, auth, RBAC                            |
| `/sync/...`         | FastAPI             | High-throughput sync push/pull/ack                               |
| `/reports/...`      | FastAPI (async)     | Heavy reports, streaming responses                               |
| `/webhooks/...`     | FastAPI             | Outbound dispatcher + inbound receiver                           |
| `/public/v1/...`    | FastAPI             | Storefront / partner integrations (separate auth)                |
| `/ws/...`           | Django Channels     | Real-time notifications, live stock, dashboards                  |
| `/openapi.json`     | drf-spectacular     | Generated contract                                               |

## 11.3 Request Lifecycle (DRF)

```
1. Edge (Nginx) — TLS, rate limit, WAF
2. CorrelationMiddleware — assign/propagate request_id
3. AuthMiddleware — verify JWT, set user
4. TenantMiddleware — resolve tenant from host/jwt, set search_path
5. AuditMiddleware — record request envelope
6. PermissionDRF — RBAC + scope (Layer 1+2)
7. ThrottleDRF — per-tenant + per-user
8. ViewSet → Serializer → Service → Repository → DB
   (Service layer enforces ABAC, business invariants)
9. Response → ResponseMiddleware (CORS, security headers)
```

## 11.4 Pagination, Filtering, Sorting

- **Cursor pagination** by default for list endpoints (offset opt-in for small result sets).
- Standardized filter DSL: `?filter[branch_id]=...&filter[status]=POSTED&sort=-posting_date`.
- Field selection: `?fields=id,total,status` to reduce payload.
- `Prefer: return=minimal` for write endpoints to skip representation.

## 11.5 Error Contract

All errors follow **RFC 7807 Problem Details**, plus an internal `code`:

```
{
  "type": "https://errors.erp.app/inventory/negative-stock",
  "title": "Negative stock not allowed",
  "status": 409,
  "code": "INV.NEG_STOCK",
  "detail": "Item 'X' would be -5.0 in warehouse 'Y'",
  "instance": "urn:uuid:...",
  "context": { "item_id": "...", "warehouse_id": "..." }
}
```

## 11.6 Idempotency

All POST endpoints that create resources accept `Idempotency-Key` header. Server stores `(tenant, key) → response` for 24h.

## 11.7 Rate Limiting (multi-tier)

- **Tier 1:** per-IP at edge (Nginx/Cloudflare).
- **Tier 2:** per-user inside DRF (token bucket in Redis).
- **Tier 3:** per-tenant aggregate (protects against abusive integrations).
- Sync endpoints have higher limits but weighted by op-count.

## 11.8 Webhooks

- Outbox emits domain events; `webhook_dispatcher` worker delivers to subscribed URLs with HMAC-signed payload (`X-Signature`), exponential retry, DLQ.
- Inbound webhooks (e.g., payment gateway) verified by signature, stored in `inbox`, processed idempotently.

## 11.9 OpenAPI & SDKs

- `drf-spectacular` for DRF + native OpenAPI for FastAPI, **merged** into a single spec.
- Auto-generated SDKs (TypeScript, Python, Dart) published per release.

---

# 12. API VERSIONING STRATEGY

## 12.1 Versioning Scheme

- **URL major version:** `/api/v1`, `/api/v2` — for **breaking** changes only.
- **Header minor/patch:** `X-API-Version: 1.7.3` — for additive, backwards-compatible features.
- **Accept header media type negotiation** for unusual cases (e.g., reports formats: `application/vnd.erp.report.v2+json`).

## 12.2 Compatibility Rules

What is **breaking** (requires major bump):
- Removing or renaming a field/endpoint/method.
- Tightening validation (rejecting previously-accepted input).
- Changing semantics of a field or status code.
- Changing default behavior.

What is **non-breaking** (minor bump):
- Adding new endpoints.
- Adding new optional fields in response.
- Adding new optional query params.
- Adding new error codes (clients must tolerate unknowns).

## 12.3 Deprecation Lifecycle

```
ANNOUNCED → DEPRECATED → SUNSET → REMOVED
   T+0         T+90d       T+365d   T+540d
```

Headers on every response from a deprecated path:

```
Deprecation: true
Sunset: Wed, 01 Jul 2027 00:00:00 GMT
Link: <https://docs.erp.app/migrations/v1-to-v2>; rel="deprecation"
Warning: 299 - "Endpoint deprecated; migrate to /api/v2/..."
```

Clients identifying as old SDKs receive an additional banner via the API response envelope (visible in apps).

## 12.4 Support Window

We support **N and N-1 major versions** simultaneously. N-2 receives security fixes only for 90 days then removed.

## 12.5 Field Evolution Patterns

- **Renames:** add new field, dual-write, deprecate old, remove in next major.
- **Type changes:** add new field with new type; old field becomes computed/derived.
- **Enum additions:** clients must tolerate unknown enum values (graceful fallback).
- **Enum removals:** map old → new server-side until major bump.

## 12.6 Version Negotiation

- Client sends `X-API-Version` (precise) and `Accept: application/json`.
- Server responds with `X-API-Version-Served: 1.7.2`.
- Mismatched majors → 406 Not Acceptable with link to migration.

## 12.7 Schema Registry (Internal)

- All DTOs versioned in `contracts/openapi/`.
- CI runs **OpenAPI diff** on every PR to flag breaking changes.
- Breaking change requires explicit ADR + label `breaking-change`.

## 12.8 Mobile / Electron / PWA Compatibility

- Electron auto-updater enforces minimum compatible API version; if server `min_required_client_version` exceeds installed, app forces update.
- PWA detects via handshake; shows update toast; refresh applies new SW.

## 12.9 GraphQL (Optional Future)

If introduced, GraphQL schema follows similar deprecation rules using `@deprecated(reason: ...)`. Federated subgraphs versioned independently.

## 12.10 Public API vs Internal API

- Public (`/public/v1`) follows strict semver and 12-month deprecation min.
- Internal (BFF for our own clients) can move faster but still announces breaking changes 30 days ahead.

---

# 13. WEBSOCKET REAL-TIME ARCHITECTURE

## 13.1 Use Cases

- Notifications (toast, in-app inbox).
- Live dashboards (KPIs, dispatch boards).
- Live stock counters and POS terminal status.
- Collaborative document editing (quotation, SO drafts).
- Approval requests pushed to approver.
- Long task progress (report generation).
- Presence (who is online in the company).
- Kanban / pipeline drag updates.

## 13.2 Topology

```
Clients ──WSS──► Ingress (sticky) ──► WS Tier (Channels / Daphne)
                                           │
                                           ▼
                                  Channel Layer (Redis pub/sub)
                                           ▲
                                           │
                                  Publishers (Django, FastAPI, Workers)
                                  via channel_layer.group_send
```

WS pods are **stateless** (state in Redis); horizontal autoscaling on connection count + CPU.

## 13.3 Authentication

- Initial WS connect requires a short-lived **WebSocket ticket** issued by `/auth/ws-ticket` (single-use, 30s, scope-bound).
- Server reads ticket from query param or first message; validates; binds connection to `(tenant, user, device)`.
- After authentication, connection joins relevant groups.

## 13.4 Channel Groups

```
tenant:<tid>                    -- tenant-wide (rare; admin alerts)
tenant:<tid>:branch:<bid>       -- branch ops
user:<uid>                      -- direct messages to user
device:<did>                    -- device-specific messages (sync hints)
resource:<type>:<id>            -- per-document collaboration / live updates
report:<job_id>                 -- progress for a specific report
```

Joining a group is **permission-checked** (e.g., to subscribe to `branch:42`, user must have access to branch 42).

## 13.5 Message Envelope

```
{
  "type": "stock.balance.changed",
  "version": 1,
  "ts": "2026-05-08T10:00:00.123Z",
  "hlc": "...",
  "id": "evt_uuid",
  "tenant_id": "...",
  "scope": { "branch_id": "...", "warehouse_id": "..." },
  "payload": { ... },
  "trace_id": "..."
}
```

## 13.6 Backpressure & Flow Control

- Per-connection bounded send queue (e.g., 1k messages); on overflow → drop oldest non-critical or close connection with code 1013 (try later).
- Server drops to **summary mode** (aggregate every N seconds) when client lag exceeds threshold.
- Critical messages (approval requests, payment events) are flagged `qos:guaranteed`; queued in Redis with TTL until ACKed by client.

## 13.7 Reconnection & Replay

- Client tracks `last_event_id` per group.
- On reconnect, sends last-event-id; server sends missed events from short Redis ring buffer (last 5 minutes / N events per group).
- For longer outages, client falls back to REST refresh.
- WS tier supports **SSE fallback** at `/ws/sse?group=...` for restrictive networks.

## 13.8 Presence

- Tracked in Redis sets (`presence:branch:42`).
- Heartbeat every 25s; eviction after 60s of silence.
- Used for "who's online in this branch" and collaborative cursors.

## 13.9 Rate Limiting

- Per-connection inbound rate limit (e.g., 50 msg/s) — clients shouldn't push much over WS.
- Subscribe/unsubscribe limited to prevent thrash.

## 13.10 Security

- WSS only (TLS 1.3).
- Same origin policy enforced via `Origin` header allowlist.
- Tickets are single-use; main auth-token never sent over WS.
- Audit log entry on connection open/close with metadata.

## 13.11 Observability

- Prometheus metrics: connections, msgs/sec/group, lag.
- Structured logs per connection lifecycle.
- Tracing: each WS event carries trace_id; downstream services attach spans.

---

# 14. BACKGROUND JOB ARCHITECTURE

## 14.1 Scope

Jobs cover: outbox relay, sync workers, scheduled reports, billing cycles, recurring JEs, depreciation, period-end close, integrations, email/SMS, document generation, search re-indexing, data exports, retention/archival, virus scans, image processing.

## 14.2 Stack

- **Celery** with Redis broker (default) or RabbitMQ (Enterprise plans needing strong delivery semantics).
- **Celery Beat** for scheduling, with **leader election** (Redis lock) to ensure single beat instance.
- **Result backend:** Redis for short-lived tasks; PostgreSQL `task_result` table for long-lived auditable tasks.
- **Flower / Celery Insights** for live introspection.

## 14.3 Queues

| Queue          | Purpose                                | Worker pool       |
|----------------|----------------------------------------|-------------------|
| `default`      | General async tasks                    | prefork, 8        |
| `sync`         | Outbox → broker, sync coordination     | prefork, 16       |
| `reports`      | Heavy reports, exports                 | prefork, 4 (low concurrency, high mem) |
| `billing`      | Subscription cycles, invoices          | prefork, 2        |
| `integrations` | Third-party webhooks                   | gevent, 100       |
| `email_sms`    | Notifications                          | gevent, 200       |
| `images`       | Thumbnails, OCR, virus scan            | prefork, 4        |
| `search_index` | Re-index OpenSearch / Meilisearch      | prefork, 4        |
| `period_close` | Period/year close (long, serial)       | prefork, 1        |
| `dlq`          | Dead-letter destination                | manual replay     |

KEDA scales workers based on queue depth.

## 14.4 Task Taxonomy

- **Transactional task:** triggered by an outbox event; idempotent; commits to DB; emits next event.
- **Periodic task:** scheduled via Beat; cron-like.
- **Long-running task:** progress-tracked; resumable; chunked.
- **Fan-out:** chord/group of subtasks (e.g., re-index every tenant in parallel).
- **Workflow:** Celery canvas (chain → group → chord) for multi-step flows.

## 14.5 Retry & Backoff

```
retries:
  max: 5 (default), 10 (integrations)
  backoff: exponential with jitter (base=2s, cap=10min)
  retry_on: TransientNetworkError, IntegrityError(deadlock), ServiceUnavailable
  no_retry: ValidationError, PermissionDenied, NotFound
final_failure → move to dlq + alert
```

## 14.6 Idempotency

- Every task is idempotent by design or carries an idempotency key persisted in `task_dedup` (TTL).
- Re-execution after retry yields the same result.

## 14.7 Concurrency Control

- Per-task **distributed locks** via Redis (Redlock) for resources that disallow concurrent processing (e.g., period close per company).
- **Semaphore** patterns for rate-limited integrations (e.g., max 10 concurrent calls to gateway X).

## 14.8 Long-Running Task Pattern

```
TaskRecord(id, type, params, status, progress, result, error)
  status: QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELLED | PARTIAL

Worker:
  - claim TaskRecord (atomic set RUNNING)
  - process in chunks; persist progress every N items
  - on crash: another worker resumes from last checkpoint
  - emit WS events to user/device for UX progress
```

## 14.9 Beat Schedule (Examples)

```
00:05 daily   — close-of-day stock balance snapshot per tenant
00:10 daily   — outbox relay catch-up sweep
01:00 daily   — automated backup verification
02:00 daily   — recurring journal entries
03:00 monthly — depreciation run
04:00 monthly — subscription billing cycle
hourly        — license heartbeats (cloud-managed)
every 5 min   — webhook DLQ retry
every 1 min   — search index incremental
every 10 sec  — sync outbox flush
```

## 14.10 Observability

- Prometheus metrics: queue depth, task duration, success/fail rates, retries.
- OTel traces correlate web request → emitted event → consumer task.
- Sentry for exceptions.
- Per-tenant task budgets (prevent noisy neighbor): hard cap on concurrent tasks for shared workers.

## 14.11 Cancellation

- Cooperative cancellation: tasks check `should_cancel()` at safe points.
- User-initiated cancel via API; sets TaskRecord.status=CANCELLING; worker exits cleanly.

## 14.12 Tenant Affinity (Optional Enterprise)

- Dedicated worker pool per Enterprise tenant prevents cross-tenant contention.
- Routing key `<queue>.<tenant_id>` consumed by reserved workers.

---

# 15. QUEUE / EVENT ARCHITECTURE

## 15.1 Two Distinct Concerns

- **Task queues** (Celery): point-to-point work units with worker contention.
- **Event streams** (broker topics): one-to-many fan-out, replayable.

The system uses **both**, intentionally.

## 15.2 Event Bus Choice

- **Default:** Redis Streams (lightweight, in-cluster, sufficient for most tenants).
- **Enterprise / large-scale:** Apache Kafka (or Redpanda) — durable, replayable, multi-consumer.
- **RabbitMQ option** for tenants needing AMQP semantics for integrations.

The application uses an internal abstraction (`shared/messaging`) so switching brokers requires only a config + driver change.

## 15.3 Transactional Outbox

To avoid dual-write (DB + broker), every domain action that emits an event:

```
BEGIN
  ... write business rows ...
  INSERT INTO outbox(id, topic, key, payload, hlc) VALUES (...)
COMMIT
outbox_relay (worker):
  read unsent outbox rows, publish to broker, mark as sent
```

This guarantees **at-least-once** delivery without 2PC. Consumers must be idempotent.

## 15.4 Event Taxonomy

- **Domain events** (past tense, fact): `SalesInvoicePosted`, `StockReceived`, `CustomerCreated`, `JournalReversed`.
- **Integration events:** outward to webhooks/partners; subset of domain events with stable contract.
- **Command messages** (rare; prefer synchronous calls): `ScheduleReport`, `RecalculateInventoryValuation`.

## 15.5 Event Schema

```
{
  "id": "uuid",
  "type": "sales.invoice.posted",
  "version": 2,
  "occurred_at": "2026-05-08T10:00:00.000Z",
  "hlc": "...",
  "tenant_id": "...",
  "company_id": "...",
  "branch_id": "...",
  "actor_id": "user_uuid",
  "trace_id": "...",
  "data": { ... },
  "metadata": { "source": "django_app", "schema_ref": "events/sales_invoice_posted_v2.json" }
}
```

Schemas are stored in `contracts/events/` (JSON Schema or Avro). A registry validates payloads at publish time in CI.

## 15.6 Topic / Stream Layout

```
erp.<tenant_region>.<tenant_id>.<bounded_context>.<event>
e.g.,
erp.eu.t_3a8b.sales.invoice.posted
erp.eu.t_3a8b.inventory.stock.posted
```

Per-tenant stream offers isolation; for high-density Starter tenants, a multiplexed stream with `tenant_id` filtering may be used.

## 15.7 Consumers

- **Subledger projector:** consumes finance events → updates AR/AP/Inventory subledgers.
- **Audit shipper:** consumes events → ships to SIEM.
- **Search indexer:** consumes domain events → updates OpenSearch.
- **Webhook dispatcher:** matches to subscriptions → delivers to customer URLs.
- **Notification fan-out:** consumes events → sends notifications.
- **Analytics ETL:** batches events into the warehouse.
- **Cache invalidator:** consumes specific events → invalidates Redis keys / pub-sub to app pods.

Each consumer runs as a separate worker deployment with its own offset/cursor.

## 15.8 Delivery Semantics

- **At-least-once** is the default; consumers must be idempotent (idempotency table per consumer).
- **Exactly-once** within a single consumer-DB transaction by combining Kafka transactions + DB transaction (where Kafka is used).
- **Ordered** within a partition keyed by `tenant_id + aggregate_id`.

## 15.9 Replay

- Each consumer stores its offset/cursor.
- Replay = reset cursor to a target position; consumer re-processes (idempotent).
- Bounded replay window: 30 days hot in broker; older replayable from `outbox_archive` cold storage.

## 15.10 Dead-Letter & Poison Messages

- After N failures or unrecoverable validation errors → DLQ.
- Operator UI to inspect, edit (rare), or replay.
- Alert when DLQ rate > threshold.

## 15.11 Backpressure

- Consumers signal lag via Prometheus metrics; KEDA scales consumer pods on lag.
- Producers honor a global rate limit per topic to protect downstream.

## 15.12 Cross-Region Events

- Events are tenant-region-local by default.
- For tenants with multi-region presence, an **event router** mirrors a defined subset to other regions (eventual).

---

# 16. DEPLOYMENT ARCHITECTURE

## 16.1 Topology — Cloud (SaaS Production)

```
        Internet
           │
           ▼
    ┌─────────────┐
    │     CDN     │     (static, PWA, attachments via signed URLs)
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │     WAF     │
    └──────┬──────┘
           │
           ▼
    ┌──────────────────────────────────────────────────────┐
    │                Kubernetes Cluster                    │
    │                                                      │
    │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
    │  │ ingress-nginx│  │ cert-manager │  │ external-dns│ │
    │  └──────────────┘  └──────────────┘  └────────────┘  │
    │                                                      │
    │  Namespace: erp-prod                                 │
    │  ├── deploy: erp-django  (HPA 4–40)                  │
    │  ├── deploy: erp-fastapi (HPA 4–60)                  │
    │  ├── deploy: erp-ws      (HPA 2–20)                  │
    │  ├── deploy: erp-worker-default (KEDA on queue)      │
    │  ├── deploy: erp-worker-sync    (KEDA on queue)      │
    │  ├── deploy: erp-worker-reports (KEDA on queue)      │
    │  ├── deploy: erp-beat    (1 replica, leader-elected) │
    │  ├── statefulset: redis-sentinel                     │
    │  └── statefulset: pgbouncer                          │
    │                                                      │
    │  Namespace: erp-data                                 │
    │  ├── statefulset: postgres-primary (Patroni)         │
    │  ├── statefulset: postgres-replica × N               │
    │  └── job: backup, wal-archiver                       │
    │                                                      │
    │  Namespace: erp-observability                        │
    │  ├── prometheus, alertmanager                        │
    │  ├── grafana                                         │
    │  ├── loki, promtail                                  │
    │  └── otel-collector → tempo/jaeger                   │
    └──────────────────────────────────────────────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │  Object     │  (S3 / MinIO)
                  │  Storage    │
                  └─────────────┘
```

## 16.2 Containers

- **Multi-stage Docker builds**, slim base (`python:3.12-slim`), non-root user, read-only root FS.
- One image per service: `django`, `fastapi`, `worker`, `beat`, `ws`, `pwa`.
- Workers split by queue with separate deployments.
- Health probes: `/healthz` (liveness), `/readyz` (readiness — DB, Redis, broker checks).

## 16.3 Process Model

| Service        | Server                          |
|----------------|---------------------------------|
| Django (sync)  | Gunicorn (workers=2×CPU+1)      |
| Django (async) | Daphne / Uvicorn (Channels WS)  |
| FastAPI        | Uvicorn workers behind Gunicorn |
| Workers        | Celery prefork or gevent        |
| Beat           | Celery Beat (single leader)     |

## 16.4 Auto-Scaling

- **HPA** on CPU + request-rate (custom metric from Prometheus).
- **KEDA** on Celery queue depth for workers.
- **PDBs (PodDisruptionBudgets)** prevent eviction storms.
- DB connections capped via PgBouncer; HPA respects DB ceiling.

## 16.5 Single-VPS Deployment (SMB on-prem)

```
docker compose -f docker-compose.prod.yml up -d
```

Includes: Nginx (TLS via certbot), Postgres, Redis, Django+Gunicorn, FastAPI, Workers, Beat, MinIO. Volumes mounted to host, automated nightly backups to remote storage. Ansible playbooks in `infra/ansible/` provision a fresh VPS from zero to production in <15 minutes.

## 16.6 Environments

`local → dev → staging → prod` — **identical container images**, only config differs (env + secrets via Sealed Secrets / Vault).

## 16.7 Zero-Downtime Deployments

- App pods drain (preStop hook waits for in-flight requests).
- DB migrations are non-blocking (use `CONCURRENTLY` for indexes; expand-contract for column changes).
- Blue/green or canary via Argo Rollouts.
- WS uses sticky sessions only on reconnect; clients retry transparently.

## 16.8 Database Migrations

- **Forward-only**, additive-first. Backfills as background jobs.
- **Tenant-aware migration runner** iterates schemas in batches with concurrency and resumability.
- Schema migrations gated behind feature flags so app code can deploy safely before/after.

## 16.9 Multi-Region

- Tenants pinned to a region (`us-east-1`, `eu-west-1`, `me-central-1`, `ap-south-1`).
- Per-region cluster + DB; **public schema is region-local**.
- Cross-region tenant migration is a planned operation (export → import → DNS cutover).

## 16.10 Cluster Hardening

- NetworkPolicies (deny-all default; allowlist per service).
- PodSecurityStandards (`restricted`).
- Service mesh (Linkerd / Istio) for mTLS east-west.
- Image scanning (Trivy) at admission.

---

# 17. SECURITY ARCHITECTURE

## 17.1 Threat Model (STRIDE)

Threats: spoofing (auth bypass), tampering (request/data), repudiation (audit gaps), information disclosure (cross-tenant, PII leak), DoS (sync abuse), elevation (RBAC bypass, SSRF, RCE).

## 17.2 Defense Layers

1. **Edge:** WAF, DDoS protection, IP allow/deny lists, geo rules.
2. **Transport:** TLS 1.3 only, HSTS, OCSP stapling, modern cipher suite.
3. **Application:** strict input validation (Pydantic / DRF serializers), output encoding, parameterized queries, CSRF for cookie-auth flows.
4. **Authentication:** §6.
5. **Authorization:** §7 + tenant isolation enforced in every query path.
6. **Data:** encryption at rest, field-level encryption for PII (KMS-wrapped DEKs), tokenization for cardholder data (we never store PAN — handled by PCI-DSS provider).
7. **Audit:** §8.
8. **Network:** Kubernetes NetworkPolicies, service mesh (mTLS) for east-west.

## 17.3 Secrets Management

- HashiCorp Vault or AWS Secrets Manager / Azure Key Vault.
- No secrets in env files in production; pods receive secrets via CSI driver.
- DB credentials via Vault dynamic credentials.

## 17.4 Tenant Isolation Enforcement

- DB layer: separate schema per tenant (Pro/Ent) or **Row-Level Security** (`tenant_id = current_setting('app.tenant_id')::uuid`) for shared schema.
- Application layer: every ORM query goes through `TenantQuerysetManager`.
- CI: cross-tenant leak tests deliberately attempt to access tenant B from tenant A's session — must always 403/404.

## 17.5 OWASP Top-10 Mitigations

- **Injection:** ORM only, parameterized.
- **Broken auth:** §6.
- **Sensitive data exposure:** TLS, encryption at rest, redaction in logs.
- **XXE/SSRF:** disable external entities; outbound HTTP via allowlist proxy.
- **Broken access control:** centralized policy engine; no ad-hoc checks.
- **Security misconfig:** baseline images scanned (Trivy); CIS benchmarks for k8s.
- **XSS:** auto-escaping framework; CSP with strict nonces.
- **Deserialization:** Pydantic / DRF only; no pickle from untrusted sources.
- **Vulnerable components:** SBOM (Syft); blocked at CI.
- **Logging/monitoring:** §23.

## 17.6 PII / GDPR / Data Residency

- PII inventory at field level.
- Per-tenant data residency: tenant assigned a region; data never crosses region boundaries.
- DSARs: export (JSON+CSV bundle) and erasure runbooks; legal hold support.
- Consent tracking in `consent_log`.

## 17.7 Security Headers

HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP.

## 17.8 File Upload Hardening

- Virus scan (ClamAV) + MIME sniffing + size & type allowlist + isolated bucket + sandboxed image processing.

## 17.9 Compliance Alignment

Architecture engineered to support **SOC 2 Type II**, **ISO 27001**, **GDPR**, **HIPAA-ready** (when subscribed), **PCI-DSS SAQ-A**.

## 17.10 Incident Response

- Runbooks in `docs/runbooks/`.
- Rotating on-call; PagerDuty integration.
- Forensic snapshots; PG WAL kept for replay.
- Post-mortems within 5 business days, blameless.

---

# 18. LICENSING ARCHITECTURE

## 18.1 License Types

| Type        | Validation               | Use Case                          |
|-------------|--------------------------|-----------------------------------|
| Cloud SaaS  | Server-side subscription | Standard SaaS tenants             |
| Cloud OEM   | Server-side, white-label | Reseller-managed tenants          |
| On-Prem     | Signed file + heartbeat  | Customer-hosted, periodic check-in |
| Air-Gapped  | Signed file + manual renewal | High-security on-prem         |

## 18.2 License File (On-Prem)

```
{
  "license_id": "uuid",
  "tenant_id": "uuid",
  "edition": "ENTERPRISE",
  "modules": ["INVENTORY","ACCOUNTING","POS","MFG","HR","CRM"],
  "limits": { "users": 50, "branches": 20, "warehouses": 100, "tx_per_year": 5000000 },
  "issued_at": "2026-01-01T00:00:00Z",
  "valid_from": "2026-01-01T00:00:00Z",
  "valid_to":   "2027-01-01T00:00:00Z",
  "hw_fingerprint": "sha256:...",
  "issuer": "ERP-LICENSING-CA",
  "policy_version": 3
}
.signature: Ed25519(payload, vendor_private_key)
```

Vendor public key embedded at build time.

## 18.3 License Engine

- Startup: load license, verify signature + chain, parse limits, cache in Redis.
- Per request: cache lookup; quotas (users, tx-rate) enforced at middleware.
- Heartbeat: every N hours, on-prem instance contacts vendor (if reachable). Air-gapped instances skip; manual renewal.
- Grace period: configurable (e.g., 14 days) read-only after expiry.

## 18.4 SaaS License (Cloud)

- Backed by `subscription` table.
- Module access derived from plan + add-ons.
- Usage metered in `usage_event`.

## 18.5 Module Gating

Three places:
1. API gateway (route-level middleware).
2. Permission engine (UI menu hides routes).
3. Domain layer (last line of defense).

## 18.6 Anti-Tamper

- License file integrity verified on every cold start.
- Critical limits enforced server-side for cloud.
- Tampering attempts logged + alert vendor.

## 18.7 Renewal Workflow

- 60/30/14/7/1 days before expiry: in-app banner + email.
- Auto-renew via stored payment method (cloud).
- Manual renewal: vendor portal generates new license file; in-app upload replaces.

---

# 19. SAAS ARCHITECTURE

## 19.1 Plan & Pricing Model

```
plan
├── code (STARTER, PRO, ENTERPRISE, CUSTOM)
├── price_tiers []  (per user, per branch, flat)
├── billing_cycles  (monthly, annual)
├── limits          (users, branches, warehouses, tx, api_calls, storage_gb)
├── modules
└── trial_days

addon
├── code (EXTRA_USERS, EXTRA_STORAGE, MFG, ECOMMERCE, …)
├── unit_price
└── billing_cycle
```

## 19.2 Tenant Onboarding

```
Self-serve sign-up
  → create user (email verified)
  → create tenant (slug, region)
  → choose plan (or trial)
  → payment method (Stripe / Razorpay)
  → tenant provisioning job:
        provision schema
        run migrations
        seed (CoA, taxes, UOM, roles)
        create initial company + branch + warehouse
        invite first admin
  → onboarding wizard
  → ready
```

Provisioning is idempotent and observable (one record per provisioning job in `job_registry`).

## 19.3 Billing Engine

- **Recurring:** monthly/annual; proration on plan change.
- **Usage-based:** metered events aggregated nightly → invoice line.
- **Invoices:** PDF in object storage; gateway-attempted.
- **Dunning:** failed payment → retry (1d, 3d, 7d) → suspend on day 14 → archive on day 60.

## 19.4 Tenant Suspension Flow

```
PAYMENT_FAILED → DUNNING → SUSPENDED (read-only)
                              → cancellation email
                              → 30d grace
                              → ARCHIVED (data exported)
                              → 60d grace
                              → DELETED (irreversible)
```

## 19.5 Multi-Region

- Tenant assigned a region.
- Per-region cluster with isolated DB.
- Cross-region tenant migration is a planned operation.

## 19.6 White-Label / Reseller (OEM)

- A reseller is a meta-tenant owning sub-tenants.
- Resellers have their own branding, pricing, and a portal.
- Revenue split tracked in `reseller_payout`.

## 19.7 Self-Service Portal

Tenant admins manage: users, billing, plan, invoices, integrations, API keys, audit logs, data export, retention policy. Platform admins (vendor) have a separate console with cross-tenant operational controls (impersonation requires explicit consent + audit-logged).

## 19.8 Tenancy Quotas (Enforced)

| Quota          | Where Enforced                                      |
|----------------|-----------------------------------------------------|
| Users          | `tenant_user` insert hook                           |
| Branches       | `branch` insert hook                                |
| API calls/min  | Throttle middleware                                 |
| Storage        | Attachment upload middleware                        |
| Transactions   | Posting service preflight                           |

Soft quotas warn; hard quotas block with clear upgrade path.

---

# 20. ELECTRON DESKTOP ARCHITECTURE

## 20.1 Why Electron

POS counters, warehouse stations, accounting workstations need: local printing (ESC/POS, A4), barcode/scanner/scale integration, offline capability, file system access, consistent cross-platform UI.

## 20.2 Process Architecture

```
┌─────────────────── Electron App ───────────────────┐
│  ┌────────────────┐      contextBridge   ┌──────┐  │
│  │ Renderer       │ ───────────────────► │Preload│ │
│  │ (React/Vue UI) │ ◄─────────────────── │       │ │
│  │  same as PWA   │      IPC channels    └───┬───┘ │
│  └────────────────┘                          │     │
│                                              ▼     │
│                                    ┌──────────────┐│
│                                    │ Main Process ││
│                                    │  (Node.js)   ││
│                                    │              ││
│                                    │ ┌──────────┐ ││
│                                    │ │ SQLite   │ ││
│                                    │ │SQLCipher │ ││
│                                    │ └──────────┘ ││
│                                    │ ┌──────────┐ ││
│                                    │ │ Sync     │ ││
│                                    │ │ Engine   │ ││
│                                    │ └──────────┘ ││
│                                    │ ┌──────────┐ ││
│                                    │ │Peripheral│ ││
│                                    │ │ Drivers  │ ││
│                                    │ └──────────┘ ││
│                                    │ ┌──────────┐ ││
│                                    │ │ Updater  │ ││
│                                    │ └──────────┘ ││
│                                    └──────────────┘│
└────────────────────────────────────────────────────┘
```

## 20.3 Security Posture

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Preload exposes a typed API; renderer cannot reach Node directly.
- IPC channels validate inputs (zod / valibot).
- App signed (Authenticode on Windows, Apple Notarization on macOS).
- Auto-update channel signed; updates verified before applying.

## 20.4 Local Database (SQLite)

- **better-sqlite3**, WAL mode, busy_timeout.
- SQLCipher with key from server-issued device key + user passphrase.
- Schema mirrors curated subset of server entities.
- Migrations run on app start; mismatched schema triggers safe re-sync.

## 20.5 Sync Engine

Native module in main process:
- Pushes batches to FastAPI `/sync/push`.
- Pulls per entity class on schedule + on demand.
- Surfaces conflicts via IPC events to renderer.
- Survives sleep/wake, network changes.

## 20.6 Peripherals

| Device       | Channel                              |
|--------------|--------------------------------------|
| Receipt printer (ESC/POS) | `node-escpos` over USB / Network    |
| Label printer             | ZPL/EPL drivers                      |
| Barcode scanner           | HID keyboard wedge or COM port       |
| Cash drawer               | Triggered via printer kick           |
| Weighing scale            | Serial protocol (CAS, Mettler, Avery)|
| Customer display          | Serial / network                     |

Drivers in `clients/desktop_electron/main/peripherals/<vendor>/` behind a common interface.

## 20.7 Updates

- `electron-updater` with **Stable / Beta / Canary** channels.
- Tenant admin can pin a version across stations.
- Differential (delta) updates.

## 20.8 Crash Reporting

- Sentry-compatible reporter (opt-in per tenant policy).
- No PII in payload.

## 20.9 Multi-Window / Multi-Display

- POS lane: cashier UI + customer-facing display.
- Window state persisted per device/user.

## 20.10 Provisioning (First-Run)

```
1. Enter tenant subdomain or activation code
2. Browser-based device authorization (OAuth-like device flow)
3. Receive device key + offline token
4. Initial sync (reference data + last 90d documents)
5. Ready
```

---

# 21. PWA ARCHITECTURE

## 21.1 Why PWA

Same codebase as Electron renderer; runs in any modern browser; installable; offline-capable; mobile-friendly.

## 21.2 Shell Architecture

- **App Shell** model: shell cached aggressively; content cached on demand.
- Routing via SPA router; offline routes handled by Service Worker.

## 21.3 Service Worker Strategy

```
/ (shell)        : StaleWhileRevalidate
/assets/*        : CacheFirst + immutable cache
/api/* (GET)     : NetworkFirst with timeout fallback to cache
/api/* (mutating): NetworkOnly + Background Sync queue on failure
/sync/*          : NetworkOnly (sync engine)
/attachments/*   : CacheFirst + LRU eviction
```

SW version derives from app version; updates use `skipWaiting` + `clients.claim` after user confirmation.

## 21.4 IndexedDB Layer (Dexie)

Tables mirror curated subset:

```
db_v<schema_version>:
  items, partners, prices, taxes, branches, warehouses,
  sales_orders, deliveries, sales_invoices, payments,
  pos_transactions, op_log, sync_cursor, device_meta, settings
```

Sensitive fields encrypted with WebCrypto AES-GCM (non-extractable key from PBKDF2/HKDF over device key + user passphrase).

## 21.5 Sync Engine (Web Worker)

- Runs in dedicated Web Worker.
- Same protocol as Electron (`/sync/handshake|pull|push|ack`).
- Communicates with UI via `postMessage`.
- On reconnect: drains `op_log` then pulls.

## 21.6 Background Sync & Push

- **Background Sync API:** queued mutations replay when network returns.
- **Periodic Background Sync:** opportunistic pulls (permission-gated).
- **Web Push:** order alerts, low-stock alerts, payment receipts (VAPID).

## 21.7 Performance Budgets

| Metric                  | Target               |
|-------------------------|----------------------|
| First Contentful Paint  | < 1.5s on 3G         |
| Largest Contentful Paint| < 2.5s               |
| Time-to-Interactive     | < 3.5s               |
| JS bundle (initial)     | < 200KB gzipped      |

Enforced via Lighthouse CI.

## 21.8 Offline UX

- Mutating UI shows pending state until acked.
- Conflicts surfaced in "Sync Issues" tray.
- Read-only data badged with last-sync time.
- Currency, taxes, prices recalculated client-side; server re-validates on push.

## 21.9 Installability

- `manifest.webmanifest` with icons, theme, screenshots.
- Custom install prompts for desktop and mobile.

## 21.10 Accessibility & i18n

- WCAG 2.1 AA target.
- RTL support (Arabic / Hebrew).
- ICU MessageFormat; locales lazy-loaded.

---

# 22. BACKUP & DISASTER RECOVERY ARCHITECTURE

## 22.1 Objectives

| Metric | Target          |
|--------|-----------------|
| RPO    | ≤ 5 minutes     |
| RTO    | ≤ 60 minutes    |
| Backup retention | 35 days hot, 7 years cold |

## 22.2 PostgreSQL Backups

Three layers:
1. **Continuous WAL archiving** to object storage (with versioning + object-lock).
2. **Daily base backups** via `pgBackRest` or `wal-g`.
3. **Per-tenant logical exports** (`pg_dump --schema=t_<tenant>`) weekly, encrypted.

PITR within retention window.

## 22.3 Object Storage Backups

- Attachments and exports in primary bucket with **versioning** + **object-lock (compliance mode)**.
- Cross-region replication to a secondary bucket.

## 22.4 Redis

- Cache + ephemeral broker; no durable state.
- Critical queues backed by Sentinel; on total loss, jobs replayed from outbox.

## 22.5 Disaster Recovery Tiers

| Scenario                 | Procedure                                                  | Target |
|--------------------------|------------------------------------------------------------|--------|
| Single pod crash         | k8s reschedules                                            | sec    |
| Node failure             | k8s reschedules; PVCs reattach                             | <5m    |
| AZ failure               | Multi-AZ DB replica promotes; ingress reroutes             | <15m   |
| Region failure           | DR cluster in secondary region; DNS cutover; restore       | <60m   |
| Data corruption          | PITR to last good point (per tenant if possible)           | varies |
| Ransomware on storage    | Object-lock backups untouchable; restore to clean cluster  | <4h    |

## 22.6 Backup Verification

- **Nightly automated restore** of a sampled tenant into isolated namespace; smoke-tests run.
- **Quarterly full DR drill**: failover to secondary region, run synthetic transactions, fail back.

## 22.7 Tenant-Level Operations

- Self-service tenant export (full data dump) — JSON + CSV bundle, signed manifest.
- Per-tenant PITR on Enterprise plan.

## 22.8 On-Prem Backups

- Cron jobs perform `pg_basebackup` + WAL streaming to customer-configured target.
- One-command restore script.
- Encrypted with customer-supplied key.

## 22.9 Runbooks

- `db-failover.md`, `wal-archive-stuck.md`, `tenant-restore.md`, `region-cutover.md`, `ransomware-response.md`, `key-compromise.md`.

## 22.10 Continuity Communications

- Status page with per-region/per-service status.
- Customer comms templates for each incident class.
- Postmortem within 5 business days.

---

# 23. MONITORING & LOGGING ARCHITECTURE

## 23.1 Pillars

1. **Metrics** — Prometheus.
2. **Logs** — Loki (structured JSON).
3. **Traces** — OpenTelemetry → Tempo / Jaeger.
4. **Profiles** — Pyroscope (continuous profiling, opt-in).
5. **Errors** — Sentry.
6. **RUM (Real User Monitoring)** — open-source RUM agent for PWA.
7. **Synthetic** — k6 / Checkly periodic scripted probes.

## 23.2 Metrics

Standardized labels: `service, env, region, tenant_tier (never tenant_id directly to avoid cardinality explosion), endpoint, status, queue, op`.

Categories:
- **RED** (Rate, Errors, Duration) per endpoint.
- **USE** (Utilization, Saturation, Errors) per resource (CPU, mem, IO).
- **Business KPIs** (gauges): active tenants, transactions/min, sync queue lag, posting throughput.
- **Domain SLIs:** `inventory_post_latency_p99`, `accounting_close_duration`, `sync_lag_seconds`, `auth_login_failure_rate`.

## 23.3 Log Standard

- JSON (one event per line).
- Required fields: `ts, level, service, env, region, request_id, trace_id, span_id, tenant_id_hash, user_id_hash, msg, ctx{}`.
- PII never in logs (`actor_id` is hashed; `email` redacted).
- Levels: `DEBUG, INFO, NOTICE, WARN, ERROR, CRITICAL`.
- Correlation: `request_id` header (`X-Request-Id`) propagates across services.

## 23.4 Trace Standard

- OpenTelemetry SDK in every service.
- Spans for: HTTP, DB, Redis, Celery task, broker publish/consume, external HTTP.
- Sampling: head-based 10% + tail-based on error or slow.
- Exemplars: link metric points to trace IDs.

## 23.5 SLOs

| Service       | SLI                      | SLO                                    |
|---------------|--------------------------|----------------------------------------|
| Public API    | success rate             | 99.9% (28d)                            |
| Public API    | latency p95              | < 500 ms (28d)                         |
| Sync API      | success rate             | 99.95%                                 |
| Sync API      | push latency p95         | < 800 ms                               |
| WS            | message delivery success | 99.9%                                  |
| Celery sync queue | lag                  | p95 < 5 s                              |
| Posting (inventory/accounting) | error rate | < 0.1%                              |

Error budgets tracked; freeze deploys when budget exhausted.

## 23.6 Alerting

- **Symptom-based** alerts (user-facing breakage) page on-call.
- **Cause-based** alerts file tickets.
- Alertmanager → PagerDuty / Opsgenie + Slack mirror.
- Maintenance window suppression.

## 23.7 Dashboards

- **Per-service overview** (RED + USE).
- **Tenant health** (per-tier aggregates only — privacy).
- **Posting & sync** dashboards.
- **DB:** connections, locks, slow queries, replication lag.
- **Queue depth** + worker utilization.
- **WS:** connections, msg/s, lag.

## 23.8 Audit vs Application Logs

Distinct streams:
- `audit_log` (DB, hash-chained, §8) — immutable, compliance-grade.
- Application logs (Loki) — operational; not authoritative for security investigations.

## 23.9 Log Retention

- Hot in Loki: 14 days.
- Warm in object storage: 90 days.
- Cold archive: 1 year (Loki/Boltdb-shipper or S3 with lifecycle).
- Audit retention: per §8.

## 23.10 Privacy

- Tenant IDs hashed in metric labels (use a stable hash + salt) to limit disclosure to grafana viewers.
- PII redactor middleware before any log shipping.

---

# 24. FILE / DOCUMENT STORAGE ARCHITECTURE

## 24.1 Abstraction

`StorageProvider` interface implemented by:
- **S3** (AWS), **MinIO** (on-prem/self-hosted), **Azure Blob**, **GCS**.

Single interface across runtimes (Django, FastAPI, workers, clients via signed URLs).

## 24.2 Bucket Layout

- **Per-region buckets**, path-prefixed by tenant: `t_<tid>/<entity>/<id>/<filename>`.
- Logical buckets: `attachments`, `documents` (generated PDFs/exports), `backups`, `audit-archive`.
- Optional **dedicated buckets per Enterprise tenant** for full isolation and customer-managed keys.

## 24.3 Encryption

- **At rest:** SSE-KMS (KMS-managed keys per region).
- **Envelope encryption** for sensitive content (contracts with PII): KMS-wrapped DEK, content encrypted with DEK in app, ciphertext stored.
- Customer-managed keys (CMK) supported on Enterprise plan.

## 24.4 Upload Flow

```
Client requests /files/upload-url with {entity, content_type, size}
Server validates:
  - permission
  - quota
  - content_type allowlist
  - max size
Server returns presigned PUT URL + upload_id (TTL 15 min)
Client uploads directly to object storage
Client calls /files/upload-complete with {upload_id, sha256}
Server:
  - HEADs object, validates size + (if needed) hash
  - creates `attachment` record
  - enqueues virus_scan + thumbnail tasks
  - returns attachment id
```

Direct-to-storage uploads avoid app servers handling bytes (scalability + cost).

## 24.5 Download Flow

```
Client requests /files/<id>/download
Server checks permission (link record + entity scope)
Server returns signed URL (TTL short, e.g. 5 min, IP-bound when possible)
Client downloads from object storage directly
```

For sensitive attachments, content is **streamed through** the API (so server can re-decrypt envelope, audit access, and apply DLP).

## 24.6 Virus Scan Pipeline

```
upload-complete → enqueue scan
worker:
  - fetch object stream
  - ClamAV scan
  - if infected → quarantine bucket + alert + audit
  - if clean → mark attachment.status = AVAILABLE
```

Until scan completes, downloads are blocked.

## 24.7 Thumbnails / Previews

- For images and PDFs, async generation of thumbnails (sm, md, lg).
- Office docs converted via headless LibreOffice in a sandboxed worker.
- Stored alongside source object as `__derived/`.

## 24.8 Lifecycle Policies

- Attachments: never auto-delete (linked to business records).
- Generated reports: 90-day default retention, configurable per tenant.
- Audit archive: 7 years (object-lock).
- Backups: per §22.

## 24.9 Versioning & Legal Hold

- Bucket versioning enabled.
- Legal hold flag prevents deletion regardless of policy.
- Retention lock for compliance buckets (WORM).

## 24.10 Linkage Model

```
attachment
├── id, tenant_id
├── storage_bucket, key, sha256, size, content_type
├── status (PENDING, SCANNING, AVAILABLE, INFECTED, QUARANTINED, DELETED)
├── encrypted (bool), kms_key_ref
├── uploaded_by, uploaded_at
└── derived[] (thumbnails, previews)

attachment_link
├── id, attachment_id
├── entity_type, entity_id     (e.g., sales_invoice / <id>)
├── purpose (ATTACHMENT, RECEIPT, SIGNATURE, AVATAR, CONTRACT, …)
└── linked_at
```

A single attachment can link to multiple entities (e.g., a payment receipt linked to both invoice and journal entry).

## 24.11 Tenant Quotas

- Storage usage tracked per tenant; soft-warn / hard-block on overage.
- Add-on plans for extra storage.

## 24.12 Document Generator

- Templated PDF (HTML → PDF via headless Chromium / WeasyPrint) for invoices, POs, statements, payslips.
- Templates per company + per language; tenant-overridable.
- Generated in a worker; result stored in `documents/` bucket; linked via `attachment_link`.

---

# 25. REPORTING & ANALYTICS ARCHITECTURE

## 25.1 OLTP vs OLAP Separation

| Concern              | OLTP                          | OLAP                                   |
|----------------------|-------------------------------|----------------------------------------|
| Backbone             | PostgreSQL primary            | PostgreSQL replicas + warehouse        |
| Workloads            | CRUD, posting, sync           | Aggregations, BI dashboards, exports   |
| Latency              | ms                            | seconds → minutes                      |
| Tools                | DRF / FastAPI                 | Reporting engine, BI tool              |

OLAP **never** runs against OLTP primary.

## 25.2 Layered Architecture

```
[OLTP Primary] ──logical replication──► [OLTP Replicas]  ← operational reports
        │
        ▼
   [CDC / Outbox] ──Kafka/Streams──► [Bronze (raw events) — DW]
                                         │
                                  dbt models / pipelines
                                         ▼
                                    [Silver (cleaned)]
                                         ▼
                                    [Gold (aggregates / marts)]
                                         ▼
                                    [BI Tool / Reports / API]
```

Warehouse choices:
- **Default:** PostgreSQL with **TimescaleDB** + columnar tables, sufficient up to mid-scale.
- **Enterprise scale:** **ClickHouse** or **DuckDB-on-S3** (per tenant) or **Snowflake/BigQuery** for very large.

## 25.3 Materialized Views (Replica)

Pre-aggregated views refreshed on schedule:
- `mv_stock_balance_by_warehouse_day`
- `mv_gl_trial_balance_by_period`
- `mv_sales_summary_by_branch_day`
- `mv_ar_aging`
- `mv_ap_aging`
- `mv_inventory_valuation_by_method`

Refresh strategy: **incremental** where possible (deltas applied), **CONCURRENTLY** to avoid locks.

## 25.4 Report Engine

Components:
- **Report definition:** parameters, query plan (deterministic SQL or DSL), output schema, formats (HTML, PDF, XLSX, CSV).
- **Execution:** sync for small (<2s), async via Celery for large (progress + WS updates).
- **Caching:** query-result cache keyed by (def, params, tenant, period); invalidated by domain events.
- **Scheduled reports:** Beat triggers; results stored in `documents/` and emailed/Slacked to recipients.
- **Exports:** streamed CSV/XLSX; chunked from replica using server-side cursor.

## 25.5 Standard Report Set

- **Inventory:** stock balance, ageing, valuation (per method), reorder, slow-moving, fast-moving, ABC analysis, batch expiry.
- **Sales:** sales register, customer ageing, salesperson, revenue by item/branch, pipeline conversion.
- **Purchase:** purchase register, supplier ageing, GR/IR balance.
- **Finance:** TB, BS, P&L (single + comparative), cash flow, GL detail, daybook, FX revaluation, budget vs actual.
- **Tax:** GST/VAT returns, TDS, withholding.
- **Operational:** KPIs, dispatch SLA, POS shift summary.

## 25.6 Pivot / Ad-hoc

- Pivot UI on Silver/Gold marts.
- Saved views per user; shared views (with permission).
- Export with applied filters.

## 25.7 Embeddable Dashboards

- KPI cards, trend lines, distribution charts.
- Composed from named widgets bound to mart views.
- Per-role dashboard templates.

## 25.8 Drill-Down

- Aggregate cell → underlying transactions list (server-side filter), permission-checked.

## 25.9 Tenant Isolation in DW

- Per-tenant prefix or row-level filter in warehouse.
- Strict separation from analytics jobs (no cross-tenant joins).
- Per-tenant export of analytical data on request.

## 25.10 BI Tool Integration

- Read-only DW user with row-level security per tenant.
- Connectors: Metabase, Superset, Tableau, Power BI.
- Embedded analytics for tenant admins (tokenized iframe with scoped JWT).

## 25.11 Performance Practices

- Pre-aggregate heavily-queried dimensions.
- Partition large fact tables by date.
- Bitmap and BRIN indexes on aggregates.
- Concurrent refresh windows scheduled off-peak.

---

# 26. CACHING ARCHITECTURE

## 26.1 Layers

```
[Client cache (HTTP, SW, IDB)]
         │
         ▼
[CDN / Edge cache]
         │
         ▼
[App-level Redis cache]
         │
         ▼
[DB cache (PG shared buffers, MV, prepared stmts)]
```

## 26.2 Patterns

- **Cache-aside (default):** read-through with explicit fill; write-through on writes when needed.
- **Write-around:** for rarely-read writes, skip cache fill.
- **Write-through:** for hot keys with strict consistency (rare; only when safe).
- **Read replica + cache fallback** for heavy reports.

## 26.3 Key Conventions

```
<service>:<resource>:<scope>:<id>:<version>
e.g.,
api:item:tenant=t1:item=I123:v3
acl:perms:tenant=t1:user=u9:v17
settings:tax:tenant=t1:country=AE:v5
```

`<scope>` always includes `tenant=` to prevent cross-tenant leaks. Versions used to bust caches on schema migrations.

## 26.4 TTLs

| Type                       | TTL                |
|----------------------------|--------------------|
| Reference data (items, taxes, prices) | 1 h        |
| Tenant settings            | 30 min            |
| Permissions (per user)     | 5 min             |
| Session metadata           | 10 min            |
| Idempotency keys           | 24 h              |
| Throttle counters          | 1 min             |
| Computed reports           | per definition    |
| Stock balance (best-effort)| 30 s (background-refreshed) |

## 26.5 Invalidation

- **Time-based** (TTL).
- **Event-based:** consumers of `*.changed` events delete affected keys; pub/sub message also tells app pods to evict their **L1 in-process LRU**.
- **Versioned keys:** writes bump entity version; readers compute new key automatically.

## 26.6 Hot Keys & Stampede Protection

- **Single-flight:** only one fill per key in flight (Redis lock or semaphore); concurrent readers wait or read stale.
- **Probabilistic early expiration (XFetch):** refresh ahead of true expiry to avoid synchronized stampedes.
- **Tiered cache:** L1 in-process LRU per pod (microseconds) + L2 Redis (sub-ms).

## 26.7 Negative Caching

- Cache 404s with short TTL (e.g., 30 s) to absorb scanning attacks.

## 26.8 Per-Tenant Quotas

- Cache memory budget per tier.
- Enterprise tenants get dedicated Redis logical DB to avoid eviction by noisy neighbor.
- Eviction policy: `allkeys-lfu` for app cache; `volatile-ttl` for ephemeral data.

## 26.9 Specific Caches

- **Permission cache:** §7.7.
- **Settings cache:** tenant + company + branch hierarchy with override resolution.
- **Tenant routing cache:** domain → tenant_id.
- **Tax/price calculation cache:** keyed by (tenant, branch, item, customer_group, date).
- **Report result cache:** keyed by (report_def, params).

## 26.10 Distributed Locks

- **Redlock** on critical sections (period close, numbering allocation under high contention, tenant provisioning).
- Fencing token included to detect lost-lock scenarios.

## 26.11 CDN Cache

- Static (PWA build, attachments via signed URLs).
- API responses are **not** CDN-cached (auth-bearing), except `/openapi.json` and public catalog endpoints.

---

# 27. PLUGIN / MODULE EXPANSION ARCHITECTURE

## 27.1 Goals

- Add new business modules (e.g., Hospitality, Healthcare, Logistics) without forking the core.
- Per-tenant **custom fields**, **custom workflows**, **custom reports**.
- Optional **third-party add-ons** with sandboxed execution.

## 27.2 Module Manifest

```
modules/<module_code>/
  manifest.yaml
  app/                      # Django app
  fastapi_routes/
  migrations/
  fixtures/
  permissions.yaml
  events.yaml               # publishes/subscribes
  ui/                       # PWA module bundle
```

`manifest.yaml`:

```
code: hospitality
name: Hospitality
version: 1.4.0
core_min_version: 4.0
core_max_version: 5.x
depends:
  - inventory >= 1.0
  - sales >= 1.0
provides:
  permissions: ["hospitality.reservation.*"]
  events:
    - hospitality.reservation.created
  ui_routes:
    - /hospitality/reservations
license_modules: ["HOSPITALITY"]
hooks:
  - sales.invoice.posted   -> on_invoice_posted
```

## 27.3 Loading & Lifecycle

- Modules registered at boot via plugin host (`apps/plugin_host`).
- Per-tenant **enable/disable** flag (license-gated).
- Migrations run on enable for that tenant.
- Disabling soft-removes routes/permissions; data preserved unless purged.

## 27.4 Extension Points

| Extension Point            | Mechanism                                              |
|----------------------------|--------------------------------------------------------|
| Add API endpoints          | DRF/FastAPI router registration                        |
| Add UI routes              | Module bundle injected into PWA shell                  |
| Add fields to existing entity | Custom Fields framework (§27.6)                     |
| React to domain events     | Event subscriber declared in manifest                  |
| Modify behaviour           | Domain hooks/signals (`pre_post`, `post_post`, etc.)   |
| Add reports                | Report definitions + queries                           |
| Add posting rules          | Posting Rule registry (§31)                            |
| Add workflows              | Workflow templates + transition rules                  |
| Add permissions            | Permission codes auto-registered                       |

## 27.5 Sandboxing 3rd-party Plugins

- Trusted plugins run in-process (signed by vendor).
- Untrusted/marketplace plugins run in **isolated worker** with capability-scoped API; no DB/Redis direct access; only documented gateway methods.
- Resource limits (CPU, memory, time) per plugin invocation.
- Audit log of every plugin call.

## 27.6 Custom Fields Framework

- Per-tenant custom fields on supported entities.
- Storage:
  - **Typed columns** materialized lazily for performance (e.g., `cf_text_1..n`, `cf_num_1..n`) mapped via metadata table.
  - **Or JSONB** column with index helpers for dynamic schemas.
- Per-tenant metadata: type, label, validation, default, required, branch-scope, role visibility (field-level perms).
- API: serializers automatically include enabled custom fields; OpenAPI shows them as discovered properties.
- Search/index updated to include custom fields.

## 27.7 Custom Workflows

- State-machine engine (`apps/workflow`) with named states, transitions, guards, actions, approvals.
- Per-tenant workflow templates attached to document types.
- Visual editor (admin UI) compiles to JSON definition.
- All transitions audit-logged.

## 27.8 Custom Reports

- Report Builder UI: pick mart/view, fields, filters, grouping, format.
- Saved as `report_definition`; runs through standard report engine (§25).

## 27.9 Marketplace (Future)

- Vendor-published modules with version, screenshots, pricing, reviews.
- Tenant admin installs/uninstalls; vendor receives revenue share.
- Strict review process (security audit, perf benchmarks).

## 27.10 Compatibility Policy

- Modules declare core version range.
- Core releases have a deprecation window; modules update accordingly.
- Automated CI matrix tests (matrix of core × module versions).

---

# 28. TESTING ARCHITECTURE

## 28.1 Test Pyramid

```
                ┌──────────────┐
                │     E2E      │  (slow, fragile, few)
                ├──────────────┤
                │  Contract    │
                ├──────────────┤
                │ Integration  │
                ├──────────────┤
                │   Unit       │  (fast, deterministic, many)
                └──────────────┘
```

## 28.2 Unit

- pytest with `pytest-django`.
- Pure domain logic in `shared/domain/` covered ≥ 90%.
- No DB; mocks only at the boundary.
- Property-based testing (`hypothesis`) on financial math, posting balance, HLC ordering, conflict resolution.

## 28.3 Integration

- Real PostgreSQL (testcontainers) per test suite.
- Redis testcontainer.
- Tests run inside transactions or against ephemeral schemas; truncated between tests.
- Migration tests: forward + (selective) rollback drills.

## 28.4 Contract Tests

- Consumer-driven (Pact-style) for internal service consumers.
- OpenAPI compatibility test in CI: previous spec vs current; breaking changes flagged.
- Event schema compatibility: registry-driven.

## 28.5 E2E

- **Playwright** for PWA + Electron renderer flows: login, create SO, post invoice, pay, view financials.
- Headed and headless; multi-browser.
- Stable test data via factories + tenant-isolated namespaces.

## 28.6 Load Testing

- **k6** scripts simulate: 1k concurrent users browsing, 200 POS terminals selling, 50 sync clients, 10 heavy reports.
- Targets: **5k concurrent connections, 2k req/s sustained, posting p95 < 500ms**.
- Run in dedicated load environment with production-like topology.

## 28.7 Chaos Engineering

- **Litmus / Chaos Mesh** experiments: kill DB primary, partition Redis, drop network on workers, throttle disk.
- Verify SLOs hold; no data loss; auto-recovery within RTO.
- Quarterly Game Days.

## 28.8 Security Testing

- **SAST:** Bandit, Semgrep at PR gate.
- **DAST:** OWASP ZAP scheduled scans.
- **Secret scanning:** Gitleaks pre-commit and CI.
- **Dependency scanning:** OSV / Dependabot / pip-audit / npm-audit.
- **Container scanning:** Trivy at admission + build.
- **Penetration testing:** annual external; major releases.

## 28.9 Multi-Tenant Isolation Tests

- For every API surface, a generated test attempts cross-tenant access. Any leak fails the build.
- Same for sync push/pull, WS subscribe.

## 28.10 Sync Correctness — Deterministic Simulator

- A test harness in `tests/sync_sim/` generates op graphs (random concurrent edits, network partitions, replays, out-of-order, conflicts).
- Runs server + N virtual clients in-process.
- Asserts:
  - **Convergence:** all clients + server agree after sync drains.
  - **No financial corruption:** posted ledgers match across stores (where applicable).
  - **Conflict invariants:** policies adhered (LWW chooses correctly, manual queue used when required).
- Runs nightly with seed sweeps.

## 28.11 Migration Tests

- Forward migrations on a snapshot of production-like data.
- Performance benchmarks (must complete within budget per partition).
- Backfill correctness asserts.

## 28.12 Test Data Strategy

- Factories (factory_boy) per domain.
- Fixtures with realistic data (CoA, taxes, items) but **fully synthetic**.
- "Golden" datasets for posting/closing tests.

## 28.13 Performance Regression

- Microbenchmarks for hot paths (HLC compare, JE posting, cost calc).
- CI tracks numbers across runs; PR fails on > X% regression.

## 28.14 Code Quality Gates

- Coverage ≥ 80% overall, ≥ 90% for `shared/domain`.
- Type hints required (mypy strict) on `shared/`, `services/`, `models/`.
- Lint: ruff, black, isort.
- Dead code detection: vulture.

---

# 29. CI/CD ARCHITECTURE

## 29.1 Pipeline Stages

```
Commit → Lint → Type-check → Unit → SAST → Secret scan
       → Build images (multi-arch) → SBOM (Syft) → Sign (Cosign)
       → Push to registry
       → Deploy preview env (PR)
       → Integration + Contract + Migration tests
       → E2E (preview env)
       → DAST (scheduled / nightly)
Merge to main
       → Deploy to staging (auto)
       → Synthetic monitoring + smoke
       → Manual approval (release manager)
       → Progressive rollout to prod (canary 5% → 25% → 100%)
       → Auto-rollback on SLO breach
Tag v*
       → Publish PWA build to CDN
       → Publish Electron auto-update channels (stable/beta)
       → Publish SDKs
       → Generate release notes
```

## 29.2 Branching

- **Trunk-based** with short-lived feature branches.
- Merge via PR with required reviewers (CODEOWNERS).
- Squash-merge default.

## 29.3 Quality Gates

- All tests green.
- Coverage thresholds.
- OpenAPI diff: no breaking changes without ADR + label.
- Bundle size budget for PWA.
- Lighthouse CI pass.
- Security scans clean (or accepted with risk acceptance ticket).

## 29.4 Secrets in CI

- OIDC federation to cloud KMS (no long-lived static keys in CI).
- Per-job ephemeral creds.
- Secret scanning on every push.

## 29.5 Image Pipeline

- Multi-stage Dockerfiles, slim base, non-root user, read-only FS.
- Multi-arch (amd64 + arm64).
- Cosign-signed.
- SBOM attached (CycloneDX).
- Vulnerability scan as policy gate.

## 29.6 Artifact Registries

- Container images: GHCR / ECR / GAR.
- PWA bundles: CDN with versioned paths.
- Electron artifacts: signed, hosted on update server (S3 + CloudFront with signed URLs).
- SDK packages: npm / PyPI / pub.dev.

## 29.7 Database Change Pipeline

- Schema migrations reviewed and labeled in PR.
- **Plan/Apply** workflow per environment.
- Online migrations: `CONCURRENTLY` indexes; expand-contract for type changes; backfill jobs.
- Migration runner is **tenant-aware**, **batched**, **resumable**, and **monitored**.
- Rollback strategy: every migration has a documented rollback or compensating migration.

## 29.8 Progressive Delivery

- Canary via **Argo Rollouts** with metric-based promotion (error rate, latency).
- Feature flags via **Unleash / OpenFeature** for runtime gating.
- Per-tenant rollouts (gradual exposure to risky features).

## 29.9 Mobile / Electron Release Pipeline

- Electron: code-signed (Authenticode/Notarization), auto-update channels (stable/beta/canary), staged rollout %, kill-switch via license server.
- PWA: SW versioning, install prompt update.

## 29.10 Rollback Strategy

- Image rollback: redeploy previous tag (kept N versions).
- Schema rollback: only via forward "compensating" migration.
- Data rollback: PITR (per §22).
- Coordination runbook.

## 29.11 Compliance & Auditability

- All deploys logged with: actor, version, env, change set link, approval chain.
- Immutable build provenance (SLSA).
- Attestation (Cosign) verified at admission.

---

# 30. INVENTORY VALUATION ARCHITECTURE

## 30.1 Methods Supported

| Method        | Storage                       | Best For                      |
|---------------|-------------------------------|-------------------------------|
| Moving Average| `item_warehouse_avg_cost`     | Retail, distribution          |
| FIFO          | `stock_layer` per receipt     | Perishables, regulated        |
| LIFO          | `stock_layer` per receipt (rev. consume) | Inflationary commodity (where allowed) |
| Standard      | `item.standard_cost` + variance accounts | Manufacturing       |
| Specific      | per-serial cost               | High-value serialized goods   |

Per-item method, with company-default fallback. **Method cannot change while stock exists** — change requires zeroing out and re-entering.

## 30.2 Stock Layer (FIFO/LIFO)

```
stock_layer
├── id
├── company_id / branch_id / warehouse_id / item_id / batch_id
├── received_at         timestamptz (HLC + wall)
├── received_voucher_id
├── original_qty / remaining_qty   numeric(28,8)
├── unit_cost           numeric(28,8)  (in company currency)
├── landed_cost_alloc   numeric(28,8)
├── status              (OPEN, EXHAUSTED)
└── correlation_id

stock_layer_consumption
├── layer_id, voucher_line_id
├── qty_consumed, value_consumed
└── consumed_at
```

**Consume order:**
- FIFO: oldest open layer first.
- LIFO: newest open layer first.

## 30.3 Moving Average Algorithm

```
on receipt (qty, rate):
  new_avg = (current_qty * current_avg + qty * rate) / (current_qty + qty)
  current_qty += qty
  current_avg = new_avg
on issue (qty):
  cost = qty * current_avg
  current_qty -= qty
```

Average tracked **per (item, warehouse, batch?)**. Negative-qty after issue triggers re-pricing on next receipt to keep average sane.

## 30.4 Standard Costing & Variances

- `item.standard_cost` set in advance.
- Receipts at PO rate; variance posted to `Purchase Price Variance` (PPV).
- Issues at `standard_cost`.
- Production: actual material/labour/overhead − standard → posted to:
  - **Material Usage Variance**, **Labour Efficiency Variance**, **Overhead Variance**.

## 30.5 Specific Identification (Serialized)

- Each serial carries its acquisition cost.
- Issue cost = serial's recorded cost.
- No averaging.

## 30.6 Landed Cost Allocation

- Additional costs (freight, duty, insurance) allocated to received items by:
  - **By value** (default) — proportional to line value.
  - **By weight** / **by volume** / **by qty** (configurable).
- Allocation creates layer-level adjustments and post a "Landed Cost JE" linking to original GRN.

## 30.7 Back-Dated Entries & Re-Costing

- Posting a back-dated receipt/issue requires recomputing all subsequent stock entries for that (item, warehouse) (and possibly batch).
- Implemented as a **re-cost worker**:
  ```
  identify affected entries (after back-date) for the item/warehouse
  acquire posting lock on (item, warehouse)
  walk forward, re-applying valuation method
  for each entry, write a re-costing delta to stock_value_change_adj
  generate adjustment JEs in a single batched journal
  release lock
  ```
- All within a transaction window; long re-costs run as resumable chunks.

## 30.8 Period-End Snapshots

- At close-of-period, write `stock_balance_snapshot(company_id, period_id, item_id, warehouse_id, batch_id, qty, value)`.
- Snapshots used for fast valuation reports without scanning ledgers.
- Verified by tie-out: sum(snapshot) == sum(ledger up to period_end).

## 30.9 Year-End Re-Pricing (Specific Use)

- Some jurisdictions require year-end repricing (e.g., LCNRV — Lower of Cost or Net Realizable Value).
- Engine compares carrying value vs NRV per item; writes write-down JEs.

## 30.10 Tie-Out & Reconciliation

- Daily/weekly reconciliation: `Inventory account balance (GL)` vs `sum(stock_ledger.balance_value at date)` per company per warehouse.
- Discrepancies > tolerance flagged with drill-down to differing entries.

## 30.11 Performance Considerations

- `stock_ledger_entry` partitioned by month.
- `stock_layer` indexed by `(item, warehouse, status, received_at)` to make FIFO consume O(log n).
- Avg-cost path is O(1) per entry.
- Re-costing chunked to limit lock duration.

## 30.12 Multi-Currency Cost

- Cost stored in **company base currency**.
- Receipts in foreign currency converted at receipt-date rate; landed cost adjustments translated.
- Revaluation of inventory at FX is **not** applied automatically (inventory is non-monetary under most accounting standards).

---

# 31. ACCOUNTING JOURNAL ENGINE ARCHITECTURE

## 31.1 Engine Goals

- All postings flow through a **single engine** with explicit, declarative rules.
- Engine guarantees: balance, period validity, account validity, dimension policy, currency conversion, idempotency, atomicity with source document.
- Pluggable rule registry: modules add posting rules without modifying core.

## 31.2 Components

```
PostingRuleRegistry
  - register(source_doc_type, rule_callable, version)
  - resolve(source_doc) → rule

JournalBuilder
  - takes (rule, document, context)
  - returns JournalEntry draft (header + lines)

JournalValidator
  - balance per currency
  - period status
  - account active + non-group
  - dimension required
  - sign rules
  - debit/credit XOR per line
  - cross-line constraints (e.g., AR/AP needs party)

JournalPoster
  - acquires locks (period_id, party_id, account_id sub-ledger keys)
  - inserts journal_entry + journal_lines
  - inserts general_ledger_entry (denormalized for fast queries)
  - updates running party balances + period sums
  - emits JournalPosted event (outbox)
  - returns posted entry
```

## 31.3 Posting Rule Examples (declarative)

```
rule: SALES_INVOICE_POST
  on: SALES_INVOICE.status -> POSTED
  generate:
    DR: AR (party=customer, branch, project)         total_with_tax
    CR: REVENUE  (per line.account_or_default)       sum(line.amount)
    CR: TAX_PAYABLE                                  sum(tax)
    if perpetual_inventory:
        DR: COGS (per line.cogs_account)             sum(line.cogs)
        CR: INVENTORY (warehouse mapping)            sum(line.cogs)
  validate:
    balance: required
    party: required on AR
    period: open
```

```
rule: GRN_POST
  on: GRN.status -> POSTED
  generate (perpetual):
    DR: INVENTORY (per item.inventory_account)       sum(line.value)
    CR: GR_IR_CLEARING                               sum(line.value)
  for landed costs received later:
    additional rule LANDED_COST_ALLOC
```

Rules live in `apps/accounting/posting_engine/rules/` (one per source doc type), expressed as **pure functions or DSL records** evaluated by the engine. Modules can register additional rules.

## 31.4 Validators (Composable)

- `BalanceValidator` (per currency, per company).
- `PeriodValidator` (open / close-permitted).
- `AccountValidator` (active, postable, currency match).
- `DimensionValidator` (cost_center/project required if account requires it).
- `PartyValidator` (party required for sub-ledger accounts).
- `DuplicateValidator` (idempotency-key dedupe).
- `IntercompanyValidator` (matching offset across companies).
- `TaxValidator` (tax lines reconcile to expected by tax_code).

Each rule pipeline is a list of validators applied in order; all must pass.

## 31.5 Currency Handling

- Document currency × FX rate = base currency.
- Lines store both amounts.
- Multi-currency JE is allowed but **must balance per currency** AND in base.
- FX gain/loss: realized on settlement matching; unrealized via revaluation rule.

## 31.6 Reversal & Voiding

- `reverse(je)` builds an opposite-sign JE with `reversal_of_id = je.id`, posts it, and marks the original `is_reversed = true`.
- Original is **never** deleted.
- Reversal must occur in an open period or with `accounting.reverse_in_closed_period` permission (audit-logged).

## 31.7 Recurring & Templated JE

- `recurring_je_template`: schedule (cron), generator function (parametric), end date.
- Beat triggers; engine instantiates and posts; audit of each generation.

## 31.8 Approval Workflow Integration

- Manual JEs above thresholds enter approval (§7.9).
- Approval chain stored on JE; final approval triggers POSTED.

## 31.9 Period & Year-End Close

```
period_close(company_id, period_id):
  preconditions:
    - all subledgers reconciled (or variances accepted)
    - no draft JEs in period
    - inventory valuation snapshot taken (§30.8)
    - tax computations posted
  steps:
    1. Run validators
    2. Generate revaluation entries (FX) if needed
    3. Generate accruals/deferrals (rules-driven)
    4. Post period_closing_balance per account
    5. Set period.status = CLOSED
    6. Emit PeriodClosed event

year_end_close(company_id, fy_id):
  preconditions:
    - all periods in FY are CLOSED
  steps:
    1. Compute net income from all P&L accounts
    2. Post closing JE: DR revenue accounts, CR expense accounts; net to Retained Earnings
    3. Zero P&L balances; carry-forward BS balances
    4. Set fy.status = CLOSED
    5. Emit YearClosed event
```

Both run as long-running, resumable jobs with progress events to the user.

## 31.10 Inter-Company Posting

- For inter-company transactions (e.g., transfer Co A → Co B):
  - Engine generates **two** balanced JEs (one per company).
  - Linked by `intercompany_link_id`.
  - Eliminations module produces consolidation entries (eliminating IC AR/AP, IC sales/purchases, IC inventory profit) in the consolidation books.

## 31.11 Subledger Tie-Out

- Engine maintains running party + account balances atomically with JE post.
- Nightly reconciliation:
  - AR balance per customer = sum of unallocated SI − allocated CR.
  - AP balance per supplier = sum of unallocated PI − allocated CR.
  - Inventory account balance = sum of stock_ledger.balance_value across warehouses.
- Discrepancies surfaced with drill-down.

## 31.12 Concurrency & Locking

- Posting acquires:
  - Advisory lock on `(company_id, period_id)` for period-status check.
  - Row locks on relevant party balances.
  - Advisory lock on `numbering_series` for voucher number.
- Lock granularity narrow; never global.

## 31.13 Idempotency

- Posting key = `(source_doc_type, source_doc_id, action)`.
- Re-posting returns the original posted JE id.

## 31.14 Auditability

- Every posted JE carries: rule code, rule version, validators run, actor, source doc reference.
- Reversals/edits create chained history.
- Tie-out reports auto-link JE → source doc → audit log.

## 31.15 Performance Targets

- Single document posting (50 lines): p95 < 200 ms.
- Bulk posting (1000 invoices): throughput ≥ 500 docs/min on standard worker.
- Period close (medium tenant): < 5 minutes per company.
- Year-end close: < 30 minutes per company.

---

# APPENDIX A — KEY ARCHITECTURAL DECISIONS (ADR INDEX)

| ADR | Decision                                                |
|-----|---------------------------------------------------------|
| 001 | Hybrid tenancy (shared+schema+db per plan)              |
| 002 | Django for CRUD, FastAPI for sync/reports/public API    |
| 003 | HLC for offline ordering                                |
| 004 | Outbox pattern for reliable cross-system events         |
| 005 | Server-authoritative posting; no client-side GL         |
| 006 | Argon2id passwords; Ed25519 device/license signatures   |
| 007 | RFC 7807 error contract                                 |
| 008 | Range partitioning on ledgers/audit                     |
| 009 | Object-lock backups for ransomware resilience           |
| 010 | Same UI codebase for PWA + Electron renderer            |
| 011 | Permissions resolved at runtime, not in JWT             |
| 012 | Hash-chained audit log with external timestamp anchor   |
| 013 | LWW with HLC for Documents; manual review for Transactional |
| 014 | URL-major + header-minor API versioning                 |
| 015 | Channels for WS with Redis channel layer; SSE fallback  |
| 016 | Celery + KEDA for workers; outbox-relay separate worker |
| 017 | Redis Streams default broker; Kafka path for Enterprise |
| 018 | OpenTelemetry across all runtimes                       |
| 019 | DW separated from OLTP; replicas + dbt + ClickHouse path|
| 020 | Cache layered with versioned keys + tenant-prefixed     |
| 021 | Plugin host with signed modules + sandboxed marketplace |
| 022 | Deterministic sync simulator as first-class test asset  |
| 023 | Trunk-based dev + canary rollout + feature flags        |
| 024 | Stock layers for FIFO/LIFO; avg-cost stored per (item, warehouse)|
| 025 | Single Posting Engine with declarative rule registry    |

---

# APPENDIX B — IMPLEMENTATION GATING (PHASED)

This architecture is the source of truth. Implementation will proceed in this order, **only after explicit approval**:

1. `core` + `tenancy` + `identity` + `auth_service` + `rbac` + `audit`
2. `master` (item, partner, branch, warehouse, currency, tax, UOM, numbering)
3. `accounting` (CoA, journal, posting engine, GL, fiscal periods, AR/AP subledgers)
4. `inventory` (stock ledger, valuation engines, reservations, batch/serial, transfers)
5. `purchase` + `sales` + `pos`
6. `manufacturing`, `hr_payroll`, `crm`, `assets`, `projects`
7. `sync` (FastAPI) + Electron client + PWA client + `eventbus` + outbox relay
8. `licensing` + `billing` + SaaS portal
9. `reports` + `analytics` + warehouse pipelines
10. `notifications` + `webhooks` + WS real-time
11. `plugin_host` + custom fields + workflow engine
12. Observability hardening, load tests, chaos drills, DR drills
13. Production cutover + canary onboarding

**Awaiting approval to proceed to Phase 1 implementation.**
