import { getApiUser } from "@/lib/api-client";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getApiUser();
  return <SettingsClient user={user} />;
}
