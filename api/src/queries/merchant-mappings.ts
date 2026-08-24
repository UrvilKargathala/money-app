import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type MerchantMappingRow = {
  id: string;
  merchant_raw: string;
  merchant_clean: string | null;
  category_id: string | null;
  category_name: string | null;
  use_count: number;
  last_used_at: string | null;
  is_user_override: number;
};

export async function listMerchantMappings(
  userId: number,
  q: Queryable = DB
): Promise<MerchantMappingRow[]> {
  const result = await q.query<{
    id: string;
    merchant_raw: string;
    merchant_clean: string | null;
    category_id: string | null;
    category_name: string | null;
    use_count: string;
    last_used_at: Date | null;
    is_user_override: number;
  }>(
    `SELECT m.id, m.merchant_raw, m.merchant_clean, m.category_id,
            c.name AS category_name, m.use_count::text AS use_count,
            m.last_used_at, m.is_user_override
     FROM merchant_mappings m
     LEFT JOIN categories c ON c.id = m.category_id
     WHERE m.user_id = $1
     ORDER BY m.last_used_at DESC NULLS LAST, m.use_count DESC, m.merchant_raw`,
    [userId]
  );
  return result.rows.map((row) => ({
    ...row,
    use_count: Number(row.use_count),
    last_used_at: row.last_used_at === null ? null : row.last_used_at.toISOString(),
  }));
}

/**
 * Create-or-bump (FR-2.x): first sight inserts; repeat use increments the
 * counter. Explicit clean/category values mark a user override.
 * Returns { id, created } via the xmax trick.
 */
export async function upsertMerchantMapping(
  q: Queryable,
  params: {
    userId: number;
    merchantRaw: string;
    merchantClean?: string | null;
    categoryId?: string | null;
  }
): Promise<{ id: string; created: boolean }> {
  const result = await q.query<{ id: string; inserted: boolean }>(
    `INSERT INTO merchant_mappings
       (user_id, merchant_raw, merchant_clean, category_id, use_count,
        last_used_at, is_user_override)
     VALUES ($1, $2, $3::text, $4::uuid, 1, CURRENT_TIMESTAMP,
             CASE WHEN $3::text IS NOT NULL OR $4::uuid IS NOT NULL THEN 1 ELSE 0 END)
     ON CONFLICT (user_id, merchant_raw) DO UPDATE SET
       use_count = merchant_mappings.use_count + 1,
       last_used_at = CURRENT_TIMESTAMP,
       merchant_clean = COALESCE($3::text, merchant_mappings.merchant_clean),
       category_id = COALESCE($4::uuid, merchant_mappings.category_id),
       is_user_override = CASE
         WHEN $3::text IS NOT NULL OR $4::uuid IS NOT NULL THEN 1
         ELSE merchant_mappings.is_user_override END
     RETURNING id, (xmax = 0) AS inserted`,
    [
      params.userId,
      params.merchantRaw,
      params.merchantClean ?? null,
      params.categoryId ?? null,
    ]
  );
  return { id: result.rows[0].id, created: result.rows[0].inserted };
}

export function updateMerchantMapping(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    merchantClean: string | null;
    categoryId: string | null;
  }
) {
  return q.query<{ id: string }>(
    `UPDATE merchant_mappings SET
       merchant_clean = $3,
       category_id = $4::uuid,
       is_user_override = 1
     WHERE user_id = $1 AND id = $2::uuid
     RETURNING id`,
    [params.userId, params.id, params.merchantClean, params.categoryId]
  );
}
