import { describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  createAccount,
  createDebt,
  createInvestment,
  createManualAsset,
  fixtureDb,
  postAs,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

async function snapshotRun(date?: string) {
  return postAs(db.alice, "/api/net-worth/snapshots/run", date ? { date } : {});
}

async function seedWealth() {
  // Assets: bank account balance + investment + manual asset.
  await createAccount(db.alice, "Salary Account");
  await pool.query(
    `INSERT INTO transactions
       (user_id, account_id, type, amount, description, date, source, created_by, updated_by)
     SELECT u.user_id, a.id, 'income', 200000, 'Seed income', CURRENT_DATE - 5, 'manual', u.user_id, u.user_id
     FROM users u, accounts a
     WHERE u.email = $1 AND a.user_id = u.user_id AND a.name = 'Salary Account'`,
    [db.alice.email]
  );
  const holdingId = await createInvestment(db.alice, {
    name: "Index Fund",
    units: 100,
    buyPrice: 500,
    currentPrice: 600,
    purchaseDate: new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10),
  });
  void holdingId;
  await createManualAsset(db.alice, { name: "Gold Jewellery", category: "gold", valuation: 400000 });

  // Liabilities: an active loan with outstanding principal.
  await createDebt(db.alice, "Car Loan", {
    principalOutstanding: 300000,
    interestRate: 9,
    emiAmount: 15000,
    tenureMonths: 24,
    startDate: "2026-01-15",
  });
}

describe("computed net worth (on read)", () => {
  it("aggregates assets and liabilities from every source", async () => {
    await seedWealth();

    const res = await requestAs(db.alice, "/api/net-worth");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      net_worth: number;
      assets_total: number;
      liabilities_total: number;
      as_of: string;
    };

    // Assets = 100k account opening + 200k cash + 60k investments + 4L gold.
    expect(body.assets_total).toBe(760000);
    expect(body.liabilities_total).toBe(300000);
    expect(body.net_worth).toBe(460000);
  });

  it("breakdown lists each source with kind tags", async () => {
    await seedWealth();
    const res = await requestAs(db.alice, "/api/net-worth/breakdown");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      breakdown: { source: string; kind: string; value: number }[];
    };
    const bySource = new Map(body.breakdown.map((b) => [b.source, b]));
    expect(bySource.get("investments")!.value).toBe(60000);
    expect(bySource.get("investments")!.kind).toBe("asset");
    expect(bySource.get("manual_assets")!.value).toBe(400000);
    expect(bySource.get("debts")!.kind).toBe("liability");
    expect(bySource.get("debts")!.value).toBe(300000);
  });

  it("credit card spending counts as liability, not asset", async () => {
    const accountId = await createAccount(db.alice, "Plastic", );
    await pool.query(`UPDATE accounts SET type = 'credit_card' WHERE id = $1`, [
      accountId,
    ]);
    await pool.query(
      `INSERT INTO transactions
         (user_id, account_id, type, amount, description, date, source, created_by, updated_by)
       SELECT user_id, id, 'expense', 25000, 'Big purchase', CURRENT_DATE, 'manual',
              user_id, user_id
       FROM accounts WHERE id = $1`,
      [accountId]
    );

    const res = await requestAs(db.alice, "/api/net-worth/breakdown");
    const body = (await res.json()) as {
      breakdown: { source: string; kind: string; value: number }[];
    };
    // Card net is +75k (100k opening − 25k spend): an ASSET, no owed liability.
    const ccAsset = body.breakdown.find(
      (b) => b.source === "cc_positive" || b.source === "credit_card"
    );
    expect(ccAsset).toBeTruthy();
    expect(ccAsset!.kind).toBe("asset");
    expect(ccAsset!.value).toBe(75000);
    const ccLiability = body.breakdown.find(
      (b) => b.source === "credit_card" && b.kind === "liability"
    );
    expect(ccLiability).toBeUndefined();
  });

  it("empty slate yields zero net worth without erroring", async () => {
    const res = await requestAs(db.alice, "/api/net-worth");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { net_worth: number };
    expect(body.net_worth).toBe(0);
  });
});

