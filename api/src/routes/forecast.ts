import { Hono } from "hono";
import { requireAuth } from "../middleware";
import { requirePremium } from "../entitlements";
import { getForecastTotals } from "../queries/forecast";
import { round2 } from "../utils/finance";

export const forecast = new Hono();
forecast.get("/", requireAuth, requirePremium, async (c) => {
  const row = await getForecastTotals(c.get("user").user_id);
  if (!row || !row.months_with_data) return c.json({ forecast: null, method: "Add transactions from completed months to see a projection." });
  // Average over the complete months actually observed (1-3): dividing a new
  // 1-month history by 3 would understate the projection 3x.
  const divisor = Math.min(3, Math.max(1, row.months_with_data));
  const income = round2(Number(row.income_total) / divisor);
  const expense = round2(Number(row.expense_total) / divisor);
  return c.json({ forecast: { monthly_income: income, monthly_expense: expense, monthly_net: round2(income - expense), three_month_net: round2((income - expense) * 3) }, method: "Simple average of recent complete calendar months (up to 3); months without transactions count as zero. Assumes the same income and spending continue; excludes future price changes." });
});
