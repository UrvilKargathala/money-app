import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type NoteUserTemplate = {
  id: string;
  user_id: number;
  title: string;
  category: string;
  content: string;
  version: number;
};

export async function listNoteUserTemplates(
  userId: number,
  q: Queryable = DB
): Promise<NoteUserTemplate[]> {
  const result = await q.query<NoteUserTemplate>(
    `SELECT id, user_id, title, category, content, version
     FROM note_user_templates
     WHERE user_id = $1
     ORDER BY title ASC`,
    [userId]
  );
  return result.rows;
}

export async function getNoteUserTemplateById(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<NoteUserTemplate | null> {
  const result = await q.query<NoteUserTemplate>(
    `SELECT id, user_id, title, category, content, version
     FROM note_user_templates
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] ?? null;
}

export async function createNoteUserTemplate(
  params: { userId: number; title: string; category: string; content: string },
  q: Queryable = DB
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO note_user_templates (user_id, title, category, content, version)
     VALUES ($1, $2, $3, $4, 1)
     RETURNING id`,
    [params.userId, params.title, params.category, params.content]
  );
  return result.rows[0].id;
}

export async function updateNoteUserTemplate(
  params: {
    userId: number;
    id: string;
    title?: string;
    category?: string;
    content?: string;
    version: number;
  },
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query(
    `UPDATE note_user_templates
     SET title = COALESCE($3, title),
         category = COALESCE($4, category),
         content = COALESCE($5, content),
         updated_at = CURRENT_TIMESTAMP,
         version = version + 1
     WHERE user_id = $1 AND id = $2 AND version = $6`,
    [
      params.userId,
      params.id,
      params.title ?? null,
      params.category ?? null,
      params.content ?? null,
      params.version,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteNoteUserTemplate(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<boolean> {
  const result = await q.query(
    `DELETE FROM note_user_templates WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  return (result.rowCount ?? 0) > 0;
}
