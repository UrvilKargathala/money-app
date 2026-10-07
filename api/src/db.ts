import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { capContext } from "./cap-context";

export type { PoolClient } from "pg";

const globalForPg = globalThis as unknown as { mmPool?: Pool; mmPoolUrl?: string };
if (globalForPg.mmPool && globalForPg.mmPoolUrl !== process.env.DATABASE_URL) {
  void globalForPg.mmPool.end();
  globalForPg.mmPool = undefined;
}

export const pool =
  globalForPg.mmPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Kills runaway analytics/export queries before they starve the pool.
    statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 15_000),
  });

pool.on("error", (err) => {
  console.error(JSON.stringify({ level: "error", msg: "pg_pool_error", error: err.message }));
});

if (process.env.NODE_ENV !== "production") {
  globalForPg.mmPool = pool;
  globalForPg.mmPoolUrl = process.env.DATABASE_URL;
}

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  return pool.query<T>(text, params);
}

/**
 * Config-only variant of withUser for SINGLE-statement calls: sets
 * `app.current_user_id` for RLS without BEGIN/COMMIT (saves 2 round-trips
 * per call). The setting is session-scoped on a pooled connection, so it
 * is always reset before release - never leaks to the next borrower.
 */
export async function withUserSingle<T>(
  userId: number,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(
      "SELECT set_config('app.current_user_id', $1::text, false)",
      [String(userId)]
    );
    return await fn(client);
  } finally {
    try {
      await client.query("SELECT set_config('app.current_user_id', ''::text, false)");
    } catch {
      // Release anyway - a failed reset must not leak the connection.
    }
    client.release();
  }
}

/**
 * Runs `fn` inside a transaction with `app.current_user_id` set for the
 * duration of the transaction (SET LOCAL - never leaks to other requests on
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
    const failure = err as { constraint?: string; message?: string };
    const context = capContext.getStore();
    if (context && failure.constraint === "starter_plan_limit") context.message = failure.message;
    throw err;
  } finally {
    client.release();
  }
}
