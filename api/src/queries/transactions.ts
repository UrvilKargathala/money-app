import { query } from "../db";

export type TransactionTag = {
  id: string;
  name: string;
  color: string | null;
};

export type TransactionSplitRow = {
  id: string;
  category_id: string;
  category_name: string | null;
  amount: string;
  notes: string | null;
};

export type TransactionSplit = Omit<TransactionSplitRow, "amount"> & {
  amount: number;
};

export type TransactionRow = {
  id: string;
  account_id: string;
  type: string;
  amount: string;
  description: string | null;
  merchant_clean: string | null;
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  date: Date;
  notes: string | null;
  account_name: string;
  account_color: string | null;
  transfer_group_id: string | null;
  source: string;
  version: number;
  tags: TransactionTag[];
};

export type Transaction = Omit<TransactionRow, "amount"> & { amount: number };

export type TransactionDetail = Transaction & { splits: TransactionSplit[] };

export type TransactionSummary = {
  income: number;
  expense: number;
  net: number;
  count: number;
};

export type TransactionFilters = {
  from?: Date;
  to?: Date;
  accountId?: string;
  categoryId?: string;
  type?: string;
  q?: string;
};

const TAG_AGG = `
  COALESCE(
    array_agg(
      json_build_object('id', g.id, 'name', g.name, 'color', g.color)
    ) FILTER (WHERE g.id IS NOT NULL),
    '{}'
  ) AS tags
`;

const SPLIT_AGG = `
  COALESCE(
    array_agg(
      json_build_object(
        'id', s.id,
        'category_id', s.category_id,
        'category_name', sc.name,
        'amount', s.amount,
        'notes', s.notes
      )
    ) FILTER (WHERE s.id IS NOT NULL),
    '{}'
  ) AS splits
`;

const ROW_SELECT = `
  SELECT t.id, t.account_id, t.type, t.amount, t.description, t.merchant_clean,
         t.category_id, c.name AS category_name, c.icon AS category_icon,
         c.color AS category_color, t.date, t.notes,
         a.name AS account_name, a.color AS account_color,
         t.transfer_group_id, t.source, t.version, ${TAG_AGG}
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN accounts a ON a.id = t.account_id
  LEFT JOIN tags_transactions tt ON tt.transaction_id = t.id AND tt.user_id = t.user_id
  LEFT JOIN tags g ON g.id = tt.tag_id
`;

