import { query } from "../db";
import { isoDate } from "../utils/format";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type SecureNoteRowRaw = {
  id: string;
  user_id: number;
  title: string;
  category: string;
  template_code: string | null;
  data_encrypted: string;
  data_iv: string;
  is_pinned: number;
  version: number;
  created_at: Date;
  updated_at: Date;
};

export type SecureNote = Omit<SecureNoteRowRaw, "created_at" | "updated_at"> & {
  created_at: string;
  updated_at: string;
};

function mapNote(row: SecureNoteRowRaw): SecureNote {
  return {
    ...row,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/**
 * One SELECT for the whole list — ciphertext payloads are included because
 * content search/decryption happens client-side (FR-11.11). Filters hit the
 * partial indexes (idx_notes_user / _category / _pinned / trgm on title).
 */
const NOTE_COLUMNS = `
  id, user_id, title, category, template_code,
  data_encrypted, data_iv, is_pinned, version, created_at, updated_at
`;

export async function listNotes(
  userId: number,
  filters: { category?: string | null; search?: string | null },
  q: Queryable = DB
): Promise<SecureNote[]> {
  const result = await q.query<SecureNoteRowRaw>(
    `SELECT ${NOTE_COLUMNS}
     FROM secure_notes
     WHERE user_id = $1 AND deleted_at IS NULL
       AND ($2::text IS NULL OR category = $2::text)
       AND ($3::text IS NULL OR title ILIKE '%' || $3::text || '%')
     ORDER BY is_pinned DESC, updated_at DESC`,
    [userId, filters.category ?? null, filters.search?.trim() || null]
  );
  return result.rows.map(mapNote);
}

export async function listTrash(
  userId: number,
  q: Queryable = DB
): Promise<SecureNote[]> {
  const result = await q.query<SecureNoteRowRaw>(
    `SELECT ${NOTE_COLUMNS}
     FROM secure_notes
     WHERE user_id = $1 AND deleted_at IS NOT NULL
       AND deleted_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
     ORDER BY updated_at DESC`,
    [userId]
  );
  return result.rows.map(mapNote);
}

export async function getNoteById(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<SecureNote | null> {
  const result = await q.query<SecureNoteRowRaw>(
    `SELECT ${NOTE_COLUMNS}
     FROM secure_notes WHERE user_id = $1 AND id = $2::uuid AND deleted_at IS NULL`,
    [userId, id]
  );
  return result.rowCount === 1 ? mapNote(result.rows[0]) : null;
}

/** Any note regardless of soft-delete state — used by restore/purge guards. */
export async function noteExistsAnyState(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `SELECT id FROM secure_notes WHERE user_id = $1 AND id = $2::uuid`,
    [userId, id]
  );
  return result.rowCount === 1;
}

export async function getNoteAnyState(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<SecureNote | null> {
  const result = await q.query<SecureNoteRowRaw>(
    `SELECT ${NOTE_COLUMNS}
     FROM secure_notes WHERE user_id = $1 AND id = $2::uuid`,
    [userId, id]
  );
  return result.rows.length === 1 ? mapNote(result.rows[0]) : null;
}

export async function insertNote(
  q: Queryable,
  params: {
    userId: number;
    title: string;
    category: string;
    templateCode: string | null;
    dataEncrypted: string;
    dataIv: string;
  }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO secure_notes
       (user_id, title, category, template_code, data_encrypted, data_iv, created_by, updated_by)
     VALUES ($1, $2, $3, $4::text, $5, $6, $1, $1)
     RETURNING id`,
    [
      params.userId, params.title, params.category,
      params.templateCode, params.dataEncrypted, params.dataIv,
    ]
  );
  return result.rows[0].id;
}

/** Full-content update; re-encryption bumps version via optimistic lock. */
export function updateNoteContent(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    title: string;
    category: string;
    dataEncrypted: string;
    dataIv: string;
    version: number;
  }
) {
  return q.query<{ id: string }>(
    `UPDATE secure_notes SET
       title = $3, category = $4, data_encrypted = $5, data_iv = $6,
       updated_by = $1, version = version + 1
     WHERE user_id = $1 AND id = $2::uuid AND deleted_at IS NULL AND version = $7
     RETURNING id`,
    [
      params.userId, params.id, params.title, params.category,
      params.dataEncrypted, params.dataIv, params.version,
    ]
  );
}

/** Metadata-only update (title/category) without touching ciphertext. */
export function updateNoteMeta(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    title: string | null;
    category: string | null;
    version: number;
  }
) {
  return q.query<{ id: string }>(
    `UPDATE secure_notes SET
       title = COALESCE($3, title),
       category = COALESCE($4, category),
       updated_by = $1,
       version = CASE WHEN $3 IS NOT NULL OR $4 IS NOT NULL THEN version + 1 ELSE version END
     WHERE user_id = $1 AND id = $2::uuid AND deleted_at IS NULL AND version = $5
     RETURNING id`,
    [params.userId, params.id, params.title, params.category, params.version]
  );
}

export function softDeleteNote(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `UPDATE secure_notes
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1, is_pinned = 0,
         version = version + 1
     WHERE user_id = $1 AND id = $2::uuid AND deleted_at IS NULL
     RETURNING id`,
    [userId, id]
  );
}

export function restoreNote(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `UPDATE secure_notes
     SET deleted_at = NULL, deleted_by = NULL, version = version + 1
     WHERE user_id = $1 AND id = $2::uuid AND deleted_at IS NOT NULL
       AND deleted_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
     RETURNING id`,
    [userId, id]
  );
}

export function purgeNote(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `DELETE FROM secure_notes
     WHERE user_id = $1 AND id = $2::uuid AND deleted_at IS NOT NULL
     RETURNING id`,
    [userId, id]
  );
}

export function setNotePinned(
  q: Queryable,
  params: { userId: number; id: string; pinned: number }
) {
  return q.query<{ id: string }>(
    `UPDATE secure_notes SET is_pinned = $3, version = version + 1
     WHERE user_id = $1 AND id = $2::uuid AND deleted_at IS NULL AND is_pinned <> $3
     RETURNING id`,
    [params.userId, params.id, params.pinned]
  );
}

/** FR-11.7 — one statement updates every note carrying the old category. */
export function renameCategory(
  q: Queryable,
  params: { userId: number; fromCategory: string; toCategory: string }
) {
  return q.query<{ id: string }>(
    `UPDATE secure_notes SET category = $3, updated_by = $1, version = version + 1
     WHERE user_id = $1 AND category = $2 AND deleted_at IS NULL`,
    [params.userId, params.fromCategory, params.toCategory]
  );
}

export type NoteCategoryRow = {
  name: string;
  count: number;
  seeded: boolean;
};

/** Distinct in-use categories + the seeded picker list (FR-11.6). */
export async function listNoteCategories(
  userId: number,
  seededCategories: readonly string[],
  q: Queryable = DB
): Promise<NoteCategoryRow[]> {
  const result = await q.query<{ category: string; count: string }>(
    `SELECT category, COUNT(*)::text AS count
     FROM secure_notes
     WHERE user_id = $1 AND deleted_at IS NULL
     GROUP BY category
     ORDER BY COUNT(*) DESC`,
    [userId]
  );
  const used = new Map(result.rows.map((r) => [r.category, Number(r.count)]));
  const rows: NoteCategoryRow[] = [];
  for (const seeded of seededCategories) {
    if (used.has(seeded)) continue;
    rows.push({ name: seeded, count: 0, seeded: true });
  }
  for (const [name, count] of used) {
    rows.push({ name, count, seeded: seededCategories.includes(name) });
  }
  // In-use first (by usage), then remaining seeded picks.
  return rows.sort((a, b) => b.count - a.count);
}
