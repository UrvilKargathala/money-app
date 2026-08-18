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