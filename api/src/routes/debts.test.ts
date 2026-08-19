import { describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  addMonths,
  amortize,
  deriveMonths,
  isoDate,
  money,
} from "../queries/debts";
import type { Debt, DebtPayment, ScheduleRow } from "../queries/debts";
import {
  createAccount,
  createDebt,
  fixtureDb,
  patchAs,
  postAs,
  rawRequest,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

/** Day-of-month date that is always inside the given calendar window. */
function dateOnDay(day: number, monthsAgo: number): string {
  const d = new Date();
  d.setDate(day);
  d.setMonth(d.getMonth() - monthsAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const TODAY = isoDate(new Date());

/** r=0 loan: ₹12,000 at 0% with ₹1,000 EMI → exactly 12 months, all math hand-verifiable. */
async function createZeroRateLoan(
  startDate = dateOnDay(15, 13)
): Promise<string> {
  return createDebt(db.alice, "Zero Loan", {
    principalOriginal: 12000,
    principalOutstanding: 12000,
    interestRate: 0,
    emiAmount: 1000,
    tenureMonths: 12,
    startDate,
  });
}

async function logPayment(
  debtId: string,
  amount: number,
  date: string,
  extra: Record<string, unknown> = {}
): Promise<Response> {
  return postAs(db.alice, `/api/debts/${debtId}/payments`, {
    amount: String(amount),
    date,
    ...extra,
  });
}

async function debtDetail(debtId: string): Promise<Debt> {
  const res = await requestAs(db.alice, `/api/debts/${debtId}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { debt: Debt }).debt;
}

describe("debts auth + validation", () => {
  it("rejects unauthenticated requests", async () => {
    expect((await rawRequest("/api/debts")).status).toBe(401);
    expect((await rawRequest("/api/debts", { method: "POST" })).status).toBe(401);
    expect((await rawRequest("/api/debts/dashboard")).status).toBe(401);
    expect((await rawRequest("/api/debts/dti")).status).toBe(401);
    expect(
      (await rawRequest("/api/debts/strategies/compare", { method: "POST" })).status
    ).toBe(401);
    expect((await rawRequest("/api/debts/combined-timeline")).status).toBe(401);
    expect(
      (await rawRequest("/api/debts/combined/strategies", { method: "POST" })).status
    ).toBe(401);
    expect((await rawRequest("/api/debts/health-alerts")).status).toBe(401);
    expect((await rawRequest("/api/debts/export")).status).toBe(401);
    expect((await rawRequest("/api/debt-types")).status).toBe(401);
  });

  it("validates required fields for term loans", async () => {
    const res = await postAs(db.alice, "/api/debts", {
      name: "",
      type: "mystery_loan",
      principal_original: "0",
      principal_outstanding: "150000",
      interest_rate: "-1",
      emi_amount: "",
      tenure_months: "0",
      start_date: "not-a-date",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.name).toBeTruthy();
    expect(body.fieldErrors.type).toBeTruthy();
    expect(body.fieldErrors.principal_original).toBeTruthy();
    expect(body.fieldErrors.interest_rate).toBeTruthy();
    expect(body.fieldErrors.emi_amount).toBeTruthy();
    expect(body.fieldErrors.tenure_months).toBeTruthy();
    expect(body.fieldErrors.start_date).toBeTruthy();
  });

  it("rejects outstanding greater than the original principal", async () => {
    const res = await postAs(db.alice, "/api/debts", {
      name: "Bad Loan",
      type: "personal_loan",
      principal_original: "10000",
      principal_outstanding: "20000",
      interest_rate: "12",
      emi_amount: "1000",
      tenure_months: "12",
      start_date: "2025-01-15",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.principal_outstanding).toBeTruthy();
  });

  it("rejects a linked account that doesn't exist", async () => {
    const res = await postAs(db.alice, "/api/debts", {
      name: "Loan",
      type: "personal_loan",
      principal_original: "120000",
      principal_outstanding: "120000",
      interest_rate: "12",
      emi_amount: "10000",
      tenure_months: "12",
      start_date: "2025-01-15",
      account_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.account_id).toBeTruthy();
  });

  it("creates a credit-card debt with only revolving fields", async () => {
    const res = await postAs(db.alice, "/api/debts", {
      name: "HDFC Credit Card Dues",
      type: "credit_card",
      principal_outstanding: "25000",
      interest_rate: "36",
      minimum_due: "1250",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { debt: { id: string } };
    const debt = await debtDetail(body.debt.id);
    expect(debt.type).toBe("credit_card");
    expect(debt.emi_amount).toBeNull();
    expect(debt.months_remaining).toBeNull();
    expect(debt.end_date).toBeNull();
    expect(debt.progress_pct).toBeNull();
    expect(debt.minimum_due).toBe(1250);

    const sched = await requestAs(db.alice, `/api/debts/${body.debt.id}/amortization`);
    expect((await sched.json()).schedule_length).toBe(0);
  });
});

describe("debts CRUD and derived amortization state", () => {
  it("creates a loan with derived tenure, end date and progress", async () => {
    const start = dateOnDay(15, 13);
    const debtId = await createZeroRateLoan(start);
    const debt = await debtDetail(debtId);

    expect(debt.name).toBe("Zero Loan");
    expect(debt.principal_original).toBe(12000);
    expect(debt.principal_outstanding).toBe(12000);
    expect(debt.interest_rate).toBe(0);
    expect(debt.emi_amount).toBe(1000);
    expect(debt.months_remaining).toBe(12);
    expect(debt.end_date).toBe(addMonths(start, 12));
    expect(debt.total_interest_paid).toBe(0);
    expect(debt.progress_pct).toBe(0);
    expect(debt.is_active).toBe(1);
    expect(debt.version).toBe(1);
  });

  it("generates the amortization schedule on create (r=0, hand-computable)", async () => {
    const debtId = await createZeroRateLoan();
    const res = await requestAs(db.alice, `/api/debts/${debtId}/amortization`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { schedule: ScheduleRow[]; schedule_length: number };
    expect(body.schedule_length).toBe(12);
    expect(body.schedule[0]).toMatchObject({
      period: 1,
      emi_amount: 1000,
      principal_part: 1000,
      interest_part: 0,
      outstanding_after: 11000,
      cumulative_interest: 0,
    });
    expect(body.schedule[11].outstanding_after).toBe(0);
    expect(body.schedule[11].principal_part).toBe(1000);
    expect(
      body.schedule.reduce((sum, row) => sum + row.principal_part, 0)
    ).toBe(12000);
  });

  it("matches the amortize engine for rate-bearing loans", async () => {
    const debtId = await createDebt(db.alice, "Rate Loan", {
      principalOriginal: 120000,
      principalOutstanding: 120000,
      interestRate: 12,
      emiAmount: 10000,
      tenureMonths: 12,
      startDate: dateOnDay(15, 13),
    });
    const expected = amortize(120000, 12, deriveMonths(120000, 12, 10000));
    const res = await requestAs(db.alice, `/api/debts/${debtId}/amortization`);
    const body = (await res.json()) as { schedule: ScheduleRow[] };
    expect(body.schedule.length).toBe(expected.length);
    expect(body.schedule[0].interest_part).toBe(expected[0].interest_part);
    expect(body.schedule[0].principal_part).toBe(expected[0].principal_part);
    expect(body.schedule[0].outstanding_after).toBe(expected[0].outstanding_after);
    expect(body.schedule[body.schedule.length - 1].outstanding_after).toBe(0);
  });

  it("lists debts sorted by rate desc and filters by type and status", async () => {
    const low = await createDebt(db.alice, "Low Rate", {
      principalOutstanding: 100000,
      interestRate: 8,
      emiAmount: 9000,
      tenureMonths: 12,
    });
    const high = await createDebt(db.alice, "High Rate", {
      principalOutstanding: 100000,
      interestRate: 18,
      emiAmount: 9000,
      tenureMonths: 12,
    });

    const res = await requestAs(db.alice, "/api/debts");
    const body = (await res.json()) as { debts: Debt[] };
    expect(body.debts.map((d) => d.id)).toEqual([high, low]);

    const filtered = await requestAs(
      db.alice,
      `/api/debts?type=personal_loan&status=active`
    );
    const filteredBody = (await filtered.json()) as { debts: Debt[] };
    expect(filteredBody.debts.length).toBe(2);

    const closed = await requestAs(db.alice, "/api/debts?status=closed");
    expect((await closed.json()).debts.length).toBe(0);
  });

  it("isolates debts between users", async () => {
    const debtId = await createZeroRateLoan();
    const res = await requestAs(db.bob, `/api/debts/${debtId}`);
    expect(res.status).toBe(404);
    const list = await requestAs(db.bob, "/api/debts");
    expect((await list.json()).debts.length).toBe(0);
  });

  it("patches non-schedule fields without recomputing", async () => {
    const debtId = await createZeroRateLoan();
    const res = await patchAs(db.alice, `/api/debts/${debtId}`, {
      name: "Renamed Loan",
      lender: "SBI",
      version: 1,
    });
    expect(res.status).toBe(200);
    const debt = await debtDetail(debtId);
    expect(debt.name).toBe("Renamed Loan");
    expect(debt.lender).toBe("SBI");
    expect(debt.months_remaining).toBe(12);
    expect(debt.version).toBe(2);
  });

  it("recomputes schedule on rate change and rejects stale versions", async () => {
    const debtId = await createZeroRateLoan();
    const res = await patchAs(db.alice, `/api/debts/${debtId}`, {
      interest_rate: "12",
      version: 1,
    });
    expect(res.status).toBe(200);
    const debt = await debtDetail(debtId);
    expect(debt.months_remaining).toBe(deriveMonths(12000, 12, 1000));
    expect(debt.version).toBe(2);

    const stale = await patchAs(db.alice, `/api/debts/${debtId}`, {
      name: "Stale",
      version: 1,
    });
    expect(stale.status).toBe(409);

    const missing = await patchAs(db.alice, `/api/debts/00000000-0000-0000-0000-000000000000`, {
      name: "Ghost",
      version: 1,
    });
    expect(missing.status).toBe(404);
  });

  it("deletes only debts without recorded payments", async () => {
    const debtId = await createZeroRateLoan();
    const res = await requestAs(db.alice, `/api/debts/${debtId}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await requestAs(db.alice, `/api/debts/${debtId}`)).status).toBe(404);

    const withPayment = await createZeroRateLoan();
    await logPayment(withPayment, 1000, dateOnDay(15, 1));
    const blocked = await requestAs(db.alice, `/api/debts/${withPayment}`, {
      method: "DELETE",
    });
    expect(blocked.status).toBe(409);
  });
});

