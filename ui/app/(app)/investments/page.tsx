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
} from "@/lib/api-client";
import { InvestmentsDashboard } from "./investments-dashboard";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const [investmentsData, summaryData, sipsData, sipsDueData, dividendsData, allocationData, trendData, maturityData, portfolioReturnsData] =
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
    ]);

  return (
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
  );
}
