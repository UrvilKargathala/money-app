import { notFound } from "next/navigation";
import { apiJson } from "@/lib/api-client";
import { ResourceDetail } from "@/components/common/resource-detail";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const data = await apiJson<{ bill: Record<string, unknown> }>(`/api/bills/${id}`); if (!data?.bill) notFound(); return <ResourceDetail title={String(data.bill.name || "Bill")} subtitle="Bills" backHref="/money/bills" record={data.bill} />; }
