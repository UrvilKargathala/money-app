import { describe, expect, it } from "vitest";
import { pool } from "../db";
import type { Goal } from "../queries/goals";
import {
  addContribution,
  createAccount,
  createCategory,
  createExpense,
  createGoal,
  postAs,
  rawRequest,
  requestAs,
  fixtureDb,
} from "../test/helpers";

const db = fixtureDb();

/** Whole calendar months from today until the target date (mirrors the query layer). */
function monthsTo(targetDate: string): number {
  const now = new Date();
  const target = new Date(`${targetDate}T00:00:00`);
  const months =
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth());
  return Math.max(1, months);
}

/** Day-of-month date that is always inside the last 3 calendar months. */
function dateOnDay(day: number, monthsAgo: number): string {
  const d = new Date();
  d.setDate(day);
  d.setMonth(d.getMonth() - monthsAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function projectedDate(avgMonthly: number, remaining: number): string | null {
  if (avgMonthly <= 0) return null;
  const d = new Date();
  d.setMonth(d.getMonth() + Math.ceil(remaining / avgMonthly));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const TARGET = "2027-06-01";
const AMOUNT = 120000;
const MONTHLY = AMOUNT / monthsTo(TARGET);

describe("goals auth + validation", () => {
  it("rejects unauthenticated requests", async () => {
    expect((await rawRequest("/api/goals")).status).toBe(401);
    expect((await rawRequest("/api/goals", { method: "POST" })).status).toBe(401);
    expect((await rawRequest("/api/goals/dashboard")).status).toBe(401);
    expect((await rawRequest("/api/goals/templates")).status).toBe(401);
    expect((await rawRequest("/api/goals/export")).status).toBe(401);
    expect((await rawRequest("/api/goals/distribute", { method: "POST" })).status).toBe(401);
  });

  it("validates name, target amount, target date and priority", async () => {
    const res = await postAs(db.alice, "/api/goals", {
      name: "",
      target_amount: "0",
      target_date: "2020-01-01",
      priority: "urgent",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.name).toBeTruthy();
    expect(body.fieldErrors.target_amount).toBeTruthy();
    expect(body.fieldErrors.target_date).toBeTruthy();
    expect(body.fieldErrors.priority).toBeTruthy();

    const badDate = await postAs(db.alice, "/api/goals", {
      name: "Trip",
      target_amount: "1000",
      target_date: "not-a-date",
    });
    expect(badDate.status).toBe(400);
  });

  it("rejects a linked account that doesn't exist", async () => {
    const res = await postAs(db.alice, "/api/goals", {
      name: "Trip",
      target_amount: "10000",
      target_date: TARGET,
      account_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.account_id).toBeTruthy();
  });
});

describe("goals CRUD and derived progress", () => {
  it("creates a goal and reports derived progress on detail", async () => {
    const goalId = await createGoal(db.alice, "Emergency Fund", AMOUNT, TARGET);

    const res = await requestAs(db.alice, `/api/goals/${goalId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { goal: Goal };
    expect(body.goal.name).toBe("Emergency Fund");
    expect(body.goal.target_amount).toBe(AMOUNT);
    expect(body.goal.current_amount).toBe(0);
    expect(body.goal.progress_pct).toBe(0);
    expect(body.goal.months_remaining).toBe(monthsTo(TARGET));
    expect(body.goal.required_monthly).toBe(Math.round(MONTHLY * 100) / 100);
    expect(body.goal.status).toBe("active");
    expect(body.goal.priority).toBe("medium");
    expect(body.goal.feasibility).toBe("critical");
  });

  it("derives current amount, percentage, projection and feasibility", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);
    for (let i = 0; i < 3; i++) {
      await addContribution(db.alice, goalId, 10000, dateOnDay(5, i));
    }

    const res = await requestAs(db.alice, `/api/goals/${goalId}`);
    const body = (await res.json()) as { goal: Goal };
    expect(body.goal.current_amount).toBe(30000);
    expect(body.goal.progress_pct).toBe(25);
    expect(body.goal.avg_monthly).toBe(10000);
    expect(body.goal.projected_date).toBe(projectedDate(10000, 90000));
    expect(body.goal.feasibility).toBe(
      projectedDate(10000, 90000) !== null && projectedDate(10000, 90000)! <= TARGET
        ? "on_track"
        : "behind"
    );
  });

  it("sorts goals by target date, then priority", async () => {
    await createGoal(db.alice, "Later", AMOUNT, "2027-12-01");
    await createGoal(db.alice, "Urgent", AMOUNT, TARGET);

    const res = await requestAs(db.alice, "/api/goals");
    const body = (await res.json()) as { goals: Goal[] };
    expect(body.goals.map((g) => g.name)).toEqual(["Urgent", "Later"]);

    const same = await postAs(db.alice, "/api/goals", {
      name: "Low priority",
      target_amount: "1000",
      target_date: TARGET,
      priority: "low",
    });
    expect(same.status).toBe(200);
    const again = await requestAs(db.alice, "/api/goals");
    const list = ((await again.json()) as { goals: Goal[] }).goals.filter(
      (g) => g.target_date === TARGET
    );
    expect(list.map((g) => g.priority)).toEqual(["medium", "low"]);
  });

  it("filters by status and priority and rejects invalid filters", async () => {
    await createGoal(db.alice, "One", AMOUNT, TARGET);
    const paused = await postAs(db.alice, "/api/goals", {
      name: "Paused one",
      target_amount: "5000",
      target_date: TARGET,
      priority: "high",
    });
    const pausedId = ((await paused.json()) as { goal: { id: string } }).goal.id;
    await requestAs(db.alice, `/api/goals/${pausedId}/pause`, { method: "POST" });

    const active = await requestAs(db.alice, "/api/goals?status=active");
    expect(
      ((await active.json()) as { goals: Goal[] }).goals.map((g) => g.name)
    ).toEqual(["One"]);

    const pausedList = await requestAs(db.alice, "/api/goals?status=paused");
    expect(
      ((await pausedList.json()) as { goals: Goal[] }).goals.map((g) => g.name)
    ).toEqual(["Paused one"]);

    const high = await requestAs(db.alice, "/api/goals?priority=high");
    expect(
      ((await high.json()) as { goals: Goal[] }).goals.map((g) => g.name)
    ).toEqual(["Paused one"]);

    expect((await requestAs(db.alice, "/api/goals?status=bogus")).status).toBe(400);
    expect((await requestAs(db.alice, "/api/goals?priority=bogus")).status).toBe(400);
  });

  it("updates a goal and rejects stale versions with 409", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);
    const detail = await requestAs(db.alice, `/api/goals/${goalId}`);
    const goal = ((await detail.json()) as { goal: Goal }).goal;

    const ok = await requestAs(db.alice, `/api/goals/${goalId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Europe Trip", target_amount: "150000", version: goal.version }),
    });
    expect(ok.status).toBe(200);

    const stale = await requestAs(db.alice, `/api/goals/${goalId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Stale", version: goal.version }),
    });
    expect(stale.status).toBe(409);

    const after = await requestAs(db.alice, `/api/goals/${goalId}`);
    const updated = ((await after.json()) as { goal: Goal }).goal;
    expect(updated.name).toBe("Europe Trip");
    expect(updated.target_amount).toBe(150000);
    expect(updated.required_monthly).toBe(
      Math.round((150000 / monthsTo(TARGET)) * 100) / 100
    );
  });

  it("validates patch fields and 404s unknown goals", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);

    const bad = await requestAs(db.alice, `/api/goals/${goalId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_amount: "0", version: 1 }),
    });
    expect(bad.status).toBe(400);

    const badDate = await requestAs(db.alice, `/api/goals/${goalId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_date: "x", version: 1 }),
    });
    expect(badDate.status).toBe(400);

    expect(
      (
        await requestAs(db.alice, "/api/goals/00000000-0000-0000-0000-000000000000", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "x", version: 1 }),
        })
      ).status
    ).toBe(404);
    expect(
      (
        await requestAs(db.alice, "/api/goals/00000000-0000-0000-0000-000000000000")
      ).status
    ).toBe(404);
  });

  it("deletes a goal and cascades its contributions", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);
    await addContribution(db.alice, goalId, 1000, dateOnDay(5, 0));

    const del = await requestAs(db.alice, `/api/goals/${goalId}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect(
      (await requestAs(db.alice, `/api/goals/${goalId}`, { method: "DELETE" })).status
    ).toBe(404);

    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM goal_contributions WHERE goal_id = $1`,
      [goalId]
    );
    expect(Number(count.rows[0].count)).toBe(0);
  });
});

describe("goals status transitions", () => {
  it("pauses, resumes and completes a goal", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);

    expect(
      (await requestAs(db.alice, `/api/goals/${goalId}/pause`, { method: "POST" })).status
    ).toBe(200);
    let goal = ((await (
      await requestAs(db.alice, `/api/goals/${goalId}`)
    ).json()) as { goal: Goal }).goal;
    expect(goal.status).toBe("paused");

    expect(
      (await requestAs(db.alice, `/api/goals/${goalId}/resume`, { method: "POST" })).status
    ).toBe(200);
    goal = ((await (
      await requestAs(db.alice, `/api/goals/${goalId}`)
    ).json()) as { goal: Goal }).goal;
    expect(goal.status).toBe("active");

    expect(
      (await requestAs(db.alice, `/api/goals/${goalId}/complete`, { method: "POST" })).status
    ).toBe(200);
    goal = ((await (
      await requestAs(db.alice, `/api/goals/${goalId}`)
    ).json()) as { goal: Goal }).goal;
    expect(goal.status).toBe("completed");
    expect(goal.completed_at).not.toBeNull();

    expect(
      (
        await requestAs(
          db.alice,
          "/api/goals/00000000-0000-0000-0000-000000000000/pause",
          { method: "POST" }
        )
      ).status
    ).toBe(404);
  });
});

describe("goals dashboard", () => {
  it("reports totals and completion percentage", async () => {
    const a = await createGoal(db.alice, "Emergency", AMOUNT, TARGET);
    await addContribution(db.alice, a, 30000, dateOnDay(5, 0));
    await createGoal(db.alice, "Vacation", 80000, "2027-12-01");

    const res = await requestAs(db.alice, "/api/goals/dashboard");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dashboard: {
        goal_count: number;
        total_target: number;
        total_saved: number;
        completion_pct: number;
      };
    };
    expect(body.dashboard.goal_count).toBe(2);
    expect(body.dashboard.total_target).toBe(200000);
    expect(body.dashboard.total_saved).toBe(30000);
    expect(body.dashboard.completion_pct).toBe(15);
  });

  it("respects the status filter", async () => {
    const a = await createGoal(db.alice, "Emergency", AMOUNT, TARGET);
    await addContribution(db.alice, a, 30000, dateOnDay(5, 0));
    const b = await createGoal(db.alice, "Vacation", 80000, "2027-12-01");
    await requestAs(db.alice, `/api/goals/${b}/complete`, { method: "POST" });

    const active = await requestAs(db.alice, "/api/goals/dashboard");
    const body = (await active.json()) as {
      dashboard: { goal_count: number; total_target: number; total_saved: number };
    };
    expect(body.dashboard.goal_count).toBe(1);
    expect(body.dashboard.total_target).toBe(AMOUNT);
    expect(body.dashboard.total_saved).toBe(30000);

    expect(
      (await requestAs(db.alice, "/api/goals/dashboard?status=bogus")).status
    ).toBe(400);
  });
});

describe("goal contributions", () => {
  it("records contributions and updates the derived amount", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);
    await addContribution(db.alice, goalId, 5000, dateOnDay(5, 0));
    await addContribution(db.alice, goalId, 7000, dateOnDay(5, 1));

    const res = await requestAs(db.alice, `/api/goals/${goalId}/contributions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      contributions: { amount: number; date: string; notes: string | null }[];
    };
    expect(body.contributions).toHaveLength(2);
    expect(body.contributions.map((c) => c.amount)).toEqual([7000, 5000]);

    const goal = ((await (
      await requestAs(db.alice, `/api/goals/${goalId}`)
    ).json()) as { goal: Goal }).goal;
    expect(goal.current_amount).toBe(12000);
  });

  it("validates contribution payloads", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);

    const badAmount = await postAs(db.alice, `/api/goals/${goalId}/contributions`, {
      amount: "0",
      date: dateOnDay(5, 0),
    });
    expect(badAmount.status).toBe(400);

    const badDate = await postAs(db.alice, `/api/goals/${goalId}/contributions`, {
      amount: "100",
      date: "nope",
    });
    expect(badDate.status).toBe(400);

    expect(
      (
        await postAs(
          db.alice,
          "/api/goals/00000000-0000-0000-0000-000000000000/contributions",
          { amount: "100", date: dateOnDay(5, 0) }
        )
      ).status
    ).toBe(404);
  });

  it("links a contribution to an existing transaction", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);
    const account = await createAccount(db.alice, "Savings");
    const food = await createCategory(db.alice, "Food");
    const txnId = await createExpense(db.alice, account, food, 1000, dateOnDay(5, 0));

    const res = await postAs(db.alice, `/api/goals/${goalId}/contributions`, {
      amount: "1000",
      date: dateOnDay(5, 0),
      transaction_id: txnId,
    });
    expect(res.status).toBe(200);

    const list = await requestAs(db.alice, `/api/goals/${goalId}/contributions`);
    const body = (await list.json()) as {
      contributions: { transaction_id: string | null }[];
    };
    expect(body.contributions[0].transaction_id).toBe(txnId);

    const badTxn = await postAs(db.alice, `/api/goals/${goalId}/contributions`, {
      amount: "100",
      date: dateOnDay(5, 0),
      transaction_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(badTxn.status).toBe(400);

    const malformed = await postAs(db.alice, `/api/goals/${goalId}/contributions`, {
      amount: "100",
      date: dateOnDay(5, 0),
      transaction_id: "not-a-uuid",
    });
    expect(malformed.status).toBe(400);
  });

  it("edits and deletes contributions", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);
    const contributionId = await addContribution(db.alice, goalId, 1000, dateOnDay(5, 0));

    const patched = await requestAs(
      db.alice,
      `/api/goals/${goalId}/contributions/${contributionId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: "3000" }),
      }
    );
    expect(patched.status).toBe(200);

    let goal = ((await (
      await requestAs(db.alice, `/api/goals/${goalId}`)
    ).json()) as { goal: Goal }).goal;
    expect(goal.current_amount).toBe(3000);

    const del = await requestAs(
      db.alice,
      `/api/goals/${goalId}/contributions/${contributionId}`,
      { method: "DELETE" }
    );
    expect(del.status).toBe(200);

    goal = ((await (
      await requestAs(db.alice, `/api/goals/${goalId}`)
    ).json()) as { goal: Goal }).goal;
    expect(goal.current_amount).toBe(0);

    expect(
      (
        await requestAs(
          db.alice,
          `/api/goals/${goalId}/contributions/${contributionId}`,
          { method: "DELETE" }
        )
      ).status
    ).toBe(404);

    const badPatch = await requestAs(
      db.alice,
      `/api/goals/${goalId}/contributions/${contributionId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: "1" }),
      }
    );
    expect(badPatch.status).toBe(404);
  });
});

