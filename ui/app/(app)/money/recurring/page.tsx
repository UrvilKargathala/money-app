import { apiJson, getAccountsData, getCategories } from "@/lib/api-client";
import { RecurringDashboard } from "./recurring-dashboard";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  const [data, accountsData, categoriesData] = await Promise.all([
    apiJson<{ templates: unknown[] }>("/api/recurring-transactions"),
    getAccountsData(),
    getCategories(),
  ]);
  return <RecurringDashboard templates={(data?.templates ?? []) as never} accounts={(accountsData?.accounts ?? []).map((item) => ({ id: item.id, name: item.name }))} categories={(categoriesData?.categories ?? []).map((item) => ({ id: item.id, name: item.name }))} />;
}
