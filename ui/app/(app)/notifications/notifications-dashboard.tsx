"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Bell, Check, Trash2, RotateCcw, Search, Mail, Settings2, Archive, Radio, Eye, Loader2, Lock } from "lucide-react";
import {
  markReadAction,
  markAllReadAction,
  dismissAction,
  restoreAction,
  bulkAction,
  togglePreferenceAction,
  updatePreferencesAction,
  previewEmailAction,
} from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

function getNotificationsStreamHref(since?: string): string {
  if (since) return `/api/notifications/stream?since=${encodeURIComponent(since)}`;
  return "/api/notifications/stream";
}

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

type Preference = { notification_type: string; channel: string; is_enabled: boolean };
type EmailRow = { id: string; email_type: string; recipient: string; status: string; sent_at: string | null; created_at: string };

const NOTIFICATION_TYPES = ["warning", "alert", "reminder", "insight", "summary", "info"] as const;
const CHANNELS = ["in_app", "email"] as const;

function emailStatusVariant(status: string) {
  if (status === "sent") return "success";
  if (status === "failed") return "error";
  return "default";
}

function sseDotClass(status: "idle" | "checking" | "live" | "offline") {
  if (status === "live") return "bg-success";
  if (status === "checking") return "bg-warning animate-pulse";
  if (status === "offline") return "bg-neutral-300";
  return "bg-neutral-200";
}

function sseLabel(status: "idle" | "checking" | "live" | "offline") {
  if (status === "idle") return "Not checked";
  if (status === "live") return "Up to date";
  if (status === "checking") return "Checking";
  return "Offline";
}

