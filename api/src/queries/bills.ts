import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export const BILL_FREQUENCIES = [
  "monthly",
  "quarterly",
  "half_yearly",
  "annual",
  "one_time",
] as const;

export type BillRow = {
  id: string;
  name: string;
  amount: string | null;
  estimated_amount: string | null;
  due_day: number;
  frequency: string;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  reminder_days: number;
  is_autopay: number;
  notes: string | null;
  current_period_status: string;
  is_active: number;
  version: number;
  last_paid_date: Date | null;
  last_paid_amount: string | null;
};

export type Bill = {
  id: string;
  name: string;
  amount: number | null;
  estimated_amount: number | null;
  due_day: number;
  frequency: string;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  reminder_days: number;
  is_autopay: number;
  notes: string | null;
  current_period_status: string;
  is_active: number;
  version: number;
  last_paid_date: string | null;
  last_paid_amount: number | null;
};

export type PaymentHistoryRow = {
  id: string;
  payable_type: "bill" | "subscription";
  payable_id: string;
  transaction_id: string | null;
  amount: number;
  period_label: string;
  period_month: number;
  period_year: number;
  notes: string | null;
  created_at: string;
};

export type DueItem = {
  type: "bill" | "subscription";
  id: string;
  label: string;
  amount: number;
  due_date: string;
  status: string;
};

export type BillOverview = {
  total_monthly_obligation: number;
  due_this_week: number;
  overdue_count: number;
  upcoming: DueItem[];
};

export function toBill(row: BillRow): Bill {
  return {
    ...row,
    amount: row.amount === null ? null : Number(row.amount),
    estimated_amount:
      row.estimated_amount === null ? null : Number(row.estimated_amount),
    last_paid_date:
      row.last_paid_date === null ? null : row.last_paid_date.toISOString().slice(0, 10),
    last_paid_amount:
      row.last_paid_amount === null ? null : Number(row.last_paid_amount),
  };
}

export function toPaymentRow(row: {
  id: string;
  payable_type: string;
  payable_id: string;
  transaction_id: string | null;
  amount: string;
  period_label: string;
  period_month: number;
  period_year: number;
  notes: string | null;
  created_at: Date;
}): PaymentHistoryRow {
  return {
    ...row,
    payable_type: row.payable_type as PaymentHistoryRow["payable_type"],
    amount: Number(row.amount),
    created_at: row.created_at.toISOString(),
  };
}

const BILL_SELECT = `
  SELECT b.id, b.name, b.amount, b.estimated_amount, b.due_day, b.frequency,
         b.account_id, a.name AS account_name,
         b.category_id, cat.name AS category_name,
         b.reminder_days, b.is_autopay, b.notes,
         b.current_period_status, b.is_active, b.version,
         ph.created_at AS last_paid_date, ph.amount AS last_paid_amount
  FROM bills b
  LEFT JOIN accounts a ON a.id = b.account_id
  LEFT JOIN categories cat ON cat.id = b.category_id
  LEFT JOIN LATERAL (
    SELECT created_at, amount FROM payment_history
    WHERE user_id = b.user_id AND payable_type = 'bill' AND payable_id = b.id
    ORDER BY created_at DESC LIMIT 1
  ) ph ON true
`;

export async function listBills(userId: number, q: Queryable = DB): Promise<Bill[]> {
  const result = await q.query<BillRow>(
    `${BILL_SELECT}
     WHERE b.user_id = $1
     ORDER BY b.due_day, b.name`,
    [userId]
  );
  return result.rows.map(toBill);
}

