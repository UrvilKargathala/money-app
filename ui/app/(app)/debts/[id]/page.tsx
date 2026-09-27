import { notFound } from "next/navigation";
import { apiJson } from "@/lib/api-client";
import { ResourceDetail } from "@/components/common/resource-detail";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const data = await apiJson<{ debt: Record<string, unknown> }>(`/api/debts/${id}`); if (!data?.debt) notFound(); return <ResourceDetail title={String(data.debt.name || "Debt")} subtitle="Debts" backHref="/debts" record={data.debt} />; }
