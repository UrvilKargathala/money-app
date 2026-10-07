"use client";

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/format";
import { MoreVertical, Pencil, ScanSearch, Tags, Trash2 } from "lucide-react";
import Link from "next/link";

type Txn = {
  id: string;
  type: string;
  amount: string;
  description: string | null;
  merchant_clean: string | null;
  category_name: string | null;
  category_color: string | null;
  date: string;
  account_name: string;
  account_color: string | null;
  source: string;
  needs_review: number;
  tags: { id: string; name: string; color: string | null }[];
};

export const TransactionRow = memo(
  function TransactionRow({
    txn,
    onEdit,
    onDelete,
    selected = false,
    onSelectedChange,
    onOrganize,
  }: {
    txn: Txn;
    onEdit: () => void;
    onDelete: () => void;
    selected?: boolean;
    onSelectedChange?: (selected: boolean) => void;
    onOrganize?: () => void;
  }) {
  const isIncome = txn.type === "income";
  const isExpense = txn.type === "expense";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-sunken transition-colors">
      <input type="checkbox" checked={selected} onChange={(event) => onSelectedChange?.(event.target.checked)} aria-label={`Select ${txn.merchant_clean || txn.description || "transaction"}`} className="h-4 w-4 rounded border-neutral-300" />
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-9 w-9 rounded-[10px] flex items-center justify-center shrink-0 text-xs font-bold" style={{ backgroundColor: (txn.account_color || "#2563EB") + "15", color: txn.account_color || "#2563EB" }}>
          {txn.account_name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium font-heading text-ink-1 truncate">
            {txn.merchant_clean || txn.description || (txn.type === "transfer" ? "Transfer" : "Untitled")}
          </p>
          {txn.needs_review ? <Badge variant="secondary" className="mb-1 gap-1 text-[10px]"><ScanSearch className="h-3 w-3" />Needs review</Badge> : txn.source === "import" ? <Badge variant="outline" className="mb-1 text-[10px]">Imported</Badge> : null}
          <div className="flex items-center gap-2 text-xs text-ink-3">
            <span>{txn.category_name || "Uncategorized"}</span>
            <span>•</span>
            <span>{txn.account_name}</span>
            <span>•</span>
            <span>{new Date(txn.date).toLocaleDateString("en-IN")}</span>
          </div>
          {txn.tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {txn.tags.map((t) => (
                <Badge key={t.id} variant="default" className="text-[10px] px-1.5 py-0">
                  {t.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-sm font-semibold font-heading tabular-nums ${isIncome ? "text-success" : isExpense ? "text-error" : "text-ink-2"}`}>
          {isIncome ? "+" : isExpense ? "-" : ""}
          {formatINR(Number(txn.amount))}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Transaction actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link href={`/money/transactions/${txn.id}`}>View details</Link></DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOrganize}><Tags className="h-4 w-4" /> Tags and splits</DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-error">
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
},
(prev, next) =>
  // Callbacks are inline closures with behavior constant across renders
  // (functional setState only), so identity is data + selection.
  prev.txn === next.txn && prev.selected === next.selected
);
