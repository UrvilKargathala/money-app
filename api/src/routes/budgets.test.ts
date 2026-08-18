import { describe, expect, it } from "vitest";
import { pool } from "../db";
import type {
  BudgetBreakdownItem,
  BudgetOverview,
  BudgetWithUtilization,
  UnbudgetedCategory,
} from "../queries/budgets";
import {
  createAccount,
  createCategory,
  createExpense,
  createIncome,
  postAs,
  rawRequest,
  requestAs,
  fixtureDb,
} from "../test/helpers";

const db = fixtureDb();

const MONTH = 8;
const YEAR = 2026;

async function createBudget(
  categoryId: string | null,
  amount: number,
  month = MONTH,
  year = YEAR
) {
  const res = await postAs(db.alice, "/api/budgets", {
    category_id: categoryId ?? "",
    amount: String(amount),
    period: "monthly",
    month,
    year,
  });
  if (!res.ok) throw new Error(`createBudget failed: ${res.status}`);
}

describe("budgets auth + validation", () => {
  it("rejects unauthenticated requests", async () => {
    expect((await rawRequest("/api/budgets")).status).toBe(401);
    expect(
      (await rawRequest("/api/budgets", { method: "POST" })).status
    ).toBe(401);
    expect((await rawRequest("/api/budgets/overview")).status).toBe(401);
  });

  it("validates amount and month", async () => {
    const res = await postAs(db.alice, "/api/budgets", {
      category_id: "",
      amount: "0",
      month: 8,
      year: 2026,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.amount).toBeTruthy();
    expect(body.fieldErrors.month).toBeUndefined();

    const badMonth = await postAs(db.alice, "/api/budgets", {
      category_id: "",
      amount: "100",
      month: 13,
      year: 2026,
    });
    expect(badMonth.status).toBe(400);
  });

  it("rejects a category that doesn't exist", async () => {
    const res = await postAs(db.alice, "/api/budgets", {
      category_id: "00000000-0000-0000-0000-000000000000",
      amount: "100",
      month: 8,
      year: 2026,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.category_id).toBeTruthy();
  });
});

describe("budgets CRUD", () => {
  it("creates a category budget and lists it with utilization", async () => {
    const food = await createCategory(db.alice, "Food");
    const account = await createAccount(db.alice, "Savings");
    await createExpense(db.alice, account, food, 1000, "2026-08-05");

    await createBudget(food, 2000);

    const res = await requestAs(db.alice, `/api/budgets?month=${MONTH}&year=${YEAR}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { budgets: BudgetWithUtilization[] };
    expect(body.budgets).toHaveLength(1);
    const b = body.budgets[0];
    expect(b.category_name).toBe("Food");
    expect(b.amount).toBe(2000);
    expect(b.spent).toBe(1000);
    expect(b.remaining).toBe(1000);
    expect(b.utilization_pct).toBe(50);
    expect(b.is_over_budget).toBe(0);
  });

  it("ignores income and other categories in spend", async () => {
    const food = await createCategory(db.alice, "Food");
    const transport = await createCategory(db.alice, "Transport");
    const salary = await createCategory(db.alice, "Salary");
    const account = await createAccount(db.alice, "Savings");

    await createIncome(db.alice, account, salary, 50000, "2026-08-02");
    await createExpense(db.alice, account, transport, 400, "2026-08-03");
    await createBudget(food, 2000);

    const res = await requestAs(db.alice, `/api/budgets?month=${MONTH}&year=${YEAR}`);
    const body = (await res.json()) as { budgets: BudgetWithUtilization[] };
    expect(body.budgets).toHaveLength(1);
    expect(body.budgets[0].spent).toBe(0);
  });

  it("rejects duplicate category and duplicate overall budgets", async () => {
    const food = await createCategory(db.alice, "Food");
    await createBudget(food, 1000);
    const dup = await postAs(db.alice, "/api/budgets", {
      category_id: food,
      amount: "1000",
      month: 8,
      year: 2026,
    });
    expect(dup.status).toBe(409);

    await createBudget(null, 5000);
    const dupOverall = await postAs(db.alice, "/api/budgets", {
      category_id: "",
      amount: "5000",
      month: 8,
      year: 2026,
    });
    expect(dupOverall.status).toBe(409);
  });

  it("counts child category spend against the parent budget", async () => {
    const food = await createCategory(db.alice, "Food");
    const dining = await createCategory(db.alice, "Dining", food);
    const account = await createAccount(db.alice, "Savings");

    await createExpense(db.alice, account, dining, 600, "2026-08-10");
    await createBudget(food, 2000);

    const res = await requestAs(db.alice, `/api/budgets?month=${MONTH}&year=${YEAR}`);
    const body = (await res.json()) as { budgets: BudgetWithUtilization[] };
    expect(body.budgets[0].spent).toBe(600);
    expect(body.budgets[0].utilization_pct).toBe(30);
  });

  it("counts split amounts against the split's category, not the parent", async () => {
    const food = await createCategory(db.alice, "Food");
    const dining = await createCategory(db.alice, "Dining", food);
    const account = await createAccount(db.alice, "Savings");
    const txnId = await createExpense(db.alice, account, food, 500, "2026-08-12");

    await pool.query(
      `INSERT INTO transaction_splits (user_id, transaction_id, category_id, amount, notes)
       VALUES ($1, $2, $3, 300, 'split')`,
      [db.alice.userId, txnId, dining]
    );

    await createBudget(food, 2000);
    const res = await requestAs(db.alice, `/api/budgets?month=${MONTH}&year=${YEAR}`);
    const body = (await res.json()) as { budgets: BudgetWithUtilization[] };
    expect(body.budgets[0].spent).toBe(300);
  });

  it("overall budget counts every expense in the month", async () => {
    const food = await createCategory(db.alice, "Food");
    const account = await createAccount(db.alice, "Savings");
    await createExpense(db.alice, account, food, 1000, "2026-08-05");
    await createBudget(null, 5000);

    const res = await requestAs(db.alice, `/api/budgets?month=${MONTH}&year=${YEAR}`);
    const body = (await res.json()) as { budgets: BudgetWithUtilization[] };
    expect(body.budgets[0].spent).toBe(1000);
  });

  it("sorts budgets by utilization descending", async () => {
    const food = await createCategory(db.alice, "Food");
    const transport = await createCategory(db.alice, "Transport");
    const account = await createAccount(db.alice, "Savings");
    await createExpense(db.alice, account, food, 1000, "2026-08-05");
    await createExpense(db.alice, account, transport, 100, "2026-08-06");

    await createBudget(food, 1000);
    await createBudget(transport, 2000);

    const res = await requestAs(db.alice, `/api/budgets?month=${MONTH}&year=${YEAR}`);
    const body = (await res.json()) as { budgets: BudgetWithUtilization[] };
    expect(body.budgets.map((b) => b.category_name)).toEqual(["Food", "Transport"]);
  });

  it("reads a single budget and returns 404 for others", async () => {
    const food = await createCategory(db.alice, "Food");
    await createBudget(food, 1000);
    const list = await requestAs(db.alice, `/api/budgets?month=${MONTH}&year=${YEAR}`);
    const id = ((await list.json()) as { budgets: BudgetWithUtilization[] }).budgets[0].id;

    const res = await requestAs(db.alice, `/api/budgets/${id}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { budget: BudgetWithUtilization }).budget.amount).toBe(1000);

    expect(
      (await requestAs(db.alice, "/api/budgets/00000000-0000-0000-0000-000000000000")).status
    ).toBe(404);
    expect(
      (await requestAs(db.alice, `/api/budgets/${id}/utilization`)).status
    ).toBe(200);
  });

  it("updates a budget and rejects stale versions with 409", async () => {
    const food = await createCategory(db.alice, "Food");
    await createBudget(food, 1000);
    const list = await requestAs(db.alice, `/api/budgets?month=${MONTH}&year=${YEAR}`);
    const b = ((await list.json()) as { budgets: BudgetWithUtilization[] }).budgets[0];

    const ok = await requestAs(db.alice, `/api/budgets/${b.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: "2500", version: b.version }),
    });
    expect(ok.status).toBe(200);

    const stale = await requestAs(db.alice, `/api/budgets/${b.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: "3000", version: b.version }),
    });
    expect(stale.status).toBe(409);

    const single = await requestAs(db.alice, `/api/budgets/${b.id}`);
    expect(((await single.json()) as { budget: BudgetWithUtilization }).budget.amount).toBe(2500);
  });

  it("deleting a budget removes it for all time periods", async () => {
    const food = await createCategory(db.alice, "Food");
    await createBudget(food, 1000, 8, 2026);
    await createBudget(food, 1200, 9, 2026);

    const list = await requestAs(db.alice, `/api/budgets?month=${MONTH}&year=${YEAR}`);
    const id = ((await list.json()) as { budgets: BudgetWithUtilization[] }).budgets[0].id;

    const del = await requestAs(db.alice, `/api/budgets/${id}`, { method: "DELETE" });
    expect(del.status).toBe(200);

    const sep = await requestAs(db.alice, "/api/budgets?month=9&year=2026");
    expect(((await sep.json()) as { budgets: BudgetWithUtilization[] }).budgets).toHaveLength(0);

    expect(
      (await requestAs(db.alice, `/api/budgets/${id}`, { method: "DELETE" })).status
    ).toBe(404);
  });
});