function SseIndicator() {
  const [status, setStatus] = useState<"idle" | "checking" | "live" | "offline">("idle");
  const [latestCount, setLatestCount] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  // On-demand only — no interval. Feed mutations use router.refresh();
  // this is a manual "check for new" probe against the poll-based stream endpoint.
  const poll = useCallback(async () => {
    try {
      const since = new Date(Date.now() - 60_000).toISOString();
      const href = getNotificationsStreamHref(since);
      setStatus("checking");
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) {
        setStatus("offline");
        return;
      }
      const data = (await res.json()) as { notifications?: unknown[]; latest_server_time?: string };
      setLatestCount(Array.isArray(data.notifications) ? data.notifications.length : 0);
      setLastChecked(data.latest_server_time ?? new Date().toISOString());
      setStatus("live");
    } catch {
      setStatus("offline");
    }
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-full border border-edge bg-base px-3 py-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${sseDotClass(status)}`} />
      <span className="font-medium flex items-center gap-1">
        <Radio className="h-3 w-3" /> {sseLabel(status)}
      </span>
      {latestCount !== null && <span className="text-faint">{latestCount} new since 1m</span>}
      {lastChecked && <span className="hidden sm:inline text-faint">{new Date(lastChecked).toLocaleTimeString("en-IN")}</span>}
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={poll} disabled={status === "checking"}>
        {status === "checking" ? "Checking…" : "Check for new"}
      </Button>
    </div>
  );
}

export function NotificationsDashboard({
  notifications,
  total,
  archive: initialArchive,
  preferences: initialPrefs,
  emails: initialEmails,
  emailLocked = false,
}: {
  notifications: Notification[];
  total?: number;
  archive: Notification[];
  preferences: Preference[];
  emails: EmailRow[];
  emailLocked?: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [mainTab, setMainTab] = useState("feed");

  // bulk selection in feed
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Per-item in-flight guard (BUG-117): rapid clicks on mark-read / dismiss /
  // restore must not stack duplicate POSTs. The ref is the synchronous source
  // of truth (no stale-closure window); the state mirror drives `disabled`.
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

  // archive controls
  const [archive, setArchive] = useState<Notification[]>(initialArchive);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveType, setArchiveType] = useState<string>("all");
  const [archivePage, setArchivePage] = useState(1);
  const [archiveLoading, setArchiveLoading] = useState(false);

  // preferences local state (matrix)
  const [prefs, setPrefs] = useState<Preference[]>(initialPrefs);
  const [prefSaving, setPrefSaving] = useState<string | null>(null);

  // email preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState("info");
  const [previewTitle, setPreviewTitle] = useState("Sample Notification");
  const [previewMessage, setPreviewMessage] = useState("This is a sample notification message.");
  const [previewResult, setPreviewResult] = useState<{ subject: string; body_html: string; body_text: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const { unreadCount, dismissedCount, readCount, filtered } = useMemo(() => {
    let unread = 0;
    let dismissed = 0;
    let read = 0;
    for (const notification of notifications) {
      if (notification.is_dismissed) dismissed += 1;
      else if (!notification.is_read) unread += 1;
      else read += 1;
    }
    const visible = notifications.filter((notification) => {
      if (activeTab === "all") return !notification.is_dismissed;
      if (activeTab === "unread") return !notification.is_read && !notification.is_dismissed;
      if (activeTab === "read") return !!notification.is_read && !notification.is_dismissed;
      if (activeTab === "dismissed") return !!notification.is_dismissed;
      return true;
    });
    return { unreadCount: unread, dismissedCount: dismissed, readCount: read, filtered: visible };
  }, [notifications, activeTab]);

  const handleMarkRead = async (id: string) => {
    if (!claimPending(id)) return;
    try {
      const res = await markReadAction(id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Marked read");
        router.refresh();
      }
    } finally {
      releasePending(id);
    }
  };
  const handleMarkAll = async () => {
    const res = await markAllReadAction();
    if (res?.error) toast.error(res.error);
    else {
      toast.success("All marked read");
      router.refresh();
    }
  };
  const handleDismiss = async (id: string) => {
    if (!claimPending(id)) return;
    try {
      const res = await dismissAction(id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Dismissed");
        router.refresh();
      }
    } finally {
      releasePending(id);
    }
  };
  const handleRestore = async (id: string) => {
    if (!claimPending(id)) return;
    try {
      const res = await restoreAction(id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Restored");
        router.refresh();
      }
    } finally {
      releasePending(id);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulk = async (action: "read" | "dismiss") => {
    if (selected.size === 0) {
      toast.error("Select at least one notification");
      return;
    }
    const res = await bulkAction(Array.from(selected), action);
    if (res?.error) toast.error(res.error);
    else {
      toast.success(`Bulk ${action} - ${selected.size} affected`);
      setSelected(new Set());
      router.refresh();
    }
  };

  const fetchArchive = useCallback(async () => {
    setArchiveLoading(true);
    try {
      const qs = new URLSearchParams();
      if (archiveSearch.trim()) qs.set("search", archiveSearch.trim());
      if (archiveType !== "all") qs.set("type", archiveType);
      qs.set("page", String(archivePage));
      const res = await fetch(`/api/notifications/archive?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not fetch archive");
      setArchive(data.archive ?? []);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setArchiveLoading(false);
    }
  }, [archiveSearch, archiveType, archivePage]);

  useEffect(() => {
    if (mainTab !== "archive") return;
    fetchArchive();
  }, [mainTab, fetchArchive]);

  // Feed-tab auto-refresh: revalidate only while the user is viewing the
  // notification feed and the browser tab is visible. Any other mainTab
  // (archive / preferences / emails) or a hidden tab performs zero requests.
  useEffect(() => {
    if (mainTab !== "feed") return;
    let id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 300000);
    // bfcache-friendly: release while stored, re-arm on restore.
    const onHide = () => clearInterval(id);
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      id = setInterval(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, 300000);
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    };
  }, [mainTab, router]);

  // Keep prefs in sync if initial changes after refresh
  useEffect(() => {
    setPrefs(initialPrefs);
  }, [initialPrefs]);

  const handleTogglePref = async (type: string, channel: string) => {
    const key = `${type}|${channel}`;
    setPrefSaving(key);
    const res = await togglePreferenceAction(type, channel);
    if (res?.error) toast.error(res.error);
    else {
      toast.success(`${type} • ${channel} → ${res.is_enabled ? "on" : "off"}`);
      setPrefs((prev) =>
        prev.map((pref) => (pref.notification_type === type && pref.channel === channel ? { ...pref, is_enabled: !!res.is_enabled } : pref))
      );
      router.refresh();
    }
    setPrefSaving(null);
  };

  const handleSaveAllPrefs = async () => {
    const payload = prefs.map((pref) => ({
      notification_type: pref.notification_type,
      channel: pref.channel,
      is_enabled: pref.is_enabled,
    }));
    const res = await updatePreferencesAction(payload);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Preferences saved");
      router.refresh();
    }
  };

  const handlePreview = async (event: React.FormEvent) => {
    event.preventDefault();
    setPreviewLoading(true);
    setPreviewResult(null);
    const res = await previewEmailAction({ type: previewType, title: previewTitle, message: previewMessage });
    if (res?.error) toast.error(res.error);
    else if (res.preview) {
      setPreviewResult(res.preview);
      setPreviewOpen(true);
    }
    setPreviewLoading(false);
  };

  const prefLookup = (type: string, channel: string) => prefs.find((pref) => pref.notification_type === type && pref.channel === channel)?.is_enabled ?? (channel === "in_app");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-foreground flex items-center gap-3">
            Notifications {unreadCount > 0 && <Badge variant="error">{unreadCount} unread</Badge>}
            <span className="text-sm font-normal text-faint">{total != null ? `${total} total` : `${notifications.length} in feed`}</span>
          </h1>
          <p className="text-sm text-faint font-body mt-1">Alerts, reminders and insights - feed, archive, preferences and delivery log</p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <SseIndicator />
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleMarkAll} disabled={unreadCount === 0}>
              <Check className="h-4 w-4" /> Mark all read
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <Card className="p-2">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="feed" className="gap-1">
              <Bell className="h-4 w-4" /> Feed
            </TabsTrigger>
            <TabsTrigger value="archive" className="gap-1">
              <Archive className="h-4 w-4" /> Archive
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-1">
              <Settings2 className="h-4 w-4" /> Preferences <Badge variant="info" className="ml-1">{prefs.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="emails" className="gap-1">
              <Mail className="h-4 w-4" /> Email log <Badge variant="default" className="ml-1">{initialEmails.length}</Badge>
            </TabsTrigger>
          </TabsList>
        </Card>

        {/* FEED */}
        <TabsContent value="feed" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="all">All ({notifications.length - dismissedCount})</TabsTrigger>
                  <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
                  <TabsTrigger value="read">Read ({readCount})</TabsTrigger>
                  <TabsTrigger value="dismissed">Dismissed ({dismissedCount})</TabsTrigger>
                </TabsList>
              </Tabs>
              {selected.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-faint">{selected.size} selected</span>
                  <Button variant="outline" size="sm" onClick={() => handleBulk("read")}>
                    <Check className="h-3 w-3" /> Mark read
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleBulk("dismiss")}>
                    <Trash2 className="h-3 w-3" /> Dismiss
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {filtered.length === 0 ? (
            <EmptyState icon={<Bell className="h-6 w-6" />} title="No notifications" description="You're all caught up." />
          ) : (
            <div className="space-y-3">
              {filtered.map((notification) => (
                <Card key={notification.id} className={`p-4 flex items-start justify-between gap-3 ${!notification.is_read && !notification.is_dismissed ? "border-primary-200 bg-info-soft/50 dark:border-[#2A2A2A] dark:bg-[#1E1E1E]/40" : ""}`}>
                  <div className="flex gap-3 flex-1">
                    {!notification.is_dismissed && (
                      <input
                        type="checkbox"
                        checked={selected.has(notification.id)}
                        onChange={() => toggleSelect(notification.id)}
                        className="mt-1 h-4 w-4 rounded border-neutral-300"
                        aria-label={`Select ${notification.title}`}
                      />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-semibold font-heading text-foreground flex items-center gap-2 flex-wrap">
                        {notification.title} <Badge variant="info">{notification.type}</Badge> {notification.module && <Badge variant="outline">{notification.module}</Badge>}{" "}
                        {!notification.is_read && !notification.is_dismissed && <Badge variant="error">New</Badge>}
                        {notification.is_dismissed ? <Badge variant="default">Dismissed</Badge> : null}
                      </p>
                      <p className="text-sm text-muted-foreground font-body mt-1">{notification.message}</p>
                      <p className="text-xs text-faint mt-1">{new Date(notification.created_at).toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!notification.is_read && !notification.is_dismissed && (
                      <Button variant="ghost" size="icon" onClick={() => handleMarkRead(notification.id)} title="Mark read" aria-label={`Mark as read: ${notification.title}`} disabled={pendingIds.has(notification.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    {!notification.is_dismissed ? (
                      <Button variant="ghost" size="icon" onClick={() => handleDismiss(notification.id)} title="Dismiss" aria-label={`Dismiss: ${notification.title}`} disabled={pendingIds.has(notification.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => handleRestore(notification.id)} title="Restore" aria-label={`Restore: ${notification.title}`} disabled={pendingIds.has(notification.id)}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ARCHIVE */}
        <TabsContent value="archive" className="space-y-4 mt-4">
          <Card className="p-4 space-y-4">
            <CardHeader className="p-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Archive className="h-5 w-5" /> Archive Search
              </CardTitle>
              <CardDescription>Search including dismissed • filter by type • paginated 25 per page</CardDescription>
            </CardHeader>

            <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
                <Input
                  placeholder="Search title or message…"
                  value={archiveSearch}
                  onChange={(e) => {
                    setArchiveSearch(e.target.value);
                    setArchivePage(1);
                  }}
                  className="pl-9"
                  onKeyDown={(e) => e.key === "Enter" && fetchArchive()}
                />
              </div>
              <Select value={archiveType} onValueChange={(v) => { setArchiveType(v); setArchivePage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {NOTIFICATION_TYPES.map((notifType) => (
                    <SelectItem key={notifType} value={notifType}>
                      {notifType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button variant="outline" onClick={fetchArchive} disabled={archiveLoading}>
                  {archiveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setArchiveSearch("");
                    setArchiveType("all");
                    setArchivePage(1);
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-faint">
              <span>
                Page {archivePage} • {archive.length} results {archiveSearch ? `for "${archiveSearch}"` : ""} {archiveType !== "all" ? `• type=${archiveType}` : ""}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={archivePage <= 1 || archiveLoading} onClick={() => setArchivePage((prevPage) => Math.max(1, prevPage - 1))}>
                  Prev
                </Button>
                <Button variant="outline" size="sm" disabled={archive.length < 25 || archiveLoading} onClick={() => setArchivePage((prevPage) => prevPage + 1)}>
                  Next
                </Button>
              </div>
            </div>

            {archiveLoading ? (
              <div className="flex items-center justify-center py-8 text-sm text-faint">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading archive…
              </div>
            ) : archive.length === 0 ? (
              <EmptyState icon={<Archive className="h-6 w-6" />} title="No archive results" description="Try adjusting search or type filter." />
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
                {archive.map((archived) => (
                  <div key={archived.id} className="rounded-lg border border-edge p-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        {archived.title} <Badge variant="info">{archived.type}</Badge> {archived.is_dismissed ? <Badge variant="default">dismissed</Badge> : null}{" "}
                        {!archived.is_read ? <Badge variant="error">unread</Badge> : <Badge variant="outline">read</Badge>}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">{archived.message}</p>
                      <p className="text-xs text-faint mt-1">{new Date(archived.created_at).toLocaleString("en-IN")}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!archived.is_read && !archived.is_dismissed && (
                        <Button variant="ghost" size="icon" onClick={() => handleMarkRead(archived.id)} aria-label={`Mark as read: ${archived.title}`} disabled={pendingIds.has(archived.id)}>
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      {!archived.is_dismissed ? (
                        <Button variant="ghost" size="icon" onClick={() => handleDismiss(archived.id)} aria-label={`Dismiss: ${archived.title}`} disabled={pendingIds.has(archived.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => handleRestore(archived.id)} aria-label={`Restore: ${archived.title}`} disabled={pendingIds.has(archived.id)}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* PREFERENCES */}
        <TabsContent value="preferences" className="space-y-4 mt-4">
          <Card className="p-6 space-y-4">
            <CardHeader className="p-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-5 w-5" /> Preferences Matrix
              </CardTitle>
              <CardDescription className="flex items-center gap-2 flex-wrap">
                Per-type × per-channel toggles (in_app / email). Defaults: in_app enabled, email disabled.
                {emailLocked && <Badge variant="info" className="gap-1"><Lock className="h-3 w-3" /> Email is a paid feature</Badge>}
              </CardDescription>
            </CardHeader>

            <div className="overflow-auto">
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-deep text-xs text-faint">
                    <tr>
                      <th className="p-3 text-left font-medium">Type</th>
                      {CHANNELS.map((ch) => (
                        <th key={ch} className="p-3 text-center font-medium">
                          <span className="inline-flex items-center gap-1 justify-center">
                            {ch}
                            {ch === "email" && emailLocked && <Lock className="h-3 w-3 text-faint" />}
                          </span>
                        </th>
                      ))}
                    </tr>
                </thead>
                <tbody>
                  {NOTIFICATION_TYPES.map((type) => (
                    <tr key={type} className="border-t">
                      <td className="p-3 font-medium capitalize">{type}</td>
                      {CHANNELS.map((channel) => {
                        const enabled = prefLookup(type, channel);
                        const key = `${type}|${channel}`;
                        const saving = prefSaving === key;
                        // Locked email cells stay visible but non-interactive.
                        const locked = channel === "email" && emailLocked;
                        return (
                          <td key={channel} className="p-3 text-center">
                            <Button
                              variant={enabled ? "default" : "outline"}
                              size="sm"
                              disabled={!!prefSaving || locked}
                              onClick={() => handleTogglePref(type, channel)}
                              title={locked ? "Email notifications require a paid plan." : undefined}
                              className="min-w-[80px]"
                            >
                              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                              {locked && <Lock className="h-3 w-3" />}
                              {enabled ? "On" : "Off"}
                            </Button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSaveAllPrefs}>
                Save all ({prefs.length} cells)
              </Button>
              <span className="text-xs text-faint self-center">Single toggles save immediately; Save all persists current matrix via PATCH /api/notification-preferences.</span>
            </div>

            <div className="rounded-lg bg-deep p-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4" /> Email preview
              </p>
              <form onSubmit={handlePreview} className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={previewType} onValueChange={setPreviewType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NOTIFICATION_TYPES.map((notifType) => (
                        <SelectItem key={notifType} value={notifType}>
                          {notifType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Title</Label>
                  <Input value={previewTitle} onChange={(e) => setPreviewTitle(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Message</Label>
                  <Input value={previewMessage} onChange={(e) => setPreviewMessage(e.target.value)} required />
                </div>
                <div className="sm:col-span-3 flex gap-2">
                  <Button type="submit" size="sm" disabled={previewLoading}>
                    {previewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />} Preview email
                  </Button>
                  <span className="text-xs text-faint self-center">POST /api/notifications/email/preview - no send, just render.</span>
                </div>
              </form>
            </div>
          </Card>
        </TabsContent>

        {/* EMAILS */}
        <TabsContent value="emails" className="space-y-4 mt-4">
          <Card className="p-6 space-y-4">
            <CardHeader className="p-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-5 w-5" /> Email Log (delivery)
              </CardTitle>
              <CardDescription>{initialEmails.length} deliveries • from GET /api/notification-emails</CardDescription>
            </CardHeader>

            {initialEmails.length === 0 ? (
              <EmptyState icon={<Mail className="h-6 w-6" />} title="No emails yet" description="Email deliveries will appear here when notifications trigger email channel." />
            ) : (
              <div className="overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-deep text-xs text-faint">
                    <tr>
                      <th className="p-2 text-left">Type</th>
                      <th className="p-2 text-left">Recipient</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-left">Sent at</th>
                      <th className="p-2 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {initialEmails.map((emailRow) => (
                      <tr key={emailRow.id} className="border-t text-xs">
                        <td className="p-2">
                          <Badge variant="info">{emailRow.email_type}</Badge>
                        </td>
                        <td className="p-2 font-medium">{emailRow.recipient}</td>
                        <td className="p-2">
                          <Badge variant={emailStatusVariant(emailRow.status)}>{emailRow.status}</Badge>
                        </td>
                        <td className="p-2 text-faint">{emailRow.sent_at ? new Date(emailRow.sent_at).toLocaleString("en-IN") : "-"}</td>
                        <td className="p-2 text-faint">{new Date(emailRow.created_at).toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={previewOpen}
        onOpenChange={(v) => {
          // Release the rendered HTML string on close (refetched on preview).
          if (!v) setPreviewResult(null);
          setPreviewOpen(v);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email preview - {previewResult?.subject ?? ""}</DialogTitle>
            <DialogDescription>Rendered HTML and text from POST /api/notifications/email/preview</DialogDescription>
          </DialogHeader>
          {previewResult && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-faint">Subject</p>
                <p className="text-sm font-semibold">{previewResult.subject}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-faint">Body HTML</p>
                <div className="rounded-lg border p-4 bg-base max-h-[30vh] overflow-auto" dangerouslySetInnerHTML={{ __html: previewResult.body_html }} />
              </div>
              <div>
                <p className="text-xs font-medium text-faint">Body Text</p>
                <pre className="rounded-lg bg-deep p-3 text-xs whitespace-pre-wrap">{previewResult.body_text}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
