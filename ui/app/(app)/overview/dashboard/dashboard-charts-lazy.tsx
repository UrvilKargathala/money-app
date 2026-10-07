"use client";

import { default as nextDynamic } from "next/dynamic";
import type { ComponentProps } from "react";
import type { CashflowTrendCard as CashflowCard } from "./dashboard-cashflow-chart";
import type { SpendingBreakdownCard as SpendingCard } from "./dashboard-spending-chart";

function Skeleton() {
  return <div aria-hidden className="h-[300px] w-full animate-pulse rounded-xl bg-wash" />;
}

const LazyCashflow = nextDynamic(() => import("./dashboard-cashflow-chart").then((m) => m.CashflowTrendCard), {
  ssr: false,
  loading: Skeleton,
});

const LazySpending = nextDynamic(() => import("./dashboard-spending-chart").then((m) => m.SpendingBreakdownCard), {
  ssr: false,
  loading: Skeleton,
});

export function CashflowTrendCardLazy(props: ComponentProps<typeof CashflowCard>) {
  return <LazyCashflow {...props} />;
}

export function SpendingBreakdownCardLazy(props: ComponentProps<typeof SpendingCard>) {
  return <LazySpending {...props} />;
}
