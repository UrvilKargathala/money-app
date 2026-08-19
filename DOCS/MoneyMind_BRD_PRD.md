**MONEYMIND**

AI-Powered Personal Finance Manager

**Business Requirements Document (BRD)**

&

**Product Requirements Document (PRD)**

Document Version: 2.0

Date: August 2026

Status: Pre-Development Planning

Platform: Web-Application (Postgres on Supabase, in future AWS Migration)

# **Table of Contents**

_Note: Update this table of contents after opening the document in Word by right-clicking and selecting 'Update Field'._

**PART 1: BUSINESS REQUIREMENTS DOCUMENT (BRD)**

# **1\. Executive Summary**

MoneyMind is a personal finance management application designed for the Indian market. It combines comprehensive money tracking (income, expenses, budgets, bills, subscriptions, savings, debt, taxes, and investments) into a single web-based online personal finance management application. The app runs as a hosted web application with cloud-hosted PostgreSQL (Supabase/AWS-ready), user login/auth, and internet connection — all data stays in a PostgreSQL database hosted on Supabase (with future AWS RDS readiness).

The application runs on a web-app architecture with PostgreSQL (hosted initially on Supabase, with AWS RDS readiness for future migration). Multi-user isolation is enforced via `user_id` foreign keys on all data tables and Row-Level Security. All modules are designed as independent, atomic operations with no cross-module sequential dependency: each delete/update uses optimistic locking (`version`) and soft delete (`deleted_at`, `deleted_by`) to guarantee concurrent safety. Data portability remains a first-class citizen via per-module CSV/PDF export and full database backup (JSON/SQL).

Cross-device access lets users reach the same financial data from any device while signed into their hosted account — no peer-to-peer transfer or cloud intermediary is needed beyond the hosted service. An optional AI layer (Phase 4 — Future) can be enabled at any time, providing auto-categorization of transactions, bill scanning via image upload, CSV import intelligence, spending insights, and a natural language financial chat assistant. The AI is entirely optional and API-key driven — the user provides their own Claude API key if they want AI features.

# **2\. Business Objectives**

## **2.1 Primary Objectives**

Build a multi-user web application that consolidates all aspects of personal finance management, replacing the fragmented approach of using multiple apps, spreadsheets, and mental tracking.

Deliver a privacy-centric, multi-user web application where each user's financial data is isolated (via `user_id` FK + Row-Level Security) with zero cross-user mixing.

Provide comprehensive data portability through per-module export (CSV/PDF) and full per-user database export/backup from the hosted database.

Support an optional AI layer (Phase 4 — Future) that can auto-categorize transactions, scan bill images, intelligently parse CSV imports, and provide financial insights — all powered by the user's own Claude API key.

Achieve product-market fit in the Indian personal finance market by addressing India-specific needs: UPI transaction tracking, INR currency, Section 80C/80D tax planning, Indian bank statement formats, and EMI/loan structures common in India.

## **2.2 Business Goals**

| **Goal**               | **Target**                                                   | **Timeframe**       |
| ---------------------- | ------------------------------------------------------------ | ------------------- |
| MVP Launch             | Functional web app with core tracking modules            | Phase 1 (4-5 weeks) |
| ---                    | ---                                                          | ---                 |
| Feature Complete       | All 11 modules working with full CRUD and reporting          | Phase 2 (4-5 weeks) |
| ---                    | ---                                                          | ---                 |
| Cross-Device Access     | Any-device access via hosted account login                  | Phase 3 (3-4 weeks) |
| ---                    | ---                                                          | ---                 |
| AI Integration (Optional) | Optional AI layer with bill scanning, categorization, chat | Phase 4 (Future)    |
| ---                    | ---                                                          | ---                 |
| Data Portability       | Per-module export, full export, backup/restore flow          | Phase 2             |

# **3\. Problem Statement**

Most individuals in India manage their personal finances reactively and with fragmented tools. They check their bank balance, wonder where the money went, and repeat the cycle. The core problems are:

Fragmented Financial View: Bank apps show one account at a time. UPI apps track only UPI payments. Investment apps show only investments. There is no unified view of a person's complete financial picture encompassing all accounts, all spending, all savings, all debt, and all investments.

Manual Effort Creates Abandonment: Existing expense tracker apps require users to manually log every transaction, categorize it, and maintain budgets. The manual overhead leads to 80%+ abandonment within the first month.

Absence of Intelligence: Most tools record data but do not analyze it. They show what happened but not why it matters, what is coming next, or what the user should do about it. There is no prediction, no anomaly detection, no proactive guidance.

Tax and Debt Blind Spots: Salaried individuals in India struggle with tax-saving investment planning under Section 80C/80D, and many carry multiple loans (home, car, personal, education) without a strategy for optimal payoff. No consumer tool connects spending behavior to tax optimization or debt reduction strategy.

MoneyMind solves these problems by creating a single intelligent platform where all financial data converges and AI transforms it into actionable insights.

# **4\. Target Audience**

## **4.1 Primary Users**

| **Persona**                       | **Description**                                                                                      | **Key Needs**                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Salaried Professional (Age 22-35) | Young professional earning INR 4-15 LPA, 1-3 bank accounts, UPI-heavy, carrying 0-2 active loans     | Expense tracking, budget control, tax saving guidance, savings goal planning                             |
| ---                               | ---                                                                                                  | ---                                                                                                      |
| Freelancer / Gig Worker           | Irregular income across multiple sources, project-based payments, no employer-managed tax deductions | Income tracking across sources, cash flow prediction, tax liability estimation, invoice payment tracking |
| ---                               | ---                                                                                                  | ---                                                                                                      |
| Early Career Investor             | Has started investing in MFs/stocks, wants to track returns alongside regular finances               | Portfolio tracking integrated with spending, net worth visibility, allocation insights                   |
| ---                               | ---                                                                                                  | ---                                                                                                      |
| Household Finance Manager         | One person managing finances for a household, tracking shared expenses, bills, and goals             | Multi-account view, bill management, subscription auditing, family goal tracking                         |
| ---                               | ---                                                                                                  | ---                                                                                                      |

# **5\. Scope Definition**

## **5.1 In Scope**

The following capabilities are within the scope of the MoneyMind platform across its three development phases:

11 core functional modules: Account & Wallet Layer, Transaction Engine, Budget Module, Bills & Subscriptions Tracker, Savings & Goals, Debt & Loan Manager, Tax Planning, Investment Tracker, Net Worth Tracker, Reports & Analytics Dashboard, and AI Financial Assistant Chat.

2 cross-cutting platform components: Financial Calendar (dashboard widget) and Notifications & Alerts Center (app shell component).

7-layer AI capability stack (Phase 4 — Future, optional): auto-categorization, pattern detection, bill image scanning, CSV intelligent import, cash flow prediction, natural language Q&A, and personalized summaries/recommendations.

Indian market localization: INR currency, Indian tax sections, Indian bank CSV formats, UPI merchant recognition.

Data portability features: per-module export (CSV/PDF), full database export, backup and restore functionality.

Cross-device access: users sign into their hosted account from any device and see the same per-user data (no peer-to-peer transfer needed).

## **5.2 Out of Scope**

The following are explicitly excluded from the current project scope:

Expense splitting and group finance management (Splitwise territory).

Direct payment processing or UPI payment initiation from within the app.

Specific investment advisory or buy/sell recommendations (regulatory and liability constraints).

