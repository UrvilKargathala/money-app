import { redirect } from "next/navigation";
import { getApiUser } from "@/lib/api-client";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Toaster } from "@/components/ui/sonner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getApiUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header userName={user.full_name} userEmail={user.email} />
        <main className="flex-1 p-4 lg:p-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
          {children}
        </main>
      </div>
      <BottomNav />
      <Toaster />
    </div>
  );
}
