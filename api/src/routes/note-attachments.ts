import type { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import {
  deleteNoteAttachment,
  getNoteAttachment,
  insertNoteAttachment,
  listNoteAttachments,
} from "../queries/note-attachments";
import { getNoteById } from "../queries/notes";
import { getObjectStorage } from "../utils/object-storage";

/** Client-encrypted ciphertext only — 5MB cap on the encrypted blob. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Registers attachment sub-resources on the notes router (R4 nesting):
 *   GET    /api/notes/:id/attachments
 *   POST   /api/notes/:id/attachments
 *   GET    /api/notes/:id/attachments/:attachmentId
 *   GET    /api/notes/:id/attachments/:attachmentId/preview
 *   DELETE /api/notes/:id/attachments/:attachmentId
 */
export function registerNoteAttachmentRoutes(notes: Hono): void {
  notes.get("/:id/attachments", requireAuth, async (c) => {
    const user = c.get("user");
    const noteId = c.req.param("id");
    if (!(await getNoteById(user.user_id, noteId))) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({
      attachments: await listNoteAttachments(user.user_id, noteId),
    });
  });

  notes.post("/:id/attachments", requireAuth, async (c) => {
    const user = c.get("user");
    const noteId = c.req.param("id");

    if (!(await getNoteById(user.user_id, noteId))) {
      return c.json({ error: "Not found" }, 404);
    }

    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength === 0) {
      return c.json({ error: "Empty upload." }, 400);
    }
    if (bytes.byteLength > MAX_BYTES) {
      return c.json(
        { error: "Encrypted files must be 5MB or smaller." },
        400
      );
    }

    const fileName =
      c.req.query("name")?.slice(0, 200) || "attachment.bin";
    const fileType = c.req.query("type")?.slice(0, 100) || null;

    try {
      const storage = getObjectStorage();
      const stored = await storage.put(
        `notes/${user.user_id}/${noteId}/${globalThis.crypto.randomUUID()}`,
        bytes
      );
      const attachmentId = await withUser(user.user_id, (client) =>
        insertNoteAttachment(client, {
          userId: user.user_id,
          noteId,
          fileName,
          filePath: stored.path,
          fileType,
          fileSize: bytes.byteLength,
        })
      );
      return c.json({ success: true, attachment: { id: attachmentId } });
    } catch (err) {
      console.error("[api] attachment upload failed:", err);
      return c.json(
        { error: "Could not store the attachment. Please try again." },
        500
      );
    }
  });

  async function loadAttachmentBytes(
    userId: number,
    noteId: string,
    attachmentId: string
  ): Promise<{
    row: NonNullable<Awaited<ReturnType<typeof getNoteAttachment>>>;
    bytes: Uint8Array;
  } | null> {
    const row = await getNoteAttachment(userId, noteId, attachmentId);
    if (!row) return null;
    const bytes = await getObjectStorage().get(row.file_path);
    return { row, bytes };
  }

  notes.get("/:id/attachments/:attachmentId", requireAuth, async (c) => {
    const user = c.get("user");
    try {
      const found = await loadAttachmentBytes(
        user.user_id,
        c.req.param("id"),
        c.req.param("attachmentId")
      );
      if (!found) return c.json({ error: "Not found" }, 404);
      // Ciphertext only — decryption happens client-side (FR-11.16).
      return new Response(new Uint8Array(found.bytes), {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="${found.row.file_name}"`,
        },
      });
    } catch (err) {
      console.error("[api] attachment download failed:", err);
      return c.json({ error: "Could not fetch the attachment." }, 500);
    }
  });

  notes.get(
    "/:id/attachments/:attachmentId/preview",
    requireAuth,
    async (c) => {
      const user = c.get("user");
      try {
        const found = await loadAttachmentBytes(
          user.user_id,
          c.req.param("id"),
          c.req.param("attachmentId")
        );
        if (!found) return c.json({ error: "Not found" }, 404);
        return new Response(new Uint8Array(found.bytes), {
          headers: {
            "content-type": "application/octet-stream",
            "content-disposition": `inline; filename="${found.row.file_name}"`,
          },
        });
      } catch (err) {
        console.error("[api] attachment preview failed:", err);
        return c.json({ error: "Could not fetch the attachment." }, 500);
      }
    }
  );

  notes.delete("/:id/attachments/:attachmentId", requireAuth, async (c) => {
    const user = c.get("user");
    try {
      let filePath: string | null = null;
      await withUser(user.user_id, async (client) => {
        const result = await deleteNoteAttachment(
          client,
          user.user_id,
          c.req.param("id"),
          c.req.param("attachmentId")
        );
        if (result.rowCount === 1) filePath = result.rows[0].file_path;
      });
      if (filePath === null) return c.json({ error: "Not found" }, 404);

      // Row is gone; blob cleanup is best-effort (orphans are harmless).
      await getObjectStorage()
        .delete(filePath)
        .catch(() => {});
      return c.json({ success: true });
    } catch (err) {
      console.error("[api] attachment delete failed:", err);
      return c.json(
        { error: "Could not remove the attachment. Please try again." },
        500
      );
    }
  });
}
