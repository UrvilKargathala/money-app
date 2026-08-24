import { query } from "../db";
import { isoDate } from "../utils/format";

export type Queryable = { query: typeof query };

const DB: Queryable = { query: query };

export type SharedGroupRow = {
  id: string;
  name: string;
  description: string | null;
  owner_id: number;
  is_owner: boolean;
  my_role: "admin" | "read_only" | null;
  member_count: number;
  version: number;
};

export type GroupMembership = {
  role: "admin" | "read_only";
};

/** Groups the user owns or is an active member of â€” one aggregate query. */
export async function listSharedGroups(
  userId: number,
  q: Queryable = DB
): Promise<SharedGroupRow[]> {
  const result = await q.query<{
    id: string;
    name: string;
    description: string | null;
    owner_id: number;
    role: string | null;
    member_count: string;
    version: number;
  }>(
    `SELECT g.id, g.name, g.description, g.owner_id, m.role,
            (SELECT COUNT(*) FROM group_members gm
             WHERE gm.group_id = g.id AND gm.status = 'active')::text AS member_count,
            g.version
     FROM shared_groups g
     LEFT JOIN group_members m
       ON m.group_id = g.id AND m.user_id = $1 AND m.status = 'active'
     WHERE g.deleted_at IS NULL
       AND (g.owner_id = $1 OR (m.user_id = $1 AND m.status = 'active'))
     ORDER BY g.name`,
    [userId]
  );
  return result.rows.map((row) => ({
    ...row,
    is_owner: row.owner_id === userId,
    my_role: row.owner_id === userId ? "admin" : ((row.role as "admin" | "read_only") ?? null),
    member_count: Number(row.member_count),
  }));
}

export type CallerContext =
  | { kind: "owner"; groupId: string; name: string }
  | { kind: "member"; groupId: string; role: "admin" | "read_only"; name: string }
  | null;

/** Owner or active-member context for a group; null when neither/missing. */
export async function getCallerContext(
  userId: number,
  groupId: string,
  q: Queryable = DB
): Promise<CallerContext> {
  const result = await q.query<{
    id: string;
    name: string;
    owner_id: number;
    role: string | null;
    deleted: boolean;
  }>(
    `SELECT g.id, g.name, g.owner_id, m.role,
            (g.deleted_at IS NOT NULL) AS deleted
     FROM shared_groups g
     LEFT JOIN group_members m
       ON m.group_id = g.id AND m.user_id = $1 AND m.status = 'active'
     WHERE g.id = $2::uuid`,
    [userId, groupId]
  );
  const row = result.rows[0];
  if (!row || row.deleted) return null;
  if (row.owner_id === userId) {
    return { kind: "owner", groupId: row.id, name: row.name };
  }
  if (row.role === "admin" || row.role === "read_only") {
    return {
      kind: "member",
      groupId: row.id,
      role: row.role as "admin" | "read_only",
      name: row.name,
    };
  }
  return null;
}

