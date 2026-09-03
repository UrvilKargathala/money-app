import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson, isUniqueViolation } from "./helpers";
import {
  deleteReportTemplate,
  duplicateReportTemplate,
  getReportTemplate,
  insertReportTemplate,
  listReportTemplates,
  updateReportTemplate,
} from "../queries/report-templates";
import { getEntitlement } from "../queries/entitlements";

const reportTemplates = new Hono();

function parseChartConfig(raw: unknown): Record<string, unknown> | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

reportTemplates.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ templates: await listReportTemplates(user.user_id) });
});

reportTemplates.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const repEnt = await getEntitlement(user.user_id, "reports_widgets");
  if (!repEnt.allowed) return c.json({ error: "plan_limit", feature: "reports_widgets", plan: repEnt.plan }, 403);
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const chartConfig = parseChartConfig(body.chart_config);
  const description = String(body.description ?? "").trim() || null;

  if (name.length < 2) {
    return c.json(
      { fieldErrors: { name: "Please enter a template name." } },
      400
    );
  }
  if (!chartConfig) {
    return c.json(
      { fieldErrors: { chart_config: "chart_config must be a JSON object." } },
      400
    );
  }

  try {
    const id = await withUser(user.user_id, (client) =>
      insertReportTemplate(client, {
        userId: user.user_id,
        name,
        chartConfig,
        description,
      })
    );
    return c.json({ success: true, template: { id } });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json(
        { error: "You already have a template with this name." },
        409
      );
    }
    console.error("[api] create report template failed:", err);
    return c.json(
      { error: "Could not create the template. Please try again." },
      500
    );
  }
});

reportTemplates.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const template = await getReportTemplate(user.user_id, c.req.param("id"));
  if (!template) return c.json({ error: "Not found" }, 404);
  return c.json({ template });
});

reportTemplates.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const name = body.name === undefined ? undefined : String(body.name).trim();
  const chartConfig =
    body.chart_config === undefined ? undefined : parseChartConfig(body.chart_config);
  const description =
    body.description === undefined ? undefined : String(body.description ?? "").trim() || null;
  const version = Number(body.version ?? 1);

  if (name !== undefined && name.length < 2) {
    return c.json({ fieldErrors: { name: "Please enter a template name." } }, 400);
  }
  if (chartConfig !== undefined && chartConfig === null && body.chart_config !== null) {
    return c.json(
      { fieldErrors: { chart_config: "chart_config must be a JSON object." } },
      400
    );
  }

  try {
    const result = await withUser(user.user_id, (client) =>
      updateReportTemplate(client, {
        userId: user.user_id,
        id,
        name: name ?? null,
        chartConfig:
          chartConfig === undefined ? null : (chartConfig as Record<string, unknown>),
        description: description ?? null,
        version,
      })
    );
    if (result.rowCount !== 1) {
      const existing = await getReportTemplate(user.user_id, id);
      return c.json(
        existing
          ? { error: "This template was modified elsewhere. Refresh and try again." }
          : { error: "Not found" },
        existing ? 409 : 404
      );
    }
  } catch (err) {
    console.error("[api] update report template failed:", err);
    return c.json(
      { error: "Could not update the template. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

reportTemplates.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  // System templates are never owned → the scoped delete misses them by design.
  const result = await withUser(user.user_id, (client) =>
    deleteReportTemplate(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

reportTemplates.post("/:id/duplicate", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  try {
    const newId = await withUser(user.user_id, (client) =>
      duplicateReportTemplate(client, user.user_id, id)
    );
    return c.json({ success: true, template: { id: newId } });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    console.error("[api] duplicate report template failed:", err);
    return c.json(
      { error: "Could not duplicate the template. Please try again." },
      500
    );
  }
});

export { reportTemplates };
