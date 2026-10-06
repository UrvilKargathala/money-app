"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, FileSpreadsheet, History, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, useConfirm } from "@/components/common/confirm-dialog";
import { toast } from "sonner";

type Account = { id: string; name: string };
type Category = { id: string; name: string; parent_id: string | null };
type MappingKey = "date" | "description" | "amount" | "debit" | "credit" | "type" | "category" | "merchant";
type Mapping = Record<MappingKey, string | number | null>;
type Draft = {
  date: string;
  amount: number;
  type: "income" | "expense";
  description: string | null;
  merchant_clean?: string | null;
  merchant?: string | null;
  category_name?: string | null;
  confidence?: number;
};
type Preview = {
  headers: string[];
  detected_mapping: Mapping;
  total_rows: number;
  valid_rows: number;
  sample_rows: Draft[];
  errors: { rowNumber?: number; row_number?: number; reason: string }[];
};
type ImportResult = { batch: { id: string }; total_rows: number; imported_rows: number; duplicate_rows: number; error_rows: number };
type ImportBatch = {
  id: string;
  filename: string;
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  error_rows: number;
  status: string;
  created_at: string;
};

const MAPPING_LABELS: Record<MappingKey, string> = {
  date: "Date",
  description: "Description",
  amount: "Amount",
  debit: "Debit",
  credit: "Credit",
  type: "Type",
  category: "Category",
  merchant: "Merchant",
};

