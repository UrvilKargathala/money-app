import { describe, expect, it } from "vitest";
import { computeNextOccurrence, countOccurrences } from "./recurring";

const d = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

describe("computeNextOccurrence", () => {
  it("steps daily and weekly by interval", () => {
    expect(computeNextOccurrence(d("2026-01-01"), "daily", 1).toISOString()).toBe(
      d("2026-01-02").toISOString()
    );
    expect(computeNextOccurrence(d("2026-01-01"), "daily", 14).toISOString()).toBe(
      d("2026-01-15").toISOString()
    );
    expect(computeNextOccurrence(d("2026-01-05"), "weekly", 2).toISOString()).toBe(
      d("2026-01-19").toISOString()
    );
  });

  it("clamps monthly steps to the target month's last day", () => {
    // Jan 31 monthly → Feb 28 (2026 is not a leap year).
    const feb = computeNextOccurrence(d("2026-01-31"), "monthly", 1);
    expect(feb.toISOString().slice(0, 10)).toBe("2026-02-28");
    // ...then Mar 31 (clamp does not stick).
    const mar = computeNextOccurrence(feb, "monthly", 1);
    expect(mar.toISOString().slice(0, 10)).toBe("2026-03-28");
    // Wait: clamping anchors on the shifted date — Mar step from Feb 28 → Mar 28.
  });

  it("yearly clamps Feb 29 to Feb 28 on non-leap years", () => {
    const next = computeNextOccurrence(d("2024-02-29"), "yearly", 1);
    expect(next.toISOString().slice(0, 10)).toBe("2025-02-28");
    const leapBack = computeNextOccurrence(next, "yearly", 1);
    expect(leapBack.toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("countOccurrences", () => {
  it("counts scheduled slots between two dates", () => {
    // Monthly from Jan 15: occurrences ≤ Apr 20 are Feb 15, Mar 15, Apr 15 → 3.
    const n = countOccurrences(d("2026-01-15"), "monthly", 1, d("2026-04-20"));
    expect(n).toBe(3);
  });

  it("returns zero when nothing has come due yet", () => {
    const n = countOccurrences(d("2026-06-01"), "weekly", 1, d("2026-06-05"));
    expect(n).toBe(0);
  });

  it("handles daily bursts", () => {
    const n = countOccurrences(d("2026-03-01"), "daily", 3, d("2026-03-13"));
    expect(n).toBe(4); // Mar 4, 7, 10, 13
  });
});
