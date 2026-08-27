"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/format";
import { MoreVertical, Pencil, Trash2, Archive, ArchiveRestore } from "lucide-react";

type Debt = {
  id: string;
  name: string;
  type: string;
  principal_original: string;
  principal_outstanding: string;
  interest_rate: string;
  emi_amount: string;
  tenure_months: number;
  start_date: string;
  version: number;
};

export function DebtCard({
  debt,
  onEdit,
  onDelete,
  onClose,
  onReopen,
}: {
  debt: Debt;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onReopen: () => void;
}) {
  const outstanding = Number(debt.principal_outstanding);
  const emi = Number(debt.emi_amount);
  const rate = Number(debt.interest_rate);

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold font-heading text-neutral-900">{debt.name}</p>
          <p className="text-xs text-neutral-500">
            {debt.type.replace(/_/g, " ")} • {rate}% • {debt.tenure_months}m
          </p>
          <p className="text-xs text-neutral-400">Start {new Date(debt.start_date).toLocaleDateString("en-IN")}</p>
        </div>
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
            <DropdownMenuItem onClick={onClose}>
              <Archive className="h-4 w-4" /> Close
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onReopen}>
              <ArchiveRestore className="h-4 w-4" /> Reopen
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-error">
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500">Outstanding</p>
          <p className="text-sm font-bold font-heading text-neutral-900">{formatINR(outstanding)}</p>
        </div>
        <div className="rounded-lg bg-primary-50 p-3">
          <p className="text-xs text-primary-700">EMI</p>
          <p className="text-sm font-bold font-heading text-primary-700">{formatINR(emi)}</p>
        </div>
      </div>
    </Card>
  );
}
