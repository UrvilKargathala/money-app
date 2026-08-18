import { describe, expect, it } from "vitest";
import { pool } from "../db";
import type { Bill, BillOverview, PaymentHistoryRow } from "../routes/bills";
import {
  createAccount,
  createCategory,
  fixtureDb,
  postAs,
  rawRequest,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

function todayInfo() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return {
    month,
    year,
    label: `${year}-${String(month).padStart(2, "0")}`,
  };
}

async function createBill(body: Record<string, unknown>): Promise<Bill> {
  const res = await postAs(db.alice, "/api/bills", body);
  if (!res.ok) throw new Error(`createBill failed: ${res.status} ${await res.text()}`);
  const list = (await (await requestAs(db.alice, "/api/bills")).json()) as {
    bills: Bill[];
  };
  const found = list.bills.find((b) => b.name === body.name);
  if (!found) throw new Error("createBill: not found after create");
  return found;
}

describe("bills auth + validation", () => {
  it("rejects unauthenticated requests", async () => {
    expect((await rawRequest("/api/bills")).status).toBe(401);
    expect((await rawRequest("/api/bills", { method: "POST" })).status).toBe(401);
    expect((await rawRequest("/api/bills/export")).status).toBe(401);
    expect((await rawRequest("/api/bills/calendar")).status).toBe(401);
    expect((await rawRequest("/api/bills/upcoming")).status).toBe(401);
    expect((await rawRequest("/api/bills/overview")).status).toBe(401);
  });

  it("validates create fields", async () => {
    const res = await postAs(db.alice, "/api/bills", {
      name: "",
      due_day: 0,
      frequency: "weekly",
      amount: "0",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.name).toBeTruthy();
    expect(body.fieldErrors.due_day).toBeTruthy();
    expect(body.fieldErrors.frequency).toBeTruthy();
    expect(body.fieldErrors.amount).toBeTruthy();

    const noAmount = await postAs(db.alice, "/api/bills", {
      name: "Rent",
      due_day: 5,
      frequency: "monthly",
    });
    expect(noAmount.status).toBe(400);
    const body2 = (await noAmount.json()) as { fieldErrors: Record<string, string> };
    expect(body2.fieldErrors.amount).toBeTruthy();
  });

  it("rejects an account that doesn't exist or is inactive", async () => {
    const res = await postAs(db.alice, "/api/bills", {
      name: "Rent",
      amount: "15000",
      due_day: 5,
      frequency: "monthly",
      account_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.account_id).toBeTruthy();
  });

  it("rejects a category that doesn't exist", async () => {
    const res = await postAs(db.alice, "/api/bills", {
      name: "Rent",
      amount: "15000",
      due_day: 5,
      frequency: "monthly",
      category_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.category_id).toBeTruthy();
  });
});

describe("bills CRUD", () => {
  it("creates a fixed bill and lists it with account/category names", async () => {
    const account = await createAccount(db.alice, "Savings");
    const housing = await createCategory(db.alice, "Housing");
    const bill = await createBill({
      name: "Rent",
      amount: "15000",
      due_day: 5,
      frequency: "monthly",
      account_id: account,
      category_id: housing,
      notes: "flat",
    });

    const res = await requestAs(db.alice, "/api/bills");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bills: Bill[] };
    const found = body.bills.find((b) => b.id === bill.id);
    expect(found).toBeTruthy();
    expect(found?.name).toBe("Rent");
    expect(found?.amount).toBe(15000);
    expect(found?.due_day).toBe(5);
    expect(found?.frequency).toBe("monthly");
    expect(found?.account_name).toBe("Savings");
    expect(found?.category_name).toBe("Housing");
    expect(found?.current_period_status).toBe("upcoming");
    expect(found?.is_active).toBe(1);
    expect(found?.reminder_days).toBe(3);
    expect(found?.last_paid_date).toBeNull();
  });

  it("creates a variable bill (amount null, estimated set)", async () => {
    const bill = await createBill({
      name: "Electricity",
      estimated_amount: "1800",
      due_day: 10,
      frequency: "monthly",
    });
    const res = await requestAs(db.alice, `/api/bills/${bill.id}`);
    const body = (await res.json()) as { bill: Bill };
    expect(body.bill.amount).toBeNull();
    expect(body.bill.estimated_amount).toBe(1800);
  });

  it("patch updates and bumps version; stale version gets 409", async () => {
    const bill = await createBill({
      name: "Internet",
      amount: "1200",
      due_day: 7,
      frequency: "monthly",
    });
    const res = await requestAs(db.alice, `/api/bills/${bill.id}`);
    const body = (await res.json()) as { bill: Bill };
    const version = body.bill.version;

    const ok = await requestAs(db.alice, `/api/bills/${bill.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Fiber", version }),
    });
    expect(ok.status).toBe(200);

    const stale = await requestAs(db.alice, `/api/bills/${bill.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", version }),
    });
    expect(stale.status).toBe(409);

    const missing = await requestAs(
      db.alice,
      "/api/bills/00000000-0000-0000-0000-000000000000",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "X", version: 1 }),
      }
    );
    expect(missing.status).toBe(404);
  });

  it("deactivates and reactivates; double deactivate gets 409", async () => {
    const bill = await createBill({
      name: "Gym",
      amount: "1500",
      due_day: 2,
      frequency: "monthly",
    });

    const deactivated = await requestAs(db.alice, `/api/bills/${bill.id}`, {
      method: "DELETE",
    });
    expect(deactivated.status).toBe(200);

    const again = await requestAs(db.alice, `/api/bills/${bill.id}`, {
      method: "DELETE",
    });
    expect(again.status).toBe(409);

    const list = (await (
      await requestAs(db.alice, "/api/bills")
    ).json()) as { bills: Bill[] };
    expect(list.bills.find((b) => b.id === bill.id)?.is_active).toBe(0);

    const reactivated = await postAs(db.alice, `/api/bills/${bill.id}/reactivate`, {});
    expect(reactivated.status).toBe(200);
    const again2 = await postAs(db.alice, `/api/bills/${bill.id}/reactivate`, {});
    expect(again2.status).toBe(409);
  });
});

