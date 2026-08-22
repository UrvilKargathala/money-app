import { query } from "../db";
import { isoDate } from "../utils/format";
import type { PaymentHistoryRow } from "./bills";
export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export const SUBSCRIPTION_FREQUENCIES = ["monthly", "quarterly", "annual"] as const;

export type SubscriptionRow = {
  id: string;
  service_name: string;
  amount: string;
  frequency: string;
  next_renewal_date: Date;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  status: string;
  notes: string | null;
  version: number;
  last_paid_date: Date | null;
  last_paid_amount: string | null;
};

export type Subscription = {
  id: string;
  service_name: string;
  amount: number;
  frequency: string;
  monthly_equivalent: number;
  next_renewal_date: string;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  status: string;
  notes: string | null;
  version: number;
  days_until_renewal: number;
  last_paid_date: string | null;
  last_paid_amount: number | null;
};

const SUB_SELECT = `
  SELECT s.id, s.service_name, s.amount, s.frequency, s.next_renewal_date,
         s.account_id, a.name AS account_name,
         s.category_id, cat.name AS category_name,
         s.status, s.notes, s.version,
         ph.created_at AS last_paid_date, ph.amount AS last_paid_amount
  FROM subscriptions s
  LEFT JOIN accounts a ON a.id = s.account_id
  LEFT JOIN categories cat ON cat.id = s.category_id
  LEFT JOIN LATERAL (
    SELECT created_at, amount FROM payment_history
    WHERE user_id = s.user_id AND payable_type = 'subscription' AND payable_id = s.id
    ORDER BY created_at DESC LIMIT 1
  ) ph ON true
`;

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function daysUntil(date: Date): number {
  return Math.round((date.getTime() - startOfToday().getTime()) / 86400000);
}

export function monthlyEquivalent(amount: number, frequency: string): number {
  const multiplier: Record<string, number> = {
    monthly: 1,
    quarterly: 1 / 3,
    annual: 1 / 12,
  };
  return amount * (multiplier[frequency] ?? 1);
}

export function toSubscription(row: SubscriptionRow): Subscription {
  const amount = Number(row.amount);
  return {
    ...row,
    amount,
    monthly_equivalent: monthlyEquivalent(amount, row.frequency),
    next_renewal_date: isoDate(row.next_renewal_date),
    days_until_renewal: daysUntil(row.next_renewal_date),
    last_paid_date:
      row.last_paid_date === null ? null : row.last_paid_date.toISOString().slice(0, 10),
    last_paid_amount:
      row.last_paid_amount === null ? null : Number(row.last_paid_amount),
  };
}

export async function listSubscriptions(
  userId: number,
  q: Queryable = DB
): Promise<Subscription[]> {
  const result = await q.query<SubscriptionRow>(
    `${SUB_SELECT} WHERE s.user_id = $1
     ORDER BY s.status, s.next_renewal_date`,
    [userId]
  );
  return result.rows.map(toSubscription);
}

export async function getSubscription(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<Subscription | null> {
  const result = await q.query<SubscriptionRow>(
    `${SUB_SELECT} WHERE s.user_id = $1 AND s.id = $2`,
    [userId, id]
  );
  return result.rows.length === 1 ? toSubscription(result.rows[0]) : null;
}

export async function subscriptionExists(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `SELECT id FROM subscriptions WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  return result.rowCount === 1;
}

export async function getSubscriptionStatus(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<{ id: string; status: string } | null> {
  const result = await q.query<{ id: string; status: string }>(
    `SELECT id, status FROM subscriptions WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  return result.rows[0] ?? null;
}

export async function insertSubscription(
  q: Queryable,
  params: {
    userId: number;
    serviceName: string;
    amount: number;
    frequency: string;
    nextRenewalDate: string;
    accountId: string | null;
    categoryId: string | null;
    notes: string | null;
  }
): Promise<void> {
  await q.query(
    `INSERT INTO subscriptions
       (user_id, service_name, amount, frequency, next_renewal_date,
        account_id, category_id, notes)
     VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8)`,
    [
      params.userId, params.serviceName, params.amount, params.frequency,
      params.nextRenewalDate, params.accountId, params.categoryId, params.notes,
    ]
  );
}

export async function updateSubscription(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    serviceName: string | null;
    amount: number | null;
    frequency: string | null;
    nextRenewalDate: string | null;
    accountId: string | null;
    categoryId: string | null;
    notes: string | null;
    version: number;
  }
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `UPDATE subscriptions SET
       service_name = COALESCE($3, service_name),
       amount = COALESCE($4, amount),
       frequency = COALESCE($5, frequency),
       next_renewal_date = COALESCE($6::date, next_renewal_date),
       account_id = COALESCE($7, account_id),
       category_id = COALESCE($8, category_id),
       notes = COALESCE($9, notes),
       version = version + 1
     WHERE user_id = $1 AND id = $2 AND version = $10
     RETURNING id`,
    [
      params.userId, params.id,
      params.serviceName, params.amount, params.frequency,
      params.nextRenewalDate, params.accountId, params.categoryId,
      params.notes, params.version,
    ]
  );
  return result.rowCount === 1;
}

