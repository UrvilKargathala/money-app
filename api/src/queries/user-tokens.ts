import { createHash, randomBytes } from "node:crypto";
import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query: query };

export type AuthTokenType = "magic_link" | "password_reset" | "email_verify";

/** Generates a random token + its SHA-256 hash for storage. */
export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashTokenValue(raw) };
}

export function hashTokenValue(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Inserts an auth_token row. Returns the raw token (to embed in a URL). */
export async function createAuthToken(
  q: Queryable,
  params: {
    userId: number;
    tokenType: AuthTokenType;
    expiresInSeconds: number;
  }
): Promise<string> {
  const { raw, hash } = generateToken();
  await q.query(
    `INSERT INTO auth_tokens (user_id, token_hash, token_type, expires_at)
     VALUES ($1, $2, $3::text, NOW() + ($4::int * INTERVAL '1 second'))`,
    [params.userId, hash, params.tokenType, params.expiresInSeconds]
  );
  return raw;
}

export type ConsumedToken = {
  user_id: number;
  token_type: string;
} | null;

/**
 * Atomically consumes a one-time token: looks up by hash, verifies it's the
 * right type, not expired and not revoked. Marks it revoked on success.
 */
export async function consumeAuthToken(
  q: Queryable,
  rawToken: string,
  expectedType: AuthTokenType
): Promise<ConsumedToken> {
  const hash = hashTokenValue(rawToken);
  const result = await q.query<{
    user_id: number;
    token_type: string;
  }>(
    `UPDATE auth_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1::text AND token_type = $2::text
       AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     RETURNING user_id, token_type`,
    [hash, expectedType]
  );
  if (result.rowCount !== 1) return null;
  return {
    user_id: result.rows[0].user_id,
    token_type: result.rows[0].token_type,
  };
}

/** Lists active session tokens for a user. */
export async function listActiveSessions(
  userId: number,
  currentTokenId: number | null,
  q: Queryable = DB
): Promise<
  {
    token_id: number;
    device_label: string | null;
    last_seen_at: string | null;
    created_at: string;
    is_current: boolean;
  }[]
> {
  const result = await q.query<{
    token_id: number;
    device_label: string | null;
    last_seen_at: Date | null;
    created_at: Date;
  }>(
    `SELECT token_id, device_label, last_seen_at, created_at
     FROM auth_tokens
     WHERE user_id = $1 AND token_type = 'session'
       AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows.map((row) => ({
    token_id: row.token_id,
    device_label: row.device_label ?? "Unknown device",
    last_seen_at: row.last_seen_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    is_current: currentTokenId !== null && row.token_id === currentTokenId,
  }));
}

/** Revokes a specific session token (owner-checked). */
export function revokeSession(q: Queryable, userId: number, tokenId: number) {
  return q.query<{ token_id: number }>(
    `UPDATE auth_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND token_id = $2 AND token_type = 'session'
       AND revoked_at IS NULL RETURNING token_id`,
    [userId, tokenId]
  );
}

/** Revokes ALL sessions for a user (used after password reset/change). */
export function revokeAllSessions(q: Queryable, userId: number) {
  return q.query(
    `UPDATE auth_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND token_type = 'session' AND revoked_at IS NULL`,
    [userId]
  );
}
