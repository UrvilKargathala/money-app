import { getAccountsData, getCategories, getTransactionsData } from "@/lib/api-client";
import { TransactionsDashboard } from "./transactions-dashboard";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ page?: string; pageSize?: string; type?: string; q?: string }> }) {
  const params = await searchParams;
  const page = Number(params.page ?? 1) || 1;
  const pageSize = Number(params.pageSize ?? 50) || 50;

  const [txnData, accountsData, categoriesData] = await Promise.all([
    getTransactionsData(new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...(params.type ? { type: params.type } : {}), ...(params.q ? { q: params.q } : {}) })),
    getAccountsData(),
    getCategories(),
  ]);

  if (!txnData) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-heading text-neutral-900">Transactions</h1>
        <p className="text-sm text-error">Could not load transactions. Please try again.</p>
      </div>
    );
  }

  return (
    <TransactionsDashboard
      transactions={txnData.transactions as never}
      summary={txnData.summary as never}
      total={txnData.total}
      page={txnData.page}
      pageSize={txnData.pageSize}
      accounts={(accountsData?.accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
      categories={(categoriesData?.categories ?? []).map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id }))}
    />
  );
}