export function TransactionImportDialog({ open, onOpenChange, accounts, categories, onSuccess }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  categories: Category[];
  onSuccess: () => void;
}) {
  const statementInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [scanDraft, setScanDraft] = useState<Draft | null>(null);
  const [scanCategoryId, setScanCategoryId] = useState("none");
  const [busy, setBusy] = useState(false);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);

  const matchedCategoryId = useMemo(() => {
    if (!scanDraft?.category_name) return "none";
    return categories.find((category) => category.name.toLowerCase() === scanDraft.category_name?.toLowerCase())?.id ?? "none";
  }, [categories, scanDraft]);

  const loadHistory = useCallback(async () => {
    setHistoryBusy(true);
    try {
      const res = await fetch("/api/import-batches");
      const body = await res.json().catch(() => ({}));
      if (res.ok) setBatches(body.batches ?? []);
    } finally {
      setHistoryBusy(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadHistory();
  }, [open, loadHistory]);

  function resetStatement() {
    setFile(null);
    setCsvText("");
    setPreview(null);
    setMapping(null);
    setResult(null);
    if (statementInputRef.current) statementInputRef.current.value = "";
  }

  async function previewStatement() {
    if (!file) return toast.error("Choose a CSV statement.");
    setBusy(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/transactions/import/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not preview statement.");
      setCsvText(text);
      setPreview(body);
      setMapping(body.detected_mapping);
      setResult(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not preview statement.");
    } finally {
      setBusy(false);
    }
  }

  async function validateMapping(nextMapping: Mapping) {
    setMapping(nextMapping);
    if (!csvText) return;
    setBusy(true);
    try {
      const res = await fetch("/api/transactions/import/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: csvText, mapping: nextMapping }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not validate mapping.");
      setPreview((current) => current ? { ...current, valid_rows: body.valid_rows, errors: body.errors, detected_mapping: body.applied_mapping } : current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not validate mapping.");
    } finally {
      setBusy(false);
    }
  }

  async function importStatement() {
    if (!file || !accountId || !preview || !mapping) return toast.error("Preview the statement and choose an account first.");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("account_id", accountId);
      form.set("mapping", JSON.stringify(mapping));
      const res = await fetch("/api/transactions/import", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || body.fieldErrors?.account_id || "Could not import statement.");
      setResult(body);
      toast.success(`Imported ${body.imported_rows ?? 0} transactions`);
      await loadHistory();
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import statement.");
    } finally {
      setBusy(false);
    }
  }

  // True once the server reports receipt scanning is unconfigured (missing AI
  // key): the raw env-var message means nothing to end users, so the receipt
  // tab shows a persistent hint pointing at statement import instead.
  const [scanUnavailable, setScanUnavailable] = useState(false);

  async function scanReceipt(selected: File | null) {
    if (!selected) return;
    setBusy(true);
    setScanDraft(null);
    try {
      const form = new FormData();
      form.set("file", selected);
      const res = await fetch("/api/transactions/scan-receipt", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not read receipt.");
      setScanUnavailable(false);
      setScanDraft(body.draft);
      const categoryId = categories.find((category) => category.name.toLowerCase() === body.draft.category_name?.toLowerCase())?.id;
      setScanCategoryId(categoryId ?? "none");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read receipt.";
      if (message.includes("AI_GATEWAY_API_KEY")) {
        setScanUnavailable(true);
        toast.error("Receipt scanning is not configured on this server. Use statement import instead.");
      } else {
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveScannedTransaction() {
    if (!scanDraft || !accountId) return toast.error("Choose an account and review the scanned transaction.");
    setBusy(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: scanDraft.type,
          account_id: accountId,
          category_id: scanCategoryId === "none" ? null : scanCategoryId,
          amount: String(scanDraft.amount),
          date: scanDraft.date,
          description: scanDraft.description,
          notes: "Created from receipt scan",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save scanned transaction.");
      toast.success("Scanned transaction saved");
      setScanDraft(null);
      if (scanInputRef.current) scanInputRef.current.value = "";
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save scanned transaction.");
    } finally {
      setBusy(false);
    }
  }

  async function resolveDuplicates(batchId: string, action: "skip" | "import") {
    setHistoryBusy(true);
    try {
      const res = await fetch(`/api/import-batches/${batchId}/duplicates/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not resolve duplicates.");
      toast.success(action === "skip" ? `Skipped ${body.skipped ?? 0} duplicates` : `Imported ${body.imported ?? 0} duplicates`);
      await loadHistory();
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resolve duplicates.");
    } finally {
      setHistoryBusy(false);
    }
  }

  const [confirmState, askConfirm, closeConfirm] = useConfirm();

  function rollbackBatch(batchId: string) {
    askConfirm({
      title: "Roll back this import?",
      description: "Imported transactions and unresolved import rows will be removed. This cannot be undone.",
      confirmLabel: "Roll back",
      onConfirm: async () => {
        setHistoryBusy(true);
        try {
          const res = await fetch(`/api/import-batches/${batchId}/rollback`, { method: "POST" });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || "Could not roll back import.");
          toast.success(`Rolled back ${body.deleted ?? 0} imported transactions`);
          await loadHistory(); onSuccess();
        } catch (error) { toast.error(error instanceof Error ? error.message : "Could not roll back import."); }
        finally { setHistoryBusy(false); }
      },
    });
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add transactions from a file</DialogTitle>
          <DialogDescription>Scan a receipt or review a bank statement before anything is saved to Neon.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="receipt" className="space-y-5">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="receipt"><Camera className="mr-2 h-4 w-4" />Receipt</TabsTrigger>
            <TabsTrigger value="statement"><FileSpreadsheet className="mr-2 h-4 w-4" />Statement</TabsTrigger>
            <TabsTrigger value="history"><History className="mr-2 h-4 w-4" />History</TabsTrigger>
          </TabsList>

          <TabsContent value="receipt" className="space-y-5">
            <div className="space-y-2">
              <Label>Receipt photo or PDF</Label>
              <input aria-label="Take a receipt photo or choose a receipt file" ref={scanInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="block w-full rounded-md border p-2 text-sm" onChange={(event) => void scanReceipt(event.target.files?.[0] ?? null)} disabled={busy} />
              <p className="text-xs text-ink-3">On a phone, this can open the rear camera. Nothing is saved until you confirm.</p>
              {scanUnavailable ? (
                <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-light/30 p-3 text-xs text-warning-dark dark:border-[#92400E] dark:bg-[#78350F]/40 dark:text-[#FDE68A]">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  Receipt scanning is not configured on this server. Import a CSV statement from the Statement tab instead — it works without any extra setup.
                </p>
              ) : null}
            </div>
            {busy && !scanDraft ? <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl bg-primary-50 p-4 text-sm text-primary-700 dark:bg-[#1E3A5F] dark:text-[#BFDBFE]"><Loader2 className="h-4 w-4 animate-spin" />Reading receipt…</div> : null}
            {scanDraft ? (
              <div className="space-y-4 rounded-xl border bg-sunken p-4">
                <div className="flex items-center justify-between"><div><p className="font-semibold">Review extracted transaction</p><p className="text-xs text-ink-3">Correct any field before saving.</p></div>{scanDraft.confidence != null ? <Badge variant="secondary">{Math.round(scanDraft.confidence * 100)}% confidence</Badge> : null}</div>
                <div className="space-y-2"><Label>Account *</Label><Select value={accountId} onValueChange={setAccountId}><SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Type</Label><Select value={scanDraft.type} onValueChange={(value: "income" | "expense") => setScanDraft({ ...scanDraft, type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Amount</Label><Input type="number" min="0.01" step="0.01" value={scanDraft.amount} onChange={(event) => setScanDraft({ ...scanDraft, amount: Number(event.target.value) })} /></div>
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={scanDraft.date} onChange={(event) => setScanDraft({ ...scanDraft, date: event.target.value })} /></div>
                  <div className="space-y-2"><Label>Category</Label><Select value={scanCategoryId || matchedCategoryId} onValueChange={setScanCategoryId}><SelectTrigger><SelectValue placeholder="No category" /></SelectTrigger><SelectContent><SelectItem value="none">No category</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="space-y-2"><Label>Description</Label><Input value={scanDraft.description ?? ""} onChange={(event) => setScanDraft({ ...scanDraft, description: event.target.value })} /></div>
                <Button className="w-full" onClick={saveScannedTransaction} disabled={busy || !accountId || scanDraft.amount <= 0}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Save transaction</Button>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="statement" className="space-y-5">
            {!result ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Target account *</Label><Select value={accountId} onValueChange={setAccountId}><SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>CSV statement *</Label><input aria-label="Choose a CSV bank statement" ref={statementInputRef} type="file" accept=".csv,text/csv" className="block w-full rounded-md border p-2 text-sm" onChange={(event) => { const selected = event.target.files?.[0] ?? null; resetStatement(); setFile(selected); }} /></div>
                </div>
                {!preview ? <Button onClick={previewStatement} disabled={busy || !file}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Preview statement</Button> : null}
                {preview && mapping ? (
                  <div className="space-y-5">
                    <div className="grid grid-cols-3 gap-3"><div className="rounded-lg bg-success/10 p-3"><p className="text-xs text-ink-3">Ready</p><p className="text-xl font-bold text-success-dark">{preview.valid_rows}</p></div><div className="rounded-lg bg-wash p-3"><p className="text-xs text-ink-3">Total</p><p className="text-xl font-bold">{preview.total_rows}</p></div><div className="rounded-lg bg-error/10 p-3"><p className="text-xs text-ink-3">Needs attention</p><p className="text-xl font-bold text-error-dark">{preview.errors.length}</p></div></div>
                    <div><p className="mb-2 text-sm font-semibold">Column mapping</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(Object.keys(MAPPING_LABELS) as MappingKey[]).map((key) => <div key={key} className="space-y-1"><Label className="text-xs">{MAPPING_LABELS[key]}</Label><Select value={mapping[key] == null ? "none" : String(mapping[key])} onValueChange={(value) => void validateMapping({ ...mapping, [key]: value === "none" ? null : Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not mapped</SelectItem>{preview.headers.map((header, index) => <SelectItem key={`${key}-${index}`} value={String(index)}>{header || `Column ${index + 1}`}</SelectItem>)}</SelectContent></Select></div>)}</div></div>
                    <div className="overflow-hidden rounded-xl border"><div className="border-b bg-sunken px-4 py-2 text-sm font-semibold">Sample transactions</div><div className="divide-y">{preview.sample_rows.slice(0, 5).map((draft, index) => <div key={`${draft.date}-${index}`} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-sm"><div><p className="font-medium">{draft.description || draft.merchant_clean || "Transaction"}</p><p className="text-xs text-ink-3">{draft.date} • {draft.category_name || "Uncategorized"}</p></div><p className={draft.type === "income" ? "text-success-dark" : "text-error-dark"}>{draft.type === "income" ? "+" : "-"}₹{draft.amount.toLocaleString("en-IN")}</p></div>)}</div></div>
                    {preview.errors.length > 0 ? <div className="rounded-xl border border-warning/30 bg-warning/10 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><TriangleAlert className="h-4 w-4" />Rows that will not import</div>{preview.errors.slice(0, 5).map((error, index) => <p key={index} className="text-xs text-ink-2">Row {error.rowNumber ?? error.row_number ?? "?"}: {error.reason}</p>)}</div> : null}
                    <div className="flex justify-between"><Button variant="outline" onClick={resetStatement}><RotateCcw className="h-4 w-4" />Choose another file</Button><Button onClick={importStatement} disabled={busy || !accountId || preview.valid_rows === 0}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Confirm and import {preview.valid_rows}</Button></div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="space-y-5 py-4 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-success" /><div><h3 className="text-xl font-semibold">Statement processed</h3><p className="text-sm text-ink-3">Your imported transactions are now available.</p></div><div className="grid grid-cols-3 gap-3 text-left"><div className="rounded-lg bg-success/10 p-3"><p className="text-xs">Imported</p><p className="text-xl font-bold">{result.imported_rows}</p></div><div className="rounded-lg bg-warning/10 p-3"><p className="text-xs">Duplicates</p><p className="text-xl font-bold">{result.duplicate_rows}</p></div><div className="rounded-lg bg-error/10 p-3"><p className="text-xs">Errors</p><p className="text-xl font-bold">{result.error_rows}</p></div></div><Button variant="outline" onClick={resetStatement}>Import another statement</Button></div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            {historyBusy && batches.length === 0 ? <div className="flex items-center gap-2 py-8 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" />Loading import history…</div> : null}
            {!historyBusy && batches.length === 0 ? <EmptyState title="No statement imports yet" description="Import a CSV statement to see its batches here." /> : null}
            {batches.map((batch) => <div key={batch.id} className="rounded-xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-semibold">{batch.filename}</p><Badge variant="secondary">{batch.status}</Badge></div><p className="text-xs text-ink-3">{new Date(batch.created_at).toLocaleString("en-IN")}</p></div><div className="flex gap-3 text-xs"><span>{batch.imported_rows} imported</span><span>{batch.duplicate_rows} duplicates</span><span>{batch.error_rows} errors</span></div></div>{batch.status !== "rolled_back" ? <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">{batch.duplicate_rows > 0 ? <><Button size="sm" variant="outline" onClick={() => void resolveDuplicates(batch.id, "skip")} disabled={historyBusy}>Skip duplicates</Button><Button size="sm" variant="outline" onClick={() => void resolveDuplicates(batch.id, "import")} disabled={historyBusy}>Import duplicates</Button></> : null}<Button size="sm" variant="ghost" asChild><a href={`/api/import-batches/${batch.id}/errors/export`} download>Download issues</a></Button><Button size="sm" variant="destructive" onClick={() => void rollbackBatch(batch.id)} disabled={historyBusy}>Roll back import</Button></div> : null}</div>)}
          </TabsContent>
        </Tabs>

        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} />
    </>
  );
}
