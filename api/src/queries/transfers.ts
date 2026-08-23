import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export async function getActiveAccountsByIds(
  q: Queryable,
  userId: number,
  ids: string[]
): Promise<{ id: string; is_active: number }[]> {
  const result = await q.query<{ id: string; is_active: number }>(
    `SELECT id, is_active FROM accounts
     WHERE user_id = $1 AND id = ANY($2::uuid[])`,
    [userId, ids]
  );
  return result.rows;
}

function insertTransferLeg(
  q: Queryable,
  params: {
    userId: number;
    accountId: string;
    amount: number;
    description: string;
    date: string;
    groupId: string;
  }
) {
  return q.query<{ id: string }>(
    `INSERT INTO transactions
       (user_id, account_id, type, amount, description, date, transfer_group_id,
        source, created_by, updated_by)
     VALUES ($1, $2, 'transfer', $3, $4, $5::date, $6, 'manual', $1, $1)
     RETURNING id`,
    [
      params.userId, params.accountId, params.amount, params.description,
      params.date, params.groupId,
    ]
  );
}

export async function createTransfer(
  q: Queryable,
  params: {
    userId: number;
    fromId: string;
    toId: string;
    amount: number;
    date: string;
    notes: string | null;
    groupId: string;
  }
): Promise<{ fromTransactionId: string; toTransactionId: string }> {
  const fromTx = await insertTransferLeg(q, {
    userId: params.userId,
    accountId: params.fromId,
    amount: params.amount,
    description: `Transfer to ${params.toId.slice(0, 8)}`,
    date: params.date,
    groupId: params.groupId,
  });
  const toTx = await insertTransferLeg(q, {
    userId: params.userId,
    accountId: params.toId,
    amount: params.amount,
    description: `Transfer from ${params.fromId.slice(0, 8)}`,
    date: params.date,
    groupId: params.groupId,
  });

  await q.query(
    `INSERT INTO account_transfers
       (user_id, transfer_group_id, from_account_id, to_account_id,
        from_transaction_id, to_transaction_id, amount, date, notes, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, 1)`,
    [
      params.userId,
      params.groupId,
      params.fromId,
      params.toId,
      fromTx.rows[0].id,
      toTx.rows[0].id,
      params.amount,
      params.date,
      params.notes,
    ]
  );

  return {
    fromTransactionId: fromTx.rows[0].id,
    toTransactionId: toTx.rows[0].id,
  };
}
