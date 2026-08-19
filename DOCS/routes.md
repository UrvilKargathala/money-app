# Routes & API Contract

**Scope:** every HTTP endpoint of the MoneyMind API — implemented today and planned (backlog derived from `DOCS/module/*.md`). This is the single source of truth for route naming and the live contract between `api/` (backend) and the web + Capacitor clients.

Companions: [`hosting-and-portability.md` §5.2](hosting-and-portability.md) (UI↔API contract, deployment) · [`folder-structure.md`](folder-structure.md) (backend layout, add-a-route steps) · [`DEV-ENV.md` §9](DEV-ENV.md) (local smoke tests).

---

## §1 Route naming system

Every route follows these rules. **New routes MUST conform** — the naming system was agreed before any of the inventory below was named.

### R1 — Base & style
- All endpoints live under `/api/`.
- Resources are **plural nouns, lowercase, kebab-case** for multi-word: `/api/net-worth`, `/api/manual-assets`, `/api/recurring-transactions`.
- **No version prefix today.** Add `/v1` only when a breaking contract change requires old and new clients to coexist.
- JSON keys are camelCase (`openingBalance`, not `opening_balance`).

### R2 — HTTP verbs
| Verb | Meaning |
|---|---|
| `GET /api/<resource>` | List (filters as query params) |
| `POST /api/<resource>` | Create |
| `GET /api/<resource>/:id` | Read one |
| `PATCH /api/<resource>/:id` | Partial update (always `PATCH`, never `PUT`) |
| `DELETE /api/<resource>/:id` | Delete (or soft-delete per module semantics) |

### R3 — Actions are sub-resources, not verbs in the path
State changes use `POST /api/<resource>/:id/<action>`:
`/activate`, `/deactivate`, `/pause`, `/resume`, `/close`, `/reopen`, `/mark-paid`, `/skip`, `/renew`, `/pin`, `/unpin`, `/restore`, `/dismiss`, `/read`, `/rollover`, `/leave`, `/lock`, `/unlock`.

Never `POST /api/update-bill` — the verb never appears in the path; the HTTP verb + action noun do the work.

### R4 — Sub-resources nest under the parent
Children hang off the parent id:
`GET /api/bills/:id/payments` · `POST /api/debts/:id/payments` · `POST /api/transactions/:id/splits` · `GET /api/investments/:id/price-history` · `POST /api/goals/:id/contributions`.

### R5 — Personal scope: `/api/users/me/*`
Profile, settings, avatar, sessions, audit logs live under `/api/users/me/…` — **user ids never appear in URLs for your own data**. Session identity stays `GET /api/auth/me` (implemented; kept for compatibility).

### R6 — Lookups are read-only resources
Reference data has no `:id` collection endpoint: `/api/account-types`, `/api/debt-types`, `/api/tax/sections`, `/api/tax/regime-slabs`, `/api/note-templates`, `/api/categories`, `/api/tags`.

### R7 — Exports: extension-free paths
- Data dumps: `GET /api/<resource>/export` → CSV via `Content-Disposition` filename. **No `.csv`/`.pdf` extensions in paths** (matches implemented `/api/accounts/export`).
- Generated documents (reports, comparisons): `GET /api/<resource>/report` → PDF/PNG.
- Large/batched exports go through C3 export jobs: `POST /api/export/jobs` → `GET /api/export/jobs/:id/download`.

### R8 — Response shape & status codes
- Success: `200 { "success": true }` (current code convention; `201` is not used).
- Payloads: plain camelCase JSON objects/arrays (e.g. `GET /api/auth/me` returns the user object).
- Validation failure: `400 { "fieldErrors": { … } }`.
- `401` unauthenticated · `404` not found · `409` conflict (optimistic-lock version mismatch, guarded rule violation, duplicate) · `429` rate-limited · `500` unexpected.
- Generic error: `{ "error": "…" }`.

### R9 — Query params
camelCase; booleans as `0/1` (`?includeInactive=1`); date ranges as short codes (`?range=6M` — `1M/3M/6M/1Y/5Y/All`); paginated lists use `?page=1&pageSize=25` returning `{ items, total, page, pageSize }`.

### R10 — Auth
Every route requires the session cookie (`requireAuth`) **unless explicitly listed public**: auth entry points (`signup`, `login`, `forgot-password`, `reset-password`, magic-link consume, email verify) and `GET /api/jobs/run` (guarded by `x-cron-secret` header).

---

## §2 Status legend

| Mark | Meaning |
|---|---|
| ✅ | **Implemented** — live in `api/src/routes/*.ts`, verified |
| 🧪 | **Planned** — required by module specs, not yet built (backlog) |

Implemented today (98): auth login/signup/logout/me · accounts list/create/patch/delete/deactivate/reactivate/export/history · transfers list/create · transactions list/create/detail/patch/delete/summary/export/tags · categories list/create/patch/delete · tags list/create/patch/delete · budgets list/create/detail/patch/delete/overview/utilization/breakdown/export · bills list/create/detail/patch/delete/reactivate/mark-paid/skip/autopay/payments/payments-yoy/payments-export/calendar/upcoming/overview/export · subscriptions list/create/detail/patch/cancel/pause/resume/renew/payments/payments-export/due-renewals/monthly-burn/export · jobs run. · goals list/create/detail/patch/delete/pause/resume/complete/dashboard/progress/feasibility/projection/templates-list/create/detail/patch/delete/contributions-list/create/patch/delete/with-transfer/export/snapshots-list/create/milestones/export/distribute.

