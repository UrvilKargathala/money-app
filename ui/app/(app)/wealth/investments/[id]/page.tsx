import { notFound } from "next/navigation";
import { apiJson } from "@/lib/api-client";
import { ResourceDetail } from "@/components/common/resource-detail";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const data = await apiJson<{ investment: Record<string, unknown>; transactions?: Record<string, unknown>[]; snapshots?: Record<string, unknown>[] }>(`/api/investments/${id}`); if (!data?.investment) notFound(); return <ResourceDetail title={String(data.investment.name || "Investment")} subtitle="Investments" backHref="/wealth/investments" record={data.investment} related={[{ title: "Activity", items: data.transactions ?? [] }, { title: "Value history", items: data.snapshots ?? [] }]} />; }
