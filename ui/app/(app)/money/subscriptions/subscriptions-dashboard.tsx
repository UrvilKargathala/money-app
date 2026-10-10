"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useMembership, UpgradeCard } from "@/components/membership";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { SubscriptionCard } from "./subscription-card";
import { useDeleteConfirm } from "@/components/common/confirm-dialog";
import { formatINR, todayLocalISO } from "@/lib/format";
import { Repeat, Plus, Download, Wallet, History, Pause, AlarmClock, ShieldAlert, Trash2, Clock, X } from "lucide-react";
import { cancelSubscriptionAction, pauseSubscriptionAction, resumeSubscriptionAction, renewSubscriptionAction, snoozeSubscriptionAction, dismissAuditAction } from "./actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { PanelError, TableLoadingRows } from "@/components/common/async-panel-state";
import { ExportButton } from "@/components/common/export-button";
import { usePaymentsHistory } from "@/components/common/use-payments-history";

// Dialogs are code-split (ssr:false) and mount only when opened. In-file
// payments/snooze dialogs below stay (out of scope for the split).
const SubscriptionFormDialog = dynamic(
  () => import("./subscription-form-dialog").then((m) => m.SubscriptionFormDialog),
  { ssr: false }
);
const ConfirmDialog = dynamic(
  () => import("@/components/common/confirm-dialog").then((m) => m.ConfirmDialog),
  { ssr: false }
);

import type { Sub } from "@/lib/entities";

