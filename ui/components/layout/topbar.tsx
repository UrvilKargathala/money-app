"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Menu, Search, LogOut, User, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, STANDALONE_NAV_ITEMS } from "@/lib/nav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

function isGroupActive(pathname: string, group: { items: { href: string }[] }) {
  return group.items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
}

function isItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function Topbar({ userName, userEmail }: { userName?: string | null; userEmail?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) router.push("/login");
    } catch {}
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-200 bg-white">
      <div className="flex h-16 items-center justify-between gap-4 px-4 lg:px-6">
        {/* Left: logo + mobile hamburger */}
        <div className="flex items-center gap-3 shrink-0">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[320px] p-0 overflow-y-auto">
              <div className="flex h-16 items-center gap-2 border-b border-neutral-100 px-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
                  <Wallet className="h-5 w-5" />
                </div>
                <span className="text-lg font-bold font-heading text-neutral-800">MoneyMind</span>
              </div>
              <nav className="p-4 space-y-6">
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
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors",
                              active ? "bg-primary-50 text-primary-600 font-semibold" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
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
                <div className="border-t border-neutral-100 pt-4 space-y-1">
                  {STANDALONE_NAV_ITEMS.map((item) => {
                    const active = isItemActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors",
                          active ? "bg-primary-50 text-primary-600 font-semibold" : "text-neutral-600 hover:bg-neutral-50"
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

          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
              <Wallet className="h-5 w-5" />
            </div>
            <span className="hidden sm:inline text-lg font-bold font-heading text-neutral-800">MoneyMind</span>
          </Link>
        </div>

        {/* Center: pill nav (desktop only) */}
        <nav className="hidden lg:flex items-center justify-center flex-1">
          <div className="flex items-center gap-1 rounded-full bg-white border border-neutral-200 px-1.5 py-1.5 shadow-sm">
            {NAV_GROUPS.map((group) => {
              const groupActive = isGroupActive(pathname, group);
              return (
                <DropdownMenu key={group.label}>
                  <DropdownMenuTrigger
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300",
                      groupActive ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                    )}
                  >
                    {group.label}
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[200px] rounded-xl p-1.5">
                    {group.items.map((item) => {
                      const active = isItemActive(pathname, item.href);
                      const Icon = item.icon;
                      return (
                        <DropdownMenuItem
                          key={item.href}
                          asChild
                          className={cn("rounded-lg", active && "bg-primary-50 text-primary-600 focus:bg-primary-50 focus:text-primary-600")}
                        >
                          <Link href={item.href} className="flex items-center gap-2.5 w-full">
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="text-sm">{item.label}</span>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}

            {/* Standalone items inside pill */}
            {STANDALONE_NAV_ITEMS.map((item) => {
              const active = isItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    active ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Right: search, user, logout */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Desktop search */}
          <div className="hidden lg:flex items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                placeholder="Search..."
                className="h-9 w-[240px] rounded-full border border-neutral-200 bg-neutral-50 pl-9 pr-4 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
              />
            </div>
          </div>

          {/* Mobile search toggle */}
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSearchOpen((v) => !v)}>
            <Search className="h-5 w-5" />
          </Button>

          <div className="hidden sm:flex items-center gap-3 border-l border-neutral-200 ml-1 pl-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600">
              <User className="h-4 w-4" />
            </div>
            <div className="hidden lg:flex flex-col">
              <span className="text-sm font-medium font-heading text-neutral-800 leading-none">{userName || "User"}</span>
              <span className="text-xs text-neutral-500 leading-none mt-0.5">{userEmail || ""}</span>
            </div>
          </div>

          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout" className="text-neutral-600">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Mobile search bar */}
      {searchOpen && (
        <div className="border-t border-neutral-100 px-4 py-3 lg:hidden bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              autoFocus
              placeholder="Search transactions, notes, bills..."
              className="h-10 w-full rounded-full border border-neutral-200 bg-neutral-50 pl-9 pr-4 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
            />
          </div>
        </div>
      )}
    </header>
  );
}
