import { query } from "../db";
import { isoDate } from "../utils/format";

export type Queryable = { query: typeof query };

const DB: Queryable = { query: query };

export type ExportJobRow = {
  id: string;
  export_type: "csv" | "pdf" | "full_archive";
  scope: "module" | "all";
  module_name: string | null;
  date_range_start: string | null;
  date_range_end: string | null;
  status: "queued" | "processing" | "completed" | "failed";
  file_type: string | null;
  row_count: number | null;
  file_size: number | null;
  error_message: string | null;
  created_at: string;
};

type RawJob = {
  id: string;
  export_type: string;
  scope: string;
  module_name: string | null;
  date_range_start: Date | null;
  date_range_end: Date | null;
  status: string;
  file_path: string | null;
  file_type: string | null;
  row_count: number | null;
  file_size: number | null;
  error_message: string | null;
  created_at: Date;
};

function mapJob(row: RawJob): ExportJobRow {
  return {
    ...row,
    export_type: row.export_type as ExportJobRow["export_type"],
    scope: row.scope as ExportJobRow["scope"],
    status: row.status as ExportJobRow["status"],
    date_range_start:
      row.date_range_start === null ? null : isoDate(row.date_range_start),
    date_range_end: row.date_range_end === null ? null : isoDate(row.date_range_end),
    created_at: row.created_at.toISOString(),
  };
}

export async function createExportJob(
  q: Queryable,
  params: {
    userId: number;
    exportType: "csv" | "pdf" | "full_archive";
    scope: "module" | "all";
    moduleName: string | null;
    dateRangeStart: string | null;
    dateRangeEnd: string | null;
    fileType: string;
  }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO data_export_jobs
       (user_id, export_type, scope, module_name, date_range_start,
        date_range_end, status, file_type)
     VALUES ($1, $2, $3, $4, $5::date, $6::date, 'completed', $7)
     RETURNING id`,
    [
      params.userId, params.exportType, params.scope, params.moduleName,
      params.dateRangeStart, params.dateRangeEnd, params.fileType,
    ]
  );
  return result.rows[0].id;
}

export async function getExportJob(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<ExportJobRow | null> {
  const result = await q.query<RawJob>(
    `SELECT * FROM data_export_jobs WHERE user_id = $1 AND id = $2::uuid`,
    [userId, id]
  );
  return result.rowCount === 1 ? mapJob(result.rows[0]) : null;
}

export async function listExportJobs(
  userId: number,
  q: Queryable = DB
): Promise<ExportJobRow[]> {
  const result = await q.query<RawJob>(
    `SELECT * FROM data_export_jobs WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return result.rows.map(mapJob);
}

export async function updateExportJobStatus(
  q: Queryable,
  params: {
    userId: number;
    jobId: string;
    status: string;
    errorMessage?: string | null;
  }
): Promise<void> {
  await q.query(
    `UPDATE data_export_jobs SET status = $3, error_message = COALESCE($4, error_message)
     WHERE user_id = $1 AND id = $2::uuid`,
    [params.userId, params.jobId, params.status, params.errorMessage ?? null]
  );
}

export async function deleteExportJob(
  q: Queryable,
  userId: number,
  id: string
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `DELETE FROM data_export_jobs WHERE user_id = $1 AND id = $2::uuid RETURNING id`,
    [userId, id]
  );
  return result.rowCount === 1;
}

// ---------------------------------------------------------------------------
// Module data loaders — each returns rows for CSV generation
// ---------------------------------------------------------------------------

export type ExportableModule = {
  name: string;
  label: string;
  columns: { key: string; label: string }[];
};

