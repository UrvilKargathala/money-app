import { apiJson } from "@/lib/api-client";
import { SharedGroupsDashboard, type SharedGroup } from "./shared-groups-dashboard";

export const dynamic = "force-dynamic";

export default async function SharedGroupsPage() {
  const data = await apiJson<{ groups: SharedGroup[] }>("/api/shared-groups");
  return <SharedGroupsDashboard initialGroups={data?.groups ?? []} />;
}
