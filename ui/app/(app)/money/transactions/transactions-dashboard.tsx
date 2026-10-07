"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { TransactionRow } from "./transaction-row";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { TransactionFilters } from "./transaction-filters";
import { formatINR } from "@/lib/format";
import { Plus, TrendingUp, TrendingDown, Wallet, Download, ChevronLeft, ChevronRight, Upload, WandSparkles, Tags } from "lucide-react";
import { TransactionImportDialog } from "./transaction-import-dialog";
import { ConfirmDialog, useConfirm } from "@/components/common/confirm-dialog";
import { deleteTransactionAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { TransactionToolsDialog } from "./transaction-tools-dialog";
import { MerchantRulesDialog } from "./merchant-rules-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Txn = {
  id: string;
  account_id: string;
  type: string;
  amount: string;
  description: string | null;
  merchant_clean: string | null;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  date: string;
  notes: string | null;
  account_name: string;
  account_color: string | null;
  version: number;
  source: string;
  needs_review: number;
  tags: { id: string; name: string; color: string | null }[];
};

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
};

export function TransactionsDashboard({ transactions, summary, total, page, pageSize, accounts, categories, tags, merchantMappings, initialImport = false, initialCreate = false }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
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

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (search) {
        const q = search.toLowerCase();
        const hay = `${t.description ?? ""} ${t.merchant_clean ?? ""} ${t.category_name ?? ""} ${t.account_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (categoryFilter !== "all" && t.category_id !== categoryFilter) return false;
      if (accountFilter !== "all" && t.account_id !== accountFilter) return false;
      if (reviewOnly && !t.needs_review) return false;
      return true;
    });
  }, [transactions, search, typeFilter, categoryFilter, accountFilter, reviewOnly]);

  // Group by date
  const groups = useMemo(() => {
    const map = new Map<string, { date: string; total: number; items: Txn[] }>();
    for (const t of filtered) {
      const d = String(t.date).slice(0, 10);
      if (!map.has(d)) map.set(d, { date: d, total: 0, items: [] });
      const g = map.get(d)!;
      g.items.push(t);
      const sign = t.type === "income" ? 1 : t.type === "expense" ? -1 : 0;
      g.total += sign * Number(t.amount);
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered]);

  const reviewCount = useMemo(
    () => transactions.filter((transaction) => transaction.needs_review).length,
    [transactions]
  );

  const allSelected = useMemo(
    () => filtered.length > 0 && filtered.every((t) => selected.has(t.id)),
    [filtered, selected]
  );
  const indeterminate = selected.size > 0 && !allSelected;

  const handleEdit = (t: Txn) => {
    setEditing(t);
    setFormOpen(true);
  };

  const [confirmState, askConfirm, closeConfirm] = useConfirm();

  const handleDelete = (id: string) => {
    askConfirm({
      title: "Delete this transaction?",
      description: "This cannot be undone.",
      onConfirm: async () => {
        const res = await deleteTransactionAction(id);
        if (res?.error) toast.error(res.error);
        else {
          toast.success("Transaction deleted");
          router.refresh();
        }
      },
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
    try { const res = await fetch("/api/transactions/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: Array.from(selected), action, ...(action === "categorize" ? { category_id: bulkCategory } : {}), ...(action === "tag" ? { tag_ids: [bulkTag] } : {}) }) }); const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error || Object.values(body.fieldErrors || {})[0] || "Bulk action failed."); const skippedTransfers = Number(body.skipped_transfers ?? 0); const skipped = Number(body.skipped ?? 0) - skippedTransfers; toast.success(`Updated ${body.affected} transactions${skippedTransfers > 0 ? ` • ${skippedTransfers} transfer${skippedTransfers === 1 ? "" : "s"} skipped (edit the transfer itself)` : ""}${skipped > 0 ? ` • ${skipped} already up to date` : ""}`); setSelected(new Set()); router.refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Bulk action failed."); } finally { setBulkBusy(false); }
  };
  const bulk = (action: "categorize" | "tag" | "delete") => {
    if (action !== "delete") { void runBulk(action); return; }
    askConfirm({
      title: `Delete ${selected.size} selected transactions?`,
      description: "This cannot be undone.",
      onConfirm: () => runBulk("delete"),
    });
  };
  const runMergeSelected = async () => {
    const ids = Array.from(selected); if (ids.length !== 2) return;
    setBulkBusy(true); try { const res = await fetch("/api/transactions/duplicates/merge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ existing_transaction_id: ids[0], duplicate_transaction_id: ids[1] }) }); const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error || "Could not merge transactions."); toast.success("Duplicate transactions merged"); setSelected(new Set()); router.refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not merge transactions."); } finally { setBulkBusy(false); }
  };
  const mergeSelected = () => {
    const ids = Array.from(selected); if (ids.length !== 2) return;
    askConfirm({
      title: "Merge these transactions?",
      description: "The second selected transaction will be merged into the first and removed.",
      confirmLabel: "Merge",
      onConfirm: runMergeSelected,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-ink-1">Transactions</h1>
          <p className="text-sm text-ink-3 font-body mt-1">{summary.count} transactions • Net {formatINR(summary.net)}</p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

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

      <Card className={`sticky top-20 z-30 p-3 shadow-md ${selected.size > 0 ? "border-primary-200 bg-tint-info dark:border-[#60A5FA] dark:bg-[#1E1E1E]/50" : ""}`}>
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
                  if (filtered.every((t) => next.has(t.id))) {
                    for (const t of filtered) next.delete(t.id);
                  } else {
                    for (const t of filtered) next.add(t.id);
                  }
                  return next;
                });
              }}
              className="h-4 w-4 rounded border-neutral-300"
            />
            {selected.size > 0 ? `${selected.size} selected` : "Bulk edit"}
          </label>
          <div className="flex flex-1 flex-wrap gap-2">
            <Select value={bulkCategory} onValueChange={setBulkCategory} disabled={selected.size === 0 || bulkBusy}><SelectTrigger className="w-44 bg-surface"><SelectValue placeholder="Choose category" /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select>
            <Button size="sm" variant="outline" disabled={!bulkCategory || selected.size === 0 || bulkBusy} onClick={() => void bulk("categorize")}>Apply category</Button>
            <Select value={bulkTag} onValueChange={setBulkTag} disabled={selected.size === 0 || bulkBusy}><SelectTrigger className="w-40 bg-surface"><SelectValue placeholder="Choose tag" /></SelectTrigger><SelectContent>{tags.map((tag) => <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>)}</SelectContent></Select>
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
          {groups.map((g) => (
            <div key={g.date}>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-sm font-semibold font-heading text-ink-2">
                  {new Date(g.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
                </h3>
                <span className={`text-sm font-semibold tabular-nums ${g.total >= 0 ? "text-success" : "text-error"}`}>
                  {g.total >= 0 ? "+" : ""}
                  {formatINR(g.total)}
                </span>
              </div>
              <div className="space-y-2">
                {g.items.map((t) => (
                  <TransactionRow key={t.id} txn={t} selected={selected.has(t.id)} onSelectedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(t.id); else next.delete(t.id); return next; })} onEdit={() => handleEdit(t)} onDelete={() => handleDelete(t.id)} onOrganize={() => setToolsTransaction(t)} />
                ))}
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-sm text-ink-3">
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

      <TransactionFormDialog open={formOpen} onOpenChange={setFormOpen} transaction={editing} accounts={accounts} categories={categories} onSuccess={() => router.refresh()} />
      <TransactionImportDialog open={importOpen} onOpenChange={setImportOpen} accounts={accounts} categories={categories} onSuccess={() => router.refresh()} />
      <TransactionToolsDialog open={!!toolsTransaction} onOpenChange={(value) => { if (!value) setToolsTransaction(null); }} transaction={toolsTransaction} tags={tags} categories={categories} />
      <MerchantRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} mappings={merchantMappings} categories={categories} />
      <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} />
    </div>
  );
}
