import {
  getDebtsData,
  getDebtsDashboard,
  getAccountsData,
  getDebtsDti,
  getDebtsHealthAlerts,
  getDebtsCombinedTimeline,
  getSettings,
} from "@/lib/api-client";
import { DebtsDashboard } from "./debts-dashboard";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const [debtsData, dashboardData, accountsData, dtiData, healthData, combinedData, settingsData] = await Promise.all([
    getDebtsData(),
    getDebtsDashboard(),
    getAccountsData(),
    getDebtsDti(),
    getDebtsHealthAlerts(),
    getDebtsCombinedTimeline(),
    getSettings(),
  ]);

  return (
    <DebtsDashboard
      debts={(debtsData?.debts ?? []) as never}
      dashboard={(dashboardData?.dashboard ?? null) as never}
      accounts={(accountsData?.accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
      dti={(dtiData ?? null) as never}
      healthAlerts={(healthData ?? null) as never}
      combinedTimeline={(combinedData ?? null) as never}
      settings={(settingsData as never) ?? null}
    />
  );
}
