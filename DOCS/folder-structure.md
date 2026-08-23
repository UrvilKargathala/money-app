# Folder Structure — Backend & Frontend Separation

**Module Type:** Cross-Cutting Architecture Doc
**Status:** Current as of August 2026 — reflects the live codebase
**Companion docs:** `hosting-and-portability.md` § 5 (deployment model: one service, two layers), `routes.md` (route naming system + full endpoint inventory), `what-if.md` (deployment scenarios), `mobile.md` (Capacitor shell), `DEV-ENV.md` (local workflow)

---

## 1. The Big Picture

MoneyMind is **one deployable** (single Vercel project) with **two clearly separated layers**:

```
┌────────────────────────────── ONE DEPLOYABLE ──────────────────────────────┐
│                                                                            │
│   FRONTEND (src/)                          BACKEND (api/)                  │
│   Next.js App Router, React                Hono (framework-agnostic)       │
│   ├─ pages / layouts                       ├─ routes/  (all HTTP endpoints)│
│   ├─ server-action proxies                 ├─ queries/ (SQL)               │
│   ├─ UI components                         ├─ db / session / auth          │
│   └─ lib/api-client.ts ──HTTP──▶  /api/*  ◀──JSON──  └─ RLS wrapper        │
│                 ▲                                                          │
│                 │  mounted by src/app/api/[[...route]]/route.ts            │
└─────────────────┼──────────────────────────────────────────────────────────┘
                  ▼
          PostgreSQL (via api/ only)
```

- **Frontend never touches the database.** It calls `/api/*` over HTTP (`src/lib/api-client.ts` from server components/proxies; plain `fetch` from client components, same-origin).
- **Backend never touches Next.js/React.** `api/` is a plain Hono application — grep-verified: zero imports of `next`, `react`, or the web's `@/` alias.
- **The contract** is the `/api/*` endpoint table (hosting doc § 5.2). Both layers may evolve independently as long as the contract holds — that is what makes a UI rewrite safe without backend changes.

---

## 2. Top-Level Layout

```
moneymind/
├── api/                        ← BACKEND (Hono workspace package, @moneymind/api)
├── src/                        ← FRONTEND (Next.js app)
├── android/                    ← Native Android project (Capacitor shell; build outputs gitignored)
├── mobile-web/                 ← Capacitor webDir placeholder (WebView always loads server.url)
├── scripts/                    ← Python DB bootstrap: db_setup.py (DDL+RLS), mock_data.py (seed)
├── DOCS/                       ← All documentation (incl. this file, mobile.md, what-if.md)
├── capacitor.config.ts         ← Mobile shell config (appId, server.url)
├── next.config.ts              ← Web build config (transpilePackages: ["@moneymind/api"])
├── pnpm-workspace.yaml         ← packages: [api]
├── package.json                ← Web deps + workspace dep on @moneymind/api
└── .env.local / .env.example   ← Single env namespace for both layers
```

---

## 3. Backend — `api/`

Everything server-side, framework-agnostic, lives here. **Adding backend logic = adding files here; nothing in `src/` changes for a pure backend change.**