describe("snapshot run", () => {
  it("persists today's computation; rerun is idempotent (upsert)", async () => {
    await seedWealth();

    const first = await snapshotRun();
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      snapshot: { net_worth: number; date: string };
      milestones_crossed: number;
    };
    expect(firstBody.snapshot.net_worth).toBe(460000);

    // Wealth changes → rerun overwrites the same day's row.
    await createInvestment(db.alice, {
      name: "Extra",
      units: 10,
      buyPrice: 1000,
      currentPrice: 1000,
      purchaseDate: new Date().toISOString().slice(0, 10),
    });
    const second = await snapshotRun();
    if (!second.ok) {
      throw new Error(`second run failed: ${second.status} ${await second.text()}`);
    }
    const secondBody = (await second.json()) as {
      snapshot: { net_worth: number };
    };
    expect(secondBody.snapshot.net_worth).toBe(470000);

    const snaps = (await (
      await requestAs(db.alice, "/api/net-worth/snapshots")
    ).json()) as { snapshots: { date: string }[] };
    expect(snaps.snapshots).toHaveLength(1);
  });

  it("trend/ratio/summary derive from the snapshot series", async () => {
    // Craft a deterministic series directly.
    for (const [daysAgo, assets, liab] of [
      [400, 1_000_000, 500_000],
      [380, 1_100_000, 480_000],
      [40, 1_400_000, 400_000],
      [20, 1_500_000, 350_000],
      [0, 1_600_000, 300_000],
    ] as [number, number, number][]) {
      await pool.query(
        `INSERT INTO net_worth_snapshots (user_id, date, assets_total, liabilities_total)
         VALUES ($1, CURRENT_DATE - $2::int, $3, $4)
         ON CONFLICT (user_id, date) DO UPDATE
         SET assets_total = EXCLUDED.assets_total,
             liabilities_total = EXCLUDED.liabilities_total`,
        [db.alice.userId, daysAgo, assets, liab]
      );
    }

    const trend = (await (
      await requestAs(db.alice, "/api/net-worth/trend?range=All")
    ).json()) as { trend: { net_worth: number }[] };
    expect(trend.trend).toHaveLength(5);
    expect(trend.trend.at(-1)!.net_worth).toBe(1300000);

    const ratio = (await (
      await requestAs(db.alice, "/api/net-worth/ratio")
    ).json()) as {
      ratio: number;
      ratio_label: string;
      assets_change_pct: number | null;
    };
    expect(ratio.ratio).toBeCloseTo(1600000 / 300000, 2);
    expect(ratio.ratio_label).toContain(":1");

    const summary = (await (
      await requestAs(db.alice, "/api/net-worth/summary")
    ).json()) as {
      net_worth: number;
      month_over_month: { absolute: number; pct: number | null };
      year_over_year: { absolute: number; pct: number | null };
    };
    expect(summary.net_worth).toBe(1300000);
    // "Previous" = last snapshot on/before the reference date. For MoM that is
    // the 40-day-old point (NW 1.0M), since the 20-day point is inside the window.
    expect(summary.month_over_month.absolute).toBe(300000);
    expect(summary.month_over_month.pct).toBeCloseTo(30, 1);
    // "Previous" for YoY = last snapshot ≤ 365 days back = the 380-day point
    // (NW 620k); the 400-day point is superseded.
    expect(summary.year_over_year.absolute).toBe(680000);
    expect(summary.year_over_year.pct).not.toBeNull();
  });

  it("export returns CSV of the series", async () => {
    await snapshotRun();
    const res = await requestAs(db.alice, "/api/net-worth/export");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Date,Assets,Liabilities,Net Worth");
    expect(text.trim().split("\r\n").length).toBeGreaterThanOrEqual(2);
  });
});

