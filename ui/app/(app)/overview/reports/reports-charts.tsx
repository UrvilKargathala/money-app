import type { ReportsChartsProps } from "./reports-shared";
import {
  BudgetChartLazy,
  CashflowChartLazy,
  HeatmapCardLazy,
  IncomeChartLazy,
  MerchantsCardLazy,
  NetWorthChartLazy,
  SpendingDonutLazy,
  TrendsChartLazy,
} from "./reports-sections-lazy";

/**
 * Server composition shell: layout + grids only. Every chart below is its
 * own ssr:false lazy chunk (see reports-sections-lazy), so a reports viewer
 * downloads each visualization independently. Section order and spacing are
 * byte-identical to the old monolith.
 */
export default function ReportsCharts({
  cashflow,
  spendingByCategory,
  trends,
  trendsMonths,
  budgetVsActual,
  budgetMonth,
  budgetYear,
  heatmapDays,
  heatmapYear,
  heatmapMonth,
  netWorthSeries,
  topMerchants,
  incomeSources,
  totalIncome,
}: ReportsChartsProps) {
  return (
    <div className="space-y-6">
      <CashflowChartLazy cashflow={cashflow} />

      <div className="grid gap-6 lg:grid-cols-2">
        <SpendingDonutLazy spendingByCategory={spendingByCategory} />
        <TrendsChartLazy trends={trends} trendsMonths={trendsMonths} />
      </div>

      <BudgetChartLazy budgetVsActual={budgetVsActual} budgetMonth={budgetMonth} budgetYear={budgetYear} />

      <div className="grid gap-6 lg:grid-cols-2">
        <HeatmapCardLazy heatmapDays={heatmapDays} heatmapYear={heatmapYear} heatmapMonth={heatmapMonth} />
        <MerchantsCardLazy topMerchants={topMerchants} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <IncomeChartLazy incomeSources={incomeSources} totalIncome={totalIncome} />
        <NetWorthChartLazy netWorthSeries={netWorthSeries} />
      </div>
    </div>
  );
}
