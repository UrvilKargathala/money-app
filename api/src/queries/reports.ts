import { query } from "../db";
import { isoDate } from "../utils/format";
import { round2 } from "../utils/finance";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type DateRange = { from: string; to: string };

export function resolveRange(
  monthsBack: number | null,
  fromParam: string | null,
  toParam: string | null
): DateRange {
  if (fromParam && toParam) return { from: fromParam, to: toParam };
  const to = new Date();
  const months = monthsBack ?? 6;
  const from = new Date(to.getFullYear(), to.getMonth() - months + 1, 1);
  return { from: isoDate(from), to: isoDate(to) };
}

export type CashflowMonth = {
  month: string;
  income: number;
  expense: number;
  net: number;
};

/** Monthly income vs expense buckets across the range (FR-10.1). */
export async function getCashflow(
  userId: number,
  range: DateRange,
  q: Queryable = DB
): Promise<CashflowMonth[]> {
  const result = await q.query<{
    month: string;
    income: string;
    expense: string;
  }>(
    `SELECT TO_CHAR(date, 'YYYY-MM') AS month,
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0)::text AS income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0)::text AS expense
     FROM transactions
     WHERE user_id = $1 AND type IN ('income','expense')
       AND date >= $2::date AND date <= $3::date
     GROUP BY 1
     ORDER BY 1`,
    [userId, range.from, range.to]
  );
  return result.rows.map((row) => ({
    month: row.month,
    income: Number(row.income),
    expense: Number(row.expense),
    net: round2(Number(row.income) - Number(row.expense)),
  }));
}

export type CategorySlice = {
  category_id: string | null;
  category: string;
  total: number;
  count: number;
  pct: number;
};

async function categoryBreakdown(
  userId: number,
  range: DateRange,
  txnType: "income" | "expense",
  q: Queryable
): Promise<CategorySlice[]> {
  const result = await q.query<{
    category_id: string | null;
    category: string | null;
    total: string;
    count: string;
  }>(
    `SELECT t.category_id,
            COALESCE(c.name, 'Uncategorised') AS category,
            SUM(t.amount)::text AS total,
            COUNT(*)::text AS count
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = $1 AND t.type = $2
       AND t.date >= $3::date AND t.date <= $4::date
     GROUP BY t.category_id, c.name
     ORDER BY SUM(t.amount) DESC`,
    [userId, txnType, range.from, range.to]
  );
  const grandTotal = result.rows.reduce((sum, r) => sum + Number(r.total), 0);
  return result.rows.map((row) => {
    const total = Number(row.total);
    return {
      category_id: row.category_id,
      category: row.category ?? "Uncategorised",
      total: round2(total),
      count: Number(row.count),
      pct: grandTotal > 0 ? round2((total / grandTotal) * 100) : 0,
    };
  });
}

/** Spending breakdown by category (FR-10.2). */
export function getSpendingByCategory(
  userId: number,
  range: DateRange,
  q: Queryable = DB
): Promise<CategorySlice[]> {
  return categoryBreakdown(userId, range, "expense", q);
}

/** Income sources breakdown — zero-income categories never appear (FR-10.11). */
export function getIncomeSources(
  userId: number,
  range: DateRange,
  q: Queryable = DB
): Promise<CategorySlice[]> {
  return categoryBreakdown(userId, range, "income", q);
}

export type TrendPoint = {
  month: string;
  cumulative_spend: number;
  month_spend: number;
};

/** Cumulative spend per month over the trailing window (FR-10.3). */
export async function getSpendingTrend(
  userId: number,
  months: 3 | 6 | 12,
  q: Queryable = DB
): Promise<TrendPoint[]> {
  const flow = await getCashflow(userId, resolveRange(months, null, null), q);
  let running = 0;
  return flow.map((m) => {
    running += m.expense;
    return {
      month: m.month,
      month_spend: m.expense,
      cumulative_spend: round2(running),
    };
  });
}

export type HeatmapDay = {
  date: string;
  total: number;
};

/** Daily spend totals for one calendar month (FR-10.5). */
export async function getSpendingHeatmap(
  userId: number,
  year: number,
  month: number,
  q: Queryable = DB
): Promise<HeatmapDay[]> {
  const result = await q.query<{ date: Date; total: string }>(
    `SELECT date, SUM(amount)::text AS total
     FROM transactions
     WHERE user_id = $1 AND type = 'expense'
       AND EXTRACT(YEAR FROM date) = $2::int
       AND EXTRACT(MONTH FROM date) = $3::int
     GROUP BY date ORDER BY date`,
    [userId, year, month]
  );
  return result.rows.map((row) => ({
    date: isoDate(row.date),
    total: Number(row.total),
  }));
}

export type MerchantRow = {
  merchant: string;
  total: number;
  txn_count: number;
  avg_amount: number;
  recurring: number;
};

