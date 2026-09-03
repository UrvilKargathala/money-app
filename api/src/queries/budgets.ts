import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type BudgetRow = {
  id: string;
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  parent_id: string | null;
  amount: string;
  period: string;
  month: number;
  year: number;
  alert_50: number;
  alert_80: number;
  alert_100: number;
  rollover_enabled: number;
  is_active: number;
  version: number;
};

export type Budget = Omit<BudgetRow, "amount"> & { amount: number };

export type BudgetWithUtilization = Budget & {
  spent: number;
  remaining: number;
  utilization_pct: number;
  is_over_budget: number;
};

export type BudgetBreakdownItem = {
  category_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  spent: number;
  share_pct: number;
};

export type UnbudgetedCategory = {
  category_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  spent: number;
};

export type BudgetOverview = {
  month: number;
  year: number;
  total_budgeted: number;
  total_spent: number;
  utilization_pct: number;
  over_budget_count: number;
  budgeted_count: number;
  unbudgeted: UnbudgetedCategory[];
};

/** Tenant clause is baked into the fragment — compositions may only append AND conditions. */
const BUDGET_SELECT = `
  SELECT b.id, b.category_id, c.name AS category_name, c.icon AS category_icon,
         c.color AS category_color, c.parent_id, b.amount, b.period, b.month,
         b.year, b.alert_50, b.alert_80, b.alert_100, b.rollover_enabled,
         b.is_active, b.version
  FROM budgets b
  LEFT JOIN categories c ON c.id = b.category_id
  WHERE b.user_id = $1
`;

