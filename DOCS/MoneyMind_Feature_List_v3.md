# MoneyMind_Feature_List_v3.md

# MoneyMind -- Complete Feature List

**Version:** 3.0 | **August 2026**
**Platform:** Cloud Web App (Next.js + Supabase + Vercel)
**Modules:** 12 core + 3 cross-cutting components + app shell
* * *

## MODULE 1 -- Account & Wallet Layer

**Phase 1 | Foundation**

1. Create accounts (savings, current, credit card, wallet, cash, FD, PPF)
2. Set account name, type, institution name, and opening balance
3. Auto balance update on every linked transaction
4. View all accounts with current balances and total aggregation
5. Edit account details
6. Deactivate accounts (soft delete, preserves transaction history)
7. Credit card utilization tracking against credit limit
8. Balance history (daily snapshots for trend charts)
9. Account-to-account transfers (not treated as expense)
* * *

## MODULE 2 -- Transaction Engine

**Phase 1 | Core Data**

1. Manual transaction entry (amount, merchant, date, account, type)
2. Quick-add with recent merchant suggestions (two-tap entry)
3. CSV import for Indian bank statements (SBI, HDFC, ICICI, Kotak, Axis, UPI exports)
4. Column mapping UI for unrecognized CSV formats
5. Duplicate detection on import (same amount + merchant + date)
6. Duplicate review interface (keep, skip, or merge)
7. Search transactions by text
8. Filter by category, account, type, date range, amount range, tags
9. Sort by date, amount, category, merchant
10. Edit any transaction field
11. Delete transaction with auto balance recalculation
12. Two-level category system (parent + sub-category)
13. Custom categories and sub-categories
14. Tags (multiple per transaction, filterable)
15. Notes per transaction (free-text)
16. Split transaction into multiple categories
17. Recurring transaction flag
18. Date-grouped transaction list with daily totals
19. Expandable row detail (tags, notes, edit, delete, split inline)
* * *

## MODULE 3 -- Budget Module

**Phase 1 | Planning**

1. Create monthly budget per category
2. Create overall monthly budget (across all categories)
3. Real-time utilization (spent, remaining, percentage)
4. Visual progress bars (green 0-50%, yellow 50-80%, orange 80-100%, red 100%+)
5. Configurable alert thresholds (50%, 80%, 100%)
6. Month navigation (view any past month)
7. Budget vs actual comparison per category
8. Sub-category spending breakdown within each budget
9. Daily spending rate and recommended daily limit
10. Month-over-month budget comparison
* * *

## MODULE 4 -- Bills & Subscriptions Tracker

**Phase 2 | Recurring Payments**

1. Add bill (name, amount, due day, frequency, linked account)
2. Bill calendar (30-day visual timeline of upcoming dues)
3. Payment status tracking (upcoming / due_soon / overdue / paid / skipped)
4. Due date reminders (3 days before, in-app + email)
5. Overdue highlighting
6. Add subscription (service name, amount, frequency, renewal date, category)
7. Subscription list with total monthly burn
8. Subscription status (active / paused / cancelled)
9. Full payment history per bill
10. Cash flow impact visualization (balance waterfall after upcoming bills)
11. Auto-pay indicator (mark bills handled by auto-debit)
* * *

## MODULE 5 -- Savings & Goals

**Phase 2 | Goal Tracking**

1. Create goal (name, target amount, target date, priority)
2. Log contributions (linked to transaction or standalone)
3. Progress visualization (bar + circular ring + percentage)
4. Goal dashboard with aggregate savings total
5. Monthly contribution plan per goal
6. Milestone tracking (25%, 50%, 75%, 100% with dates)
7. Goal templates (Emergency Fund, Vacation, Device, Wedding, Home Down Payment)
8. Goal status (active / completed / paused)
9. Projected completion date based on current contribution rate
* * *

## MODULE 6 -- Debt & Loan Manager

**Phase 2 | Debt Tracking**

