"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CategorySelectWithCreate } from "@/components/common/category-select-with-create";
import { createTransaction, updateTransaction } from "./actions";
import { toast } from "sonner";

type AccountOpt = { id: string; name: string };
type CategoryOpt = { id: string; name: string; parent_id: string | null };

type Txn = {
  id: string;
  type: string;
  account_id: string;
  category_id: string | null;
  amount: string;
  date: string;
  description: string | null;
  notes: string | null;
  version: number;
};

export function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
  accounts,
  categories,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transaction?: Txn | null;
  accounts: AccountOpt[];
  categories: CategoryOpt[];
  onSuccess?: () => void;
}) {
  const isEdit = !!transaction;
  const [type, setType] = useState(transaction?.type || "expense");
  const [accountId, setAccountId] = useState(transaction?.account_id || "");
  const [categoryId, setCategoryId] = useState(transaction?.category_id || "");
  const [state, formAction, isPending] = useActionState(isEdit ? updateTransaction : createTransaction, null);

  useEffect(() => {
    if (state?.success) {
      toast.success(isEdit ? "Transaction updated" : "Transaction created");
      onOpenChange(false);
      onSuccess?.();
    }
  }, [state?.success]);

  useEffect(() => {
    if (open) {
      setType(transaction?.type || "expense");
      setAccountId(transaction?.account_id || "");
      setCategoryId(transaction?.category_id || "");
    }
  }, [open, transaction]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update the transaction details." : "Record a new income or expense."}</DialogDescription>
        </DialogHeader>

        <form key={transaction?.id ?? "new"} action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={transaction!.id} />}
          {isEdit && <input type="hidden" name="version" value={String(transaction!.version)} />}
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="account_id" value={accountId} />
          <input type="hidden" name="category_id" value={categoryId} />

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button type="button" variant={type === "expense" ? "default" : "outline"} className="flex-1" onClick={() => setType("expense")}>
              Expense
            </Button>
            <Button type="button" variant={type === "income" ? "default" : "outline"} className="flex-1" onClick={() => setType("income")}>
              Income
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Account *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state?.fieldErrors?.account_id && <p className="text-xs text-error-dark">{state.fieldErrors.account_id}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="txn-amount">Amount *</Label>
              <Input id="txn-amount" name="amount" type="number" step="0.01" defaultValue={transaction ? String(transaction.amount) : ""} placeholder="1000" required />
              {state?.fieldErrors?.amount && <p className="text-xs text-error-dark">{state.fieldErrors.amount}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="txn-date">Date *</Label>
              <Input
                id="txn-date"
                name="date"
                type="date"
                defaultValue={transaction ? String(transaction.date).slice(0, 10) : new Date().toLocaleDateString("en-CA")}
                required
              />
              {state?.fieldErrors?.date && <p className="text-xs text-error-dark">{state.fieldErrors.date}</p>}
            </div>
          </div>

          <CategorySelectWithCreate
            value={categoryId || "none"}
            onValueChange={(value) => setCategoryId(value === "none" ? "" : value)}
            categories={categories}
            placeholder="Select category (optional)"
          />

          <div className="space-y-2">
            <Label htmlFor="txn-desc">Description</Label>
            <Input id="txn-desc" name="description" defaultValue={transaction?.description || ""} placeholder="e.g. Grocery at Big Bazaar" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="txn-notes">Notes</Label>
            <Textarea id="txn-notes" name="notes" defaultValue={transaction?.notes || ""} placeholder="Optional notes" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !accountId}>
              {isPending ? "Saving..." : isEdit ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
