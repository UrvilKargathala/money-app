"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AccountIcon } from "@/components/common/account-icon";
import { formatINR } from "@/lib/format";
import { MoreVertical, Pencil, Power, PowerOff, Trash2 } from "lucide-react";

type Account = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  balance: number;
  credit_limit: number | null;
  color: string | null;
  is_active: number;
  display_name: string;
};

export function AccountCard({
  account,
  creditUtilization,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
}: {
  account: Account;
  creditUtilization?: number | null;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const isActive = account.is_active === 1;
  const isCredit = account.type === "credit_card";

  return (
    <Card className={`p-5 flex flex-col gap-3 ${!isActive ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <AccountIcon type={account.type} color={account.color} />
          <div>
            <p className="text-sm font-semibold font-heading text-neutral-900 leading-none">{account.name}</p>
            <p className="text-xs text-neutral-500">{account.display_name}{account.institution ? ` • ${account.institution}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isActive ? "success" : "default"}>{isActive ? "Active" : "Inactive"}</Badge>
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
              <DropdownMenuItem onClick={onDelete} className="text-error">
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div>
        <p className="text-xs text-neutral-500 font-medium">Current Balance</p>
        <p className={`text-xl font-bold font-heading ${account.balance < 0 ? "text-error" : "text-neutral-900"}`}>
          {formatINR(account.balance)}
        </p>
      </div>

      {isCredit && account.credit_limit != null && creditUtilization != null && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-neutral-500">Credit Used</span>
            <span className={`font-medium ${creditUtilization > 80 ? "text-error" : creditUtilization > 50 ? "text-warning" : "text-success"}`}>
              {creditUtilization.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${creditUtilization > 80 ? "bg-error" : creditUtilization > 50 ? "bg-warning" : "bg-success"}`}
              style={{ width: `${Math.min(creditUtilization, 100)}%` }}
            />
          </div>
          <p className="text-xs text-neutral-400">Limit {formatINR(account.credit_limit)}</p>
        </div>
      )}
    </Card>
  );
}
