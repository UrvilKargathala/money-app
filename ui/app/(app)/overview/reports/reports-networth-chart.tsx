"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { chartTheme, useDarkMode } from "@/lib/chart-theme";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { EmptyState, currencyTick, formatINR, type NetWorthPoint } from "./reports-shared";

export function NetWorthChart({ netWorthSeries }: { netWorthSeries: NetWorthPoint[] }) {
  const dark = useDarkMode();
  const t = chartTheme(dark);

  return (
    <Card>
      <CardHeader className="pb-4">
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
                <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: t.tick }} stroke={t.tick} tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} />
                <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12, fill: t.tick }} stroke={t.tick} width={80} />
                <Tooltip
                  formatter={(value: number, name: string) => (name === "net_worth" ? [formatINR(Number(value)), "Net worth"] : [value != null ? `${Number(value).toFixed(2)}%` : "-", "Change"])}
                  labelFormatter={(label: string) => new Date(label).toLocaleDateString("en-IN")}
                  contentStyle={{ borderRadius: 12, borderColor: t.tooltipBorder, backgroundColor: t.tooltipBg, color: t.tooltipText }}
                />
                    <Legend wrapperStyle={{ color: t.legendText }} />
                <Line type="monotone" dataKey="net_worth" name="Net worth" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