Multi-user household accounts with shared access and permissions. (Partial scope now: Phase 2 introduces **Shared Expense Groups** — Module 2, F15 — read-only family access to the owner's group transactions, via `shared_groups` / `group_members` / `group_invites`. Full collaborative budgeting/expense-splitting across all modules remains out of scope.)

Insurance policy management as a standalone module.

Document vault or file storage functionality.

Credit score monitoring or credit report integration.

Rewards, cashback, and loyalty program tracking.

Peer-to-peer WiFi/Bluetooth data transfer between devices (the app is web-hosted multi-user by design; cross-device access happens through the hosted account login, not direct device transfer).

# **6\. Module Overview**

MoneyMind comprises 11 functional modules and 2 cross-cutting platform components. Each module operates semi-independently while sharing a common data layer, enabling phased delivery without architectural rework.

| **#** | **Module**                    | **Category** | **Phase** |
| ----- | ----------------------------- | ------------ | --------- |
| 1     | Account & Wallet Layer        | Foundation   | Phase 1   |
| ---   | ---                           | ---          | ---       |
| 2     | Transaction Engine            | Core Data    | Phase 1   |
| ---   | ---                           | ---          | ---       |
| 3     | Budget Module                 | Planning     | Phase 1   |
| ---   | ---                           | ---          | ---       |
| 4     | Bills & Subscriptions Tracker | Recurring    | Phase 2   |
| ---   | ---                           | ---          | ---       |
| 5     | Savings & Goals               | Planning     | Phase 2   |
| ---   | ---                           | ---          | ---       |
| 6     | Debt & Loan Manager           | Planning     | Phase 2   |
| ---   | ---                           | ---          | ---       |
| 7     | Tax Planning                  | Optimization | Phase 2   |
| ---   | ---                           | ---          | ---       |
| 8     | Investment Tracker            | Wealth       | Phase 2   |
| ---   | ---                           | ---          | ---       |
| 9     | Net Worth Tracker             | Wealth       | Phase 2   |
| ---   | ---                           | ---          | ---       |
| 10    | Reports & Analytics Dashboard | Intelligence | Phase 2   |
| ---   | ---                           | ---          | ---       |
| 11    | AI Financial Assistant Chat   | Intelligence | Phase 4 (Future) |
| ---   | ---                           | ---          | ---       |
| C1    | Financial Calendar            | Component    | Phase 2   |
| ---   | ---                           | ---          | ---       |
| C2    | Notifications & Alerts Center | Component    | Phase 2   |
| ---   | ---                           | ---          | ---       |
| C3    | Data Export & Backup          | Component    | Phase 1   |
| ---   | ---                           | ---          | ---       |
| C4    | Cross-Device Access           | Component    | Phase 3   |
| ---   | ---                           | ---          | ---       |

# **7\. Monetization Strategy**

MoneyMind is a hosted multi-user web application. A freemium model is planned: free tier for core tracking (accounts, transactions, budgets); premium tier (Phase 2+ modules, reports, export) on a monthly/annual subscription. All infrastructure (hosted PostgreSQL/Supabase, AWS-ready) is covered by the subscription, so users do not run or maintain any local server.

The only additional cost is the user's own Claude API key if they choose to enable AI features in Phase 4 (Future).

# **8\. Risks and Mitigations**

| **Risk**                                      | **Severity** | **Mitigation Strategy**                                                                                                                |
| --------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Data loss (database corruption / backup loss) | High         | PostgreSQL crash recovery / point-in-time backup on hosted Supabase (AWS RDS-ready), automated scheduled backups, per-user export/restore    |
| ---                                           | ---          | ---                                                                                                                                    |
| AI API costs (user's own key)                 | Low          | Merchant mapping cache (70-80% call reduction), batch processing, scheduled jobs over real-time, user controls when AI is enabled      |
| ---                                           | ---          | ---                                                                                                                                    |
| CSV format inconsistency across Indian banks  | Medium       | Flexible parser with column mapping UI, pre-built templates for top 10 Indian banks, community-contributed format profiles             |
| ---                                           | ---          | ---                                                                                                                                    |
| User abandonment due to manual entry friction | High         | CSV import with column mapping, quick-add patterns, Phase 2 AI auto-categorization and bill scanning                                   |
| ---                                           | ---          | ---                                                                                                                                    |
| Investment advice regulatory liability        | High         | All AI output explicitly framed as educational, never advisory. Prominent disclaimers. No specific buy/sell recommendations.           |
| ---                                           | ---          | ---                                                                                                                                    |
| WiFi/Bluetooth data transfer failure          | Medium       | Removed from scope — cross-device access is via hosted account login |
| ---                                           | ---          | ---                                                                                                                                    |
| Scope creep across 11 modules                 | Medium       | Strict phase boundaries. Each phase has defined module scope. No cross-phase feature bleed without explicit reprioritization.          |
| ---                                           | ---          | ---                                                                                                                                    |

# **9\. Success Metrics and KPIs**

| **Category**  | **Metric**                                   | **Target**                  |
| ------------- | -------------------------------------------- | --------------------------- |
| Completeness  | All 11 modules implemented with full CRUD     | Phase 3 completion          |
| ---           | ---                                          | ---                         |
| Completeness  | Per-module CSV/PDF export working             | Phase 2 completion          |
| ---           | ---                                          | ---                         |
| Completeness  | Full data export and import functional        | Phase 2 completion          |
| ---           | ---                                          | ---                         |
| Completeness  | Cross-device access via hosted login working  | Phase 3 completion          |
| ---           | ---                                          | ---                         |
| AI Quality    | Auto-categorization accuracy                 | > 90% after 30 days of use |
| ---           | ---                                          | ---                         |
| AI Quality    | Bill image scan accuracy (item extraction)    | > 85% on clear receipts    |
| ---           | ---                                          | ---                         |
| Data Safety   | Backup/restore flow tested and verified       | Zero data loss on restore  |
| ---           | ---                                          | ---                         |
| Performance   | Dashboard loads < 2 seconds                  | Phase 1                     |
| ---           | ---                                          | ---                         |
| Performance   | Cross-device data load (dashboard) responds    | < 2 seconds on sign-in        |
| ---           | ---                                          | ---                         |

# **10\. Assumptions and Dependencies**

## **10.1 Assumptions**

Users are willing to manually enter transactions or upload CSV statements during Phase 1. CSV import with column mapping reduces the friction of data entry.

Users who want AI features are comfortable providing their own Claude API key. The app works fully without AI, and AI integration is a future optional phase.

Users access MoneyMind from any device through a modern web browser; data is always available via the hosted account login.

The personal finance web-app market has room for a cloud-hosted, multi-user product.

Claude API pricing and performance will remain stable for users who opt-in to AI features.

## **10.2 Dependencies**

PostgreSQL (via Prisma ORM): Hosted database engine on Supabase (AWS RDS-ready). Runs server-side; no embedded binary.

Next.js + React: Web application framework. Runs in the browser; no native executable. Server components / API routes are deployed server-side.

Claude API (Anthropic): Optional AI features depend on user-provided API key.

Papa Parse: Client-side CSV parsing library for import functionality.

jsPDF / csv-writer: Libraries for PDF and CSV export per module.

Hosted account login: cross-device access to the same per-user data from the hosted database; no peer-to-peer transfer APIs required.

Indian Bank CSV Formats: Phase 1 import functionality depends on reverse-engineering common formats from top Indian banks.

**PART 2: PRODUCT REQUIREMENTS DOCUMENT (PRD)**

# **1\. Product Overview**

MoneyMind is a multi-user web personal finance application with 11 modules and 4 components. Built with Next.js (App Router) + PostgreSQL (Supabase/AWS-ready). Requires login, internet, and cloud dependency. An optional AI layer (Phase 4 — Future) can be enabled by the user via their own Claude API key. This PRD details the functional requirements, data architecture, and technical specifications for each component.

# **2\. Technology Stack**

| **Layer**              | **Technology**                        | **Rationale**                                                                                |
| ---------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Web Framework             | Next.js (App Router)                   | Browser-based, responsive, hosted on Supabase/AWS RDS                           |
| ---                    | ---                                   | ---                                                                                          |
| Frontend Framework     | Next.js 14+ (App Router)              | Server components, built-in API routes (deployed server-side), strong ecosystem                       |
| ---                    | ---                                   | ---                                                                                          |
| UI Library             | Tailwind CSS + shadcn/ui              | Rapid UI development, consistent design system, accessible components                        |
| ---                    | ---                                   | ---                                                                                          |
| Database               | PostgreSQL (Supabase, AWS-ready) | Multi-user; `user_id` isolation; audit; optimistic lock (`version`); soft delete (`deleted_at`) |
| ---                    | ---                                   | ---                                                                                          |
| ORM                    | Prisma                                | Type-safe database access, migrations, schema management, excellent PostgreSQL support           |
| ---                    | ---                                   | ---                                                                                          |
| AI Engine (Optional)   | Claude API (Anthropic)                | User-provided API key. Vision for bill scanning, structured JSON for categorization          |
| ---                    | ---                                   | ---                                                                                          |
| Charts & Visualization | Recharts                              | React-native charting, composable, good Next.js compatibility                                |
| ---                    | ---                                   | ---                                                                                          |
| CSV Parsing            | Papa Parse                            | Client-side CSV parsing, streaming for large files, auto-detection                           |
| ---                    | ---                                   | ---                                                                                          |
| Export - PDF           | jsPDF / @react-pdf/renderer           | PDF generation for per-module reports and full data export                                   |
| ---                    | ---                                   | ---                                                                                          |
| Export - CSV           | csv-writer / Papa Parse               | CSV export for per-module data tables                                                        |
| ---                    | ---                                   | ---                                                                                          |
| Cross-Device Access    | Hosted account login                  | Same per-user data from the hosted DB on any device; no peer-to-peer transfer                |
| ---                    | ---                                   | ---                                                                                          |
| State Management       | Zustand or React Context              | Lightweight, minimal boilerplate for client-side state                                       |
| ---                    | ---                                   | ---                                                                                          |
| ---                    | ---                                   | ---                                                                                          |

# **3\. Data Model**

## **3.1 Entity Relationship Overview**

The application uses a PostgreSQL database (hosted on Supabase, AWS RDS-ready). Multi-user isolation is enforced via `user_id` foreign keys on all data tables (`accounts`, `transactions`, `budgets`, `goals`, `debts`, `investments`, `net_worth_snapshots`, `report_templates`, etc.). Every mutable table includes `created_by`, `updated_by`, `deleted_at`, `deleted_by`, `version` (optimistic locking), and audit tracking (`audit_logs`). System/global tables (`categories.system`, `debt_types`, `tax_regime_slabs`) are separated from user-scoped records via `is_system` and scoped unique constraints (`(user_id, name)`). The schema supports concurrent multi-user operations with atomic independence: module-level deletes/updates do not block each other, relying on FK isolation (`ON DELETE CASCADE` for child-only tables, `ON DELETE SET NULL` for audit tracking). Shared expense groups (Phase 2) relax strict user isolation read-only: `transactions` gains a group-scoped SELECT policy gated by active membership (`is_group_member`), while all writes stay owner-only. See `DOCS/data-tables-v2.md` for full table definitions.

### **3.1.1 User Settings** (per-user; replaces the old single-row global `app_settings`)

| **Field**          | **Type**  | **Description**                                               |
| ------------------ | --------- | ------------------------------------------------------------- |
| setting_id         | INTEGER (PK) | Primary key                                                    |
| ---                | ---       | ---                                                           |
| user_id            | INTEGER (FK) | FK → users(user_id) — one row per user                        |
| ---                | ---       | ---                                                           |
| currency           | VARCHAR   | INR by default                                                |
| ---                | ---       | ---                                                           |
| ai_api_key         | VARCHAR   | User's Claude API key (optional, encrypted at rest)           |
| ---                | ---       | ---                                                           |
| ai_enabled         | BOOLEAN   | Whether AI features are enabled                               |
| ---                | ---       | ---                                                           |
| theme              | VARCHAR   | UI theme preference (light / dark / system)                   |
| ---                | ---       | ---                                                           |
| notifications_enabled | BOOLEAN | Notification preferences                                      |
| ---                | ---       | ---                                                           |
| language           | TEXT      | UI language preference (default 'en')                         |
| ---                | ---       | ---                                                           |
| created_at         | TIMESTAMP | Row creation timestamp                                        |
| ---                | ---       | ---                                                           |
| updated_at         | TIMESTAMP | Row update timestamp                                          |

### **3.1.2 Accounts**

| **Field**       | **Type**  | **Description**                                           |
| --------------- | --------- | --------------------------------------------------------- |
| id              | UUID (PK) | Primary key                                               |
| ---             | ---       | ---                                                       |
| user_id         | INTEGER (FK) | Multi-user owner — FK to users(user_id)                  |
| ---            | ---       | ---                                                       |
| name            | VARCHAR   | Account display name (e.g., HDFC Savings)                 |
| ---             | ---       | ---                                                       |
| type            | ENUM      | bank_savings / bank_current / credit_card / wallet / cash |
| ---             | ---       | ---                                                       |
| opening_balance | DECIMAL   | Initial balance at account creation                       |
| ---             | ---       | ---                                                       |
| institution     | VARCHAR   | Bank or wallet name                                       |
| ---             | ---       | ---                                                       |
| is_active       | BOOLEAN   | Soft delete flag                                          |
| ---             | ---       | ---                                                       |

> **Balance is NOT stored.** Accounts balance = `opening_balance + SUM(signed transactions)` computed on read — no drift, no write amplification. (Remove the old stored `balance` column.)

### **3.1.3 Transactions**

| **Field**      | **Type**  | **Description**                       |
| -------------- | --------- | ------------------------------------- |
| id             | UUID (PK) | Primary key                           |
| ---            | ---       | ---                                   |
| user_id        | INTEGER (FK) | Multi-user owner — FK to users(user_id) |
| ---            | ---       | ---                                   |
| account_id     | UUID (FK) | References accounts.id                |
| ---            | ---       | ---                                   |
| type           | ENUM      | income / expense / transfer           |
| ---            | ---       | ---                                   |
| amount         | DECIMAL   | Transaction amount (always positive)  |
| ---            | ---       | ---                                   |
| description    | VARCHAR   | Raw description or merchant name      |
| ---            | ---       | ---                                   |
| merchant_clean | VARCHAR   | AI-cleaned merchant name              |
| ---            | ---       | ---                                   |
| category_id    | UUID (FK) | References categories.id              |
| ---            | ---       | ---                                   |
| date           | DATE      | Transaction date                      |
| ---            | ---       | ---                                   |
| notes          | TEXT      | Optional user notes                   |
| ---            | ---       | ---                                   |
| is_recurring   | BOOLEAN   | Flagged by AI pattern detection       |
| ---            | ---       | ---                                   |
| source         | ENUM      | manual / csv_import / quick_add / bank_sync |
| ---            | ---       | ---                                   |
| needs_review   | BOOLEAN   | True if AI confidence < threshold     |
| ---            | ---       | ---                                   |
| created_at     | TIMESTAMP | Record creation timestamp             |
| ---            | ---       | ---                                   |
| updated_at     | TIMESTAMP | Record update timestamp               |

> Tags are stored via the `tags_transactions` join table (1NF atomic) — NOT a `TEXT[]` array on transactions. `ai_confidence` is not persisted as a column; classification confidence is evaluated app-side.

### **3.1.4 Categories**

| **Field**  | **Type**  | **Description**                                     |
| ---------- | --------- | --------------------------------------------------- |
| id         | UUID (PK) | Primary key                                         |
| ---        | ---       | ---                                                 |
| user_id    | INTEGER   | FK users; NULL for system categories                |
| ---        | ---       | ---                                                 |
| parent_id  | UUID (FK) | Self-referencing for sub-categories (2-level tree)  |
| ---        | ---       | ---                                                 |
| name       | VARCHAR   | Category name (e.g., Food & Dining)                 |
| ---        | ---       | ---                                                 |
| icon       | VARCHAR   | Icon identifier for UI display                      |
| ---        | ---       | ---                                                 |
| color      | VARCHAR   | Hex color code for charts                           |
| ---        | ---       | ---                                                 |
| is_system  | BOOLEAN   | True for default categories                         |
| ---        | ---       | ---                                                 |
| sort_order | INTEGER   | Display order                                       |
| ---        | ---       | ---                                                 |
| version    | INTEGER   | Optimistic lock                                     |
| ---        | ---       | ---                                                 |
| created_at | TIMESTAMP | Record creation timestamp                           |
| ---        | ---       | ---                                                 |
| updated_at | TIMESTAMP | Record update timestamp                             |

> System rows (`user_id IS NULL`, `is_system = 1`) are seeded once and immutable at runtime; user rows (`user_id IS NOT NULL`, `is_system = 0`) are scoped per user with `UNIQUE (user_id, name)`. Transactions always resolve to leaf categories; parent-category totals are aggregates over their leaf descendants (see `DOCS/module/2. Transaction Engine Module.md` — categories tree rules).

### **3.1.5 Merchant Mappings (AI Cache)**

| **Field**      | **Type**  | **Description**                            |
| -------------- | --------- | ------------------------------------------ |
| id             | UUID (PK) | Primary key                                |
| ---            | ---       | ---                                        |
| merchant_raw   | VARCHAR   | Raw merchant string from transaction       |
| ---            | ---       | ---                                        |
| merchant_clean | VARCHAR   | AI-cleaned merchant name                   |
| ---            | ---       | ---                                        |
| category_id    | UUID (FK) | Mapped category                            |
| ---            | ---       | ---                                        |
| use_count      | INTEGER   | Number of times this mapping has been used |
| ---            | ---       | ---                                        |
| last_used_at   | TIMESTAMP | Last time this mapping was applied         |
| ---            | ---       | ---                                        |

### **3.1.6 Budgets**

| **Field**   | **Type**  | **Description**                           |
| ----------- | --------- | ----------------------------------------- |
| id          | UUID (PK) | Primary key                               |
| ---         | ---       | ---                                       |
| category_id | UUID (FK) | Budget category (NULL for overall budget) |
| ---         | ---       | ---                                       |
| amount      | DECIMAL   | Budget amount for the period              |
| ---         | ---       | ---                                       |
| period      | ENUM      | monthly / weekly                          |
| ---         | ---       | ---                                       |
| alert_50    | BOOLEAN   | Alert at 50% utilization                  |
| ---         | ---       | ---                                       |
| alert_80    | BOOLEAN   | Alert at 80% utilization                  |
| ---         | ---       | ---                                       |
| alert_100   | BOOLEAN   | Alert at 100% utilization                 |
| ---         | ---       | ---                                       |
| is_active   | BOOLEAN   | Active flag                               |
| ---         | ---       | ---                                       |
| created_at  | TIMESTAMP | Creation date                             |
| ---         | ---       | ---                                       |

### **3.1.7 Bills**

| **Field**        | **Type**  | **Description**                                     |
| ---------------- | --------- | --------------------------------------------------- |
| id               | UUID (PK) | Primary key                                         |
| ---              | ---       | ---                                                 |
| name             | VARCHAR   | Bill name (e.g., Rent, Electricity)                 |
| ---              | ---       | ---                                                 |
| amount           | DECIMAL   | Bill amount (can be approximate for variable bills) |
| ---              | ---       | ---                                                 |
| due_day          | INTEGER   | Day of month when due (1-31)                        |
| ---              | ---       | ---                                                 |
| frequency        | ENUM      | monthly / quarterly / annual / one_time             |
| ---              | ---       | ---                                                 |
| account_id       | UUID (FK) | Payment account                                     |
| ---              | ---       | ---                                                 |
| is_auto_detected | BOOLEAN   | Detected by AI vs manually added                    |
| ---              | ---       | ---                                                 |
| last_paid_date   | DATE      | Last payment date                                   |
| ---              | ---       | ---                                                 |
| is_active        | BOOLEAN   | Active flag                                         |
| ---              | ---       | ---                                                 |

### **3.1.8 Subscriptions**

| **Field**         | **Type**  | **Description**                       |
| ----------------- | --------- | ------------------------------------- |
| id                | UUID (PK) | Primary key                           |
| ---               | ---       | ---                                   |
| service_name      | VARCHAR   | Service name (e.g., Netflix, Spotify) |
| ---               | ---       | ---                                   |
| amount            | DECIMAL   | Recurring charge amount               |
| ---               | ---       | ---                                   |
| frequency         | ENUM      | monthly / quarterly / annual          |
| ---               | ---       | ---                                   |
| next_renewal_date | DATE      | Next expected charge date             |
| ---               | ---       | ---                                   |
| category_id       | UUID (FK) | Category classification               |
| ---               | ---       | ---                                   |
| is_auto_detected  | BOOLEAN   | AI detected vs manually added         |
| ---               | ---       | ---                                   |
| status            | ENUM      | active / paused / cancelled           |
| ---               | ---       | ---                                   |
| ai_usage_score    | DECIMAL   | AI assessment of usage value (0-1)    |
| ---               | ---       | ---                                   |

### **3.1.9 Goals**

| **Field**            | **Type**  | **Description**                  |
| -------------------- | --------- | -------------------------------- |
| id                   | UUID (PK) | Primary key                      |
| ---                  | ---       | ---                              |
| name                 | VARCHAR   | Goal name (e.g., Emergency Fund) |
| ---                  | ---       | ---                              |
| target_amount        | DECIMAL   | Target savings amount            |
| ---                  | ---       | ---                              |
| current_amount       | DECIMAL   | Amount saved so far              |
| ---                  | ---       | ---                              |
| target_date          | DATE      | Target completion date           |
| ---                  | ---       | ---                              |
| monthly_contribution | DECIMAL   | Planned monthly contribution     |
| ---                  | ---       | ---                              |
| priority             | ENUM      | high / medium / low              |
| ---                  | ---       | ---                              |
| status               | ENUM      | active / completed / paused      |
| ---                  | ---       | ---                              |
| created_at           | TIMESTAMP | Creation date                    |
| ---                  | ---       | ---                              |

### **3.1.10 Debts**

| **Field**             | **Type**  | **Description**                                                             |
| --------------------- | --------- | --------------------------------------------------------------------------- |
| id                    | UUID (PK) | Primary key                                                                 |
| ---                   | ---       | ---                                                                         |
| name                  | VARCHAR   | Loan name (e.g., Home Loan - SBI)                                           |
| ---                   | ---       | ---                                                                         |
| type                  | ENUM      | home_loan / car_loan / personal_loan / education_loan / credit_card / other |
| ---                   | ---       | ---                                                                         |
| principal_original    | DECIMAL   | Original loan amount                                                        |
| ---                   | ---       | ---                                                                         |
| principal_outstanding | DECIMAL   | Current outstanding principal                                               |
| ---                   | ---       | ---                                                                         |
| interest_rate         | DECIMAL   | Annual interest rate (percentage)                                           |
| ---                   | ---       | ---                                                                         |
| emi_amount            | DECIMAL   | Monthly EMI amount                                                          |
| ---                   | ---       | ---                                                                         |
| tenure_months         | INTEGER   | Total loan tenure in months                                                 |
| ---                   | ---       | ---                                                                         |
| months_remaining      | INTEGER   | Remaining months                                                            |
| ---                   | ---       | ---                                                                         |
| start_date            | DATE      | Loan start date                                                             |
| ---                   | ---       | ---                                                                         |
| end_date              | DATE      | Expected loan end date                                                      |
| ---                   | ---       | ---                                                                         |
| total_interest_paid   | DECIMAL   | Interest paid to date                                                       |
| ---                   | ---       | ---                                                                         |
| account_id            | UUID (FK) | EMI debit account                                                           |
| ---                   | ---       | ---                                                                         |
| is_active             | BOOLEAN   | Active flag                                                                 |
| ---                   | ---       | ---                                                                         |

### **3.1.11 Tax Records**

| **Field**       | **Type**  | **Description**                             |
| --------------- | --------- | ------------------------------------------- |
| id              | UUID (PK) | Primary key                                 |
| ---             | ---       | ---                                         |
| financial_year  | VARCHAR   | FY (e.g., 2026-27)                          |
| ---             | ---       | ---                                         |
| section         | VARCHAR   | Tax section (80C, 80D, HRA, etc.)           |
| ---             | ---       | ---                                         |
| investment_name | VARCHAR   | Investment name (e.g., PPF, ELSS Fund Name) |
| ---             | ---       | ---                                         |
| amount          | DECIMAL   | Amount invested / claimed                   |
| ---             | ---       | ---                                         |
| max_limit       | DECIMAL   | Section limit (e.g., 150000 for 80C)        |
| ---             | ---       | ---                                         |
| proof_status    | ENUM      | pending / submitted / verified              |
| ---             | ---       | ---                                         |
| date            | DATE      | Investment / payment date                   |
| ---             | ---       | ---                                         |

### **3.1.12 Investments**

| **Field**          | **Type**  | **Description**                                              |
| ------------------ | --------- | ------------------------------------------------------------ |
| id                 | UUID (PK) | Primary key                                                  |
| ---                | ---       | ---                                                          |
| type               | ENUM      | mutual_fund / stock / fd / ppf / nps / gold / crypto / other |
| ---                | ---       | ---                                                          |
| name               | VARCHAR   | Investment name (e.g., Axis Bluechip Fund)                   |
| ---                | ---       | ---                                                          |
| units              | DECIMAL   | Number of units held                                         |
| ---                | ---       | ---                                                          |
| buy_price          | DECIMAL   | Average buy price per unit                                   |
| ---                | ---       | ---                                                          |
| current_price      | DECIMAL   | Current price per unit                                       |
| ---                | ---       | ---                                                          |
| current_value      | DECIMAL   | Computed: units x current_price                              |
| ---                | ---       | ---                                                          |
| invested_value     | DECIMAL   | Computed: units x buy_price                                  |
| ---                | ---       | ---                                                          |
| returns_absolute   | DECIMAL   | current_value - invested_value                               |
| ---                | ---       | ---                                                          |
| returns_percentage | DECIMAL   | Percentage return                                            |
| ---                | ---       | ---                                                          |
| purchase_date      | DATE      | First purchase date                                          |
| ---                | ---       | ---                                                          |
| maturity_date      | DATE      | For FDs and similar instruments                              |
| ---                | ---       | ---                                                          |
| is_active          | BOOLEAN   | Active flag                                                  |
| ---                | ---       | ---                                                          |

### **3.1.13 AI Insights**

| **Field**    | **Type**  | **Description**                               |
| ------------ | --------- | --------------------------------------------- |
| id           | UUID (PK) | Primary key                                   |
| ---          | ---       | ---                                           |
| module       | VARCHAR   | Source module (budget, bills, goals, etc.)    |
| ---          | ---       | ---                                           |
| type         | ENUM      | warning / suggestion / info / alert / summary |
| ---          | ---       | ---                                           |
| priority     | ENUM      | high / medium / low                           |
| ---          | ---       | ---                                           |
| title        | VARCHAR   | Short insight title                           |
| ---          | ---       | ---                                           |
| message      | TEXT      | Full insight message                          |
| ---          | ---       | ---                                           |
| data_payload | JSONB     | Structured data for UI rendering              |
| ---          | ---       | ---                                           |
| is_read      | BOOLEAN   | Read status for notification feed             |
| ---          | ---       | ---                                           |
| is_dismissed | BOOLEAN   | User dismissed this insight                   |
| ---          | ---       | ---                                           |
| expires_at   | TIMESTAMP | Expiry for time-sensitive insights            |
| ---          | ---       | ---                                           |
| created_at   | TIMESTAMP | Creation timestamp                            |
| ---          | ---       | ---                                           |

### **3.1.14 Chat Messages**

| **Field**        | **Type**  | **Description**                              |
| ---------------- | --------- | -------------------------------------------- |
| id               | UUID (PK) | Primary key                                  |
| ---              | ---       | ---                                          |
| role             | ENUM      | user / assistant                             |
| ---              | ---       | ---                                          |
| content          | TEXT      | Message content                              |
| ---              | ---       | ---                                          |
| context_snapshot | JSONB     | Financial data snapshot sent with this query |
| ---              | ---       | ---                                          |
| created_at       | TIMESTAMP | Message timestamp                            |
| ---              | ---       | ---                                          |

# **4\. Detailed Module Requirements**

## **4.1 Module 1: Account & Wallet Layer**

Purpose: Foundation layer. All transactions, bills, and debt payments reference an account. This module manages the creation, tracking, and health monitoring of all financial accounts.

### **Functional Requirements**

FR-1.1: Users can create accounts with name, type (savings, current, credit card, wallet, cash), institution name, and opening balance.

FR-1.2: Account balance updates automatically with each linked transaction (debit for expenses, credit for income).

FR-1.3: Users can view all accounts in a single dashboard with current balances and a total balance aggregation.

FR-1.4: Users can edit account details and deactivate (soft delete) accounts.

FR-1.5: Credit card accounts display utilization percentage against the credit limit.

### **AI Requirements**

AI-1.1: Account health monitor runs daily and on each transaction. Flags: low balance warnings, idle funds detection, high credit utilization (above 30%), and unusual balance drops.

AI-1.2: Cross-account optimization suggestions (e.g., idle funds in current account that could be moved to savings or goal contribution).

## **4.2 Module 2: Transaction Engine**

Purpose: Core data ingestion and organization layer. Handles all transaction entry, categorization, search, and pattern detection.

### **Functional Requirements**

FR-2.1: Manual transaction entry with fields: amount, description, date (default today), account, type (income/expense/transfer).

FR-2.2: Quick-add mode showing recently used merchants for one-tap entry with amount-only input.

FR-2.3: CSV import supporting common Indian bank statement formats (SBI, HDFC, ICICI, Kotak, Axis, and UPI export formats).

FR-2.4: Column mapping UI for unrecognized CSV formats, allowing users to map columns to transaction fields.

FR-2.5: Transaction list view with search, filter by category/account/date/type/amount range, and sort options.

FR-2.6: Transaction editing and deletion with balance recalculation on the linked account.

FR-2.7: Duplicate detection on CSV import with visual review interface for suspected duplicates.

### **AI Requirements**

AI-2.1: Real-time auto-categorization via Claude API. On each new transaction, send the description to the API and receive a category assignment with confidence score. If confidence < 0.7, flag for user review.

AI-2.2: Merchant mapping cache. After first categorization, store the merchant-to-category mapping in the Merchant Mappings table. All subsequent transactions from the same merchant use the cached mapping without an API call.

AI-2.3: User corrections update the merchant mapping, improving accuracy over time (implicit learning loop).

AI-2.4: Bulk categorization for CSV imports. Batch 20-30 transactions per API call for efficiency.

AI-2.5: Anomaly detection post-import. Flag transactions where the amount exceeds 3x the user's average for that merchant.

## **4.3 Module 3: Budget Module**

Purpose: Financial planning and control. Users set spending limits per category and track actual spending against budgets in real-time.

### **Functional Requirements**

FR-3.1: Create monthly budgets per category with custom amounts. Support an overall monthly budget as well.

FR-3.2: Real-time budget utilization display showing spent amount, remaining amount, and percentage used per category.

FR-3.3: Visual progress bars with color coding: green (0-50%), yellow (50-80%), orange (80-100%), red (100%+).

FR-3.4: Configurable alert thresholds at 50%, 80%, and 100% utilization.

FR-3.5: Month-over-month budget comparison view.

### **AI Requirements**

AI-3.1: Smart budget suggestions when creating a new budget. Analyzes last 3 months of spending in the selected category and suggests a realistic amount with reasoning.

AI-3.2: Mid-month overspend prediction. On the 10th, 15th, and 20th, calculates spending velocity and predicts end-of-month total. Generates warning if overspend is likely, with recommended daily spending limit for remaining days.

AI-3.3: End-of-month budget review. Analyzes all budget performance and suggests adjusted amounts for the next month based on actual patterns.

## **4.4 Module 4: Bills & Subscriptions Tracker**

Purpose: Tracks recurring financial obligations -- both fixed bills (rent, EMIs, utilities) and subscriptions (streaming, SaaS, gym memberships).

### **Functional Requirements**

FR-4.1: Manual bill creation with name, amount, due day, frequency, and linked account.

FR-4.2: Bill calendar showing upcoming due dates for the next 30 days.

FR-4.3: Bill payment status tracking (upcoming / due_soon / overdue / paid / skipped) per period.

FR-4.4: Subscription list view showing all active subscriptions with total monthly burn calculation.

FR-4.5: Manual subscription creation with service name, amount, frequency, and next renewal date.

### **AI Requirements**

AI-4.1: Recurring pattern detection. Weekly scheduled job analyzes the last 90 days of transactions to identify recurring charges. Surfaces detected subscriptions and bills to the user for confirmation.

AI-4.2: Smart bill reminders (3 days before due date) that include cash flow impact analysis: what the account balance will be after the payment, and whether upcoming bills will cause a shortfall.

AI-4.3: Monthly subscription audit. Analyzes all subscriptions for overlapping services, price changes, and potentially unused subscriptions (based on transaction frequency). Generates a keep/review/cancel recommendation for each.

## **4.5 Module 5: Savings & Goals**

Purpose: Target-based savings tracking with AI-powered feasibility analysis and behavioral coaching.

### **Functional Requirements**

FR-5.1: Create named goals with target amount, target date, and priority level.

FR-5.2: Manual contribution logging (linked to a transaction or standalone).

FR-5.3: Progress visualization showing current amount vs target with percentage and timeline.

FR-5.4: Goal dashboard showing all active goals with aggregate progress.

### **AI Requirements**

AI-5.1: Feasibility assessment at goal creation. Analyzes user income, expenses, existing goal commitments, and disposable income to determine if the goal is achievable within the target timeframe. Returns required monthly contribution and feasibility score.

AI-5.2: Weekly saving opportunity scan. Compares current month spending against historical averages per category. Identifies specific areas where spending reduction could fund goal contributions. Links savings amounts to specific goals.

AI-5.3: Goal trajectory alerts. Notifies users when they fall behind schedule and recalculates required contributions to get back on track.

## **4.6 Module 6: Debt & Loan Manager**

Purpose: Comprehensive debt tracking with AI-powered payoff optimization. Helps users understand, manage, and strategically eliminate debt.

### **Functional Requirements**

FR-6.1: Add debts with loan name, type, original principal, outstanding principal, interest rate, EMI amount, tenure, and start date.

FR-6.2: Debt dashboard showing total debt outstanding, total monthly EMI burden, and projected debt-free date.

FR-6.3: Per-loan amortization view showing principal vs interest breakdown per EMI payment.

FR-6.4: Prepayment simulator allowing users to model the impact of extra payments on tenure and total interest.

FR-6.5: Debt-to-income ratio calculation and display.

### **AI Requirements**

AI-6.1: Optimal payoff strategy analysis. Compares avalanche method (highest interest first) vs snowball method (smallest balance first) and recommends the approach that saves the most interest given the user's specific debt portfolio.

AI-6.2: Prepayment impact projection. When a user has surplus cash, calculates the optimal debt to prepay for maximum interest savings.

AI-6.3: Debt health alerts. Flags concerning patterns: debt-to-income ratio above 40%, increasing outstanding balances, or missed EMI payments.

## **4.7 Module 7: Tax Planning**

Purpose: Indian tax optimization assistant. Tracks tax-saving investments, calculates liability under both regimes, and generates actionable tax-saving plans.

### **Functional Requirements**

FR-7.1: Track investments under Section 80C (PPF, ELSS, LIC, EPF, NSC, Home Loan Principal), 80D (Health Insurance), HRA, and other deduction sections.

FR-7.2: Section utilization dashboard showing amount invested vs section limit (e.g., INR 82,000 / 1,50,000 for 80C).

FR-7.3: Old regime vs new regime tax calculator based on user's salary structure and declared deductions.

FR-7.4: Document checklist for ITR filing with status tracking (pending/collected/submitted).

### **AI Requirements**

AI-7.1: Personalized tax-saving plan at the start of the financial year. Analyzes salary structure, existing investments, and section limits to recommend specific investment amounts per section to minimize tax liability.

AI-7.2: Regime recommendation. Compares old vs new tax regime for the user's specific salary and deductions and recommends the more beneficial option with clear INR savings comparison.

AI-7.3: Year-end tax summary for CA/ITR filing. Aggregates all tax-relevant data into a structured summary document.

## **4.8 Module 8: Investment Tracker**

Purpose: Portfolio-level tracking of all investment instruments with performance analytics.

### **Functional Requirements**

FR-8.1: Add investment holdings with type, name, units, buy price, and current value (manual entry for MVP).

FR-8.2: Portfolio dashboard showing total invested value, current value, absolute returns, and percentage returns.

FR-8.3: Asset allocation breakdown chart (equity, debt, gold, cash equivalents, etc.).

FR-8.4: Individual investment detail view with purchase history and return calculation.

FR-8.5: SIP tracker for systematic investment plans with next installment dates.

### **AI Requirements**

AI-8.1: Portfolio health check. Educational analysis of asset allocation, diversification level, and risk profile. Explicitly non-advisory -- observations only, never specific buy/sell recommendations.

AI-8.2: Returns narrative. Plain-English summary of portfolio performance with comparison to common benchmarks (FD rates, inflation) for context.

AI-8.3: Maturity alerts. Notify users when FDs, bonds, or other fixed-term instruments are approaching maturity with reinvestment reminder.

## **4.9 Module 9: Net Worth Tracker**

Purpose: Single view of total financial position -- all assets minus all liabilities, tracked over time.

### **Functional Requirements**

FR-9.1: Automatic net worth calculation aggregating: bank balances + investment values + goal savings + manually added assets (property, gold, receivables) minus all outstanding debt.

FR-9.2: Net worth trend line chart showing monthly progression.

FR-9.3: Asset and liability breakdown pie charts.

FR-9.4: Manual asset entry for non-tracked assets (property value, vehicle, physical gold, loaned money).

### **AI Requirements**

AI-9.1: Monthly net worth analysis. Decomposes net worth change into contributing factors: income saved, investment growth, debt reduction, asset appreciation. Identifies the biggest driver.

AI-9.2: Milestone projection. Based on current growth trajectory, predicts when the user will hit round-number milestones (e.g., INR 10L, 25L, 50L net worth).

## **4.10 Module 10: Reports & Analytics Dashboard**

Purpose: Comprehensive visualization and narrative layer across all modules. Combines interactive charts with AI-generated plain-English analysis.

### **Functional Requirements**

FR-10.1: Monthly income vs expense bar chart (cash flow view).

FR-10.2: Spending breakdown by category (donut chart and horizontal bar chart).

FR-10.3: Spending trend line chart over 3/6/12 month periods per category.

FR-10.4: Budget vs actual comparison bar chart for the current month.

FR-10.5: Daily spending calendar heatmap.

FR-10.6: Net worth over time line chart.

FR-10.7: Debt payoff progress chart.

FR-10.8: Custom date range filtering across all reports.

FR-10.9: Export reports as PDF.

### **AI Requirements**

AI-10.1: Weekly financial summary (scheduled every Sunday). Covers total income/expenses, notable spending, budget status, upcoming bills, goal progress, and one actionable tip. Stored in AI Insights table and surfaced via Notifications.

AI-10.2: Monthly financial report narrative (scheduled 1st of each month). Deeper analysis with month-over-month comparisons, year-to-date trends, and goal trajectory assessment.

AI-10.3: On-demand 'Explain This' feature on any chart. User clicks a button and the AI generates a plain-English explanation of the visible data pattern.

## **4.11 Module 11: AI Financial Assistant Chat**

Purpose: Natural language conversational interface for querying personal financial data. The primary differentiator of the platform.

### **Functional Requirements**

FR-11.1: Chat interface within the app where users type natural language questions about their finances.

FR-11.2: Conversation history persisted per user with the ability to start new conversations.

FR-11.3: Pre-built prompt suggestions for common queries (How much did I spend this month? Am I on track for my goal? Can I afford X?).

FR-11.4: Rich response formatting with inline numbers, comparisons, and mini-charts where applicable.

### **AI Requirements**

AI-11.1: Context assembly engine. Before each API call, assemble the relevant financial data snapshot based on the query type. Inject only the necessary data to minimize token usage.

AI-11.2: Query type detection and data routing. Common query types and their required data context:

| **Query Type**      | **Example**                         | **Data Injected**                                                         |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| Spending query      | How much did I spend on food?       | Current month transactions filtered to queried category                   |
| ---                 | ---                                 | ---                                                                       |
| Affordability check | Can I afford a INR 25K phone?       | Account balances, upcoming bills for 30 days, active EMIs, income average |
| ---                 | ---                                 | ---                                                                       |
| Goal progress       | Am I on track for my vacation fund? | Goal details with progress, monthly contribution rate, time remaining     |
| ---                 | ---                                 | ---                                                                       |
| Comparison          | Compare this month vs last month    | Both months transaction summaries by category                             |
| ---                 | ---                                 | ---                                                                       |
| Recommendation      | Where can I cut spending?           | 3 months spending data, subscription list, category averages              |
| ---                 | ---                                 | ---                                                                       |
| Forecast            | Will I have enough for rent?        | Account balance, expected income dates, upcoming bills, spending velocity |
| ---                 | ---                                 | ---                                                                       |

AI-11.3: System prompt includes explicit guardrails: never give specific investment advice, never share data across users, always be encouraging but honest, format currency in INR.

AI-11.4: Proactive follow-up suggestions after each response (e.g., after answering a spending query, suggest setting a budget for that category).

## **4.12 Component C1: Financial Calendar**

Purpose: Unified timeline view of all scheduled financial events. Lives as a dashboard widget, not a standalone module. Pulls data from Bills, Subscriptions, Goals, Debts, Investments, and Tax Records.

### **Functional Requirements**

FR-C1.1: Monthly calendar view showing all financial events on their respective dates.

FR-C1.2: Event types displayed with distinct visual indicators: salary credit (green), bill due (red), subscription renewal (orange), EMI deduction (purple), SIP date (blue), goal milestone (gold), tax deadline (dark red).

FR-C1.3: Day detail view showing all events for a selected date with amounts, accounts, and status.

FR-C1.4: Upcoming events list view showing the next 7 and 30 days of financial events in chronological order.

FR-C1.5: Daily cash flow projection on the calendar showing predicted account balance after all scheduled events for that day.

### **AI Requirements**

AI-C1.1: Cash flow stress detection. Analyzes the calendar for clusters of outgoing payments that may cause cash flow shortfalls. Generates warnings like: 'Between July 28-31, you have INR 45,000 in outgoing payments (rent + EMI + credit card). Your projected balance after these payments will be INR 3,200. Consider adjusting payment dates or setting aside funds.'

AI-C1.2: Smart date conflict detection. Identifies when multiple large payments fall on the same date and suggests spreading them across the month if possible.

## **4.13 Component C2: Notifications & Alerts Center**

Purpose: Centralized feed for all AI insights, alerts, reminders, and system notifications. Lives in the app shell as a persistent notification bell icon, not a standalone module. Reads from the AI Insights table.

### **Functional Requirements**

FR-C2.1: Notification bell icon in the app header with unread count badge.

FR-C2.2: Dropdown notification feed showing recent alerts sorted by recency, with read/unread status.

FR-C2.3: Full notification center page with filtering by type (warning, suggestion, info, alert, summary) and module source.

FR-C2.4: Notification actions: mark as read, dismiss, take action (deep link to relevant module/screen).

FR-C2.5: Notification preferences allowing users to enable/disable specific notification types.

FR-C2.6: Email digest option for users who want daily or weekly notification summaries via email.

### **Notification Types**

| **Source Module** | **Notification Type**        | **Trigger**                                      |
| ----------------- | ---------------------------- | ------------------------------------------------ |
| Account           | Low balance warning          | Balance drops below user-defined threshold       |
| ---               | ---                          | ---                                              |
| Transaction       | Unusual spending alert       | Transaction amount > 3x category average         |
| ---               | ---                          | ---                                              |
| Transaction       | Needs review flag            | AI categorization confidence < 0.7               |
| ---               | ---                          | ---                                              |
| Budget            | Threshold alert (50/80/100%) | Budget utilization crosses threshold             |
| ---               | ---                          | ---                                              |
| Budget            | Overspend prediction         | AI predicts end-of-month overrun (scheduled)     |
| ---               | ---                          | ---                                              |
| Bills             | Due date reminder            | 3 days before due date                           |
| ---               | ---                          | ---                                              |
| Bills             | Cash flow impact warning     | Bill payment would drop balance below safe level |
| ---               | ---                          | ---                                              |
| Subscriptions     | Renewal reminder             | 7 days before subscription renewal               |
| ---               | ---                          | ---                                              |
| Subscriptions     | Audit results                | Monthly subscription audit completes             |
| ---               | ---                          | ---                                              |
| Goals             | Behind schedule alert        | Goal trajectory falls below plan                 |
| ---               | ---                          | ---                                              |
| Goals             | Saving opportunity           | AI detects reducible spending (weekly)           |
| ---               | ---                          | ---                                              |
| Debt              | Prepayment opportunity       | Surplus cash identified for debt reduction       |
| ---               | ---                          | ---                                              |
| Tax               | Section limit approaching    | 80C/80D investment nearing limit                 |
| ---               | ---                          | ---                                              |
| Tax               | Filing deadline reminder     | ITR filing deadline approaching                  |
| ---               | ---                          | ---                                              |
| Investment        | Maturity alert               | FD or bond approaching maturity date             |
| ---               | ---                          | ---                                              |
| Net Worth         | Milestone reached            | Net worth crosses a milestone number             |
| ---               | ---                          | ---                                              |
| Reports           | Weekly summary available     | Sunday scheduled job completes                   |
| ---               | ---                          | ---                                              |
| Reports           | Monthly report available     | 1st of month scheduled job completes             |
| ---               | ---                          | ---                                              |

## **4.14 Component C3: Data Export & Backup**

Purpose: Provide per-module and full data export functionality in CSV and PDF formats, plus full database backup and restore.

### Functional Requirements

FR-C3.1: Per-module export to CSV. Each module (Transactions, Budgets, Bills, Subscriptions, Goals, Debt, Tax, Investments) has a dedicated export button that downloads data as a CSV file.

FR-C3.2: Per-module export to PDF. Each module can export a formatted report as PDF with totals, charts, and summaries.

FR-C3.3: Full data export. Export the user's data from the hosted PostgreSQL database as a portable backup (SQL dump / JSON via the service, plus metadata).

FR-C3.4: Full data import/restore. User can import a previously exported backup file to restore their data.

FR-C3.5: Export progress indicator with file size and estimated completion time for large datasets.

FR-C3.6: File naming convention with date stamps (e.g., MoneyMind_Transactions_2026-08-01.csv).

## **4.15 Component C4: Cross-Device Access**

Purpose: Allow users to see and use their financial data on any device by signing into their hosted account. There is no peer-to-peer device transfer — data lives in the hosted PostgreSQL instance.

### Functional Requirements

FR-C4.1: Sign-in access. The user logs in with email/password on any supported browser; the app loads the same per-user data served from the hosted database.

FR-C4.2: Consistency. Updates made on one device are available on other devices on the next request/reload (single source of truth in the DB).

FR-C4.3: Data integrity. Session/auth tokens are validated on every request; Row-Level Security ensures only the owning user can read their rows.

FR-C4.4: Session management. Users can view/revoke active sessions; tokens rotate on login.

FR-C4.5: Connection requirements. An internet connection is required; API responses include progress indicators for large data loads.

FR-C4.6: Conflict handling. Concurrent edits are protected by optimistic locking (`version`) and atomic DB transactions, so the "last successful write" with version check wins deterministically.

# **5\. AI Implementation Architecture** (Phase 4 — Future)

**Note:** All AI features are optional and planned for Phase 4 (future). The application is fully functional without AI. Users who want AI features provide their own Claude API key through their user settings (`user_settings.ai_api_key`, encrypted at rest). AI features are disabled by default.

## **5.1 AI Call Types**

All AI features use the Claude API with task-specific system prompts and structured JSON output. Types of AI calls:

| **Call Type**      | **Latency Target** | **Use Cases**                                                                                             | **Claude Model** |
| ------------------ | ------------------ | --------------------------------------------------------------------------------------------------------- | ---------------- |
| Real-time          | < 2 seconds        | Transaction categorization, chat responses, quick-add suggestions, single bill scan                       | Claude Sonnet    |
| ---                | ---                | ---                                                                                                       | ---              |
| Background (async) | < 30 seconds       | CSV bulk categorization, CSV intelligent import (column detection, data cleaning), duplicate detection, anomaly scanning | Claude Sonnet    |
| ---                | ---                | ---                                                                                                       | ---              |
| Scheduled (cron)   | Non-interactive    | Weekly summaries, budget forecasts, subscription audits, goal analysis, bill reminders, pattern detection | Claude Sonnet    |
| ---                | ---                | ---                                                                                                       | ---              |

## **5.2 AI Cost Management**

Strategy 1 -- Merchant Mapping Cache: Once a merchant is categorized, the mapping is stored in the database. Future transactions from the same merchant bypass the API entirely. Expected to eliminate 70-80% of categorization API calls after the first month of usage per user.

Strategy 2 -- Batch Processing: Bulk operations (CSV import) group 20-30 transactions per API call instead of making individual calls. Reduces API calls by 95% for bulk operations.

Strategy 3 -- Scheduled Over Real-Time: Insights that do not require immediate response (weekly summaries, subscription audits, budget forecasts) run as scheduled cron jobs. Results are stored in the AI Insights table and served from the database.

Strategy 4 -- Bill Image Optimization: For bill scanning, images are compressed and resized before API submission to minimize token costs. Users are advised on image quality best practices.

Strategy 5 -- Context Minimization: For chat queries, a context assembly engine selects only the relevant data slice (not the full transaction history) based on query type. This minimizes token usage and cost per chat interaction.

## **5.3 AI Prompt Architecture**

Every AI feature uses a structured prompt pattern: a system prompt defining the role and output format, followed by the relevant financial data injected as context, followed by the specific task instruction. All responses are requested in JSON format for reliable parsing.

System prompts include explicit guardrails: never provide specific investment advice, never recommend specific financial products, format all currency as INR, be encouraging but honest, and include disclaimers on investment-related observations.

### Bill Scanning Prompt Structure

For bill/receipt image scanning, the system sends:
1. The user-uploaded image (compressed JPEG, max 1024px width)
2. A system prompt requesting: line items with name, quantity, unit price, line total; merchant name; transaction date; subtotal; tax; grand total; payment method if visible
3. Output format: structured JSON with confidence scores per extracted field
4. Post-processing: matched against existing merchant mappings, user confirmation required before saving

# **6\. Security Requirements**

SR-1: The application stores all data in a PostgreSQL database hosted on Supabase (with future AWS RDS readiness). Data never leaves the hosted database except for per-user export or authorized AI API calls.

SR-2: Authentication required: users login with email and secure password. Multi-user isolation enforced via user_id foreign keys **and Row-Level Security (RLS)** in PostgreSQL.

SR-3: Sensitive fields (account numbers if stored, salary figures) are encrypted at rest; passwords and AI keys are hashed (Argon2/bcrypt) or encrypted respectively.

SR-4: AI API calls never include personally identifiable information beyond what is necessary for the specific analysis. The user's Claude API key is stored encrypted in the database (`user_settings.ai_api_key`) and only used server-side, never transmitted to the client.

SR-5: CSV uploads are validated and sanitized on the server to prevent injection attacks.

SR-6: The hosted PostgreSQL database (Supabase/AWS RDS) is not publicly exposed; access is managed by the hosting service security layer, database users, and Row-Level Security. Client access is only via the application API over TLS.

SR-7: If AI is enabled, all API calls to Claude are made over HTTPS from the server. No other external communication occurs.

# **7\. Non-Functional Requirements**

| **Requirement** | **Specification**                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance     | Dashboard loads in < 2 seconds. Transaction list loads in < 1 second for up to 1,000 records. AI categorization responds in < 2 seconds.       |
| ---             | ---                                                                                                                                            |
| Scalability     | Hosted PostgreSQL database (Supabase, AWS-ready) with Row-Level Security. Elastic scaling of the managed infrastructure.                                       |
| ---             | ---                                                                                                                                            |
| Availability    | Hosted service — Supabase/RDS and app API target 99.9% uptime. Client requires an internet connection; offline caching is not in scope for V1.         |
| ---             | ---                                                                                                                                            |
| Browser Support | Chrome/Firefox/Safari/Edge — responsive web app. No native desktop binary.                          |
| ---             | ---                                                                                                                                            |
| Accessibility   | WCAG 2.1 Level AA compliance for core workflows (transaction entry, dashboard viewing, chat).                                                  |
| ---             | ---                                                                                                                                            |
| Data Backup     | Managed by the hosted database (Supabase/AWS RDS automatic daily backups + PITR). User can also manually create and restore a portable export (.db/JSON backup file) from the app. |
| ---             | ---                                                                                                                                            |
| Localization    | INR currency formatting throughout. English language for V1. Hindi and regional language support planned for future releases.                  |
| ---             | ---                                                                                                                                            |

# **8\. Phased Development Roadmap**

## **8.1 Phase 1 -- MVP (4-5 Weeks)**

Objective: Deliver a working personal finance tracker with manual entry, CSV import, budgets, and export functionality.

| **Deliverable**        | **Modules / Components** | **Key Features**                                                                           |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| Authentication         | Auth (Hosted)                    | Sign-up with email + password (Argon2 hashed), JWT sessions, multi-user isolation via user_id + RLS |
| ---                    | ---                      | ---                                                                                        |
| Account Setup          | Module 1: Accounts       | Create/edit/deactivate accounts, balance tracking                                          |
| ---                    | ---                      | ---                                                                                        |
| Transaction Management | Module 2: Transactions   | Manual entry, CSV import with column mapping, search/filter, duplicate detection            |
| ---                    | ---                      | ---                                                                                        |
| Budget Tracking        | Module 3: Budgets        | Create budgets per category, real-time utilization tracking, visual progress bars          |
| ---                    | ---                      | ---                                                                                        |
| Data Export            | Component C3             | Per-module CSV export, full database backup                                                |
| ---                    | ---                      | ---                                                                                        |
| Dashboard              | Partial Module 10        | Income vs expense chart, category breakdown donut, recent transactions list, total balance |
| ---                    | ---                      | ---                                                                                        |

Phase 1 Success Criteria: A user can launch the app, set up their accounts, import a month of bank transactions via CSV, set budgets, export data, and see a meaningful dashboard of their financial state within 10 minutes.

## **8.2 Phase 2 -- Full Features (4-5 Weeks)**

Objective: Complete all 11 modules with reporting, bills, goals, debt, tax, investments, and net worth tracking.

| **Deliverable**       | **Modules / Components** | **Key Features**                                                                              |
| --------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| Bills & Subscriptions | Module 4                 | Bill tracking, subscription list, recurring detection, smart reminders                        |
| ---                   | ---                      | ---                                                                                           |
| Savings & Goals       | Module 5                 | Goal creation, saving opportunity detection, progress tracking                                |
| ---                   | ---                      | ---                                                                                           |
| Debt & Loan Manager   | Module 6                 | Debt tracking, amortization view, prepayment simulator                                        |
| ---                   | ---                      | ---                                                                                           |
| Tax Planning          | Module 7                 | Section tracking (80C/80D/HRA), regime comparison                                              |
| ---                   | ---                      | ---                                                                                           |
| Investment Tracker    | Module 8                 | Portfolio tracking, asset allocation, returns calculation                                     |
| ---                   | ---                      | ---                                                                                           |
| Net Worth Tracker     | Module 9                 | Asset/liability aggregation, trend tracking                                                    |
| ---                   | ---                      | ---                                                                                           |
| Full Reports Suite    | Module 10 Complete       | All chart types, weekly/monthly narratives, PDF export, Explain This feature                  |
| ---                   | ---                      | ---                                                                                           |
| Financial Calendar    | Component C1             | Unified calendar of all financial events, cash flow projection                                |
| ---                   | ---                      | ---                                                                                           |
| Notifications Center  | Component C2             | Notification bell, alert feed, insight delivery                                                |
| ---                   | ---                      | ---                                                                                           |
| Enhanced Export       | Component C3             | Per-module PDF export, full data export (CSV+PDF)                                             |

Phase 2 Success Criteria: All 11 modules are fully functional with CRUD and reporting. Per-module export works for every module in both CSV and PDF formats.

## **8.3 Phase 3 -- Cross-Device Access & Polish (3-4 Weeks)**

Objective: Harden the hosted account login (cross-device access on any device), add session management, and polish UX/performance across all modules.

| **Deliverable**               | **Modules / Components** | **Key Features**                                                                   |
| ----------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| Cross-Device Access           | Component C4             | Hosted account login from any browser; same per-user data via hosted DB            |
| ---                           | ---                      | ---                                                                                |
| Session Management            | Component C4             | View/revoke active sessions, token rotation, RLS-enforced row isolation            |
| ---                           | ---                      | ---                                                                                |
| Performance & Polish          | All modules               | Lazy loading, API DTOs, snapshot downsample retention, Web Vitals in budget        |

Phase 3 Success Criteria: Sign-in from a second device shows the same data instantly. Concurrent edits never lose rows (optimistic locking verified). Session revocation takes effect immediately.

## **8.4 Phase 4 -- AI Integration (Future, Optional)**

Objective: Optionally add AI capabilities including bill scanning, auto-categorization, chat assistant, and insights. Users provide their own Claude API key.

| **Deliverable**               | **Modules / Components** | **Key Features**                                                                   |
| ----------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| AI Auto-Categorization        | All Transaction Modules  | Merchant mapping cache, batch categorization, category learning                    |
| ---                           | ---                      | ---                                                                                |
| AI Bill Scanning              | Module 2 Enhancement     | Upload bill image → Claude vision → structured transaction data, auto-fill form    |
| ---                           | ---                      | ---                                                                                |
| AI CSV Intelligent Import     | Module 2 Enhancement     | AI detects column mapping, cleans date formats, suggests categories on import      |
| ---                           | ---                      | ---                                                                                |
| AI Financial Chat             | Module 11                | Natural language Q&A over the user's data, context assembly, conversation history  |
| ---                           | ---                      | ---                                                                                |
| AI Insights & Alerts          | Component C2 Enhancement | Anomaly detection, spending patterns, budget forecasts, weekly summaries           |

Phase 4 Success Criteria: AI features work with >90% categorization accuracy. Bill scanning successfully extracts items and prices from clear receipt images. Chat queries provide accurate contextual answers within 5 seconds.

# **9\. Appendix**

## **9.1 Default Category Taxonomy**

| **Primary Category** | **Sub-Categories**                                                              |
| -------------------- | ------------------------------------------------------------------------------- |
| Food & Dining        | Groceries, Restaurants, Delivery (Swiggy/Zomato), Coffee & Snacks, Office Meals |
| ---                  | ---                                                                             |
| Transport            | Fuel, Auto & Cab (Uber/Ola), Public Transport, Parking, Vehicle Maintenance     |
| ---                  | ---                                                                             |
| Housing              | Rent, Maintenance, Repairs, Home Furnishing, Appliances                         |
| ---                  | ---                                                                             |
| Utilities            | Electricity, Water, Gas, Internet & Broadband, Mobile Recharge, DTH             |
| ---                  | ---                                                                             |
| Shopping             | Clothing, Electronics, Home & Kitchen, Personal Care, Gifts                     |
| ---                  | ---                                                                             |
| Entertainment        | Movies & OTT, Streaming Subscriptions, Gaming, Events & Concerts, Hobbies       |
| ---                  | ---                                                                             |
| Health & Fitness     | Medicine, Doctor & Hospital, Gym & Sports, Insurance Premium, Lab Tests         |
| ---                  | ---                                                                             |
| Education            | Courses & Coaching, Books, Certification, School/College Fees                   |
| ---                  | ---                                                                             |
| Finance & Banking    | EMI Payment, Loan Interest, Bank Charges, Investment, Insurance Premium         |
| ---                  | ---                                                                             |
| Personal             | Salon & Grooming, Clothing Alterations, Laundry, Donations & Charity            |
| ---                  | ---                                                                             |
| Travel               | Flights, Hotels, Holiday Packages, Travel Insurance, Visa Fees                  |
| ---                  | ---                                                                             |
| Income - Salary      | Base Salary, Bonus, Reimbursement                                               |
| ---                  | ---                                                                             |
| Income - Other       | Freelance, Business Revenue, Interest, Dividends, Rental Income, Refund         |
| ---                  | ---                                                                             |
| Transfer             | Between Own Accounts, Sent to Others, Received from Others                      |
| ---                  | ---                                                                             |

_End of Document_

_MoneyMind BRD & PRD v2.0 -- August 2026 -- Web-App (Next.js + PostgreSQL/Supabase, AWS-ready)_