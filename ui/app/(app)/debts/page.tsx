import {
  getDebtsData,
  getDebtsDashboard,
  getAccountsData,
  getDebtsDti,
  getDebtsHealthAlerts,
  getDebtsCombinedTimeline,
  getSettings,
  getBillingProfile,
} from "@/lib/api-client";
import { DebtsDashboard } from "./debts-dashboard";
import { Paywall, TrialBanner } from "@/components/common/paywall";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const [debtsData, dashboardData, accountsData, dtiData, healthData, combinedData, settingsData, billing] = await Promise.all([
    getDebtsData(),
    getDebtsDashboard(),
    getAccountsData(),
    getDebtsDti(),
    getDebtsHealthAlerts(),
    getDebtsCombinedTimeline(),
    getSettings(),
    getBillingProfile(),
  ]);

  if (billing && !billing.entitlements.debts?.allowed) {
    return (
      <div className="space-y-4">
        {billing.trial.active && <TrialBanner daysLeft={billing.trial.daysLeft} />}
        <Paywall feature="Debt Payoff Planner" plan={billing.plan.code} trialDaysLeft={billing.trial.daysLeft} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {billing?.trial.active && <TrialBanner daysLeft={billing.trial.daysLeft} />}
      <DebtsDashboard
        debts={(debtsData?.debts ?? []) as never}
        dashboard={(dashboardData?.dashboard ?? null) as never}
        accounts={(accountsData?.accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
        dti={(dtiData ?? null) as never}
        healthAlerts={(healthData ?? null) as never}
        combinedTimeline={(combinedData ?? null) as never}
        settings={(settingsData as never) ?? null}
      />
    </div>
  );
}
