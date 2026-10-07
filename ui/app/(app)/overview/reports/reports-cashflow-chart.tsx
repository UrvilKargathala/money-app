"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { chartTheme, useDarkMode } from "@/lib/chart-theme";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, Line } from "recharts";
import { EmptyState, currencyTick, formatINR, type CashflowRow } from "./reports-shared";

export function CashflowChart({ cashflow }: { cashflow: CashflowRow[] }) {
  const cashflowWithNet = cashflow.map((c) => ({
    ...c,
    net: typeof c.net === "number" ? c.net : c.income - c.expense,
  }));
  const dark = useDarkMode();
  const t = chartTheme(dark);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Cashflow</CardTitle>
        <CardDescription>Monthly income vs expense - net line</CardDescription>
      </CardHeader>
      <CardContent>
        {cashflowWithNet.length === 0 ? (
          <EmptyState message="No cashflow data. Add transactions to see trends." />
        ) : (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cashflowWithNet} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: t.tick }} stroke={t.tick} />
                <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12, fill: t.tick }} stroke={t.tick} width={80} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatINR(Number(value)), name]}
                  contentStyle={{ borderRadius: 12, borderColor: t.tooltipBorder, backgroundColor: t.tooltipBg, color: t.tooltipText }}
                />
                    <Legend wrapperStyle={{ color: t.legendText }} />
                <Bar dataKey="income" name="Income" fill="#10B981" radius={[6, 6, 0, 0]} barSize={20} />
                <Bar dataKey="expense" name="Expense" fill="#EF4444" radius={[6, 6, 0, 0]} barSize={20} />
                <Line type="monotone" dataKey="net" name="Net" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
