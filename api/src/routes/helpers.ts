import type { Context } from "hono";

export async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    return (await c.req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Request id for log/client correlation (set by the app-level middleware). */
export function requestIdOf(c: Context): string {
  try {
    const v = (c.get as unknown as (key: string) => unknown)("requestId");
    return typeof v === "string" && v.length > 0 ? v : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Standard 500 envelope: human message stays specific to the action, while
 * `code` lets clients distinguish failure classes and `requestId` joins the
 * client report to the server log line. Use for every 500 return.
 */
export function serverError(c: Context, code: string, message: string) {
  return c.json({ error: message, code, requestId: requestIdOf(c) }, 500);
}

export function isUniqueViolation(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

/** Escape text for safe interpolation into HTML (stored-XSS guard). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Shared list pagination: page/pageSize query params, pageSize clamped to
 * 1000 (default 500 — generous for entity dashboards, bounded against
 * pathological growth). Returns limit/offset for queries.
 */
export function readPagination(c: Context): { page: number; pageSize: number; limit: number; offset: number } {
  const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
  const pageSize = Math.min(1000, Math.max(1, Number(c.req.query("pageSize") ?? 500) || 500));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}