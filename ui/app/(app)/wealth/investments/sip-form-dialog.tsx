"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createSip, updateSip } from "./actions";
import { toast } from "sonner";

type Sip = {
  id: string;
  investment_id: string;
  investment_name: string;
  amount: string | number;
  frequency: string;
  next_date: string;
  account_id: string | null;
  status: string;
};

type InvestmentOpt = { id: string; name: string };

export function SipFormDialog({
  open,
  onOpenChange,
  sip,
  investments,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sip?: Sip | null;
  investments: InvestmentOpt[];
  onSuccess?: () => void;
}) {
  const isEdit = !!sip;
  const [frequency, setFrequency] = useState(sip?.frequency || "monthly");
  const [investmentId, setInvestmentId] = useState(sip?.investment_id || investments[0]?.id || "");
  const [state, formAction, isPending] = useActionState(isEdit ? updateSip : createSip, null);

  useEffect(() => {
    if (state?.success) {
      toast.success(isEdit ? "SIP updated" : "SIP created");
      onOpenChange(false);
      onSuccess?.();
    }
  }, [state?.success]);

  useEffect(() => {
    if (open) {
      setFrequency(sip?.frequency || "monthly");
      setInvestmentId(sip?.investment_id || investments[0]?.id || "");
    }
  }, [open, sip, investments]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit SIP" : "Add SIP"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update SIP installment." : "Schedule a systematic investment plan."}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={sip!.id} />}
          <input type="hidden" name="frequency" value={frequency} />
          {!isEdit && <input type="hidden" name="investment_id" value={investmentId} />}

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {!isEdit && (
            <div className="space-y-2">
              <Label>Holding *</Label>
              <Select value={investmentId} onValueChange={setInvestmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select holding" />
                </SelectTrigger>
                <SelectContent>
                  {investments.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state?.fieldErrors?.investment_id && <p className="text-xs text-error">{state.fieldErrors.investment_id}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sip-amount">Amount *</Label>
              <Input id="sip-amount" name="amount" type="number" step="0.01" defaultValue={sip ? String(sip.amount) : ""} placeholder="5000" required />
              {state?.fieldErrors?.amount && <p className="text-xs text-error">{state.fieldErrors.amount}</p>}
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
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sip-next">Next date *</Label>
              <Input id="sip-next" name="next_date" type="date" defaultValue={sip?.next_date ?? new Date().toISOString().slice(0, 10)} required />
              {state?.fieldErrors?.next_date && <p className="text-xs text-error">{state.fieldErrors.next_date}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sip-end">End date</Label>
              <Input id="sip-end" name="end_date" type="date" defaultValue="" />
            </div>
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="sip-start">Start date</Label>
              <Input id="sip-start" name="start_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sip-notes">Notes</Label>
            <Input id="sip-notes" name="notes" defaultValue="" placeholder="Optional" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : isEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