```
api/
├── package.json                # deps: hono, pg, bcryptjs  (exports: ., ./constants, ./vercel)
├── tsconfig.json
└── src/
    ├── app.ts                  # Hono app assembly — mounts every route group (the router)
    ├── index.ts                # Public type exports (imported by the frontend as @moneymind/api)
    ├── vercel.ts               # apiHandler adapter (hono/vercel) — consumed by the mount route
    ├── constants.ts            # SESSION_COOKIE, ACCOUNT_COLOR_PALETTE, ACCOUNT_TYPES, ...
    ├── types.ts                # Shared contract types (ActionState, SessionUser, CategoryRow, ...)
    ├── db.ts                   # pg Pool + withUser(userId, fn) — transaction + SET LOCAL app.current_user_id (RLS wrapper)
    ├── session.ts              # auth_tokens storage/verification (sha256 hashes), revoke
    ├── auth.ts                 # bcrypt hashing, login rate limiting, login/access logging
    ├── middleware.ts           # requireAuth — reads mm_session cookie → sets c.get("user")
    ├── validation.ts           # parseAmount, parseBoolean
    ├── routes/                 # ★ every HTTP endpoint group lives here ★
    │   ├── auth.ts             #   POST /api/auth/{login,signup,logout} · GET /api/auth/me
    │   ├── accounts.ts         #   GET/POST /api/accounts · PATCH/DELETE /api/accounts/:id
    │   │                       #   POST .../deactivate|reactivate · GET .../export · GET .../:id/history
    │   ├── transfers.ts        #   GET/POST /api/transfers
    │   ├── transactions.ts     #   GET/POST /api/transactions · PATCH/DELETE /api/transactions/:id
    │   │                       #   GET .../summary|export · POST/DELETE .../tags
    │   ├── categories.ts       #   GET/POST /api/categories · PATCH/DELETE /api/categories/:id
    │   ├── tags.ts             #   GET/POST /api/tags · PATCH/DELETE /api/tags/:id
    │   ├── budgets.ts          #   GET/POST /api/budgets · PATCH/DELETE /api/budgets/:id
    │   │                       #   GET .../overview|export · GET .../:id/utilization|breakdown
    │   ├── jobs.ts             #   GET /api/jobs/run (CRON_SECRET-guarded)
    │   ├── bills.ts            #   GET/POST /api/bills · GET/PATCH/DELETE /api/bills/:id
    │   │                       #   POST .../reactivate|mark-paid|skip · PATCH .../autopay
    │   │                       #   GET .../calendar|upcoming|overview|export
    │   │                       #   GET .../:id/payments|payments/yoy|payments/export
    │   ├── subscriptions.ts    #   GET/POST /api/subscriptions · GET/PATCH/DELETE /api/subscriptions/:id
    │   │                       #   POST .../pause|resume|renew · GET .../due-renewals|monthly-burn|export
    │   │                       #   GET .../:id/payments|payments/export
    │   ├── helpers.ts          #   readJson, isUniqueViolation
    │   └── *.test.ts           #   Vitest suites against moneymind_test (see § 9)
    ├── queries/
    │   ├── accounts.ts         # SQL query modules (type-safe rows; used by routes)
    │   ├── transactions.ts     #   transactions list/detail/summary + splits
    │   └── budgets.ts          #   utilization math (parent/child + splits), overview, breakdown
    └── test/                   # Vitest API harness (see § 9)
        ├── env.ts              # loadEnvLocal() + testDatabaseUrl() (swaps dbname → moneymind_test)
        ├── global-setup.ts     # runs scripts/db_setup.py against moneymind_test + seeds account_types
        ├── setup.ts            # sets DATABASE_URL → test DB before suites import ../db
        ├── helpers.ts          # fixture users (direct insert + session token), requestAs, resetDb
        └── smoke.test.ts       # harness self-check (401 + authenticated GET)
```

**Rules:**
- Every route group: `new Hono()`, guarded by `requireAuth` (or an open route like login), validation with `fieldErrors` → `400`, mutations inside `withUser()`.
- No route file imports anything from `src/` or `next/*`.
- Response shapes are plain JSON (`{ success }`, `{ error }`, `{ fieldErrors }`, or data objects).

---

## 4. Frontend — `src/`

Everything user-facing. **Backend logic must never be imported here** — only the `/api/*` contract and `@moneymind/api` types.