1. Add debt (name, type, principal, outstanding, interest rate, EMI, tenure, start date)
2. Debt types: home loan, car loan, personal loan, education loan, credit card, other
3. Debt dashboard (total outstanding, monthly EMI burden, EMI-to-income ratio, debt-free date)
4. Amortization table (principal vs interest per EMI across full tenure)
5. Prepayment simulator (model extra payment impact on tenure and interest)
6. Debt-to-income ratio with threshold flags (30%, 40%, 50%)
7. EMI payment tracking (paid / missed per month)
8. Principal vs interest visual over loan life
9. Payoff strategy comparison (avalanche vs snowball side-by-side)
10. Combined multi-debt summary with total EMI and combined timeline
* * *

## MODULE 7 -- Tax Planning

**Phase 2 | Indian Tax Optimization**

1. Section 80C tracking (PPF, ELSS, LIC, EPF, NSC, home loan principal, ULIP, tuition)
2. Section 80D tracking (health insurance: self, family, parents)
3. Other sections (HRA, Section 24, 80E, 80G, 80TTA)
4. Utilization dashboard (gauge per section showing used vs limit)
5. Old regime vs new regime tax calculator
6. Estimated tax saved (running total)
7. ITR document checklist (Form 16, 26AS, proofs, statements — status per document)
8. Financial year navigation with historical data
* * *

## MODULE 8 -- Investment Tracker

**Phase 2 | Portfolio Management**

1. Add holdings (type, name, units, buy price, current value)
2. Investment types: mutual fund, stock, FD, PPF, NPS, gold, crypto, other
3. Portfolio dashboard (invested value, current value, returns absolute + percentage)
4. Asset allocation chart (donut/pie by asset type)
5. Individual holding detail with purchase history
6. SIP tracker (amount, frequency, next date, total invested via SIP)
7. Manual price/NAV update with auto recalculation
8. XIRR returns calculation for multi-date purchases
9. Maturity tracking for FDs and fixed-term instruments
10. Dividend and interest income log
* * *

## MODULE 9 -- Net Worth Tracker

**Phase 2 | Wealth Snapshot**

1. Automatic net worth calculation (all assets minus all liabilities)
2. Hero net worth display with month/year change
3. Net worth trend chart (monthly progression)
4. Asset breakdown by category (bank, investments, goals, other)
5. Liability breakdown by category (loans, credit cards)
6. Manual asset entry (property, vehicle, gold, jewelry, receivables)
7. Assets vs liabilities ratio bar
* * *

## MODULE 10 -- Reports & Analytics Dashboard

**Phase 2 | Visualization**

1. Cash flow chart (monthly income vs expense bars + net flow line)
2. Spending by category (donut + horizontal bar)
3. Spending trends over time (line chart, 3/6/12 month)
4. Budget vs actual bar chart
5. Daily spending heatmap (calendar-style)
6. Net worth over time chart
7. Debt payoff progress chart
8. Income sources breakdown
9. Top merchants by spend and frequency
10. Custom date range filtering across all reports
11. Export any report as PDF
12. Tab-based navigation (Cash Flow, Categories, Trends, Heatmap, Summary)
* * *

## MODULE 11 -- Secure Notes & Vault

**Phase 2 | Encrypted Storage**

1. Create secure notes (title, content, category)
2. Note categories: Passwords, OTT Plans, Bank Details, Card Details, Insurance, Documents & IDs, WiFi & Networks, Software Licenses, Personal, Other
3. Custom categories
4. Template: Password/Login (website, URL, username, password, 2FA, notes)
5. Template: OTT Plan (service, plan name, cost, billing date, login, password, shared with, screens, expiry)
6. Template: Bank Account (bank, account number, IFSC, branch, type, mobile, net banking ID, customer ID, debit card, card expiry)
7. Template: Credit/Debit Card (name, number, expiry, CVV, billing date, limit, network, linked account, rewards)
8. Template: Insurance Policy (name, provider, policy number, type, premium, frequency, next date, sum assured, maturity, nominee, agent)
9. Template: Document/ID (name, number, issue date, expiry, authority — Aadhaar, PAN, Passport, DL, Voter ID)
10. Template: WiFi/Network (SSID, password, router URL, admin credentials, ISP, speed, cost)
11. Freeform notes (plain rich text, no template)
12. Search across all notes (title + content)
13. Copy field to clipboard (one-click, auto-clear after 30 seconds)
14. Encryption at rest (server-side via Supabase + optional client-side for vault)
15. Pin/favorite notes to top
16. File attachments on notes (policy PDFs, card photos — stored encrypted)
* * *

