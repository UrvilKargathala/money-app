import { Hono } from "hono";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { getSettings, setMonthlyIncome } from "../queries/debts";
import {
  getWidgetSettings,
  setHapticsEnabled,
  setReportFilters,
  setWidgetLayout,
} from "../queries/settings";
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
    await withUser(c.get("user").user_id, (client) => setWidgetLayout(client, c.get("user").user_id, layout));
  }
  if (body.haptics_enabled !== undefined) {
    await withUser(c.get("user").user_id, (client) => setHapticsEnabled(client, c.get("user").user_id, body.haptics_enabled));
  }
  if (body.report_filters !== undefined) {
    if (!Array.isArray(body.report_filters) || body.report_filters.length > 20) return c.json({ error: "You can save up to 20 report filters." }, 400);
    // Shape allow-list: the UI only writes {name,start,end} (reports-manager).
    // Rejects prototype keys, nested objects, and oversized strings.
    for (const entry of body.report_filters) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return c.json({ fieldErrors: { report_filters: "Each filter must be an object." } }, 400);
      }
      const keys = Object.keys(entry);
      if (keys.length === 0 || keys.length > 3 || keys.some((k) => k !== "name" && k !== "start" && k !== "end")) {
        return c.json({ fieldErrors: { report_filters: "Filters support only name, start and end." } }, 400);
      }
      for (const k of ["name", "start", "end"] as const) {
        const v = (entry as Record<string, unknown>)[k];
        if (v !== undefined && (typeof v !== "string" || v.length > 120)) {
          return c.json({ fieldErrors: { report_filters: `${k} must be a short string.` } }, 400);
        }
      }
      for (const k of ["start", "end"] as const) {
        const v = (entry as Record<string, unknown>)[k];
        if (typeof v === "string" && v !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          return c.json({ fieldErrors: { report_filters: `${k} must be a date.` } }, 400);
        }
      }
    }
    await withUser(c.get("user").user_id, (client) => setReportFilters(client, c.get("user").user_id, body.report_filters));
  }
  return c.json({ success: true });
});

settings.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const settings = await getSettings(user.user_id);
  const extra = await withUser(user.user_id, (client) => getWidgetSettings(client, user.user_id));
  return c.json({ settings: { ...settings, ...extra } });
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
