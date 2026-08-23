import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type ReportTemplateRow = {
  id: string;
  /** NULL = system template, visible to everyone. */
  user_id: number | null;
  name: string;
  chart_config: unknown;
  description: string | null;
  version: number;
};

function mapTemplate(row: ReportTemplateRow): ReportTemplateRow {
  return {
    ...row,
    chart_config:
      typeof row.chart_config === "string"
        ? JSON.parse(row.chart_config)
        : row.chart_config,
  };
}

/** System templates (user_id IS NULL) are readable by everyone. */
const TEMPLATE_SELECT = `
  SELECT id, user_id, name, chart_config, description, version
  FROM report_templates
`;

export async function listReportTemplates(
  userId: number,
  q: Queryable = DB
): Promise<ReportTemplateRow[]> {
  const result = await q.query<ReportTemplateRow>(
    `${TEMPLATE_SELECT}
     WHERE user_id IS NULL OR user_id = $1
     ORDER BY (user_id IS NULL), name`,
    [userId]
  );
  return result.rows.map(mapTemplate);
}

export async function getReportTemplate(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<ReportTemplateRow | null> {
  const result = await q.query<ReportTemplateRow>(
    `${TEMPLATE_SELECT}
     WHERE id = $2::uuid AND (user_id IS NULL OR user_id = $1)`,
    [userId, id]
  );
  return result.rowCount === 1 ? mapTemplate(result.rows[0]) : null;
}

/** Own-template lookup for mutating actions — system rows are never mutable. */
async function getOwnedTemplate(
  q: Queryable,
  userId: number,
  id: string
): Promise<ReportTemplateRow | null> {
  const result = await q.query<ReportTemplateRow>(
    `${TEMPLATE_SELECT}
     WHERE id = $2::uuid AND user_id = $1`,
    [userId, id]
  );
  return result.rowCount === 1 ? mapTemplate(result.rows[0]) : null;
}

export async function insertReportTemplate(
  q: Queryable,
  params: {
    userId: number;
    name: string;
    chartConfig: unknown;
    description: string | null;
  }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO report_templates (user_id, name, chart_config, description)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id`,
    [
      params.userId,
      params.name,
      JSON.stringify(params.chartConfig),
      params.description,
    ]
  );
  return result.rows[0].id;
}

export function updateReportTemplate(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    name: string | null;
    chartConfig: unknown | null;
    description: string | null;
    version: number;
  }
) {
  return q.query<{ id: string }>(
    `UPDATE report_templates SET
       name = COALESCE($3, name),
       chart_config = COALESCE($4::jsonb, chart_config),
       description = COALESCE($5, description),
       version = version + 1
     WHERE user_id = $1 AND id = $2::uuid AND version = $6
     RETURNING id`,
    [
      params.userId,
      params.id,
      params.name,
      params.chartConfig === null
        ? null
        : JSON.stringify(params.chartConfig),
      params.description,
      params.version,
    ]
  );
}

export function deleteReportTemplate(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `DELETE FROM report_templates WHERE user_id = $1 AND id = $2::uuid RETURNING id`,
    [userId, id]
  );
}

/** Duplicate keeps the same config under a fresh unique name (two flat queries, no probe loop). */
export async function duplicateReportTemplate(
  q: Queryable,
  userId: number,
  id: string
): Promise<string> {
  const source = await getOwnedTemplate(q, userId, id);
  if (!source) throw new Error("NOT_FOUND");

  const base = `Copy of ${source.name}`;
  // Escape LIKE metacharacters so user text can't widen the match.
  const likeEscaped = base.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const existing = await q.query<{ name: string }>(
    `SELECT name FROM report_templates
     WHERE user_id = $1 AND (name = $2 OR name LIKE $3 ESCAPE '\\')`,
    [userId, base, `${likeEscaped} (%)`]
  );

  let candidate = base;
  if ((existing.rowCount ?? 0) > 0) {
    let maxSuffix = existing.rows.reduce((max, row) => {
      const match = /\((\d+)\)$/.exec(row.name);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 1);
    candidate = `${base} (${++maxSuffix})`;
  }

  const result = await q.query<{ id: string }>(
    `INSERT INTO report_templates (user_id, name, chart_config, description)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id`,
    [userId, candidate, JSON.stringify(source.chart_config), source.description]
  );
  return result.rows[0].id;
}
