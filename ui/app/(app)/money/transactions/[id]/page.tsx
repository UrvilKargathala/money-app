import { notFound } from "next/navigation";
import { apiJson } from "@/lib/api-client";
import { ResourceDetail } from "@/components/common/resource-detail";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const data = await apiJson<{ transaction: Record<string, unknown> }>(`/api/transactions/${id}`); if (!data?.transaction) notFound(); return <ResourceDetail title={String(data.transaction.merchant_clean || data.transaction.description || "Transaction")} subtitle="Transactions" backHref="/money/transactions" record={data.transaction} />; }
