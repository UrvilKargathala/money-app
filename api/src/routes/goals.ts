import { Hono } from "hono";
import type { Context } from "hono";
import { randomUUID } from "node:crypto";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson, isUniqueViolation } from "./helpers";
import { csvEscape } from "../utils/format";
import {
  addContribution,
  createGoal,
  createTemplate,
  deleteContribution,
  deleteGoal,
  deleteTemplate,
  distributeSuggestion,
  getContributionDate,
  getContributions,
  getDashboard,
  getGoalById,
  getGoals,
  getMilestones,
  getSnapshots,
  getTemplateById,
  getTemplates,
  goalRowExists,
  isoDate,
  recomputeMilestones,
  setGoalStatus,
  toGoal,
  updateContribution,
  updateGoal,
  updateTemplate,
  upsertSnapshot,
} from "../queries/goals";
import type { GoalRow } from "../queries/goals";
import { accountExists } from "../queries/references";
import { createTransfer, getActiveAccountsByIds } from "../queries/transfers";
import { transactionExists } from "../queries/transactions";

const goals = new Hono();

const PRIORITIES = ["high", "medium", "low"];
const STATUSES = ["active", "paused", "completed"];

function isoDateStr(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return value;
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

goals.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const status = String(c.req.query("status") ?? "");
  const priority = String(c.req.query("priority") ?? "");
  if (status && !STATUSES.includes(status)) {
    return c.json({ error: "Invalid status filter." }, 400);
  }
  if (priority && !PRIORITIES.includes(priority)) {
    return c.json({ error: "Invalid priority filter." }, 400);
  }
  const list = await getGoals(
    user.user_id,
    status || undefined,
    priority || undefined
  );
  return c.json({ goals: list });
});

goals.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const targetAmount = parseAmount(body.target_amount);
  const targetDate = isoDateStr(String(body.target_date ?? ""));
  const priority = String(body.priority ?? "medium");
  const accountId = String(body.account_id ?? "") || null;
  const color = String(body.color ?? "").trim() || null;
  const notes = String(body.notes ?? "").trim() || null;
  const templateUsed = String(body.template_used ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!name) {
    fieldErrors.name = "Please enter a name for this goal.";
  }
  if (targetAmount === null || targetAmount <= 0) {
    fieldErrors.target_amount = "Please enter a target amount greater than zero.";
  }
  if (targetDate === null) {
    fieldErrors.target_date = "Please choose a valid target date.";
  } else {
    const today = isoDate(new Date());
    if (targetDate <= today) {
      fieldErrors.target_date = "The target date must be in the future.";
    }
  }
  if (!PRIORITIES.includes(priority)) {
    fieldErrors.priority = "Priority must be high, medium or low.";
  }
  if (accountId !== null && !validUuid(accountId)) {
    fieldErrors.account_id = "Please choose a valid account.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const id = await withUser(user.user_id, async (client) => {
      if (accountId !== null && !(await accountExists(accountId, user.user_id, client))) {
        throw new Error("INVALID_ACCOUNT");
      }
      return createGoal(
        {
          userId: user.user_id,
          name,
          targetAmount: targetAmount as number,
          targetDate: targetDate as string,
          priority,
          accountId,
          color,
          notes,
          templateUsed,
        },
        client
      );
    });
    return c.json({ success: true, goal: { id } });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json(
        { fieldErrors: { account_id: "This account doesn't exist." } },
        400
      );
    }
    console.error("[api] create goal failed:", err);
    return c.json(
      { error: "Could not create the goal. Please try again." },
      500
    );
  }
});

goals.get("/dashboard", requireAuth, async (c) => {
  const user = c.get("user");
  const status = String(c.req.query("status") ?? "active");
  if (!STATUSES.includes(status)) {
    return c.json({ error: "Invalid status filter." }, 400);
  }
  const dashboard = await getDashboard(user.user_id, status);
  return c.json({ dashboard });
});

