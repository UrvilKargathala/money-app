"use client";
import { useEffect, useState } from "react";
import { useMembership, UpgradeCard } from "./membership";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { formatINR } from "@/lib/format";
import { PanelError, PanelLoading } from "@/components/common/async-panel-state";
export function PremiumReports({ children }: { children: React.ReactNode }) {
  const { premium, loading } = useMembership();
  const [data, setData] = useState<{ forecast: { monthly_net: number; three_month_net: number } | null; method: string } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { if (!premium) return; const controller = new AbortController(); fetch("/api/reports/forecast", { signal: controller.signal }).then(async (r) => { if (!r.ok) throw new Error(); setData(await r.json()); }).catch((e) => { if (e.name !== "AbortError") setError(true); }); return () => controller.abort(); }, [premium]);
  if (loading) return <PanelLoading label="Loading reports" />;
  if (!premium) return <UpgradeCard feature="Advanced reports & forecasting" />;
  return <>{children}<Card><CardHeader><CardTitle>Cashflow forecast</CardTitle></CardHeader><CardContent className="space-y-3">{error ? <PanelError message="Could not load forecast." onRetry={() => window.location.reload()} /> : !data ? <PanelLoading label="Loading forecast" /> : <>{data.forecast && <p>Projected net: <strong>{formatINR(data.forecast.monthly_net)}/month</strong> · {formatINR(data.forecast.three_month_net)} over three months.</p>}<p className="text-sm text-neutral-500">{data.method}</p></>}</CardContent></Card></>;
}