---

## §3 Route inventory (module-wise)

### Module 0 — Auth & User Management

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| POST | `/api/auth/signup` | Create account (profile, settings, session) | ✅ |
| POST | `/api/auth/login` | Log in, issue session (rate-limited, 5 tries/15min) | ✅ |
| POST | `/api/auth/logout` | Invalidate current session | ✅ |
| GET | `/api/auth/me` | Current user identity | ✅ |
| POST | `/api/auth/forgot-password` | Email reset link (30-min one-time token) | 🧪 |
| POST | `/api/auth/reset-password` | Consume token with new password (re-wraps vault key) | 🧪 |
| POST | `/api/auth/change-password` | Change password (requires current, revokes other sessions) | 🧪 |
| POST | `/api/auth/verify-email` | Verify email via token | 🧪 |
| POST | `/api/auth/resend-verification` | Resend verification email | 🧪 |
| POST | `/api/auth/magic-link` | Request magic-link email (15-min token) | 🧪 |
| GET | `/api/auth/magic-link/verify` | Consume magic-link token, log in | 🧪 |
| GET | `/api/users/me/profile` | Read profile | 🧪 |
| PATCH | `/api/users/me/profile` | Update profile (name, email → re-verification) | 🧪 |
| POST | `/api/users/me/avatar` | Upload avatar | 🧪 |
| GET | `/api/users/me/settings` | Read settings (currency, theme, language, notifications, AI) | 🧪 |
| PATCH | `/api/users/me/settings` | Update settings | 🧪 |
| GET | `/api/users/me/sessions` | List active sessions | 🧪 |
| DELETE | `/api/users/me/sessions/:id` | Revoke a session | 🧪 |
| POST | `/api/users/me/deactivate` | Start GDPR deletion (30-day grace) | 🧪 |
| POST | `/api/users/me/restore` | Cancel deletion during grace | 🧪 |
| DELETE | `/api/users/me` | Permanent purge after grace (cascades) | 🧪 |
| POST | `/api/users/me/data-copy` | Request final data copy before purge | 🧪 |
| GET | `/api/users/me/audit-logs` | Own audit trail | 🧪 |
| POST | `/api/auth/2fa/setup` | TOTP 2FA setup (enhancement) | 🧪 |
| POST | `/api/auth/2fa/verify` | Verify 2FA challenge at login (enhancement) | 🧪 |

