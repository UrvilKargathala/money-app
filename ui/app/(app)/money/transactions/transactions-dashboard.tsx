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
      const d = new Date(t.date).toISOString().slice(0, 10);
      if (!map.has(d)) map.set(d, { date: d, total: 0, items: [] });
      const g = map.get(d)!;
      g.items.push(t);
      const sign = t.type === "income" ? 1 : t.type === "expense" ? -1 : 0;
      g.total += sign * Number(t.amount);
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered]);

  const handleEdit = (t: Txn) => {
    setEditing(t);
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this transaction?")) return;
    const res = await deleteTransactionAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Transaction deleted");
      router.refresh();
    }
  };

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setCategoryFilter("all");
    setAccountFilter("all");
    setReviewOnly(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const bulk = async (action: "categorize" | "tag" | "delete") => {
    if (action === "delete" && !confirm(`Delete ${selected.size} selected transactions?`)) return;
    setBulkBusy(true);
    try { const res = await fetch("/api/transactions/bulk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: Array.from(selected), action, ...(action === "categorize" ? { category_id: bulkCategory } : {}), ...(action === "tag" ? { tag_ids: [bulkTag] } : {}) }) }); const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error || Object.values(body.fieldErrors || {})[0] || "Bulk action failed."); toast.success(`Updated ${body.affected} transactions`); setSelected(new Set()); router.refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Bulk action failed."); } finally { setBulkBusy(false); }
  };
  const mergeSelected = async () => {
    const ids = Array.from(selected); if (ids.length !== 2) return;
    if (!confirm("Merge the second selected transaction into the first? The second will be removed.")) return;
    setBulkBusy(true); try { const res = await fetch("/api/transactions/duplicates/merge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ existing_transaction_id: ids[0], duplicate_transaction_id: ids[1] }) }); const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error || "Could not merge transactions."); toast.success("Duplicate transactions merged"); setSelected(new Set()); router.refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not merge transactions."); } finally { setBulkBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-neutral-900">Transactions</h1>
          <p className="text-sm text-neutral-500 font-body mt-1">{summary.count} transactions • Net {formatINR(summary.net)}</p>
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
            Review imported ({transactions.filter((transaction) => transaction.needs_review).length})
          </Button>
        </div>
      </Card>

      {selected.size > 0 ? <Card className="sticky top-20 z-30 flex flex-col gap-3 border-primary-200 bg-primary-50 p-3 shadow-md sm:flex-row sm:items-center"><p className="text-sm font-semibold">{selected.size} selected</p><div className="flex flex-1 flex-wrap gap-2"><Select value={bulkCategory} onValueChange={setBulkCategory}><SelectTrigger className="w-44 bg-white"><SelectValue placeholder="Choose category" /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" disabled={!bulkCategory || bulkBusy} onClick={() => void bulk("categorize")}>Apply category</Button><Select value={bulkTag} onValueChange={setBulkTag}><SelectTrigger className="w-40 bg-white"><SelectValue placeholder="Choose tag" /></SelectTrigger><SelectContent>{tags.map((tag) => <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" disabled={!bulkTag || bulkBusy} onClick={() => void bulk("tag")}><Tags className="h-4 w-4" /> Apply tag</Button>{selected.size === 2 ? <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => void mergeSelected()}>Merge duplicates</Button> : null}<Button size="sm" variant="destructive" disabled={bulkBusy} onClick={() => void bulk("delete")}>Delete</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button></div></Card> : null}

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
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.date}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold font-heading text-neutral-700">
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
              <p className="text-sm text-neutral-500">
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
    </div>
  );
}
