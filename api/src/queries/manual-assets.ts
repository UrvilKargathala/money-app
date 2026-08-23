import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export const MANUAL_ASSET_CATEGORIES = [
  "property",
  "vehicle",
  "gold",
  "other",
] as const;

export type ManualAssetRowRaw = {
  id: string;
  user_id: number;
  name: string;
  category: string | null;
  valuation: string;
  acquisition_date: string | null;
  depreciation_method: string | null;
  notes: string | null;
  version: number;
};

export type ManualAsset = Omit<
  ManualAssetRowRaw,
  "valuation" | "acquisition_date"
> & {
  valuation: number;
  acquisition_date: string | null;
};

function mapAsset(row: ManualAssetRowRaw): ManualAsset {
  return {
    ...row,
    valuation: Number(row.valuation),
    acquisition_date: row.acquisition_date,
  };
}

export async function listManualAssets(
  userId: number,
  category: string | null,
  q: Queryable = DB
): Promise<ManualAsset[]> {
  const result = await q.query<ManualAssetRowRaw>(
    `SELECT id, user_id, name, category, valuation::text AS valuation,
            acquisition_date::date::text AS acquisition_date,
            depreciation_method, notes, version
     FROM manual_assets
     WHERE user_id = $1 AND ($2::text IS NULL OR category = $2::text)
     ORDER BY valuation DESC, name`,
    [userId, category]
  );
  return result.rows.map(mapAsset);
}

export async function getManualAssetById(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<ManualAsset | null> {
  const result = await q.query<ManualAssetRowRaw>(
    `SELECT id, user_id, name, category, valuation::text AS valuation,
            acquisition_date::date::text AS acquisition_date,
            depreciation_method, notes, version
     FROM manual_assets WHERE user_id = $1 AND id = $2::uuid`,
    [userId, id]
  );
  return result.rowCount === 1 ? mapAsset(result.rows[0]) : null;
}

export function insertManualAsset(
  q: Queryable,
  params: {
    userId: number;
    name: string;
    category: string | null;
    valuation: number;
    acquisitionDate: string | null;
    depreciationMethod: string | null;
    notes: string | null;
  }
) {
  return q.query<{ id: string }>(
    `INSERT INTO manual_assets
       (user_id, name, category, valuation, acquisition_date,
        depreciation_method, notes)
     VALUES ($1, $2, $3::text, $4, $5::date, $6, $7)
     RETURNING id`,
    [
      params.userId, params.name, params.category, params.valuation,
      params.acquisitionDate, params.depreciationMethod, params.notes,
    ]
  );
}

/** Partial update with optimistic-lock version check. */
export function updateManualAsset(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    name: string | null;
    category: string | null;
    valuation: number | null;
    acquisitionDate: string | null;
    depreciationMethod: string | null;
    notes: string | null;
    version: number;
  }
) {
  return q.query<{ id: string }>(
    `UPDATE manual_assets SET
       name = COALESCE($3, name),
       category = COALESCE($4::text, category),
       valuation = COALESCE($5, valuation),
       acquisition_date = COALESCE($6::date, acquisition_date),
       depreciation_method = COALESCE($7, depreciation_method),
       notes = COALESCE($8, notes),
       version = version + 1
     WHERE user_id = $1 AND id = $2::uuid AND version = $9
     RETURNING id`,
    [
      params.userId, params.id, params.name, params.category, params.valuation,
      params.acquisitionDate, params.depreciationMethod, params.notes,
      params.version,
    ]
  );
}

export function deleteManualAsset(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `DELETE FROM manual_assets WHERE user_id = $1 AND id = $2::uuid RETURNING id`,
    [userId, id]
  );
}
