import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  is_system: number;
  version: number;
};

export async function listCategories(
  userId: number,
  q: Queryable = DB
): Promise<CategoryRow[]> {
  // 60s per-user memo (pool path only); CUD below invalidates.
  if (q === DB) {
    const hit = catCache.get(userId);
    if (hit && Date.now() - hit.at < CAT_TTL_MS) return hit.value;
    const rows = await listCategoriesFresh(userId, q);
    catCache.set(userId, { at: Date.now(), value: rows });
    if (catCache.size > 5000) catCache.clear();
    return rows;
  }
  return listCategoriesFresh(userId, q);
}

const CAT_TTL_MS = 60_000;
const catCache = new Map<number, { at: number; value: CategoryRow[] }>();

export function invalidateCategoryCache(userId?: number): void {
  if (userId === undefined) catCache.clear();
  else catCache.delete(userId);
}

async function listCategoriesFresh(
  userId: number,
  q: Queryable
): Promise<CategoryRow[]> {
  const result = await q.query<CategoryRow>(
    `SELECT id, name, parent_id, color, icon, is_system, version
     FROM categories
     WHERE (user_id IS NULL AND is_system = 1) OR user_id = $1
     ORDER BY is_system DESC, sort_order, name`,
    [userId]
  );
  return result.rows;
}

/** System rows (user_id IS NULL AND is_system = 1) are shared and readable by everyone. */
export async function getCategoryParentId(
  q: Queryable,
  parentId: string,
  userId: number
): Promise<{ parent_id: string | null } | null> {
  const result = await q.query<{ parent_id: string | null }>(
    `SELECT parent_id FROM categories
     WHERE id = $1 AND ((user_id IS NULL AND is_system = 1) OR user_id = $2)`,
    [parentId, userId]
  );
  return result.rows[0] ?? null;
}

export async function categoryNameClashExists(
  q: Queryable,
  name: string,
  userId: number
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `SELECT id FROM categories
     WHERE name = $1 AND ((user_id IS NULL AND is_system = 1) OR user_id = $2)`,
    [name, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function insertCategory(
  q: Queryable,
  params: {
    userId: number;
    parentId: string | null;
    name: string;
    color: string | null;
    icon: string | null;
  }
): Promise<{ id: string; name: string; parent_id: string | null; color: string | null; icon: string | null }> {
  const result = await q.query<{ id: string; name: string; parent_id: string | null; color: string | null; icon: string | null }>(
    `INSERT INTO categories (user_id, parent_id, name, is_system, color, icon, sort_order)
     VALUES ($1, $2, $3, 0, $4, $5, 100)
     RETURNING id, name, parent_id, color, icon`,
    [params.userId, params.parentId, params.name, params.color, params.icon]
  );
  invalidateCategoryCache(params.userId);
  return result.rows[0];
}

export function updateCategory(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    name: string;
    color: string | null;
    icon: string | null;
    version: number;
  }
) {
  return q.query(
    `UPDATE categories
     SET name = $3, color = $4, icon = $5, version = version + 1
     WHERE user_id = $1 AND id = $2 AND is_system = 0 AND version = $6`,
    [params.userId, params.id, params.name, params.color, params.icon, params.version]
  ).then((r) => {
    invalidateCategoryCache(params.userId);
    return r;
  });
}

export async function getCategoryUsageCounts(
  userId: number,
  categoryId: string,
  q: Queryable = DB
): Promise<{ txns: number; splits: number; budgets: number; subs: number }> {
  const result = await q.query<{
    txns: string;
    splits: string;
    budgets: string;
    subs: string;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND category_id = $2)::text AS txns,
       (SELECT COUNT(*) FROM transaction_splits WHERE user_id = $1 AND category_id = $2)::text AS splits,
       (SELECT COUNT(*) FROM budgets WHERE user_id = $1 AND category_id = $2 AND deleted_at IS NULL)::text AS budgets,
       (SELECT COUNT(*) FROM subscriptions WHERE user_id = $1 AND category_id = $2)::text AS subs`,
    [userId, categoryId]
  );
  const row = result.rows[0];
  return {
    txns: Number(row?.txns ?? 0),
    splits: Number(row?.splits ?? 0),
    budgets: Number(row?.budgets ?? 0),
    subs: Number(row?.subs ?? 0),
  };
}

export function deleteCategory(q: Queryable, userId: number, id: string) {
  invalidateCategoryCache(userId);
  return q.query(
    `DELETE FROM categories WHERE user_id = $1 AND id = $2 AND is_system = 0`,
    [userId, id]
  );
}