### Module 1 — Account & Wallet

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/accounts` | List (`?type=`, `?includeInactive=1`) | ✅ |
| POST | `/api/accounts` | Create account | ✅ |
| PATCH | `/api/accounts/:id` | Update account | ✅ |
| DELETE | `/api/accounts/:id` | Deactivate (or permanent if zero transactions) | ✅ |
| POST | `/api/accounts/:id/deactivate` | Soft-deactivate, retain history | ✅ |
| POST | `/api/accounts/:id/reactivate` | Reactivate | ✅ |
| GET | `/api/accounts/:id/history` | Balance history (`?range=1M…All`) | ✅ |
| GET | `/api/accounts/export` | CSV of accounts | ✅ |
| GET | `/api/accounts/:id` | Detail with computed balance | 🧪 |
| GET | `/api/accounts/summary` | Dashboard totals (assets, liabilities, net) | 🧪 |
| GET | `/api/accounts/:id/balance` | Computed balance (opening + transactions) | 🧪 |
| POST | `/api/accounts/:id/snapshots` | Record manual balance snapshot | 🧪 |
| GET | `/api/accounts/:id/credit-utilization` | Credit card utilization metrics | 🧪 |
| GET | `/api/account-types` | Lookup: account types | 🧪 |
| GET | `/api/transfers` | List transfers | ✅ |
| POST | `/api/transfers` | Create transfer (atomic debit + credit) | ✅ |
| GET | `/api/transfers/:id` | Read transfer | 🧪 |
| PATCH | `/api/transfers/:id` | Edit transfer | 🧪 |
| DELETE | `/api/transfers/:id` | Delete transfer | 🧪 |
| POST | `/api/accounts/:id/balance-correction` | Balance correction transaction (enhancement) | 🧪 |
| POST | `/api/accounts/:id/reconcile` | Mark month reconciled (enhancement) | 🧪 |

### Module 2 — Transaction Engine

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/transactions` | List (date/account/category/type/search filters, pagination) | ✅ |
| POST | `/api/transactions` | Create transaction | ✅ |
| GET | `/api/transactions/:id` | Detail (tags, notes) | ✅ |
| PATCH | `/api/transactions/:id` | Update (atomic, version lock) | ✅ |
| DELETE | `/api/transactions/:id` | Delete | ✅ |
| POST | `/api/transactions/quick-add` | Quick-add (auto-fill last merchant/category/account) | 🧪 |
| GET | `/api/transactions/merchants/recent` | 5 most recent merchants | 🧪 |
| POST | `/api/transactions/bulk` | Bulk edit (categorize/tag/delete) | 🧪 |
| GET | `/api/transactions/summary` | Income/expense/net/count aggregates by period | ✅ |
| GET | `/api/transactions/date-groups` | Date-grouped list with daily totals | 🧪 |
| GET | `/api/transactions/:id/splits` | List splits | 🧪 |
| POST | `/api/transactions/:id/splits` | Add split (sum = parent amount) | 🧪 |
| PATCH | `/api/transactions/:id/splits/:splitId` | Edit split | 🧪 |
| DELETE | `/api/transactions/:id/splits/:splitId` | Delete split | 🧪 |
| POST | `/api/transactions/:id/tags` | Attach tag | ✅ |
| DELETE | `/api/transactions/:id/tags/:tagId` | Detach tag | ✅ |
| GET | `/api/transactions/export` | CSV export | ✅ |
| GET | `/api/categories` | Category tree (system + user) | ✅ |
| POST | `/api/categories` | Create custom category (max 2 levels) | ✅ |
| PATCH | `/api/categories/:id` | Update category | ✅ |
| DELETE | `/api/categories/:id` | Delete custom category | ✅ |
| GET | `/api/tags` | List tags | ✅ |
| POST | `/api/tags` | Create tag | ✅ |
| PATCH | `/api/tags/:id` | Update tag | ✅ |
| DELETE | `/api/tags/:id` | Delete tag | ✅ |
| GET | `/api/merchant-mappings` | List merchant→category mappings | 🧪 |
| POST | `/api/merchant-mappings` | Create/override mapping | 🧪 |
| PATCH | `/api/merchant-mappings/:id` | Update mapping | 🧪 |
| GET | `/api/recurring-transactions` | List templates | 🧪 |
| POST | `/api/recurring-transactions` | Create template | 🧪 |
| GET | `/api/recurring-transactions/:id` | Read template | 🧪 |
| PATCH | `/api/recurring-transactions/:id` | Update template | 🧪 |
| DELETE | `/api/recurring-transactions/:id` | Delete template | 🧪 |
| POST | `/api/recurring-transactions/:id/execute` | Confirm due occurrence → transaction | 🧪 |
| POST | `/api/recurring-transactions/:id/skip` | Skip next occurrence | 🧪 |
| POST | `/api/transactions/import` | Upload CSV → import batch (column auto-detect) | 🧪 |
| POST | `/api/transactions/import/preview` | Preview rows for column mapping | 🧪 |
| POST | `/api/transactions/import/validate` | Validate rows without importing | 🧪 |
| POST | `/api/transactions/import/confirm` | Confirm import with mapping | 🧪 |
| GET | `/api/import-batches` | Import history | 🧪 |
| GET | `/api/import-batches/:id` | Batch detail | 🧪 |
| GET | `/api/import-batches/:id/progress` | Rows processed/total | 🧪 |
| GET | `/api/import-batches/:id/errors` | Row-level errors | 🧪 |
| GET | `/api/import-batches/:id/errors/export` | Error log CSV | 🧪 |
| POST | `/api/import-batches/:id/duplicates/resolve` | Skip/import/merge duplicates | 🧪 |
| POST | `/api/transactions/duplicates/merge` | Merge duplicate into existing | 🧪 |
| GET | `/api/shared-groups` | List shared groups | 🧪 |
| POST | `/api/shared-groups` | Create group (creator = admin) | 🧪 |
| GET | `/api/shared-groups/:id` | Group detail | 🧪 |
| PATCH | `/api/shared-groups/:id` | Update group | 🧪 |
| DELETE | `/api/shared-groups/:id` | Delete group | 🧪 |
| GET | `/api/shared-groups/:id/members` | List members | 🧪 |
| POST | `/api/shared-groups/:id/invites` | Invite by email (7-day tokenized link) | 🧪 |
| GET | `/api/shared-groups/:id/invites` | Pending invites | 🧪 |
| DELETE | `/api/shared-groups/:id/invites/:inviteId` | Revoke invite | 🧪 |
| GET | `/api/shared-groups/invites/:token` | Resolve invite token | 🧪 |
| POST | `/api/shared-groups/invites/:token/accept` | Accept invite (SECURITY DEFINER, read-only) | 🧪 |
| POST | `/api/shared-groups/invites/:token/decline` | Decline invite | 🧪 |
| GET | `/api/shared-groups/:id/transactions` | Group transactions | 🧪 |
| DELETE | `/api/shared-groups/:id/members/:userId` | Remove member (owner only) | 🧪 |
| POST | `/api/shared-groups/:id/leave` | Leave group | 🧪 |
| POST | `/api/shared-groups/:id/transfer-ownership` | Transfer ownership | 🧪 |
| GET | `/api/shared-groups/:id/transactions/export` | Group transactions CSV | 🧪 |

