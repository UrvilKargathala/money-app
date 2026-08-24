import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson } from "./helpers";
import { registerNoteAttachmentRoutes } from "./note-attachments";
import { csvEscape, isoDate } from "../utils/format";
import { NOTE_CATEGORIES } from "../constants";
import {
  getNoteAnyState,
  getNoteById,
  insertNote,
  listNoteCategories,
  listNotes,
  listTrash,
  purgeNote,
  renameCategory,
  restoreNote,
  setNotePinned,
  softDeleteNote,
  updateNoteContent,
  updateNoteMeta,
} from "../queries/notes";

const notes = new Hono();

registerNoteAttachmentRoutes(notes);

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

notes.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({
    notes: await listNotes(user.user_id, {
      category: c.req.query("category") || null,
      search: c.req.query("search") || null,
    }),
  });
});

notes.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const title = String(body.title ?? "").trim();
  const category = String(body.category ?? "") || "personal";
  const templateCode =
    body.template_code === undefined || body.template_code === null
      ? null
      : String(body.template_code);
  const dataEncrypted = String(body.data_encrypted ?? "");
  const dataIv = String(body.data_iv ?? "");

  const fieldErrors: Record<string, string> = {};
  if (title.length < 1) fieldErrors.title = "Please enter a note title.";
  if (title.length > 200) {
    fieldErrors.title = "Titles must be 200 characters or fewer.";
  }
  if (!dataEncrypted) {
    fieldErrors.data_encrypted = "Missing encrypted payload.";
  }
  if (!dataIv) fieldErrors.data_iv = "Missing encryption IV.";
  // FR-11.2 — template-based XOR freeform.
  if (templateCode !== null && typeof templateCode !== "string") {
    fieldErrors.template_code = "Invalid template.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const id = await withUser(user.user_id, (client) =>
      insertNote(client, {
        userId: user.user_id,
        title,
        category,
        templateCode,
        dataEncrypted,
        dataIv,
      })
    );
    return c.json({ success: true, note: { id } });
  } catch (err) {
    console.error("[api] create note failed:", err);
    return c.json(
      { error: "Could not save the note. Please try again." },
      500
    );
  }
});

notes.get("/trash", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ notes: await listTrash(user.user_id) });
});

notes.get("/categories", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({
    categories: await listNoteCategories(user.user_id, NOTE_CATEGORIES),
  });
});

/** FR-11.7 — batch rename in ONE statement. */
notes.patch("/categories", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const fromCategory = String(body.from_category ?? "").trim();
  const toCategory = String(body.to_category ?? "").trim();

  if (!fromCategory || !toCategory) {
    return c.json(
      { fieldErrors: { from_category: "Both source and target names are required." } },
      400
    );
  }
  if (fromCategory === toCategory) {
    return c.json(
      { fieldErrors: { to_category: "The new name is the same as the old one." } },
      400
    );
  }

  const result = await withUser(user.user_id, (client) =>
    renameCategory(client, {
      userId: user.user_id,
      fromCategory,
      toCategory,
    })
  );

  return c.json({ success: true, renamed_count: result.rowCount ?? 0 });
});

notes.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await listNotes(user.user_id, {});

  // Headers only — ciphertext never leaves the vault export path.
  const header = ["Title", "Category", "Template", "Pinned", "Updated"];
  const csvRows = rows.map((n) => [
    n.title,
    n.category,
    n.template_code ?? "",
    n.is_pinned === 1 ? "yes" : "no",
    n.updated_at.slice(0, 10),
  ]);
  const csv =
    "\uFEFF" +
    [header, ...csvRows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="secure-notes-${isoDate(new Date())}.csv"`,
    },
  });
});

notes.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const note = await getNoteById(user.user_id, c.req.param("id"));
  if (!note) return c.json({ error: "Not found" }, 404);
  return c.json({ note });
});

notes.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const title = body.title === undefined ? undefined : String(body.title).trim();
  const category = body.category === undefined ? undefined : String(body.category).trim();
  const version = Number(body.version ?? 1);

  const hasContent =
    body.data_encrypted !== undefined && body.data_iv !== undefined;

  if (title !== undefined && title.length < 1) {
    return c.json({ fieldErrors: { title: "Please enter a note title." } }, 400);
  }
  if (
    title === undefined &&
    category === undefined &&
    !hasContent
  ) {
    return c.json({ error: "Nothing to update." }, 400);
  }

  try {
    let ok: boolean;
    if (hasContent && title !== undefined) {
      // Full re-encrypt path (FR-11.3).
      const result = await withUser(user.user_id, (client) =>
        updateNoteContent(client, {
          userId: user.user_id,
          id,
          title,
          category: category ?? "",
          dataEncrypted: String(body.data_encrypted),
          dataIv: String(body.data_iv),
          version,
        })
      );
      ok = result.rowCount === 1;
    } else {
      // Metadata-only path — ciphertext untouched.
      const result = await withUser(user.user_id, (client) =>
        updateNoteMeta(client, {
          userId: user.user_id,
          id,
          title: title ?? null,
          category: category ?? null,
          version,
        })
      );
      ok = result.rowCount === 1;
    }

    if (!ok) {
      const live = await getNoteById(user.user_id, id);
      return c.json(
        live
          ? { error: "This note was modified elsewhere. Refresh and try again." }
          : { error: "Not found" },
        live ? 409 : 404
      );
    }
  } catch (err) {
    console.error("[api] update note failed:", err);
    return c.json(
      { error: "Could not update the note. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

notes.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    softDeleteNote(client, user.user_id, c.req.param("id"))
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ success: true });
});

notes.post("/:id/restore", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    restoreNote(client, user.user_id, c.req.param("id"))
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found or outside the 30-day window" }, 404);
  }
  return c.json({ success: true });
});

notes.delete("/:id/purge", requireAuth, async (c) => {
  const user = c.get("user");
  // Permanent: only trashed notes can be purged; attachments cascade via FK.
  const result = await withUser(user.user_id, (client) =>
    purgeNote(client, user.user_id, c.req.param("id"))
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ success: true });
});

for (const action of ["pin", "unpin"] as const) {
  notes.post(`/:id/${action}`, requireAuth, async (c) => {
    const user = c.get("user");
    const result = await withUser(user.user_id, (client) =>
      setNotePinned(client, {
        userId: user.user_id,
        id: c.req.param("id"),
        pinned: action === "pin" ? 1 : 0,
      })
    );
    if (result.rowCount !== 1) {
      const existing = await getNoteById(user.user_id, c.req.param("id"));
      if (!existing) return c.json({ error: "Not found" }, 404);
      return c.json(
        {
          error:
            action === "pin"
              ? "This note is already pinned."
              : "This note is not pinned.",
        },
        409
      );
    }
    return c.json({ success: true });
  });
}

export { notes };
