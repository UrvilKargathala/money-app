# DEV-ENV — Local Development Environment Guide

**Module Type:** Cross-Cutting Developer Guide  
**Status:** Pre-development planning — day-0 setup + daily workflow + Supabase migration runbook  
**Companion doc:** `DOCS/hosting-and-portability.md` (infrastructure decisions — this guide implements its decisions locally)  
**Related docs:** `data-tables-v2.md` (canonical schema — source for `scripts/db_setup.py`), `module/0. Auth & User Management Module.md` (auth), `module/C3. Data Export Component.md` (export/worker)

---

## 1. Purpose & Architecture

**Local-first rule:** All development happens against **local plain PostgreSQL**. Supabase is not touched until the application is feature-complete and verified locally — then the *same database* (schema, policies, lookups) is migrated to Supabase. This is possible because `hosting-and-portability.md` bans Supabase-only features; nothing in the schema or code depends on a provider.

### Environment Diagram

```
 Laptop (Windows)
 ├─ Next.js dev server        :3000   (App Router; hosts the embedded Hono API service at /api/*)
 ├─ api/ (workspace package)          (@moneymind/api — Hono backend: auth, sessions, queries, RLS wrapper, CSV, history; mounted in-process by src/app/api/[[...route]]/route.ts)
 ├─ Capacitor Android shell           (android/ — system WebView loading the dev server; DOCS/mobile.md)
 ├─ Python 3.13 scripts        (scripts/db_setup.py — schema, scripts/mock_data.py — demo seed)
 ├─ node-cron dev worker               (export jobs + nightly jobs — bills status refresh, net worth snapshot; DB-as-queue)
 └─ Dev adapters: EMAIL_PROVIDER=console, STORAGE_DRIVER=local, SSE + polling
        │  DATABASE_URL
        ▼
 PostgreSQL 16 (local service or Docker container)  :5432
 ├─ moneymind_dev       (development)
 └─ moneymind_test      (automated tests)
```

The frontend (pages/components/server actions) never touches the database — it talks only to `/api/*`. The Hono backend in `api/` owns all DB access, session verification, and the RLS transaction wrapper. One dev process, one `.env.local`, one deployable.

Because dev runs stock Postgres, DB behavior in dev is **identical** to Supabase. The Python scripts are the canonical bootstrap for both environments.

---

## 2. Prerequisites (Windows)

| Tool | Version | Purpose |
|---|---|---|
| Python | 3.13+ | `scripts/db_setup.py` + `scripts/mock_data.py` (venv inside `scripts/.venv`) |
| PostgreSQL | 16 | Local database (native service *or* Docker — see § 3) |
| Node.js | 20 LTS+ | Runtime |
| pnpm | latest (via `corepack enable` or standalone) | Package manager |
| JDK | **21** (not 17/25) | Android builds — Capacitor 8 / AGP 8.7 compiles at source level 21; set `JAVA_HOME` to it |
| Android SDK | installed (`C:\Android\Sdk` on this machine) | `npx cap add android` + `gradlew` builds |
| macOS + Xcode | iOS only | iOS builds cannot be produced on Windows (see `DOCS/mobile.md` § 6) |
| Postgres client (optional) | DBeaver / TablePlus / pgAdmin | Visual inspection |

**Explicitly NOT required in dev:** Supabase account, AWS account, S3 credentials, real email provider, Redis, Kubernetes.

---

## 3. Local PostgreSQL Setup

One Postgres instance. This is the *entire* infra scope of the project (see hosting doc § 5 + § 11). **No custom roles are created** — the default `postgres` superuser owns everything (RLS policies still exist; see § 4).

### Option A — Native PostgreSQL (used on this machine)
PostgreSQL is already installed as a Windows service on port `5432`. Default credentials for the scripts: user `postgres`, password `postgres` (override via env vars, § 7).

### Option B — Docker (alternative)

```yaml
# docker-compose.yml — dev-only; not used in production
services:
  postgres:
    image: postgres:16-alpine
    container_name: moneymind-pg
    environment:
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  pgdata:
```

Start: `docker compose up -d` → wait for the health check to pass. Verify: `docker compose ps`.

---

## 4. RLS Locally — What to Expect

`db_setup.py` creates **policies only** (no roles, no `FORCE ROW LEVEL SECURITY`):

| Who connects | RLS behavior |
|---|---|
| `postgres` (table owner — dev scripts, and locally the app if no other role exists) | **Policies bypassed**, like Supabase's `service_role` |
| any non-owner role (future runtime role on Supabase) | Policies fire — `current_setting('app.current_user_id')` must be set per request |

