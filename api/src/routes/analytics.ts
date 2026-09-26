import { Hono } from "hono";
import { requireAuth } from "../middleware";
import { recordAccessLog } from "../auth";

const analytics = new Hono();
analytics.post("/events", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!/^[a-z0-9_.:-]+$/i.test(name)) return c.json({ error: "Invalid event name." }, 400);
  await recordAccessLog(c.get("user").user_id, c, `feature:${name}`);
  return c.json({ success: true });
});
export { analytics };