export function cancelSubscription(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `UPDATE subscriptions SET status = 'cancelled', version = version + 1
     WHERE user_id = $1 AND id = $2 AND status <> 'cancelled'
     RETURNING id`,
    [userId, id]
  );
}

export function pauseSubscription(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `UPDATE subscriptions SET status = 'paused', version = version + 1
     WHERE user_id = $1 AND id = $2 AND status = 'active'
     RETURNING id`,
    [userId, id]
  );
}

export function resumeSubscription(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `UPDATE subscriptions SET status = 'active', version = version + 1
     WHERE user_id = $1 AND id = $2 AND status = 'paused'
     RETURNING id`,
    [userId, id]
  );
}

export type SubscriptionForRenewal = {
  id: string;
  service_name: string;
  amount: string;
  frequency: string;
  next_renewal_date: Date;
  account_id: string | null;
  category_id: string | null;
  status: string;
};

export async function getSubscriptionForRenewal(
  q: Queryable,
  userId: number,
  id: string
): Promise<SubscriptionForRenewal | null> {
  const result = await q.query<SubscriptionForRenewal>(
    `SELECT id, service_name, amount, frequency, next_renewal_date,
            account_id, category_id, status
     FROM subscriptions WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  return result.rows[0] ?? null;
}

export async function insertSubscriptionRenewalTransaction(
  q: Queryable,
  params: {
    userId: number;
    accountId: string;
    amount: number;
    description: string;
    categoryId: string | null;
  }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO transactions
       (user_id, account_id, type, amount, description, category_id, date, notes,
        source, created_by, updated_by)
     VALUES ($1, $2, 'expense', $3, $4, $5, CURRENT_DATE, NULL, 'subscription', $1, $1)
     RETURNING id`,
    [params.userId, params.accountId, params.amount, params.description, params.categoryId]
  );
  return result.rows[0].id;
}

export async function insertPaymentHistory(
  q: Queryable,
  params: {
    userId: number;
    payableType: "bill" | "subscription";
    payableId: string;
    transactionId: string | null;
    amount: number;
    periodLabel: string;
    periodMonth: number;
    periodYear: number;
    notes: string | null;
  }
): Promise<void> {
  await q.query(
    `INSERT INTO payment_history
       (user_id, payable_type, payable_id, transaction_id, amount,
        period_label, period_month, period_year, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      params.userId, params.payableType, params.payableId, params.transactionId,
      params.amount, params.periodLabel, params.periodMonth, params.periodYear,
      params.notes,
    ]
  );
}

export async function advanceSubscriptionRenewal(
  q: Queryable,
  userId: number,
  id: string,
  nextDate: string
): Promise<void> {
  await q.query(
    `UPDATE subscriptions
     SET next_renewal_date = $3::date, version = version + 1
     WHERE user_id = $1 AND id = $2`,
    [userId, id, nextDate]
  );
}

export async function listDueRenewals(userId: number, q: Queryable = DB) {
  const result = await q.query<{
    id: string;
    service_name: string;
    amount: string;
    next_renewal_date: Date;
    status: string;
  }>(
    `SELECT id, service_name, amount, next_renewal_date, status
     FROM subscriptions
     WHERE user_id = $1 AND status = 'active'
       AND next_renewal_date <= CURRENT_DATE + INTERVAL '7 days'
     ORDER BY next_renewal_date`,
    [userId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    service_name: row.service_name,
    amount: Number(row.amount),
    next_renewal_date: isoDate(row.next_renewal_date),
    days_until_renewal: daysUntil(row.next_renewal_date),
  }));
}

export async function getMonthlyBurn(userId: number, q: Queryable = DB): Promise<number> {
  const result = await q.query<{ monthly_burn: string }>(
    `SELECT COALESCE(SUM(
       CASE frequency
         WHEN 'monthly' THEN amount
         WHEN 'quarterly' THEN amount / 3
         WHEN 'annual' THEN amount / 12
       END
     ), 0)::numeric(12,2) AS monthly_burn
     FROM subscriptions
     WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
  return Number(result.rows[0].monthly_burn);
}

export async function listSubscriptionPayments(
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
     WHERE user_id = $1 AND payable_type = 'subscription' AND payable_id = $2
     ORDER BY period_year DESC, period_month DESC, created_at DESC`,
    [userId, id]
  );
  return result.rows.map((row) => ({
    ...row,
    payable_type: row.payable_type as PaymentHistoryRow["payable_type"],
    amount: Number(row.amount),
    created_at: row.created_at.toISOString(),
  }));
}

export async function listSubscriptionPaymentsForExport(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<{ period_label: string; date: string; amount: number }[]> {
  const result = await q.query<{
    amount: string;
    period_label: string;
    created_at: Date;
  }>(
    `SELECT amount, period_label, created_at
     FROM payment_history
     WHERE user_id = $1 AND payable_type = 'subscription' AND payable_id = $2
     ORDER BY period_year, period_month`,
    [userId, id]
  );
  return result.rows.map((row) => ({
    period_label: row.period_label,
    date: row.created_at.toISOString().slice(0, 10),
    amount: Number(row.amount),
  }));
}
