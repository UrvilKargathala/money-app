"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Download, User, Bell, Palette, Shield, KeyRound, Monitor, Trash2, Upload } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

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

export function SettingsClient({ user, settings }: { user: { full_name: string | null; email: string } | null; settings: unknown }) {
  const [prefs, setPrefs] = useState<{ type: string; channel: string; enabled: number }[] | null>(null);
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
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [gdprLoading, setGdprLoading] = useState(false);

  useEffect(() => {
    fetch("/api/notification-preferences")
      .then((r) => r.json())
      .then((d) => setPrefs(d.preferences || d || null))
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
  }, [user?.full_name]);

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
    if (newPw.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("Passwords do not match.");
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

  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Avatar must be 2MB or smaller.");
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
      setProfile((p) => (p ? { ...p, avatar_url: j.avatar_url ?? p.avatar_url } : p));
    } catch {
      toast.error("Could not upload avatar.");
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  }

  async function handleDeactivate() {
    if (!confirm("Deactivate your account? Data will be kept 30 days before purge. You can restore within that window.")) return;
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
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold font-heading text-neutral-900">Settings</h1>
        <p className="text-sm text-neutral-500 font-body mt-1">Manage your account and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" /> Profile
          </CardTitle>
          <CardDescription>Your account information — edit name/bio and avatar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="Avatar" /> : null}
              <AvatarFallback>{(profile?.full_name ?? user?.full_name ?? user?.email ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Label htmlFor="avatar" className="flex items-center gap-2 cursor-pointer text-sm font-medium text-primary-600 hover:underline">
                <Upload className="h-4 w-4" /> {avatarUploading ? "Uploading..." : "Upload avatar (max 2MB)"}
              </Label>
              <input id="avatar" type="file" accept="image/*" className="hidden" onChange={handleAvatar} disabled={avatarUploading} />
              <p className="text-xs text-neutral-400">PNG/JPG, stored at /api/users/me/avatar</p>
            </div>
          </div>
          <div className="grid gap-3">
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
              <span className="font-medium">{profile?.email ?? user?.email ?? "—"}</span>
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
          <form onSubmit={handleChangePassword} className="space-y-3">
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
              <Input id="current_password" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new_password">New password</Label>
              <Input id="new_password" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
              <p className="text-xs text-neutral-400">At least 8 characters, letter + digit.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm_password">Confirm new password</Label>
              <Input id="confirm_password" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required />
            </div>
            <Button type="submit" disabled={pwLoading} size="sm">
              {pwLoading ? "Updating..." : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" /> Active sessions
          </CardTitle>
          <CardDescription>Revoke sessions you don&apos;t recognize</CardDescription>
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
        <CardContent>
          <p className="text-sm text-neutral-500">Light theme (default). Dark theme support coming soon. Currency: INR, Date format: DD/MM/YYYY.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" /> Notification Preferences
          </CardTitle>
          <CardDescription>Toggle per type/channel</CardDescription>
        </CardHeader>
        <CardContent>
          {prefs ? (
            <div className="space-y-2 max-h-64 overflow-auto">
              {prefs.slice(0, 12).map((p, i) => (
                <div key={i} className="flex justify-between text-sm border-b py-2 last:border-0">
                  <span>
                    {p.type} • {p.channel}
                  </span>
                  <Badge variant={p.enabled ? "success" : "default"}>{p.enabled ? "On" : "Off"}</Badge>
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
          <CardDescription>Download your data per module (CSV) — or open the full export center for jobs, archives and pipeline status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center gap-2">
            <Button asChild size="sm">
              <a href="/export">Open Export Center →</a>
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
          <CardDescription>GDPR — deactivate (30-day grace) and restore</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Button variant="destructive" onClick={handleDeactivate} disabled={gdprLoading}>
              {gdprLoading ? "Processing..." : "Deactivate account"}
            </Button>
            <Button variant="outline" onClick={handleRestore} disabled={gdprLoading}>
              Restore account
            </Button>
          </div>
          <p className="text-xs text-neutral-500">Deactivate keeps data 30 days, then purge via DELETE /api/users/me. Restore works only within grace period.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Raw Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-neutral-50 p-4 rounded-lg overflow-auto">{JSON.stringify(settings, null, 2) || "No settings"}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
