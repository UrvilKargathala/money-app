import { getCalendarEvents, getCalendarUpcoming, getCalendarTaxDeadlines, getCalendarCashflowProjection } from "@/lib/api-client";
import { CalendarDashboard } from "./calendar-dashboard";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; year?: string }> }) {
  const params = await searchParams;
  const now = new Date();
  const rawMonth = Number(params.month ?? now.getMonth() + 1);
  const rawYear = Number(params.year ?? now.getFullYear());
  const month = Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : now.getMonth() + 1;
  const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100 ? rawYear : now.getFullYear();

  const [monthData, upcomingData, taxData, cashflowData] = await Promise.all([
    getCalendarEvents(month, year),
    getCalendarUpcoming(30),
    getCalendarTaxDeadlines(year),
    getCalendarCashflowProjection(30),
  ]);

  return (
    <CalendarDashboard
      events={(monthData?.events ?? []) as never}
      dayCounts={(monthData?.day_counts ?? {}) as never}
      month={monthData?.month ?? month}
      year={monthData?.year ?? year}
      upcoming={(upcomingData ?? null) as never}
      taxDeadlines={(taxData ?? null) as never}
      cashflow={(cashflowData ?? null) as never}
    />
  );
}
