"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, Search, Bell, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";

export function Header({ userName, userEmail }: { userName?: string | null; userEmail?: string | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) router.push("/login");
    } catch {}
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-4 lg:px-8">
      <div className="flex items-center gap-4">
        {/* Mobile hamburger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0">
            <div className="flex h-16 items-center gap-2 border-b border-neutral-100 px-6">
              <span className="text-lg font-bold font-heading text-neutral-800">MoneyMind</span>
            </div>
            <nav className="space-y-1 p-4">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.built ? item.href : "#"}
                    onClick={() => {
                      if (item.built) setOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-[10px] px-4 py-2.5 text-sm font-medium transition-colors",
                      isActive && item.built
                        ? "bg-primary-50 text-primary-600 font-semibold"
                        : "text-neutral-600 hover:bg-neutral-50",
                      !item.built && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                    {!item.built && (
                      <span className="ml-auto text-[10px] bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded">Soon</span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Search placeholder */}
        <div className="hidden items-center gap-2 lg:flex">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              placeholder="Search transactions, notes, bills..."
              className="h-9 w-[320px] rounded-[10px] border border-neutral-200 bg-neutral-50 pl-9 pr-4 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/notifications">
            <Bell className="h-5 w-5" />
          </Link>
        </Button>

        <div className="hidden items-center gap-3 border-l border-neutral-200 pl-4 lg:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600">
            <User className="h-4 w-4" />
          </div>
          <div className="hidden flex-col lg:flex">
            <span className="text-sm font-medium font-heading text-neutral-800 leading-none">
              {userName || "User"}
            </span>
            <span className="text-xs text-neutral-500">{userEmail || ""}</span>
          </div>
        </div>

        <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
