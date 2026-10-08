"use client";

import { useActionState, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDialog, useEntityFormSuccess } from "@/components/common/entity-form-dialog";
import { FieldError, FormGrid } from "@/components/common/form-primitives";
import { createGoal, updateGoal } from "./actions";

import type { Goal } from "@/lib/entities";

export function GoalFormDialog({
  open,
  onOpenChange,
  goal,
  accounts,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  goal?: Goal | null;
  accounts: { id: string; name: string }[];
  onSuccess?: () => void;
}) {
  const isEdit = !!goal;
  const [priority, setPriority] = useState(goal?.priority || "medium");
  const [accountId, setAccountId] = useState(goal?.account_id || "");
  const [state, formAction, isPending] = useActionState(isEdit ? updateGoal : createGoal, null);

  useEntityFormSuccess({ state, isEdit, entityLabel: "Goal", onOpenChange, onSuccess });

  useEffect(() => {
    if (open) {
      setPriority(goal?.priority || "medium");
      setAccountId(goal?.account_id || "");
    }
  }, [open, goal]);

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit goal" : "Create goal"}
      description={isEdit ? "Update goal details." : "Set a savings goal with target amount and date."}
      formKey={goal?.id ?? "new"}
      formAction={formAction}
      state={state}
      isEdit={isEdit}
      isPending={isPending}
    >
      {isEdit && <input type="hidden" name="id" value={goal!.id} />}
      {isEdit && <input type="hidden" name="version" value={String(goal!.version)} />}
      <input type="hidden" name="priority" value={priority} />
      <input type="hidden" name="account_id" value={accountId} />

      <div className="space-y-2">
        <Label htmlFor="goal-name">Name *</Label>
        <Input id="goal-name" name="name" defaultValue={goal?.name || ""} placeholder="Emergency Fund, Vacation, Home" required />
        <FieldError message={state?.fieldErrors?.name} />
      </div>

      <FormGrid>
        <div className="space-y-2">
          <Label htmlFor="goal-amount">Target amount *</Label>
          <Input id="goal-amount" name="target_amount" type="number" step="0.01" defaultValue={goal?.target_amount ?? ""} placeholder="500000" required />
          <FieldError message={state?.fieldErrors?.target_amount} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="goal-date">Target date *</Label>
          <Input id="goal-date" name="target_date" type="date" defaultValue={goal ? String(goal.target_date).slice(0, 10) : ""} required />
          <FieldError message={state?.fieldErrors?.target_date} />
        </div>
      </FormGrid>

      <FormGrid>
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
      </FormGrid>

          <div className="space-y-2">
            <Label htmlFor="goal-notes">Notes</Label>
            <Textarea id="goal-notes" name="notes" defaultValue={goal?.notes || ""} placeholder="Optional" />
          </div>
    </EntityFormDialog>
  );
}