export function monthRange(month: number, year: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const days = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(days).padStart(2, "0")}`;
  return { from, to };
}

function toBudget(row: BudgetRow): Budget {
  return { ...row, amount: Number(row.amount) };
}

/**
 * Per-category spend (direct expense transactions plus split amounts) for the
 * user within a date range, grouped by category. One query regardless of how
 * many budgets exist.
 */
async function groupedSpend(
  userId: number,
  from: string,
  to: string
): Promise<Map<string, number>> {
  const result = await query<{ category_id: string; spent: string }>(
    `WITH direct AS (
       SELECT t.category_id, COALESCE(SUM(t.amount), 0)::numeric(12,2) AS spent
       FROM transactions t
       WHERE t.user_id = $1 AND t.type = 'expense'
         AND t.date >= $2 AND t.date <= $3
         AND NOT EXISTS (
           SELECT 1 FROM transaction_splits s WHERE s.transaction_id = t.id
         )
       GROUP BY t.category_id
     ),
     split AS (
       SELECT s.category_id, COALESCE(SUM(s.amount), 0)::numeric(12,2) AS spent
       FROM transaction_splits s
       JOIN transactions t ON t.id = s.transaction_id
       WHERE s.user_id = $1 AND t.type = 'expense' AND t.date >= $2 AND t.date <= $3
       GROUP BY s.category_id
     )
     SELECT category_id, SUM(spent)::numeric(12,2) AS spent
     FROM (SELECT * FROM direct UNION ALL SELECT * FROM split) u
     GROUP BY category_id`,
    [userId, from, to]
  );
  const map = new Map<string, number>();
  for (const row of result.rows) map.set(row.category_id, Number(row.spent));
  return map;
}

/** Total expenses in a date range (used for the Overall budget). */
async function spendOverall(userId: number, from: string, to: string): Promise<number> {
  const result = await query<{ spent: string }>(
    `SELECT COALESCE(SUM(t.amount), 0)::numeric(12,2) AS spent
     FROM transactions t
     WHERE t.user_id = $1 AND t.type = 'expense' AND t.date >= $2 AND t.date <= $3`,
    [userId, from, to]
  );
  return Number(result.rows[0]?.spent ?? 0);
}

/** Child categories grouped by their parent id (budget spend includes descendants). */
async function categoryChildren(userId: number): Promise<Map<string, string[]>> {
  const result = await query<{ id: string; parent_id: string | null }>(
    `SELECT id, parent_id
     FROM categories
     WHERE user_id = $1 OR (user_id IS NULL AND is_system = 1)`,
    [userId]
  );
  const children = new Map<string, string[]>();
  for (const row of result.rows) {
    if (row.parent_id !== null) {
      const list = children.get(row.parent_id) ?? [];
      list.push(row.id);
      children.set(row.parent_id, list);
    }
  }
  return children;
}

function withUtilization(budget: Budget, spent: number): BudgetWithUtilization {
  const utilization_pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
  return {
    ...budget,
    spent,
    remaining: budget.amount - spent,
    utilization_pct: Math.round(utilization_pct * 100) / 100,
    is_over_budget: spent > budget.amount ? 1 : 0,
  };
}

export async function getBudgets(
  userId: number,
  month: number,
  year: number
): Promise<BudgetWithUtilization[]> {
  const { from, to } = monthRange(month, year);
  const result = await query<BudgetRow>(
    `${BUDGET_SELECT}
     AND b.month = $2 AND b.year = $3 AND b.is_active = 1`,
    [userId, month, year]
  );
  const rows = result.rows;
  if (rows.length === 0) return [];

  const [spendMap, overall, children] = await Promise.all([
    groupedSpend(userId, from, to),
    rows.some((r) => r.category_id === null)
      ? spendOverall(userId, from, to)
      : Promise.resolve(0),
    categoryChildren(userId),
  ]);

  const budgets = rows.map((row) => {
    const budget = toBudget(row);
    let spent = overall;
    if (budget.category_id !== null) {
      const catSet = [budget.category_id, ...(children.get(budget.category_id) ?? [])];
      spent = catSet.reduce((sum, id) => sum + (spendMap.get(id) ?? 0), 0);
    }
    return withUtilization(budget, spent);
  });
  budgets.sort((a, b) => b.utilization_pct - a.utilization_pct);
  return budgets;
}

export async function getBudgetById(
  userId: number,
  id: string
): Promise<BudgetWithUtilization | null> {
  const { rows } = await query<BudgetRow>(
    `${BUDGET_SELECT} AND b.id = $2`,
    [userId, id]
  );
  const row = rows[0];
  if (!row) return null;
  const budget = toBudget(row);
  const { from, to } = monthRange(budget.month, budget.year);
  const [spendMap, overall, children] = await Promise.all([
    groupedSpend(userId, from, to),
    budget.category_id === null ? spendOverall(userId, from, to) : Promise.resolve(0),
    categoryChildren(userId),
  ]);
  let spent = overall;
  if (budget.category_id !== null) {
    const catSet = [budget.category_id, ...(children.get(budget.category_id) ?? [])];
    spent = catSet.reduce((sum, id) => sum + (spendMap.get(id) ?? 0), 0);
  }
  return withUtilization(budget, spent);
}

export async function getOverview(
  userId: number,
  month: number,
  year: number
): Promise<BudgetOverview> {
  const { from, to } = monthRange(month, year);

  const totals = await query<{ budgeted: string; spent: string; count: string; over: string }>(
    `WITH budgeted AS (
       SELECT COALESCE(SUM(b.amount), 0)::numeric(12,2) AS total,
              COUNT(*)::int AS cnt
       FROM budgets b
       WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3 AND b.is_active = 1
     ),
     spent AS (
       SELECT COALESCE(SUM(t.amount), 0)::numeric(12,2) AS total
       FROM transactions t
       WHERE t.user_id = $1 AND t.type = 'expense' AND t.date >= $4 AND t.date <= $5
     ),
     over AS (
       SELECT COUNT(*)::int AS cnt
       FROM budgets b
       WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3 AND b.is_active = 1
         AND b.amount < (
           SELECT COALESCE(SUM(t.amount), 0)
           FROM transactions t
           WHERE t.user_id = b.user_id AND t.type = 'expense'
             AND t.date >= $4 AND t.date <= $5
             AND (b.category_id IS NULL OR t.category_id IN (
               SELECT id FROM categories WHERE id = b.category_id OR parent_id = b.category_id
             ))
         )
     )
     SELECT b.total AS budgeted, s.total AS spent, b.cnt AS count, o.cnt AS over
     FROM budgeted b, spent s, over o`,
    [userId, month, year, from, to]
  );
  const row = totals.rows[0];
  const totalBudgeted = Number(row?.budgeted ?? 0);
  const totalSpent = Number(row?.spent ?? 0);

  const unbudgetedResult = await query<UnbudgetedCategory & { spent: string }>(
    `WITH leaf_spend AS (
       SELECT c.id, c.name, c.icon, c.color,
              COALESCE(SUM(t.amount), 0)::numeric(12,2) AS spent
       FROM categories c
       LEFT JOIN transactions t
         ON t.category_id = c.id AND t.user_id = $1 AND t.type = 'expense'
         AND t.date >= $2 AND t.date <= $3
       WHERE (c.user_id IS NULL AND c.is_system = 1) OR c.user_id = $1
       GROUP BY c.id, c.name, c.icon, c.color
       HAVING SUM(t.amount) > 0
     ),
     budgeted_cats AS (
       SELECT DISTINCT b.category_id
       FROM budgets b
       WHERE b.user_id = $1 AND b.month = $4 AND b.year = $5 AND b.is_active = 1
     ),
     budgeted_parents AS (
       SELECT DISTINCT c.parent_id AS pid
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       WHERE b.user_id = $1 AND b.month = $4 AND b.year = $5 AND b.is_active = 1
         AND b.category_id IS NOT NULL
     )
     SELECT ls.id AS category_id, ls.name, ls.icon, ls.color, ls.spent
     FROM leaf_spend ls
     WHERE ls.id NOT IN (SELECT category_id FROM budgeted_cats WHERE category_id IS NOT NULL)
       AND ls.id NOT IN (SELECT pid FROM budgeted_parents WHERE pid IS NOT NULL)
     ORDER BY ls.spent DESC`,
    [userId, from, to, month, year]
  );

  return {
    month,
    year,
    total_budgeted: totalBudgeted,
    total_spent: totalSpent,
    utilization_pct:
      totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 10000) / 100 : 0,
    over_budget_count: Number(row?.over ?? 0),
    budgeted_count: Number(row?.count ?? 0),
    unbudgeted: unbudgetedResult.rows.map((u) => ({
      ...u,
      spent: Number(u.spent),
    })),
  };
}

export async function getBreakdown(
  userId: number,
  budgetId: string,
  month: number,
  year: number
): Promise<BudgetBreakdownItem[]> {
  const budget = await getBudgetById(userId, budgetId);
  if (!budget || budget.category_id === null) return [];
  const { from, to } = monthRange(month, year);
  const result = await query<{ category_id: string; name: string; icon: string | null; color: string | null; spent: string }>(
    `WITH child_spend AS (
       SELECT c.id, c.name, c.icon, c.color,
              COALESCE(SUM(t.amount), 0)::numeric(12,2) AS spent
       FROM categories c
       LEFT JOIN transactions t
         ON t.category_id = c.id AND t.user_id = $1 AND t.type = 'expense'
         AND t.date >= $2 AND t.date <= $3
       WHERE c.parent_id = $4
       GROUP BY c.id, c.name, c.icon, c.color
     )
     SELECT cs.id AS category_id, cs.name, cs.icon, cs.color, cs.spent
     FROM child_spend cs
     WHERE cs.spent > 0
     ORDER BY cs.spent DESC`,
    [userId, from, to, budget.category_id]
  );
  return result.rows.map((r) => ({
    ...r,
    spent: Number(r.spent),
    share_pct: budget.amount > 0 ? Math.round((Number(r.spent) / budget.amount) * 10000) / 100 : 0,
  }));
}

export async function createBudget(
  params: {
    userId: number;
    categoryId: string | null;
    amount: number;
    period: string;
    month: number;
    year: number;
    alert50: number;
    alert80: number;
    alert100: number;
  },
  q: Queryable = DB
): Promise<void> {
  await q.query(
    `INSERT INTO budgets
       (user_id, category_id, amount, period, month, year,
        alert_50, alert_80, alert_100)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      params.userId,
      params.categoryId,
      params.amount,
      params.period,
      params.month,
      params.year,
      params.alert50,
      params.alert80,
      params.alert100,
    ]
  );
}

