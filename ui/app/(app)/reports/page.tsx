import {
  getReportsSummary,
  getReportsCashflow,
  getReportsSpendingByCategory,
  getReportsTrends,
  getReportsHeatmap,
  getReportsBudgetVsActual,
  getReportsNetWorth,
  getReportsTopMerchants,
  getReportsIncomeSources,
  getBillingProfile,
} from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/common/stat-card";
import { formatINR } from "@/lib/format";
import { BarChart3, TrendingUp, Wallet } from "lucide-react";
import ReportsCharts from "./reports-charts";
import { Paywall, TrialBanner } from "@/components/common/paywall";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [
    summaryData,
    cashflowData,
    spendingData,
    trendsData,
    heatmapData,
    budgetVsActualData,
    netWorthData,
    topMerchantsData,
    incomeSourcesData,
    billing,
  ] = await Promise.all([
    getReportsSummary(),
    getReportsCashflow(),
    getReportsSpendingByCategory(),
    getReportsTrends(6),
    getReportsHeatmap(currentYear, currentMonth),
    getReportsBudgetVsActual(currentMonth, currentYear),
    getReportsNetWorth(),
    getReportsTopMerchants(),
    getReportsIncomeSources(),
    getBillingProfile(),
  ]);

  if (billing && !billing.entitlements.reports_widgets?.allowed) {
    return (
      <div className="space-y-4">
        {billing.trial.active && <TrialBanner daysLeft={billing.trial.daysLeft} />}
        <Paywall feature="Advanced Reports & Widgets" plan={billing.plan.code} trialDaysLeft={billing.trial.daysLeft} />
      </div>
    );
  }

  const summary = summaryData?.summary;
  const cashflow = cashflowData?.cashflow ?? [];
  const spendingByCategory = spendingData?.categories ?? [];
  const trends = trendsData?.trend ?? [];
  const trendsMonths = trendsData?.months ?? 6;
  const budgetVsActual = budgetVsActualData?.budgets ?? [];
  const budgetMonth = budgetVsActualData?.month ?? currentMonth;
  const budgetYear = budgetVsActualData?.year ?? currentYear;
  const heatmapDays = heatmapData?.days ?? [];
  const heatmapYear = heatmapData?.year ?? currentYear;
  const heatmapMonth = heatmapData?.month ?? currentMonth;
  const netWorthSeries = netWorthData?.series ?? [];
  const topMerchants = topMerchantsData?.merchants ?? [];
  const incomeSources = incomeSourcesData?.sources ?? [];
  const totalIncome = incomeSourcesData?.total_income ?? 0;

  return (
    <div className="space-y-6">
      {billing?.trial.active && <TrialBanner daysLeft={billing.trial.daysLeft} />}
      <div>
        <h1 className="text-3xl font-bold font-heading text-neutral-900">Reports</h1>
        <p className="text-sm text-neutral-500 font-body mt-1">Analytics and insights</p>
      </div>

      {summary && (
        <div className="grid gap-6 md:grid-cols-3">
          <StatCard label="Income" value={formatINR(summary.income ?? 0)} icon={<Wallet className="h-5 w-5" />} variant="success" />
          <StatCard label="Expense" value={formatINR(summary.expense ?? 0)} icon={<TrendingUp className="h-5 w-5" />} variant="rose" />
          <StatCard
            label="Savings Rate"
            value={`${typeof summary.savings_rate === "number" ? summary.savings_rate.toFixed(1) : "0.0"}%`}
            icon={<BarChart3 className="h-5 w-5" />}
            variant="violet"
          />
        </div>
      )}

      <ReportsCharts
        cashflow={cashflow}
        spendingByCategory={spendingByCategory}
        trends={trends}
        trendsMonths={trendsMonths}
        budgetVsActual={budgetVsActual}
        budgetMonth={budgetMonth}
        budgetYear={budgetYear}
        heatmapDays={heatmapDays}
        heatmapYear={heatmapYear}
        heatmapMonth={heatmapMonth}
        netWorthSeries={netWorthSeries}
        topMerchants={topMerchants}
        incomeSources={incomeSources}
        totalIncome={totalIncome}
      />

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>Download reports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <a href="/api/reports/export" download className="text-sm text-primary-600 hover:underline">
            Download CSV
          </a>
          <br />
          <a href="/api/reports/cashflow/export" download className="text-sm text-primary-600 hover:underline">
            Download Cashflow CSV
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
