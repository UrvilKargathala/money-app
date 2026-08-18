import { Hono } from "hono";
import { query, withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson, isUniqueViolation } from "./helpers";

const tags = new Hono();

export type TagRow = {
  id: string;
  name: string;
  color: string | null;
  version: number;
};

tags.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await query<TagRow>(
    `SELECT id, name, color, version
     FROM tags WHERE user_id = $1
     ORDER BY name`,
    [user.user_id]
  );
  return c.json({ tags: result.rows });
});

tags.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const color = String(body.color ?? "").trim() || null;

  if (name.length < 1) {
    return c.json({ fieldErrors: { name: "Please enter a tag name." } }, 400);
  }

  try {
    await withUser(user.user_id, (client) =>
      client.query(
        `INSERT INTO tags (user_id, name, color)
         VALUES ($1, $2, $3)`,
        [user.user_id, name, color]
      )
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json({ error: "You already have a tag with this name." }, 409);
    }
    console.error("[api] create tag failed:", err);
    return c.json({ error: "Could not create the tag. Please try again." }, 500);
  }

  return c.json({ success: true });
});

tags.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const color = String(body.color ?? "").trim() || null;
  const version = Number(body.version ?? 1);

  if (name.length < 1) {
    return c.json({ fieldErrors: { name: "Please enter a tag name." } }, 400);
  }

  try {
    const result = await withUser(user.user_id, (client) =>
      client.query(
        `UPDATE tags
         SET name = $3, color = $4, version = version + 1
         WHERE user_id = $1 AND id = $2 AND version = $5`,
        [user.user_id, id, name, color, version]
      )
    );
    if (result.rowCount === 0) {
      return c.json(
        { error: "This tag was modified elsewhere. Refresh and try again." },
        409
      );
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json({ error: "You already have a tag with this name." }, 409);
    }
    console.error("[api] update tag failed:", err);
    return c.json({ error: "Could not update the tag. Please try again." }, 500);
  }

  return c.json({ success: true });
});

tags.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await withUser(user.user_id, (client) =>
    client.query(`DELETE FROM tags WHERE user_id = $1 AND id = $2`, [
      user.user_id,
      id,
    ])
  );
  if (result.rowCount === 0) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

export { tags };