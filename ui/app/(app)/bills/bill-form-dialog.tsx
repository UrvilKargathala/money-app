"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createBill, updateBill } from "./actions";
import { toast } from "sonner";

type Bill = { id: string; name: string; amount: number | null; estimated_amount: number | null; due_day: number; frequency: string; account_id: string | null; category_id: string | null; reminder_days: number; is_autopay: number; notes: string | null; version: number };

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
  const [state, formAction, isPending] = useActionState(isEdit ? updateBill : createBill, null);

  useEffect(() => {
    if (state?.success) {
      toast.success(isEdit ? "Bill updated" : "Bill created");
      onOpenChange(false);
      onSuccess?.();
    }
  }, [state?.success]);

  useEffect(() => {
    if (open) {
      setFrequency(bill?.frequency || "monthly");
      setAccountId(bill?.account_id || "");
      setCategoryId(bill?.category_id || "");
    }
  }, [open, bill]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit bill" : "Add bill"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update bill details." : "Track a recurring bill with due date and reminders."}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={bill!.id} />}
          {isEdit && <input type="hidden" name="version" value={String(bill!.version)} />}
          <input type="hidden" name="frequency" value={frequency} />
          <input type="hidden" name="account_id" value={accountId} />
          <input type="hidden" name="category_id" value={categoryId} />

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="bill-name">Name *</Label>
            <Input id="bill-name" name="name" defaultValue={bill?.name || ""} placeholder="Rent, Electricity, Gym" required />
            {state?.fieldErrors?.name && <p className="text-xs text-error-dark">{state.fieldErrors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bill-amount">Amount</Label>
              <Input id="bill-amount" name="amount" type="number" step="0.01" defaultValue={bill?.amount ?? ""} placeholder="15000" />
              {state?.fieldErrors?.amount && <p className="text-xs text-error-dark">{state.fieldErrors.amount}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bill-est">Estimated amount</Label>
              <Input id="bill-est" name="estimated_amount" type="number" step="0.01" defaultValue={bill?.estimated_amount ?? ""} placeholder="For variable bills" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bill-due">Due day *</Label>
              <Input id="bill-due" name="due_day" type="number" min={1} max={31} defaultValue={bill?.due_day ?? 1} required />
              {state?.fieldErrors?.due_day && <p className="text-xs text-error-dark">{state.fieldErrors.due_day}</p>}
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bill-reminder">Reminder days</Label>
              <Input id="bill-reminder" name="reminder_days" type="number" min={0} max={31} defaultValue={bill?.reminder_days ?? 3} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input id="bill-autopay" name="is_autopay" type="checkbox" defaultChecked={!!bill?.is_autopay} className="h-4 w-4 rounded border-neutral-300" />
              <Label htmlFor="bill-autopay" className="font-normal cursor-pointer">
                Autopay
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bill-notes">Notes</Label>
            <Textarea id="bill-notes" name="notes" defaultValue={bill?.notes || ""} placeholder="Optional" />
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
