import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson } from "./helpers";
import { csvEscape } from "../utils/format";
import { round2 } from "../utils/finance";
import {
  createExportJob,
  getCashflow,
  getExportJob,
  getIncomeSources,
  getReportsSummary,
  getSpendingByCategory,
  getSpendingHeatmap,
  getSpendingTrend,
  getTopMerchants,
  listExportJobs,
  resolveRange,
} from "../queries/reports";
import { listSnapshots } from "../queries/net-worth";
import { getBudgets } from "../queries/budgets";
import { getDashboard } from "../queries/debts";

const reports = new Hono();

const RANGES: Record<string, number | null> = {
  "1M": 1,
  "3M": 3,
  "6M": 6,
  "1Y": 12,
  All: null,
};

function rangeFromQuery(c: {
  req: { query: (k: string) => string | undefined };
}) {
  const from = c.req.query("from") || null;
  const to = c.req.query("to") || null;
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { from, to };
  }
  const monthsParam = c.req.query("months");
  const months = monthsParam ? Number(monthsParam) : null;
  const windowDays =
    months && [1, 3, 6, 12].includes(months) ? months : RANGES[c.req.query("range") ?? "6M"] ?? 6;
  return resolveRange(windowDays, null, null);
}

function csvResponse(header: string[], rows: (string | number)[][], filename: string) {
  const csv =
    "\uFEFF" +
    [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

reports.get("/cashflow", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({
    cashflow: await getCashflow(user.user_id, rangeFromQuery(c)),
  });
});

reports.get("/spending-by-category", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({
    categories: await getSpendingByCategory(user.user_id, rangeFromQuery(c)),
  });
});

reports.get("/trends", requireAuth, async (c) => {
  const user = c.get("user");
  const monthsParam = Number(c.req.query("months") ?? 6);
  const months: 3 | 6 | 12 = [3, 12].includes(monthsParam)
    ? (monthsParam as 3 | 12)
    : 6;
  return c.json({
    months,
    trend: await getSpendingTrend(user.user_id, months),
  });
});

reports.get("/budget-vs-actual", requireAuth, async (c) => {
  const user = c.get("user");
  const now = new Date();
  const month = Number(c.req.query("month") || now.getMonth() + 1);
  const year = Number(c.req.query("year") || now.getFullYear());
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    return c.json({ error: "Invalid month or year." }, 400);
  }
  const budgets = await getBudgets(user.user_id, month, year);
  return c.json({
    month,
    year,
    budgets: budgets.map((b) => ({
      name: b.category_name ?? "Overall",
      category_id: b.category_id,
      budgeted: b.amount,
      actual: b.spent,
      utilization_pct: b.utilization_pct,
      over_budget: b.is_over_budget === 1,
    })),
  });
});

reports.get("/heatmap", requireAuth, async (c) => {
  const user = c.get("user");
  const now = new Date();
  const month = Number(c.req.query("month") || now.getMonth() + 1);
  const year = Number(c.req.query("year") || now.getFullYear());
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000) {
    return c.json({ error: "Invalid month or year." }, 400);
  }
  return c.json({
    year,
    month,
    days: await getSpendingHeatmap(user.user_id, year, month),
  });
});

reports.get("/net-worth", requireAuth, async (c) => {
  const user = c.get("user");
  const from = rangeFromQuery(c).from;
  const snapshots = await listSnapshots(user.user_id, from, null);
  const series = snapshots.map((s, i) => ({
    date: s.date,
    net_worth: s.net_worth,
    change_pct:
      i === 0 || snapshots[i - 1].net_worth === 0
        ? null
        : round2(
            ((s.net_worth - snapshots[i - 1].net_worth) /
              Math.abs(snapshots[i - 1].net_worth)) *
              100
          ),
  }));
  return c.json({ series });
});

