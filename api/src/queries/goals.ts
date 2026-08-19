import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type GoalRow = {
  id: string;
  user_id: number;
  name: string;
  target_amount: string;
  target_date: string;
  priority: string;
  status: string;
  account_id: string | null;
  account_name: string | null;
  account_type: string | null;
  color: string | null;
  notes: string | null;
  template_used: string | null;
  completed_at: string | null;
  version: number;
  current_amount: string;
  avg_monthly: string;
};

export type Goal = Omit<GoalRow, "target_amount" | "current_amount" | "avg_monthly"> & {
  target_amount: number;
  current_amount: number;
  progress_pct: number;
  months_remaining: number;
  required_monthly: number;
  avg_monthly: number;
  projected_date: string | null;
  feasibility: "on_track" | "behind" | "critical";
};

export type ContributionRow = {
  id: string;
  goal_id: string;
  amount: string;
  date: string;
  transaction_id: string | null;
  notes: string | null;
};

export type Contribution = Omit<ContributionRow, "amount"> & { amount: number };

export type GoalTemplate = {
  id: string;
  user_id: number | null;
  name: string;
  description: string | null;
  default_target_amount: number | null;
  default_timeframe_months: number | null;
  icon: string | null;
  is_system: number;
  version: number;
};

export type GoalDashboard = {
  goal_count: number;
  total_target: number;
  total_saved: number;
  completion_pct: number;
};

export type MilestoneRow = {
  milestone_pct: number;
  reached_date: string;
  notified_at: string | null;
};

export type SnapshotRow = {
  date: string;
  current_amount: number;
};

export type DistributeSuggestion = {
  goal_id: string;
  name: string;
  remaining: number;
  amount: number;
};

const GOAL_SELECT = `
  SELECT g.id, g.user_id, g.name, g.target AS target_amount,
         g.target_date::text AS target_date,
         g.priority, g.status, g.account_id, a.name AS account_name,
         a.type AS account_type, g.color, g.notes, g.template_used,
         g.completed_at::text AS completed_at, g.version,
         c.total AS current_amount, c.avg_monthly
  FROM goals g
  LEFT JOIN accounts a ON a.id = g.account_id
  LEFT JOIN LATERAL (
    SELECT
      (SELECT COALESCE(SUM(amount), 0)::numeric(12,2)
       FROM goal_contributions WHERE goal_id = g.id) AS total,
      (SELECT ROUND(COALESCE(SUM(amount), 0) / 3.0, 2)
       FROM goal_contributions
       WHERE goal_id = g.id
         AND date >= date_trunc('month', CURRENT_DATE) - INTERVAL '2 months') AS avg_monthly
  ) c ON true
`;

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/** Whole calendar months from today until the target date (ceil semantics). */
function monthsRemaining(targetDate: string): number {
  const today = startOfToday();
  const target = parseIsoDate(targetDate);
  if (target <= today) return 0;
  const months =
    (target.getFullYear() - today.getFullYear()) * 12 +
    (target.getMonth() - today.getMonth());
  return Math.max(1, months);
}

/** FR-5.22: projected completion date from the current contribution rate. */
function projectedCompletion(
  targetAmount: number,
  currentAmount: number,
  avgMonthly: number
): string | null {
  if (avgMonthly <= 0) return null;
  const remaining = targetAmount - currentAmount;
  if (remaining <= 0) return isoDate(startOfToday());
  const months = Math.ceil(remaining / avgMonthly);
  const projected = startOfToday();
  projected.setMonth(projected.getMonth() + months);
  return isoDate(projected);
}

/** FR-5.2 feasibility indicator: green / yellow / red. */
function feasibilityOf(
  avgMonthly: number,
  requiredMonthly: number,
  projectedDate: string | null,
  targetDate: string
): Goal["feasibility"] {
  if (projectedDate !== null && projectedDate <= targetDate) return "on_track";
  const ratio = requiredMonthly > 0 ? avgMonthly / requiredMonthly : 0;
  if (ratio >= 0.5) return "behind";
  return "critical";
}

export function toGoal(row: GoalRow): Goal {
  const targetAmount = Number(row.target_amount);
  const currentAmount = Number(row.current_amount);
  const avgMonthly = Number(row.avg_monthly);
  const months = monthsRemaining(row.target_date);
  const requiredMonthly = months > 0 ? targetAmount / months : targetAmount;
  const projectedDate = projectedCompletion(targetAmount, currentAmount, avgMonthly);
  return {
    ...row,
    target_amount: targetAmount,
    current_amount: currentAmount,
    avg_monthly: avgMonthly,
    progress_pct:
      targetAmount > 0 ? Math.round((currentAmount / targetAmount) * 10000) / 100 : 0,
    months_remaining: months,
    required_monthly: Math.round(requiredMonthly * 100) / 100,
    projected_date: projectedDate,
    feasibility: feasibilityOf(avgMonthly, requiredMonthly, projectedDate, row.target_date),
  };
}

