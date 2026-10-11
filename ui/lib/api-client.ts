import { cookies } from "next/headers";
import { app } from "@moneymind/api";
import { reportClientError } from "@/lib/error-reporting";

/**
 * Server-only API client. Forwards the session cookie to the Hono backend
 * mounted at /api/[[...route]].
 *
 * Usage in server components:
 *   const data = await apiJson<{ accounts: AccountWithBalance[] }>("/api/accounts");
 *
 * Uses in-process Hono `app.request` instead of HTTP fetch to avoid
 * Vercel edge-cache / internal-fetch issues (local works with localhost:3016
 * but on Vercel a `fetch(https://vercel-url/api/...)` can be cached or miss
 * the cookie). In-process call is always fresh and has no network hop.
 */
async function apiFetch(
  path: string,
  opts?: {
    method?: string;
    json?: unknown;
    body?: BodyInit | Uint8Array;
    headers?: Record<string, string>;
    contentType?: string;
  }
): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const headers: Record<string, string> = {
    cookie: cookieHeader,
    ...opts?.headers,
  };

  let body: BodyInit | string | undefined;
  if (opts?.body !== undefined) {
    body = opts.body as BodyInit;
    if (opts.contentType) headers["content-type"] = opts.contentType;
  } else if (opts?.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts?.headers?.["content-type"]) {
    // keep as-is
  }

  // In-process Hono request - no HTTP, no APP_URL/VERCEL_URL, no edge cache.
  const req = new Request(`http://localhost${path}`, {
    method: opts?.method ?? "GET",
    headers,
    body: body as BodyInit | undefined,
  });
  return app.request(req);
}

export async function apiJson<T>(path: string): Promise<T | null> {
  const res = await apiFetch(path);
  if (!res.ok) { if (res.status >= 500) reportClientError(new Error(`API ${res.status}: ${path}`), { path, status: res.status }); return null; }
  return (await res.json()) as T;
}

export async function apiFetchRaw(
  path: string,
  opts?: { method?: string; json?: unknown; body?: BodyInit | Uint8Array; headers?: Record<string, string>; contentType?: string }
): Promise<Response> {
  if (opts?.body !== undefined || opts?.headers !== undefined || opts?.contentType !== undefined) {
    const response = await apiFetch(path, opts as never);
    if (response.status >= 500) reportClientError(new Error(`API ${response.status}: ${path}`), { path, status: response.status, method: opts?.method });
    return response;
  }
  const response = await apiFetch(path, opts);
  if (response.status >= 500) reportClientError(new Error(`API ${response.status}: ${path}`), { path, status: response.status, method: opts?.method });
  return response;
}

