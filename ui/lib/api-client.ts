import { cookies } from "next/headers";

/**
 * Server-only API client. Forwards the session cookie to the Hono backend
 * mounted at /api/[[...route]].
 *
 * Usage in server components:
 *   const data = await apiJson<{ accounts: AccountWithBalance[] }>("/api/accounts");
 */
async function apiFetch(
  path: string,
  opts?: { method?: string; json?: unknown; headers?: Record<string, string> }
): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const headers: Record<string, string> = {
    cookie: cookieHeader,
    ...opts?.headers,
  };

  let body: string | undefined;
  if (opts?.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  }

  // Use absolute URL so it hits the bridge route in the same Next.js process.
  // On Vercel, APP_URL should be https://<your>.vercel.app; fallback to VERCEL_URL if set.
  const rawBase =
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    `http://localhost:${process.env.PORT || 3016}`;
  // Ensure base has no trailing slash duplication
  const base = rawBase.replace(/\/$/, "");
  const url = path.startsWith("http") ? path : `${base}${path}`;

  return fetch(url, {
    method: opts?.method ?? "GET",
    headers,
    body,
    cache: "no-store",
  });
}

export async function apiJson<T>(path: string): Promise<T | null> {
  const res = await apiFetch(path);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function apiFetchRaw(
  path: string,
  opts?: { method?: string; json?: unknown; body?: BodyInit | Uint8Array; headers?: Record<string, string>; contentType?: string }
): Promise<Response> {
  if (opts?.body !== undefined || opts?.headers !== undefined || opts?.contentType !== undefined) {
    return apiFetch(path, opts as never);
  }
  return apiFetch(path, opts);
}

// ---------------------------------------------------------------------------
// Typed wrappers — each returns null on non-2xx so callers can handle gracefully
// ---------------------------------------------------------------------------

export async function getApiUser(): Promise<{
  user_id: number;
  email: string;
  full_name: string | null;
} | null> {
  try {
    const res = await apiFetch("/api/auth/me");
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { user_id: number; email: string; full_name: string | null } } & {
      user_id?: number;
      email?: string;
      full_name?: string | null;
    };
    // Handle both { user: {...} } and direct { user_id, email, ... }
    if (data.user) return data.user;
    if (data.user_id != null) return data as { user_id: number; email: string; full_name: string | null };
    return null;
  } catch {
    return null;
  }
}

export async function getAccountsData(): Promise<{
  accounts: {
    id: string;
    name: string;
    type: string;
    institution: string | null;
    opening_balance: number;
    credit_limit: number | null;
    balance: number;
    color: string | null;
    is_active: number;
    display_name: string;
    icon: string;
    is_asset: number;
  }[];
  types: { type_code: string; display_name: string; icon: string; is_asset: number }[];
} | null> {
  const data = await apiJson<{
    accounts: {
      id: string;
      name: string;
      type: string;
      institution: string | null;
      opening_balance: string;
      credit_limit: string | null;
      balance: string;
      color: string | null;
      is_active: number;
      display_name: string;
      icon: string;
      is_asset: number;
    }[];
    types: { type_code: string; display_name: string; icon: string; is_asset: number }[];
  }>("/api/accounts");
  if (!data) return null;
  return {
    accounts: data.accounts.map((a) => ({
      ...a,
      opening_balance: Number(a.opening_balance),
      credit_limit: a.credit_limit != null ? Number(a.credit_limit) : null,
      balance: Number(a.balance),
    })),
    types: data.types,
  };
}

export async function getAccountSummary(): Promise<{
  summary: { total_assets: number; total_liabilities: number; net_worth: number; account_count: number };
} | null> {
  return apiJson("/api/accounts/summary");
}

export async function getAccountTypes(): Promise<{ types: unknown[] } | null> {
  return apiJson("/api/account-types");
}

export async function getTransactionsData(params?: URLSearchParams): Promise<{
  transactions: {
    id: string;
    account_id: string;
    type: string;
    amount: string;
    description: string | null;
    merchant_clean: string | null;
    category_id: string | null;
    category_name: string | null;
    category_icon: string | null;
    category_color: string | null;
    date: string;
    notes: string | null;
    account_name: string;
    account_color: string | null;
    transfer_group_id: string | null;
    version: number;
    tags: { id: string; name: string; color: string | null }[];
  }[];
  summary: { income: number; expense: number; net: number; count: number };
  total: number;
  page: number;
  pageSize: number;
} | null> {
  const qs = params ? `?${params.toString()}` : "";
  return apiJson(`/api/transactions${qs}`);
}

export async function getTransactionSummary(params?: URLSearchParams): Promise<{
  income: number;
  expense: number;
  net: number;
  count: number;
} | null> {
  const qs = params ? `?${params.toString()}` : "";
  const data = await apiJson<{ summary: { income: number; expense: number; net: number; count: number } }>(
    `/api/transactions/summary${qs}`
  );
  return data?.summary ?? null;
}

export async function getCategories(): Promise<
  { categories: { id: string; name: string; parent_id: string | null; color: string | null; icon: string | null; is_system: number }[] } | null
> {
  return apiJson("/api/categories");
}

export async function getTags(): Promise<{ tags: { id: string; name: string; color: string | null }[] } | null> {
  return apiJson("/api/tags");
}

export async function getRecentMerchants(): Promise<{ merchants: string[] } | null> {
  return apiJson("/api/transactions/merchants/recent");
}

export async function getBudgetsData(
  month: number,
  year: number
): Promise<{
  budgets: {
    id: string;
    category_id: string | null;
    category_name: string | null;
    category_icon: string | null;
    category_color: string | null;
    amount: string;
    spent: number;
    remaining: number;
    utilization_pct: number;
    is_over_budget: number;
    month: number;
    year: number;
    version: number;
  }[];
} | null> {
  const data = await apiJson<{
    budgets: {
      id: string;
      category_id: string | null;
      category_name: string | null;
      category_icon: string | null;
      category_color: string | null;
      amount: string;
      spent: number;
      remaining: number;
      utilization_pct: number;
      is_over_budget: number;
      month: number;
      year: number;
      version: number;
    }[];
  }>(`/api/budgets?month=${month}&year=${year}`);
  return data;
}

export async function getBudgetOverview(
  month: number,
  year: number
): Promise<{
  overview: {
    month: number;
    year: number;
    total_budgeted: number;
    total_spent: number;
    utilization_pct: number;
    over_budget_count: number;
    budgeted_count: number;
    unbudgeted: { category_id: string; name: string; icon: string | null; color: string | null; spent: number }[];
  };
} | null> {
  return apiJson(`/api/budgets/overview?month=${month}&year=${year}`);
}

export async function getBudgetBreakdown(id: string): Promise<{ breakdown: { category_id: string; name: string; icon: string | null; color: string | null; spent: number; share_pct: number }[] } | null> {
  return apiJson(`/api/budgets/${id}/breakdown`);
}

export async function getBillsData(): Promise<{
  bills: {
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
  }[];
} | null> {
  return apiJson("/api/bills");
}

