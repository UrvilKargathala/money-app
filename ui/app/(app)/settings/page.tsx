import { getApiUser, getSettings, getBillingProfile } from "@/lib/api-client";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [user, settings, billing] = await Promise.all([getApiUser(), getSettings(), getBillingProfile()]);
  return <SettingsClient user={user} settings={settings} billing={billing as never} />;
}
