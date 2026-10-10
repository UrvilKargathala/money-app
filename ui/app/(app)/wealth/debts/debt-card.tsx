"use client";

import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/format";
import { MoreVertical, Pencil, Trash2, Archive, ArchiveRestore } from "lucide-react";
import Link from "next/link";

import type { Debt } from "@/lib/entities";

// Memoized: parent passes the stable debt object + stable (debt)-param
// callbacks, so cards re-render only when their own data changes.
export const DebtCard = memo(function DebtCard({
  debt,
  onEdit,
  onDelete,
  onClose,
  onReopen,
}: {
  debt: Debt;
  onEdit: (debt: Debt) => void;
  onDelete: (debt: Debt) => void;
  onClose: (debt: Debt) => void;
  onReopen: (debt: Debt) => void;
}) {
  const outstanding = Number(debt.principal_outstanding);
  const emi = Number(debt.emi_amount);
  const rate = Number(debt.interest_rate);

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold font-heading text-ink-1">{debt.name}</p>
          <p className="text-xs text-ink-3">
            {debt.type.replace(/_/g, " ")} • {rate}% • {debt.tenure_months}m
          </p>
          <p className="text-xs text-neutral-400">Start {new Date(debt.start_date).toLocaleDateString("en-IN")}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${debt.name}`}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link href={`/wealth/debts/${debt.id}`}>View details</Link></DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(debt)}>
              <Pencil className="h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onClose(debt)}>
              <Archive className="h-4 w-4" /> Close
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onReopen(debt)}>
              <ArchiveRestore className="h-4 w-4" /> Reopen
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(debt)} className="text-error">
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-lg bg-sunken p-3">
          <p className="text-xs text-ink-3">Outstanding</p>
          <p className="text-sm font-bold font-heading text-ink-1">{formatINR(outstanding)}</p>
        </div>
          <div className="rounded-lg bg-tint-info p-3 dark:bg-[#1E1E1E]/50">
          <p className="text-xs text-primary-700">EMI</p>
          <p className="text-sm font-bold font-heading text-primary-700">{formatINR(emi)}</p>
        </div>
      </div>
    </Card>
  );
});
