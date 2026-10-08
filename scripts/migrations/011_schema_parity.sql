-- 011: schema parity for databases created before the canonical
-- definitions in db_setup.py grew these columns/tables. Brings older DBs
-- (notably prod Neon) level with fresh setups. All statements idempotent.
--
-- Missing columns in existing tables.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS shortcuts_enabled INTEGER DEFAULT 1;

-- Missing tables (canonical DDL mirrors db_setup.py exactly).
CREATE TABLE IF NOT EXISTS billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'stripe',
    event_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS plan_change_history (
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
);
CREATE TABLE IF NOT EXISTS scan_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'review'
        CHECK (status IN ('review','confirmed','partial','discarded')),
    total_cards INTEGER NOT NULL DEFAULT 0,
    confirmed_count INTEGER NOT NULL DEFAULT 0,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS scan_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES scan_jobs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'review'
        CHECK (status IN ('review','ready','confirmed','discarded')),
    merchant TEXT,
    date DATE,
    amount NUMERIC(12,2),
    currency TEXT NOT NULL DEFAULT 'INR',
    category_guess TEXT,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    tax_amount NUMERIC(12,2),
    utr TEXT,
    gstin TEXT,
    confidence NUMERIC(5,2),
    source_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
    flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Dependent indexes (mirror INDEX_SQL in db_setup.py).
CREATE INDEX IF NOT EXISTS idx_bills_user_created ON bills(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_user_created ON subscriptions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goals_user_created ON goals(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pp_plan_current ON plan_prices(plan_code) WHERE is_current = 1;
CREATE INDEX IF NOT EXISTS idx_scan_jobs_user ON scan_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_jobs_status ON scan_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_scan_cards_job ON scan_cards(job_id);
CREATE INDEX IF NOT EXISTS idx_scan_cards_user_status ON scan_cards(user_id, status);
CREATE INDEX IF NOT EXISTS idx_be_user ON billing_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pch_user ON plan_change_history(user_id, created_at DESC);
