-- Persisted saved report filters. Safe to run repeatedly.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS report_filters JSONB NOT NULL DEFAULT '[]'::jsonb;
