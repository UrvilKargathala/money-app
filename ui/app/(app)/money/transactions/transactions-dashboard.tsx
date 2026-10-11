"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { TransactionRow } from "./transaction-row";
import { PageHeader } from "@/components/common/page-header";
import { TransactionFilters } from "./transaction-filters";
import { formatINR } from "@/lib/format";
import { Plus, TrendingUp, TrendingDown, Wallet, Download, ChevronLeft, ChevronRight, Upload, WandSparkles, Tags } from "lucide-react";
import { useConfirm, useDeleteConfirm } from "@/components/common/confirm-dialog";
import { deleteTransactionAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Dialogs are code-split (ssr:false) and mount only when opened — the Radix
// Dialog chain stays out of this page's initial chunk.
const TransactionFormDialog = dynamic(
  () => import("./transaction-form-dialog").then((m) => m.TransactionFormDialog),
  { ssr: false }
);
const TransactionImportDialog = dynamic(
  () => import("./transaction-import-dialog").then((m) => m.TransactionImportDialog),
  { ssr: false }
);
const TransactionToolsDialog = dynamic(
  () => import("./transaction-tools-dialog").then((m) => m.TransactionToolsDialog),
  { ssr: false }
);
const MerchantRulesDialog = dynamic(
  () => import("./merchant-rules-dialog").then((m) => m.MerchantRulesDialog),
  { ssr: false }
);
const ConfirmDialog = dynamic(
  () => import("@/components/common/confirm-dialog").then((m) => m.ConfirmDialog),
  { ssr: false }
);

import type { Txn } from "@/lib/entities";

type Props = {
  transactions: Txn[];
  summary: { income: number; expense: number; net: number; count: number };
  total: number;
  page: number;
  pageSize: number;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; parent_id: string | null }[];
  tags: { id: string; name: string; color: string | null }[];
  merchantMappings: { id: string; merchant_raw: string; merchant_clean: string | null; category_name: string | null; use_count: number }[];
  initialImport?: boolean;
  initialCreate?: boolean;
  initialQ?: string;
};

