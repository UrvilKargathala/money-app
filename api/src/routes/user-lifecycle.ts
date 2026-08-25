import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson } from "./helpers";
import {
  listActiveSessions,
  revokeSession,
} from "../queries/user-tokens";
import {
  getProfile,
  updateProfileFields,
  updateSettings,
  setAvatarUrl,
  deactivateAccount,
  restoreDeactivatedAccount,
  purgeAccount,
  getAuditLogs,
  loadAllUserData,
} from "../queries/user-lifecycle";
import { getObjectStorage } from "../utils/object-storage";

const userLifecycle = new Hono();

userLifecycle.get("/profile", requireAuth, async (c) => {
  const user = c.get("user");
  const profile = await getProfile(user.user_id);
  if (!profile) return c.json({ error: "Not found" }, 404);
  return c.json({ profile });
});

userLifecycle.patch("/profile", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const fullName =
    body.full_name === undefined ? null : String(body.full_name ?? "").trim() || null;
  const bio = body.bio === undefined ? null : String(body.bio ?? "").trim() || null;

  if (fullName !== null && fullName.length > 100) {
    return c.json(
      { fieldErrors: { full_name: "Name must be 100 characters or fewer." } },
      400
    );
  }

  await withUser(user.user_id, (client) =>
    updateProfileFields(client, { userId: user.user_id, fullName, bio })
  );
  return c.json({ success: true });
});

userLifecycle.patch("/settings", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const fields: Record<string, string | number | null> = {};
  if (body.currency !== undefined) fields.currency = String(body.currency);
  if (body.theme !== undefined) fields.theme = String(body.theme);
  if (body.language !== undefined) fields.language = String(body.language);
  if (body.monthly_income !== undefined)
    fields.monthly_income =
      body.monthly_income === null ? null : Number(body.monthly_income);
  if (body.notifications_enabled !== undefined)
    fields.notifications_enabled =
      body.notifications_enabled === true || body.notifications_enabled === 1 ? 1 : 0;

  if (Object.keys(fields).length === 0) {
    return c.json({ error: "Nothing to update." }, 400);
  }

  await withUser(user.user_id, (client) =>
    updateSettings(client, { userId: user.user_id, fields })
  );
  return c.json({ success: true });
});

userLifecycle.post("/avatar", requireAuth, async (c) => {
  const user = c.get("user");
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.byteLength === 0) return c.json({ error: "Empty upload." }, 400);
  if (bytes.byteLength > 2 * 1024 * 1024) {
    return c.json({ error: "Avatar must be 2MB or smaller." }, 400);
  }
  const contentType = c.req.header("content-type") ?? "image/png";
  if (!contentType.startsWith("image/")) {
    return c.json({ error: "Only image files are accepted." }, 400);
  }

  try {
    const storage = getObjectStorage();
    const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
    const stored = await storage.put(`avatars/${user.user_id}/${Date.now()}.${ext}`, bytes);
    await withUser(user.user_id, (client) => {
      setAvatarUrl(client, user.user_id, stored.path);
      return Promise.resolve();
    });
    return c.json({ success: true, avatar_url: stored.path });
  } catch (err) {
    console.error("[api] avatar upload failed:", err);
    return c.json({ error: "Could not upload the avatar. Please try again." }, 500);
  }
});

userLifecycle.get("/sessions", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({
    sessions: await listActiveSessions(user.user_id, user.token_id),
  });
});

userLifecycle.delete("/sessions/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const tokenId = Number(c.req.param("id"));
  if (!Number.isInteger(tokenId)) {
    return c.json({ error: "Invalid session id." }, 400);
  }
  const result = await withUser(user.user_id, (client) =>
    revokeSession(client, user.user_id, tokenId)
  );
  if (result.rowCount !== 1) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

userLifecycle.post("/deactivate", requireAuth, async (c) => {
  const user = c.get("user");
  await withUser(user.user_id, (client) => deactivateAccount(client, user.user_id));
  return c.json({
    success: true,
    message: "Account deactivated. Data will be permanently purged after 30 days.",
  });
});

userLifecycle.post("/restore", requireAuth, async (c) => {
  const user = c.get("user");
  const restored = await withUser(user.user_id, (client) =>
    restoreDeactivatedAccount(client, user.user_id)
  );
  if (!restored) {
    return c.json(
      { error: "No deactivated account found within the grace period." },
      404
    );
  }
  return c.json({ success: true });
});

userLifecycle.delete("/", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    purgeAccount(client, user.user_id)
  );

  switch (result) {
    case "NOT_DEACTIVATED":
      return c.json({ error: "Deactivate first before purging." }, 409);
    case "IN_GRACE":
      return c.json(
        { error: "Purge available after the 30-day grace period ends." },
        403
      );
    default:
      return c.json({ success: true });
  }
});

userLifecycle.get("/data-copy", requireAuth, async (c) => {
  const user = c.get("user");
  const data = await loadAllUserData(user.user_id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="moneymind-data-copy-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});

userLifecycle.get("/audit-logs", requireAuth, async (c) => {
  const user = c.get("user");
  const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25) || 25));
  const logs = await getAuditLogs(user.user_id, limit, (page - 1) * limit);
  return c.json({ logs });
});

export { userLifecycle };
