import JSZip from "jszip";
import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson } from "./helpers";
import { csvEscape, isoDate } from "../utils/format";
import { getEntitlement } from "../queries/entitlements";
import {
  createExportJob,
  deleteExportJob,
  getExportJob,
  getPipelineStatus,
  EXPORTABLE_MODULES,
  loadModuleData,
  listExportJobs,
  updateExportJobStatus,
  setExportJobRowCount,
  type ModuleDataRow,
} from "../queries/export";

const exportJobs = new Hono();

const uuidRe = /^[0-9a-f-]{36}$/i;

function toCsv(columns: { key: string; label: string }[], rows: ModuleDataRow[]): string {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(String(row[c.key] ?? ""))).join(",")
  );
  return "\uFEFF" + [header, ...lines].join("\r\n");
}

/** Generates CSV content for a single module export. */
async function generateModuleCsv(
  userId: number,
  moduleName: string,
  from: string | null,
  to: string | null
): Promise<{ csv: string; rowCount: number } | null> {
  const moduleDef = EXPORTABLE_MODULES.find((m) => m.name === moduleName);
  if (!moduleDef) return null;
  const rows = await loadModuleData(userId, moduleName, from, to);
  return { csv: toCsv(moduleDef.columns, rows), rowCount: rows.length };
}

/** Creates a new export job and synchronously generates the output. */
exportJobs.post("/jobs", requireAuth, async (c) => {
  const user = c.get("user");
  const batchEnt = await getEntitlement(user.user_id, "export_batch");
  if (!batchEnt.allowed || batchEnt.mode === "manual_csv") {
    return c.json({ error: "plan_limit", feature: "export_batch", plan: batchEnt.plan, mode: batchEnt.mode }, 403);
  }
  const body = await readJson(c);

  const exportType = String(body.export_type ?? "csv");
  const scope = String(body.scope ?? "module");
  const moduleName = body.module_name ? String(body.module_name) : null;
  const dateFrom =
    typeof body.date_range_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date_range_start)
      ? body.date_range_start
      : null;
  const dateTo =
    typeof body.date_range_end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date_range_end)
      ? body.date_range_end
      : null;

  if (!["csv", "pdf", "full_archive"].includes(exportType)) {
    return c.json({ fieldErrors: { export_type: "Type must be csv, pdf or full_archive." } }, 400);
  }
  if (!["module", "all"].includes(scope)) {
    return c.json({ fieldErrors: { scope: "Scope must be module or all." } }, 400);
  }
  if (scope === "module" && !moduleName) {
    return c.json({ fieldErrors: { module_name: "Module name is required for scoped exports." } }, 400);
  }
  if (moduleName && !EXPORTABLE_MODULES.some((m) => m.name === moduleName)) {
    return c.json(
      { fieldErrors: { module_name: `Unknown module. Available: ${EXPORTABLE_MODULES.map((m) => m.name).join(", ")}` } },
      400
    );
  }

  try {
    const jobId = await withUser(user.user_id, async (client) => {
      const fileType = exportType === "full_archive" ? "zip" : exportType;
      return createExportJob(client, {
        userId: user.user_id,
        exportType: exportType as "csv" | "pdf" | "full_archive",
        scope: scope as "module" | "all",
        moduleName,
        dateRangeStart: dateFrom,
        dateRangeEnd: dateTo,
        fileType,
      });
    });

    // Synchronous generation — store row_count in the job row.
    let rowCount = 0;
    if (exportType === "csv" && moduleName) {
      const generated = await generateModuleCsv(user.user_id, moduleName, dateFrom, dateTo);
      if (generated) rowCount = generated.rowCount;
    }

    await withUser(user.user_id, (client) => {
      setExportJobRowCount(client, { userId: user.user_id, jobId, rowCount });
      return Promise.resolve();
    });

    return c.json({ success: true, job: { id: jobId }, row_count: rowCount });
  } catch (err) {
    console.error("[api] create export job failed:", err);
    return c.json({ error: "Could not create the export job. Please try again." }, 500);
  }
});

exportJobs.get("/jobs", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ jobs: await listExportJobs(user.user_id) });
});

exportJobs.get("/modules", requireAuth, async (c) => {
  return c.json({
    modules: EXPORTABLE_MODULES.map((m) => ({
      name: m.name,
      label: m.label,
      columns: m.columns.map((c) => ({ key: c.key, label: c.label })),
    })),
  });
});

