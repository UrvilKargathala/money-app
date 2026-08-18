import { Hono } from "hono";
import { query, withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson, isUniqueViolation } from "./helpers";

const categories = new Hono();

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  is_system: number;
  version: number;
};

categories.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await query<CategoryRow>(
    `SELECT id, name, parent_id, color, icon, is_system, version
     FROM categories
     WHERE (user_id IS NULL AND is_system = 1) OR user_id = $1
     ORDER BY is_system DESC, sort_order, name`,
    [user.user_id]
  );
  return c.json({ categories: result.rows });
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
          const parent = await client.query<{ parent_id: string | null }>(
            `SELECT parent_id FROM categories
             WHERE id = $1 AND ((user_id IS NULL AND is_system = 1) OR user_id = $2)`,
            [parentId, user.user_id]
          );
          if (parent.rowCount !== 1) {
            throw new Error("INVALID_PARENT");
          }
          if (parent.rows[0].parent_id !== null) {
            throw new Error("PARENT_TOO_DEEP");
          }
        }

        const clash = await client.query<{ id: string }>(
          `SELECT id FROM categories
           WHERE name = $1 AND ((user_id IS NULL AND is_system = 1) OR user_id = $2)`,
          [name, user.user_id]
        );
        if ((clash.rowCount ?? 0) > 0) {
          throw new Error("DUPLICATE_NAME");
        }

        await client.query(
          `INSERT INTO categories (user_id, parent_id, name, is_system, color, icon, sort_order)
           VALUES ($1, $2, $3, 0, $4, $5, 100)`,
          [user.user_id, parentId, name, color, icon]
        );
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
      client.query(
        `UPDATE categories
         SET name = $3, color = $4, icon = $5, version = version + 1
         WHERE user_id = $1 AND id = $2 AND is_system = 0 AND version = $6`,
        [user.user_id, id, name, color, icon, version]
      )
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

  const counts = await query<{ txns: string; splits: string; budgets: string; subs: string }>(
    `SELECT
       (SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND category_id = $2)::text AS txns,
       (SELECT COUNT(*) FROM transaction_splits WHERE user_id = $1 AND category_id = $2)::text AS splits,
       (SELECT COUNT(*) FROM budgets WHERE user_id = $1 AND category_id = $2 AND deleted_at IS NULL)::text AS budgets,
       (SELECT COUNT(*) FROM subscriptions WHERE user_id = $1 AND category_id = $2)::text AS subs`,
    [user.user_id, id]
  );
  const usage = Number(counts.rows[0]?.txns ?? 0) +
    Number(counts.rows[0]?.splits ?? 0) +
    Number(counts.rows[0]?.budgets ?? 0) +
    Number(counts.rows[0]?.subs ?? 0);

  if (usage > 0) {
    return c.json(
      {
        error:
          "This category is used by transactions, splits, budgets or subscriptions, so it can't be deleted.",
      },
      409
    );
  }

  const result = await withUser(user.user_id, (client) =>
    client.query(
      `DELETE FROM categories WHERE user_id = $1 AND id = $2 AND is_system = 0`,
      [user.user_id, id]
    )
  );
  if (result.rowCount === 0) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

export { categories };