import { query } from "../db";
import { isoDate } from "../utils/format";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type DebtRow = {
  id: string;
  user_id: number;
  name: string;
  type: string;
  lender: string | null;
  principal_original: string;
  principal_outstanding: string;
  interest_rate: string;
  emi_amount: string | null;
  minimum_due: string | null;
  tenure_months: number | null;
  months_remaining: number | null;
  start_date: string;
  end_date: string | null;
  account_id: string | null;
  account_name: string | null;
  total_interest_paid: string;
  is_active: number;
  notes: string | null;
  closed_date: string | null;
  version: number;
};

export type Debt = Omit<
  DebtRow,
  | "principal_original"
  | "principal_outstanding"
  | "interest_rate"
  | "emi_amount"
  | "minimum_due"
  | "total_interest_paid"
> & {
  principal_original: number;
  principal_outstanding: number;
  interest_rate: number;
  emi_amount: number | null;
  minimum_due: number | null;
  total_interest_paid: number;
  progress_pct: number | null;
  remaining_interest: number | null;
};

export type DebtPaymentRow = {
  id: string;
  debt_id: string;
  type: string;
  amount: string;
  principal_part: string;
  interest_part: string;
  outstanding_after: string;
  date: string;
  transaction_id: string | null;
  notes: string | null;
};

export type DebtPayment = Omit<
  DebtPaymentRow,
  "amount" | "principal_part" | "interest_part" | "outstanding_after"
> & {
  amount: number;
  principal_part: number;
  interest_part: number;
  outstanding_after: number;
};

export type ScheduleRow = {
  period: number;
  emi_amount: number;
  principal_part: number;
  interest_part: number;
  outstanding_after: number;
  cumulative_interest: number;
  scheduled_date: string | null;
};

export type DebtType = {
  type_code: string;
  display_name: string;
  is_secured: number;
  sort_order: number;
};

export type DtiResult = {
  monthly_income: number | null;
  total_monthly_emi: number;
  dti: number | null;
  level: "green" | "yellow" | "orange" | "red" | null;
  color: string | null;
};

export type PaymentStatusEntry = {
  month: string;
  status: "paid" | "partial" | "missed" | "scheduled" | "none";
  scheduled_emi: number | null;
  amount: number | null;
  period: number | null;
};

export type StrategyResult = {
  strategy: "avalanche" | "snowball";
  months_to_debt_free: number;
  total_interest: number;
  interest_saved: number;
  debt_free_date: string | null;
  payoff_order: string[];
};

export type SimulationOutput = {
  baseline: { months_to_debt_free: number; total_interest: number };
  avalanche: StrategyResult;
  snowball: StrategyResult;
};

export type HealthAlert = {
  type: "high_dti" | "missed_payments" | "no_recent_payment";
  severity: "info" | "warning" | "critical";
  details: unknown;
};

const DEBT_SELECT = `
  SELECT d.id, d.user_id, d.name, d.type, d.lender,
         d.principal_original::text AS principal_original,
         d.principal_outstanding::text AS principal_outstanding,
         d.interest_rate::text AS interest_rate,
         d.emi_amount::text AS emi_amount,
         d.minimum_due::text AS minimum_due,
         d.tenure_months, d.months_remaining,
         d.start_date::text AS start_date, d.end_date::text AS end_date,
         d.account_id, a.name AS account_name,
         d.total_interest_paid::text AS total_interest_paid,
         d.is_active, d.notes, d.closed_date::text AS closed_date, d.version
  FROM debts d
  LEFT JOIN accounts a ON a.id = d.account_id
`;

export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export function monthlyRate(annualRate: number): number {
  return annualRate / 100 / 12;
}

