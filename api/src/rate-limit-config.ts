/**
 * Central rate-limit configuration — the kill-switch file.
 *
 * HOW TO USE:
 * - Tune a number to change that limiter. No other code changes needed.
 * - Set a MAX to 0 (or any window to 0) to DISABLE that limiter entirely.
 *   Example: `notifications: { maxRequests: 0, windowSeconds: 120 }`
 *   turns off notification throttling while leaving login protection on.
 *
 * SEMANTICS (login burst):
 * - `maxRequests` login POSTs within `windowSeconds` (per email OR per IP)
 *   trigger a block lasting `blockSeconds`.
 * - Example: 4 requests in 100s -> 429 with `Retry-After: 600` (10 minutes).
 *
 * SCOPE NOTES:
 * - Login limits are DB-backed (`login_attempts`) — exact across Vercel
 *   instances. Rejected attempts are recorded so an ongoing attack sustains
 *   its own block; the block lifts ~`blockSeconds` after the last attempt.
 * - Notification limits are in-memory per server instance — an approximate
 *   cost guard, not a security boundary (Vercel cold starts reset it).
 *   Login security always relies on the DB-backed rules below.
 */
export const rateLimitConfig = {
  login: {
    /** Burst size: this many login POSTs ... */
    maxRequests: 4,
    /** ... within this many seconds ... */
    windowSeconds: 100,
    /** ... block for this many seconds (600 = 10 minutes). 0 = disabled. */
    blockSeconds: 600,
  },
  /** Legacy second layer: failed-only attempts (unchanged behavior). */
  loginFailures: {
    maxAttempts: 5,
    windowMinutes: 15,
  },
  notifications: {
    /** Max notification reads per user per window (0 = disabled). */
    maxRequests: 30,
    windowSeconds: 120,
  },
  /**
   * Password-change abuse guard (authenticated endpoint, per user).
   * `maxRequests` attempts within `windowSeconds` trigger a block lasting
   * `blockSeconds` (0 = disabled). In-memory per instance, like
   * notifications — the login burst rule above stays the exact,
   * DB-backed credential defense.
   */
  passwordChange: {
    maxRequests: 5,
    windowSeconds: 100,
    blockSeconds: 600,
  },
};