describe("goal milestones", () => {
  it("crosses 25/50/75/100% and records reached dates", async () => {
    const goalId = await createGoal(db.alice, "Laptop", 10000, TARGET);
    await addContribution(db.alice, goalId, 2500, dateOnDay(5, 0));
    await addContribution(db.alice, goalId, 2500, dateOnDay(5, 1));
    await addContribution(db.alice, goalId, 5000, dateOnDay(5, 2));

    const res = await requestAs(db.alice, `/api/goals/${goalId}/milestones`);
    const body = (await res.json()) as {
      milestones: { milestone_pct: number; reached_date: string }[];
    };
    expect(body.milestones.map((m) => m.milestone_pct)).toEqual([25, 50, 75, 100]);
    expect(body.milestones[0].reached_date).toBe(dateOnDay(5, 0));
    expect(body.milestones[3].reached_date).toBe(dateOnDay(5, 2));

    const progress = await requestAs(db.alice, `/api/goals/${goalId}/progress`);
    const progressBody = (await progress.json()) as {
      progress_pct: number;
      current_amount: number;
      milestones: { milestone_pct: number }[];
    };
    expect(progressBody.progress_pct).toBe(100);
    expect(progressBody.current_amount).toBe(10000);
    expect(progressBody.milestones).toHaveLength(4);
  });

  it("removes milestones when the goal drops below the threshold", async () => {
    const goalId = await createGoal(db.alice, "Laptop", 10000, TARGET);
    await addContribution(db.alice, goalId, 2500, dateOnDay(5, 0));
    const big = await addContribution(db.alice, goalId, 7500, dateOnDay(5, 1));

    let milestones = ((await (
      await requestAs(db.alice, `/api/goals/${goalId}/milestones`)
    ).json()) as { milestones: { milestone_pct: number }[] }).milestones;
    expect(milestones.map((m) => m.milestone_pct)).toEqual([25, 50, 75, 100]);

    await requestAs(db.alice, `/api/goals/${goalId}/contributions/${big}`, {
      method: "DELETE",
    });

    milestones = ((await (
      await requestAs(db.alice, `/api/goals/${goalId}/milestones`)
    ).json()) as { milestones: { milestone_pct: number }[] }).milestones;
    expect(milestones.map((m) => m.milestone_pct)).toEqual([25]);
  });

  it("re-crosses a milestone after dropping below and recovering", async () => {
    const goalId = await createGoal(db.alice, "Laptop", 10000, TARGET);
    const first = await addContribution(db.alice, goalId, 2500, dateOnDay(5, 0));
    await requestAs(db.alice, `/api/goals/${goalId}/contributions/${first}`, {
      method: "DELETE",
    });
    await addContribution(db.alice, goalId, 3000, dateOnDay(5, 1));

    const milestones = ((await (
      await requestAs(db.alice, `/api/goals/${goalId}/milestones`)
    ).json()) as { milestones: { milestone_pct: number; reached_date: string }[] })
      .milestones;
    expect(milestones.map((m) => m.milestone_pct)).toEqual([25]);
    expect(milestones[0].reached_date).toBe(dateOnDay(5, 1));
  });
});

