import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./middleware";
import { rateLimitConfig } from "./rate-limit-config";

/**
 * In-memory sliding-window store: key -> request timestamps (ms).
 * Per server instance only — Vercel cold starts reset it. This is an
 * approximate cost guard for cheap read endpoints, never the login
 * security boundary (login uses DB-backed rules in `auth.ts`).
 */
const hits = new Map<string, number[]>();
/** Explicit block-until timestamps (ms) for limiters with a block duration. */
const blockedUntil = new Map<string, number>();

/** Test-only: clear all recorded windows (vitest file isolation helper). */
export function __clearRateLimitStore(): void {
  hits.clear();
  blockedUntil.clear();
}

/**
 * Throttles notification read endpoints per authenticated user.
 * Reads `rateLimitConfig.notifications` live, so setting `maxRequests`
 * (or the window) to 0 disables it without a redeploy of this file.
 * Over-budget callers get 429 + `Retry-After`.
 */
export function notificationsRateLimit() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const { maxRequests, windowSeconds } = rateLimitConfig.notifications;
    if (maxRequests <= 0 || windowSeconds <= 0) return next();

    const user = c.get("user");
    const key = `notif:${user?.user_id ?? "anon"}`;
    const now = Date.now();
    const cutoff = now - windowSeconds * 1000;
    const window = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (window.length >= maxRequests) {
      c.header("Retry-After", String(windowSeconds));
      return c.json(
        { error: "Too many requests. Please try again shortly." },
        429
      );
    }
    window.push(now);
    hits.set(key, window);
    await next();
  });
}

/**
 * Throttles password-change attempts per authenticated user: `maxRequests`
 * attempts within `windowSeconds` trigger a block lasting `blockSeconds`
 * (denials refresh the block, mirroring the login burst rule's sustain
 * behavior). Reads `rateLimitConfig.passwordChange` live — setting
 * `maxRequests` (or either window) to 0 disables it.
 */
export function passwordChangeRateLimit() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const { maxRequests, windowSeconds, blockSeconds } =
      rateLimitConfig.passwordChange;
    if (maxRequests <= 0 || windowSeconds <= 0 || blockSeconds <= 0) {
      return next();
    }

    const user = c.get("user");
    const key = `pwchange:${user?.user_id ?? "anon"}`;
    const now = Date.now();

    const unblockedAt = blockedUntil.get(key) ?? 0;
    if (unblockedAt > now) {
      c.header("Retry-After", String(Math.ceil((unblockedAt - now) / 1000)));
      return c.json(
        { error: "Too many password change attempts. Please try again later." },
        429
      );
    }

    const cutoff = now - windowSeconds * 1000;
    const window = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (window.length >= maxRequests) {
      blockedUntil.set(key, now + blockSeconds * 1000);
      c.header("Retry-After", String(blockSeconds));
      return c.json(
        { error: "Too many password change attempts. Please try again later." },
        429
      );
    }
    window.push(now);
    hits.set(key, window);
    await next();
  });
}