goals.get("/templates", requireAuth, async (c) => {
  const user = c.get("user");
  const templates = await getTemplates(user.user_id);
  return c.json({ templates });
});

goals.post("/templates", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim() || null;
  const defaultTargetAmount = parseAmount(body.default_target_amount);
  const defaultTimeframeMonths =
    body.default_timeframe_months === undefined ||
    body.default_timeframe_months === null ||
    body.default_timeframe_months === ""
      ? null
      : Number(body.default_timeframe_months);
  const icon = String(body.icon ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!name) {
    fieldErrors.name = "Please enter a template name.";
  }
  if (
    defaultTargetAmount !== null &&
    defaultTargetAmount !== undefined &&
    defaultTargetAmount <= 0
  ) {
    fieldErrors.default_target_amount =
      "The suggested target must be greater than zero.";
  }
  if (
    defaultTimeframeMonths !== null &&
    (!Number.isInteger(defaultTimeframeMonths) || defaultTimeframeMonths <= 0)
  ) {
    fieldErrors.default_timeframe_months =
      "The timeframe must be a positive number of months.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const id = await createTemplate({
      userId: user.user_id,
      name,
      description,
      defaultTargetAmount:
        defaultTargetAmount === null ? null : (defaultTargetAmount as number),
      defaultTimeframeMonths,
      icon,
    });
    return c.json({ success: true, template: { id } });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json(
        { error: "You already have a template with this name." },
        409
      );
    }
    console.error("[api] create template failed:", err);
    return c.json(
      { error: "Could not create the template. Please try again." },
      500
    );
  }
});

goals.get("/templates/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const template = await getTemplateById(user.user_id, c.req.param("id"));
  if (!template) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ template });
});

