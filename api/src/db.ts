import { Pool, type PoolClient, type QueryResultRow } from "pg";

export type { PoolClient } from "pg";

const globalForPg = globalThis as unknown as { mmPool?: Pool };

export const pool =
  globalForPg.mmPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForPg.mmPool = pool;

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return pool.query<T>(text, params);
}

/**
 * Runs `fn` inside a transaction with `app.current_user_id` set for the
 * duration of the transaction (SET LOCAL — never leaks to other requests on
 * the same pooled connection). Row Level Security policies in
 * `scripts/db_setup.py` are written against this setting; when connected as
 * the table owner (local dev) RLS is bypassed and the explicit user_id
 * filters in the queries remain the enforcement layer.
 */
export async function withUser<T>(
  userId: number,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.current_user_id', $1::text, true)",
      [String(userId)]
    );
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}