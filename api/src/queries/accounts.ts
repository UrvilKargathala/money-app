import { query } from "../db";

export type AccountType = {
  type_code: string;
  display_name: string;
  icon: string;
  is_asset: number;
  sort_order: number;
};

export type AccountRow = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  opening_balance: string;
  credit_limit: string | null;
  currency: string;
  color: string | null;
  notes: string | null;
  is_active: number;
  sort_order: number;
  version: number;
  created_at: Date;
  deleted_at: Date | null;
  display_name: string;
  icon: string;
  is_asset: number;
  balance: string;
};

export type AccountWithBalance = Omit<
  AccountRow,
  "balance" | "opening_balance" | "credit_limit"
> & {
  opening_balance: number;
  credit_limit: number | null;
  balance: number;
};

export type TransferRow = {
  id: string;
  amount: string;
  date: Date;
  notes: string | null;
  transfer_group_id: string;
  from_name: string;
  from_type: string;
  from_color: string | null;
  to_name: string;
  to_type: string;
  to_color: string | null;
};

export type BalanceHistoryPoint = {
  date: Date;
  balance: string;
};

export function toAccount(row: AccountRow): AccountWithBalance {
  return {
    ...row,
    opening_balance: Number(row.opening_balance),
    credit_limit: row.credit_limit != null ? Number(row.credit_limit) : null,
    balance: Number(row.balance),
  };
}

const BALANCE_EXPR = `
  COALESCE(SUM(CASE
    WHEN t.type = 'income' THEN t.amount
    WHEN t.type = 'expense' THEN -t.amount
    WHEN t.type = 'transfer' AND tf.from_transaction_id = t.id THEN -t.amount
    WHEN t.type = 'transfer' AND tf.to_transaction_id = t.id THEN t.amount
    ELSE 0 END), 0)::numeric(12,2)
`;

export async function getAccountTypes(): Promise<AccountType[]> {
  const result = await query<AccountType>(
    `SELECT type_code, display_name, icon, is_asset, sort_order
     FROM account_types ORDER BY sort_order`
  );
  return result.rows;
}

export async function getAccountsWithBalances(
  userId: number,
  includeInactive = false
): Promise<AccountWithBalance[]> {
  const result = await query<AccountRow>(
    `SELECT a.id, a.name, a.type, a.institution, a.opening_balance, a.credit_limit,
            a.currency, a.color, a.notes, a.is_active, a.sort_order, a.version,
            a.created_at, a.deleted_at,
            at.display_name, at.icon, at.is_asset,
            ${BALANCE_EXPR} AS balance
     FROM accounts a
     JOIN account_types at ON at.type_code = a.type
     LEFT JOIN transactions t ON t.account_id = a.id
     LEFT JOIN account_transfers tf
       ON tf.from_transaction_id = t.id OR tf.to_transaction_id = t.id
     WHERE a.user_id = $1
       ${includeInactive ? "" : "AND a.is_active = 1 AND a.deleted_at IS NULL"}
     GROUP BY a.id, at.display_name, at.icon, at.is_asset, at.sort_order
     ORDER BY at.sort_order, balance DESC, a.name`,
    [userId]
  );
  return result.rows.map(toAccount);
}

export async function getAccountById(
  userId: number,
  accountId: string
): Promise<AccountWithBalance | null> {
  const result = await query<AccountRow>(
    `SELECT a.id, a.name, a.type, a.institution, a.opening_balance, a.credit_limit,
            a.currency, a.color, a.notes, a.is_active, a.sort_order, a.version,
            a.created_at, a.deleted_at,
            at.display_name, at.icon, at.is_asset,
            ${BALANCE_EXPR} AS balance
     FROM accounts a
     JOIN account_types at ON at.type_code = a.type
     LEFT JOIN transactions t ON t.account_id = a.id
     LEFT JOIN account_transfers tf
       ON tf.from_transaction_id = t.id OR tf.to_transaction_id = t.id
     WHERE a.user_id = $1 AND a.id = $2
     GROUP BY a.id, at.display_name, at.icon, at.is_asset`,
    [userId, accountId]
  );
  return result.rows[0] ? toAccount(result.rows[0]) : null;
}

