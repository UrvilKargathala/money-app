import { formatINR } from "@/lib/format";

/** Shared bits for the per-chart report sections. Split out of reports-charts.tsx so each chart file is its own lazy chunk. Formatting values below are byte-identical to the monolith - do not "unify" with dashboard/investment variants (different suffix rules). */

export const PIE_COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#0EA5E9", "#A855F7"];

export function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-ink-3 py-8 text-center">{message}</p>;
}

export type CashflowRow = { month: string; income: number; expense: number; net?: number };
export type CategorySlice = { category_id: string | null; category: string; total: number; count: number; pct: number };
export type TrendRow = { month: string; cumulative_spend: number; month_spend: number };
export type BudgetRow = { name: string; category_id: string | null; budgeted: number; actual: number; utilization_pct: number; over_budget: boolean };
export type HeatmapDay = { date: string; total: number };
export type MerchantRow = { merchant: string; total: number; txn_count: number; avg_amount: number; recurring: number };
export type NetWorthPoint = { date: string; net_worth: number; change_pct: number | null };
export type IncomeSource = { category_id: string | null; category: string; total: number; count: number; pct: number };

export function currencyTick(value: number): string {
  if (Math.abs(value) >= 100000) return `₹${(value / 1000).toFixed(0)}k`;
  if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
  return `₹${value}`;
}

export { formatINR };
