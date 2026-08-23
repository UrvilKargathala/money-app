import { describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  createAccount,
  createCategory,
  createDebt,
  fixtureDb,
  postAs,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

async function addTxn(
  type: "income" | "expense",
  amount: number,
  daysAgo: number,
  opts: { merchant?: string; description?: string; categoryId?: string | null } = {}
): Promise<void> {
  const accountId = await ensureAccount();
  await pool.query(
    `INSERT INTO transactions
       (user_id, account_id, type, amount, description, merchant_clean, category_id,
        date, source, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE - $8::int, 'manual', $1, $1)`,
    [
      db.alice.userId,
      accountId,
      type,
      amount,
      opts.description ?? `${type} txn`,
      opts.merchant ?? null,
      opts.categoryId ?? null,
      daysAgo,
    ]
  );
}

/** Accounts are wiped by resetDb between tests â€” look one up fresh each time. */
async function ensureAccount(): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM accounts WHERE user_id = $1 AND is_active = 1 ORDER BY id LIMIT 1`,
    [db.alice.userId]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  return createAccount(db.alice, "Report Bank");
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

describe("cashflow and category analytics", () => {
  it("buckets income vs expense per month with net", async () => {
    await addTxn("income", 100000, 10);
    await addTxn("expense", 30000, 12);
    await addTxn("expense", 20000, 40);

    const res = await requestAs(
      db.alice,
      `/api/reports/cashflow?from=${isoDaysAgo(60)}&to=${isoDaysAgo(0)}`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cashflow: { month: string; income: number; expense: number }[];
    };
    const totalIncome = body.cashflow.reduce((s, m) => s + m.income, 0);
    const totalExpense = body.cashflow.reduce((s, m) => s + m.expense, 0);
    expect(totalIncome).toBe(100000);
    expect(totalExpense).toBe(50000);
    // Transfers excluded by design.
  });

  it("spending-by-category computes totals, counts and shares", async () => {
    const groceries = await createCategory(db.alice, "Groceries Test");
    await addTxn("expense", 4000, 5, { categoryId: groceries });
    await addTxn("expense", 1000, 6, { categoryId: groceries });
    await addTxn("expense", 2500, 7); // uncategorised

    const res = await requestAs(
      db.alice,
      `/api/reports/spending-by-category?from=${isoDaysAgo(30)}&to=${isoDaysAgo(0)}`
    );
    const body = (await res.json()) as {
      categories: { category: string; total: number; count: number; pct: number }[];
    };
    const groceryRow = body.categories.find((c) => c.category === "Groceries Test")!;
    const uncat = body.categories.find((c) => c.category === "Uncategorised")!;
    expect(groceryRow.total).toBe(5000);
    expect(groceryRow.count).toBe(2);
    expect(uncat.total).toBe(2500);
    const pctSum = body.categories.reduce((s, c) => s + c.pct, 0);
    expect(pctSum).toBeCloseTo(100, 0);
  });

  it("trends accumulate spend over the requested window", async () => {
    await addTxn("expense", 5000, 3);
    const res = await requestAs(db.alice, "/api/reports/trends?months=3");
    const body = (await res.json()) as {
      months: number;
      trend: { cumulative_spend: number }[];
    };
    expect(body.months).toBe(3);
    // Cumulative last point â‰¥ this month's expense.
    expect(body.trend.at(-1)!.cumulative_spend).toBeGreaterThanOrEqual(5000);
  });

  it("income-sources omit categories with no income", async () => {
    await addTxn("expense", 999, 2);
    const before = (await (
      await requestAs(
        db.alice,
        `/api/reports/income-sources?from=${isoDaysAgo(1)}&to=${isoDaysAgo(0)}`
      )
    ).json()) as { sources: unknown[] };
    expect(before.sources).toEqual([]);

    await addTxn("income", 70000, 1);
    const after = (await (
      await requestAs(
        db.alice,
        `/api/reports/income-sources?from=${isoDaysAgo(1)}&to=${isoDaysAgo(0)}`
      )
    ).json()) as { total_income: number; sources: { total: number }[] };
    expect(after.total_income).toBe(70000);
    expect(after.sources.length).toBeGreaterThan(0);
  });

  it("heatmap sums per-day spend for the month", async () => {
    await addTxn("expense", 1200, 0);
    await addTxn("expense", 800, 0);
    const now = new Date();
    const res = await requestAs(
      db.alice,
      `/api/reports/heatmap?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
    );
    const body = (await res.json()) as {
      days: { date: string; total: number }[];
    };
    const today = body.days.at(-1)!;
    expect(today.total).toBeGreaterThanOrEqual(2000);
  });

  it("top merchants rank by spend, flag recurring at >=3 txns and support frequency sort", async () => {
    for (const [i, amt] of [900, 850, 800].entries()) {
      await addTxn("expense", amt, i + 1, { merchant: "Big Bazaar", description: "Groceries run" });
    }
    await addTxn("expense", 5000, 4, { merchant: "Apple Store", description: "Gadget" });

    const bySpend = (await (
      await requestAs(db.alice, "/api/reports/top-merchants")
    ).json()) as {
      merchants: { merchant: string; total: number; txn_count: number; recurring: number }[];
    };
    expect(bySpend.merchants[0].merchant).toBe("Apple Store");
    const bigBazaar = bySpend.merchants.find((m) => m.merchant === "Big Bazaar")!;
    expect(bigBazaar.txn_count).toBe(3);
    expect(bigBazaar.recurring).toBe(1);

    const byFreq = (await (
      await requestAs(db.alice, "/api/reports/top-merchants?sort=frequency")
    ).json()) as { merchants: { merchant: string; txn_count: number }[] };
    expect(byFreq.merchants[0].txn_count).toBe(3);
  });

  it("summary combines metrics from every module", async () => {
    await addTxn("expense", 6000, 2);
    await createDebt(db.alice, "Bike Loan", { principalOutstanding: 45000 });

    const res = await requestAs(
      db.alice,
      `/api/reports/summary?from=${isoDaysAgo(30)}&to=${isoDaysAgo(0)}`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: {
        total_income: number;
        total_expense: number;
        net: number;
        debt_outstanding: number;
      };
    };
    expect(body.summary.debt_outstanding).toBe(45000);
    expect(body.summary.total_expense).toBeGreaterThan(0);
    expect(body.summary.net).toBeLessThan(0);
  });

  it("budget-vs-actual mirrors Module 3 computed metrics", async () => {
    const catId = await createCategory(db.alice, "Budget Groceries");
    await postAs(db.alice, "/api/budgets", {
      category_id: catId,
      amount: "3000",
      period: "monthly",
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
    });
    await addTxn("expense", 3500, 1, { categoryId: catId });

    const res = await requestAs(db.alice, "/api/reports/budget-vs-actual");
    const body = (await res.json()) as {
      budgets: { name: string; category_id: string | null; budgeted: number; actual: number; over_budget: boolean }[];
    };
    const row = body.budgets.find((b) => b.category_id === catId)!;
    expect(row.budgeted).toBe(3000);
    expect(row.actual).toBeGreaterThanOrEqual(3500);
    expect(row.over_budget).toBe(true);
  });

  it("net-worth-over-time reads Module 9 snapshots with daily deltas", async () => {
    for (const [daysAgo, assets] of [
      [3, 500000],
      [2, 520000],
      [1, 510000],
    ] as [number, number][]) {
      await pool.query(
        `INSERT INTO net_worth_snapshots (user_id, date, assets_total, liabilities_total)
         VALUES ($1, CURRENT_DATE - $2::int, $3, 0)
         ON CONFLICT (user_id, date) DO UPDATE SET assets_total = EXCLUDED.assets_total`,
        [db.alice.userId, daysAgo, assets]
      );
    }
    const res = await requestAs(db.alice, "/api/reports/net-worth");
    const body = (await res.json()) as {
      series: { net_worth: number; change_pct: number | null }[];
    };
    expect(body.series).toHaveLength(3);
    expect(body.series[1].change_pct).toBeCloseTo(4, 1);
    expect(body.series[2].change_pct).not.toBeNull();
  });

  it("debt-payoff reports paid percentage against original principal", async () => {
    await createDebt(db.alice, "Paydown Loan", {
      principalOriginal: 200000,
      principalOutstanding: 150000,
      interestRate: 10,
      emiAmount: 10000,
      tenureMonths: 20,
    });
    const res = await requestAs(db.alice, "/api/reports/debt-payoff");
    const body = (await res.json()) as {
      debts: { principal_outstanding: number; paid_pct: number }[];
    };
    const loan = body.debts.find((d) => d.principal_outstanding === 150000)!;
    expect(loan.paid_pct).toBe(25);
  });

  it("exports cashflow and summary CSVs", async () => {
    const cfRes = await requestAs(db.alice, "/api/reports/cashflow/export");
    expect(cfRes.status).toBe(200);
    expect(await cfRes.text()).toContain("Month,Income,Expense,Net");

    const sumRes = await requestAs(
      db.alice,
      `/api/reports/export?from=${isoDaysAgo(30)}&to=${isoDaysAgo(0)}`
    );
    expect(sumRes.status).toBe(200);
    expect(await sumRes.text()).toContain("Metric,Value");
  });
});
