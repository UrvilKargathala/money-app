import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE } from "./constants";
import { getSessionUserByToken } from "./session";
import type { SessionUser } from "./types";

export type AppEnv = {
  Variables: {
    user: SessionUser;
  };
};

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = await getSessionUserByToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", user);
  await next();
});