describe("goal snapshots", () => {
  it("upserts one snapshot per date and lists them", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);
    await addContribution(db.alice, goalId, 3000, dateOnDay(5, 0));
    await addContribution(db.alice, goalId, 2000, dateOnDay(5, 0));

    const res = await requestAs(db.alice, `/api/goals/${goalId}/snapshots`);
    const body = (await res.json()) as {
      snapshots: { date: string; current_amount: number }[];
    };
    expect(body.snapshots).toHaveLength(1);
    expect(body.snapshots[0].date).toBe(dateOnDay(5, 0));
    expect(body.snapshots[0].current_amount).toBe(5000);
  });

  it("records a manual snapshot for today", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);
    await addContribution(db.alice, goalId, 4000, dateOnDay(5, 1));

    const manual = await postAs(db.alice, `/api/goals/${goalId}/snapshots`, {});
    expect(manual.status).toBe(200);

    const res = await requestAs(db.alice, `/api/goals/${goalId}/snapshots`);
    const body = (await res.json()) as {
      snapshots: { current_amount: number }[];
    };
    expect(body.snapshots).toHaveLength(2);
    expect(body.snapshots[1].current_amount).toBe(4000);

    expect(
      (await postAs(db.alice, `/api/goals/${goalId}/snapshots`, { date: "bad" })).status
    ).toBe(400);
  });
});