type Audit = {
  id: string;
  subscription_id: string;
  audit_type: string;
  finding: string | null;
  recommendation: string | null;
  potential_savings: number | null;
  is_dismissed: number;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Payments history dialog per subscription
// ---------------------------------------------------------------------------

function SubscriptionPaymentsDialog({ sub, open, onOpenChange }: { sub: Sub | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { payments, loading, loadError, reload } = usePaymentsHistory(sub?.id ?? null, open, "/api/subscriptions");

  if (!sub) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Payments - {sub.service_name}</DialogTitle>
          <DialogDescription>{payments.length} payments • {sub.frequency} • Next {new Date(sub.next_renewal_date).toLocaleDateString("en-IN")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-3">{payments.length} records</p>
          <ExportButton href={`/api/subscriptions/${sub.id}/payments/export`} />
        </div>
          {loadError ? <PanelError message="Could not load subscription payments." onRetry={reload} /> : <div className="max-h-[50vh] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-sunken text-xs text-ink-3">
              <tr><th className="p-2 text-left">Period</th><th className="p-2 text-left">Date</th><th className="p-2 text-right">Amount</th><th className="p-2 text-left">Notes</th></tr>
            </thead>
            <tbody>
              {loading ? <TableLoadingRows columns={4} /> : payments.length === 0 ? <tr><td colSpan={4} className="p-4 text-center text-ink-3">No payments yet</td></tr> : payments.map((p) => (
                <tr key={p.id} className="border-t text-xs">
                  <td className="p-2">{p.period_label}</td>
                  <td className="p-2">{p.created_at.slice(0,10)}</td>
                  <td className="p-2 text-right font-medium">{formatINR(p.amount)}</td>
                  <td className="p-2 max-w-[18ch] truncate">{p.notes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Snooze dialog
// ---------------------------------------------------------------------------

const SNOOZE_PRESETS = ["7", "14", "30", "60", "90"] as const;

function SnoozeDialog({ sub, open, onOpenChange }: { sub: Sub | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  // Preset and custom entry are independent controls sharing nothing:
  // switching modes never clobbers the other field's value.
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [preset, setPreset] = useState<string>("7");
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  // Stable idempotency key per subscription: retries (action error followed
  // by the fallback fetch, or an explicit resubmit) resolve server-side to the
  // already-recorded outcome instead of shifting the date twice.
  const attemptRef = useRef<Record<string, string>>({});
  const attemptIdFor = (subscriptionId: string): string => {
    const existing = attemptRef.current[subscriptionId];
    if (existing) return existing;
    const fresh = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    attemptRef.current[subscriptionId] = fresh;
    return fresh;
  };

  // Last-used snooze controls per subscription: reopening the dialog restores
  // what the user picked instead of resetting to 7 days. Ephemeral intent
  // only - in-memory, dies with the page, nothing persisted to storage.
  const snoozeStateRef = useRef<Record<string, { mode: "preset" | "custom"; preset: string; custom: string }>>({});
  const persistSnoozeState = (next: { mode: "preset" | "custom"; preset: string; custom: string }) => {
    if (sub) snoozeStateRef.current[sub.id] = next;
  };

  useEffect(() => {
    if (open && sub) {
      const stored = snoozeStateRef.current[sub.id];
      if (stored) {
        setMode(stored.mode);
        setPreset(stored.preset);
        setCustom(stored.custom);
      } else {
        setMode("preset");
        setPreset("7");
        setCustom("");
      }
    }
  }, [open, sub]);

  const days = mode === "preset" ? preset : custom;

  // Display-only preview of the resulting renewal date, using the same
  // shift arithmetic as the server (next_renewal_date + days).
  const shiftRenewal = (iso: string, d: number): string => {
    const dt = new Date(iso);
    dt.setDate(dt.getDate() + d);
    return dt.toLocaleDateString("en-IN");
  };
  const parsedDays = Number(days);
  const validDays = Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 90;

  const handleSnooze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sub) return;
    const d = Number(days);
    if (!Number.isInteger(d) || d < 1 || d > 90) {
      toast.error("Snooze must be between 1 and 90 days.");
      return;
    }
    setLoading(true);
    try {
      // Both paths share one attempt id, so the fallback can only replay the
      // already-recorded outcome, never shift the date a second time.
      const attempt = attemptIdFor(sub.id);
      // try server action first
      const actionRes = await snoozeSubscriptionAction(sub.id, d, mode, attempt);
      if (actionRes?.error) {
        // fallback fetch
        const res = await fetch(`/api/subscriptions/${sub.id}/snooze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ days: d, source: mode, attempt }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.fieldErrors?.days || "Could not snooze");
      }
      toast.success(`Snoozed ${d} days → renews ${shiftRenewal(sub.next_renewal_date, d)}`);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!sub) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Snooze - {sub.service_name}</DialogTitle>
          <DialogDescription>Push next renewal forward. Current: {new Date(sub.next_renewal_date).toLocaleDateString("en-IN")} ({sub.days_until_renewal >=0 ? `${sub.days_until_renewal}d` : "overdue"})</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSnooze} className="space-y-4">
          <div className="space-y-2">
            <Label>Days to snooze</Label>
            <div className="flex gap-1 rounded-lg bg-wash p-1">
              {(["preset", "custom"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); persistSnoozeState({ mode: m, preset, custom }); }}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${mode === m ? "bg-surface text-ink-1 shadow-sm" : "text-ink-3 hover:text-ink-1"}`}
                >
                  {m === "preset" ? "Presets" : "Custom"}
                </button>
              ))}
            </div>
            {mode === "preset" ? (
              <Select value={preset} onValueChange={(v) => { setPreset(v); persistSnoozeState({ mode, preset: v, custom }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SNOOZE_PRESETS.map((p) => (
                    <SelectItem key={p} value={p}>{p} days</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type="number"
                min={1}
                max={90}
                autoFocus
                placeholder="Enter days (1-90)"
                value={custom}
                onChange={(e) => { setCustom(e.target.value); persistSnoozeState({ mode, preset, custom: e.target.value }); }}
              />
            )}
            {validDays && sub ? (
              <p className="text-xs text-ink-3">
                Renews {new Date(sub.next_renewal_date).toLocaleDateString("en-IN")} → {shiftRenewal(sub.next_renewal_date, parsedDays)} ({parsedDays} days)
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}><AlarmClock className="h-4 w-4" /> {loading ? "Snoozing..." : `Snooze ${days || "?"} days`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Audits list with dismiss
// ---------------------------------------------------------------------------

function AuditsPanel({ audits: initialAudits }: { audits: Audit[] | null }) {
  const { premium, loading: planLoading } = useMembership();
  const router = useRouter();
  const [audits, setAudits] = useState<Audit[]>(initialAudits ?? []);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setAudits(initialAudits ?? []);
  }, [initialAudits]);

  // if no initial but we want to fetch client side as fallback
  useEffect(() => {
    if (premium && (initialAudits === null || initialAudits === undefined)) {
      fetch("/api/subscriptions/audits")
        .then((r) => r.json())
        .then((d) => setAudits(d.audits ?? []))
        .catch(() => {});
    }
  }, [initialAudits, premium]);

  const filtered = audits.filter((a) => {
    if (a.is_dismissed === 1) return false;
    if (filter === "all") return true;
    return a.audit_type === filter;
  });

  const handleDismiss = async (auditId: string) => {
    // optimistic
    setAudits((prev) => prev.map((a) => a.id === auditId ? { ...a, is_dismissed: 1 } : a));
    try {
      const res = await fetch(`/api/subscriptions/audits/${auditId}/dismiss`, { method: "POST" });
      if (!res.ok) {
        const actionRes = await dismissAuditAction(auditId);
        if (actionRes?.error) throw new Error(actionRes.error);
      }
      toast.success("Audit dismissed");
      router.refresh();
    } catch (e) {
      toast.error(String(e));
      setAudits(initialAudits ?? []);
    }
  };

  const totalPotential = audits.filter((a) => !a.is_dismissed).reduce((s, a) => s + (a.potential_savings ?? 0), 0);
  const activeCount = audits.filter((a) => !a.is_dismissed).length;

  if (planLoading) return <p role="status">Loading audits…</p>;
  if (!premium) return <UpgradeCard feature="Subscription audits" />;
  if (!audits || audits.length === 0) {
    return (
      <Card className="p-6">
        <CardHeader className="p-0 mb-2">
          <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-5 w-5" /> Audits</CardTitle>
          <CardDescription>No findings from the available data.</CardDescription>
        </CardHeader>
        <p className="text-sm text-ink-3">Audits flag recorded price changes, possible duplicates and overlapping categories. Add last-used dates to help identify unused services.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <CardHeader className="p-0 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-5 w-5" /> Audits</CardTitle>
            <CardDescription>{activeCount} active • Potential savings {formatINR(totalPotential)} • {audits.filter(a=>a.is_dismissed).length} dismissed</CardDescription>
          </div>
          <Badge variant={activeCount > 0 ? "warning" : "success"}>{activeCount} open</Badge>
        </div>
      </CardHeader>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="price_change">Price</TabsTrigger>
          <TabsTrigger value="duplicate">Duplicate</TabsTrigger>
          <TabsTrigger value="unused">Unused</TabsTrigger>
          <TabsTrigger value="overlapping">Overlap</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4 space-y-3 max-h-[400px] overflow-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-ink-3 py-6 text-center">No audits in this category.</p>
        ) : filtered.map((a) => (
          <div key={a.id} className="flex items-start justify-between rounded-lg border border-line p-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={a.audit_type === "price_change" ? "warning" : a.audit_type === "duplicate" ? "error" : a.audit_type === "unused" ? "info" : "secondary"}>{a.audit_type.replace("_"," ")}</Badge>
                {a.potential_savings != null && a.potential_savings > 0 && <span className="text-xs font-medium text-success">{formatINR(a.potential_savings)}/mo</span>}
                <span className="text-xs text-neutral-400">{new Date(a.created_at).toLocaleDateString("en-IN")}</span>
              </div>
              <p className="text-sm font-medium font-heading">{a.finding ?? "Finding not provided"}</p>
              <p className="text-xs text-ink-3">{a.recommendation ?? "-"}</p>
              <p className="text-[11px] text-neutral-400">Subscription {a.subscription_id.slice(0,8)}…</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => handleDismiss(a.id)} className="shrink-0"><X className="h-3 w-3" /> Dismiss</Button>
          </div>
        ))}
      </div>
      {filtered.length > 0 && <p className="text-xs text-neutral-400 mt-3">Total potential monthly savings {formatINR(totalPotential)} across {activeCount} audits</p>}
    </Card>
  );
}

// Expanded detail per subscription: populated metadata only (never "-" or
// duplicated card rows), the last-used control, and no repeated actions —
// Payments / Snooze live on the card buttons above this panel.
function SubscriptionDetailPanel({ sub }: { sub: Sub }) {
  const router = useRouter();
  const { premium } = useMembership();
  const [usageDate, setUsageDate] = useState(sub.last_used_at ?? "");
  const [savingUsage, setSavingUsage] = useState(false);

  const rows: { label: string; value: string }[] = [
    { label: "Monthly eq.", value: formatINR(sub.monthly_equivalent) },
  ];
  if (sub.account_name) rows.push({ label: "Account", value: sub.account_name });
  if (sub.category_name) rows.push({ label: "Category", value: sub.category_name });
  if (sub.last_paid_date) {
    rows.push({
      label: "Last paid",
      value: sub.last_paid_amount != null
        ? `${sub.last_paid_date} • ${formatINR(sub.last_paid_amount)}`
        : sub.last_paid_date,
    });
  }
  if (sub.last_snooze_days != null && sub.last_snooze_date) {
    rows.push({
      label: "Last snooze",
      value: `${sub.last_snooze_days}d → ${new Date(sub.last_snooze_date).toLocaleDateString("en-IN")}`,
    });
  }
  if (sub.last_used_at && !premium) {
    rows.push({ label: "Last used", value: new Date(sub.last_used_at).toLocaleDateString("en-IN") });
  }

  const saveUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUsage(true);
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}/usage`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ last_used_at: usageDate }),
      });
      if (!res.ok) throw new Error();
      toast.success("Last-used date recorded");
      router.refresh();
    } catch {
      toast.error("Could not record usage");
    } finally {
      setSavingUsage(false);
    }
  };

  return (
    <Card className="p-4 bg-sunken space-y-3">
      <div className="grid grid-cols-2 gap-x-2 gap-y-3 text-xs">
        {rows.map((r) => (
          <div key={r.label}>
            <p className="text-ink-3">{r.label}</p>
            <p className="font-medium text-ink-1">{r.value}</p>
          </div>
        ))}
      </div>
      {sub.notes && <p className="text-xs text-ink-3 border-t border-line pt-2">{sub.notes}</p>}
      {premium && (
        <form onSubmit={saveUsage} className="space-y-1.5 border-t border-line pt-3">
          <div className="flex items-baseline justify-between">
            <Label htmlFor={`usage-${sub.id}`}>Last used</Label>
            <p className="text-[11px] text-neutral-400">
              {sub.last_used_at
                ? `Recorded ${new Date(sub.last_used_at).toLocaleDateString("en-IN")}`
                : "Not recorded"}
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              id={`usage-${sub.id}`}
              type="date"
              required
              max={todayLocalISO()}
              value={usageDate}
              onChange={(e) => setUsageDate(e.target.value)}
              className="h-9 text-xs"
            />
            <Button size="sm" disabled={savingUsage}>Save</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export function SubscriptionsDashboard({
  subscriptions,
  monthlyBurn,
  accounts,
  categories,
  audits,
}: {
  subscriptions: Sub[];
  monthlyBurn: number;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  audits?: Audit[] | null;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Sub | null>(null);
  const [paymentsSub, setPaymentsSub] = useState<Sub | null>(null);
  const [snoozeSub, setSnoozeSub] = useState<Sub | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = subscriptions.filter((s) => {
    if (activeTab === "all") return true;
    if (activeTab === "active") return s.status === "active";
    if (activeTab === "paused") return s.status === "paused";
    if (activeTab === "cancelled") return s.status === "cancelled";
    return true;
  });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [confirmState, closeConfirm, confirmDelete] = useDeleteConfirm();

  const handleCancel = (id: string) => {
    confirmDelete({
      title: "Cancel this subscription?",
      description: "Renewal tracking stops. You can re-add it later.",
      confirmLabel: "Cancel subscription",
      onDelete: () => cancelSubscriptionAction(id),
      successMsg: "Subscription cancelled",
      onDone: () => router.refresh(),
    });
  };
  const handlePause = async (id: string) => {
    const res = await pauseSubscriptionAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Paused");
      router.refresh();
    }
  };
  const handleResume = async (id: string) => {
    const res = await resumeSubscriptionAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Resumed");
      router.refresh();
    }
  };
  const handleRenew = async (id: string) => {
    const res = await renewSubscriptionAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Renewed");
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-ink-1">Subscriptions</h1>
          <p className="text-sm text-ink-3 font-body mt-1">{subscriptions.filter((s) => s.status === "active").length} active • {formatINR(monthlyBurn)}/mo</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/api/subscriptions/export" download>
              <Download className="h-4 w-4" /> Export
            </a>
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Subscription
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <StatCard label="Monthly Burn" value={formatINR(monthlyBurn)} subtext="Active subscriptions" icon={<Wallet className="h-5 w-5" />} variant="rose" />
        <StatCard label="Active" value={String(subscriptions.filter((s) => s.status === "active").length)} icon={<Repeat className="h-5 w-5" />} variant="success" />
        <StatCard label="Due Soon" value={String(subscriptions.filter((s) => s.days_until_renewal >= 0 && s.days_until_renewal <= 7 && s.status === "active").length)} subtext="Within 7 days" icon={<Repeat className="h-5 w-5" />} variant="amber" />
      </div>

      {audits !== undefined && <AuditsPanel audits={audits ?? []} />}

      <Card className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="paused">Paused</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          </TabsList>
        </Tabs>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Repeat className="h-6 w-6" />}
          title="No subscriptions"
          description="Add your subscriptions to track monthly burn and renewals."
          actionLabel="Add Subscription"
          onAction={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <div key={s.id} className="space-y-2">
              <SubscriptionCard
                sub={s}
                onEdit={() => {
                  setEditing(s);
                  setFormOpen(true);
                }}
                onCancel={() => handleCancel(s.id)}
                onPause={() => handlePause(s.id)}
                onResume={() => handleResume(s.id)}
                onRenew={() => handleRenew(s.id)}
              />
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => setPaymentsSub(s)}><History className="h-3 w-3" /> Payments</Button>
                <Button variant="outline" size="sm" onClick={() => setSnoozeSub(s)} disabled={s.status !== "active"}><AlarmClock className="h-3 w-3" /> Snooze</Button>
                <Button variant="outline" size="sm" onClick={() => toggleExpand(s.id)}><Clock className="h-3 w-3" /> {expanded.has(s.id) ? "Hide" : "Detail"}</Button>
              </div>
              {expanded.has(s.id) && <SubscriptionDetailPanel sub={s} />}
            </div>
          ))}
        </div>
      )}

      {formOpen ? <SubscriptionFormDialog open={formOpen} onOpenChange={setFormOpen} subscription={editing} accounts={accounts} categories={categories} onSuccess={() => router.refresh()} /> : null}
      <SubscriptionPaymentsDialog sub={paymentsSub} open={!!paymentsSub} onOpenChange={(v) => !v && setPaymentsSub(null)} />
      <SnoozeDialog sub={snoozeSub} open={!!snoozeSub} onOpenChange={(v) => !v && setSnoozeSub(null)} />
      {confirmState ? <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} /> : null}
    </div>
  );
}