export async function getBalanceHistory(
  userId: number,
  accountId: string,
  from: Date,
  to: Date
): Promise<BalanceHistoryPoint[]> {
  const result = await query<BalanceHistoryPoint>(
    `SELECT date, balance
     FROM account_balance_history
     WHERE user_id = $1 AND account_id = $2 AND date BETWEEN $3::date AND $4::date
     ORDER BY date`,
    [userId, accountId, from, to]
  );
  return result.rows;
}

export async function getTransfers(userId: number): Promise<TransferRow[]> {
  const result = await query<TransferRow>(
    `SELECT at.id, at.amount, at.date, at.notes, at.transfer_group_id,
            f.name AS from_name, f.type AS from_type, f.color AS from_color,
            t.name AS to_name, t.type AS to_type, t.color AS to_color
     FROM account_transfers at
     JOIN accounts f ON f.id = at.from_account_id
     JOIN accounts t ON t.id = at.to_account_id
     WHERE at.user_id = $1
     ORDER BY at.date DESC, at.id DESC`,
    [userId]
  );
  return result.rows;
}
export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export async function countAccounts(userId: number, q: Queryable = DB): Promise<number> {
  const result = await q.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM accounts WHERE user_id = $1`,
    [userId]
  );
  return Number(result.rows[0]?.n ?? 0);
}

export function insertAccount(
  q: Queryable,
  params: {
    userId: number;
    name: string;
    type: string;
    institution: string | null;
    openingBalance: number;
    creditLimit: number | null;
    color: string | null;
    notes: string | null;
  }
) {
  return q.query(
    `INSERT INTO accounts
       (user_id, name, type, institution, opening_balance, credit_limit, color, notes,
        created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $1, $1)`,
    [
      params.userId,
      params.name,
      params.type,
      params.institution,
      params.openingBalance,
      params.creditLimit,
      params.color,
      params.notes,
    ]
  );
}

export function updateAccountDetails(
  q: Queryable,
  params: {
    userId: number;
    accountId: string;
    name: string;
    institution: string | null;
    notes: string | null;
    color: string | null;
    creditLimit: number | null;
    version: number;
  }
) {
  return q.query(
    `UPDATE accounts
     SET name = $3, institution = $4, notes = $5, color = $6,
         credit_limit = $7, version = version + 1, updated_by = $1
     WHERE user_id = $1 AND id = $2 AND version = $8`,
    [
      params.userId,
      params.accountId,
      params.name,
      params.institution,
      params.notes,
      params.color,
      params.creditLimit,
      params.version,
    ]
  );
}

export function deactivateAccount(q: Queryable, userId: number, accountId: string) {
  return q.query(
    `UPDATE accounts
     SET is_active = 0, deleted_at = CURRENT_TIMESTAMP, deleted_by = $1,
         version = version + 1, updated_by = $1
     WHERE user_id = $2 AND id = $3 AND deleted_at IS NULL`,
    [userId, userId, accountId]
  );
}

export function reactivateAccount(q: Queryable, userId: number, accountId: string) {
  return q.query(
    `UPDATE accounts
     SET is_active = 1, deleted_at = NULL, deleted_by = NULL,
         version = version + 1, updated_by = $1
     WHERE user_id = $2 AND id = $3`,
    [userId, userId, accountId]
  );
}

export async function getAccountUsageSummary(
  userId: number,
  accountId: string,
  q: Queryable = DB
): Promise<{ txns: number; balance: number }> {
  const result = await q.query<{ txns: string; balance: string }>(
    `SELECT
       (SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND account_id = $2)::text AS txns,
       COALESCE((SELECT SUM(CASE
         WHEN type = 'income' THEN amount
         WHEN type = 'expense' THEN -amount
         WHEN type = 'transfer' THEN
           CASE WHEN EXISTS (
             SELECT 1 FROM account_transfers tf
             WHERE tf.from_transaction_id = transactions.id
           ) THEN -amount ELSE amount END
         ELSE 0 END) FROM transactions WHERE user_id = $1 AND account_id = $2), 0)::text AS balance`,
    [userId, accountId]
  );
  return {
    txns: Number(result.rows[0]?.txns ?? 0),
    balance: Number(result.rows[0]?.balance ?? 0),
  };
}

export function deleteAccountById(q: Queryable, userId: number, accountId: string) {
  return q.query(`DELETE FROM accounts WHERE user_id = $1 AND id = $2`, [
    userId,
    accountId,
  ]);
}

// ---------------------------------------------------------------------------
// M1 gap: dashboard summary + credit utilization + manual snapshots
// ---------------------------------------------------------------------------

export async function getAccountSummaryTotals(
  userId: number,
  q: Queryable = DB
): Promise<{
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  account_count: number;
}> {
  const result = await q.query<{ kind: string; total: string }>(
    `SELECT CASE WHEN at.is_asset = 1 THEN 'asset' ELSE 'liability' END AS kind,
            SUM(a.opening_balance + COALESCE(SUM(CASE
              WHEN t.type='income' THEN t.amount WHEN t.type='expense' THEN -t.amount
              ELSE 0 END),0))::text AS total
     FROM accounts a
     JOIN account_types at ON at.type_code = a.type
     LEFT JOIN transactions t ON t.account_id = a.id
     WHERE a.user_id = $1 AND a.is_active = 1 AND a.deleted_at IS NULL
     GROUP BY at.is_asset`,
    [userId]
  );
  let assets = 0; let liabilities = 0;
  for (const row of result.rows) {
    if (row.kind === "asset") assets = Number(row.total);
    else liabilities = Number(row.total);
  }
  const countRes = await q.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM accounts WHERE user_id = $1 AND is_active = 1 AND deleted_at IS NULL`,
    [userId]
  );
  return {
    total_assets: Math.round(assets * 100) / 100,
    total_liabilities: Math.round(liabilities * 100) / 100,
    net_worth: Math.round((assets - liabilities) * 100) / 100,
    account_count: Number(countRes.rows[0]?.c ?? 0),
  };
}

