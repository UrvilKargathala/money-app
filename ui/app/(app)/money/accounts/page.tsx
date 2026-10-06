import { getAccountsData } from "@/lib/api-client";
import { AccountsDashboard } from "./accounts-dashboard";

export const dynamic = "force-dynamic";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ create?: string; edit?: string }> }) {
  const params = await searchParams;
  const data = await getAccountsData();

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-heading text-ink-1">Accounts</h1>
        <p className="text-sm text-error">Could not load accounts. Please check your connection and try again.</p>
      </div>
    );
  }

  return <AccountsDashboard accounts={data.accounts as never} types={data.types as never} initialCreate={params.create === "1"} initialEditId={params.edit} />;
}