export const EXPORTABLE_MODULES: readonly ExportableModule[] = [
  {
    name: "transactions", label: "Transactions",
    columns: [
      { key: "date", label: "Date" }, { key: "type", label: "Type" },
      { key: "description", label: "Description" }, { key: "amount", label: "Amount" },
      { key: "category_name", label: "Category" }, { key: "account_name", label: "Account" },
      { key: "notes", label: "Notes" },
    ],
  },
  {
    name: "accounts", label: "Accounts",
    columns: [
      { key: "name", label: "Name" }, { key: "type", label: "Type" },
      { key: "institution", label: "Institution" }, { key: "balance", label: "Balance" },
      { key: "is_active_label", label: "Status" },
    ],
  },
  {
    name: "budgets", label: "Budgets",
    columns: [
      { key: "month", label: "Month" }, { key: "year", label: "Year" },
      { key: "category_name", label: "Category" }, { key: "amount", label: "Amount" },
      { key: "spent", label: "Spent" }, { key: "remaining", label: "Remaining" },
    ],
  },
  {
    name: "bills", label: "Bills",
    columns: [
      { key: "name", label: "Name" }, { key: "amount", label: "Amount" },
      { key: "due_day", label: "Due Day" }, { key: "frequency", label: "Frequency" },
      { key: "current_period_status", label: "Status" },
    ],
  },
  {
    name: "subscriptions", label: "Subscriptions",
    columns: [
      { key: "service_name", label: "Service" }, { key: "amount", label: "Amount" },
      { key: "frequency", label: "Frequency" }, { key: "next_renewal_date", label: "Next Renewal" },
      { key: "status", label: "Status" },
    ],
  },
  {
    name: "goals", label: "Goals",
    columns: [
      { key: "name", label: "Name" }, { key: "target_amount", label: "Target" },
      { key: "current_amount", label: "Current" }, { key: "target_date", label: "Target Date" },
      { key: "status", label: "Status" },
    ],
  },
  {
    name: "debts", label: "Debts",
    columns: [
      { key: "name", label: "Name" }, { key: "principal_outstanding", label: "Outstanding" },
      { key: "interest_rate", label: "Rate %" }, { key: "emi_amount", label: "EMI" },
      { key: "is_active_label", label: "Active" },
    ],
  },
  {
    name: "investments", label: "Investments",
    columns: [
      { key: "name", label: "Name" }, { key: "type", label: "Type" },
      { key: "units", label: "Units" }, { key: "invested_value", label: "Invested" },
      { key: "current_value", label: "Current Value" },
    ],
  },
] as const;

export type ModuleDataRow = Record<string, string | number | null>;

