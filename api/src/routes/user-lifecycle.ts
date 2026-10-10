import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson, requestIdOf, serverError } from "./helpers";
import { parseAmount } from "../validation";
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
import { getObjectStorage, isStorageMisconfigured } from "../utils/object-storage";
import { sniffImageKind } from "../ocr/preprocess";

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
  if (body.currency !== undefined) {
    const currency = String(body.currency);
    if (!["INR", "USD", "EUR"].includes(currency)) {
      return c.json({ fieldErrors: { currency: "Currency must be INR, USD or EUR." } }, 400);
    }
    fields.currency = currency;
  }
  if (body.theme !== undefined) {
    const theme = String(body.theme);
    if (!["light", "dark", "system"].includes(theme)) {
      return c.json({ fieldErrors: { theme: "Theme must be light, dark or system." } }, 400);
    }
    fields.theme = theme;
  }
  if (body.language !== undefined) fields.language = String(body.language).slice(0, 16);
  if (body.monthly_income !== undefined) {
    if (body.monthly_income === null) {
      fields.monthly_income = null;
    } else {
      const income = parseAmount(body.monthly_income);
      if (income === null || !Number.isFinite(income) || income < 0) {
        return c.json({ fieldErrors: { monthly_income: "Enter a valid monthly income." } }, 400);
      }
      fields.monthly_income = income;
    }
  }
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

function avatarContentType(path: string): string {
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  return "image/png";
}

// Streams the caller's own avatar bytes. 404 when none is set, so the UI
// always has a clean fallback (initials) instead of a broken image.
userLifecycle.get("/avatar", requireAuth, async (c) => {
  const user = c.get("user");
  const profile = await getProfile(user.user_id);
  if (!profile?.avatar_url) return c.json({ error: "Not found" }, 404);
  try {
    const bytes = await getObjectStorage().get(profile.avatar_url);
    return new Response(bytes.slice().buffer as ArrayBuffer, {
      headers: { "content-type": avatarContentType(profile.avatar_url), "cache-control": "private, max-age=3600" },
    });
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
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
  // Trust bytes, not headers: curl can claim image/png with JS bytes.
  const sniffed = sniffImageKind(bytes);
  if (sniffed !== "jpeg" && sniffed !== "png" && sniffed !== "webp") {
    return c.json({ error: "Only JPEG, PNG or WebP images are accepted." }, 400);
  }

  try {
    const storage = getObjectStorage();
    // Stable per-user key: re-uploads replace instead of accumulating
    // timestamped orphans. Previous blob (different key) is deleted.
    // Extension comes from sniffed bytes, never the client header.
    const ext = sniffed === "webp" ? "webp" : sniffed === "jpeg" ? "jpg" : "png";
    const key = `avatars/${user.user_id}/avatar.${ext}`;
    const previous = (await getProfile(user.user_id))?.avatar_url ?? null;
    const stored = await storage.put(key, bytes, `image/${sniffed}`);
    await withUser(user.user_id, (client) => {
      setAvatarUrl(client, user.user_id, stored.path);
      return Promise.resolve();
    });
    if (previous && previous !== stored.path) {
      await storage.delete(previous).catch(() => {});
    }
    return c.json({ success: true, avatar_url: "/api/users/me/avatar" });
  } catch (err) {
    console.error("[api] avatar upload failed:", err);
    if (isStorageMisconfigured(err)) {
      return c.json(
        { error: "Avatar storage is not configured. Please contact support.", code: "user_lifecycle_avatar_storage_misconfigured", requestId: requestIdOf(c) },
        503
      );
    }
    return serverError(c, "user_lifecycle_upload_avatar_failed", "Could not upload the avatar. Please try again.");
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
