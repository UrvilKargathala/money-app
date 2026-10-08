import { Hono } from "hono";
import { requireAuth } from "../middleware";
import { globalSearch } from "../queries/search";

const search = new Hono();

search.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const term = (c.req.query("q") ?? "").trim();
  if (term.length < 2) return c.json({ results: [] });
  // Escape LIKE wildcards so q=% can't dump rows; each branch capped so one
  // huge table can't starve the others before the final LIMIT.
  const escaped = term.replace(/[\\%_]/g, (m) => `\\${m}`);

  const rows = await globalSearch(user.user_id, escaped);
  return c.json({ results: rows });
});

export { search };
