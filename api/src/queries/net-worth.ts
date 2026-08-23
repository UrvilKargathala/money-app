import { query } from "../db";
import { isoDate } from "../utils/format";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

/**
 * Net worth is COMPUTED ON READ (FR-9.1) â€” never stored incrementally.
 * One aggregate pass over every source table; snapshots only persist what
 * this computes on a given day.
 */
export type NetWorthComponent = {
  source: string;
  label: string;
  kind: "asset" | "liability";
  value: number;
};

const ACCOUNT_NET = `
  a.opening_balance + COALESCE(SUM(CASE
    WHEN t.type = 'income' THEN t.amount
    WHEN t.type = 'expense' THEN -t.amount
    WHEN t.type = 'transfer' AND tf.from_transaction_id = t.id THEN -t.amount
    WHEN t.type = 'transfer' AND tf.to_transaction_id = t.id THEN t.amount
    ELSE 0 END), 0)
`;

export async function getNetWorthBreakdown(
  userId: number,
  q: Queryable = DB
): Promise<NetWorthComponent[]> {
  const result = await q.query<{
    source: string;
    label: string;
    kind: string;
    value: string;
  }>(
    `
    WITH account_nets AS (
      SELECT a.type AS type,
             ${ACCOUNT_NET} AS net
      FROM accounts a
      LEFT JOIN transactions t ON t.account_id = a.id
      LEFT JOIN account_transfers tf
        ON tf.from_transaction_id = t.id OR tf.to_transaction_id = t.id
      WHERE a.user_id = $1 AND a.is_active = 1 AND a.deleted_at IS NULL
      GROUP BY a.id, a.type
    )
    SELECT source, label, kind, ROUND(SUM(value))::text AS value FROM (
      SELECT CASE WHEN type = 'credit_card' THEN 'cc_positive' ELSE 'bank' END AS source,
             CASE WHEN type = 'credit_card' THEN 'Credit cards' ELSE 'Bank & cash' END AS label,
             'asset' AS kind,
             GREATEST(net, 0) AS value
      FROM account_nets
      UNION ALL
      SELECT 'credit_card', 'Credit cards', 'liability', GREATEST(-net, 0)
      FROM account_nets WHERE type = 'credit_card'
      UNION ALL
      SELECT 'investments', 'Investments', 'asset',
             COALESCE(SUM(current_value), 0)::numeric(14,2)
      FROM investments WHERE user_id = $1 AND is_active = 1
      UNION ALL
      SELECT 'goals', 'Goals', 'asset',
             COALESCE(SUM(gc.total), 0)::numeric(14,2)
      FROM goals g
      LEFT JOIN LATERAL (
        SELECT SUM(amount) AS total FROM goal_contributions
        WHERE user_id = $1 AND goal_id = g.id
      ) gc ON true
      WHERE g.user_id = $1 AND g.status <> 'abandoned'
      UNION ALL
      SELECT 'manual_assets', 'Manual assets', 'asset',
             COALESCE(SUM(valuation), 0)::numeric(14,2)
      FROM manual_assets WHERE user_id = $1
      UNION ALL
      SELECT 'debts', 'Loans', 'liability',
             COALESCE(SUM(principal_outstanding), 0)::numeric(14,2)
      FROM debts WHERE user_id = $1 AND is_active = 1
    ) parts
    GROUP BY source, label, kind
    HAVING SUM(value) <> 0`,
    [userId]
  );
  return result.rows.map((row) => ({
    source: row.source === "cc_positive" ? "credit_card" : row.source,
    label: row.label,
    kind: row.kind === "liability" ? "liability" : "asset",
    value: Number(row.value),
  }));
}

export type NetWorthTotals = {
  assets_total: number;
  liabilities_total: number;
  net_worth: number;
};