describe("goal templates", () => {
  it("lists system templates for every user", async () => {
    await pool.query(
      `INSERT INTO goal_templates (user_id, name, description, default_target_amount,
        default_timeframe_months, icon, is_system, version)
       VALUES (NULL, 'Emergency Fund', '6 months of living expenses', NULL, 12, 'shield', 1, 1)`
    );

    const res = await requestAs(db.alice, "/api/goals/templates");
    const body = (await res.json()) as { templates: { name: string; is_system: number }[] };
    expect(body.templates.map((t) => t.name)).toContain("Emergency Fund");

    const asBob = await requestAs(db.bob, "/api/goals/templates");
    expect(
      ((await asBob.json()) as { templates: { name: string }[] }).templates.map(
        (t) => t.name
      )
    ).toContain("Emergency Fund");
  });

  it("creates, reads, updates and deletes a custom template with isolation", async () => {
    const created = await postAs(db.alice, "/api/goals/templates", {
      name: "My Savings Plan",
      description: "Personal",
      default_target_amount: "50000",
      default_timeframe_months: 12,
      icon: "flag",
    });
    expect(created.status).toBe(200);
    const templateId = ((await created.json()) as { template: { id: string } }).template.id;

    const dup = await postAs(db.alice, "/api/goals/templates", {
      name: "My Savings Plan",
    });
    expect(dup.status).toBe(409);

    const list = await requestAs(db.alice, "/api/goals/templates");
    const templates = ((await list.json()) as {
      templates: { id: string; name: string; is_system: number }[];
    }).templates;
    const mine = templates.find((t) => t.id === templateId);
    expect(mine?.is_system).toBe(0);

    const asBob = await requestAs(db.bob, "/api/goals/templates");
    expect(
      ((await asBob.json()) as { templates: { id: string }[] }).templates.find(
        (t) => t.id === templateId
      )
    ).toBeUndefined();
    expect((await requestAs(db.bob, `/api/goals/templates/${templateId}`)).status).toBe(404);

    const single = await requestAs(db.alice, `/api/goals/templates/${templateId}`);
    expect(((await single.json()) as { template: { name: string } }).template.name).toBe(
      "My Savings Plan"
    );

    const patched = await requestAs(db.alice, `/api/goals/templates/${templateId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Aggressive Saver", version: 1 }),
    });
    expect(patched.status).toBe(200);

    const stale = await requestAs(db.alice, `/api/goals/templates/${templateId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Stale", version: 1 }),
    });
    expect(stale.status).toBe(409);

    expect(
      (await requestAs(db.bob, `/api/goals/templates/${templateId}`, { method: "DELETE" }))
        .status
    ).toBe(404);
    expect(
      (await requestAs(db.alice, `/api/goals/templates/${templateId}`, { method: "DELETE" }))
        .status
    ).toBe(200);
  });

  it("does not allow editing or deleting system templates", async () => {
    await pool.query(
      `INSERT INTO goal_templates (user_id, name, is_system, version)
       VALUES (NULL, 'System One', 1, 1)`
    );
    const list = await requestAs(db.alice, "/api/goals/templates");
    const systemId = ((await list.json()) as {
      templates: { id: string; is_system: number }[];
    }).templates.find((t) => t.is_system === 1)!.id;

    expect(
      (
        await requestAs(db.alice, `/api/goals/templates/${systemId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Hijack", version: 1 }),
        })
      ).status
    ).toBe(404);
    expect(
      (await requestAs(db.alice, `/api/goals/templates/${systemId}`, { method: "DELETE" }))
        .status
    ).toBe(404);
  });
});

describe("goals with-transfer contribution", () => {
  it("creates a transfer pair and links the contribution to it", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);
    const from = await createAccount(db.alice, "Source");
    const to = await createAccount(db.alice, "Goal Fund");

    const res = await postAs(db.alice, `/api/goals/${goalId}/contributions/with-transfer`, {
      from_account_id: from,
      to_account_id: to,
      amount: "5000",
      date: dateOnDay(5, 0),
    });
    expect(res.status).toBe(200);

    const contributions = await requestAs(db.alice, `/api/goals/${goalId}/contributions`);
    const list = (await contributions.json()) as {
      contributions: { amount: number; transaction_id: string | null }[];
    };
    expect(list.contributions).toHaveLength(1);
    expect(list.contributions[0].amount).toBe(5000);
    expect(list.contributions[0].transaction_id).not.toBeNull();

    const transfers = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM account_transfers WHERE user_id = $1`,
      [db.alice.userId]
    );
    expect(Number(transfers.rows[0].count)).toBe(1);

    const accounts = await requestAs(db.alice, "/api/accounts");
    const balances = ((await accounts.json()) as {
      accounts: { id: string; name: string; balance: number }[];
    }).accounts;
    expect(balances.find((a) => a.id === from)?.balance).toBe(-5000);
    expect(balances.find((a) => a.id === to)?.balance).toBe(5000);
  });

  it("rejects invalid accounts and mismatched source/destination", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);
    const from = await createAccount(db.alice, "Source");

    const same = await postAs(db.alice, `/api/goals/${goalId}/contributions/with-transfer`, {
      from_account_id: from,
      to_account_id: from,
      amount: "1000",
      date: dateOnDay(5, 0),
    });
    expect(same.status).toBe(400);

    const missing = await postAs(db.alice, `/api/goals/${goalId}/contributions/with-transfer`, {
      from_account_id: from,
      to_account_id: "00000000-0000-0000-0000-000000000000",
      amount: "1000",
      date: dateOnDay(5, 0),
    });
    expect(missing.status).toBe(409);

    expect(
      (
        await postAs(
          db.alice,
          "/api/goals/00000000-0000-0000-0000-000000000000/contributions/with-transfer",
          { from_account_id: from, to_account_id: from, amount: "1000", date: dateOnDay(5, 0) }
        )
      ).status
    ).toBe(400);
  });
});

