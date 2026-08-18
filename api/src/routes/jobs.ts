import { Hono } from "hono";

const jobs = new Hono();

/**
 * Export worker trigger (Phase 2). Guarded by CRON_SECRET; invoked by
 * Vercel Cron (or any scheduler) with header `x-cron-secret`.
 */
jobs.get("/run", async (c) => {
  const secret = c.req.header("x-cron-secret") ?? c.req.query("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return c.json({ ok: true, processed: 0 });
});

export { jobs };