export async function getGoals(
  userId: number,
  status?: string,
  priority?: string
): Promise<Goal[]> {
  const where = ["g.user_id = $1"];
  const params: unknown[] = [userId];
  if (status) {
    params.push(status);
    where.push(`g.status = $${params.length}`);
  }
  if (priority) {
    params.push(priority);
    where.push(`g.priority = $${params.length}`);
  }
  const result = await query<GoalRow>(
    `${GOAL_SELECT}
     WHERE ${where.join(" AND ")}
     ORDER BY g.target_date ASC NULLS LAST,
              CASE g.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
    params
  );
  return result.rows.map(toGoal);
}

export async function getGoalById(
  userId: number,
  id: string
): Promise<Goal | null> {
  const result = await query<GoalRow>(
    `${GOAL_SELECT} WHERE g.user_id = $1 AND g.id = $2`,
    [userId, id]
  );
  const row = result.rows[0];
  return row ? toGoal(row) : null;
}

export async function createGoal(
  params: {
    userId: number;
    name: string;
    targetAmount: number;
    targetDate: string;
    priority: string;
    accountId: string | null;
    color: string | null;
    notes: string | null;
    templateUsed: string | null;
  },
  q: Queryable = DB
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO goals
       (user_id, name, target, target_date, priority, status, account_id,
        color, notes, template_used, version)
     VALUES ($1, $2, $3, $4::date, $5, 'active', $6::uuid, $7, $8, $9, 1)
     RETURNING id`,
    [
      params.userId,
      params.name,
      params.targetAmount,
      params.targetDate,
      params.priority,
      params.accountId,
      params.color,
      params.notes,
      params.templateUsed,
    ]
  );
  return result.rows[0].id;
}

