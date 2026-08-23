import { Hono } from "hono";

const jobs = new Hono();

/**
 * Export worker trigger (Phase 2). Guarded by CRON_SECRET; invoked by
 * Vercel Cron (or any scheduler) with header `x-cron-secret`.
 */
jobs.get("/run", async (c) => {
  if (c.req.query("secret") != null) {
    return c.json({ error: "Secret must be sent via the x-cron-secret header." }, 400);
  }
  const secret = c.req.header("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return c.json({ ok: true, processed: 0 });
});

export { jobs };