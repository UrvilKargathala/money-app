"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatINR } from "@/lib/format";
import { MoreVertical, Pencil, Trash2, Pause, Play, RefreshCw } from "lucide-react";

type Sub = {
  id: string;
  service_name: string;
  amount: number;
  frequency: string;
  next_renewal_date: string;
  account_name: string | null;
  status: string;
  days_until_renewal: number;
  version: number;
};

function statusBadge(s: string) {
  switch (s) {
    case "active":
      return <Badge variant="success">Active</Badge>;
    case "paused":
      return <Badge variant="warning">Paused</Badge>;
    case "cancelled":
      return <Badge variant="default">Cancelled</Badge>;
    default:
      return <Badge variant="default">{s}</Badge>;
  }
}

export function SubscriptionCard({
  sub,
  onEdit,
  onCancel,
  onPause,
  onResume,
  onRenew,
}: {
  sub: Sub;
  onEdit: () => void;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
  onRenew: () => void;
}) {
  const isActive = sub.status === "active";
  const isPaused = sub.status === "paused";

  return (
    <Card className={`p-4 space-y-3 ${!isActive && !isPaused ? "opacity-60" : sub.days_until_renewal <= 3 && isActive ? "border-warning/30 bg-warning-light/30" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold font-heading text-neutral-900">{sub.service_name}</p>
          <p className="text-xs text-neutral-500">
            {sub.frequency} • {sub.account_name || "No account"} • {sub.days_until_renewal >= 0 ? `Renews in ${sub.days_until_renewal}d` : "Overdue"}
          </p>
          <p className="text-xs text-neutral-400">Next: {new Date(sub.next_renewal_date).toLocaleDateString("en-IN")}</p>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge(sub.status)}
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
              {isActive && (
                <DropdownMenuItem onClick={onPause}>
                  <Pause className="h-4 w-4" /> Pause
                </DropdownMenuItem>
              )}
              {isPaused && (
                <DropdownMenuItem onClick={onResume}>
                  <Play className="h-4 w-4" /> Resume
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onRenew}>
                <RefreshCw className="h-4 w-4" /> Renew
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onCancel} className="text-error">
                <Trash2 className="h-4 w-4" /> Cancel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-neutral-500">Amount</p>
          <p className="text-lg font-bold font-heading text-neutral-900">{formatINR(sub.amount)}</p>
        </div>
        {isActive && (
          <Button size="sm" onClick={onRenew}>
            <RefreshCw className="h-4 w-4" /> Renew
          </Button>
        )}
        {isPaused && (
          <Button size="sm" variant="outline" onClick={onResume}>
            <Play className="h-4 w-4" /> Resume
          </Button>
        )}
      </div>
    </Card>
  );
}
