-- 008: bill_reminders channel + is_enabled (code reads/writes both; the
-- canonical table only had is_active, so reminder create/list 500s).
ALTER TABLE bill_reminders
    ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'in_app';
ALTER TABLE bill_reminders
    ADD COLUMN IF NOT EXISTS is_enabled INTEGER NOT NULL DEFAULT 1;
