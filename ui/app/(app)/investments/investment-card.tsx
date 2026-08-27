"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/format";
import { MoreVertical, Pencil, Trash2, TrendingUp } from "lucide-react";

type Investment = {
  id: string;
  name: string;
  type: string;
  category: string;
  units: string;
  buy_price: string;
  current_price: string;
  purchase_date: string;
  version: number;
};

export function InvestmentCard({ investment, onEdit, onDelete, onUpdatePrice }: { investment: Investment; onEdit: () => void; onDelete: () => void; onUpdatePrice: () => void }) {
  const invested = Number(investment.units) * Number(investment.buy_price);
  const current = Number(investment.units) * Number(investment.current_price);
  const pnl = current - invested;
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold font-heading text-neutral-900">{investment.name}</p>
          <p className="text-xs text-neutral-500">
            {investment.type} • {investment.category} • {Number(investment.units)} units
          </p>
          <Badge variant="info" className="mt-1">
            {investment.type}
          </Badge>
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
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500">Invested</p>
          <p className="text-sm font-bold font-heading">{formatINR(invested)}</p>
        </div>
        <div className="rounded-lg bg-primary-50 p-3">
          <p className="text-xs text-primary-700">Current</p>
          <p className="text-sm font-bold font-heading text-primary-700">{formatINR(current)}</p>
        </div>
      </div>

      <div className="flex justify-between text-xs">
        <span className={pnl >= 0 ? "text-success font-medium" : "text-error font-medium"}>
          {pnl >= 0 ? "+" : ""}
          {formatINR(pnl)} ({pnlPct.toFixed(1)}%)
        </span>
        <span className="text-neutral-400">Buy {formatINR(Number(investment.buy_price))} • Now {formatINR(Number(investment.current_price))}</span>
      </div>
    </Card>
  );
}