## MODULE 12 -- AI Financial Assistant

**Phase 3 | Intelligence Layer**

1. Chat interface (full messaging layout)
2. Conversation history (persistent, start new conversations)
3. Quick prompt suggestions (Monthly summary, Budget status, Can I afford, etc.)
4. Context assembly engine (sends only relevant data per query type)
5. Rich responses (inline tables, numbers, mini-charts in chat bubbles)
6. Bill/receipt image scanning (upload photo → Claude Vision → extracted data → auto-fill transaction)
7. Intelligent CSV import (AI detects columns, cleans dates, suggests categories)
8. Session cost tracking (display estimated API usage per session)
* * *

## COMPONENT C1 -- Financial Calendar

**Phase 2**

1. Monthly calendar grid with financial events on each date
2. Color-coded events (income green, bills red, subscriptions orange, SIP blue, goals gold, tax purple)
3. Day detail panel (all events for selected date with amounts and accounts)
4. Upcoming events list (next 7 and 30 days, chronological)
5. Daily cash flow projection (predicted balance after scheduled events)
* * *

## COMPONENT C2 -- Notifications & Alerts Center

**Phase 2**

1. Notification bell icon with unread count badge
2. Slide-out notification panel with read/unread status
3. Filter by type (warnings, alerts, reminders, insights, summaries)
4. Notification actions (mark read, dismiss, deep-link to module)
5. Notification preferences (enable/disable per type)
6. Email notifications (weekly summary, bill reminders, budget alerts)
7. Notification history (searchable archive)

**18 Notification Triggers:**
*   Account: low balance warning
*   Transaction: unusual spending alert, needs review flag
*   Budget: threshold alerts (50/80/100%), overspend prediction
*   Bills: due date reminder, cash flow impact warning
*   Subscriptions: renewal reminder, audit results
*   Goals: behind schedule alert, saving opportunity
*   Debt: prepayment opportunity
*   Tax: section limit approaching, filing deadline reminder
*   Investment: maturity alert
*   Net Worth: milestone reached
*   Reports: weekly summary available, monthly report available
* * *

## COMPONENT C3 -- Data Export

**Phase 1 (basic) + Phase 2 (full)**

1. Per-module CSV export (every module gets a CSV download button)
2. Per-module PDF export (formatted reports with totals and charts)
3. Date-stamped file naming (MoneyMind\_Transactions\_2026-08-01.csv)
4. Full data export (all modules combined into a single downloadable archive)
5. Account data deletion (GDPR: delete all user data permanently)
* * *

## AI FEATURES (across all modules)

**Phase 1 (basic) + Phase 3 (full suite)**

1. Auto-categorization of transactions via Claude API
2. Merchant mapping cache (categorize once, reuse forever, skip API)
3. User correction learning loop (corrections update merchant cache)
4. Bulk categorization for CSV imports (batch 20-30 per call)
5. Anomaly detection (spending > 3x average for merchant)
6. Bill/receipt image scanning via Claude Vision
7. Intelligent CSV column detection and data cleaning
8. Smart budget suggestions (based on 3-month history)
9. Mid-month overspend prediction (spending velocity analysis)
10. End-of-month budget review with next-month suggestions
11. Recurring pattern detection (auto-detect bills and subscriptions)
12. Smart bill reminders with cash flow impact
13. Subscription audit (overlapping services, unused, price changes)
14. Goal feasibility assessment at creation
15. Saving opportunity detection (weekly scan of above-average categories)
16. Goal trajectory alerts (behind schedule warnings)
17. Debt payoff strategy recommendation (avalanche vs snowball)
18. Prepayment opportunity detection
19. Debt health alerts (DTI ratio, missed payments)
20. Tax-saving plan generation (start of FY)
21. Tax regime recommendation with INR comparison
22. Year-end tax summary for CA
23. Portfolio health check (educational, non-advisory)
24. Returns narrative (plain-English performance summary)
25. Investment maturity alerts
26. Net worth decomposition (what drove the change)
27. Net worth milestone projection
28. Weekly financial summary (auto-generated)
29. Monthly narrative report (auto-generated)
30. "Explain This" on any chart (AI explains visible pattern)
31. Cash flow stress detection on calendar
32. Date conflict detection (multiple large payments same day)
* * *

