"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDialog, useEntityFormSuccess } from "@/components/common/entity-form-dialog";
import { FieldError } from "@/components/common/form-primitives";
import { createAccount, updateAccount } from "./actions";
import { ACCOUNT_TYPES } from "@moneymind/api/constants";

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
  const [type, setType] = useState(account?.type || "bank_savings");
  const [color, setColor] = useState(account?.color || "#2563EB");
  const pickerRef = useRef<HTMLInputElement>(null);
  const validColor = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#2563EB";
  // Keep the action itself server-side. Passing a client wrapper to a form
  // action prevents React from dispatching the mutation in production.
  const [state, formAction, isPending] = useActionState(isEdit ? updateAccount : createAccount, null);

  useEntityFormSuccess({ state, isEdit, entityLabel: "Account", onOpenChange, onSuccess });

  useEffect(() => {
    if (open) {
      setType(account?.type || "bank_savings");
      setColor(account?.color || "#2563EB");
    }
  }, [open, account]);

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit account" : "Add account"}
      description={isEdit ? "Update the account details below." : "Create a new account to track balances and transactions."}
      formKey={account?.id ?? "new"}
      formAction={formAction}
      state={state}
      isEdit={isEdit}
      isPending={isPending}
      footer={
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : isEdit ? "Save changes" : "Create account"}
          </Button>
        </DialogFooter>
      }
    >
      {isEdit && <input type="hidden" name="id" value={account!.id} />}
      {isEdit && <input type="hidden" name="version" value={String(account!.version)} />}
      <input type="hidden" name="type" value={type} />

      <div className="space-y-2">
        <Label htmlFor="acc-name">Account name *</Label>
        <Input id="acc-name" name="name" defaultValue={account?.name || ""} placeholder="HDFC Savings" required error={!!state?.fieldErrors?.name} />
        <FieldError message={state?.fieldErrors?.name} />
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
        <FieldError message={state?.fieldErrors?.type} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="acc-inst">Institution</Label>
        <Input id="acc-inst" name="institution" defaultValue={account?.institution || ""} placeholder="HDFC Bank" />
      </div>

      {!isEdit && (
        <div className="space-y-2">
          <Label htmlFor="acc-open">Opening balance</Label>
          <Input id="acc-open" name="opening_balance" type="number" step="0.01" defaultValue={(account as unknown as { opening_balance?: number })?.opening_balance ?? 0} />
          <FieldError message={state?.fieldErrors?.opening_balance} />
        </div>
      )}

      {type === "credit_card" && (
        <div className="space-y-2">
          <Label htmlFor="acc-limit">Credit limit</Label>
          <Input id="acc-limit" name="credit_limit" type="number" step="0.01" defaultValue={account?.credit_limit ?? ""} placeholder="50000" />
          <FieldError message={state?.fieldErrors?.credit_limit} />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="acc-color">Color</Label>
        <div className="flex items-center gap-3">
          <input
            ref={pickerRef}
            id="acc-color-picker"
            type="color"
            tabIndex={-1}
            aria-hidden="true"
            value={validColor}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => pickerRef.current?.click()}
            aria-label="Pick account color"
            title="Pick account color"
            className="h-11 w-11 shrink-0 rounded-xl border border-line transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
            style={{ backgroundColor: validColor }}
          />
          <Input
            id="acc-color"
            name="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#2563EB"
            className="flex-1"
          />
        </div>
        <FieldError message={state?.fieldErrors?.color} />
        <p className="text-xs text-neutral-400">Use the picker or enter a hex color code.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="acc-notes">Notes</Label>
        <Textarea id="acc-notes" name="notes" defaultValue={account?.notes || ""} placeholder="Optional notes" />
      </div>
    </EntityFormDialog>
  );
}
