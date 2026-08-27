"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/format";
import { MoreVertical, Pencil, Power, PowerOff, CheckCircle, SkipForward, CreditCard, Trash2 } from "lucide-react";

type Bill = {
  id: string;
  name: string;
  amount: number | null;
  estimated_amount: number | null;
  due_day: number;
  frequency: string;
  account_name: string | null;
  category_name: string | null;
  is_autopay: number;
  current_period_status: string;
  is_active: number;
  version: number;
};

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

export function BillCard({
  bill,
  onEdit,
  onDeactivate,
  onReactivate,
  onMarkPaid,
  onSkip,
  onToggleAutopay,
}: {
  bill: Bill;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onMarkPaid: () => void;
  onSkip: () => void;
  onToggleAutopay: () => void;
}) {
  const displayAmount = bill.amount ?? bill.estimated_amount;
  const isActive = bill.is_active === 1;

  return (
    <Card className={`p-4 space-y-3 ${!isActive ? "opacity-60" : bill.current_period_status === "overdue" ? "border-error/30 bg-error-light/30" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold font-heading text-neutral-900">{bill.name}</p>
          <p className="text-xs text-neutral-500">
            Due day {bill.due_day} • {bill.frequency} {bill.is_autopay ? "• Autopay" : ""} {bill.account_name ? `• ${bill.account_name}` : ""}
          </p>
          {bill.category_name && <p className="text-xs text-neutral-400">{bill.category_name}</p>}
        </div>
        <div className="flex items-center gap-2">
          {statusBadge(bill.current_period_status)}
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
              {isActive ? (
                <DropdownMenuItem onClick={onDeactivate}>
                  <PowerOff className="h-4 w-4" /> Deactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onReactivate}>
                  <Power className="h-4 w-4" /> Reactivate
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onMarkPaid}>
                <CheckCircle className="h-4 w-4" /> Mark paid
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSkip}>
                <SkipForward className="h-4 w-4" /> Skip
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleAutopay}>
                <CreditCard className="h-4 w-4" /> Toggle autopay
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-neutral-500">Amount</p>
          <p className="text-lg font-bold font-heading text-neutral-900">{displayAmount != null ? formatINR(displayAmount) : "—"}</p>
        </div>
        {isActive && (
          <div className="flex gap-2">
            <Button size="sm" onClick={onMarkPaid}>
              <CheckCircle className="h-4 w-4" /> Pay
            </Button>
            <Button size="sm" variant="outline" onClick={onSkip}>
              Skip
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
