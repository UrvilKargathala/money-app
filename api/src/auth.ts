import type { Context } from "hono";
import bcrypt from "bcryptjs";
import { query } from "./db";

export const PASSWORD_MIN_LENGTH = 8;
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MINUTES = 15;

export const passwordPolicyHint =
  "At least 8 characters, including a letter and a digit.";

export function isValidPassword(password: string) {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[a-zA-Z]/.test(password) &&
    /\d/.test(password)
  );
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hashed: string) {
  return bcrypt.compare(password, hashed);
}

export function getClientIp(c: Context) {
  const fwd = c.req.header("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "local";
}

export async function isRateLimited(email: string) {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM login_attempts
     WHERE email_attempt = $1
       AND success = 0
       AND timestamp > CURRENT_TIMESTAMP - ($2 || ' minutes')::interval`,
    [email, LOGIN_WINDOW_MINUTES]
  );
  return Number(result.rows[0]?.count ?? 0) >= LOGIN_MAX_ATTEMPTS;
}

export async function recordLoginAttempt(
  email: string,
  success: boolean,
  userId: number | null,
  ip: string
) {
  await query(
    `INSERT INTO login_attempts (user_id, email_attempt, ip_address, success)
     VALUES ($1, $2, $3, $4)`,
    [userId, email, ip, success ? 1 : 0]
  );
}

export async function recordAccessLog(
  userId: number | null,
  c: Context,
  action: string
) {
  await query(
    `INSERT INTO access_logs (user_id, ip_address, user_agent, action)
     VALUES ($1, $2, $3, $4)`,
    [
      userId,
      getClientIp(c),
      c.req.header("user-agent") ?? null,
      action,
    ]
  );
}