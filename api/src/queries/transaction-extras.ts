import { query } from "../db";
import { round2 } from "../utils/finance";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

/** Last expense's context — the quick-add auto-fill heuristic. */
export type QuickAddHeuristic = {
  account_id: string | null;
  category_id: string | null;
  merchant_clean: string | null;
  description: string | null;
};

export async function getLastExpenseContext(
  userId: number,
  q: Queryable = DB
): Promise<QuickAddHeuristic | null> {
  const result = await q.query<QuickAddHeuristic>(
    `SELECT account_id, category_id, merchant_clean, description
     FROM transactions
     WHERE user_id = $1 AND type = 'expense'
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export function insertQuickAddTransaction(
  q: Queryable,
  params: {
    userId: number;
    accountId: string;
    type: string;
    amount: number;
    description: string | null;
    categoryId: string | null;
    date: string;
    merchantClean: string | null;
  }
): Promise<string> {
  return q
    .query<{ id: string }>(
      `INSERT INTO transactions
         (user_id, account_id, type, amount, description, merchant_clean,
          category_id, date, source, created_by, updated_by)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::uuid, $8::date, 'manual', $1, $1)
       RETURNING id`,
      [
        params.userId, params.accountId, params.type, params.amount,
        params.description, params.merchantClean, params.categoryId,
        params.date,
      ]
    )
    .then((r) => r.rows[0].id);
}

export type RecentMerchant = { merchant: string; last_used_at: string };

/** Five most recently used distinct merchants (FR-2.x). */
export async function getRecentMerchants(
  userId: number,
  limit: number,
  q: Queryable = DB
): Promise<RecentMerchant[]> {
  const result = await q.query<{
    merchant_clean: string;
    last_used_at: Date;
  }>(
    `SELECT DISTINCT ON (merchant_clean) merchant_clean, created_at AS last_used_at
     FROM transactions
     WHERE user_id = $1 AND type = 'expense' AND merchant_clean IS NOT NULL
     ORDER BY merchant_clean, created_at DESC`,
    [userId]
  );
  return result.rows
    .sort((a, b) => b.last_used_at.getTime() - a.last_used_at.getTime())
    .slice(0, limit)
    .map((row) => ({
      merchant: row.merchant_clean,
      last_used_at: row.last_used_at.toISOString(),
    }));
}

/** Bulk categorize: one UPDATE over the id array (set-based, no loops). */
export function bulkCategorize(
  q: Queryable,
  params: { userId: number; ids: string[]; categoryId: string }
) {
  return q.query<{ id: string }>(
    `UPDATE transactions SET category_id = $3::uuid, version = version + 1, updated_by = $1
     WHERE user_id = $1 AND id = ANY($2::uuid[]) AND transfer_group_id IS NULL
     RETURNING id`,
    [params.userId, params.ids, params.categoryId]
  );
}

/** Bulk tag: cross join ids × tags in one INSERT ... SELECT (ON CONFLICT skip). */
export function bulkAttachTags(
  q: Queryable,
  params: { userId: number; ids: string[]; tagIds: string[] }
) {
  return q.query(
    `INSERT INTO tags_transactions (user_id, transaction_id, tag_id)
     SELECT $1, t.id, tg.id
     FROM unnest($2::uuid[]) AS t(id)
     CROSS JOIN unnest($3::uuid[]) AS tg(id)
     JOIN transactions x ON x.user_id = $1 AND x.id = t.id AND x.transfer_group_id IS NULL
     ON CONFLICT (user_id, transaction_id, tag_id) DO NOTHING`
  , [params.userId, params.ids, params.tagIds]);
}

/** Bulk delete: skips transfers like the single delete does. */
export function bulkDeleteTransactions(q: Queryable, userId: number, ids: string[]) {
  return q.query<{ id: string }>(
    `DELETE FROM transactions
     WHERE user_id = $1 AND id = ANY($2::uuid[]) AND transfer_group_id IS NULL
     RETURNING id`,
    [userId, ids]
  );
}

export type DateGroup = {
  date: string;
  income: number;
  expense: number;
  net: number;
  count: number;
};

/**
 * Daily totals across the requested window — one aggregate query.
 * Items for each day come from the regular list endpoint; this powers chips.
 */
export async function getDateGroups(
  userId: number,
  from: string | null,
  to: string | null,
  q: Queryable = DB
): Promise<DateGroup[]> {
  const result = await q.query<{
    date: Date;
    income: string;
    expense: string;
    count: string;
  }>(
    `SELECT date,
            COALESCE(SUM(CASE WHEN type='income' THEN amount END),0)::text AS income,
            COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0)::text AS expense,
            COUNT(*)::text AS count
     FROM transactions
     WHERE user_id = $1 AND type IN ('income','expense')
       AND ($2::date IS NULL OR date >= $2::date)
       AND ($3::date IS NULL OR date <= $3::date)
     GROUP BY date ORDER BY date DESC`,
    [userId, from, to]
  );
  return result.rows.map((row) => {
    const income = Number(row.income);
    const expense = Number(row.expense);
    return {
      date: isoDateOf(row.date),
      income: round2(income),
      expense: round2(expense),
      net: round2(income - expense),
      count: Number(row.count),
    };
  });
}

function isoDateOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}
