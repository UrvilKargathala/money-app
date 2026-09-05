-- Additive migration for the existing Neon/PostgreSQL custom-auth schema.
-- No new user-reference columns; existing identities and data are preserved.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_member_number INTEGER;
-- Older deployed schemas predate the existing personalization UI.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS widget_layout JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS haptics_enabled INTEGER NOT NULL DEFAULT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_membership_valid' AND conrelid = 'users'::regclass) THEN
    ALTER TABLE users ADD CONSTRAINT users_membership_valid CHECK (
      (plan_type = 'free' AND billing_cycle IS NULL AND premium_expires_at IS NULL AND legacy_member_number IS NULL)
      OR (plan_type = 'premium' AND (
        (billing_cycle IN ('monthly','annual') AND premium_expires_at IS NOT NULL AND legacy_member_number IS NULL)
        OR (billing_cycle = 'lifetime' AND premium_expires_at IS NULL AND legacy_member_number BETWEEN 1 AND 1000)
      ) AND billing_cycle IS NOT NULL AND (billing_cycle <> 'lifetime' OR legacy_member_number IS NOT NULL))
    );
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS users_legacy_member_unique ON users(legacy_member_number) WHERE legacy_member_number IS NOT NULL;
-- Non-cycling sequence reserves founding numbers atomically. Never recycle numbers.
CREATE SEQUENCE IF NOT EXISTS legacy_member_numbers MINVALUE 1 MAXVALUE 1000 NO CYCLE;

-- Database checks protect ALL write paths, including bulk imports and templates.
-- Serialize writes per user before reading counts; never delete over-limit data.
CREATE OR REPLACE FUNCTION enforce_starter_cap() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE n INTEGER; cap INTEGER; oldrow JSONB; newrow JSONB; predicate TEXT;
BEGIN
  IF (SELECT plan_type FROM users WHERE user_id = NEW.user_id FOR UPDATE) <> 'free' THEN RETURN NEW; END IF;
  newrow := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN oldrow := to_jsonb(OLD); END IF;
  IF TG_TABLE_NAME IN ('accounts','bills','budgets') THEN
    IF COALESCE((newrow->>'is_active')::integer, 0) <> 1 OR newrow->>'deleted_at' IS NOT NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.user_id = NEW.user_id AND (oldrow->>'is_active')::integer = 1 AND oldrow->>'deleted_at' IS NULL
       AND (TG_TABLE_NAME <> 'budgets' OR oldrow->>'category_id' IS NOT DISTINCT FROM newrow->>'category_id') THEN RETURN NEW; END IF;
    predicate := 'is_active = 1';
    IF TG_TABLE_NAME IN ('accounts','budgets') THEN predicate := predicate || ' AND deleted_at IS NULL'; END IF;
    cap := CASE TG_TABLE_NAME WHEN 'accounts' THEN 2 WHEN 'bills' THEN 5 ELSE 2 END;
  ELSIF TG_TABLE_NAME = 'subscriptions' THEN
    IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.user_id = NEW.user_id AND OLD.status <> 'cancelled' THEN RETURN NEW; END IF;
    predicate := 'status <> ''cancelled'''; cap := 3;
  ELSE
    IF NEW.status <> 'active' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.user_id = NEW.user_id AND OLD.status = 'active' THEN RETURN NEW; END IF;
    predicate := 'status = ''active'''; cap := 1;
  END IF;
  IF TG_TABLE_NAME = 'budgets' THEN
    -- A category may be budgeted in multiple months without using extra slots.
    IF EXISTS (SELECT 1 FROM budgets WHERE user_id = NEW.user_id AND id <> NEW.id AND is_active = 1 AND deleted_at IS NULL AND category_id IS NOT DISTINCT FROM NEW.category_id) THEN RETURN NEW; END IF;
    SELECT COUNT(DISTINCT COALESCE(category_id::text, 'overall')) INTO n FROM budgets WHERE user_id = NEW.user_id AND id <> NEW.id AND is_active = 1 AND deleted_at IS NULL;
  ELSE
    EXECUTE format('SELECT count(*) FROM %I WHERE user_id = $1 AND id <> $2 AND %s', TG_TABLE_NAME, predicate) INTO n USING NEW.user_id, NEW.id;
  END IF;
  IF n >= cap THEN RAISE EXCEPTION 'Starter allows % %. Upgrade at /pricing.', cap, TG_TABLE_NAME USING ERRCODE = 'P0001', CONSTRAINT = 'starter_plan_limit'; END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','budgets','bills','subscriptions','goals'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS starter_cap ON %I', t);
    EXECUTE format('CREATE TRIGGER starter_cap BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_starter_cap()', t);
  END LOOP;
END $$;

-- Optional user-supplied usage evidence; payment history alone cannot prove use.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_used_at DATE;
ALTER TABLE subscription_audits ADD COLUMN IF NOT EXISTS detection_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_audit_detection_unique ON subscription_audits(user_id, detection_key) WHERE detection_key IS NOT NULL;

CREATE OR REPLACE FUNCTION record_subscription_price_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE previous_monthly NUMERIC; current_monthly NUMERIC;
BEGIN
  IF OLD.amount = NEW.amount AND OLD.frequency = NEW.frequency THEN RETURN NEW; END IF;
  previous_monthly := OLD.amount / CASE OLD.frequency WHEN 'annual' THEN 12 WHEN 'quarterly' THEN 3 ELSE 1 END;
  current_monthly := NEW.amount / CASE NEW.frequency WHEN 'annual' THEN 12 WHEN 'quarterly' THEN 3 ELSE 1 END;
  INSERT INTO subscription_audits (user_id, subscription_id, audit_type, finding, recommendation, potential_savings)
  VALUES (NEW.user_id, NEW.id, 'price_change', format('%s monthly equivalent changed from ₹%s to ₹%s.', NEW.service_name, round(previous_monthly,2), round(current_monthly,2)),
    'Review the price change and whether this service still meets your needs.', greatest(0, current_monthly - previous_monthly));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS subscription_price_change ON subscriptions;
CREATE TRIGGER subscription_price_change AFTER UPDATE OF amount, frequency ON subscriptions FOR EACH ROW EXECUTE FUNCTION record_subscription_price_change();
