"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { chartTheme, useDarkMode } from "@/lib/chart-theme";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { EmptyState, PIE_COLORS, formatINR, type IncomeSource } from "./reports-shared";

export function IncomeChart({ incomeSources, totalIncome }: { incomeSources: IncomeSource[]; totalIncome: number }) {
  const dark = useDarkMode();
  const t = chartTheme(dark);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Income Sources</CardTitle>
        <CardDescription>Total {formatINR(totalIncome)} - by category</CardDescription>
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
                    <Legend wrapperStyle={{ color: t.legendText }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
