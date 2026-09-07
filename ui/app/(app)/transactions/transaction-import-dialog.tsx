"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export function TransactionImportDialog({ open, onOpenChange, accounts, onSuccess }: { open: boolean; onOpenChange: (open: boolean) => void; accounts: { id: string; name: string }[]; onSuccess: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function importStatement() {
    if (!file || !accountId) return toast.error("Choose a statement file and account.");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("account_id", accountId);
      const res = await fetch("/api/transactions/import", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || body.fieldErrors?.account_id || "Could not import statement.");
      toast.success(`Imported ${body.imported_rows ?? body.importedRows ?? 0} transactions`);
      onOpenChange(false);
      onSuccess();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not import statement."); }
    finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg">
    <DialogHeader><DialogTitle>Import transactions</DialogTitle><DialogDescription>Upload a bank statement CSV. Rows are validated, deduplicated, and saved to Neon.</DialogDescription></DialogHeader>
    <div className="space-y-4">
      <div className="space-y-2"><Label>Target account *</Label><Select value={accountId} onValueChange={setAccountId}><SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger><SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Statement file *</Label><input ref={inputRef} type="file" accept=".csv,text/csv" className="block w-full rounded-md border p-2 text-sm" onChange={e => setFile(e.target.files?.[0] ?? null)} />{file && <p className="text-xs text-neutral-500">{file.name}</p>}</div>
      <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">Supported columns include Date, Description/Narration, Amount, Debit, Credit, and Category.</div>
    </div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={importStatement} disabled={busy || !file || !accountId}>{busy ? "Importing…" : "Import statement"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
