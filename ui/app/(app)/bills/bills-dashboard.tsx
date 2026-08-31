"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { BillCard } from "./bill-card";
import { BillFormDialog } from "./bill-form-dialog";
import { formatINR } from "@/lib/format";
import { Receipt, AlertTriangle, Clock, Plus, Download, History, Bell, Calendar, TrendingUp, Lightbulb, ChevronDown, ChevronUp, Pencil, Trash2, Save, X } from "lucide-react";
import { deactivateBillAction, reactivateBillAction, markPaidAction, skipBillAction, toggleAutopayAction, deleteReminderAction, suggestRecurringBills } from "./actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Bill = {
  id: string;
  name: string;
  amount: number | null;
  estimated_amount: number | null;
  due_day: number;
  frequency: string;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  reminder_days: number;
  is_autopay: number;
  notes: string | null;
  current_period_status: string;
  is_active: number;
  version: number;
  last_paid_date: string | null;
  last_paid_amount: number | null;
};

type Overview = { total_monthly_obligation: number; due_this_week: number; overdue_count: number };

type CalendarData = { events: { bill_id: string; name: string; amount: number; due_date: string; days_until: number; status: string }[] } | null;
type UpcomingData = { items: { bill_id: string; name: string; amount: number; due_date: string; days_until: number; status: string }[] } | null;
type CashflowProjection = { projection: { month: string; total: number }[] } | null;
type CashflowWaterfall = { projection?: { month: string; total: number }[]; waterfall?: { month: string; total: number; cumulative: number }[]; months?: { month: string; total: number }[] } | null;
type SuggestionsData = { suggestions: { description: string; avg_amount: number; occurrence_count: number }[] } | null;

// ---------------------------------------------------------------------------
// Payments History Dialog
// ---------------------------------------------------------------------------

type PaymentRow = { id: string; amount: number; period_label: string; period_month: number; period_year: number; notes: string | null; created_at: string; transaction_id: string | null };
type YoY = { current: { year: number; total: number }; previous: { year: number; total: number } };

