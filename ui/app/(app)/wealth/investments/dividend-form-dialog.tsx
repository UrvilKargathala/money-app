"use client";

import { useActionState, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDialog } from "@/components/common/entity-form-dialog";
import { FormFooter, FormGrid } from "@/components/common/form-primitives";
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
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit payout" : "Add dividend / interest"}
      description={isEdit ? "Update payout record." : "Record dividend, interest or maturity proceeds."}
      formKey={dividend?.id ?? "new"}
      formAction={formAction}
      state={state}
      isEdit={isEdit}
      isPending={isPending}
      footer={
        <FormFooter onCancel={() => onOpenChange(false)} pending={isPending} isEdit={isEdit} editLabel="Update" />
      }
    >
      {isEdit && <input type="hidden" name="id" value={dividend!.id} />}
      <input type="hidden" name="type" value={type} />
      {!isEdit && <input type="hidden" name="investment_id" value={investmentId} />}

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

          <FormGrid>
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
          </FormGrid>

          <div className="space-y-2">
            <Label htmlFor="div-notes">Notes</Label>
            <Input id="div-notes" name="notes" defaultValue={dividend?.notes ?? ""} placeholder="Optional" />
          </div>
    </EntityFormDialog>
  );
}