/** Top merchants by spend or frequency; >=3 txns flagged recurring (FR-10.12). */
export async function getTopMerchants(
  userId: number,
  range: DateRange,
  options: { limit?: number; sortBy?: "spend" | "frequency" } = {},
  q: Queryable = DB
): Promise<MerchantRow[]> {
  const limit = options.limit ?? 10;
  const order =
    options.sortBy === "frequency" ? "COUNT(*) DESC, SUM(t.amount) DESC" : "SUM(t.amount) DESC";
  const result = await q.query<{
    merchant: string;
    total: string;
    txn_count: string;
  }>(
    `SELECT COALESCE(NULLIF(t.merchant_clean, ''), SPLIT_PART(t.description, ' from ', 2), t.description) AS merchant,
            SUM(t.amount)::text AS total,
            COUNT(*)::text AS txn_count
     FROM transactions t
     WHERE t.user_id = $1 AND t.type = 'expense'
       AND t.date >= $2::date AND t.date <= $3::date
     GROUP BY 1
     ORDER BY ${order}
     LIMIT $4::int`,
    [userId, range.from, range.to, limit]
  );
  return result.rows.map((row) => ({
    merchant: row.merchant ?? "Unknown",
    total: round2(Number(row.total)),
    txn_count: Number(row.txn_count),
    avg_amount: round2(Number(row.total) / Number(row.txn_count)),
    recurring: Number(row.txn_count) >= 3 ? 1 : 0,
  }));
}

/** Combined key metrics for the Summary tab (FR-10.13). */
export async function getReportsSummary(
  userId: number,
  range: DateRange,
  q: Queryable = DB
): Promise<{
  total_income: number;
  total_expense: number;
  net: number;
  top_category: string | null;
  top_merchant: string | null;
  budget_overruns: number;
  net_worth: number;
  debt_outstanding: number;
}> {
  const [cashflow, categories, merchants] = [
    await getCashflow(userId, range, q),
    await getSpendingByCategory(userId, range, q),
    await getTopMerchants(userId, range, { limit: 1 }, q),
  ];
  const income = cashflow.reduce((s, m) => s + m.income, 0);
  const expense = cashflow.reduce((s, m) => s + m.expense, 0);

  const overruns = await q.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM budgets b
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(t.amount), 0) AS spent
       FROM transactions t
       WHERE t.user_id = $1 AND t.type = 'expense'
         AND t.category_id = b.category_id
         AND EXTRACT(YEAR FROM t.date) = b.year
         AND EXTRACT(MONTH FROM t.date) = b.month
     ) s ON true
     WHERE b.user_id = $1 AND b.deleted_at IS NULL
       AND s.spent > b.amount`,
    [userId]
  );

  const nw = await q.query<{ net: string }>(
    `SELECT COALESCE(SUM(current_value), 0)::text AS net
     FROM investments WHERE user_id = $1 AND is_active = 1`,
    [userId]
  );
  const debt = await q.query<{ outstanding: string }>(
    `SELECT COALESCE(SUM(principal_outstanding), 0)::text AS outstanding
     FROM debts WHERE user_id = $1 AND is_active = 1`,
    [userId]
  );

  return {
    total_income: round2(income),
    total_expense: round2(expense),
    net: round2(income - expense),
    top_category: categories[0]?.category ?? null,
    top_merchant: merchants[0]?.merchant ?? null,
    budget_overruns: Number(overruns.rows[0]?.count ?? 0),
    net_worth: Number(nw.rows[0]?.net ?? 0),
    debt_outstanding: Number(debt.rows[0]?.outstanding ?? 0),
  };
}

export type ExportJobRow = {
  id: string;
  template_id: string | null;
  file_type: "pdf" | "csv";
  date_range_start: string | null;
  date_range_end: string | null;
  created_at: string;
};

function mapExportJob(row: {
  id: string;
  template_id: string | null;
  file_type: string;
  date_range_start: Date | null;
  date_range_end: Date | null;
  created_at: Date;
}): ExportJobRow {
  return {
    id: row.id,
    template_id: row.template_id,
    file_type: row.file_type as "pdf" | "csv",
    date_range_start:
      row.date_range_start === null ? null : isoDate(row.date_range_start),
    date_range_end: row.date_range_end === null ? null : isoDate(row.date_range_end),
    created_at: row.created_at.toISOString(),
  };
}

export async function createExportJob(
  q: Queryable,
  params: {
    userId: number;
    templateId: string | null;
    fileType: "pdf" | "csv";
    rangeStart: string | null;
    rangeEnd: string | null;
  }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO report_exports
       (user_id, template_id, file_type, date_range_start, date_range_end, file_path)
     VALUES ($1, $2::uuid, $3, $4::date, $5::date, 'regenerated-on-download')
     RETURNING id`,
    [
      params.userId, params.templateId, params.fileType,
      params.rangeStart, params.rangeEnd,
    ]
  );
  return result.rows[0].id;
}

export async function listExportJobs(
  userId: number,
  q: Queryable = DB
): Promise<ExportJobRow[]> {
  const result = await q.query<{
    id: string;
    template_id: string | null;
    file_type: string;
    date_range_start: Date | null;
    date_range_end: Date | null;
    created_at: Date;
  }>(
    `SELECT id, template_id, file_type, date_range_start, date_range_end, created_at
     FROM report_exports WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 100`,
    [userId]
  );
  return result.rows.map(mapExportJob);
}

export async function getExportJob(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<ExportJobRow | null> {
  const result = await q.query<{
    id: string;
    template_id: string | null;
    file_type: string;
    date_range_start: Date | null;
    date_range_end: Date | null;
    created_at: Date;
  }>(
    `SELECT id, template_id, file_type, date_range_start, date_range_end, created_at
     FROM report_exports WHERE user_id = $1 AND id = $2::uuid`,
    [userId, id]
  );
  return result.rowCount === 1 ? mapExportJob(result.rows[0]) : null;
}
