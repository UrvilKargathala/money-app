"use client";

import { useActionState, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategorySelectWithCreate } from "@/components/common/category-select-with-create";
import { EntityFormDialog, useEntityFormSuccess } from "@/components/common/entity-form-dialog";
import { FieldError, FormGrid } from "@/components/common/form-primitives";
import { createSubscription, updateSubscription } from "./actions";

type Sub = { id: string; service_name: string; amount: number; frequency: string; next_renewal_date: string; account_id: string | null; category_id: string | null; notes: string | null; version: number };

export function SubscriptionFormDialog({
  open,
  onOpenChange,
  subscription,
  accounts,
  categories,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subscription?: Sub | null;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  onSuccess?: () => void;
}) {
  const isEdit = !!subscription;
  const [frequency, setFrequency] = useState(subscription?.frequency || "monthly");
  const [accountId, setAccountId] = useState(subscription?.account_id || "");
  const [categoryId, setCategoryId] = useState(subscription?.category_id || "");
  const [state, formAction, isPending] = useActionState(isEdit ? updateSubscription : createSubscription, null);

  useEntityFormSuccess({ state, isEdit, entityLabel: "Subscription", onOpenChange, onSuccess });

  useEffect(() => {
    if (open) {
      setFrequency(subscription?.frequency || "monthly");
      setAccountId(subscription?.account_id || "");
      setCategoryId(subscription?.category_id || "");
    }
  }, [open, subscription]);

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit subscription" : "Add subscription"}
      description={isEdit ? "Update subscription details." : "Track a recurring subscription."}
      formKey={subscription?.id ?? "new"}
      formAction={formAction}
      state={state}
      isEdit={isEdit}
      isPending={isPending}
    >
      {isEdit && <input type="hidden" name="id" value={subscription!.id} />}
      {isEdit && <input type="hidden" name="version" value={String(subscription!.version)} />}
      <input type="hidden" name="frequency" value={frequency} />
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="category_id" value={categoryId} />

      <div className="space-y-2">
        <Label htmlFor="sub-name">Service name *</Label>
        <Input id="sub-name" name="service_name" defaultValue={subscription?.service_name || ""} placeholder="Netflix, Spotify, YouTube" required />
        <FieldError message={state?.fieldErrors?.service_name} />
      </div>

      <FormGrid>
        <div className="space-y-2">
          <Label htmlFor="sub-amount">Amount *</Label>
          <Input id="sub-amount" name="amount" type="number" step="0.01" defaultValue={subscription?.amount ?? ""} placeholder="649" required />
          <FieldError message={state?.fieldErrors?.amount} />
        </div>
        <div className="space-y-2">
          <Label>Frequency</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="half_yearly">Half yearly</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FormGrid>

      <div className="space-y-2">
        <Label htmlFor="sub-date">Next renewal date *</Label>
        <Input
          id="sub-date"
          name="next_renewal_date"
          type="date"
          defaultValue={subscription ? new Date(subscription.next_renewal_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)}
          required
        />
        <FieldError message={state?.fieldErrors?.next_renewal_date} />
      </div>

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

      <div className="space-y-2">
        <Label htmlFor="sub-notes">Notes</Label>
        <Textarea id="sub-notes" name="notes" defaultValue={subscription?.notes || ""} placeholder="Optional" />
      </div>
    </EntityFormDialog>
  );
}
