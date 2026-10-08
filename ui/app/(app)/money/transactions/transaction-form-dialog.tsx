"use client";

import { useActionState, useEffect, useState } from "react";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategorySelectWithCreate } from "@/components/common/category-select-with-create";
import { EntityFormDialog, useEntityFormSuccess } from "@/components/common/entity-form-dialog";
import { FieldError, FormGrid } from "@/components/common/form-primitives";
import { createTransaction, updateTransaction } from "./actions";

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

  useEntityFormSuccess({ state, isEdit, entityLabel: "Transaction", onOpenChange, onSuccess });

  useEffect(() => {
    if (open) {
      setType(transaction?.type || "expense");
      setAccountId(transaction?.account_id || "");
      setCategoryId(transaction?.category_id || "");
    }
  }, [open, transaction]);

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit transaction" : "Add transaction"}
      description={isEdit ? "Update the transaction details." : "Record a new income or expense."}
      formKey={transaction?.id ?? "new"}
      formAction={formAction}
      state={state}
      isEdit={isEdit}
      isPending={isPending}
      contentClassName="sm:max-w-lg"
      footer={
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !accountId}>
            {isPending ? "Saving..." : isEdit ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      }
    >
      {isEdit && <input type="hidden" name="id" value={transaction!.id} />}
      {isEdit && <input type="hidden" name="version" value={String(transaction!.version)} />}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="category_id" value={categoryId} />

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
        <FieldError message={state?.fieldErrors?.account_id} />
      </div>

      <FormGrid>
        <div className="space-y-2">
          <Label htmlFor="txn-amount">Amount *</Label>
          <Input id="txn-amount" name="amount" type="number" step="0.01" defaultValue={transaction ? String(transaction.amount) : ""} placeholder="1000" required />
          <FieldError message={state?.fieldErrors?.amount} />
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
          <FieldError message={state?.fieldErrors?.date} />
        </div>
      </FormGrid>

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
    </EntityFormDialog>
  );
}
