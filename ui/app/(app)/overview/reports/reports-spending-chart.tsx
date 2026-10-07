"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { chartTheme, useDarkMode } from "@/lib/chart-theme";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { EmptyState, PIE_COLORS, formatINR, type CategorySlice } from "./reports-shared";

export function SpendingDonut({ spendingByCategory }: { spendingByCategory: CategorySlice[] }) {
  const dark = useDarkMode();
  const t = chartTheme(dark);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle>Spending by Category</CardTitle>
        <CardDescription>Expense breakdown - donut</CardDescription>
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
                    formatter={(value: number, _name: string, item: unknown) => {
                      const payload = (item as { payload?: CategorySlice })?.payload;
                      const label = payload?.category ?? String(_name);
                      const pct = payload?.pct != null ? ` (${payload.pct}%)` : "";
                      return [formatINR(Number(value)) + pct, label];
                    }}
                    contentStyle={{ borderRadius: 12, borderColor: t.tooltipBorder, backgroundColor: t.tooltipBg, color: t.tooltipText }}
                    wrapperStyle={{ zIndex: 10, outline: "none" }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    align="center"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: "11px", lineHeight: "16px", paddingTop: "8px", color: t.legendText }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-xl border border-line bg-sunken/70 divide-y divide-line overflow-hidden">
              {spendingByCategory.slice(0, 6).map((c, i) => (
                <div key={c.category_id ?? c.category} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="truncate font-medium text-ink-2">{c.category}</span>
                    <span className="text-neutral-400">({c.count})</span>
                  </span>
                  <span className="shrink-0 font-semibold text-ink-1">{formatINR(c.total)} · {c.pct}%</span>
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
  );
}
