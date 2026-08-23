import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type NoteTemplateRow = {
  template_code: string;
  name: string;
  description: string | null;
  fields: unknown;
  icon: string | null;
  sort_order: number;
};

export async function listNoteTemplates(q: Queryable = DB) {
  const result = await q.query<NoteTemplateRow>(
    `SELECT template_code, name, description, fields, icon, sort_order
     FROM note_templates ORDER BY sort_order`
  );
  return result.rows;
}

export async function getNoteTemplate(
  code: string,
  q: Queryable = DB
): Promise<NoteTemplateRow | null> {
  const result = await q.query<NoteTemplateRow>(
    `SELECT template_code, name, description, fields, icon, sort_order
     FROM note_templates WHERE template_code = $1`,
    [code]
  );
  return result.rowCount === 1 ? result.rows[0] : null;
}
