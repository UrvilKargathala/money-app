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

export async function insertBillReminder(
  q: Queryable,
  params: { userId: number; billId: string; daysBefore: number; channel: string; isEnabled: number }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO bill_reminders (user_id, bill_id, days_before, channel, is_enabled)
     VALUES ($1, $2::uuid, $3, $4, $5) RETURNING id`,
    [params.userId, params.billId, params.daysBefore, params.channel, params.isEnabled]
  );
  return result.rows[0].id;
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

export type SnoozeSource = "preset" | "custom";

export type SnoozeResult = {
  next_date: string;
  snooze: {
    id: string;
    days: number;
    source: SnoozeSource;
    previous_renewal_date: string;
    new_renewal_date: string;
  };
};

/** Row shape for idempotent replay (same attempt resubmitted). */
type PriorSnooze = {
  id: string;
  days: number;
  source: string;
  previous_renewal_date: string;
  new_renewal_date: string;
};

function toSnoozeResult(row: PriorSnooze): SnoozeResult {
  return {
    next_date: row.new_renewal_date,
    snooze: {
      id: row.id,
      days: row.days,
      source: row.source as SnoozeSource,
      previous_renewal_date: row.previous_renewal_date,
      new_renewal_date: row.new_renewal_date,
    },
  };
}

function asAttemptId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 64
    ? value
    : null;
}

/** Subscription snooze: pushes next_renewal_date forward without changing
 * status, and records the event (days + preset/custom source) in
 * subscription_snoozes. Both statements run in the caller's transaction, so
 * the date moves if and only if the history row is recorded.
 *
 * Idempotency: a caller-supplied `attemptId` (stable per dialog open) makes
 * lost-response retries and double submits resolve to the already-recorded
 * outcome instead of shifting the date twice. Matching requires the same
 * days — changed days are a new intent and proceed. A partial unique index
 * backs the check for any residual race (conflict replays the winner). */
export async function snoozeSubscription(
  q: Queryable,
  params: { userId: number; subscriptionId: string; days: number; source: SnoozeSource; attemptId?: string | null }
): Promise<SnoozeResult | null> {
  const attemptId = asAttemptId(params.attemptId);
  const priorSelect = `SELECT id::text AS id, days, source,
              previous_renewal_date::text AS previous_renewal_date,
              new_renewal_date::text AS new_renewal_date
       FROM subscription_snoozes
       WHERE user_id = $1 AND subscription_id = $2::uuid
         AND days = $3::int AND attempt_id = $4`;
  if (attemptId) {
    const prior = await q.query<PriorSnooze>(priorSelect, [
      params.userId,
      params.subscriptionId,
      params.days,
      attemptId,
    ]);
    if (prior.rows[0]) return toSnoozeResult(prior.rows[0]);
  }
  const shifted = await q.query<{ prev_date: string; next_date: string }>(
    `UPDATE subscriptions SET
       next_renewal_date = next_renewal_date + ($3::int * INTERVAL '1 day'),
       version = version + 1
      WHERE user_id = $1 AND id = $2::uuid AND status = 'active'
      RETURNING (next_renewal_date - ($3::int * INTERVAL '1 day'))::date::text AS prev_date,
                (next_renewal_date)::date::text AS next_date`,
    [params.userId, params.subscriptionId, params.days]
  );
  const row = shifted.rows[0];
  if (!row) return null;
  try {
    const recorded = await q.query<{ id: string }>(
      `INSERT INTO subscription_snoozes
         (user_id, subscription_id, days, source, previous_renewal_date, new_renewal_date, attempt_id)
       VALUES ($1, $2::uuid, $3::int, $4, $5::date, $6::date, $7)
       RETURNING id::text AS id`,
      [params.userId, params.subscriptionId, params.days, params.source, row.prev_date, row.next_date, attemptId]
    );
    return {
      next_date: row.next_date,
      snooze: {
        id: recorded.rows[0].id,
        days: params.days,
        source: params.source,
        previous_renewal_date: row.prev_date,
        new_renewal_date: row.next_date,
      },
    };
  } catch (err) {
    // Lost race against a concurrent same-attempt insert: replay the winner.
    if ((err as { code?: string } | null)?.code === "23505" && attemptId) {
      const winner = await q.query<PriorSnooze>(priorSelect, [
        params.userId,
        params.subscriptionId,
        params.days,
        attemptId,
      ]);
      if (winner.rows[0]) return toSnoozeResult(winner.rows[0]);
    }
    throw err;
  }
}
