import { getAccountsData, getCategories } from "@/lib/api-client";
import { QuickAddForm } from "./quick-add-form";
import { apiJson } from "@/lib/api-client";

export const dynamic = "force-dynamic";

export default async function QuickAddPage() {
  const [accountsData, categoriesData, merchantsData] = await Promise.all([
    getAccountsData(),
    getCategories(),
    apiJson<{ merchants: { merchant: string }[] }>("/api/transactions/merchants/recent").catch(() => null),
  ]);

  const accounts = (accountsData?.accounts ?? [])
    .filter((a) => a.is_active === 1)
    .map((a) => ({ id: a.id, name: a.name }))
    .slice(0, 30);

  const categories = (categoriesData?.categories ?? []).map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id }));

  const recentMerchants: string[] = Array.isArray((merchantsData as unknown as { merchants: unknown })?.merchants)
    ? ((merchantsData as unknown as { merchants: { merchant: string }[] }).merchants || []).map((m) => m.merchant).filter(Boolean)
    : [];

  // Fallback: also try alternative shape { merchants: string[] }
  const altMerchants = (merchantsData as unknown as { merchants: string[] })?.merchants;
  const finalMerchants = recentMerchants.length > 0 ? recentMerchants : Array.isArray(altMerchants) ? altMerchants.filter((m) => typeof m === "string") : [];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold font-heading text-neutral-900">Quick Add</h1>
        <p className="text-sm text-neutral-500 font-body mt-1">Two-tap expense or income entry</p>
      </div>
      {accounts.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-neutral-500">No active accounts. Create an account first.</p>
          <a href="/accounts" className="text-primary-600 hover:underline text-sm">
            Go to Accounts
          </a>
        </div>
      ) : (
        <QuickAddForm accounts={accounts} categories={categories} recentMerchants={finalMerchants} />
      )}
    </div>
  );
}
