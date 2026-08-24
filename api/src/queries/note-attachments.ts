import { query } from "../db";
import type { Queryable } from "./notes";

const DB: Queryable = { query: query };

export type NoteAttachmentRow = {
  id: string;
  note_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
};

export async function listNoteAttachments(
  userId: number,
  noteId: string,
  q: Queryable = DB
): Promise<NoteAttachmentRow[]> {
  const result = await q.query<{
    id: string;
    note_id: string;
    file_name: string;
    file_path: string;
    file_type: string | null;
    file_size: number | null;
    created_at: Date;
  }>(
    `SELECT id, note_id, file_name, file_path, file_type, file_size, created_at
     FROM note_attachments
     WHERE user_id = $1 AND note_id = $2::uuid
     ORDER BY created_at DESC`,
    [userId, noteId]
  );
  return result.rows.map((row) => ({
    ...row,
    created_at: row.created_at.toISOString(),
  }));
}

export async function getNoteAttachment(
  userId: number,
  noteId: string,
  attachmentId: string,
  q: Queryable = DB
): Promise<NoteAttachmentRow | null> {
  const result = await q.query<{
    id: string;
    note_id: string;
    file_name: string;
    file_path: string;
    file_type: string | null;
    file_size: number | null;
    created_at: Date;
  }>(
    `SELECT id, note_id, file_name, file_path, file_type, file_size, created_at
     FROM note_attachments
     WHERE user_id = $1 AND note_id = $2::uuid AND id = $3::uuid`,
    [userId, noteId, attachmentId]
  );
  const row = result.rows[0];
  return row ? { ...row, created_at: row.created_at.toISOString() } : null;
}

export async function insertNoteAttachment(
  q: Queryable,
  params: {
    userId: number;
    noteId: string;
    fileName: string;
    filePath: string;
    fileType: string | null;
    fileSize: number;
  }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO note_attachments
       (user_id, note_id, file_name, file_path, file_type, file_size, is_encrypted)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, 1)
     RETURNING id`,
    [
      params.userId, params.noteId, params.fileName, params.filePath,
      params.fileType, params.fileSize,
    ]
  );
  return result.rows[0].id;
}

export function deleteNoteAttachment(
  q: Queryable,
  userId: number,
  noteId: string,
  attachmentId: string
) {
  return q.query<{ id: string; file_path: string }>(
    `DELETE FROM note_attachments
     WHERE user_id = $1 AND note_id = $2::uuid AND id = $3::uuid
     RETURNING id, file_path`,
    [userId, noteId, attachmentId]
  );
}
