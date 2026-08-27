import {
  getNotificationsData,
  getNotificationsArchive,
  getNotificationPreferences,
  getNotificationEmails,
} from "@/lib/api-client";
import { NotificationsDashboard } from "./notifications-dashboard";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const [feed, archiveRes, prefsRes, emailsRes] = await Promise.all([
    getNotificationsData(),
    getNotificationsArchive({ page: 1 }),
    getNotificationPreferences(),
    getNotificationEmails(50),
  ]);

  return (
    <NotificationsDashboard
      notifications={(feed?.notifications ?? []) as never}
      total={feed?.total ?? 0}
      archive={(archiveRes?.archive ?? []) as never}
      preferences={(prefsRes?.preferences ?? []) as never}
      emails={(emailsRes?.emails ?? []) as never}
    />
  );
}