### Module 3 — Budget

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/budgets` | List for month/year (filters, unbudgeted view) | ✅ |
| POST | `/api/budgets` | Create budget (category/overall, amount, period, thresholds) | ✅ |
| GET | `/api/budgets/:id` | Read budget | ✅ |
| PATCH | `/api/budgets/:id` | Update (applies current period forward) | ✅ |
| DELETE | `/api/budgets/:id` | Delete all periods (cancels pending rollover) | ✅ |
| GET | `/api/budgets/overview` | Dashboard summary (totals, over-budget count) | ✅ |
| GET | `/api/budgets/:id/utilization` | Spent/remaining/percentage | ✅ |
| GET | `/api/budgets/:id/breakdown` | Leaf-category breakdown for parent budget | ✅ |
| GET | `/api/budgets/:id/history` | Month-over-month budget vs actual | 🧪 |
| PATCH | `/api/budgets/:id/rollover` | Enable/disable rollover | 🧪 |
| GET | `/api/budgets/rollovers` | Rollover history | 🧪 |
| GET | `/api/budgets/suggested-amount` | Suggest from 3-month average | 🧪 |
| GET | `/api/budgets/alerts` | Threshold alerts | 🧪 |
| POST | `/api/budgets/alerts/:id/dismiss` | Dismiss alert | 🧪 |
| GET | `/api/budgets/templates` | List templates | 🧪 |
| POST | `/api/budgets/templates` | Save current budget set as template | 🧪 |
| GET | `/api/budgets/templates/:id` | Read template with items | 🧪 |
| PATCH | `/api/budgets/templates/:id` | Update template | 🧪 |
| DELETE | `/api/budgets/templates/:id` | Delete template | 🧪 |
| POST | `/api/budgets/templates/:id/apply` | Apply template to current month | 🧪 |
| POST | `/api/budgets/templates/:id/set-default` | Default template for rollover | 🧪 |
| GET | `/api/budgets/export` | Budget vs actual CSV | ✅ |
| GET | `/api/budgets/report` | Budget dashboard PDF | 🧪 |
| GET | `/api/budgets/status/:month/:year` | Month status aggregate | 🧪 |

### Module 4 — Bills & Subscriptions Tracker

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/bills` | List (status tabs, show-deactivated toggle) | ✅ |
| POST | `/api/bills` | Create bill | ✅ |
| GET | `/api/bills/:id` | Detail with current period status | ✅ |
| PATCH | `/api/bills/:id` | Edit (applies next period forward) | ✅ |
| DELETE | `/api/bills/:id` | Deactivate (retains history) | ✅ |
| POST | `/api/bills/:id/reactivate` | Reactivate | ✅ |
| POST | `/api/bills/:id/mark-paid` | Mark paid (creates expense + payment row) | ✅ |
| POST | `/api/bills/:id/skip` | Skip current period | ✅ |
| PATCH | `/api/bills/:id/autopay` | Toggle auto-debit indicator | ✅ |
| GET | `/api/bills/:id/payments` | Payment history | ✅ |
| GET | `/api/bills/:id/payments/yoy` | Year-over-year comparison | ✅ |
| GET | `/api/bills/:id/payments/export` | Payment history CSV | ✅ |
| GET | `/api/bills/calendar` | 30-day rolling due calendar | ✅ |
| GET | `/api/bills/upcoming` | Due-soon/overdue set | ✅ |
| GET | `/api/bills/overview` | Dashboard widget (obligation, due this week, overdue) | ✅ |
| GET | `/api/bills/cashflow-projection` | Monthly projection per account | 🧪 |
| GET | `/api/bills/cashflow-waterfall` | Balance waterfall for upcoming bills | 🧪 |
| GET | `/api/bills/:id/reminders` | Reminder configs | 🧪 |
| POST | `/api/bills/:id/reminders` | Create reminder config | 🧪 |
| PATCH | `/api/bills/:id/reminders/:reminderId` | Update reminder config | 🧪 |
| DELETE | `/api/bills/:id/reminders/:reminderId` | Delete reminder config | 🧪 |
| GET | `/api/bills/export` | Bills CSV | ✅ |
| POST | `/api/bills/suggest-recurring` | Suggest recurring debits as bills (90 days) | 🧪 |
| GET | `/api/subscriptions` | List (status tabs) | ✅ |
| POST | `/api/subscriptions` | Create subscription | ✅ |
| GET | `/api/subscriptions/:id` | Detail | ✅ |
| PATCH | `/api/subscriptions/:id` | Update | ✅ |
| DELETE | `/api/subscriptions/:id` | Cancel (archive, retain history) | ✅ |
| POST | `/api/subscriptions/:id/pause` | Pause | ✅ |
| POST | `/api/subscriptions/:id/resume` | Resume | ✅ |
| POST | `/api/subscriptions/:id/renew` | Confirm renewal (creates transaction) | ✅ |
| POST | `/api/subscriptions/:id/snooze` | Snooze due renewal | 🧪 |
| GET | `/api/subscriptions/:id/payments` | Payment history | ✅ |
| GET | `/api/subscriptions/:id/payments/export` | Payment history CSV | ✅ |
| GET | `/api/subscriptions/due-renewals` | Renewals in next 7 days | ✅ |
| GET | `/api/subscriptions/monthly-burn` | Total monthly burn (active) | ✅ |
| GET | `/api/subscriptions/audits` | AI audit findings | 🧪 |
| POST | `/api/subscriptions/audits/:id/dismiss` | Dismiss finding | 🧪 |
| GET | `/api/subscriptions/export` | Subscriptions CSV | ✅ |