export function filterClause(
  userId: number,
  filters: TransactionFilters
): { where: string; params: unknown[] } {
const clauses: string[] = ["t.user_id = $1"];
  const params: unknown[] = [userId];

  if (filters.from) {
    params.push(filters.from);
    clauses.push(`t.date >= $${params.length}::date`);
  }
  if (filters.to) {
    params.push(filters.to);
    clauses.push(`t.date <= $${params.length}::date`);
  }
  if (filters.accountId) {
    params.push(filters.accountId);
    clauses.push(`t.account_id = $${params.length}`);
  }
  if (filters.categoryId) {
    params.push(filters.categoryId);
    clauses.push(
      `(t.category_id = $${params.length} OR t.category_id IN (
         SELECT id FROM categories WHERE parent_id = $${params.length}
       ))`
    );
  }
  if (filters.type) {
    params.push(filters.type);
    clauses.push(`t.type = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    clauses.push(
      `(t.description ILIKE $${params.length} OR t.merchant_clean ILIKE $${params.length})`
    );
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return { where, params };
}

function toTransaction(row: TransactionRow): Transaction {
  return { ...row, amount: Number(row.amount) };
}

export async function getTransactions(
  userId: number,
  filters: TransactionFilters,
  limit: number,
  offset: number
): Promise<Transaction[]> {
  const { where, params } = filterClause(userId, filters);
  const result = await query<TransactionRow>(
    `${ROW_SELECT}
     ${where}
     GROUP BY t.id, c.name, c.icon, c.color, a.name, a.color
     ORDER BY t.date DESC, t.created_at DESC, t.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return result.rows.map(toTransaction);
}

export async function getTransactionSummary(
  userId: number,
  filters: TransactionFilters
): Promise<TransactionSummary> {
  const { where, params } = filterClause(userId, filters);
  const result = await query<{ total: string; income: string; expense: string }>(
    `SELECT COUNT(*)::int AS total,
            COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0)::numeric(12,2) AS income,
            COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)::numeric(12,2) AS expense
     FROM transactions t
     ${where}`,
    params
  );
  const row = result.rows[0];
  const income = Number(row?.income ?? 0);
  const expense = Number(row?.expense ?? 0);
  return {
    income,
    expense,
    net: income - expense,
    count: Number(row?.total ?? 0),
  };
}

export async function getTransactionById(
  userId: number,
  transactionId: string
): Promise<TransactionDetail | null> {
  const result = await query<TransactionRow & { splits: TransactionSplitRow[] }>(
    `${ROW_SELECT}
     LEFT JOIN transaction_splits s ON s.transaction_id = t.id AND s.user_id = t.user_id
     LEFT JOIN categories sc ON sc.id = s.category_id
     WHERE t.user_id = $1 AND t.id = $2
     GROUP BY t.id, c.name, c.icon, c.color, a.name, a.color
     LIMIT 1`,
    [userId, transactionId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...toTransaction(row),
    splits: row.splits.map((s) => ({ ...s, amount: Number(s.amount) })),
  };
}
export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export function insertManualTransaction(
  q: Queryable,
  params: {
    userId: number;
    accountId: string;
    type: string;
    amount: number;
    description: string | null;
    categoryId: string | null;
    date: string;
    notes: string | null;
  }
) {
  return q.query(
    `INSERT INTO transactions
       (user_id, account_id, type, amount, description, category_id, date, notes,
        source, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, 'manual', $1, $1)`,
    [
      params.userId,
      params.accountId,
      params.type,
      params.amount,
      params.description,
      params.categoryId,
      params.date,
      params.notes,
    ]
  );
}

export async function getTransactionTransferGroup(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<string | null> {
  const result = await q.query<{ transfer_group_id: string | null }>(
    `SELECT transfer_group_id FROM transactions WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  return result.rowCount === 1 ? result.rows[0].transfer_group_id : null;
}

export function updateTransactionFields(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    type: string;
    amount: number;
    description: string | null;
    categoryId: string | null;
    date: string;
    notes: string | null;
    accountId: string;
    version: number;
  }
) {
  return q.query(
    `UPDATE transactions
     SET type = $3, amount = $4, description = $5, category_id = $6,
         date = $7::date, notes = $8, account_id = $9,
         version = version + 1, updated_by = $1
     WHERE user_id = $1 AND id = $2 AND version = $10`,
    [
      params.userId,
      params.id,
      params.type,
      params.amount,
      params.description,
      params.categoryId,
      params.date,
      params.notes,
      params.accountId,
      params.version,
    ]
  );
}

export function deleteTransactionById(q: Queryable, userId: number, id: string) {
  return q.query(`DELETE FROM transactions WHERE user_id = $1 AND id = $2`, [
    userId,
    id,
  ]);
}

export function transactionExists(
  userId: number,
  id: string,
  q: Queryable = DB
) {
  return q.query<{ id: string }>(
    `SELECT id FROM transactions WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
}

export function attachTransactionTag(
  q: Queryable,
  params: { userId: number; transactionId: string; tagId: string }
) {
  return q.query(
    `INSERT INTO tags_transactions (user_id, transaction_id, tag_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, transaction_id, tag_id) DO NOTHING`,
    [params.userId, params.transactionId, params.tagId]
  );
}

export function detachTransactionTag(
  q: Queryable,
  params: { userId: number; transactionId: string; tagId: string }
) {
  return q.query(
    `DELETE FROM tags_transactions
     WHERE user_id = $1 AND transaction_id = $2 AND tag_id = $3`,
    [params.userId, params.transactionId, params.tagId]
  );
}
