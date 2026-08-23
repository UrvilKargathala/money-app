import { describe, expect, it } from "vitest";
import {
  createAccount,
  createCategory,
  createDebt,
  createGoal,
  fixtureDb,
  postAs,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

describe("cross-user isolation across modules", () => {
  it("accounts are scoped per user", async () => {
    await createAccount(db.alice, "Alice Only");
    await createAccount(db.bob, "Bob Only");
    const a = (await (await requestAs(db.alice, "/api/accounts")).json()) as {
      accounts: { name: string }[];
    };
    expect(a.accounts.map((x) => x.name)).toEqual(["Alice Only"]);
    const b = (await (await requestAs(db.bob, "/api/accounts")).json()) as {
      accounts: { name: string }[];
    };
    expect(b.accounts.map((x) => x.name)).toEqual(["Bob Only"]);
  });

  it("budgets are scoped per user", async () => {
    const catA = await createCategory(db.alice, "Cat A");
    const catB = await createCategory(db.bob, "Cat B");
    await postAs(db.alice, "/api/budgets", {
      category_id: catA,
      amount: "1000",
      period: "monthly",
      month: 8,
      year: 2026,
    });
    await postAs(db.bob, "/api/budgets", {
      category_id: catB,
      amount: "2000",
      period: "monthly",
      month: 8,
      year: 2026,
    });
    const a = (await (
      await requestAs(db.alice, "/api/budgets?month=8&year=2026")
    ).json()) as { budgets: { amount: number }[] };
    expect(a.budgets.length).toBe(1);
    expect(a.budgets[0].amount).toBe(1000);
    const b = (await (
      await requestAs(db.bob, "/api/budgets?month=8&year=2026")
    ).json()) as { budgets: { amount: number }[] };
    expect(b.budgets.length).toBe(1);
    expect(b.budgets[0].amount).toBe(2000);
  });

  it("goals are scoped per user", async () => {
    await createGoal(db.alice, "Goal A", 1000, "2027-01-01");
    await createGoal(db.bob, "Goal B", 2000, "2027-01-01");
    const a = (await (await requestAs(db.alice, "/api/goals")).json()) as {
      goals: { name: string }[];
    };
    expect(a.goals.map((g) => g.name)).toEqual(["Goal A"]);
    const b = (await (await requestAs(db.bob, "/api/goals")).json()) as {
      goals: { name: string }[];
    };
    expect(b.goals.map((g) => g.name)).toEqual(["Goal B"]);
  });

  it("debts are scoped per user", async () => {
    await createDebt(db.alice, "Debt A");
    await createDebt(db.bob, "Debt B");
    const a = (await (
      await requestAs(db.alice, "/api/debts?status=active")
    ).json()) as { debts: { name: string }[] };
    expect(a.debts.map((d) => d.name)).toEqual(["Debt A"]);
    const b = (await (
      await requestAs(db.bob, "/api/debts?status=active")
    ).json()) as { debts: { name: string }[] };
    expect(b.debts.map((d) => d.name)).toEqual(["Debt B"]);
  });

  it("bills are scoped per user", async () => {
    await postAs(db.alice, "/api/bills", {
      name: "Bill A",
      due_day: 1,
      frequency: "monthly",
      amount: "100",
    });
    await postAs(db.bob, "/api/bills", {
      name: "Bill B",
      due_day: 2,
      frequency: "monthly",
      amount: "200",
    });
    const a = (await (await requestAs(db.alice, "/api/bills")).json()) as {
      bills: { name: string }[];
    };
    expect(a.bills.map((b) => b.name)).toEqual(["Bill A"]);
    const b = (await (await requestAs(db.bob, "/api/bills")).json()) as {
      bills: { name: string }[];
    };
    expect(b.bills.map((x) => x.name)).toEqual(["Bill B"]);
  });
});

describe("lookup endpoints", () => {
  it("GET /api/account-types is mounted and returns the lookup", async () => {
    const res = await requestAs(db.alice, "/api/account-types");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { types: { type_code: string }[] };
    expect(body.types.length).toBeGreaterThan(0);
    expect(body.types.some((t) => t.type_code === "bank_savings")).toBe(true);
  });

  it("GET /api/users/me/settings returns the caller's settings", async () => {
    const res = await requestAs(db.alice, "/api/users/me/settings");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      settings: { currency: string; theme: string; monthly_income: number | null };
    };
    expect(body.settings.currency).toBe("INR");
    expect(body.settings.theme).toBe("light");
    expect(body.settings.monthly_income).toBeNull();
  });
});

describe("cron secret handling", () => {
  it("rejects query-string secrets and honors the x-cron-secret header only", async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-secret";
    try {
      const viaQuery = await requestAs(db.alice, "/api/jobs/run?secret=test-secret");
      expect(viaQuery.status).toBe(400);
      const missing = await requestAs(db.alice, "/api/jobs/run");
      expect(missing.status).toBe(401);
      const wrong = await requestAs(db.alice, "/api/jobs/run", {
        headers: { "x-cron-secret": "wrong" },
      });
      expect(wrong.status).toBe(401);
      const ok = await requestAs(db.alice, "/api/jobs/run", {
        headers: { "x-cron-secret": "test-secret" },
      });
      expect(ok.status).toBe(200);
    } finally {
      process.env.CRON_SECRET = prev;
    }
  });
});