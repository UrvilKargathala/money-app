"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { useDeleteConfirm } from "@/components/common/confirm-dialog";
import { AccountCard } from "./account-card";
import { formatINR } from "@/lib/format";
import { Wallet, CreditCard, Landmark, Plus, ArrowLeftRight, Download, Search } from "lucide-react";
import { deactivateAccountAction, reactivateAccountAction, deleteAccountAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import type { Account } from "@/lib/entities";

// Dialogs are code-split (ssr:false) and mount only when opened.
const AccountFormDialog = dynamic(
  () => import("./account-form-dialog").then((m) => m.AccountFormDialog),
  { ssr: false }
);
const TransferDialog = dynamic(
  () => import("./transfer-dialog").then((m) => m.TransferDialog),
  { ssr: false }
);
const ConfirmDialog = dynamic(
  () => import("@/components/common/confirm-dialog").then((m) => m.ConfirmDialog),
  { ssr: false }
);

type Props = {
  accounts: Account[];
  types: { type_code: string; display_name: string }[];
  initialCreate?: boolean;
  initialEditId?: string;
};

export function AccountsDashboard({ accounts, types, initialCreate = false, initialEditId }: Props) {
  const router = useRouter();
  const [filterType, setFilterType] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const initialEdit = initialEditId ? accounts.find((account) => account.id === initialEditId) ?? null : null;
  const [formOpen, setFormOpen] = useState(initialCreate || !!initialEdit);
  const [editing, setEditing] = useState<Account | null>(initialEdit);
  const [transferOpen, setTransferOpen] = useState(false);

  // Lowered once per render (was recomputed per account in the filter).
  const loweredSearch = search.toLowerCase();
  const filtered = useMemo(
    () =>
      accounts.filter((a) => {
        if (!showInactive && a.is_active !== 1) return false;
        if (filterType !== "all" && a.type !== filterType) return false;
        if (search && !a.name.toLowerCase().includes(loweredSearch) && !a.institution?.toLowerCase().includes(loweredSearch)) return false;
        return true;
      }),
    [accounts, showInactive, filterType, search, loweredSearch]
  );

  const activeAccounts = useMemo(() => accounts.filter((a) => a.is_active === 1), [accounts]);
  const totals = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    for (const a of activeAccounts) {
      if (a.is_asset === 1) assets += a.balance;
      else liabilities += Math.abs(a.balance);
    }
    return { assets, liabilities, net: assets - liabilities };
  }, [activeAccounts]);
  const totalAssets = totals.assets;
  const totalLiabilities = totals.liabilities;
  const net = totals.net;
  // Stable transfer options (were a new array+objects every render).
  const transferOpts = useMemo(() => activeAccounts.map((a) => ({ id: a.id, name: a.name })), [activeAccounts]);

  const handleEditAccount = useCallback((a: Account) => {
    setEditing(a);
    setFormOpen(true);
  }, []);

  const handleDeactivate = useCallback(
    async (a: Account) => {
      const res = await deactivateAccountAction(a.id);
      if (!res || res.error) toast.error(res?.error || "Could not deactivate.");
      else {
        toast.success("Account deactivated");
        router.refresh();
      }
    },
    [router]
  );
  const handleReactivate = useCallback(
    async (a: Account) => {
      const res = await reactivateAccountAction(a.id);
      if (!res || res.error) toast.error(res?.error || "Could not reactivate.");
      else {
        toast.success("Account reactivated");
        router.refresh();
      }
    },
    [router]
  );
  const [confirmState, closeConfirm, confirmDelete] = useDeleteConfirm();

  const handleDelete = useCallback(
    (a: Account) => {
      confirmDelete({
        title: "Delete this account?",
        description: "Only allowed if it has zero transactions and zero balance. This cannot be undone.",
        onDelete: () => deleteAccountAction(a.id),
        successMsg: "Account deleted",
        onDone: () => router.refresh(),
      });
    },
    [confirmDelete, router]
  );

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-ink-1">Accounts</h1>
          <p className="text-sm text-ink-3 font-body mt-1">{activeAccounts.length} active • Net {formatINR(net)}</p>
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
              <Input placeholder="Search accounts..." aria-label="Search accounts" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
              onEdit={handleEditAccount}
              onDeactivate={handleDeactivate}
              onReactivate={handleReactivate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {formOpen ? (
      <AccountFormDialog
        key={`${editing?.id ?? "create"}-${formOpen ? "open" : "closed"}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
        onSuccess={() => router.refresh()}
      />
      ) : null}
      {transferOpen ? <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} accounts={transferOpts} onSuccess={() => router.refresh()} /> : null}
      {confirmState ? <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} /> : null}
    </div>
  );
}
