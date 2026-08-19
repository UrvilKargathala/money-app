# MoneyMind — Search & Filter Strategy

## 1. Audit: what's documented today

| Module | Search/filter documented? | Detail |
|---|---|---|
| 1. Account & Wallet | Partial | Only a name-search note for the account-picker dropdown |
| 2. Transaction Engine | **Yes — full spec** | FR-2.14–2.18: text search + 7 filter facets + pagination + chips |
| 3. Budget | No | — |
| 4. Bills & Subscriptions | No | — |
| 5. Savings & Goals | Mentioned, not specified | F6 says "filtering" but no FR defines it |
| 6. Debt & Loan Manager | Partial | Only amortization-schedule filter by year |
| 7. Tax Planning | No | FY navigation is an implicit filter, not framed as one |
| 8. Investment Tracker | No | — |
| 9. Net Worth Tracker | Partial | Index note only, no FR |
| 10. Reports & Analytics | Partial | Date-range filter exists, but it's report-scope, not entity search |

Module 2 is the only fully-designed one — it's the template to copy the *shape* of (search box + filter facets + chips + pagination) when writing FRs for the others.

---

## 2. Two different things we're designing

- **Global Search** — one search bar (likely in the app header) that searches *across* modules and takes the user to the matching record. This is "find something, wherever it lives."
- **In-module filters** — dropdown/chip filters scoped to a single module's list (category, status, type, date range). This is "narrow what I'm already looking at."

A module can need one, both, or neither. Small, bounded lists (a handful of debts, a handful of tax sections) don't need either — filters on a 5-row list are noise, not help.

---

## 3. Module-by-module recommendation

| Module | List size (from module docs) | In-module text search | In-module filters | Include in Global Search? |
|---|---|---|---|---|
| 1. Account & Wallet | 10–50 accounts/user | Not needed as a dedicated feature — a simple picker/typeahead is enough | Type (bank/credit/wallet/…), Active/Deactivated | Yes — accounts are a common thing to jump to by name |
| 2. Transaction Engine | 36k–73k rows/user | **Yes (already specced)** | Date range, account, category, type, amount range, tags | Yes — highest-value target for global search |
| 3. Budget | 10–30 categories/month | No | Category, Month/Year, Over-budget only | No — budgets are viewed as a dashboard, not searched for individually |
| 4. Bills & Subscriptions | Tens of bills + subscriptions | Yes, once combined list grows past ~15–20 items | Status (upcoming/due soon/overdue/paid/skipped), Active/Paused/Cancelled, Category | Yes — "find my Netflix subscription" is a real use case |
| 5. Savings & Goals | Typically <20 goals | No | Status (active/completed/paused), Priority | Yes — jumping straight to a named goal is useful |
| 6. Debt & Loan Manager | Typically <10 debts | No | Type (home/car/personal/education/credit card), plus existing year filter on amortization | No |
| 7. Tax Planning | Fixed set of sections per FY | No | Financial Year (already implicit — make it an explicit selector), Section | No — bounded, structured data, not a "search for it" experience |
| 8. Investment Tracker | Can grow to hundreds of holdings across 7 instrument types | **Yes** — this is the second-biggest candidate after transactions | Instrument type (mutual fund/stock/FD/PPF/NPS/gold/crypto), Asset class, Status (active/matured) | Yes — "find my Axis Bluechip Fund" is exactly what search is for |
| 9. Net Worth Tracker | <20 manual assets | No | Category (property/vehicle/gold/other) | No — small list, and net worth is a summary view, not a lookup view |
| 10. Reports & Analytics | N/A — charts, not records | No (date-range filter already covers this) | Date range (already specced) | No — nothing to "find," it's a dashboard |

**Bottom line — modules that need real search UX:** Transactions (done), Investments (biggest gap), Bills & Subscriptions.
**Modules that need category/status filters but not a search box:** Budget, Savings & Goals, Debt & Loan, Net Worth, Tax Planning.
**Modules that need neither beyond what's already specced:** Reports & Analytics.

---

## 4. Global Search design

**What it searches:** a federated/unified search across the modules flagged "Yes" above — Transactions, Accounts, Bills & Subscriptions, Goals, Investment holdings. Each result should show its module (icon/badge) and route straight to that record in context (e.g., a transaction result opens the Transaction Engine with that row highlighted and its filters pre-applied).

**Fields searched per entity:**
- Transactions → `description`, `merchant_clean`, `notes`
- Accounts → `name`, `institution`
- Bills → `name`
- Subscriptions → `service_name`
- Goals → `name`
- Investment holdings → `name` (fund/stock/instrument name)

**Result presentation:**
- Grouped by module (not one flat list) so a query like "Netflix" can show both a Subscription match and matching Transactions.
- Each result row shows the 2–3 most identifying fields (e.g., transaction: date + amount + account; investment: type + current value).
- A "Search in [Module]" fallback link opens the module's own filtered list view for a fuller result set, since global search should stay fast/lightweight and not try to replace in-module filtering.

**Why this shape:** Global search is a *router*, not a replacement for the Transaction Engine's rich filter UI. It should get the user to the right module fast; deep filtering (amount ranges, tag combinations, date windows) stays a module-level job.

---

## 5. Suggested next step

~~Write dedicated Functional Requirements~~ **Implemented (August 2026):**

1. **Investment Tracker** — search box + type/asset-class/status filters (FR-8.17–8.21). ✅
2. **Bills & Subscriptions** — status filter tabs (FR-4.20–4.22; search deferred until the combined list grows past ~30 items). ✅
3. **Global Search** — as its own cross-cutting module/spec, since it touches every module listed as "Yes" above. ⏳ **Open — still to be specified.**

Filter-only FRs (no search box) added to Budget (FR-3.21–3.22), Savings & Goals (FR-5.18–5.19), Debt & Loan (FR-6.25–6.26), Net Worth (FR-9.11), and Tax Planning (FR-7.20–7.22), exposing existing status/category/year fields as filter controls. ✅

**Index support added alongside:** GIN trigram indexes on `transactions(description, merchant_clean)` and `investments(name)`; redundant low-selectivity and `user_id`-prefix indexes removed across all module docs (see MoneyMind_Database_Audit D1/D2).