/** Loads all rows for a given exportable module within a date range. */
export async function loadModuleData(
  userId: number,
  moduleName: string,
  from: string | null,
  to: string | null,
  q: Queryable = DB
): Promise<ModuleDataRow[]> {
  switch (moduleName) {
    case "transactions": {
      const result = await q.query<ModuleDataRow>(
        `SELECT t.date::date::text AS date, t.type, COALESCE(t.description,'') AS description,
                t.amount::text AS amount, COALESCE(c.name,'') AS category_name,
                COALESCE(a.name,'') AS account_name, COALESCE(t.notes,'') AS notes
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         LEFT JOIN accounts a ON a.id = t.account_id
         WHERE t.user_id = $1
           AND ($2::date IS NULL OR t.date >= $2::date)
           AND ($3::date IS NULL OR t.date <= $3::date)
         ORDER BY t.date DESC`,
        [userId, from, to]
      );
      return result.rows;
    }
    case "accounts": {
      const result = await q.query<ModuleDataRow>(
        `SELECT a.name, a.type, COALESCE(a.institution,'') AS institution,
                (a.opening_balance + COALESCE(SUM(CASE
                  WHEN t.type='income' THEN t.amount WHEN t.type='expense' THEN -t.amount
                  ELSE 0 END),0))::text AS balance,
                CASE WHEN a.is_active = 1 THEN 'Active' ELSE 'Deactivated' END AS is_active_label
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id
         WHERE a.user_id = $1
         GROUP BY a.id ORDER BY a.name`,
        [userId]
      );
      return result.rows;
    }
    case "budgets": {
      const result = await q.query<ModuleDataRow>(
        `SELECT b.month, b.year, COALESCE(c.name,'Overall') AS category_name,
                b.amount::text AS amount,
                COALESCE((SELECT SUM(t.amount) FROM transactions t
                  WHERE t.user_id = b.user_id AND t.category_id = b.category_id
                    AND EXTRACT(YEAR FROM t.date) = b.year
                    AND EXTRACT(MONTH FROM t.date) = b.month AND t.type = 'expense'
                ),0)::text AS spent,
                (b.amount - COALESCE((SELECT SUM(t.amount) FROM transactions t
                  WHERE t.user_id = b.user_id AND t.category_id = b.category_id
                    AND EXTRACT(YEAR FROM t.date) = b.year
                    AND EXTRACT(MONTH FROM t.date) = b.month AND t.type = 'expense'
                ),0))::text AS remaining
         FROM budgets b
         LEFT JOIN categories c ON c.id = b.category_id
         WHERE b.user_id = $1 AND b.deleted_at IS NULL
         ORDER BY b.year DESC, b.month DESC`,
        [userId]
      );
      return result.rows;
    }
    case "bills": {
      const result = await q.query<ModuleDataRow>(
        `SELECT name, amount::text AS amount, due_day, frequency, current_period_status
         FROM bills WHERE user_id = $1 AND is_active = 1 ORDER BY due_day, name`,
        [userId]
      );
      return result.rows;
    }
    case "subscriptions": {
      const result = await q.query<ModuleDataRow>(
        `SELECT service_name, amount::text AS amount, frequency,
                next_renewal_date::date::text AS next_renewal_date, status
         FROM subscriptions WHERE user_id = $1 ORDER BY next_renewal_date`,
        [userId]
      );
      return result.rows;
    }
    case "goals": {
      const result = await q.query<ModuleDataRow>(
        `SELECT g.name, g.target::text AS target_amount,
                COALESCE((SELECT SUM(amount) FROM goal_contributions gc
                  WHERE gc.goal_id = g.id AND gc.user_id = g.user_id),0)::text AS current_amount,
                g.target_date::date::text AS target_date, g.status
         FROM goals g WHERE g.user_id = $1 ORDER BY g.target_date`,
        [userId]
      );
      return result.rows;
    }
    case "debts": {
      const result = await q.query<ModuleDataRow>(
        `SELECT name, principal_outstanding::text AS principal_outstanding,
                interest_rate::text AS interest_rate, emi_amount::text AS emi_amount,
                CASE WHEN is_active = 1 THEN 'Yes' ELSE 'No' END AS is_active_label
         FROM debts WHERE user_id = $1 ORDER BY principal_outstanding DESC`,
        [userId]
      );
      return result.rows;
    }
    case "investments": {
      const result = await q.query<ModuleDataRow>(
        `SELECT name, type, units::text AS units,
                invested_value::text AS invested_value, current_value::text AS current_value
         FROM investments WHERE user_id = $1 AND is_active = 1 ORDER BY name`,
        [userId]
      );
      return result.rows;
    }
    default:
      return [];
  }
}

/** Pipeline health: counts by status for the requesting user. */
export async function getPipelineStatus(
  userId: number,
  q: Queryable = DB
): Promise<{
  total_jobs: number; completed: number; failed: number; processing: number;
}> {
  const result = await q.query<{
    total: string; completed: string; failed: string; processing: string;
  }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE status = 'completed')::text AS completed,
            COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
            COUNT(*) FILTER (WHERE status IN ('queued','processing'))::text AS processing
     FROM data_export_jobs WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  return {
    total_jobs: Number(row?.total ?? 0),
    completed: Number(row?.completed ?? 0),
    failed: Number(row?.failed ?? 0),
    processing: Number(row?.processing ?? 0),
  };
}

export function setExportJobRowCount(
  q: Queryable,
  params: { userId: number; jobId: string; rowCount: number }
): void {
  void q.query(
    `UPDATE data_export_jobs SET row_count = $3 WHERE user_id = $1 AND id = $2::uuid`,
    [params.userId, params.jobId, params.rowCount]
  );
}