describe("close and reopen", () => {
  it("rejects closing a debt with an outstanding balance", async () => {
    const debtId = await createZeroRateLoan();
    const res = await postAs(db.alice, `/api/debts/${debtId}/close`, {});
    expect(res.status).toBe(409);
  });

  it("closes a fully paid debt and reopens it", async () => {
    const debtId = await createZeroRateLoan();
    for (let i = 1; i <= 11; i++) {
      const res = await logPayment(debtId, 1000, dateOnDay(15, 12 - i));
      expect(res.status).toBe(200);
    }
    await logPayment(debtId, 1000, TODAY);
    const paid = await debtDetail(debtId);
    expect(paid.principal_outstanding).toBe(0);
    expect(paid.is_active).toBe(0);
    expect(paid.months_remaining).toBe(0);
    expect(paid.closed_date).toBe(TODAY);

    const close = await postAs(db.alice, `/api/debts/${debtId}/close`, {});
    expect(close.status).toBe(200);

    const closedList = await requestAs(db.alice, "/api/debts?status=closed");
    const closedBody = (await closedList.json()) as { debts: Debt[] };
    expect(closedBody.debts.map((d) => d.id)).toContain(debtId);

    const reopen = await postAs(db.alice, `/api/debts/${debtId}/reopen`, {});
    expect(reopen.status).toBe(200);
    const reopened = await debtDetail(debtId);
    expect(reopened.is_active).toBe(1);
    expect(reopened.closed_date).toBeNull();
  });
});

