"use client";

import { useActionState, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategorySelectWithCreate } from "@/components/common/category-select-with-create";
import { EntityFormDialog, useEntityFormSuccess } from "@/components/common/entity-form-dialog";
import { FieldError, FormGrid } from "@/components/common/form-primitives";
import { createBill, updateBill } from "./actions";

import type { Bill } from "@/lib/entities";

export function BillFormDialog({
  open,
  onOpenChange,
  bill,
  accounts,
  categories,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bill?: Bill | null;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  onSuccess?: () => void;
}) {
  const isEdit = !!bill;
  const [frequency, setFrequency] = useState(bill?.frequency || "monthly");
  const [accountId, setAccountId] = useState(bill?.account_id || "");
  const [categoryId, setCategoryId] = useState(bill?.category_id || "");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  // Remount the form on every open so uncontrolled inputs can never leak a
  // previous bill's values into a fresh create.
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, isPending] = useActionState(isEdit ? updateBill : createBill, null);

  useEntityFormSuccess({ state, isEdit, entityLabel: "Bill", onOpenChange, onSuccess });

  useEffect(() => {
    if (open) {
      setFrequency(bill?.frequency || "monthly");
      setAccountId(bill?.account_id || "");
      setCategoryId(bill?.category_id || "");
      setLocalErrors({});
      setFormKey((k) => k + 1);
    }
  }, [open, bill]);

  // Frontend-first: mirror the API's required-field rules so no invalid
  // create/update POST leaves the browser. Account stays optional by design.
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const dueDay = Number(data.get("due_day"));
    const amount = String(data.get("amount") ?? "").trim();
    const estimated = String(data.get("estimated_amount") ?? "").trim();
    const reminder = String(data.get("reminder_days") ?? "").trim();
    const next: Record<string, string> = {};
    if (!name) next.name = "Please enter a bill name.";
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)
      next.due_day = "Due day must be between 1 and 31.";
    if (amount !== "" && !(Number(amount) > 0))
      next.amount = "Please enter an amount greater than zero.";
    if (estimated !== "" && !(Number(estimated) > 0))
      next.estimated_amount = "Please enter an amount greater than zero.";
    if (amount === "" && estimated === "")
      next.amount = "Enter an amount, or an estimated amount for variable bills.";
    if (reminder !== "" && (!Number.isInteger(Number(reminder)) || Number(reminder) < 0 || Number(reminder) > 31))
      next.reminder_days = "Reminder days must be between 0 and 31.";
    setLocalErrors(next);
    if (Object.keys(next).length > 0) e.preventDefault();
  };

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit bill" : "Add bill"}
      description={isEdit ? "Update bill details." : "Track a recurring bill with due date and reminders."}
      formKey={formKey}
      formAction={formAction}
      onSubmit={handleSubmit}
      state={state}
      isEdit={isEdit}
      isPending={isPending}
    >
      {isEdit && <input type="hidden" name="id" value={bill!.id} />}
      {isEdit && <input type="hidden" name="version" value={String(bill!.version)} />}
      <input type="hidden" name="frequency" value={frequency} />
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="category_id" value={categoryId} />

      <div className="space-y-2">
        <Label htmlFor="bill-name">Name *</Label>
        <Input id="bill-name" name="name" defaultValue={bill?.name || ""} placeholder="Rent, Electricity, Gym" required />
        <FieldError message={localErrors.name ?? state?.fieldErrors?.name} />
      </div>

      <FormGrid>
        <div className="space-y-2">
          <Label htmlFor="bill-amount">Amount</Label>
          <Input id="bill-amount" name="amount" type="number" step="0.01" defaultValue={bill?.amount ?? ""} placeholder="15000" />
          <FieldError message={localErrors.amount ?? state?.fieldErrors?.amount} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bill-est">Estimated amount</Label>
          <Input id="bill-est" name="estimated_amount" type="number" step="0.01" defaultValue={bill?.estimated_amount ?? ""} placeholder="For variable bills" />
          <FieldError message={localErrors.estimated_amount ?? state?.fieldErrors?.estimated_amount} />
        </div>
      </FormGrid>

      <FormGrid>
        <div className="space-y-2">
          <Label htmlFor="bill-due">Due day *</Label>
          <Input id="bill-due" name="due_day" type="number" min={1} max={31} defaultValue={bill?.due_day ?? 1} required />
          <FieldError message={localErrors.due_day ?? state?.fieldErrors?.due_day} />
        </div>
        <div className="space-y-2">
          <Label>Frequency</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="half_yearly">Half yearly</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
              <SelectItem value="one_time">One time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FormGrid>

      <FormGrid>
        <div className="space-y-2">
          <Label>Account</Label>
          <Select value={accountId || "none"} onValueChange={(v) => setAccountId(v === "none" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No account</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CategorySelectWithCreate
          value={categoryId || "none"}
          onValueChange={(value) => setCategoryId(value === "none" ? "" : value)}
          categories={categories}
        />
      </FormGrid>

      <FormGrid>
        <div className="space-y-2">
          <Label htmlFor="bill-reminder">Reminder days</Label>
          <Input id="bill-reminder" name="reminder_days" type="number" min={0} max={31} defaultValue={bill?.reminder_days ?? 3} />
          <FieldError message={localErrors.reminder_days ?? state?.fieldErrors?.reminder_days} />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input id="bill-autopay" name="is_autopay" type="checkbox" defaultChecked={!!bill?.is_autopay} className="h-4 w-4 rounded border-neutral-300" />
          <Label htmlFor="bill-autopay" className="font-normal cursor-pointer">
            Autopay
          </Label>
        </div>
      </FormGrid>

      <div className="space-y-2">
        <Label htmlFor="bill-notes">Notes</Label>
        <Textarea id="bill-notes" name="notes" defaultValue={bill?.notes || ""} placeholder="Optional" />
      </div>
    </EntityFormDialog>
  );
}
