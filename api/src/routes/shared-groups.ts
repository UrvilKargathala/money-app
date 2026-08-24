import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson } from "./helpers";
import { hashToken } from "../session";
import { normalizeEmail } from "../auth";
import { csvEscape } from "../utils/format";
import {
  acceptInvite,
  createGroupWithOwner,
  declineInvite,
  getCallerContext,
  insertInvite,
  leaveGroup,
  listGroupMembers,
  listGroupTransactions,
  listPendingInvites,
  listSharedGroups,
  resolveInviteByToken,
  revokeInvite,
  setMemberRemoved,
  softDeleteGroup,
  transferOwnership,
  updateGroupFields,
} from "../queries/shared-groups";

const sharedGroups = new Hono();

const uuidRe = /^[0-9a-f-]{36}$/i;
const INVITE_DAYS = 7;

function inviteUrlFor(token: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/shared-groups/invite/${token}`;
}

sharedGroups.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ groups: await listSharedGroups(user.user_id) });
});

sharedGroups.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim() || null;

  if (name.length < 2 || name.length > 100) {
    return c.json(
      { fieldErrors: { name: "Group names must be 2-100 characters." } },
      400
    );
  }

  try {
    const id = await withUser(user.user_id, (client) =>
      createGroupWithOwner(client, {
        userId: user.user_id,
        name,
        description,
      })
    );
    return c.json({ success: true, group: { id } });
  } catch (err) {
    console.error("[api] create shared group failed:", err);
    return c.json(
      { error: "Could not create the group. Please try again." },
      500
    );
  }
});

// ---- invite token routes (literal prefix wins over :id — register first) ----

sharedGroups.get("/invites/:token", requireAuth, async (c) => {
  const tokenHash = createHash("sha256").update(c.req.param("token")).digest("hex");
  const resolved = await resolveInviteByToken(tokenHash);
  if (!resolved) return c.json({ error: "Not found" }, 404);
  return c.json({
    group_name: resolved.groupName,
    invited_by_email: resolved.inviter_name,
    invitee_email: resolved.invitee_email,
    status: resolved.status,
    expired: resolved.expired,
  });
});

sharedGroups.post("/invites/:token/accept", requireAuth, async (c) => {
  const user = c.get("user");
  const tokenHash = createHash("sha256").update(c.req.param("token")).digest("hex");

  const result = await withUser(user.user_id, (client) =>
    acceptInvite(client, {
      tokenHash,
      userId: user.user_id,
      userEmail: normalizeEmail(user.email),
    })
  );

    if (!result.ok) {
      const map: Record<string, [number, Record<string, unknown>]> = {
        NOT_FOUND: [404, { error: "Not found" }],
        EXPIRED: [410, { error: "This invitation has expired." }],
        EMAIL_MISMATCH: [
          403,
          { error: "This invitation was sent to a different email address." },
        ],
        WRONG_STATE: [409, { error: "This invitation is no longer pending." }],
      };
      const entry = map[result.reason];
      if (entry) return c.json(entry[1], entry[0] as 403 | 404 | 409 | 410);
      return c.json({ error: "Could not accept the invitation." }, 500);
    }

    return c.json({
      success: true,
      group: { id: result.groupId, name: result.groupName },
      role: result.role,
    });
  });

sharedGroups.post("/invites/:token/decline", requireAuth, async (c) => {
  const user = c.get("user");
  const tokenHash = createHash("sha256").update(c.req.param("token")).digest("hex");

  const result = await withUser(user.user_id, (client) =>
    declineInvite(client, {
      tokenHash,
      userId: user.user_id,
      userEmail: normalizeEmail(user.email),
    })
  );

  if (!result.ok) {
    const map: Record<string, [number, Record<string, unknown>]> = {
      NOT_FOUND: [404, { error: "Not found" }],
      WRONG_STATE: [409, { error: "This invitation is no longer pending." }],
      EMAIL_MISMATCH: [
        403,
        { error: "This invitation was sent to a different email address." },
      ],
    };
    const entry = map[result.reason!];
    if (entry) return c.json(entry[1], entry[0] as 403 | 404 | 409);
  }

  return c.json({ success: true });
});

// ---- :id-scoped routes ----

async function memberGuard(
  c: import("hono").Context,
  userId: number,
  groupId: string
): Promise<
  { ok: true; role: "admin" | "read_only" | null; isOwner: boolean } | { ok: false }
> {
  if (!uuidRe.test(groupId)) return { ok: false };
  const ctx = await getCallerContext(userId, groupId);
  if (!ctx) return { ok: false };
  if (ctx.kind === "owner") return { ok: true, role: "admin", isOwner: true };
  return { ok: true, role: ctx.role, isOwner: false };
}

sharedGroups.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const guard = await memberGuard(c, user.user_id, c.req.param("id"));
  if (!guard.ok) return c.json({ error: "Not found" }, 404);

  const groups = await listSharedGroups(user.user_id);
  const mine = groups.find((g) => g.id === c.req.param("id"));
  if (!mine) return c.json({ error: "Not found" }, 404);
  return c.json({ group: mine });
});

sharedGroups.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);
  const guard = await memberGuard(c, user.user_id, id);
  if (!guard.ok) return c.json({ error: "Not found" }, 404);
  if (!guard.isOwner) {
    return c.json({ error: "Only the owner can update the group." }, 403);
  }

  const name = body.name === undefined ? null : String(body.name).trim();
  const description =
    body.description === undefined ? null : String(body.description ?? "").trim() || null;
  const version = Number(body.version ?? 1);

  if (name !== null && (name.length < 2 || name.length > 100)) {
    return c.json(
      { fieldErrors: { name: "Group names must be 2-100 characters." } },
      400
    );
  }

  const result = await withUser(user.user_id, (client) =>
    updateGroupFields(client, {
      ownerId: user.user_id,
      id,
      name,
      description,
      version,
    })
  );
  if (result.rowCount !== 1) {
    return c.json(
      { error: "This group was modified elsewhere. Refresh and try again." },
      409
    );
  }

  return c.json({ success: true });
});

sharedGroups.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);
  const guard = await memberGuard(c, user.user_id, id);
  if (!guard.ok) return c.json({ error: "Not found" }, 404);
  if (!guard.isOwner) {
    return c.json({ error: "Only the owner can delete the group." }, 403);
  }

  const result = await withUser(user.user_id, (client) =>
    softDeleteGroup(client, user.user_id, id)
  );
  if (result.rowCount !== 1) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

sharedGroups.get("/:id/members", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);
  const guard = await memberGuard(c, user.user_id, id);
  if (!guard.ok) return c.json({ error: "Not found" }, 404);
  return c.json({ members: await listGroupMembers(user.user_id, id) });
});

sharedGroups.post("/:id/invites", requireAuth, async (c) => {
  const user = c.get("user");
  const groupId = c.req.param("id");
  if (!uuidRe.test(groupId)) return c.json({ error: "Not found" }, 404);
  const guard = await memberGuard(c, user.user_id, groupId);
  if (!guard.ok) return c.json({ error: "Not found" }, 404);
  if (!guard.isOwner) {
    return c.json({ error: "Only the owner can invite members." }, 403);
  }

  const body = await readJson(c);
  const inviteeEmail = normalizeEmail(String(body.email ?? ""));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail)) {
    return c.json(
      { fieldErrors: { email: "Please enter a valid email address." } },
      400
    );
  }

  // Raw token shown once in the response/console; only its hash is stored.
  const rawToken = randomBytes(24).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);

  try {
    const inviteId = await withUser(user.user_id, (client) =>
      insertInvite(client, {
        groupId,
        inviteeEmail,
        tokenHash,
        invitedBy: user.user_id,
        expiresAt,
      })
    );

    // Console-delivered until the C2 email provider lands (DEV-ENV §7).
    console.log(
      `[email] To: ${inviteeEmail} | You're invited to a MoneyMind group — accept within ${INVITE_DAYS} days: ${inviteUrlFor(rawToken)}`
    );

    return c.json({
      success: true,
      invite: { id: inviteId },
      invite_url: inviteUrlFor(rawToken),
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("[api] create invite failed:", err);
    return c.json(
      { error: "Could not send the invite. Please try again." },
      500
    );
  }
});

