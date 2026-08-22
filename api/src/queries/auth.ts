import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type LoginUserRow = {
  user_id: number;
  email: string;
  hashed_password: string | null;
};

export async function findActiveUserByEmail(
  email: string,
  q: Queryable = DB
): Promise<LoginUserRow | null> {
  const result = await q.query<LoginUserRow>(
    `SELECT user_id, email, hashed_password FROM users
     WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );
  return result.rows[0] ?? null;
}

/**
 * Creates the user + profile + default settings + signup audit log in one
 * transaction on the caller's client (route wraps this in withUser(0, ...)).
 */
export async function createUserWithDefaults(
  q: Queryable,
  params: { email: string; hashedPassword: string; name: string }
): Promise<number> {
  const userResult = await q.query<{ user_id: number }>(
    `INSERT INTO users (email, hashed_password)
     VALUES ($1, $2)
     RETURNING user_id`,
    [params.email, params.hashedPassword]
  );
  const uid = userResult.rows[0].user_id;

  await q.query(
    `INSERT INTO user_profiles (user_id, full_name) VALUES ($1, $2)`,
    [uid, params.name]
  );
  await q.query(
    `INSERT INTO user_settings (user_id, currency, theme, language)
     VALUES ($1, 'INR', 'light', 'en')`,
    [uid]
  );
  await q.query(
    `INSERT INTO access_logs (user_id, action) VALUES ($1, 'signup')`,
    [uid]
  );
  return uid;
}