describe("goals exports and distribute", () => {
  it("exports goals as a BOM-prefixed CSV", async () => {
    const created = await postAs(db.alice, "/api/goals", {
      name: "Vacation, Tokyo",
      target_amount: "100000",
      target_date: TARGET,
    });
    const goalId = ((await created.json()) as { goal: { id: string } }).goal.id;
    await addContribution(db.alice, goalId, 25000, dateOnDay(5, 0));

    const res = await requestAs(db.alice, "/api/goals/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      await res.arrayBuffer()
    );
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain("Name,Target Amount,Current Amount,Progress %,Target Date,Status,Priority");
    expect(text).toContain(`"Vacation, Tokyo",100000,25000,25%,${TARGET},active,medium`);
  });

  it("exports contributions as a BOM-prefixed CSV", async () => {
    const goalId = await createGoal(db.alice, "Trip", AMOUNT, TARGET);
    await addContribution(db.alice, goalId, 1000, dateOnDay(5, 0));

    const res = await requestAs(db.alice, `/api/goals/${goalId}/contributions/export`);
    expect(res.status).toBe(200);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      await res.arrayBuffer()
    );
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain("Date,Amount,Notes");
    expect(text).toContain(`${dateOnDay(5, 0)},1000,`);

    expect(
      (
        await requestAs(
          db.alice,
          "/api/goals/00000000-0000-0000-0000-000000000000/contributions/export"
        )
      ).status
    ).toBe(404);
  });

  it("suggests a proportional windfall distribution", async () => {
    const a = await createGoal(db.alice, "Emergency", AMOUNT, TARGET);
    await addContribution(db.alice, a, 30000, dateOnDay(5, 0));
    await createGoal(db.alice, "Vacation", 80000, "2027-12-01");

    const res = await postAs(db.alice, "/api/goals/distribute", { amount: "17000" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      suggestions: { goal_id: string; amount: number; remaining: number }[];
    };
    expect(body.suggestions).toHaveLength(2);
    expect(body.suggestions[0].amount).toBe(9000);
    expect(body.suggestions[1].amount).toBe(8000);
    expect(body.suggestions[0].remaining).toBe(90000);
    expect(body.suggestions[1].remaining).toBe(80000);

    const bad = await postAs(db.alice, "/api/goals/distribute", { amount: "0" });
    expect(bad.status).toBe(400);
  });
});

