import { redirect } from "next/navigation";
import { getApiUser, getNotificationsUnreadCount } from "@/lib/api-client";
import { Topbar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Toaster } from "@/components/ui/sonner";
import { MembershipProvider } from "@/components/membership";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, unreadRes] = await Promise.all([getApiUser(), getNotificationsUnreadCount()]);

  if (!user) {
    redirect("/login");
  }

  const initialUnread =
    (unreadRes as { unread_count?: number; count?: number } | null)?.unread_count ??
    (unreadRes as { count?: number } | null)?.count ??
    0;

  return (
    <div className="min-h-screen bg-neutral-50">
      <Topbar userName={user.full_name} userEmail={user.email} initialUnread={initialUnread} />
      <main className="p-4 lg:p-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
        <MembershipProvider>{children}</MembershipProvider>
      </main>
      <BottomNav />
      <Toaster />
    </div>
  );
}