export async function getCreditUtilization(
  userId: number,
  accountId: string,
  q: Queryable = DB
): Promise<{ credit_limit: number | null; current_balance: number; utilization_pct: number | null } | null> {
  const result = await q.query<{
    credit_limit: string | null;
    balance: string;
    type: string;
  }>(
    `SELECT a.credit_limit::text AS credit_limit,
            (a.opening_balance + COALESCE(SUM(CASE
              WHEN t.type='income' THEN t.amount WHEN t.type='expense' THEN -t.amount
              ELSE 0 END),0))::text AS balance, a.type
     FROM accounts a
     LEFT JOIN transactions t ON t.account_id = a.id
     WHERE a.user_id = $1 AND a.id = $2::uuid AND a.type = 'credit_card'
     GROUP BY a.id`,
    [userId, accountId]
  );
  if (result.rowCount !== 1) return null;
  const row = result.rows[0];
  const limit = row.credit_limit === null ? null : Number(row.credit_limit);
  const balance = Math.abs(Number(row.balance));
  const pct = limit !== null && limit > 0 ? Math.round((balance / limit) * 10000) / 100 : null;
  return { credit_limit: limit, current_balance: balance, utilization_pct: pct };
}

export async function createManualSnapshot(
  q: Queryable,
  params: { userId: number; accountId: string; balance: number; date: string }
): Promise<void> {
  await q.query(
    `INSERT INTO account_balance_history (user_id, account_id, balance, date)
     VALUES ($1, $2::uuid, $3, $4::date)
     ON CONFLICT (user_id, account_id, date)
     DO UPDATE SET balance = EXCLUDED.balance`,
    [params.userId, params.accountId, params.balance, params.date]
  );
}
