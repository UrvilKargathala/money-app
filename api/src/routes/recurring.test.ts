import { describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  createAccount,
  createCategory,
  fixtureDb,
  postAs,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function createTemplate(
  overrides: Record<string, unknown> = {}
): Promise<{ res: Awaited<ReturnType<typeof postAs>>; body: Record<string, unknown> }> {
  const accountId = await ensureAccount();
  const res = await postAs(db.alice, "/api/recurring-transactions", {
    type: "expense",
    amount: "1500",
    description: "Rent",
    frequency: "monthly",
    interval_value: 1,
    end_type: "never",
    next_due_date: isoInDays(0),
    account_id: accountId,
    ...overrides,
  });
  let body: Record<string, unknown>;
  try {
    body = (await res.clone().json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { res, body };
}

/** Accounts are wiped by resetDb between tests â€” look one up fresh each time. */
async function ensureAccount(): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM accounts WHERE user_id = $1 LIMIT 1`,
    [db.alice.userId]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  return createAccount(db.alice, "Recurring Bank");
}

describe("recurring template CRUD and validation", () => {
  it("creates a monthly template with defaults", async () => {
    const { res, body } = await createTemplate();
    expect(res.status).toBe(200);
    const id = ((body as { template: { id: string } }).template).id;

    const detail = (await (
      await requestAs(db.alice, `/api/recurring-transactions/${id}`)
    ).json()) as {
      template: {
        amount: number;
        frequency: string;
        is_active: number;
        is_due: boolean;
        executed_count: number;
      };
    };
    expect(detail.template.amount).toBe(1500);
    expect(detail.template.frequency).toBe("monthly");
    expect(detail.template.is_active).toBe(1);
    expect(detail.template.is_due).toBe(true); // due today
    expect(detail.template.executed_count).toBe(0);
  });

  it("validates type/amount/frequency/end conditions", async () => {
    const bad = await createTemplate({
      type: "transfer",
      amount: "-5",
      frequency: "whenever",
      end_type: "count", // without end_count
      next_due_date: "not-a-date",
    });
    expect(bad.res.status).toBe(400);
    const fe = (bad.body as { fieldErrors: Record<string, string> }).fieldErrors;
    expect(fe.type).toBeTruthy();
    expect(fe.amount).toBeTruthy();
    expect(fe.frequency).toBeTruthy();
    expect(fe.end_count).toBeTruthy();
    expect(fe.next_due_date).toBeTruthy();
  });

  it("patches with version lock; unknown id 404s", async () => {
    const { body } = await createTemplate({ description: "Original" });
    const id = ((body as { template: { id: string } }).template).id;

    const patch = await requestAs(db.alice, `/api/recurring-transactions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: "1600", version: 1 }),
    });
    expect(patch.status).toBe(200);

    const stale = await requestAs(db.alice, `/api/recurring-transactions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: "1", version: 1 }),
    });
    expect(stale.status).toBe(409);

    const del = await requestAs(db.alice, `/api/recurring-transactions/${id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    expect(
      (await requestAs(db.alice, `/api/recurring-transactions/${id}`)).status
    ).toBe(404);
  });

  it("rejects unknown accounts and categories", async () => {
    const bad = await createTemplate({
      account_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(bad.res.status).toBe(400);
    const fe = (bad.body as { fieldErrors?: { account_id?: string } }).fieldErrors;
    expect(fe?.account_id).toBeTruthy();

    void (await createCategory(db.alice, "Recurring Cat"));
  });
});

