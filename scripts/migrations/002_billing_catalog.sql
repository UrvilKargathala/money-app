-- Billing catalog added independently so older Neon databases can use the
-- current entitlement/report code without rebuilding user data.
CREATE TABLE IF NOT EXISTS plan_tiers (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS plan_features (
  key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plan_entitlements (
  plan_code TEXT NOT NULL REFERENCES plan_tiers(code),
  feature_key TEXT NOT NULL REFERENCES plan_features(key),
  allowed INTEGER NOT NULL DEFAULT 1,
  limit_value INTEGER,
  mode TEXT,
  PRIMARY KEY (plan_code, feature_key)
);
CREATE TABLE IF NOT EXISTS plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code TEXT NOT NULL REFERENCES plan_tiers(code),
  price_inr NUMERIC(10,2) NOT NULL DEFAULT 0,
  per_text TEXT NOT NULL DEFAULT '',
  interval TEXT NOT NULL DEFAULT 'none',
  billing_periods INTEGER,
  stripe_price_id TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  is_current INTEGER NOT NULL DEFAULT 1,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_to TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS user_plan_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES plan_tiers(code),
  status TEXT NOT NULL DEFAULT 'active',
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  price_id UUID REFERENCES plan_prices(id),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  canceled_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ups_user_active ON user_plan_subscriptions(user_id) WHERE status IN ('active','trialing','past_due');

INSERT INTO plan_tiers(code,name,sort_order) VALUES ('free','Free',1),('monthly','Monthly',2),('annual','Annual',3),('lifetime','Lifetime',4) ON CONFLICT DO NOTHING;
INSERT INTO plan_features(key,kind,description) VALUES
('accounts','count','Number of accounts'),('budgets','count','Budgets'),('bill_reminders','count','Bill reminders'),('tracker_subscriptions','count','Tracked subscriptions'),('goals_active','count','Active goals'),('investments','boolean','Investments'),('debts','boolean','Debt planner'),('tax','boolean','Tax planner'),('reports_widgets','boolean','Reports'),('export_batch','mode','Export center'),('notifications_email','mode','Email notifications'),('cross_device_sync','boolean','Cross-device sync'),('subscription_audits','boolean','Subscription audits') ON CONFLICT DO NOTHING;
-- All features remain open during the pre-launch phase. Limits can be applied
-- later by updating these rows without changing application code.
INSERT INTO plan_entitlements(plan_code,feature_key,allowed,limit_value,mode)
SELECT tier.code, feature.key, 1, NULL,
  CASE WHEN feature.key='export_batch' THEN 'full' WHEN feature.key='notifications_email' THEN 'in_app_email' ELSE NULL END
FROM plan_tiers tier CROSS JOIN plan_features feature
ON CONFLICT(plan_code,feature_key) DO UPDATE SET allowed=1, limit_value=NULL, mode=EXCLUDED.mode;
INSERT INTO plan_prices(plan_code,price_inr,per_text,interval)
SELECT code, CASE code WHEN 'monthly' THEN 300 WHEN 'annual' THEN 2400 WHEN 'lifetime' THEN 3500 ELSE 0 END,
  CASE code WHEN 'monthly' THEN 'per month' WHEN 'annual' THEN 'per year' WHEN 'lifetime' THEN 'one-time' ELSE 'free' END,
  CASE code WHEN 'monthly' THEN 'monthly' WHEN 'annual' THEN 'annual' WHEN 'lifetime' THEN 'lifetime' ELSE 'none' END
FROM plan_tiers t WHERE NOT EXISTS (SELECT 1 FROM plan_prices p WHERE p.plan_code=t.code AND p.is_current=1);
