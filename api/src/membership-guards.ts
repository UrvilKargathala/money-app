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
        const needsPremium = path.includes("/notification-preferences")
          ? path.endsWith("/email") || prefs.some((p: { channel?: string; is_enabled?: unknown }) => p.channel === "email" && (p.is_enabled === true || p.is_enabled === 1))
          : body.widget_layout !== undefined || body.theme === "dark";
        if (needsPremium && !isPremium(await getPlan(c.get("user").user_id))) c.res = c.json(PREMIUM_REQUIRED, 403);
        else await next();
      });
      if (authResponse) c.res = authResponse;
    } else await next();
    if (state.message) c.res = c.json({ error: state.message, code: "STARTER_LIMIT", upgrade_url: "/pricing" }, 403);
  });
});