/** POST/PATCH/DELETE-JSON-or-null: shared shape for pure write wrappers. */
export async function postOrNull<T>(path: string, json?: unknown, method = "POST"): Promise<T | null> {
  try {
    const res = await apiFetchRaw(path, { method, json });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Typed wrappers - each returns null on non-2xx so callers can handle gracefully
// ---------------------------------------------------------------------------

export async function getApiUser(): Promise<{
  user_id: number;
  email: string;
  full_name: string | null;
} | null> {
  try {
    const res = await apiFetch("/api/auth/me");
    if (!res.ok) return null;
    const data = (await res.json()) as {
      user?: { user_id: number; email: string; full_name: string | null } | null;
    };
    return data.user ?? null;
  } catch {
    return null;
  }
}

// Server-only plan read for the app shell (seeds MembershipProvider so the
// client skips its /api/users/me/plan fetch on first load).
export async function getMyPlan(): Promise<{
  plan_type: "free" | "premium";
  billing_cycle: "monthly" | "annual" | "lifetime" | null;
} | null> {
  const data = await apiJson<{ plan?: {
    plan_type: "free" | "premium";
    billing_cycle: "monthly" | "annual" | "lifetime" | null;
  } | null }>("/api/users/me/plan");
  return data?.plan ?? null;
}

// Server-only profile read for the app shell (avatar source of truth).
export async function getMyProfile(): Promise<{
  profile: { full_name: string | null; email: string; bio?: string | null; avatar_url?: string | null };
} | null> {
  return apiJson("/api/users/me/profile");
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
// Bills - calendar, upcoming, cashflow, suggest-recurring
// ---------------------------------------------------------------------------

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
  // fallback - some builds expose waterfall via projection endpoint
  return apiJson("/api/bills/cashflow-waterfall");
}

export async function suggestRecurringBillsApi(): Promise<{
  suggestions: { description: string; avg_amount: number; occurrence_count: number }[];
} | null> {
  return postOrNull<{ suggestions: { description: string; avg_amount: number; occurrence_count: number }[]; }>("/api/bills/suggest-recurring", {});
}

// ---------------------------------------------------------------------------
// Subscriptions - payments, snooze, audits
// ---------------------------------------------------------------------------

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

export async function getGoalTemplates(): Promise<{
  templates: { id: string; user_id: number | null; name: string; description: string | null; default_target_amount: number | null; default_timeframe_months: number | null; icon: string | null; is_system: number; version: number }[];
} | null> {
  return apiJson("/api/goals/templates");
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

// ---------------------------------------------------------------------------
// Debts - live wiring: data, dashboard, DTI, combined timeline, health
// ---------------------------------------------------------------------------

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
// Tax - full wiring: salary, compare, suggestions, ITR, financial years, slabs
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

export async function getNetWorthData(): Promise<{
  net_worth: number;
  assets: number;
  liabilities: number;
  breakdown: unknown[];
} | null> {
  return apiJson("/api/net-worth");
}

export async function getNetWorthTrend(range?: string): Promise<{ trend: { date: string; assets_total: number; liabilities_total: number; net_worth: number }[] } | null> {
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
// Notes - trash, categories, templates, attachments, vault
// ---------------------------------------------------------------------------

export async function getNotesTrash(): Promise<{
  notes: { id: string; title: string; category: string; is_pinned: number; version: number; created_at: string; deleted_at?: string | null }[];
} | null> {
  return apiJson("/api/notes/trash");
}

export async function getNoteCategories(): Promise<{
  categories: { name: string; count: number; seeded: boolean }[];
} | null> {
  return apiJson("/api/notes/categories");
}

export async function getNoteTemplates(): Promise<{
  templates: { template_code: string; name: string; description: string | null; fields: { fields?: { key: string; label: string }[] } | null }[];
} | null> {
  return apiJson("/api/note-templates");
}

// Server-only user-template read (used by the notes page). Mutations live in
// "@/lib/note-user-templates", which is client-safe. NOTE: this module must
// stay server-only (next/headers + API app imports) - no "use client" module
// may import it, or the browser bundle breaks at runtime.
export type NoteUserTemplate = { id: string; title: string; category: string; content: string; version: number };

export async function getNoteUserTemplates(): Promise<{ templates: NoteUserTemplate[] } | null> {
  return apiJson("/api/notes/templates");
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

export async function getCalendarTaxDeadlines(year?: number): Promise<{
  year: number;
  deadlines: { date: string; label: string; description: string; past: boolean }[];
} | null> {
  const qs = year ? `?year=${year}` : "";
  return apiJson(`/api/calendar/tax-deadlines${qs}`);
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

export async function getNotificationsData(): Promise<{
  notifications: { id: string; title: string; message: string; type: string; is_read: number; is_dismissed: number; created_at: string }[];
  total: number;
} | null> {
  return apiJson("/api/notifications");
}

export async function getNotificationsUnreadCount(): Promise<{ unread_count: number; count?: number } | null> {
  return apiJson("/api/notifications/unread-count");
}

export async function getNotificationPreferences(): Promise<{
  preferences: { notification_type: string; channel: string; is_enabled: boolean }[];
  emailLocked: boolean;
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

export async function getSettings(): Promise<unknown | null> {
  return apiJson("/api/users/me/settings");
}

export async function getBillingProfile(month?: number, year?: number): Promise<{
  plan: { code: string; name: string; interval: string };
  status: string;
  source: string;
  trial: { active: boolean; endsAt: string | null; daysLeft: number };
  price: { amountInr: number; perText: string; stripePriceId: string | null };
  entitlements: Record<string, { allowed: boolean; limit: number | null; used: number | null; mode: string | null }>;
  locks: Record<string, { unlocked: string[]; locked: string[] }>;
  plans: { code: string; name: string; priceInr: number; perText: string; interval: string; stripePriceId: string | null }[];
} | null> {
  const qs = month != null && year != null ? `?month=${month}&year=${year}` : "";
  return apiJson(`/api/users/me/subscription${qs}`);
}

// NOTE: billing checkout for client components lives in `@/lib/billing-client`
// (plain fetch). Do NOT add it here — api-client.ts is server-only
// (next/headers) and cannot be imported from "use client" components.

// ---------------------------------------------------------------------------
// Auth full wiring - forgot/reset, magic-link, verify-email, change-password,
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
  return postOrNull<{ success: boolean }>(`/api/users/me/sessions/${id}`, undefined, "DELETE");
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
// C3 - Data Export Component: jobs, modules, status, full-archive
// All wrappers return null on non-2xx per project convention.
// ---------------------------------------------------------------------------

export type ExportModuleInfo = { name: string; label: string; columns?: { key: string; label: string }[]; description?: string | null };
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
