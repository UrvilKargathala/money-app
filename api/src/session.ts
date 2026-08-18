import { createHash, randomBytes } from "node:crypto";
import { pool } from "./db";
import {
  DEFAULT_SESSION_SECONDS,
  REMEMBER_SESSION_SECONDS,
} from "./constants";
import type { SessionUser } from "./types";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a session token row and returns the raw token plus its maxAge in
 * seconds. The cookie itself is owned by the web layer (it sets/clears
 * `mm_session`); this service only stores and verifies the hash.
 */
export async function createSessionRecord(
  userId: number,
  remember: boolean
): Promise<{ token: string; maxAge: number }> {
  const token = randomBytes(32).toString("base64url");
  const maxAge = remember ? REMEMBER_SESSION_SECONDS : DEFAULT_SESSION_SECONDS;
  const expiresAt = new Date(Date.now() + maxAge * 1000);

  await pool.query(
    `INSERT INTO auth_tokens (user_id, token_hash, token_type, expires_at)
     VALUES ($1, $2, 'session', $3)`,
    [userId, hashToken(token), expiresAt]
  );

  await pool.query(
    `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
    [userId]
  );

  return { token, maxAge };
}

export async function getSessionUserByToken(
  token: string | undefined | null
): Promise<SessionUser | null> {
  if (!token) return null;

  const result = await pool.query<SessionUser>(
    `SELECT t.token_id, t.user_id, u.email, p.full_name
     FROM auth_tokens t
     JOIN users u ON u.user_id = t.user_id
     LEFT JOIN user_profiles p ON p.user_id = u.user_id
     WHERE t.token_hash = $1
       AND t.token_type = 'session'
       AND t.revoked_at IS NULL
       AND t.expires_at > CURRENT_TIMESTAMP`,
    [hashToken(token)]
  );

  const session = result.rows[0];
  if (!session) return null;

  await pool.query(
    `UPDATE auth_tokens SET last_seen_at = CURRENT_TIMESTAMP WHERE token_id = $1`,
    [session.token_id]
  );

  return session;
}

export async function revokeSessionByToken(
  token: string | undefined | null
): Promise<number | null> {
  if (!token) return null;

  const result = await pool.query<{ user_id: number }>(
    `UPDATE auth_tokens
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1 AND revoked_at IS NULL
     RETURNING user_id`,
    [hashToken(token)]
  );

  return result.rows[0]?.user_id ?? null;
}