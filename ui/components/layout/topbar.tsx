"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Menu, Search, LogOut, User, Wallet, Command } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, STANDALONE_NAV_ITEMS } from "@/lib/nav";
import { NotificationBell } from "./notification-bell";
import { useCommandPaletteHotkey } from "@/components/common/command-palette-hotkey";
import { triggerHaptic } from "@/lib/haptics";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { AVATAR_UPDATED_EVENT, AVATAR_URL } from "@/lib/avatar";

// Mobile drawer is code-split (ssr:false): the Radix Dialog chain leaves the
// shared initial chunk and loads on first open.
const MobileNavSheet = dynamic(
  () => import("@/components/layout/mobile-nav").then((m) => m.MobileNavSheet),
  { ssr: false }
);

// Command palette is dialog-based and opens on demand — same treatment.
const CommandPalette = dynamic(
  () => import("@/components/common/command-palette").then((m) => m.CommandPalette),
  { ssr: false }
);

// Search box keeps SSR HTML (desktop instance is visible on load) but its
// client JS ships in a separate chunk.
const GlobalSearch = dynamic(
  () => import("@/components/common/global-search").then((m) => m.GlobalSearch)
);

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
  // Stable open callback: the hotkey hook subscribes once instead of
  // re-subscribing keydown on every Topbar render.
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useCommandPaletteHotkey(openPalette);

  // Idle-prefetch the split chunks: zero critical-path cost, no first-open
  // fetch delay. Each dynamic() above still owns its on-demand load.
  useEffect(() => {
    const preload = () => {
      void import("@/components/layout/mobile-nav");
      void import("@/components/common/command-palette");
      void import("@/components/common/global-search");
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preload);
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(preload, 1500);
    return () => window.clearTimeout(t);
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        router.push("/login");
      } else {
        toast.error("Could not log out. Please try again.");
      }
    } catch {
      toast.error("Could not log out. Check your connection and try again.");
    }
  };

  return (
      <header className="sticky top-0 z-40 w-full border-b border-line bg-surface">
      <div className="flex h-16 items-center justify-between gap-4 px-4 lg:px-6">
        {/* Left: logo + mobile hamburger (drawer code-split, mounts on open) */}
        <div className="flex items-center gap-3 shrink-0">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen}>
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
          {mobileOpen ? <MobileNavSheet onClose={() => setMobileOpen(false)} /> : null}

          <Link href="/overview/dashboard" className="flex items-center gap-2" aria-label="MoneyMind home">
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
                      groupActive ? "bg-ink-1 text-surface shadow-sm" : "text-ink-2 hover:bg-sunken hover:text-ink-1"
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
                          className={cn("rounded-lg", active && "bg-tint-info text-primary-600 focus:bg-tint-info focus:text-primary-600 dark:text-[#BFDBFE]")}
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
                      active ? "bg-ink-1 text-surface shadow-sm" : "text-ink-2 hover:bg-sunken hover:text-ink-1"
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
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSearchOpen((v) => !v)} aria-label="Search">
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
            aria-label="Command palette (Cmd+K)"
          >
            <Command className="h-5 w-5" />
          </Button>

          <NotificationBell initialUnread={initialUnread} />

          <div className="hidden sm:flex items-center gap-3 border-l border-line ml-1 pl-3">
            {showAvatar ? (
              <Avatar className="h-8 w-8">
                <AvatarImage src={avatarBust > 0 ? `${AVATAR_URL}?t=${avatarBust}` : AVATAR_URL} alt={userName ?? "Profile photo"} width={64} height={64} fetchPriority="high" />
                <AvatarFallback className="bg-primary-100 text-primary-600 text-xs dark:bg-[#1E1E1E] dark:text-[#BFDBFE]">
                  {(userName ?? "U").trim().slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-[#1E1E1E] dark:text-[#BFDBFE]">
                <User className="h-4 w-4" />
              </div>
            )}
            <div className="hidden lg:flex flex-col">
              <span className="text-sm font-medium font-heading text-ink-1 leading-none">{userName || "User"}</span>
              <span className="text-xs text-ink-3 leading-none mt-0.5">{userEmail || ""}</span>
            </div>
          </div>

          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout" aria-label="Log out" className="text-ink-2">
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
      {paletteOpen ? <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} /> : null}
    </header>
  );
}
