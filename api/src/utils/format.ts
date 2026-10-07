export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Date-only helpers (YYYY-MM-DD). Two rules:
 * 1. pg DATE columns arrive as LOCAL-midnight Dates -> format them with
 *    local-getter isoDate() below. NEVER .toISOString() them (shifts back a
 *    day in +offset zones like IST).
 * 2. "YYYY-MM-DD" STRINGS are timezone-free -> parse/compare them via the
 *    UTC helpers here. Never `new Date("2026-10-07")` + toISOString round-
 *    trips, and never mix rule-1 Dates with rule-2 Dates in one diff.
 */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse "YYYY-MM-DD" as UTC midnight. Throws on bad shape or non-date. */
export function parseDateOnlyUTC(s: string): Date {
  if (!DATE_ONLY_RE.test(s)) throw new Error(`Invalid date: ${s}`);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${s}`);
  return d;
}

/** Format a Date as "YYYY-MM-DD" via UTC (inverse of parseDateOnlyUTC). */
export function formatDateOnlyUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b for date-only strings (UTC, DST-safe). */
export function daysBetweenDateOnly(a: string, b: string): number {
  return Math.round((parseDateOnlyUTC(b).getTime() - parseDateOnlyUTC(a).getTime()) / 86_400_000);
}

/** Today as "YYYY-MM-DD" (server UTC - matches DATE columns). */
export function todayUTC(): string {
  return formatDateOnlyUTC(new Date());
}

export function csvEscape(value: string | number | null): string {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}