export function TransactionsDashboard({ transactions, summary, total, page, pageSize, accounts, categories, tags, merchantMappings, initialImport = false, initialCreate = false, initialQ = "" }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(initialQ);
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(initialCreate);
  const [editing, setEditing] = useState<Txn | null>(null);
  const [importOpen, setImportOpen] = useState(initialImport);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toolsTransaction, setToolsTransaction] = useState<Txn | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Debounced server search: filters the full history via ?q= (page 1),
  // while the local `filtered` memo keeps instant feedback on this page.
  const pushedQ = useRef(initialQ);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search === pushedQ.current) return;
      pushedQ.current = search;
      router.push(
        search
          ? `/money/transactions?q=${encodeURIComponent(search)}&page=1`
          : `/money/transactions?page=1`
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [search, router]);

  const filtered = useMemo(() => {
    return transactions.filter((txn) => {
      if (search) {
        const query = search.toLowerCase();
        const haystack = `${txn.description ?? ""} ${txn.merchant_clean ?? ""} ${txn.category_name ?? ""} ${txn.account_name}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (typeFilter !== "all" && txn.type !== typeFilter) return false;
      if (categoryFilter !== "all" && txn.category_id !== categoryFilter) return false;
      if (accountFilter !== "all" && txn.account_id !== accountFilter) return false;
      if (reviewOnly && !txn.needs_review) return false;
      return true;
    });
  }, [transactions, search, typeFilter, categoryFilter, accountFilter, reviewOnly]);

  // Group by date
  const groups = useMemo(() => {
    const byDate = new Map<string, { date: string; total: number; items: Txn[] }>();
    for (const txn of filtered) {
      const day = String(txn.date).slice(0, 10);
      if (!byDate.has(day)) byDate.set(day, { date: day, total: 0, items: [] });
      const group = byDate.get(day)!;
      group.items.push(txn);
      const sign = txn.type === "income" ? 1 : txn.type === "expense" ? -1 : 0;
      group.total += sign * Number(txn.amount);
    }
    return Array.from(byDate.values()).sort((newer, older) => older.date.localeCompare(newer.date));
  }, [filtered]);

  const reviewCount = useMemo(
    () => transactions.filter((transaction) => transaction.needs_review).length,
    [transactions]
  );

  const allSelected = useMemo(
    () => filtered.length > 0 && filtered.every((txn) => selected.has(txn.id)),
    [filtered, selected]
  );
  const indeterminate = selected.size > 0 && !allSelected;

  const handleEdit = (txn: Txn) => {
    setEditing(txn);
    setFormOpen(true);
  };

  const [confirmState, closeConfirm, confirmDelete] = useDeleteConfirm();
  // Bulk + merge keep raw useConfirm: their onConfirm runners toast
  // internally and need no result shaping.
  const [bulkConfirmState, askBulkConfirm, closeBulkConfirm] = useConfirm();

  const handleDelete = (id: string) => {
    confirmDelete({
      title: "Delete this transaction?",
      description: "This cannot be undone.",
      onDelete: () => deleteTransactionAction(id),
      successMsg: "Transaction deleted",
      onDone: () => router.refresh(),
    });
  };

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setCategoryFilter("all");
    setAccountFilter("all");
    setReviewOnly(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const runBulk = async (action: "categorize" | "tag" | "delete") => {
    setBulkBusy(true);
    try {
      const res = await fetch("/api/transactions/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selected),
          action,
          ...(action === "categorize" ? { category_id: bulkCategory } : {}),
          ...(action === "tag" ? { tag_ids: [bulkTag] } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || Object.values(body.fieldErrors || {})[0] || "Bulk action failed.");
      const skippedTransfers = Number(body.skipped_transfers ?? 0);
      const skipped = Number(body.skipped ?? 0) - skippedTransfers;
      const transferNote =
        skippedTransfers > 0
          ? ` • ${skippedTransfers} transfer${skippedTransfers === 1 ? "" : "s"} skipped (edit the transfer itself)`
          : "";
      const skippedNote = skipped > 0 ? ` • ${skipped} already up to date` : "";
      toast.success(`Updated ${body.affected} transactions${transferNote}${skippedNote}`);
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk action failed.");
    } finally {
      setBulkBusy(false);
    }
  };
  const bulk = (action: "categorize" | "tag" | "delete") => {
    if (action !== "delete") { void runBulk(action); return; }
    askBulkConfirm({
      title: `Delete ${selected.size} selected transactions?`,
      description: "This cannot be undone.",
      onConfirm: () => runBulk("delete"),
    });
  };
  const runMergeSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length !== 2) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/transactions/duplicates/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ existing_transaction_id: ids[0], duplicate_transaction_id: ids[1] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not merge transactions.");
      toast.success("Duplicate transactions merged");
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not merge transactions.");
    } finally {
      setBulkBusy(false);
    }
  };
  const mergeSelected = () => {
    const ids = Array.from(selected); if (ids.length !== 2) return;
    askBulkConfirm({
      title: "Merge these transactions?",
      description: "The second selected transaction will be merged into the first and removed.",
      confirmLabel: "Merge",
      onConfirm: runMergeSelected,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description={<>{summary.count} transactions • Net {formatINR(summary.net)}</>}
        actions={
          <>
            <Button variant="outline" onClick={() => setRulesOpen(true)}><WandSparkles className="h-4 w-4" /> Merchant rules</Button>
            <Button variant="outline" asChild>
              <a href="/api/transactions/export" download>
                <Download className="h-4 w-4" /> Export CSV
              </a>
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import statement</Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add Transaction
            </Button>
          </>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        <StatCard label="Income" value={formatINR(summary.income)} icon={<TrendingUp className="h-5 w-5" />} variant="success" />
        <StatCard label="Expenses" value={formatINR(summary.expense)} icon={<TrendingDown className="h-5 w-5" />} variant="rose" />
        <StatCard label="Net" value={formatINR(summary.net)} subtext={`${filtered.length} shown`} icon={<Wallet className="h-5 w-5" />} variant="primary" />
      </div>

      <Card className="p-4">
        <TransactionFilters
          search={search}
          onSearchChange={setSearch}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          accountFilter={accountFilter}
          onAccountChange={setAccountFilter}
          categories={categories}
          accounts={accounts}
          onClear={clearFilters}
        />
        <div className="mt-3 flex justify-end">
            <Button variant={reviewOnly ? "default" : "outline"} size="sm" onClick={() => setReviewOnly((value) => !value)}>
              Review imported ({reviewCount})
            </Button>
        </div>
      </Card>

      <Card className={`sticky top-20 z-30 p-3 shadow-md ${selected.size > 0 ? "border-primary-200 bg-info-soft dark:border-[#60A5FA] dark:bg-[#1E1E1E]/50" : ""}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex shrink-0 items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              aria-label="Select all transactions in view"
              title="Select all transactions in view"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = indeterminate; }}
              disabled={filtered.length === 0 || bulkBusy}
              onChange={() => {
                setSelected((current) => {
                  const next = new Set(current);
                  const allVisible = filtered.every((txn) => next.has(txn.id));
                  for (const txn of filtered) {
                    if (allVisible) next.delete(txn.id);
                    else next.add(txn.id);
                  }
                  return next;
                });
              }}
              className="h-4 w-4 rounded border-neutral-300"
            />
            {selected.size > 0 ? `${selected.size} selected` : "Bulk edit"}
          </label>
          <div className="flex flex-1 flex-wrap gap-2">
            <Select value={bulkCategory} onValueChange={setBulkCategory} disabled={selected.size === 0 || bulkBusy}><SelectTrigger className="w-44 bg-base"><SelectValue placeholder="Choose category" /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select>
            <Button size="sm" variant="outline" disabled={!bulkCategory || selected.size === 0 || bulkBusy} onClick={() => void bulk("categorize")}>Apply category</Button>
            <Select value={bulkTag} onValueChange={setBulkTag} disabled={selected.size === 0 || bulkBusy}><SelectTrigger className="w-40 bg-base"><SelectValue placeholder="Choose tag" /></SelectTrigger><SelectContent>{tags.map((tag) => <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>)}</SelectContent></Select>
            <Button size="sm" variant="outline" disabled={!bulkTag || selected.size === 0 || bulkBusy} onClick={() => void bulk("tag")}><Tags className="h-4 w-4" /> Apply tag</Button>
            <Button size="sm" variant="outline" disabled={selected.size !== 2 || bulkBusy} title={selected.size === 2 ? "Merge the two selected transactions" : "Select exactly 2 transactions to merge"} onClick={() => void mergeSelected()}>Merge duplicates</Button>
            <Button size="sm" variant="destructive" disabled={selected.size === 0 || bulkBusy} onClick={() => void bulk("delete")}>Delete</Button>
            <Button size="sm" variant="ghost" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title={transactions.length === 0 ? "No transactions yet" : "No matching transactions"}
          description={transactions.length === 0 ? "Add your first transaction to start tracking spending." : "Try adjusting your filters."}
          actionLabel={transactions.length === 0 ? "Add Transaction" : undefined}
          onAction={
            transactions.length === 0
              ? () => {
                  setEditing(null);
                  setFormOpen(true);
                }
              : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.date}>
              <div className="flex items-center justify-between mb-1.5">
                <h2 className="text-sm font-semibold font-heading text-muted-foreground">
                  {new Date(group.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
                </h2>
                <span className={`text-sm font-semibold tabular-nums ${group.total >= 0 ? "text-success" : "text-error"}`}>
                  {group.total >= 0 ? "+" : ""}
                  {formatINR(group.total)}
                </span>
              </div>
              <div className="space-y-2">
                {group.items.map((txn) => (
                  <TransactionRow key={txn.id} txn={txn} selected={selected.has(txn.id)} onSelectedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(txn.id); else next.delete(txn.id); return next; })} onEdit={() => handleEdit(txn)} onDelete={() => handleDelete(txn.id)} onOrganize={() => setToolsTransaction(txn)} />
                ))}
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-sm text-faint">
                Page {page} of {totalPages} • {total} total
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => router.push(`/money/transactions?page=${page - 1}`)}>
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => router.push(`/money/transactions?page=${page + 1}`)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {formOpen ? <TransactionFormDialog open={formOpen} onOpenChange={setFormOpen} transaction={editing} accounts={accounts} categories={categories} onSuccess={() => router.refresh()} /> : null}
      {importOpen ? <TransactionImportDialog open={importOpen} onOpenChange={setImportOpen} accounts={accounts} categories={categories} onSuccess={() => router.refresh()} /> : null}
      {toolsTransaction ? <TransactionToolsDialog open onOpenChange={(value) => { if (!value) setToolsTransaction(null); }} transaction={toolsTransaction} tags={tags} categories={categories} /> : null}
      {rulesOpen ? <MerchantRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} mappings={merchantMappings} categories={categories} /> : null}
      {confirmState ? <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} /> : null}
      {bulkConfirmState ? <ConfirmDialog state={bulkConfirmState} onOpenChange={closeBulkConfirm} /> : null}
    </div>
  );
}