export async function getCurrentNetWorth(
  userId: number,
  q: Queryable = DB
): Promise<{ totals: NetWorthTotals; components: NetWorthComponent[] }> {
  const components = await getNetWorthBreakdown(userId, q);
  const assetsTotal = components
    .filter((c) => c.kind === "asset")
    .reduce((sum, c) => sum + c.value, 0);
  const liabilitiesTotal = components
    .filter((c) => c.kind === "liability")
    .reduce((sum, c) => sum + c.value, 0);
  return {
    totals: {
      assets_total: Math.round(assetsTotal * 100) / 100,
      liabilities_total: Math.round(liabilitiesTotal * 100) / 100,
      net_worth: Math.round((assetsTotal - liabilitiesTotal) * 100) / 100,
    },
    components,
  };
}

export type SnapshotRow = {
  date: string;
  assets_total: number;
  liabilities_total: number;
  net_worth: number;
};

function mapSnapshot(row: {
  date: Date;
  assets_total: string | null;
  liabilities_total: string | null;
}): SnapshotRow {
  const assets = Number(row.assets_total ?? 0);
  const liabilities = Number(row.liabilities_total ?? 0);
  return {
    date: isoDate(row.date),
    assets_total: assets,
    liabilities_total: liabilities,
    net_worth: Math.round((assets - liabilities) * 100) / 100,
  };
}

export async function listSnapshots(
  userId: number,
  fromDate: string | null,
  toDate: string | null,
  q: Queryable = DB
): Promise<SnapshotRow[]> {
  const result = await q.query<{
    date: Date;
    assets_total: string | null;
    liabilities_total: string | null;
  }>(
    `SELECT date, assets_total::text AS assets_total,
            liabilities_total::text AS liabilities_total
     FROM net_worth_snapshots
     WHERE user_id = $1
       AND ($2::date IS NULL OR date >= $2::date)
       AND ($3::date IS NULL OR date <= $3::date)
     ORDER BY date ASC`,
    [userId, fromDate, toDate]
  );
  return result.rows.map(mapSnapshot);
}

/** Upserts today's snapshot from the live computation (idempotent per day). */
export async function upsertSnapshotFromComputation(
  q: Queryable,
  params: { userId: number; date: string }
): Promise<void> {
  await q.query(
    `INSERT INTO net_worth_snapshots (user_id, date, assets_total, liabilities_total)
     SELECT $1, $2::date,
            COALESCE(SUM(CASE WHEN kind = 'asset' THEN value ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN kind = 'liability' THEN value ELSE 0 END), 0)
     FROM (
       SELECT CASE WHEN net >= 0 THEN 'asset' ELSE 'liability' END AS kind,
               CASE WHEN net >= 0 THEN net ELSE -net END AS value
       FROM (
         SELECT ${ACCOUNT_NET} AS net
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id
         LEFT JOIN account_transfers tf
           ON tf.from_transaction_id = t.id OR tf.to_transaction_id = t.id
         WHERE a.user_id = $1 AND a.is_active = 1 AND a.deleted_at IS NULL
         GROUP BY a.id
       ) account_nets
       UNION ALL
       SELECT 'asset', COALESCE(SUM(current_value), 0)
       FROM investments WHERE user_id = $1 AND is_active = 1
       UNION ALL
       SELECT 'asset', COALESCE(SUM(gc.total), 0)
       FROM goals g
       LEFT JOIN LATERAL (
         SELECT SUM(amount) AS total FROM goal_contributions
         WHERE user_id = $1 AND goal_id = g.id
       ) gc ON true
       WHERE g.user_id = $1 AND g.status <> 'abandoned'
       UNION ALL
       SELECT 'asset', COALESCE(SUM(valuation), 0)
       FROM manual_assets WHERE user_id = $1
       UNION ALL
       SELECT 'liability', COALESCE(SUM(principal_outstanding), 0)
       FROM debts WHERE user_id = $1 AND is_active = 1
     ) parts
     ON CONFLICT (user_id, date)
     DO UPDATE SET assets_total = EXCLUDED.assets_total,
                   liabilities_total = EXCLUDED.liabilities_total`,
    [params.userId, params.date]
  );
}

export type MilestoneRowRaw = {
  id: string;
  label: string;
  target_amount: string;
  is_active: number;
  reached_at: string | null;
  version: number;
};

export type Milestone = Omit<MilestoneRowRaw, "target_amount" | "reached_at"> & {
  target_amount: number;
  reached_at: string | null;
};

