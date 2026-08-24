import { query } from "../db";
import { isoDate } from "../utils/format";
import { computeNextOccurrence, type RecurringFrequency } from "../utils/recurring";
import type { Queryable } from "./notes";

const DB: Queryable = { query: query };

export type RecurringTemplateRow = {
  id: string;
  user_id: number;
  account_id: string | null;
  account_name: string | null;
  type: "income" | "expense";
  amount: number;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  frequency: RecurringFrequency;
  interval_value: number;
  end_type: "never" | "count" | "date";
  end_count: number | null;
  end_date: string | null;
  next_due_date: string;
  is_active: number;
  is_due: boolean;
  executed_count: number;
  version: number;
};

const RECURRING_SELECT = `
  SELECT r.id, r.user_id, r.account_id, a.name AS account_name,
         r.type, r.amount::text AS amount, r.description,
         r.category_id, c.name AS category_name,
         r.frequency, r.interval_value, r.end_type,
         r.end_count, r.end_date::date::text AS end_date,
         r.next_due_date::date::text AS next_due_date,
         r.is_active, r.version,
         (r.next_due_date <= CURRENT_DATE) AS is_due_raw,
         (
           SELECT COUNT(*) FROM transactions t
           WHERE t.recurring_template_id = r.id
         ) AS executed_count
  FROM recurring_transaction_templates r
  LEFT JOIN accounts a ON a.id = r.account_id
  LEFT JOIN categories c ON c.id = r.category_id
  WHERE r.user_id = $1
`;

type RawTemplateRow = {
  id: string;
  user_id: number;
  account_id: string | null;
  account_name: string | null;
  type: string;
  amount: string;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  frequency: string;
  interval_value: number;
  end_type: string;
  end_count: number | null;
  end_date: string | null;
  next_due_date: string;
  is_active: number;
  is_due_raw: boolean;
  executed_count: string;
  version: number;
};

function mapRow(row: RawTemplateRow): RecurringTemplateRow {
  return {
    ...row,
    type: row.type as "income" | "expense",
    amount: Number(row.amount),
    frequency: row.frequency as RecurringFrequency,
    end_type: row.end_type as "never" | "count" | "date",
    is_due: row.is_due_raw,
    executed_count: Number(row.executed_count),
  };
}

export async function listRecurringTemplates(
  userId: number,
  q: Queryable = DB
): Promise<RecurringTemplateRow[]> {
  const rows = await q.query<RawTemplateRow>(
    `${RECURRING_SELECT} ORDER BY r.next_due_date`,
    [userId]
  );
  return rows.rows.map(mapRow);
}

