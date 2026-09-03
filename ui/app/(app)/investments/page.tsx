import {
  getInvestmentsData,
  getInvestmentsPortfolioSummary,
  getSipsData,
  getSipsDue,
  getDividendsData,
  getAssetAllocation,
  getPortfolioTrend,
  getMaturityAlerts,
  getPortfolioReturns,
  getBillingProfile,
} from "@/lib/api-client";
import { InvestmentsDashboard } from "./investments-dashboard";
import { Paywall, TrialBanner } from "@/components/common/paywall";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const [investmentsData, summaryData, sipsData, sipsDueData, dividendsData, allocationData, trendData, maturityData, portfolioReturnsData, billing] =
    await Promise.all([
      getInvestmentsData(),
      getInvestmentsPortfolioSummary(),
      getSipsData(),
      getSipsDue(),
      getDividendsData(),
      getAssetAllocation(),
      getPortfolioTrend(),
      getMaturityAlerts(),
      getPortfolioReturns(),
      getBillingProfile(),
    ]);

  if (billing && !billing.entitlements.investments?.allowed) {
    return (
      <div className="space-y-4">
        {billing.trial.active && <TrialBanner daysLeft={billing.trial.daysLeft} />}
        <Paywall feature="Investments (SIP/NAV)" plan={billing.plan.code} trialDaysLeft={billing.trial.daysLeft} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {billing?.trial.active && <TrialBanner daysLeft={billing.trial.daysLeft} />}
      <InvestmentsDashboard
        investments={(investmentsData?.investments ?? []) as never}
        summary={(summaryData?.summary ?? null) as never}
        sips={(sipsData?.sips ?? []) as never}
        sipsDue={(sipsDueData?.items ?? []) as never}
        dividends={(dividendsData?.dividends ?? []) as never}
        allocation={(allocationData?.allocation ?? []) as never}
        trend={(trendData?.trend ?? []) as never}
        alerts={(maturityData?.alerts ?? []) as never}
        portfolioXirr={portfolioReturnsData?.xirr_pct ?? null}
      />
    </div>
  );
}