```
src/
├── proxy.ts                    # Middleware guard: redirects unauthenticated page requests to /login;
│                               # /api excluded from the matcher (API answers 401 JSON itself)
├── lib/
│   ├── api-client.ts           # ★ server-only API client: cookies() + headers() → fetch /api/*; typed wrappers
│   ├── session.ts              # Cookie ownership: SESSION_COOKIE name, setSessionCookie/clearSessionCookie
│   ├── nav.ts                  # NAV_ITEMS (sidebar/drawer entries; built: true|false)
│   ├── format.ts               # INR/date/percent formatting
│   └── utils.ts                # cn() etc.
├── components/
│   ├── ui/                     # Design-system primitives: button, input, dialog, select, tabs, card, ...
│   ├── common/                 # Cross-module business components: account-icon, amount-input, ...
│   ├── layout/                 # sidebar, header, mobile-nav, bottom-nav (mobile bottom bar)
│   └── mobile/                 # deep-link-handler.tsx (moneymind://add → /add)
└── app/                        # Next.js App Router
    ├── layout.tsx              # Root layout (fonts, viewport fit, DeepLinkHandler)
    ├── page.tsx                # Marketing/landing page
    ├── login/  signup/  forgot-password/
    │   ├── page.tsx            # Auth pages
    │   └── actions.ts          # ★ server-action PROXIES (login/signup) — forward to /api/auth/*
    ├── (app)/                  # Authenticated area (guarded by layout: getApiUser() or redirect)
    │   ├── layout.tsx          # Sidebar + header + bottom-nav shell
    │   ├── actions.ts          # logout proxy
    │   ├── dashboard/page.tsx
    │   ├── accounts/           # ★ page folder = module folder on the frontend ★
    │   │   ├── page.tsx        #   server component: guards + fetches via api-client → renders client dashboard
    │   │   ├── actions.ts      #   proxy actions (createAccount, updateAccount, ..., createTransfer)
    │   │   └── *.tsx           #   page-local client components (account-dashboard, account-card, dialogs...)
    │   ├── transactions/       # page.tsx + range.ts + actions.ts + transaction-dashboard/list/form
    │   │                       #   + category-manage-dialog + tag-manage-dialog (+ *.test.tsx)
    │   ├── budgets/            # page.tsx + actions.ts + budgets-dashboard + budget-form-dialog
    │   │                       #   (+ budgets-dashboard.test.tsx, budget-form-dialog.test.tsx)
    │   ├── bills/              # page.tsx + actions.ts + bills-dashboard + bill-form-dialog
    │   │                       #   + subscription-form-dialog + mark-paid-dialog + payments-dialog
    │   │                       #   (+ 4 *.test.tsx)
    │   ├── add/                # Quick-add (keypad) — page.tsx + actions.ts + quick-add-form.tsx
    │   ├── settings/page.tsx
    │   └── modules/[module]/   # Placeholder pages for not-yet-built modules
    └── api/[[...route]]/route.ts  # ★ THE BRIDGE (see § 5) — the only file that imports the backend ★
```

**Rules:**
- Server components fetch through `api-client.ts` (or `getApiUser()`); they **never** execute SQL.
- Mutations are thin `"use server"` proxies: forward to `/api/*`, map the JSON result to `ActionState`, `revalidatePath` on success.
- Client components receive data as props; shared bits go to `components/` (ui/common/layout), page-specific bits stay colocated in the page folder.
- Types are imported as `import type { ... } from "@moneymind/api"` — never hand-duplicated.
- Tests are colocated (`*.test.tsx` next to the component); jsdom + React Testing Library via the `web` Vitest project.

---

## 5. The Bridge — the only crossing point

```ts
// src/app/api/[[...route]]/route.ts  (7 lines — the entire backend mount)
import { apiHandler } from "@moneymind/api/vercel";
export const dynamic = "force-dynamic";
export const GET = apiHandler;
export const POST = apiHandler;
export const PUT = apiHandler;
export const PATCH = apiHandler;
export const DELETE = apiHandler;
```

Every HTTP method and path under `/api/*` flows into the Hono app. The frontend's `api-client.ts` forwards the request cookies (`mm_session`) so `requireAuth` works; responses flow back as JSON.

---

## 6. Separation Rules (the "constitution")

1. **Frontend never imports** `pg`, `bcryptjs`, `hono`, or any file under `api/src/` (except types/constants via `@moneymind/api`).
2. **Backend never imports** `next/*`, `react`, or the `@/` alias. It must stay runnable under `hono/vercel` *and* `@hono/node-server` (the future standalone path, `what-if.md` Q2).
3. **All data access goes through `/api/*`.** No direct DB access from server components, actions, or client code.
4. **Mutations** are proxy actions returning `ActionState`; **reads** are server-component fetches or client-side same-origin `fetch` to `/api/*`.
5. **Types** travel via `@moneymind/api` exports — one source of truth.
6. **Env vars** are read in the layer that owns them (`DATABASE_URL`/`SESSION_SECRET`/`CRON_SECRET` → `api/`; `APP_URL` → frontend; single `.env.local`).

---

## 7. End-to-End Example — Quick Add (as implemented)

