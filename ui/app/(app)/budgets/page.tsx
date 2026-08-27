import { getBudgetsData, getBudgetOverview, getCategories } from "@/lib/api-client";
import { BudgetsDashboard } from "./budgets-dashboard";

export const dynamic = "force-dynamic";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const month = Number(params.month ?? now.getMonth() + 1);
  const year = Number(params.year ?? now.getFullYear());

  const [budgetsData, overviewData, categoriesData] = await Promise.all([
    getBudgetsData(month, year),
    getBudgetOverview(month, year),
    getCategories(),
  ]);

  return (
    <BudgetsDashboard
      budgets={(budgetsData?.budgets ?? []) as never}
      overview={(overviewData?.overview ?? null) as never}
      categories={(categoriesData?.categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
      month={month}
      year={year}
    />
  );
}