### Module 5 — Savings & Goals

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/goals` | List (status tabs, priority filter) | ✅ |
| POST | `/api/goals` | Create goal | ✅ |
| GET | `/api/goals/:id` | Detail with derived progress | ✅ |
| PATCH | `/api/goals/:id` | Update (recalculates monthly contribution) | ✅ |
| DELETE | `/api/goals/:id` | Delete + contribution history | ✅ |
| POST | `/api/goals/:id/pause` | Pause | ✅ |
| POST | `/api/goals/:id/resume` | Resume | ✅ |
| POST | `/api/goals/:id/complete` | Mark completed | ✅ |
| GET | `/api/goals/dashboard` | Summary cards (saved, target, completion %) | ✅ |
| GET | `/api/goals/:id/progress` | Progress visualization data | ✅ |
| GET | `/api/goals/:id/feasibility` | On-track indicator | ✅ |
| GET | `/api/goals/:id/projection` | Projected completion date | ✅ |
| GET | `/api/goals/templates` | List templates (system + custom) | ✅ |
| GET | `/api/goals/templates/:id` | Read template | ✅ |
| POST | `/api/goals/templates` | Create custom template | ✅ |
| PATCH | `/api/goals/templates/:id` | Update template | ✅ |
| DELETE | `/api/goals/templates/:id` | Delete template | ✅ |
| GET | `/api/goals/:id/contributions` | Contribution history | ✅ |
| POST | `/api/goals/:id/contributions` | Log contribution (optionally linked transfer) | ✅ |
| PATCH | `/api/goals/:id/contributions/:contributionId` | Edit contribution | ✅ |
| DELETE | `/api/goals/:id/contributions/:contributionId` | Delete contribution | ✅ |
| POST | `/api/goals/:id/contributions/with-transfer` | Contribute + auto transfer | ✅ |
| GET | `/api/goals/:id/snapshots` | Weekly progress snapshots | ✅ |
| POST | `/api/goals/:id/snapshots` | Manual snapshot | ✅ |
| GET | `/api/goals/:id/milestones` | 25/50/75/100% milestones | ✅ |
| GET | `/api/goals/export` | Goals CSV | ✅ |
| GET | `/api/goals/:id/contributions/export` | Contributions CSV | ✅ |
| GET | `/api/goals/:id/report` | Progress chart PDF | 🧪 |
| POST | `/api/goals/distribute` | Windfall distribution suggestion (enhancement) | ✅ |

### Module 6 — Debt & Loan Manager

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/debts` | List (type filter, active/closed toggle) | 🧪 |
| POST | `/api/debts` | Add debt/loan | 🧪 |
| GET | `/api/debts/:id` | Detail | 🧪 |
| PATCH | `/api/debts/:id` | Edit (recalculates amortization) | 🧪 |
| DELETE | `/api/debts/:id` | Delete (only if no EMI recorded) | 🧪 |
| POST | `/api/debts/:id/close` | Mark closed | 🧪 |
| POST | `/api/debts/:id/reopen` | Reopen | 🧪 |
| GET | `/api/debts/dashboard` | Totals (outstanding, EMI burden, debt-free date, DTI) | 🧪 |
| GET | `/api/debt-types` | Lookup: debt types | 🧪 |
| GET | `/api/debts/:id/amortization` | Full schedule (`?year=`) | 🧪 |
| POST | `/api/debts/:id/amortization/regenerate` | Regenerate cached schedule | 🧪 |
| GET | `/api/debts/:id/cost-breakdown` | Principal vs interest | 🧪 |
| POST | `/api/debts/:id/simulate-prepayment` | Reduce-EMI vs reduce-tenure simulation | 🧪 |
| POST | `/api/debts/:id/prepayments` | Apply prepayment | 🧪 |
| GET | `/api/debts/:id/payments` | EMI/prepayment history | 🧪 |
| POST | `/api/debts/:id/payments` | Log EMI payment (links transaction) | 🧪 |
| PATCH | `/api/debts/:id/payments/:paymentId` | Edit logged payment | 🧪 |
| DELETE | `/api/debts/:id/payments/:paymentId` | Delete logged payment | 🧪 |
| GET | `/api/debts/:id/payment-status` | 12-month paid/missed/scheduled timeline | 🧪 |
| GET | `/api/debts/dti` | Debt-to-income ratio | 🧪 |
| PATCH | `/api/users/me/settings/monthly-income` | Monthly income for DTI | 🧪 |
| GET | `/api/debts/strategies/compare` | Avalanche vs snowball comparison | 🧪 |
| GET | `/api/debts/combined-timeline` | Consolidated payoff timeline | 🧪 |
| GET | `/api/debts/combined/strategies` | Portfolio-level strategy comparison | 🧪 |
| GET | `/api/debts/health-alerts` | Health flags (high DTI, missed payments) | 🧪 |
| GET | `/api/debts/export` | Debt summary CSV | 🧪 |
| GET | `/api/debts/:id/amortization/export` | Schedule CSV | 🧪 |
| GET | `/api/debts/:id/report` | Prepayment comparison PDF | 🧪 |

