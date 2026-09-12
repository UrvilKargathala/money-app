import { Hono } from "hono";
import type { Context } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson, isUniqueViolation } from "./helpers";
import { categoryReferenceExists } from "../queries/references";
import {
  getBudgetHistory,
  setRolloverEnabled,
  getRolloverHistory,
  listBudgetAlerts,
  dismissBudgetAlert,
  getSuggestedAmount,
  getMonthStatus,
  listBudgetTemplates,
  getBudgetTemplate,
  insertBudgetTemplate,
  updateBudgetTemplate,
  deleteBudgetTemplate,
  applyTemplate,
} from "../queries/budget-extras";
import {
  createBudget,
  deleteBudget,
  deleteBudgetByIdForMonth,
  getBreakdown,
  getBudgetById,
  getBudgets,
  getOverview,
  updateBudget,
} from "../queries/budgets";
import { checkCountLimit, isRowLocked, listBudgetIdsForMonth } from "../queries/entitlements";

const budgets = new Hono();

function parseMonthYear(c: Context) {
  const now = new Date();
  const month = Number(c.req.query("month") ?? String(now.getMonth() + 1));
  const year = Number(c.req.query("year") ?? String(now.getFullYear()));
  return { month, year };
}

function validMonthYear(month: number, year: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12 &&
    Number.isInteger(year) && year >= 2000 && year <= 2100;
}

budgets.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const { month, year } = parseMonthYear(c);
  if (!validMonthYear(month, year)) {
    return c.json({ error: "Invalid month or year." }, 400);
  }
  const budgetList = await getBudgets(user.user_id, month, year);
  return c.json({ budgets: budgetList });
});

