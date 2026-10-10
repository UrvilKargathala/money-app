"use client";

import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/format";
import { MoreVertical, Pencil, Power, PowerOff, CheckCircle, SkipForward, CreditCard, Trash2 } from "lucide-react";
import Link from "next/link";

import type { Bill } from "@/lib/entities";

function statusBadge(status: string) {
  switch (status) {
    case "paid":
      return <Badge variant="success">Paid</Badge>;
    case "overdue":
      return <Badge variant="error">Overdue</Badge>;
    case "due_soon":
      return <Badge variant="warning">Due soon</Badge>;
    case "upcoming":
      return <Badge variant="info">Upcoming</Badge>;
    case "skipped":
      return <Badge variant="default">Skipped</Badge>;
    default:
      return <Badge variant="default">{status}</Badge>;
  }
}

// Memoized: parent passes the stable bill object + stable (bill)-param
// callbacks, so rows re-render only when their own data changes.
export const BillCard = memo(function BillCard({
  bill,
  onEdit,
  onDeactivate,
  onReactivate,
  onMarkPaid,
  onSkip,
  onToggleAutopay,
}: {
  bill: Bill;
  onEdit: (bill: Bill) => void;
  onDeactivate: (bill: Bill) => void;
  onReactivate: (bill: Bill) => void;
  onMarkPaid: (bill: Bill) => void;
  onSkip: (bill: Bill) => void;
  onToggleAutopay: (bill: Bill) => void;
}) {
  const displayAmount = bill.amount ?? bill.estimated_amount;
  const isActive = bill.is_active === 1;
  const isPaid = bill.current_period_status === "paid";

  return (
      <Card className={`p-4 space-y-3 ${!isActive ? "opacity-60" : bill.current_period_status === "overdue" ? "border-error/30 bg-tint-error/30 dark:bg-[#7F1D1D]/30" : isPaid ? "border-success/30 bg-tint-success/30 dark:bg-[#064E3B]/30" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold font-heading text-ink-1">{bill.name}</p>
          <p className="text-xs text-ink-3">
            Due day {bill.due_day} • {bill.frequency} {bill.is_autopay ? "• Autopay" : ""} {bill.account_name ? `• ${bill.account_name}` : ""}
          </p>
          {bill.category_name && <p className="text-xs text-neutral-400">{bill.category_name}</p>}
        </div>
        <div className="flex items-center gap-2">
          {statusBadge(bill.current_period_status)}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${bill.name}`}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild><Link href={`/money/bills/${bill.id}`}>View details</Link></DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(bill)}>
                <Pencil className="h-4 w-4" /> Edit
              </DropdownMenuItem>
              {isActive ? (
                <DropdownMenuItem onClick={() => onDeactivate(bill)}>
                  <PowerOff className="h-4 w-4" /> Deactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => onReactivate(bill)}>
                  <Power className="h-4 w-4" /> Reactivate
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onMarkPaid(bill)} disabled={isPaid}>
                <CheckCircle className="h-4 w-4" /> {isPaid ? "Paid this period" : "Mark paid"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSkip(bill)} disabled={isPaid}>
                <SkipForward className="h-4 w-4" /> Skip
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleAutopay(bill)}>
                <CreditCard className="h-4 w-4" /> Toggle autopay
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-ink-3">Amount</p>
          <p className="text-lg font-bold font-heading text-ink-1">{displayAmount != null ? formatINR(displayAmount) : "-"}</p>
        </div>
        {isActive && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onMarkPaid(bill)} disabled={isPaid} variant={isPaid ? "outline" : "default"}>
              <CheckCircle className="h-4 w-4" /> {isPaid ? "Paid" : "Pay"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onSkip(bill)} disabled={isPaid}>
              Skip
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
});
