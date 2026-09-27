import { notFound } from "next/navigation";
import { apiJson } from "@/lib/api-client";
import { ResourceDetail } from "@/components/common/resource-detail";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const data = await apiJson<{ goal: Record<string, unknown> }>(`/api/goals/${id}`); if (!data?.goal) notFound(); return <ResourceDetail title={String(data.goal.name || "Goal")} subtitle="Goals" backHref="/goals" record={data.goal} />; }
