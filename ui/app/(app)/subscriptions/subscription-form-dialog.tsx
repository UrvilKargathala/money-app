"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createSubscription, updateSubscription } from "./actions";
import { toast } from "sonner";

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

  useEffect(() => {
    if (state?.success) {
      toast.success(isEdit ? "Subscription updated" : "Subscription created");
      onOpenChange(false);
      onSuccess?.();
    }
  }, [state?.success]);

  useEffect(() => {
    if (open) {
      setFrequency(subscription?.frequency || "monthly");
      setAccountId(subscription?.account_id || "");
      setCategoryId(subscription?.category_id || "");
    }
  }, [open, subscription]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit subscription" : "Add subscription"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update subscription details." : "Track a recurring subscription."}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={subscription!.id} />}
          {isEdit && <input type="hidden" name="version" value={String(subscription!.version)} />}
          <input type="hidden" name="frequency" value={frequency} />
          <input type="hidden" name="account_id" value={accountId} />
          <input type="hidden" name="category_id" value={categoryId} />

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="sub-name">Service name *</Label>
            <Input id="sub-name" name="service_name" defaultValue={subscription?.service_name || ""} placeholder="Netflix, Spotify, YouTube" required />
            {state?.fieldErrors?.service_name && <p className="text-xs text-error-dark">{state.fieldErrors.service_name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sub-amount">Amount *</Label>
              <Input id="sub-amount" name="amount" type="number" step="0.01" defaultValue={subscription?.amount ?? ""} placeholder="649" required />
              {state?.fieldErrors?.amount && <p className="text-xs text-error-dark">{state.fieldErrors.amount}</p>}
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="sub-date">Next renewal date *</Label>
            <Input
              id="sub-date"
              name="next_renewal_date"
              type="date"
              defaultValue={subscription ? new Date(subscription.next_renewal_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)}
              required
            />
            {state?.fieldErrors?.next_renewal_date && <p className="text-xs text-error-dark">{state.fieldErrors.next_renewal_date}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
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
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sub-notes">Notes</Label>
            <Textarea id="sub-notes" name="notes" defaultValue={subscription?.notes || ""} placeholder="Optional" />
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
