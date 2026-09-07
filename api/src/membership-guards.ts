import { capContext } from "./cap-context";
import { createMiddleware } from "hono/factory";
import { getPlan, isPremium, PREMIUM_REQUIRED } from "./entitlements";
import { requireAuth, type AppEnv } from "./middleware";

// Preserve a precise cap error even when older handlers catch database failures.
export const membershipGuards = createMiddleware<AppEnv>(async (c, next) => {
  const state: { message?: string } = {};
  await capContext.run(state, async () => {
    const path = c.req.path;
    if (c.req.method === "PATCH" && (path.startsWith("/api/notification-preferences") || path === "/api/users/me/settings")) {
      const authResponse = await requireAuth(c, async () => {
        const body = await c.req.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) { c.res = c.json({ error: "Provide a JSON object." }, 400); return; }
        const prefs = Array.isArray(body.preferences) ? body.preferences : [];
        if (prefs.some((p: unknown) => !p || typeof p !== "object" || Array.isArray(p))) { c.res = c.json({ error: "Invalid preference entry." }, 400); return; }
        // Feature gating is intentionally disabled until billing is enabled.
        await next();
      });
      if (authResponse) c.res = authResponse;
    } else await next();
    // Starter caps are paused while plans are being finalized.
  });
});