export async function createGroupWithOwner(
  q: Queryable,
  params: { userId: number; name: string; description: string | null }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO shared_groups (owner_id, name, description, created_by, updated_by)
     VALUES ($1, $2, $3, $1, $1)
     RETURNING id`,
    [params.userId, params.name, params.description]
  );
  const groupId = result.rows[0].id;

  await q.query(
    `INSERT INTO group_members (group_id, user_id, role, status, invited_by)
     VALUES ($1::uuid, $2, 'admin', 'active', $2)`,
    [groupId, params.userId]
  );
  return groupId;
}

export function updateGroupFields(
  q: Queryable,
  params: {
    ownerId: number;
    id: string;
    name: string | null;
    description: string | null;
    version: number;
  }
) {
  return q.query<{ id: string }>(
    `UPDATE shared_groups SET
       name = COALESCE($3, name),
       description = COALESCE($4, description),
       updated_by = $1, version = version + 1
     WHERE owner_id = $1 AND id = $2::uuid AND deleted_at IS NULL AND version = $5
     RETURNING id`,
    [
      params.ownerId, params.id, params.name, params.description, params.version,
    ]
  );
}

export function softDeleteGroup(q: Queryable, ownerId: number, id: string) {
  return q.query<{ id: string }>(
    `UPDATE shared_groups
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1, updated_by = $1,
         version = version + 1
     WHERE owner_id = $1 AND id = $2::uuid AND deleted_at IS NULL
     RETURNING id`,
    [ownerId, id]
  );
}

export type GroupMemberRow = {
  user_id: number;
  email: string;
  full_name: string | null;
  role: "admin" | "read_only";
  status: "pending" | "active" | "removed";
  is_owner: boolean;
};

export async function listGroupMembers(
  userId: number,
  groupId: string,
  q: Queryable = DB
): Promise<GroupMemberRow[]> {
  const result = await q.query<{
    user_id: number;
    email: string;
    full_name: string | null;
    role: string;
    status: string;
    owner_id: number;
  }>(
    `SELECT gm.user_id, u.email, p.full_name, gm.role, gm.status, g.owner_id
     FROM group_members gm
     JOIN shared_groups g ON g.id = gm.group_id
     JOIN users u ON u.user_id = gm.user_id
     LEFT JOIN user_profiles p ON p.user_id = gm.user_id
     WHERE gm.group_id = $2::uuid
       AND (
         g.owner_id = $1
         OR gm.user_id = $1
       )
     ORDER BY (g.owner_id = gm.user_id) DESC, gm.status, u.email`,
    [userId, groupId]
  );
  return result.rows.map((row) => ({
    user_id: row.user_id,
    email: row.email,
    full_name: row.full_name,
    role: row.role as "admin" | "read_only",
    status: row.status as "pending" | "active" | "removed",
    is_owner: row.owner_id === row.user_id,
  }));
}

export type PendingInviteRow = {
  id: string;
  invitee_email: string;
  status: string;
  expires_at: string;
  created_at: string;
};

export async function listPendingInvites(
  ownerId: number,
  groupId: string,
  q: Queryable = DB
): Promise<PendingInviteRow[]> {
  const result = await q.query<{
    id: string;
    invitee_email: string;
    status: string;
    expires_at: Date;
    created_at: Date;
  }>(
    `SELECT id, invitee_email, status, expires_at, created_at
     FROM group_invites
     WHERE group_id = $2::uuid AND invited_by = $1
       AND status IN ('pending','expired')
     ORDER BY created_at DESC`,
    [ownerId, groupId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    invitee_email: row.invitee_email,
    status: row.status,
    expires_at: isoDate(row.expires_at),
    created_at: row.created_at.toISOString(),
  }));
}

export function insertInvite(
  q: Queryable,
  params: {
    groupId: string;
    inviteeEmail: string;
    tokenHash: string;
    invitedBy: number;
    expiresAt: Date;
  }
): Promise<string> {
  return q
    .query<{ id: string }>(
      `INSERT INTO group_invites
         (group_id, invitee_email, token_hash, invited_by, expires_at)
       VALUES ($1::uuid, $2, $3, $4, $5)
       RETURNING id`,
      [
        params.groupId, params.inviteeEmail, params.tokenHash,
        params.invitedBy, params.expiresAt,
      ]
    )
    .then((r) => r.rows[0].id);
}

export type InviteResolution = {
  tokenHash: string;
  groupId: string;
  groupName: string;
  invitee_email: string;
  inviter_name: string | null;
  status: string;
  expired: boolean;
} | null;

export async function resolveInviteByToken(
  tokenHash: string,
  q: Queryable = DB
): Promise<InviteResolution> {
  const full = await q.query<{
    token_hash: string;
    group_id: string;
    group_name: string;
    invitee_email: string;
    inviter_email: string | null;
    status: string;
    expires_at: Date;
  }>(
    `SELECT i.token_hash, i.group_id, g.name AS group_name, i.invitee_email,
            u.email AS inviter_email, i.status, i.expires_at
     FROM group_invites i
     JOIN shared_groups g ON g.id = i.group_id
     LEFT JOIN users u ON u.user_id = i.invited_by
     WHERE i.token_hash = $1`,
    [tokenHash]
  );
  const row = full.rows[0];
  if (!row) return null;
  return {
    tokenHash: row.token_hash,
    groupId: row.group_id,
    groupName: row.group_name,
    invitee_email: row.invitee_email,
    inviter_name: row.inviter_email,
    status: row.status,
    expired:
      row.status === "expired" ||
      row.expires_at.getTime() < Date.now(),
  };
}

/**
 * Accepts an invite inside one transaction: validates pending+expiry+email,
 * stamps the invite and upserts the membership. Returns a reason on failure.
 */
export async function acceptInvite(
  q: Queryable,
  params: { tokenHash: string; userId: number; userEmail: string }
): Promise<
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "EMAIL_MISMATCH" | "WRONG_STATE" }
  | { ok: true; groupId: string; groupName: string; role: "admin" | "read_only" }
> {
  // Lock the invite row for the whole decision.
  const inviteResult = await q.query<{
    id: string;
    group_id: string;
    invitee_email: string;
    status: string;
    expires_at: Date;
    invited_by: number;
  }>(
    `SELECT id, group_id, invitee_email, status, expires_at, invited_by
     FROM group_invites
     WHERE token_hash = $1::text
     FOR UPDATE`,
    [params.tokenHash]
  );
  const invite = inviteResult.rows[0];
  if (!invite) return { ok: false, reason: "NOT_FOUND" };
  if (
    invite.status !== "pending" ||
    new Date(invite.expires_at).getTime() < Date.now()
  ) {
    return { ok: false, reason: invite.status === "pending" ? "EXPIRED" : "WRONG_STATE" };
  }
  if (invite.invitee_email !== params.userEmail.toLowerCase()) {
    return { ok: false, reason: "EMAIL_MISMATCH" };
  }

  await q.query(
    `UPDATE group_invites SET status = 'accepted',
            accepted_at = CURRENT_TIMESTAMP, accepted_by = $2
     WHERE id = $1`,
    [invite.id, params.userId]
  );

  const groupName = await q.query<{ name: string }>(
    `SELECT name FROM shared_groups WHERE id = $1::uuid`,
    [invite.group_id]
  );

  await q.query(
    `INSERT INTO group_members (group_id, user_id, role, status, invited_by)
     VALUES ($1::uuid, $2, 'read_only', 'active', $3)
     ON CONFLICT (group_id, user_id) DO UPDATE SET
       status = 'active',
       role = CASE WHEN group_members.status = 'removed' THEN 'read_only'
                   ELSE group_members.role END,
       version = group_members.version + 1`,
    [invite.group_id, params.userId, invite.invited_by]
  );

  return {
    ok: true,
    groupId: invite.group_id,
    groupName: groupName.rows[0]?.name ?? "",
    role: "read_only",
  };
}

export async function declineInvite(
  q: Queryable,
  params: { tokenHash: string; userId: number; userEmail: string }
): Promise<{ ok: boolean; reason?: string }> {
  const result = await q.query<{ id: string; invitee_email: string; status: string }>(
    `SELECT id, invitee_email, status FROM group_invites
     WHERE token_hash = $1::text FOR UPDATE`,
    [params.tokenHash]
  );
  const invite = result.rows[0];
  if (!invite) return { ok: false, reason: "NOT_FOUND" };
  if (invite.status !== "pending") return { ok: false, reason: "WRONG_STATE" };
  if (invite.invitee_email !== params.userEmail.toLowerCase()) {
    return { ok: false, reason: "EMAIL_MISMATCH" };
  }
  await q.query(
    `UPDATE group_invites SET status = 'declined', accepted_by = $2
     WHERE id = $1`,
    [invite.id, params.userId]
  );
  return { ok: true };
}

/** Owner-only: revokes a pending invite so its token stops working. */
export function revokeInvite(
  q: Queryable,
  params: { ownerId: number; groupId: string; inviteId: string }
) {
  return q.query<{ id: string }>(
    `UPDATE group_invites SET status = 'revoked'
     WHERE group_id = $2::uuid AND id = $3::uuid AND invited_by = $1
       AND status = 'pending'
     RETURNING id`,
    [params.ownerId, params.groupId, params.inviteId]
  );
}

export function setMemberRemoved(
  q: Queryable,
  params: { groupId: string; memberUserId: number; actingUserId: number }
) {
  return q.query<{ id: string }>(
    `UPDATE group_members AS gm SET status = 'removed', updated_by = $3,
            version = gm.version + 1
     FROM shared_groups g
     WHERE g.id = gm.group_id AND gm.group_id = $1::uuid
       AND gm.user_id = $2
       AND g.owner_id = $3
       AND gm.user_id <> g.owner_id`,
    [params.groupId, params.memberUserId, params.actingUserId]
  );
}

export function leaveGroup(
  q: Queryable,
  params: { userId: number; groupId: string }
) {
  return q.query<{ id: string }>(
    `UPDATE group_members AS gm SET status = 'removed', updated_by = $1,
            version = gm.version + 1
     FROM shared_groups g
     WHERE g.id = gm.group_id AND gm.group_id = $2::uuid
       AND gm.user_id = $1 AND gm.status = 'active'
       AND g.owner_id <> $1`,
    [params.userId, params.groupId]
  );
}

/** Owner-only atomic handover: new owner promoted to admin in the same tx. */
export async function transferOwnership(
  q: Queryable,
  params: {
    ownerId: number;
    groupId: string;
    newOwnerId: number;
  }
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `UPDATE shared_groups SET owner_id = $3, updated_by = $3,
            version = version + 1
     WHERE owner_id = $1 AND id = $2::uuid AND deleted_at IS NULL
     RETURNING id`,
    [params.ownerId, params.groupId, params.newOwnerId]
  );
  if (result.rowCount !== 1) return false;

  await q.query(
    `UPDATE group_members SET role = 'admin'
     WHERE group_id = $1::uuid AND user_id = $2`,
    [params.groupId, params.newOwnerId]
  );
  return true;
}

export type GroupTxnRow = {
  id: string;
  date: string;
  type: string;
  amount: number;
  description: string | null;
  added_by_email: string;
};

/** Group transactions with contributor attribution â€” one query. */
export async function listGroupTransactions(
  userId: number,
  groupId: string,
  limit: number,
  q: Queryable = DB
): Promise<GroupTxnRow[]> {
  const result = await q.query<{
    id: string;
    date: Date;
    type: string;
    amount: string;
    description: string | null;
    added_by_email: string;
  }>(
    `SELECT t.id, t.date, t.type, t.amount::text AS amount, t.description,
            u.email AS added_by_email
     FROM transactions t
     JOIN users u ON u.user_id = t.created_by
     WHERE t.group_id = $2::uuid
       AND (
         EXISTS (
           SELECT 1 FROM group_members gm
           WHERE gm.group_id = $2::uuid AND gm.user_id = $1 AND gm.status = 'active'
         )
         OR EXISTS (
           SELECT 1 FROM shared_groups g
           WHERE g.id = $2::uuid AND g.owner_id = $1
         )
       )
     ORDER BY t.date DESC, t.created_at DESC
     LIMIT $3::int`,
    [userId, groupId, limit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    date: isoDate(row.date),
    type: row.type,
    amount: Number(row.amount),
    description: row.description,
    added_by_email: row.added_by_email,
  }));
}
