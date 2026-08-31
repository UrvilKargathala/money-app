import { redirect } from "next/navigation";
import { getApiUser } from "@/lib/api-client";
import { Topbar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Toaster } from "@/components/ui/sonner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getApiUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Topbar userName={user.full_name} userEmail={user.email} />
      <main className="p-4 lg:p-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
        {children}
      </main>
      <BottomNav />
      <Toaster />
    </div>
  );
}
