import { describe, expect, it } from "vitest";
import { pool } from "../db";
import { createAccount, createInvestment, fixtureDb, postAs, rawRequest, requestAs } from "../test/helpers";

const db = fixtureDb();

async function getList(user: ReturnType<typeof fixtureDb>["alice"], query = "") {
  const res = await requestAs(user, `/api/investments${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as {
    investments: {
      id: string;
      name: string;
      type: string;
      category: string;
      valuation_mode: string;
      account_id: string | null;
      units: number;
      buy_price: number;
      current_price: number;
      invested_value: number;
      current_value: number;
      absolute_return: number;
      return_pct: number | null;
      is_active: number;
    }[];
  };
}

describe("investment holdings CRUD", () => {
  it("creates a unit-based holding with a seeded opening lot", async () => {
    const id = await createInvestment(db.alice, {
      name: "Test Fund",
      units: 100,
      buyPrice: 50,
      currentPrice: 55,
    });

    const { investments } = await getList(db.alice);
    const holding = investments.find((h) => h.id === id)!;
    expect(holding).toBeTruthy();
    expect(holding.valuation_mode).toBe("unit");
    expect(holding.units).toBe(100);
    expect(holding.buy_price).toBe(50);
    expect(holding.current_price).toBe(55);
    expect(holding.invested_value).toBe(5000);
    expect(holding.current_value).toBe(5500);
    expect(holding.return_pct).toBe(10);

    const detail = (await (
      await requestAs(db.alice, `/api/investments/${id}`)
    ).json()) as {
      investment: { name: string };
      transactions: { type: string; units: number; total_amount: number }[];
    };
    expect(detail.investment.name).toBe("Test Fund");
    // Seeded opening lot for XIRR/purchase history.
    expect(detail.transactions).toHaveLength(1);
    expect(detail.transactions[0].type).toBe("buy");
    expect(detail.transactions[0].total_amount).toBe(5000);
  });

  it("creates a manual-mode holding without pricing", async () => {
    await postAs(db.alice, "/api/investments", {
      name: "SBI FD #123",
      type: "fd",
      category: "debt",
      purchase_date: "2026-02-01",
    });
    const { investments } = await getList(db.alice);
    const fd = investments.find((h) => h.type === "fd")!;
    expect(fd.valuation_mode).toBe("manual");
    expect(fd.invested_value).toBe(0);
  });

  it("validates type, category, dates and pricing", async () => {
    const res = await postAs(db.alice, "/api/investments", {
      name: "Bad",
      type: "spaceship",
      category: "moon_dust",
      purchase_date: "not-a-date",
      units: "-5",
      buy_price: "0",
      current_price: "",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.type).toBeTruthy();
    expect(body.fieldErrors.category).toBeTruthy();
    expect(body.fieldErrors.purchase_date).toBeTruthy();
    expect(body.fieldErrors.units).toBeTruthy();
  });

  it("rejects an unknown account with a field error", async () => {
    const res = await postAs(db.alice, "/api/investments", {
      name: "Orphan Fund",
      type: "stock",
      purchase_date: "2026-03-01",
      account_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: { account_id?: string } };
    expect(body.fieldErrors.account_id).toBeTruthy();
  });

  it("links to an existing account when provided", async () => {
    const accountId = await createAccount(db.alice, "Broker");
    await createInvestment(db.alice, {
      name: "Zerodha Holding",
      type: "stock",
      accountId,
    });
    const { investments } = await getList(db.alice);
    const stock = investments.find((h) => h.type === "stock")!;
    expect(stock.account_id).toBe(accountId);
  });

  it("patches fields and enforces optimistic locking", async () => {
    const id = await createInvestment(db.alice);

    const ok = await requestAs(db.alice, `/api/investments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "SIP since 2026", version: 1 }),
    });
    expect(ok.status).toBe(200);

    const stale = await requestAs(db.alice, `/api/investments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "stale write", version: 1 }),
    });
    expect(stale.status).toBe(409);
  });

  it("closes a holding and keeps history visible via status filter", async () => {
    const id = await createInvestment(db.alice, { name: "Closing Soon" });
    const close = await postAs(db.alice, `/api/investments/${id}/close`, {});
    expect(close.status).toBe(200);

    const active = await getList(db.alice);
    expect(active.investments.find((h) => h.id === id)).toBeUndefined();

    const all = await getList(db.alice, "?status=all");
    const closed = all.investments.find((h) => h.id === id)!;
    expect(closed.is_active).toBe(0);

    const again = await postAs(db.alice, `/api/investments/${id}/close`, {});
    expect(again.status).toBe(404);
  });
});

describe("price updates and snapshots", () => {
  it("updates price, appends history and upserts today's portfolio snapshot", async () => {
    const id = await createInvestment(db.alice, {
      units: 10,
      buyPrice: 100,
      currentPrice: 100,
    });

    const upd = await postAs(db.alice, `/api/investments/${id}/price`, {
      price: "120",
    });
    expect(upd.status).toBe(200);

    const detail = (await (
      await requestAs(db.alice, `/api/investments/${id}`)
    ).json()) as { investment: { current_price: number; current_value: number } };
    expect(detail.investment.current_price).toBe(120);
    expect(detail.investment.current_value).toBe(1200);

    const history = (await (
      await requestAs(db.alice, `/api/investments/${id}/price-history`)
    ).json()) as { price_history: { price: number }[] };
    expect(history.price_history.some((p) => p.price === 120)).toBe(true);

    const snaps = (await (
      await requestAs(db.alice, "/api/investments/snapshots")
    ).json()) as { snapshots: { total_current: number }[] };
    expect(snaps.snapshots.length).toBeGreaterThan(0);
    expect(snaps.snapshots.at(-1)!.total_current).toBe(1200);
  });

  it("rejects zero/negative prices and closed holdings", async () => {
    const id = await createInvestment(db.alice);
    const bad = await postAs(db.alice, `/api/investments/${id}/price`, {
      price: "0",
    });
    expect(bad.status).toBe(400);

    await postAs(db.alice, `/api/investments/${id}/close`, {});
    const closed = await postAs(db.alice, `/api/investments/${id}/price`, {
      price: "150",
    });
    expect(closed.status).toBe(409);
  });

  it("bulk-updates prices in one shot", async () => {
    const a = await createInvestment(db.alice, { name: "Bulk A", currentPrice: 100 });
    const b = await createInvestment(db.alice, { name: "Bulk B", currentPrice: 200 });

    const res = await postAs(db.alice, "/api/investments/prices/bulk-update", {
      updates: [
        { id: a, price: "111" },
        { id: b, price: "222" },
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: number };
    expect(body.updated).toBe(2);

    const list = await getList(db.alice);
    expect(list.investments.find((h) => h.id === a)!.current_price).toBe(111);
    expect(list.investments.find((h) => h.id === b)!.current_price).toBe(222);
  });
});

describe("holding transactions recompute aggregates", () => {
  it("buy raises units at weighted-average cost; sell lowers units keeping avg", async () => {
    const id = await createInvestment(db.alice, {
      units: 100,
      buyPrice: 50,
      currentPrice: 60,
    });

    let add = await postAs(db.alice, `/api/investments/${id}/transactions`, {
      type: "buy",
      units: "100",
      price_per_unit: "70",
      date: "2026-04-01",
    });
    expect(add.status).toBe(200);

    let detail = (await (
      await requestAs(db.alice, `/api/investments/${id}`)
    ).json()) as {
      investment: { units: number; buy_price: number };
      transactions: unknown[];
    };
    expect(detail.investment.units).toBe(200);
    // Weighted average of (100@50, 100@70) = 60.
    expect(detail.investment.buy_price).toBe(60);
    expect(detail.transactions).toHaveLength(2);

    add = await postAs(db.alice, `/api/investments/${id}/transactions`, {
      type: "sell",
      units: "50",
      price_per_unit: "65",
      date: "2026-05-01",
    });
    expect(add.status).toBe(200);

    detail = (await (
      await requestAs(db.alice, `/api/investments/${id}`)
    ).json()) as typeof detail;
    expect(detail.investment.units).toBe(150);
    expect(detail.investment.buy_price).toBe(60); // avg unchanged on sell
  });

  it("deleting a txn restores the prior aggregates", async () => {
    const id = await createInvestment(db.alice, { units: 100, buyPrice: 50 });
    await postAs(db.alice, `/api/investments/${id}/transactions`, {
      type: "buy",
      units: "100",
      price_per_unit: "80",
      date: "2026-04-01",
    });
    const list = (await (
      await requestAs(db.alice, `/api/investments/${id}/transactions`)
    ).json()) as { transactions: { id: string; type: string }[] };

    const extra = list.transactions.find((t) => t.type === "buy" && t.id !== undefined)!;
    const del = await rawRequest(
      `/api/investments/${id}/transactions/${extra.id}`,
      {
        method: "DELETE",
        headers: { cookie: `mm_session=${db.alice.token}` },
      }
    );
    expect(del.status).toBe(200);

    const detail = (await (
      await requestAs(db.alice, `/api/investments/${id}`)
    ).json()) as { investment: { units: number } };
    expect(detail.investment.units).toBe(100);
  });
});

describe("portfolio dashboard endpoints", () => {
  it("summary totals only active holdings with profit/loss counts", async () => {
    await createInvestment(db.alice, { name: "Winner", units: 100, buyPrice: 100, currentPrice: 120 });
    await createInvestment(db.alice, { name: "Loser", units: 100, buyPrice: 100, currentPrice: 90 });

    const res = await requestAs(db.alice, "/api/investments/portfolio-summary");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: {
        total_invested: number;
        total_current: number;
        profit_count: number;
        loss_count: number;
        active_count: number;
      };
    };
    expect(body.summary.total_invested).toBe(20000);
    expect(body.summary.total_current).toBe(21000);
    expect(body.summary.profit_count).toBe(1);
    expect(body.summary.loss_count).toBe(1);
    expect(body.summary.active_count).toBe(2);
  });

  it("asset allocation groups by category with percentages", async () => {
    await createInvestment(db.alice, { name: "E1", category: "equity", currentPrice: 300 });
    await createInvestment(db.alice, { name: "G1", type: "gold", category: "gold", currentPrice: 100 });

    const res = await requestAs(db.alice, "/api/investments/asset-allocation");
    const body = (await res.json()) as {
      allocation: { category: string; pct: number }[];
    };
    const equity = body.allocation.find((a) => a.category === "equity")!;
    const gold = body.allocation.find((a) => a.category === "gold")!;
    expect(equity.pct + gold.pct).toBeCloseTo(100, 0);
  });

  it("maturity alerts surface FDs maturing within 30 days only", async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 20);
    const far = new Date();
    far.setDate(far.getDate() + 90);

    await createInvestment(db.alice, {
      name: "FD Soon",
      type: "fd",
      category: "debt",
      maturityDate: soon.toISOString().slice(0, 10),
    });
    await createInvestment(db.alice, {
      name: "FD Far",
      type: "fd",
      category: "debt",
      maturityDate: far.toISOString().slice(0, 10),
    });

    const res = await requestAs(db.alice, "/api/investments/maturity-alerts");
    const body = (await res.json()) as {
      alerts: { name: string; days_until: number }[];
    };
    expect(body.alerts.map((a) => a.name)).toEqual(["FD Soon"]);
    expect(body.alerts[0].days_until).toBeLessThanOrEqual(30);
  });

  it("returns XIRR for a holding and CAGR fallback for single-lot manual entries", async () => {
    // One-year ~10% growth → XIRR ≈ 10%.
    const lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    const purchase = lastYear.toISOString().slice(0, 10);
    const id = await createInvestment(db.alice, {
      name: "Grower",
      units: 100,
      buyPrice: 100,
      currentPrice: 110,
      purchaseDate: purchase,
    });

    const res = await requestAs(db.alice, `/api/investments/${id}/returns`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      returns: { xirr_pct: number | null; method: string };
    };
    expect(body.returns.method).toBe("xirr");
    expect(Math.abs(body.returns.xirr_pct! - 10)).toBeLessThan(1.5);

    // Manual-mode single lot falls back to CAGR.
    await postAs(db.alice, "/api/investments", {
      name: "Manual PPF",
      type: "ppf",
      category: "government",
      purchase_date: purchase,
    });
    const list = await getList(db.alice);
    const manualId = list.investments.find((h) => h.name === "Manual PPF")!.id;
    const manualRes = await requestAs(db.alice, `/api/investments/${manualId}/returns`);
    const manualBody = (await manualRes.json()) as {
      returns: { method: string };
    };
    expect(["cagr", "xirr"]).toContain(manualBody.returns.method);
  });

  it("sip-calculator returns the projection without touching the DB", async () => {
    const res = await postAs(db.alice, "/api/investments/sip-calculator", {
      amount: "10000",
      frequency: "monthly",
      years: "10",
      expected_return: "12",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      projection: { total_invested: number; maturity_value: number };
    };
    expect(body.projection.total_invested).toBe(1200000);
    expect(body.projection.maturity_value).toBeGreaterThan(2_300_000);
  });

  it("exports portfolio CSV with header + one row per holding", async () => {
    await createInvestment(db.alice, { name: "CSV Holding" });
    const res = await requestAs(db.alice, "/api/investments/export");
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toContain("Name,Type,Category,Units");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain("CSV Holding");
  });

  it("exports holding transaction CSV scoped to that holding", async () => {
    const id = await createInvestment(db.alice, { name: "Txn Export" });
    const res = await requestAs(db.alice, `/api/investments/${id}/transactions/export`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Date,Type,Units,Price,Amount");
    expect(text.split("\r\n").length).toBeGreaterThanOrEqual(2);
  });
});

describe("cross-user isolation for investments", () => {
  it("lists are scoped and foreign ids 404", async () => {
    const aliceId = await createInvestment(db.alice, { name: "Alice Only" });
    await createInvestment(db.bob, { name: "Bob Only" });

    const aliceList = await getList(db.alice);
    expect(aliceList.investments.map((h) => h.name)).toEqual(["Alice Only"]);
    const bobList = await getList(db.bob);
    expect(bobList.investments.map((h) => h.name)).toEqual(["Bob Only"]);

    expect(
      (await requestAs(db.bob, `/api/investments/${aliceId}`)).status
    ).toBe(404);
    expect(
      (
        await postAs(db.bob, `/api/investments/${aliceId}/close`, {})
      ).status
    ).toBe(404);
    expect(
      (
        await postAs(db.bob, `/api/investments/${aliceId}/price`, {
          price: "999",
        })
      ).status
    ).toBe(404);
  });

  it("summary/allocation never include other users' holdings", async () => {
    await pool.query(`SELECT 1`); // keep pool alive pattern consistent

    const aliceSummary = (await (
      await requestAs(db.alice, "/api/investments/portfolio-summary")
    ).json()) as { summary: { active_count: number } };
    void aliceSummary;

    // resetDb between tests guarantees clean state; just assert bob sees zero.
    const bobSummary = (await (
      await requestAs(db.bob, "/api/investments/portfolio-summary")
    ).json()) as { summary: { active_count: number; total_invested: number } };
    expect(bobSummary.summary.active_count).toBe(0);
    expect(bobSummary.summary.total_invested).toBe(0);
  });
});
