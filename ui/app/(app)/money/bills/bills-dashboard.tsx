"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { BillCard } from "./bill-card";
import { useConfirm } from "@/components/common/confirm-dialog";
import { formatINR } from "@/lib/format";
import { Receipt, AlertTriangle, Clock, Plus, Download, History, Bell, Calendar, TrendingUp, Lightbulb, ChevronDown, ChevronUp, Pencil, Trash2, Save, X } from "lucide-react";
import { deactivateBillAction, reactivateBillAction, markPaidAction, skipBillAction, toggleAutopayAction, deleteReminderAction, suggestRecurringBills } from "./actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { PanelError, TableLoadingRows } from "@/components/common/async-panel-state";
import { ExportButton } from "@/components/common/export-button";
import { usePaymentsHistory } from "@/components/common/use-payments-history";

import type { Bill } from "@/lib/entities";

// Dialogs are code-split (ssr:false) and mount only when opened. In-file
// payments/reminders dialogs below stay (out of scope for the split).
const BillFormDialog = dynamic(
  () => import("./bill-form-dialog").then((m) => m.BillFormDialog),
  { ssr: false }
);
const ConfirmDialog = dynamic(
  () => import("@/components/common/confirm-dialog").then((m) => m.ConfirmDialog),
  { ssr: false }
);

type Overview = { total_monthly_obligation: number; due_this_week: number; overdue_count: number };

type CalendarData = { events: { bill_id: string; name: string; amount: number; due_date: string; days_until: number; status: string }[] } | null;
type UpcomingData = { items: { bill_id: string; name: string; amount: number; due_date: string; days_until: number; status: string }[] } | null;
type CashflowProjection = { projection: { month: string; total: number }[] } | null;
type CashflowWaterfall = { projection?: { month: string; total: number }[]; waterfall?: { month: string; total: number; cumulative: number }[]; months?: { month: string; total: number }[] } | null;
type SuggestionsData = { suggestions: { description: string; avg_amount: number; occurrence_count: number }[] } | null;

// ---------------------------------------------------------------------------
// Payments History Dialog
// ---------------------------------------------------------------------------

type YoY = { current: { year: number; total: number }; previous: { year: number; total: number } };

/** Year-over-year percent change label ("-" when the previous total is 0). */
function yoyChangeLabel(yoy: YoY): string {
  if (yoy.previous.total === 0) return "-";
  const pct = ((yoy.current.total - yoy.previous.total) / yoy.previous.total) * 100;
  return `${pct.toFixed(1)}%`;
}