export async function getBill(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<Bill | null> {
  const result = await q.query<BillRow>(
    `${BILL_SELECT} WHERE b.user_id = $1 AND b.id = $2`,
    [userId, id]
  );
  return result.rowCount === 1 ? toBill(result.rows[0]) : null;
}

export async function billExists(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `SELECT id FROM bills WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  return result.rowCount === 1;
}

export async function getBillActivation(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<{ id: string; is_active: number } | null> {
  const result = await q.query<{ id: string; is_active: number }>(
    `SELECT id, is_active FROM bills WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  return result.rows[0] ?? null;
}

/** Active bills needed for calendar/upcoming scheduling math (done in the route). */
export type BillScheduleRow = {
  id: string;
  name: string;
  amount: string | null;
  estimated_amount: string | null;
  due_day: number;
  frequency: string;
  current_period_status: string;
};

export async function listActiveBillsForScheduling(
  userId: number,
  q: Queryable = DB,
  ordered = true
): Promise<BillScheduleRow[]> {
  const result = await q.query<BillScheduleRow>(
    `SELECT id, name, amount, estimated_amount, due_day, frequency, current_period_status
     FROM bills WHERE user_id = $1 AND is_active = 1
     ${ordered ? "ORDER BY due_day, name" : ""}`,
    [userId]
  );
  return result.rows;
}

/** Active bills with frequency for the overview obligation math. */
export type BillObligationRow = BillScheduleRow & { frequency: string };

export async function listActiveBillObligations(
  userId: number,
  q: Queryable = DB
): Promise<BillObligationRow[]> {
  const result = await q.query<BillObligationRow>(
    `SELECT id, name, amount, estimated_amount, due_day, frequency, current_period_status
     FROM bills WHERE user_id = $1 AND is_active = 1`,
    [userId]
  );
  return result.rows;
}

/** Active subscriptions with renewal info for the combined overview. */
export type SubscriptionObligationRow = {
  id: string;
  service_name: string;
  amount: string;
  frequency: string;
  next_renewal_date: Date;
  status: string;
};

export async function listActiveSubscriptionRenewals(
  userId: number,
  q: Queryable = DB
): Promise<SubscriptionObligationRow[]> {
  const result = await q.query<SubscriptionObligationRow>(
    `SELECT id, service_name, amount, frequency, next_renewal_date, status
     FROM subscriptions WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
  return result.rows;
}

export async function insertBill(
  q: Queryable,
  params: {
    userId: number;
    name: string;
    amount: number | null;
    estimatedAmount: number | null;
    dueDay: number;
    frequency: string;
    accountId: string | null;
    categoryId: string | null;
    reminderDays: number;
    isAutopay: number;
    notes: string | null;
  }
): Promise<void> {
  await q.query(
    `INSERT INTO bills
       (user_id, name, amount, estimated_amount, due_day, frequency,
        account_id, category_id, reminder_days, is_autopay, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      params.userId, params.name, params.amount, params.estimatedAmount,
      params.dueDay, params.frequency, params.accountId, params.categoryId,
      params.reminderDays, params.isAutopay, params.notes,
    ]
  );
}

export async function updateBill(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    name: string | null;
    amount: number | null;
    estimatedAmount: number | null;
    dueDay: number | null;
    frequency: string | null;
    accountId: string | null;
    categoryId: string | null;
    reminderDays: number | null;
    isAutopay: number | null;
    notes: string | null;
    version: number;
  }
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `UPDATE bills SET
       name = COALESCE($3, name),
       amount = COALESCE($4, amount),
       estimated_amount = COALESCE($5, estimated_amount),
       due_day = COALESCE($6, due_day),
       frequency = COALESCE($7, frequency),
       account_id = COALESCE($8, account_id),
       category_id = COALESCE($9, category_id),
       reminder_days = COALESCE($10, reminder_days),
       is_autopay = COALESCE($11, is_autopay),
       notes = COALESCE($12, notes),
       version = version + 1
     WHERE user_id = $1 AND id = $2 AND version = $13
     RETURNING id`,
    [
      params.userId, params.id,
      params.name, params.amount, params.estimatedAmount,
      params.dueDay, params.frequency, params.accountId,
      params.categoryId, params.reminderDays, params.isAutopay,
      params.notes, params.version,
    ]
  );
  return result.rowCount === 1;
}

export function deactivateBill(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `UPDATE bills SET is_active = 0, version = version + 1
     WHERE user_id = $1 AND id = $2 AND is_active = 1
     RETURNING id`,
    [userId, id]
  );
}

export function reactivateBill(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `UPDATE bills SET is_active = 1, version = version + 1
     WHERE user_id = $1 AND id = $2 AND is_active = 0
     RETURNING id`,
    [userId, id]
  );
}

export function setBillAutopay(
  q: Queryable,
  userId: number,
  id: string,
  isAutopay: number
) {
  return q.query<{ id: string }>(
    `UPDATE bills SET is_autopay = $3, version = version + 1
     WHERE user_id = $1 AND id = $2 AND is_active = 1
     RETURNING id`,
    [userId, id, isAutopay]
  );
}

