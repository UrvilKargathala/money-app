/**
 * Canonical UI entity types (wire shapes: pg NUMERIC arrives as string —
 * coerce with Number() at render, never in these types). Replaces 15+
 * copy-pasted `type Bill/Sub/Goal/...` blocks that drifted apart.
 * The tax module's `Investment` is a different entity and keeps its own type.
 */

export type TxnTag = { id: string; name: string; color: string | null };

export type Txn = {
  id: string;
  account_id: string;
  type: string;
  amount: string;
  description: string | null;
  merchant_clean: string | null;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  date: string;
  notes: string | null;
  account_name: string;
  account_color: string | null;
  version: number;
  source: string;
  needs_review: number;
  tags: TxnTag[];
};

export type Account = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  balance: number;
  credit_limit: number | null;
  color: string | null;
  is_active: number;
  display_name: string;
  is_asset: number;
  version: number;
  opening_balance: number;
  notes: string | null;
};

export type Bill = {
  id: string;
  name: string;
  amount: number | null;
  estimated_amount: number | null;
  due_day: number;
  frequency: string;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  reminder_days: number;
  is_autopay: number;
  notes: string | null;
  current_period_status: string;
  is_active: number;
  version: number;
  last_paid_date: string | null;
  last_paid_amount: number | null;
};

export type Sub = {
  id: string;
  service_name: string;
  amount: number;
  frequency: string;
  next_renewal_date: string;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  status: string;
  notes: string | null;
  version: number;
  days_until_renewal: number;
  monthly_equivalent: number;
  last_paid_date: string | null;
  last_paid_amount: number | null;
  last_used_at: string | null;
  last_snooze_days: number | null;
  last_snooze_date: string | null;
};

export type Goal = {
  id: string;
  name: string;
  target_amount: number;
  target_date: string;
  priority: string;
  status: string;
  current_amount: number;
  progress_pct: number;
  version: number;
  account_id: string | null;
  notes: string | null;
};

export type Debt = {
  id: string;
  name: string;
  type: string;
  principal_original: string;
  principal_outstanding: string;
  interest_rate: string;
  emi_amount: string;
  tenure_months: number;
  start_date: string;
  version: number;
  account_id: string | null;
  months_remaining?: number | null;
  total_interest_paid?: number | string;
  remaining_interest?: number | null;
  progress_pct?: number | null;
};

export type Investment = {
  id: string;
  name: string;
  type: string;
  category: string;
  units: string;
  buy_price: string;
  current_price: string;
  purchase_date: string;
  maturity_date?: string | null;
  updated_at?: string | null;
  version: number;
};

export type InvestmentRef = { id: string; name: string };
