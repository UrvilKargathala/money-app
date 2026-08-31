"use client";

import { useCallback, useEffect, useState } from "react";
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

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "upcoming">("all");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [feedRes, countRes] = await Promise.all([
        fetch("/api/notifications?limit=12", { cache: "no-store", credentials: "include" }),
        fetch("/api/notifications/unread-count", { cache: "no-store", credentials: "include" }),
      ]);
      if (feedRes.ok) {
        const data = await feedRes.json();
        setNotifications(data.notifications ?? []);
      }
      if (countRes.ok) {
        const data = await countRes.json();
        setUnread(data.unread_count ?? data.count ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "POST", credentials: "include" });
      fetchData();
    } catch {}
  };

  const handleMarkRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "POST", credentials: "include" });
      fetchData();
    } catch {}
  };

  const handleDismiss = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/dismiss`, { method: "POST", credentials: "include" });
      fetchData();
    } catch {}
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
        className="relative text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-full"
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
          <div className="absolute right-0 top-full mt-2 z-40 w-[380px] max-w-[92vw] rounded-2xl border border-neutral-200 bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold font-heading text-neutral-900">Notifications</h3>
                {unread > 0 && <Badge variant="error" className="text-xs">{unread} new</Badge>}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleMarkAllRead} disabled={unread === 0}>
                  <Check className="h-3 w-3" /> Mark all read
                </Button>
              </div>
            </div>

            <div className="flex gap-1 px-3 py-2 border-b border-neutral-100 bg-neutral-50/50">
              {(["all", "unread", "upcoming"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={cn(
                    "flex-1 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    filter === tab ? "bg-neutral-900 text-white shadow-sm" : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  )}
                >
                  {tab}
                </button>
              ))}
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetchData} disabled={loading} title="Refresh">
                <Loader2 className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
            </div>

            <div className="max-h-[380px] overflow-y-auto">
              {loading && notifications.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-sm text-neutral-500 gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                </div>
              ) : display.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="h-8 w-8 mx-auto text-neutral-300 mb-2" />
                  <p className="text-sm font-medium text-neutral-600">No notifications</p>
                  <p className="text-xs text-neutral-400 mt-1">{filter === "upcoming" ? "No upcoming reminders" : "You're all caught up"}</p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {display.map((n) => (
                    <div key={n.id} className={cn("p-3 flex gap-3 hover:bg-neutral-50 transition-colors", !n.is_read && "bg-primary-50/40")}>
                      <div className={cn("h-2 w-2 rounded-full mt-2 shrink-0", !n.is_read ? "bg-primary-600" : "bg-transparent")} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900 flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{n.title}</span>
                          <Badge variant="info" className="text-[10px] px-1 py-0 h-4">{n.type}</Badge>
                          {n.module && <span className="text-[10px] text-neutral-400">• {n.module}</span>}
                        </p>
                        <p className="text-xs text-neutral-600 mt-1 line-clamp-2">{n.message}</p>
                        <p className="text-[11px] text-neutral-400 mt-1">{new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                        {n.deep_link && (
                          <Link href={n.deep_link} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline mt-1">
                            View <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!n.is_read && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMarkRead(n.id)} title="Mark read">
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-400 hover:text-error" onClick={() => handleDismiss(n.id)} title="Dismiss">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-neutral-100 p-3 bg-neutral-50 flex items-center justify-between">
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
