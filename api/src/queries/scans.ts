import { query } from "../db";
import type { PoolClient } from "pg";
import type { ScanCandidate } from "../ocr/types";

export type Queryable = { query: typeof query } | PoolClient;

const DB: Queryable = { query };

function execFor(q: Queryable) {
  return (q as { query: typeof query }).query
    ? (q as { query: typeof query }).query.bind(q as { query: typeof query })
    : (q as PoolClient).query.bind(q as PoolClient);
}

export type ScanJobRow = {
  id: string;
  filename: string;
  status: string;
  total_cards: number;
  confirmed_count: number;
  account_id: string | null;
  created_at: Date;
};

export type ScanCardRow = {
  id: string;
  job_id: string;
  status: string;
  merchant: string | null;
  date: string | null;
  amount: string | null;
  currency: string;
  category_guess: string | null;
  category_id: string | null;
  tax_amount: string | null;
  utr: string | null;
  gstin: string | null;
  confidence: string | null;
  source_lines: string[];
  flags: string[];
};

export async function createScanJob(
  q: Queryable,
  params: { userId: number; filename: string; totalCards: number; accountId: string | null }
): Promise<string> {
  const exec = execFor(q);
  const res = await exec<{ id: string }>(
    `INSERT INTO scan_jobs (user_id, filename, status, total_cards, confirmed_count, account_id)
     VALUES ($1, $2, 'review', $3, 0, $4::uuid) RETURNING id::text AS id`,
    [params.userId, params.filename, params.totalCards, params.accountId]
  );
  return res.rows[0].id;
}

export async function insertScanCards(
  q: Queryable,
  jobId: string,
  userId: number,
  cards: ScanCandidate[]
): Promise<string[]> {
  if (cards.length === 0) return [];
  const exec = execFor(q);
  const res = await exec<{ id: string }>(
    `INSERT INTO scan_cards
       (job_id, user_id, status, merchant, date, amount, currency, category_guess,
        tax_amount, utr, gstin, confidence, source_lines, flags)
     SELECT $1::uuid, $2, 'review',
       NULLIF(x.merchant, ''), NULLIF(x.date, '')::date, NULLIF(x.amount, '')::numeric,
       x.currency, NULLIF(x.category_guess, ''),
       NULLIF(x.tax_amount, '')::numeric, NULLIF(x.utr, ''), NULLIF(x.gstin, ''),
       NULLIF(x.confidence, '')::numeric, x.source_lines::jsonb, x.flags::jsonb
     FROM jsonb_to_recordset($3::jsonb) AS x(
       merchant text, date text, amount text, currency text, category_guess text,
       tax_amount text, utr text, gstin text, confidence text,
       source_lines jsonb, flags jsonb
     ) RETURNING id::text AS id`,
    [
      jobId,
      userId,
      JSON.stringify(
        cards.map((c) => ({
          merchant: c.merchant ?? "",
          date: c.date ?? "",
          amount: c.amount !== null ? String(c.amount) : "",
          currency: c.currency,
          category_guess: c.categoryGuess ?? "",
          tax_amount: c.taxAmount !== null ? String(c.taxAmount) : "",
          utr: c.utr ?? "",
          gstin: c.gstin ?? "",
          confidence: String(c.confidence),
          source_lines: c.sourceLines,
          flags: c.flags,
        }))
      ),
    ]
  );
  return res.rows.map((r) => r.id);
}

export async function getScanJob(userId: number, jobId: string, q: Queryable = DB): Promise<ScanJobRow | null> {
  const exec = execFor(q);
  const res = await exec<ScanJobRow>(
    `SELECT id::text AS id, filename, status, total_cards, confirmed_count,
            account_id::text AS account_id, created_at
     FROM scan_jobs WHERE user_id = $1 AND id = $2::uuid`,
    [userId, jobId]
  );
  return res.rows[0] ?? null;
}

export async function listScanCards(userId: number, jobId: string, q: Queryable = DB): Promise<ScanCardRow[]> {
  const exec = execFor(q);
  const res = await exec<ScanCardRow>(
    `SELECT id::text AS id, job_id::text AS job_id, status,
            merchant, date::text AS date, amount::text AS amount, currency,
            category_guess, category_id::text AS category_id,
            tax_amount::text AS tax_amount, utr, gstin,
            confidence::text AS confidence, source_lines, flags
     FROM scan_cards WHERE user_id = $1 AND job_id = $2::uuid ORDER BY created_at, id`,
    [userId, jobId]
  );
  return res.rows.map((r) => ({
    ...r,
    source_lines: Array.isArray(r.source_lines) ? r.source_lines : [],
    flags: Array.isArray(r.flags) ? r.flags : [],
  }));
}

