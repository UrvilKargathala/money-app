"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { useDeleteConfirm } from "@/components/common/confirm-dialog";
import { BudgetCard } from "./budget-card";
import { formatINR } from "@/lib/format";
import { PiggyBank, Plus, ChevronLeft, ChevronRight, AlertTriangle, Download } from "lucide-react";
import { deleteBudgetAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Dialogs are code-split (ssr:false) and mount only when opened. The inline
// breakdown Dialog below stays (in-file, out of scope for the split).
const BudgetFormDialog = dynamic(
  () => import("./budget-form-dialog").then((m) => m.BudgetFormDialog),
  { ssr: false }
);
const ConfirmDialog = dynamic(
  () => import("@/components/common/confirm-dialog").then((m) => m.ConfirmDialog),
  { ssr: false }
);

type Budget = {
  id: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  amount: string;
  spent: number;
  remaining: number;
  utilization_pct: number;
  is_over_budget: number;
  version: number;
  month: number;
  year: number;
};

type Overview = {
  total_budgeted: number;
  total_spent: number;
  utilization_pct: number;
  over_budget_count: number;
  budgeted_count: number;
  unbudgeted: { category_id: string; name: string; spent: number }[];
};

export function BudgetsDashboard({
  budgets,
  overview,
  categories,
  month,
  year,
  initialCreate = false,
}: {
  budgets: Budget[];
  overview: Overview | null;
  categories: { id: string; name: string }[];
  month: number;
  year: number;
  initialCreate?: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(initialCreate);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [breakdown, setBreakdown] = useState<{ id: string; items: { name: string; spent: number; share_pct: number }[] } | null>(null);

  const [confirmState, closeConfirm, confirmDelete] = useDeleteConfirm();

  const handleDelete = (id: string) => {
    confirmDelete({
      title: "Delete this budget?",
      description: "Rollovers and alerts for this budget go with it. This cannot be undone.",
      onDelete: () => deleteBudgetAction(id),
      successMsg: "Budget deleted",
      onDone: () => router.refresh(),
    });
  };

  const breakdownReq = useRef(0);
  const handleBreakdown = async (id: string) => {
    const reqId = ++breakdownReq.current;
    try {
      const res = await fetch(`/api/budgets/${id}/breakdown`);
      const data = await res.json();
      if (breakdownReq.current !== reqId) return;
      if (res.ok) setBreakdown({ id, items: data.breakdown || data.items || [] });
      else toast.error("Could not load breakdown");
    } catch {
      if (breakdownReq.current === reqId) toast.error("Could not load breakdown");
    }
  };

  const prevMonth = () => {
    let m = month - 1, y = year;
    if (m < 1) { m = 12; y--; }
    router.push(`/money/budgets?month=${m}&year=${y}`);
  };
  const nextMonth = () => {
    let m = month + 1, y = year;
    if (m > 12) { m = 1; y++; }
    router.push(`/money/budgets?month=${m}&year=${y}`);
  };

  const monthName = new Date(year, month - 1).toLocaleString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-ink-1">Budgets</h1>
          <p className="text-sm text-ink-3 font-body mt-1">Track spending vs plan for {monthName}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/budgets/export?month=${month}&year=${year}`} download>
              <Download className="h-4 w-4" /> Export
            </a>
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Budget
          </Button>
        </div>
      </div>

      <Card className="p-4 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="font-semibold font-heading text-ink-1">{monthName}</span>
        <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="Next month">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </Card>

      {overview && (
        <div className="grid gap-6 md:grid-cols-3">
          <StatCard label="Total Budgeted" value={formatINR(overview.total_budgeted)} icon={<PiggyBank className="h-5 w-5" />} variant="primary" />
          <StatCard label="Total Spent" value={formatINR(overview.total_spent)} subtext={`${overview.utilization_pct.toFixed(1)}% used`} icon={<PiggyBank className="h-5 w-5" />} variant="warning" />
          <StatCard
            label="Over Budget"
            value={String(overview.over_budget_count)}
            subtext={`${overview.budgeted_count} budgets`}
            icon={<AlertTriangle className="h-5 w-5" />}
            variant="rose"
          />
        </div>
      )}

      {budgets.length === 0 ? (
        <EmptyState
          icon={<PiggyBank className="h-6 w-6" />}
          title="No budgets for this month"
          description={`Create a budget for ${monthName} to start tracking utilization. Budgets are per category or overall.`}
          actionLabel="Create Budget"
          onAction={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {budgets.map((b) => (
            <BudgetCard
              key={b.id}
              budget={b}
              onEdit={() => {
                setEditing(b);
                setFormOpen(true);
              }}
              onDelete={() => handleDelete(b.id)}
              onBreakdown={() => handleBreakdown(b.id)}
            />
          ))}
        </div>
      )}

      {overview?.unbudgeted && overview.unbudgeted.length > 0 && (
        <Card className="p-6">
          <h2 className="font-semibold font-heading text-ink-1 mb-3">Unbudgeted Spending</h2>
          <div className="space-y-2">
            {overview.unbudgeted.map((u) => (
              <div key={u.category_id} className="flex justify-between text-sm">
                <span className="text-ink-2">{u.name}</span>
                <span className="font-medium text-error">{formatINR(u.spent)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {formOpen ? <BudgetFormDialog open={formOpen} onOpenChange={setFormOpen} budget={editing} categories={categories} month={month} year={year} onSuccess={() => router.refresh()} /> : null}

      <Dialog open={!!breakdown} onOpenChange={() => setBreakdown(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Breakdown</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {breakdown?.items.length === 0 ? (
              <p className="text-sm text-ink-3">No breakdown data.</p>
            ) : (
              breakdown?.items.map((item) => (
                <div key={item.name} className="flex justify-between text-sm border-b py-2 last:border-0">
                  <span>{item.name}</span>
                  <span className="font-medium">{formatINR(item.spent)} ({item.share_pct.toFixed(1)}%)</span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      {confirmState ? <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} /> : null}
    </div>
  );
}
