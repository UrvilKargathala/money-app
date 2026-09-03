"""
MoneyMind — Universal Database Setup Script
===========================================

Idempotent bootstrap for the entire MoneyMind schema on PostgreSQL:
creates the database (if missing), all 74 tables in dependency order,
all indexes, RLS helper functions, and RLS policies.

Usage
-----
    scripts\\.venv\\Scripts\\python scripts\\db_setup.py

Connection config (env vars; no hardcoded paths — machine independent):
    DATABASE_URL  - optional. If set, it is used verbatim and the
                    create-database step is SKIPPED (see Supabase note).
    PGHOST        - default: localhost
    PGPORT        - default: 5432
    PGUSER        - default: postgres   (the default Postgres superuser;
                    no application-specific roles are created by design)
    PGPASSWORD    - default: postgres
    PGDATABASE    - default: moneymind_dev  (target database)
    PG_ADMIN_DB   - default: postgres   (maintenance DB used to CREATE DATABASE)

Supabase (this script works there too — no separate file needed)
-----------------------------------------------------------------
The schema uses only stock PostgreSQL features (gen_random_uuid, RLS,
current_setting), so it runs unchanged on Supabase. To create the SAME
database on Supabase:
    SET DATABASE_URL="postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
    python scripts\\db_setup.py
  - The create-database step is skipped automatically (Supabase owns its DBs).
  - Your table owner becomes the `postgres` role from the connection string,
    exactly like a default local setup — no extra roles needed.

Schema decision
---------------
Everything lives in the single default `public` schema. This is the standard,
scalable multi-tenant pattern for an app of this size: user isolation comes
from RLS (user_id) + indexes, NOT from splitting schemas per module.
Schema-per-module would add cross-schema FK/join overhead for zero benefit.

No roles are created. The default `postgres` role owns everything (RLS
policies still exist for when the app later connects as a non-owner role;
locally, the owner bypasses RLS just like Supabase's service_role does).
"""

from __future__ import annotations

import os
import sys
import time
from urllib.parse import urlparse

import psycopg
from psycopg import sql

# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
PGHOST = os.getenv("PGHOST", "localhost")
PGPORT = int(os.getenv("PGPORT", "5432"))
PGUSER = os.getenv("PGUSER", "postgres")
PGPASSWORD = os.getenv("PGPASSWORD", "postgres")
PGDATABASE = os.getenv("PGDATABASE", "moneymind_dev")
PG_ADMIN_DB = os.getenv("PG_ADMIN_DB", "postgres")


def conninfo_for(dbname: str) -> str:
    if DATABASE_URL:
        return DATABASE_URL
    return f"host={PGHOST} port={PGPORT} dbname={dbname} user={PGUSER} password={PGPASSWORD}"


# --------------------------------------------------------------------------
# Table definitions (canonical source: DOCS/data-tables-v2.md + module docs)
# Ordered by FK dependency (parents before children).
# --------------------------------------------------------------------------