goals.patch("/templates/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const name = body.name === undefined ? undefined : String(body.name).trim();
  const description =
    body.description === undefined ? undefined : String(body.description).trim() || null;
  const defaultTargetAmount =
    body.default_target_amount === undefined
      ? undefined
      : parseAmount(body.default_target_amount);
  const defaultTimeframeMonths =
    body.default_timeframe_months === undefined
      ? undefined
      : body.default_timeframe_months === null || body.default_timeframe_months === ""
        ? null
        : Number(body.default_timeframe_months);
  const icon = body.icon === undefined ? undefined : String(body.icon).trim() || null;
  const version = Number(body.version ?? 1);

  const fieldErrors: Record<string, string> = {};
  if (name !== undefined && !name) {
    fieldErrors.name = "Please enter a template name.";
  }
  if (
    defaultTargetAmount !== undefined &&
    defaultTargetAmount !== null &&
    defaultTargetAmount <= 0
  ) {
    fieldErrors.default_target_amount =
      "The suggested target must be greater than zero.";
  }
  if (
    defaultTimeframeMonths !== undefined &&
    defaultTimeframeMonths !== null &&
    (!Number.isInteger(defaultTimeframeMonths) || defaultTimeframeMonths <= 0)
  ) {
    fieldErrors.default_timeframe_months =
      "The timeframe must be a positive number of months.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const existing = await getTemplateById(user.user_id, id);
    if (!existing || existing.user_id === null) {
      return c.json({ error: "Not found" }, 404);
    }
    const ok = await updateTemplate({
      userId: user.user_id,
      id,
      name,
      description,
      defaultTargetAmount:
        defaultTargetAmount === undefined
          ? undefined
          : (defaultTargetAmount ?? null),
      defaultTimeframeMonths,
      icon,
      version,
    });
    if (!ok) {
      return c.json(
        { error: "This template was modified elsewhere. Refresh and try again." },
        409
      );
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json(
        { error: "You already have a template with this name." },
        409
      );
    }
    console.error("[api] update template failed:", err);
    return c.json(
      { error: "Could not update the template. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

goals.delete("/templates/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const ok = await deleteTemplate(user.user_id, c.req.param("id"));
  if (!ok) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ success: true });
});

goals.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const list = await getGoals(user.user_id);
  const header = "\uFEFFName,Target Amount,Current Amount,Progress %,Target Date,Status,Priority";
  const rows = list.map((g) =>
    [
      csvEscape(g.name),
      g.target_amount,
      g.current_amount,
      `${g.progress_pct}%`,
      g.target_date,
      g.status,
      g.priority,
    ].join(",")
  );
  const csv = [header, ...rows].join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="goals.csv"`,
    },
  });
});

goals.post("/distribute", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const amount = parseAmount(body.amount);
  if (amount === null || amount <= 0) {
    return c.json(
      { fieldErrors: { amount: "Please enter an amount greater than zero." } },
      400
    );
  }
  const suggestions = await distributeSuggestion(user.user_id, amount);
  return c.json({ suggestions });
});

goals.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const goal = await getGoalById(user.user_id, c.req.param("id"));
  if (!goal) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ goal });
});

goals.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const name = body.name === undefined ? undefined : String(body.name).trim();
  const targetAmount =
    body.target_amount === undefined ? undefined : parseAmount(body.target_amount);
  const targetDate =
    body.target_date === undefined ? undefined : isoDateStr(String(body.target_date));
  const priority = body.priority === undefined ? undefined : String(body.priority);
  const accountProvided = body.account_id !== undefined;
  const accountId =
    accountProvided && (body.account_id === "" || body.account_id === null)
      ? null
      : accountProvided
        ? String(body.account_id)
        : undefined;
  const color = body.color === undefined ? undefined : String(body.color).trim() || null;
  const notes = body.notes === undefined ? undefined : String(body.notes).trim() || null;
  const version = Number(body.version ?? 1);

  const fieldErrors: Record<string, string> = {};
  if (name !== undefined && !name) {
    fieldErrors.name = "Please enter a name for this goal.";
  }
  if (targetAmount !== undefined && (targetAmount === null || targetAmount <= 0)) {
    fieldErrors.target_amount = "Please enter a target amount greater than zero.";
  }
  if (targetDate !== undefined && targetDate === null) {
    fieldErrors.target_date = "Please choose a valid target date.";
  }
  if (priority !== undefined && !PRIORITIES.includes(priority)) {
    fieldErrors.priority = "Priority must be high, medium or low.";
  }
  if (accountProvided && accountId && !validUuid(accountId)) {
    fieldErrors.account_id = "Please choose a valid account.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const existing = await getGoalById(user.user_id, id);
    if (!existing) {
      return c.json({ error: "Not found" }, 404);
    }
    if (accountId && !(await accountExists(accountId, user.user_id))) {
      return c.json(
        { fieldErrors: { account_id: "This account doesn't exist." } },
        400
      );
    }
    const ok = await updateGoal({
      userId: user.user_id,
      id,
      name,
      targetAmount: targetAmount ?? undefined,
      targetDate: targetDate ?? undefined,
      priority,
      accountProvided,
      accountId,
      color,
      notes,
      version,
    });
    if (!ok) {
      return c.json(
        { error: "This goal was modified elsewhere. Refresh and try again." },
        409
      );
    }
  } catch (err) {
    console.error("[api] update goal failed:", err);
    return c.json(
      { error: "Could not update the goal. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

goals.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const ok = await deleteGoal(user.user_id, c.req.param("id"));
  if (!ok) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ success: true });
});

goals.post("/:id/pause", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const ok = await withUser(user.user_id, (client) =>
    setGoalStatus(user.user_id, id, "paused", null, client)
  );
  if (!ok) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ success: true });
});

goals.post("/:id/resume", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const ok = await withUser(user.user_id, (client) =>
    setGoalStatus(user.user_id, id, "active", null, client)
  );
  if (!ok) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ success: true });
});

goals.post("/:id/complete", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const ok = await withUser(user.user_id, (client) =>
    setGoalStatus(user.user_id, id, "completed", isoDate(new Date()), client)
  );
  if (!ok) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ success: true });
});

goals.get("/:id/progress", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const goal = await getGoalById(user.user_id, id);
  if (!goal) {
    return c.json({ error: "Not found" }, 404);
  }
  const [milestones, snapshots] = await Promise.all([
    getMilestones(user.user_id, id),
    getSnapshots(user.user_id, id),
  ]);
  return c.json({
    goal_id: id,
    name: goal.name,
    target_amount: goal.target_amount,
    current_amount: goal.current_amount,
    progress_pct: goal.progress_pct,
    milestones,
    snapshots,
  });
});

goals.get("/:id/feasibility", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const goal = await getGoalById(user.user_id, id);
  if (!goal) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({
    goal_id: id,
    status: goal.feasibility,
    required_monthly: goal.required_monthly,
    avg_monthly: goal.avg_monthly,
    projected_date: goal.projected_date,
  });
});

goals.get("/:id/projection", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const goal = await getGoalById(user.user_id, id);
  if (!goal) {
    return c.json({ error: "Not found" }, 404);
  }
  const remaining = goal.target_amount - goal.current_amount;
  const monthsToFinish =
    goal.avg_monthly > 0 ? Math.ceil(remaining / goal.avg_monthly) : null;
  return c.json({
    goal_id: id,
    target_date: goal.target_date,
    target_amount: goal.target_amount,
    current_amount: goal.current_amount,
    avg_monthly: goal.avg_monthly,
    months_to_finish: monthsToFinish,
    projected_date: goal.projected_date,
  });
});

goals.get("/:id/contributions", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const goal = await getGoalById(user.user_id, id);
  if (!goal) {
    return c.json({ error: "Not found" }, 404);
  }
  const contributions = await getContributions(user.user_id, id);
  return c.json({ contributions });
});

goals.post("/:id/contributions/with-transfer", requireAuth, async (c) => {
  const user = c.get("user");
  const goalId = c.req.param("id");
  const body = await readJson(c);

  const fromId = String(body.from_account_id ?? "");
  const toId = String(body.to_account_id ?? "");
  const amount = parseAmount(body.amount);
  const rawDate = String(body.date ?? "");
  const notes = String(body.notes ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!fromId) fieldErrors.from_account_id = "Choose the source account.";
  if (!toId) fieldErrors.to_account_id = "Choose the destination account.";
  if (fromId && toId && fromId === toId) {
    fieldErrors.to_account_id = "Source and destination must be different.";
  }
  if (amount === null || amount <= 0) {
    fieldErrors.amount = "Enter an amount greater than zero.";
  }
  if (fromId && !validUuid(fromId)) {
    fieldErrors.from_account_id = "Choose a valid account.";
  }
  if (toId && !validUuid(toId)) {
    fieldErrors.to_account_id = "Choose a valid account.";
  }
  if (!rawDate || Number.isNaN(Date.parse(rawDate))) {
    fieldErrors.date = "Choose a valid date.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const contributionId = await withUser(user.user_id, async (client) => {
      if (!(await goalRowExists(client, user.user_id, goalId))) {
        throw new Error("GOAL_NOT_FOUND");
      }
      const accounts = await getActiveAccountsByIds(client, user.user_id, [
        fromId,
        toId,
      ]);
      if (accounts.length !== 2 || accounts.some((a) => a.is_active !== 1)) {
        throw new Error("INVALID_ACCOUNTS");
      }

      const { toTransactionId } = await createTransfer(client, {
        userId: user.user_id,
        fromId,
        toId,
        amount: amount as number,
        date: rawDate,
        notes,
        groupId: randomUUID(),
      });

      const contributionId = await addContribution(
        {
          userId: user.user_id,
          goalId,
          amount: amount as number,
          date: rawDate,
          notes,
          transactionId: toTransactionId,
        },
        client
      );
      await recomputeMilestones(client, user.user_id, goalId, rawDate);
      await upsertSnapshot(client, user.user_id, goalId, rawDate);
      return contributionId;
    });
    return c.json({ success: true, contribution: { id: contributionId } });
  } catch (err) {
    if (err instanceof Error && err.message === "GOAL_NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    if (err instanceof Error && err.message === "INVALID_ACCOUNTS") {
      return c.json({ error: "One of the accounts is no longer active." }, 409);
    }
    console.error("[api] contribution with transfer failed:", err);
    return c.json(
      { error: "Could not complete the transfer. Please try again." },
      500
    );
  }
});

goals.post("/:id/contributions", requireAuth, async (c) => {
  const user = c.get("user");
  const goalId = c.req.param("id");
  const body = await readJson(c);

  const amount = parseAmount(body.amount);
  const rawDate = String(body.date ?? isoDate(new Date()));
  const date = isoDateStr(rawDate);
  const notes = String(body.notes ?? "").trim() || null;
  const transactionId = String(body.transaction_id ?? "") || null;

  const fieldErrors: Record<string, string> = {};
  if (amount === null || amount <= 0) {
    fieldErrors.amount = "Please enter an amount greater than zero.";
  }
  if (date === null) {
    fieldErrors.date = "Please choose a valid date.";
  }
  if (transactionId !== null && !validUuid(transactionId)) {
    fieldErrors.transaction_id = "Please choose a valid transaction.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const id = await withUser(user.user_id, async (client) => {
      if (!(await goalRowExists(client, user.user_id, goalId))) {
        throw new Error("GOAL_NOT_FOUND");
      }
      if (transactionId !== null) {
        const exists = await transactionExists(user.user_id, transactionId, client);
        if (exists.rowCount !== 1) {
          throw new Error("INVALID_TRANSACTION");
        }
      }
      const id = await addContribution(
        {
          userId: user.user_id,
          goalId,
          amount: amount as number,
          date: date as string,
          notes,
          transactionId,
        },
        client
      );
      await recomputeMilestones(client, user.user_id, goalId, date as string);
      await upsertSnapshot(client, user.user_id, goalId, date as string);
      return id;
    });
    return c.json({ success: true, contribution: { id } });
  } catch (err) {
    if (err instanceof Error && err.message === "GOAL_NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    if (err instanceof Error && err.message === "INVALID_TRANSACTION") {
      return c.json(
        { fieldErrors: { transaction_id: "This transaction doesn't exist." } },
        400
      );
    }
    console.error("[api] add contribution failed:", err);
    return c.json(
      { error: "Could not record the contribution. Please try again." },
      500
    );
  }
});

goals.patch("/:id/contributions/:contributionId", requireAuth, async (c) => {
  const user = c.get("user");
  const goalId = c.req.param("id");
  const contributionId = c.req.param("contributionId");
  const body = await readJson(c);

  const amount = body.amount === undefined ? undefined : parseAmount(body.amount);
  const date =
    body.date === undefined ? undefined : isoDateStr(String(body.date));
  const notes = body.notes === undefined ? undefined : String(body.notes).trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (amount !== undefined && (amount === null || amount <= 0)) {
    fieldErrors.amount = "Please enter an amount greater than zero.";
  }
  if (date !== undefined && date === null) {
    fieldErrors.date = "Please choose a valid date.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const ok = await withUser(user.user_id, async (client) => {
      const updated = await updateContribution(
        {
          userId: user.user_id,
          goalId,
          id: contributionId,
          amount: amount ?? undefined,
          date: date ?? undefined,
          notes,
        },
        client
      );
      if (!updated) return false;
      const effectiveDate =
        date ?? (await getContributionDate(user.user_id, goalId, contributionId, client));
      await recomputeMilestones(client, user.user_id, goalId, effectiveDate);
      await upsertSnapshot(client, user.user_id, goalId, effectiveDate);
      return true;
    });
    if (!ok) {
      return c.json({ error: "Not found" }, 404);
    }
  } catch (err) {
    console.error("[api] update contribution failed:", err);
    return c.json(
      { error: "Could not update the contribution. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

goals.delete("/:id/contributions/:contributionId", requireAuth, async (c) => {
  const user = c.get("user");
  const goalId = c.req.param("id");
  const contributionId = c.req.param("contributionId");

  const ok = await withUser(user.user_id, async (client) => {
    const deleted = await deleteContribution(
      user.user_id,
      goalId,
      contributionId,
      client
    );
    if (!deleted) return false;
    await recomputeMilestones(client, user.user_id, goalId, isoDate(new Date()));
    await upsertSnapshot(client, user.user_id, goalId, isoDate(new Date()));
    return true;
  });
  if (!ok) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ success: true });
});

goals.get("/:id/contributions/export", requireAuth, async (c) => {
  const user = c.get("user");
  const goalId = c.req.param("id");
  const goal = await getGoalById(user.user_id, goalId);
  if (!goal) {
    return c.json({ error: "Not found" }, 404);
  }
  const contributions = await getContributions(user.user_id, goalId);
  const header = "\uFEFFDate,Amount,Notes";
  const rows = contributions.map((row) =>
    [row.date, row.amount, csvEscape(row.notes ?? "")].join(",")
  );
  const csv = [header, ...rows].join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="goals-${goalId.slice(0, 8)}-contributions.csv"`,
    },
  });
});

