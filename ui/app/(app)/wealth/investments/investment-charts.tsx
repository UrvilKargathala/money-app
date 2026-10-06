"use client";

// Split from investments-dashboard so recharts loads in its own chunk only
// when these sections render (dynamic import, ssr: false).
import { PieChart as RePieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { formatINR, formatDate } from "@/lib/format";
import { EmptyState } from "@/components/common/empty-state";
import { PieChart as PieChartIcon, TrendingUp } from "lucide-react";
import { chartTheme, useDarkMode } from "@/lib/chart-theme";

export type Allocation = { category: string; value: number; pct: number };
export type TrendPoint = { date: string; invested: number; value: number };

export const PIE_COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899", "#14B8A6", "#F97316", "#6366F1"];

export function currencyTick(v: number): string {
  if (Math.abs(v) >= 100000) return `₹${(v / 1000).toFixed(0)}k`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${v}`;
}

export function AllocationDonut({ allocation }: { allocation: Allocation[] }) {
  const t = chartTheme(useDarkMode());
  if (allocation.length === 0) {
    return <EmptyState icon={<PieChartIcon className="h-6 w-6" />} title="No allocation data" description="Add holdings to see the breakdown." />;
  }
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RePieChart>
          <Pie data={allocation} dataKey="value" nameKey="category" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={2}>
            {allocation.map((_, idx) => (
              <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, _name: string, item: unknown) => {
              const payload = (item as { payload?: Allocation })?.payload;
              const label = payload?.category ?? String(_name);
              const pct = payload?.pct != null ? ` (${payload.pct}%)` : "";
              return [formatINR(Number(value)) + pct, label];
            }}
            contentStyle={{ borderRadius: 12, borderColor: t.tooltipBorder, backgroundColor: t.tooltipBg, color: t.tooltipText }}
            itemStyle={{ color: t.tooltipText }}
          />
          <Legend wrapperStyle={{ color: t.legendText }} />
        </RePieChart>
      </ResponsiveContainer>
      <div className="mt-2 space-y-1">
        {allocation.slice(0, 6).map((a, i) => (
          <div key={a.category} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
              {a.category}
            </span>
            <span className="font-medium">
              {formatINR(a.value)} · {a.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PortfolioTrend({ trend }: { trend: TrendPoint[] }) {
  const t = chartTheme(useDarkMode());
  if (trend.length === 0) {
    return <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="No snapshots yet" description="Price updates create trend." />;
  }
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={trend} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: t.tick }} stroke={t.tick} tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} />
          <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12, fill: t.tick }} stroke={t.tick} width={80} />
          <Tooltip
            formatter={(value: number, name: string) => [formatINR(Number(value)), name === "value" ? "Current" : "Invested"]}
            labelFormatter={(l: string) => formatDate(l)}
            labelStyle={{ color: t.tooltipText }}
            contentStyle={{ borderRadius: 12, borderColor: t.tooltipBorder, backgroundColor: t.tooltipBg, color: t.tooltipText }}
            itemStyle={{ color: t.tooltipText }}
          />
          <Legend wrapperStyle={{ color: t.legendText }} />
          <Line type="monotone" dataKey="invested" name="Invested" stroke="#94A3B8" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="value" name="Current" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