export async function getBillsOverview(): Promise<{
  overview: {
    total_monthly_obligation: number;
    due_this_week: number;
    overdue_count: number;
    upcoming: { type: string; id: string; label: string; amount: number; due_date: string; status: string }[];
  };
} | null> {
  return apiJson("/api/bills/overview");
}

// ---------------------------------------------------------------------------
// Bills — full wiring: payments, YoY, calendar, upcoming, cashflow, reminders,
// suggest-recurring + export href helpers
// ---------------------------------------------------------------------------

export async function getBillPayments(billId: string): Promise<{
  payments: {
    id: string;
    payable_type: string;
    payable_id: string;
    transaction_id: string | null;
    amount: number;
    period_label: string;
    period_month: number;
    period_year: number;
    notes: string | null;
    created_at: string;
  }[];
} | null> {
  return apiJson(`/api/bills/${billId}/payments`);
}

export async function getBillPaymentsYoY(billId: string): Promise<{
  current: { year: number; total: number };
  previous: { year: number; total: number };
} | null> {
  return apiJson(`/api/bills/${billId}/payments/yoy`);
}

export function getBillPaymentsExportHref(billId: string): string {
  return `/api/bills/${billId}/payments/export`;
}

export async function getBillsCalendar(): Promise<{
  events: { bill_id: string; name: string; amount: number; due_date: string; days_until: number; status: string }[];
} | null> {
  return apiJson("/api/bills/calendar");
}

export async function getBillsUpcoming(): Promise<{
  items: { bill_id: string; name: string; amount: number; due_date: string; days_until: number; status: string }[];
} | null> {
  return apiJson("/api/bills/upcoming");
}

export async function getBillsCashflowProjection(): Promise<{
  projection: { month: string; total: number }[];
} | null> {
  return apiJson("/api/bills/cashflow-projection");
}

export async function getBillsCashflowWaterfall(): Promise<{
  projection: { month: string; total: number }[];
  waterfall?: { month: string; total: number; cumulative: number }[];
  months?: { month: string; total: number }[];
} | null> {
  const direct = await apiJson<{
    projection: { month: string; total: number }[];
    waterfall?: { month: string; total: number; cumulative: number }[];
  }>("/api/bills/cashflow-waterfall");
  if (direct) return direct;
  // fallback — some builds expose waterfall via projection endpoint
  return apiJson("/api/bills/cashflow-waterfall");
}

export async function getBillReminders(billId: string): Promise<{
  reminders: { id: string; bill_id: string; days_before: number; channel: string; is_enabled: number }[];
} | null> {
  return apiJson(`/api/bills/${billId}/reminders`);
}

