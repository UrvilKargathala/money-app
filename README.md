# MoneyMind

Personal finance manager for the Indian market — multi-user, PostgreSQL-backed, Next.js + Tailwind + shadcn/ui. Ships as a **web app and a mobile app** (Capacitor shell over the same codebase). See `DOCS/` for the full BRD/PRD, data model (`data-tables-v2.md`), design system, module specs, folder structure & backend/frontend separation (`folder-structure.md`), API routes & naming conventions (`routes.md`), mobile guide (`mobile.md`), and deployment scenarios (`what-if.md`).

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20 LTS+ |
| pnpm | latest (`corepack enable` to install) |
| PostgreSQL | 16 (local service or Docker) |
| Python | 3.13+ (for `scripts/db_setup.py` + `scripts/mock_data.py`) |
| JDK (Android only) | 21 — set `JAVA_HOME` to it |
| Android SDK (Android only) | installed (`C:\Android\Sdk` on this machine) |
| macOS + Xcode (iOS only) | iOS builds can't run on Windows — see `DOCS/mobile.md` |

## Adding Dependencies (pnpm)

| Command | Description |
|---------|-------------|
| `pnpm add <package>` | Add a dependency to `dependencies` |
| `pnpm add -D <package>` | Add a dev dependency (linters, test tools, types) |
| `pnpm remove <package>` | Remove a dependency |
| `pnpm update` | Update all dependencies to latest allowed versions |
| `pnpm install` | Install all dependencies from `pnpm-lock.yaml` (workspace: web + `api/` package) |
| `pnpm list` | List installed packages |

## Running the Dev Server (Next.js)

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the development server at `http://localhost:3000` (hot reload) |
| `pnpm build` | Build the app for production (output in `.next/`) |
| `pnpm start` | Run the production build locally |
| `pnpm lint` | Run ESLint over the web app |
| `pnpm --filter @moneymind/api typecheck` | Type-check the backend (`api/` workspace package) |

## Mobile App (Capacitor Android)

The mobile app is a thin native shell that loads the web app (full guide: `DOCS/mobile.md`):

| Command | Description |
|---------|-------------|
| `npx cap sync android` | Sync config/plugins into `android/` |
| `cd android && .\gradlew.bat assembleDebug` | Build the debug APK (needs JDK 21) |
| `adb install -r app\build\outputs\apk\debug\app-debug.apk` | Install on emulator/device |
| `cd android && .\gradlew.bat bundleRelease` | Build the signed release AAB (store) |

Dev builds load `http://10.0.2.2:3000` (emulator) — the Next dev server must be running (`pnpm dev`).

## Local Database Setup

| Command | Description |
|---------|-------------|
| `scripts\.venv\Scripts\python scripts\db_setup.py` | Create/reset schema — all 67 tables, indexes, RLS policies |
| `scripts\.venv\Scripts\python scripts\mock_data.py` | Seed lookups + demo dataset (~32k rows) |
| `docker compose up -d` | Start the dev PostgreSQL container (Docker option) |

Full bootstrap order: DB up → `db_setup.py` → `mock_data.py` → `pnpm dev`. See `DOCS/DEV-ENV.md` for the complete guide.

---

## Initial Project Setup (one-time)

Scaffold the Next.js app (App Router + TypeScript + Tailwind) in the current directory:

```
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

Set up the pnpm workspace (backend package — the UI/backend split, see `DOCS/hosting-and-portability.md` § 5):

```
# pnpm-workspace.yaml:  packages: [api]
pnpm --filter @moneymind/api add hono pg bcryptjs
```

Install the packages used across the project (from `DOCS/MoneyMind_Project_Overview.md` / `DOCS/DEV-ENV.md`):

```
pnpm add recharts date-fns @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-tabs @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-label @radix-ui/react-slot class-variance-authority clsx tailwind-merge lucide-react sonner server-only
```

Mobile shell (one-time, see `DOCS/mobile.md`):

```
pnpm add @capacitor/core @capacitor/android @capacitor/app
pnpm add -D @capacitor/cli
npx cap add android
```

Copy the environment template and create the local env file:

```
cp .env.example .env.local
```

---

## Deploying the Backend

This repository tracks **only the backend** (`api/` — the Hono API) plus the canonical schema scripts (`scripts/`). The frontend is not part of this repo.

### Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Postgres connection string (Supabase or any hosted Postgres) |
| `CRON_SECRET` | No | Guards `GET /api/jobs/run` (cron, Phase 2) |

### Deploy to Vercel (zero config)

1. Import this repository at [vercel.com/new](https://vercel.com/new) — `vercel.json` sets the root directory to `api/` and Vercel's Hono preset auto-detects the app (default export in `src/app.ts`).
2. Add the env vars above to the project (Production + Preview).
3. Bootstrap the schema once: run `scripts/db_setup.py` against the `DATABASE_URL` (create-database step is skipped when `DATABASE_URL` is set — see `DOCS/DEV-ENV.md` § 12). RLS policies require a non-owner role for the app's `DATABASE_URL`.
4. Verify: `GET <url>/api/auth/me` → `401`, then run the full smoke checklist (`DOCS/DEV-ENV.md` § 12).

### Run & test locally (inside this repo)

```
pnpm install
scripts\.venv\Scripts\python scripts\db_setup.py   # dev DB bootstrap (see DEV-ENV § 7)
pnpm test                                          # API tests against moneymind_test
```