sharedGroups.get("/:id/invites", requireAuth, async (c) => {
  const user = c.get("user");
  const groupId = c.req.param("id");
  if (!uuidRe.test(groupId)) return c.json({ error: "Not found" }, 404);
  const guard = await memberGuard(c, user.user_id, groupId);
  if (!guard.ok) return c.json({ error: "Not found" }, 404);
  if (!guard.isOwner) {
    return c.json({ error: "Only the owner can view invites." }, 403);
  }
  return c.json({ invites: await listPendingInvites(user.user_id, groupId) });
});

sharedGroups.delete("/:id/invites/:inviteId", requireAuth, async (c) => {
  const user = c.get("user");
  const groupId = c.req.param("id");
  const inviteId = c.req.param("inviteId");
  if (!uuidRe.test(groupId) || !uuidRe.test(inviteId)) {
    return c.json({ error: "Not found" }, 404);
  }
  const guard = await memberGuard(c, user.user_id, groupId);
  if (!guard.ok) return c.json({ error: "Not found" }, 404);
  if (!guard.isOwner) {
    return c.json({ error: "Only the owner can revoke invites." }, 403);
  }

  const result = await withUser(user.user_id, (client) =>
    revokeInvite(client, {
      ownerId: user.user_id,
      groupId,
      inviteId,
    })
  );
  if (result.rowCount !== 1) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

sharedGroups.get("/:id/transactions", requireAuth, async (c) => {
  const user = c.get("user");
  const groupId = c.req.param("id");
  if (!uuidRe.test(groupId)) return c.json({ error: "Not found" }, 404);
  const guard = await memberGuard(c, user.user_id, groupId);
  if (!guard.ok) return c.json({ error: "Not found" }, 404);

  const limitRaw = Number(c.req.query("limit") ?? 200);
  const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 200));
  return c.json({
    transactions: await listGroupTransactions(user.user_id, groupId, limit),
  });
});