export async function createBillReminderApi(
  billId: string,
  payload: { days_before: number; channel?: string; is_enabled?: number }
): Promise<{ success: boolean; reminder: { id: string } } | null> {
  try {
    const res = await apiFetchRaw(`/api/bills/${billId}/reminders`, { method: "POST", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean; reminder: { id: string } };
  } catch {
    return null;
  }
}

export async function updateBillReminderApi(
  billId: string,
  reminderId: string,
  payload: { days_before: number; is_enabled?: number }
): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/bills/${billId}/reminders/${reminderId}`, { method: "PATCH", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function deleteBillReminderApi(billId: string, reminderId: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/bills/${billId}/reminders/${reminderId}`, { method: "DELETE" });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function suggestRecurringBillsApi(): Promise<{
  suggestions: { description: string; avg_amount: number; occurrence_count: number }[];
} | null> {
  try {
    const res = await apiFetchRaw("/api/bills/suggest-recurring", { method: "POST", json: {} });
    if (!res.ok) return null;
    return (await res.json()) as { suggestions: { description: string; avg_amount: number; occurrence_count: number }[] };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Subscriptions — payments, snooze, audits
// ---------------------------------------------------------------------------

export async function getSubscriptionPayments(subscriptionId: string): Promise<{
  payments: {
    id: string;
    payable_type: string;
    payable_id: string;
    transaction_id: string | null;
    amount: number;
    period_label: string;
    period_month: number;
    period_year: number;
    notes: string | null;
    created_at: string;
  }[];
} | null> {
  return apiJson(`/api/subscriptions/${subscriptionId}/payments`);
}

export function getSubscriptionPaymentsExportHref(subscriptionId: string): string {
  return `/api/subscriptions/${subscriptionId}/payments/export`;
}

export async function snoozeSubscriptionApi(subscriptionId: string, days = 7): Promise<{ success: boolean; next_renewal_date: string } | null> {
  try {
    const res = await apiFetchRaw(`/api/subscriptions/${subscriptionId}/snooze`, { method: "POST", json: { days } });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean; next_renewal_date: string };
  } catch {
    return null;
  }
}

export async function getSubscriptionAudits(): Promise<{
  audits: {
    id: string;
    subscription_id: string;
    audit_type: string;
    finding: string | null;
    recommendation: string | null;
    potential_savings: number | null;
    is_dismissed: number;
    created_at: string;
  }[];
} | null> {
  // primary
  const direct = await apiJson<{
    audits: {
      id: string;
      subscription_id: string;
      audit_type: string;
      finding: string | null;
      recommendation: string | null;
      potential_savings: number | null;
      is_dismissed: number;
      created_at: string;
    }[];
  }>("/api/subscriptions/audits");
  if (direct) return direct;
  // fallback: some deployments mount at /api/subscription-audits
  return apiJson("/api/subscription-audits");
}

export async function dismissSubscriptionAuditApi(auditId: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/subscriptions/audits/${auditId}/dismiss`, { method: "POST", json: {} });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function getSubscriptionsData(): Promise<{
  subscriptions: {
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
    last_paid_date: string | null;
    last_paid_amount: number | null;
    monthly_equivalent: number;
    days_until_renewal: number;
  }[];
} | null> {
  return apiJson("/api/subscriptions");
}

export async function getSubscriptionsMonthlyBurn(): Promise<{ monthly_burn: number } | null> {
  return apiJson("/api/subscriptions/monthly-burn");
}

export async function getSubscriptionsDueRenewals(): Promise<{
  renewals: { id: string; service_name: string; amount: number; next_renewal_date: string; days_until_renewal: number }[];
} | null> {
  return apiJson("/api/subscriptions/due-renewals");
}

export async function getTransfersData(): Promise<{ transfers: unknown[] } | null> {
  return apiJson("/api/transfers");
}

export async function getGoalsData(): Promise<{
  goals: {
    id: string;
    name: string;
    target_amount: number;
    target_date: string;
    priority: string;
    status: string;
    account_name: string | null;
    current_amount: number;
    progress_pct: number;
    version: number;
    color: string | null;
  }[];
} | null> {
  return apiJson("/api/goals");
}

export async function getGoalsDashboard(): Promise<{
  dashboard: { goal_count: number; total_target: number; total_saved: number; completion_pct: number };
} | null> {
  return apiJson("/api/goals/dashboard");
}

// ---------------------------------------------------------------------------
// Goals — full wiring: progress, feasibility, projection, contributions,
// snapshots, milestones, templates, distribute
// ---------------------------------------------------------------------------

export async function getGoalProgress(id: string): Promise<{
  goal_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  progress_pct: number;
  milestones: { milestone_pct: number; reached_date: string; notified_at: string | null }[];
  snapshots: { date: string; current_amount: number }[];
} | null> {
  return apiJson(`/api/goals/${id}/progress`);
}

export async function getGoalFeasibility(id: string): Promise<{
  goal_id: string;
  status: string;
  required_monthly: number;
  avg_monthly: number;
  projected_date: string | null;
} | null> {
  return apiJson(`/api/goals/${id}/feasibility`);
}

export async function getGoalProjection(id: string): Promise<{
  goal_id: string;
  target_date: string;
  target_amount: number;
  current_amount: number;
  avg_monthly: number;
  months_to_finish: number | null;
  projected_date: string | null;
} | null> {
  return apiJson(`/api/goals/${id}/projection`);
}

export async function getGoalContributions(id: string): Promise<{
  contributions: { id: string; goal_id: string; amount: number; date: string; transaction_id: string | null; notes: string | null }[];
} | null> {
  return apiJson(`/api/goals/${id}/contributions`);
}

export async function createGoalContribution(
  goalId: string,
  payload: { amount: string | number; date: string; notes?: string | null; transaction_id?: string | null }
): Promise<{ success: boolean; contribution: { id: string } } | null> {
  try {
    const res = await apiFetchRaw(`/api/goals/${goalId}/contributions`, { method: "POST", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean; contribution: { id: string } };
  } catch {
    return null;
  }
}

export async function updateGoalContribution(
  goalId: string,
  contributionId: string,
  payload: { amount?: string | number; date?: string; notes?: string | null }
): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/goals/${goalId}/contributions/${contributionId}`, { method: "PATCH", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function deleteGoalContribution(goalId: string, contributionId: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/goals/${goalId}/contributions/${contributionId}`, { method: "DELETE" });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function createGoalContributionWithTransfer(
  goalId: string,
  payload: { from_account_id: string; to_account_id: string; amount: string | number; date: string; notes?: string | null }
): Promise<{ success: boolean; contribution: { id: string } } | null> {
  try {
    const res = await apiFetchRaw(`/api/goals/${goalId}/contributions/with-transfer`, { method: "POST", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean; contribution: { id: string } };
  } catch {
    return null;
  }
}

export async function getGoalSnapshots(id: string): Promise<{
  snapshots: { date: string; current_amount: number }[];
} | null> {
  return apiJson(`/api/goals/${id}/snapshots`);
}

export async function createGoalSnapshot(id: string, date?: string): Promise<{ success: boolean } | null> {
  try {
    const json: Record<string, unknown> = {};
    if (date) json.date = date;
    const res = await apiFetchRaw(`/api/goals/${id}/snapshots`, { method: "POST", json });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function getGoalMilestones(id: string): Promise<{
  milestones: { milestone_pct: number; reached_date: string; notified_at: string | null }[];
} | null> {
  return apiJson(`/api/goals/${id}/milestones`);
}

export async function getGoalTemplates(): Promise<{
  templates: { id: string; user_id: number | null; name: string; description: string | null; default_target_amount: number | null; default_timeframe_months: number | null; icon: string | null; is_system: number; version: number }[];
} | null> {
  return apiJson("/api/goals/templates");
}

export async function createGoalTemplate(payload: {
  name: string;
  description?: string | null;
  default_target_amount?: string | number | null;
  default_timeframe_months?: number | null;
  icon?: string | null;
}): Promise<{ success: boolean; template: { id: string } } | null> {
  try {
    const res = await apiFetchRaw("/api/goals/templates", { method: "POST", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean; template: { id: string } };
  } catch {
    return null;
  }
}

export async function getGoalTemplate(id: string): Promise<{
  template: { id: string; user_id: number | null; name: string; description: string | null; default_target_amount: number | null; default_timeframe_months: number | null; icon: string | null; is_system: number; version: number };
} | null> {
  return apiJson(`/api/goals/templates/${id}`);
}

export async function updateGoalTemplate(
  id: string,
  payload: { name?: string; description?: string | null; default_target_amount?: string | number | null; default_timeframe_months?: number | null; icon?: string | null; version: number }
): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/goals/templates/${id}`, { method: "PATCH", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function deleteGoalTemplate(id: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/goals/templates/${id}`, { method: "DELETE" });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function distributeGoals(amount: number | string): Promise<{
  suggestions: { goal_id: string; name: string; remaining: number; amount: number }[];
} | null> {
  try {
    const res = await apiFetchRaw("/api/goals/distribute", { method: "POST", json: { amount: String(amount) } });
    if (!res.ok) return null;
    return (await res.json()) as { suggestions: { goal_id: string; name: string; remaining: number; amount: number }[] };
  } catch {
    return null;
  }
}

export async function getDebtsData(): Promise<{
  debts: {
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
  }[];
} | null> {
  return apiJson("/api/debts");
}

export async function getDebtsDashboard(): Promise<{
  dashboard: {
    total_outstanding: number;
    total_emi: number;
    total_monthly_emi?: number;
    dti_ratio: number;
    debt_free_date: string | null;
    total_interest_remaining?: number;
    dti?: { dti: number | null; level: string | null; color: string | null };
    active_count?: number;
    closed_count?: number;
    debts?: unknown[];
  };
} | null> {
  return apiJson("/api/debts/dashboard");
}

export async function getDebtTypes(): Promise<{ debt_types: { type_code: string; display_name: string }[] } | null> {
  return apiJson("/api/debt-types");
}

// ---------------------------------------------------------------------------
// Debts — full wiring: amortization, cost-breakdown, prepayment, payments, DTI, strategies, health
// ---------------------------------------------------------------------------

export async function getDebtAmortization(
  debtId: string,
  year?: number
): Promise<{
  debt_id: string;
  schedule_length: number;
  schedule: {
    period: number;
    emi_amount: number;
    principal_part: number;
    interest_part: number;
    outstanding_after: number;
    cumulative_interest: number;
    scheduled_date: string | null;
  }[];
  year_summary?: { year: number; total_emi: number; total_principal: number; total_interest: number } | null;
} | null> {
  const qs = year ? `?year=${year}` : "";
  return apiJson(`/api/debts/${debtId}/amortization${qs}`);
}

export async function regenerateAmortization(
  debtId: string
): Promise<{ success: boolean; periods: number } | null> {
  try {
    const res = await apiFetchRaw(`/api/debts/${debtId}/amortization/regenerate`, { method: "POST", json: {} });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean; periods: number };
  } catch {
    return null;
  }
}

export async function getDebtCostBreakdown(debtId: string): Promise<{
  debt_id: string;
  name: string;
  original_principal: number;
  outstanding_principal: number;
  principal_paid: number;
  interest_paid: number;
  remaining_interest: number;
  total_cost: number;
  principal_pct: number;
  interest_pct: number;
} | null> {
  return apiJson(`/api/debts/${debtId}/cost-breakdown`);
}

export async function simulateDebtPrepayment(
  debtId: string,
  amount: number,
  strategy: "reduce_emi" | "reduce_tenure"
): Promise<{
  simulation: {
    strategy: string;
    prepayment_amount: number;
    new_emi: number;
    new_tenure_months: number;
    months_saved: number;
    interest_saved: number;
    original_interest: number;
    new_interest: number;
    current_debt_free_date: string | null;
    new_debt_free_date: string | null;
  };
} | null> {
  try {
    const res = await apiFetchRaw(`/api/debts/${debtId}/simulate-prepayment`, {
      method: "POST",
      json: { amount: String(amount), strategy },
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      simulation: {
        strategy: string;
        prepayment_amount: number;
        new_emi: number;
        new_tenure_months: number;
        months_saved: number;
        interest_saved: number;
        original_interest: number;
        new_interest: number;
        current_debt_free_date: string | null;
        new_debt_free_date: string | null;
      };
    };
  } catch {
    return null;
  }
}

export async function applyDebtPrepayment(
  debtId: string,
  amount: number,
  date: string,
  notes?: string
): Promise<{ success: boolean; payment: { id: string }; outstanding_after: number } | null> {
  try {
    const res = await apiFetchRaw(`/api/debts/${debtId}/prepayments`, {
      method: "POST",
      json: { amount: String(amount), date, notes: notes || undefined },
    });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean; payment: { id: string }; outstanding_after: number };
  } catch {
    return null;
  }
}

export async function getDebtPayments(debtId: string): Promise<{
  payments: {
    id: string;
    debt_id: string;
    type: string;
    amount: number;
    principal_part: number;
    interest_part: number;
    outstanding_after: number;
    date: string;
    transaction_id: string | null;
    notes: string | null;
  }[];
} | null> {
  return apiJson(`/api/debts/${debtId}/payments`);
}

export async function createDebtPayment(
  debtId: string,
  payload: { amount?: number; date?: string; transaction_id?: string; notes?: string; link_transaction?: boolean }
): Promise<{ success: boolean; payment: { id: string }; outstanding_after: number; is_active: number } | null> {
  try {
    const json: Record<string, unknown> = {};
    if (payload.amount != null) json.amount = String(payload.amount);
    if (payload.date) json.date = payload.date;
    if (payload.transaction_id) json.transaction_id = payload.transaction_id;
    if (payload.notes) json.notes = payload.notes;
    if (payload.link_transaction) json.link_transaction = true;
    const res = await apiFetchRaw(`/api/debts/${debtId}/payments`, { method: "POST", json });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean; payment: { id: string }; outstanding_after: number; is_active: number };
  } catch {
    return null;
  }
}

export async function patchDebtPayment(
  debtId: string,
  paymentId: string,
  payload: { amount?: number; date?: string; notes?: string }
): Promise<{ success: boolean } | null> {
  try {
    const json: Record<string, unknown> = {};
    if (payload.amount != null) json.amount = String(payload.amount);
    if (payload.date) json.date = payload.date;
    if (payload.notes !== undefined) json.notes = payload.notes;
    const res = await apiFetchRaw(`/api/debts/${debtId}/payments/${paymentId}`, { method: "PATCH", json });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function deleteDebtPayment(debtId: string, paymentId: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/debts/${debtId}/payments/${paymentId}`, { method: "DELETE" });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function getDebtPaymentStatus(debtId: string): Promise<{
  debt_id: string;
  missed_count: number;
  months: { month: string; status: string; scheduled_emi: number | null; amount: number | null; period: number | null }[];
} | null> {
  return apiJson(`/api/debts/${debtId}/payment-status`);
}

export async function getDebtsDti(): Promise<{
  monthly_income: number | null;
  total_monthly_emi: number;
  dti: number | null;
  level: string | null;
  color: string | null;
  income_missing: boolean;
} | null> {
  return apiJson("/api/debts/dti");
}

export async function patchMonthlyIncome(monthlyIncome: number | null): Promise<{ success: boolean; monthly_income: number | null } | null> {
  try {
    const res = await apiFetchRaw("/api/users/me/settings/monthly-income", {
      method: "PATCH",
      json: { monthly_income: monthlyIncome === null ? null : String(monthlyIncome) },
    });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean; monthly_income: number | null };
  } catch {
    return null;
  }
}

export async function compareDebtStrategies(extraMonthly: number): Promise<{
  extra_monthly: number;
  baseline: { months_to_debt_free: number; total_interest: number };
  avalanche: { strategy: string; months_to_debt_free: number; total_interest: number; interest_saved: number; debt_free_date: string | null; payoff_order: string[] };
  snowball: { strategy: string; months_to_debt_free: number; total_interest: number; interest_saved: number; debt_free_date: string | null; payoff_order: string[] };
} | null> {
  try {
    const res = await apiFetchRaw("/api/debts/strategies/compare", {
      method: "POST",
      json: { extra_monthly: String(extraMonthly) },
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      extra_monthly: number;
      baseline: { months_to_debt_free: number; total_interest: number };
      avalanche: { strategy: string; months_to_debt_free: number; total_interest: number; interest_saved: number; debt_free_date: string | null; payoff_order: string[] };
      snowball: { strategy: string; months_to_debt_free: number; total_interest: number; interest_saved: number; debt_free_date: string | null; payoff_order: string[] };
    };
  } catch {
    return null;
  }
}

export async function getDebtsCombinedTimeline(): Promise<{
  combined: {
    total_outstanding: number;
    total_monthly_emi: number;
    total_interest_remaining: number;
    debt_free_date: string | null;
    active_count: number;
  };
  timeline: { debt_id: string; name: string; type: string; outstanding: number; emi_amount: number | null; interest_rate: number; months_remaining: number | null; payoff_date: string | null }[];
} | null> {
  return apiJson("/api/debts/combined-timeline");
}

export async function compareCombinedStrategies(extraMonthly: number): Promise<{
  extra_monthly: number;
  baseline: { months_to_debt_free: number; total_interest: number };
  avalanche: { strategy: string; months_to_debt_free: number; total_interest: number; interest_saved: number; debt_free_date: string | null; payoff_order: string[] };
  snowball: { strategy: string; months_to_debt_free: number; total_interest: number; interest_saved: number; debt_free_date: string | null; payoff_order: string[] };
} | null> {
  try {
    const res = await apiFetchRaw("/api/debts/combined/strategies", {
      method: "POST",
      json: { extra_monthly: String(extraMonthly) },
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      extra_monthly: number;
      baseline: { months_to_debt_free: number; total_interest: number };
      avalanche: { strategy: string; months_to_debt_free: number; total_interest: number; interest_saved: number; debt_free_date: string | null; payoff_order: string[] };
      snowball: { strategy: string; months_to_debt_free: number; total_interest: number; interest_saved: number; debt_free_date: string | null; payoff_order: string[] };
    };
  } catch {
    return null;
  }
}

export async function getDebtsHealthAlerts(): Promise<{
  alerts: { type: string; severity: string; details: unknown }[];
  summary: { critical: number; warning: number; info: number };
} | null> {
  return apiJson("/api/debts/health-alerts");
}

export async function getTaxInvestments(fy?: string): Promise<{
  investments: { id: string; section: string; name: string; amount: string; investment_date: string; proof_status: string; financial_year: string; version: number }[];
} | null> {
  const qs = fy ? `?financial_year=${fy}` : "";
  return apiJson(`/api/tax/investments${qs}`);
}

export async function getTaxUtilization(fy: string): Promise<{
  utilization: { section_code: string; section_name: string; limit: number; invested: number; utilization_pct: number }[];
} | null> {
  return apiJson(`/api/tax/utilization?financial_year=${fy}`);
}

export async function getTaxSummary(fy: string): Promise<{
  summary: { financial_year: string; total_invested: number; total_deduction: number };
} | null> {
  return apiJson(`/api/tax/summary?financial_year=${fy}`);
}

export async function getTaxSections(): Promise<{ sections: { section_code: string; section_name: string; limit: number }[] } | null> {
  return apiJson("/api/tax/sections");
}

// ---------------------------------------------------------------------------
// Tax — full wiring: salary, compare, suggestions, ITR, financial years, slabs
// ---------------------------------------------------------------------------

export async function getTaxSalary(fy: string): Promise<{
  financial_year: string;
  salary: {
    id: string;
    user_id: number;
    financial_year: string;
    employment_type: string;
    basic_monthly: number;
    hra_monthly: number | null;
    lta_annual: number | null;
    special_allowances: number | null;
    employer_pf: number | null;
    actual_rent_monthly: number | null;
    other_exemptions: number | null;
    gross_annual_income: number | null;
    additional_income: number | null;
    tds_deducted: number | null;
  } | null;
} | null> {
  return apiJson(`/api/tax/salary?financial_year=${encodeURIComponent(fy)}`);
}

export async function createTaxSalary(payload: {
  financial_year: string;
  employment_type?: string;
  basic_monthly?: string | number | null;
  hra_monthly?: string | number | null;
  lta_annual?: string | number | null;
  special_allowances?: string | number | null;
  employer_pf?: string | number | null;
  actual_rent_monthly?: string | number | null;
  other_exemptions?: string | number | null;
  gross_annual_income?: string | number | null;
  additional_income?: string | number | null;
  tds_deducted?: string | number | null;
}): Promise<{ salary: unknown } | null> {
  try {
    const res = await apiFetchRaw("/api/tax/salary", { method: "POST", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { salary: unknown };
  } catch {
    return null;
  }
}

export async function patchTaxSalary(payload: {
  financial_year: string;
  employment_type?: string;
  basic_monthly?: string | number | null;
  hra_monthly?: string | number | null;
  lta_annual?: string | number | null;
  special_allowances?: string | number | null;
  employer_pf?: string | number | null;
  actual_rent_monthly?: string | number | null;
  other_exemptions?: string | number | null;
  gross_annual_income?: string | number | null;
  additional_income?: string | number | null;
  tds_deducted?: string | number | null;
}): Promise<{ salary: unknown } | null> {
  try {
    const res = await apiFetchRaw("/api/tax/salary", { method: "PATCH", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { salary: unknown };
  } catch {
    return null;
  }
}

export async function getTaxCompare(fy: string): Promise<{
  financial_year: string;
  has_salary: boolean;
  old_regime: { taxable_income: number; total_tax: number; gross_income: number; exemptions: number; tax_before_rebate: number; rebate: number; cess: number; effective_rate: number } | null;
  new_regime: { taxable_income: number; total_tax: number; gross_income: number; exemptions: number; tax_before_rebate: number; rebate: number; cess: number; effective_rate: number } | null;
  savings: number | null;
  recommended: string | null;
  recommended_label: string | null;
} | null> {
  return apiJson(`/api/tax/compare?financial_year=${encodeURIComponent(fy)}`);
}

export async function getTaxSuggestions(fy: string): Promise<{
  financial_year: string;
  suggestions: {
    section: string;
    name: string;
    max_limit: number;
    invested: number;
    remaining: number;
    suggested_amount: number;
    reason: string;
  }[];
} | null> {
  return apiJson(`/api/tax/suggestions?financial_year=${encodeURIComponent(fy)}`);
}

export async function getTaxItr(fy: string): Promise<{
  financial_year: string;
  documents: { id: string; user_id: number; financial_year: string; category: string; document_name: string; status: string; is_suggested: number; notes: string | null }[];
} | null> {
  return apiJson(`/api/tax/itr?financial_year=${encodeURIComponent(fy)}`);
}

export async function getTaxItrCompletion(fy: string): Promise<{
  financial_year: string;
  total: number;
  pending: number;
  collected: number;
  submitted: number;
  completion_pct: number;
} | null> {
  return apiJson(`/api/tax/itr/completion?financial_year=${encodeURIComponent(fy)}`);
}

export async function getTaxFinancialYears(): Promise<{ financial_years: string[] } | null> {
  return apiJson("/api/tax/financial-years");
}

export async function getTaxRegimeSlabs(fy: string, regime?: string): Promise<{
  financial_year: string;
  slabs: { id: string; financial_year: string; regime: string; slab_from: number; slab_to: number | null; rate: number; cess_rate: number }[];
} | null> {
  const qs = new URLSearchParams({ financial_year: fy });
  if (regime) qs.set("regime", regime);
  return apiJson(`/api/tax/regime-slabs?${qs.toString()}`);
}

export async function createTaxItrDocument(payload: {
  financial_year: string;
  category: string;
  document_name: string;
  status: string;
  notes?: string | null;
}): Promise<{ document: unknown } | null> {
  try {
    const res = await apiFetchRaw("/api/tax/itr", { method: "POST", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { document: unknown };
  } catch {
    return null;
  }
}

export async function updateTaxItrDocument(
  id: string,
  payload: Partial<{ financial_year: string; category: string; document_name: string; status: string; notes: string | null }>
): Promise<{ document: unknown } | null> {
  try {
    const res = await apiFetchRaw(`/api/tax/itr/${id}`, { method: "PATCH", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { document: unknown };
  } catch {
    return null;
  }
}

export async function deleteTaxItrDocument(id: string): Promise<{ ok: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/tax/itr/${id}`, { method: "DELETE" });
    if (!res.ok) return null;
    return (await res.json()) as { ok: boolean };
  } catch {
    return null;
  }
}

export async function suggestTaxItrDocuments(fy: string): Promise<{ financial_year: string; created: unknown[]; completion: unknown } | null> {
  try {
    const res = await apiFetchRaw("/api/tax/itr/suggest", { method: "POST", json: { financial_year: fy } });
    if (!res.ok) return null;
    return (await res.json()) as { financial_year: string; created: unknown[]; completion: unknown };
  } catch {
    return null;
  }
}

export async function getInvestmentsData(): Promise<{
  investments: {
    id: string;
    name: string;
    type: string;
    category: string;
    units: string;
    buy_price: string;
    current_price: string;
    purchase_date: string;
    maturity_date: string | null;
    version: number;
  }[];
} | null> {
  return apiJson("/api/investments");
}

export async function getInvestmentsPortfolioSummary(): Promise<{
  summary: { total_invested: number; total_current: number; total_return: number; return_pct: number };
} | null> {
  return apiJson("/api/investments/portfolio-summary");
}

export async function getSipsData(): Promise<{
  sips: {
    id: string;
    investment_id: string;
    investment_name: string;
    amount: string | number;
    frequency: string;
    next_date: string;
    account_id: string | null;
    account_name: string | null;
    status: string;
    start_date: string;
    end_date: string | null;
    notes: string | null;
    days_until_next?: number;
  }[];
} | null> {
  return apiJson("/api/sips");
}

export async function getSipsDue(): Promise<{
  items: { id: string; investment_name: string; amount: number; frequency: string; next_date: string; days_until_next: number }[];
} | null> {
  return apiJson("/api/sips/due");
}

export async function getDividendsData(): Promise<{
  dividends: {
    id: string;
    investment_id: string;
    investment_name: string;
    type: string;
    amount: string | number;
    date: string;
    transaction_id: string | null;
    notes: string | null;
  }[];
} | null> {
  return apiJson("/api/dividends");
}

export async function getPriceHistory(investmentId: string): Promise<{
  price_history: { price: number; date: string }[];
} | null> {
  return apiJson(`/api/investments/${investmentId}/price-history`);
}

export async function getHoldingReturns(investmentId: string): Promise<{
  returns: { xirr_pct: number | null; cagr_pct: number | null; method: string };
} | null> {
  return apiJson(`/api/investments/${investmentId}/returns`);
}

export async function getPortfolioReturns(): Promise<{ xirr_pct: number | null } | null> {
  return apiJson("/api/investments/returns/portfolio");
}

export async function getAssetAllocation(): Promise<{
  allocation: { category: string; value: number; pct: number }[];
} | null> {
  return apiJson("/api/investments/asset-allocation");
}

export async function getPortfolioTrend(range = "6M"): Promise<{
  range: string;
  trend: { date: string; invested: number; value: number }[];
} | null> {
  return apiJson(`/api/investments/portfolio-trend?range=${range}`);
}

export async function getMaturityAlerts(): Promise<{
  alerts: { id: string; name: string; type: string; maturity_date: string; days_until: number }[];
} | null> {
  return apiJson("/api/investments/maturity-alerts");
}

export async function getInvestmentSnapshots(range = "All"): Promise<{
  snapshots: { date: string; total_invested: number; total_current: number }[];
} | null> {
  return apiJson(`/api/investments/snapshots?range=${encodeURIComponent(range)}`);
}

export async function getNetWorthData(): Promise<{
  net_worth: number;
  assets: number;
  liabilities: number;
  breakdown: unknown[];
} | null> {
  return apiJson("/api/net-worth");
}

export async function getNetWorthTrend(range?: string): Promise<{ trend: { date: string; value: number }[] } | null> {
  const qs = range ? `?range=${range}` : "";
  return apiJson(`/api/net-worth/trend${qs}`);
}

export async function getManualAssetsData(): Promise<{
  assets: { id: string; name: string; category: string; valuation: string; acquisition_date: string; version: number }[];
} | null> {
  return apiJson("/api/manual-assets");
}

export async function getReportsSummary(): Promise<{
  summary: { income: number; expense: number; net: number; savings_rate: number };
} | null> {
  const raw = await apiJson<{ summary: Record<string, number> }>("/api/reports/summary");
  if (!raw?.summary) return null;
  const s = raw.summary as Record<string, number>;
  return {
    summary: {
      income: s.total_income ?? s.income ?? 0,
      expense: s.total_expense ?? s.expense ?? 0,
      net: s.net ?? (s.total_income ?? 0) - (s.total_expense ?? 0),
      savings_rate:
        s.savings_rate ??
        (s.total_income && s.total_income > 0 ? ((s.total_income - s.total_expense) / s.total_income) * 100 : 0),
    } as { income: number; expense: number; net: number; savings_rate: number },
  } as { summary: { income: number; expense: number; net: number; savings_rate: number } };
}

export async function getReportsCashflow(): Promise<{ cashflow: { month: string; income: number; expense: number; net: number }[] } | null> {
  return apiJson("/api/reports/cashflow");
}

export async function getReportsSpendingByCategory(): Promise<{
  categories: { category_id: string | null; category: string; total: number; count: number; pct: number }[];
} | null> {
  return apiJson("/api/reports/spending-by-category");
}

export async function getReportsTrends(months = 6): Promise<{
  months: number;
  trend: { month: string; cumulative_spend: number; month_spend: number }[];
} | null> {
  return apiJson(`/api/reports/trends?months=${months}`);
}

export async function getReportsHeatmap(
  year?: number,
  month?: number
): Promise<{ year: number; month: number; days: { date: string; total: number }[] } | null> {
  const params = new URLSearchParams();
  if (year != null) params.set("year", String(year));
  if (month != null) params.set("month", String(month));
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiJson(`/api/reports/heatmap${qs}`);
}

export async function getReportsBudgetVsActual(
  month?: number,
  year?: number
): Promise<{
  month: number;
  year: number;
  budgets: { name: string; category_id: string | null; budgeted: number; actual: number; utilization_pct: number; over_budget: boolean }[];
} | null> {
  const params = new URLSearchParams();
  if (month != null) params.set("month", String(month));
  if (year != null) params.set("year", String(year));
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiJson(`/api/reports/budget-vs-actual${qs}`);
}

export async function getReportsNetWorth(): Promise<{
  series: { date: string; net_worth: number; change_pct: number | null }[];
} | null> {
  return apiJson("/api/reports/net-worth");
}

export async function getReportsTopMerchants(): Promise<{
  merchants: { merchant: string; total: number; txn_count: number; avg_amount: number; recurring: number }[];
} | null> {
  return apiJson("/api/reports/top-merchants");
}

export async function getReportsIncomeSources(): Promise<{
  total_income: number;
  sources: { category_id: string | null; category: string; total: number; count: number; pct: number }[];
} | null> {
  return apiJson("/api/reports/income-sources");
}

export async function getNotesData(): Promise<{
  notes: { id: string; title: string; category: string; is_pinned: number; version: number; created_at: string }[];
} | null> {
  return apiJson("/api/notes");
}

// ---------------------------------------------------------------------------
// Notes — trash, categories, templates, attachments, vault
// ---------------------------------------------------------------------------

export async function getNotesTrash(): Promise<{
  notes: { id: string; title: string; category: string; is_pinned: number; version: number; created_at: string; deleted_at?: string | null }[];
} | null> {
  return apiJson("/api/notes/trash");
}

export async function restoreNoteApi(id: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/notes/${id}/restore`, { method: "POST", json: {} });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function purgeNoteApi(id: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/notes/${id}/purge`, { method: "DELETE" });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function getNoteCategories(): Promise<{ categories: { id: string; name: string }[] } | null> {
  return apiJson("/api/notes/categories");
}

export async function patchNoteCategories(payload: { categories: { id?: string; name: string }[] }): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw("/api/notes/categories", { method: "PATCH", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function getNoteTemplates(): Promise<{
  templates: { id: string; title: string; category: string; content?: string | null }[];
} | null> {
  return apiJson("/api/note-templates");
}

export async function getNoteAttachments(noteId: string): Promise<{
  attachments: { id: string; note_id: string; file_name: string; href?: string }[];
} | null> {
  return apiJson(`/api/notes/${noteId}/attachments`);
}

export function getNoteAttachmentHref(noteId: string): string {
  return `/api/notes/${noteId}/attachments`;
}

export async function deleteNoteAttachmentApi(noteId: string, attachmentId: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/notes/${noteId}/attachments/${attachmentId}`, { method: "DELETE" });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function getVaultWrappedKey(): Promise<{ wrapped_key: string | null } | null> {
  return apiJson("/api/vault/wrapped-key");
}

export async function verifyVaultPasswordApi(password: string): Promise<{ valid: boolean } | null> {
  try {
    const res = await apiFetchRaw("/api/vault/verify-password", { method: "POST", json: { password } });
    if (!res.ok) return null;
    return (await res.json()) as { valid: boolean };
  } catch {
    return null;
  }
}

export type CalendarApiEvent = {
  date: string;
  source: "bill" | "subscription" | "debt_emi" | "sip" | "investment_maturity" | "goal" | "recurring" | "custom" | "tax_deadline" | string;
  label: string;
  kind: "inflow" | "outflow" | "info";
  amount: number | null;
  color: string;
  deep_link: string;
  status?: string;
  event_id?: string;
  account_id?: string | null;
};

export async function getCalendarEvents(month?: number, year?: number): Promise<{
  month: number;
  year: number;
  events: CalendarApiEvent[];
  day_counts: Record<string, number>;
} | null> {
  const qs = month && year ? `?month=${month}&year=${year}` : "";
  return apiJson(`/api/calendar/events${qs}`);
}

export async function getCalendarEventsByDate(date: string): Promise<{
  date: string;
  events: CalendarApiEvent[];
  total_inflow: number;
  total_outflow: number;
} | null> {
  return apiJson(`/api/calendar/events?date=${encodeURIComponent(date)}`);
}

export async function getCalendarMonth(
  month: number,
  year: number
): Promise<{
  month: number;
  year: number;
  events: CalendarApiEvent[];
  day_counts: Record<string, number>;
} | null> {
  return apiJson(`/api/calendar/month/${month}/${year}`);
}

export async function getCalendarTaxDeadlines(year?: number): Promise<{
  year: number;
  deadlines: { date: string; label: string; description: string; past: boolean }[];
} | null> {
  const qs = year ? `?year=${year}` : "";
  return apiJson(`/api/calendar/tax-deadlines${qs}`);
}

export async function duplicateCalendarEvent(id: string): Promise<{ success: boolean; event: { id: string } } | null> {
  try {
    const res = await apiFetchRaw(`/api/calendar/events/${id}/duplicate`, { method: "POST", json: {} });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean; event: { id: string } };
  } catch {
    return null;
  }
}

export async function getCalendarCashflowProjection(days?: number): Promise<{
  projections: {
    account_id: string;
    account_name: string;
    balance_today: number;
    balance_plus7: number;
    balance_plus30: number;
    negative_days: string[];
  }[];
} | null> {
  const window = days === 7 ? 7 : 30;
  const primary = await apiJson<{
    projections: {
      account_id: string;
      account_name: string;
      balance_today: number;
      balance_plus7: number;
      balance_plus30: number;
      negative_days: string[];
    }[];
  }>(`/api/calendar/cashflow-projection?window=${window}`);
  if (primary) return primary;
  return apiJson(`/api/calendar/cashflow-projection?days=${window}`);
}

export async function getCalendarUpcoming(windowDays?: number): Promise<{
  window_days: number;
  net_cashflow: number;
  days: { date: string; inflow_total: number; outflow_total: number; events: CalendarApiEvent[] }[];
} | null> {
  const w = windowDays === 30 ? 30 : windowDays === 7 ? 7 : undefined;
  const qs = w ? `?window=${w}` : "";
  const primary = await apiJson<{
    window_days: number;
    net_cashflow: number;
    days: { date: string; inflow_total: number; outflow_total: number; events: CalendarApiEvent[] }[];
  }>(`/api/calendar/upcoming${qs}`);
  if (primary) return primary;
  if (w) {
    return apiJson(`/api/calendar/upcoming?days=${w}`);
  }
  return apiJson("/api/calendar/upcoming");
}

// Backwards-compat alias — older pages expect { upcoming: ... } shape; map new shape if needed
export async function getCalendarUpcomingLegacy(): Promise<{
  upcoming: { date: string; events: { title: string; amount: number | null; type: string }[]; total: number }[];
} | null> {
  const data = await getCalendarUpcoming();
  if (!data) return null;
  return {
    upcoming: data.days.map((d) => ({
      date: d.date,
      events: d.events.map((e) => ({ title: e.label, amount: e.amount, type: e.source })),
      total: d.outflow_total - d.inflow_total,
    })),
  };
}

export async function getNotificationsData(): Promise<{
  notifications: { id: string; title: string; message: string; type: string; is_read: number; is_dismissed: number; created_at: string }[];
  total: number;
} | null> {
  return apiJson("/api/notifications");
}

export async function getNotificationsUnreadCount(): Promise<{ count: number } | null> {
  return apiJson("/api/notifications/unread-count");
}

export async function getNotificationPreferences(): Promise<{
  preferences: { notification_type: string; channel: string; is_enabled: boolean }[];
} | null> {
  return apiJson("/api/notification-preferences");
}

export async function getNotificationsArchive(params?: {
  search?: string;
  type?: string;
  module?: string;
  page?: number;
  limit?: number;
}): Promise<{
  archive: {
    id: string;
    title: string;
    message: string;
    type: string;
    module: string;
    priority: string;
    is_read: number;
    is_dismissed?: number;
    created_at: string;
    deep_link?: string | null;
  }[];
} | null> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.type) qs.set("type", params.type);
  if (params?.module) qs.set("module", params.module);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const q = qs.toString() ? `?${qs.toString()}` : "";
  return apiJson(`/api/notifications/archive${q}`);
}

export async function getNotificationEmails(limit?: number): Promise<{
  emails: { id: string; email_type: string; recipient: string; status: string; sent_at: string | null; created_at: string }[];
} | null> {
  const qs = limit ? `?limit=${limit}` : "";
  return apiJson(`/api/notification-emails${qs}`);
}

export async function getNotificationsStream(params?: { since?: string }): Promise<{
  latest_server_time: string;
  notifications: { id: string; type: string; title: string; message: string; created_at: string }[];
} | null> {
  const qs = params?.since ? `?since=${encodeURIComponent(params.since)}` : "";
  return apiJson(`/api/notifications/stream${qs}`);
}

export function getNotificationsStreamHref(since?: string): string {
  if (since) return `/api/notifications/stream?since=${encodeURIComponent(since)}`;
  return "/api/notifications/stream";
}

export async function updateNotificationPreferencesApi(payload: {
  preferences: { notification_type: string; channel: string; is_enabled: boolean | number }[];
}): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw("/api/notification-preferences", { method: "PATCH", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function toggleNotificationPreferenceApi(
  type: string,
  channel: string
): Promise<{ success: boolean; is_enabled: boolean } | null> {
  try {
    const res = await apiFetchRaw(
      `/api/notification-preferences/${encodeURIComponent(type)}/${encodeURIComponent(channel)}`,
      { method: "PATCH", json: {} }
    );
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean; is_enabled: boolean };
  } catch {
    return null;
  }
}

export async function previewNotificationEmailApi(payload: {
  type: string;
  title: string;
  message: string;
}): Promise<{ preview: { subject: string; body_html: string; body_text: string } } | null> {
  try {
    const res = await apiFetchRaw("/api/notifications/email/preview", { method: "POST", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { preview: { subject: string; body_html: string; body_text: string } };
  } catch {
    return null;
  }
}

export async function getSettings(): Promise<unknown | null> {
  return apiJson("/api/users/me/settings");
}

// ---------------------------------------------------------------------------
// Auth full wiring — forgot/reset, magic-link, verify-email, change-password,
// profile, sessions, GDPR
// ---------------------------------------------------------------------------

export async function forgotPasswordApi(email: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw("/api/auth/forgot-password", { method: "POST", json: { email } });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function resetPasswordApi(token: string, new_password: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw("/api/auth/reset-password", { method: "POST", json: { token, new_password } });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function changePasswordApi(current_password: string, new_password: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw("/api/auth/change-password", { method: "POST", json: { current_password, new_password } });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function verifyEmailApi(token: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw("/api/auth/verify-email", { method: "POST", json: { token } });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function requestMagicLinkApi(email: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw("/api/auth/magic-link", { method: "POST", json: { email } });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

// Alias required by spec: POST /api/auth/magic-link
export const magicLinkApi = requestMagicLinkApi;

export async function verifyMagicLinkApi(token: string): Promise<{ token: string; maxAge: number } | null> {
  try {
    const res = await apiFetchRaw(`/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`, { method: "GET" });
    if (!res.ok) return null;
    return (await res.json()) as { token: string; maxAge: number };
  } catch {
    return null;
  }
}

export async function getProfileApi(): Promise<{ profile: { user_id: number; email: string; full_name: string | null; bio?: string | null; avatar_url?: string | null } } | null> {
  return apiJson("/api/users/me/profile");
}

export async function patchProfileApi(payload: { full_name?: string | null; bio?: string | null }): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw("/api/users/me/profile", { method: "PATCH", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function getSessionsApi(): Promise<{
  sessions: { id: number; token_id?: number; created_at: string; last_active?: string; ip_address?: string | null; user_agent?: string | null; is_current?: boolean }[];
} | null> {
  return apiJson("/api/users/me/sessions");
}

export async function deleteSessionApi(id: string | number): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/users/me/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function deactivateAccountApi(): Promise<{ success: boolean; message?: string } | null> {
  try {
    const res = await apiFetchRaw("/api/users/me/deactivate", { method: "POST", json: {} });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean; message?: string };
  } catch {
    return null;
  }
}

export async function restoreAccountApi(): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw("/api/users/me/restore", { method: "POST", json: {} });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

// Aliases for task spec naming
export const getProfile = getProfileApi;
export const patchProfile = patchProfileApi;
export const getSessions = getSessionsApi;
export const deleteSession = deleteSessionApi;
export const deactivateAccount = deactivateAccountApi;
export const restoreAccount = restoreAccountApi;

// ---------------------------------------------------------------------------
// C3 — Data Export Component: jobs, modules, status, full-archive
// All wrappers return null on non-2xx per project convention.
// ---------------------------------------------------------------------------

export type ExportModuleInfo = { module: string; label: string; columns?: string[]; column_sets?: string[][]; description?: string | null };
export type ExportJob = {
  id: string;
  status: string;
  format?: string;
  module?: string | null;
  modules?: string[] | null;
  range?: string | null;
  progress?: number | null;
  progress_pct?: number | null;
  download_url?: string | null;
  file_size?: number | null;
  created_at?: string;
  updated_at?: string;
  error?: string | null;
};
export type ExportProgress = { id: string; status: string; progress: number; progress_pct?: number; bytes?: number; size_estimate?: number | null; message?: string | null };
export type ExportStatusInfo = { health: string; queue_depth?: number; queue?: number; active_jobs?: number; last_run?: string | null; pipeline?: string | null; [k: string]: unknown };

export async function getExportModules(): Promise<{ modules: ExportModuleInfo[] } | null> {
  return apiJson("/api/export/modules");
}

export async function getExportStatus(): Promise<ExportStatusInfo | null> {
  return apiJson("/api/export/status");
}

export async function getExportJobs(): Promise<{ jobs: ExportJob[] } | { items: ExportJob[] } | ExportJob[] | null> {
  const data = await apiJson<{ jobs: ExportJob[] } | { items: ExportJob[] } | ExportJob[]>("/api/export/jobs");
  return data;
}

export async function getExportJob(id: string): Promise<{ job: ExportJob } | ExportJob | null> {
  return apiJson(`/api/export/jobs/${encodeURIComponent(id)}`);
}

export async function getExportJobProgress(id: string): Promise<ExportProgress | null> {
  return apiJson(`/api/export/jobs/${encodeURIComponent(id)}/progress`);
}

export function getExportJobDownloadHref(id: string): string {
  return `/api/export/jobs/${encodeURIComponent(id)}/download`;
}

export async function createExportJob(payload: {
  format?: string;
  module?: string;
  modules?: string[];
  range?: string;
  date_from?: string | null;
  date_to?: string | null;
  column_set?: string[] | null;
  [k: string]: unknown;
}): Promise<{ job: ExportJob; success?: boolean } | ExportJob | null> {
  try {
    const res = await apiFetchRaw("/api/export/jobs", { method: "POST", json: payload });
    if (!res.ok) return null;
    return (await res.json()) as { job: ExportJob };
  } catch {
    return null;
  }
}

export async function retryExportJob(id: string): Promise<{ job: ExportJob; success?: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/export/jobs/${encodeURIComponent(id)}/retry`, { method: "POST", json: {} });
    if (!res.ok) return null;
    return (await res.json()) as { job: ExportJob };
  } catch {
    return null;
  }
}

export async function deleteExportJob(id: string): Promise<{ success: boolean } | null> {
  try {
    const res = await apiFetchRaw(`/api/export/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) return null;
    return (await res.json()) as { success: boolean };
  } catch {
    return null;
  }
}

export async function createFullArchive(payload?: Record<string, unknown>): Promise<{ job: ExportJob; archive?: unknown; success?: boolean } | null> {
  try {
    const res = await apiFetchRaw("/api/export/full-archive", { method: "POST", json: payload ?? {} });
    if (!res.ok) return null;
    return (await res.json()) as { job: ExportJob };
  } catch {
    return null;
  }
}

export function getExportFullArchiveHref(): string {
  return "/api/export/full-archive";
}

export { apiFetch };
