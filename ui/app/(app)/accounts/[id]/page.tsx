import { notFound } from "next/navigation";
import { apiJson, getTransactionsData } from "@/lib/api-client";
import { AccountDetail } from "./account-detail";

export const dynamic = "force-dynamic";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, history, credit, transactions] = await Promise.all([
    apiJson<{ account: Record<string, unknown>; txn_count: number }>(`/api/accounts/${id}`),
    apiJson<{ points: { date: string; balance: number }[] }>(`/api/accounts/${id}/history?range=1Y`),
    apiJson<{ credit_limit: number | null; current_balance: number; utilization_pct: number | null }>(`/api/accounts/${id}/credit-utilization`).catch(() => null),
    getTransactionsData(new URLSearchParams({ account_id: id, pageSize: "20" })),
  ]);
  if (!detail?.account) notFound();
  return <AccountDetail id={id} account={detail.account as never} txnCount={detail.txn_count} points={history?.points ?? []} credit={credit} transactions={(transactions?.transactions ?? []) as never} />;
}