```
[Phone bottom-nav FAB]  or  [Web "Add" link]
        │
        ▼
src/app/(app)/add/page.tsx            (server component)
   └─ getApiUser() guard + getAccountsData() + getCategories() → renders QuickAddForm
        │
        ▼
src/app/(app)/add/quick-add-form.tsx  (client component: keypad, type toggle, category chips)
   └─ useActionState(createTransaction) → <form action={formAction}>
        │
        ▼
src/app/(app)/add/actions.ts          ("use server" proxy)
   └─ apiFetch("POST /api/transactions", { json: {...} }) → map JSON to ActionState → revalidatePath("/accounts")
        │  (cookies forwarded by api-client)
        ▼
api/src/routes/transactions.ts        (Hono route)
   └─ requireAuth → validate (fieldErrors → 400) → withUser(userId, INSERT INTO transactions)
        │  (RLS context set via SET LOCAL app.current_user_id)
        ▼
PostgreSQL ──► { success } ──► proxy returns success ──► toast + router.refresh()
```

---

## 8. Guide — Building a NEW Module (e.g. "Budgets")

**Order: backend first, then frontend. The backend is contract-first; the UI can change anytime after.**

### Step 1 — Schema (if new tables are needed)
1. Edit `DOCS/data-tables-v2.md` (canonical source), then `scripts/db_setup.py` (DDL + indexes + RLS policies) — the scripts **are** the migrations.
2. Re-run: `scripts\.venv\Scripts\python scripts\db_setup.py` (resets dev DB) + `mock_data.py` (seed).

### Step 2 — Backend endpoint(s) in `api/`
1. **Name the route per the naming system in `DOCS/routes.md` §1** (plural resource, action sub-resources, `/export` style) and add a 🧪→✅ row there when it goes live.
2. Create `api/src/routes/budgets.ts` — pattern to copy: `routes/accounts.ts`:
   - `new Hono()`, `requireAuth` on every route, `readJson` for bodies, `parseAmount`/`parseBoolean` for values.
   - Reads: `query(...)` from `../db` (or a `queries/budgets.ts` module for complex SQL — copy `queries/accounts.ts`).
   - Writes: `withUser(user.user_id, ...)` — never outside it.
   - Responses: `{ success: true }` / `{ error }` / `{ fieldErrors }` (400/401/404/409/500).
2. Mount in `api/src/app.ts`: `app.route("/api/budgets", budgets)`.
3. Write API tests (`api/src/routes/budgets.test.ts` via `fixtureDb()` + `requestAs`) — auth, validation, duplicates, RLS isolation, and the spend math.
4. Verify: `pnpm --filter @moneymind/api typecheck`, then `pnpm test -- --project api` (DEV-ENV § 9).
   - **A pure backend change stops here** — the UI is untouched.

### Step 3 — API client wrapper in `src/lib/api-client.ts`
Add typed wrappers, e.g. `getBudgets(): Promise<BudgetRow[] | null>` → `apiJson<{ budgets: BudgetRow[] }>("/api/budgets")`. Import the row types from `@moneymind/api` (add them to `api/src/types.ts` or `queries/budgets.ts` and re-export from `api/src/index.ts`).

### Step 4 — Server-action proxies
Create `src/app/(app)/budgets/actions.ts` — copy `(app)/accounts/actions.ts`:
- `"use server"`, each action forwards to `/api/*` via `apiFetch`, maps to `ActionState`, `revalidatePath("/budgets")` on success.

