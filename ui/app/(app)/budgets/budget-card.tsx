"use client";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/format";
import { MoreVertical, Pencil, Trash2, PieChart } from "lucide-react";

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
};

function getProgressColor(pct: number) {
  if (pct >= 100) return "bg-error";
  if (pct >= 80) return "bg-warning";
  if (pct >= 50) return "bg-warning";
  return "bg-primary-600";
}

function getBadgeVariant(pct: number) {
  if (pct >= 100) return "error" as const;
  if (pct >= 80) return "warning" as const;
  if (pct >= 50) return "warning" as const;
  return "success" as const;
}

export function BudgetCard({
  budget,
  onEdit,
  onDelete,
  onBreakdown,
}: {
  budget: Budget;
  onEdit: () => void;
  onDelete: () => void;
  onBreakdown: () => void;
}) {
  const amount = Number(budget.amount);
  const pct = Math.min(budget.utilization_pct, 100);
  const isOver = budget.is_over_budget === 1 || budget.utilization_pct > 100;

  return (
    <Card className={`p-5 space-y-3 ${isOver ? "border-error/20 bg-error-light/50" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold font-heading text-neutral-900">{budget.category_name || "Overall Budget"}</p>
          <p className="text-xs text-neutral-500">Monthly • {formatINR(amount)} budgeted</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={getBadgeVariant(budget.utilization_pct)}>{budget.utilization_pct.toFixed(1)}%</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onBreakdown}>
                <PieChart className="h-4 w-4" /> Breakdown
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-error">
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Progress value={pct} indicatorClassName={getProgressColor(budget.utilization_pct)} />

      <div className="flex justify-between text-xs">
        <span className={isOver ? "text-error font-medium" : "text-neutral-600"}>
          Spent {formatINR(budget.spent)}
        </span>
        <span className={isOver ? "text-error font-medium" : "text-neutral-500"}>
          {isOver ? "Over by " + formatINR(Math.abs(budget.remaining)) : "Remaining " + formatINR(budget.remaining)}
        </span>
      </div>
    </Card>
  );
}
