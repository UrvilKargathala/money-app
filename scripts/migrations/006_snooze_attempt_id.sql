-- Idempotency key for snooze retries. Safe to run repeatedly.
ALTER TABLE subscription_snoozes
  ADD COLUMN IF NOT EXISTS attempt_id TEXT;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'ux_snooze_attempt'
  ) THEN
    -- Days are part of the key: same attempt with changed days is a new
    -- intent and must proceed; only an identical resubmission replays.
    CREATE UNIQUE INDEX ux_snooze_attempt ON subscription_snoozes
      (user_id, subscription_id, attempt_id, days) WHERE attempt_id IS NOT NULL;
  END IF;
END $$;