export async function updateGoal(
  params: {
    userId: number;
    id: string;
    name?: string;
    targetAmount?: number;
    targetDate?: string;
    priority?: string;
    accountProvided: boolean;
    accountId?: string | null;
    color?: string | null;
    notes?: string | null;
    version: number;
  },
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query(
    `UPDATE goals
     SET name = COALESCE($3, name),
         target = COALESCE($4, target),
         target_date = COALESCE($5::date, target_date),
         priority = COALESCE($6, priority),
         account_id = CASE WHEN $7 THEN $8::uuid ELSE account_id END,
         color = COALESCE($9, color),
         notes = COALESCE($10, notes),
         version = version + 1
     WHERE user_id = $1 AND id = $2 AND version = $11`,
    [
      params.userId,
      params.id,
      params.name ?? null,
      params.targetAmount ?? null,
      params.targetDate ?? null,
      params.priority ?? null,
      params.accountProvided,
      params.accountId ?? null,
      params.color ?? null,
      params.notes ?? null,
      params.version,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteGoal(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query(
    `DELETE FROM goals WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setGoalStatus(
  userId: number,
  id: string,
  status: string,
  completedAt: string | null,
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query(
    `UPDATE goals
     SET status = $3, completed_at = $4::date
     WHERE user_id = $1 AND id = $2`,
    [userId, id, status, completedAt]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getDashboard(
  userId: number,
  status: string
): Promise<GoalDashboard> {
  const result = await query<{
    goal_count: string;
    total_target: string;
    total_saved: string;
  }>(
    `SELECT COUNT(*)::int AS goal_count,
            COALESCE(SUM(g.target), 0)::numeric(12,2) AS total_target,
            COALESCE(SUM(c.total), 0)::numeric(12,2) AS total_saved
     FROM goals g
     LEFT JOIN LATERAL (
       SELECT SUM(amount) AS total FROM goal_contributions WHERE goal_id = g.id
     ) c ON true
     WHERE g.user_id = $1 AND g.status = $2`,
    [userId, status]
  );
  const row = result.rows[0];
  const totalTarget = Number(row?.total_target ?? 0);
  const totalSaved = Number(row?.total_saved ?? 0);
  return {
    goal_count: Number(row?.goal_count ?? 0),
    total_target: totalTarget,
    total_saved: totalSaved,
    completion_pct:
      totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 10000) / 100 : 0,
  };
}

export async function getContributions(
  userId: number,
  goalId: string
): Promise<Contribution[]> {
  const result = await query<ContributionRow>(
    `SELECT id, goal_id, amount, date::text, transaction_id, notes
     FROM goal_contributions
     WHERE user_id = $1 AND goal_id = $2
     ORDER BY date ASC, id ASC`,
    [userId, goalId]
  );
  return result.rows.map((row) => ({ ...row, amount: Number(row.amount) }));
}

export async function addContribution(
  params: {
    userId: number;
    goalId: string;
    amount: number;
    date: string;
    notes: string | null;
    transactionId: string | null;
  },
  q: Queryable = DB
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO goal_contributions
       (user_id, goal_id, amount, date, notes, transaction_id)
     VALUES ($1, $2, $3, $4::date, $5, $6::uuid)
     RETURNING id`,
    [
      params.userId,
      params.goalId,
      params.amount,
      params.date,
      params.notes,
      params.transactionId,
    ]
  );
  return result.rows[0].id;
}

export async function updateContribution(
  params: {
    userId: number;
    goalId: string;
    id: string;
    amount?: number;
    date?: string;
    notes?: string | null;
  },
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query(
    `UPDATE goal_contributions
     SET amount = COALESCE($4, amount),
         date = COALESCE($5::date, date),
         notes = COALESCE($6, notes)
     WHERE user_id = $1 AND goal_id = $2 AND id = $3`,
    [
      params.userId,
      params.goalId,
      params.id,
      params.amount ?? null,
      params.date ?? null,
      params.notes ?? null,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteContribution(
  userId: number,
  goalId: string,
  id: string,
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query(
    `DELETE FROM goal_contributions
     WHERE user_id = $1 AND goal_id = $2 AND id = $3`,
    [userId, goalId, id]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * FR-5.20/5.21: milestone rows mirror the derived progress. Called after
 * every contribution mutation — rows are inserted the first time a threshold
 * is crossed (unique per goal + pct, reached_date = crossing date) and
 * removed again if the goal drops below the threshold.
 */
export async function recomputeMilestones(
  q: Queryable,
  userId: number,
  goalId: string,
  date: string
): Promise<void> {
  const goal = await q.query<{ target: string }>(
    `SELECT target FROM goals WHERE user_id = $1 AND id = $2`,
    [userId, goalId]
  );
  if (!goal.rows[0]) return;
  const target = Number(goal.rows[0].target);
  const sum = await q.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS total
     FROM goal_contributions WHERE goal_id = $1`,
    [goalId]
  );
  const current = Number(sum.rows[0]?.total ?? 0);
  const crossed = [25, 50, 75, 100].filter(
    (pct) => target > 0 && current >= (target * pct) / 100
  );
  if (crossed.length === 0) {
    await q.query(
      `DELETE FROM goal_milestones WHERE user_id = $1 AND goal_id = $2`,
      [userId, goalId]
    );
    return;
  }
  await q.query(
    `DELETE FROM goal_milestones
     WHERE user_id = $1 AND goal_id = $2 AND milestone_pct <> ALL($3::int[])`,
    [userId, goalId, crossed]
  );
  for (const pct of crossed) {
    await q.query(
      `INSERT INTO goal_milestones (user_id, goal_id, milestone_pct, reached_date)
       VALUES ($1, $2, $3, $4::date)
       ON CONFLICT (goal_id, milestone_pct) DO NOTHING`,
      [userId, goalId, pct, date]
    );
  }
}

/** Weekly progress snapshot; one row per (goal, date) via the unique index. */
export async function upsertSnapshot(
  q: Queryable,
  userId: number,
  goalId: string,
  date: string
): Promise<void> {
  const sum = await q.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS total
     FROM goal_contributions WHERE goal_id = $1`,
    [goalId]
  );
  const current = Number(sum.rows[0]?.total ?? 0);
  await q.query(
    `INSERT INTO goal_snapshots (user_id, goal_id, current_amount, date)
     VALUES ($1, $2, $3, $4::date)
     ON CONFLICT (user_id, goal_id, date)
     DO UPDATE SET current_amount = EXCLUDED.current_amount`,
    [userId, goalId, current, date]
  );
}

export async function getSnapshots(
  userId: number,
  goalId: string
): Promise<SnapshotRow[]> {
  const result = await query<{ date: string; current_amount: string }>(
    `SELECT date::text, current_amount
     FROM goal_snapshots
     WHERE user_id = $1 AND goal_id = $2
     ORDER BY date ASC`,
    [userId, goalId]
  );
  return result.rows.map((row) => ({
    date: row.date,
    current_amount: Number(row.current_amount),
  }));
}

export async function getMilestones(
  userId: number,
  goalId: string
): Promise<MilestoneRow[]> {
  const result = await query<{
    milestone_pct: number;
    reached_date: string;
    notified_at: string | null;
  }>(
    `SELECT milestone_pct, reached_date::text, notified_at
     FROM goal_milestones
     WHERE user_id = $1 AND goal_id = $2
     ORDER BY milestone_pct ASC`,
    [userId, goalId]
  );
  return result.rows;
}

export async function getTemplates(userId: number): Promise<GoalTemplate[]> {
  const result = await query<{
    id: string;
    user_id: number | null;
    name: string;
    description: string | null;
    default_target_amount: string | null;
    default_timeframe_months: number | null;
    icon: string | null;
    is_system: number;
    version: number;
  }>(
    `SELECT id, user_id, name, description, default_target_amount,
            default_timeframe_months, icon, is_system, version
     FROM goal_templates
     WHERE user_id IS NULL OR user_id = $1
     ORDER BY is_system DESC, name ASC`,
    [userId]
  );
  return result.rows.map((row) => ({
    ...row,
    default_target_amount:
      row.default_target_amount === null ? null : Number(row.default_target_amount),
  }));
}

export async function getTemplateById(
  userId: number,
  id: string
): Promise<GoalTemplate | null> {
  const result = await query<{
    id: string;
    user_id: number | null;
    name: string;
    description: string | null;
    default_target_amount: string | null;
    default_timeframe_months: number | null;
    icon: string | null;
    is_system: number;
    version: number;
  }>(
    `SELECT id, user_id, name, description, default_target_amount,
            default_timeframe_months, icon, is_system, version
     FROM goal_templates
     WHERE id = $1 AND (user_id IS NULL OR user_id = $2)`,
    [id, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    default_target_amount:
      row.default_target_amount === null ? null : Number(row.default_target_amount),
  };
}

export async function createTemplate(
  params: {
    userId: number;
    name: string;
    description: string | null;
    defaultTargetAmount: number | null;
    defaultTimeframeMonths: number | null;
    icon: string | null;
  },
  q: Queryable = DB
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO goal_templates
       (user_id, name, description, default_target_amount,
        default_timeframe_months, icon, is_system, version)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 1)
     RETURNING id`,
    [
      params.userId,
      params.name,
      params.description,
      params.defaultTargetAmount,
      params.defaultTimeframeMonths,
      params.icon,
    ]
  );
  return result.rows[0].id;
}

export async function updateTemplate(
  params: {
    userId: number;
    id: string;
    name?: string;
    description?: string | null;
    defaultTargetAmount?: number | null;
    defaultTimeframeMonths?: number | null;
    icon?: string | null;
    version: number;
  },
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query(
    `UPDATE goal_templates
     SET name = COALESCE($3, name),
         description = COALESCE($4, description),
         default_target_amount = COALESCE($5, default_target_amount),
         default_timeframe_months = COALESCE($6, default_timeframe_months),
         icon = COALESCE($7, icon),
         version = version + 1
     WHERE user_id = $1 AND id = $2 AND version = $8`,
    [
      params.userId,
      params.id,
      params.name ?? null,
      params.description ?? null,
      params.defaultTargetAmount ?? null,
      params.defaultTimeframeMonths ?? null,
      params.icon ?? null,
      params.version,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteTemplate(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query(
    `DELETE FROM goal_templates WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Windfall distribution suggestion: split across active goals by remaining amount. */
export async function distributeSuggestion(
  userId: number,
  amount: number
): Promise<DistributeSuggestion[]> {
  const result = await query<{ id: string; name: string; remaining: string }>(
    `SELECT g.id, g.name,
            (g.target - COALESCE(c.total, 0))::numeric(12,2) AS remaining
     FROM goals g
     LEFT JOIN LATERAL (
       SELECT SUM(amount) AS total FROM goal_contributions WHERE goal_id = g.id
     ) c ON true
     WHERE g.user_id = $1 AND g.status = 'active'
     ORDER BY g.target_date ASC NULLS LAST`,
    [userId]
  );
  const active = result.rows
    .map((row) => ({ ...row, remaining: Number(row.remaining) }))
    .filter((row) => row.remaining > 0);
  const totalRemaining = active.reduce((sum, row) => sum + row.remaining, 0);
  if (totalRemaining <= 0) return [];

  let allocated = 0;
  return active.map((row, index) => {
    const isLast = index === active.length - 1;
    const amt = isLast
      ? Math.round((amount - allocated) * 100) / 100
      : Math.round((amount * (row.remaining / totalRemaining)) * 100) / 100;
    allocated += amt;
    return {
      goal_id: row.id,
      name: row.name,
      remaining: row.remaining,
      amount: amt,
    };
  });
}