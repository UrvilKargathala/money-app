/**
 * Pure financial math shared by the Investment Tracker module.
 * No DB access — safe to unit test in isolation and reuse client-side later.
 */

export type CashFlow = {
  /** ISO date or Date — when the money moved. */
  date: string | Date;
  /** Signed amount: buys negative (outflow), sells/dividends/current value positive. */
  amount: number;
};

const DAY_MS = 86_400_000;

function toTime(d: string | Date): number {
  return typeof d === "string" ? new Date(`${d}T00:00:00Z`).getTime() : d.getTime();
}

/**
 * XIRR — annualized return for irregular cash flows (Newton-Raphson).
 * Requires at least one negative and one positive flow; returns null when
 * unsolvable (single lump-sum without proceeds, all-same-sign flows).
 */
export function xirr(
  flows: CashFlow[],
  options: { guess?: number; maxIterations?: number } = {}
): number | null {
  if (flows.length < 2) return null;

  const sorted = [...flows].sort((a, b) => toTime(a.date) - toTime(b.date));
  const t0 = toTime(sorted[0].date);
  if (!Number.isFinite(t0)) return null;
  const hasNeg = sorted.some((f) => f.amount < 0);
  const hasPos = sorted.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;

  // Years since first flow per flow.
  const t = sorted.map((f) => (toTime(f.date) - t0) / DAY_MS / 365);

  const npv = (rate: number): number =>
    sorted.reduce((acc, f, i) => acc + f.amount / Math.pow(1 + rate, t[i]), 0);
  const dNpv = (rate: number): number =>
    sorted.reduce(
      (acc, f, i) => acc - (t[i] * f.amount) / Math.pow(1 + rate, t[i] + 1),
      0
    );

  let rate = options.guess ?? 0.1;
  const maxIterations = options.maxIterations ?? 100;
  for (let i = 0; i < maxIterations; i++) {
    const value = npv(rate);
    if (Math.abs(value) < 1e-7) return rate;
    const slope = dNpv(rate);
    if (slope === 0 || !Number.isFinite(slope)) break;
    const next = rate - value / slope;
    // Damped Newton: keep the iterate inside a sane domain.
    if (!Number.isFinite(next)) break;
    rate = next <= -0.9999 ? (rate - 0.9999) / 2 : next;
  }
  // Bisection fallback over [-0.9999, 10] — XIRR is monotonic in this domain.
  let lo = -0.9999;
  let hi = 10;
  let loVal = npv(lo);
  let hiVal = npv(hi);
  if (loVal === 0) return lo;
  if (hiVal === 0) return hi;
  if (loVal * hiVal > 0) return Number.isFinite(rate) && Math.abs(npv(rate)) < 1e-4 ? rate : null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const midVal = npv(mid);
    if (Math.abs(midVal) < 1e-9) return mid;
    if (loVal * midVal < 0) {
      hi = mid;
      hiVal = midVal;
    } else {
      lo = mid;
      loVal = midVal;
    }
  }
  return (lo + hi) / 2;
}

/** Simple annualized CAGR fallback for single-flow holdings. */
export function cagr(
  invested: number,
  currentValue: number,
  startDate: string | Date,
  endDate: string | Date = new Date()
): number | null {
  if (invested <= 0 || currentValue <= 0) return null;
  const years = (toTime(endDate) - toTime(startDate)) / DAY_MS / 365;
  if (years <= 0) return null;
  return Math.pow(currentValue / invested, 1 / years) - 1;
}

export type SipFrequency = "monthly" | "quarterly";

export type SipProjection = {
  total_invested: number;
  maturity_value: number;
  gain: number;
};

/**
 * SIP what-if: installment `amount` every `frequency` period for `years`,
 * compounding at `expectedReturnPct` annual. Contributions at period START
 * (annuity-due) — the standard SIP convention.
 */
export function sipFutureValue(params: {
  amount: number;
  frequency: SipFrequency;
  years: number;
  expectedReturnPct: number;
}): SipProjection {
  const periodsPerYear = params.frequency === "monthly" ? 12 : 4;
  const n = Math.round(params.years * periodsPerYear);
  const i = params.expectedReturnPct / 100 / periodsPerYear;
  const totalInvested = params.amount * n;

  let maturityValue: number;
  if (i === 0) {
    maturityValue = totalInvested;
  } else {
    maturityValue = params.amount * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
  }
  return {
    total_invested: round2(totalInvested),
    maturity_value: round2(maturityValue),
    gain: round2(maturityValue - totalInvested),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