export async function getRecurringTemplate(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<RecurringTemplateRow | null> {
  const rows = await q.query<RawTemplateRow>(
    `${RECURRING_SELECT} AND r.id = $2::uuid`,
    [userId, id]
  );
  return rows.rowCount === 1 ? mapRow(rows.rows[0]) : null;
}

export async function insertRecurringTemplate(
  q: Queryable,
  params: {
    userId: number;
    accountId: string | null;
    type: "income" | "expense";
    amount: number;
    description: string | null;
    categoryId: string | null;
    frequency: RecurringFrequency;
    intervalValue: number;
    endType: "never" | "count" | "date";
    endCount: number | null;
    endDate: string | null;
    nextDueDate: string;
  }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO recurring_transaction_templates
       (user_id, account_id, type, amount, description, category_id,
        frequency, interval_value, end_type, end_count, end_date, next_due_date)
     VALUES ($1, $2::uuid, $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11::date, $12::date)
     RETURNING id`,
    [
      params.userId, params.accountId, params.type, params.amount,
      params.description, params.categoryId, params.frequency,
      params.intervalValue, params.endType, params.endCount,
      params.endDate, params.nextDueDate,
    ]
  );
  return result.rows[0].id;
}

/** Partial update with optimistic-lock version check. */
export function updateRecurringTemplate(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    accountId: string | null;
    type: string | null;
    amount: number | null;
    description: string | null;
    categoryId: string | null;
    frequency: string | null;
    intervalValue: number | null;
    endType: string | null;
    endCount: number | null;
    endDate: string | null;
    nextDueDate: string | null;
    isActive: number | null;
    version: number;
  }
) {
  return q.query<{ id: string }>(
    `UPDATE recurring_transaction_templates SET
       account_id = COALESCE($3::uuid, account_id),
       type = COALESCE($4::text, type),
       amount = COALESCE($5, amount),
       description = COALESCE($6, description),
       category_id = COALESCE($7::uuid, category_id),
       frequency = COALESCE($8::text, frequency),
       interval_value = COALESCE($9, interval_value),
       end_type = COALESCE($10::text, end_type),
       end_count = COALESCE($11, end_count),
       end_date = COALESCE($12::date, end_date),
       next_due_date = COALESCE($13::date, next_due_date),
       is_active = COALESCE($14, is_active),
       version = version + 1
     WHERE user_id = $1 AND id = $2::uuid AND version = $15
     RETURNING id`,
    [
      params.userId, params.id, params.accountId, params.type, params.amount,
      params.description, params.categoryId, params.frequency,
      params.intervalValue, params.endType, params.endCount, params.endDate,
      params.nextDueDate, params.isActive, params.version,
    ]
  );
}

export function deleteRecurringTemplate(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `DELETE FROM recurring_transaction_templates
     WHERE user_id = $1 AND id = $2::uuid RETURNING id`,
    [userId, id]
  );
}

type LockedTemplate = {
  id: string;
  account_id: string | null;
  type: string;
  amount: string;
  description: string | null;
  category_id: string | null;
  frequency: RecurringFrequency;
  interval_value: number;
  end_type: "never" | "count" | "date";
  end_count: number | null;
  end_date: Date | null;
  next_due_date: Date;
  is_active: number;
};

async function lockTemplate(
  q: Queryable,
  userId: number,
  id: string
): Promise<LockedTemplate | null> {
  const result = await q.query<LockedTemplate>(
    `SELECT id, account_id, type, amount::text AS amount, description,
            category_id, frequency, interval_value, end_type, end_count,
            end_date, next_due_date, is_active
     FROM recurring_transaction_templates
     WHERE user_id = $1 AND id = $2::uuid
     FOR UPDATE`,
    [userId, id]
  );
  return result.rows[0] ?? null;
}

/**
 * Executes the due occurrence: creates the real transaction dated at the
 * scheduled day and advances the schedule. Deactivates the template when an
 * end condition is reached. Serialized by the FOR UPDATE row lock.
 */
export type ExecuteResult =
  | { ok: false; reason: "NOT_FOUND" | "INACTIVE" | "NOT_DUE" }
  | { ok: true; transactionId: string; nextDueDate: string; completed: boolean };

export type SkipResult =
  | { ok: false; reason: "NOT_FOUND" | "INACTIVE" }
  | { ok: true; nextDueDate: string; completed: boolean };



/**
 * Executes the due occurrence: creates the real transaction dated at the
 * scheduled day and advances the schedule. Deactivates the template when an
 * end condition is reached. Serialized by the FOR UPDATE row lock.
 */
export async function executeDueOccurrence(
  q: Queryable,
  userId: number,
  id: string
): Promise<ExecuteResult> {
  const tpl = await lockTemplate(q, userId, id);
  if (!tpl) return { ok: false, reason: "NOT_FOUND" };
  if (tpl.is_active !== 1) return { ok: false, reason: "INACTIVE" };

  const todayIso = isoDate(new Date());
  const dueIso = isoDate(tpl.next_due_date);
  if (dueIso > todayIso) return { ok: false, reason: "NOT_DUE" };

  const txnResult = await q.query<{ id: string }>(
    `INSERT INTO transactions
       (user_id, account_id, type, amount, description, category_id,
        date, source, is_recurring, recurring_template_id, created_by, updated_by)
     VALUES ($1, $2::uuid, $3::text, $4, $5, $6::uuid, $7::date, 'recurring', 1,
             $8::uuid, $1, $1)
     RETURNING id`,
    [
      userId, tpl.account_id, tpl.type, Number(tpl.amount),
      tpl.description ?? "Recurring transaction", tpl.category_id,
      dueIso, tpl.id,
    ]
  );

  const next = computeNextOccurrence(
    new Date(`${dueIso}T00:00:00Z`),
    tpl.frequency,
    tpl.interval_value
  );
  const nextIso = isoDate(next);

  let completed = false;

  if (tpl.end_type === "count" && tpl.end_count !== null) {
    const countResult = await q.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM transactions
       WHERE user_id = $2 AND recurring_template_id = $1::uuid`,
      [tpl.id, userId]
    );
    if (Number(countResult.rows[0].count) >= tpl.end_count) completed = true;
  }

  const endDateIso = tpl.end_date === null ? null : isoDate(tpl.end_date);
  if (tpl.end_type === "date" && endDateIso !== null && nextIso > endDateIso) {
    completed = true;
  }

  if (completed) {
    await q.query(
      `UPDATE recurring_transaction_templates
       SET is_active = 0, version = version + 1 WHERE user_id = $2 AND id = $1::uuid`,
      [tpl.id, userId]
    );
  } else {
    await q.query(
      `UPDATE recurring_transaction_templates
       SET next_due_date = $3::date, version = version + 1 WHERE user_id = $1 AND id = $2::uuid`,
       [userId, tpl.id, nextIso]
    );
  }

  return {
    ok: true,
    transactionId: txnResult.rows[0].id,
    nextDueDate: completed ? dueIso : nextIso,
    completed,
  };
}

/** Advances past the next occurrence WITHOUT creating a transaction. */
export async function skipNextOccurrence(
  q: Queryable,
  userId: number,
  id: string
): Promise<SkipResult> {
  const tpl = await lockTemplate(q, userId, id);
  if (!tpl) return { ok: false, reason: "NOT_FOUND" };
  if (tpl.is_active !== 1) return { ok: false, reason: "INACTIVE" };

  const next = computeNextOccurrence(
    new Date(`${isoDate(tpl.next_due_date)}T00:00:00Z`),
    tpl.frequency,
    tpl.interval_value
  );
  const nextIso = isoDate(next);

  let completed = false;
  const endDateIso2 = tpl.end_date === null ? null : isoDate(tpl.end_date);
  if (tpl.end_type === "date" && endDateIso2 !== null && nextIso > endDateIso2) {
    completed = true;
  }
  // Count-based completion only tracks EXECUTED occurrences â€” skipping a slot
  // advances the schedule but never increments that counter.

  if (completed) {
    await q.query(
      `UPDATE recurring_transaction_templates
       SET is_active = 0, version = version + 1 WHERE user_id = $2 AND id = $1::uuid`,
      [tpl.id, userId]
    );
  } else {
    await q.query(
      `UPDATE recurring_transaction_templates
       SET next_due_date = $3::date, version = version + 1 WHERE user_id = $1 AND id = $2::uuid`,
       [userId, tpl.id, nextIso]
    );
  }

  return { ok: true, nextDueDate: completed ? isoDate(tpl.next_due_date) : nextIso, completed };
}
