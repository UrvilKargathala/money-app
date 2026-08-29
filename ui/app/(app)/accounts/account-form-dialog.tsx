"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createAccount, updateAccount } from "./actions";
import { ACCOUNT_TYPES } from "@moneymind/api/constants";
import type { ActionState } from "@moneymind/api";
import { toast } from "sonner";

type AccountFormData = {
  id?: string;
  name: string;
  type: string;
  institution: string | null;
  opening_balance: number;
  credit_limit: number | null;
  color: string | null;
  notes: string | null;
  version: number;
};

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account?: AccountFormData | null;
  onSuccess?: () => void;
}) {
  const isEdit = !!account;
  const isEditRef = useRef(isEdit);
  useEffect(() => {
    isEditRef.current = isEdit;
  }, [isEdit]);
  const [type, setType] = useState(account?.type || "bank_savings");
  // Stable dispatcher that reads the latest isEdit via ref — useActionState
  // binds to the initial function only, so a plain closure would stale.
  const dispatchAction = async (prev: ActionState | null, fd: FormData): Promise<ActionState> => {
    if (isEditRef.current) return updateAccount(prev as ActionState, fd);
    return createAccount(prev as ActionState, fd);
  };
  const [state, formAction, isPending] = useActionState(dispatchAction, null);

  useEffect(() => {
    if (state?.success) {
      toast.success(isEdit ? "Account updated" : "Account created");
      onOpenChange(false);
      onSuccess?.();
    }
  }, [state, isEdit, onOpenChange, onSuccess]);

  useEffect(() => {
    if (open) setType(account?.type || "bank_savings");
  }, [open, account]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit account" : "Add account"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update the account details below." : "Create a new account to track balances and transactions."}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={account!.id} />}
          {isEdit && <input type="hidden" name="version" value={String(account!.version)} />}
          <input type="hidden" name="type" value={type} />

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="acc-name">Account name *</Label>
            <Input id="acc-name" name="name" defaultValue={account?.name || ""} placeholder="HDFC Savings" required error={!!state?.fieldErrors?.name} />
            {state?.fieldErrors?.name && <p className="text-xs text-error-dark">{state.fieldErrors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state?.fieldErrors?.type && <p className="text-xs text-error-dark">{state.fieldErrors.type}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-inst">Institution</Label>
            <Input id="acc-inst" name="institution" defaultValue={account?.institution || ""} placeholder="HDFC Bank" />
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="acc-open">Opening balance</Label>
              <Input id="acc-open" name="opening_balance" type="number" step="0.01" defaultValue={(account as unknown as { opening_balance?: number })?.opening_balance ?? 0} />
              {state?.fieldErrors?.opening_balance && <p className="text-xs text-error-dark">{state.fieldErrors.opening_balance}</p>}
            </div>
          )}

          {type === "credit_card" && (
            <div className="space-y-2">
              <Label htmlFor="acc-limit">Credit limit</Label>
              <Input id="acc-limit" name="credit_limit" type="number" step="0.01" defaultValue={account?.credit_limit ?? ""} placeholder="50000" />
              {state?.fieldErrors?.credit_limit && <p className="text-xs text-error-dark">{state.fieldErrors.credit_limit}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="acc-color">Color</Label>
            <Input id="acc-color" name="color" defaultValue={account?.color || ""} placeholder="#2563EB" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-notes">Notes</Label>
            <Textarea id="acc-notes" name="notes" defaultValue={account?.notes || ""} placeholder="Optional notes" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : isEdit ? "Save changes" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
