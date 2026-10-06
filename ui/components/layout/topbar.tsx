"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Menu, Search, LogOut, User, Wallet, Command } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, STANDALONE_NAV_ITEMS, NOTIFICATION_NAV_ITEM } from "@/lib/nav";
import { NotificationBell } from "./notification-bell";
import { CommandPalette, useCommandPaletteHotkey } from "@/components/common/command-palette";
import { triggerHaptic } from "@/lib/haptics";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GlobalSearch } from "@/components/common/global-search";
import { AVATAR_UPDATED_EVENT, AVATAR_URL } from "@/lib/avatar";
import { useEffect } from "react";

function isGroupActive(pathname: string, group: { items: { href: string }[] }) {
  return group.items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
}

function isItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function Topbar({ userName, userEmail, initialUnread = 0, hasAvatar = false }: { userName?: string | null; userEmail?: string | null; initialUnread?: number; hasAvatar?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Single avatar source of truth: layout seeds hasAvatar; settings uploads
  // broadcast AVATAR_UPDATED_EVENT so both surfaces swap without a reload.
  const [showAvatar, setShowAvatar] = useState(hasAvatar);
  const [avatarBust, setAvatarBust] = useState(0);
  useEffect(() => {
    setShowAvatar(hasAvatar);
  }, [hasAvatar]);
  useEffect(() => {
    const onAvatar = () => {
      setShowAvatar(true);
      setAvatarBust(Date.now());
    };
    window.addEventListener(AVATAR_UPDATED_EVENT, onAvatar);
    return () => window.removeEventListener(AVATAR_UPDATED_EVENT, onAvatar);
  }, []);
  useCommandPaletteHotkey(() => setPaletteOpen(true));

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) router.push("/login");
    } catch {}
  };

  return (
      <header className="sticky top-0 z-40 w-full border-b border-line bg-surface">
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
              <div className="flex h-16 items-center gap-2 border-b border-line px-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
                  <Wallet className="h-5 w-5" />
                </div>
                <span className="text-lg font-bold font-heading text-ink-1">MoneyMind</span>
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
                <div className="border-t border-line pt-4 space-y-1">
                  {[NOTIFICATION_NAV_ITEM, ...STANDALONE_NAV_ITEMS].map((item) => {
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

          <Link href="/overview/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
              <Wallet className="h-5 w-5" />
            </div>
            <span className="hidden sm:inline text-lg font-bold font-heading text-ink-1">MoneyMind</span>
          </Link>
        </div>

        {/* Center: pill nav (desktop only) */}
        <nav className="hidden lg:flex items-center justify-center flex-1">
          <div className="flex items-center gap-1 rounded-full bg-surface border border-line px-1.5 py-1.5 shadow-sm">
            {NAV_GROUPS.map((group) => {
              const groupActive = isGroupActive(pathname, group);
              return (
                <DropdownMenu key={group.label}>
                  <DropdownMenuTrigger
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300",
                      groupActive ? "bg-neutral-900 text-white shadow-sm dark:bg-[#F8FAFC] dark:text-[#0F172A]" : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-[#CBD5E1] dark:hover:bg-[#334155] dark:hover:text-[#F8FAFC]"
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
                      active ? "bg-neutral-900 text-white shadow-sm dark:bg-[#F8FAFC] dark:text-[#0F172A]" : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-[#CBD5E1] dark:hover:bg-[#334155] dark:hover:text-[#F8FAFC]"
                    )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Right: search, notifications, user, logout */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Desktop search */}
          <div className="hidden lg:flex items-center"><GlobalSearch /></div>

          {/* Mobile search toggle */}
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSearchOpen((v) => !v)}>
            <Search className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              triggerHaptic("light");
              setPaletteOpen(true);
            }}
            className="hidden lg:flex text-ink-3 hover:text-ink-1"
            title="Shortcuts (Cmd+K)"
          >
            <Command className="h-5 w-5" />
          </Button>

          <NotificationBell initialUnread={initialUnread} />

          <div className="hidden sm:flex items-center gap-3 border-l border-line ml-1 pl-3">
            {showAvatar ? (
              <Avatar className="h-8 w-8">
                <AvatarImage src={avatarBust > 0 ? `${AVATAR_URL}?t=${avatarBust}` : AVATAR_URL} alt={userName ?? "Profile photo"} />
                <AvatarFallback className="bg-primary-100 text-primary-600 text-xs">
                  {(userName ?? "U").trim().slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                <User className="h-4 w-4" />
              </div>
            )}
            <div className="hidden lg:flex flex-col">
              <span className="text-sm font-medium font-heading text-ink-1 leading-none">{userName || "User"}</span>
              <span className="text-xs text-ink-3 leading-none mt-0.5">{userEmail || ""}</span>
            </div>
          </div>

          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout" className="text-ink-2">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Mobile search bar */}
      {searchOpen && (
        <div className="border-t border-line px-4 py-3 lg:hidden bg-surface">
          <GlobalSearch mobile onNavigate={() => setSearchOpen(false)} />
        </div>
      )}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
