# MoneyMind -- Personal Finance Web Manager

## Project Brief Overview

---

## What Is It?

MoneyMind is a personal finance web application that combines comprehensive money management in a multi-user hosted platform. All data resides in PostgreSQL (Supabase/AWS-ready) with user isolation. An optional AI layer (Phase 4 — Future) can be enabled using the user's own Claude API key.

---

## The Problem It Solves

Most people manage their finances reactively. They check their bank balance, wonder where the money went, and repeat the cycle. Existing tools either require too much manual effort (spreadsheets), lack intelligence (basic expense trackers), or require giving financial data to a cloud service. There is no single hosted platform that brings all financial data together for each user with secure, per-user isolation.

---

## Who Is It For?

- Young professionals tracking their first serious income and expenses
- Freelancers and small business owners managing irregular cash flows
- Anyone who wants visibility and control of their finances in one hosted, encrypted place
- Users in the Indian market (INR, UPI, Indian banking context) as the primary audience

---

## Core Modules (11 Total)

### 1. Account & Wallet Layer
Manual setup of bank accounts, wallets, credit cards, cash, FDs, and PPF. Every transaction ties to an account. Tracks balance across all accounts.

### 2. Transaction Engine
The workhorse. Supports manual entry, CSV import with column mapping, duplicate detection, and search/filter.

### 3. Budget Module
Users set monthly budgets per category. Real-time tracking of actual vs budgeted spending with visual progress bars.

### 4. Bills & Subscriptions Tracker (Phase 2)
Tracks recurring bills with due dates and reminders. Auto-detects subscriptions from transaction history.

### 5. Savings & Goals (Phase 2)
Named savings goals with target amounts, deadlines, and progress tracking.

### 6. Debt & Loan Manager (Phase 2)
Track debts with amortization view, prepayment simulator, and payoff strategy comparison.

### 7. Tax Planning (Phase 2)
Track Section 80C/80D investments, old vs new regime comparison.

### 8. Investment Tracker (Phase 2)
Portfolio-level tracking for mutual funds, stocks, FDs, PPF, NPS, gold, and crypto.

### 9. Net Worth Tracker (Phase 2)
Aggregate all assets and liabilities to track net worth over time.

### 10. Reports & Analytics Dashboard (Phase 2)
Visualizations of cash flow, spending breakdowns, budget vs actual, trends over time, net worth. PDF export.

### 11. AI Financial Assistant (Chat) (Phase 4 — Future)
Optional feature. Natural language interface where users ask questions about their finances.

---

## Cross-Cutting Components

- **C1: Financial Calendar (Phase 2)** — Unified calendar of all financial events and cash flow
- **C2: Notifications & Alerts Center (Phase 2)** — Alerts for bills, budgets, goals
- **C3: Data Export & Backup (Phase 1)** — Per-module CSV/PDF export, full backup/restore

---

## Data Portability Features

- **Per-module export**: Every module can export its data as CSV or PDF
- **Full data export**: Per-user export/backup of the hosting PostgreSQL account (backup/restore via the hosted service); `pg_dump`-style full backup
- **Cross-device access**: Users log into the same hosted account on any device — no peer-to-peer WiFi/Bluetooth transfer needed

---

## Mobile Platform

MoneyMind ships as a **mobile app** (Capacitor shell wrapping the same web app — one codebase, one backend) in addition to the desktop web:

- **Phase 1 (implemented):** Android Capacitor shell; mobile-ready UI for current modules (bottom navigation with quick-add FAB, safe-area handling, touch targets); **Quick Add** flow at `/add` — keypad entry of an expense/income that writes straight through `/api/transactions` to the database; deep-link entry point (`moneymind://add`) wired.
- **Phase 2 (roadmap — `DOCS/mobile.md` § 8):** home-screen widget (tap → quick-add), app-icon shortcuts, and on iOS the full "tap" suite — **Back Tap (double/triple tap on the phone back)**, Action Button, Control Center, Lock Screen widget, Siri — via App Intents; push notifications.
- Android is built on this Windows machine; iOS builds require a Mac or CI (Xcode).
- Full guide: `DOCS/mobile.md`.

---

## AI Layer (Phase 4 — Future, Optional)