function mapMilestone(row: MilestoneRowRaw): Milestone {
  return {
    ...row,
    target_amount: Number(row.target_amount),
    // SQL already casts reached_at to ISO text (::date::text).
    reached_at: row.reached_at,
  };
}

export async function listMilestones(
  userId: number,
  q: Queryable = DB
): Promise<Milestone[]> {
  const result = await q.query<MilestoneRowRaw>(
    `SELECT id, label, target_amount::text AS target_amount, is_active,
            reached_at::date::text AS reached_at, version
     FROM net_worth_milestones
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY target_amount ASC`,
    [userId]
  );
  return result.rows.map(mapMilestone);
}

export function insertMilestone(
  q: Queryable,
  params: { userId: number; label: string; targetAmount: number }
) {
  return q.query<{ id: string }>(
    `INSERT INTO net_worth_milestones (user_id, label, target_amount, created_by)
     VALUES ($1, $2, $3, $1)
     RETURNING id`,
    [params.userId, params.label, params.targetAmount]
  );
}

/** Soft delete keeps historical crossing stamps intact. */
export function softDeleteMilestone(
  q: Queryable,
  userId: number,
  id: string
) {
  return q.query<{ id: string }>(
    `UPDATE net_worth_milestones
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1, updated_by = $1,
         version = version + 1
     WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [userId, id]
  );
}

export function updateMilestoneFields(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    label: string | null;
    targetAmount: number | null;
    version: number;
  }
) {
  return q.query<{ id: string }>(
    `UPDATE net_worth_milestones
     SET label = COALESCE($3, label),
         target_amount = COALESCE($4, target_amount),
         updated_by = $1, version = version + 1
     WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL AND version = $5
     RETURNING id`,
    [params.userId, params.id, params.label, params.targetAmount, params.version]
  );
}

export function setMilestoneActive(
  q: Queryable,
  params: { userId: number; id: string; isActive: number }
) {
  return q.query<{ id: string }>(
    `UPDATE net_worth_milestones
     SET is_active = $3, updated_by = $1, version = version + 1
     WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [params.userId, params.id, params.isActive]
  );
}

/** Stamps reached_at/notified_at on active milestones crossed at this snapshot. */
export async function stampMilestoneCrossings(
  q: Queryable,
  params: { userId: number; date: string; netWorth: number }
): Promise<number> {
  if (params.netWorth <= 0) return 0;
  const result = await q.query<{ id: string }>(
    `UPDATE net_worth_milestones
     SET reached_at = COALESCE(reached_at, $2::date),
         notified_at = CASE WHEN reached_at IS NULL THEN CURRENT_TIMESTAMP ELSE notified_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND deleted_at IS NULL AND is_active = 1
       AND reached_at IS NULL
       AND target_amount <= $3
     RETURNING id`,
    [params.userId, params.date, params.netWorth]
  );
  return result.rowCount ?? 0;
}

export type NetWorthChange = {
  absolute: number;
  pct: number | null;
};

function changeSince(
  snapshots: SnapshotRow[],
  referenceDaysAgo: number
): { current: SnapshotRow | null; previous: SnapshotRow | null } {
  if (snapshots.length === 0) return { current: null, previous: null };
  const current = snapshots[snapshots.length - 1];
  const refDate = new Date();
  refDate.setDate(refDate.getDate() - referenceDaysAgo);
  const refIso = refDate.toISOString().slice(0, 10);
  let previous: SnapshotRow | null = null;
  for (const snap of snapshots) {
    if (snap.date <= refIso && snap.date !== current.date) previous = snap;
  }
  return { current, previous };
}

export function deriveChange(
  snapshots: SnapshotRow[],
  daysBack: number
): NetWorthChange {
  const { current, previous } = changeSince(snapshots, daysBack);
  if (!current || !previous || previous.net_worth === 0) {
    return { absolute: 0, pct: null };
  }
  const absolute =
    Math.round((current.net_worth - previous.net_worth) * 100) / 100;
  const pct =
    Math.round(((current.net_worth - previous.net_worth) / Math.abs(previous.net_worth)) * 10000) /
      100;
  return { absolute, pct };
}
