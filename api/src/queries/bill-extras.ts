import { query } from "../db";
import type { Queryable } from "./notes";

const DB: Queryable = { query: query };

// ---------------------------------------------------------------------------
// Bill reminders CRUD
// ---------------------------------------------------------------------------

export type BillReminderRow = {
  id: string;
  bill_id: string;
  days_before: number;
  channel: string;
  is_enabled: number;
};

export async function listBillReminders(
  userId: number, billId: string, q: Queryable = DB
): Promise<BillReminderRow[]> {
  const result = await q.query<BillReminderRow>(
    `SELECT id, bill_id, days_before, channel, is_enabled
     FROM bill_reminders WHERE user_id = $1 AND bill_id = $2::uuid
     ORDER BY days_before`,
    [userId, billId]
  );
  return result.rows;
}

export function insertBillReminder(
  q: Queryable,
  params: { userId: number; billId: string; daysBefore: number; channel: string; isEnabled: number }
) {
  return q.query<{ id: string }>(
    `INSERT INTO bill_reminders (user_id, bill_id, days_before, channel, is_enabled)
     VALUES ($1, $2::uuid, $3, $4, $5) RETURNING id`,
    [params.userId, params.billId, params.daysBefore, params.channel, params.isEnabled]
  );
}

export function updateBillReminder(
  q: Queryable,
  params: { userId: number; reminderId: string; daysBefore: number; isEnabled: number }
) {
  return q.query<{ id: string }>(
    `UPDATE bill_reminders SET days_before = $3, is_enabled = $4
     WHERE user_id = $1 AND id = $2::uuid RETURNING id`,
    [params.userId, params.reminderId, params.daysBefore, params.isEnabled]
  );
}

export function deleteBillReminder(
  q: Queryable, userId: number, reminderId: string
) {
  return q.query<{ id: string }>(
    `DELETE FROM bill_reminders WHERE user_id = $1 AND id = $2::uuid RETURNING id`,
    [userId, reminderId]
  );
}

/** Suggests recurring debits as potential bills (FR-4.x). */
export async function getSuggestedBills(
  userId: number,
  q: Queryable = DB
): Promise<{
  description: string; avg_amount: number; occurrence_count: number;
}[]> {
  const result = await q.query<{
    description: string; avg_amount: string; occurrence_count: string;
  }>(
    `SELECT COALESCE(merchant_clean, description) AS description,
            ROUND(AVG(amount))::text AS avg_amount,
            COUNT(*)::text AS occurrence_count
     FROM transactions
     WHERE user_id = $1 AND type = 'expense'
       AND date >= CURRENT_DATE - INTERVAL '90 days'
       AND NOT EXISTS (
         SELECT 1 FROM bills b WHERE b.user_id = transactions.user_id
           AND b.name ILIKE '%' || COALESCE(merchant_clean, description) || '%'
           AND b.is_active = 1
       )
     GROUP BY COALESCE(merchant_clean, description)
     HAVING COUNT(*) >= 3
     ORDER BY AVG(amount) DESC LIMIT 10`,
    [userId]
  );
  return result.rows.map((r) => ({
    description: r.description,
    avg_amount: Number(r.avg_amount),
    occurrence_count: Number(r.occurrence_count),
  }));
}

/** Subscription snooze: pushes next_renewal_date forward without changing status. */
export async function snoozeSubscription(
  q: Queryable,
  params: { userId: number; subscriptionId: string; days: number }
): Promise<string | null> {
  const result = await q.query<{ next_date: string }>(
    `UPDATE subscriptions SET
       next_renewal_date = next_renewal_date + ($3::int * INTERVAL '1 day'),
       version = version + 1
     WHERE user_id = $1 AND id = $2::uuid AND status = 'active'
     RETURNING (next_renewal_date)::date::text AS next_date`,
    [params.userId, params.subscriptionId, params.days]
  );
  return result.rows[0]?.next_date ?? null;
}
