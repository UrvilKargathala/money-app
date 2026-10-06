"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Download, User, Bell, Palette, Shield, KeyRound, Monitor, Trash2, Upload, SlidersHorizontal, Zap, Fingerprint, History, ShieldAlert, Mail, RefreshCw, TrendingUp, PieChart, Eye, EyeOff, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { triggerHaptic, setHapticsEnabledCache } from "@/lib/haptics";
import { CommandPalette } from "@/components/common/command-palette";
import { Toggle } from "@/components/ui/toggle";
import { AVATAR_UPDATED_EVENT, AVATAR_URL } from "@/lib/avatar";

const PREF_GROUPS: { type: string; label: string; description: string }[] = [
  { type: "warning", label: "Warnings", description: "Overdue bills, low balances and things needing action." },
  { type: "alert", label: "Alerts", description: "Price changes, duplicates and important findings." },
  { type: "reminder", label: "Reminders", description: "Upcoming renewals, due bills and scheduled events." },
  { type: "insight", label: "Insights", description: "Spending patterns and saving opportunities." },
  { type: "summary", label: "Summaries", description: "Periodic digests of your money." },
  { type: "info", label: "Informational", description: "Product updates and general notices." },
];
import { ConfirmDialog, useConfirm } from "@/components/common/confirm-dialog";
import { useMembership } from "@/components/membership";
import { WIDGETS } from "@/lib/widgets";
import Link from "next/link";

const exportModules = [
  { label: "Accounts", href: "/api/accounts/export", icon: "Accounts" },
  { label: "Transactions", href: "/api/transactions/export", icon: "Transactions" },
  { label: "Budgets", href: "/api/budgets/export", icon: "Budgets" },
  { label: "Bills", href: "/api/bills/export", icon: "Bills" },
  { label: "Subscriptions", href: "/api/subscriptions/export", icon: "Subscriptions" },
  { label: "Goals", href: "/api/goals/export", icon: "Goals" },
  { label: "Debts", href: "/api/debts/export", icon: "Debts" },
  { label: "Tax Investments", href: "/api/tax/exports/investments", icon: "Tax" },
  { label: "Investments", href: "/api/investments/export", icon: "Investments" },
  { label: "Manual Assets", href: "/api/manual-assets/export", icon: "Assets" },
  { label: "Notes", href: "/api/notes/export", icon: "Notes" },
];

type SessionRow = { id: number; token_id?: number; created_at: string; last_active?: string; ip_address?: string | null; user_agent?: string | null; is_current?: boolean };
type AuditRow = { id: string | number; action: string; ip_address?: string | null; created_at: string };