reports.get("/debt-payoff", requireAuth, async (c) => {
  const user = c.get("user");
  const dashboard = await getDashboard(user.user_id);
  return c.json({
    totals: {
      outstanding: dashboard.total_outstanding,
      monthly_emi: dashboard.total_monthly_emi,
      debt_free_date: dashboard.debt_free_date,
    },
    debts: dashboard.debts.map((d) => {
      const original =
        d.principal_original > 0
          ? d.principal_original
          : d.principal_outstanding;
      const paidPct =
        original > 0
          ? round2(((original - d.principal_outstanding) / original) * 100)
          : 0;
      return {
        id: d.id,
        name: d.name,
        principal_original: original,
        principal_outstanding: d.principal_outstanding,
        paid_pct: Math.max(0, Math.min(100, paidPct)),
        months_remaining: d.months_remaining,
        end_date: d.end_date,
      };
    }),
  });
});

reports.get("/income-sources", requireAuth, async (c) => {
  const user = c.get("user");
  const sources = await getIncomeSources(user.user_id, rangeFromQuery(c));
  return c.json({
    total_income: round2(sources.reduce((s, x) => s + x.total, 0)),
    sources,
  });
});

reports.get("/top-merchants", requireAuth, async (c) => {
  const user = c.get("user");
  const sortBy = c.req.query("sort") === "frequency" ? "frequency" : "spend";
  const limitRaw = Number(c.req.query("limit") ?? 10);
  const limit = [10, 25].includes(limitRaw) ? limitRaw : 10;
  return c.json({
    merchants: await getTopMerchants(user.user_id, rangeFromQuery(c), {
      sortBy,
      limit,
    }),
  });
});

reports.get("/summary", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({
    summary: await getReportsSummary(user.user_id, rangeFromQuery(c)),
  });
});

reports.get("/cashflow/export", requireAuth, async (c) => {
  const user = c.get("user");
  const flow = await getCashflow(user.user_id, rangeFromQuery(c));
  return csvResponse(
    ["Month", "Income", "Expense", "Net"],
    flow.map((m) => [
      m.month,
      m.income.toFixed(2),
      m.expense.toFixed(2),
      m.net.toFixed(2),
    ]),
    `cashflow-${new Date().toISOString().slice(0, 10)}.csv`
  );
});

reports.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const range = rangeFromQuery(c);
  const summary = await getReportsSummary(user.user_id, range);
  return csvResponse(
    ["Metric", "Value"],
    [
      ["Period start", range.from],
      ["Period end", range.to],
      ["Total income", summary.total_income.toFixed(2)],
      ["Total expense", summary.total_expense.toFixed(2)],
      ["Net", summary.net.toFixed(2)],
      ["Top category", summary.top_category ?? ""],
      ["Top merchant", summary.top_merchant ?? ""],
      ["Budget overruns", summary.budget_overruns],
      ["Net worth (investments)", summary.net_worth.toFixed(2)],
      ["Debt outstanding", summary.debt_outstanding.toFixed(2)],
    ],
    `report-${range.from}-to-${range.to}.csv`
  );
});

/** Creates a report_exports job; the PDF itself regenerates on download. */
reports.post("/export-pdf", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const templateId = String(body.template_id ?? "") || null;
  const from = String(body.start_date ?? "") || null;
  const to = String(body.end_date ?? "") || null;

  const fieldErrors: Record<string, string> = {};
  if (templateId && !/^[0-9a-f-]{36}$/i.test(templateId)) {
    fieldErrors.template_id = "Invalid template id.";
  }
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    fieldErrors.start_date = "Choose a valid start date.";
  }
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    fieldErrors.end_date = "Choose a valid end date.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  const jobId = await withUser(user.user_id, (client) =>
    createExportJob(client, {
      userId: user.user_id,
      templateId,
      fileType: "pdf",
      rangeStart: from,
      rangeEnd: to,
    })
  );
  return c.json({ success: true, export: { id: jobId } });
});

export { reports };
