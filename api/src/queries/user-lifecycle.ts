import { createHash } from "node:crypto";
import { query } from "../db";
import type { Queryable } from "./notes";

const DB: Queryable = { query: query };

// ---- auth token consumption (used by auth-extras routes) ----

export async function consumeAndResetPassword(
  q: Queryable,
  params: { rawToken: string; newPasswordHash: string }
): Promise<{ userId: number } | null> {
  const hash = createHash("sha256").update(params.rawToken).digest("hex");
  const consumed = await q.query<{ user_id: number }>(
    `UPDATE auth_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1::text AND token_type = 'password_reset'
       AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     RETURNING user_id`,
    [hash]
  );
  if (consumed.rowCount !== 1) return null;
  const userId = consumed.rows[0].user_id;

  await q.query(
    `UPDATE users SET hashed_password = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
    [userId, params.newPasswordHash]
  );
  await q.query(
    `UPDATE auth_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND token_type = 'session' AND revoked_at IS NULL`,
    [userId]
  );
  return { userId };
}


export async function consumeAndVerifyEmail(
  q: Queryable,
  rawToken: string
): Promise<boolean> {
  const hash = createHash("sha256").update(rawToken).digest("hex");
  const consumed = await q.query<{ user_id: number }>(
    `UPDATE auth_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1::text AND token_type = 'email_verify'
       AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     RETURNING user_id`,
    [hash]
  );
  if (consumed.rowCount !== 1) return false;
  await q.query(
    `UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
    [consumed.rows[0].user_id]
  );
  return true;
}

export async function consumeMagicLink(
  q: Queryable,
  rawToken: string
): Promise<number | null> {
  const hash = createHash("sha256").update(rawToken).digest("hex");
  const consumed = await q.query<{ user_id: number }>(
    `UPDATE auth_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1::text AND token_type = 'magic_link'
       AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     RETURNING user_id`,
    [hash]
  );
  return consumed.rowCount === 1 ? consumed.rows[0].user_id : null;
}

export async function changePassword(
  q: Queryable,
  params: {
    userId: number;
    currentPasswordHashVerified: boolean;
    newPasswordHash: string;
    keepSessionTokenId: number;
  }
): Promise<boolean> {
  if (!params.currentPasswordHashVerified) return false;
  await q.query(
    `UPDATE users SET hashed_password = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
    [params.userId, params.newPasswordHash]
  );
  await q.query(
    `UPDATE auth_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND token_type = 'session' AND revoked_at IS NULL
       AND token_id <> $2`,
    [params.userId, params.keepSessionTokenId]
  );
  return true;
}

export async function getCurrentPasswordHash(
  userId: number,
  q: Queryable = DB
): Promise<string | null> {
  const result = await q.query<{ hashed_password: string | null }>(
    `SELECT hashed_password FROM users WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return result.rows[0]?.hashed_password ?? null;
}

// ---- profile / settings / GDPR ----

export async function getProfile(userId: number, q: Queryable = DB) {
  const result = await q.query<{
    email: string; full_name: string | null; avatar_url: string | null;
    bio: string | null; email_verified_at: Date | null;
    currency: string; theme: string;
  }>(
    `SELECT u.email, p.full_name, p.avatar_url, p.bio, u.email_verified_at,
            s.currency, s.theme
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.user_id
     LEFT JOIN user_settings s ON s.user_id = u.user_id
     WHERE u.user_id = $1 AND u.deleted_at IS NULL`,
    [userId]
  );
  if (result.rowCount !== 1) return null;
  const row = result.rows[0];
  return {
    email: row.email, full_name: row.full_name, avatar_url: row.avatar_url,
    bio: row.bio, email_verified: row.email_verified_at !== null,
    currency: row.currency, theme: row.theme,
  };
}

export async function updateProfileFields(
  q: Queryable,
  params: { userId: number; fullName: string | null; bio: string | null }
) {
  await q.query(
    `UPDATE user_profiles SET full_name = COALESCE($2, full_name),
            bio = COALESCE($3, bio), updated_by = $1, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1`,
    [params.userId, params.fullName, params.bio]
  );
}

export async function updateSettings(
  q: Queryable,
  params: {
    userId: number;
    fields: Partial<Record<string, string | number | null>>;
  }
): Promise<void> {
  const keys = Object.keys(params.fields);
  if (keys.length === 0) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = keys.map((k) => params.fields[k]);
  await q.query(
    `UPDATE user_settings SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
    [params.userId, ...values]
  );
}

export function setAvatarUrl(q: Queryable, userId: number, url: string) {
  return q.query(
    `UPDATE user_profiles SET avatar_url = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
    [userId, url]
  );
}

// ---- GDPR lifecycle ----

export async function deactivateAccount(q: Queryable, userId: number) {
  await q.query(
    `UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  await q.query(
    `UPDATE auth_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND token_type = 'session' AND revoked_at IS NULL`,
    [userId]
  );
}

export async function restoreDeactivatedAccount(
  q: Queryable, userId: number
): Promise<boolean> {
  const result = await q.query<{ deleted_at: Date }>(
    `SELECT deleted_at FROM users
     WHERE user_id = $1 AND deleted_at IS NOT NULL
       AND deleted_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'`,
    [userId]
  );
  if (result.rowCount !== 1) return false;
  await q.query(`UPDATE users SET deleted_at = NULL WHERE user_id = $1`, [userId]);
  return true;
}

export async function purgeAccount(q: Queryable, userId: number): Promise<string> {
  const result = await q.query<{ deleted_at: Date }>(
    `SELECT deleted_at FROM users WHERE user_id = $1 AND deleted_at IS NOT NULL`,
    [userId]
  );
  if (result.rowCount !== 1) return "NOT_DEACTIVATED";
  const graceEnd = new Date(result.rows[0].deleted_at.getTime() + 30 * 86_400_000);
  if (graceEnd > new Date()) return "IN_GRACE";
  await q.query(`DELETE FROM users WHERE user_id = $1`, [userId]);
  return "PURGED";
}

const EXPORT_TABLES = [
  "accounts", "transactions", "budgets", "bills", "subscriptions",
  "goals", "debts", "investments", "sip_trackers", "dividend_income",
  "calendar_events", "secure_notes",
] as const;

export async function loadAllUserData(
  userId: number
): Promise<Record<string, unknown[]>> {
  const data: Record<string, unknown[]> = {};
  // Table names are from a hardcoded allowlist above — not user input.
  for (const table of EXPORT_TABLES) {
    const result = await DB.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userId]);
    data[table] = result.rows;
  }
  return data;
}

export async function getAuditLogs(
  userId: number, limit: number, offset: number, q: Queryable = DB
): Promise<Record<string, unknown>[]> {
  const result = await q.query<Record<string, unknown>>(
    `SELECT id, action, ip_address, created_at
     FROM access_logs WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2::int OFFSET $3::int`,
    [userId, limit, offset]
  );
  return result.rows;
}
