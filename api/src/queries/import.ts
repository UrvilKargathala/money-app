import { query } from "../db";
import { isoDate } from "../utils/format";
import type { Queryable } from "./notes";

const DB: Queryable = { query: query };

export type ImportBatchRow = {
  id: string;
  filename: string;
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  error_rows: number;
  status: "processing" | "completed" | "partial" | "failed";
  date_from: string | null;
  date_to: string | null;
  created_at: string;
};

type RawBatch = {
  id: string;
  filename: string;
  total_rows: number;
  imported_rows: number | null;
  duplicate_rows: number | null;
  error_rows: number | null;
  status: string;
  date_from: Date | null;
  date_to: Date | null;
  created_at: Date;
};

function mapBatch(row: RawBatch): ImportBatchRow {
  return {
    ...row,
    imported_rows: row.imported_rows ?? 0,
    duplicate_rows: row.duplicate_rows ?? 0,
    error_rows: row.error_rows ?? 0,
    status: row.status as ImportBatchRow["status"],
    date_from: row.date_from === null ? null : isoDate(row.date_from),
    date_to: row.date_to === null ? null : isoDate(row.date_to),
    created_at: row.created_at.toISOString(),
  };
}

export async function createImportBatch(
  q: Queryable,
  params: {
    userId: number;
    filename: string;
    totalRows: number;
    accountId: string | null;
  }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO import_batches (user_id, filename, total_rows, status, account_id)
     VALUES ($1, $2, $3, 'processing', $4::uuid) RETURNING id`,
    [params.userId, params.filename, params.totalRows, params.accountId]
  );
  return result.rows[0].id;
}

export async function getImportBatch(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<ImportBatchRow | null> {
  const result = await q.query<RawBatch>(
    `SELECT * FROM import_batches WHERE user_id = $1 AND id = $2::uuid`,
    [userId, id]
  );
  return result.rowCount === 1 ? mapBatch(result.rows[0]) : null;
}

export async function listImportBatches(
  userId: number,
  q: Queryable = DB
): Promise<ImportBatchRow[]> {
  const result = await q.query<RawBatch>(
    `SELECT * FROM import_batches WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return result.rows.map(mapBatch);
}

export async function finalizeImportBatch(
  q: Queryable,
  params: {
    userId: number;
    batchId: string;
    importedRows: number;
    duplicateRows: number;
    errorRows: number;
    dateFrom: string | null;
    dateTo: string | null;
  }
): Promise<ImportBatchRow["status"]> {
  const status =
    params.errorRows === 0 && params.duplicateRows === 0
      ? "completed"
      : params.importedRows > 0
        ? "partial"
        : "failed";
  await q.query(
    `UPDATE import_batches SET
       imported_rows = $3, duplicate_rows = $4, error_rows = $5,
       status = $6, date_from = $7::date, date_to = $8::date
     WHERE user_id = $1 AND id = $2::uuid`,
    [
      params.userId, params.batchId,
      params.importedRows, params.duplicateRows, params.errorRows,
      status, params.dateFrom, params.dateTo,
    ]
  );
  return status as ImportBatchRow["status"];
}

export type ImportErrorRow = {
  id: string;
  row_number: number;
  raw_data: string | null;
  error_reason: string;
};

export async function listImportErrors(
  userId: number,
  batchId: string,
  q: Queryable = DB
): Promise<ImportErrorRow[]> {
  const result = await q.query<ImportErrorRow>(
    `SELECT id, row_number, raw_data, error_reason
     FROM import_errors
     WHERE user_id = $1 AND import_batch_id = $2::uuid
     ORDER BY row_number LIMIT 1000`,
    [userId, batchId]
  );
  return result.rows;
}

/** Batched multi-row insert of error/duplicate rows via unnest. */
export async function insertImportErrors(
  q: Queryable,
  params: {
    userId: number;
    batchId: string;
    rows: { rowNumber: number; rawData: unknown; reason: string }[];
  }
): Promise<void> {
  if (params.rows.length === 0) return;
  await q.query(
    `INSERT INTO import_errors (user_id, import_batch_id, row_number, raw_data, error_reason)
     SELECT $1, $2::uuid, x.row_number, x.raw_data, x.reason
     FROM unnest(
       $3::int[], $4::jsonb[], $5::text[]
     ) AS x(row_number, raw_data, reason)`,
    [
      params.userId,
      params.batchId,
      params.rows.map((r) => r.rowNumber),
      params.rows.map((r) => JSON.stringify(r.rawData)),
      params.rows.map((r) => r.reason),
    ]
  );
}

export type PendingTxnInsert = {
  userId: number;
  accountId: string;
  type: "income" | "expense";
  amount: number;
  description: string | null;
  merchantClean: string | null;
  categoryId: string | null;
  date: string;
  batchId: string;
};

/**
 * Single-statement multi-row insert of validated drafts via jsonb_to_recordset
 * â€” no loops regardless of batch size.
 */
