import { Hono } from "hono";
import { insertNotifications, pruneNotifications } from "../queries/notifications";
import {
  buildAccountAlerts,
  buildBudgetAlerts,
  buildDebtAlerts,
  generateBillAlerts,
  generateGoalAlerts,
  generateSubscriptionAlerts,
  insertGeneratedAlerts,
  listUsersWithActivity,
  type GenerateCounts,
} from "../queries/notifications-generate";
import type { NewNotification } from "../queries/notifications";

const jobs = new Hono();

const GENERATORS = ["bills", "subscriptions", "budgets", "accounts", "goals", "debts"] as const;
type GeneratorName = (typeof GENERATORS)[number];

/**
 * Nightly notification + retention worker. Guarded by CRON_SECRET; invoked by
 * Vercel Cron (or any scheduler) with header `x-cron-secret`.
 * `?job=` selects one generator (all|bills|subscriptions|budgets|accounts|
 * goals|debts); retention pruning always runs. Per-user fan-out below is a
 * deliberate bounded once-daily loop (see DEV-ENV nightly jobs): routes/
 * carries no SQL and no per-row query loops — module queries stay batched.
 */
jobs.get("/run", async (c) => {
  if (c.req.query("secret") != null) {
    return c.json({ error: "Secret must be sent via the x-cron-secret header." }, 400);
  }
  const secret = c.req.header("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const job = c.req.query("job") ?? "all";
  if (job !== "all" && !(GENERATORS as readonly string[]).includes(job)) {
    return c.json({ error: "Unknown job. Use ?job=all|bills|subscriptions|budgets|accounts|goals|debts." }, 400);
  }
  const wanted = (name: GeneratorName): boolean => job === "all" || job === name;
  const counts: GenerateCounts = {};
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  if (wanted("bills")) counts.bills = await generateBillAlerts();
  if (wanted("subscriptions")) counts.subscriptions = await generateSubscriptionAlerts();
  if (wanted("goals")) counts.goals = await generateGoalAlerts();

  if (wanted("accounts") || wanted("budgets") || wanted("debts")) {
    const userIds = await listUsersWithActivity();
    const batched: NewNotification[] = [];
    for (const userId of userIds) {
      if (wanted("accounts")) batched.push(...(await buildAccountAlerts(userId)));
      if (wanted("budgets")) batched.push(...(await buildBudgetAlerts(userId, month, year)));
      if (wanted("debts")) batched.push(...(await buildDebtAlerts(userId)));
    }
    counts.fanout = await insertGeneratedAlerts(batched);
  }

  const pruned = await pruneNotifications();
  counts.pruned = pruned.dismissed + pruned.expired;
  const processed = Object.entries(counts)
    .filter(([name]) => name !== "pruned")
    .reduce((sum, [, n]) => sum + n, 0);
  console.log(
    JSON.stringify({ level: "info", msg: "jobs_run", job, counts, processed })
  );
  return c.json({ ok: true, processed, jobs: counts });
});

export { jobs };