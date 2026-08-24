import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson } from "./helpers";
import {
  listMerchantMappings,
  updateMerchantMapping,
  upsertMerchantMapping,
} from "../queries/merchant-mappings";

const merchantMappings = new Hono();

merchantMappings.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ mappings: await listMerchantMappings(user.user_id) });
});

merchantMappings.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const merchantRaw = String(body.merchant_raw ?? "").trim();
  const merchantClean =
    body.merchant_clean === undefined ? undefined : String(body.merchant_clean ?? "").trim() || null;
  const categoryId =
    body.category_id === undefined ? undefined : String(body.category_id ?? "") || null;

  if (!merchantRaw) {
    return c.json(
      { fieldErrors: { merchant_raw: "Please enter the raw merchant text." } },
      400
    );
  }

  try {
    const result = await withUser(user.user_id, (client) =>
      upsertMerchantMapping(client, {
        userId: user.user_id,
        merchantRaw,
        merchantClean,
        categoryId,
      })
    );
    return c.json({
      success: true,
      mapping: { id: result.id },
      created: result.created,
    });
  } catch (err) {
    console.error("[api] upsert merchant mapping failed:", err);
    return c.json(
      { error: "Could not save the mapping. Please try again." },
      500
    );
  }
});

merchantMappings.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const merchantClean =
    body.merchant_clean === undefined ? null : String(body.merchant_clean ?? "").trim() || null;
  const categoryId = body.category_id === undefined ? null : String(body.category_id ?? "") || null;

  if (merchantClean === null && categoryId === null) {
    return c.json({ error: "Nothing to update." }, 400);
  }

  const result = await withUser(user.user_id, (client) =>
    updateMerchantMapping(client, {
      userId: user.user_id,
      id,
      merchantClean,
      categoryId,
    })
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

export { merchantMappings };
