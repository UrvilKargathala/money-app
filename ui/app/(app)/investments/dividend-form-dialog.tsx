"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createDividend, updateDividend } from "./actions";
import { toast } from "sonner";

type Dividend = {
  id: string;
  investment_id: string;
  investment_name: string;
  type: string;
  amount: string | number;
  date: string;
  notes: string | null;
};

type InvestmentOpt = { id: string; name: string };

export function DividendFormDialog({
  open,
  onOpenChange,
  dividend,
  investments,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dividend?: Dividend | null;
  investments: InvestmentOpt[];
  onSuccess?: () => void;
}) {
  const isEdit = !!dividend;
  const [type, setType] = useState(dividend?.type || "dividend");
  const [investmentId, setInvestmentId] = useState(dividend?.investment_id || investments[0]?.id || "");
  const [state, formAction, isPending] = useActionState(isEdit ? updateDividend : createDividend, null);

  useEffect(() => {
    if (state?.success) {
      toast.success(isEdit ? "Dividend updated" : "Dividend recorded");
      onOpenChange(false);
      onSuccess?.();
    }
  }, [state?.success]);

  useEffect(() => {
    if (open) {
      setType(dividend?.type || "dividend");
      setInvestmentId(dividend?.investment_id || investments[0]?.id || "");
    }
  }, [open, dividend, investments]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit payout" : "Add dividend / interest"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update payout record." : "Record dividend, interest or maturity proceeds."}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={dividend!.id} />}
          <input type="hidden" name="type" value={type} />
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

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dividend">Dividend</SelectItem>
                <SelectItem value="interest">Interest</SelectItem>
                <SelectItem value="maturity_proceeds">Maturity proceeds</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="div-amount">Amount *</Label>
              <Input id="div-amount" name="amount" type="number" step="0.01" defaultValue={dividend ? String(dividend.amount) : ""} placeholder="500" required />
              {state?.fieldErrors?.amount && <p className="text-xs text-error">{state.fieldErrors.amount}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="div-date">Date *</Label>
              <Input id="div-date" name="date" type="date" defaultValue={dividend?.date ?? new Date().toISOString().slice(0, 10)} required />
              {state?.fieldErrors?.date && <p className="text-xs text-error">{state.fieldErrors.date}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="div-notes">Notes</Label>
            <Input id="div-notes" name="notes" defaultValue={dividend?.notes ?? ""} placeholder="Optional" />
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
