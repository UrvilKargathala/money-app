import { Hono } from "hono";
import { checkDatabase, getMigrationWatermark } from "../queries/health";

export const health = new Hono();

// Public deploy/uptime signal: DB reachability plus the migration watermark
// that has bitten us before (004 snoozes, 005 investments.updated_at,
// 006 snooze attempt_id, 007 note user templates, 003 report_filters,
// 009 plan_code, 008 bill reminder channel, 002 billing catalog).
// No auth, no PII.
health.get("/", async (c) => {
  const started = Date.now();
  try {
    await checkDatabase();
    const dbMs = Date.now() - started;
    const migrations = await getMigrationWatermark();
    const ok =
      migrations.snoozes &&
      migrations.attempt_id &&
      migrations.investments_updated_at &&
      migrations.note_user_templates &&
      migrations.report_filters &&
      migrations.plan_code &&
      migrations.bill_reminder_channel &&
      migrations.billing_catalog;
    return c.json({ ok, dbMs, migrations }, ok ? 200 : 503);
  } catch {
    return c.json({ ok: false, dbMs: Date.now() - started, migrations: null }, 503);
  }
});