### Module 7 — Tax Planning

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/tax/investments` | List (`?fy=`, section/proof-status filters) | 🧪 |
| POST | `/api/tax/investments` | Record investment entry | 🧪 |
| GET | `/api/tax/investments/:id` | Read entry | 🧪 |
| PATCH | `/api/tax/investments/:id` | Edit entry | 🧪 |
| DELETE | `/api/tax/investments/:id` | Delete entry | 🧪 |
| GET | `/api/tax/sections` | Lookup: sections with limits | 🧪 |
| GET | `/api/tax/utilization` | Section utilization dashboard for FY | 🧪 |
| GET | `/api/tax/salary-structure` | Salary structure for FY | 🧪 |
| PATCH | `/api/tax/salary-structure` | Upsert structure (salaried/freelancer) | 🧪 |
| POST | `/api/tax/calculate` | Calculate liability for a regime | 🧪 |
| GET | `/api/tax/compare-regimes` | Old vs new regime comparison + recommendation | 🧪 |
| GET | `/api/tax/regime-slabs` | Lookup: slabs for FY | 🧪 |
| GET | `/api/tax/regime-recommendation` | Recommended regime with ₹ difference | 🧪 |
| GET | `/api/tax/summary` | FY summary card | 🧪 |
| GET | `/api/tax/financial-years` | FYs with data | 🧪 |
| GET | `/api/tax/itr-documents` | ITR checklist for FY | 🧪 |
| POST | `/api/tax/itr-documents` | Add document entry | 🧪 |
| PATCH | `/api/tax/itr-documents/:id` | Update status/notes | 🧪 |
| DELETE | `/api/tax/itr-documents/:id` | Delete entry | 🧪 |
| POST | `/api/tax/itr-documents/suggestions` | Generate built-in suggested docs | 🧪 |
| GET | `/api/tax/itr-documents/completion` | Checklist completion pie data | 🧪 |
| GET | `/api/tax/suggestions` | Suggestions from unused limits | 🧪 |
| POST | `/api/tax/form16/upload` | Upload Form 16 PDF for parsing (enhancement) | 🧪 |
| POST | `/api/tax/advance-tax/calculate` | Quarterly advance tax (enhancement) | 🧪 |
| GET | `/api/tax/export` | Section utilization CSV | 🧪 |
| GET | `/api/tax/report` | Regime comparison PDF | 🧪 |
| GET | `/api/tax/itr-documents/export` | ITR checklist CSV | 🧪 |
| GET | `/api/tax/investments/export` | Tax investments CSV | 🧪 |

### Module 8 — Investment Tracker

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/investments` | List (search, type/category/status filters) | 🧪 |
| POST | `/api/investments` | Add holding | 🧪 |
| GET | `/api/investments/:id` | Detail (lots, returns, dividends) | 🧪 |
| PATCH | `/api/investments/:id` | Update (recalculates values) | 🧪 |
| DELETE | `/api/investments/:id` | Delete holding | 🧪 |
| POST | `/api/investments/:id/close` | Mark closed/sold | 🧪 |
| POST | `/api/investments/:id/price` | Update price (appends history, snapshots) | 🧪 |
| GET | `/api/investments/:id/price-history` | Append-only price history | 🧪 |
| GET | `/api/investments/portfolio-summary` | Dashboard totals | 🧪 |
| GET | `/api/investments/asset-allocation` | Allocation by asset class | 🧪 |
| GET | `/api/investments/:id/returns` | XIRR for holding | 🧪 |
| GET | `/api/investments/returns/portfolio` | Portfolio XIRR | 🧪 |
| GET | `/api/investments/:id/transactions` | Buy/sell/reinvestment list | 🧪 |
| POST | `/api/investments/:id/transactions` | Add transaction | 🧪 |
| PATCH | `/api/investments/:id/transactions/:txnId` | Edit transaction | 🧪 |
| DELETE | `/api/investments/:id/transactions/:txnId` | Delete transaction | 🧪 |
| GET | `/api/investments/:id/snapshots` | Holding value snapshots | 🧪 |
| POST | `/api/investments/:id/snapshots` | Holding snapshot | 🧪 |
| GET | `/api/investments/snapshots` | Portfolio snapshots | 🧪 |
| POST | `/api/investments/snapshots` | Manual portfolio snapshot | 🧪 |
| GET | `/api/investments/portfolio-trend` | Value trend data | 🧪 |
| GET | `/api/investments/maturity-alerts` | Maturities in 30 days | 🧪 |
| POST | `/api/investments/prices/bulk-update` | Bulk price update (enhancement) | 🧪 |
| GET | `/api/investments/export` | Portfolio CSV | 🧪 |
| GET | `/api/investments/:id/transactions/export` | Holding txn history CSV | 🧪 |
| POST | `/api/investments/sip-calculator` | SIP what-if calculator (enhancement) | 🧪 |
| GET | `/api/sips` | List SIPs | 🧪 |
| POST | `/api/sips` | Create SIP | 🧪 |
| GET | `/api/sips/:id` | Read SIP | 🧪 |
| PATCH | `/api/sips/:id` | Update SIP | 🧪 |
| DELETE | `/api/sips/:id` | Delete SIP | 🧪 |
| POST | `/api/sips/:id/installment` | Log installment (creates transaction) | 🧪 |
| POST | `/api/sips/:id/pause` | Pause | 🧪 |
| POST | `/api/sips/:id/resume` | Resume | 🧪 |
| POST | `/api/sips/:id/complete` | Mark completed | 🧪 |
| GET | `/api/sips/due` | SIPs due in 7 days | 🧪 |
| GET | `/api/sips/export` | SIPs CSV | 🧪 |
| GET | `/api/dividends` | List payouts | 🧪 |
| POST | `/api/dividends` | Record payout | 🧪 |
| GET | `/api/dividends/:id` | Read payout | 🧪 |
| PATCH | `/api/dividends/:id` | Edit payout | 🧪 |
| DELETE | `/api/dividends/:id` | Delete payout | 🧪 |