describe("goals isolation", () => {
  it("keeps goals and contributions private between users", async () => {
    const goalId = await createGoal(db.alice, "Secret", AMOUNT, TARGET);
    await addContribution(db.alice, goalId, 1000, dateOnDay(5, 0));

    const asBob = await requestAs(db.bob, "/api/goals");
    expect(((await asBob.json()) as { goals: Goal[] }).goals).toHaveLength(0);

    expect((await requestAs(db.bob, `/api/goals/${goalId}`)).status).toBe(404);
    expect(
      (
        await requestAs(db.bob, `/api/goals/${goalId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "hacked", version: 1 }),
        })
      ).status
    ).toBe(404);
    expect(
      (await requestAs(db.bob, `/api/goals/${goalId}`, { method: "DELETE" })).status
    ).toBe(404);
    expect(
      (
        await postAs(db.bob, `/api/goals/${goalId}/contributions`, {
          amount: "100",
          date: dateOnDay(5, 0),
        })
      ).status
    ).toBe(404);
    expect(
      (await requestAs(db.bob, `/api/goals/${goalId}/snapshots`)).status
    ).toBe(404);
    expect(
      (await requestAs(db.bob, `/api/goals/${goalId}/milestones`)).status
    ).toBe(404);
    expect(
      (await requestAs(db.bob, `/api/goals/${goalId}/feasibility`)).status
    ).toBe(404);
    expect(
      (await requestAs(db.bob, `/api/goals/${goalId}/projection`)).status
    ).toBe(404);

    const aliceAgain = await requestAs(db.alice, "/api/goals");
    expect(((await aliceAgain.json()) as { goals: Goal[] }).goals).toHaveLength(1);
  });
});