export async function updateScanCard(
  q: Queryable,
  params: {
    userId: number;
    cardId: string;
    merchant?: string | null;
    date?: string | null;
    amount?: number | null;
    categoryId?: string | null;
    status?: "review" | "ready";
  }
): Promise<boolean> {
  const exec = execFor(q);
  const sets: string[] = [];
  const values: unknown[] = [params.userId, params.cardId];
  let n = 3;
  if (params.merchant !== undefined) {
    sets.push(`merchant = $${n++}`);
    values.push(params.merchant);
  }
  if (params.date !== undefined) {
    sets.push(`date = $${n++}::date`);
    values.push(params.date);
  }
  if (params.amount !== undefined) {
    sets.push(`amount = $${n++}::numeric`);
    values.push(params.amount);
  }
  if (params.categoryId !== undefined) {
    sets.push(`category_id = $${n++}::uuid`);
    values.push(params.categoryId);
  }
  if (params.status !== undefined) {
    sets.push(`status = $${n++}`);
    values.push(params.status);
  }
  if (sets.length === 0) return false;
  const res = await exec(
    `UPDATE scan_cards SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND id = $2::uuid AND status IN ('review','ready')`,
    values
  );
  return (res.rowCount ?? 0) > 0;
}

export type ConfirmResult = { confirmed: number; duplicates: number };

export async function confirmScanCards(
  q: PoolClient,
  params: { userId: number; jobId: string; cardIds: string[]; accountId: string }
): Promise<ConfirmResult> {
  // Load cards (only review/ready ones are confirmable).
  const cardsRes = await q.query<{
    id: string;
    merchant: string | null;
    date: string;
    amount: string;
    category_id: string | null;
  }>(
    `SELECT id::text AS id, merchant, date::text AS date, amount::text AS amount,
            category_id::text AS category_id
     FROM scan_cards
     WHERE user_id = $1 AND job_id = $2::uuid AND id = ANY($3::uuid[]) AND status IN ('review','ready')`,
    [params.userId, params.jobId, params.cardIds]
  );
  if (cardsRes.rows.length === 0) return { confirmed: 0, duplicates: 0 };

  // Duplicate check mirrors the CSV import hash (date|amount|description).
  const { loadDuplicateHashes } = await import("./import");
  const { draftHash } = await import("../utils/csv");
  const dates = cardsRes.rows.map((r) => r.date).sort();
  const seen = await loadDuplicateHashes(q, {
    userId: params.userId,
    minDate: dates[0],
    maxDate: dates[dates.length - 1],
  });
  const fresh: typeof cardsRes.rows = [];
  let duplicates = 0;
  for (const row of cardsRes.rows) {
    const hash = draftHash({
      date: row.date,
      amount: Number(row.amount),
      type: "expense",
      description: row.merchant,
      merchant_clean: row.merchant,
      category_name: null,
    });
    if (seen.has(hash)) {
      duplicates += 1;
      continue;
    }
    seen.add(hash);
    fresh.push(row);
  }

  if (fresh.length > 0) {
    await q.query(
      `INSERT INTO transactions
         (user_id, account_id, type, amount, description, merchant_clean,
          category_id, date, source, needs_review, created_by, updated_by)
       SELECT $1, $2::uuid, 'expense', x.amount::numeric,
         NULLIF(x.merchant, ''), NULLIF(x.merchant, ''),
         NULLIF(x.category_id, '')::uuid, x.date::date,
         'scan', 1, $1, $1
       FROM jsonb_to_recordset($3::jsonb) AS x(merchant text, date text, amount text, category_id text)`,
      [
        params.userId,
        params.accountId,
        JSON.stringify(
          fresh.map((r) => ({
            merchant: r.merchant ?? "",
            date: r.date,
            amount: r.amount,
            category_id: r.category_id ?? "",
          }))
        ),
      ]
    );
    await q.query(
      `UPDATE scan_cards SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND job_id = $2::uuid AND id = ANY($3::uuid[])`,
      [params.userId, params.jobId, fresh.map((r) => r.id)]
    );
  }
  if (duplicates > 0) {
    await q.query(
      `UPDATE scan_cards SET status = 'discarded', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND job_id = $2::uuid AND status IN ('review','ready')
       AND id <> ALL($3::uuid[])`,
      [params.userId, params.jobId, fresh.map((r) => r.id)]
    );
  }

  const leftRes = await q.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM scan_cards WHERE user_id = $1 AND job_id = $2::uuid AND status IN ('review','ready')`,
    [params.userId, params.jobId]
  );
  const left = Number(leftRes.rows[0]?.n ?? 0);
  const confirmedRes = await q.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM scan_cards WHERE user_id = $1 AND job_id = $2::uuid AND status = 'confirmed'`,
    [params.userId, params.jobId]
  );
  await q.query(
    `UPDATE scan_jobs SET confirmed_count = $3, status = $4, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND id = $2::uuid`,
    [params.userId, params.jobId, Number(confirmedRes.rows[0]?.n ?? 0), left === 0 ? (duplicates > 0 ? "partial" : "confirmed") : "partial"]
  );
  return { confirmed: fresh.length, duplicates };
}

