import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson } from "./helpers";
import {
  getPreferenceMatrix,
  listEmailLog,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  upsertPreference,
} from "../queries/notifications";
import { getEntitlement } from "../queries/entitlements";

const notificationPrefs = new Hono();

notificationPrefs.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ preferences: await getPreferenceMatrix(user.user_id) });
});

notificationPrefs.patch("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = (await readJson(c)) as {
    preferences?: {
      notification_type?: unknown;
      channel?: unknown;
      is_enabled?: unknown;
    }[];
  };

  const prefs = Array.isArray(body.preferences) ? body.preferences : [];
  if (prefs.length === 0 || prefs.length > 20) {
    return c.json({ error: "Provide between 1 and 20 preference entries." }, 400);
  }

  const fieldErrors: Record<string, string> = {};
  const valid: {
    type: string;
    channel: string;
    enabled: number;
  }[] = [];

  prefs.forEach((p, i) => {
    const type = String(p.notification_type ?? "");
    const channel = String(p.channel ?? "");
    const enabled = p.is_enabled === true || p.is_enabled === 1 ? 1 : 0;
    if (!NOTIFICATION_TYPES.includes(type as never)) {
      fieldErrors[`preferences.${i}.notification_type`] = "Invalid type.";
    }
    if (!NOTIFICATION_CHANNELS.includes(channel as never)) {
      fieldErrors[`preferences.${i}.channel`] = "Channel must be in_app or email.";
    }
    valid.push({ type, channel, enabled });
  });
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  // email channel requires paid
  const needsEmail = valid.some((v) => v.channel === "email" && v.enabled === 1);
  if (needsEmail) {
    const emailEnt = await getEntitlement(user.user_id, "notifications_email");
    if (!emailEnt.allowed || emailEnt.mode !== "in_app_email") return c.json({ error: "plan_locked", feature: "notifications_email", plan: emailEnt.plan }, 403);
  }

  try {
    for (const entry of valid) {
      await withUser(user.user_id, (client) =>
        upsertPreference(client, {
          userId: user.user_id,
          notificationType: entry.type,
          channel: entry.channel,
          isEnabled: entry.enabled,
        })
      );
    }
  } catch (err) {
    console.error("[api] update notification preferences failed:", err);
    return c.json(
      { error: "Could not save preferences. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

/** Toggle a single type × channel cell. */
notificationPrefs.patch("/:type/:channel", requireAuth, async (c) => {
  const user = c.get("user");
  const type = c.req.param("type");
  const channel = c.req.param("channel");
  if (!NOTIFICATION_TYPES.includes(type as never)) {
    return c.json({ error: "Invalid notification type." }, 400);
  }
  if (!NOTIFICATION_CHANNELS.includes(channel as never)) {
    return c.json({ error: "Channel must be in_app or email." }, 400);
  }

  if (channel === "email") {
    const emailEnt = await getEntitlement(user.user_id, "notifications_email");
    if (!emailEnt.allowed || emailEnt.mode !== "in_app_email") return c.json({ error: "plan_locked", feature: "notifications_email", plan: emailEnt.plan }, 403);
  }

  // Toggle: fetch current state then flip.
  const matrix = await getPreferenceMatrix(user.user_id);
  const current = matrix.find(
    (p) => p.notification_type === type && p.channel === channel
  );
  if (!current) return c.json({ error: "Not found" }, 404);

  const newValue = current.is_enabled ? 0 : 1;
  if (channel === "email" && newValue === 1) {
    const emailEnt2 = await getEntitlement(user.user_id, "notifications_email");
    if (!emailEnt2.allowed || emailEnt2.mode !== "in_app_email") return c.json({ error: "plan_locked", feature: "notifications_email", plan: emailEnt2.plan }, 403);
  }
  await withUser(user.user_id, (client) =>
    upsertPreference(client, {
      userId: user.user_id,
      notificationType: type,
      channel,
      isEnabled: newValue,
    })
  );

  return c.json({ success: true, is_enabled: newValue === 1 });
});

const notificationEmailsLog = new Hono();

notificationEmailsLog.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
  return c.json({ emails: await listEmailLog(user.user_id, limit) });
});

export { notificationPrefs, notificationEmailsLog };
