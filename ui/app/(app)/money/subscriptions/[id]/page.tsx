import { notFound } from "next/navigation";
import { apiJson } from "@/lib/api-client";
import { ResourceDetail } from "@/components/common/resource-detail";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const data = await apiJson<{ subscription: Record<string, unknown> }>(`/api/subscriptions/${id}`); if (!data?.subscription) notFound(); return <ResourceDetail title={String(data.subscription.service_name || "Subscription")} subtitle="Subscriptions" backHref="/money/subscriptions" record={data.subscription} />; }