The runtime sets the RLS context per request: `BEGIN; SET LOCAL app.current_user_id = $uid; ... COMMIT;` inside the query wrapper. If the wrapper is missing, you get **0 rows** — a bug that shows up when the app later connects as a non-owner.

---

## 5. Python Scripts — Database Bootstrap (canonical DDL)

The database is created **entirely by `scripts/db_setup.py`**, column-for-column as `data-tables-v2.md` defines: **67 tables** in FK dependency order, **123 indexes** (incl. partial + GIN trigram — `pg_trgm` extension is created automatically), **63 RLS policies**, and `ENABLE ROW LEVEL SECURITY` on all user-owned tables. It is idempotent: drops and recreates every known table (`DROP TABLE IF EXISTS ... CASCADE`), so re-running it is a full reset. The same script is the canonical DDL for **both** local dev and the Supabase migration — nothing differs between environments (see its header comment for the Supabase connection-string note).

### Directory Layout — `scripts/`

```
scripts/
├── .venv/            # Python virtual environment (gitignored)
├── db_setup.py       # Schema: DDL, indexes, RLS functions + policies, pg_trgm
└── mock_data.py      # Demo seed: 3 users + ~31k rows, 200+ rows per module
```

### Connection contract (same env vars for both scripts — machine independent)

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | *(unset)* | If set, used verbatim and the create-database step is **skipped** (the Supabase path — § 12) |
| `PGHOST` | `localhost` | Server |
| `PGPORT` | `5432` | Port |
| `PGUSER` | `postgres` | User (default superuser — no app roles by design) |
| `PGPASSWORD` | `postgres` | Password |
| `PGDATABASE` | `moneymind_dev` | Target database (created if missing) |
| `PG_ADMIN_DB` | `postgres` | Maintenance DB used for `CREATE DATABASE` |

---

## 6. Seed Strategy

### Seed A — System Lookups + Users (inside `mock_data.py`, required)
System rows the app *requires* to function: `categories` (system set incl. sub-categories), `account_types`, `debt_types`, `tax_sections`, `tax_regime_slabs`, `note_templates`, system `goal_templates` + `report_templates` — plus 3 users (`demo@moneymind.local`, `partner@moneymind.local`, `family@moneymind.local`).

### Seed B — Demo Dataset (`scripts/mock_data.py`, optional but recommended)
~32k rows across 66 tables; **200+ rows per module** (transactions with merchants/categories, budgets + alerts + rollovers, bills/subscriptions + payment history, goals + contributions + milestones, loans with full `amortization_schedule`, tax investments, investments + SIPs + snapshots + price history, net-worth, secure notes, calendar, notifications, export jobs). Deterministic seed (`20260813`) → reproducible data. **Never run against Supabase.**

### Consistency rules (enforced by the script)
- `goal_milestones` reach dates match cumulative progress (`SUM(goal_contributions)`); goal progress is derived on read — no stored `current_amount`.
- `debts.principal_outstanding / months_remaining / total_interest_paid` == the paid portion of the amortization schedule.
- `account_balance_history` == opening balances + cumulative transaction net per day.
- `budget_alerts` utilization == actual spend vs `budgets.amount`.

### Performance
Single transaction, multi-row batched inserts (psycopg `executemany`); full seed runs in **~2 s** locally.

---

## 7. Environment Files

`.env.example` is committed; `.env.local` is gitignored. See `hosting-and-portability.md` § 9 for the full inventory and rules.

| Var | Dev value | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/moneymind_dev` | Backend connection (consumed by the `api/` package in-process) |
| `SESSION_SECRET` | random dev string | Session token hashing (Module 0) |
| `APP_URL` | `http://localhost:3000` | Magic-link / reset email links; fallback origin for the web → API client |
| `EMAIL_PROVIDER` | `console` | Emails print to terminal (links copyable) |
| `STORAGE_DRIVER` | `local` | Exports/attachments → `./storage/` (adapter contract from hosting doc § 7) |
| `CRON_SECRET` | dev value | Guards `/api/jobs/run` (API package) |

The app is a pnpm workspace: the web app (root) depends on the `@moneymind/api` workspace package (`pnpm-workspace.yaml` → `packages: [api]`). `pnpm install` installs both; the backend reads the same `process.env` as the web app, so a single `.env.local` covers everything.

---

## 8. Bootstrap Sequence

Run in order; each step has a verify check.

