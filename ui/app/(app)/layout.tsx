import { redirect } from "next/navigation";
import { getApiUser } from "@/lib/api-client";
import { Topbar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Toaster } from "@/components/ui/sonner";
import { MembershipProvider } from "@/components/membership";
import { SessionExpiryGuard } from "@/components/common/session-expiry-guard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getApiUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <a href="#main-content" className="sr-only z-[100] rounded-md bg-white px-4 py-2 text-neutral-900 shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to main content</a>
      <SessionExpiryGuard />
      <Topbar userName={user.full_name} userEmail={user.email} />
      <main id="main-content" tabIndex={-1} className="p-4 lg:p-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
        <MembershipProvider>{children}</MembershipProvider>
      </main>
      <BottomNav />
      <Toaster />
    </div>
  );
}
