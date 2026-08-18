# Hosting & Portability

**Module Type:** Cross-Cutting Infrastructure Decision Doc  
**Status:** Pre-development planning — source of truth for hosting, deployment, and portability  
**Related docs:** `MoneyMind_BRD_PRD.md` (tech stack), `MoneyMind_Project_Overview.md` (project brief), `data-tables-v2.md` (canonical schema), `DEV-ENV.md` (local development guide), `module/0. Auth & User Management Module.md` (auth), `module/C3. Data Export Component.md` (export pipeline)

---

## 1. Purpose & Scope

This document is the canonical reference for **where and how MoneyMind runs**. It converts the scattered host hints across the docs (`Supabase/AWS-ready`, "hosted database", "no Supabase-only features") into one explicit, reasoned decision set.

It covers: auth portability, database hosting, application deployment, background jobs, object storage, notifications & email delivery, configuration & secrets, backups, and the list of **explicitly excluded** infrastructure.

It does **not** change any module FR and does **not** define code-level APIs. Infrastructure decisions only.

---

## 2. Guiding Principles ("Commandments")

1. **Portability-first.** Every infrastructure choice must be a plain-SQL, plain-HTTP, open-standard choice. A vendor-specific feature is allowed only where a written portability path accompanies it (see § 7 storage as the model for this pattern).
2. **One deployable, two layers.** One Next.js application (the deployable) + one PostgreSQL database. The application contains an **embedded API service** (Hono, the `api/` workspace package) mounted at `/api/*`; the UI talks only to that `/api/*` contract and never to the database. No service mesh, no distributed saga orchestration, no per-module services. The API layer may be extracted to its own host later without UI changes (§ 5.5).
3. **Zero-external-infra default.** Database-as-queue before Redis. Polling before WebSocket infrastructure. Cron before external schedulers. Adopt external infra only when there is measured evidence of need.
4. **Postgres-compatibility floor.** Anything that runs on stock PostgreSQL (RLS, `current_setting`, `gen_random_uuid`, `FOR UPDATE SKIP LOCKED`) is allowed. Anything Supabase-only (or provider-only) is banned.
5. **The database schema is the contract.** `data-tables-v2.md` is canonical; the Python scripts `scripts/db_setup.py` (schema) and `scripts/mock_data.py` (seed) are its executable form; the app never reaches into the database behind a provider's special schema (`auth.*`).

---

## 3. Auth: The Portability Decision

### Decision
Use the **custom in-app auth** exactly as specified in `module/0. Auth & User Management Module.md` (custom `users`, `user_profiles`, `user_settings`, `auth_tokens`, `login_attempts`, `access_logs`; session tokens hashed at rest; RLS via `app.current_user_id`). **Do not use Supabase Auth (GoTrue).**

### Why Not Supabase Auth
Supabase Auth is open source and its *logic* would run on AWS too (self-hosted GoTrue on RDS). But the lock-in is in the **integration layer**, not the auth itself:

| Bound surface | Where the lock-in lives |
|---|---|
| RLS policies | Written against `auth.uid()` / `auth.jwt()` — a Supabase-specific DB surface |
| Session verification | Designed around Supabase client SDK + cookie handling |
| Email flows | Magic links / OTP templates owned by the provider's console |
| Identity schema | `users` lives in the `auth` schema, outside the app schema |

Migrating means rewiring RLS, sessions, and email flows — or self-hosting GoTrue (extra ops burden). That is precisely the cost this project refuses to pay.

### Why Our Custom Design Is Cost-Free Everywhere
- Plain tables with plain SQL — identical DDL and behavior on Supabase, AWS RDS, Neon, or any stock Postgres.
- Standard bcrypt/Argon2 password hashing, APP-generated rotating session tokens computed from `user_settings`-independent code.
- RLS via `current_setting('app.current_user_id', true)` set per-request inside a transaction wrapper — a stock-Postgres pattern that runs unchanged everywhere.
- Provider-neutral session table means adding OAuth (Google, etc.) later is a code change, not a hosting change.

### What We Own in Exchange
Password hashing & storage, session rotation/revocation, rate limiting, magic-link/reset email delivery. All already fully specified in FR-A.1 → FR-A.17 of Module 0 — no new work is created by this decision, only confirmed responsibility.

---

## 4. Database Hosting