export function SettingsClient({ user, settings, billing }: { user: { full_name: string | null; email: string } | null; settings?: unknown; billing?: { plan: { code: string; name: string }; status: string; source: string; trial: { active: boolean; daysLeft: number }; price: { amountInr: number; perText: string }; entitlements: Record<string, unknown>; locks: Record<string, unknown> } | null }) {
  const { premium, loading: planLoading } = useMembership();
  const [prefs, setPrefs] = useState<{ type: string; channel: string; enabled: number }[] | null>(null);

  async function savePref(type: string, channel: string, enabled: boolean) {
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences: [{ notification_type: type, channel, is_enabled: enabled }] }),
      });
      if (!res.ok) throw new Error();
      setPrefs((current) => current?.map((row) => row.type === type && row.channel === channel ? { ...row, enabled: enabled ? 1 : 0 } : row) ?? null);
    } catch {
      toast.error("Could not save notification preference");
    }
  }
  const [profile, setProfile] = useState<{ full_name: string | null; email: string; bio?: string | null; avatar_url?: string | null } | null>(null);
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [bio, setBio] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [revoking, setRevoking] = useState<number | null>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [gdprLoading, setGdprLoading] = useState(false);

  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [showControlCenter, setShowControlCenter] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [savingHaptics, setSavingHaptics] = useState(false);
  const initialSettings = (settings ?? {}) as { currency?: string; theme?: string };
  const [theme, setTheme] = useState(initialSettings.theme ?? "light");
  const [currency, setCurrency] = useState(initialSettings.currency ?? "INR");
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY");
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [emailDelivery, setEmailDelivery] = useState<{ configured: boolean; sender_configured: boolean } | null>(null);
  const [widgetLayout, setWidgetLayout] = useState<string[]>(WIDGETS.map((widget) => widget.id));

  useEffect(() => {
    fetch("/api/notification-preferences")
      .then((r) => r.json())
      .then((d) => setPrefs(Array.isArray(d.preferences) ? d.preferences.map((p: { notification_type: string; channel: string; is_enabled: boolean }) => ({ type: p.notification_type, channel: p.channel, enabled: p.is_enabled ? 1 : 0 })) : null))
      .catch(() => {});
    fetch("/api/users/me/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.profile) {
          setProfile(d.profile);
          setFullName(d.profile.full_name ?? user?.full_name ?? "");
          setBio(d.profile.bio ?? "");
        }
      })
      .catch(() => {});
    fetch("/api/users/me/sessions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSessions(d?.sessions ?? null))
      .catch(() => setSessions([]));
    fetch("/api/users/me/audit-logs?limit=12")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAuditLogs(d?.logs ?? []))
      .catch(() => setAuditLogs([]));
    fetch("/api/auth/email-delivery-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setEmailDelivery(data))
      .catch(() => setEmailDelivery(null));
    // personalization settings
    fetch("/api/users/me/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const s = d?.settings ?? d ?? {};
        if (s.haptics_enabled !== undefined) setHapticsEnabled(!!Number(s.haptics_enabled));
        if (s.currency) setCurrency(s.currency);
        if (s.theme) setTheme(s.theme);
        if (Array.isArray(s.widget_layout) && s.widget_layout.length) setWidgetLayout(s.widget_layout.map(String));
        // initialize haptics cache
        setHapticsEnabledCache(!!Number(s.haptics_enabled ?? 1));
      })
      .catch(() => {});
  }, [user?.full_name]);

  useEffect(() => {
    const stored = window.localStorage.getItem("moneymind-date-format");
    if (stored) setDateFormat(stored);
  }, []);

  useEffect(() => {
    const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }, [theme]);

  async function saveAppearance(nextTheme = theme, nextCurrency = currency, nextDateFormat = dateFormat) {
    const res = await fetch("/api/users/me/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ theme: nextTheme, currency: nextCurrency, widget_layout: widgetLayout }) });
    if (!res.ok) return toast.error("Could not save appearance settings.");
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    window.localStorage.setItem("moneymind-theme", nextTheme);
    window.localStorage.setItem("moneymind-currency", nextCurrency);
    window.localStorage.setItem("moneymind-date-format", nextDateFormat);
    toast.success("Display preferences saved.");
  }

  const [confirmState, askConfirm, closeConfirm] = useConfirm();

  function handlePermanentDelete() {
    askConfirm({
      title: "Permanently delete this account?",
      description: "Only available after the 30-day deactivation period. Everything is destroyed and cannot be undone.",
      confirmLabel: "Delete forever",
      onConfirm: async () => {
        const res = await fetch("/api/users/me", { method: "DELETE" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { toast.error(body.error ?? "Permanent deletion is not available yet."); return; }
        window.location.href = "/login?account=deleted";
      },
    });
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/users/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ full_name: fullName || null, bio: bio || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || j.fieldErrors?.full_name || "Could not save profile.");
        return;
      }
      toast.success("Profile updated.");
      setProfile((p) => (p ? { ...p, full_name: fullName, bio } : p));
    } catch {
      toast.error("Could not save profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    // Frontend-first: never hit the API until every local constraint passes.
    if (newPw.length < 8 || !/[a-zA-Z]/.test(newPw) || !/\d/.test(newPw)) {
      setPwError("At least 8 characters, including a letter and a digit.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("Passwords do not match.");
      return;
    }
    if (newPw === currentPw) {
      setPwError("New password must be different from the current password.");
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwError(j.error || j.fieldErrors?.new_password || "Could not change password.");
        return;
      }
      setPwSuccess(true);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      toast.success("Password changed.");
    } catch {
      setPwError("Something went wrong.");
    } finally {
      setPwLoading(false);
    }
  }

  async function handleRevoke(id: number) {
    setRevoking(id);
    try {
      const res = await fetch(`/api/users/me/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not revoke session.");
        return;
      }
      setSessions((s) => (s ? s.filter((x) => (x.id ?? x.token_id) !== id) : s));
      toast.success("Session revoked.");
    } finally {
      setRevoking(null);
    }
  }

  const [avatarBust, setAvatarBust] = useState(0);

  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are accepted.");
      e.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Avatar must be 2MB or smaller.");
      e.target.value = "";
      return;
    }
    setAvatarUploading(true);
    try {
      const res = await fetch("/api/users/me/avatar", {
        method: "POST",
        headers: { "content-type": file.type || "image/png" },
        body: file,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error || "Could not upload avatar.");
        return;
      }
      toast.success("Avatar updated.");
      // Same source of truth as the navbar: bust caches, mark the profile,
      // and broadcast so the topbar swaps without a reload.
      const bust = Date.now();
      setAvatarBust(bust);
      setProfile((p) => (p ? { ...p, avatar_url: "set" } : p));
      window.dispatchEvent(new CustomEvent(AVATAR_UPDATED_EVENT));
    } catch {
      toast.error("Could not upload avatar.");
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  }

  function handleDeactivate() {
    askConfirm({
      title: "Deactivate your account?",
      description: "Data is kept 30 days before purge. You can restore within that window.",
      confirmLabel: "Deactivate",
      onConfirm: async () => {
        setGdprLoading(true);
        try {
          const res = await fetch("/api/users/me/deactivate", { method: "POST" });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast.error(j.error || "Could not deactivate.");
            return;
          }
          toast.success(j.message || "Account deactivated.");
        } finally {
          setGdprLoading(false);
        }
      },
    });
  }

  async function handleRestore() {
    setGdprLoading(true);
    try {
      const res = await fetch("/api/users/me/restore", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error || "No deactivated account to restore.");
        return;
      }
      toast.success("Account restored.");
    } finally {
      setGdprLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-heading text-neutral-900">Settings</h1>
        <p className="text-sm text-neutral-500 font-body mt-1">Manage your account, security, notifications, and data.</p>
      </div>

      <Card className="border-indigo-200 bg-gradient-to-br from-white to-indigo-50/40">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p>
                <span className={`inline-block rounded-lg px-3 py-1.5 text-xl font-bold font-heading ${planLoading ? "bg-neutral-100 text-neutral-400" : premium ? "bg-success-light text-success-dark" : "bg-neutral-100 text-neutral-900"}`}>
                  {planLoading ? "Checking..." : premium ? "Premium active" : "Starter plan"}
                </span>
              </p>
              <p className="text-sm text-neutral-500">{planLoading ? "Loading access status." : premium ? "All features are unlocked during early access." : "Core money tools are available — premium capabilities open to explore."}</p>
            </div>
            <Button asChild className="w-fit shrink-0 bg-indigo-600 hover:bg-indigo-700">
              <Link href="/pricing">Manage plan</Link>
            </Button>
          </div>
          <div className="space-y-1.5 border-t border-indigo-100 pt-3">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Included in your plan</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { icon: ShieldAlert, label: "Subscription audits" },
                { icon: Download, label: "Export center" },
                { icon: Mail, label: "Email notifications" },
                { icon: RefreshCw, label: "Cross-device sync" },
                { icon: TrendingUp, label: "Investments + SIPs" },
                { icon: PieChart, label: "Advanced reports" },
              ].map((f) => (
                <Badge key={f.label} variant="secondary" className="gap-1.5 px-3 py-1.5 text-[13px]">
                  <f.icon className="h-3.5 w-3.5" /> {f.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" /> Profile
          </CardTitle>
          <CardDescription>Your account information - edit name/bio and avatar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4 pb-1">
            <Avatar className="h-20 w-20 ring-2 ring-primary-100 ring-offset-2">
              {profile?.avatar_url ? <AvatarImage src={avatarBust > 0 ? `${AVATAR_URL}?t=${avatarBust}` : AVATAR_URL} alt="Profile photo" /> : null}
              <AvatarFallback className="text-lg">{(profile?.full_name ?? user?.full_name ?? user?.email ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="space-y-1.5">
              <Label htmlFor="avatar" className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                <Upload className="h-4 w-4" /> {avatarUploading ? "Uploading..." : "Upload photo"}
              </Label>
              <input id="avatar" type="file" accept="image/*" className="hidden" onChange={handleAvatar} disabled={avatarUploading} />
              <p className="text-xs text-neutral-400">PNG/JPG/WebP up to 2MB. Re-uploading replaces the previous photo.</p>
            </div>
          </div>
          <div className="grid gap-4">
            <div className="space-y-1">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bio">Bio</Label>
              <Input id="bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short bio" />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Email</span>
              <span className="font-medium">{profile?.email ?? user?.email ?? "-"}</span>
            </div>
            <Button onClick={handleSaveProfile} disabled={savingProfile} size="sm" className="w-fit">
              {savingProfile ? "Saving..." : "Save profile"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Change password
          </CardTitle>
          <CardDescription>Update your password (requires current password)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-5">
            {pwError && (
              <Alert variant="destructive">
                <AlertDescription>{pwError}</AlertDescription>
              </Alert>
            )}
            {pwSuccess && (
              <Alert variant="success">
                <AlertDescription>Password changed successfully.</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1">
              <Label htmlFor="current_password">Current password</Label>
              <div className="relative">
                <Input id="current_password" type={showCurrentPw ? "text" : "password"} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required className="pr-10" />
                <button type="button" aria-label={showCurrentPw ? "Hide current password" : "Show current password"} onClick={() => setShowCurrentPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
                  {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new_password">New password</Label>
              <div className="relative">
                <Input id="new_password" type={showNewPw ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)} required className="pr-10" />
                <button type="button" aria-label={showNewPw ? "Hide new password" : "Show new password"} onClick={() => setShowNewPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-neutral-400">At least 8 characters, letter + digit.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm_password">Confirm new password</Label>
              <div className="relative">
                <Input id="confirm_password" type={showConfirmPw ? "text" : "password"} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required className="pr-10" />
                <button type="button" aria-label={showConfirmPw ? "Hide password confirmation" : "Show password confirmation"} onClick={() => setShowConfirmPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
                  {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPw.length > 0 && confirmPw.length > 0 ? (
                newPw === confirmPw ? (
                  <p className="flex items-center gap-1 text-xs text-success-dark"><Check className="h-3 w-3" /> Passwords match</p>
                ) : (
                  <p className="text-xs text-error-dark">Passwords don&apos;t match</p>
                )
              ) : null}
            </div>
            <Button type="submit" disabled={pwLoading || (newPw.length > 0 && confirmPw.length > 0 && newPw !== confirmPw)} size="sm">
              {pwLoading ? "Updating..." : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dashboard widgets</CardTitle><CardDescription>Choose the order shown on your dashboard.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {widgetLayout.map((id, index) => {
            const widget = WIDGETS.find((item) => item.id === id);
            if (!widget) return null;
            return <div key={id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span>{widget.label}</span><div className="flex gap-1"><Button size="sm" variant="ghost" disabled={index === 0} onClick={() => setWidgetLayout((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })} aria-label={`Move ${widget.label} up`}>↑</Button><Button size="sm" variant="ghost" disabled={index === widgetLayout.length - 1} onClick={() => setWidgetLayout((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })} aria-label={`Move ${widget.label} down`}>↓</Button></div></div>;
          })}
          <Button size="sm" onClick={() => saveAppearance()}>Save widget order</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" /> Active sessions
          </CardTitle>
          <CardDescription>{premium ? "Multi-device access enabled. Revoke sessions you do not recognize." : "Starter supports one active session. Signing in again replaces the previous session."}</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions === null ? (
            <p className="text-sm text-neutral-500">Loading sessions...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-neutral-500">No active sessions found.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-auto">
              {sessions.map((s) => {
                const id = s.id ?? s.token_id ?? 0;
                return (
                  <div key={String(id)} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.user_agent || "Unknown device"} {s.is_current ? <Badge variant="success" className="ml-2">Current</Badge> : null}</p>
                      <p className="text-xs text-neutral-500">
                        {s.ip_address ? `${s.ip_address} • ` : ""}{s.created_at ? new Date(s.created_at).toLocaleString() : ""}
                      </p>
                    </div>
                    {!s.is_current && (
                      <Button variant="outline" size="sm" onClick={() => handleRevoke(Number(id))} disabled={revoking === Number(id)}>
                        <Trash2 className="h-3 w-3" /> {revoking === Number(id) ? "Revoking..." : "Revoke"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" /> Appearance
          </CardTitle>
          <CardDescription>Theme and display</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label htmlFor="theme">Theme</Label><select id="theme" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={theme} onChange={e=>setTheme(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></div>
            <div><Label htmlFor="currency">Currency</Label><select id="currency" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={currency} onChange={e=>setCurrency(e.target.value)}><option value="INR">INR — Indian Rupee</option><option value="USD">USD — US Dollar</option><option value="EUR">EUR — Euro</option><option value="GBP">GBP — Pound Sterling</option></select></div>
            <div><Label htmlFor="date-format">Date format</Label><select id="date-format" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={dateFormat} onChange={e=>setDateFormat(e.target.value)}><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></div>
          </div>
          <Button size="sm" onClick={()=>saveAppearance()}>Save display preferences</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5"/>Account security history</CardTitle><CardDescription>Recent sign-ins and security actions on your account.</CardDescription></CardHeader>
        <CardContent className="divide-y">{auditLogs.length===0&&<p className="text-sm text-neutral-500">No recent security events.</p>}{auditLogs.map(log=><div key={String(log.id)} className="flex items-center justify-between gap-4 py-3 text-sm"><div><p className="font-medium capitalize">{log.action.replaceAll("_"," ")}</p><p className="text-xs text-neutral-500">{log.ip_address||"IP unavailable"}</p></div><time className="text-xs text-neutral-500">{new Date(log.created_at).toLocaleString()}</time></div>)}</CardContent>
      </Card>

      {billing && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Billing — {billing.plan.name} ({billing.plan.code})</CardTitle>
            <CardDescription>
              Status: {billing.status} • Source: {billing.source} {billing.trial.active ? `• Trial ${billing.trial.daysLeft}d left` : ""} • Price: ₹{billing.price.amountInr} {billing.price.perText}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-neutral-500">Free: 2 accounts, 2 budgets/month, 5 reminders, 3 subs, 1 goal, no investments/debts/tax/reports. Paid unlocks all + batch export, email notifications, sync.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={async () => { const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "monthly" }) }); const j = await r.json().catch(() => ({})); if (j.url) window.location.href = j.url; else toast.error(j.error || "Checkout unavailable"); }}>Monthly ₹300</Button>
              <Button size="sm" variant="secondary" onClick={async () => { const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "annual" }) }); const j = await r.json().catch(() => ({})); if (j.url) window.location.href = j.url; else toast.error(j.error || "Checkout unavailable"); }}>Annual ₹2400</Button>
              <Button size="sm" variant="outline" onClick={async () => { const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "lifetime" }) }); const j = await r.json().catch(() => ({})); if (j.url) window.location.href = j.url; else toast.error(j.error || "Checkout unavailable"); }}>Lifetime ₹3500</Button>
              <Button size="sm" variant="ghost" onClick={async () => { const r = await fetch("/api/billing/cancel", { method: "POST" }); const j = await r.json().catch(() => ({})); if (r.ok) toast.success("Will cancel at period end."); else toast.error(j.error || "Cancel failed"); }}>Cancel at period end</Button>
            </div>
            {billing.source === "free" && !billing.trial.active && <p className="text-xs text-amber-700">Free plan: only 2 newest accounts/budgets are editable, others read-only. Single device at a time.</p>}
            {billing.trial.active && <p className="text-xs text-teal-700">Trial: full access for {billing.trial.daysLeft} days, then reverts to Free. On downgrade, extra rows become read-only.</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Personalization</CardTitle>
          <CardDescription>Control center, shortcuts, and haptic feedback</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 hover:bg-neutral-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-800 text-white">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold font-heading text-neutral-900">Control center</p>
                <p className="text-xs text-neutral-500">Quick toggles for app preferences</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => { triggerHaptic("light"); setShowControlCenter(true); }}>
              Open
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 hover:bg-neutral-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-amber-400">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold font-heading text-neutral-900 flex items-center gap-2">
                  Shortcuts <Badge className="bg-teal-900 text-teal-400 border-0 text-xs">Recommended</Badge>
                </p>
                <p className="text-xs text-neutral-500">Cmd+K palette with app actions</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => { triggerHaptic("light"); setShowShortcuts(true); }}>
              View
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-800 text-white">
                <Fingerprint className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold font-heading text-neutral-900">Haptic feedback</p>
                <p className="text-xs text-neutral-500">Tap feedback and success/error pulses</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={hapticsEnabled ? "success" : "default"}>{hapticsEnabled ? "On" : "Off"}</Badge>
              <Button
                variant={hapticsEnabled ? "default" : "outline"}
                size="sm"
                disabled={savingHaptics}
                onClick={async () => {
                  const next = !hapticsEnabled;
                  setSavingHaptics(true);
                  try {
                    const res = await fetch("/api/users/me/settings", {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ haptics_enabled: next ? 1 : 0 }),
                    });
                    if (!res.ok) throw new Error("Failed");
                    setHapticsEnabled(next);
                    setHapticsEnabledCache(next);
                    triggerHaptic(next ? "success" : "light");
                    toast.success(`Haptics ${next ? "enabled" : "disabled"}`);
                  } catch {
                    toast.error("Could not update haptics");
                  } finally {
                    setSavingHaptics(false);
                  }
                }}
              >
                {savingHaptics ? "..." : hapticsEnabled ? "Disable" : "Enable"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => triggerHaptic("medium")} title="Test vibration">
                Test
              </Button>
            </div>
          </div>

          <p className="text-sm text-neutral-500">Customize everyday controls without exposing developer-only settings.</p>
        </CardContent>
      </Card>

      {showControlCenter && (
        <Card className="p-6 border-dashed">
          <h3 className="font-semibold font-heading flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> Control Center</h3>
          <p className="text-sm text-neutral-500 mt-1">Quick toggles - same as Appearance & Notifications but in one place.</p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Dark mode</span><Badge variant={theme === "dark" ? "success" : "default"}>{theme === "dark" ? "On" : "Off"}</Badge></div>
            <div className="flex items-center justify-between"><span>Notifications</span><Badge variant="default">Use Notification Preferences</Badge></div>
            <div className="flex items-center justify-between"><span>Haptics</span><Badge variant={hapticsEnabled ? "success" : "default"}>{hapticsEnabled ? "On" : "Off"}</Badge></div>
          </div>
          <Button size="sm" className="mt-3" onClick={() => setShowControlCenter(false)}>Close</Button>
        </Card>
      )}
      <CommandPalette open={showShortcuts} onOpenChange={setShowShortcuts} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" /> Notification Preferences
          </CardTitle>
          <CardDescription>Toggle per type/channel</CardDescription>
        </CardHeader>
        <CardContent>
          {emailDelivery && <div className={`mb-4 rounded-xl border p-3 text-sm ${emailDelivery.configured ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}><p className="font-medium">Email delivery {emailDelivery.configured ? "is configured" : "needs production configuration"}</p><p className="mt-1 text-xs">{emailDelivery.configured ? (emailDelivery.sender_configured ? "The API key and sender address are ready." : "Delivery is enabled; add a verified sender address before launch.") : "Local links are written to the server log. Add RESEND_API_KEY and a verified RESEND_FROM_EMAIL before deployment."}</p></div>}
          {prefs ? (
            <div className="space-y-5">
              {PREF_GROUPS.filter((g) => prefs.some((p) => p.type === g.type)).map((g) => (
                <div key={g.type} className="space-y-2">
                  <div>
                    <p className="text-sm font-semibold font-heading text-neutral-900">{g.label}</p>
                    <p className="text-xs text-neutral-500">{g.description}</p>
                  </div>
                  {(["in_app", "email"] as const).map((channel) => {
                    const row = prefs.find((p) => p.type === g.type && p.channel === channel);
                    if (!row) return null;
                    const locked = channel === "email" && !premium;
                    return (
                      <div key={channel} className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-neutral-800">{channel === "in_app" ? "In-app" : "Email"}</span>
                          {locked ? <Badge variant="default" className="text-[10px]">Premium</Badge> : null}
                        </div>
                        <Toggle
                          checked={locked ? false : !!row.enabled}
                          disabled={planLoading || locked}
                          aria-label={`${g.label} via ${channel === "in_app" ? "in-app" : "email"}`}
                          title={locked ? "Upgrade to enable email alerts" : undefined}
                          onCheckedChange={(enabled) => void savePref(g.type, channel, enabled)}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Loading preferences...</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" /> Data Export
          </CardTitle>
          <CardDescription>Download module CSV files or open the full export center</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center gap-2">
            <Button asChild size="sm">
              <a href={premium ? "/planning/export" : "/pricing"}>{premium ? "Open Export Center" : "Unlock Export Center"}</a>
            </Button>
            <span className="text-xs text-neutral-500">Create jobs (CSV/PDF), track progress, download files</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {exportModules.map((m) => (
              <Button key={m.href} variant="outline" size="sm" asChild>
                <a href={m.href} download>
                  <Download className="h-4 w-4" /> {m.label}
                </a>
              </Button>
            ))}
          </div>
          <p className="text-xs text-neutral-400 mt-3">Files are named MoneyMind_*.csv with UTF-8 BOM. Per-module quick exports stay here; batched jobs moved to /export.</p>
          <Button variant="outline" size="sm" asChild className="mt-2">
            <a href="/api/users/me/data-copy" download>
              <Download className="h-4 w-4" /> Full GDPR JSON export (/api/users/me/data-copy)
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Data & Privacy
          </CardTitle>
          <CardDescription>Deactivate your account or restore it during the grace period</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Button variant="destructive" onClick={handleDeactivate} disabled={gdprLoading}>
              {gdprLoading ? "Processing..." : "Deactivate account"}
            </Button>
            <Button variant="outline" onClick={handleRestore} disabled={gdprLoading}>
              Restore account
            </Button>
            <Button variant="destructive" onClick={handlePermanentDelete} disabled={gdprLoading}>Permanently delete</Button>
          </div>
          <p className="text-xs text-neutral-500">Deactivate keeps your data recoverable for 30 days. Permanent deletion becomes available after that grace period and cannot be undone.</p>
        </CardContent>
      </Card>
      <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} />
      </div>
    </div>
  );
}
