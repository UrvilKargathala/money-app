import { describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  createAccount,
  createCategory,
  createDebt,
  createExpense,
  createUser,
  fixtureDb,
  postAs,
  rawRequest,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function isoToday(): string {
  return isoInDays(0);
}

async function ensureAccount(): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM accounts WHERE user_id = $1 LIMIT 1`,
    [db.alice.userId]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  return createAccount(db.alice, "Calendar Bank");
}

describe("custom event CRUD", () => {
  it("creates, validates, reads, patches with lock, duplicates and soft-deletes", async () => {
    const bad = await postAs(db.alice, "/api/calendar/events", {
      title: "",
      event_date: "nope",
      amount: "-3",
    });
    expect(bad.status).toBe(400);
    const badBody = (await bad.json()) as { fieldErrors: Record<string, string> };
    expect(badBody.fieldErrors.title).toBeTruthy();
    expect(badBody.fieldErrors.event_date).toBeTruthy();
    expect(badBody.fieldErrors.amount).toBeTruthy();

    const create = await postAs(db.alice, "/api/calendar/events", {
      title: "Rent day",
      event_date: isoInDays(3),
      event_type: "expense",
      amount: "20000",
      color: "red",
    });
    expect(create.status).toBe(200);
    const eventId = (
      (await create.clone().json()) as { event: { id: string } }
    ).event.id;

    // Foreign user can't read.
    const bob = await createUser("cal-bob@moneymind.test");
    const foreignRes = await requestAs(bob, `/api/calendar/events/${eventId}`);
    expect(
      foreignRes.status,
      JSON.stringify({ alice: db.alice.userId, bob: bob.userId, body: await foreignRes.clone().text() })
    ).toBe(404);

    // Duplicate adds a "(copy)" note.
    const dup = await postAs(db.alice, `/api/calendar/events/${eventId}/duplicate`, {});
    expect(dup.status).toBe(200);
    const dupId = ((await dup.json()) as { event: { id: string } }).event.id;
    const dupDetail = (await (
      await requestAs(db.alice, `/api/calendar/events/${dupId}`)
    ).json()) as { event: { title: string } };
    expect(dupDetail.event.title).toContain("(copy)");

    // Patch bumps version; stale version conflicts.
    const patch = await requestAs(db.alice, `/api/calendar/events/${eventId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "paid via UPI", version: 1 }),
    });
    expect(patch.status).toBe(200);
    const stale = await requestAs(db.alice, `/api/calendar/events/${eventId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "stale", version: 1 }),
    });
    expect(stale.status).toBe(409);

    // Soft delete hides from detail.
    const del = await requestAs(db.alice, `/api/calendar/events/${eventId}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    expect((await requestAs(db.alice, `/api/calendar/events/${eventId}`)).status).toBe(404);
  });

  it("rejects unknown accounts on create", async () => {
    const res = await postAs(db.alice, "/api/calendar/events", {
      title: "Ghost",
      event_date: isoToday(),
      account_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      fieldErrors?: { account_id?: string };
      error?: string;
    };
    expect(body.fieldErrors?.account_id ?? body.error).toBeTruthy();
  });
});

