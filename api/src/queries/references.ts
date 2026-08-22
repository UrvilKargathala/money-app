import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

/** System categories (user_id IS NULL AND is_system = 1) are shared and referenceable. */
export async function categoryReferenceExists(
  categoryId: string,
  userId: number,
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `SELECT id FROM categories
     WHERE id = $1 AND ((user_id IS NULL AND is_system = 1) OR user_id = $2)`,
    [categoryId, userId]
  );
  return result.rowCount === 1;
}

export async function activeAccountExists(
  accountId: string,
  userId: number,
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `SELECT id FROM accounts WHERE user_id = $1 AND id = $2 AND is_active = 1`,
    [userId, accountId]
  );
  return result.rowCount === 1;
}

export async function accountExists(
  accountId: string,
  userId: number,
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `SELECT id FROM accounts WHERE user_id = $1 AND id = $2`,
    [userId, accountId]
  );
  return result.rowCount === 1;
}
