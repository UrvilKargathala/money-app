import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type TagRow = {
  id: string;
  name: string;
  color: string | null;
  version: number;
};

export async function listTags(userId: number, q: Queryable = DB): Promise<TagRow[]> {
  const result = await q.query<TagRow>(
    `SELECT id, name, color, version
     FROM tags WHERE user_id = $1
     ORDER BY name`,
    [userId]
  );
  return result.rows;
}

export function insertTag(
  q: Queryable,
  params: { userId: number; name: string; color: string | null }
) {
  return q.query(
    `INSERT INTO tags (user_id, name, color)
     VALUES ($1, $2, $3)`,
    [params.userId, params.name, params.color]
  );
}

export function updateTag(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    name: string;
    color: string | null;
    version: number;
  }
) {
  return q.query(
    `UPDATE tags
     SET name = $3, color = $4, version = version + 1
     WHERE user_id = $1 AND id = $2 AND version = $5`,
    [params.userId, params.id, params.name, params.color, params.version]
  );
}

export function deleteTag(q: Queryable, userId: number, id: string) {
  return q.query(`DELETE FROM tags WHERE user_id = $1 AND id = $2`, [userId, id]);
}

export async function tagExistsForUser(
  q: Queryable,
  userId: number,
  tagId: string
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `SELECT id FROM tags WHERE user_id = $1 AND id = $2`,
    [userId, tagId]
  );
  return result.rowCount === 1;
}

