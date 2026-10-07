"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import { chartTheme, useDarkMode } from "@/lib/chart-theme";

export type CashflowRow = { month: string; income: number; expense: number; net: number };

function currencyTick(value: number): string {
  if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(0)}k`;
  return `₹${value}`;
}

export function CashflowTrendCard({ cashflow }: { cashflow: CashflowRow[] }) {
  const t = chartTheme(useDarkMode());
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
          <div className="flex h-[270px] items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-3">
            Add transactions to see your cashflow trend.
          </div>
        ) : (
          <div className="h-[270px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: t.tick }} stroke={t.tick} />
                <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12, fill: t.tick }} stroke={t.tick} width={64} />
                <Tooltip formatter={(value: number, name: string) => [formatINR(Number(value)), name]} contentStyle={{ borderRadius: 8, borderColor: t.tooltipBorder, backgroundColor: t.tooltipBg, color: t.tooltipText }} labelStyle={{ color: t.tooltipText }} itemStyle={{ color: t.tooltipText }} />
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
