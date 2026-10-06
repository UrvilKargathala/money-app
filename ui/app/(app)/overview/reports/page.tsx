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
  getSettings,
  apiJson,
} from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/common/stat-card";
import { formatINR } from "@/lib/format";
import { BarChart3, Download, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReportsChartsLazy as ReportsCharts } from "./reports-charts-lazy";
import { PremiumReports } from "@/components/premium-reports";
import { Paywall, TrialBanner } from "@/components/common/paywall";
import { ReportsManager } from "./reports-manager";

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
    templateData,
    exportData,
    settingsData,
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
    apiJson<{ templates: { id: string; user_id: number | null; name: string; description: string | null; chart_config: unknown; version?: number }[] }>("/api/report-templates"),
    apiJson<{ exports: { id: string; file_type: string; status: string; created_at: string; date_range_start?: string | null; date_range_end?: string | null }[] }>("/api/report-exports"),
    getSettings(),
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
        <h1 className="text-3xl font-bold font-heading text-ink-1">Reports</h1>
        <p className="text-sm text-ink-3 font-body mt-1">Analytics and insights</p>
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

      <PremiumReports><ReportsCharts
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
      /></PremiumReports>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Export</CardTitle>
          <CardDescription>Download reports</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <a href="/api/reports/export" download>
              <Download className="h-4 w-4" /> Download CSV
            </a>
          </Button>
          <Button variant="secondary" asChild>
            <a href="/api/reports/cashflow/export" download>
              <Download className="h-4 w-4" /> Download Cashflow CSV
            </a>
          </Button>
        </CardContent>
      </Card>
      <ReportsManager templates={templateData?.templates ?? []} exports={exportData?.exports ?? []} initialFilters={((settingsData as { report_filters?: unknown[] } | null)?.report_filters ?? []) as never} />
    </div>
  );
}