export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const daysInMonth = new Date(ny, nm, 0).getDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, daysInMonth)).padStart(2, "0")}`;
}

export { isoDate };

/** Standard EMI formula: P·r·(1+r)ⁿ / ((1+r)ⁿ − 1), r = annual/1200. */
export function emiFor(principal: number, annualRate: number, months: number): number {
  if (months <= 0) return 0;
  const r = monthlyRate(annualRate);
  if (r === 0) return money(principal / months);
  return money(
    (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1)
  );
}

export type AmortizationRow = {
  period: number;
  emi_amount: number;
  principal_part: number;
  interest_part: number;
  outstanding_after: number;
  cumulative_interest: number;
  scheduled_date: string | null;
};

/**
 * Mirrors `scripts/mock_data.py` `amortize()` exactly so seeded demo data
 * matches server-side generation (FR-6.9).
 */
export function amortize(
  principal: number,
  annualRate: number,
  months: number,
  anchorDate?: string
): AmortizationRow[] {
  const emi = emiFor(principal, annualRate, months);
  const r = monthlyRate(annualRate);
  let out = principal;
  let cum = 0;
  const rows: AmortizationRow[] = [];
  for (let k = 1; k <= months; k++) {
    const interest = money(out * r);
    const p = k === months ? out : money(emi - interest);
    out = money(out - p);
    if (out < 0) out = 0;
    cum = money(cum + interest);
    rows.push({
      period: k,
      emi_amount: emi,
      principal_part: p,
      interest_part: interest,
      outstanding_after: out,
      cumulative_interest: cum,
      scheduled_date: anchorDate ? addMonths(anchorDate, k - 1) : null,
    });
  }
  return rows;
}

/** Months needed to amortize `principal` at `emiAmount`/rate (cap 600). */
export function deriveMonths(
  principal: number,
  annualRate: number,
  emiAmount: number,
  cap = 600
): number {
  if (emiAmount <= 0 || principal <= 0) return 0;
  const r = monthlyRate(annualRate);
  let out = principal;
  let months = 0;
  while (out > 0 && months < cap) {
    months++;
    const interest = money(out * r);
    const p = money(emiAmount - interest);
    out = money(out - p);
  }
  return months;
}

/** Splits a payment into principal/interest from the outstanding balance. */
export function splitPayment(
  outstanding: number,
  annualRate: number,
  amount: number
): { principal_part: number; interest_part: number; outstanding_after: number } {
  const interest = money(outstanding * monthlyRate(annualRate));
  const principal = Math.max(0, money(amount - interest));
  return {
    principal_part: principal,
    interest_part: money(amount - principal),
    outstanding_after: Math.max(0, money(outstanding - principal)),
  };
}

function toDebt(row: DebtRow, remainingInterest: number | null): Debt {
  const tenure = row.tenure_months ?? null;
  const remaining = row.months_remaining ?? null;
  let progressPct: number | null = null;
  if (tenure !== null) {
    const elapsed = tenure - (remaining ?? tenure);
    progressPct = Math.max(
      0,
      Math.min(100, Math.round((elapsed / tenure) * 1000) / 10)
    );
  }
  return {
    ...row,
    principal_original: Number(row.principal_original),
    principal_outstanding: Number(row.principal_outstanding),
    interest_rate: Number(row.interest_rate),
    emi_amount: row.emi_amount === null ? null : Number(row.emi_amount),
    minimum_due: row.minimum_due === null ? null : Number(row.minimum_due),
    total_interest_paid: Number(row.total_interest_paid),
    progress_pct: progressPct,
    remaining_interest: remainingInterest,
  };
}

export async function getDebts(
  userId: number,
  types?: string[],
  status?: "active" | "closed"
): Promise<Debt[]> {
  const where = ["d.user_id = $1"];
  const params: unknown[] = [userId];
  if (status) {
    params.push(status === "active" ? 1 : 0);
    where.push(`d.is_active = $${params.length}`);
  }
  if (types && types.length > 0) {
    params.push(types);
    where.push(`d.type = ANY($${params.length}::text[])`);
  }
  const result = await query<DebtRow>(
    `${DEBT_SELECT}
     WHERE ${where.join(" AND ")}
     ORDER BY d.interest_rate DESC, d.months_remaining ASC NULLS LAST, d.name ASC`,
    params
  );
  const ids = result.rows.map((r) => r.id);
  const remaining = ids.length > 0 ? await getRemainingInterest(userId, ids) : new Map();
  return result.rows.map((row) => toDebt(row, remaining.get(row.id) ?? null));
}

export async function getDebtById(
  userId: number,
  id: string
): Promise<Debt | null> {
  const result = await query<DebtRow>(
    `${DEBT_SELECT} WHERE d.user_id = $1 AND d.id = $2`,
    [userId, id]
  );
  const row = result.rows[0];
  if (!row) return null;
  const remaining = await getRemainingInterest(userId, [id]);
  return toDebt(row, remaining.get(id) ?? null);
}

async function getRemainingInterest(
  userId: number,
  debtIds: string[]
): Promise<Map<string, number>> {
  const result = await query<{ debt_id: string; total: string }>(
    `SELECT debt_id, COALESCE(SUM(interest_part), 0)::numeric(12,2) AS total
     FROM amortization_schedule
     WHERE user_id = $1 AND debt_id = ANY($2::uuid[])
     GROUP BY debt_id`,
    [userId, debtIds]
  );
  const map = new Map<string, number>();
  for (const row of result.rows) {
    if (Number(row.total) > 0) map.set(row.debt_id, Number(row.total));
  }
  return map;
}

export async function createDebt(
  params: {
    userId: number;
    name: string;
    type: string;
    lender: string | null;
    principalOriginal: number;
    principalOutstanding: number;
    interestRate: number;
    emiAmount: number | null;
    minimumDue: number | null;
    tenureMonths: number | null;
    monthsRemaining: number | null;
    startDate: string;
    endDate: string | null;
    accountId: string | null;
    notes: string | null;
  },
  q: Queryable = DB
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO debts
       (user_id, name, type, lender, principal_original, principal_outstanding,
        interest_rate, emi_amount, minimum_due, tenure_months, months_remaining,
        start_date, end_date, account_id, total_interest_paid, is_active, notes,
        created_by, updated_by, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::date, $13::date,
             $14::uuid, 0, 1, $15, $1, $1, 1)
     RETURNING id`,
    [
      params.userId,
      params.name,
      params.type,
      params.lender,
      params.principalOriginal,
      params.principalOutstanding,
      params.interestRate,
      params.emiAmount,
      params.minimumDue,
      params.tenureMonths,
      params.monthsRemaining,
      params.startDate,
      params.endDate,
      params.accountId,
      params.notes,
    ]
  );
  return result.rows[0].id;
}

