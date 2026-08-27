"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOTTOM_NAV_ITEMS } from "@/lib/nav";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-[5rem] items-center justify-around border-t border-neutral-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {BOTTOM_NAV_ITEMS.slice(0, 2).map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors min-w-[60px]",
              isActive ? "text-primary-600" : "text-neutral-500"
            )}
          >
            <Icon className={cn("h-5 w-5", isActive && "text-primary-600")} />
            <span>{item.label}</span>
          </Link>
        );
      })}

      {/* FAB */}
      <Link
        href="/add"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg hover:bg-primary-700 transition-colors -mt-4"
      >
        <Plus className="h-6 w-6" />
      </Link>

      {BOTTOM_NAV_ITEMS.slice(2).map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors min-w-[60px]",
              isActive ? "text-primary-600" : "text-neutral-500"
            )}
          >
            <Icon className={cn("h-5 w-5", isActive && "text-primary-600")} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