describe("bills mark-paid", () => {
  it("creates an expense transaction, payment row, and flips status to paid", async () => {
    const account = await createAccount(db.alice, "Savings");
    const housing = await createCategory(db.alice, "Housing");
    const bill = await createBill({
      name: "Rent",
      amount: "15000",
      due_day: 5,
      frequency: "monthly",
      account_id: account,
      category_id: housing,
    });

    const { label, year } = todayInfo();
    const res = await postAs(db.alice, `/api/bills/${bill.id}/mark-paid`, {});
    expect(res.status).toBe(200);

    const txn = await pool.query<{
      id: string;
      amount: string;
      description: string;
      category_id: string;
    }>(
      `SELECT id, amount, description, category_id FROM transactions
       WHERE user_id = $1 AND source = 'bill'`,
      [db.alice.userId]
    );
    expect(txn.rowCount).toBe(1);
    expect(Number(txn.rows[0].amount)).toBe(15000);
    expect(txn.rows[0].description).toContain("Rent");
    expect(txn.rows[0].description).toContain(String(year));
    expect(txn.rows[0].category_id).toBe(housing);

    const pay = await pool.query<{
      period_label: string;
      amount: string;
      transaction_id: string;
    }>(
      `SELECT period_label, amount, transaction_id FROM payment_history
       WHERE user_id = $1 AND payable_type = 'bill' AND payable_id = $2`,
      [db.alice.userId, bill.id]
    );
    expect(pay.rowCount).toBe(1);
    expect(pay.rows[0].period_label).toBe(label);
    expect(Number(pay.rows[0].amount)).toBe(15000);
    expect(pay.rows[0].transaction_id).toBe(txn.rows[0].id);

    const detail = (await (
      await requestAs(db.alice, `/api/bills/${bill.id}`)
    ).json()) as { bill: Bill };
    expect(detail.bill.current_period_status).toBe("paid");
    expect(detail.bill.last_paid_date).toBeTruthy();
    expect(detail.bill.last_paid_amount).toBe(15000);
  });

  it("moves the account balance (expense counted on read)", async () => {
    const account = await createAccount(db.alice, "Savings");
    const bill = await createBill({
      name: "Rent",
      amount: "10000",
      due_day: 5,
      frequency: "monthly",
      account_id: account,
    });
    await postAs(db.alice, `/api/bills/${bill.id}/mark-paid`, {});

    const list = (await (await requestAs(db.alice, "/api/accounts")).json()) as {
      accounts: { id: string; balance: number; opening_balance: number }[];
    };
    const acc = list.accounts.find((a) => a.id === account);
    expect(acc?.opening_balance).toBe(100000);
    expect(acc?.balance).toBe(-10000);
  });

  it("rejects double-payment with 409", async () => {
    const account = await createAccount(db.alice, "Savings");
    const bill = await createBill({
      name: "Rent",
      amount: "10000",
      due_day: 5,
      frequency: "monthly",
      account_id: account,
    });
    await postAs(db.alice, `/api/bills/${bill.id}/mark-paid`, {});
    const again = await postAs(db.alice, `/api/bills/${bill.id}/mark-paid`, {});
    expect(again.status).toBe(409);
  });

  it("variable bill requires an actual amount", async () => {
    const account = await createAccount(db.alice, "Savings");
    const bill = await createBill({
      name: "Electricity",
      estimated_amount: "1800",
      due_day: 10,
      frequency: "monthly",
      account_id: account,
    });
    const missing = await postAs(db.alice, `/api/bills/${bill.id}/mark-paid`, {});
    expect(missing.status).toBe(400);
    const body = (await missing.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.amount).toBeTruthy();

    const ok = await postAs(db.alice, `/api/bills/${bill.id}/mark-paid`, {
      amount: "2300",
    });
    expect(ok.status).toBe(200);
    const pay = await pool.query<{ amount: string }>(
      `SELECT amount FROM payment_history WHERE user_id = $1 AND payable_id = $2`,
      [db.alice.userId, bill.id]
    );
    expect(Number(pay.rows[0].amount)).toBe(2300);
  });

  it("allows paying from a different account", async () => {
    const accountA = await createAccount(db.alice, "Savings");
    const accountB = await createAccount(db.alice, "Wallet");
    const bill = await createBill({
      name: "Internet",
      amount: "1200",
      due_day: 7,
      frequency: "monthly",
      account_id: accountA,
    });
    await postAs(db.alice, `/api/bills/${bill.id}/mark-paid`, {
      account_id: accountB,
    });
    const txn = await pool.query<{ account_id: string }>(
      `SELECT account_id FROM transactions WHERE user_id = $1 AND source = 'bill'`,
      [db.alice.userId]
    );
    expect(txn.rows[0].account_id).toBe(accountB);
  });

  it("one_time bill auto-deactivates after payment", async () => {
    const account = await createAccount(db.alice, "Savings");
    const bill = await createBill({
      name: "Conference Fee",
      amount: "5000",
      due_day: 20,
      frequency: "one_time",
      account_id: account,
    });
    await postAs(db.alice, `/api/bills/${bill.id}/mark-paid`, {});
    const detail = (await (
      await requestAs(db.alice, `/api/bills/${bill.id}`)
    ).json()) as { bill: Bill };
    expect(detail.bill.is_active).toBe(0);
    expect(detail.bill.current_period_status).toBe("paid");
  });

  it("bill without a linked account requires account_id in the body", async () => {
    const bill = await createBill({
      name: "Rent",
      amount: "10000",
      due_day: 5,
      frequency: "monthly",
    });
    const res = await postAs(db.alice, `/api/bills/${bill.id}/mark-paid`, {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.account_id).toBeTruthy();
  });

  it("rejects mark-paid on a deactivated bill", async () => {
    const account = await createAccount(db.alice, "Savings");
    const bill = await createBill({
      name: "Rent",
      amount: "10000",
      due_day: 5,
      frequency: "monthly",
      account_id: account,
    });
    await requestAs(db.alice, `/api/bills/${bill.id}`, { method: "DELETE" });
    const res = await postAs(db.alice, `/api/bills/${bill.id}/mark-paid`, {});
    expect(res.status).toBe(409);
  });

  it("skip marks the period skipped; paid bills can't be skipped", async () => {
    const account = await createAccount(db.alice, "Savings");
    const bill = await createBill({
      name: "Gym",
      amount: "1500",
      due_day: 2,
      frequency: "monthly",
      account_id: account,
    });
    const skipped = await postAs(db.alice, `/api/bills/${bill.id}/skip`, {});
    expect(skipped.status).toBe(200);

    const bill2 = await createBill({
      name: "Internet",
      amount: "1200",
      due_day: 7,
      frequency: "monthly",
      account_id: account,
    });
    await postAs(db.alice, `/api/bills/${bill2.id}/mark-paid`, {});
    const again = await postAs(db.alice, `/api/bills/${bill2.id}/skip`, {});
    expect(again.status).toBe(409);
  });

  it("autopay toggle flips the indicator", async () => {
    const bill = await createBill({
      name: "Internet",
      amount: "1200",
      due_day: 7,
      frequency: "monthly",
    });
    const on = await requestAs(db.alice, `/api/bills/${bill.id}/autopay`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_autopay: true }),
    });
    expect(on.status).toBe(200);
    const detail = (await (
      await requestAs(db.alice, `/api/bills/${bill.id}`)
    ).json()) as { bill: Bill };
    expect(detail.bill.is_autopay).toBe(1);

    await requestAs(db.alice, `/api/bills/${bill.id}/autopay`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_autopay: false }),
    });
    const detail2 = (await (
      await requestAs(db.alice, `/api/bills/${bill.id}`)
    ).json()) as { bill: Bill };
    expect(detail2.bill.is_autopay).toBe(0);
  });
});

