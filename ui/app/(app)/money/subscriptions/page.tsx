import { getSubscriptionsData, getSubscriptionsMonthlyBurn, getAccountsData, getCategories, getSubscriptionAudits } from "@/lib/api-client";
import { SubscriptionsDashboard } from "./subscriptions-dashboard";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const [subsData, burnData, accountsData, categoriesData, auditsData] = await Promise.all([
    getSubscriptionsData(),
    getSubscriptionsMonthlyBurn(),
    getAccountsData(),
    getCategories(),
    getSubscriptionAudits(),
  ]);

  return (
    <SubscriptionsDashboard
      subscriptions={(subsData?.subscriptions ?? []) as never}
      monthlyBurn={burnData?.monthly_burn ?? 0}
      accounts={(accountsData?.accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
      categories={(categoriesData?.categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
      audits={(auditsData?.audits ?? null) as never}
    />
  );
}