1. Ensure PostgreSQL is running (native service or `docker compose up -d`). Verify: port 5432 reachable.
2. Create the Python venv **once**: `python -m venv scripts\.venv`, then `scripts\.venv\Scripts\python -m pip install psycopg[binary]` (already done on this machine; psycopg 3.3.4).
3. `corepack enable`; `pnpm install`
4. `cp .env.example .env.local`
5. **`scripts\.venv\Scripts\python scripts\db_setup.py`** → creates `moneymind_dev` (if missing) + all 67 tables, indexes, policies. Verify: output lists all 67 tables, "Done." with elapsed time; `\dt` shows all module tables.
6. **`scripts\.venv\Scripts\python scripts\mock_data.py`** → lookups + demo dataset. Verify: "Loaded ~32k rows across 66 tables".
7. `pnpm dev` → http://localhost:3000 → signup → copy demo creds from `.env.local` / seed docs → login.

Re-running step 5 wipes and recreates the schema (full reset); steps 5 + 6 together bring it back to a fresh seeded state.

> The `api/` workspace package has its own typecheck: `pnpm --filter @moneymind/api typecheck`. The web build typechecks it too (`transpilePackages: ["@moneymind/api"]` in `next.config.ts`).

---

## 9. Backend Boundary — The `api/` Workspace Package

**All backend logic lives in the `api/` package (`@moneymind/api`), mounted at `/api/*` by `src/app/api/[[...route]]/route.ts`.** The web app never imports `pg`, `bcryptjs`, or query modules — it talks to the API over HTTP (server components and server-action proxies via `src/lib/api-client.ts`; the client fetches `/api/...` directly, same-origin). This is what makes the UI swappable later: rebuild the frontend and keep the same `/api/*` contract.

- Backend sources: `api/src/{app,db,middleware,session,auth,validation,constants,types}.ts`, `api/src/queries/`, `api/src/routes/`.
- Mutations run inside `withUser()` (transaction + `SET LOCAL app.current_user_id` — the RLS wrapper from § 4).
- Server actions in `src/app/**/actions.ts` are **thin proxies**: same signatures/state shapes as before, bodies forward to `/api/*` via `apiFetch`, set/clear the `mm_session` cookie, and keep `revalidatePath` for live updates.
- `src/proxy.ts` excludes `/api` from its matcher — the backend answers unauthenticated calls with `401 JSON` instead of an HTML redirect.

### Smoke-testing the API directly (no browser needed)

```bash
# login → returns { token, maxAge }; store the cookie
curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"demo@moneymind.local","password":"Demo1234","remember":true}'
# authenticated read
curl -s http://localhost:3000/api/accounts?includeInactive=1 -H "Cookie: mm_session=<token>"
# unauthorized → 401 JSON
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/me
```

The API is a plain HTTP surface, so it is testable with curl / Python without the server-action wire protocol.

### About `api/node_modules`
The `api/` folder has its **own `node_modules`** — pnpm workspace isolation (not a copy): pnpm hardlinks the real files from the shared store at the root, and each workspace package resolves **only its declared deps** (hono, pg, bcryptjs, types). This is required for correct resolution (`api` imports `hono` directly; the web app never does). It is gitignored, auto-recreated by `pnpm install`, and costs ~zero disk — leave it alone, never commit it, never delete it manually.

---

## 10. Mobile Development — Capacitor Android

The mobile app is a Capacitor shell (system WebView) that loads the Next.js dev server; the native project lives in `android/`. Full guide: `DOCS/mobile.md`.

### Creating / rebuilding the Android app from the Next.js app

```bash
# One-time setup (already done in this repo):
pnpm add @capacitor/core @capacitor/android @capacitor/app
pnpm add -D @capacitor/cli
npx cap add android                # scaffolds android/ (committed to the repo)
npx cap sync android               # copies webDir + plugins into android/

# Per-run workflow (dev):
pnpm dev                           # terminal 1 — web app on :3000
npx cap sync android               # after any native/plugin/config change
cd android
.\gradlew.bat assembleDebug        # debug APK (needs JDK 21)
adb install -r app\build\outputs\apk\debug\app-debug.apk

# Release:
.\gradlew.bat bundleRelease        # signed AAB for Google Play (signing config required)
```

### Config
- `capacitor.config.ts` → `server.url`: dev builds `http://10.0.2.2:3000` (emulator) or `http://<LAN-IP>:3000` (physical device); production builds the deployed https URL.
- `android:usesCleartextTraffic="true"` in the manifest is required only while `server.url` is http — remove for store release.
- `webDir` is `mobile-web/` (placeholder), **not** `.next/` — the Next build output contains pnpm symlinks that break `cap sync` on Windows, and the app always loads `server.url` anyway.

