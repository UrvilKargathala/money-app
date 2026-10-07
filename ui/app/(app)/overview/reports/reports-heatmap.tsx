"use client";

import type { ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useDarkMode } from "@/lib/chart-theme";
import { EmptyState, currencyTick, formatINR, type HeatmapDay } from "./reports-shared";

export function HeatmapCard({ heatmapDays, heatmapYear, heatmapMonth }: { heatmapDays: HeatmapDay[]; heatmapYear: number; heatmapMonth: number }) {
  const maxHeat = Math.max(0, ...heatmapDays.map((d) => d.total));
  const monthName = new Date(heatmapYear, heatmapMonth - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const daysInMonth = new Date(heatmapYear, heatmapMonth, 0).getDate();
  const heatmapMap = new Map<string, number>(heatmapDays.map((d) => [d.date, d.total]));
  const dark = useDarkMode();

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Spending Heatmap - {monthName}</CardTitle>
        <CardDescription>Daily expense intensity</CardDescription>
      </CardHeader>
      <CardContent>
        {heatmapDays.length === 0 ? (
          <EmptyState message="No spending heatmap data for this month." />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1.5">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-[11px] text-center font-medium text-ink-3 py-1">
                  {d}
                </div>
              ))}
              {(() => {
                const firstWeekday = new Date(heatmapYear, heatmapMonth - 1, 1).getDay();
                const cells: ReactNode[] = [];
                for (let i = 0; i < firstWeekday; i++) {
                  cells.push(<div key={`pad-${i}`} className="h-9 rounded-md bg-sunken" />);
                }
                for (let day = 1; day <= daysInMonth; day++) {
                  const iso = `${heatmapYear}-${String(heatmapMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const total = heatmapMap.get(iso) ?? 0;
                  const intensity = maxHeat > 0 && total > 0 ? Math.min(1, 0.2 + (total / maxHeat) * 0.8) : 0;
                  const bg = total > 0 ? `rgba(37, 99, 235, ${intensity})` : dark ? "#1E1E1E" : "#F8FAFC";
                  const textColor = intensity > 0.55 ? "#FFFFFF" : dark ? "#B9C7DE" : "#334155";
                  cells.push(
                    <div
                      key={iso}
                      className="h-9 rounded-md border border-line flex flex-col items-center justify-center text-[11px] font-medium"
                      style={{ backgroundColor: bg, color: textColor }}
                      title={total > 0 ? `${iso}: ${formatINR(total)}` : `${iso}: no spend`}
                    >
                      <span>{day}</span>
                      {total > 0 && <span className="text-[10px] leading-none">{currencyTick(total)}</span>}
                    </div>
                  );
                }
                return cells;
              })()}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-ink-3">
              <span>Less</span>
              <div className="flex gap-1">
                {[0.15, 0.35, 0.6, 0.9].map((o) => (
                  <div key={o} className="h-3 w-6 rounded-sm border border-line" style={{ backgroundColor: `rgba(37,99,235,${o})` }} />
                ))}
              </div>
              <span>More</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
