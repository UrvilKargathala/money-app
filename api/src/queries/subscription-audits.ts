import { query } from "../db";
import type { QueryResultRow } from "pg";
import type { Finding } from "../utils/subscription-audits";

export type Queryable = { query: typeof query };

export type AuditableSubscriptionRow = {
  id: string;
  service_name: string;
  amount: string;
  frequency: string;
  category_id: string | null;
  last_used_at: string | null;
};

export async function lockUserForAudit(q: Queryable, userId: number): Promise<void> {
  await q.query("SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE", [userId]);
}

export async function listActiveSubscriptionsForAudit(
  q: Queryable,
  userId: number
): Promise<AuditableSubscriptionRow[]> {
  const result = await q.query<AuditableSubscriptionRow>(
    "SELECT id, service_name, amount::numeric(14,2) AS amount, frequency, category_id, last_used_at::text FROM subscriptions WHERE user_id = $1 AND status = 'active' ORDER BY id",
    [userId]
  );
  return result.rows;
}

/**
 * Single-statement batch upsert (unnest) — the old per-finding loop would
 * trip the N+1 guard.
 */
export async function upsertAuditFindings(
  q: Queryable,
  userId: number,
  findings: Finding[]
): Promise<void> {
  if (findings.length === 0) return;
  await q.query(
    `INSERT INTO subscription_audits (user_id, subscription_id, audit_type, finding, recommendation, potential_savings, detection_key)
     SELECT $1, x.subscription_id::uuid, x.audit_type, x.finding, x.recommendation, x.potential_savings::numeric, x.detection_key
     FROM unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::text[])
       AS x(subscription_id, audit_type, finding, recommendation, potential_savings, detection_key)
     ON CONFLICT (user_id, detection_key) WHERE detection_key IS NOT NULL
     DO UPDATE SET finding = EXCLUDED.finding, recommendation = EXCLUDED.recommendation, potential_savings = EXCLUDED.potential_savings`,
    [
      userId,
      findings.map((f) => f.subscription_id),
      findings.map((f) => f.audit_type),
      findings.map((f) => f.finding),
      findings.map((f) => f.recommendation),
      findings.map((f) => f.potential_savings),
      findings.map((f) => f.detection_key),
    ]
  );
}

export type VisibleAuditRow = {
  potential_savings: string;
};

export async function listVisibleAudits<T extends QueryResultRow>(
  q: Queryable,
  userId: number,
  detectionKeys: string[]
): Promise<T[]> {
  const result = await q.query<T>(
    `SELECT a.*, a.potential_savings::numeric(14,2) AS potential_savings FROM subscription_audits a
     JOIN subscriptions s ON s.id = a.subscription_id AND s.user_id = a.user_id
     WHERE a.user_id = $1 AND s.status = 'active' AND (a.audit_type = 'price_change' OR a.detection_key = ANY($2::text[])) ORDER BY a.created_at DESC`,
    [userId, detectionKeys]
  );
  return result.rows;
}

export async function dismissAudit(q: Queryable, userId: number, id: string): Promise<number> {
  const result = await q.query(
    "UPDATE subscription_audits SET is_dismissed = 1 WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  return result.rowCount ?? 0;
}