goals.get("/:id/snapshots", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const goal = await getGoalById(user.user_id, id);
  if (!goal) {
    return c.json({ error: "Not found" }, 404);
  }
  const snapshots = await getSnapshots(user.user_id, id);
  return c.json({ snapshots });
});

goals.post("/:id/snapshots", requireAuth, async (c) => {
  const user = c.get("user");
  const goalId = c.req.param("id");
  const body = await readJson(c);
  const rawDate = String(body.date ?? isoDate(new Date()));
  const date = isoDateStr(rawDate);
  if (date === null) {
    return c.json({ fieldErrors: { date: "Please choose a valid date." } }, 400);
  }
  try {
    await withUser(user.user_id, async (client) => {
      if (!(await goalRowExists(client, user.user_id, goalId))) {
        throw new Error("GOAL_NOT_FOUND");
      }
      await upsertSnapshot(client, user.user_id, goalId, date as string);
    });
  } catch (err) {
    if (err instanceof Error && err.message === "GOAL_NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    console.error("[api] add snapshot failed:", err);
    return c.json(
      { error: "Could not record the snapshot. Please try again." },
      500
    );
  }
  return c.json({ success: true });
});

goals.get("/:id/milestones", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const goal = await getGoalById(user.user_id, id);
  if (!goal) {
    return c.json({ error: "Not found" }, 404);
  }
  const milestones = await getMilestones(user.user_id, id);
  return c.json({ milestones });
});

