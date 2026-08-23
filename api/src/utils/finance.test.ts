import { describe, expect, it } from "vitest";
import { cagr, sipFutureValue, xirr } from "./finance";

describe("xirr", () => {
  it("solves a simple one-year doubling of 10%", () => {
    const rate = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate! * 100).toBeCloseTo(9.999, 1);
  });

  it("handles multi-date SIP-style flows", () => {
    // 12 monthly buys of 1000, then value 13000 exactly at month 12.
    const flows: { date: string; amount: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(Date.UTC(2025, m, 1));
      flows.push({ date: d.toISOString().slice(0, 10), amount: -1000 });
    }
    flows.push({ date: "2026-01-01", amount: 13000 });
    const rate = xirr(flows);
    expect(rate).not.toBeNull();
    // Roughly ~11% annualized for this ladder.
    expect(rate!).toBeGreaterThan(0.05);
    expect(rate!).toBeLessThan(0.2);
  });

  it("returns null for insufficient or single-sign flows", () => {
    expect(xirr([])).toBeNull();
    expect(xirr([{ date: "2025-01-01", amount: -1000 }])).toBeNull();
    expect(
      xirr([
        { date: "2025-01-01", amount: -1000 },
        { date: "2025-06-01", amount: -500 },
      ])
    ).toBeNull();
  });

  it("survives wild inputs without throwing", () => {
    expect(() =>
      xirr([
        { date: "2025-01-01", amount: -1 },
        { date: "2030-01-01", amount: 100_000_000 },
      ])
    ).not.toThrow();
  });
});

describe("cagr", () => {
  it("annualizes simple growth", () => {
    // 21% over exactly 2 years → ~10% p.a.
    const rate = cagr(1000, 1210, "2024-01-01", "2026-01-01");
    expect(rate).not.toBeNull();
    expect(rate! * 100).toBeCloseTo(10, 1);
  });

  it("returns null for non-positive inputs or zero duration", () => {
    expect(cagr(0, 100, "2025-01-01")).toBeNull();
    expect(cagr(100, -5, "2025-01-01")).toBeNull();
    expect(cagr(100, 110, "2026-01-01", "2026-01-01")).toBeNull();
  });
});

describe("sipFutureValue", () => {
  it("matches the annuity-due formula for a known case", () => {
    // 1000/month @12% p.a. for 1 year → FV = P * ((1+i)^n - 1)/i * (1+i)
    const proj = sipFutureValue({
      amount: 1000,
      frequency: "monthly",
      years: 1,
      expectedReturnPct: 12,
    });
    expect(proj.total_invested).toBe(12000);
    expect(proj.maturity_value).toBeCloseTo(12809.33, 1);
    expect(proj.gain).toBeCloseTo(proj.maturity_value - 12000, 2);
  });

  it("passes through principal when expected return is zero", () => {
    const proj = sipFutureValue({
      amount: 5000,
      frequency: "quarterly",
      years: 3,
      expectedReturnPct: 0,
    });
    expect(proj.total_invested).toBe(60000);
    expect(proj.maturity_value).toBe(60000);
    expect(proj.gain).toBe(0);
  });

  it("the classic 10k/10y/12% projection lands near 23.2L", () => {
    const proj = sipFutureValue({
      amount: 10000,
      frequency: "monthly",
      years: 10,
      expectedReturnPct: 12,
    });
    expect(proj.maturity_value).toBeGreaterThan(2_300_000);
    expect(proj.maturity_value).toBeLessThan(2_350_000);
  });
});
