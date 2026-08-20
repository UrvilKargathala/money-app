import type { Context } from "hono";
import bcrypt from "bcryptjs";
import { query } from "./db";

export const PASSWORD_MIN_LENGTH = 8;
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MINUTES = 15;
export const SIGNUP_MAX_PER_IP = 5;

/**
 * Pre-computed hash compared against whenever a login targets a missing user,
 * so enumeration via response-time is not possible.
 */
const DUMMY_HASH = bcrypt.hashSync("moneymind-timing-equalizer", 12);

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

export async function isRateLimited(email: string, ip: string): Promise<boolean> {
  const result = await query<{ by_email: string; by_ip: string }>(
    `SELECT
       (SELECT COUNT(*)::text
        FROM login_attempts
        WHERE email_attempt = $1 AND success = 0
          AND timestamp > CURRENT_TIMESTAMP - ($2 || ' minutes')::interval) AS by_email,
       (SELECT COUNT(*)::text
        FROM login_attempts
        WHERE ip_address = $3 AND ip_address <> 'local' AND success = 0
          AND timestamp > CURRENT_TIMESTAMP - ($2 || ' minutes')::interval) AS by_ip`,
    [email, LOGIN_WINDOW_MINUTES, ip]
  );
  const row = result.rows[0];
  return (
    Number(row?.by_email ?? 0) >= LOGIN_MAX_ATTEMPTS ||
    Number(row?.by_ip ?? 0) >= LOGIN_MAX_ATTEMPTS
  );
}

export async function isSignupRateLimited(ip: string): Promise<boolean> {
  if (ip === "local") return false;
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM access_logs
     WHERE action = 'signup' AND ip_address = $1
       AND timestamp > CURRENT_TIMESTAMP - ($2 || ' minutes')::interval`,
    [ip, LOGIN_WINDOW_MINUTES]
  );
  return Number(result.rows[0]?.count ?? 0) >= SIGNUP_MAX_PER_IP;
}

export async function verifyDummyPassword(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH);
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