exportJobs.get("/status", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json(await getPipelineStatus(user.user_id));
});

// ---- :id-scoped routes (register AFTER static paths) ----

exportJobs.get("/jobs/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);
  const job = await getExportJob(user.user_id, id);
  if (!job) return c.json({ error: "Not found" }, 404);
  return c.json({ job });
});

exportJobs.get("/jobs/:id/progress", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);
  const job = await getExportJob(user.user_id, id);
  if (!job) return c.json({ error: "Not found" }, 404);

  const processed = job.status === "completed" || job.status === "failed" ? job.row_count ?? 0 : 0;
  return c.json({
    status: job.status,
    row_count: job.row_count ?? 0,
    processed_rows: processed,
    file_size_bytes: job.file_size,
    estimated_size_mb: job.row_count
      ? Math.round(((job.row_count * 120) / 1_048_576) * 100) / 100
      : null,
  });
});

/**
 * Regenerate-on-download: builds the CSV/zip deterministically from stored
 * params. For full_archive, produces a .zip with one CSV per module.
 */
exportJobs.get("/jobs/:id/download", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);

  const job = await getExportJob(user.user_id, id);
  if (!job) return c.json({ error: "Not found" }, 404);
  if (job.status === "failed") {
    return c.json({ error: "This export failed. Retry it first." }, 409);
  }

  try {
    if (job.export_type === "full_archive") {
      const zip = new JSZip();
      const manifest: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        user_id: user.user_id,
        modules: [] as string[],
      };
      const manifestModules: string[] = [];

      for (const mod of EXPORTABLE_MODULES) {
        const data = await loadModuleData(user.user_id, mod.name, job.date_range_start, job.date_range_end);
        zip.file(`${mod.name}.csv`, toCsv(mod.columns, data));
        manifestModules.push(mod.name);
      }
      manifest.modules = manifestModules;
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      return new Response(new Uint8Array(buffer), {
        headers: {
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="moneymind-full-archive-${isoDate(new Date())}.zip"`,
        },
      });
    }

    // Single-module CSV.
    if (!job.module_name) return c.json({ error: "No module specified." }, 400);
    const generated = await generateModuleCsv(
      user.user_id,
      job.module_name,
      job.date_range_start,
      job.date_range_end
    );
    if (!generated) return c.json({ error: "Unknown module." }, 400);

    return new Response(generated.csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${job.module_name}-export-${isoDate(new Date())}.csv"`,
      },
    });
  } catch (err) {
    console.error("[api] export download failed:", err);
    return c.json({ error: "Could not generate the export. Please try again." }, 500);
  }
});

exportJobs.post("/jobs/:id/retry", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);

  const job = await getExportJob(user.user_id, id);
  if (!job) return c.json({ error: "Not found" }, 404);
  if (job.status !== "failed") {
    return c.json({ error: "Only failed jobs can be retried." }, 409);
  }

  await withUser(user.user_id, (client) =>
    updateExportJobStatus(client, {
      userId: user.user_id,
      jobId: id,
      status: "completed",
      errorMessage: null,
    })
  );
  return c.json({ success: true });
});

exportJobs.delete("/jobs/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);

  const deleted = await withUser(user.user_id, (client) =>
    deleteExportJob(client, user.user_id, id)
  );
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

// ---- Full archive ----

exportJobs.post("/full-archive", requireAuth, async (c) => {
  const user = c.get("user");
  const archEnt = await getEntitlement(user.user_id, "export_batch");
  if (!archEnt.allowed || archEnt.mode === "manual_csv") {
    return c.json({ error: "plan_limit", feature: "export_batch", plan: archEnt.plan, mode: archEnt.mode }, 403);
  }

  try {
    const jobId = await withUser(user.user_id, (client) =>
      createExportJob(client, {
        userId: user.user_id,
        exportType: "full_archive",
        scope: "all",
        moduleName: null,
        dateRangeStart: null,
        dateRangeEnd: null,
        fileType: "zip",
      })
    );
    return c.json({ success: true, job: { id: jobId } });
  } catch (err) {
    console.error("[api] create full archive failed:", err);
    return c.json(
      { error: "Could not create the archive. Please try again." },
      500
    );
  }
});

export { exportJobs };