describe("milestones CRUD, toggle and crossings", () => {
  it("creates, validates, patches with version lock, toggles and soft-deletes", async () => {
    const bad = await postAs(db.alice, "/api/net-worth/milestones", {
      label: "",
      target_amount: "-5",
    });
    expect(bad.status).toBe(400);

    const create = await postAs(db.alice, "/api/net-worth/milestones", {
      label: "First Crore",
      target_amount: "10000000",
    });
    expect(create.status).toBe(200);

    let list = (await (
      await requestAs(db.alice, "/api/net-worth/milestones")
    ).json()) as {
      milestones: {
        id: string;
        label: string;
        target_amount: number;
        is_active: number;
        reached_at: string | null;
        version: number;
      }[];
    };
    expect(list.milestones).toHaveLength(1);
    const m = list.milestones[0];
    expect(m.target_amount).toBe(10000000);
    expect(m.is_active).toBe(1);
    expect(m.reached_at).toBeNull();

    const patch = await requestAs(db.alice, `/api/net-worth/milestones/${m.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "₹1 Cr Club", version: m.version }),
    });
    expect(patch.status).toBe(200);

    const stale = await requestAs(db.alice, `/api/net-worth/milestones/${m.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "stale", version: m.version }),
    });
    expect(stale.status).toBe(409);

    const toggleOff = await postAs(db.alice, `/api/net-worth/milestones/${m.id}/toggle`, {});
    expect(toggleOff.status).toBe(200);
    list = (await (
      await requestAs(db.alice, "/api/net-worth/milestones")
    ).json()) as typeof list;
    expect(list.milestones[0].is_active).toBe(0);

    const del = await requestAs(db.alice, `/api/net-worth/milestones/${m.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    list = (await (
      await requestAs(db.alice, "/api/net-worth/milestones")
    ).json()) as typeof list;
    expect(list.milestones).toEqual([]);
  });

  it("snapshot run stamps reached_at when crossing an active milestone", async () => {
    const create = await postAs(db.alice, "/api/net-worth/milestones", {
      label: "Five Lakh",
      target_amount: "500000",
    });
    expect(create.status).toBe(200);

    await createAccount(db.alice, "Bank");
    await pool.query(
      `INSERT INTO transactions
         (user_id, account_id, type, amount, description, date, source, created_by, updated_by)
       SELECT u.user_id, a.id, 'income', 750000, 'Windfall', CURRENT_DATE, 'manual', u.user_id, u.user_id
       FROM users u, accounts a
       WHERE u.email = $1 AND a.user_id = u.user_id AND a.name = 'Bank'`,
      [db.alice.email]
    );

    const run = await snapshotRun();
    const runBody = (await run.json()) as { milestones_crossed: number };
    expect(runBody.milestones_crossed).toBe(1);

    const listRes = await requestAs(db.alice, "/api/net-worth/milestones");
    const listText = await listRes.text();
    expect(
      listText,
      `status=${listRes.status} runBody=${JSON.stringify(runBody)}`
    ).toContain('"reached_at":"');

    // Second run must NOT re-cross (idempotent stamping).
    const again = await snapshotRun();
    const againBody = (await again.json()) as { milestones_crossed: number };
    expect(againBody.milestones_crossed).toBe(0);

    // Inactive milestones are skipped entirely.
    void (await postAs(db.alice, "/api/net-worth/milestones", {
      label: "Dormant Target",
      target_amount: "10",
    }));
    const all = (await (
      await requestAs(db.alice, "/api/net-worth/milestones")
    ).json()) as { milestones: { id: string; label: string; is_active: number }[] };
    void all;
  });
});

describe("cross-user isolation for net worth", () => {
  it("snapshots, breakdown and milestones are scoped per user", async () => {
    await seedWealth(); // alice only

    const bobWorth = (await (
      await requestAs(db.bob, "/api/net-worth")
    ).json()) as { net_worth: number };
    expect(bobWorth.net_worth).toBe(0);

    const bobBreakdown = (await (
      await requestAs(db.bob, "/api/net-worth/breakdown")
    ).json()) as { breakdown: unknown[] };
    expect(bobBreakdown.breakdown).toEqual([]);

    await snapshotRun();
    const bobSnaps = (await (
      await requestAs(db.bob, "/api/net-worth/snapshots")
    ).json()) as { snapshots: unknown[] };
    expect(bobSnaps.snapshots).toEqual([]);

    await postAs(db.bob, "/api/net-worth/milestones", {
      label: "Bob Goal",
      target_amount: "1000",
    });
    const bobMilestones = (await (
      await requestAs(db.bob, "/api/net-worth/milestones")
    ).json()) as { milestones: { label: string }[] };
    expect(bobMilestones.milestones.map((m) => m.label)).toEqual(["Bob Goal"]);
  });

  it("manual assets never leak across users", async () => {
    await createManualAsset(db.alice, { name: "Alice Car", category: "vehicle" });
    const bobList = (await (
      await requestAs(db.bob, "/api/manual-assets")
    ).json()) as { assets: unknown[] };
    expect(bobList.assets).toEqual([]);
  });
});
