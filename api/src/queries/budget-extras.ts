import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query: query };

// ---------------------------------------------------------------------------
// Budget history / rollover / alerts / templates / status
// ---------------------------------------------------------------------------

export async function getBudgetHistory(
  userId: number,
  budgetId: string,
  q: Queryable = DB
): Promise<{ month: number; year: number; budgeted: number; spent: number }[]> {
  const result = await q.query<{
    month: number; year: number; budgeted: string; spent: string;
  }>(
    `SELECT b.month, b.year, b.amount::text AS budgeted,
            COALESCE((SELECT SUM(t.amount) FROM transactions t
              WHERE t.user_id = b.user_id AND t.category_id = b.category_id
                AND EXTRACT(YEAR FROM t.date)=b.year AND EXTRACT(MONTH FROM t.date)=b.month
                AND t.type='expense'),0)::text AS spent
     FROM budgets b
     WHERE b.user_id = $1 AND b.category_id = (SELECT category_id FROM budgets WHERE id = $2::uuid AND user_id = $1)
       AND b.deleted_at IS NULL AND b.category_id IS NOT NULL
     ORDER BY b.year DESC, b.month DESC LIMIT 12`,
    [userId, budgetId]
  );
  return result.rows.map((r) => ({
    month: r.month, year: r.year,
    budgeted: Number(r.budgeted), spent: Number(r.spent),
  }));
}

export function setRolloverEnabled(
  q: Queryable,
  params: { userId: number; budgetId: string; enabled: boolean }
) {
  return q.query(
    `UPDATE budgets SET rollover_enabled = $3, version = version + 1
     WHERE user_id = $1 AND id = $2::uuid RETURNING id`,
    [params.userId, params.budgetId, params.enabled ? 1 : 0]
  );
}

export async function getRolloverHistory(
  userId: number,
  q: Queryable = DB
): Promise<Record<string, unknown>[]> {
  const result = await q.query<Record<string, unknown>>(
    `SELECT br.* FROM budget_rollovers br
     WHERE br.user_id = $1 ORDER BY br.created_at DESC LIMIT 50`,
    [userId]
  );
  return result.rows;
}

export type BudgetAlertRow = {
  id: string; budget_id: string; alert_type: string;
  threshold_pct: number; message: string; created_at: string;
};

export async function listBudgetAlerts(
  userId: number,
  q: Queryable = DB
): Promise<BudgetAlertRow[]> {
  const result = await q.query<{
    id: string; budget_id: string; alert_type: string;
    threshold_pct: number | null; message: string; created_at: Date;
  }>(
    `SELECT ba.id, ba.budget_id, ba.alert_type, ba.threshold_pct, ba.message, ba.created_at
     FROM budget_alerts ba
     WHERE ba.user_id = $1 AND ba.is_dismissed = 0
     ORDER BY ba.created_at DESC LIMIT 50`,
    [userId]
  );
  return result.rows.map((r) => ({
    id: r.id, budget_id: r.budget_id, alert_type: r.alert_type,
    threshold_pct: r.threshold_pct ?? 0, message: r.message,
    created_at: r.created_at.toISOString(),
  }));
}

export function dismissBudgetAlert(q: Queryable, userId: number, alertId: string) {
  return q.query(
    `UPDATE budget_alerts SET is_dismissed = 1
     WHERE user_id = $1 AND id = $2::uuid`,
    [userId, alertId]
  );
}

export async function getSuggestedAmount(
  userId: number,
  categoryId: string,
  q: Queryable = DB
): Promise<number | null> {
  const result = await q.query<{ avg: string | null }>(
    `SELECT ROUND(AVG(monthly_spend))::text AS avg FROM (
       SELECT EXTRACT(YEAR FROM date)*100 + EXTRACT(MONTH FROM date) AS ym,
              SUM(amount) AS monthly_spend
       FROM transactions
       WHERE user_id = $1 AND category_id = $2::uuid AND type = 'expense'
         AND date >= CURRENT_DATE - INTERVAL '3 months'
       GROUP BY ym
     ) sub`,
    [userId, categoryId]
  );
  return result.rows[0]?.avg ? Number(result.rows[0].avg) : null;
}