export type BillForPayment = {
  id: string;
  name: string;
  amount: string | null;
  category_id: string | null;
  account_id: string | null;
  frequency: string;
  current_period_status: string;
  is_active: number;
};

export async function getBillForPayment(
  q: Queryable,
  userId: number,
  id: string
): Promise<BillForPayment | null> {
  const result = await q.query<BillForPayment>(
    `SELECT id, name, amount, category_id, account_id, frequency, current_period_status, is_active
     FROM bills WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  return result.rows[0] ?? null;
}

export async function insertBillPaymentTransaction(
  q: Queryable,
  params: {
    userId: number;
    accountId: string;
    amount: number;
    description: string;
    categoryId: string | null;
    notes: string | null;
  }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO transactions
       (user_id, account_id, type, amount, description, category_id, date, notes,
        source, created_by, updated_by)
     VALUES ($1, $2, 'expense', $3, $4, $5, CURRENT_DATE, $6, 'bill', $1, $1)
     RETURNING id`,
    [params.userId, params.accountId, params.amount, params.description, params.categoryId, params.notes]
  );
  return result.rows[0].id;
}

export function markBillPeriodPaid(q: Queryable, userId: number, id: string) {
  return q.query(
    `UPDATE bills
     SET current_period_status = 'paid',
         is_active = CASE WHEN frequency = 'one_time' THEN 0 ELSE is_active END,
         version = version + 1
     WHERE user_id = $2 AND id = $1`,
    [id, userId]
  );
}

export type BillForSkip = {
  id: string;
  is_active: number;
  current_period_status: string;
};

export async function getBillForSkip(
  q: Queryable,
  userId: number,
  id: string
): Promise<BillForSkip | null> {
  const result = await q.query<BillForSkip>(
    `SELECT id, is_active, current_period_status FROM bills
     WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  return result.rows[0] ?? null;
}

export function skipBillPeriod(q: Queryable, userId: number, id: string) {
  return q.query(
    `UPDATE bills SET current_period_status = 'skipped', version = version + 1
     WHERE user_id = $2 AND id = $1`,
    [id, userId]
  );
}

export async function listBillPayments(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<PaymentHistoryRow[]> {
  const result = await q.query<{
    id: string;
    payable_type: string;
    payable_id: string;
    transaction_id: string | null;
    amount: string;
    period_label: string;
    period_month: number;
    period_year: number;
    notes: string | null;
    created_at: Date;
  }>(
    `SELECT id, payable_type, payable_id, transaction_id, amount, period_label,
            period_month, period_year, notes, created_at
     FROM payment_history
     WHERE user_id = $1 AND payable_type = 'bill' AND payable_id = $2
     ORDER BY period_year DESC, period_month DESC, created_at DESC`,
    [userId, id]
  );
  return result.rows.map(toPaymentRow);
}

export async function getBillPaymentsYoY(
  userId: number,
  id: string,
  month: number,
  year: number,
  q: Queryable = DB
): Promise<Record<number, number>> {
  const result = await q.query<{ period_year: number; total: string }>(
    `SELECT period_year, COALESCE(SUM(amount), 0)::numeric(12,2) AS total
     FROM payment_history
     WHERE user_id = $1 AND payable_type = 'bill' AND payable_id = $2
       AND period_month = $3 AND period_year IN ($4, $5)
     GROUP BY period_year`,
    [userId, id, month, year, year - 1]
  );
  const totals: Record<number, number> = {};
  for (const row of result.rows) {
    totals[row.period_year] = Number(row.total);
  }
  return totals;
}

export async function listBillPaymentsForExport(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<{ period_label: string; date: string; amount: number; notes: string | null }[]> {
  const result = await q.query<{
    amount: string;
    period_label: string;
    notes: string | null;
    created_at: Date;
  }>(
    `SELECT amount, period_label, notes, created_at
     FROM payment_history
     WHERE user_id = $1 AND payable_type = 'bill' AND payable_id = $2
     ORDER BY period_year, period_month`,
    [userId, id]
  );
  return result.rows.map((row) => ({
    period_label: row.period_label,
    date: row.created_at.toISOString().slice(0, 10),
    amount: Number(row.amount),
    notes: row.notes,
  }));
}