### Step 5 — Frontend pages & components
Create the page folder `src/app/(app)/budgets/`:
- `page.tsx` — **server component**: `getApiUser()` guard (redirect if null) + fetches via api-client → renders a client dashboard component with the fetched data as props.
- `budgets-dashboard.tsx` — **client component** ("use client"): state, filters, tabs; renders dialogs/cards.
- `budget-form-dialog.tsx`, `budget-card.tsx`, etc. — page-local components, colocated here.
- `*.test.tsx` — colocated component tests (mock `next/navigation` + the page's `./actions`).
- Shared UI stays in `src/components/ui/`; cross-module business components in `src/components/common/`.

### Step 6 — Navigation & mobile
- `src/lib/nav.ts`: add the module to `NAV_ITEMS` and flip `built: true` (sidebar + drawer get it automatically).
- If the module is top-tier on mobile, add it to `src/components/layout/bottom-nav.tsx` (currently Home / Add FAB / Accounts).
- Mobile patterns to follow (from the current modules): responsive grids (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`), ≥44px touch targets, dialogs are already bottom-sheet-friendly (`DialogContent`), safe areas handled by the layout (`pb-[calc(5rem+env(safe-area-inset-bottom))]`).

### Step 7 — Verify
`npx eslint src` → `pnpm --filter @moneymind/api typecheck` → `pnpm test` → `pnpm build` → browser/phone smoke (no dev-server dependency for the checks).

### Step 8 — Mandatory module checklist (enforced by tests + pre-push hook)

Every new module/route MUST satisfy these rules. `api/src/routes/security-guards.test.ts` verifies them automatically and a pre-push hook runs it — violations cannot be pushed:

> **Enable the hook once per clone:** `git config core.hooksPath .githooks` (runs typecheck + the guards suite on every push; the full suite stays in the manual verify step).

| # | Rule | Enforced by |
|---|------|-------------|
| 1 | **SQL lives only in `api/src/queries/*.ts`.** Route files contain zero inline SQL and never import `query` from `../db`; they call query-module functions and wrap writes in `withUser(...)`. | guards: "routes contain no SQL" |
| 2 | **Tenant filter on every statement** touching a user-owned table: `WHERE <alias>.user_id = $1` with `$1` always the userId, never an empty clause list. Composable SELECT fragments must bake the tenant clause in; callers may only append `AND …`. | guards: tenant scans + filterClause contract |
| 3 | **No per-row query loops (N+1).** Batch-load with `IN`/`unnest`, group in memory. Deliberate bounded loops must be pinned in the guards allowlist with a comment. | guards: N+1 scan |
| 4 | **Secrets never travel in query strings.** Header-only (`x-cron-secret`) for jobs; `?secret=`-style params are banned everywhere except jobs.ts's explicit rejection. | guards: secrets scan |
| 5 | **Shared helpers are defined once** in `api/src/utils/` (`isoDate`, `csvEscape`). Never redefine them locally. | guards: helper singularity |
| 6 | **Every route requires auth** unless listed in the guards' public allowlist (auth entry points + `GET /api/jobs/run`). New public routes require editing that allowlist deliberately. | guards: 401 sweep |
| 7 | **Cross-user isolation test for every new resource**: alice/bob fixtures prove alice can't read or mutate bob's rows (list scoping + 404 on foreign ids). Add to the module's `*.test.ts`. | code review + suite |
| 8 | **Writes carry `user_id` in the SQL itself** (defense-in-depth under RLS), even when ownership was checked earlier in the same transaction. | guards: INSERT/UPDATE scan |
| 9 | **routes.md flipped 🧪→✅** for every implemented endpoint, summary count updated. | PR checklist |

---

## 9. Testing Baseline (Vitest)

Two Vitest projects in the root `vitest.config.ts`, run together with `pnpm test`:

| Project | Environment | Covers | Setup |
|---|---|---|---|
| `api` | node | `api/src/**/*.test.ts` — in-process Hono `app.request()` against a **real Postgres DB** | `api/src/test/global-setup.ts` (drops + recreates `moneymind_test` from `scripts/db_setup.py` via the venv python, then seeds `account_types`), `setup.ts` (points `DATABASE_URL` at the test DB before `../db` is imported), `helpers.ts` (fixture users inserted directly + session tokens, `requestAs`, `resetDb` between tests) |
| `web` | jsdom | `src/**/*.test.{ts,tsx}` — React Testing Library + `@testing-library/jest-dom` | `src/test/jest-setup.ts`; `@/` alias resolved in the project config |

- **Fixture users** are created by direct inserts (users/profile/settings + `auth_tokens` session row) — fast and immune to the login rate limiter. Two users (`alice`, `bob`) exist per suite for isolation tests; `resetDb()` truncates all user tables between tests.
- System lookups that `db_setup.py` intentionally leaves out (it is schema-only) are seeded by `global-setup.ts` — only `account_types` so far; add more lookups there when a module's tests need them.
- Frontend tests mock `next/navigation` (`useRouter`) and the page's `./actions` module; components are rendered with fixture props mirroring the server-component data contract.

### What you do NOT do
- ❌ Query the DB from a server component or action.
- ❌ Import `hono`/`pg`/`bcryptjs` in `src/`.
- ❌ Duplicate types — import from `@moneymind/api`.
- ❌ Put module UI into `components/ui/` (that's design-system only) or shared `components/common/` unless genuinely reused.
- ❌ Point tests at the dev database (`moneymind_dev`) — API tests always run against `moneymind_test`.

---

*Document version: August 2026 | Companion: `hosting-and-portability.md`, `what-if.md`, `mobile.md`, `DEV-ENV.md`*