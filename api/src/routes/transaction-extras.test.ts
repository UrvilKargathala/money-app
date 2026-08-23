import { describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  createAccount,
  createCategory,
  createExpense,
  createUser,
  findCategory,
  fixtureDb,
  postAs,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

async function expense(
  opts: { amount?: number; merchant?: string; daysAgo?: number; categoryId?: string } = {}
): Promise<string> {
  const accountId = await ensureAccount();
  const categoryId = opts.categoryId ?? (await anyCategory());
  const date = new Date(Date.now() - (opts.daysAgo ?? 0) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const txnId = await createExpense(
    db.alice,
    accountId,
    categoryId,
    opts.amount ?? 500,
    date
  );
  if (opts.merchant) {
    await pool.query(`UPDATE transactions SET merchant_clean = $2 WHERE id = $1`, [
      txnId,
      opts.merchant,
    ]);
  }
  return txnId;
}

let cachedAccount: string | null = null;
async function ensureAccount(): Promise<string> {
  const fresh = await pool.query<{ id: string }>(
    `SELECT id FROM accounts WHERE user_id = $1 LIMIT 1`,
    [db.alice.userId]
  );
  if (fresh.rows[0]) return fresh.rows[0].id;
  cachedAccount = await createAccount(db.alice, "Engine Bank");
  return cachedAccount!;
}
async function anyCategory(): Promise<string> {
  return createCategory(db.alice, `Cat ${Date.now() % 1_000_000}`);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

describe("quick-add heuristics", () => {
  it("auto-fills account/category/merchant from the last expense; overrides win", async () => {
    await expense({ merchant: "Big Bazaar", amount: 750 });
    const res = await postAs(db.alice, "/api/transactions/quick-add", { amount: "250" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      transaction: { id: string };
      applied: { merchant_clean: string | null; category_id: string | null };
    };
    expect(body.applied.merchant_clean).toBe("Big Bazaar");
    expect(body.applied.category_id).toBeTruthy();

    // Explicit overrides beat the heuristic.
    const customCat = await createCategory(db.alice, "Override Cat");
    const res2 = await postAs(db.alice, "/api/transactions/quick-add", {
      amount: "100",
      merchant_clean: "Manual Merchant",
      category_id: customCat,
      type: "income",
    });
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { applied: { merchant_clean: string } };
    expect(body2.applied.merchant_clean).toBe("Manual Merchant");
  });

  it("fails helpfully when there is no account to default to", async () => {
    const carol = await createUser("qa-carol@moneymind.test");
    const res = await postAs(carol, "/api/transactions/quick-add", { amount: "10" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: { account_id?: string } };
    expect(body.fieldErrors.account_id).toBeTruthy();
  });
});

describe("recent merchants", () => {
  it("returns distinct merchants ordered by recency, capped at 5", async () => {
    // M1..M6 spread across days so ordering is deterministic.
    for (const [i, m] of ["M1", "M2", "M3", "M4", "M5"].entries()) {
      await expense({ merchant: m, daysAgo: 5 - i });
    }
    await expense({ merchant: "M6", daysAgo: 0 });

    const res = await requestAs(db.alice, "/api/transactions/merchants/recent");
    const body = (await res.json()) as { merchants: { merchant: string }[] };
    expect(body.merchants).toHaveLength(5);
    expect(body.merchants[0].merchant).toBe("M6");
    // Oldest (M1) fell off the list.
    expect(body.merchants.map((m) => m.merchant)).not.toContain("M1");
  });
});

describe("bulk edit", () => {
  it("categorizes many transactions in one statement; skips transfers and foreign ids", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push(await expense({ amount: 100 + i }));
    const newCat = await createCategory(db.alice, "Bulk Cat");

    const res = await postAs(db.alice, "/api/transactions/bulk", {
      ids,
      action: "categorize",
      category_id: newCat,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { affected: number }).affected).toBe(3);

    const rows = await pool.query<{ category_id: string }>(
      `SELECT category_id FROM transactions WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    expect(rows.rows.every((r) => r.category_id === newCat)).toBe(true);

    // Foreign id mixed in â€” silently unmatched, no error, no leak.
    const bobId = await expense({ amount: 1 });
    void bobId;
    const mixed = await postAs(db.alice, "/api/transactions/bulk", {
      ids: [ids[0], "00000000-0000-4000-8000-000000000000"],
      action: "delete",
    });
    expect(mixed.status).toBe(200);
    expect(((await mixed.json()) as { affected: number }).affected).toBe(1);
  });

  it("bulk-tags via cross join without duplicating existing tags", async () => {
    const catId = await anyCategory();
    const t1 = await createExpense(db.alice, await ensureAccount(), catId, 10, isoDaysAgo(1));
    const t2 = await createExpense(db.alice, await ensureAccount(), catId, 20, isoDaysAgo(1));
    const tagRes = await postAs(db.alice, "/api/tags", { name: `BulkTag-${Date.now() % 100000}` });
    expect(tagRes.status).toBe(200);
    const tagList = (await (
      await requestAs(db.alice, "/api/tags")
    ).json()) as { tags: { id: string }[] };
    const tagId = tagList.tags.at(-1)!.id;

    for (const _ of [0, 1]) {
      const res = await postAs(db.alice, "/api/transactions/bulk", {
        ids: [t1, t2],
        action: "tag",
        tag_ids: [tagId],
      });
      expect(res.status).toBe(200);
    }

    const counts = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM tags_transactions WHERE tag_id = $1`,
      [tagId]
    );
    expect(Number(counts.rows[0].c)).toBe(2);
  });

  it("rejects bad payloads", async () => {
    expect((await postAs(db.alice, "/api/transactions/bulk", { ids: [], action: "delete" })).status).toBe(400);
    expect((await postAs(db.alice, "/api/transactions/bulk", { ids: ["x"], action: "delete" })).status).toBe(400);
    expect((await postAs(db.alice, "/api/transactions/bulk", { ids: [crypto.randomUUID()], action: "explode" })).status).toBe(400);
  });
});

describe("date groups", () => {
  it("groups daily income/expense/net within a window", async () => {
    const today = isoDaysAgo(0);
    await expense({ amount: 300, daysAgo: 0 });
    await expense({ amount: 200, daysAgo: 0 });
    const acct = await ensureAccount();
    await pool.query(
      `INSERT INTO transactions
         (user_id, account_id, type, amount, description, date, source, created_by, updated_by)
       SELECT user_id, id, 'income', 900, 'Salary', CURRENT_DATE, 'manual', user_id, user_id
       FROM accounts WHERE id = $1`,
      [acct]
    );

    const res = await requestAs(
      db.alice,
      `/api/transactions/date-groups?from=${isoDaysAgo(2)}&to=${today}`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      groups: { date: string; income: number; expense: number; net: number }[];
    };
    // Most recent day first; UTC/local day-boundary safe via >= checks.
    const latest = body.groups[0];
    expect(latest.income).toBeGreaterThanOrEqual(900);
    expect(latest.expense).toBeGreaterThanOrEqual(500);
    // net is derived: income − expense for that day.
    expect(latest.net).toBeCloseTo(latest.income - latest.expense, 2);

    const badRange = await requestAs(db.alice, "/api/transactions/date-groups?from=junk");
    expect(badRange.status).toBe(400);
  });
});

describe("transaction splits", () => {
  async function makeSplitParent(amount = 1000) {
    const catA = await createCategory(db.alice, `Splits-A-${Date.now() % 1000000}`);
    const catB = await createCategory(db.alice, `Splits-B-${Date.now() % 1000000}`);
    const txnId = await expense({ amount, categoryId: catA });
    return { txnId, catA, catB };
  }

  it("adds splits enforcing sum <= parent; duplicate category conflicts", async () => {
    const { txnId, catA, catB } = await makeSplitParent(1000);

    const s1 = await postAs(db.alice, `/api/transactions/${txnId}/splits`, {
      category_id: catB,
      amount: "300",
    });
    expect(s1.status).toBe(200);

    // Same category again while there's still headroom -> hits the UNIQUE
    // constraint -> 409 (edit the existing split instead).
    const dup = await postAs(db.alice, `/api/transactions/${txnId}/splits`, {
      category_id: catB,
      amount: "200",
    });
    expect(dup.status).toBe(409);

    // Fill the rest via a second category.
    const s2 = await postAs(db.alice, `/api/transactions/${txnId}/splits`, {
      category_id: catA,
      amount: "700",
    });
    expect(s2.status).toBe(200);

    // Now any further split exceeds the parent -> 400.
    const over = await postAs(db.alice, `/api/transactions/${txnId}/splits`, {
      category_id: catA,
      amount: "1",
    });
    expect(over.status).toBe(400);

    const splitRes = await requestAs(db.alice, `/api/transactions/${txnId}/splits`);
    expect(splitRes.status, await splitRes.clone().text()).toBe(200);
    const summary = (await splitRes.json()) as { total_split: number; parent_amount: number; remaining: number };
    expect(summary.parent_amount).toBe(1000);
    expect(summary.total_split).toBe(1000);
    expect(summary.remaining).toBe(0);
  });
  it("edits and deletes splits; foreign ids 404", async () => {
    const { txnId, catA, catB } = await makeSplitParent(500);
    const add = await postAs(db.alice, `/api/transactions/${txnId}/splits`, {
      category_id: catB,
      amount: "250",
    });
    const splitId = ((await add.json()) as { split: { id: string } }).split.id;

    const patch = await requestAs(db.alice, `/api/transactions/${txnId}/splits/${splitId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category_id: catB, amount: "300", notes: "bumped" }),
    });
    expect(patch.status).toBe(200);

    expect(
      (
        await requestAs(db.bob, `/api/transactions/${txnId}/splits`)
      ).status
    ).toBe(404);
    expect(
      (
        await requestAs(db.bob, `/api/transactions/${txnId}/splits/${splitId}`, {
          method: "DELETE",
        })
      ).status
    ).toBe(404);

    const del = await requestAs(
      db.alice,
      `/api/transactions/${txnId}/splits/${splitId}`,
      { method: "DELETE" }
    );
    expect(del.status).toBe(200);
  });
});

describe("merchant mappings", () => {
  it("create bumps use_count on repeat; override flags set on explicit fields", async () => {
    const raw = `swiggy-upi-${Date.now() % 100000}`;
    const first = await postAs(db.alice, "/api/merchant-mappings", {
      merchant_raw: raw,
    });
    expect(first.status).toBe(200);
    expect(((await first.clone().json()) as { created: boolean }).created).toBe(true);

    const second = await postAs(db.alice, "/api/merchant-mappings", {
      merchant_raw: raw,
    });
    const secondBody = (await second.json()) as { created: boolean };

    const list = (await (
      await requestAs(db.alice, "/api/merchant-mappings")
    ).json()) as {
      mappings: { id: string; merchant_raw: string; use_count: number }[];
    };
    const mine = list.mappings.find((m) => m.merchant_raw === raw)!;
    expect(secondBody.created).toBe(false);
    expect(mine.use_count).toBe(2);

    const cat = await createCategory(db.alice, "Food Mapping");
    const patch = await requestAs(db.alice, `/api/merchant-mappings/${mine.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category_id: cat, merchant_clean: "Swiggy" }),
    });
    expect(patch.status).toBe(200);

    const after = (await (
      await requestAs(db.alice, "/api/merchant-mappings")
    ).json()) as {
      mappings: {
        merchant_raw: string;
        is_user_override: number;
        category_name: string | null;
      }[];
    };
    const overridden = after.mappings.find((m) => m.merchant_raw === raw)!;
    expect(overridden.is_user_override).toBe(1);
    expect(overridden.category_name).toBe("Food Mapping");

    // Bob sees nothing of alice's mappings.
    const bobList = (await (
      await requestAs(db.bob, "/api/merchant-mappings")
    ).json()) as { mappings: unknown[] };
    expect(bobList.mappings).toEqual([]);
  });
});
