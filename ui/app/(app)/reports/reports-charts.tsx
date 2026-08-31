"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";

const PIE_COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#0EA5E9", "#A855F7"];

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-neutral-500 py-8 text-center">{message}</p>;
}

type CashflowRow = { month: string; income: number; expense: number; net?: number };
type CategorySlice = { category_id: string | null; category: string; total: number; count: number; pct: number };
type TrendRow = { month: string; cumulative_spend: number; month_spend: number };
type BudgetRow = { name: string; category_id: string | null; budgeted: number; actual: number; utilization_pct: number; over_budget: boolean };
type HeatmapDay = { date: string; total: number };
type MerchantRow = { merchant: string; total: number; txn_count: number; avg_amount: number; recurring: number };
type NetWorthPoint = { date: string; net_worth: number; change_pct: number | null };
type IncomeSource = { category_id: string | null; category: string; total: number; count: number; pct: number };

export type ReportsChartsProps = {
  cashflow: CashflowRow[];
  spendingByCategory: CategorySlice[];
  trends: TrendRow[];
  trendsMonths: number;
  budgetVsActual: BudgetRow[];
  budgetMonth: number;
  budgetYear: number;
  heatmapDays: HeatmapDay[];
  heatmapYear: number;
  heatmapMonth: number;
  netWorthSeries: NetWorthPoint[];
  topMerchants: MerchantRow[];
  incomeSources: IncomeSource[];
  totalIncome: number;
};

function currencyTick(value: number): string {
  if (Math.abs(value) >= 100000) return `₹${(value / 1000).toFixed(0)}k`;
  if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
  return `₹${value}`;
}

