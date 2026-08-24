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
     WHERE user_id = $1 AND is_read = 0 AND is_dismissed = 0`,
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

/** Searchable archive — includes dismissed items (ILIKE + filters). */
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
 * default to enabled (in_app) / disabled (email).
 */
export async function getPreferenceMatrix(
  userId: number,
  q: Queryable = DB
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