### Module 9 — Net Worth Tracker

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/net-worth` | Current net worth (computed on read) | 🧪 |
| GET | `/api/net-worth/trend` | Snapshot series (`?range=`) | 🧪 |
| GET | `/api/net-worth/breakdown` | Asset/liability breakdown by source | 🧪 |
| GET | `/api/net-worth/ratio` | Assets vs liabilities ratio + % change | 🧪 |
| GET | `/api/net-worth/summary` | Hero display (MoM, YoY) | 🧪 |
| GET | `/api/net-worth/snapshots` | Daily snapshots | 🧪 |
| POST | `/api/net-worth/snapshots/run` | Manual snapshot run | 🧪 |
| GET | `/api/net-worth/milestones` | List milestones | 🧪 |
| POST | `/api/net-worth/milestones` | Create milestone | 🧪 |
| PATCH | `/api/net-worth/milestones/:id` | Update milestone | 🧪 |
| DELETE | `/api/net-worth/milestones/:id` | Delete milestone | 🧪 |
| POST | `/api/net-worth/milestones/:id/toggle` | Enable/disable | 🧪 |
| GET | `/api/net-worth/export` | Time series CSV | 🧪 |
| GET | `/api/net-worth/report` | Report PDF | 🧪 |
| GET | `/api/net-worth/chart` | Trend chart PNG | 🧪 |
| GET | `/api/manual-assets` | List (category filter) | 🧪 |
| POST | `/api/manual-assets` | Add asset | 🧪 |
| GET | `/api/manual-assets/:id` | Read asset | 🧪 |
| PATCH | `/api/manual-assets/:id` | Update asset | 🧪 |
| DELETE | `/api/manual-assets/:id` | Delete asset | 🧪 |
| GET | `/api/manual-assets/export` | Assets CSV | 🧪 |

### Module 10 — Reports & Analytics Dashboard

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/reports/cashflow` | Income vs expense for period | 🧪 |
| GET | `/api/reports/spending-by-category` | Category breakdown | 🧪 |
| GET | `/api/reports/trends` | Cumulative spend trend (3/6/12 months) | 🧪 |
| GET | `/api/reports/budget-vs-actual` | Budget vs actual (from Module 3 metrics) | 🧪 |
| GET | `/api/reports/heatmap` | Daily spending heatmap | 🧪 |
| GET | `/api/reports/net-worth` | Net worth over time | 🧪 |
| GET | `/api/reports/debt-payoff` | Payoff progress | 🧪 |
| GET | `/api/reports/income-sources` | Income by source category | 🧪 |
| GET | `/api/reports/top-merchants` | Top merchants by spend/frequency | 🧪 |
| GET | `/api/reports/summary` | Combined key metrics | 🧪 |
| POST | `/api/reports/explain` | Explain-This (AI on aggregated snapshot) | 🧪 |
| GET | `/api/report-templates` | List templates (system + user) | 🧪 |
| GET | `/api/report-templates/:id` | Read template | 🧪 |
| POST | `/api/report-templates` | Create user template | 🧪 |
| PATCH | `/api/report-templates/:id` | Update template | 🧪 |
| DELETE | `/api/report-templates/:id` | Delete template | 🧪 |
| POST | `/api/report-templates/:id/duplicate` | Duplicate | 🧪 |
| POST | `/api/reports/export-pdf` | Create dashboard PDF job | 🧪 |
| GET | `/api/report-exports` | List export records | 🧪 |
| GET | `/api/report-exports/:id/download` | Download generated file | 🧪 |
| GET | `/api/reports/export` | Underlying data CSV | 🧪 |
| GET | `/api/reports/cashflow/export` | Cash flow chart data CSV | 🧪 |

### Module 11 — Secure Notes & Vault

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/notes` | List (pinned first, category filter, search) | 🧪 |
| POST | `/api/notes` | Create note (encrypted payload) | 🧪 |
| GET | `/api/notes/:id` | Read note (ciphertext + IV, decrypt client-side) | 🧪 |
| PATCH | `/api/notes/:id` | Update (re-encrypt, optimistic lock on version) | 🧪 |
| DELETE | `/api/notes/:id` | Soft-delete (30-day restore window) | 🧪 |
| POST | `/api/notes/:id/restore` | Restore from trash | 🧪 |
| DELETE | `/api/notes/:id/purge` | Permanent purge | 🧪 |
| GET | `/api/notes/trash` | Soft-deleted notes | 🧪 |
| POST | `/api/notes/:id/pin` | Pin to top | 🧪 |
| POST | `/api/notes/:id/unpin` | Unpin | 🧪 |
| GET | `/api/notes/categories` | Distinct categories (seeded + custom) | 🧪 |
| PATCH | `/api/notes/categories` | Rename category (batch, one transaction) | 🧪 |
| GET | `/api/note-templates` | Seeded templates with field schemas | 🧪 |
| GET | `/api/note-templates/:code` | Read single template | 🧪 |
| GET | `/api/notes/:id/attachments` | List attachments | 🧪 |
| POST | `/api/notes/:id/attachments` | Upload client-encrypted file | 🧪 |
| GET | `/api/notes/:id/attachments/:attachmentId` | Download (decrypt client-side) | 🧪 |
| GET | `/api/notes/:id/attachments/:attachmentId/preview` | Image/PDF preview | 🧪 |
| DELETE | `/api/notes/:id/attachments/:attachmentId` | Remove attachment | 🧪 |
| GET | `/api/vault/wrapped-key` | Wrapped vault key + KDF params | 🧪 |
| POST | `/api/vault/unlock` | Unlock vault | 🧪 |
| POST | `/api/vault/lock` | Lock vault | 🧪 |
| POST | `/api/vault/verify-password` | Verify password for vault access | 🧪 |
| POST | `/api/vault/rewrap` | Re-wrap key after password change/reset | 🧪 |
| GET | `/api/vault/recovery-status` | Recovery copy status | 🧪 |
| POST | `/api/vault/export` | Encrypted vault backup (enhancement) | 🧪 |
| POST | `/api/vault/import` | Restore from backup (enhancement) | 🧪 |
| GET | `/api/notes/export` | Note headers CSV | 🧪 |

### C1 — Financial Calendar Component

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/calendar/events` | Month grid (derived + custom events, one request) | 🧪 |
| GET | `/api/calendar/events?date=:date` | Day detail panel | 🧪 |
| GET | `/api/calendar/upcoming` | Next 7/30 days with per-day totals | 🧪 |
| GET | `/api/calendar/cashflow-projection` | Daily projection per account (+7/+30) | 🧪 |
| GET | `/api/calendar/tax-deadlines` | Seeded tax deadline registry | 🧪 |
| POST | `/api/calendar/events` | Create custom event | 🧪 |
| GET | `/api/calendar/events/:id` | Read custom event | 🧪 |
| PATCH | `/api/calendar/events/:id` | Update custom event | 🧪 |
| DELETE | `/api/calendar/events/:id` | Delete custom event | 🧪 |
| POST | `/api/calendar/events/:id/duplicate` | Duplicate event | 🧪 |
| GET | `/api/calendar/export` | iCal (.ics) export (enhancement) | 🧪 |
| GET | `/api/calendar/month/:month/:year` | Grid for specific month | 🧪 |

