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
 * Vercel Cron (or any scheduler) with `?secret=` query param or the
 * `x-cron-secret` header (Vercel Cron cannot send custom headers, so the
 * query param is the supported path). `?job=` selects one generator
 * (all|bills|subscriptions|budgets|accounts|goals|debts); retention pruning
 * always runs. Each generator is isolated: one failure is recorded and the
 * rest still run (partial 207 response). Per-user fan-out below is a
 * deliberate bounded once-daily loop (see DEV-ENV nightly jobs): routes/
 * carries no SQL and no per-row query loops — module queries stay batched.
 */
jobs.get("/run", async (c) => {
  const expected = process.env.CRON_SECRET;
  const viaQuery = c.req.query("secret");
  const viaHeader = c.req.header("x-cron-secret");
  if (!expected || (viaQuery !== expected && viaHeader !== expected)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const job = c.req.query("job") ?? "all";
  if (job !== "all" && !(GENERATORS as readonly string[]).includes(job)) {
    return c.json({ error: "Unknown job. Use ?job=all|bills|subscriptions|budgets|accounts|goals|debts." }, 400);
  }
  const wanted = (name: GeneratorName): boolean => job === "all" || job === name;
  const counts: GenerateCounts = {};
  const errors: Record<string, string> = {};
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  /** Run one generator in isolation: record failure, keep going. */
  async function isolated(name: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      const n = await fn();
      if (typeof n === "number") (counts as Record<string, number>)[name] = n;
    } catch (err) {
      errors[name] = err instanceof Error ? err.message : "Unknown error";
    }
  }

  if (wanted("bills")) await isolated("bills", generateBillAlerts);
  if (wanted("subscriptions")) await isolated("subscriptions", generateSubscriptionAlerts);
  if (wanted("goals")) await isolated("goals", generateGoalAlerts);

  if (wanted("accounts") || wanted("budgets") || wanted("debts")) {
    await isolated("fanout", async () => {
      const userIds = await listUsersWithActivity();
      const batched: NewNotification[] = [];
      for (const userId of userIds) {
        if (wanted("accounts")) batched.push(...(await buildAccountAlerts(userId)));
        if (wanted("budgets")) batched.push(...(await buildBudgetAlerts(userId, month, year)));
        if (wanted("debts")) batched.push(...(await buildDebtAlerts(userId)));
      }
      return insertGeneratedAlerts(batched);
    });
  }

  await isolated("pruned", async () => {
    const pruned = await pruneNotifications();
    return pruned.dismissed + pruned.expired;
  });
  const processed = Object.entries(counts)
    .filter(([name]) => name !== "pruned")
    .reduce((sum, [, n]) => sum + n, 0);
  console.log(
    JSON.stringify({ level: "info", msg: "jobs_run", job, counts, processed, errors })
  );
  const failed = Object.keys(errors).length > 0;
  return c.json({ ok: !failed, processed, jobs: counts, ...(failed ? { errors } : {}) }, failed ? 207 : 200);
});

export { jobs };