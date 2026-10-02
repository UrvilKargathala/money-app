import { describe, expect, it } from "vitest";
import { pool } from "../db";
import { fixtureDb, requestAs } from "../test/helpers";
import {
  buildAccountAlerts,
  buildBudgetAlerts,
  buildDebtAlerts,
  generateBillAlerts,
  generateGoalAlerts,
  generateSubscriptionAlerts,
} from "../queries/notifications-generate";

const db = fixtureDb();

function isoInDays(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function feedCount(userId: number): Promise<number> {
  const res = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM notifications WHERE user_id = $1`,
    [userId]
  );
  return Number(res.rows[0]?.n ?? 0);
}

async function feedPayloads(userId: number): Promise<Record<string, unknown>[]> {
  const res = await pool.query<{ data_payload: unknown }>(
    `SELECT data_payload FROM notifications WHERE user_id = $1 ORDER BY created_at`,
    [userId]
  );
  return res.rows.map((r) =>
    typeof r.data_payload === "string"
      ? (JSON.parse(r.data_payload) as Record<string, unknown>)
      : (r.data_payload as Record<string, unknown>)
  );
}

describe("bill alerts", () => {
  it("alerts due-soon bills once, then dedups on re-run", async () => {
    await pool.query(
      `INSERT INTO bills (user_id, name, amount, due_day, frequency, current_period_status)
       VALUES ($1, 'Power Bill', 1200, $2, 'monthly', 'upcoming')`,
      [db.alice.userId, new Date().getDate()]
    );
    expect(await generateBillAlerts()).toBe(1);
    expect(await feedCount(db.alice.userId)).toBe(1);
    // Second run sees the unread alert and inserts nothing.
    expect(await generateBillAlerts()).toBe(0);
    expect(await feedCount(db.alice.userId)).toBe(1);
    const [payload] = await feedPayloads(db.alice.userId);
    expect(payload.kind).toBe("bill_due");
    expect(payload.ref).toBeTruthy();
    expect(payload.period).toMatch(/^\d{4}-\d{2}$/);
  });

  it("skips paid bills and disabled reminder types", async () => {
    await pool.query(
      `INSERT INTO bills (user_id, name, amount, due_day, frequency, current_period_status)
       VALUES ($1, 'Paid Bill', 500, $2, 'monthly', 'paid')`,
      [db.alice.userId, new Date().getDate()]
    );
    await pool.query(
      `INSERT INTO notification_preferences (user_id, notification_type, channel, is_enabled)
       VALUES ($1, 'reminder', 'in_app', 0)`,
      [db.alice.userId]
    );
    await pool.query(
      `INSERT INTO bills (user_id, name, amount, due_day, frequency, current_period_status)
       VALUES ($1, 'Muted Bill', 500, $2, 'monthly', 'upcoming')`,
      [db.alice.userId, new Date().getDate()]
    );
    expect(await generateBillAlerts()).toBe(0);
    expect(await feedCount(db.alice.userId)).toBe(0);
  });

  it("isolates users: bob never sees alice's bills", async () => {
    await pool.query(
      `INSERT INTO bills (user_id, name, amount, due_day, frequency, current_period_status)
       VALUES ($1, 'Alice Power', 1200, $2, 'monthly', 'upcoming')`,
      [db.alice.userId, new Date().getDate()]
    );
    expect(await generateBillAlerts()).toBe(1);
    expect(await feedCount(db.bob.userId)).toBe(0);
  });
});

describe("subscription alerts", () => {
  it("alerts renewals within 7 days with the renewal date as period", async () => {
    await pool.query(
      `INSERT INTO subscriptions (user_id, service_name, amount, frequency, next_renewal_date, status)
       VALUES ($1, 'Music Plus', 299, 'monthly', $2::date, 'active')`,
      [db.alice.userId, isoInDays(3)]
    );
    expect(await generateSubscriptionAlerts()).toBe(1);
    const [payload] = await feedPayloads(db.alice.userId);
    expect(payload).toMatchObject({ kind: "subscription_renewal" });
    expect(payload.period).toBe(isoInDays(3));
    expect(await generateSubscriptionAlerts()).toBe(0);
  });

  it("ignores paused subscriptions and distant renewals", async () => {
    await pool.query(
      `INSERT INTO subscriptions (user_id, service_name, amount, frequency, next_renewal_date, status)
       VALUES ($1, 'Paused Box', 199, 'monthly', $2::date, 'paused')`,
      [db.alice.userId, isoInDays(2)]
    );
    await pool.query(
      `INSERT INTO subscriptions (user_id, service_name, amount, frequency, next_renewal_date, status)
       VALUES ($1, 'Far Box', 199, 'monthly', $2::date, 'active')`,
      [db.alice.userId, isoInDays(60)]
    );
    expect(await generateSubscriptionAlerts()).toBe(0);
  });
});

describe("goal alerts", () => {
  it("alerts behind-pace goals once per month", async () => {
    const created = isoInDays(-60);
    const target = isoInDays(60);
    const goal = await pool.query<{ id: string }>(
      `INSERT INTO goals (user_id, name, target, target_date, status, created_at)
       VALUES ($1, 'Emergency Fund', 12000, $2::date, 'active', $3::date)
       RETURNING id::text AS id`,
      [db.alice.userId, target, created]
    );
    await pool.query(
      `INSERT INTO goal_contributions (user_id, goal_id, amount, date)
       VALUES ($1, $2, 1000, $3::date)`,
      [db.alice.userId, goal.rows[0].id, isoInDays(-30)]
    );
    expect(await generateGoalAlerts()).toBe(1);
    expect(await generateGoalAlerts()).toBe(0);
    const [payload] = await feedPayloads(db.alice.userId);
    expect(payload.kind).toBe("goal_behind");
  });

  it("stays quiet for on-pace goals", async () => {
    const created = isoInDays(-60);
    const target = isoInDays(60);
    const goal = await pool.query<{ id: string }>(
      `INSERT INTO goals (user_id, name, target, target_date, status, created_at)
       VALUES ($1, 'Vacation', 12000, $2::date, 'active', $3::date)
       RETURNING id::text AS id`,
      [db.alice.userId, target, created]
    );
    await pool.query(
      `INSERT INTO goal_contributions (user_id, goal_id, amount, date)
       VALUES ($1, $2, 9000, $3::date)`,
      [db.alice.userId, goal.rows[0].id, isoInDays(-30)]
    );
    expect(await generateGoalAlerts()).toBe(0);
  });
});

describe("account alerts (fan-out)", () => {
  it("alerts asset accounts below ₹1,000", async () => {
    await pool.query(
      `INSERT INTO accounts (user_id, name, type, opening_balance, is_active)
       VALUES ($1, 'Pocket Cash', 'cash', 250, 1)`,
      [db.alice.userId]
    );
    const { insertGeneratedAlerts } = await import(
      "../queries/notifications-generate"
    );
    const rows = await buildAccountAlerts(db.alice.userId);
    expect(rows).toHaveLength(1);
    expect(await insertGeneratedAlerts(rows)).toBe(1);
    // Rebuilt rows dedup against the unread alert.
    expect(await buildAccountAlerts(db.alice.userId)).toHaveLength(0);
  });
});

describe("budget alerts (fan-out)", () => {
  it("alerts crossed, enabled thresholds once per level", async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    await pool.query(
      `INSERT INTO budgets (user_id, amount, month, year, alert_50, alert_80, alert_100, is_active)
       VALUES ($1, 1000, $2, $3, 1, 1, 1, 1)`,
      [db.alice.userId, month, year]
    );
    await pool.query(
      `INSERT INTO transactions (user_id, amount, type, date)
       VALUES ($1, 850, 'expense', CURRENT_DATE)`,
      [db.alice.userId]
    );
    const { insertGeneratedAlerts } = await import(
      "../queries/notifications-generate"
    );
    const rows = await buildBudgetAlerts(db.alice.userId, month, year);
    expect(rows.map((r) => (r.dataPayload as { period: string }).period)).toEqual([
      expect.stringContaining(":50"),
      expect.stringContaining(":80"),
    ]);
    expect(await insertGeneratedAlerts(rows)).toBe(2);
    expect(await buildBudgetAlerts(db.alice.userId, month, year)).toHaveLength(0);
  });
});

describe("debt alerts (fan-out)", () => {
  it("alerts high DTI and missed EMIs, then dedups", async () => {
    await pool.query(`UPDATE user_settings SET monthly_income = 10000 WHERE user_id = $1`, [
      db.alice.userId,
    ]);
    const debt = await pool.query<{ id: string }>(
      `INSERT INTO debts (user_id, name, emi_amount, is_active)
       VALUES ($1, 'Car Loan', 6500, 1) RETURNING id::text AS id`,
      [db.alice.userId]
    );
    const debtId = debt.rows[0].id;
    const lastMonth = new Date();
    lastMonth.setDate(1);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    await pool.query(
      `INSERT INTO amortization_schedule (user_id, debt_id, period, emi_amount, scheduled_date)
       VALUES ($1, $2, 1, 6500, $3::date)`,
      [db.alice.userId, debtId, lastMonth.toISOString().slice(0, 10)]
    );
    const rows = await buildDebtAlerts(db.alice.userId);
    const kinds = rows.map((r) => (r.dataPayload as { kind: string }).kind).sort();
    expect(kinds).toEqual(["debt_dti", "debt_missed"]);
    const { insertGeneratedAlerts } = await import(
      "../queries/notifications-generate"
    );
    expect(await insertGeneratedAlerts(rows)).toBe(2);
    expect(await buildDebtAlerts(db.alice.userId)).toHaveLength(0);
  });
});

describe("jobs/run dispatcher", () => {
  it("rejects unknown job names after auth, keeps secret handling", async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-secret";
    try {
      const bogus = await requestAs(db.alice, "/api/jobs/run?job=bogus", {
        headers: { "x-cron-secret": "test-secret" },
      });
      expect(bogus.status).toBe(400);
      const ok = await requestAs(db.alice, "/api/jobs/run?job=bills", {
        headers: { "x-cron-secret": "test-secret" },
      });
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as { ok: boolean; processed: number; jobs: Record<string, number> };
      expect(body.ok).toBe(true);
      expect(typeof body.jobs.bills).toBe("number");
    } finally {
      process.env.CRON_SECRET = prev;
    }
  });
});

describe("expiry + retention", () => {
  it("readers and badge hide expired rows", async () => {
    await pool.query(
      `INSERT INTO notifications (user_id, type, module, title, message, expires_at)
       VALUES ($1, 'reminder', 'bills', 'Stale', 'Expired yesterday', $2::timestamptz)`,
      [db.alice.userId, isoInDays(-1)]
    );
    const feed = (await (
      await requestAs(db.alice, "/api/notifications")
    ).json()) as { notifications: unknown[]; total: number };
    expect(feed.notifications).toEqual([]);
    expect(feed.total).toBe(0);
    const count = (await (
      await requestAs(db.alice, "/api/notifications/unread-count")
    ).json()) as { unread_count: number };
    expect(count.unread_count).toBe(0);
  });

  it("janitor prunes old dismissed and long-expired rows", async () => {
    const { pruneNotifications } = await import("../queries/notifications");
    const { query } = await import("../db");
    await pool.query(
      `INSERT INTO notifications (user_id, type, module, title, message, is_dismissed, created_at)
       VALUES ($1, 'info', 'system', 'Old dismissal', 'x', 1, CURRENT_TIMESTAMP - INTERVAL '100 days')`,
      [db.alice.userId]
    );
    const pruned = await pruneNotifications({ query });
    expect(pruned.dismissed).toBe(1);
    expect(await feedCount(db.alice.userId)).toBe(0);
  });
});
