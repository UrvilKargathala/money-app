import { describe, expect, it } from "vitest";
import { pool } from "../db";
import type { PaymentHistoryRow } from "../routes/bills";
import type { Subscription } from "../routes/subscriptions";
import {
  createAccount,
  fixtureDb,
  postAs,
  rawRequest,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

function todayInfo() {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  };
}

async function createSubscription(
  body: Record<string, unknown>
): Promise<Subscription> {
  const res = await postAs(db.alice, "/api/subscriptions", body);
  if (!res.ok) {
    throw new Error(`createSubscription failed: ${res.status} ${await res.text()}`);
  }
  const list = (await (await requestAs(db.alice, "/api/subscriptions")).json()) as {
    subscriptions: Subscription[];
  };
  const found = list.subscriptions.find(
    (s) => s.service_name === body.service_name
  );
  if (!found) throw new Error("createSubscription: not found after create");
  return found;
}

describe("subscriptions auth + validation", () => {
  it("rejects unauthenticated requests", async () => {
    expect((await rawRequest("/api/subscriptions")).status).toBe(401);
    expect((await rawRequest("/api/subscriptions", { method: "POST" })).status).toBe(401);
    expect((await rawRequest("/api/subscriptions/export")).status).toBe(401);
    expect((await rawRequest("/api/subscriptions/due-renewals")).status).toBe(401);
    expect((await rawRequest("/api/subscriptions/monthly-burn")).status).toBe(401);
  });

  it("validates create fields", async () => {
    const res = await postAs(db.alice, "/api/subscriptions", {
      service_name: "",
      amount: "0",
      frequency: "weekly",
      next_renewal_date: "not-a-date",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.service_name).toBeTruthy();
    expect(body.fieldErrors.amount).toBeTruthy();
    expect(body.fieldErrors.frequency).toBeTruthy();
    expect(body.fieldErrors.next_renewal_date).toBeTruthy();

    const noAmount = await postAs(db.alice, "/api/subscriptions", {
      service_name: "Netflix",
      frequency: "monthly",
      next_renewal_date: "2026-09-01",
    });
    expect(noAmount.status).toBe(400);
  });

  it("rejects an account that doesn't exist", async () => {
    const res = await postAs(db.alice, "/api/subscriptions", {
      service_name: "Netflix",
      amount: "649",
      frequency: "monthly",
      next_renewal_date: "2026-09-01",
      account_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.account_id).toBeTruthy();
  });
});

describe("subscriptions CRUD", () => {
  it("lists with monthly equivalent for every frequency", async () => {
    await createSubscription({
      service_name: "Netflix",
      amount: "649",
      frequency: "monthly",
      next_renewal_date: "2099-01-01",
    });
    await createSubscription({
      service_name: "Coursera",
      amount: "6000",
      frequency: "quarterly",
      next_renewal_date: "2099-02-01",
    });
    await createSubscription({
      service_name: "Adobe",
      amount: "12000",
      frequency: "annual",
      next_renewal_date: "2099-03-01",
    });

    const res = await requestAs(db.alice, "/api/subscriptions");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { subscriptions: Subscription[] };
    const byName = new Map(body.subscriptions.map((s) => [s.service_name, s]));
    expect(byName.get("Netflix")?.monthly_equivalent).toBe(649);
    expect(byName.get("Coursera")?.monthly_equivalent).toBe(2000);
    expect(byName.get("Adobe")?.monthly_equivalent).toBe(1000);
    expect(byName.get("Netflix")?.days_until_renewal).toBeGreaterThan(0);
  });

  it("includes account/category names in the list", async () => {
    const account = await createAccount(db.alice, "Savings");
    const sub = await createSubscription({
      service_name: "Netflix",
      amount: "649",
      frequency: "monthly",
      next_renewal_date: "2099-01-01",
      account_id: account,
    });
    const detail = (await (
      await requestAs(db.alice, `/api/subscriptions/${sub.id}`)
    ).json()) as { subscription: Subscription };
    expect(detail.subscription.account_name).toBe("Savings");
    expect(detail.subscription.status).toBe("active");
  });

  it("patch updates and bumps version; stale version gets 409", async () => {
    const sub = await createSubscription({
      service_name: "Netflix",
      amount: "649",
      frequency: "monthly",
      next_renewal_date: "2099-01-01",
    });
    const version = sub.version;

    const ok = await requestAs(db.alice, `/api/subscriptions/${sub.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service_name: "Netflix Premium", version }),
    });
    expect(ok.status).toBe(200);

    const stale = await requestAs(db.alice, `/api/subscriptions/${sub.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service_name: "X", version }),
    });
    expect(stale.status).toBe(409);

    const missing = await requestAs(
      db.alice,
      "/api/subscriptions/00000000-0000-0000-0000-000000000000",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ service_name: "X", version: 1 }),
      }
    );
    expect(missing.status).toBe(404);
  });

  it("pause/resume transitions with 409 on invalid moves", async () => {
    const sub = await createSubscription({
      service_name: "Netflix",
      amount: "649",
      frequency: "monthly",
      next_renewal_date: "2099-01-01",
    });

    const paused = await postAs(db.alice, `/api/subscriptions/${sub.id}/pause`, {});
    expect(paused.status).toBe(200);
    const pauseAgain = await postAs(db.alice, `/api/subscriptions/${sub.id}/pause`, {});
    expect(pauseAgain.status).toBe(409);

    const resumed = await postAs(db.alice, `/api/subscriptions/${sub.id}/resume`, {});
    expect(resumed.status).toBe(200);
    const resumeAgain = await postAs(db.alice, `/api/subscriptions/${sub.id}/resume`, {});
    expect(resumeAgain.status).toBe(409);
  });

  it("cancel archives the subscription; cancel twice gets 409", async () => {
    const sub = await createSubscription({
      service_name: "Netflix",
      amount: "649",
      frequency: "monthly",
      next_renewal_date: "2099-01-01",
    });
    const cancelled = await requestAs(db.alice, `/api/subscriptions/${sub.id}`, {
      method: "DELETE",
    });
    expect(cancelled.status).toBe(200);
    const again = await requestAs(db.alice, `/api/subscriptions/${sub.id}`, {
      method: "DELETE",
    });
    expect(again.status).toBe(409);

    const list = (await (
      await requestAs(db.alice, "/api/subscriptions")
    ).json()) as { subscriptions: Subscription[] };
    expect(list.subscriptions.find((s) => s.id === sub.id)?.status).toBe("cancelled");
  });
});

