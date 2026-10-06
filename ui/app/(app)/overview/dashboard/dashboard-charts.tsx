"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/format";

type CashflowRow = { month: string; income: number; expense: number; net: number };
type CategoryRow = { category_id: string | null; category: string; total: number; count: number; pct: number };

const CATEGORY_COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

function currencyTick(value: number): string {
  if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(0)}k`;
  return `₹${value}`;
}

export function CashflowTrendCard({ cashflow }: { cashflow: CashflowRow[] }) {
  const rows = cashflow.slice(-6).map((row) => ({
    ...row,
    month: row.month.slice(5) || row.month,
  }));

  return (
    <Card className="min-h-[390px]">
      <CardHeader className="pb-4">
        <CardTitle>Cashflow trend</CardTitle>
        <CardDescription>Income vs expenses for the latest months</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex h-[270px] items-center justify-center rounded-lg border border-dashed border-neutral-200 text-sm text-neutral-500">
            Add transactions to see your cashflow trend.
          </div>
        ) : (
          <div className="h-[270px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748B" />
                <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12 }} stroke="#64748B" width={64} />
                <Tooltip formatter={(value: number, name: string) => [formatINR(Number(value)), name]} contentStyle={{ borderRadius: 8, borderColor: "#E5E7EB" }} />
                <Bar dataKey="income" name="Income" fill="#10B981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense" name="Expense" fill="#EF4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SpendingBreakdownCard({ categories }: { categories: CategoryRow[] }) {
  const rows = categories.slice(0, 5);
  const total = rows.reduce((sum, category) => sum + category.total, 0);

  return (
    <Card className="min-h-[390px]">
      <CardHeader className="pb-4">
        <CardTitle>Spending breakdown</CardTitle>
        <CardDescription>Top categories this period</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex h-[270px] items-center justify-center rounded-lg border border-dashed border-neutral-200 text-sm text-neutral-500">
            Categorize transactions to see this chart.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-[180px_1fr]">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rows} dataKey="total" nameKey="category" innerRadius={48} outerRadius={78} paddingAngle={2}>
                    {rows.map((entry, index) => (
                      <Cell key={entry.category_id ?? entry.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatINR(Number(value))} contentStyle={{ borderRadius: 8, borderColor: "#E5E7EB" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {rows.map((category, index) => (
                <div key={category.category_id ?? category.category} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-medium text-neutral-800">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
                      <span className="truncate">{category.category}</span>
                    </span>
                    <span className="font-semibold">{formatINR(category.total)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full rounded-full" style={{ width: `${total > 0 ? Math.min(100, (category.total / total) * 100) : 0}%`, backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