### Common failure
`invalid source release: 21` → `JAVA_HOME` points at an old JDK (this machine defaults to Microsoft JDK 17). Install/point at **JDK 21** (e.g. Temurin 21) — Gradle 8.14 runs on it, and Android builds compile at source level 21.

### Testing on a physical Android phone

Two ways — **USB is recommended** (no Wi‑Fi, no firewall, no LAN IP).

**Option A — over USB (recommended)**
1. Phone: Settings → About phone → tap "Build number" 7× (enables Developer options) → Developer options → **USB debugging** ON. Connect the phone with a data cable.
2. Authorize the PC: `adb devices` → tap "Allow USB debugging?" on the phone (check "always").
3. Tunnel the phone to the PC's dev server: `adb reverse tcp:3000 tcp:3000` (must be re-run after unplugging/rebooting).
4. In `capacitor.config.ts` set `server.url: "http://localhost:3000"` — on a physical phone `10.0.2.2` is emulator-only.
5. Rebuild with the new URL (it is baked into the APK): `npx cap sync android` → `cd android` → `.\gradlew.bat assembleDebug`.
6. Install: `adb install -r app\build\outputs\apk\debug\app-debug.apk`.
7. Start `pnpm dev` on the PC → open MoneyMind on the phone → sign in with the demo account → test Quick Add (`/add`), bottom nav, accounts.
8. Debugging the in-app webview: Chrome on the PC → `chrome://inspect` → the phone's page → Inspect (console, network, reload).

**Option B — over Wi‑Fi (no cable)**
1. Same phone prep as A (USB debugging stays ON — `adb install` still goes over USB).
2. Phone and PC on the **same Wi‑Fi**. Get the PC's LAN IP: `ipconfig` → IPv4 of the Wi‑Fi/Ethernet adapter (e.g. `192.168.1.23`).
3. `capacitor.config.ts` → `server.url: "http://<LAN-IP>:3000"`, then rebuild as in A (steps 5–7).
4. Windows Firewall: allow inbound on port 3000 (a prompt appears when `pnpm dev` starts) — otherwise the phone can't reach the server.

**Iterating:** the APK's server URL is fixed at build time, so any `server.url` change = `cap sync` + rebuild + reinstall. Code changes alone need no rebuild — reopen the app (or use `chrome://inspect` to reload) to pick up the hot-reloaded dev server.

---

## 11. Daily Development Workflow

1. `git pull` → create branch per feature/task.
2. If schema changed: edit the table/index/policy definition in `scripts/db_setup.py` **first** (source: `data-tables-v2.md`), then re-run it (the scripts *are* the migrations).
3. If seed data changed: edit `scripts/mock_data.py`, re-run it after `db_setup.py`.
4. `pnpm lint`, `pnpm --filter @moneymind/api typecheck`, `pnpm build` before commit.
5. Commit → push → PR.

### Backend changes
- Touch the schema → edit `scripts/db_setup.py` **first** (source: `data-tables-v2.md`), then re-run it.
- Touch queries/auth/validation → edit `api/src/**`, then run the curl smoke commands from § 9.
- Touch the UI → `src/app/**` and `src/components/**`; the backend contract is unchanged.

### Workers & email in dev
- The export worker runs as `node-cron` inside the dev process (DB-as-queue — same table, same logic as production ✓ hosting doc § 6).
- Emails (magic links, reset tokens, notification digests) print to the dev server terminal; the printed URL is clickable — no inbox needed.

### Scheduled daily jobs (node-cron, same dev process)
| Job | Cadence | What it does | Source FR |
|---|---|---|---|
| Bills status refresh | daily | Recomputes time-based `bills.current_period_status` (`upcoming` → `due_soon` → `overdue`); preserves user-set `paid`/`skipped` | Module 4 FR-4.5a |
| Net worth snapshot | nightly | Writes `net_worth_snapshots` (assets/liabilities totals) for the trend chart | Module 9 FR-9.7 |
| Investment price refresh | on price update (not cron) | Appends `investment_price_history` in the same transaction as a `current_price` change | Module 8 FR-8.8 |

> In dev, all three run inside the same node-cron worker as the export job; on the hosted stack they are ordinary scheduled workers over the same DB-as-queue pattern.

---

## 12. Testing Locally

- **Vitest** integration tests run against the real `moneymind_test` PostgreSQL (schema + policies applied by the same scripts), with **RLS active** — user-scoping bugs surface in tests, not in prod.
- Tests connect the same way the app does (owner locally — same as Supabase `service_role`; policy bugs still surface via the isolation test).
- Optional Playwright E2E deferred to Phase 2.