describe("payments", () => {
  it("logs a payment defaulting to the scheduled EMI and updates derived state", async () => {
    const debtId = await createZeroRateLoan();
    const res = await postAs(db.alice, `/api/debts/${debtId}/payments`, {
      date: TODAY,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      payment: { id: string };
      outstanding_after: number;
      is_active: number;
    };
    expect(body.outstanding_after).toBe(11000);
    expect(body.is_active).toBe(1);

    const debt = await debtDetail(debtId);
    expect(debt.principal_outstanding).toBe(11000);
    expect(debt.total_interest_paid).toBe(0);
    expect(debt.months_remaining).toBe(11);
    expect(debt.end_date).toBe(addMonths(TODAY, 11));

    const history = (await (
      await requestAs(db.alice, `/api/debts/${debtId}/payments`)
    ).json()) as { payments: DebtPayment[] };
    expect(history.payments.length).toBe(1);
    expect(history.payments[0]).toMatchObject({
      type: "emi",
      amount: 1000,
      principal_part: 1000,
      interest_part: 0,
      outstanding_after: 11000,
    });
  });

  it("splits a payment into principal and interest for rate-bearing loans", async () => {
    const debtId = await createDebt(db.alice, "Rate Loan", {
      principalOutstanding: 120000,
      interestRate: 12,
      emiAmount: 10000,
      tenureMonths: 12,
    });
    const res = await logPayment(debtId, 10000, TODAY);
    expect(res.status).toBe(200);
    const debt = await debtDetail(debtId);
    expect(debt.principal_outstanding).toBe(111200);
    expect(debt.total_interest_paid).toBe(1200);
    expect(debt.months_remaining).toBe(deriveMonths(111200, 12, 10000));
    expect(debt.end_date).toBe(addMonths(TODAY, deriveMonths(111200, 12, 10000)));
  });

  it("marks a partial payment as partial and applies only the principal", async () => {
    const debtId = await createZeroRateLoan();
    await logPayment(debtId, 500, dateOnDay(15, 1));
    const debt = await debtDetail(debtId);
    expect(debt.principal_outstanding).toBe(11500);

    const status = (await (
      await requestAs(db.alice, `/api/debts/${debtId}/payment-status`)
    ).json()) as { months: { month: string; status: string }[] };
    const lastMonth = status.months.find((m) => m.month === dateOnDay(15, 1).slice(0, 7));
    expect(lastMonth?.status).toBe("partial");
  });

  it("creates a linked expense transaction when requested", async () => {
    const accountId = await createAccount(db.alice, "Salary");
    const debtId = await createDebt(db.alice, "Linked Loan", {
      principalOutstanding: 120000,
      interestRate: 12,
      emiAmount: 10000,
      tenureMonths: 12,
      accountId,
    });
    const res = await logPayment(debtId, 10000, TODAY, {
      link_transaction: true,
    });
    expect(res.status).toBe(200);
    const tx = await pool.query<{ id: string; type: string; amount: string; description: string }>(
      `SELECT id, type, amount::text, description FROM transactions
       WHERE user_id = $1 AND description = $2`,
      [db.alice.userId, "EMI - Linked Loan"]
    );
    expect(tx.rowCount).toBe(1);
    expect(tx.rows[0].type).toBe("expense");
    expect(Number(tx.rows[0].amount)).toBe(10000);

    const payments = (await (
      await requestAs(db.alice, `/api/debts/${debtId}/payments`)
    ).json()) as { payments: DebtPayment[] };
    expect(payments.payments[0].transaction_id).toBe(tx.rows[0].id);

    const invalid = await logPayment(debtId, 10000, TODAY, {
      transaction_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(invalid.status).toBe(400);
  });

  it("auto-closes the debt on the final payment", async () => {
    const debtId = await createZeroRateLoan();
    for (let i = 1; i <= 10; i++) {
      await logPayment(debtId, 1000, dateOnDay(15, 11 - i));
    }
    const res = await logPayment(debtId, 2000, TODAY);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_active: number };
    expect(body.is_active).toBe(0);

    const debt = await debtDetail(debtId);
    expect(debt.principal_outstanding).toBe(0);
    expect(debt.closed_date).toBe(TODAY);
    expect(debt.months_remaining).toBe(0);
    expect(debt.progress_pct).toBe(100);

    const sched = await requestAs(db.alice, `/api/debts/${debtId}/amortization`);
    expect((await sched.json()).schedule_length).toBe(0);
  });

  it("applies a prepayment and reduces the remaining tenure", async () => {
    const debtId = await createZeroRateLoan();
    const res = await postAs(db.alice, `/api/debts/${debtId}/prepayments`, {
      amount: "2000",
      date: TODAY,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { outstanding_after: number };
    expect(body.outstanding_after).toBe(10000);

    const debt = await debtDetail(debtId);
    expect(debt.months_remaining).toBe(10);

    const history = (await (
      await requestAs(db.alice, `/api/debts/${debtId}/payments`)
    ).json()) as { payments: DebtPayment[] };
    expect(history.payments[0].type).toBe("prepayment");
  });

  it("auto-closes when a prepayment covers the balance", async () => {
    const debtId = await createZeroRateLoan();
    const res = await postAs(db.alice, `/api/debts/${debtId}/prepayments`, {
      amount: "12000",
      date: TODAY,
    });
    expect(res.status).toBe(200);
    const debt = await debtDetail(debtId);
    expect(debt.is_active).toBe(0);
    expect(debt.principal_outstanding).toBe(0);
    expect(debt.closed_date).toBe(TODAY);
  });

  it("replays the payment chain after editing a payment", async () => {
    const debtId = await createZeroRateLoan();
    const p1 = (await logPayment(debtId, 1000, dateOnDay(15, 3))).json();
    const p2 = (await logPayment(debtId, 1000, dateOnDay(15, 2))).json();
    await logPayment(debtId, 1000, dateOnDay(15, 1));
    const p2Body = (await p2) as { payment: { id: string } };
    const p1Body = (await p1) as { payment: { id: string } };
    expect((await debtDetail(debtId)).principal_outstanding).toBe(9000);

    const res = await patchAs(db.alice, `/api/debts/${debtId}/payments/${p2Body.payment.id}`, {
      amount: "2000",
    });
    expect(res.status).toBe(200);

    const debt = await debtDetail(debtId);
    expect(debt.principal_outstanding).toBe(8000);
    expect(debt.months_remaining).toBe(8);

    const history = (await (
      await requestAs(db.alice, `/api/debts/${debtId}/payments`)
    ).json()) as { payments: DebtPayment[] };
    expect(history.payments).toMatchObject([
      { id: p1Body.payment.id, amount: 1000, outstanding_after: 11000 },
      { id: p2Body.payment.id, amount: 2000, outstanding_after: 9000 },
      { amount: 1000, outstanding_after: 8000 },
    ]);
  });

  it("replays the payment chain after deleting a payment", async () => {
    const debtId = await createZeroRateLoan();
    await logPayment(debtId, 1000, dateOnDay(15, 3));
    const p2 = (await logPayment(debtId, 1000, dateOnDay(15, 2))).json();
    await logPayment(debtId, 1000, dateOnDay(15, 1));
    const p2Body = (await p2) as { payment: { id: string } };

    const res = await requestAs(
      db.alice,
      `/api/debts/${debtId}/payments/${p2Body.payment.id}`,
      { method: "DELETE" }
    );
    expect(res.status).toBe(200);

    const debt = await debtDetail(debtId);
    expect(debt.principal_outstanding).toBe(10000);
    expect(debt.months_remaining).toBe(10);

    const history = (await (
      await requestAs(db.alice, `/api/debts/${debtId}/payments`)
    ).json()) as { payments: DebtPayment[] };
    expect(history.payments.length).toBe(2);
    expect(history.payments[1].outstanding_after).toBe(10000);
  });
});

describe("amortization view, breakdown and prepayment simulation", () => {
  it("filters the schedule by year with a yearly summary", async () => {
    const start = dateOnDay(15, 13);
    const debtId = await createZeroRateLoan(start);
    const year = start.slice(0, 4);
    const res = await requestAs(
      db.alice,
      `/api/debts/${debtId}/amortization?year=${year}`
    );
    const body = (await res.json()) as {
      year_summary: { year: number; total_emi: number; total_principal: number; total_interest: number };
    };
    const expected = amortize(12000, 0, 12)
      .map((row, i) => ({ ...row, scheduled_date: addMonths(start, i) }))
      .filter((row) => row.scheduled_date?.slice(0, 4) === year);
    expect(body.year_summary).toEqual({
      year: Number(year),
      total_emi: money(expected.reduce((s, r) => s + r.emi_amount, 0)),
      total_principal: money(expected.reduce((s, r) => s + r.principal_part, 0)),
      total_interest: 0,
    });
  });

  it("regenerates the cached schedule", async () => {
    const debtId = await createZeroRateLoan();
    const res = await postAs(db.alice, `/api/debts/${debtId}/amortization/regenerate`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { periods: number };
    expect(body.periods).toBe(12);
  });

  it("reports the cost breakdown split by principal and interest", async () => {
    const debtId = await createZeroRateLoan();
    await logPayment(debtId, 1000, TODAY);
    const res = await requestAs(db.alice, `/api/debts/${debtId}/cost-breakdown`);
    const body = (await res.json()) as {
      principal_paid: number;
      interest_paid: number;
      remaining_interest: number;
      total_cost: number;
      principal_pct: number;
      interest_pct: number;
    };
    expect(body.principal_paid).toBe(1000);
    expect(body.interest_paid).toBe(0);
    expect(body.remaining_interest).toBe(0);
    expect(body.total_cost).toBe(11000);
    expect(body.principal_pct).toBe(100);
    expect(body.interest_pct).toBe(0);
  });

  it("simulates reduce-tenure and reduce-EMI prepayments", async () => {
    const debtId = await createZeroRateLoan();
    const tenureRes = await postAs(db.alice, `/api/debts/${debtId}/simulate-prepayment`, {
      amount: "2000",
      strategy: "reduce_tenure",
    });
    expect(tenureRes.status).toBe(200);
    const tenure = (await tenureRes.json()).simulation;
    expect(tenure.new_emi).toBe(1000);
    expect(tenure.new_tenure_months).toBe(10);
    expect(tenure.months_saved).toBe(2);
    expect(tenure.interest_saved).toBe(0);

    const emiRes = await postAs(db.alice, `/api/debts/${debtId}/simulate-prepayment`, {
      amount: "2000",
      strategy: "reduce_emi",
    });
    expect(emiRes.status).toBe(200);
    const emi = (await emiRes.json()).simulation;
    expect(emi.new_emi).toBe(833.33);
    expect(emi.new_tenure_months).toBe(12);
    expect(emi.months_saved).toBe(0);
  });

  it("validates the prepayment simulation inputs", async () => {
    const debtId = await createZeroRateLoan();
    const badAmount = await postAs(db.alice, `/api/debts/${debtId}/simulate-prepayment`, {
      amount: "0",
      strategy: "reduce_tenure",
    });
    expect(badAmount.status).toBe(400);

    const badStrategy = await postAs(db.alice, `/api/debts/${debtId}/simulate-prepayment`, {
      amount: "1000",
      strategy: "magic",
    });
    expect(badStrategy.status).toBe(400);

    const cc = await postAs(db.alice, "/api/debts", {
      name: "CC",
      type: "credit_card",
      principal_outstanding: "10000",
      interest_rate: "36",
      minimum_due: "500",
    });
    const ccId = (await cc.json()).debt.id;
    const ccSim = await postAs(db.alice, `/api/debts/${ccId}/simulate-prepayment`, {
      amount: "1000",
      strategy: "reduce_tenure",
    });
    expect(ccSim.status).toBe(400);
  });
});

describe("payment status timeline", () => {
  it("marks passed periods as missed when nothing is paid", async () => {
    const debtId = await createZeroRateLoan();
    const res = await requestAs(db.alice, `/api/debts/${debtId}/payment-status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      missed_count: number;
      months: { month: string; status: string }[];
    };
    expect(body.months.length).toBe(12);
    expect(body.months.filter((m) => m.status === "missed").length).toBe(10);
    expect(body.missed_count).toBe(10);
    expect(body.months.some((m) => m.status === "none")).toBe(true);
  });

  it("marks the current period paid after logging the EMI", async () => {
    const debtId = await createZeroRateLoan();
    await logPayment(debtId, 1000, TODAY);
    const body = (await (
      await requestAs(db.alice, `/api/debts/${debtId}/payment-status`)
    ).json()) as { missed_count: number; months: { month: string; status: string }[] };
    expect(body.missed_count).toBe(0);
    const current = body.months.find((m) => m.month === TODAY.slice(0, 7));
    expect(current?.status).toBe("paid");
  });

  it("marks a partial payment as partial", async () => {
    const debtId = await createZeroRateLoan();
    await logPayment(debtId, 500, dateOnDay(15, 1));
    const body = (await (
      await requestAs(db.alice, `/api/debts/${debtId}/payment-status`)
    ).json()) as { months: { month: string; status: string }[] };
    const lastMonth = body.months.find(
      (m) => m.month === dateOnDay(15, 1).slice(0, 7)
    );
    expect(lastMonth?.status).toBe("partial");
  });
});

describe("debt-to-income ratio", () => {
  it("returns null DTI until a monthly income is set", async () => {
    await createZeroRateLoan();
    const res = await requestAs(db.alice, "/api/debts/dti");
    const body = (await res.json()) as {
      dti: number | null;
      total_monthly_emi: number;
      income_missing: boolean;
    };
    expect(body.dti).toBeNull();
    expect(body.total_monthly_emi).toBe(1000);
    expect(body.income_missing).toBe(true);
  });

  it("computes DTI levels and colors from the settings income", async () => {
    await createZeroRateLoan();
    const set = async (income: number | null) =>
      patchAs(db.alice, "/api/users/me/settings/monthly-income", {
        monthly_income: income === null ? null : String(income),
      });
    expect((await set(30000)).status).toBe(200);

    const green = (await (
      await requestAs(db.alice, "/api/debts/dti")
    ).json()) as { dti: number; level: string };
    expect(green.dti).toBe(3.33);
    expect(green.level).toBe("green");

    await set(2500);
    const orange = (await (
      await requestAs(db.alice, "/api/debts/dti")
    ).json()) as { dti: number; level: string; color: string };
    expect(orange.dti).toBe(40);
    expect(orange.level).toBe("orange");

    await set(1500);
    const red = (await (
      await requestAs(db.alice, "/api/debts/dti")
    ).json()) as { level: string; color: string };
    expect(red.level).toBe("red");
    expect(red.color).toBe("#dc2626");

    await set(null);
    const cleared = (await (
      await requestAs(db.alice, "/api/debts/dti")
    ).json()) as { dti: number | null; income_missing: boolean };
    expect(cleared.dti).toBeNull();
    expect(cleared.income_missing).toBe(true);

    const invalid = await patchAs(db.alice, "/api/users/me/settings/monthly-income", {
      monthly_income: "-5",
    });
    expect(invalid.status).toBe(400);
  });
});

describe("dashboard, strategies and combined timeline", () => {
  it("aggregates dashboard totals", async () => {
    const zero = await createZeroRateLoan();
    const rate = await createDebt(db.alice, "Rate Loan", {
      principalOutstanding: 120000,
      interestRate: 12,
      emiAmount: 10000,
      tenureMonths: 12,
    });
    const res = await requestAs(db.alice, "/api/debts/dashboard");
    const body = (await res.json()).dashboard;
    expect(body.total_outstanding).toBe(132000);
    expect(body.total_monthly_emi).toBe(11000);
    expect(body.active_count).toBe(2);
    expect(body.closed_count).toBe(0);
    expect(body.dti.dti).toBeNull();
    const zeroDebt = body.debts.find((d: { id: string }) => d.id === zero);
    const rateDebt = body.debts.find((d: { id: string }) => d.id === rate);
    expect(zeroDebt.progress_pct).toBe(0);
    expect(rateDebt.progress_pct).toBe(0);
  });

  it("compares avalanche vs snowball with divergent payoff orders", async () => {
    const highRate = await createDebt(db.alice, "High Rate Big", {
      principalOutstanding: 200000,
      interestRate: 18,
      emiAmount: 20000,
      tenureMonths: 12,
    });
    const lowRate = await createDebt(db.alice, "Low Rate Small", {
      principalOutstanding: 150000,
      interestRate: 8,
      emiAmount: 15000,
      tenureMonths: 12,
    });
    const res = await postAs(db.alice, "/api/debts/strategies/compare", {
      extra_monthly: "10000",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      baseline: { months_to_debt_free: number };
      avalanche: { payoff_order: string[]; months_to_debt_free: number; interest_saved: number };
      snowball: { payoff_order: string[] };
    };
    expect(body.avalanche.payoff_order[0]).toBe(highRate);
    expect(body.snowball.payoff_order[0]).toBe(lowRate);
    expect(body.avalanche.months_to_debt_free).toBeLessThan(
      body.baseline.months_to_debt_free
    );
    expect(body.avalanche.interest_saved).toBeGreaterThan(0);

    const missing = await postAs(db.alice, "/api/debts/strategies/compare", {});
    expect(missing.status).toBe(400);
  });

  it("builds the combined payoff timeline", async () => {
    const zero = await createZeroRateLoan();
    const rate = await createDebt(db.alice, "Rate Loan", {
      principalOutstanding: 120000,
      interestRate: 12,
      emiAmount: 10000,
      tenureMonths: 12,
    });
    const res = await requestAs(db.alice, "/api/debts/combined-timeline");
    const body = (await res.json()) as {
      combined: {
        total_outstanding: number;
        total_monthly_emi: number;
        active_count: number;
      };
      timeline: { debt_id: string; months_remaining: number; payoff_date: string | null }[];
    };
    expect(body.combined.total_outstanding).toBe(132000);
    expect(body.combined.total_monthly_emi).toBe(11000);
    expect(body.combined.active_count).toBe(2);
    expect(body.timeline.length).toBe(2);
    const zeroEntry = body.timeline.find((t) => t.debt_id === zero);
    const rateEntry = body.timeline.find((t) => t.debt_id === rate);
    expect(zeroEntry?.months_remaining).toBe(12);
    expect(rateEntry?.payoff_date).toBeTruthy();
  });

  it("runs the portfolio-level strategy comparison", async () => {
    await createDebt(db.alice, "A", {
      principalOutstanding: 100000,
      interestRate: 18,
      emiAmount: 10000,
      tenureMonths: 12,
    });
    const res = await postAs(db.alice, "/api/debts/combined/strategies", {
      extra_monthly: "5000",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      baseline: object;
      avalanche: { months_to_debt_free: number };
      snowball: { months_to_debt_free: number };
    };
    expect(body.avalanche.months_to_debt_free).toBeGreaterThan(0);
    expect(body.snowball.months_to_debt_free).toBeGreaterThan(0);

    const missing = await postAs(db.alice, "/api/debts/combined/strategies", {});
    expect(missing.status).toBe(400);
  });
});

describe("health alerts", () => {
  it("flags missed payments on an unserviced loan", async () => {
    await createZeroRateLoan();
    const res = await requestAs(db.alice, "/api/debts/health-alerts");
    const body = (await res.json()) as {
      alerts: { type: string; severity: string }[];
    };
    const missed = body.alerts.find((a) => a.type === "missed_payments");
    expect(missed).toBeTruthy();
    expect(missed?.severity).toBe("critical");
  });

  it("clears alerts once the current EMI is paid", async () => {
    const debtId = await createZeroRateLoan();
    await logPayment(debtId, 1000, TODAY);
    const body = (await (
      await requestAs(db.alice, "/api/debts/health-alerts")
    ).json()) as { alerts: { type: string }[] };
    expect(body.alerts.filter((a) => a.type === "missed_payments").length).toBe(0);
  });

  it("flags a high debt-to-income ratio", async () => {
    await createZeroRateLoan();
    await patchAs(db.alice, "/api/users/me/settings/monthly-income", {
      monthly_income: "1500",
    });
    const body = (await (
      await requestAs(db.alice, "/api/debts/health-alerts")
    ).json()) as { alerts: { type: string; severity: string }[] };
    const highDti = body.alerts.find((a) => a.type === "high_dti");
    expect(highDti).toBeTruthy();
    expect(highDti?.severity).toBe("critical");
  });

  it("flags a debt with no recent payment", async () => {
    const debtId = await createZeroRateLoan();
    await logPayment(debtId, 1000, dateOnDay(15, 2));
    const body = (await (
      await requestAs(db.alice, "/api/debts/health-alerts")
    ).json()) as { alerts: { type: string }[] };
    expect(body.alerts.some((a) => a.type === "no_recent_payment")).toBe(true);
  });
});

describe("exports and debt types", () => {
  it("exports the debt summary CSV with a BOM", async () => {
    const debtId = await createZeroRateLoan();
    const res = await requestAs(db.alice, "/api/debts/export");
    expect(res.status).toBe(200);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      await res.arrayBuffer()
    );
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain("Name,Type,Outstanding,Interest Rate,EMI");
    expect(text).toContain("Zero Loan");
    expect(res.headers.get("content-disposition")).toContain("debts.csv");
    void debtId;
  });

  it("exports the amortization schedule CSV with a BOM", async () => {
    const debtId = await createZeroRateLoan();
    const res = await requestAs(db.alice, `/api/debts/${debtId}/amortization/export`);
    expect(res.status).toBe(200);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      await res.arrayBuffer()
    );
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain("Period,EMI,Principal,Interest,Balance,Cumulative Interest");
    expect(text).toContain("1,1000,1000,0,11000,0");
    expect(res.headers.get("content-disposition")).toContain("amortization.csv");
  });

  it("serves the seeded debt type lookup", async () => {
    const res = await requestAs(db.alice, "/api/debt-types");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { debt_types: { type_code: string; display_name: string }[] };
    expect(body.debt_types.length).toBe(6);
    expect(body.debt_types[0].type_code).toBe("home_loan");
    expect(body.debt_types[5].type_code).toBe("other");
    expect(body.debt_types.find((t) => t.type_code === "credit_card")?.display_name).toBe(
      "Credit Card"
    );
  });
});