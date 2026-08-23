import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";
import { csvEscape, isoDate } from "../utils/format";
import {
  deriveChange,
  getCurrentNetWorth,
  getNetWorthBreakdown,
  insertMilestone,
  listMilestones,
  listSnapshots,
  setMilestoneActive,
  softDeleteMilestone,
  stampMilestoneCrossings,
  updateMilestoneFields,
  upsertSnapshotFromComputation,
} from "../queries/net-worth";

const netWorth = new Hono();

const RANGES: Record<string, number | null> = {
  "1M": 30,
  "3M": 90,
  "6M": 182,
  "1Y": 365,
  "5Y": 1826,
  All: null,
};

function rangeToDate(range: string | undefined, fallback: string): string | null {
  const days = RANGES[range ?? fallback] ?? null;
  if (days === null) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoDate(d);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

netWorth.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const [live, snapshots] = [
    await getCurrentNetWorth(user.user_id),
    await listSnapshots(user.user_id, null, null),
  ];

  // MoM/YoY prefer the snapshot series; fall back to the live computation
  // when no snapshot exists yet.
  let mom = deriveChange(snapshots, 30);
  let yoy = deriveChange(snapshots, 365);
  if (!snapshots.length) {
    mom = { absolute: 0, pct: null };
    yoy = { absolute: 0, pct: null };
  }
  void live;

  const current =
    snapshots.at(-1) ??
    ({
      date: isoDate(new Date()),
      assets_total: live.totals.assets_total,
      liabilities_total: live.totals.liabilities_total,
      net_worth: live.totals.net_worth,
    } as (typeof snapshots)[number]);

  return c.json({
    net_worth: current.net_worth,
    assets_total: current.assets_total,
    liabilities_total: current.liabilities_total,
    as_of: current.date,
    month_over_month: mom,
    year_over_year: yoy,
  });
});

netWorth.get("/trend", requireAuth, async (c) => {
  const user = c.get("user");
  const from = rangeToDate(c.req.query("range"), "6M");
  const snapshots = await listSnapshots(user.user_id, from, null);
  return c.json({
    trend: snapshots.map((s) => ({
      date: s.date,
      assets_total: s.assets_total,
      liabilities_total: s.liabilities_total,
      net_worth: s.net_worth,
    })),
  });
});

netWorth.get("/breakdown", requireAuth, async (c) => {
  const user = c.get("user");
  const components = await getNetWorthBreakdown(user.user_id);
  return c.json({ breakdown: components });
});

netWorth.get("/ratio", requireAuth, async (c) => {
  const user = c.get("user");
  const [live, snapshots] = [
    await getCurrentNetWorth(user.user_id),
    await listSnapshots(user.user_id, null, null),
  ];
  void live;
  const current =
    snapshots.at(-1) ??
    ({
      date: isoDate(new Date()),
      assets_total: live.totals.assets_total,
      liabilities_total: live.totals.liabilities_total,
      net_worth: live.totals.net_worth,
    } as (typeof snapshots)[number]);
  const prevMonth = deriveChange(snapshots, 30);

  const ratio =
    current.liabilities_total > 0
      ? Math.round((current.assets_total / current.liabilities_total) * 100) / 100
      : null;

  return c.json({
    assets_total: current.assets_total,
    liabilities_total: current.liabilities_total,
    ratio,
    ratio_label:
      ratio === null
        ? null
        : `${ratio.toFixed(2)}:1`,
    assets_change_pct: prevMonth.pct === null || prevMonth.absolute === 0 && snapshots.length < 2
      ? null
      : prevMonth.pct,
  });
});

netWorth.get("/summary", requireAuth, async (c) => {
  const user = c.get("user");
  const [live, snapshots] = [
    await getCurrentNetWorth(user.user_id),
    await listSnapshots(user.user_id, null, null),
  ];
  const current =
    snapshots.at(-1)?.net_worth ?? live.totals.net_worth;
  return c.json({
    net_worth: current,
    month_over_month: deriveChange(snapshots, 30),
    year_over_year: deriveChange(snapshots, 365),
  });
});