describe("bills payments + history", () => {
  it("lists payment history most recent first", async () => {
    const account = await createAccount(db.alice, "Savings");
    const bill = await createBill({
      name: "Rent",
      amount: "10000",
      due_day: 5,
      frequency: "monthly",
      account_id: account,
    });
    await postAs(db.alice, `/api/bills/${bill.id}/mark-paid`, {});

    const res = await requestAs(db.alice, `/api/bills/${bill.id}/payments`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { payments: PaymentHistoryRow[] };
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0].amount).toBe(10000);
    expect(body.payments[0].transaction_id).toBeTruthy();

    expect((await requestAs(db.alice, `/api/bills/${bill.id}/payments`)).status).toBe(200);
  });

  it("yoy compares this month with the same month last year", async () => {
    const account = await createAccount(db.alice, "Savings");
    const bill = await createBill({
      name: "Rent",
      amount: "10000",
      due_day: 5,
      frequency: "monthly",
      account_id: account,
    });
    const { month, year, label } = todayInfo();
    await postAs(db.alice, `/api/bills/${bill.id}/mark-paid`, {});
    await pool.query(
      `INSERT INTO payment_history
         (user_id, payable_type, payable_id, transaction_id, amount,
          period_label, period_month, period_year)
       VALUES ($1, 'bill', $2, NULL, 8000, $3, $4, $5)`,
      [db.alice.userId, bill.id, label, month, year - 1]
    );

    const res = await requestAs(db.alice, `/api/bills/${bill.id}/payments/yoy`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      current: { year: number; total: number };
      previous: { year: number; total: number };
    };
    expect(body.current.year).toBe(year);
    expect(body.current.total).toBe(10000);
    expect(body.previous.year).toBe(year - 1);
    expect(body.previous.total).toBe(8000);
  });

  it("exports bills CSV with BOM and expected columns", async () => {
    await createBill({ name: "Rent", amount: "15000", due_day: 5, frequency: "monthly" });
    const res = await requestAs(db.alice, "/api/bills/export");
    expect(res.status).toBe(200);
    const text = new TextDecoder("utf-8")
      .decode(await res.arrayBuffer())
      .replace(/^\uFEFF/, "");
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("Name,Amount,Due Day,Frequency,Account,Status,Last Paid Date");
    expect(lines[1]).toContain("Rent");
  });

  it("exports bill payment history CSV", async () => {
    const account = await createAccount(db.alice, "Savings");
    const bill = await createBill({
      name: "Rent",
      amount: "10000",
      due_day: 5,
      frequency: "monthly",
      account_id: account,
    });
    await postAs(db.alice, `/api/bills/${bill.id}/mark-paid`, {});
    const res = await requestAs(db.alice, `/api/bills/${bill.id}/payments/export`);
    expect(res.status).toBe(200);
    const text = new TextDecoder("utf-8")
      .decode(await res.arrayBuffer())
      .replace(/^\uFEFF/, "");
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("Period,Date,Amount,Notes");
    expect(lines[1]).toContain("10000.00");
  });
});