export async function insertImportedTransactions(
  q: Queryable,
  rows: PendingTxnInsert[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const payload = JSON.stringify(rows);
  const result = await q.query<{ id: string }>(
    `INSERT INTO transactions
       (user_id, account_id, type, amount, description, merchant_clean,
        category_id, date, source, import_batch_id, needs_review,
        created_by, updated_by)
     SELECT x."userId"::int, x."accountId"::uuid, x.type, x.amount,
            NULLIF(x.description, '') AS description,
            NULLIF(x."merchantClean", '') AS merchant_clean,
            x."categoryId"::uuid, x.date::date, 'import', x."batchId"::uuid, 1,
            x."userId"::int, x."userId"::int
     FROM jsonb_to_recordset($1::jsonb) AS x(
       "userId" int, "accountId" uuid, "batchId" text, type text, amount numeric,
       description text, "merchantClean" text, "categoryId" uuid, date date
     )
     RETURNING id`,
    [payload]
  );
  return result.rows.length;
}

/**
 * Duplicate detection: one query loads the user's existing hashes inside a
 * Â±370-day window around the batch's min/max draft dates.
 */
export async function loadDuplicateHashes(
  q: Queryable,
  params: {
    userId: number;
    minDate: string;
    maxDate: string;
  }
): Promise<Set<string>> {
  const result = await q.query<{
    date: Date;
    amount: string;
    description: string | null;
  }>(
    `SELECT date, amount::text AS amount, description
     FROM transactions
     WHERE user_id = $1 AND source <> 'recurring'
       AND date BETWEEN ($2::date - INTERVAL '370 days') AND ($3::date + INTERVAL '370 days')`,
    [params.userId, params.minDate, params.maxDate]
  );
  const set = new Set<string>();
  for (const row of result.rows) {
    const iso = isoDate(row.date);
    set.add(`${iso}|${Number(row.amount).toFixed(2)}|${(row.description ?? "").toLowerCase().trim()}`);
  }
  return set;
}

export function deleteImportErrors(q: Queryable, userId: number, ids: string[]) {
  return q.query<{ id: string; raw_data: string }>(
    `DELETE FROM import_errors
     WHERE user_id = $1 AND id = ANY($2::uuid[]) RETURNING id, raw_data`,
    [userId, ids]
  );
}

export async function getImportErrorsByIds(
  userId: number,
  ids: string[],
  q: Queryable = DB
): Promise<ImportErrorRow[]> {
  if (ids.length === 0) return [];
  const result = await q.query<ImportErrorRow>(
    `SELECT id, row_number, raw_data, error_reason
     FROM import_errors
     WHERE user_id = $1 AND id = ANY($2::uuid[])
     ORDER BY row_number`,
    [userId, ids]
  );
  return result.rows;
}

/** Moves N duplicate rows into the imported bucket after re-inserting them. */
export function shiftDuplicateToImported(
  q: Queryable,
  params: { userId: number; batchId: string; count: number }
) {
  return q.query(
    `UPDATE import_batches SET
       duplicate_rows = GREATEST(duplicate_rows - $3, 0),
       imported_rows = imported_rows + $3
     WHERE user_id = $1 AND id = $2::uuid`,
    [params.userId, params.batchId, params.count]
  );
}

export function skipDuplicatesAdjust(
  q: Queryable,
  params: { userId: number; batchId: string; count: number }
) {
  return q.query(
    `UPDATE import_batches SET duplicate_rows = GREATEST(duplicate_rows - $3, 0)
     WHERE user_id = $1 AND id = $2::uuid`,
    [params.userId, params.batchId, params.count]
  );
}

/** The batch's stored target account — set at confirm time. */
export async function getBatchAccount(
  userId: number,
  batchId: string,
  q: Queryable = DB
): Promise<string | null> {
  const result = await q.query<{ account_id: string | null }>(
    `SELECT account_id FROM import_batches
     WHERE user_id = $1 AND id = $2::uuid`,
    [userId, batchId]
  );
  return result.rows[0]?.account_id ?? null;
}

/** Loads the two transactions for a merge under row locks. */
export type MergeCandidate = {
  id: string;
  merchant_clean: string | null;
  category_id: string | null;
  notes: string | null;
};

export async function loadPairForMerge(
  q: Queryable,
  userId: number,
  ids: string[]
): Promise<MergeCandidate[] | null> {
  const result = await q.query<MergeCandidate>(
    `SELECT id, merchant_clean, category_id, notes
     FROM transactions
     WHERE user_id = $1 AND id = ANY($2::uuid[])
     ORDER BY array_position($2::uuid[], id)
     FOR UPDATE`,
    [userId, ids]
  );
  return result.rowCount === 2 ? result.rows : null;
}

/** Pulls non-null merchant/category/notes from the duplicate onto the keeper. */
export function applyMergeFields(
  q: Queryable,
  params: {
    userId: number;
    keepId: string;
    merchantClean: string | null;
    categoryId: string | null;
    notes: string | null;
  }
) {
  return q.query(
    `UPDATE transactions SET
       merchant_clean = COALESCE(merchant_clean, $3),
       category_id = COALESCE(category_id, $4::uuid),
       notes = COALESCE(notes, $5),
       updated_by = $1
     WHERE user_id = $1 AND id = $2::uuid`,
    [
      params.userId, params.keepId, params.merchantClean,
      params.categoryId, params.notes,
    ]
  );
}

export async function loadUserCategoryMap(
  userId: number,
  q: Queryable = DB
): Promise<Map<string, string>> {
  const result = await q.query<{ id: string; name: string }>(
    `SELECT id, name FROM categories WHERE user_id = $1`,
    [userId]
  );
  const map = new Map<string, string>();
  for (const row of result.rows) map.set(row.name.toLowerCase(), row.id);
  return map;
}

export async function findCategoryIdByName(
  userId: number,
  name: string,
  q: Queryable = DB
): Promise<string | null> {
  const result = await q.query<{ id: string }>(
    `SELECT id FROM categories WHERE user_id = $1 AND lower(name) = lower($2) LIMIT 1`,
    [userId, name]
  );
  return result.rows[0]?.id ?? null;
}