Enabled by the user's own Claude API key. Features include:
- Auto-categorization of transactions with merchant cache
- Bill/receipt image scanning via Claude Vision
- CSV intelligent import (column detection, data cleaning)
- Spending anomaly detection
- Budget overspend forecasting
- Natural language financial chat
- Weekly/monthly personalized summaries

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web Framework | Next.js + PostgreSQL (Supabase) |
| Frontend | Next.js (App Router) + Tailwind CSS + shadcn/ui |
| Backend API | Hono (`api/` workspace package) embedded at `/api/*` — the UI never touches the DB directly |
| Mobile | Capacitor shell (Android now; iOS needs a Mac/CI) — system WebView loading the same app; quick-add at `/add`; deep-link entry `moneymind://add`. See `DOCS/mobile.md` |
| Database | PostgreSQL via Prisma ORM (SQL scripts are canonical DDL; Prisma introspects) |
| Charts | Recharts |
| CSV Parsing | Papa Parse |
| Export - PDF | jsPDF / @react-pdf/renderer |
| Export - CSV | csv-writer |
| Cross-Device Sync | Hosted account login (same data across devices from PostgreSQL) |
| AI Engine (Optional) | Claude API (user-provided key) |
| State Management | Zustand |
| Infrastructure | See `DOCS/hosting-and-portability.md` (auth, hosting, deployment, worker, storage decisions), `DOCS/DEV-ENV.md` (local development guide), `DOCS/what-if.md` (deployment scenarios) |

---

## Data Model (~55 Tables — canonical source: `DOCS/data-tables-v2.md`)

```
users (global role: 'user' | 'admin') / user_profiles / user_settings / auth_tokens / audit_logs
accounts
  |-- account_balance_history
  |-- account_transfers
  |-- account_types (lookup)
transactions
  |-- categories (system + user)
  |-- merchant_mappings (AI cache)
  |-- tags / tags_transactions
  |-- recurring_transaction_templates
  |-- import_batches / import_errors
  |-- shared_groups / group_members / group_invites (F15 — read-only family access)
budgets
  |-- budget_alerts
  |-- budget_rollovers
  |-- budget_templates / budget_items
bills / subscriptions
  |-- bill_reminders
  |-- payment_history
  |-- subscription_audits
goals
  |-- goal_contributions
  |-- goal_templates
  |-- goal_snapshots
debts
  |-- debt_payments
  |-- amortization_schedule
  |-- debt_types (lookup)
tax_planning
  |-- tax_sections (lookup)
  |-- tax_investments
  |-- salary_structures
  |-- tax_regime_slabs (lookup)
  |-- itr_documents
investments
  |-- investment_transactions
  |-- investment_snapshots
  |-- portfolio_snapshots
  |-- dividend_income
  |-- sip_trackers
net worth
  |-- net_worth_snapshots
  |-- manual_assets
reports
  |-- report_templates
  |-- report_exports
access_logs / login_attempts
```

---

## Build Phases

### Phase 1 -- MVP (4-5 Weeks)
- Account setup
- Transaction entry (manual + CSV import with column mapping)
- Budget tracking
- Basic dashboard (income vs expense, category breakdown)
- Per-module CSV export
- Hosted database backup (Supabase/AWS RDS automated)

### Phase 2 -- Full Features (4-5 Weeks)
- Bills & Subscriptions tracking
- Savings & Goals
- Debt & Loan Manager
- Tax Planning
- Investment Tracker
- Net Worth Tracker
- Full Reports Suite with PDF export
- Financial Calendar
- Notifications & Alerts Center
- Enhanced Export (per-module PDF, full data export)

### Phase 3 -- AI Integration (Future, Optional)
- AI auto-categorization with merchant cache
- AI bill scanning (image → structured data)
- AI CSV intelligent import
- AI financial chat assistant
- AI insights & alerts

---

## AI Cost Management Strategy

1. **Merchant mapping cache** -- Once a merchant is categorized, store the mapping. Never call the API for the same merchant twice. Eliminates 70-80% of categorization calls.
2. **Batch processing** -- Group 20-30 transactions per API call for bulk operations.
3. **Scheduled over real-time** -- Summaries, audits, and forecasts run on scheduled checks. Results cached.
4. **Bill image optimization** -- Images are compressed before API submission to minimize token costs.

---

## Key Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Data loss (database corruption / backup loss) | PostgreSQL crash recovery / point-in-time backup, automated on Neo/AWS RDS, per-user export & restore |
| AI API costs (user's own key) | Merchant cache, batching, user controls when AI is enabled |
| CSV format inconsistency across banks | Flexible parser with column mapping UI |
| Investment advice liability | All AI output framed as educational, never advisory. Clear disclaimers. |
| Session/device (multi-user web) | RLS, hashed passwords, audit logging, TLS |

---

## Summary

MoneyMind is a four-phase web build starting as a multi-user expense tracker (Phase 1), complete manager (Phase 2), sync + AI (Phase 3/4). Cloud-hosted in PostgreSQL/Supabase.

---

*Document version: August 2026 | Web-App (Next.js + PostgreSQL/Supabase, AWS-ready) | Status: Pre-development planning*