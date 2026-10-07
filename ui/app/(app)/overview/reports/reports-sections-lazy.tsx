"use client";

import { default as nextDynamic } from "next/dynamic";
import type { ComponentProps } from "react";
import type { CashflowChart } from "./reports-cashflow-chart";
import type { SpendingDonut } from "./reports-spending-chart";
import type { TrendsChart } from "./reports-trends-chart";
import type { BudgetChart } from "./reports-budget-chart";
import type { HeatmapCard } from "./reports-heatmap";
import type { MerchantsCard } from "./reports-merchants";
import type { IncomeChart } from "./reports-income-chart";
import type { NetWorthChart } from "./reports-networth-chart";

function Skeleton() {
  return <div aria-hidden className="h-[300px] w-full animate-pulse rounded-xl bg-wash" />;
}

const opts = { ssr: false, loading: Skeleton } as const;

const LazyCashflow = nextDynamic(() => import("./reports-cashflow-chart").then((m) => m.CashflowChart), opts);
const LazySpending = nextDynamic(() => import("./reports-spending-chart").then((m) => m.SpendingDonut), opts);
const LazyTrends = nextDynamic(() => import("./reports-trends-chart").then((m) => m.TrendsChart), opts);
const LazyBudget = nextDynamic(() => import("./reports-budget-chart").then((m) => m.BudgetChart), opts);
const LazyHeatmap = nextDynamic(() => import("./reports-heatmap").then((m) => m.HeatmapCard), opts);
const LazyMerchants = nextDynamic(() => import("./reports-merchants").then((m) => m.MerchantsCard), opts);
const LazyIncome = nextDynamic(() => import("./reports-income-chart").then((m) => m.IncomeChart), opts);
const LazyNetWorth = nextDynamic(() => import("./reports-networth-chart").then((m) => m.NetWorthChart), opts);

export function CashflowChartLazy(props: ComponentProps<typeof CashflowChart>) {
  return <LazyCashflow {...props} />;
}
export function SpendingDonutLazy(props: ComponentProps<typeof SpendingDonut>) {
  return <LazySpending {...props} />;
}
export function TrendsChartLazy(props: ComponentProps<typeof TrendsChart>) {
  return <LazyTrends {...props} />;
}
export function BudgetChartLazy(props: ComponentProps<typeof BudgetChart>) {
  return <LazyBudget {...props} />;
}
export function HeatmapCardLazy(props: ComponentProps<typeof HeatmapCard>) {
  return <LazyHeatmap {...props} />;
}
export function MerchantsCardLazy(props: ComponentProps<typeof MerchantsCard>) {
  return <LazyMerchants {...props} />;
}
export function IncomeChartLazy(props: ComponentProps<typeof IncomeChart>) {
  return <LazyIncome {...props} />;
}
export function NetWorthChartLazy(props: ComponentProps<typeof NetWorthChart>) {
  return <LazyNetWorth {...props} />;
}
