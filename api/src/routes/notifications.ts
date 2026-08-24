import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson, isUniqueViolation } from "./helpers";
import {
  bulkAction,
  dismissNotification,
  getNotification,
  getPreferenceMatrix,
  getUnreadCount,
  listEmailLog,
  listNotifications,
  markAllRead,
  listSince,
  markRead,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  restoreNotification,
  searchArchive,
  upsertPreference,
} from "../queries/notifications";

const notifications = new Hono();

const uuidRe = /^[0-9a-f-]{36}$/i;

/** Feed â€” 25/page with filter + type/module facets. */
notifications.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const filterParam = c.req.query("filter") || "all";
  const filter = ["all", "unread", "read"].includes(filterParam)
    ? (filterParam as "all" | "unread" | "read")
    : "all";
  const type = c.req.query("type") || null;
  const module = c.req.query("module") || null;
  const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25) || 25));

  const { items, total } = await listNotifications(user.user_id, {
    filter,
    type,
    module,
    limit,
    offset: (page - 1) * limit,
  });

  return c.json({
    notifications: items,
    total,
    page,
    limit,
  });
});

notifications.get("/unread-count", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ unread_count: await getUnreadCount(user.user_id) });
});

/** Simplified poll-based stream: returns latest since a timestamp. */
notifications.get("/stream", requireAuth, async (c) => {
  const user = c.get("user");
  const since = c.req.query("since") || null;
  const validSince =
    since && /^\d{4}-\d{2}-\d{2}/.test(since) ? since : null;

  return c.json({
    latest_server_time: new Date().toISOString(),
    notifications: await listSince(user.user_id, validSince),
  });
});

notifications.get("/archive", requireAuth, async (c) => {
  const user = c.get("user");
  const search = c.req.query("search") || null;
  const type = c.req.query("type") || null;
  const module = c.req.query("module") || null;
  const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25) || 25));

  return c.json({
    archive: await searchArchive(user.user_id, {
      search,
      type,
      module,
      limit,
      offset: (page - 1) * limit,
    }),
  });
});

/** Preview email body for a notification template (no actual send). */
notifications.post("/email/preview", requireAuth, async (c) => {
  const body = await readJson(c);
  const type = String(body.type ?? "info");
  const title = String(body.title ?? "Sample Notification");
  const message = String(body.message ?? "This is a sample notification message.");

  if (!NOTIFICATION_TYPES.includes(type as never)) {
    return c.json({ fieldErrors: { type: "Invalid notification type." } }, 400);
  }

  return c.json({
    preview: {
      subject: `[MoneyMind] ${title}`,
      body_html: `<div style="font-family:sans-serif;padding:16px"><h2>${title}</h2><p>${message}</p><p style="color:#999;font-size:12px">Sent by MoneyMind (${type})</p></div>`,
      body_text: `${title}\n\n${message}\n\nâ€” MoneyMind (${type})`,
    },
  });
});

// ---- :id-scoped routes (register AFTER static paths) ----

notifications.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);
  const notification = await getNotification(user.user_id, id);
  if (!notification) return c.json({ error: "Not found" }, 404);
  return c.json({ notification });
});

notifications.post("/read-all", requireAuth, async (c) => {
  const user = c.get("user");
  await withUser(user.user_id, (client) => markAllRead(client, user.user_id));
  return c.json({ success: true });
});

notifications.post("/bulk", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).map(String).filter((v) => uuidRe.test(v))
    : [];
  const action = String(body.action ?? "");
  if (ids.length === 0 || ids.length > 200) {
    return c.json({ error: "Provide between 1 and 200 ids." }, 400);
  }
  if (!["read", "dismiss"].includes(action)) {
    return c.json({ error: "action must be read or dismiss." }, 400);
  }

  const affected = await withUser(user.user_id, (client) =>
    bulkAction(client, {
      userId: user.user_id,
      ids,
      action: action as "read" | "dismiss",
    })
  );
  return c.json({ success: true, affected });
});

notifications.post("/:id/read", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);

  const result = await withUser(user.user_id, (client) =>
    markRead(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found or already read." }, 404);
  }
  return c.json({ success: true });
});

notifications.post("/:id/dismiss", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);

  const result = await withUser(user.user_id, (client) =>
    dismissNotification(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found or already dismissed." }, 404);
  }
  return c.json({ success: true });
});

notifications.post("/:id/restore", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);

  const result = await withUser(user.user_id, (client) =>
    restoreNotification(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found or not dismissed." }, 404);
  }
  return c.json({ success: true });
});

/** Returns the deep_link target so the client can navigate to the source module. */
notifications.post("/:id/action", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);

  const notification = await getNotification(user.user_id, id);
  if (!notification) return c.json({ error: "Not found" }, 404);

  // Mark read on action.
  if (!notification.is_read) {
    await withUser(user.user_id, (client) =>
      markRead(client, user.user_id, id)
    );
  }

  return c.json({
    success: true,
    deep_link: notification.deep_link,
    data_payload: notification.data_payload,
  });
});

export { notifications };
