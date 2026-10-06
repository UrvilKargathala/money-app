"use client";

import { default as nextDynamic } from "next/dynamic";
import type { ComponentProps } from "react";
import type ReportsCharts from "./reports-charts";

function Skeleton() {
  return <div aria-hidden className="h-[300px] w-full animate-pulse rounded-xl bg-neutral-100" />;
}

const LazyCharts = nextDynamic(() => import("./reports-charts"), {
  ssr: false,
  loading: Skeleton,
});

export function ReportsChartsLazy(props: ComponentProps<typeof ReportsCharts>) {
  return <LazyCharts {...props} />;
}
