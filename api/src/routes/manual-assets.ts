import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";
import { csvEscape, isoDate } from "../utils/format";
import {
  MANUAL_ASSET_CATEGORIES,
  deleteManualAsset,
  getManualAssetById,
  insertManualAsset,
  listManualAssets,
  updateManualAsset,
} from "../queries/manual-assets";

const manualAssets = new Hono();

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

manualAssets.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const category = c.req.query("category") || null;
  if (category !== null &&
      !(MANUAL_ASSET_CATEGORIES as readonly string[]).includes(category)) {
    return c.json({ error: "Invalid category filter." }, 400);
  }
  return c.json({ assets: await listManualAssets(user.user_id, category) });
});

manualAssets.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const category = String(body.category ?? "") || null;
  const valuation = parseAmount(body.valuation);
  const acquisitionDate =
    body.acquisition_date === undefined
      ? null
      : String(body.acquisition_date ?? "") || null;
  const depreciationMethod = String(body.depreciation_method ?? "").trim() || null;
  const notes = String(body.notes ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) {
    fieldErrors.name = "Please enter the asset name.";
  }
  if (category !== null &&
      !(MANUAL_ASSET_CATEGORIES as readonly string[]).includes(category)) {
    fieldErrors.category = "Category must be property, vehicle, gold or other.";
  }
  if (valuation === null || valuation <= 0) {
    fieldErrors.valuation = "Enter a current valuation greater than zero.";
  }
  if (acquisitionDate !== null && !isValidDate(acquisitionDate)) {
    fieldErrors.acquisition_date = "Choose a valid acquisition date.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    await withUser(user.user_id, (client) =>
      insertManualAsset(client, {
        userId: user.user_id,
        name,
        category,
        valuation: valuation as number,
        acquisitionDate,
        depreciationMethod,
        notes,
      })
    );
  } catch (err) {
    console.error("[api] create manual asset failed:", err);
    return c.json(
      { error: "Could not save the asset. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

manualAssets.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await listManualAssets(user.user_id, null);

  const header = ["Name", "Category", "Valuation", "Acquired", "Depreciation", "Notes"];
  const csvRows = rows.map((a) => [
    a.name,
    a.category ?? "",
    a.valuation.toFixed(2),
    a.acquisition_date ?? "",
    a.depreciation_method ?? "",
    a.notes ?? "",
  ]);
  const csv =
    "\uFEFF" +
    [header, ...csvRows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="manual-assets-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
});

manualAssets.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const asset = await getManualAssetById(user.user_id, c.req.param("id"));
  if (!asset) return c.json({ error: "Not found" }, 404);
  return c.json({ asset });
});

manualAssets.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const name = body.name === undefined ? undefined : String(body.name).trim();
  const category = body.category === undefined ? undefined : String(body.category ?? "") || null;
  const valuation = body.valuation === undefined ? undefined : parseAmount(body.valuation);
  const acquisitionDate =
    body.acquisition_date === undefined ? undefined : String(body.acquisition_date ?? "") || null;
  const depreciationMethod =
    body.depreciation_method === undefined ? undefined : String(body.depreciation_method ?? "").trim() || null;
  const notes = body.notes === undefined ? undefined : String(body.notes ?? "").trim() || null;
  const version = Number(body.version ?? 1);

  const fieldErrors: Record<string, string> = {};
  if (name !== undefined && name.length < 2) {
    fieldErrors.name = "Please enter the asset name.";
  }
  if (category !== undefined && category !== null &&
      !(MANUAL_ASSET_CATEGORIES as readonly string[]).includes(category)) {
    fieldErrors.category = "Category must be property, vehicle, gold or other.";
  }
  if (valuation !== undefined && (valuation === null || valuation <= 0)) {
    fieldErrors.valuation = "Enter a current valuation greater than zero.";
  }
  if (acquisitionDate !== undefined && acquisitionDate !== null &&
      !isValidDate(acquisitionDate)) {
    fieldErrors.acquisition_date = "Choose a valid acquisition date.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const result = await withUser(user.user_id, (client) =>
      updateManualAsset(client, {
        userId: user.user_id,
        id,
        name: name ?? null,
        category: category === undefined ? null : category,
        valuation:
          valuation === undefined ? null : valuation,
        acquisitionDate: acquisitionDate === undefined ? null : acquisitionDate,
        depreciationMethod:
          depreciationMethod === undefined ? null : depreciationMethod,
        notes: notes === undefined ? null : notes,
        version,
      })
    );
    if (result.rowCount !== 1) {
      const existing = await getManualAssetById(user.user_id, id);
      return c.json(
        existing
          ? { error: "This asset was modified elsewhere. Refresh and try again." }
          : { error: "Not found" },
        existing ? 409 : 404
      );
    }
  } catch (err) {
    console.error("[api] update manual asset failed:", err);
    return c.json(
      { error: "Could not update the asset. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

manualAssets.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await withUser(user.user_id, (client) =>
    deleteManualAsset(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

export { manualAssets };