describe("bills calendar/upcoming/overview", () => {
  function localIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function nextOccurrence(dueDay: number): { date: Date; days: number } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastOfMonth = (m: number) => new Date(today.getFullYear(), m, 0).getDate();
    let candidate = new Date(
      today.getFullYear(),
      today.getMonth(),
      Math.min(dueDay, lastOfMonth(today.getMonth() + 1))
    );
    if (candidate < today) {
      candidate = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        Math.min(dueDay, lastOfMonth(today.getMonth() + 2))
      );
    }
    return { date: candidate, days: Math.round((candidate.getTime() - today.getTime()) / 86400000) };
  }

  it("calendar shows the next occurrence within 30 days", async () => {
    await createBill({ name: "Rent", amount: "1000", due_day: 1, frequency: "monthly" });
    const res = await requestAs(db.alice, "/api/bills/calendar");
    const body = (await res.json()) as {
      events: { name: string; due_date: string; days_until: number }[];
    };
    const event = body.events.find((e) => e.name === "Rent");
    const expected = nextOccurrence(1);
    expect(event).toBeTruthy();
    expect(event?.days_until).toBe(expected.days);
    expect(event?.due_date).toBe(localIso(expected.date));
  });

  it("clamps due_day 31 to the last day of a 30-day month", async () => {
    await createBill({ name: "X", amount: "1000", due_day: 31, frequency: "monthly" });
    const res = await requestAs(db.alice, "/api/bills/calendar");
    const body = (await res.json()) as {
      events: { name: string; due_date: string; days_until: number }[];
    };
    const event = body.events.find((e) => e.name === "X");
    const expected = nextOccurrence(31);
    expect(event).toBeTruthy();
    expect(event?.due_date).toBe(localIso(expected.date));
    expect(event?.days_until).toBe(expected.days);
  });

  it("upcoming returns overdue/due-soon and bills due within 7 days", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const farDueDay = Math.min(28, today.getDate() + 10);
    const nearDueDay = today.getDate() + 2 > 28 ? 1 : today.getDate() + 2;

    const overdue = await createBill({
      name: "Overdue Bill",
      amount: "500",
      due_day: 5,
      frequency: "monthly",
    });
    await pool.query(
      `UPDATE bills SET current_period_status = 'overdue' WHERE id = $1`,
      [overdue.id]
    );
    await createBill({
      name: "Far Bill",
      amount: "500",
      due_day: farDueDay,
      frequency: "monthly",
    });
    await createBill({
      name: "Near Bill",
      amount: "500",
      due_day: nearDueDay,
      frequency: "monthly",
    });

    const res = await requestAs(db.alice, "/api/bills/upcoming");
    const body = (await res.json()) as {
      items: { name: string; days_until: number }[];
    };
    const names = body.items.map((i) => i.name);
    expect(names).toContain("Overdue Bill");
    expect(names).toContain("Near Bill");
    expect(names).not.toContain("Far Bill");
  });

  it("overview computes obligation, due this week, overdue count and upcoming", async () => {
    const account = await createAccount(db.alice, "Savings");
    await createBill({
      name: "Rent",
      amount: "12000",
      due_day: 5,
      frequency: "monthly",
      account_id: account,
    });
    await createBill({
      name: "Electricity",
      estimated_amount: "1800",
      due_day: 10,
      frequency: "monthly",
    });
    await createBill({
      name: "Insurance",
      amount: "6000",
      due_day: 20,
      frequency: "quarterly",
    });

    const overdue = await createBill({
      name: "Old Fine",
      amount: "300",
      due_day: 1,
      frequency: "monthly",
    });
    await pool.query(
      `UPDATE bills SET current_period_status = 'overdue' WHERE id = $1`,
      [overdue.id]
    );

    await postAs(db.alice, "/api/subscriptions", {
      service_name: "Netflix",
      amount: "649",
      frequency: "monthly",
      next_renewal_date: "2099-01-01",
    });
    await postAs(db.alice, "/api/subscriptions", {
      service_name: "Coursera",
      amount: "12000",
      frequency: "annual",
      next_renewal_date: "2099-02-01",
    });

    const res = await requestAs(db.alice, "/api/bills/overview");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { overview: BillOverview };
    const o = body.overview;
    expect(o.total_monthly_obligation).toBeCloseTo(
      12000 + 1800 + 2000 + 300 + 649 + 1000,
      2
    );
    expect(o.overdue_count).toBe(1);
    expect(o.due_this_week).toBeGreaterThanOrEqual(0);
    expect(o.upcoming.length).toBeLessThanOrEqual(5);
    expect(o.upcoming[0].type).toBe("bill");
  });
});

describe("bills RLS isolation", () => {
  it("bob cannot read or pay alice's bill", async () => {
    const account = await createAccount(db.alice, "Savings");
    const bill = await createBill({
      name: "Rent",
      amount: "10000",
      due_day: 5,
      frequency: "monthly",
      account_id: account,
    });

    expect((await requestAs(db.bob, `/api/bills/${bill.id}`)).status).toBe(404);
    expect(
      (await requestAs(db.bob, `/api/bills/${bill.id}`, { method: "DELETE" })).status
    ).toBe(404);
    expect(
      (await postAs(db.bob, `/api/bills/${bill.id}/mark-paid`, {})).status
    ).toBe(404);
    expect(
      (await requestAs(db.bob, `/api/bills/${bill.id}/payments`)).status
    ).toBe(404);

    const list = (await (await requestAs(db.bob, "/api/bills")).json()) as {
      bills: Bill[];
    };
    expect(list.bills).toHaveLength(0);
  });
});