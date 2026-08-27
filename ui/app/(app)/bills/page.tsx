import { getBillsData, getBillsOverview, getAccountsData, getCategories, getBillsCalendar, getBillsUpcoming, getBillsCashflowProjection, getBillsCashflowWaterfall, suggestRecurringBillsApi } from "@/lib/api-client";
import { BillsDashboard } from "./bills-dashboard";

export const dynamic = "force-dynamic";

export default async function BillsPage() {
  const [billsData, overviewData, accountsData, categoriesData, calendarData, upcomingData, cashflowData, waterfallData, suggestionsData] = await Promise.all([
    getBillsData(),
    getBillsOverview(),
    getAccountsData(),
    getCategories(),
    getBillsCalendar(),
    getBillsUpcoming(),
    getBillsCashflowProjection(),
    getBillsCashflowWaterfall(),
    suggestRecurringBillsApi(),
  ]);

  return (
    <BillsDashboard
      bills={(billsData?.bills ?? []) as never}
      overview={(overviewData?.overview ?? null) as never}
      accounts={(accountsData?.accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
      categories={(categoriesData?.categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
      calendar={(calendarData as never) ?? null}
      upcoming={(upcomingData as never) ?? null}
      cashflowProjection={(cashflowData as never) ?? null}
      cashflowWaterfall={(waterfallData as never) ?? null}
      suggestions={(suggestionsData as never) ?? null}
    />
  );
}
