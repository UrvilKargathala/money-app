"use client";
import { useEffect, useState } from "react";
import { formatINR } from "@/lib/format";
type WidgetData = { label: string; value: number }[];
export function LiveWidget({ id }: { id: string }) {
  const [data, setData] = useState<WidgetData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const urls: Record<string, string> = { "networth-sparkline": "/api/net-worth/trend", "bills-due": "/api/bills/calendar", "budget-util": `/api/budgets/overview?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`, "cashflow-mini": "/api/reports/cashflow", "top-merchants": "/api/reports/top-merchants" };
    fetch(urls[id], { signal: controller.signal }).then(async (r) => {
      if (!r.ok) throw new Error();
      const d = await r.json();
      const rows: WidgetData = id === "networth-sparkline" ? d.trend.map((p: { date: string; net_worth: number }) => ({ label: p.date, value: Number(p.net_worth) }))
        : id === "bills-due" ? d.events.filter((p: { days_until: number }) => p.days_until <= 7).map((p: { name: string; amount: number }) => ({ label: p.name, value: Number(p.amount) }))
        : id === "budget-util" ? [{ label: "Budgeted", value: Number(d.overview?.total_budgeted ?? 0) }, { label: "Spent", value: Number(d.overview?.total_spent ?? 0) }]
        : id === "cashflow-mini" ? d.cashflow.map((p: { month: string; net: number }) => ({ label: p.month, value: Number(p.net) }))
        : d.merchants.slice(0, 5).map((p: { merchant: string; total: number }) => ({ label: p.merchant, value: Number(p.total) }));
      setData(rows); setError(false);
    }).catch((e) => { if (e.name !== "AbortError") setError(true); });
    return () => controller.abort();
  }, [id]);
  if (error) return <p role="alert" className="text-sm text-neutral-500">Could not load this widget.</p>;
  if (!data) return <p role="status" className="text-sm">Loading…</p>;
  if (!data.length) return <p className="text-sm text-neutral-500">{id === "bills-due" ? "No bills due in the next seven days." : "No data yet."}</p>;
  if (id === "networth-sparkline") {
    const min = Math.min(...data.map((p) => p.value)); const max = Math.max(...data.map((p) => p.value));
    const points = data.map((p, i) => `${5 + i / Math.max(1, data.length - 1) * 290},${65 - (p.value - min) / Math.max(1, max - min) * 55}`).join(" ");
    return <div><p className="font-semibold">{formatINR(data[data.length - 1].value)}</p><svg viewBox="0 0 300 75" role="img" aria-label={`Net worth from ${formatINR(data[0].value)} to ${formatINR(data[data.length - 1].value)}`} className="mt-2 h-20 w-full"><polyline fill="none" stroke="#4f46e5" strokeWidth="3" points={points} /></svg></div>;
  }
  return <ul className="space-y-2 text-sm">{data.slice(-6).map((p, i) => <li key={`${p.label}-${i}`} className="flex justify-between gap-3"><span>{p.label}</span><span className="font-medium tabular-nums">{formatINR(p.value)}</span></li>)}</ul>;
}