### Usage Model
Supabase is used **only as managed plain PostgreSQL** (its PostgreSQL tier). Explicit non-use list:

- ❌ Supabase Auth (`auth.*` schema, GoTrue)
- ❌ Supabase Realtime (production notification transport)
- ❌ Supabase Storage (production object storage)
- ❌ Supabase Edge Functions
- ❌ Any Supabase-only extension or function

Phase 1 projects are created on the Supabase free tier purely for a managed Postgres instance. The app talks to it only through `DATABASE_URL`.

### Compatibility Matrix

| Area | Supabase (Phase 1) | AWS RDS (migration) | Notes |
|---|---|---|---|
| SQL dialect | Stock PG 15/16 | Stock PG (same) | Zero diff — guaranteed by commandment 4 |
| RLS pattern | `current_setting('app.current_user_id')` | Identical | Same policies — part of `scripts/db_setup.py`, re-applies unchanged |
| Schema bootstrap | `scripts/db_setup.py` via the venv Python | Identical | Same script, same order |
| Prisma client | `prisma db pull` introspection | Identical | Schema a prisma source of truth never; scripts are |
| Automated backups | Supabase-managed PITR | RDS automated snapshots + PITR | Both fine; see § 10 |
| Export worker | Vercel Cron → API route | EventBridge → Lambda | Same handler code, trigger differs (§ 6) |
| Storage | Local in dev → S3-compatible in prod | AWS S3 | Adapter contract is provider-neutral (§ 7) |

### AWS Migration Checklist (whenever needed — not now)
1. `pg_dump` the Supabase database (schema + data) or use logical replication for a live copy.
2. Create the RDS Postgres instance (pick the same major version).
3. Restore the dump (this is the *same database* — the "migrate same database" workflow is documented step-by-step in `DEV-ENV.md` § 10).
4. Re-run `scripts/db_setup.py` with the RDS `DATABASE_URL` (create-database step skipped) — it is idempotent and provider-neutral.
5. Point `DATABASE_URL` at RDS in `.env.production`.
6. Verify RLS with the smoke checklist.
7. Re-point the cron trigger (Vercel Cron → EventBridge) — worker logic is unchanged.
8. Done. **No application code changes.**

---

## 5. Application Deployment

### 5.1 Deployment Model — One Next.js App with an Embedded API Service

MoneyMind deploys as **one Next.js application** on the App Router. The application is internally split into two layers that talk to each other **only over HTTP at `/api/*`**:

```
┌──────────────────────────── Next.js app (one Vercel project) ────────────────────────────┐
│                                                                                          │
│  UI layer (frontend)                                     API service (backend)           │
│  ├─ pages / layouts / client components  ──HTTP──▶  /api/*   Hono app (api/ package)      │
│  ├─ server components (src/lib/api-client.ts)      ◀─JSON──  ├─ auth, sessions (bcrypt)  │
│  ├─ server-action proxies (src/app/**/actions.ts)            ├─ queries (pg)             │
│  └─ client fetches (/api/... same-origin)                    ├─ RLS wrapper (withUser)   │
│                                                              └─ CSV export, history, jobs │
│                                                                    │ DATABASE_URL        │
└────────────────────────────────────────────────────────────────────┼──────────────────────┘
                                                                    ▼
                                                    PostgreSQL (Supabase managed PG / RDS)
```

- The **backend** (`api/` workspace package, `@moneymind/api`) owns **all** database access, session verification, password hashing, validation, the RLS transaction wrapper (`SET LOCAL app.current_user_id` per transaction), CSV export, balance history, and the worker endpoint. It is mounted in-process by `src/app/api/[[...route]]/route.ts`.
- The **frontend** never imports `pg`, `bcryptjs`, or query modules. Server components fetch through `src/lib/api-client.ts` (cookie forwarding via `next/headers`); mutations go through thin `"use server"` proxies with the same signatures/state shapes as before; the client calls `/api/...` directly (same-origin, no CORS).
- `src/proxy.ts` (middleware) excludes `/api` from its matcher — the API answers unauthenticated calls with `401 JSON`, never an HTML redirect.
- **Why this shape:** the UI can be rebuilt or re-skinned at any time without touching a line of backend code — the `/api/*` contract is stable and framework-agnostic. Sessions, RLS, and business rules stay exactly where they are (per the project docs), and there is still exactly one thing to deploy.

