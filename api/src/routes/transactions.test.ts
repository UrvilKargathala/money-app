import { describe, expect, it } from "vitest";
import {
  createAccount,
  createCategory,
  createExpense,
  fixtureDb,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

async function seedBoth(): Promise<{ txA: string; txB: string }> {
  const catA = await createCategory(db.alice, "Alice Food");
  const catB = await createCategory(db.bob, "Bob Food");
  const accA = await createAccount(db.alice, "Alice Bank");
  const accB = await createAccount(db.bob, "Bob Bank");
  const txA = await createExpense(db.alice, accA, catA, 100, "2026-08-01");
  const txB = await createExpense(db.bob, accB, catB, 999, "2026-08-02");
  return { txA, txB };
}

describe("transactions cross-user isolation", () => {
  it("GET /api/transactions with no filters returns only the caller's rows", async () => {
    await seedBoth();
    const res = await requestAs(db.alice, "/api/transactions");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      transactions: { id: string; amount: number }[];
      summary: { count: number; expense: number };
    };
    expect(body.transactions.length).toBe(1);
    expect(body.transactions[0].amount).toBe(100);
    expect(body.summary.count).toBe(1);
    expect(body.summary.expense).toBe(100);
  });

  it("GET /api/transactions/summary is scoped to the caller", async () => {
    await seedBoth();
    const res = await requestAs(db.alice, "/api/transactions/summary");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { count: number; income: number; expense: number };
    };
    expect(body.summary.count).toBe(1);
    expect(body.summary.expense).toBe(100);
    expect(body.summary.income).toBe(0);
  });

  it("GET /api/transactions/export only exports the caller's rows", async () => {
    await seedBoth();
    const res = await requestAs(db.alice, "/api/transactions/export");
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("-100.00");
    expect(csv).not.toContain("-999.00");
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(2);
  });

  it("pagination keeps the tenant filter in place", async () => {
    await seedBoth();
    const res = await requestAs(db.alice, "/api/transactions?page=1&pageSize=100");
    const body = (await res.json()) as {
      transactions: { amount: number }[];
      summary: { count: number };
    };
    expect(body.transactions.length).toBe(1);
    expect(body.summary.count).toBe(1);
  });

  it("bob sees his own rows, not alice's", async () => {
    await seedBoth();
    const res = await requestAs(db.bob, "/api/transactions");
    const body = (await res.json()) as {
      transactions: { amount: number }[];
      summary: { count: number; expense: number };
    };
    expect(body.transactions.length).toBe(1);
    expect(body.transactions[0].amount).toBe(999);
    expect(body.summary.count).toBe(1);
    expect(body.summary.expense).toBe(999);
  });
});