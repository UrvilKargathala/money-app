-- Subscription snooze history. Safe to run repeatedly.
CREATE TABLE IF NOT EXISTS subscription_snoozes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    days INTEGER NOT NULL CHECK (days >= 1 AND days <= 90),
    source TEXT NOT NULL CHECK (source IN ('preset','custom')),
    previous_renewal_date DATE NOT NULL,
    new_renewal_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ssn_user_sub_created
    ON subscription_snoozes(user_id, subscription_id, created_at DESC);
ALTER TABLE subscription_snoozes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'subscription_snoozes_user_isolation'
  ) THEN
    CREATE POLICY subscription_snoozes_user_isolation ON subscription_snoozes
      USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)
      WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int);
  END IF;
END $$;
