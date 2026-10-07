import { redirect } from "next/navigation";
import { getApiUser, getMyPlan, getMyProfile, getNotificationsUnreadCount } from "@/lib/api-client";
import { Topbar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Toaster } from "@/components/ui/sonner";
import { MembershipProvider } from "@/components/membership";
import { SessionExpiryGuard } from "@/components/common/session-expiry-guard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, unreadRes, profileRes, planRes] = await Promise.all([getApiUser(), getNotificationsUnreadCount(), getMyProfile(), getMyPlan()]);

  if (!user) {
    redirect("/login?expired=1");
  }

  const initialUnread =
    (unreadRes as { unread_count?: number; count?: number } | null)?.unread_count ??
    (unreadRes as { count?: number } | null)?.count ??
    0;

  return (
      <div className="min-h-screen bg-sunken">
      <a href="#main-content" className="sr-only z-[100] rounded-md bg-surface px-4 py-2 text-ink-1 shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to main content</a>
      <SessionExpiryGuard />
      <Topbar userName={user.full_name} userEmail={user.email} initialUnread={initialUnread} hasAvatar={Boolean(profileRes?.profile?.avatar_url)} />
      <main id="main-content" tabIndex={-1} className="p-4 lg:p-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
        <MembershipProvider initialPlan={planRes}>{children}</MembershipProvider>
      </main>
      <BottomNav />
      <Toaster />
    </div>
  );
}