### 5.2 The UI ↔ API Contract (what the frontend may rely on)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/login`, `/api/auth/signup` | POST | Returns `{ token, maxAge }`; the web layer sets the `mm_session` cookie |
| `/api/auth/logout` | POST | Revokes the session (reads the cookie) |
| `/api/auth/me` | GET | Session verification — returns `{ user_id, email, full_name, token_id }` or `401` |
| `/api/accounts` | GET | `{ accounts, types }` (with `?includeInactive=1`) |
| `/api/accounts` | POST | Create account → `{ success }` or `{ error }` / `{ fieldErrors }` |
| `/api/accounts/:id` | PATCH / DELETE | Update (optimistic `version` check) / delete (guarded by history+balance) |
| `/api/accounts/:id/deactivate` · `/reactivate` | POST | Toggle active state |
| `/api/accounts/export` | GET | CSV download (`Content-Disposition: attachment`) |
| `/api/accounts/:id/history?range=` | GET | `{ account, points }` for the balance chart |
| `/api/transfers` | GET / POST | List / create transfers |
| `/api/transactions` | POST | Quick-add expense/income (used by the mobile `/add` flow) |
| `/api/categories` | GET | System + user categories (quick-add picker) |
| `/api/jobs/run` | GET | Worker trigger (Phase 2), `CRON_SECRET`-guarded |

Errors are always JSON `{ error?, fieldErrors? }` with proper status codes (400/401/404/409/429/500). This table is the entire surface a replacement UI needs — everything else is internal to `api/`.

### 5.2a Mobile Clients — the Same Contract

The iOS/Android apps (`DOCS/mobile.md`) are **additional clients of the same `/api/*` contract**, not a second deployment:

- The Capacitor shell is a system WebView loading the deployed app — same origin, same cookies, zero CORS, no rewrites, no API changes.
- The quick-add flow uses the same endpoints as the web UI: `/api/transactions`, `/api/accounts`, `/api/categories`.
- Phase 2 shortcut entries (widgets, iOS App Intents / Back Tap) only fire deep links to `/add`; a pure native client could later call the API directly with a Bearer token (documented extension, `mobile.md` § 8).

### 5.3 Environment Tiers

| Tier | App host | Database | Worker | Purpose |
|---|---|---|---|---|
| Dev | Local `pnpm dev` (:3000) | Local Docker Postgres 16 | node-cron in-process | Daily development (see `DEV-ENV.md`) |
| Staging (optional) | Vercel preview deployment | Supabase free tier | Vercel Cron | Pre-release verification |
| Phase 1 prod | Vercel | Supabase free tier (managed PG) | Vercel Cron | Live app |
| AWS path (later) | Vercel, or a single ECS Fargate task | RDS | EventBridge → Lambda | Migration target |

### 5.4 Deploying to Vercel (Phase 1)

One project — the repository root is the app.

1. **Import the repo** into Vercel. Framework preset: **Next.js**. Root directory: repo root.
2. **Build settings** — leave defaults (build command `pnpm build` is picked up from `package.json`; install command `pnpm install` handles the workspace, including the `api/` package).
3. **Environment variables** (see § 9 for the full inventory):
   - `DATABASE_URL` — Supabase managed-PG connection string (non-owner role recommended: the RLS policies in `scripts/db_setup.py` fire for non-owner roles, enforced by the `withUser()` wrapper).
   - `SESSION_SECRET`, `EMAIL_PROVIDER` (+ `EMAIL_API_KEY`), `STORAGE_DRIVER` (+ S3 vars), `CRON_SECRET`.
   - `APP_URL` — optional fallback origin for the web→API client; when unset the client derives the origin from the request host header.
4. **Deploy.** The catch-all route handler (`/api/[[...route]]`) becomes the serverless functions serving the API; pages and proxies are standard Next functions. Server actions call the API over HTTP to the app's own origin (a self-invocation per mutation) — an accepted cost at personal scale, and exactly the path used if the API is ever extracted (§ 5.5).
5. **Cron (Phase 2 export worker):** add a `vercel.json` cron entry hitting `GET /api/jobs/run` with header `x-cron-secret: $CRON_SECRET`. The handler is idempotent and DB-as-queue (§ 6).
6. **Verify:** run the smoke checklist in `DEV-ENV.md` § 12 against the deployed URL (login → `me` → create account → transfer → export → 401 checks).

