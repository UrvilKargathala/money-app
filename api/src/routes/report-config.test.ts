import { describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  createInvestment,
  fixtureDb,
  postAs,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

async function createTemplate(
  name: string,
  overrides: Record<string, unknown> = {}
): Promise<{ res: Awaited<ReturnType<typeof postAs>>; body: unknown }> {
  const res = await postAs(db.alice, "/api/report-templates", {
    name,
    chart_config: { type: "bar", metric: "expense", groupBy: "category" },
    description: "My layout",
    ...overrides,
  });
  let body: unknown = null;
  try {
    body = await res.clone().json();
  } catch {
    body = await res.text();
  }
  return { res, body };
}

describe("report templates CRUD", () => {
  it("creates with validation, lists user + system rows, patches with lock, deletes", async () => {
    // System template visible to everyone.
    await pool.query(
      `INSERT INTO report_templates (user_id, name, chart_config, description)
       VALUES (NULL, 'System Cashflow', '{"type":"line"}'::jsonb, 'Built-in')`
    );

    const bad = await createTemplate("x", { chart_config: "nope" });
    expect(bad.res.status).toBe(400);

    const created = await createTemplate("Monthly Overview");
    expect(created.res.status).toBe(200);
    const { id } = (created.body as { template: { id: string } }).template;

    const aliceList = (await (
      await requestAs(db.alice, "/api/report-templates")
    ).json()) as { templates: { name: string; user_id: number | null }[] };
    expect(aliceList.templates.map((t) => t.name).sort()).toEqual([
      "Monthly Overview",
      "System Cashflow",
    ]);
    const systemRow = aliceList.templates.find((t) => t.name === "System Cashflow")!;
    expect(systemRow.user_id).toBeNull();

    // Bob sees the system row only — never alice's.
    const bobList = (await (
      await requestAs(db.bob, "/api/report-templates")
    ).json()) as { templates: { name: string }[] };
    expect(bobList.templates.map((t) => t.name)).toEqual(["System Cashflow"]);

    // Duplicate name → 409.
    const dupe = await createTemplate("Monthly Overview");
    expect(dupe.res.status).toBe(409);

    const detail = await requestAs(db.alice, `/api/report-templates/${id}`);
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as {
      template: { name: string; version: number; chart_config: unknown };
    };
    expect(detailBody.template.version).toBe(1);
    expect(detailBody.template.chart_config).toEqual({
      type: "bar",
      metric: "expense",
      groupBy: "category",
    });

    const patch = await requestAs(db.alice, `/api/report-templates/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed", version: 1 }),
    });
    expect(patch.status).toBe(200);

    const stale = await requestAs(db.alice, `/api/report-templates/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "stale", version: 1 }),
    });
    expect(stale.status).toBe(409);

    const del = await requestAs(db.alice, `/api/report-templates/${id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);

    // System template can never be deleted by a user.
    const sysId = (
      (await (
        await requestAs(db.alice, "/api/report-templates")
      ).json()) as { templates: { id: string; name: string }[] }
    ).templates.find((t) => t.name === "System Cashflow")!.id;
    expect(
      (await requestAs(db.alice, `/api/report-templates/${sysId}`, { method: "DELETE" })).status
    ).toBe(404);
  });

  it("duplicates under a fresh unique name", async () => {
    const first = await createTemplate("Duplicatable");
    const id = (first.body as { template: { id: string } }).template.id;

    const dup = await postAs(db.alice, `/api/report-templates/${id}/duplicate`, {});
    expect(dup.status).toBe(200);

    const dup2 = await postAs(db.alice, `/api/report-templates/${id}/duplicate`, {});
    expect(dup2.status).toBe(200); // "(2)" suffix kicks in

    const list = (await (
      await requestAs(db.alice, "/api/report-templates")
    ).json()) as { templates: { name: string }[] };
    const names = list.templates.map((t) => t.name).sort();
    expect(names).toContain("Copy of Duplicatable");
    expect(names.some((n) => n === "Copy of Duplicatable (2)")).toBe(true);

    // Foreign/system ids are not duplicatable.
    expect(
      (
        await postAs(db.bob, `/api/report-templates/${id}/duplicate`, {})
      ).status
    ).toBe(404);
  });
});

describe("export-pdf job lifecycle and download", () => {
  it("creates a job, lists it, downloads a regenerated PDF", async () => {
    const create = await postAs(db.alice, "/api/reports/export-pdf", {
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    expect(create.status).toBe(200);
    const jobId = ((await create.json()) as { export: { id: string } }).export.id;

    const listed = (await (
      await requestAs(db.alice, "/api/report-exports")
    ).json()) as {
      exports: {
        id: string;
        file_type: string;
        date_range_start: string;
        date_range_end: string;
      }[];
    };
    expect(listed.exports).toHaveLength(1);
    expect(listed.exports[0].file_type).toBe("pdf");
    expect(listed.exports[0].date_range_start).toBe("2026-01-01");
    expect(listed.exports[0].date_range_end).toBe("2026-12-31");

    const download = await requestAs(
      db.alice,
      `/api/report-exports/${jobId}/download`
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/pdf");
    expect(download.headers.get("content-disposition")).toContain(".pdf");
    const bytes = Buffer.from(await download.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);

    // Validation errors.
    const badRange = await postAs(db.alice, "/api/reports/export-pdf", {
      start_date: "junk",
    });
    expect(badRange.status).toBe(400);
  });

  it("foreign export ids 404 on bob", async () => {
    const create = await postAs(db.alice, "/api/reports/export-pdf", {});
    const jobId = ((await create.json()) as { export: { id: string } }).export.id;
    expect(
      (await requestAs(db.bob, `/api/report-exports/${jobId}/download`)).status
    ).toBe(404);
    const bobList = (await (
      await requestAs(db.bob, "/api/report-exports")
    ).json()) as { exports: unknown[] };
    expect(bobList.exports).toEqual([]);
  });
});

describe("net-worth report and chart endpoints", () => {
  it("chart returns SVG; report returns PDF", async () => {
    const holdingId = await createInvestment(db.alice, {
      units: 100,
      buyPrice: 100,
      currentPrice: 120,
    });
    void holdingId;
    await postAs(db.alice, "/api/net-worth/snapshots/run", {});

    const chart = await requestAs(db.alice, "/api/net-worth/chart?range=1Y");
    expect(chart.status).toBe(200);
    expect(chart.headers.get("content-type")).toContain("image/svg+xml");
    const svg = await chart.text();
    expect(svg).toContain("<svg");
    expect(svg).toContain("Net worth trend");

    const report = await requestAs(db.alice, "/api/net-worth/report?range=1Y");
    expect(report.status).toBe(200);
    expect(report.headers.get("content-type")).toBe("application/pdf");
    const bytes = Buffer.from(await report.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
