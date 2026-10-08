import { query } from "../db";

export type ForecastTotals = {
  months_with_data: number;
  income_total: string;
  expense_total: string;
};

/** Three complete calendar months of income/expense totals (FR forecast). */
export async function getForecastTotals(userId: number): Promise<ForecastTotals | null> {
  const result = await query<ForecastTotals>(
    `SELECT COUNT(DISTINCT date_trunc('month', date))::int AS months_with_data,
    COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0)::numeric(14,2) AS income_total,
    COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0)::numeric(14,2) AS expense_total
    FROM transactions WHERE user_id=$1 AND type IN ('income','expense') AND date >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months' AND date < date_trunc('month', CURRENT_DATE)`,
    [userId]
  );
  return result.rows[0] ?? null;
}
