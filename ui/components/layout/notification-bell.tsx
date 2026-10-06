"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  title: string;
  message: string;
  type: string;
  module?: string;
  priority?: string;
  is_read: number;
  is_dismissed?: number;
  created_at: string;
  deep_link?: string | null;
};

export function NotificationBell({ initialUnread = 0 }: { initialUnread?: number }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState<number>(initialUnread);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "upcoming">("all");

  // Keep badge in sync if the server-seeded value changes (e.g. layout revalidates).
  useEffect(() => {
    setUnread(initialUnread);
  }, [initialUnread]);

  // Single combined request: feed + unread_count (backend returns both).
  // Called only when the panel opens or on manual refresh — never in background.
  const fetchFeed = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications?limit=12", { cache: "no-store", credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        if (typeof data.unread_count === "number") {
          setUnread(data.unread_count);
        } else if (typeof data.count === "number") {
          setUnread(data.count);
        }
        setHasLoaded(true);
      }
    } catch {
      // silent — panel shows cached data / empty state
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch feed only when the panel opens (cache reuse on reopen).
  // Idle browsing performs zero notification requests.
  useEffect(() => {
    if (open && !hasLoaded) fetchFeed();
  }, [open, hasLoaded, fetchFeed]);

  // Per-item in-flight guard (BUG-117): rapid clicks must not stack
  // duplicate POSTs. Ref is the synchronous source of truth; state mirrors
  // it for `disabled`. The "all" key guards mark-all-read.
  const pendingRef = useRef<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const claimPending = useCallback((id: string): boolean => {
    if (pendingRef.current.has(id)) return false;
    pendingRef.current.add(id);
    setPendingIds(new Set(pendingRef.current));
    return true;
  }, []);
  const releasePending = useCallback((id: string): void => {
    pendingRef.current.delete(id);
    setPendingIds(new Set(pendingRef.current));
  }, []);

  const handleMarkAllRead = async () => {
    if (!claimPending("all")) return;
    const prev = notifications;
    const prevUnread = unread;
    setNotifications((list) => list.map((n) => ({ ...n, is_read: 1 })));
    setUnread(0);
    try {
      const res = await fetch("/api/notifications/read-all", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("failed");
    } catch {
      setNotifications(prev);
      setUnread(prevUnread);
    } finally {
      releasePending("all");
    }
  };

  const handleMarkRead = async (id: string) => {
    if (!claimPending(id)) return;
    const prev = notifications;
    const prevUnread = unread;
    const target = prev.find((n) => n.id === id);
    if (target && !target.is_read) setUnread((u) => Math.max(0, u - 1));
    setNotifications((list) => list.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("failed");
    } catch {
      setNotifications(prev);
      setUnread(prevUnread);
    } finally {
      releasePending(id);
    }
  };

  const handleDismiss = async (id: string) => {
    if (!claimPending(id)) return;
    const prev = notifications;
    const prevUnread = unread;
    const target = prev.find((n) => n.id === id);
    if (target && !target.is_read && !target.is_dismissed) setUnread((u) => Math.max(0, u - 1));
    setNotifications((list) => list.map((n) => (n.id === id ? { ...n, is_dismissed: 1 } : n)));
    try {
      const res = await fetch(`/api/notifications/${id}/dismiss`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("failed");
    } catch {
      setNotifications(prev);
      setUnread(prevUnread);
    } finally {
      releasePending(id);
    }
  };

  const filtered = notifications.filter((n) => {
    if (n.is_dismissed) return false;
    if (filter === "unread") return !n.is_read;
    if (filter === "upcoming") return n.type === "reminder" || n.type === "alert" || n.module === "bills" || n.module === "subscription";
    return true;
  });

  // upcoming is subset; if upcoming filter yields 0, show all upcoming-like
  const display = filter === "upcoming" && filtered.length === 0
    ? notifications.filter((n) => !n.is_dismissed).slice(0, 8)
    : filtered.slice(0, 10);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        className="relative text-ink-2 hover:text-ink-1 hover:bg-wash rounded-full"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-error text-[11px] font-bold text-white px-1 border-2 border-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full mt-2 z-40 w-[380px] max-w-[92vw] rounded-2xl border border-line bg-surface shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold font-heading text-ink-1">Notifications</h3>
                {unread > 0 && <Badge variant="error" className="text-xs">{unread} new</Badge>}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleMarkAllRead} disabled={unread === 0 || pendingIds.has("all")}>
                  <Check className="h-3 w-3" /> Mark all read
                </Button>
              </div>
            </div>

            <div className="flex gap-1 px-3 py-2 border-b border-line bg-sunken/50">
              {(["all", "unread", "upcoming"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={cn(
                    "flex-1 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    filter === tab ? "bg-neutral-900 text-white shadow-sm dark:bg-[#F8FAFC] dark:text-[#0F172A]" : "bg-surface border border-line text-ink-2 hover:bg-sunken"
                  )}
                >
                  {tab}
                </button>
              ))}
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetchFeed} disabled={loading} title="Refresh">
                <Loader2 className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
            </div>

            <div className="max-h-[380px] overflow-y-auto">
              {loading && !hasLoaded ? (
                <div className="flex items-center justify-center py-10 text-sm text-ink-3 gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                </div>
              ) : display.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="h-8 w-8 mx-auto text-neutral-300 mb-2" />
                  <p className="text-sm font-medium text-ink-2">No notifications</p>
                  <p className="text-xs text-neutral-400 mt-1">{filter === "upcoming" ? "No upcoming reminders" : "You're all caught up"}</p>
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {display.map((n) => (
                    <div key={n.id} className={cn("p-3 flex gap-3 hover:bg-sunken transition-colors", !n.is_read && "bg-primary-50/40 dark:bg-[#1E3A5F]/40")}>
                      <div className={cn("h-2 w-2 rounded-full mt-2 shrink-0", !n.is_read ? "bg-primary-600" : "bg-transparent")} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-1 flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{n.title}</span>
                          <Badge variant="info" className="text-[10px] px-1 py-0 h-4">{n.type}</Badge>
                          {n.module && <span className="text-[10px] text-neutral-400">• {n.module}</span>}
                        </p>
                        <p className="text-xs text-ink-2 mt-1 line-clamp-2">{n.message}</p>
                        <p className="text-[11px] text-neutral-400 mt-1">{new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                        {n.deep_link && (
                          <Link href={n.deep_link} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline mt-1">
                            View <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!n.is_read && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMarkRead(n.id)} title="Mark read" disabled={pendingIds.has(n.id)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-400 hover:text-error" onClick={() => handleDismiss(n.id)} title="Dismiss" disabled={pendingIds.has(n.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-line p-3 bg-sunken flex items-center justify-between">
              <Link href="/notifications" onClick={() => setOpen(false)} className="text-sm font-medium text-primary-600 hover:underline">
                View all notifications
              </Link>
              <span className="text-xs text-neutral-400">{notifications.length} total</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