sharedGroups.get("/:id/transactions/export", requireAuth, async (c) => {
  const user = c.get("user");
  const groupId = c.req.param("id");
  if (!uuidRe.test(groupId)) return c.json({ error: "Not found" }, 404);
  const guard = await memberGuard(c, user.user_id, groupId);
  if (!guard.ok) return c.json({ error: "Not found" }, 404);

  const rows = await listGroupTransactions(user.user_id, groupId, 500);
  const header = ["Date", "Type", "Description", "Amount", "Added By"];
  const csvRows = rows.map((t) => [
    t.date,
    t.type,
    t.description ?? "",
    (t.type === "income" ? "" : "-") + t.amount.toFixed(2),
    t.added_by_email,
  ]);
  const csv =
    "\uFEFF" +
    [header, ...csvRows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="group-${groupId.slice(0, 8)}-transactions.csv"`,
    },
  });
});

sharedGroups.delete("/:id/members/:userId", requireAuth, async (c) => {
  const user = c.get("user");
  const groupId = c.req.param("id");
  const targetUserId = Number(c.req.param("userId"));
  if (!uuidRe.test(groupId) || !Number.isInteger(targetUserId)) {
    return c.json({ error: "Not found" }, 404);
  }
  const guard = await memberGuard(c, user.user_id, groupId);
  if (!guard.ok) return c.json({ error: "Not found" }, 404);
  if (!guard.isOwner) {
    return c.json({ error: "Only the owner can remove members." }, 403);
  }
  if (targetUserId === user.user_id) {
    return c.json(
      { error: "The owner can't be removed — transfer ownership first." },
      409
    );
  }

  const result = await withUser(user.user_id, (client) =>
    setMemberRemoved(client, {
      groupId,
      memberUserId: targetUserId,
      actingUserId: user.user_id,
    })
  );
  if (result.rowCount !== 1) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

sharedGroups.post("/:id/leave", requireAuth, async (c) => {
  const user = c.get("user");
  const groupId = c.req.param("id");
  if (!uuidRe.test(groupId)) return c.json({ error: "Not found" }, 404);
  const guard = await memberGuard(c, user.user_id, groupId);
  if (!guard.ok) return c.json({ error: "Not found" }, 404);
  if (guard.isOwner) {
    return c.json(
      { error: "Owners can't leave their own group — delete it or transfer ownership." },
      409
    );
  }

  const result = await withUser(user.user_id, (client) =>
    leaveGroup(client, { userId: user.user_id, groupId })
  );
  if (result.rowCount !== 1) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

sharedGroups.post("/:id/transfer-ownership", requireAuth, async (c) => {
  const user = c.get("user");
  const groupId = c.req.param("id");
  const body = await readJson(c);
  const newOwnerId = Number(body.new_owner_id ?? NaN);
  if (!uuidRe.test(groupId) || !Number.isInteger(newOwnerId)) {
    return c.json({ error: "Invalid request." }, 400);
  }
  const guard = await memberGuard(c, user.user_id, groupId);
  if (!guard.ok) return c.json({ error: "Not found" }, 404);
  if (!guard.isOwner) {
    return c.json({ error: "Only the owner can transfer ownership." }, 403);
  }
  if (newOwnerId === user.user_id) {
    return c.json({ error: "You already own this group." }, 400);
  }

  const transferred = await withUser(user.user_id, (client) =>
    transferOwnership(client, {
      ownerId: user.user_id,
      groupId,
      newOwnerId,
    })
  );
  if (!transferred) return c.json({ error: "That user isn't an active member." }, 404);
  return c.json({ success: true });
});

export { sharedGroups };