describe("month grid composer", () => {
  it("composes derived events from every source in one request", async () => {
    const accountId = await ensureAccount();
    const catId = await createCategory(db.alice, "Cal Cat");

    // Bill due day 15 â†’ clamped chip in the current month.
    await postAs(db.alice, "/api/bills", {
      name: "Internet",
      amount: "800",
      due_day: 31,
      frequency: "monthly",
    });
    // Subscription renewing this week.
    await postAs(db.alice, "/api/subscriptions", {
      service_name: "Netflix",
      amount: "649",
      frequency: "monthly",
      next_renewal_date: isoInDays(2),
    });
    // Debt EMI scheduled inside window via amortization regenerate.
    const debtRes = await postAs(db.alice, "/api/debts", {
      name: "Bike Loan",
      type: "personal_loan",
      principal_original: "60000",
      principal_outstanding: "60000",
      interest_rate: "11",
      emi_amount: "5300",
      tenure_months: "12",
      start_date: new Date().toISOString().slice(0, 10),
    });
    void debtRes;
    // SIP installment upcoming.
    const investRes = await postAs(db.alice, "/api/investments", {
      name: "Index Fund SIP Target",
      type: "mutual_fund",
      units: "100",
      buy_price: "100",
      current_price: "110",
      purchase_date: "2026-01-10",
    });
    const holdingId = ((await investRes.json()) as { investment: { id: string } }).investment.id;
    await postAs(db.alice, "/api/sips", {
      investment_id: holdingId,
      amount: "5000",
      frequency: "monthly",
      next_date: isoInDays(4),
      start_date: isoToday(),
    });
    // Goal target date: must be in the future AND inside the current month.
    const nowD = new Date();
    const endOfMonth = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate();
    const goalDay = Math.min(nowD.getDate() + 5, endOfMonth);
    const goalDate = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-${String(goalDay).padStart(2, "0")}`;
    await postAs(db.alice, "/api/goals", {
      name: "Emergency Fund",
      target_amount: "300000",
      target_date: goalDate,
      priority: "high",
    });
    // Recurring income template.
    await postAs(db.alice, "/api/recurring-transactions", {
      type: "income",
      amount: "95000",
      description: "Salary",
      frequency: "monthly",
      interval_value: 1,
      end_type: "never",
      next_due_date: isoInDays(6),
      account_id: accountId,
    });
    // Custom expense event linked to an account (projection participates).
    const customRes = await postAs(db.alice, "/api/calendar/events", {
      title: "Laptop purchase",
      event_date: isoInDays(5),
      event_type: "expense",
      amount: "65000",
      account_id: accountId,
    });
    expect(customRes.status).toBe(200);

    const now = new Date();
    const grid = await requestAs(
      db.alice,
      `/api/calendar/events?month=${now.getMonth() + 1}&year=${now.getFullYear()}`
    );
    expect(grid.status).toBe(200);
    const body = (await grid.json()) as {
      events: { source: string; label: string; deep_link: string }[];
      day_counts: Record<string, number>;
    };
    const sources = new Set(body.events.map((e) => e.source));
    expect(sources.has("bill")).toBe(true);
    expect(sources.has("subscription")).toBe(true);
    expect(sources.has("debt_emi")).toBe(true);
    expect(sources.has("sip")).toBe(true);
    expect(sources.has("goal")).toBe(true);
    expect(sources.has("recurring")).toBe(true);
    expect(sources.has("custom")).toBe(true);

    // Day badges present.
    expect(Object.keys(body.day_counts).length).toBeGreaterThan(0);

    // Deep links point at module screens.
    const sub = body.events.find((e) => e.source === "subscription")!;
    expect(sub.deep_link).toBe("/subscriptions");

    // Day-detail mode returns totals.
    const dayRes = await requestAs(
      db.alice,
      `/api/calendar/events?date=${isoInDays(2)}`
    );
    expect(dayRes.status).toBe(200);
    const dayBody = (await dayRes.json()) as {
      events: unknown[];
      total_inflow: number;
      total_outflow: number;
    };
    expect(Array.isArray(dayBody.events)).toBe(true);
  });

  it("explicit month path mirrors query-param grid", async () => {
    const now = new Date();
    const a = await requestAs(
      db.alice,
      `/api/calendar/events?month=${now.getMonth() + 1}&year=${now.getFullYear()}`
    );
    const b = await requestAs(
      db.alice,
      `/api/calendar/month/${now.getMonth() + 1}/${now.getFullYear()}`
    );
    expect(b.status).toBe(200);
    const aEvents = ((await a.json()) as { events: unknown[] }).events.length;
    const bEvents = ((await b.json()) as { events: unknown[] }).events.length;
    expect(aEvents).toBe(bEvents);
  });

  it("tax deadlines registry is year-aware config", async () => {
    const res = await requestAs(db.alice, "/api/calendar/tax-deadlines?year=2027");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      year: number;
      deadlines: { date: string; label: string; past: boolean }[];
    };
    expect(body.year).toBe(2027);
    const dates = body.deadlines.map((d) => d.date);
    expect(dates).toContain("2027-07-31");
    expect(dates).toContain("2027-04-01");
    expect(body.deadlines.every((d) => d.past === false)).toBe(true); // future year
  });
});

describe("cashflow projection", () => {
  it("projects balances forward and flags negative days", async () => {
    const accountId = await createAccount(db.alice, "Projection Wallet");
    const catId = await createCategory(db.alice, "Proj Cat");
    await createExpense(db.alice, accountId, catId, 1000, isoToday());

    // Outflow of 5000 in 3 days against a ~99k balance stays positive;
    // outflow of 500000 drives it negative.
    await postAs(db.alice, "/api/calendar/events", {
      title: "Big purchase",
      event_date: isoInDays(3),
      event_type: "expense",
      amount: "500000",
      account_id: accountId,
    });

    const res = await requestAs(
      db.alice,
      "/api/calendar/cashflow-projection?window=30"
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      projections: {
        account_id: string;
        balance_today: number;
        balance_plus7: number;
        balance_plus30: number;
        negative_days: string[];
      }[];
    };
    const mine = body.projections.find((p) => p.account_id === accountId)!;
    expect(mine.balance_plus30).toBeLessThan(mine.balance_today);
    expect(mine.negative_days.length).toBeGreaterThan(0);
    // Negative only after the big purchase lands (day +3).
    expect(mine.negative_days[0] >= isoInDays(3)).toBe(true);
  });

  it("upcoming groups by day with per-day totals and combined net", async () => {
    const res = await requestAs(db.alice, "/api/calendar/upcoming?window=30");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      net_cashflow: number;
      days: { date: string; inflow_total: number; outflow_total: number }[];
    };
    expect(typeof body.net_cashflow).toBe("number");
    for (const day of body.days) {
      expect(day.inflow_total).toBeGreaterThanOrEqual(0);
      expect(day.outflow_total).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("cross-user isolation", () => {
  it("calendar events are scoped per user", async () => {
    await postAs(db.alice, "/api/calendar/events", {
      title: "Alice Private Event",
      event_date: isoToday(),
    });
    const bob = await createUser("cal-bob2@moneymind.test");

    const bobGrid = (await (
      await requestAs(bob, "/api/calendar/events")
    ).json()) as { events: { label: string }[] };
    expect(bobGrid.events.map((e) => e.label)).not.toContain("Alice Private Event");

    // Bob's projection doesn't include alice's accounts.
    const proj = (await (
      await requestAs(bob, "/api/calendar/cashflow-projection?window=30")
    ).json()) as { projections: unknown[] };
    expect(proj.projections).toEqual([]);
  });
});
