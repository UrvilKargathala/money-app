"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { chartTheme, useDarkMode } from "@/lib/chart-theme";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { EmptyState, currencyTick, formatINR, type TrendRow } from "./reports-shared";

export function TrendsChart({ trends, trendsMonths }: { trends: TrendRow[]; trendsMonths: number }) {
  const dark = useDarkMode();
  const t = chartTheme(dark);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Trends - last {trendsMonths} months</CardTitle>
        <CardDescription>Cumulative spend vs monthly spend</CardDescription>
      </CardHeader>
      <CardContent>
        {trends.length === 0 ? (
          <EmptyState message="No trend data yet." />
        ) : (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: t.tick }} stroke={t.tick} />
                <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12, fill: t.tick }} stroke={t.tick} width={80} />
                <Tooltip
                  // eslint-disable-next-line
                  formatter={(value: unknown, name: unknown) => [formatINR(Number(value as number)), String(name)]}
                  contentStyle={{ borderRadius: 12, borderColor: t.tooltipBorder, backgroundColor: t.tooltipBg, color: t.tooltipText }}
                />
                    <Legend wrapperStyle={{ color: t.legendText }} />
                <Line type="monotone" dataKey="month_spend" name="Month spend" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="cumulative_spend" name="Cumulative" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
