"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { SubscriptionCard } from "./subscription-card";
import { SubscriptionFormDialog } from "./subscription-form-dialog";
import { formatINR } from "@/lib/format";
import { Repeat, Plus, Download, Wallet, History, Pause, AlarmClock, ShieldAlert, Trash2, Clock, X } from "lucide-react";
import { cancelSubscriptionAction, pauseSubscriptionAction, resumeSubscriptionAction, renewSubscriptionAction, snoozeSubscriptionAction, dismissAuditAction } from "./actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Sub = {
  id: string;
  service_name: string;
  amount: number;
  frequency: string;
  next_renewal_date: string;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  status: string;
  notes: string | null;
  version: number;
  days_until_renewal: number;
  monthly_equivalent: number;
  last_paid_date: string | null;
  last_paid_amount: number | null;
};

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

type PaymentRow = { id: string; amount: number; period_label: string; period_month: number; period_year: number; notes: string | null; created_at: string };

function SubscriptionPaymentsDialog({ sub, open, onOpenChange }: { sub: Sub | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !sub) return;
    setLoading(true);
    fetch(`/api/subscriptions/${sub.id}/payments`)
      .then((r) => r.json())
      .then((d) => {
        const rows = (d.payments ?? []).map((p: { amount: string | number }) => ({ ...p, amount: Number((p as { amount: string | number }).amount) }));
        setPayments(rows);
      })
      .catch(() => toast.error("Could not load payments"))
      .finally(() => setLoading(false));
  }, [open, sub]);

  if (!sub) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Payments — {sub.service_name}</DialogTitle>
          <DialogDescription>{payments.length} payments • {sub.frequency} • Next {new Date(sub.next_renewal_date).toLocaleDateString("en-IN")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between">
          <p className="text-xs text-neutral-500">{payments.length} records</p>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/subscriptions/${sub.id}/payments/export`} download><Download className="h-3 w-3" /> Export CSV</a>
          </Button>
        </div>
        <div className="max-h-[50vh] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-500">
              <tr><th className="p-2 text-left">Period</th><th className="p-2 text-left">Date</th><th className="p-2 text-right">Amount</th><th className="p-2 text-left">Notes</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={4} className="p-4 text-center text-neutral-400">Loading...</td></tr> : payments.length === 0 ? <tr><td colSpan={4} className="p-4 text-center text-neutral-400">No payments yet</td></tr> : payments.map((p) => (
                <tr key={p.id} className="border-t text-xs">
                  <td className="p-2">{p.period_label}</td>
                  <td className="p-2">{p.created_at.slice(0,10)}</td>
                  <td className="p-2 text-right font-medium">{formatINR(p.amount)}</td>
                  <td className="p-2 max-w-[18ch] truncate">{p.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Snooze dialog
// ---------------------------------------------------------------------------

function SnoozeDialog({ sub, open, onOpenChange }: { sub: Sub | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [days, setDays] = useState("7");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setDays("7");
  }, [open]);

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
      // try server action first
      const actionRes = await snoozeSubscriptionAction(sub.id, d);
      if (actionRes?.error) {
        // fallback fetch
        const res = await fetch(`/api/subscriptions/${sub.id}/snooze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ days: d }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.fieldErrors?.days || "Could not snooze");
      }
      toast.success(`Snoozed ${d} days`);
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
          <DialogTitle>Snooze — {sub.service_name}</DialogTitle>
          <DialogDescription>Push next renewal forward. Current: {new Date(sub.next_renewal_date).toLocaleDateString("en-IN")} ({sub.days_until_renewal >=0 ? `${sub.days_until_renewal}d` : "overdue"})</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSnooze} className="space-y-4">
          <div className="space-y-2">
            <Label>Days to snooze</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-neutral-400">Or enter custom days (1-90) below</p>
            <Input type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}><AlarmClock className="h-4 w-4" /> {loading ? "Snoozing..." : `Snooze ${days} days`}</Button>
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
  const router = useRouter();
  const [audits, setAudits] = useState<Audit[]>(initialAudits ?? []);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setAudits(initialAudits ?? []);
  }, [initialAudits]);

  // if no initial but we want to fetch client side as fallback
  useEffect(() => {
    if (initialAudits === null || initialAudits === undefined) {
      fetch("/api/subscriptions/audits")
        .then((r) => r.json())
        .then((d) => setAudits(d.audits ?? []))
        .catch(() => {});
    }
  }, [initialAudits]);

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

  if (!audits || audits.length === 0) {
    return (
      <Card className="p-6">
        <CardHeader className="p-0 mb-2">
          <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-5 w-5" /> Audits</CardTitle>
          <CardDescription>No audits — all subscriptions look healthy.</CardDescription>
        </CardHeader>
        <p className="text-sm text-neutral-500">Audits detect price changes, duplicates, unused or overlapping subscriptions. Data from API.</p>
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
          <p className="text-sm text-neutral-500 py-6 text-center">No audits in this category.</p>
        ) : filtered.map((a) => (
          <div key={a.id} className="flex items-start justify-between rounded-lg border border-neutral-100 p-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={a.audit_type === "price_change" ? "warning" : a.audit_type === "duplicate" ? "error" : a.audit_type === "unused" ? "info" : "secondary"}>{a.audit_type.replace("_"," ")}</Badge>
                {a.potential_savings != null && a.potential_savings > 0 && <span className="text-xs font-medium text-success">{formatINR(a.potential_savings)}/mo</span>}
                <span className="text-xs text-neutral-400">{new Date(a.created_at).toLocaleDateString("en-IN")}</span>
              </div>
              <p className="text-sm font-medium font-heading">{a.finding ?? "Finding not provided"}</p>
              <p className="text-xs text-neutral-500">{a.recommendation ?? "—"}</p>
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

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this subscription?")) return;
    const res = await cancelSubscriptionAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Subscription cancelled");
      router.refresh();
    }
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
          <h1 className="text-3xl font-bold font-heading text-neutral-900">Subscriptions</h1>
          <p className="text-sm text-neutral-500 font-body mt-1">{subscriptions.filter((s) => s.status === "active").length} active • {formatINR(monthlyBurn)}/mo</p>
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
              {expanded.has(s.id) && (
                <Card className="p-3 bg-neutral-50 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><p className="text-neutral-500">Amount</p><p className="font-medium">{formatINR(s.amount)} • {s.frequency}</p></div>
                    <div><p className="text-neutral-500">Monthly eq.</p><p className="font-medium">{formatINR(s.monthly_equivalent)}</p></div>
                    <div><p className="text-neutral-500">Next renewal</p><p className="font-medium">{new Date(s.next_renewal_date).toLocaleDateString("en-IN")} • {s.days_until_renewal >=0 ? `${s.days_until_renewal}d` : "overdue"}</p></div>
                    <div><p className="text-neutral-500">Account</p><p className="font-medium">{s.account_name ?? "—"}</p></div>
                    <div><p className="text-neutral-500">Category</p><p className="font-medium">{s.category_name ?? "—"}</p></div>
                    <div><p className="text-neutral-500">Last paid</p><p className="font-medium">{s.last_paid_date ? `${s.last_paid_date} • ${s.last_paid_amount != null ? formatINR(s.last_paid_amount) : "—"}` : "—"}</p></div>
                  </div>
                  {s.notes && <p className="text-xs text-neutral-500 border-t pt-2">{s.notes}</p>}
                  <div className="flex gap-2 pt-1">
                    <Button variant="ghost" size="sm" asChild><a href={`/api/subscriptions/${s.id}/payments/export`} download>Export</a></Button>
                    <Button variant="ghost" size="sm" onClick={() => setPaymentsSub(s)}>History</Button>
                    <Button variant="ghost" size="sm" onClick={() => setSnoozeSub(s)} disabled={s.status !== "active"}>Snooze 7d</Button>
                  </div>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}

      <SubscriptionFormDialog open={formOpen} onOpenChange={setFormOpen} subscription={editing} accounts={accounts} categories={categories} onSuccess={() => router.refresh()} />
      <SubscriptionPaymentsDialog sub={paymentsSub} open={!!paymentsSub} onOpenChange={(v) => !v && setPaymentsSub(null)} />
      <SnoozeDialog sub={snoozeSub} open={!!snoozeSub} onOpenChange={(v) => !v && setSnoozeSub(null)} />
    </div>
  );
}