function PaymentsHistoryDialog({ bill, open, onOpenChange }: { bill: Bill | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [yoy, setYoy] = useState<YoY | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !bill) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/bills/${bill.id}/payments`).then((r) => r.json()).catch(() => ({ payments: [] })),
      fetch(`/api/bills/${bill.id}/payments/yoy`).then((r) => r.json()).catch(() => null),
    ])
      .then(([p, y]) => {
        const rows = (p.payments ?? []).map((r: { amount: string | number }) => ({ ...r, amount: Number((r as { amount: string | number }).amount) }));
        setPayments(rows);
        if (y && y.current) setYoy(y);
        else setYoy(null);
      })
      .finally(() => setLoading(false));
  }, [open, bill]);

  if (!bill) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Payments — {bill.name}</DialogTitle>
          <DialogDescription>{payments.length} payments • {bill.frequency} • Due day {bill.due_day}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="history">
          <TabsList className="w-full">
            <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
            <TabsTrigger value="yoy" className="flex-1">YoY</TabsTrigger>
          </TabsList>
          <TabsContent value="history" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-neutral-500">{payments.length} records</p>
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/bills/${bill.id}/payments/export`} download>
                  <Download className="h-3 w-3" /> Export CSV
                </a>
              </Button>
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-500">
                  <tr>
                    <th className="p-2 text-left">Period</th>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} className="p-4 text-center text-neutral-400">Loading...</td></tr>
                  ) : payments.length === 0 ? (
                    <tr><td colSpan={4} className="p-4 text-center text-neutral-400">No payments yet</td></tr>
                  ) : payments.map((p) => (
                    <tr key={p.id} className="border-t text-xs">
                      <td className="p-2">{p.period_label}</td>
                      <td className="p-2">{p.created_at.slice(0,10)}</td>
                      <td className="p-2 text-right font-medium">{formatINR(p.amount)}</td>
                      <td className="p-2 max-w-[20ch] truncate">{p.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="yoy" className="space-y-3">
            {yoy ? (
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4 text-center">
                  <p className="text-xs text-neutral-500">Current • {yoy.current.year}</p>
                  <p className="text-lg font-bold font-heading">{formatINR(yoy.current.total)}</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-xs text-neutral-500">Previous • {yoy.previous.year}</p>
                  <p className="text-lg font-bold font-heading">{formatINR(yoy.previous.total)}</p>
                </Card>
                <div className="col-span-2 rounded-lg bg-neutral-50 p-3 text-center">
                  <p className="text-xs text-neutral-500">YoY change</p>
                  <p className="text-sm font-semibold">
                    {yoy.previous.total === 0 ? "—" : `${(((yoy.current.total - yoy.previous.total) / yoy.previous.total) * 100).toFixed(1)}%`}{" "}
                    <span className="text-neutral-400">({formatINR(yoy.current.total - yoy.previous.total)})</span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-500 py-6 text-center">No YoY data available.</p>
            )}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/bills/${bill.id}/payments/export`} download>
                  <Download className="h-3 w-3" /> Export CSV
                </a>
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reminders Dialog
// ---------------------------------------------------------------------------

type Reminder = { id: string; bill_id: string; days_before: number; channel: string; is_enabled: number };

function RemindersDialog({ bill, open, onOpenChange }: { bill: Bill | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [daysBefore, setDaysBefore] = useState("3");
  const [channel, setChannel] = useState("in_app");
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [editDays, setEditDays] = useState("3");

  const load = async () => {
    if (!bill) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/bills/${bill.id}/reminders`);
      const d = await r.json();
      setReminders(d.reminders ?? []);
    } catch {
      toast.error("Could not load reminders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    else {
      setEditing(null);
    }
  }, [open, bill]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bill) return;
    const payload = { days_before: Number(daysBefore), channel, is_enabled: 1 };
    const res = await fetch(`/api/bills/${bill.id}/reminders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error || data.fieldErrors?.days_before || "Could not create reminder");
    else {
      toast.success("Reminder created");
      setDaysBefore("3");
      load();
      router.refresh();
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bill || !editing) return;
    const res = await fetch(`/api/bills/${bill.id}/reminders/${editing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days_before: Number(editDays), is_enabled: 1 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error || data.fieldErrors?.days_before || "Could not update");
    else {
      toast.success("Reminder updated");
      setEditing(null);
      load();
      router.refresh();
    }
  };

  const handleDelete = async (reminderId: string) => {
    if (!bill) return;
    if (!confirm("Delete reminder?")) return;
    // try direct fetch first, fallback to server action
    let res = await fetch(`/api/bills/${bill.id}/reminders/${reminderId}`, { method: "DELETE" });
    if (!res.ok) {
      const actionRes = await deleteReminderAction(bill.id, reminderId);
      if (actionRes?.error) {
        toast.error(actionRes.error);
        return;
      }
      toast.success("Reminder deleted");
      load();
      router.refresh();
      return;
    }
    toast.success("Reminder deleted");
    load();
    router.refresh();
  };

  if (!bill) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reminders — {bill.name}</DialogTitle>
          <DialogDescription>{reminders.length} reminders • Manage days before due and channel</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="max-h-[30vh] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="p-2 text-left">Days before</th>
                  <th className="p-2 text-left">Channel</th>
                  <th className="p-2 text-center">Enabled</th>
                  <th className="p-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="p-4 text-center text-neutral-400">Loading...</td></tr>
                ) : reminders.length === 0 ? (
                  <tr><td colSpan={4} className="p-4 text-center text-neutral-400">No reminders — add one below.</td></tr>
                ) : reminders.map((r) => (
                  <tr key={r.id} className="border-t text-xs">
                    <td className="p-2">{r.days_before} days</td>
                    <td className="p-2">{r.channel}</td>
                    <td className="p-2 text-center"><Badge variant={r.is_enabled ? "success" : "default"}>{r.is_enabled ? "on" : "off"}</Badge></td>
                    <td className="p-2 flex gap-1 justify-center">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(r); setEditDays(String(r.days_before)); }}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-error" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="h-3 w-3" /> Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editing ? (
            <form onSubmit={handleUpdate} className="space-y-3 rounded-lg bg-neutral-50 p-3">
              <p className="text-sm font-medium">Edit reminder</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Days before</Label>
                  <Input type="number" min={0} max={90} value={editDays} onChange={(e) => setEditDays(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Channel</Label>
                  <Input value={editing.channel} disabled />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm"><Save className="h-3 w-3" /> Save</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}><X className="h-3 w-3" /> Cancel</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3 rounded-lg bg-neutral-50 p-3">
              <p className="text-sm font-medium">Add reminder</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Days before</Label>
                  <Input type="number" min={0} max={90} value={daysBefore} onChange={(e) => setDaysBefore(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Channel</Label>
                  <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_app">In-app</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="push">Push</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" size="sm"><Bell className="h-3 w-3" /> Add Reminder</Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Panels: calendar / upcoming / cashflow / waterfall / suggestions
// ---------------------------------------------------------------------------

function CalendarPanel({ data }: { data: CalendarData }) {
  if (!data || data.events.length === 0) return null;
  return (
    <Card className="p-6">
      <CardHeader className="p-0 mb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Calendar className="h-5 w-5" /> Calendar (30 days)</CardTitle>
        <CardDescription>{data.events.length} upcoming bills in the next 30 days</CardDescription>
      </CardHeader>
      <div className="space-y-2 max-h-[300px] overflow-auto">
        {data.events.map((e) => (
          <div key={`${e.bill_id}-${e.due_date}`} className="flex items-center justify-between rounded-lg border border-neutral-100 p-3">
            <div>
              <p className="text-sm font-medium font-heading">{e.name}</p>
              <p className="text-xs text-neutral-500">{e.due_date} • {e.days_until >= 0 ? `${e.days_until}d` : "overdue"} • {e.status}</p>
            </div>
            <p className="text-sm font-semibold">{formatINR(e.amount)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function UpcomingPanel({ data }: { data: UpcomingData }) {
  if (!data || data.items.length === 0) return null;
  return (
    <Card className="p-6">
      <CardHeader className="p-0 mb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-5 w-5" /> Upcoming (7 days + overdue)</CardTitle>
        <CardDescription>{data.items.length} bills due soon</CardDescription>
      </CardHeader>
      <div className="space-y-2">
        {data.items.map((e) => (
          <div key={`${e.bill_id}-${e.due_date}`} className="flex items-center justify-between rounded-lg bg-warning-light/20 p-3">
            <div>
              <p className="text-sm font-medium">{e.name}</p>
              <p className="text-xs text-neutral-500">{e.due_date} • {e.days_until}d • {e.status}</p>
            </div>
            <p className="text-sm font-bold">{formatINR(e.amount)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CashflowPanel({ projection, waterfall }: { projection: CashflowProjection; waterfall: CashflowWaterfall }) {
  const proj = projection?.projection ?? waterfall?.projection ?? waterfall?.months ?? [];
  const wf = waterfall?.waterfall ?? null;
  if ((!proj || proj.length === 0) && !wf) return null;
  const totalProj = proj.reduce((s, p) => s + (p.total ?? 0), 0);
  return (
    <Card className="p-6">
      <CardHeader className="p-0 mb-3">
        <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5" /> Cashflow Projection</CardTitle>
        <CardDescription>Next {proj.length} months • Total {formatINR(totalProj)}</CardDescription>
      </CardHeader>
      {proj.length > 0 && (
        <div className="space-y-2">
          {proj.map((p) => (
            <div key={p.month} className="flex items-center justify-between rounded-lg bg-neutral-50 p-3">
              <p className="text-sm font-medium">{p.month}</p>
              <p className="text-sm font-semibold">{formatINR(p.total)}</p>
            </div>
          ))}
        </div>
      )}
      {wf && wf.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-neutral-500 mb-2">Waterfall (cumulative)</p>
          <div className="space-y-2">
            {wf.map((w) => (
              <div key={w.month} className="flex items-center justify-between rounded-lg border border-primary-100 bg-primary-50/50 p-3">
                <p className="text-sm font-medium">{w.month}</p>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatINR(w.total)}</p>
                  <p className="text-xs text-neutral-500">Cumulative {formatINR(w.cumulative)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function SuggestRecurringPanel() {
  const [suggestions, setSuggestions] = useState<{ description: string; avg_amount: number; occurrence_count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSuggest = async () => {
    setLoading(true);
    try {
      // try server action first
      const actionRes = await suggestRecurringBills();
      if ((actionRes as { suggestions?: unknown })?.suggestions) {
        setSuggestions((actionRes as { suggestions: { description: string; avg_amount: number; occurrence_count: number }[] }).suggestions ?? []);
        setDone(true);
        return;
      }
      // fallback client fetch
      const res = await fetch("/api/bills/suggest-recurring", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setSuggestions(data.suggestions ?? []);
      setDone(true);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <CardHeader className="p-0 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-5 w-5" /> Suggest Recurring</CardTitle>
            <CardDescription>Detect recurring debits as potential bills (from 90 days of expenses)</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={handleSuggest} disabled={loading}>
            {loading ? "..." : done ? "Refresh" : "Suggest"}
          </Button>
        </div>
      </CardHeader>
      {suggestions.length === 0 ? (
        <p className="text-sm text-neutral-500">{done ? "No recurring candidates found." : "Click Suggest to scan transactions."}</p>
      ) : (
        <div className="space-y-2">
          {suggestions.map((s) => (
            <div key={s.description} className="flex items-center justify-between rounded-lg border border-neutral-100 p-3">
              <div>
                <p className="text-sm font-medium">{s.description}</p>
                <p className="text-xs text-neutral-500">{s.occurrence_count} occurrences • Avg {formatINR(s.avg_amount)}</p>
              </div>
              <Badge variant="info">{s.occurrence_count}x</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function BillsDashboard({
  bills,
  overview,
  accounts,
  categories,
  calendar,
  upcoming,
  cashflowProjection,
  cashflowWaterfall,
  suggestions,
}: {
  bills: Bill[];
  overview: Overview | null;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  calendar?: CalendarData;
  upcoming?: UpcomingData;
  cashflowProjection?: CashflowProjection;
  cashflowWaterfall?: CashflowWaterfall;
  suggestions?: SuggestionsData;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [paymentsBill, setPaymentsBill] = useState<Bill | null>(null);
  const [remindersBill, setRemindersBill] = useState<Bill | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = bills.filter((b) => {
    if (!showInactive && b.is_active !== 1) return false;
    if (activeTab === "all") return true;
    if (activeTab === "upcoming") return ["upcoming", "due_soon"].includes(b.current_period_status);
    if (activeTab === "overdue") return b.current_period_status === "overdue";
    if (activeTab === "paid") return b.current_period_status === "paid";
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

  const handleDeactivate = async (id: string) => {
    const res = await deactivateBillAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Bill deactivated");
      router.refresh();
    }
  };
  const handleReactivate = async (id: string) => {
    const res = await reactivateBillAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Bill reactivated");
      router.refresh();
    }
  };
  const handleMarkPaid = async (id: string) => {
    const res = await markPaidAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Bill marked as paid");
      router.refresh();
    }
  };
  const handleSkip = async (id: string) => {
    const res = await skipBillAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Bill skipped for this period");
      router.refresh();
    }
  };
  const handleToggleAutopay = async (bill: Bill) => {
    const res = await toggleAutopayAction(bill.id, !bill.is_autopay);
    if (res?.error) toast.error(res.error);
    else {
      toast.success(bill.is_autopay ? "Autopay disabled" : "Autopay enabled");
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-neutral-900">Bills</h1>
          <p className="text-sm text-neutral-500 font-body mt-1">Track recurring bills and due dates</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/api/bills/export" download>
              <Download className="h-4 w-4" /> Export
            </a>
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Bill
          </Button>
        </div>
      </div>

      {overview && (
        <div className="grid gap-6 md:grid-cols-3">
          <StatCard label="Monthly Obligation" value={formatINR(overview.total_monthly_obligation)} icon={<Receipt className="h-5 w-5" />} variant="primary" />
          <StatCard label="Due This Week" value={String(overview.due_this_week)} icon={<Clock className="h-5 w-5" />} variant="amber" />
          <StatCard label="Overdue" value={String(overview.overdue_count)} icon={<AlertTriangle className="h-5 w-5" />} variant="rose" />
        </div>
      )}

      {(calendar || upcoming || cashflowProjection || cashflowWaterfall) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <CalendarPanel data={calendar ?? null} />
          <UpcomingPanel data={upcoming ?? null} />
          <CashflowPanel projection={cashflowProjection ?? null} waterfall={cashflowWaterfall ?? null} />
          <SuggestRecurringPanel />
        </div>
      )}
      {/* Also show suggest panel even when no calendar data, so action is discoverable */}
      {!calendar && !upcoming && !cashflowProjection && !cashflowWaterfall && <SuggestRecurringPanel />}

      {suggestions && suggestions.suggestions.length > 0 && (
        <Card className="p-6">
          <CardHeader className="p-0 mb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-5 w-5" /> Recurring Suggestions</CardTitle>
            <CardDescription>{suggestions.suggestions.length} candidates from API</CardDescription>
          </CardHeader>
          <div className="space-y-2">
            {suggestions.suggestions.map((s) => (
              <div key={s.description} className="flex items-center justify-between rounded-lg border border-neutral-100 p-3">
                <div>
                  <p className="text-sm font-medium">{s.description}</p>
                  <p className="text-xs text-neutral-500">{s.occurrence_count} times • Avg {formatINR(s.avg_amount)}</p>
                </div>
                <Badge variant="info">{s.occurrence_count}x</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="overdue">Overdue</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded border-neutral-300" />
            Show inactive
          </label>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="No bills"
          description="Add a bill to track due dates, reminders and autopay."
          actionLabel="Add Bill"
          onAction={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((b) => (
            <div key={b.id} className="space-y-2">
              <BillCard
                bill={b}
                onEdit={() => {
                  setEditing(b);
                  setFormOpen(true);
                }}
                onDeactivate={() => handleDeactivate(b.id)}
                onReactivate={() => handleReactivate(b.id)}
                onMarkPaid={() => handleMarkPaid(b.id)}
                onSkip={() => handleSkip(b.id)}
                onToggleAutopay={() => handleToggleAutopay(b)}
              />
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => setPaymentsBill(b)}>
                  <History className="h-3 w-3" /> Payments
                </Button>
                <Button variant="outline" size="sm" onClick={() => setRemindersBill(b)}>
                  <Bell className="h-3 w-3" /> Reminders
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleExpand(b.id)}>
                  {expanded.has(b.id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} {expanded.has(b.id) ? "Hide" : "Detail"}
                </Button>
              </div>
              {expanded.has(b.id) && (
                <Card className="p-3 bg-neutral-50 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><p className="text-neutral-500">Amount</p><p className="font-medium">{b.amount != null ? formatINR(b.amount) : b.estimated_amount != null ? `~${formatINR(b.estimated_amount)}` : "—"}</p></div>
                    <div><p className="text-neutral-500">Frequency</p><p className="font-medium">{b.frequency}</p></div>
                    <div><p className="text-neutral-500">Account</p><p className="font-medium">{b.account_name ?? "—"}</p></div>
                    <div><p className="text-neutral-500">Category</p><p className="font-medium">{b.category_name ?? "—"}</p></div>
                    <div><p className="text-neutral-500">Reminder days</p><p className="font-medium">{b.reminder_days} days • {b.is_autopay ? "Autopay" : "Manual"}</p></div>
                    <div><p className="text-neutral-500">Last paid</p><p className="font-medium">{b.last_paid_date ? `${b.last_paid_date} • ${b.last_paid_amount != null ? formatINR(b.last_paid_amount) : "—"}` : "—"}</p></div>
                  </div>
                  {b.notes && <p className="text-xs text-neutral-500 border-t pt-2">{b.notes}</p>}
                  <div className="flex gap-2 pt-1">
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/api/bills/${b.id}/payments/export`} download>Export payments</a>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPaymentsBill(b)}>View YoY</Button>
                  </div>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}

      <BillFormDialog open={formOpen} onOpenChange={setFormOpen} bill={editing} accounts={accounts} categories={categories} onSuccess={() => router.refresh()} />
      <PaymentsHistoryDialog bill={paymentsBill} open={!!paymentsBill} onOpenChange={(v) => !v && setPaymentsBill(null)} />
      <RemindersDialog bill={remindersBill} open={!!remindersBill} onOpenChange={(v) => !v && setRemindersBill(null)} />
    </div>
  );
}