export async function updateDebt(
  params: {
    userId: number;
    id: string;
    name?: string;
    type?: string;
    lender?: string | null;
    principalOriginal?: number;
    principalOutstanding?: number;
    interestRate?: number;
    emiAmount?: number | null;
    minimumDue?: number | null;
    tenureMonths?: number | null;
    startDate?: string;
    accountProvided: boolean;
    accountId?: string | null;
    notes?: string | null;
    version: number;
  },
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query(
    `UPDATE debts
     SET name = COALESCE($3, name),
         type = COALESCE($4, type),
         lender = CASE WHEN $5 THEN $6 ELSE lender END,
         principal_original = COALESCE($7, principal_original),
         principal_outstanding = COALESCE($8, principal_outstanding),
         interest_rate = COALESCE($9, interest_rate),
         emi_amount = CASE WHEN $10 THEN $11::numeric ELSE emi_amount END,
         minimum_due = CASE WHEN $12 THEN $13::numeric ELSE minimum_due END,
         tenure_months = CASE WHEN $14 THEN $15::integer ELSE tenure_months END,
         start_date = COALESCE($16::date, start_date),
         account_id = CASE WHEN $17 THEN $18::uuid ELSE account_id END,
         notes = COALESCE($19, notes),
         version = version + 1
     WHERE user_id = $1 AND id = $2 AND version = $20`,
    [
      params.userId,
      params.id,
      params.name ?? null,
      params.type ?? null,
      params.lender !== undefined,
      params.lender ?? null,
      params.principalOriginal ?? null,
      params.principalOutstanding ?? null,
      params.interestRate ?? null,
      params.emiAmount !== undefined,
      params.emiAmount ?? null,
      params.minimumDue !== undefined,
      params.minimumDue ?? null,
      params.tenureMonths !== undefined,
      params.tenureMonths ?? null,
      params.startDate ?? null,
      params.accountProvided,
      params.accountId ?? null,
      params.notes ?? null,
      params.version,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Applies derived months_remaining/end_date after a schedule-affecting edit. */
export async function updateDebtDerived(
  q: Queryable,
  userId: number,
  id: string,
  monthsRemaining: number | null,
  endDate: string | null
): Promise<void> {
  await q.query(
    `UPDATE debts
     SET months_remaining = $3, end_date = $4::date
     WHERE user_id = $1 AND id = $2`,
    [userId, id, monthsRemaining, endDate]
  );
}

export async function deleteDebt(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query(
    `DELETE FROM debts WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function countDebtPayments(
  q: Queryable,
  userId: number,
  id: string
): Promise<number> {
  const result = await q.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM debt_payments
     WHERE user_id = $1 AND debt_id = $2`,
    [userId, id]
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function setDebtActive(
  q: Queryable,
  userId: number,
  id: string,
  isActive: number,
  closedDate: string | null
): Promise<boolean> {
  const result = await q.query(
    `UPDATE debts
     SET is_active = $3, closed_date = $4::date
     WHERE user_id = $1 AND id = $2`,
    [userId, id, isActive, closedDate]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Regenerates the cached amortization_schedule rows for a debt (FR-6.3/6.18).
 * Anchor = one month after the most recent payment date, or the loan start
 * date when no payments exist. Credit-card debts have no schedule.
 */
export async function regenerateSchedule(
  q: Queryable,
  userId: number,
  debtId: string,
  outstanding: number,
  annualRate: number,
  emiAmount: number | null,
  anchorDate: string
): Promise<number> {
  await q.query(
    `DELETE FROM amortization_schedule WHERE user_id = $1 AND debt_id = $2`,
    [userId, debtId]
  );
  if (emiAmount === null || emiAmount <= 0 || outstanding <= 0) return 0;
  const n = deriveMonths(outstanding, annualRate, emiAmount);
  if (n <= 0) return 0;
  const rows = amortize(outstanding, annualRate, n, anchorDate);
  if (rows.length === 0) return 0;

  const values = rows
    .map(
      (_, i) =>
        `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, ` +
        `$${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9}, CURRENT_TIMESTAMP)`
    )
    .join(", ");
  const params = rows.flatMap((row) => [
    userId,
    debtId,
    row.period,
    row.emi_amount,
    row.principal_part,
    row.interest_part,
    row.outstanding_after,
    row.cumulative_interest,
    row.scheduled_date,
  ]);

  await q.query(
    `INSERT INTO amortization_schedule
       (user_id, debt_id, period, emi_amount, principal_part, interest_part,
        outstanding_after, cumulative_interest, scheduled_date, regenerated_at)
     VALUES ${values}`,
    params
  );
  return n;
}

export async function getScheduleRows(
  userId: number,
  debtId: string
): Promise<ScheduleRow[]> {
  const result = await query<{
    period: number;
    emi_amount: string;
    principal_part: string;
    interest_part: string;
    outstanding_after: string;
    cumulative_interest: string;
    scheduled_date: string | null;
  }>(
    `SELECT period, emi_amount::text, principal_part::text, interest_part::text,
            outstanding_after::text, cumulative_interest::text,
            scheduled_date::text
     FROM amortization_schedule
     WHERE user_id = $1 AND debt_id = $2
     ORDER BY period ASC`,
    [userId, debtId]
  );
  return result.rows.map((row) => ({
    period: row.period,
    emi_amount: Number(row.emi_amount),
    principal_part: Number(row.principal_part),
    interest_part: Number(row.interest_part),
    outstanding_after: Number(row.outstanding_after),
    cumulative_interest: Number(row.cumulative_interest),
    scheduled_date: row.scheduled_date,
  }));
}

export async function getPayments(
  userId: number,
  debtId: string
): Promise<DebtPayment[]> {
  const result = await query<DebtPaymentRow>(
    `SELECT id, debt_id, type, amount::text, principal_part::text,
            interest_part::text, outstanding_after::text, date::text,
            transaction_id, notes
     FROM debt_payments
     WHERE user_id = $1 AND debt_id = $2
     ORDER BY date ASC, created_at ASC, id ASC`,
    [userId, debtId]
  );
  return result.rows.map((row) => ({
    ...row,
    amount: Number(row.amount),
    principal_part: Number(row.principal_part),
    interest_part: Number(row.interest_part),
    outstanding_after: Number(row.outstanding_after),
  }));
}

export async function insertPayment(
  params: {
    userId: number;
    debtId: string;
    type: string;
    amount: number;
    principalPart: number;
    interestPart: number;
    outstandingAfter: number;
    date: string;
    transactionId: string | null;
    notes: string | null;
  },
  q: Queryable = DB
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO debt_payments
       (user_id, debt_id, type, amount, principal_part, interest_part,
        outstanding_after, date, transaction_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::uuid, $10)
     RETURNING id`,
    [
      params.userId,
      params.debtId,
      params.type,
      params.amount,
      params.principalPart,
      params.interestPart,
      params.outstandingAfter,
      params.date,
      params.transactionId,
      params.notes,
    ]
  );
  return result.rows[0].id;
}

export async function updatePayment(
  params: {
    userId: number;
    debtId: string;
    id: string;
    amount?: number;
    date?: string;
    notes?: string | null;
  },
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query(
    `UPDATE debt_payments
     SET amount = COALESCE($4, amount),
         date = COALESCE($5::date, date),
         notes = COALESCE($6, notes)
     WHERE user_id = $1 AND debt_id = $2 AND id = $3`,
    [
      params.userId,
      params.debtId,
      params.id,
      params.amount ?? null,
      params.date ?? null,
      params.notes ?? null,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deletePayment(
  userId: number,
  debtId: string,
  id: string,
  q: Queryable = DB
): Promise<{ ok: boolean; principalPart: number | null }> {
  const result = await q.query<{ principal_part: string }>(
    `DELETE FROM debt_payments
     WHERE user_id = $1 AND debt_id = $2 AND id = $3
     RETURNING principal_part`,
    [userId, debtId, id]
  );
  return {
    ok: (result.rowCount ?? 0) > 0,
    principalPart: result.rows[0] ? Number(result.rows[0].principal_part) : null,
  };
}

/**
 * Replays the payment chain forward from the outstanding balance before the
 * earliest payment (recovered via the invariant `O0 = last outstanding_after +
 * SUM(principal_part)`) so the outstanding_after column stays consistent after
 * a payment edit/delete. Returns the debt's outstanding balance and the total
 * interest paid across all payments.
 */
export async function replayPayments(
  q: Queryable,
  userId: number,
  debtId: string,
  annualRate: number
): Promise<{ outstanding: number; totalInterestPaid: number }> {
  const payments = await q.query<{
    id: string;
    type: string;
    amount: string;
    date: string;
  }>(
    `SELECT id, type, amount, date::text
     FROM debt_payments
     WHERE user_id = $1 AND debt_id = $2
     ORDER BY date ASC, created_at ASC, id ASC`,
    [userId, debtId]
  );
  const initial = await q.query<{ outstanding: string; paid: string }>(
    `SELECT d.principal_outstanding::text AS outstanding,
            d.total_interest_paid::text AS paid
     FROM debts d WHERE d.user_id = $1 AND d.id = $2`,
    [userId, debtId]
  );
  const sum = await q.query<{ total: string }>(
    `SELECT COALESCE(SUM(principal_part), 0)::numeric(12,2) AS total
     FROM debt_payments WHERE user_id = $1 AND debt_id = $2`,
    [userId, debtId]
  );
  let out = Number(initial.rows[0]?.outstanding ?? 0) + Number(sum.rows[0]?.total ?? 0);
  let totalInterest = 0;

  const updates = payments.rows.map((payment) => {
    const amount = Number(payment.amount);
    const split = splitPayment(out, annualRate, amount);
    out = split.outstanding_after;
    totalInterest = money(totalInterest + split.interest_part);
    return { id: payment.id, ...split };
  });

  if (updates.length > 0) {
    await q.query(
      `UPDATE debt_payments p
       SET principal_part = u.principal,
           interest_part = u.interest,
           outstanding_after = u.outstanding_after
       FROM unnest(
         $1::uuid[], $2::numeric(12,2)[], $3::numeric(12,2)[], $4::numeric(12,2)[]
       ) AS u(id, principal, interest, outstanding_after)
       WHERE p.user_id = $5 AND p.id = u.id`,
      [
        updates.map((u) => u.id),
        updates.map((u) => u.principal_part),
        updates.map((u) => u.interest_part),
        updates.map((u) => u.outstanding_after),
        userId,
      ]
    );
  }
  return { outstanding: out, totalInterestPaid: totalInterest };
}

export async function getMonthlyIncome(userId: number): Promise<number | null> {
  const result = await query<{ monthly_income: string | null }>(
    `SELECT monthly_income::text FROM user_settings WHERE user_id = $1`,
    [userId]
  );
  const raw = result.rows[0]?.monthly_income;
  return raw === null || raw === undefined ? null : Number(raw);
}

export async function getSettings(userId: number): Promise<{
  currency: string;
  theme: string;
  language: string;
  notifications_enabled: number;
  monthly_income: number | null;
}> {
  const result = await query<{
    currency: string;
    theme: string;
    language: string;
    notifications_enabled: number;
    monthly_income: string | null;
  }>(
    `SELECT currency, theme, language, notifications_enabled, monthly_income::text
     FROM user_settings WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) {
    return {
      currency: "INR",
      theme: "light",
      language: "en",
      notifications_enabled: 1,
      monthly_income: null,
    };
  }
  return {
    currency: row.currency,
    theme: row.theme,
    language: row.language,
    notifications_enabled: row.notifications_enabled,
    monthly_income: row.monthly_income == null ? null : Number(row.monthly_income),
  };
}

export async function setMonthlyIncome(
  userId: number,
  income: number | null
): Promise<void> {
  await query(
    `UPDATE user_settings SET monthly_income = $2 WHERE user_id = $1`,
    [userId, income]
  );
}

export function dtiOf(
  monthlyIncome: number | null,
  totalMonthlyEmi: number
): DtiResult {
  if (monthlyIncome === null || monthlyIncome <= 0) {
    return {
      monthly_income: null,
      total_monthly_emi: totalMonthlyEmi,
      dti: null,
      level: null,
      color: null,
    };
  }
  const dti = Math.round((totalMonthlyEmi / monthlyIncome) * 10000) / 100;
  let level: DtiResult["level"];
  let color: string | null;
  if (dti < 30) {
    level = "green";
    color = "#16a34a";
  } else if (dti < 40) {
    level = "yellow";
    color = "#eab308";
  } else if (dti < 50) {
    level = "orange";
    color = "#f97316";
  } else {
    level = "red";
    color = "#dc2626";
  }
  return { monthly_income: monthlyIncome, total_monthly_emi: totalMonthlyEmi, dti, level, color };
}

export async function getDti(userId: number): Promise<DtiResult> {
  const income = await getMonthlyIncome(userId);
  const result = await query<{ total_emi: string }>(
    `SELECT COALESCE(SUM(emi_amount), 0)::numeric(12,2) AS total_emi
     FROM debts WHERE user_id = $1 AND is_active = 1 AND emi_amount IS NOT NULL`,
    [userId]
  );
  return dtiOf(income, Number(result.rows[0]?.total_emi ?? 0));
}

type StatusSchedRow = { period: number; emi_amount: string; scheduled_date: string | null };
type StatusPayRow = { amount: string; date: string };

/** In-memory payment-status computation shared by single-debt and bulk paths. */
function computeStatusEntries(
  schedRows: StatusSchedRow[],
  paysRows: StatusPayRow[]
): PaymentStatusEntry[] {
  if (schedRows.length === 0) return [];

  const byMonth = new Map<string, number>();
  for (const p of paysRows) {
    byMonth.set(p.date.slice(0, 7), Number(p.amount));
  }

  const now = new Date();
  const entries: PaymentStatusEntry[] = [];
  for (let i = 11; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    const periodRow = schedRows.find(
      (r) => r.scheduled_date?.slice(0, 7) === key
    );
    if (!periodRow) {
      entries.push({
        month: key,
        status: "none",
        scheduled_emi: null,
        amount: null,
        period: null,
      });
      continue;
    }
    const scheduledEmi = Number(periodRow.emi_amount);
    const amount = byMonth.get(key) ?? null;
    let status: PaymentStatusEntry["status"];
    if (amount === null) {
      const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      status = key < currentKey ? "missed" : "scheduled";
    } else if (amount >= scheduledEmi) {
      status = "paid";
    } else {
      status = "partial";
    }
    entries.push({
      month: key,
      status,
      scheduled_emi: scheduledEmi,
      amount,
      period: periodRow.period,
    });
  }
  return entries;
}

/** FR-6.27: paid / missed / partial / scheduled per scheduled period, last 12 months. */
export async function getPaymentStatus(
  userId: number,
  debtId: string
): Promise<PaymentStatusEntry[]> {
  const sched = await query<StatusSchedRow>(
    `SELECT period, emi_amount::text, scheduled_date::text
     FROM amortization_schedule
     WHERE user_id = $1 AND debt_id = $2
     ORDER BY period ASC`,
    [userId, debtId]
  );
  if (sched.rows.length === 0) return [];

  const pays = await query<StatusPayRow>(
    `SELECT amount::text, date::text
     FROM debt_payments
     WHERE user_id = $1 AND debt_id = $2 AND type = 'emi'
     ORDER BY date ASC`,
    [userId, debtId]
  );

  return computeStatusEntries(sched.rows, pays.rows);
}

export function getDebtTypes(): Promise<DebtType[]> {
  return query<DebtType>(
    `SELECT type_code, display_name, is_secured, sort_order
     FROM debt_types ORDER BY sort_order ASC`
  ).then((result) => result.rows);
}

export async function getDebtFreeDate(userId: number): Promise<string | null> {
  const result = await query<{ max_end: string | null }>(
    `SELECT MAX(end_date)::text AS max_end
     FROM debts WHERE user_id = $1 AND is_active = 1 AND end_date IS NOT NULL`,
    [userId]
  );
  return result.rows[0]?.max_end ?? null;
}

export async function getDashboard(userId: number): Promise<{
  total_outstanding: number;
  total_monthly_emi: number;
  total_interest_remaining: number;
  debt_free_date: string | null;
  dti: DtiResult;
  active_count: number;
  closed_count: number;
  debts: Debt[];
}> {
  const [debts, closed, debtFreeDate, dti] = await Promise.all([
    getDebts(userId, undefined, "active"),
    query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM debts WHERE user_id = $1 AND is_active = 0`,
      [userId]
    ),
    getDebtFreeDate(userId),
    getDti(userId),
  ]);
  const totalOutstanding = money(
    debts.reduce((sum, d) => sum + d.principal_outstanding, 0)
  );
  const totalEmi = money(
    debts.reduce((sum, d) => sum + (d.emi_amount ?? 0), 0)
  );
  const totalInterest = money(
    debts.reduce((sum, d) => sum + (d.remaining_interest ?? 0), 0)
  );
  return {
    total_outstanding: totalOutstanding,
    total_monthly_emi: totalEmi,
    total_interest_remaining: totalInterest,
    debt_free_date: debtFreeDate,
    dti,
    active_count: debts.length,
    closed_count: Number(closed.rows[0]?.count ?? 0),
    debts,
  };
}

/** FR-6.12/6.13: prepayment simulation (pure computation, no writes). */
export function simulatePrepayment(
  params: {
    outstanding: number;
    annualRate: number;
    emiAmount: number;
    monthsRemaining: number;
    currentEndDate: string | null;
    anchorDate: string;
    amount: number;
    strategy: "reduce_emi" | "reduce_tenure";
  }
): {
  strategy: "reduce_emi" | "reduce_tenure";
  prepayment_amount: number;
  new_emi: number;
  new_tenure_months: number;
  months_saved: number;
  interest_saved: number;
  original_interest: number;
  new_interest: number;
  current_debt_free_date: string | null;
  new_debt_free_date: string | null;
} {
  const n = params.monthsRemaining;
  const remaining = Math.max(0, money(params.outstanding - params.amount));
  const originalRows = amortize(params.outstanding, params.annualRate, n, params.anchorDate);
  const originalInterest = originalRows[originalRows.length - 1]?.cumulative_interest ?? 0;

  let newEmi: number;
  let newTenure: number;
  let newRows: AmortizationRow[];
  if (params.strategy === "reduce_emi") {
    newEmi = emiFor(remaining, params.annualRate, n);
    newTenure = n;
    newRows = amortize(remaining, params.annualRate, n, params.anchorDate);
  } else {
    newEmi = params.emiAmount;
    newTenure = deriveMonths(remaining, params.annualRate, params.emiAmount);
    newRows = amortize(remaining, params.annualRate, newTenure, params.anchorDate);
  }
  const newInterest = newRows[newRows.length - 1]?.cumulative_interest ?? 0;
  const newEnd =
    newTenure > 0 ? addMonths(params.anchorDate, newTenure) : params.anchorDate;

  return {
    strategy: params.strategy,
    prepayment_amount: params.amount,
    new_emi: newEmi,
    new_tenure_months: newTenure,
    months_saved: Math.max(0, n - newTenure),
    interest_saved: Math.max(0, money(originalInterest - newInterest)),
    original_interest: originalInterest,
    new_interest: newInterest,
    current_debt_free_date: params.currentEndDate,
    new_debt_free_date: newEnd,
  };
}

type SimDebt = {
  id: string;
  outstanding: number;
  annualRate: number;
  requiredMonthly: number;
};

function simulateRun(
  debts: SimDebt[],
  order: SimDebt[],
  extraMonthly: number
): { months: number; totalInterest: number; payoffOrder: string[] } {
  const state = debts.map((d) => ({ ...d, out: d.outstanding }));
  let months = 0;
  let totalInterest = 0;
  const payoffOrder: string[] = [];
  while (months < 600) {
    months++;
    let extra = extraMonthly;
    for (const d of order) {
      const s = state.find((x) => x.id === d.id);
      if (!s || s.out <= 0) continue;
      const interest = money(s.out * monthlyRate(d.annualRate));
      totalInterest = money(totalInterest + interest);
      s.out = money(s.out + interest);
      let pay = Math.min(d.requiredMonthly, s.out);
      if (extra > 0) {
        const fromExtra = Math.min(extra, s.out - pay);
        pay = money(pay + fromExtra);
        extra = money(extra - fromExtra);
      }
      s.out = money(s.out - pay);
      if (s.out <= 0) {
        s.out = 0;
        payoffOrder.push(d.id);
      }
    }
    if (state.every((s) => s.out <= 0)) break;
  }
  return { months, totalInterest, payoffOrder };
}

/** FR-6.15/6.16: avalanche vs snowball comparison (pure simulation). */
export function simulateStrategies(
  debts: SimDebt[],
  extraMonthly: number
): SimulationOutput {
  const baseline = simulateRun(debts, debts, 0);
  const avalancheOrder = [...debts].sort(
    (a, b) => b.annualRate - a.annualRate || a.outstanding - b.outstanding
  );
  const snowballOrder = [...debts].sort(
    (a, b) => a.outstanding - b.outstanding || b.annualRate - a.annualRate
  );
  const build = (
    strategy: "avalanche" | "snowball",
    order: SimDebt[],
    run: { months: number; totalInterest: number; payoffOrder: string[] }
  ): StrategyResult => ({
    strategy,
    months_to_debt_free: run.months,
    total_interest: run.totalInterest,
    interest_saved: Math.max(0, money(baseline.totalInterest - run.totalInterest)),
    debt_free_date: run.months >= 600 ? null : addMonths(isoDate(new Date()), run.months),
    payoff_order: run.payoffOrder,
  });
  return {
    baseline: {
      months_to_debt_free: baseline.months,
      total_interest: baseline.totalInterest,
    },
    avalanche: build("avalanche", avalancheOrder, simulateRun(debts, avalancheOrder, extraMonthly)),
    snowball: build("snowball", snowballOrder, simulateRun(debts, snowballOrder, extraMonthly)),
  };
}

export async function getHealthAlerts(userId: number): Promise<{
  alerts: HealthAlert[];
  summary: { critical: number; warning: number; info: number };
}> {
  const alerts: HealthAlert[] = [];
  const dti = await getDti(userId);
  if (dti.dti !== null && dti.dti > 40) {
    alerts.push({
      type: "high_dti",
      severity: dti.dti > 50 ? "critical" : "warning",
      details: { dti: dti.dti, level: dti.level, color: dti.color },
    });
  }

  const debts = await getDebts(userId, undefined, "active");
  const emiDebts = debts.filter((d) => d.emi_amount !== null);
  if (emiDebts.length === 0) {
    const summary = { critical: 0, warning: 0, info: 0 };
    for (const alert of alerts) summary[alert.severity] += 1;
    return { alerts, summary };
  }

  const [schedResult, paysResult] = await Promise.all([
    query<{ debt_id: string } & StatusSchedRow>(
      `SELECT debt_id, period, emi_amount::text, scheduled_date::text
       FROM amortization_schedule
       WHERE user_id = $1
       ORDER BY debt_id ASC, period ASC`,
      [userId]
    ),
    query<{ debt_id: string } & StatusPayRow>(
      `SELECT debt_id, amount::text, date::text
       FROM debt_payments
       WHERE user_id = $1 AND type = 'emi'
       ORDER BY debt_id ASC, date ASC`,
      [userId]
    ),
  ]);

  const schedByDebt = new Map<string, StatusSchedRow[]>();
  for (const row of schedResult.rows) {
    const list = schedByDebt.get(row.debt_id) ?? [];
    list.push(row);
    schedByDebt.set(row.debt_id, list);
  }
  const paysByDebt = new Map<string, StatusPayRow[]>();
  for (const row of paysResult.rows) {
    const list = paysByDebt.get(row.debt_id) ?? [];
    list.push(row);
    paysByDebt.set(row.debt_id, list);
  }

  const missedDetails: {
    debt_id: string;
    name: string;
    missed_months: string[];
    partial_months: string[];
  }[] = [];
  for (const debt of emiDebts) {
    const status = computeStatusEntries(
      schedByDebt.get(debt.id) ?? [],
      paysByDebt.get(debt.id) ?? []
    );
    const missed = status.filter((s) => s.status === "missed").map((s) => s.month);
    const partial = status
      .filter((s) => s.status === "partial")
      .map((s) => s.month);
    if (missed.length > 0 || partial.length > 0) {
      missedDetails.push({
        debt_id: debt.id,
        name: debt.name,
        missed_months: missed,
        partial_months: partial,
      });
    }
  }
  if (missedDetails.length > 0) {
    const maxMissed = Math.max(
      ...missedDetails.map((d) => d.missed_months.length)
    );
    alerts.push({
      type: "missed_payments",
      severity: maxMissed >= 3 ? "critical" : "warning",
      details: { debts: missedDetails },
    });
  }

  const recent: { debt_id: string; name: string; days_since: number | null }[] = [];
  const today = new Date();
  for (const debt of emiDebts) {
    if (debt.months_remaining === 0) continue;
    const pays = paysByDebt.get(debt.id) ?? [];
    const lastDate = pays.length > 0 ? pays[pays.length - 1].date : null;
    if (lastDate === null) continue;
    const daysSince = Math.floor(
      (today.getTime() - new Date(`${lastDate}T00:00:00`).getTime()) / 86400000
    );
    if (daysSince > 45) {
      recent.push({ debt_id: debt.id, name: debt.name, days_since: daysSince });
    }
  }
  if (recent.length > 0) {
    alerts.push({
      type: "no_recent_payment",
      severity: "info",
      details: { debts: recent },
    });
  }

  const summary = { critical: 0, warning: 0, info: 0 };
  for (const alert of alerts) {
    summary[alert.severity] += 1;
  }
  return { alerts, summary };
}
export async function debtRowExists(
  q: Queryable,
  userId: number,
  debtId: string
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `SELECT id FROM debts WHERE user_id = $1 AND id = $2`,
    [userId, debtId]
  );
  return result.rowCount === 1;
}

export type DebtReplayTermsRow = {
  interest_rate: string;
  emi_amount: string | null;
  start_date: string;
};

export async function getDebtReplayTerms(
  q: Queryable,
  userId: number,
  debtId: string
): Promise<DebtReplayTermsRow | null> {
  const result = await q.query<DebtReplayTermsRow>(
    `SELECT interest_rate::text, emi_amount::text, start_date::text
     FROM debts WHERE user_id = $1 AND id = $2`,
    [userId, debtId]
  );
  return result.rows[0] ?? null;
}

export type DebtTermsRow = {
  principal_outstanding: string;
  interest_rate: string;
  emi_amount: string | null;
  start_date: string;
};

export async function getDebtTerms(
  q: Queryable,
  userId: number,
  debtId: string
): Promise<DebtTermsRow | null> {
  const result = await q.query<DebtTermsRow>(
    `SELECT principal_outstanding::text, interest_rate::text,
            emi_amount::text, start_date::text
     FROM debts WHERE user_id = $1 AND id = $2`,
    [userId, debtId]
  );
  return result.rows[0] ?? null;
}

export type DebtForPaymentLogRow = DebtTermsRow & {
  id: string;
  name: string;
  account_id: string | null;
};

export async function getDebtForPaymentLog(
  q: Queryable,
  userId: number,
  debtId: string
): Promise<DebtForPaymentLogRow | null> {
  const result = await q.query<DebtForPaymentLogRow>(
    `SELECT id, name, principal_outstanding::text, interest_rate::text,
            emi_amount::text, account_id, start_date::text
     FROM debts WHERE user_id = $1 AND id = $2`,
    [userId, debtId]
  );
  return result.rows[0] ?? null;
}

/** Settles a fully-paid debt: zeroes the balance and closes it. */
export function settleDebtFully(
  q: Queryable,
  params: {
    userId: number;
    debtId: string;
    interestPart: number;
    date: string;
  }
) {
  return q.query(
    `UPDATE debts
     SET principal_outstanding = 0, total_interest_paid = total_interest_paid + $3,
         months_remaining = 0, end_date = $4::date, is_active = 0,
         closed_date = $4::date
     WHERE user_id = $1 AND id = $2`,
    [params.userId, params.debtId, params.interestPart, params.date]
  );
}

/** Applies a partial payment to the running debt state. */
export function applyDebtPaymentState(
  q: Queryable,
  params: {
    userId: number;
    debtId: string;
    outstanding: number;
    interestPart: number;
    months: number | null;
    endDate: string | null;
  }
) {
  return q.query(
    `UPDATE debts
     SET principal_outstanding = $3, total_interest_paid = total_interest_paid + $4,
         months_remaining = $5, end_date = $6::date
     WHERE user_id = $1 AND id = $2`,
    [
      params.userId,
      params.debtId,
      params.outstanding,
      params.interestPart,
      params.months,
      params.endDate,
    ]
  );
}

/** Restores principal after a payment deletion. */
export function restoreDebtOutstanding(
  q: Queryable,
  userId: number,
  debtId: string,
  principalPart: number
) {
  return q.query(
    `UPDATE debts
     SET principal_outstanding = principal_outstanding + $3
     WHERE user_id = $1 AND id = $2`,
    [userId, debtId, principalPart]
  );
}

export async function getLastDebtPaymentDate(
  q: Queryable,
  userId: number,
  debtId: string
): Promise<string | null> {
  const result = await q.query<{ last: string | null }>(
    `SELECT MAX(date)::text AS last FROM debt_payments
     WHERE user_id = $1 AND debt_id = $2`,
    [userId, debtId]
  );
  return result.rows[0]?.last ?? null;
}

/** Final state write after a full chain replay (debt settled). */
export function settleDebtAfterReplay(
  q: Queryable,
  params: {
    userId: number;
    debtId: string;
    totalInterestPaid: number;
    anchorDate: string;
  }
) {
  return q.query(
    `UPDATE debts
     SET principal_outstanding = 0, total_interest_paid = $3,
         months_remaining = 0, end_date = $4::date
     WHERE user_id = $1 AND id = $2`,
    [
      params.userId,
      params.debtId,
      params.totalInterestPaid,
      params.anchorDate,
    ]
  );
}

/** State write after a chain replay with balance remaining. */
export function updateDebtAfterReplay(
  q: Queryable,
  params: {
    userId: number;
    debtId: string;
    outstanding: number;
    totalInterestPaid: number;
    months: number | null;
    endDate: string | null;
  }
) {
  return q.query(
    `UPDATE debts
     SET principal_outstanding = $3, total_interest_paid = $4,
         months_remaining = $5, end_date = $6::date
     WHERE user_id = $1 AND id = $2`,
    [
      params.userId,
      params.debtId,
      params.outstanding,
      params.totalInterestPaid,
      params.months,
      params.endDate,
    ]
  );
}

export function insertDebtExpenseTransaction(
  q: Queryable,
  params: {
    userId: number;
    accountId: string;
    amount: number;
    description: string;
    date: string;
  }
): Promise<string> {
  return q
    .query<{ id: string }>(
      `INSERT INTO transactions
         (user_id, account_id, type, amount, description, date, source,
          created_by, updated_by)
       VALUES ($1, $2, 'expense', $3, $4, $5::date, 'manual', $1, $1)
       RETURNING id`,
      [params.userId, params.accountId, params.amount, params.description, params.date]
    )
    .then((r) => r.rows[0].id);
}
