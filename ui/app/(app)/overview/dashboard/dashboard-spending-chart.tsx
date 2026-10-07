"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import { chartTheme, useDarkMode } from "@/lib/chart-theme";

export type CategoryRow = { category_id: string | null; category: string; total: number; count: number; pct: number };

const CATEGORY_COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

export function SpendingBreakdownCard({ categories }: { categories: CategoryRow[] }) {
  const t = chartTheme(useDarkMode());
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
          <div className="flex h-[270px] items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-3">
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
                  <Tooltip formatter={(value: number) => formatINR(Number(value))} contentStyle={{ borderRadius: 8, borderColor: t.tooltipBorder, backgroundColor: t.tooltipBg, color: t.tooltipText }} itemStyle={{ color: t.tooltipText }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {rows.map((category, index) => (
                <div key={category.category_id ?? category.category} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-medium text-ink-1">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
                      <span className="truncate">{category.category}</span>
                    </span>
                    <span className="font-semibold">{formatINR(category.total)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-wash">
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