goals.get("/:id/report", requireAuth, async (c) => {
  const { buildReportPdf } = await import("../utils/pdf");
  const user = c.get("user");
  const goalId = c.req.param("id");
  const goal = await getGoalById(user.user_id, goalId);
  if (!goal) return c.json({ error: "Not found" }, 404);
  const milestones = await getMilestones(user.user_id, goalId);
  const contributions = await getContributions(user.user_id, goalId);
  const pdf = await buildReportPdf({
    title: "Goal Progress Report",
    subtitle: goal.name,
    sections: [
      { heading: "Summary", columns: ["Metric", "Value"], rows: [
        ["Target amount", goal.target_amount.toFixed(2)],
        ["Current amount", goal.current_amount.toFixed(2)],
        ["Target date", goal.target_date],
        ["Status", goal.status],
      ]},
      { heading: "Milestones", columns: ["%", "Reached"], rows:
        milestones.map((m) => [`${m.milestone_pct}%`, m.reached_date ?? "pending"]) },
      { heading: "Contributions", columns: ["Date", "Amount"], rows:
        contributions.slice(0, 20).map((ct) => [ct.date, ct.amount.toFixed(2)]) },
    ],
    footer: "Generated by MoneyMind.",
  });
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf",
      "content-disposition": `attachment; filename="goal-${goalId.slice(0,8)}.pdf"` },
  });
});

export { goals, toGoal };
export type { GoalRow };