## AUTH & USER MANAGEMENT

**Phase 1**

1. Email + password signup
2. Email + password login
3. Google OAuth signup/login
4. Magic link login (passwordless)
5. Forgot password (email reset link)
6. Logout
7. Session management (JWT, expiry, remember me)
8. User profile (name, email, avatar)
9. Password change
10. Account deletion (full data wipe, GDPR)
* * *

## MONETIZATION & BILLING

**Phase 3**

1. Free tier (limited features)
2. Pro tier (₹ 199-299/month or ₹ 1,999-2,999/year)
3. Pricing page with feature comparison table
4. Stripe checkout integration
5. Upgrade from Free to Pro
6. Downgrade from Pro to Free
7. Billing history
8. Plan status display in profile
* * *

## APP SHELL & PLATFORM

**Phase 1 + Phase 2**

1. 64px icon-only sidebar navigation (dark background)
2. Active state highlighting on sidebar
3. Post-signup onboarding wizard (3 steps: accounts, categories, preferences)
4. App settings (currency, date format, FY start, number format, default account)
5. Theme support (light default, dark mode, system auto-detect)
6. Global search across transactions, notes, bills, goals, investments
7. Keyboard shortcuts (Ctrl+N new transaction, Ctrl+/ search, etc.)
8. Empty states per module (illustration + CTA when no data)
9. Mobile responsive design (works on phone/tablet browsers)
* * *

## PUBLIC PAGES (Marketing)

**Phase 1 (basic) + Phase 3 (full)**

1. Landing page (hero, features overview, CTA to sign up)
2. Pricing page (Free vs Pro comparison)
3. Login page
4. Signup page
5. Forgot password page
6. Terms of service
7. Privacy policy
8. About page (optional)
* * *

## SECURITY & INFRASTRUCTURE

1. Row Level Security on all tables (user\_id isolation)
2. HTTPS everywhere
3. Supabase encryption at rest
4. Client-side encryption for Notes vault (passwords never sent as plaintext)
5. Rate limiting on all API endpoints
6. Input validation and sanitization on all forms
7. AI calls exclude unnecessary PII
8. Clipboard auto-clear (30 seconds) for copied sensitive data
9. Session timeout for inactive users
10. Error monitoring (Sentry)
* * *

## FEATURE COUNT SUMMARY

| Area | Count |
| ---| --- |
| Module 1: Accounts | 9 |
| Module 2: Transactions | 19 |
| Module 3: Budgets | 10 |
| Module 4: Bills & Subs | 11 |
| Module 5: Goals | 9 |
| Module 6: Debt | 10 |
| Module 7: Tax | 8 |
| Module 8: Investments | 10 |
| Module 9: Net Worth | 7 |
| Module 10: Reports | 12 |
| Module 11: Notes & Vault | 16 |
| Module 12: AI Chat | 8 |
| C1: Calendar | 5 |
| C2: Notifications | 7 |
| C3: Data Export | 5 |
| AI Features | 32 |
| Auth & Users | 10 |
| Monetization | 8 |
| App Shell | 9 |
| Public Pages | 8 |
| Security | 10 |
| Total | 223 |

* * *

## PHASE BREAKDOWN

| Phase | Scope | Features |
| ---| ---| --- |
| Phase 1 -- MVP | Auth, Accounts, Transactions, Budgets, Basic Dashboard, CSV Export, Basic AI categorization, Landing + Login pages | ~55 |
| Phase 2 -- Full | Bills, Goals, Debt, Tax, Investments, Net Worth, Reports, Notes, Calendar, Notifications, Email alerts, Full Export | ~110 |
| Phase 3 -- AI + Monetization | AI Chat, Bill Scanning, Intelligent CSV, Full AI suite, Stripe billing, Pricing page, Marketing site | ~58 |
| Total |  | 223 |

* * *

_MoneyMind Feature List v3.0 -- August 2026_
_Cloud Web App · 12 Modules + 3 Components · 223 Features_