describe("subscriptions renew", () => {
  it("creates a transaction + payment row and advances the renewal date", async () => {
    const account = await createAccount(db.alice, "Savings");
    const sub = await createSubscription({
      service_name: "Netflix",
      amount: "649",
      frequency: "monthly",
      next_renewal_date: "2026-08-20",
      account_id: account,
    });

    const { label, year } = todayInfo();
    const res = await postAs(db.alice, `/api/subscriptions/${sub.id}/renew`, {});
    expect(res.status).toBe(200);

    const txn = await pool.query<{ amount: string; description: string }>(
      `SELECT amount, description FROM transactions
       WHERE user_id = $1 AND source = 'subscription'`,
      [db.alice.userId]
    );
    expect(txn.rowCount).toBe(1);
    expect(Number(txn.rows[0].amount)).toBe(649);
    expect(txn.rows[0].description).toContain("Netflix");
    expect(txn.rows[0].description).toContain(String(year));

    const pay = await pool.query<{ period_label: string; amount: string }>(
      `SELECT period_label, amount FROM payment_history
       WHERE user_id = $1 AND payable_type = 'subscription' AND payable_id = $2`,
      [db.alice.userId, sub.id]
    );
    expect(pay.rowCount).toBe(1);
    expect(pay.rows[0].period_label).toBe(label);
    expect(Number(pay.rows[0].amount)).toBe(649);

    const detail = (await (
      await requestAs(db.alice, `/api/subscriptions/${sub.id}`)
    ).json()) as { subscription: Subscription };
    expect(detail.subscription.next_renewal_date).toBe("2026-09-20");
    expect(detail.subscription.status).toBe("active");
  });

  it("advances annual subscriptions by one year", async () => {
    const account = await createAccount(db.alice, "Savings");
    const sub = await createSubscription({
      service_name: "Adobe",
      amount: "12000",
      frequency: "annual",
      next_renewal_date: "2026-08-31",
      account_id: account,
    });
    await postAs(db.alice, `/api/subscriptions/${sub.id}/renew`, {});
    const detail = (await (
      await requestAs(db.alice, `/api/subscriptions/${sub.id}`)
    ).json()) as { subscription: Subscription };
    expect(detail.subscription.next_renewal_date).toBe("2027-08-31");
  });

  it("rejects renew on paused/cancelled subscriptions", async () => {
    const account = await createAccount(db.alice, "Savings");
    const paused = await createSubscription({
      service_name: "Spotify",
      amount: "119",
      frequency: "monthly",
      next_renewal_date: "2026-08-20",
      account_id: account,
    });
    await postAs(db.alice, `/api/subscriptions/${paused.id}/pause`, {});
    const res = await postAs(db.alice, `/api/subscriptions/${paused.id}/renew`, {});
    expect(res.status).toBe(409);
  });

  it("requires an account when the subscription has none linked", async () => {
    const sub = await createSubscription({
      service_name: "Spotify",
      amount: "119",
      frequency: "monthly",
      next_renewal_date: "2026-08-20",
    });
    const res = await postAs(db.alice, `/api/subscriptions/${sub.id}/renew`, {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.account_id).toBeTruthy();
  });
});

describe("subscriptions burn + renewals + history", () => {
  it("monthly-burn only counts active subscriptions", async () => {
    await createSubscription({
      service_name: "Netflix",
      amount: "649",
      frequency: "monthly",
      next_renewal_date: "2099-01-01",
    });
    const quarterly = await createSubscription({
      service_name: "Coursera",
      amount: "3000",
      frequency: "quarterly",
      next_renewal_date: "2099-02-01",
    });
    const paused = await createSubscription({
      service_name: "Spotify",
      amount: "119",
      frequency: "monthly",
      next_renewal_date: "2099-03-01",
    });
    await postAs(db.alice, `/api/subscriptions/${paused.id}/pause`, {});
    const cancelled = await createSubscription({
      service_name: "Hotstar",
      amount: "149",
      frequency: "monthly",
      next_renewal_date: "2099-04-01",
    });
    const cancelRes = await requestAs(db.alice, `/api/subscriptions/${cancelled.id}`, {
      method: "DELETE",
    });
    expect(cancelRes.status).toBe(200);
    void quarterly;

    const res = await requestAs(db.alice, "/api/subscriptions/monthly-burn");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { monthly_burn: number };
    expect(body.monthly_burn).toBeCloseTo(649 + 1000, 2);
  });

  it("due-renewals returns only renewals inside the 7-day window", async () => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const inWindow = new Date(now.getTime() + 3 * 86400000);
    const outWindow = new Date(now.getTime() + 20 * 86400000);
    const past = new Date(now.getTime() - 2 * 86400000);

    const near = await createSubscription({
      service_name: "Near",
      amount: "100",
      frequency: "monthly",
      next_renewal_date: fmt(inWindow),
    });
    const far = await createSubscription({
      service_name: "Far",
      amount: "100",
      frequency: "monthly",
      next_renewal_date: fmt(outWindow),
    });
    const overdue = await createSubscription({
      service_name: "Past Due",
      amount: "100",
      frequency: "monthly",
      next_renewal_date: fmt(past),
    });
    void far;

    const res = await requestAs(db.alice, "/api/subscriptions/due-renewals");
    const body = (await res.json()) as {
      items: { id: string; days_until_renewal: number }[];
    };
    const ids = body.items.map((i) => i.id);
    expect(ids).toContain(near.id);
    expect(ids).toContain(overdue.id);
    expect(ids).not.toContain(far.id);
  });

  it("lists payment history and exports it as CSV", async () => {
    const account = await createAccount(db.alice, "Savings");
    const sub = await createSubscription({
      service_name: "Netflix",
      amount: "649",
      frequency: "monthly",
      next_renewal_date: "2026-08-20",
      account_id: account,
    });
    await postAs(db.alice, `/api/subscriptions/${sub.id}/renew`, {});

    const res = await requestAs(db.alice, `/api/subscriptions/${sub.id}/payments`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { payments: PaymentHistoryRow[] };
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0].amount).toBe(649);

    const exportRes = await requestAs(
      db.alice,
      `/api/subscriptions/${sub.id}/payments/export`
    );
    expect(exportRes.status).toBe(200);
    const text = new TextDecoder("utf-8")
      .decode(await exportRes.arrayBuffer())
      .replace(/^\uFEFF/, "");
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("Period,Date,Amount");
    expect(lines[1]).toContain("649.00");
  });

  it("exports subscriptions CSV with computed monthly equivalent", async () => {
    await createSubscription({
      service_name: "Netflix",
      amount: "649",
      frequency: "monthly",
      next_renewal_date: "2099-01-01",
    });
    const res = await requestAs(db.alice, "/api/subscriptions/export");
    expect(res.status).toBe(200);
    const text = new TextDecoder("utf-8")
      .decode(await res.arrayBuffer())
      .replace(/^\uFEFF/, "");
    const lines = text.split("\r\n");
    expect(lines[0]).toBe(
      "Service Name,Amount,Frequency,Monthly Equivalent,Next Renewal,Status"
    );
    expect(lines[1]).toContain("Netflix");
    expect(lines[1]).toContain("649.00");
  });
});

describe("subscriptions RLS isolation", () => {
  it("bob cannot read or mutate alice's subscription", async () => {
    const sub = await createSubscription({
      service_name: "Netflix",
      amount: "649",
      frequency: "monthly",
      next_renewal_date: "2099-01-01",
    });

    expect((await requestAs(db.bob, `/api/subscriptions/${sub.id}`)).status).toBe(404);
    expect(
      (await postAs(db.bob, `/api/subscriptions/${sub.id}/pause`, {})).status
    ).toBe(404);
    expect(
      (await requestAs(db.bob, `/api/subscriptions/${sub.id}`, { method: "DELETE" }))
        .status
    ).toBe(404);
    expect(
      (await requestAs(db.bob, `/api/subscriptions/${sub.id}/payments`)).status
    ).toBe(404);

    const list = (await (
      await requestAs(db.bob, "/api/subscriptions")
    ).json()) as { subscriptions: Subscription[] };
    expect(list.subscriptions).toHaveLength(0);
  });
});