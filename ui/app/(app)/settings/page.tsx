import { getApiUser, getSettings } from "@/lib/api-client";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getApiUser();
  const settings = await getSettings();
  return <SettingsClient user={user} settings={settings} />;
}
