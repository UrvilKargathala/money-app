-- 009: user_settings.plan_code backfill + account_types seed + manifest.
-- Code reads/writes user_settings.plan_code (entitlements, billing) but only
-- fresh db_setup added it - migrate.mjs never did, so migrated DBs 500 with
-- "undefined column". The per-request ensureAccountTypesSeeded() INSERT is
-- replaced by this one-time seed (see todo 11). All statements idempotent.
ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS plan_code TEXT NOT NULL DEFAULT 'free' REFERENCES plan_tiers(code);
CREATE INDEX IF NOT EXISTS idx_us_plan ON user_settings(plan_code);

INSERT INTO account_types (type_code, display_name, icon, is_asset, sort_order) VALUES
  ('bank_savings', 'Savings Account', 'wallet', 1, 1),
  ('bank_current', 'Current Account', 'briefcase', 1, 2),
  ('credit_card', 'Credit Card', 'card', 0, 3),
  ('wallet', 'E-Wallet', 'phone', 1, 4),
  ('cash', 'Cash', 'note', 1, 5),
  ('fd', 'Fixed Deposit', 'lock', 1, 6),
  ('ppf', 'PPF Account', 'shield', 1, 7)
ON CONFLICT (type_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