### C2 — Notifications & Alerts Center

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/notifications` | Feed (25/page, read/unread/dismissed) | 🧪 |
| GET | `/api/notifications/unread-count` | Badge count | 🧪 |
| GET | `/api/notifications/:id` | Read one | 🧪 |
| POST | `/api/notifications/:id/read` | Mark read | 🧪 |
| POST | `/api/notifications/read-all` | Mark all read | 🧪 |
| POST | `/api/notifications/:id/dismiss` | Dismiss | 🧪 |
| POST | `/api/notifications/:id/restore` | Restore to feed | 🧪 |
| POST | `/api/notifications/bulk` | Bulk dismiss/archive | 🧪 |
| POST | `/api/notifications/:id/action` | Take action (deep-link target) | 🧪 |
| GET | `/api/notifications/stream` | SSE stream (real-time) | 🧪 |
| GET | `/api/notifications/archive` | Searchable archive (ILIKE + filters) | 🧪 |
| GET | `/api/notification-preferences` | Per-type per-channel matrix | 🧪 |
| PATCH | `/api/notification-preferences` | Upsert toggles (in-app/email per type) | 🧪 |
| PATCH | `/api/notification-preferences/:type/:channel` | Toggle single preference | 🧪 |
| GET | `/api/notification-emails` | Email delivery log | 🧪 |
| POST | `/api/notifications/email/preview` | Preview email | 🧪 |

### C3 — Data Export Component

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| POST | `/api/export/jobs` | Create export job (csv/pdf, module scope, range) | 🧪 |
| GET | `/api/export/jobs` | List recent exports | 🧪 |
| GET | `/api/export/jobs/:id` | Job status | 🧪 |
| GET | `/api/export/jobs/:id/download` | Download file (24h expiring link) | 🧪 |
| GET | `/api/export/jobs/:id/progress` | Progress + size estimate | 🧪 |
| POST | `/api/export/jobs/:id/retry` | Retry failed job | 🧪 |
| DELETE | `/api/export/jobs/:id` | Cancel/delete job | 🧪 |
| POST | `/api/export/full-archive` | Full data export (zip + manifest) | 🧪 |
| GET | `/api/export/modules` | Exportable modules + column sets | 🧪 |
| GET | `/api/export/status` | Pipeline health/queue status | 🧪 |

### System

| Method | Endpoint | Purpose | Status |
|---|---|---|---|
| GET | `/api/jobs/run` | Cron entry point (`x-cron-secret` guard, no cookie auth) | ✅ |

---

## §4 Adding a route — checklist

1. Pick the resource and verb per **§1** — if in doubt, follow an existing sibling row in this file.
2. Create `api/src/routes/<resource>.ts` exporting `const <resource> = new Hono()`; reuse `requireAuth`, `withUser()`, `parseAmount`, `parseBoolean` from `api/src/routes/helpers.ts`.
3. Mount in `api/src/app.ts`: `app.route("/api/<resource>", <resource>)`.
4. Wrap calls in `src/lib/api-client.ts`; mutations get a thin `"use server"` proxy in `src/app/(app)/<module>/actions.ts`.
5. Update this file: mark the row ✅ once live (see `folder-structure.md` "new module" guide for the full flow).
6. Smoke-test with the curl commands in `DEV-ENV.md` §9.

## §5 Open notes

- The web + mobile clients consume the **same** `/api/*` endpoints (same-origin cookies in the Capacitor WebView). A future Bearer-token mode is a documented Phase 2 extension — it adds an auth layer, not new route paths.
- Export paths are extension-free per R7; the client derives filenames from `Content-Disposition`.
- Planned rows are the contract for future modules; implement them in module build order without renegotiating names unless a module spec explicitly requires it.
