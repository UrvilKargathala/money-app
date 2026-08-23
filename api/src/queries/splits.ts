import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type SplitRow = {
  id: string;
  transaction_id: string;
  category_id: string;
  category_name: string | null;
  amount: number;
  notes: string | null;
};

export type SplitSummary = {
  splits: SplitRow[];
  total_split: number;
  parent_amount: number;
  remaining: number;
};

/** One SELECT per side — items plus the parent anchor, no loops. */
export async function listSplits(
  userId: number,
  transactionId: string,
  q: Queryable = DB
): Promise<SplitSummary | null> {
  const parentResult = await q.query<{ id: string; amount: string }>(
    `SELECT id, amount::text AS amount
     FROM transactions WHERE user_id = $1 AND id = $2::uuid`,
    [userId, transactionId]
  );
  if (parentResult.rowCount !== 1) return null;
  const parentAmount = Number(parentResult.rows[0].amount);

  const result = await q.query<{
    id: string;
    transaction_id: string;
    category_id: string;
    category_name: string | null;
    amount: string;
    notes: string | null;
  }>(
    `SELECT s.id, s.transaction_id, s.category_id, c.name AS category_name,
            s.amount::text AS amount, s.notes
     FROM transaction_splits s
     LEFT JOIN categories c ON c.id = s.category_id
     WHERE s.user_id = $1 AND s.transaction_id = $2::uuid
     ORDER BY s.id`,
    [userId, transactionId]
  );

  const splits = result.rows.map((row) => ({ ...row, amount: Number(row.amount) }));
  const total = Math.round(splits.reduce((sum, s) => sum + s.amount, 0) * 100) / 100;
  return {
    splits,
    total_split: total,
    parent_amount: parentAmount,
    remaining: Math.round((parentAmount - total) * 100) / 100,
  };
}

/** Parent lookup with row lock so split mutations serialize per transaction. */
type LockedParent = { id: string; amount: number; transfer_group_id: string | null };

async function lockParent(
  q: Queryable,
  userId: number,
  transactionId: string
): Promise<LockedParent> {
  const result = await q.query<{
    id: string;
    amount: string;
    transfer_group_id: string | null;
  }>(
    `SELECT id, amount::text AS amount, transfer_group_id
     FROM transactions
     WHERE user_id = $1 AND id = $2::uuid
     FOR UPDATE`,
    [userId, transactionId]
  );
  if (result.rowCount !== 1) throw new Error("NOT_FOUND");
  const row = result.rows[0];
  return {
    id: row.id,
    amount: Number(row.amount),
    transfer_group_id: row.transfer_group_id,
  };
}

function assertNotTransfer(parent: LockedParent): void {
  if (parent.transfer_group_id) throw new Error("IS_TRANSFER");
}

/** Invariant: other splits + incoming must never exceed the parent amount. */
async function assertFitsWithinParent(
  q: Queryable,
  userId: number,
  transactionId: string,
  parentAmount: number,
  incomingAmount: number,
  excludeSplitId?: string
): Promise<void> {
  const result = await q.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS total
     FROM transaction_splits
     WHERE user_id = $1 AND transaction_id = $2::uuid
       AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [userId, transactionId, excludeSplitId ?? null]
  );
  const otherTotal = Number(result.rows[0]?.total ?? 0);
  if (
    Math.round((otherTotal + incomingAmount) * 100) / 100 >
    Math.round(parentAmount * 100) / 100
  ) {
    throw new Error("SUM_EXCEEDS_PARENT");
  }
}

export async function addSplit(
  q: Queryable,
  params: {
    userId: number;
    transactionId: string;
    categoryId: string;
    amount: number;
    notes: string | null;
  }
): Promise<string> {
  const parent = await lockParent(q, params.userId, params.transactionId);
  assertNotTransfer(parent);
  await assertFitsWithinParent(
    q, params.userId, params.transactionId, parent.amount, params.amount
  );

  try {
    const result = await q.query<{ id: string }>(
      `INSERT INTO transaction_splits
         (user_id, transaction_id, category_id, amount, notes)
       VALUES ($1, $2::uuid, $3::uuid, $4, $5)
       RETURNING id`,
      [
        params.userId, params.transactionId, params.categoryId,
        params.amount, params.notes,
      ]
    );
    return result.rows[0].id;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") throw new Error("DUPLICATE_CATEGORY");
    throw err;
  }
}

export async function updateSplit(
  q: Queryable,
  params: {
    userId: number;
    transactionId: string;
    splitId: string;
    categoryId: string;
    amount: number;
    notes: string | null;
  }
): Promise<boolean> {
  const parent = await lockParent(q, params.userId, params.transactionId);
  assertNotTransfer(parent);
  await assertFitsWithinParent(
    q, params.userId, params.transactionId, parent.amount, params.amount, params.splitId
  );

  try {
    const result = await q.query<{ id: string }>(
      `UPDATE transaction_splits SET category_id = $3::uuid, amount = $4,
              notes = COALESCE($5, notes), version = version + 1
       WHERE user_id = $1 AND transaction_id = $2::uuid AND id = $6::uuid`,
      [
        params.userId, params.transactionId, params.categoryId, params.amount,
        params.notes, params.splitId,
      ]
    );
    return result.rowCount === 1;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") throw new Error("DUPLICATE_CATEGORY");
    throw err;
  }
}

export async function deleteSplit(
  q: Queryable,
  userId: number,
  transactionId: string,
  splitId: string
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `DELETE FROM transaction_splits
     WHERE user_id = $1 AND transaction_id = $2::uuid AND id = $3::uuid`,
    [userId, transactionId, splitId]
  );
  return result.rowCount === 1;
}
