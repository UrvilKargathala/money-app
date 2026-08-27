"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Bell, Check, Trash2, RotateCcw, Search, Mail, Settings2, Archive, Radio, Eye, Loader2 } from "lucide-react";
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

function SseIndicator() {
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [latestCount, setLatestCount] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const since = new Date(Date.now() - 60_000).toISOString();
      const href = getNotificationsStreamHref(since);
      setStatus("connecting");
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

  useEffect(() => {
    poll();
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [poll]);

  return (
    <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${status === "live" ? "bg-success animate-pulse" : status === "connecting" ? "bg-warning" : "bg-neutral-300"}`} />
      <span className="font-medium flex items-center gap-1">
        <Radio className="h-3 w-3" /> SSE {status === "live" ? "live" : status === "connecting" ? "connecting" : "offline"}
      </span>
      {latestCount !== null && <span className="text-neutral-500">{latestCount} new since 1m</span>}
      {lastChecked && <span className="hidden sm:inline text-neutral-400">{new Date(lastChecked).toLocaleTimeString("en-IN")}</span>}
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={poll}>
        Refresh
      </Button>
      <a href={getNotificationsStreamHref()} target="_blank" rel="noreferrer" className="text-xs text-primary-600 underline underline-offset-2">
        stream
      </a>
    </div>
  );
}

export function NotificationsDashboard({
  notifications,
  total,
  archive: initialArchive,
  preferences: initialPrefs,
  emails: initialEmails,
}: {
  notifications: Notification[];
  total?: number;
  archive: Notification[];
  preferences: Preference[];
  emails: EmailRow[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [mainTab, setMainTab] = useState("feed");

  // bulk selection in feed
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const unreadCount = notifications.filter((n) => !n.is_read && !n.is_dismissed).length;
  const dismissedCount = notifications.filter((n) => !!n.is_dismissed).length;
  const readCount = notifications.filter((n) => n.is_read && !n.is_dismissed).length;

  const filtered = notifications.filter((n) => {
    if (activeTab === "all") return !n.is_dismissed;
    if (activeTab === "unread") return !n.is_read && !n.is_dismissed;
    if (activeTab === "read") return !!n.is_read && !n.is_dismissed;
    if (activeTab === "dismissed") return !!n.is_dismissed;
    return true;
  });

  const handleMarkRead = async (id: string) => {
    const res = await markReadAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Marked read");
      router.refresh();
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
    const res = await dismissAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Dismissed");
      router.refresh();
    }
  };
  const handleRestore = async (id: string) => {
    const res = await restoreAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Restored");
      router.refresh();
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
      toast.success(`Bulk ${action} — ${selected.size} affected`);
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
    } catch (e) {
      toast.error(String(e));
    } finally {
      setArchiveLoading(false);
    }
  }, [archiveSearch, archiveType, archivePage]);

  useEffect(() => {
    if (mainTab !== "archive") return;
    fetchArchive();
  }, [mainTab, fetchArchive]);

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
        prev.map((p) => (p.notification_type === type && p.channel === channel ? { ...p, is_enabled: !!res.is_enabled } : p))
      );
      router.refresh();
    }
    setPrefSaving(null);
  };

  const handleSaveAllPrefs = async () => {
    const payload = prefs.map((p) => ({
      notification_type: p.notification_type,
      channel: p.channel,
      is_enabled: p.is_enabled,
    }));
    const res = await updatePreferencesAction(payload);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Preferences saved");
      router.refresh();
    }
  };

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const prefLookup = (type: string, channel: string) => prefs.find((p) => p.notification_type === type && p.channel === channel)?.is_enabled ?? (channel === "in_app");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-neutral-900 flex items-center gap-3">
            Notifications {unreadCount > 0 && <Badge variant="error">{unreadCount} unread</Badge>}
            <span className="text-sm font-normal text-neutral-500">{total != null ? `${total} total` : `${notifications.length} in feed`}</span>
          </h1>
          <p className="text-sm text-neutral-500 font-body mt-1">Alerts, reminders and insights — feed, archive, preferences and delivery log</p>
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
                  <TabsTrigger value="all">All ({notifications.filter((n) => !n.is_dismissed).length})</TabsTrigger>
                  <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
                  <TabsTrigger value="read">Read ({readCount})</TabsTrigger>
                  <TabsTrigger value="dismissed">Dismissed ({dismissedCount})</TabsTrigger>
                </TabsList>
              </Tabs>
              {selected.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">{selected.size} selected</span>
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
              {filtered.map((n) => (
                <Card key={n.id} className={`p-4 flex items-start justify-between gap-3 ${!n.is_read && !n.is_dismissed ? "border-primary-200 bg-primary-50/50" : ""}`}>
                  <div className="flex gap-3 flex-1">
                    {!n.is_dismissed && (
                      <input
                        type="checkbox"
                        checked={selected.has(n.id)}
                        onChange={() => toggleSelect(n.id)}
                        className="mt-1 h-4 w-4 rounded border-neutral-300"
                        aria-label={`Select ${n.title}`}
                      />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-semibold font-heading text-neutral-900 flex items-center gap-2 flex-wrap">
                        {n.title} <Badge variant="info">{n.type}</Badge> {n.module && <Badge variant="outline">{n.module}</Badge>}{" "}
                        {!n.is_read && !n.is_dismissed && <Badge variant="error">New</Badge>}
                        {n.is_dismissed ? <Badge variant="default">Dismissed</Badge> : null}
                      </p>
                      <p className="text-sm text-neutral-600 font-body mt-1">{n.message}</p>
                      <p className="text-xs text-neutral-400 mt-1">{new Date(n.created_at).toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!n.is_read && !n.is_dismissed && (
                      <Button variant="ghost" size="icon" onClick={() => handleMarkRead(n.id)} title="Mark read">
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    {!n.is_dismissed ? (
                      <Button variant="ghost" size="icon" onClick={() => handleDismiss(n.id)} title="Dismiss">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => handleRestore(n.id)} title="Restore">
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
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
                  {NOTIFICATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
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

            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                Page {archivePage} • {archive.length} results {archiveSearch ? `for "${archiveSearch}"` : ""} {archiveType !== "all" ? `• type=${archiveType}` : ""}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={archivePage <= 1 || archiveLoading} onClick={() => setArchivePage((p) => Math.max(1, p - 1))}>
                  Prev
                </Button>
                <Button variant="outline" size="sm" disabled={archive.length < 25 || archiveLoading} onClick={() => setArchivePage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>

            {archiveLoading ? (
              <div className="flex items-center justify-center py-8 text-sm text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading archive…
              </div>
            ) : archive.length === 0 ? (
              <EmptyState icon={<Archive className="h-6 w-6" />} title="No archive results" description="Try adjusting search or type filter." />
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
                {archive.map((n) => (
                  <div key={n.id} className="rounded-lg border border-neutral-100 p-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        {n.title} <Badge variant="info">{n.type}</Badge> {n.is_dismissed ? <Badge variant="default">dismissed</Badge> : null}{" "}
                        {!n.is_read ? <Badge variant="error">unread</Badge> : <Badge variant="outline">read</Badge>}
                      </p>
                      <p className="text-sm text-neutral-600 mt-1">{n.message}</p>
                      <p className="text-xs text-neutral-400 mt-1">{new Date(n.created_at).toLocaleString("en-IN")}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!n.is_read && !n.is_dismissed && (
                        <Button variant="ghost" size="icon" onClick={() => handleMarkRead(n.id)}>
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      {!n.is_dismissed ? (
                        <Button variant="ghost" size="icon" onClick={() => handleDismiss(n.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => handleRestore(n.id)}>
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
              <CardDescription>Per-type × per-channel toggles (in_app / email). Defaults: in_app enabled, email disabled.</CardDescription>
            </CardHeader>

            <div className="overflow-auto">
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr>
                    <th className="p-3 text-left font-medium">Type</th>
                    {CHANNELS.map((ch) => (
                      <th key={ch} className="p-3 text-center font-medium">
                        {ch}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {NOTIFICATION_TYPES.map((type) => (
                    <tr key={type} className="border-t">
                      <td className="p-3 font-medium capitalize">{type}</td>
                      {CHANNELS.map((ch) => {
                        const enabled = prefLookup(type, ch);
                        const key = `${type}|${ch}`;
                        const saving = prefSaving === key;
                        return (
                          <td key={ch} className="p-3 text-center">
                            <Button
                              variant={enabled ? "default" : "outline"}
                              size="sm"
                              disabled={!!prefSaving}
                              onClick={() => handleTogglePref(type, ch)}
                              className="min-w-[80px]"
                            >
                              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null} {enabled ? "On" : "Off"}
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
              <span className="text-xs text-neutral-500 self-center">Single toggles save immediately; Save all persists current matrix via PATCH /api/notification-preferences.</span>
            </div>

            <div className="rounded-lg bg-neutral-50 p-4 space-y-3">
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
                      {NOTIFICATION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
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
                  <span className="text-xs text-neutral-500 self-center">POST /api/notifications/email/preview — no send, just render.</span>
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
                  <thead className="bg-neutral-50 text-xs text-neutral-500">
                    <tr>
                      <th className="p-2 text-left">Type</th>
                      <th className="p-2 text-left">Recipient</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-left">Sent at</th>
                      <th className="p-2 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {initialEmails.map((e) => (
                      <tr key={e.id} className="border-t text-xs">
                        <td className="p-2">
                          <Badge variant="info">{e.email_type}</Badge>
                        </td>
                        <td className="p-2 font-medium">{e.recipient}</td>
                        <td className="p-2">
                          <Badge variant={e.status === "sent" ? "success" : e.status === "failed" ? "error" : "default"}>{e.status}</Badge>
                        </td>
                        <td className="p-2 text-neutral-500">{e.sent_at ? new Date(e.sent_at).toLocaleString("en-IN") : "—"}</td>
                        <td className="p-2 text-neutral-500">{new Date(e.created_at).toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email preview — {previewResult?.subject ?? ""}</DialogTitle>
            <DialogDescription>Rendered HTML and text from POST /api/notifications/email/preview</DialogDescription>
          </DialogHeader>
          {previewResult && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-neutral-500">Subject</p>
                <p className="text-sm font-semibold">{previewResult.subject}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-500">Body HTML</p>
                <div className="rounded-lg border p-4 bg-white max-h-[30vh] overflow-auto" dangerouslySetInnerHTML={{ __html: previewResult.body_html }} />
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-500">Body Text</p>
                <pre className="rounded-lg bg-neutral-50 p-3 text-xs whitespace-pre-wrap">{previewResult.body_text}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
