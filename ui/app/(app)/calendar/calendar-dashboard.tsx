"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { Calendar, Plus, Trash2, Copy, ChevronLeft, ChevronRight, Clock, TrendingUp, Landmark, Wallet } from "lucide-react";
import { createCalendarEvent, deleteCalendarEventAction, duplicateCalendarEventAction } from "./actions";
import { useActionState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { formatINR } from "@/lib/format";

type CalendarEvent = {
  date: string;
  source: string;
  label: string;
  kind: "inflow" | "outflow" | "info" | string;
  amount: number | null;
  color: string;
  deep_link: string;
  status?: string;
  event_id?: string;
  account_id?: string | null;
};

type Upcoming = {
  window_days: number;
  net_cashflow: number;
  days: { date: string; inflow_total: number; outflow_total: number; events: CalendarEvent[] }[];
};

type TaxDeadlines = {
  year: number;
  deadlines: { date: string; label: string; description: string; past: boolean }[];
};

type Cashflow = {
  projections: {
    account_id: string;
    account_name: string;
    balance_today: number;
    balance_plus7: number;
    balance_plus30: number;
    negative_days: string[];
  }[];
};

// Also support legacy upcoming shape for backwards compat
type LegacyUpcoming = { date: string; events: { title: string; amount: number | null; type: string }[]; total: number }[];

function sourceDot(source: string): string {
  switch (source) {
    case "bill":
      return "bg-red-500";
    case "subscription":
      return "bg-orange-500";
    case "sip":
      return "bg-blue-500";
    case "goal":
      return "bg-amber-500";
    case "tax_deadline":
      return "bg-purple-500";
    case "custom":
      return "bg-zinc-400";
    case "debt_emi":
      return "bg-red-600";
    case "investment_maturity":
      return "bg-emerald-500";
    case "recurring":
      return "bg-teal-500";
    default:
      return "bg-neutral-400";
  }
}

function sourceBadgeVariant(source: string): string {
  switch (source) {
    case "bill":
      return "bg-red-100 text-red-700 border border-red-200";
    case "subscription":
      return "bg-orange-100 text-orange-700 border border-orange-200";
    case "sip":
      return "bg-blue-100 text-blue-700 border border-blue-200";
    case "goal":
      return "bg-amber-100 text-amber-800 border border-amber-200";
    case "tax_deadline":
      return "bg-purple-100 text-purple-700 border border-purple-200";
    case "custom":
      return "bg-zinc-100 text-zinc-700 border border-zinc-200";
    case "debt_emi":
      return "bg-red-100 text-red-800 border border-red-200";
    case "investment_maturity":
      return "bg-emerald-100 text-emerald-700 border border-emerald-200";
    case "recurring":
      return "bg-teal-100 text-teal-700 border border-teal-200";
    default:
      return "bg-neutral-100 text-neutral-600 border border-neutral-200";
  }
}

function kindBadge(kind: string): string {
  if (kind === "inflow") return "bg-success-light text-success-dark border border-success/20";
  if (kind === "outflow") return "bg-error-light text-error-dark border border-error/20";
  return "bg-neutral-100 text-neutral-600 border border-neutral-200";
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function CalendarDashboard({
  events,
  dayCounts,
  month,
  year,
  upcoming,
  taxDeadlines,
  cashflow,
  // legacy prop support
  legacyUpcoming,
}: {
  events: CalendarEvent[];
  dayCounts?: Record<string, number>;
  month: number;
  year: number;
  upcoming: Upcoming | null;
  taxDeadlines: TaxDeadlines | null;
  cashflow: Cashflow | null;
  legacyUpcoming?: LegacyUpcoming;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createCalendarEvent, null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"grid" | "list">("grid");
  const [upcomingWindow, setUpcomingWindow] = useState<7 | 30>((upcoming?.window_days as 7 | 30) ?? 30);

  useEffect(() => {
    if (state?.success) {
      toast.success("Event created");
      setFormOpen(false);
      router.refresh();
    }
    if (state?.error) toast.error(state.error);
    if (state?.fieldErrors) {
      const msg = Object.values(state.fieldErrors).join(", ");
      if (msg) toast.error(msg);
    }
  }, [state, router]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    const res = await deleteCalendarEventAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Deleted");
      router.refresh();
    }
  };

  const handleDuplicate = async (id: string) => {
    const res = await duplicateCalendarEventAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Duplicated");
      router.refresh();
    }
  };

  // Group events by date
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const d = e.date.slice(0, 10);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(e);
    }
    return m;
  }, [events]);

  const sortedDates = useMemo(() => Array.from(byDate.keys()).sort(), [byDate]);

  // Month grid calc
  const grid = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startWeekday = first.getDay(); // 0 Sun
    const dim = daysInMonth(year, month);
    const total = Math.ceil((startWeekday + dim) / 7) * 7;
    const cells: { date: Date; iso: string; inMonth: boolean }[] = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(year, month - 1, 1 - startWeekday + i);
      const iso = toISO(d);
      cells.push({ date: d, iso, inMonth: d.getMonth() === month - 1 });
    }
    return cells;
  }, [month, year]);

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const navigateMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    router.push(`/calendar?month=${m}&year=${y}`);
  };

  const selectedEvents = useMemo(() => (selectedDate ? byDate.get(selectedDate) ?? [] : []), [selectedDate, byDate]);

  // Totals for day detail
  const selectedTotals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const ev of selectedEvents) {
      if (ev.kind === "inflow") inflow += ev.amount ?? 0;
      else if (ev.kind === "outflow") outflow += ev.amount ?? 0;
    }
    return { inflow, outflow };
  }, [selectedEvents]);

  // Upcoming filtered for window toggle
  const upcomingDays = useMemo(() => {
    if (!upcoming) return [];
    if (upcomingWindow === 7) {
      const cutoff = new Date();
      cutoff.setHours(0, 0, 0, 0);
      const horizon = new Date(cutoff);
      horizon.setDate(horizon.getDate() + 7);
      const horizonIso = toISO(horizon);
      const todayIso = toISO(cutoff);
      return upcoming.days.filter((d) => d.date >= todayIso && d.date <= horizonIso);
    }
    return upcoming.days;
  }, [upcoming, upcomingWindow]);

  // Also support legacy upcoming if new shape missing
  const legacyUp = legacyUpcoming ?? [];

  const cashflowProjections = cashflow?.projections ?? [];
  const taxList = taxDeadlines?.deadlines ?? [];

  const totalEvents = events.length;
  const upcomingCount = upcoming ? upcoming.days.reduce((a, d) => a + d.events.length, 0) : legacyUp.reduce((a, d) => a + d.events.length, 0);
  const netCashflow = upcoming?.net_cashflow ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-neutral-900">Calendar</h1>
          <p className="text-sm text-neutral-500 font-body mt-1">
            {totalEvents} events • Financial timeline • {monthLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-neutral-200 bg-white">
            <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm font-medium font-heading min-w-[140px] text-center">{monthLabel}</span>
            <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Add Event
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Events this month" value={String(totalEvents)} subtext={`${sortedDates.length} days with events`} icon={<Calendar className="h-5 w-5" />} variant="primary" />
        <StatCard label="Upcoming" value={String(upcomingCount)} subtext={`${upcoming?.window_days ?? upcomingWindow} days • Net ${formatINR(netCashflow)}`} icon={<Clock className="h-5 w-5" />} variant="amber" />
        <StatCard label="Cashflow accounts" value={String(cashflowProjections.length)} subtext={cashflowProjections.some((p) => p.negative_days.length > 0) ? `${cashflowProjections.filter((p) => p.negative_days.length > 0).length} with negative days` : "All positive"} icon={<Wallet className="h-5 w-5" />} variant="teal" />
      </div>

      {/* Legend */}
      <Card className="p-4">
        <p className="text-xs font-medium text-neutral-500 mb-2">Legend — color coded by type</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Bill", cls: "bg-red-500" },
            { label: "Subscription", cls: "bg-orange-500" },
            { label: "SIP", cls: "bg-blue-500" },
            { label: "Goal", cls: "bg-amber-500" },
            { label: "Tax", cls: "bg-purple-500" },
            { label: "Custom", cls: "bg-zinc-400" },
            { label: "Debt EMI", cls: "bg-red-600" },
            { label: "Maturity", cls: "bg-emerald-500" },
            { label: "Recurring", cls: "bg-teal-500" },
          ].map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5 text-xs">
              <span className={`h-2.5 w-2.5 rounded-full ${l.cls}`} /> {l.label}
            </span>
          ))}
        </div>
      </Card>

      {/* Grid vs List */}
      <Card className="p-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "grid" | "list")}>
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="grid">Month Grid</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
            </TabsList>
            <p className="text-xs text-neutral-500 hidden sm:block">Click a date to view details • All data from API</p>
          </div>

          <TabsContent value="grid" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              {/* Month grid */}
              <div>
                <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden border border-neutral-200 bg-neutral-200">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="bg-neutral-50 py-2 text-center text-xs font-semibold text-neutral-500">
                      {d}
                    </div>
                  ))}
                  {grid.map((cell) => {
                    const dayEvents = byDate.get(cell.iso) ?? [];
                    const isToday = cell.iso === new Date().toISOString().slice(0, 10);
                    const isSelected = cell.iso === selectedDate;
                    const countFromApi = dayCounts?.[cell.iso] ?? dayEvents.length;
                    return (
                      <button
                        key={cell.iso}
                        onClick={() => setSelectedDate(cell.iso)}
                        className={`min-h-[88px] p-1.5 text-left bg-white hover:bg-neutral-50 transition-colors flex flex-col ${!cell.inMonth ? "bg-neutral-50/60 text-neutral-400" : ""} ${isSelected ? "ring-2 ring-primary-600 ring-inset" : ""} ${isToday ? "bg-primary-50/60" : ""}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-medium rounded-full h-6 w-6 flex items-center justify-center ${isToday ? "bg-primary-600 text-white" : isSelected ? "bg-neutral-900 text-white" : "text-neutral-700"}`}>
                            {cell.date.getDate()}
                          </span>
                          {countFromApi > 0 && <span className="text-[10px] font-medium text-neutral-500">{countFromApi}</span>}
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {dayEvents.slice(0, 3).map((ev, idx) => (
                            <div key={`${ev.source}-${ev.label}-${idx}`} className="flex items-center gap-1 truncate">
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${sourceDot(ev.source)}`} />
                              <span className="text-[11px] truncate text-neutral-700">{ev.label}</span>
                              {ev.amount != null && <span className="text-[10px] text-neutral-500 truncate ml-auto">{formatINR(ev.amount).replace("₹", "").trim().slice(0, 6)}</span>}
                            </div>
                          ))}
                          {dayEvents.length > 3 && <p className="text-[10px] text-neutral-500">+{dayEvents.length - 3} more</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {events.length === 0 && (
                  <div className="mt-4">
                    <EmptyState icon={<Calendar className="h-6 w-6" />} title="No events this month" description="Add a custom event or view derived events from bills, subscriptions and SIPs." actionLabel="Add Event" onAction={() => setFormOpen(true)} />
                  </div>
                )}
              </div>

              {/* Day detail panel */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold font-heading text-neutral-800">Day Detail</h3>
                  {selectedDate && <span className="text-xs text-neutral-500">{new Date(selectedDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>}
                </div>
                {!selectedDate ? (
                  <Card className="p-6 bg-neutral-50 border-dashed">
                    <p className="text-sm text-neutral-500 text-center">Click a date in the grid to view events with amounts.</p>
                    <p className="text-xs text-neutral-400 text-center mt-1">{totalEvents} events in {monthLabel}</p>
                  </Card>
                ) : selectedEvents.length === 0 ? (
                  <Card className="p-6">
                    <p className="text-sm text-neutral-500">No events on {selectedDate}</p>
                    <p className="text-xs text-neutral-400 mt-1">Day totals: inflow {formatINR(0)} • outflow {formatINR(0)}</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => setFormOpen(true)}>
                      <Plus className="h-3 w-3" /> Add event on this date
                    </Button>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    <Card className="p-3 bg-neutral-50">
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-500">Inflow</span>
                        <span className="font-semibold text-success">{formatINR(selectedTotals.inflow)}</span>
                      </div>
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-neutral-500">Outflow</span>
                        <span className="font-semibold text-error">{formatINR(selectedTotals.outflow)}</span>
                      </div>
                      <div className="flex justify-between text-xs mt-1 border-t pt-1">
                        <span className="text-neutral-500">Net</span>
                        <span className="font-bold">{formatINR(selectedTotals.inflow - selectedTotals.outflow)}</span>
                      </div>
                    </Card>
                    <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                      {selectedEvents.map((ev, i) => (
                        <Card key={`${ev.source}-${ev.label}-${ev.date}-${i}`} className="p-3 flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`h-2 w-2 rounded-full ${sourceDot(ev.source)}`} />
                              <p className="text-sm font-medium font-heading truncate">{ev.label}</p>
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceBadgeVariant(ev.source)}`}>{ev.source}</span>
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${kindBadge(ev.kind)}`}>{ev.kind}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">
                              {ev.amount != null ? formatINR(ev.amount) : "No amount"} {ev.status ? `• ${ev.status}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {ev.source === "custom" && ev.event_id && (
                              <Button variant="ghost" size="icon" onClick={() => handleDuplicate(ev.event_id!)} title="Duplicate">
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                            {ev.source === "custom" && ev.event_id && (
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(ev.event_id!)} title="Delete">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="list" className="space-y-6">
            {events.length === 0 ? (
              <EmptyState icon={<Calendar className="h-6 w-6" />} title="No events" description="Add a custom event or view derived events from bills, subscriptions and SIPs." actionLabel="Add Event" onAction={() => setFormOpen(true)} />
            ) : (
              <div className="space-y-6">
                {sortedDates.map((d) => (
                  <div key={d}>
                    <h3 className="text-sm font-semibold font-heading text-neutral-700 mb-2">
                      {new Date(d).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </h3>
                    <div className="space-y-2">
                      {byDate.get(d)!.map((ev, idx) => (
                        <Card key={`${ev.source}-${ev.label}-${idx}-${ev.event_id ?? idx}`} className="p-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`h-2 w-2 rounded-full ${sourceDot(ev.source)}`} />
                              <p className="text-sm font-medium font-heading truncate">{ev.label}</p>
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceBadgeVariant(ev.source)}`}>{ev.source}</span>
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${kindBadge(ev.kind)}`}>{ev.kind}</span>
                            </div>
                            <p className="text-xs text-neutral-500">
                              {ev.amount != null ? formatINR(ev.amount) : "No amount"} {ev.status ? `• ${ev.status}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {ev.source === "custom" && ev.event_id && (
                              <Button variant="ghost" size="icon" onClick={() => handleDuplicate(ev.event_id!)} title="Duplicate">
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                            {ev.source === "custom" && ev.event_id ? (
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(ev.event_id!)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">derived</Badge>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* Upcoming + Tax + Cashflow */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upcoming */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold font-heading text-neutral-800 flex items-center gap-2">
              <Clock className="h-4 w-4" /> Upcoming
            </h3>
            <div className="flex gap-1">
              <Button variant={upcomingWindow === 7 ? "default" : "outline"} size="sm" onClick={() => setUpcomingWindow(7)} className="h-7 px-2 text-xs">
                7 days
              </Button>
              <Button variant={upcomingWindow === 30 ? "default" : "outline"} size="sm" onClick={() => setUpcomingWindow(30)} className="h-7 px-2 text-xs">
                30 days
              </Button>
            </div>
          </div>
          {upcoming && upcomingDays.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">Window {upcoming.window_days} days • Net {formatINR(upcoming.net_cashflow)} • Showing {upcomingDays.length} days • All from API</p>
              <div className="space-y-3 max-h-[400px] overflow-auto pr-1">
                {upcomingDays.map((u) => (
                  <div key={u.date} className="border-b last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{new Date(u.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</p>
                      <span className="text-xs text-neutral-500">
                        In {formatINR(u.inflow_total)} • Out {formatINR(u.outflow_total)}
                      </span>
                    </div>
                    <div className="space-y-1 mt-1">
                      {u.events.map((ev, i) => (
                        <div key={i} className="flex justify-between text-xs text-neutral-600 gap-2">
                          <span className="flex items-center gap-1.5 truncate">
                            <span className={`h-1.5 w-1.5 rounded-full ${sourceDot(ev.source)}`} /> {ev.label}
                            <span className={`inline-flex px-1 py-0 rounded text-[10px] font-medium ${sourceBadgeVariant(ev.source)}`}>{ev.source}</span>
                          </span>
                          {ev.amount != null && <span className="shrink-0 font-medium">{formatINR(ev.amount)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : legacyUp.length > 0 ? (
            <div className="space-y-3">
              {legacyUp.slice(0, 5).map((u) => (
                <div key={u.date} className="border-b last:border-0 pb-3 last:pb-0">
                  <p className="text-sm font-medium">{new Date(u.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} — {formatINR(u.total)}</p>
                  <div className="space-y-1 mt-1">
                    {u.events.map((ev, i) => (
                      <div key={i} className="flex justify-between text-xs text-neutral-600">
                        <span>
                          {ev.title} <Badge variant="default" className="ml-1 text-[10px]">{ev.type}</Badge>
                        </span>
                        {ev.amount != null && <span>{formatINR(ev.amount)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No upcoming events in next {upcomingWindow} days.</p>
          )}
        </Card>

        {/* Tax deadlines */}
        <Card className="p-6">
          <h3 className="font-semibold font-heading text-neutral-800 mb-3 flex items-center gap-2">
            <Landmark className="h-4 w-4" /> Tax Deadlines {taxDeadlines ? `• ${taxDeadlines.year}` : ""}
          </h3>
          {taxList.length > 0 ? (
            <div className="space-y-2 max-h-[400px] overflow-auto pr-1">
              {taxList.map((t) => (
                <div key={t.date} className={`rounded-lg border p-3 ${t.past ? "bg-neutral-50 border-neutral-100 opacity-70" : "bg-purple-50/50 border-purple-100"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium font-heading">{t.label}</p>
                      <p className="text-xs text-neutral-500">{t.description}</p>
                    </div>
                    <Badge variant={t.past ? "default" : "secondary"} className="shrink-0 text-[10px]">
                      {t.past ? "past" : "upcoming"}
                    </Badge>
                  </div>
                  <p className="text-xs font-medium mt-1 text-neutral-600">{new Date(t.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
              ))}
              <p className="text-xs text-neutral-400">{taxList.length} deadlines • Registry from API</p>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No tax deadlines found.</p>
          )}
        </Card>

        {/* Cashflow projection */}
        <Card className="p-6">
          <h3 className="font-semibold font-heading text-neutral-800 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Cashflow Projection
          </h3>
          {cashflowProjections.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">{cashflowProjections.length} accounts • Daily balances • All from API</p>
              <div className="space-y-3 max-h-[400px] overflow-auto pr-1">
                {cashflowProjections.map((p) => (
                  <div key={p.account_id} className="rounded-lg border border-neutral-100 p-3 space-y-2">
                    <p className="text-sm font-medium font-heading">{p.account_name}</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-neutral-500">Today</p>
                        <p className="font-semibold">{formatINR(p.balance_today)}</p>
                      </div>
                      <div>
                        <p className="text-neutral-500">+7 days</p>
                        <p className={`font-semibold ${p.balance_plus7 < 0 ? "text-error" : ""}`}>{formatINR(p.balance_plus7)}</p>
                      </div>
                      <div>
                        <p className="text-neutral-500">+30 days</p>
                        <p className={`font-semibold ${p.balance_plus30 < 0 ? "text-error" : ""}`}>{formatINR(p.balance_plus30)}</p>
                      </div>
                    </div>
                    {p.negative_days.length > 0 ? (
                      <div className="rounded bg-error-light/50 p-2">
                        <p className="text-xs font-medium text-error-dark">Negative on {p.negative_days.length} days</p>
                        <p className="text-[11px] text-error-dark/80 break-all">{p.negative_days.slice(0, 5).join(", ")}{p.negative_days.length > 5 ? ` +${p.negative_days.length - 5} more` : ""}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-success">No negative balances in projection</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No cashflow projection available. Add accounts with balances.</p>
          )}
        </Card>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add calendar event</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cal-title">Title *</Label>
              <Input id="cal-title" name="title" placeholder="Diwali bonus, Tax deadline" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cal-date">Date *</Label>
                <Input id="cal-date" name="date" type="date" defaultValue={selectedDate ?? new Date().toISOString().slice(0, 10)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cal-amount">Amount</Label>
                <Input id="cal-amount" name="amount" type="number" step="0.01" placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cal-type">Type</Label>
              <Input id="cal-type" name="type" placeholder="custom" defaultValue="custom" />
              <p className="text-xs text-neutral-400">Use income / expense / reminder / other for kind mapping. Custom events support duplicate.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