TABLES: list[tuple[str, str]] = [
    # -- Identity / Auth / Audit ------------------------------------------
    (
        "users",
        """
        CREATE TABLE users (
            user_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            hashed_password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
            email_verified_at TIMESTAMPTZ,
            last_login_at TIMESTAMPTZ,
            deleted_at TIMESTAMPTZ,
            deleted_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            version INTEGER DEFAULT 1
        )
        """,
    ),
    (
        "user_profiles",
        """
        CREATE TABLE user_profiles (
            profile_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
            full_name TEXT,
            avatar_url TEXT,
            bio TEXT,
            created_by INTEGER REFERENCES users(user_id),
            updated_by INTEGER REFERENCES users(user_id),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "user_settings",
        """
        CREATE TABLE user_settings (
            setting_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
            currency TEXT DEFAULT 'INR',
            theme TEXT DEFAULT 'light',
            notifications_enabled INTEGER DEFAULT 1,
            language TEXT DEFAULT 'en',
            ai_api_key TEXT,
            ai_enabled INTEGER DEFAULT 0,
            monthly_income NUMERIC(12,2),
            vault_recovery_wrapped TEXT,
            vault_wrapped TEXT,
            vault_kdf_salt TEXT,
            vault_kdf_iters INTEGER,
            widget_layout JSONB DEFAULT '[]'::jsonb,
            haptics_enabled INTEGER DEFAULT 1,
            shortcuts_enabled INTEGER DEFAULT 1,
            created_by INTEGER REFERENCES users(user_id),
            updated_by INTEGER REFERENCES users(user_id),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    # -- SaaS Plans / Billing (monetization) -------------------------------
    # System lookups (no user_id; seeded by mock_data.py / test global-setup).
    # plan_tiers holds the stable plan identity; plan_prices holds versioned
    # money rows (price change = INSERT + flip is_current, never ALTER).
    (
        "plan_tiers",
        """
        CREATE TABLE plan_tiers (
            code TEXT PRIMARY KEY CHECK (code IN ('free','monthly','annual','lifetime')),
            name TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
        """,
    ),
    (
        "plan_features",
        """
        CREATE TABLE plan_features (
            key TEXT PRIMARY KEY CHECK (key IN ('accounts','budgets','bill_reminders','tracker_subscriptions','goals_active','investments','debts','tax','reports_widgets','export_batch','notifications_email','cross_device_sync','subscription_audits')),
            kind TEXT NOT NULL CHECK (kind IN ('count','boolean','mode')),
            description TEXT NOT NULL
        )
        """,
    ),
    (
        "plan_entitlements",
        """
        CREATE TABLE plan_entitlements (
            plan_code TEXT NOT NULL REFERENCES plan_tiers(code),
            feature_key TEXT NOT NULL REFERENCES plan_features(key),
            allowed INTEGER NOT NULL DEFAULT 0 CHECK (allowed IN (0,1)),
            limit_value INTEGER CHECK (limit_value IS NULL OR limit_value >= 0),
            mode TEXT CHECK (mode IN ('manual_csv','full','in_app','in_app_email')),
            PRIMARY KEY (plan_code, feature_key)
        )
        """,
    ),
    (
        "plan_prices",
        """
        CREATE TABLE plan_prices (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            plan_code TEXT NOT NULL REFERENCES plan_tiers(code),
            price_inr NUMERIC(10,2) NOT NULL CHECK (price_inr >= 0),
            per_text TEXT NOT NULL,
            interval TEXT NOT NULL CHECK (interval IN ('none','monthly','annual','lifetime')),
            billing_periods INTEGER CHECK (billing_periods IS NULL OR billing_periods > 0),
            stripe_price_id TEXT,
            currency TEXT NOT NULL DEFAULT 'INR',
            is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0,1)),
            effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            effective_to TIMESTAMPTZ
        )
        """,
    ),
    (
        "user_plan_subscriptions",
        """
        CREATE TABLE user_plan_subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            plan_code TEXT NOT NULL REFERENCES plan_tiers(code),
            status TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','trialing','past_due','cancelled')),
            provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual','stripe')),
            provider_customer_id TEXT,
            provider_subscription_id TEXT,
            price_id UUID REFERENCES plan_prices(id),
            current_period_end TIMESTAMPTZ,
            cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0,1)),
            canceled_at TIMESTAMPTZ,
            trial_ends_at TIMESTAMPTZ,
            version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "billing_events",
        """
        CREATE TABLE billing_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            provider TEXT NOT NULL DEFAULT 'stripe',
            event_id TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "plan_change_history",
        """
        CREATE TABLE plan_change_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            from_plan TEXT REFERENCES plan_tiers(code),
            to_plan TEXT NOT NULL REFERENCES plan_tiers(code),
            from_price_id UUID REFERENCES plan_prices(id),
            to_price_id UUID REFERENCES plan_prices(id),
            reason TEXT NOT NULL DEFAULT 'manual'
                CHECK (reason IN ('trial_start','trial_end','purchase','renewal','cancel','downgrade','upgrade','admin_grant','webhook')),
            changed_by INTEGER REFERENCES users(user_id),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "auth_tokens",
        """
        CREATE TABLE auth_tokens (
            token_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            token_type TEXT NOT NULL DEFAULT 'session'
                CHECK (token_type IN ('session','magic_link','password_reset','email_verify')),
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ,
            device_label TEXT,
            last_seen_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "audit_logs",
        """
        CREATE TABLE audit_logs (
            log_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
            old_value JSONB,
            new_value JSONB,
            timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "access_logs",
        """
        CREATE TABLE access_logs (
            log_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id INTEGER REFERENCES users(user_id),
            ip_address TEXT,
            user_agent TEXT,
            action TEXT CHECK (action IN ('login','logout','failed_login','forgot_password','magic_link','signup')),
            timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "login_attempts",
        """
        CREATE TABLE login_attempts (
            attempt_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id INTEGER REFERENCES users(user_id),
            email_attempt TEXT,
            ip_address TEXT,
            success INTEGER DEFAULT 0,
            timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    # -- Module 1: Account & Wallet ---------------------------------------
    (
        "account_types",
        """
        CREATE TABLE account_types (
            type_code TEXT PRIMARY KEY,
            display_name TEXT,
            icon TEXT,
            is_asset INTEGER,
            sort_order INTEGER
        )
        """,
    ),
    (
        "accounts",
        """
        CREATE TABLE accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type TEXT CHECK (type IN ('bank_savings','bank_current','credit_card','wallet','cash','fd','ppf')),
            institution TEXT,
            opening_balance NUMERIC(12,2) DEFAULT 0,
            credit_limit NUMERIC(12,2),
            currency TEXT DEFAULT 'INR',
            color TEXT,
            notes TEXT,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            version INTEGER DEFAULT 1,
            created_by INTEGER REFERENCES users(user_id),
            updated_by INTEGER REFERENCES users(user_id),
            deleted_at TIMESTAMPTZ,
            deleted_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "account_balance_history",
        """
        CREATE TABLE account_balance_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            balance NUMERIC(12,2) NOT NULL,
            date DATE NOT NULL,
            UNIQUE (user_id, account_id, date)
        )
        """,
    ),
    # -- Module 2: Transaction Engine -------------------------------------
    (
        "categories",
        """
        CREATE TABLE categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER REFERENCES users(user_id),
            parent_id UUID REFERENCES categories(id),
            name TEXT NOT NULL,
            is_system INTEGER DEFAULT 0,
            color TEXT,
            icon TEXT,
            sort_order INTEGER DEFAULT 0,
            version INTEGER DEFAULT 1,
            CHECK ((user_id IS NULL AND is_system = 1) OR (user_id IS NOT NULL AND is_system = 0))
        )
        """,
    ),
    (
        "tags",
        """
        CREATE TABLE tags (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            color TEXT,
            version INTEGER DEFAULT 1,
            UNIQUE (user_id, name)
        )
        """,
    ),
    (
        "shared_groups",
        """
        CREATE TABLE shared_groups (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_id INTEGER NOT NULL REFERENCES users(user_id),
            name TEXT NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            version INTEGER DEFAULT 1,
            created_by INTEGER REFERENCES users(user_id),
            updated_by INTEGER REFERENCES users(user_id),
            deleted_at TIMESTAMPTZ,
            deleted_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "group_members",
        """
        CREATE TABLE group_members (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            group_id UUID NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(user_id),
            role TEXT NOT NULL DEFAULT 'read_only' CHECK (role IN ('admin','read_only')),
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','removed')),
            invited_by INTEGER REFERENCES users(user_id),
            version INTEGER DEFAULT 1,
            created_by INTEGER REFERENCES users(user_id),
            updated_by INTEGER REFERENCES users(user_id),
            deleted_at TIMESTAMPTZ,
            deleted_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (group_id, user_id)
        )
        """,
    ),
    (
        "group_invites",
        """
        CREATE TABLE group_invites (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            group_id UUID NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
            invitee_email TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','declined','revoked','expired')),
            invited_by INTEGER REFERENCES users(user_id),
            expires_at TIMESTAMPTZ NOT NULL,
            accepted_at TIMESTAMPTZ,
            accepted_by INTEGER REFERENCES users(user_id),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "import_batches",
        """
        CREATE TABLE import_batches (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            filename TEXT NOT NULL,
            total_rows INTEGER NOT NULL,
            imported_rows INTEGER DEFAULT 0,
            duplicate_rows INTEGER DEFAULT 0,
            error_rows INTEGER DEFAULT 0,
            status TEXT CHECK (status IN ('processing','completed','partial','failed')),
            date_from DATE,
            date_to DATE,
            account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
            error_log_path TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "transactions",
        """
        CREATE TABLE transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            account_id UUID REFERENCES accounts(id),
            type TEXT CHECK (type IN ('income','expense','transfer')),
            amount NUMERIC(12,2) CHECK (amount > 0),
            description TEXT,
            merchant_clean TEXT,
            category_id UUID REFERENCES categories(id),
            date DATE NOT NULL,
            notes TEXT,
            import_batch_id UUID REFERENCES import_batches(id),
            transfer_group_id UUID,
            group_id UUID REFERENCES shared_groups(id),
            is_recurring INTEGER DEFAULT 0,
            source TEXT DEFAULT 'manual',
            needs_review INTEGER DEFAULT 0,
            version INTEGER DEFAULT 1,
            created_by INTEGER REFERENCES users(user_id),
            updated_by INTEGER REFERENCES users(user_id),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "account_transfers",
        """
        CREATE TABLE account_transfers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            transfer_group_id UUID NOT NULL,
            from_account_id UUID REFERENCES accounts(id),
            to_account_id UUID REFERENCES accounts(id),
            from_transaction_id UUID REFERENCES transactions(id),
            to_transaction_id UUID REFERENCES transactions(id),
            amount NUMERIC(12,2) NOT NULL,
            date DATE NOT NULL,
            notes TEXT,
            version INTEGER DEFAULT 1
        )
        """,
    ),
    (
        "tags_transactions",
        """
        CREATE TABLE tags_transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
            tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            UNIQUE (user_id, transaction_id, tag_id)
        )
        """,
    ),
    (
        "merchant_mappings",
        """
        CREATE TABLE merchant_mappings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            merchant_raw TEXT NOT NULL,
            merchant_clean TEXT,
            category_id UUID REFERENCES categories(id),
            use_count INTEGER DEFAULT 1,
            last_used_at TIMESTAMPTZ,
            is_user_override INTEGER DEFAULT 0,
            UNIQUE (user_id, merchant_raw)
        )
        """,
    ),
    (
        "recurring_transaction_templates",
        """
        CREATE TABLE recurring_transaction_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            account_id UUID REFERENCES accounts(id),
            type TEXT CHECK (type IN ('income','expense')),
            amount NUMERIC(12,2) CHECK (amount > 0),
            description TEXT,
            category_id UUID REFERENCES categories(id),
            frequency TEXT CHECK (frequency IN ('daily','weekly','monthly','yearly')),
            interval_value INTEGER DEFAULT 1,
            end_type TEXT DEFAULT 'never',
            end_count INTEGER,
            end_date DATE,
            next_due_date DATE NOT NULL,
            is_active INTEGER DEFAULT 1,
            version INTEGER DEFAULT 1
        )
        """,
    ),
    (
        "import_errors",
        """
        CREATE TABLE import_errors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            import_batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
            row_number INTEGER NOT NULL,
            raw_data TEXT,
            error_reason TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "transaction_splits",
        """
        CREATE TABLE transaction_splits (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
            category_id UUID NOT NULL REFERENCES categories(id),
            amount NUMERIC(12,2) CHECK (amount > 0),
            notes TEXT,
            version INTEGER DEFAULT 1,
            UNIQUE (user_id, transaction_id, category_id)
        )
        """,
    ),
    # -- Module 3: Budget ------------------------------------------------
    (
        "budgets",
        """
        CREATE TABLE budgets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            category_id UUID REFERENCES categories(id),
            amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
            period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly','weekly')),
            month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
            year INTEGER NOT NULL,
            alert_50 INTEGER NOT NULL DEFAULT 1,
            alert_80 INTEGER NOT NULL DEFAULT 1,
            alert_100 INTEGER NOT NULL DEFAULT 1,
            rollover_enabled INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            version INTEGER NOT NULL DEFAULT 1,
            created_by INTEGER REFERENCES users(user_id),
            updated_by INTEGER REFERENCES users(user_id),
            deleted_at TIMESTAMPTZ,
            deleted_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, category_id, month, year)
        )
        """,
    ),
    (
        "budget_alerts",
        """
        CREATE TABLE budget_alerts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
            threshold INTEGER NOT NULL CHECK (threshold IN (50,80,100)),
            utilization_pct NUMERIC(5,2) NOT NULL,
            spent_amount NUMERIC(12,2) NOT NULL,
            budget_amount NUMERIC(12,2) NOT NULL,
            is_dismissed INTEGER NOT NULL DEFAULT 0,
            version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "budget_rollovers",
        """
        CREATE TABLE budget_rollovers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
            from_month INTEGER NOT NULL,
            from_year INTEGER NOT NULL,
            rollover_amount NUMERIC(12,2) NOT NULL CHECK (rollover_amount > 0),
            applied_to_budget_id UUID REFERENCES budgets(id),
            version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "budget_templates",
        """
        CREATE TABLE budget_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            is_default INTEGER NOT NULL DEFAULT 0,
            version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, name)
        )
        """,
    ),
    (
        "budget_items",
        """
        CREATE TABLE budget_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            template_id UUID NOT NULL REFERENCES budget_templates(id) ON DELETE CASCADE,
            category_id UUID REFERENCES categories(id),
            amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
            UNIQUE (user_id, template_id, category_id)
        )
        """,
    ),
    # -- Module 4: Bills & Subscriptions ----------------------------------
    (
        "bills",
        """
        CREATE TABLE bills (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            amount NUMERIC(12,2),
            estimated_amount NUMERIC(12,2),
            due_day INTEGER CHECK (due_day BETWEEN 1 AND 31),
            frequency TEXT CHECK (frequency IN ('monthly','quarterly','half_yearly','annual','one_time')),
            account_id UUID REFERENCES accounts(id),
            category_id UUID REFERENCES categories(id),
            reminder_days INTEGER DEFAULT 3,
            is_autopay INTEGER DEFAULT 0,
            notes TEXT,
            current_period_status TEXT DEFAULT 'upcoming' CHECK (current_period_status IN ('upcoming','due_soon','overdue','paid','skipped')),
            is_active INTEGER DEFAULT 1,
            version INTEGER DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "subscriptions",
        """
        CREATE TABLE subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            service_name TEXT NOT NULL,
            amount NUMERIC(12,2) NOT NULL,
            frequency TEXT CHECK (frequency IN ('monthly','quarterly','annual')),
            next_renewal_date DATE NOT NULL,
            account_id UUID REFERENCES accounts(id),
            category_id UUID REFERENCES categories(id),
            status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
            notes TEXT,
            version INTEGER DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "payment_history",
        """
        CREATE TABLE payment_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            payable_type TEXT CHECK (payable_type IN ('bill','subscription')),
            payable_id UUID,
            transaction_id UUID REFERENCES transactions(id),
            amount NUMERIC(12,2) CHECK (amount > 0),
            period_label TEXT,
            period_month INTEGER,
            period_year INTEGER,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "bill_reminders",
        """
        CREATE TABLE bill_reminders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
            days_before INTEGER CHECK (days_before >= 0),
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "subscription_audits",
        """
        CREATE TABLE subscription_audits (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
            audit_type TEXT CHECK (audit_type IN ('price_change','duplicate','unused','overlapping')),
            finding TEXT,
            recommendation TEXT,
            potential_savings NUMERIC(12,2),
            is_dismissed INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    # -- Module 5: Savings & Goals ---------------------------------------
    (
        "goals",
        """
        CREATE TABLE goals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            name TEXT,
            target NUMERIC(12,2) CHECK (target > 0),
            target_date DATE,
            priority TEXT CHECK (priority IN ('high','medium','low')),
            status TEXT CHECK (status IN ('active','completed','paused')),
            account_id UUID REFERENCES accounts(id),
            color TEXT,
            notes TEXT,
            template_used TEXT,
            completed_at DATE,
            version INTEGER DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "goal_templates",
        """
        CREATE TABLE goal_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER REFERENCES users(user_id),
            name TEXT NOT NULL,
            description TEXT,
            default_target_amount NUMERIC(12,2),
            default_timeframe_months INTEGER,
            icon TEXT,
            is_system INTEGER DEFAULT 1,
            version INTEGER DEFAULT 1
        )
        """,
    ),
    (
        "goal_contributions",
        """
        CREATE TABLE goal_contributions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            amount NUMERIC(12,2) CHECK (amount > 0),
            date DATE,
            transaction_id UUID REFERENCES transactions(id),
            notes TEXT
        )
        """,
    ),
    (
        "goal_snapshots",
        """
        CREATE TABLE goal_snapshots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            current_amount NUMERIC(12,2) NOT NULL,
            date DATE NOT NULL
        )
        """,
    ),
    (
        "goal_milestones",
        """
        CREATE TABLE goal_milestones (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            milestone_pct INTEGER CHECK (milestone_pct IN (25,50,75,100)),
            reached_date DATE NOT NULL,
            notified_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (goal_id, milestone_pct)
        )
        """,
    ),
    # -- Module 6: Debt & Loan -------------------------------------------
    (
        "debt_types",
        """
        CREATE TABLE debt_types (
            type_code TEXT PRIMARY KEY,
            display_name TEXT,
            is_secured INTEGER,
            sort_order INTEGER
        )
        """,
    ),
    (
        "debts",
        """
        CREATE TABLE debts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type TEXT CHECK (type IN ('home_loan','car_loan','personal_loan','education_loan','credit_card','other')),
            lender TEXT,
            principal_original NUMERIC(12,2),
            principal_outstanding NUMERIC(12,2),
            interest_rate NUMERIC(5,2),
            emi_amount NUMERIC(12,2),
            minimum_due NUMERIC(12,2),
            tenure_months INTEGER,
            months_remaining INTEGER CHECK (months_remaining >= 0),
            start_date DATE,
            end_date DATE,
            account_id UUID REFERENCES accounts(id),
            total_interest_paid NUMERIC(12,2),
            is_active INTEGER DEFAULT 1,
            notes TEXT,
            closed_date DATE,
            version INTEGER DEFAULT 1,
            created_by INTEGER REFERENCES users(user_id),
            updated_by INTEGER REFERENCES users(user_id),
            deleted_at TIMESTAMPTZ,
            deleted_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "debt_payments",
        """
        CREATE TABLE debt_payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
            type TEXT CHECK (type IN ('emi','prepayment','lumpsum')),
            amount NUMERIC(12,2),
            principal_part NUMERIC(12,2),
            interest_part NUMERIC(12,2),
            outstanding_after NUMERIC(12,2),
            date DATE,
            transaction_id UUID REFERENCES transactions(id),
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """,
    ),
    (
        "amortization_schedule",
        """
        CREATE TABLE amortization_schedule (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
            period INTEGER,
            emi_amount NUMERIC(12,2),
            principal_part NUMERIC(12,2),
            interest_part NUMERIC(12,2),
            outstanding_after NUMERIC(12,2),
            cumulative_interest NUMERIC(12,2),
            scheduled_date DATE,
            regenerated_at TIMESTAMPTZ,
            UNIQUE (debt_id, period)
        )
        """,
    ),
    # -- Module 7: Tax Planning ------------------------------------------
    (
        "tax_sections",
        """
        CREATE TABLE tax_sections (
            section_code TEXT PRIMARY KEY,
            name TEXT,
            description TEXT,
            max_limit NUMERIC(12,2),
            applicable_regime TEXT,
            sort_order INTEGER
        )
        """,
    ),
    (
        "tax_investments",
        """
        CREATE TABLE tax_investments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            section_id TEXT REFERENCES tax_sections(section_code),
            financial_year TEXT,
            name TEXT,
            amount NUMERIC(12,2),
            investment_date DATE,
            proof_status TEXT CHECK (proof_status IN ('pending','collected','submitted','verified')),
            transaction_id UUID REFERENCES transactions(id),
            notes TEXT,
            version INTEGER DEFAULT 1
        )
        """,
    ),
    (
        "salary_structures",
        """
        CREATE TABLE salary_structures (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            financial_year TEXT NOT NULL,
            employment_type TEXT CHECK (employment_type IN ('salaried','freelancer','business','other')),
            basic_monthly NUMERIC(12,2),
            hra_monthly NUMERIC(12,2),
            lta_annual NUMERIC(12,2),
            special_allowances NUMERIC(12,2),
            employer_pf NUMERIC(12,2),
            actual_rent_monthly NUMERIC(12,2),
            other_exemptions NUMERIC(12,2),
            gross_annual_income NUMERIC(12,2),
            additional_income NUMERIC(12,2),
            tds_deducted NUMERIC(12,2),
            UNIQUE (user_id, financial_year)
        )
        """,
    ),
    (
        "tax_regime_slabs",
        """
        CREATE TABLE tax_regime_slabs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            financial_year TEXT NOT NULL,
            regime TEXT CHECK (regime IN ('old','new')),
            slab_from NUMERIC(12,2),
            slab_to NUMERIC(12,2),
            rate NUMERIC(7,4),
            cess_rate NUMERIC(7,4)
        )
        """,
    ),
    (
        "itr_documents",
        """
        CREATE TABLE itr_documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            financial_year TEXT,
            category TEXT CHECK (category IN ('income_proof','investment_proof','deduction_proof','other')),
            document_name TEXT,
            status TEXT CHECK (status IN ('pending','collected','submitted')),
            is_suggested INTEGER DEFAULT 1,
            notes TEXT
        )
        """,
    ),
    # -- Module 8: Investment Tracker ------------------------------------
    (
        "investments",
        """
        CREATE TABLE investments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            name TEXT,
            type TEXT CHECK (type IN ('mutual_fund','stock','fd','ppf','nps','gold','crypto','other')),
            category TEXT,
            valuation_mode TEXT DEFAULT 'unit' CHECK (valuation_mode IN ('unit','manual')),
            units NUMERIC(12,4),
            buy_price NUMERIC(12,4),
            current_price NUMERIC(12,4),
            invested_value NUMERIC(12,2) GENERATED ALWAYS AS (units * buy_price) STORED,
            current_value NUMERIC(12,2) GENERATED ALWAYS AS (units * current_price) STORED,
            purchase_date DATE,
            maturity_date DATE,
            account_id UUID REFERENCES accounts(id),
            is_active INTEGER DEFAULT 1,
            notes TEXT,
            closed_date DATE,
            version INTEGER DEFAULT 1
        )
        """,
    ),
    (
        "investment_transactions",
        """
        CREATE TABLE investment_transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
            type TEXT CHECK (type IN ('buy','sell','reinvestment')),
            units NUMERIC(12,4),
            price_per_unit NUMERIC(12,4),
            total_amount NUMERIC(12,2),
            date DATE,
            transaction_id UUID REFERENCES transactions(id),
            notes TEXT
        )
        """,
    ),
    (
        "investment_snapshots",
        """
        CREATE TABLE investment_snapshots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
            invested_value NUMERIC(12,2),
            current_value NUMERIC(12,2),
            date DATE
        )
        """,
    ),
    (
        "investment_price_history",
        """
        CREATE TABLE investment_price_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
            price NUMERIC(12,4) CHECK (price > 0),
            date DATE,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "portfolio_snapshots",
        """
        CREATE TABLE portfolio_snapshots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            date DATE NOT NULL,
            total_invested NUMERIC(12,2),
            total_current NUMERIC(12,2),
            UNIQUE (user_id, date)
        )
        """,
    ),
    (
        "dividend_income",
        """
        CREATE TABLE dividend_income (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
            type TEXT CHECK (type IN ('dividend','interest','maturity_proceeds')),
            amount NUMERIC(12,2),
            date DATE,
            transaction_id UUID REFERENCES transactions(id),
            notes TEXT
        )
        """,
    ),
    (
        "sip_trackers",
        """
        CREATE TABLE sip_trackers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
            amount NUMERIC(12,2),
            frequency TEXT CHECK (frequency IN ('monthly','quarterly')),
            next_date DATE,
            account_id UUID REFERENCES accounts(id),
            status TEXT CHECK (status IN ('active','paused','completed')),
            start_date DATE,
            end_date DATE,
            notes TEXT
        )
        """,
    ),
    # -- Module 9: Net Worth Tracker --------------------------------------
    (
        "net_worth_snapshots",
        """
        CREATE TABLE net_worth_snapshots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            date DATE NOT NULL,
            assets_total NUMERIC(12,2),
            liabilities_total NUMERIC(12,2),
            UNIQUE (user_id, date)
        )
        """,
    ),
    (
        "manual_assets",
        """
        CREATE TABLE manual_assets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            category TEXT CHECK (category IN ('property','vehicle','gold','other')),
            valuation NUMERIC(12,2),
            acquisition_date DATE,
            depreciation_method TEXT,
            notes TEXT,
            version INTEGER DEFAULT 1
        )
        """,
    ),
    (
        "net_worth_milestones",
        """
        CREATE TABLE net_worth_milestones (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            label TEXT NOT NULL,
            target_amount NUMERIC(12,2) CHECK (target_amount > 0),
            is_active INTEGER DEFAULT 1,
            reached_at DATE,
            notified_at TIMESTAMPTZ,
            version INTEGER DEFAULT 1,
            created_by INTEGER REFERENCES users(user_id),
            updated_by INTEGER REFERENCES users(user_id),
            deleted_at TIMESTAMPTZ,
            deleted_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    # -- Module 10: Reports & Analytics ------------------------------------
    (
        "report_templates",
        """
        CREATE TABLE report_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER REFERENCES users(user_id),
            name TEXT NOT NULL,
            chart_config JSONB NOT NULL,
            description TEXT,
            version INTEGER DEFAULT 1
        )
        """,
    ),
    (
        "report_exports",
        """
        CREATE TABLE report_exports (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            template_id UUID REFERENCES report_templates(id),
            file_path TEXT,
            file_type TEXT CHECK (file_type IN ('pdf','csv')),
            date_range_start DATE,
            date_range_end DATE,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    # -- Module 11: Secure Notes & Vault -----------------------------------
    (
        "note_templates",
        """
        CREATE TABLE note_templates (
            template_code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            fields JSONB NOT NULL,
            icon TEXT,
            sort_order INTEGER DEFAULT 0
        )
        """,
    ),
    (
        "secure_notes",
        """
        CREATE TABLE secure_notes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'personal',
            template_code TEXT REFERENCES note_templates(template_code),
            data_encrypted TEXT NOT NULL,
            data_iv TEXT NOT NULL,
            is_pinned INTEGER DEFAULT 0,
            version INTEGER DEFAULT 1,
            created_by INTEGER REFERENCES users(user_id),
            updated_by INTEGER REFERENCES users(user_id),
            deleted_at TIMESTAMPTZ,
            deleted_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "note_attachments",
        """
        CREATE TABLE note_attachments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            note_id UUID NOT NULL REFERENCES secure_notes(id) ON DELETE CASCADE,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_type TEXT,
            file_size INTEGER,
            is_encrypted INTEGER DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    # -- Component C1: Financial Calendar ---------------------------------
    (
        "calendar_events",
        """
        CREATE TABLE calendar_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            event_date DATE NOT NULL,
            end_date DATE,
            event_type TEXT CHECK (event_type IN ('reminder','income','expense','other')),
            amount NUMERIC(12,2),
            account_id UUID REFERENCES accounts(id),
            color TEXT,
            notes TEXT,
            version INTEGER DEFAULT 1,
            created_by INTEGER REFERENCES users(user_id),
            updated_by INTEGER REFERENCES users(user_id),
            deleted_at TIMESTAMPTZ,
            deleted_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    # -- Component C2: Notifications & Alerts Center ----------------------
    (
        "notifications",
        """
        CREATE TABLE notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            type TEXT NOT NULL CHECK (type IN ('warning','alert','reminder','insight','summary','info')),
            module TEXT NOT NULL CHECK (module IN ('account','transaction','budget','bills','subscription','goals','debt','tax','investment','net_worth','reports','calendar','system')),
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            data_payload JSONB,
            deep_link TEXT,
            priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
            is_read INTEGER DEFAULT 0,
            is_dismissed INTEGER DEFAULT 0,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    (
        "notification_preferences",
        """
        CREATE TABLE notification_preferences (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            notification_type TEXT NOT NULL,
            channel TEXT NOT NULL CHECK (channel IN ('in_app','email')),
            is_enabled INTEGER DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, notification_type, channel)
        )
        """,
    ),
    (
        "notification_emails",
        """
        CREATE TABLE notification_emails (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            notification_id UUID REFERENCES notifications(id),
            email_type TEXT NOT NULL,
            recipient TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
            error_message TEXT,
            sent_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
    # -- Component C3: Data Export ----------------------------------------
    (
        "data_export_jobs",
        """
        CREATE TABLE data_export_jobs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            export_type TEXT NOT NULL CHECK (export_type IN ('csv','pdf','full_archive')),
            scope TEXT NOT NULL CHECK (scope IN ('module','all')),
            module_name TEXT,
            date_range_start DATE,
            date_range_end DATE,
            status TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','processing','completed','failed')),
            file_path TEXT,
            file_type TEXT CHECK (file_type IN ('csv','pdf','zip','sql','json')),
            row_count INTEGER,
            file_size INTEGER,
            error_message TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
        """,
    ),
]

# --------------------------------------------------------------------------
# Indexes (canonical source: module docs "Database Indexing Strategy")
# --------------------------------------------------------------------------

INDEX_SQL: list[str] = [
    # Identity / Auth / Audit
    "CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id, token_type, created_at DESC)",
    "CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, timestamp DESC)",
    "CREATE INDEX idx_access_logs_user ON access_logs(user_id, timestamp DESC)",
    "CREATE INDEX idx_login_attempts_user ON login_attempts(user_id, timestamp DESC)",
    # Module 1
    "CREATE INDEX idx_accounts_user_id ON accounts(user_id)",
    "CREATE INDEX idx_accounts_user_created ON accounts(user_id, created_at DESC)",
    "CREATE INDEX idx_accounts_active_created ON accounts(user_id, created_at DESC) WHERE is_active = 1 AND deleted_at IS NULL",
    "CREATE UNIQUE INDEX idx_abh_account_date ON account_balance_history(user_id, account_id, date)",
    "CREATE INDEX idx_at_from ON account_transfers(from_account_id)",
    "CREATE INDEX idx_at_to ON account_transfers(to_account_id)",
    "CREATE INDEX idx_at_date ON account_transfers(date)",
    "CREATE INDEX idx_at_group ON account_transfers(transfer_group_id)",
    # Module 2
    "CREATE INDEX idx_txn_account_date ON transactions(user_id, account_id, date)",
    "CREATE INDEX idx_txn_category_date ON transactions(user_id, category_id, date)",
    "CREATE INDEX idx_txn_transfer ON transactions(transfer_group_id)",
    "CREATE INDEX idx_txn_group ON transactions(group_id, date DESC)",
    "CREATE INDEX idx_txn_description_trgm ON transactions USING GIN (description gin_trgm_ops)",
    "CREATE INDEX idx_txn_merchant_trgm ON transactions USING GIN (merchant_clean gin_trgm_ops)",
    "CREATE UNIQUE INDEX ux_categories_system_name ON categories(name) WHERE user_id IS NULL",
    "CREATE UNIQUE INDEX ux_categories_user_name ON categories(user_id, name) WHERE user_id IS NOT NULL",
    "CREATE INDEX idx_cat_parent ON categories(parent_id)",
    "CREATE UNIQUE INDEX idx_mm_merchant ON merchant_mappings(user_id, merchant_raw)",
    "CREATE UNIQUE INDEX idx_tag_name ON tags(user_id, name)",
    "CREATE UNIQUE INDEX idx_tt_pair ON tags_transactions(user_id, transaction_id, tag_id)",
    "CREATE INDEX idx_tt_tag ON tags_transactions(tag_id)",
    "CREATE UNIQUE INDEX idx_ts_pair ON transaction_splits(user_id, transaction_id, category_id)",
    "CREATE INDEX idx_ts_category ON transaction_splits(user_id, category_id)",
    "CREATE INDEX idx_recrt_active ON recurring_transaction_templates(is_active)",
    # Module 2: link executed occurrences back to their template (history
    # survives template deletion via SET NULL). Added here because the
    # transactions table is created before the templates table.
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring_template_id UUID REFERENCES recurring_transaction_templates(id) ON DELETE SET NULL",
    "CREATE INDEX IF NOT EXISTS idx_txn_recurring_template ON transactions(recurring_template_id) WHERE recurring_template_id IS NOT NULL",
    "CREATE INDEX idx_recrt_next ON recurring_transaction_templates(next_due_date)",
    "CREATE INDEX idx_ib_status ON import_batches(status)",
    "CREATE INDEX idx_ie_batch ON import_errors(import_batch_id)",
    "CREATE UNIQUE INDEX ux_gm_pair ON group_members(group_id, user_id)",
    "CREATE UNIQUE INDEX ux_gm_active_user ON group_members(user_id, group_id) WHERE status = 'active'",
    "CREATE UNIQUE INDEX ux_gi_token ON group_invites(token_hash)",
    # Module 3
    "CREATE UNIQUE INDEX idx_bud_category_period ON budgets(user_id, category_id, month, year)",
    "CREATE INDEX idx_bud_month_year ON budgets(user_id, month, year)",
    "CREATE INDEX idx_bud_category_year ON budgets(user_id, category_id, year)",
    "CREATE INDEX idx_bud_user_created ON budgets(user_id, created_at DESC)",
    "CREATE INDEX idx_bud_month_created ON budgets(user_id, month, year, created_at DESC)",
    "CREATE UNIQUE INDEX ux_budgets_overall ON budgets(user_id, month, year) WHERE category_id IS NULL",
    "CREATE INDEX idx_ba_budget ON budget_alerts(budget_id)",
    "CREATE INDEX idx_ba_created ON budget_alerts(created_at)",
    "CREATE INDEX idx_br_budget ON budget_rollovers(budget_id)",
    "CREATE INDEX idx_br_from ON budget_rollovers(user_id, budget_id, from_month, from_year)",
    "CREATE INDEX idx_br_applied ON budget_rollovers(applied_to_budget_id)",
    "CREATE UNIQUE INDEX idx_bt_name ON budget_templates(user_id, name)",
    "CREATE INDEX idx_bti_template ON budget_items(template_id)",
    "CREATE UNIQUE INDEX idx_bti_pair ON budget_items(template_id, category_id)",
    # Module 4
    "CREATE INDEX idx_bill_account ON bills(account_id)",
    "CREATE INDEX idx_bill_status_active ON bills(user_id, current_period_status, is_active)",
    "CREATE INDEX idx_bill_due_active ON bills(user_id, due_day, is_active)",
    "CREATE INDEX idx_bills_user_created ON bills(user_id, created_at DESC)",
    "CREATE INDEX idx_sub_account ON subscriptions(account_id)",
    "CREATE INDEX idx_sub_active_renewal ON subscriptions(user_id, status, next_renewal_date)",
    "CREATE INDEX idx_sub_user_created ON subscriptions(user_id, created_at DESC)",
    "CREATE INDEX idx_sub_status_created ON subscriptions(user_id, status, created_at DESC)",
    "CREATE INDEX idx_ph_payable ON payment_history(payable_id, payable_type)",
    "CREATE INDEX idx_ph_payable_period ON payment_history(user_id, payable_id, payable_type, period_year, period_month)",
    "CREATE INDEX idx_ph_period ON payment_history(user_id, payable_type, payable_id, period_year)",
    "CREATE INDEX idx_ph_transaction ON payment_history(transaction_id)",
    "CREATE INDEX idx_ph_created ON payment_history(created_at)",
    "CREATE INDEX idx_br_bill ON bill_reminders(bill_id)",
    "CREATE INDEX idx_br_user_active_created ON bill_reminders(user_id, created_at DESC) WHERE is_active = 1",
    "CREATE INDEX idx_sal_sub ON subscription_audits(subscription_id)",
    "CREATE INDEX idx_sal_type ON subscription_audits(audit_type)",
    "CREATE INDEX idx_sal_created ON subscription_audits(created_at)",
    # Module 5
    "CREATE INDEX idx_goal_account ON goals(account_id)",
    "CREATE INDEX idx_goal_active_date ON goals(user_id, status, target_date)",
    "CREATE INDEX idx_goals_user_created ON goals(user_id, created_at DESC)",
    "CREATE INDEX idx_goals_status_created ON goals(user_id, status, created_at DESC)",
    "CREATE INDEX idx_gc_goal ON goal_contributions(goal_id)",
    "CREATE INDEX idx_gc_goal_date ON goal_contributions(user_id, goal_id, date)",
    "CREATE INDEX idx_gc_transaction ON goal_contributions(transaction_id)",
    "CREATE UNIQUE INDEX idx_gt_system_name ON goal_templates(name) WHERE user_id IS NULL",
    "CREATE UNIQUE INDEX idx_gt_user_name ON goal_templates(user_id, name) WHERE user_id IS NOT NULL",
    "CREATE INDEX idx_gs_goal ON goal_snapshots(goal_id)",
    "CREATE UNIQUE INDEX idx_gs_goal_date ON goal_snapshots(user_id, goal_id, date)",
    "CREATE UNIQUE INDEX idx_gm_goal ON goal_milestones(user_id, goal_id, milestone_pct)",
    # Module 6
    "CREATE INDEX idx_debt_account ON debts(account_id)",
    "CREATE INDEX idx_debt_active_rate ON debts(user_id, is_active, interest_rate DESC)",
    "CREATE INDEX idx_debt_transaction ON debt_payments(transaction_id)",
    "CREATE INDEX idx_dp_debt_date ON debt_payments(user_id, debt_id, date DESC)",
    "CREATE INDEX idx_ac_debt ON amortization_schedule(debt_id)",
    "CREATE INDEX idx_ac_debt_period ON amortization_schedule(user_id, debt_id, period)",
    # Module 7
    "CREATE UNIQUE INDEX idx_ts_code ON tax_sections(section_code)",
    "CREATE INDEX idx_ti_section_fy ON tax_investments(user_id, section_id, financial_year)",
    "CREATE INDEX idx_ti_fy_section ON tax_investments(user_id, financial_year, section_id)",
    "CREATE INDEX idx_ti_transaction ON tax_investments(transaction_id)",
    "CREATE UNIQUE INDEX idx_ss_fy ON salary_structures(user_id, financial_year)",
    "CREATE INDEX idx_trs_fy_regime ON tax_regime_slabs(financial_year, regime, slab_from)",
    "CREATE INDEX idx_itrd_fy ON itr_documents(user_id, financial_year)",
    # Module 8
    "CREATE INDEX idx_inv_active_category ON investments(user_id, is_active, category)",
    "CREATE INDEX idx_inv_user_maturity ON investments(user_id, maturity_date) WHERE maturity_date IS NOT NULL",
    "CREATE INDEX idx_inv_name_trgm ON investments USING GIN (name gin_trgm_ops)",
    "CREATE INDEX idx_inv_transaction_inv ON investment_transactions(investment_id)",
    "CREATE INDEX idx_inv_transaction_inv_date ON investment_transactions(user_id, investment_id, date DESC)",
    "CREATE INDEX idx_inv_transaction_txn ON investment_transactions(transaction_id)",
    "CREATE INDEX idx_inv_snapshot_inv ON investment_snapshots(investment_id)",
    "CREATE INDEX idx_inv_snapshot_inv_date ON investment_snapshots(user_id, investment_id, date)",
    "CREATE INDEX idx_inv_price_inv ON investment_price_history(investment_id)",
    "CREATE INDEX idx_inv_price_date ON investment_price_history(user_id, investment_id, date)",
    "CREATE UNIQUE INDEX idx_ps_date ON portfolio_snapshots(user_id, date)",
    "CREATE INDEX idx_dir_inv ON dividend_income(investment_id)",
    "CREATE INDEX idx_dir_inv_date ON dividend_income(user_id, investment_id, date DESC)",
    "CREATE INDEX idx_dir_transaction ON dividend_income(transaction_id)",
    "CREATE INDEX idx_st_inv ON sip_trackers(investment_id)",
    "CREATE INDEX idx_st_next ON sip_trackers(next_date)",
    "CREATE INDEX idx_st_account ON sip_trackers(account_id)",
    # Module 9
    "CREATE UNIQUE INDEX idx_nw_date ON net_worth_snapshots(user_id, date)",
    "CREATE INDEX idx_nw_user ON net_worth_snapshots(user_id)",
    "CREATE INDEX idx_ma_user ON manual_assets(user_id)",
    "CREATE INDEX idx_ma_name ON manual_assets(name)",
    "CREATE INDEX idx_ma_category ON manual_assets(category)",
    "CREATE INDEX idx_nwm_user ON net_worth_milestones(user_id, is_active)",
    # Module 10
    "CREATE UNIQUE INDEX ux_report_templates_user_name ON report_templates(user_id, name) WHERE user_id IS NOT NULL",
    "CREATE UNIQUE INDEX ux_report_templates_system_name ON report_templates(name) WHERE user_id IS NULL",
    "CREATE INDEX idx_re_user ON report_exports(user_id)",
    "CREATE INDEX idx_re_template ON report_exports(template_id)",
    # Module 11
    "CREATE INDEX idx_notes_user ON secure_notes(user_id) WHERE deleted_at IS NULL",
    "CREATE INDEX idx_notes_category ON secure_notes(user_id, category) WHERE deleted_at IS NULL",
    "CREATE INDEX idx_notes_pinned ON secure_notes(user_id, is_pinned) WHERE deleted_at IS NULL",
    "CREATE INDEX idx_notes_title_trgm ON secure_notes USING GIN (title gin_trgm_ops)",
    "CREATE INDEX idx_na_note ON note_attachments(user_id, note_id)",
    # Component C1
    "CREATE INDEX idx_ce_user_date ON calendar_events(user_id, event_date)",
    # Component C2
    "CREATE INDEX idx_notif_user_read ON notifications(user_id, is_read, created_at DESC) WHERE is_dismissed = 0",
    "CREATE INDEX idx_notif_type ON notifications(user_id, type, created_at DESC)",
    "CREATE INDEX idx_notif_module ON notifications(user_id, module, created_at DESC)",
    "CREATE INDEX idx_notif_created ON notifications(created_at)",
    "CREATE INDEX idx_nw_milestone ON net_worth_milestones(user_id, is_active)",
    "CREATE INDEX idx_ne_status ON notification_emails(status)",
    "CREATE INDEX idx_ne_user_created ON notification_emails(user_id, created_at)",
    # Component C3
    "CREATE INDEX idx_dej_user ON data_export_jobs(user_id, created_at DESC)",
    "CREATE INDEX idx_dej_status ON data_export_jobs(user_id, status)",
    # SaaS Plans / Billing — fast-path plan cache on settings (added here
    # because plan_tiers is created above; same pattern as the transactions
    # recurring_template_id ALTER in Module 2). Fresh tables at setup time,
    # so the FK backfill is trivially satisfied once tiers are seeded.
    "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS plan_code TEXT NOT NULL DEFAULT 'free' REFERENCES plan_tiers(code)",
    "CREATE INDEX IF NOT EXISTS idx_us_plan ON user_settings(plan_code)",
    # One current price per plan (price change = new row + flip, never UPDATE)
    "CREATE UNIQUE INDEX ux_pp_plan_current ON plan_prices(plan_code) WHERE is_current = 1",
    "CREATE INDEX idx_price_plan ON plan_prices(plan_code) WHERE is_current = 1",
    "CREATE INDEX idx_ent_plan ON plan_entitlements(plan_code)",
    # One open subscription per user; Stripe ids unique when present
    "CREATE UNIQUE INDEX ux_ups_user_active ON user_plan_subscriptions(user_id) WHERE status IN ('active','trialing','past_due')",
    "CREATE UNIQUE INDEX ux_ups_provider_sub ON user_plan_subscriptions(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL",
    "CREATE UNIQUE INDEX ux_ups_provider_cust ON user_plan_subscriptions(provider_customer_id) WHERE provider_customer_id IS NOT NULL",
    "CREATE INDEX idx_ups_user_status ON user_plan_subscriptions(user_id, status)",
    "CREATE INDEX idx_be_user ON billing_events(user_id, created_at DESC)",
    "CREATE INDEX idx_pch_user ON plan_change_history(user_id, created_at DESC)",
]

# --------------------------------------------------------------------------
# RLS: helper functions + policies (canonical: data-tables-v2.md RLS section)
# --------------------------------------------------------------------------

RLS_FUNCTIONS_SQL: str = """
CREATE FUNCTION is_group_member(p_group_id UUID) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE AS
  $$ SELECT EXISTS (
       SELECT 1 FROM group_members gm
       WHERE gm.group_id = p_group_id
         AND gm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
         AND gm.status = 'active'
     ) $$;

CREATE FUNCTION is_group_owner(p_group_id UUID) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE AS
  $$ SELECT EXISTS (
       SELECT 1 FROM shared_groups sg
       WHERE sg.id = p_group_id
         AND sg.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::int
     ) $$;
"""

RLS_POLICIES_SQL: list[str] = [
    # D. Identity/owner PK is the user id
    "CREATE POLICY users_isolation ON users USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY user_profiles_isolation ON user_profiles USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY user_settings_isolation ON user_settings USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY auth_tokens_isolation ON auth_tokens USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    # B. System-actor tables
    "CREATE POLICY audit_logs_system_isolation ON audit_logs USING (user_id IS NULL OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id IS NULL OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY access_logs_system_isolation ON access_logs USING (user_id IS NULL OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id IS NULL OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY login_attempts_system_isolation ON login_attempts USING (user_id IS NULL OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id IS NULL OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    # A. Standard user-owned tables
    "CREATE POLICY accounts_user_isolation ON accounts USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY account_balance_history_user_isolation ON account_balance_history USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY transactions_user_isolation ON transactions USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY transactions_group_read ON transactions FOR SELECT USING (group_id IS NOT NULL AND is_group_member(group_id))",
    "CREATE POLICY account_transfers_user_isolation ON account_transfers USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY tags_user_isolation ON tags USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY tags_transactions_user_isolation ON tags_transactions USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY merchant_mappings_user_isolation ON merchant_mappings USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY recurring_transaction_templates_user_isolation ON recurring_transaction_templates USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY import_batches_user_isolation ON import_batches USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY import_errors_user_isolation ON import_errors USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY transaction_splits_user_isolation ON transaction_splits USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY budgets_user_isolation ON budgets USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY budget_alerts_user_isolation ON budget_alerts USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY budget_rollovers_user_isolation ON budget_rollovers USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY budget_items_user_isolation ON budget_items USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY bills_user_isolation ON bills USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY subscriptions_user_isolation ON subscriptions USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY payment_history_user_isolation ON payment_history USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY bill_reminders_user_isolation ON bill_reminders USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY subscription_audits_user_isolation ON subscription_audits USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY goals_user_isolation ON goals USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY goal_contributions_user_isolation ON goal_contributions USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY goal_snapshots_user_isolation ON goal_snapshots USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY goal_milestones_user_isolation ON goal_milestones USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY debts_user_isolation ON debts USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY debt_payments_user_isolation ON debt_payments USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY amortization_schedule_user_isolation ON amortization_schedule USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY tax_investments_user_isolation ON tax_investments USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY salary_structures_user_isolation ON salary_structures USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY itr_documents_user_isolation ON itr_documents USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY investments_user_isolation ON investments USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY investment_transactions_user_isolation ON investment_transactions USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY investment_snapshots_user_isolation ON investment_snapshots USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY investment_price_history_user_isolation ON investment_price_history USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY portfolio_snapshots_user_isolation ON portfolio_snapshots USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY dividend_income_user_isolation ON dividend_income USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY sip_trackers_user_isolation ON sip_trackers USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY net_worth_snapshots_user_isolation ON net_worth_snapshots USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY manual_assets_user_isolation ON manual_assets USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY net_worth_milestones_user_isolation ON net_worth_milestones USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY report_exports_user_isolation ON report_exports USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY secure_notes_user_isolation ON secure_notes USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY note_attachments_user_isolation ON note_attachments USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY calendar_events_user_isolation ON calendar_events USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY notifications_user_isolation ON notifications USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY notification_preferences_user_isolation ON notification_preferences USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY notification_emails_user_isolation ON notification_emails USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY data_export_jobs_user_isolation ON data_export_jobs USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY user_plan_subscriptions_user_isolation ON user_plan_subscriptions USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY billing_events_user_isolation ON billing_events USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY plan_change_history_user_isolation ON plan_change_history USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    # C. System + user scoped tables (user_id nullable; seeded rows visible to all)
    "CREATE POLICY categories_system_isolation ON categories USING (user_id IS NULL OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY goal_templates_system_isolation ON goal_templates USING (user_id IS NULL OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY report_templates_system_isolation ON report_templates USING (user_id IS NULL OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY budget_templates_system_isolation ON budget_templates USING (user_id IS NULL OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::int) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    # E. Shared-group tables (owner writes; members read)
    "CREATE POLICY shared_groups_isolation ON shared_groups USING (owner_id = NULLIF(current_setting('app.current_user_id', true), '')::int OR is_group_member(id)) WITH CHECK (owner_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY group_members_isolation ON group_members USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int OR is_group_owner(group_id)) WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)",
    "CREATE POLICY group_invites_isolation ON group_invites USING (invited_by = NULLIF(current_setting('app.current_user_id', true), '')::int OR is_group_owner(group_id))",
]


def ensure_database() -> str:
    """Create the target database if missing. Returns the dbname to connect to."""
    if DATABASE_URL:
        print("[setup] DATABASE_URL provided — skipping create-database step.")
        return PGDATABASE or urlparse(DATABASE_URL).path.lstrip("/") or "postgres"
    try:
        with psycopg.connect(conninfo_for(PG_ADMIN_DB), autocommit=True) as conn:
            exists = conn.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s", (PGDATABASE,)
            ).fetchone()
            if not exists:
                conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(PGDATABASE)))
                print(f"[setup] Created database '{PGDATABASE}'.")
            else:
                print(f"[setup] Database '{PGDATABASE}' already exists.")
    except psycopg.OperationalError as exc:
        print(f"[setup] WARNING: could not reach maintenance DB ({exc})")
        print(f"[setup] Continuing by connecting directly to '{PGDATABASE}'...")
    return PGDATABASE


