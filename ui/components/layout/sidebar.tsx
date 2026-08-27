"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";
import { Wallet } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[280px] shrink-0 flex-col border-r border-neutral-200 bg-white lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-neutral-100 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
          <Wallet className="h-5 w-5" />
        </div>
        <span className="text-lg font-bold font-heading text-neutral-800">MoneyMind</span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.built ? item.href : "#"}
              aria-disabled={!item.built}
              onClick={(e) => {
                if (!item.built) e.preventDefault();
              }}
              className={cn(
                "flex items-center gap-3 rounded-[10px] px-4 py-2.5 text-sm font-medium transition-colors",
                isActive && item.built
                  ? "bg-primary-50 text-primary-600 font-semibold"
                  : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                !item.built && "opacity-50 cursor-not-allowed"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
              {!item.built && (
                <span className="ml-auto text-[10px] font-medium bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded">Soon</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-neutral-100 p-4">
        <p className="text-xs text-neutral-400 font-body text-center">MoneyMind v0.1.0</p>
      </div>
    </aside>
  );
}