export default function ReportsCharts({
  cashflow,
  spendingByCategory,
  trends,
  trendsMonths,
  budgetVsActual,
  budgetMonth,
  budgetYear,
  heatmapDays,
  heatmapYear,
  heatmapMonth,
  netWorthSeries,
  topMerchants,
  incomeSources,
  totalIncome,
}: ReportsChartsProps) {
  const cashflowWithNet = cashflow.map((c) => ({
    ...c,
    net: typeof c.net === "number" ? c.net : c.income - c.expense,
  }));

  const maxHeat = Math.max(0, ...heatmapDays.map((d) => d.total));
  const monthName = new Date(heatmapYear, heatmapMonth - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const budgetLabel = new Date(budgetYear, budgetMonth - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const daysInMonth = new Date(heatmapYear, heatmapMonth, 0).getDate();
  const heatmapMap = new Map<string, number>(heatmapDays.map((d) => [d.date, d.total]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cashflow</CardTitle>
          <CardDescription>Monthly income vs expense — net line</CardDescription>
        </CardHeader>
        <CardContent>
          {cashflowWithNet.length === 0 ? (
            <EmptyState message="No cashflow data. Add transactions to see trends." />
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cashflowWithNet} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748B" />
                  <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12 }} stroke="#64748B" width={80} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatINR(Number(value)), name]}
                    contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0" }}
                  />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="#10B981" radius={[6, 6, 0, 0]} barSize={20} />
                  <Bar dataKey="expense" name="Expense" fill="#EF4444" radius={[6, 6, 0, 0]} barSize={20} />
                  <Line type="monotone" dataKey="net" name="Net" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Spending by Category</CardTitle>
            <CardDescription>Expense breakdown — donut</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {spendingByCategory.length === 0 ? (
              <EmptyState message="No spending data for this period." />
            ) : (
              <>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <Pie
                        data={spendingByCategory}
                        dataKey="total"
                        nameKey="category"
                        cx="50%"
                        cy="45%"
                        innerRadius={62}
                        outerRadius={96}
                        paddingAngle={2}
                      >
                        {spendingByCategory.map((entry, idx) => (
                          <Cell key={entry.category_id ?? entry.category} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        // eslint-disable-next-line
                        formatter={(value: number, _name: string, item: unknown) => {
                          const payload = (item as { payload?: CategorySlice })?.payload;
                          const label = payload?.category ?? String(_name);
                          const pct = payload?.pct != null ? ` (${payload.pct}%)` : "";
                          return [formatINR(Number(value)) + pct, label];
                        }}
                        contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF" }}
                        wrapperStyle={{ zIndex: 10, outline: "none" }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: "11px", lineHeight: "16px", paddingTop: "8px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl border border-neutral-100 bg-neutral-50/70 divide-y divide-neutral-100 overflow-hidden">
                  {spendingByCategory.slice(0, 6).map((c, i) => (
                    <div key={c.category_id ?? c.category} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="truncate font-medium text-neutral-700">{c.category}</span>
                        <span className="text-neutral-400">({c.count})</span>
                      </span>
                      <span className="shrink-0 font-semibold text-neutral-900">{formatINR(c.total)} · {c.pct}%</span>
                    </div>
                  ))}
                </div>
                {spendingByCategory.length > 6 && (
                  <p className="text-center text-xs text-neutral-400">
                    +{spendingByCategory.length - 6} more categories
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trends — last {trendsMonths} months</CardTitle>
            <CardDescription>Cumulative spend vs monthly spend</CardDescription>
          </CardHeader>
          <CardContent>
            {trends.length === 0 ? (
              <EmptyState message="No trend data yet." />
            ) : (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trends} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748B" />
                    <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12 }} stroke="#64748B" width={80} />
                    <Tooltip
                      // eslint-disable-next-line
                      formatter={(value: unknown, name: unknown) => [formatINR(Number(value as number)), String(name)]}
                      contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0" }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="month_spend" name="Month spend" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="cumulative_spend" name="Cumulative" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Budget vs Actual — {budgetLabel}</CardTitle>
          <CardDescription>Budgeted vs actual spend per category</CardDescription>
        </CardHeader>
        <CardContent>
          {budgetVsActual.length === 0 ? (
            <EmptyState message="No budgets for this month." />
          ) : (
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={budgetVsActual} margin={{ top: 8, right: 16, left: 8, bottom: 56 }} barCategoryGap="24%" barGap={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    stroke="#64748B"
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                    tickMargin={8}
                  />
                  <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12 }} stroke="#64748B" width={80} />
                  <Tooltip formatter={(value: number, name: string) => [formatINR(Number(value)), name]} contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0" }} />
                  <Legend wrapperStyle={{ paddingTop: 8 }} />
                  <Bar dataKey="budgeted" name="Budgeted" fill="#2563EB" radius={[6, 6, 0, 0]} maxBarSize={56} />
                  <Bar dataKey="actual" name="Actual" fill="#F59E0B" radius={[6, 6, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spending Heatmap — {monthName}</CardTitle>
            <CardDescription>Daily expense intensity</CardDescription>
          </CardHeader>
          <CardContent>
            {heatmapDays.length === 0 ? (
              <EmptyState message="No spending heatmap data for this month." />
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1.5">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="text-[11px] text-center font-medium text-neutral-500 py-1">
                      {d}
                    </div>
                  ))}
                  {(() => {
                    const firstWeekday = new Date(heatmapYear, heatmapMonth - 1, 1).getDay();
                    const cells: React.ReactNode[] = [];
                    for (let i = 0; i < firstWeekday; i++) {
                      cells.push(<div key={`pad-${i}`} className="h-9 rounded-md bg-neutral-50" />);
                    }
                    for (let day = 1; day <= daysInMonth; day++) {
                      const iso = `${heatmapYear}-${String(heatmapMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const total = heatmapMap.get(iso) ?? 0;
                      const intensity = maxHeat > 0 && total > 0 ? Math.min(1, 0.2 + (total / maxHeat) * 0.8) : 0;
                      const bg = total > 0 ? `rgba(37, 99, 235, ${intensity})` : "#F8FAFC";
                      const textColor = intensity > 0.55 ? "#FFFFFF" : "#334155";
                      cells.push(
                        <div
                          key={iso}
                          className="h-9 rounded-md border border-neutral-100 flex flex-col items-center justify-center text-[11px] font-medium"
                          style={{ backgroundColor: bg, color: textColor }}
                          title={total > 0 ? `${iso}: ${formatINR(total)}` : `${iso}: no spend`}
                        >
                          <span>{day}</span>
                          {total > 0 && <span className="text-[10px] leading-none">{currencyTick(total)}</span>}
                        </div>
                      );
                    }
                    return cells;
                  })()}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                  <span>Less</span>
                  <div className="flex gap-1">
                    {[0.15, 0.35, 0.6, 0.9].map((o) => (
                      <div key={o} className="h-3 w-6 rounded-sm border border-neutral-100" style={{ backgroundColor: `rgba(37,99,235,${o})` }} />
                    ))}
                  </div>
                  <span>More</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Merchants</CardTitle>
            <CardDescription>Ranked by total spend</CardDescription>
          </CardHeader>
          <CardContent>
            {topMerchants.length === 0 ? (
              <EmptyState message="No merchant data yet." />
            ) : (
              <div className="space-y-3">
                {topMerchants.map((m) => (
                  <div key={m.merchant} className="flex items-center justify-between rounded-lg border border-neutral-100 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium font-heading text-neutral-800 truncate">{m.merchant}</p>
                      <p className="text-xs text-neutral-500">
                        {m.txn_count} txns · avg {formatINR(m.avg_amount)} {m.recurring === 1 && <span className="ml-1 inline-flex items-center rounded-full bg-warning-light px-1.5 py-0.5 text-[10px] font-medium text-warning-dark">recurring</span>}
                      </p>
                    </div>
                    <span className="text-sm font-semibold font-heading text-neutral-900">{formatINR(m.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Income Sources</CardTitle>
            <CardDescription>Total {formatINR(totalIncome)} — by category</CardDescription>
          </CardHeader>
          <CardContent>
            {incomeSources.length === 0 ? (
              <EmptyState message="No income sources for this period." />
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={incomeSources} dataKey="total" nameKey="category" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
                      {incomeSources.map((entry, idx) => (
                        <Cell key={entry.category_id ?? entry.category} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      // eslint-disable-next-line
                      formatter={(value: number, _name: string, item: unknown) => {
                        const payload = (item as { payload?: IncomeSource })?.payload;
                        const label = payload?.category ?? String(_name);
                        const pct = payload?.pct != null ? ` (${payload.pct}%)` : "";
                        return [formatINR(Number(value)) + pct, label];
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Net Worth</CardTitle>
            <CardDescription>Snapshot trend with daily change</CardDescription>
          </CardHeader>
          <CardContent>
            {netWorthSeries.length === 0 ? (
              <EmptyState message="No net worth snapshots yet." />
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={netWorthSeries} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#64748B" tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} />
                    <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12 }} stroke="#64748B" width={80} />
                    <Tooltip
                      formatter={(value: number, name: string) => (name === "net_worth" ? [formatINR(Number(value)), "Net worth"] : [value != null ? `${Number(value).toFixed(2)}%` : "—", "Change"])}
                      labelFormatter={(label: string) => new Date(label).toLocaleDateString("en-IN")}
                      contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0" }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="net_worth" name="Net worth" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
