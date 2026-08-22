import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson, isUniqueViolation } from "./helpers";
import {
  deleteCategory,
  getCategoryParentId,
  getCategoryUsageCounts,
  categoryNameClashExists,
  insertCategory,
  listCategories,
  updateCategory,
} from "../queries/categories";

const categories = new Hono();

categories.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ categories: await listCategories(user.user_id) });
});

categories.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const parentId = String(body.parent_id ?? "") || null;
  const color = String(body.color ?? "").trim() || null;
  const icon = String(body.icon ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) {
    fieldErrors.name = "Please enter a category name.";
  }

  try {
    if (!fieldErrors.name) {
      await withUser(user.user_id, async (client) => {
        if (parentId) {
          const parent = await getCategoryParentId(client, parentId, user.user_id);
          if (!parent) {
            throw new Error("INVALID_PARENT");
          }
          if (parent.parent_id !== null) {
            throw new Error("PARENT_TOO_DEEP");
          }
        }

        if (await categoryNameClashExists(client, name, user.user_id)) {
          throw new Error("DUPLICATE_NAME");
        }

        await insertCategory(client, {
          userId: user.user_id,
          parentId,
          name,
          color,
          icon,
        });
      });
    }
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_PARENT") {
      return c.json(
        { fieldErrors: { parent_id: "This parent category doesn't exist." } },
        400
      );
    }
    if (err instanceof Error && err.message === "PARENT_TOO_DEEP") {
      return c.json(
        { fieldErrors: { parent_id: "Categories can only be two levels deep." } },
        400
      );
    }
    if (err instanceof Error && err.message === "DUPLICATE_NAME") {
      return c.json(
        { error: "You already have a category with this name." },
        409
      );
    }
    console.error("[api] create category failed:", err);
    return c.json(
      { error: "Could not create the category. Please try again." },
      500
    );
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  return c.json({ success: true });
});

categories.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const color = String(body.color ?? "").trim() || null;
  const icon = String(body.icon ?? "").trim() || null;
  const version = Number(body.version ?? 1);

  if (name.length < 2) {
    return c.json({ fieldErrors: { name: "Please enter a category name." } }, 400);
  }

  try {
    const result = await withUser(user.user_id, (client) =>
      updateCategory(client, {
        userId: user.user_id,
        id,
        name,
        color,
        icon,
        version,
      })
    );
    if (result.rowCount === 0) {
      return c.json(
        { error: "This category was modified elsewhere. Refresh and try again." },
        409
      );
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json(
        { error: "You already have a category with this name." },
        409
      );
    }
    console.error("[api] update category failed:", err);
    return c.json(
      { error: "Could not update the category. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

categories.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const usage = await getCategoryUsageCounts(user.user_id, id);
  if (
    usage.txns + usage.splits + usage.budgets + usage.subs > 0
  ) {
    return c.json(
      {
        error:
          "This category is used by transactions, splits, budgets or subscriptions, so it can't be deleted.",
      },
      409
    );
  }

  const result = await withUser(user.user_id, (client) =>
    deleteCategory(client, user.user_id, id)
  );
  if (result.rowCount === 0) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

export { categories };