No second project, no rewrites, no CORS configuration is needed for this topology — the API and UI share one origin.

### 5.5 Future Path — Extracting the API to Its Own Host

If a replacement UI ever needs the backend on a different origin (a separate SPA, a mobile app, or a dedicated API host):

1. The Hono app in `api/` already runs on plain HTTP — add a thin Node entry (`@hono/node-server`) and deploy the package to Railway / Render / Fly (or as its own Vercel project via the `hono/vercel` adapter). `DATABASE_URL`, `SESSION_SECRET`, and friends move to that service's env.
2. In the web app, point `next.config.ts` rewrites at the new origin (`rewrites: [{ source: "/api/:path*", destination: "${API_URL}/api/:path*" }]`); same-origin cookies keep working with no CORS.
3. For cross-origin clients (no rewrite in front): enable CORS on the API with credentials, and set the session cookie `SameSite=None; Secure`. Direct clients would instead use an `Authorization: Bearer <token>` flow against the same endpoints.
4. No backend code changes — the `/api/*` contract is the interface.

### 5.6 No Kubernetes — Rationale

Kubernetes pays off when you are orchestrating many independently scaling services with high QPS variability. MoneyMind is two workloads (one Next.js app, one Postgres) with tiny, predictable traffic (personal finance, "a few exports per week per user", sub-ms queries). A K8s cluster would add: control-plane upkeep, cluster networking, autoscaling config, and operational knowledge requirements — all for zero user-visible benefit.

If containerized scaling is ever genuinely needed, the on-ramp is **ECS Fargate** (no cluster management), not EKS. Today: not even Fargate.

---

## 6. Background Jobs — The Export Worker

### Decision: Database-as-Queue
Export jobs use the `data_export_jobs` table as the queue (see `data-tables-v2.md` Component C3, `module/C3. Data Export Component.md`). Lifecycle: `queued → processing → completed / failed`. A worker claims rows with:

```sql
SELECT ... FROM data_export_jobs
WHERE status = 'queued' AND user_id = $user_id
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

No Redis, no SQS, no Bull/Celery. Rationale: tiny volume (a few exports per week per user; even a full archive takes seconds, not minutes) and the database is already there, durable, and transactional — queue semantics for free.

### Worker Triggers (platform-neutral)

| Platform | Worker host | Trigger |
|---|---|---|
| Dev | Same Node process | `node-cron` cadence |
| Vercel | Serverless function | Vercel Cron → guarded `/api/jobs/run` (idempotent, `CRON_SECRET`-protected) |
| AWS | Lambda | EventBridge scheduled rule → same handler code |

The worker logic is **one exported function**; only the trigger differs. An export request is always `INSERT queued row → return job id`; the UI polls or receives SSE status updates.

### Cancellation (optional Phase 2)
If a full-archive job runs long, `CANCEL_REQUESTED → CANCELLED` can be added to the status CHECK. It is not needed at Phase 1 scale. Download-link expiry is derived from `created_at + 24h` — it is **not** a job status.

---

## 7. Object Storage

### Decision
S3-compatible API is the portability floor. Phase 1: local disk in dev (`STORAGE_DRIVER=local`, per `DEV-ENV.md`) and **Supabase Storage is acceptable in dev only**; production uses a real S3-compatible service (AWS S3 or Cloudflare R2). The application never talks to a provider SDK directly — only through a thin **storage adapter** that exposes: `putObject`, `getObject`, `createPresignedUrl`. Swapping driver = env change, zero code change.

### Usage Contract
- Pre-signed download URLs only; **24-hour expiry** (consistent with FR-C3.8).
- Per-user path prefixes: `exports/<user_id>/...`, `notes/<user_id>/...`, `avatars/<user_id>/...`.
- No public buckets except static app assets.
- Uploads (avatars, `note_attachments`) go through the same adapter so they remain portable.

---

## 8. Notifications & Email Delivery

### Notification Transport — SSE + Polling Fallback
- **Primary:** Server-Sent Events via a Next.js Route Handler (`/api/notifications/stream`), streaming new rows from the `notifications` table. SSE is plain HTTP — no provider dependency, works on Vercel and AWS alike.
- **Fallback:** 30-second polling of the same `notifications` table when SSE is unavailable (proxies, suspended tabs).
- **Excluded:** Supabase Realtime in production — its channel protocol is server lock-in with zero benefit for a personal-scale feed.

Both transports read the identical data path; the UI layer cannot tell the difference.

### Email — Provider Abstraction
A single `EmailProvider` interface: `send(template, to, data)`. Implementations are chosen by env var:

| Provider | Where |
|---|---|
| `console` | Dev — prints emails to terminal (magic links copyable) |
| `resend` | Supabase-hosting era (Phase 1 prod) |
| `ses` | AWS migration |

Email templates/flow (magic links, reset tokens, weekly digest per C2) are code, not provider console config. `notification_emails` records deliveries regardless of provider.

---

## 9. Configuration & Secrets

### Environment Variable Inventory

| Var | Dev | Prod | Purpose | Consumed by |
|---|---|---|---|---|
| `DATABASE_URL` | local PG | Supabase / RDS | Runtime DB connection (non-owner role recommended in prod) | `api/` backend |
| `DATABASE_URL_OWNER` | local PG | not used in prod | Migrations / seed only | Python scripts |
| `SESSION_SECRET` | random dev string | random prod string | Session token hashing (Module 0) | `api/` backend |
| `APP_URL` | `http://localhost:3000` | production origin | Magic links / reset email links; fallback origin for the web→API client | web layer |
| `EMAIL_PROVIDER` | `console` | `resend` / `ses` | Email adapter selector | `api/` backend |
| `EMAIL_API_KEY` | — | provider key | Email adapter credential | `api/` backend |
| `STORAGE_DRIVER` | `local` | `s3` | Storage adapter selector | `api/` backend |
| `STORAGE_ENDPOINT` / `_KEY` / `_SECRET` / `_BUCKET` | — (local driver) | S3-compatible values | Storage adapter config | `api/` backend |
| `CRON_SECRET` | dev value | prod value | Guards `/api/jobs/run` | `api/` backend |

