import { Hono } from "hono";
import { requireAuth } from "../middleware";
import { requirePremium } from "../entitlements";
import { query } from "../db";

export const forecast = new Hono();
forecast.get("/", requireAuth, requirePremium, async (c) => {
  const result = await query<{ months_with_data: number; income: number; expense: number }>(`SELECT COUNT(DISTINCT date_trunc('month', date))::int AS months_with_data,
    COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0)::float8 / 3 AS income,
    COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0)::float8 / 3 AS expense
    FROM transactions WHERE user_id=$1 AND type IN ('income','expense') AND date >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months' AND date < date_trunc('month', CURRENT_DATE)`, [c.get("user").user_id]);
  const row = result.rows[0];
  if (!row.months_with_data) return c.json({ forecast: null, method: "Add transactions from completed months to see a projection." });
  return c.json({ forecast: { monthly_income: row.income, monthly_expense: row.expense, monthly_net: row.income - row.expense, three_month_net: (row.income - row.expense) * 3 }, method: "Simple average of the last three complete calendar months, counting months without transactions as zero. Assumes the same income and spending continue; excludes future price changes." });
});
