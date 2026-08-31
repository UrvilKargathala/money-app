"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { AccountCard } from "./account-card";
import { AccountFormDialog } from "./account-form-dialog";
import { TransferDialog } from "./transfer-dialog";
import { formatINR } from "@/lib/format";
import { Wallet, CreditCard, Landmark, Plus, ArrowLeftRight, Download, Search } from "lucide-react";
import { deactivateAccountAction, reactivateAccountAction, deleteAccountAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

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
  is_asset: number;
  version: number;
  opening_balance: number;
  notes: string | null;
};

type Props = {
  accounts: Account[];
  types: { type_code: string; display_name: string }[];
};

export function AccountsDashboard({ accounts, types }: Props) {
  const router = useRouter();
  const [filterType, setFilterType] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const filtered = accounts.filter((a) => {
    if (!showInactive && a.is_active !== 1) return false;
    if (filterType !== "all" && a.type !== filterType) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.institution?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const activeAccounts = accounts.filter((a) => a.is_active === 1);
  const totalAssets = activeAccounts.filter((a) => a.is_asset === 1).reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = activeAccounts.filter((a) => a.is_asset === 0).reduce((s, a) => s + Math.abs(a.balance), 0);
  const net = totalAssets - totalLiabilities;

  const handleDeactivate = async (id: string) => {
    const res = await deactivateAccountAction(id);
    if (!res || res.error) toast.error(res?.error || "Could not deactivate.");
    else {
      toast.success("Account deactivated");
      router.refresh();
    }
  };
  const handleReactivate = async (id: string) => {
    const res = await reactivateAccountAction(id);
    if (!res || res.error) toast.error(res?.error || "Could not reactivate.");
    else {
      toast.success("Account reactivated");
      router.refresh();
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this account? Only allowed if zero transactions and zero balance.")) return;
    const res = await deleteAccountAction(id);
    if (!res || res.error) toast.error(res?.error || "Could not delete.");
    else {
      toast.success("Account deleted");
      router.refresh();
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (a: Account) => {
    setEditing(a);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-neutral-900">Accounts</h1>
          <p className="text-sm text-neutral-500 font-body mt-1">{activeAccounts.length} active • Net {formatINR(net)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight className="h-4 w-4" /> Transfer
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Account
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <StatCard label="Total Assets" value={formatINR(totalAssets)} icon={<Wallet className="h-5 w-5" />} variant="success" />
        <StatCard label="Total Liabilities" value={formatINR(totalLiabilities)} icon={<CreditCard className="h-5 w-5" />} variant="rose" />
        <StatCard label="Net Worth" value={formatINR(net)} icon={<Landmark className="h-5 w-5" />} variant="primary" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input placeholder="Search accounts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t.type_code} value={t.type_code}>
                    {t.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded border-neutral-300" />
              Show inactive
            </label>
            <Button variant="ghost" size="sm" asChild>
              <a href="/api/accounts/export" download>
                <Download className="h-4 w-4" /> Export CSV
              </a>
            </Button>
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title={accounts.length === 0 ? "No accounts yet" : "No matching accounts"}
          description={accounts.length === 0 ? "Create your first account to get started tracking balances." : "Try adjusting your filters or search."}
          actionLabel={accounts.length === 0 ? "Add Account" : undefined}
          onAction={accounts.length === 0 ? openCreate : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              onEdit={() => openEdit(a)}
              onDeactivate={() => handleDeactivate(a.id)}
              onReactivate={() => handleReactivate(a.id)}
              onDelete={() => handleDelete(a.id)}
            />
          ))}
        </div>
      )}

      <AccountFormDialog
        key={`${editing?.id ?? "create"}-${formOpen ? "open" : "closed"}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
        onSuccess={() => router.refresh()}
      />
      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} accounts={activeAccounts.map((a) => ({ id: a.id, name: a.name }))} onSuccess={() => router.refresh()} />
    </div>
  );
}