export async function discardScanJob(q: Queryable, userId: number, jobId: string): Promise<boolean> {
  const exec = execFor(q);
  const res = await exec(
    `UPDATE scan_jobs SET status = 'discarded', updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND id = $2::uuid AND status IN ('review','partial')`,
    [userId, jobId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function deleteScanCard(q: Queryable, userId: number, cardId: string): Promise<boolean> {
  const exec = execFor(q);
  const res = await exec(
    `DELETE FROM scan_cards WHERE user_id = $1 AND id = $2::uuid AND status IN ('review','ready')`,
    [userId, cardId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function countScansThisMonth(userId: number, q: Queryable = DB): Promise<number> {
  const exec = execFor(q);
  const res = await exec<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM scan_jobs
     WHERE user_id = $1 AND date_trunc('month', created_at) = date_trunc('month', CURRENT_TIMESTAMP)`,
    [userId]
  );
  return Number(res.rows[0]?.n ?? 0);
}

export async function getScanQuota(
  userId: number,
  q: Queryable = DB
): Promise<{ allowed: boolean; limit: number | null; plan: string }> {
  // Fail-open when the seed row is absent (fresh DB without billing seeds):
  // everyone may scan. Once seeded, free=5/mo, paid=NULL (unlimited).
  const { getEffectivePlan } = await import("./entitlements");
  const { code } = await getEffectivePlan(userId, q);
  const exec = execFor(q);
  const res = await exec<{ allowed: number; limit_value: string | null }>(
    `SELECT allowed, limit_value FROM plan_entitlements WHERE plan_code = $1 AND feature_key = 'scan_jobs'`,
    [code]
  );
  const row = res.rows[0];
  if (!row) return { allowed: true, limit: null, plan: code };
  return {
    allowed: row.allowed === 1,
    limit: row.limit_value != null ? Number(row.limit_value) : null,
    plan: code,
  };
}

export async function linkScanCardCategories(
  q: Queryable,
  userId: number,
  jobId: string,
  links: { cardId: string; categoryId: string | null }[]
): Promise<void> {
  const usable = links.filter((l) => l.categoryId);
  if (usable.length === 0) return;
  const exec = execFor(q);
  await exec(
    `UPDATE scan_cards AS sc SET category_id = x.category_id::uuid, updated_at = CURRENT_TIMESTAMP
     FROM unnest($3::uuid[], $4::uuid[]) AS x(card_id, category_id)
     WHERE sc.user_id = $1 AND sc.job_id = $2::uuid AND sc.id = x.card_id`,
    [userId, jobId, usable.map((l) => l.cardId), usable.map((l) => l.categoryId as string)]
  );
}

export async function resolveScanCategoryIds(
  q: Queryable,
  userId: number,
  names: (string | null)[]
): Promise<(string | null)[]> {
  const uniq = [...new Set(names.filter((n): n is string => !!n))];
  if (uniq.length === 0) return names.map(() => null);
  const exec = execFor(q);
  const res = await exec<{ id: string; name: string }>(
    `SELECT id::text AS id, name FROM categories
     WHERE (user_id = $1 OR user_id IS NULL) AND name = ANY($2::text[])`,
    [userId, uniq]
  );
  const map = new Map(res.rows.map((r) => [r.name.toLowerCase(), r.id]));
  return names.map((n) => (n ? (map.get(n.toLowerCase()) ?? null) : null));
}