def main() -> int:
    t0 = time.perf_counter()
    dbname = ensure_database()

    with psycopg.connect(conninfo_for(dbname), autocommit=True) as conn:
        # 1. Drop all known tables (idempotent; CASCADE handles FK order)
        print("[setup] Dropping existing tables...")
        with conn.cursor() as cur:
            for name, _ in reversed(TABLES):
                cur.execute(sql.SQL("DROP TABLE IF EXISTS {} CASCADE").format(sql.Identifier(name)))
            cur.execute("DROP FUNCTION IF EXISTS is_group_member(UUID)")
            cur.execute("DROP FUNCTION IF EXISTS is_group_owner(UUID)")

        # 1b. Extension used by the trigram GIN indexes (idempotent)
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

        # 2. Create tables in dependency order
        print(f"[setup] Creating {len(TABLES)} tables...")
        with conn.cursor() as cur:
            for name, ddl in TABLES:
                cur.execute(ddl)
                print(f"  + {name}")

        # 3. Create indexes
        print(f"[setup] Creating {len(INDEX_SQL)} indexes...")
        with conn.cursor() as cur:
            for stmt in INDEX_SQL:
                cur.execute(stmt)

        # 4. RLS helper functions + policies
        print("[setup] Creating RLS helper functions...")
        with conn.cursor() as cur:
            cur.execute(RLS_FUNCTIONS_SQL)
        print(f"[setup] Creating {len(RLS_POLICIES_SQL)} RLS policies...")
        with conn.cursor() as cur:
            for stmt in RLS_POLICIES_SQL:
                cur.execute(stmt)

        # 5. Enable RLS on every user-owned table
        user_tables = [name for name, _ in TABLES
                       if name not in ("account_types", "debt_types", "tax_sections",
                                       "tax_regime_slabs", "note_templates",
                                       "plan_tiers", "plan_features",
                                       "plan_entitlements", "plan_prices")]
        with conn.cursor() as cur:
            for name in user_tables:
                cur.execute(sql.SQL("ALTER TABLE {} ENABLE ROW LEVEL SECURITY").format(sql.Identifier(name)))

        n = conn.execute(
            "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
        ).fetchone()[0]

    print(f"[setup] Done. {n} tables in 'public' schema. "
          f"Elapsed: {time.perf_counter() - t0:.2f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