function PaymentsHistoryDialog({ bill, open, onOpenChange }: { bill: Bill | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { payments, loading, loadError, reload: reloadPayments } = usePaymentsHistory(bill?.id ?? null, open, "/api/bills");
  const [yoy, setYoy] = useState<YoY | null>(null);

  const loadYoy = useCallback(() => {
    if (!bill) return;
    fetch(`/api/bills/${bill.id}/payments/yoy`)
      .then(async (response) => (response.ok ? response.json() : null))
      .then((yoyResult) => setYoy(yoyResult?.current ? yoyResult : null))
      .catch(() => setYoy(null));
  }, [bill]);

  useEffect(() => {
    if (!open || !bill) return;
    loadYoy();
  }, [open, bill, loadYoy]);

  const handleRetry = () => {
    reloadPayments();
    loadYoy();
  };

  if (!bill) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Payments - {bill.name}</DialogTitle>
          <DialogDescription>{payments.length} payments • {bill.frequency} • Due day {bill.due_day}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="history">
          <TabsList className="w-full">
            <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
            <TabsTrigger value="yoy" className="flex-1">YoY</TabsTrigger>
          </TabsList>
          <TabsContent value="history" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-faint">{payments.length} records</p>
              <ExportButton href={`/api/bills/${bill.id}/payments/export`} />
            </div>
            {loadError ? <PanelError message="Could not load bill payments." onRetry={handleRetry} /> : <div className="max-h-[50vh] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-deep text-xs text-faint">
                  <tr>
                    <th className="p-2 text-left">Period</th>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableLoadingRows columns={4} />
                  ) : payments.length === 0 ? (
                    <tr><td colSpan={4} className="p-4 text-center text-faint">No payments yet</td></tr>
                  ) : payments.map((payment) => (
                    <tr key={payment.id} className="border-t text-xs">
                      <td className="p-2">{payment.period_label}</td>
                      <td className="p-2">{payment.created_at.slice(0,10)}</td>
                      <td className="p-2 text-right font-medium">{formatINR(payment.amount)}</td>
                      <td className="p-2 max-w-[20ch] truncate">{payment.notes ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </TabsContent>
          <TabsContent value="yoy" className="space-y-3">
            {yoy ? (
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4 text-center">
                  <p className="text-xs text-faint">Current • {yoy.current.year}</p>
                  <p className="text-lg font-bold font-heading">{formatINR(yoy.current.total)}</p>
                </Card>
                <Card className="p-4 text-center">
                  <p className="text-xs text-faint">Previous • {yoy.previous.year}</p>
                  <p className="text-lg font-bold font-heading">{formatINR(yoy.previous.total)}</p>
                </Card>
                <div className="col-span-2 rounded-lg bg-deep p-3 text-center">
                  <p className="text-xs text-faint">YoY change</p>
                  <p className="text-sm font-semibold">
                    {yoyChangeLabel(yoy)}{" "}
                    <span className="text-faint">({formatINR(yoy.current.total - yoy.previous.total)})</span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-faint py-6 text-center">No YoY data available.</p>
            )}
            <div className="flex justify-end">
              <ExportButton href={`/api/bills/${bill.id}/payments/export`} />
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

// Default "days before due" for new + edit reminder forms.
const DEFAULT_REMINDER_DAYS = "3";

function RemindersDialog({ bill, open, onOpenChange }: { bill: Bill | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [daysBefore, setDaysBefore] = useState(DEFAULT_REMINDER_DAYS);
  const [channel, setChannel] = useState("in_app");
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [editDays, setEditDays] = useState(DEFAULT_REMINDER_DAYS);

  const load = async () => {
    if (!bill) return;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch(`/api/bills/${bill.id}/reminders`);
      if (!response.ok) throw new Error();
      const body = await response.json();
      setReminders(body.reminders ?? []);
    } catch {
      setLoadError(true);
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
      setDaysBefore(DEFAULT_REMINDER_DAYS);
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

  const [confirmState, askConfirm, closeConfirm] = useConfirm();

  const handleDelete = (reminderId: string) => {
    if (!bill) return;
    askConfirm({
      title: "Delete reminder?",
      description: "This reminder will stop firing. This cannot be undone.",
      onConfirm: async () => {
        // try direct fetch first, fallback to server action
        const res = await fetch(`/api/bills/${bill.id}/reminders/${reminderId}`, { method: "DELETE" });
        if (!res.ok) {
          const actionRes = await deleteReminderAction(bill.id, reminderId);
          if (actionRes?.error) {
            toast.error(actionRes.error);
            return;
          }
        }
        toast.success("Reminder deleted");
        load();
        router.refresh();
      },
    });
  };

  if (!bill) return null;
  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reminders - {bill.name}</DialogTitle>
          <DialogDescription>{reminders.length} reminders • Manage days before due and channel</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loadError ? <PanelError message="Could not load bill reminders." onRetry={() => void load()} /> : <div className="max-h-[30vh] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-deep text-xs text-faint">
                <tr>
                  <th className="p-2 text-left">Days before</th>
                  <th className="p-2 text-left">Channel</th>
                  <th className="p-2 text-center">Enabled</th>
                  <th className="p-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableLoadingRows columns={4} />
                ) : reminders.length === 0 ? (
                  <tr><td colSpan={4} className="p-4 text-center text-faint">No reminders - add one below.</td></tr>
                ) : reminders.map((reminder) => (
                  <tr key={reminder.id} className="border-t text-xs">
                    <td className="p-2">{reminder.days_before} days</td>
                    <td className="p-2">{reminder.channel}</td>
                    <td className="p-2 text-center"><Badge variant={reminder.is_enabled ? "success" : "default"}>{reminder.is_enabled ? "on" : "off"}</Badge></td>
                    <td className="p-2 flex gap-1 justify-center">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(reminder); setEditDays(String(reminder.days_before)); }}>
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-error" onClick={() => handleDelete(reminder.id)}>
                        <Trash2 className="h-3 w-3" /> Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}

          {editing ? (
            <form onSubmit={handleUpdate} className="space-y-3 rounded-lg bg-deep p-3">
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
            <form onSubmit={handleCreate} className="space-y-3 rounded-lg bg-deep p-3">
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
      {confirmState ? <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Panels: calendar / upcoming / cashflow / waterfall / suggestions
// ---------------------------------------------------------------------------

// Pure panels: props are stable server data — memo so tab/expand/dialog
// churn in the parent doesn't re-render them.
const CalendarPanel = memo(function CalendarPanel({ data }: { data: CalendarData }) {
  if (!data || data.events.length === 0) return null;
  return (
    <Card className="p-6">
      <CardHeader className="p-0 mb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Calendar className="h-5 w-5" /> Calendar (30 days)</CardTitle>
        <CardDescription>{data.events.length} upcoming bills in the next 30 days</CardDescription>
      </CardHeader>
      <div className="space-y-2 max-h-[300px] overflow-auto">
        {data.events.map((event) => (
          <div key={`${event.bill_id}-${event.due_date}`} className="flex items-center justify-between rounded-lg border border-edge p-3">
            <div>
              <p className="text-sm font-medium font-heading">{event.name}</p>
              <p className="text-xs text-faint">{event.due_date} • {event.days_until >= 0 ? `${event.days_until}d` : "overdue"} • {event.status}</p>
            </div>
            <p className="text-sm font-semibold">{formatINR(event.amount)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
});

const UpcomingPanel = memo(function UpcomingPanel({ data }: { data: UpcomingData }) {
  if (!data || data.items.length === 0) return null;
  return (
    <Card className="p-6">
      <CardHeader className="p-0 mb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-5 w-5" /> Upcoming (7 days + overdue)</CardTitle>
        <CardDescription>{data.items.length} bills due soon</CardDescription>
      </CardHeader>
      <div className="space-y-2">
        {data.items.map((item) => (
                  <div key={`${item.bill_id}-${item.due_date}`} className="flex items-center justify-between rounded-lg bg-warning-soft/20 p-3 dark:bg-[#78350F]/30">
            <div>
              <p className="text-sm font-medium">{item.name}</p>
              <p className="text-xs text-faint">{item.due_date} • {item.days_until}d • {item.status}</p>
            </div>
            <p className="text-sm font-bold">{formatINR(item.amount)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
});

const CashflowPanel = memo(function CashflowPanel({ projection, waterfall }: { projection: CashflowProjection; waterfall: CashflowWaterfall }) {
  const proj = useMemo(
    () => projection?.projection ?? waterfall?.projection ?? waterfall?.months ?? [],
    [projection, waterfall]
  );
  const wf = waterfall?.waterfall ?? null;
  const totalProj = useMemo(
    () => proj.reduce((sum, month) => sum + (month.total ?? 0), 0),
    [proj]
  );
  if ((!proj || proj.length === 0) && !wf) return null;
  return (
    <Card className="p-6">
      <CardHeader className="p-0 mb-3">
        <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5" /> Cashflow Projection</CardTitle>
        <CardDescription>Next {proj.length} months • Total {formatINR(totalProj)}</CardDescription>
      </CardHeader>
      {proj.length > 0 && (
        <div className="space-y-2">
          {proj.map((month) => (
            <div key={month.month} className="flex items-center justify-between rounded-lg bg-deep p-3">
              <p className="text-sm font-medium">{month.month}</p>
              <p className="text-sm font-semibold">{formatINR(month.total)}</p>
            </div>
          ))}
        </div>
      )}
      {wf && wf.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-faint mb-2">Waterfall (cumulative)</p>
          <div className="space-y-2">
            {wf.map((row) => (
                  <div key={row.month} className="flex items-center justify-between rounded-lg border border-primary-100 bg-info-soft/50 p-3 dark:border-[#2A2A2A] dark:bg-[#1E1E1E]/40">
                <p className="text-sm font-medium">{row.month}</p>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatINR(row.total)}</p>
                  <p className="text-xs text-faint">Cumulative {formatINR(row.cumulative)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
});

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
        <p className="text-sm text-faint">{done ? "No recurring candidates found." : "Click Suggest to scan transactions."}</p>
      ) : (
        <div className="space-y-2">
          {suggestions.map((candidate) => (
            <div key={candidate.description} className="flex items-center justify-between rounded-lg border border-edge p-3">
              <div>
                <p className="text-sm font-medium">{candidate.description}</p>
                <p className="text-xs text-faint">{candidate.occurrence_count} occurrences • Avg {formatINR(candidate.avg_amount)}</p>
              </div>
              <Badge variant="info">{candidate.occurrence_count}x</Badge>
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
  initialCreate = false,
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
  initialCreate?: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(initialCreate);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [paymentsBill, setPaymentsBill] = useState<Bill | null>(null);
  const [remindersBill, setRemindersBill] = useState<Bill | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () =>
      bills.filter((b) => {
        if (!showInactive && b.is_active !== 1) return false;
        if (activeTab === "all") return true;
        if (activeTab === "upcoming") return ["upcoming", "due_soon"].includes(b.current_period_status);
        if (activeTab === "overdue") return b.current_period_status === "overdue";
        if (activeTab === "paid") return b.current_period_status === "paid";
        return true;
      }),
    [bills, showInactive, activeTab]
  );

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleEdit = useCallback((b: Bill) => {
    setEditing(b);
    setFormOpen(true);
  }, []);

  const handleDeactivate = useCallback(
    async (b: Bill) => {
      const res = await deactivateBillAction(b.id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Bill deactivated");
        router.refresh();
      }
    },
    [router]
  );
  const handleReactivate = useCallback(
    async (b: Bill) => {
      const res = await reactivateBillAction(b.id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Bill reactivated");
        router.refresh();
      }
    },
    [router]
  );
  const handleMarkPaid = useCallback(
    async (b: Bill) => {
      const res = await markPaidAction(b.id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Bill marked as paid");
        router.refresh();
      }
    },
    [router]
  );
  const handleSkip = useCallback(
    async (b: Bill) => {
      const res = await skipBillAction(b.id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("Bill skipped for this period");
        router.refresh();
      }
    },
    [router]
  );
  const handleToggleAutopay = useCallback(
    async (bill: Bill) => {
      const res = await toggleAutopayAction(bill.id, !bill.is_autopay);
      if (res?.error) toast.error(res.error);
      else {
        toast.success(bill.is_autopay ? "Autopay disabled" : "Autopay enabled");
        router.refresh();
      }
    },
    [router]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bills"
        description="Track recurring bills and due dates"
        actions={
          <>
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
          </>
        }
      />

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
            {suggestions.suggestions.map((candidate) => (
              <div key={candidate.description} className="flex items-center justify-between rounded-lg border border-edge p-3">
                <div>
                  <p className="text-sm font-medium">{candidate.description}</p>
                  <p className="text-xs text-faint">{candidate.occurrence_count} times • Avg {formatINR(candidate.avg_amount)}</p>
                </div>
                <Badge variant="info">{candidate.occurrence_count}x</Badge>
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
          {filtered.map((bill) => (
            <div key={bill.id} className="space-y-2">
              <BillCard
                bill={bill}
                onEdit={handleEdit}
                onDeactivate={handleDeactivate}
                onReactivate={handleReactivate}
                onMarkPaid={handleMarkPaid}
                onSkip={handleSkip}
                onToggleAutopay={handleToggleAutopay}
              />
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => setPaymentsBill(bill)}>
                  <History className="h-3 w-3" /> Payments
                </Button>
                <Button variant="outline" size="sm" onClick={() => setRemindersBill(bill)}>
                  <Bell className="h-3 w-3" /> Reminders
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleExpand(bill.id)}>
                  {expanded.has(bill.id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} {expanded.has(bill.id) ? "Hide" : "Detail"}
                </Button>
              </div>
              {expanded.has(bill.id) && (
                <Card className="p-3 bg-deep space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><p className="text-faint">Amount</p><p className="font-medium">{bill.amount != null ? formatINR(bill.amount) : bill.estimated_amount != null ? `~${formatINR(bill.estimated_amount)}` : "-"}</p></div>
                    <div><p className="text-faint">Frequency</p><p className="font-medium">{bill.frequency}</p></div>
                    <div><p className="text-faint">Account</p><p className="font-medium">{bill.account_name ?? "-"}</p></div>
                    <div><p className="text-faint">Category</p><p className="font-medium">{bill.category_name ?? "-"}</p></div>
                    <div><p className="text-faint">Reminder days</p><p className="font-medium">{bill.reminder_days} days • {bill.is_autopay ? "Autopay" : "Manual"}</p></div>
                    <div><p className="text-faint">Last paid</p><p className="font-medium">{bill.last_paid_date ? `${bill.last_paid_date} • ${bill.last_paid_amount != null ? formatINR(bill.last_paid_amount) : "-"}` : "-"}</p></div>
                  </div>
                  {bill.notes && <p className="text-xs text-faint border-t pt-2">{bill.notes}</p>}
                  <div className="flex gap-2 pt-1">
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/api/bills/${bill.id}/payments/export`} download>Export payments</a>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPaymentsBill(bill)}>View YoY</Button>
                  </div>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}

      {formOpen ? <BillFormDialog open={formOpen} onOpenChange={setFormOpen} bill={editing} accounts={accounts} categories={categories} onSuccess={() => router.refresh()} /> : null}
      <PaymentsHistoryDialog bill={paymentsBill} open={!!paymentsBill} onOpenChange={(v) => !v && setPaymentsBill(null)} />
      <RemindersDialog bill={remindersBill} open={!!remindersBill} onOpenChange={(v) => !v && setRemindersBill(null)} />
    </div>
  );
}
