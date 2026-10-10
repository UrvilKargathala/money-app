"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, STANDALONE_NAV_ITEMS, NOTIFICATION_NAV_ITEM } from "@/lib/nav";
import { Sheet, SheetContent } from "@/components/ui/sheet";

function isItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

// Mobile nav drawer, code-split from Topbar (ssr:false, mounted only when
// opened) so the Radix Dialog chain leaves the shared initial chunk.
export function MobileNavSheet({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="left" className="w-[320px] p-0 overflow-y-auto">
        <div className="flex h-16 items-center gap-2 border-b border-line px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
            <Wallet className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold font-heading text-ink-1">MoneyMind</span>
        </div>
        <nav className="p-4 space-y-6" aria-label="Mobile">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2 mb-2 text-[11px] font-semibold tracking-widest text-neutral-400 uppercase">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isItemActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors",
                        active ? "bg-tint-info text-primary-600 font-semibold dark:text-[#BFDBFE]" : "text-ink-2 hover:bg-sunken hover:text-ink-1"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="border-t border-line pt-4 space-y-1">
            {[NOTIFICATION_NAV_ITEM, ...STANDALONE_NAV_ITEMS].map((item) => {
              const active = isItemActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors",
                        active ? "bg-tint-info text-primary-600 font-semibold dark:text-[#BFDBFE]" : "text-ink-2 hover:bg-sunken"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
