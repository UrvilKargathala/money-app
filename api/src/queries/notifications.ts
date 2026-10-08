import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query: query };

export type NotificationRow = {
  id: string;
  type: string;
  module: string;
  title: string;
  message: string;
  data_payload: Record<string, unknown> | null;
  deep_link: string | null;
  priority: "low" | "medium" | "high";
  is_read: number;
  created_at: string;
};

type RawNotification = {
  id: string;
  type: string;
  module: string;
  title: string;
  message: string;
  data_payload: Record<string, unknown> | string | null;
  deep_link: string | null;
  priority: string;
  is_read: number;
  created_at: Date;
};

function mapNotification(row: RawNotification): NotificationRow {
  let payload: Record<string, unknown> | null = null;
  if (row.data_payload) {
    if (typeof row.data_payload === "string") {
      try {
        payload = JSON.parse(row.data_payload);
      } catch {
        payload = null;
      }
    } else {
      payload = row.data_payload;
    }
  }
  return {
    ...row,
    priority: row.priority as "low" | "medium" | "high",
    data_payload: payload,
    created_at: row.created_at.toISOString(),
  };
}

/** Paginated feed; `filter` = all | unread | read. Excludes dismissed. */
export async function listNotifications(
  userId: number,
  params: {
    filter: "all" | "unread" | "read";
    type: string | null;
    module: string | null;
    limit: number;
    offset: number;
  },
  q: Queryable = DB
): Promise<{ items: NotificationRow[]; total: number }> {
  const result = await q.query<RawNotification>(
    `SELECT id, type, module, title, message, data_payload, deep_link,
            priority, is_read, created_at
     FROM notifications
     WHERE user_id = $1 AND is_dismissed = 0
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       AND ($2::text = 'all'
            OR ($2::text = 'unread' AND is_read = 0)
            OR ($2::text = 'read' AND is_read = 1))
       AND ($3::text IS NULL OR type = $3::text)
       AND ($4::text IS NULL OR module = $4::text)
     ORDER BY created_at DESC
     LIMIT $5::int OFFSET $6::int`,
    [userId, params.filter, params.type, params.module, params.limit, params.offset]
  );

  const countResult = await q.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM notifications
     WHERE user_id = $1 AND is_dismissed = 0
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       AND ($2::text = 'all'
            OR ($2::text = 'unread' AND is_read = 0)
            OR ($2::text = 'read' AND is_read = 1))
       AND ($3::text IS NULL OR type = $3::text)
       AND ($4::text IS NULL OR module = $4::text)`,
    [userId, params.filter, params.type, params.module]
  );

  return {
    items: result.rows.map(mapNotification),
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

export async function getUnreadCount(userId: number, q: Queryable = DB): Promise<number> {
  const result = await q.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM notifications
     WHERE user_id = $1 AND is_read = 0 AND is_dismissed = 0
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
    [userId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** Simplified stream: latest undismissed since a timestamp (poll-based). */
export async function listSince(
  userId: number,
  since: string | null,
  q: Queryable = DB
): Promise<{ id: string; type: string; title: string; message: string; created_at: Date }[]> {
  const result = await q.query<{
    id: string;
    type: string;
    title: string;
    message: string;
    created_at: Date;
  }>(
    `SELECT id, type, title, message, created_at
     FROM notifications
     WHERE user_id = $1 AND is_dismissed = 0
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       AND ($2::timestamptz IS NULL OR created_at > $2::timestamptz)
     ORDER BY created_at DESC LIMIT 50`,
    [userId, since]
  );
  return result.rows;
}

export async function getNotification(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<NotificationRow | null> {
  const result = await q.query<RawNotification>(
    `SELECT id, type, module, title, message, data_payload, deep_link,
            priority, is_read, created_at
     FROM notifications WHERE user_id = $1 AND id = $2::uuid`,
    [userId, id]
  );
  return result.rowCount === 1 ? mapNotification(result.rows[0]) : null;
}

export function markRead(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `UPDATE notifications SET is_read = 1
     WHERE user_id = $1 AND id = $2::uuid AND is_read = 0 RETURNING id`,
    [userId, id]
  );
}

export function markAllRead(q: Queryable, userId: number) {
  return q.query(
    `UPDATE notifications SET is_read = 1
     WHERE user_id = $1 AND is_read = 0 AND is_dismissed = 0`,
    [userId]
  );
}

export function dismissNotification(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `UPDATE notifications SET is_dismissed = 1
     WHERE user_id = $1 AND id = $2::uuid AND is_dismissed = 0 RETURNING id`,
    [userId, id]
  );
}

export function restoreNotification(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `UPDATE notifications SET is_dismissed = 0
     WHERE user_id = $1 AND id = $2::uuid AND is_dismissed = 1 RETURNING id`,
    [userId, id]
  );
}

/** Bulk mark-read/dismiss for a set of ids. */
export async function bulkAction(
  q: Queryable,
  params: {
    userId: number;
    ids: string[];
    action: "read" | "dismiss";
  }
): Promise<number> {
  const col = params.action === "read" ? "is_read" : "is_dismissed";
  const result = await q.query<{ id: string }>(
    `UPDATE notifications SET ${col} = 1
     WHERE user_id = $1 AND id = ANY($2::uuid[]) RETURNING id`,
    [params.userId, params.ids]
  );
  return result.rowCount ?? 0;
}

/** Searchable archive - includes dismissed items (ILIKE + filters). */
export async function searchArchive(
  userId: number,
  params: {
    search: string | null;
    type: string | null;
    module: string | null;
    limit: number;
    offset: number;
  },
  q: Queryable = DB
): Promise<NotificationRow[]> {
  const result = await q.query<RawNotification>(
    `SELECT id, type, module, title, message, data_payload, deep_link,
            priority, is_read, created_at
     FROM notifications
     WHERE user_id = $1
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       AND ($2::text IS NULL OR title ILIKE '%' || $2::text || '%' OR message ILIKE '%' || $2::text || '%')
       AND ($3::text IS NULL OR type = $3::text)
       AND ($4::text IS NULL OR module = $4::text)
     ORDER BY created_at DESC
     LIMIT $5::int OFFSET $6::int`,
    [
      userId,
      params.search,
      params.type,
      params.module,
      params.limit,
      params.offset,
    ]
  );
  return result.rows.map(mapNotification);
}

// ---------------------------------------------------------------------------
// Preferences matrix
// ---------------------------------------------------------------------------

export const NOTIFICATION_TYPES = [
  "warning",
  "alert",
  "reminder",
  "insight",
  "summary",
  "info",
] as const;

export const NOTIFICATION_CHANNELS = ["in_app", "email"] as const;

export type PreferenceRow = {
  notification_type: string;
  channel: string;
  is_enabled: boolean;
};

/**
 * Returns the full type × channel matrix. Rows without explicit DB records
 * default to enabled (in_app) / disabled (email). Memoized 5min per user on
 * the pool path so the nightly triple-generator fan-out reads once per user
 * per run; upsertPreference invalidates.
 */
const MATRIX_TTL_MS = 5 * 60_000;
const matrixCache = new Map<number, { at: number; value: PreferenceRow[] }>();

export function invalidateMatrixCache(userId?: number): void {
  if (userId === undefined) matrixCache.clear();
  else matrixCache.delete(userId);
}

export async function getPreferenceMatrix(
  userId: number,
  q: Queryable = DB
): Promise<PreferenceRow[]> {
  // Tests mutate preference rows directly between cases: bypass the memo
  // under VITEST so sequential tests can't poison each other.
  if (q === DB && !process.env.VITEST && process.env.NODE_ENV !== "test") {
    const hit = matrixCache.get(userId);
    if (hit && Date.now() - hit.at < MATRIX_TTL_MS) return hit.value;
    const value = await getPreferenceMatrixFresh(userId, q);
    matrixCache.set(userId, { at: Date.now(), value });
    if (matrixCache.size > 5000) matrixCache.clear();
    return value;
  }
  return getPreferenceMatrixFresh(userId, q);
}

async function getPreferenceMatrixFresh(
  userId: number,
  q: Queryable
): Promise<PreferenceRow[]> {
  const stored = await q.query<{
    notification_type: string;
    channel: string;
    is_enabled: number;
  }>(
    `SELECT notification_type, channel, is_enabled
     FROM notification_preferences WHERE user_id = $1`,
    [userId]
  );
  const lookup = new Map<string, boolean>();
  for (const row of stored.rows) {
    lookup.set(`${row.notification_type}|${row.channel}`, row.is_enabled === 1);
  }

  const matrix: PreferenceRow[] = [];
  for (const type of NOTIFICATION_TYPES) {
    for (const channel of NOTIFICATION_CHANNELS) {
      const key = `${type}|${channel}`;
      const defaultValue = channel === "in_app";
      matrix.push({
        notification_type: type,
        channel,
        is_enabled: lookup.has(key) ? lookup.get(key)! : defaultValue,
      });
    }
  }
  return matrix;
}

export async function upsertPreference(
  q: Queryable,
  params: {
    userId: number;
    notificationType: string;
    channel: string;
    isEnabled: number;
  }
): Promise<void> {
  await q.query(
    `INSERT INTO notification_preferences (user_id, notification_type, channel, is_enabled)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, notification_type, channel)
     DO UPDATE SET is_enabled = $4, updated_at = CURRENT_TIMESTAMP`,
    [params.userId, params.notificationType, params.channel, params.isEnabled]
  );
  invalidateMatrixCache(params.userId);
}

// ---------------------------------------------------------------------------
// Email delivery log
// ---------------------------------------------------------------------------

export type NotificationEmailRow = {
  id: string;
  email_type: string;
  recipient: string;
  status: string;
  sent_at: string | null;
  created_at: string;
};

export async function listEmailLog(
  userId: number,
  limit: number,
  q: Queryable = DB
): Promise<NotificationEmailRow[]> {
  const result = await q.query<{
    id: string;
    email_type: string;
    recipient: string;
    status: string;
    sent_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, email_type, recipient, status, sent_at, created_at
     FROM notification_emails WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2::int`,
    [userId, limit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    email_type: row.email_type,
    recipient: row.recipient,
    status: row.status,
    sent_at: row.sent_at === null ? null : row.sent_at.toISOString(),
    created_at: row.created_at.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Producer writes (used by the jobs/run generators, never by UI routes)
// ---------------------------------------------------------------------------

export type NewNotification = {
  userId: number;
  type: string;
  module: string;
  title: string;
  message: string;
  dataPayload: Record<string, unknown>;
  deepLink: string | null;
  priority: "low" | "medium" | "high";
  expiresAt: string | null;
};

/** Single insert. Writes carry user_id in the SQL itself (defense-in-depth). */
export async function createNotification(
  q: Queryable,
  params: NewNotification
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO notifications
       (user_id, type, module, title, message, data_payload, deep_link,
        priority, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::timestamptz)
     RETURNING id::text AS id`,
    [
      params.userId,
      params.type,
      params.module,
      params.title,
      params.message,
      JSON.stringify(params.dataPayload),
      params.deepLink,
      params.priority,
      params.expiresAt,
    ]
  );
  return result.rows[0].id;
}

/**
 * Bulk insert for generator runs: one statement regardless of row count
 * (no per-row query loops). Returns the inserted count.
 */
export async function insertNotifications(
  q: Queryable,
  rows: NewNotification[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await q.query<{ id: string }>(
    `INSERT INTO notifications
       (user_id, type, module, title, message, data_payload, deep_link,
        priority, expires_at)
     SELECT u, t, m, ti, me, p::jsonb, d, pr, e::timestamptz
     FROM unnest(
       $1::int[], $2::text[], $3::text[], $4::text[], $5::text[],
       $6::text[], $7::text[], $8::text[], $9::text[]
     ) AS v(u, t, m, ti, me, p, d, pr, e)
     RETURNING id::text AS id`,
    [
      rows.map((r) => r.userId),
      rows.map((r) => r.type),
      rows.map((r) => r.module),
      rows.map((r) => r.title),
      rows.map((r) => r.message),
      rows.map((r) => JSON.stringify(r.dataPayload)),
      rows.map((r) => r.deepLink),
      rows.map((r) => r.priority),
      rows.map((r) => r.expiresAt),
    ]
  );
  return result.rowCount ?? 0;
}

/**
 * Active (unread, non-dismissed, non-expired) alert payloads for one user.
 * Generator fan-out reads this once per user and matches dedup keys in
 * memory instead of querying per candidate.
 */
export async function listActiveAlertPayloads(
  userId: number,
  q: Queryable = DB
): Promise<Record<string, unknown>[]> {
  const result = await q.query<{ data_payload: unknown }>(
    `SELECT data_payload FROM notifications
     WHERE user_id = $1 AND is_read = 0 AND is_dismissed = 0
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       AND data_payload IS NOT NULL`,
    [userId]
  );
  const out: Record<string, unknown>[] = [];
  for (const row of result.rows) {
    const payload = row.data_payload;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      out.push(payload as Record<string, unknown>);
    } else if (typeof payload === "string") {
      try {
        const parsed: unknown = JSON.parse(payload);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          out.push(parsed as Record<string, unknown>);
        }
      } catch {
        // ignore malformed payloads
      }
    }
  }
  return out;
}

/**
 * Cross-user variant for set-based generators: active alert payloads for a
 * batch of users in one query (no per-user fan-out).
 */
export async function listActiveAlertPayloadsForUsers(
  userIds: number[],
  module: string,
  q: Queryable = DB
): Promise<Map<number, Record<string, unknown>[]>> {
  const out = new Map<number, Record<string, unknown>[]>();
  if (userIds.length === 0) return out;
  const result = await q.query<{ user_id: number; data_payload: unknown }>(
    `SELECT user_id, data_payload FROM notifications
     WHERE user_id = ANY($1::int[]) AND module = $2
       AND is_read = 0 AND is_dismissed = 0
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       AND data_payload IS NOT NULL`,
    [userIds, module]
  );
  for (const row of result.rows) {
    const payload = row.data_payload;
    let parsed: Record<string, unknown> | null = null;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      parsed = payload as Record<string, unknown>;
    } else if (typeof payload === "string") {
      try {
        const p: unknown = JSON.parse(payload);
        if (p && typeof p === "object" && !Array.isArray(p)) {
          parsed = p as Record<string, unknown>;
        }
      } catch {
        // ignore malformed payloads
      }
    }
    if (parsed) {
      const list = out.get(row.user_id) ?? [];
      list.push(parsed);
      out.set(row.user_id, list);
    }
  }
  return out;
}

/**
 * Retention janitor (runs inside the scheduled job): drops dismissed rows
 * older than 90 days and long-expired transient alerts. No user scoping
 * needed — age predicates only, same for every tenant.
 */
export async function pruneNotifications(
  q: Queryable = DB
): Promise<{ dismissed: number; expired: number }> {
  const dismissed = await q.query<{ id: string }>(
    `DELETE FROM notifications
     WHERE is_dismissed = 1 AND created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
     RETURNING id::text AS id`
  );
  const expired = await q.query<{ id: string }>(
    `DELETE FROM notifications
     WHERE expires_at IS NOT NULL
       AND expires_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
     RETURNING id::text AS id`
  );
  return {
    dismissed: dismissed.rowCount ?? 0,
    expired: expired.rowCount ?? 0,
  };
}
