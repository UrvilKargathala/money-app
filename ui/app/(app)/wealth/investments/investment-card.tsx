"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/format";
import { MoreVertical, Pencil, Trash2, TrendingUp } from "lucide-react";
import Link from "next/link";

type Investment = {
  id: string;
  name: string;
  type: string;
  category: string;
  units: string;
  buy_price: string;
  current_price: string;
  updated_at?: string | null;
  purchase_date: string;
  version: number;
};

export function InvestmentCard({ investment, onEdit, onDelete, onUpdatePrice }: { investment: Investment; onEdit: () => void; onDelete: () => void; onUpdatePrice: () => void }) {
  const invested = Number(investment.units) * Number(investment.buy_price);
  const current = Number(investment.units) * Number(investment.current_price);
  const pnl = current - invested;
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
  const updatedDaysAgo = investment.updated_at
    ? Math.floor((Date.now() - new Date(investment.updated_at).getTime()) / 86_400_000)
    : null;
  const staleLabel =
    updatedDaysAgo === null
      ? null
      : updatedDaysAgo <= 0
        ? "updated today"
        : updatedDaysAgo === 1
          ? "updated yesterday"
          : `updated ${updatedDaysAgo}d ago${updatedDaysAgo > 30 ? " • consider refreshing" : ""}`;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <p className="truncate text-sm font-semibold font-heading text-neutral-900">{investment.name}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="default">{investment.type}</Badge>
            <Badge variant="default">{investment.category}</Badge>
            <Badge variant="default">{Number(investment.units)} units</Badge>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${investment.name}`}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link href={`/wealth/investments/${investment.id}`}>View details</Link></DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onUpdatePrice}>
              <TrendingUp className="h-4 w-4" /> Update price
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-error">
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500">Invested</p>
          <p className="text-base font-bold font-heading text-neutral-900">{formatINR(invested)}</p>
        </div>
        <div className="rounded-lg border border-primary-200 bg-primary-50 p-3">
          <p className="text-xs text-primary-700">Current</p>
          <p className="text-base font-bold font-heading text-primary-700">{formatINR(current)}</p>
        </div>
      </div>

      <div className="flex justify-between text-xs">
        <span className={pnl >= 0 ? "text-success font-medium" : "text-error font-medium"}>
          {pnl >= 0 ? "+" : ""}
          {formatINR(pnl)} ({pnlPct.toFixed(1)}%)
        </span>
        <span className="text-neutral-400">Buy {formatINR(Number(investment.buy_price))} • Now {formatINR(Number(investment.current_price))}{staleLabel ? ` • ${staleLabel}` : ""}</span>
      </div>
    </Card>
  );
}