---

## 13. Migrating the Same Database to Supabase

The flow you requested — build everything locally, verify, then move the *same* database. **One-time migration, after the app works.**

1. **Freeze.** Local app feature-complete; both scripts committed and current; `db_setup.py` + `mock_data.py` green; unit + integration tests passing.
2. **Snapshot.** `pg_dump` the dev database (schema + lookup data) → archive it for the record.
3. **Create the Supabase project** (free tier). Use it **only as plain managed Postgres** (hosting doc § 4 non-use list). The scripts do not require any project setting.
4. **No code changes.** Set the server URL in `.env.production` (and stage env), nothing in `src/` changes.
5. **Move schema, not data.** Run the **same scripts** with the Supabase pooler string:
   `DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require scripts\.venv\Scripts\python scripts\db_setup.py`
   — the create-database step is skipped automatically on Supabase (see the header comment in `db_setup.py`). `mock_data.py` is **not** run on Supabase.
6. **Smoke checklist** (all must pass):
   - Signup + magic link / reset flow work against prod DB
   - Session rotation + logout (Module 0) work
   - **RLS isolation:** create two accounts; verify neither can read the other's rows
   - One CSV export completes end-to-end → `data_export_jobs` reaches `completed`; download URL works
   - One notification appears in the feed within 30 s (polling) / instantly (SSE)
   - One full-archive export completes with manifest.json
7. **Cutover.** Point the domain/`APP_URL` at the new environment. Local `moneymind_dev` remains the authoring environment.

### Sync & drift rules (after migration)
- The schema truth lives in `scripts/db_setup.py` — **never hand-edit schemas in the Supabase editor**. Changes are authored + tested locally, then the changed script is re-run on Supabase (it is idempotent: safe to re-apply).
- Policies are versioned alongside the schema in the same script; every schema change that touches user-scoped tables re-applies them.
- Re-run `db_setup.py` + `mock_data.py` any time; the dev DB is disposable.

---

## 14. Troubleshooting (Windows)

| Symptom | Cause → Fix |
|---|---|
| Port 5432 in use | Another PG running → stop the other service or use Docker with a different port map |
| `psycopg.OperationalError: password authentication failed` | Wrong `PGPASSWORD` → set the env var to your postgres password (script default is `postgres`) |
| `operator class "gin_trgm_ops" does not exist` | `pg_trgm` missing → already handled: `db_setup.py` runs `CREATE EXTENSION IF NOT EXISTS pg_trgm` |
| RLS returns 0 rows unexpectedly | `app.current_user_id` not set in the request wrapper → the `withUser()` wrapper in `api/src/db.ts` sets `SET LOCAL app.current_user_id` inside the transaction |
| Policies never fire locally | Expected as owner (same as Supabase `service_role`) → verify policies with a non-owner test role or the isolation test |
| Android build: `invalid source release: 21` | `JAVA_HOME` is an old JDK (17 on this machine) → point at a JDK 21 (see § 10) |
| `cap sync` fails on `.next` | Expected — `webDir` must stay `mobile-web/` (pnpm symlinks in Next output break copying on Windows) |
| Mobile app blank / cleartext error | `server.url` is http but `usesCleartextTraffic` removed → restore it (dev) |
| Physical device can't reach `pnpm dev` | Use the PC's LAN IP in `server.url` (not `localhost`/`10.0.2.2`); same Wi‑Fi; allow port 3000 |
| API route returns 404/405 | The route lives in `api/src/routes/*` — check the mount base in `api/src/app.ts` (e.g. accounts mounted at `/api/accounts`) and that the dev server picked up the change (restart `pnpm dev` if it was running across the edit) |
| Server action returns a generic error | The proxy (`src/app/**/actions.ts`) calls `/api/*` — check the dev terminal for `[api]` console errors from `api/src` |
| Magic-link email "missing" | `EMAIL_PROVIDER` not `console` → check `.env.local`; the link is in terminal scrollback |
| Mock seed fails mid-run | Script is one transaction → it rolled back; fix the error, re-run `db_setup.py`, then `mock_data.py` |

---

## 15. Excluded in Dev

No Supabase account, no real email provider, no S3 credentials, no Redis/queues/K8s, no production secrets, no containerized app (the Postgres container in Option B is optional — a native PG service works identically). Docker's scope ends at `docker-compose.yml` above.

---

*Document version: August 2026 | Companion doc: `DOCS/hosting-and-portability.md` | Schema + seed implemented as `scripts/db_setup.py` and `scripts/mock_data.py`*