"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { chartTheme, useDarkMode } from "@/lib/chart-theme";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { EmptyState, currencyTick, formatINR, type BudgetRow } from "./reports-shared";

export function BudgetChart({ budgetVsActual, budgetMonth, budgetYear }: { budgetVsActual: BudgetRow[]; budgetMonth: number; budgetYear: number }) {
  const budgetLabel = new Date(budgetYear, budgetMonth - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const dark = useDarkMode();
  const t = chartTheme(dark);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle>Budget vs Actual - {budgetLabel}</CardTitle>
        <CardDescription>Budgeted vs actual spend per category</CardDescription>
      </CardHeader>
      <CardContent>
        {budgetVsActual.length === 0 ? (
          <EmptyState message="No budgets for this month." />
        ) : (
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={budgetVsActual} margin={{ top: 8, right: 16, left: 8, bottom: 56 }} barCategoryGap="24%" barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: t.tick }}
                  stroke={t.tick}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                  tickMargin={8}
                />
                <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12, fill: t.tick }} stroke={t.tick} width={80} />
                <Tooltip formatter={(value: number, name: string) => [formatINR(Number(value)), name]} contentStyle={{ borderRadius: 12, borderColor: t.tooltipBorder, backgroundColor: t.tooltipBg, color: t.tooltipText }} />
                    <Legend wrapperStyle={{ paddingTop: 8, color: t.legendText }} />
                <Bar dataKey="budgeted" name="Budgeted" fill="#2563EB" radius={[6, 6, 0, 0]} maxBarSize={56} />
                <Bar dataKey="actual" name="Actual" fill="#F59E0B" radius={[6, 6, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
