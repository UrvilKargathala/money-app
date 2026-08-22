import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson, isUniqueViolation } from "./helpers";
import { deleteTag, insertTag, listTags, updateTag } from "../queries/tags";

const tags = new Hono();

tags.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ tags: await listTags(user.user_id) });
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
      insertTag(client, { userId: user.user_id, name, color })
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
      updateTag(client, { userId: user.user_id, id, name, color, version })
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
    deleteTag(client, user.user_id, id)
  );
  if (result.rowCount === 0) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

export { tags };