describe("budgets overview, breakdown, export", () => {
  it("reports totals, over-budget count and unbudgeted categories", async () => {
    const food = await createCategory(db.alice, "Food");
    const transport = await createCategory(db.alice, "Transport");
    const account = await createAccount(db.alice, "Savings");
    await createExpense(db.alice, account, food, 1000, "2026-08-05");
    await createExpense(db.alice, account, transport, 400, "2026-08-06");

    await createBudget(food, 2000);

    const res = await requestAs(db.alice, `/api/budgets/overview?month=${MONTH}&year=${YEAR}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { overview: BudgetOverview };
    expect(body.overview.total_budgeted).toBe(2000);
    expect(body.overview.total_spent).toBe(1400);
    expect(body.overview.utilization_pct).toBe(70);
    expect(body.overview.budgeted_count).toBe(1);
    expect(body.overview.over_budget_count).toBe(0);
    expect(body.overview.unbudgeted.map((u: UnbudgetedCategory) => u.name)).toEqual(["Transport"]);
  });

  it("counts an over-budget category", async () => {
    const food = await createCategory(db.alice, "Food");
    const account = await createAccount(db.alice, "Savings");
    await createExpense(db.alice, account, food, 3000, "2026-08-05");
    await createBudget(food, 2000);

    const res = await requestAs(db.alice, `/api/budgets/overview?month=${MONTH}&year=${YEAR}`);
    const body = (await res.json()) as { overview: BudgetOverview };
    expect(body.overview.over_budget_count).toBe(1);
    expect(body.overview.total_spent).toBe(3000);
  });

  it("exposes child breakdown for parent budgets", async () => {
    const food = await createCategory(db.alice, "Food");
    const dining = await createCategory(db.alice, "Dining", food);
    const groceries = await createCategory(db.alice, "Groceries", food);
    const account = await createAccount(db.alice, "Savings");
    await createExpense(db.alice, account, dining, 600, "2026-08-10");
    await createExpense(db.alice, account, groceries, 200, "2026-08-11");

    await createBudget(food, 2000);
    const list = await requestAs(db.alice, `/api/budgets?month=${MONTH}&year=${YEAR}`);
    const id = ((await list.json()) as { budgets: BudgetWithUtilization[] }).budgets[0].id;

    const res = await requestAs(
      db.alice,
      `/api/budgets/${id}/breakdown?month=${MONTH}&year=${YEAR}`
    );
    const body = (await res.json()) as { items: BudgetBreakdownItem[] };
    expect(body.items.map((i) => i.name)).toEqual(["Dining", "Groceries"]);
    expect(body.items[0].spent).toBe(600);
    expect(body.items[0].share_pct).toBe(30);
  });

  it("exports a BOM-prefixed CSV", async () => {
    const food = await createCategory(db.alice, "Food");
    const account = await createAccount(db.alice, "Savings");
    await createExpense(db.alice, account, food, 1000, "2026-08-05");
    await createBudget(food, 2000);

    const res = await requestAs(db.alice, `/api/budgets/export?month=${MONTH}&year=${YEAR}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      await res.arrayBuffer()
    );
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain("Category,Amount,Spent,Remaining,Utilization %");
    expect(text).toContain("Food,2000,1000,1000,50%");
  });
});

describe("budgets isolation", () => {
  it("keeps budgets private between users", async () => {
    const food = await createCategory(db.alice, "Food");
    await createBudget(food, 1000);

    const asBob = await requestAs(db.bob, `/api/budgets?month=${MONTH}&year=${YEAR}`);
    expect(((await asBob.json()) as { budgets: BudgetWithUtilization[] }).budgets).toHaveLength(0);

    const foodBob = await createCategory(db.bob, "Food");
    await postAs(db.bob, "/api/budgets", {
      category_id: foodBob,
      amount: "500",
      month: 8,
      year: 2026,
    });

    const aliceAgain = await requestAs(db.alice, `/api/budgets?month=${MONTH}&year=${YEAR}`);
    expect(((await aliceAgain.json()) as { budgets: BudgetWithUtilization[] }).budgets).toHaveLength(1);
  });
});