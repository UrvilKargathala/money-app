"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createGoal, updateGoal } from "./actions";
import { toast } from "sonner";

type Goal = { id: string; name: string; target_amount: number; target_date: string; priority: string; notes: string | null; version: number; account_id: string | null };

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

  useEffect(() => {
    if (state?.success) {
      toast.success(isEdit ? "Goal updated" : "Goal created");
      onOpenChange(false);
      onSuccess?.();
    }
  }, [state?.success]);

  useEffect(() => {
    if (open) {
      setPriority(goal?.priority || "medium");
      setAccountId(goal?.account_id || "");
    }
  }, [open, goal]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit goal" : "Create goal"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update goal details." : "Set a savings goal with target amount and date."}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={goal!.id} />}
          {isEdit && <input type="hidden" name="version" value={String(goal!.version)} />}
          <input type="hidden" name="priority" value={priority} />
          <input type="hidden" name="account_id" value={accountId} />

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="goal-name">Name *</Label>
            <Input id="goal-name" name="name" defaultValue={goal?.name || ""} placeholder="Emergency Fund, Vacation, Home" required />
            {state?.fieldErrors?.name && <p className="text-xs text-error-dark">{state.fieldErrors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="goal-amount">Target amount *</Label>
              <Input id="goal-amount" name="target_amount" type="number" step="0.01" defaultValue={goal?.target_amount ?? ""} placeholder="500000" required />
              {state?.fieldErrors?.target_amount && <p className="text-xs text-error-dark">{state.fieldErrors.target_amount}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-date">Target date *</Label>
              <Input id="goal-date" name="target_date" type="date" defaultValue={goal ? new Date(goal.target_date).toISOString().slice(0, 10) : ""} required />
              {state?.fieldErrors?.target_date && <p className="text-xs text-error-dark">{state.fieldErrors.target_date}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-notes">Notes</Label>
            <Textarea id="goal-notes" name="notes" defaultValue={goal?.notes || ""} placeholder="Optional" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
