export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";

const DAY_MS = 86_400_000;

/**
 * Next occurrence strictly AFTER `from` for frequency × interval.
 * Month/year arithmetic clamps to the last valid day (Jan 31 monthly →
 * Feb 28/29; yearly Feb 29 → Feb 28 on non-leap years).
 */
export function computeNextOccurrence(
  from: Date,
  frequency: RecurringFrequency,
  interval: number
): Date {
  const intervalValue = Math.max(1, Math.floor(interval));

  if (frequency === "daily") {
    return new Date(from.getTime() + intervalValue * DAY_MS);
  }

  if (frequency === "weekly") {
    return new Date(from.getTime() + intervalValue * 7 * DAY_MS);
  }

  if (frequency === "monthly") {
    return clampDay(from, (y, m) => [y, m + intervalValue] as const);
  }

  // yearly
  return clampDay(from, (y, m) => [y + intervalValue, m] as const);
}

/** Applies a year/month shift then clamps the day to the target month length. */
function clampDay(
  from: Date,
  shift: (year: number, monthIndex: number) => readonly [number, number]
): Date {
  const shifted = shift(from.getFullYear(), from.getMonth());
  const target = new Date(shifted[0], shifted[1], 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(from.getDate(), lastDay),
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
    from.getMilliseconds()
  );
}

/**
 * How many scheduled occurrences exist strictly between `startDate`
 * (exclusive) and `onOrBefore` (inclusive), given the schedule anchored at
 * startDate. Pure arithmetic — no execution history needed. Returns null when
 * unbounded (> maxScan occurrences).
 */
export function countOccurrences(
  startDate: Date,
  frequency: RecurringFrequency,
  interval: number,
  onOrBefore: Date,
  maxScan = 10_000
): number | null {
  let cursor = startDate;
  let count = 0;
  while (count <= maxScan) {
    const next = computeNextOccurrence(cursor, frequency, interval);
    if (next.getTime() > onOrBefore.getTime()) break;
    count += 1;
    cursor = next;
    if (cursor.getTime() > onOrBefore.getTime()) break;
  }
  if (count > maxScan) return null;
  return count;
}
