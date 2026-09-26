import { Hono } from "hono";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { getSettings, setMonthlyIncome } from "../queries/debts";
import { readJson } from "./helpers";
import { withUser } from "../db";

const settings = new Hono();

settings.patch("/", requireAuth, async (c) => {
  const body = await readJson(c);
  const ids = ["networth-sparkline", "bills-due", "budget-util", "cashflow-mini", "top-merchants"];
  if (body.widget_layout !== undefined) {
    const layout = body.widget_layout;
    if (!Array.isArray(layout) || layout.length > ids.length || new Set(layout).size !== layout.length || layout.some((id) => !ids.includes(String(id)))) {
      return c.json({ error: "Choose a unique list of supported widgets." }, 400);
    }
    await withUser(c.get("user").user_id, (client) => client.query("UPDATE user_settings SET widget_layout = $2::jsonb WHERE user_id = $1", [c.get("user").user_id, JSON.stringify(layout)]));
  }
  if (body.haptics_enabled !== undefined) {
    await withUser(c.get("user").user_id, (client) => client.query("UPDATE user_settings SET haptics_enabled = $2 WHERE user_id = $1", [c.get("user").user_id, body.haptics_enabled ? 1 : 0]));
  }
  if (body.report_filters !== undefined) {
    if (!Array.isArray(body.report_filters) || body.report_filters.length > 20) return c.json({ error: "You can save up to 20 report filters." }, 400);
    await withUser(c.get("user").user_id, (client) => client.query("UPDATE user_settings SET report_filters = $2::jsonb WHERE user_id = $1", [c.get("user").user_id, JSON.stringify(body.report_filters)]));
  }
  return c.json({ success: true });
});

settings.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const settings = await getSettings(user.user_id);
  const extra = await withUser(user.user_id, (client) => client.query("SELECT widget_layout, haptics_enabled, report_filters FROM user_settings WHERE user_id = $1", [user.user_id]));
  return c.json({ settings: { ...settings, ...extra.rows[0] } });
});

settings.patch("/monthly-income", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const raw = body.monthly_income;
  let income: number | null;
  if (raw === undefined || raw === null || raw === "") {
    income = null;
  } else {
    income = parseAmount(raw);
    if (income === null || income < 0) {
      return c.json(
        { fieldErrors: { monthly_income: "Please enter a valid monthly income." } },
        400
      );
    }
  }

  await setMonthlyIncome(user.user_id, income);
  return c.json({ success: true, monthly_income: income });
});

export { settings };