export async function updateBudget(
  params: {
    userId: number;
    id: string;
    amount?: number;
    period?: string;
    alert50?: number;
    alert80?: number;
    alert100?: number;
    rolloverEnabled?: number;
    isActive?: number;
    version: number;
  },
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query(
    `UPDATE budgets
     SET amount = COALESCE($3, amount),
         period = COALESCE($4, period),
         alert_50 = COALESCE($5, alert_50),
         alert_80 = COALESCE($6, alert_80),
         alert_100 = COALESCE($7, alert_100),
         rollover_enabled = COALESCE($8, rollover_enabled),
         is_active = COALESCE($9, is_active),
         version = version + 1
     WHERE user_id = $1 AND id = $2 AND version = $10`,
    [
      params.userId,
      params.id,
      params.amount ?? null,
      params.period ?? null,
      params.alert50 ?? null,
      params.alert80 ?? null,
      params.alert100 ?? null,
      params.rolloverEnabled ?? null,
      params.isActive ?? null,
      params.version,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteBudgetByIdForMonth(q: Queryable, userId: number, id: string, month: number, year: number) {
  const result = await q.query(`DELETE FROM budgets WHERE user_id = $1 AND id = $2::uuid AND month = $3 AND year = $4`, [userId, id, month, year]);
  return (result.rowCount ?? 0) === 1;
}

/**
 * FR-3.4: deleting a budget removes it for ALL time periods (same category,
 * or all Overall budgets when the budget is the overall one).
 */
export async function deleteBudget(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<boolean> {
  const found = await q.query<{ category_id: string | null }>(
    `SELECT category_id FROM budgets WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  const categoryId = found.rows[0]?.category_id;
  if (categoryId === undefined) return false;

  await q.query(
    `DELETE FROM budgets WHERE user_id = $1 AND category_id IS NOT DISTINCT FROM $2`,
    [userId, categoryId]
  );
  return true;
}