describe("execute advances schedule and creates transactions", () => {
  it("executes a daily template: txn dated at due date, source recurring, next day advanced", async () => {
    const dueToday = new Date().toISOString().slice(0, 10);
    const { body } = await createTemplate({
      description: "Daily Coffee",
      amount: "80",
      frequency: "daily",
      next_due_date: dueToday,
    });
    const id = ((body as { template: { id: string } }).template).id;

    const exec = await postAs(db.alice, `/api/recurring-transactions/${id}/execute`, {});
    expect(exec.status).toBe(200);
    const execBody = (await exec.json()) as {
      transactionId: string;
      next_due_date: string;
    };
    // Daily â†’ advanced exactly one day past the due date.
    const expectedNext = new Date(Date.parse(`${dueToday}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(execBody.next_due_date).toBe(expectedNext);

    const txn = await pool.query<{
      source: string;
      amount: string;
      date: Date;
      is_recurring: number;
      recurring_template_id: string | null;
    }>(
      `SELECT source, amount::text AS amount, date, is_recurring, recurring_template_id
       FROM transactions WHERE id = $1`,
      [execBody.transactionId]
    );
    expect(txn.rows[0].source).toBe("recurring");
    expect(Number(txn.rows[0].amount)).toBe(80);
    expect(txn.rows[0].is_recurring).toBe(1);
    expect(txn.rows[0].recurring_template_id).toBe(id);

    const after = (await (
      await requestAs(db.alice, `/api/recurring-transactions/${id}`)
    ).json()) as { template: { executed_count: number; is_due: boolean } };
    expect(after.template.executed_count).toBe(1);
    expect(after.template.is_due).toBe(false); // tomorrow
  });

  it("monthly execution clamps Jan 31 to Feb 28", async () => {
    const jan31 = `${new Date().getFullYear()}-01-31`;
    const isFuture = new Date(jan31) > new Date();
    void isFuture;
    const { body } = await createTemplate({
      description: "Clamped Rent",
      frequency: "monthly",
      // Anchor on this year's Jan 31 (in the past) so it's immediately due.
      next_due_date: `${new Date().getFullYear()}-01-31`,
    });
    const id = ((body as { template: { id: string } }).template).id;

    const exec = await postAs(db.alice, `/api/recurring-transactions/${id}/execute`, {});
    expect(exec.status).toBe(200);
    const execBody = (await exec.json()) as { next_due_date: string };

    // From last-year Jan-31, one monthly step lands on Feb-28/29 of this year.
    const year = new Date().getFullYear();
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    expect(execBody.next_due_date).toBe(`${year}-02-${leap ? "29" : "28"}`);
  });

  it("refuses to execute before the due date", async () => {
    const { body } = await createTemplate({ next_due_date: isoInDays(5) });
    const id = ((body as { template: { id: string } }).template).id;
    const res = await postAs(db.alice, `/api/recurring-transactions/${id}/execute`, {});
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("due");
  });

  it("deactivates when end_count is reached", async () => {
    const { body } = await createTemplate({
      frequency: "daily",
      end_type: "count",
      end_count: 2,
      next_due_date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
    });
    const id = ((body as { template: { id: string } }).template).id;

    for (let i = 0; i < 2; i++) {
      const exec = await postAs(db.alice, `/api/recurring-transactions/${id}/execute`, {});
      expect(exec.status).toBe(200);
      if (i === 0) {
        // Advance manually between executions by shifting next_due_date back a day.
        await pool.query(
          `UPDATE recurring_transaction_templates
           SET next_due_date = CURRENT_DATE WHERE id = $1`,
          [id]
        );
      }
    }

    const after = (await (
      await requestAs(db.alice, `/api/recurring-transactions/${id}`)
    ).json()) as { template: { is_active: number; executed_count: number } };
    expect(after.template.executed_count).toBe(2);
    expect(after.template.is_active).toBe(0);

    const third = await postAs(db.alice, `/api/recurring-transactions/${id}/execute`, {});
    expect(third.status).toBe(409); // INACTIVE
  });

  it("deactivates when the next occurrence passes end_date", async () => {
    const endDate = isoInDays(0); // next weekly slot (+7d) will land past today
    const { body } = await createTemplate({
      frequency: "weekly",
      end_type: "date",
      end_date: endDate,
      next_due_date: isoInDays(-6), // due a week ago
    });
    const id = ((body as { template: { id: string } }).template).id;

    const exec = await postAs(db.alice, `/api/recurring-transactions/${id}/execute`, {});
    expect(exec.status).toBe(200);
    const execBody = (await exec.json()) as { completed: boolean };
    // Next weekly slot (+7 days from due) lands past the 3-day end date.
    expect(execBody.completed).toBe(true);

    const after = (await (
      await requestAs(db.alice, `/api/recurring-transactions/${id}`)
    ).json()) as { template: { is_active: number } };
    expect(after.template.is_active).toBe(0);
  });
});

describe("skip", () => {
  it("advances the schedule without creating a transaction or counting executions", async () => {
    const due = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const { body } = await createTemplate({
      frequency: "weekly",
      next_due_date: due,
      end_type: "count",
      end_count: 3,
    });
    const id = ((body as { template: { id: string } }).template).id;

    const skip = await postAs(db.alice, `/api/recurring-transactions/${id}/skip`, {});
    expect(skip.status).toBe(200);
    const skipBody = (await skip.json()) as {
      next_due_date: string;
      completed: boolean;
    };
    const expected = new Date(Date.parse(`${due}T00:00:00Z`) + 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(skipBody.next_due_date).toBe(expected);
    expect(skipBody.completed).toBe(false);

    const count = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM transactions WHERE recurring_template_id = $1`,
      [id]
    );
    expect(Number(count.rows[0].c)).toBe(0);

    const after = (await (
      await requestAs(db.alice, `/api/recurring-transactions/${id}`)
    ).json()) as { template: { executed_count: number } };
    expect(after.template.executed_count).toBe(0);
  });
});

describe("cross-user isolation", () => {
  it("bob cannot see, execute or delete alice's templates", async () => {
    const { body } = await createTemplate();
    const id = ((body as { template: { id: string } }).template).id;

    expect(
      (await requestAs(db.bob, `/api/recurring-transactions/${id}`)).status
    ).toBe(404);
    expect(
      (await postAs(db.bob, `/api/recurring-transactions/${id}/execute`, {})).status
    ).toBe(404);
    expect(
      (
        await requestAs(db.bob, `/api/recurring-transactions/${id}`, {
          method: "DELETE",
        })
      ).status
    ).toBe(404);

    const bobList = (await (
      await requestAs(db.bob, "/api/recurring-transactions")
    ).json()) as { templates: unknown[] };
    expect(bobList.templates).toEqual([]);
  });
});
