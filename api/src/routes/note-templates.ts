import { Hono } from "hono";
import { requireAuth } from "../middleware";
import {
  getNoteTemplate,
  listNoteTemplates,
} from "../queries/note-templates";

/** Global lookup (FR-11.8) — authed read-only, no user scoping. */
export function registerNoteTemplateRoutes(app: Hono): void {
  app.get("/api/note-templates", requireAuth, async (c) => {
    return c.json({ templates: await listNoteTemplates() });
  });

  app.get("/api/note-templates/:code", requireAuth, async (c) => {
    const template = await getNoteTemplate(c.req.param("code"));
    if (!template) return c.json({ error: "Not found" }, 404);
    return c.json({ template });
  });
}
