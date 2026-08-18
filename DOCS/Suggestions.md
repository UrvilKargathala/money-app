# Suggestions & Audit Log

**Purpose:** Working log of cross-document and codebase review findings. Each entry records the problem, the evidence (file + line refs), a recommendation, and a tracked status. When a suggestion is actioned, flip its status to ✅ Fixed and add a one-line note. New audits append new sections below rather than rewriting old ones.

**Companions:** `folder-structure.md` · `routes.md` · `data-tables-v2.md` · `MoneyMind_BRD_PRD.md` · `hosting-and-portability.md` · `module/*.md`

---

## Audit 1 — Aug 16 2026 (post-Module 2 Transaction Engine)

Scope: cross-check of `DOCS/folder-structure.md` and `DOCS/routes.md` against each other, the module specs, and the live codebase (`api/src/*`, `src/*`, package manifests).

### §1 Verdict table

| # | Issue | Document | Verdict | Evidence |
|---|-------|----------|---------|----------|
| 1 | `queries/` tree only shows `accounts.ts`; `routes/` tree stale after Module 2 | folder-structure.md | ✅ Confirmed | §3 tree (lines 58–84): no `queries/transactions.ts`, `tags.ts`; `transactions.ts` still annotated "POST (quick-add)", `categories.ts` "GET /api/categories" |
| 2 | `tags` / `tags_transactions` never mentioned in folder doc or route-plan guidance | folder-structure.md | ✅ Confirmed | No `tags` mention anywhere in the file; Module 2 spec fully defines both tables (`Table: tags` :318, `Table: tags_transactions` :339) |
| 3 | `db_setup.py` presented as "the migrations" | folder-structure.md | ✅ Confirmed | §8 Step 1 (line 200): "the scripts **are** the migrations"; Step 1 re-runs reset the dev DB; no incremental-migration story anywhere |
| 4 | Prisma vs raw `pg` contradiction across docs | BRD / Project Overview / hosting | ✅ Confirmed | BRD:231 & :263 "via Prisma ORM" / "ORM: Prisma"; Project Overview:113 "SQL scripts are canonical DDL; Prisma introspects"; codebase uses raw `pg` (api/package.json); hosting-and-portability.md:77 has a garbled decision row ("Schema a prisma source of truth never; scripts are") |
| 5 | No test infrastructure anywhere | repo-wide | ✅ Confirmed | No test deps in root or api package.json; zero `*.test.*`/`*.spec.*` files in repo; folder-structure Step 7 verify = eslint → typecheck → build only |
| 6 | Mobile-specific safe-area CSS embedded in folder doc | folder-structure.md | ✅ Confirmed | Line 231: `pb-[calc(5rem+env(safe-area-inset-bottom))]` inline in Step 6 |
| 7 | Route inventory §3 "empty" | routes.md | ❌ Not present (stale) | §3 fully populated: 581 lines, ~490 endpoint rows across 16 sections; §2 lists 32 implemented |
| 8 | R2 (HTTP verbs) "missing" | routes.md | ❌ Not present (stale) | R2 fully defined (lines 19–26); PATCH row covers "always PATCH, never PUT" |
| 9 | No concrete response payload examples for implemented routes | routes.md | ✅ Confirmed (partial) | §3 tables carry method/path/purpose/status only; R8 gives generic shapes (`{ success }`, `{ fieldErrors }`, `{ error }`) but no live payload sketches |
| 10 | Pagination convention mismatch (audit's cursor premise false; real mismatch found) | routes.md vs code | ⚠️ Partial | BRD never mentions cursor pagination (premise false); **real issue:** R9 promises `{ items, total, page, pageSize }` but implemented `GET /api/transactions` returns `{ transactions, summary, total, page, pageSize }`; pageSize default 25 (R9) vs {25,50,100} (FR-2.17) vs default 50, cap 100 (implementation) |
| 11 | `/api/categories` + `/api/tags` listed as read-only lookups despite live CRUD | routes.md | ✅ Confirmed | R6 (line 42) lists both; Module 2 inventory now has GET/POST/PATCH/DELETE for both — contradiction inside the same document |
| 12 | Export patterns defined but never assigned per module | routes.md | ✅ Confirmed | R7 (lines 44–47) defines simple `GET /export`, report, and C3 job-based export; no guidance on which resource uses which |
| 13 | No per-endpoint rate-limiting baseline documented | routes.md | ✅ Confirmed | R10 covers auth only; only login (5 tries/15min) is documented anywhere |
| 14 | `GET /api/jobs/run` model underspecified | routes.md + api | ✅ Confirmed | api/src/routes/jobs.ts is a stub (returns `processed: 0`, no job selector, no doc of `?job=`); accepts `?secret=` in the query string, against the FR-A.17 "secrets never in query strings" spirit |
| 15 | `ACCOUNT_TYPES` code constant vs `account_types` DB table | cross-doc | ✅ Confirmed | constants.ts:6–14 AND db_setup.py:197–199 create the table, mock_data.py:239 seeds it; Module 1 spec defines the table (:228–235); `GET /api/account-types` still 🧪 — two sources of truth today |
| 16 | `CategoryRow` vs 11-column categories schema | cross-doc | ⚠️ Minor | categories table has 11 columns (Module 2 :225–237); `CategoryRow` (api/src/types.ts) has 7 (version added during Module 2) — correct as a row shape; intentional exclusions undocumented |

**Tally:** 11 confirmed · 2 partial/minor · 2 stale (items 7–8 must NOT be treated as real defects).

---

### §2 Actionable suggestions

#### S-01 — Refresh the backend tree in folder-structure.md §3
- **Problem:** §3 tree no longer reflects the codebase (stale after Module 2).
- **Evidence:** See audit #1.
- **Recommendation:** Update `routes/` to `auth.ts, accounts.ts, transfers.ts, transactions.ts (CRUD + tags), categories.ts (CRUD), tags.ts (CRUD), jobs.ts, helpers.ts` and `queries/` to `accounts.ts, transactions.ts`. Add the `routes/tags.ts` note: standalone tag CRUD lives in its own route file; transaction↔tag assignment nests under `transactions.ts` per R4.
- **Priority:** Now · **Status:** ✅ Fixed (Aug 17 2026) — §3 tree refreshed with Module 2 + 3 files and the new `test/` harness layout.

#### S-02 — Document the migrations story
- **Problem:** `db_setup.py` (destructive reset) is described as "the migrations"; nothing covers incremental production schema changes.
- **Evidence:** folder-structure.md:200; DEV-ENV.md §7–8.
- **Recommendation:** Add to §8 Step 1: `db_setup.py` is the **dev bootstrap** (DDL+RLS+seed, resets the dev DB); production schema changes use incremental SQL migration files (e.g. `api/migrations/` applied in order, idempotent, Vercel pre-deploy step). Only create the directory + one-line convention now; no migration tooling yet.
- **Priority:** Now · **Status:** 🔲

#### S-03 — Resolve the Prisma contradiction
- **Problem:** Three docs claim Prisma ORM; the codebase uses raw `pg`; one decision row is garbled.
- **Evidence:** BRD:231/263, Project Overview:113, hosting-and-portability.md:77.
- **Recommendation:** Ratify and propagate: **raw `pg` + `scripts/db_setup.py` are canonical; Prisma is not used** (introspection optional, never a source of truth). Update BRD tech-stack table, Project Overview line 113, and fix the garbled hosting doc row to a readable statement (e.g. "Prisma: not used — raw `pg` is the data-access layer; DDL lives in `scripts/db_setup.py`").
- **Priority:** Critical · **Status:** 🔲

#### S-04 — Introduce the test baseline (see §3)
- **Problem:** No tests exist; the verify step has no automated teeth.
- **Recommendation:** Adopt the Vitest + RTL strategy in §3. Update folder-structure Step 7 to `npx eslint src` → `pnpm --filter @moneymind/api typecheck` → `pnpm test` → `pnpm build`. Rule: **every change ships with tests** (new route → route tests; new component → component tests).
- **Priority:** Critical · **Status:** ✅ Fixed (Aug 17 2026) — root `vitest.config.ts` with `api` + `web` projects; `moneymind_test` bootstrap (global-setup runs `db_setup.py` + seeds `account_types`), fixture-user helpers, `pnpm test` wired in root + api; 29 tests (20 API budgets + 9 RTL) live; Step 7 updated.

#### S-05 — Point mobile-safe-area details at mobile.md
- **Problem:** Implementation detail that will drift sits in the architecture doc.
- **Recommendation:** Replace the inline `pb-[calc(5rem+env(safe-area-inset-bottom))]` with a pointer: "safe areas and touch-target rules live in `mobile.md` §…".
- **Priority:** Later · **Status:** 🔲

#### S-06 — Add live payload contracts to routes.md
- **Problem:** The contract doc defines shapes abstractly but shows no real payloads.
- **Recommendation:** Add a "Live contracts" subsection after §3 with concrete sketches for the implemented routes, e.g.:
  ```
  GET /api/auth/me        → 200 { user_id, email, full_name, token_id }
  GET /api/accounts       → 200 { accounts: AccountWithBalance[], types: AccountType[] }
  GET /api/transactions   → 200 { transactions: Transaction[], summary: {income,expense,net,count}, total, page, pageSize }
  GET /api/transactions/export → 200 text/csv, Content-Disposition attachment; BOM prefix
  POST /api/transactions  → 200 { success: true } | 400 { fieldErrors } | 409 { error }
  ```
- **Priority:** Now · **Status:** 🔲

#### S-07 — Reconcile the pagination contract
- **Problem:** R9 payload key and pageSize policy disagree with the implemented list endpoint.
- **Recommendation:** Ratify **page-based pagination** (correct at the documented 36k–73k rows/user scale; cursor adds complexity without need). Then make the docs match the implementation: R9 states `?page=1&pageSize=25` default and `{ items, total, page, pageSize }`; the transactions list returns `{ transactions, … }` with default 50, range 1–100. Either standardize all lists on `items` + default 25 (and change the code), or update R9 to "default `pageSize=50`, range 1–100, payload key per resource" — recommend the latter (less churn), with R9 noting future list endpoints should reuse the same envelope.
- **Priority:** Now · **Status:** 🔲

#### S-08 — Fix the R6 lookup list
- **Problem:** `/api/categories` and `/api/tags` are listed as read-only lookups while being full CRUD resources.
- **Recommendation:** Remove both from R6; keep `/api/account-types`, `/api/debt-types`, `/api/tax/sections`, `/api/tax/regime-slabs`, `/api/note-templates`. R6 text: "Reference data has no `:id` collection endpoint".
- **Priority:** Now · **Status:** 🔲

#### S-09 — Assign export patterns per module
- **Problem:** R7 defines three export styles but never says who uses what.
- **Recommendation:** Add to R7: **simple `GET /<resource>/export`** for small resources (accounts, budgets, bills, goals, debts, tax, investments, notes); **C3 job-based export** for high-volume resources (transactions, full-data backup). Note the current `GET /api/transactions/export` is simple and fine today; flag a scale-debt to move it to jobs if row counts grow past ~50k.
- **Priority:** Later · **Status:** 🔲

#### S-10 — Ratify a rate-limiting baseline
- **Problem:** Only login (5 tries/15min) is specified; no general API baseline exists.
- **Recommendation (proposed, to ratify):** reads 100 req/min per user · writes 30 req/min per user · login 5 tries/15min (already live) · cron endpoint exempt (secret-guarded). Document in R10 once agreed; implementation follows on the auth/rate-limit work item.
- **Priority:** Later · **Status:** 🔲

#### S-11 — Specify the cron job model
- **Problem:** `GET /api/jobs/run` is a stub; the doc doesn't say whether it runs everything or a selector; the `?secret=` query fallback leaks secrets into URLs.
- **Evidence:** api/src/routes/jobs.ts:9–15; FR-A.17.
- **Recommendation:** Spec in routes.md: `GET /api/jobs/run?job=<name>` (or per-job endpoints) with an explicit job registry table (7+ scheduled jobs exist in the BRD audit); remove the `?secret=` query-string fallback — header `x-cron-secret` only. The stub itself is fine until Phase 2.
- **Priority:** Later · **Status:** 🔲

#### S-12 — Declare the single source of truth for account types
- **Problem:** Code constant and DB table both exist; they can drift.
- **Recommendation:** Declare the **`account_types` DB table canonical** once `GET /api/account-types` ships (planned 🧪); until then `ACCOUNT_TYPES` in constants.ts is the interim UI source. Add a comment in constants.ts pointing at the table + route row.
- **Priority:** Later · **Status:** 🔲

#### S-13 — Document CategoryRow's intentional field exclusions
- **Problem:** Row type covers 7 of 11 schema columns with no note on why.
- **Recommendation:** Add a comment in `api/src/types.ts` next to `CategoryRow`: "list-row shape — excludes user_id, sort_order, created_at, updated_at by design; not a full-entity type." (Do the same for `TagRow`.)
- **Priority:** Later · **Status:** 🔲

---

## §3 Testing strategy (baseline for all future changes)

**Adopted:** Vitest for the API (in-process Hono `app.request()`, no server boot) + Vitest + React Testing Library (jsdom) for the frontend.

### Why this stack
- **Vitest** — TS-native, zero config for the pnpm workspace, fast watch mode; single runner for both layers.
- **In-process Hono** — the API is a plain Hono app; `app.request(path, init)` executes full routing/middleware/validation without booting a server, so tests exercise the real contract (`requireAuth`, RLS wrapper, status codes) with nothing extra installed.
- **Real test DB** — RLS and the balance invariants are the highest-value behavior; mocking `pg` would test nothing. Tests run against a dedicated `moneymind_test` database.
- **RTL + jsdom** — component behavior (dialog flows, list rendering, action-state mapping) without a dev server, matching the existing "no dev-server dependency for checks" philosophy. Playwright E2E is a later, optional layer.

### Layout & wiring
```
api/src/routes/*.test.ts      # route tests (colocated)
api/src/queries/*.test.ts     # query/invariant tests (colocated)
src/**/*.test.tsx             # component tests (colocated next to components/pages)
api/vitest.config.ts          # or root vitest.config.ts with workspace projects
```

- `api/package.json`: `"test": "vitest run"`, devDeps `vitest`.
- Root `package.json`: `"test": "vitest run"`, devDeps `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `@types/pg` (already in api).
- Run: `pnpm test` (or `pnpm --filter @moneymind/api test` for the API only).

### Test database
- Create `moneymind_test` (local Postgres; same creds as DEV-ENV §7).
- Test setup script: apply `scripts/db_setup.py` DDL + RLS (no seed), then insert fixture users/tokens in a `beforeAll`.
- Per-suite reset: truncate user-scoped tables (or run each suite inside a transaction that rolls back — prefer the truncate-list approach first; it is simpler with `withUser`/`SET LOCAL`).
- `.env.test` / `DATABASE_URL_TEST` — api tests must never touch the dev DB (mirror of the "never run mock_data against Supabase" rule).

### Coverage matrix (apply to every changed/new route)
| Layer | What to assert |
|---|---|
| Happy path | 200 shape: `{ success: true }` or payload keys per routes.md §3 + S-06 |
| Validation | 400 with exact `fieldErrors` keys |
| Auth | 401 without cookie; 401 with revoked session |
| Not found | 404 on missing `:id` |
| Conflicts | 409 on version mismatch (PATCH with stale `version`), duplicates, guarded rule violations (e.g. transfer edit, system category delete) |
| **RLS isolation** | user B cannot read/update/delete user A rows (create user A row, act as user B, assert 404/empty) |
| **Balance invariants** | create income → account balance += amount; create expense → −=; delete → reversed; edit amount → delta applied; transfer → both accounts move (the accounts/transactions pair) |
| Export | CSV shape: BOM, header row, row count, Content-Disposition filename |
| Frontend | dialog open/submit/close flows, list grouping, action-state error mapping, empty states |

### Workflow rule
- A change to `api/src/routes/*` or `api/src/queries/*` is **not done** without its route/invariant tests; a change to a component/page ships with its RTL tests.
- Step 7 verification order becomes: `npx eslint src` → `pnpm --filter @moneymind/api typecheck` → `pnpm test` → `pnpm build`.
- First execution of this strategy: add the Vitest baseline + route tests for the Module 2 endpoints (transactions, categories, tags) before the next feature cycle.

---

*Document version: August 2026 | Audit 1 filed post-Module 2 (Transaction Engine). Append new audits as new sections; mark entries ✅ Fixed when actioned.*