budgets.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const categoryId = String(body.category_id ?? "") || null;
  const amount = parseAmount(body.amount);
  const period = String(body.period ?? "monthly");
  const month = Number(body.month);
  const year = Number(body.year);
  const alert50 = body.alert_50 === true || body.alert_50 === 1 ? 1 : 0;
  const alert80 = body.alert_80 === true || body.alert_80 === 1 ? 1 : 0;
  const alert100 = body.alert_100 === true || body.alert_100 === 1 ? 1 : 0;

  const fieldErrors: Record<string, string> = {};
  if (categoryId !== null && typeof body.category_id !== "string") {
    fieldErrors.category_id = "Please choose a category.";
  }
  if (amount === null || amount <= 0) {
    fieldErrors.amount = "Please enter an amount greater than zero.";
  }
  if (!validMonthYear(month, year)) {
    fieldErrors.month = "Please choose a valid month and year.";
  }
  if (period !== "monthly" && period !== "weekly") {
    fieldErrors.period = "Period must be monthly or weekly.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  const replaceId = body.replace_id ? String(body.replace_id) : null;
  const budgetLimit = await checkCountLimit(user.user_id, "budgets", { month, year });
  if (budgetLimit && !replaceId) {
    const replaceable = await listBudgetIdsForMonth(user.user_id, month, year);
    return c.json({ error: "plan_limit", feature: "budgets", plan: budgetLimit.plan, limit: budgetLimit.limit, used: budgetLimit.used, replaceable }, 403);
  }
  if (budgetLimit && replaceId) {
    if (!/^[0-9a-f-]{36}$/i.test(replaceId)) {
      return c.json({ fieldErrors: { replace_id: "Invalid budget to replace." } }, 400);
    }
  }

  try {
    await withUser(user.user_id, async (client) => {
      if (categoryId !== null && !(await categoryReferenceExists(categoryId, user.user_id, client))) {
        throw new Error("INVALID_CATEGORY");
      }
      if (replaceId) {
        const ok = await deleteBudgetByIdForMonth(client, user.user_id, replaceId, month, year);
        if (!ok) throw new Error("INVALID_REPLACE");
      }
      await createBudget(
        {
          userId: user.user_id,
          categoryId,
          amount: amount as number,
          period,
          month,
          year,
          alert50,
          alert80,
          alert100,
        },
        client
      );
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_REPLACE") {
      return c.json({ error: "Budget to replace not found." }, 404);
    }
    if (err instanceof Error && err.message === "INVALID_CATEGORY") {
      return c.json(
        { fieldErrors: { category_id: "This category doesn't exist." } },
        400
      );
    }
    if (isUniqueViolation(err)) {
      const isOverall = categoryId === null;
      return c.json(
        {
          error: isOverall
            ? "You already have an overall budget for this month."
            : "You already have a budget for this category in this month.",
        },
        409
      );
    }
    console.error("[api] create budget failed:", err);
    return c.json(
      { error: "Could not create the budget. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

budgets.get("/overview", requireAuth, async (c) => {
  const user = c.get("user");
  const { month, year } = parseMonthYear(c);
  if (!validMonthYear(month, year)) {
    return c.json({ error: "Invalid month or year." }, 400);
  }
  const overview = await getOverview(user.user_id, month, year);
  return c.json({ overview });
});

budgets.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const { month, year } = parseMonthYear(c);
  if (!validMonthYear(month, year)) {
    return c.json({ error: "Invalid month or year." }, 400);
  }
  const budgetList = await getBudgets(user.user_id, month, year);
  const header = "\uFEFFCategory,Amount,Spent,Remaining,Utilization %";
  const rows = budgetList.map((b) => {
    const name = b.category_name ?? "Overall";
    return `${name},${b.amount},${b.spent},${b.remaining},${b.utilization_pct}%`;
  });
  const csv = [header, ...rows].join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="budgets-${year}-${String(month).padStart(2, "0")}.csv"`,
    },
  });
});

budgets.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const budget = await getBudgetById(user.user_id, c.req.param("id"));
  if (!budget) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ budget });
});

budgets.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  // lock check (budgets are per-month, use budget's month/year if found)
  const existingBudget = await getBudgetById(user.user_id, id);
  if (existingBudget) {
    const lock = await isRowLocked(user.user_id, "budgets", id, { month: existingBudget.month, year: existingBudget.year });
    if (lock.locked) return c.json({ error: "plan_locked", feature: "budgets", plan: lock.plan }, 403);
  }
  const body = await readJson(c);

  const amount = body.amount === undefined ? undefined : parseAmount(body.amount);
  const period = body.period === undefined ? undefined : String(body.period);
  const version = Number(body.version ?? 1);
  const alert50 = body.alert_50 === undefined ? undefined : body.alert_50 === true || body.alert_50 === 1 ? 1 : 0;
  const alert80 = body.alert_80 === undefined ? undefined : body.alert_80 === true || body.alert_80 === 1 ? 1 : 0;
  const alert100 = body.alert_100 === undefined ? undefined : body.alert_100 === true || body.alert_100 === 1 ? 1 : 0;
  const rolloverEnabled = body.rollover_enabled === undefined ? undefined : body.rollover_enabled === true || body.rollover_enabled === 1 ? 1 : 0;
  const isActive = body.is_active === undefined ? undefined : body.is_active === true || body.is_active === 1 ? 1 : 0;

  const fieldErrors: Record<string, string> = {};
  if (amount !== undefined && (amount === null || amount <= 0)) {
    fieldErrors.amount = "Please enter an amount greater than zero.";
  }
  if (period !== undefined && period !== "monthly" && period !== "weekly") {
    fieldErrors.period = "Period must be monthly or weekly.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const ok = await withUser(user.user_id, (client) =>
      updateBudget(
        {
          userId: user.user_id,
          id,
          amount: amount ?? undefined,
          period: period ?? undefined,
          alert50: alert50 ?? undefined,
          alert80: alert80 ?? undefined,
          alert100: alert100 ?? undefined,
          rolloverEnabled: rolloverEnabled ?? undefined,
          isActive: isActive ?? undefined,
          version,
        },
        client
      )
    );
    if (!ok) {
      return c.json(
        { error: "This budget was modified elsewhere. Refresh and try again." },
        409
      );
    }
  } catch (err) {
    console.error("[api] update budget failed:", err);
    return c.json(
      { error: "Could not update the budget. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

budgets.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const ok = await withUser(user.user_id, (client) =>
    deleteBudget(user.user_id, id, client)
  );
  if (!ok) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

budgets.get("/:id/utilization", requireAuth, async (c) => {
  const user = c.get("user");
  const budget = await getBudgetById(user.user_id, c.req.param("id"));
  if (!budget) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({
    budget_id: budget.id,
    amount: budget.amount,
    spent: budget.spent,
    remaining: budget.remaining,
    utilization_pct: budget.utilization_pct,
    is_over_budget: budget.is_over_budget,
  });
});

budgets.get("/:id/breakdown", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { month, year } = parseMonthYear(c);

  const budget = await getBudgetById(user.user_id, id);
  if (!budget) {
    return c.json({ error: "Not found" }, 404);
  }
  const items = await getBreakdown(user.user_id, id, month, year);
  return c.json({ budget_id: id, items });
});

// ---- M3 extras: history, rollover, alerts, templates, status ----

budgets.get("/history/:id", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ history: await getBudgetHistory(user.user_id, c.req.param("id")) });
});

budgets.patch("/rollover/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const enabled = body.rollover_enabled === true || body.rollover_enabled === 1;
  const result = await withUser(user.user_id, (client) =>
    setRolloverEnabled(client, { userId: user.user_id, budgetId: c.req.param("id"), enabled })
  );
  if (result.rowCount !== 1) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

budgets.get("/rollovers/history", requireAuth, async (c) => {
  const user = c.get("user");
  const { getRolloverHistory } = await import("../queries/budget-extras");
  return c.json({ rollovers: await getRolloverHistory(user.user_id) });
});

budgets.get("/alerts", requireAuth, async (c) => {
  const user = c.get("user");
  const { listBudgetAlerts } = await import("../queries/budget-extras");
  return c.json({ alerts: await listBudgetAlerts(user.user_id) });
});

budgets.post("/alerts/:id/dismiss", requireAuth, async (c) => {
  const user = c.get("user");
  const { dismissBudgetAlert } = await import("../queries/budget-extras");
  await withUser(user.user_id, (client) =>
    dismissBudgetAlert(client, user.user_id, c.req.param("id"))
  );
  return c.json({ success: true });
});

budgets.get("/suggested-amount", requireAuth, async (c) => {
  const user = c.get("user");
  const categoryId = c.req.query("category_id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(categoryId)) {
    return c.json({ fieldErrors: { category_id: "Please choose a category." } }, 400);
  }
  const suggested = await getSuggestedAmount(user.user_id, categoryId);
  return c.json({ suggested_amount: suggested });
});

budgets.get("/status/:month/:year", requireAuth, async (c) => {
  const user = c.get("user");
  const month = Number(c.req.param("month"));
  const year = Number(c.req.param("year"));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return c.json({ error: "Invalid month." }, 400);
  }
  return c.json(await getMonthStatus(user.user_id, month, year));
});

// ---- Budget templates CRUD + apply ----

budgets.get("/templates", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ templates: await listBudgetTemplates(user.user_id) });
});

budgets.post("/templates", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const name = String(body.name ?? "").trim();
  if (name.length < 2) return c.json({ fieldErrors: { name: "Name required." } }, 400);
  const description = String(body.description ?? "").trim() || null;
  try {
    const id = await withUser(user.user_id, (client) =>
      insertBudgetTemplate(client, { userId: user.user_id, name, description })
    );
    return c.json({ success: true, template: { id } });
  } catch (err) {
    if (isUniqueViolation(err)) return c.json({ error: "Template name already exists." }, 409);
    throw err;
  }
});

budgets.get("/templates/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const tpl = await getBudgetTemplate(user.user_id, c.req.param("id"));
  if (!tpl) return c.json({ error: "Not found" }, 404);
  return c.json({ template: tpl });
});

budgets.patch("/templates/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const name = body.name === undefined ? null : String(body.name).trim() || null;
  const description = body.description === undefined ? null : String(body.description ?? "").trim() || null;
  await withUser(user.user_id, (client) =>
    updateBudgetTemplate(client, { userId: user.user_id, id: c.req.param("id"), name, description })
  );
  return c.json({ success: true });
});

budgets.delete("/templates/:id", requireAuth, async (c) => {
  const user = c.get("user");
  await withUser(user.user_id, (client) =>
    deleteBudgetTemplate(client, user.user_id, c.req.param("id"))
  );
  return c.json({ success: true });
});

budgets.post("/templates/:id/apply", requireAuth, async (c) => {
  const user = c.get("user");
  const now = new Date();
  const body = await readJson(c);
  const month = Number(body.month ?? now.getMonth() + 1);
  const year = Number(body.year ?? now.getFullYear());
  let applied = 0;
  await withUser(user.user_id, (client) => {
    return applyTemplate(client, { userId: user.user_id, templateId: c.req.param("id"), month, year }).then((n) => { applied = n; });
  }).catch(() => null);
  return c.json({ success: true, applied });
});

import { buildReportPdf } from "../utils/pdf";

// Budget dashboard PDF (FR-3.x)
budgets.get("/report", requireAuth, async (c) => {
  const user = c.get("user");
  const now = new Date();
  const month = Number(c.req.query("month") || now.getMonth() + 1);
  const year = Number(c.req.query("year") || now.getFullYear());
  const budgetList = await getBudgets(user.user_id, month, year);
  const pdf = await buildReportPdf({
    title: "Budget Report",
    subtitle: `Period ${month}/${year}`,
    sections: [{
      heading: "Budget vs Actual",
      columns: ["Category", "Budgeted", "Spent", "Remaining", "Utilization %"],
      rows: budgetList.map((b) => [
        b.category_name ?? "Overall", b.amount.toFixed(2), b.spent.toFixed(2),
        b.remaining.toFixed(2), b.utilization_pct.toFixed(1),
      ]),
    }],
    footer: "Generated by MoneyMind.",
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="budget-report-${month}-${year}.pdf"`,
    },
  });
});

export { budgets };