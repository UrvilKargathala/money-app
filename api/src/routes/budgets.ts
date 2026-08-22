import { Hono } from "hono";
import type { Context } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson, isUniqueViolation } from "./helpers";
import { categoryReferenceExists } from "../queries/references";
import {
  createBudget,
  deleteBudget,
  getBreakdown,
  getBudgetById,
  getBudgets,
  getOverview,
  updateBudget,
} from "../queries/budgets";

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

  try {
    await withUser(user.user_id, async (client) => {
      if (categoryId !== null && !(await categoryReferenceExists(categoryId, user.user_id, client))) {
        throw new Error("INVALID_CATEGORY");
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

export { budgets };