> Because the backend is embedded in the web app (one deployable), a single env namespace serves both layers; the "consumed by" column records where each variable is read in code (`api/src` vs `src/lib`).

### Rules
- `.env.local` is gitignored; `.env.example` is committed (see `DEV-ENV.md`).
- Secrets are never committed, never logged, never in query strings (FR-A.17).
- Prod secrets: Vercel project env / AWS Secrets Manager (single source, retrieved at deploy).
- AI keys are **user-owned** (stored encrypted per-user per the docs) — the application itself holds no AI credential.

---

## 10. Backups & Data Portability

Two complementary layers:

1. **Provider-level (DB):** Supabase-managed PITR backups (Phase 1) / RDS automated snapshots + PITR (AWS). Standard; no application involvement.
2. **Application-level (user):** Component C3's full data export (`MoneyMind_FullBackup_<date>.zip` with per-module CSVs + manifest) is the user-facing, restore-ready copy and the GDPR data-copy path. Restore = re-import or (Phase 2) `pg_dump --data-only` restore.

The RDS migration (§ 4) reuses the same portability mechanism as backups: everything is plain SQL + CSV.

---

## 11. Explicitly Excluded (with Rationales)

| Technology | Rationale |
|---|---|
| Kubernetes / EKS | Two workloads at personal scale; pure ops burden (§ 5) |
| Redis / Bull / Celery / message queues | DB-as-queue covers worker volume ($ 6) |
| SQS (Phase 1) | Same rationale as queues; EventBridge→Lambda only if AWS path is taken |
| Supabase Auth | RLS + session lock-in; custom auth is already fully specified (Module 0) |
| Supabase Realtime (prod) | Server-lock-in transport; SSE + polling is plain HTTP |
| Supabase Edge Functions / Storage (prod) | Supabase only as plain managed Postgres (§ 4) |
| Microservices / separate API server | One deployable with an embedded API layer (§ 5); the `/api/*` contract already isolates the backend, so a standalone service can be extracted only when there is measured reason (§ 5.5) |
| Containerized production | Docker is a dev-only convenience (see `DEV-ENV.md`) |
| Third-party auth SDK (Auth.js etc.) | Session table is provider-neutral; an SDK adds a dependency layer without portability benefit |

---

*Document version: August 2026 | Applies to Phase 1 and the AWS migration path | Companion doc: `DOCS/DEV-ENV.md`*