export async function getMonthStatus(
  userId: number, month: number, year: number, q: Queryable = DB
): Promise<{
  total_budgeted: number; total_spent: number; over_budget_count: number;
  under_budget_count: number; budget_count: number;
}> {
  const result = await q.query<{
    total_budgeted: string; total_spent: string;
    over_count: string; under_count: string; count: string;
  }>(
    `SELECT COALESCE(SUM(b.amount),0)::text AS total_budgeted,
            COALESCE(SUM(COALESCE(s.spent,0)),0)::text AS total_spent,
            COUNT(*) FILTER (WHERE COALESCE(s.spent,0) > b.amount)::text AS over_count,
            COUNT(*) FILTER (WHERE COALESCE(s.spent,0) <= b.amount)::text AS under_count,
            COUNT(*)::text AS count
     FROM budgets b
     LEFT JOIN LATERAL (
       SELECT SUM(t.amount) AS spent FROM transactions t
       WHERE t.user_id = b.user_id AND t.category_id = b.category_id
         AND t.type = 'expense'
         AND EXTRACT(YEAR FROM t.date)=b.year AND EXTRACT(MONTH FROM t.date)=b.month
     ) s ON true
     WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3 AND b.deleted_at IS NULL`,
    [userId, month, year]
  );
  const row = result.rows[0];
  return {
    total_budgeted: Number(row?.total_budgeted ?? 0),
    total_spent: Number(row?.total_spent ?? 0),
    over_budget_count: Number(row?.over_count ?? 0),
    under_budget_count: Number(row?.under_count ?? 0),
    budget_count: Number(row?.count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Budget templates CRUD + apply
// ---------------------------------------------------------------------------

export type BudgetTemplateRow = {
  id: string; name: string; description: string | null; item_count: number;
};

export async function listBudgetTemplates(
  userId: number, q: Queryable = DB
): Promise<BudgetTemplateRow[]> {
  const result = await q.query<{
    id: string; name: string; description: string | null; item_count: string;
  }>(
    `SELECT bt.id, bt.name, bt.description,
            (SELECT COUNT(*) FROM budget_items bi WHERE bi.template_id = bt.id)::text AS item_count
     FROM budget_templates bt
     WHERE bt.user_id = $1 OR bt.user_id IS NULL
     ORDER BY bt.name`,
    [userId]
  );
  return result.rows.map((r) => ({ ...r, item_count: Number(r.item_count) }));
}

export async function getBudgetTemplate(
  userId: number, id: string, q: Queryable = DB
): Promise<Record<string, unknown> | null> {
  const tpl = await q.query<Record<string, unknown>>(
    `SELECT * FROM budget_templates
     WHERE id = $2::uuid AND (user_id = $1 OR user_id IS NULL)`,
    [userId, id]
  );
  if (tpl.rowCount !== 1) return null;
  const items = await q.query<Record<string, unknown>>(
    `SELECT bi.*, c.name AS category_name FROM budget_items bi
     LEFT JOIN categories c ON c.id = bi.category_id
     WHERE bi.template_id = $1::uuid`,
    [id]
  );
  return { ...tpl.rows[0], items: items.rows };
}

export async function insertBudgetTemplate(
  q: Queryable,
  params: { userId: number; name: string; description: string | null }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO budget_templates (user_id, name, description)
     VALUES ($1, $2, $3) RETURNING id`,
    [params.userId, params.name, params.description]
  );
  return result.rows[0].id;
}

export function updateBudgetTemplate(
  q: Queryable,
  params: { userId: number; id: string; name: string | null; description: string | null }
) {
  return q.query(
    `UPDATE budget_templates SET name = COALESCE($3, name), description = COALESCE($4, description)
     WHERE user_id = $1 AND id = $2::uuid`,
    [params.userId, params.id, params.name, params.description]
  );
}

export function deleteBudgetTemplate(q: Queryable, userId: number, id: string) {
  return q.query(
    `DELETE FROM budget_templates WHERE user_id = $1 AND id = $2::uuid`,
    [userId, id]
  );
}

/** Applies a template's items as budgets for the target month/year (upsert). */
export async function applyTemplate(
  q: Queryable,
  params: { userId: number; templateId: string; month: number; year: number }
): Promise<number> {
  const items = await q.query<{ category_id: string; amount: string; period: string }>(
    `SELECT category_id, amount::text AS amount, period FROM budget_items
     WHERE template_id = $1::uuid`,
    [params.templateId]
  );

  let applied = 0;
  // Bounded loop: template items are ≤20 by design (one per category).
  for (const item of items.rows) {
    if (!item.category_id) continue;
    await q.query(
      `INSERT INTO budgets
         (user_id, category_id, amount, period, month, year, deleted_at)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, NULL)
       ON CONFLICT (user_id, category_id, month, year) DO UPDATE SET
         amount = EXCLUDED.amount, version = version + 1`,
      [params.userId, item.category_id, Number(item.amount), item.period || "monthly",
       params.month, params.year]
    );
    applied += 1;
  }
  return applied;
}

/** Updates row_count on a completed export job (called from route after generation). */
export function setExportJobRowCount(
  q: Queryable,
  params: { userId: number; jobId: string; rowCount: number }
): void {
  void q.query(
    `UPDATE data_export_jobs SET row_count = $3 WHERE user_id = $1 AND id = $2::uuid`,
    [params.userId, params.jobId, params.rowCount]
  );
}