netWorth.get("/snapshots", requireAuth, async (c) => {
  const user = c.get("user");
  const from = rangeToDate(c.req.query("range"), "All");
  return c.json({ snapshots: await listSnapshots(user.user_id, from, null) });
});

netWorth.post("/snapshots/run", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c).catch(() => ({}) as Record<string, unknown>);
  const date = String((body as { date?: unknown }).date ?? isoDate(new Date()));
  if (!isValidDate(date)) {
    return c.json({ fieldErrors: { date: "Choose a valid date." } }, 400);
  }

  const result = await withUser(user.user_id, async (client) => {
    await upsertSnapshotFromComputation(client, { userId: user.user_id, date });
    const snapshots = await listSnapshots(user.user_id, date, date, client);
    const today = snapshots[0];
    const crossed = await stampMilestoneCrossings(client, {
      userId: user.user_id,
      date,
      netWorth: today.net_worth,
    });
    return { snapshot: today, milestones_crossed: crossed };
  });

  return c.json({ success: true, ...result });
});

netWorth.get("/milestones", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ milestones: await listMilestones(user.user_id) });
});

netWorth.post("/milestones", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const label = String(body.label ?? "").trim();
  const targetAmount = parseAmount(body.target_amount);

  const fieldErrors: Record<string, string> = {};
  if (label.length < 2) {
    fieldErrors.label = "Please enter a milestone label.";
  }
  if (targetAmount === null || targetAmount <= 0) {
    fieldErrors.target_amount = "Enter a target amount greater than zero.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    await withUser(user.user_id, (client) =>
      insertMilestone(client, {
        userId: user.user_id,
        label,
        targetAmount: targetAmount as number,
      })
    );
  } catch (err) {
    console.error("[api] create milestone failed:", err);
    return c.json(
      { error: "Could not create the milestone. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

netWorth.patch("/milestones/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const label = body.label === undefined ? undefined : String(body.label).trim();
  const targetAmount =
    body.target_amount === undefined ? undefined : parseAmount(body.target_amount);
  const version = Number(body.version ?? 1);

  const fieldErrors: Record<string, string> = {};
  if (label !== undefined && label.length < 2) {
    fieldErrors.label = "Please enter a milestone label.";
  }
  if (targetAmount !== undefined &&
      (targetAmount === null || targetAmount <= 0)) {
    fieldErrors.target_amount = "Enter a target amount greater than zero.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const result = await withUser(user.user_id, (client) =>
      updateMilestoneFields(client, {
        userId: user.user_id,
        id,
        label: label ?? null,
        targetAmount: targetAmount ?? null,
        version,
      })
    );
    if (result.rowCount !== 1) {
      const existing = (await listMilestones(user.user_id)).find(
        (m) => m.id === id
      );
      return c.json(
        existing
          ? { error: "This milestone was modified elsewhere. Refresh and try again." }
          : { error: "Not found" },
        existing ? 409 : 404
      );
    }
  } catch (err) {
    console.error("[api] update milestone failed:", err);
    return c.json(
      { error: "Could not update the milestone. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

netWorth.delete("/milestones/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await withUser(user.user_id, (client) =>
    softDeleteMilestone(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

netWorth.post("/milestones/:id/toggle", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await withUser(user.user_id, async (client) => {
    const milestones = await listMilestones(user.user_id, client);
    const milestone = milestones.find((m) => m.id === id);
    if (!milestone) return null;
    return setMilestoneActive(client, {
      userId: user.user_id,
      id,
      isActive: milestone.is_active === 1 ? 0 : 1,
    });
  });

  if (!result || result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

netWorth.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const from = rangeToDate(c.req.query("range"), "All");
  const rows = await listSnapshots(user.user_id, from, null);

  const header = ["Date", "Assets", "Liabilities", "Net Worth"];
  const csvRows = rows.map((s) => [
    s.date,
    s.assets_total.toFixed(2),
    s.liabilities_total.toFixed(2),
    s.net_worth.toFixed(2),
  ]);
  const csv =
    "\uFEFF" +
    [header, ...csvRows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="net-worth-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
});

export { netWorth };
