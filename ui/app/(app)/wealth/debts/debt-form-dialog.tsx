"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createDebt, updateDebt } from "./actions";
import { toast } from "sonner";

type Debt = { id: string; name: string; type: string; principal_original: string; principal_outstanding: string; interest_rate: string; emi_amount: string; tenure_months: number; start_date: string; version: number; account_id: string | null };

export function DebtFormDialog({
  open,
  onOpenChange,
  debt,
  accounts,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  debt?: Debt | null;
  accounts: { id: string; name: string }[];
  onSuccess?: () => void;
}) {
  const isEdit = !!debt;
  const [type, setType] = useState(debt?.type || "personal_loan");
  const [accountId, setAccountId] = useState(debt?.account_id || "");
  const [state, formAction, isPending] = useActionState(isEdit ? updateDebt : createDebt, null);

  useEffect(() => {
    if (state?.success) {
      toast.success(isEdit ? "Debt updated" : "Debt created");
      onOpenChange(false);
      onSuccess?.();
    }
  }, [state?.success]);

  useEffect(() => {
    if (open) {
      setType(debt?.type || "personal_loan");
      setAccountId(debt?.account_id || "");
    }
  }, [open, debt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit debt" : "Add debt"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update debt details." : "Track a loan or debt with EMI schedule."}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={debt!.id} />}
          {isEdit && <input type="hidden" name="version" value={String(debt!.version)} />}
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="account_id" value={accountId} />

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="debt-name">Name *</Label>
            <Input id="debt-name" name="name" defaultValue={debt?.name || ""} placeholder="Home Loan, Car Loan" required />
            {state?.fieldErrors?.name && <p className="text-xs text-error-dark">{state.fieldErrors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="home_loan">Home Loan</SelectItem>
                <SelectItem value="car_loan">Car Loan</SelectItem>
                <SelectItem value="personal_loan">Personal Loan</SelectItem>
                <SelectItem value="education_loan">Education Loan</SelectItem>
                <SelectItem value="credit_card">Credit Card</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isEdit && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="debt-principal">Principal *</Label>
                  <Input id="debt-principal" name="principal_original" type="number" step="0.01" defaultValue="" placeholder="500000" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debt-outstanding">Outstanding *</Label>
                  <Input id="debt-outstanding" name="principal_outstanding" type="number" step="0.01" defaultValue="" placeholder="500000" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="debt-rate">Interest rate % *</Label>
                  <Input id="debt-rate" name="interest_rate" type="number" step="0.01" defaultValue="" placeholder="9.5" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debt-emi">EMI *</Label>
                  <Input id="debt-emi" name="emi_amount" type="number" step="0.01" defaultValue="" placeholder="10000" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="debt-tenure">Tenure (months) *</Label>
                  <Input id="debt-tenure" name="tenure_months" type="number" defaultValue="" placeholder="60" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debt-date">Start date *</Label>
                  <Input id="debt-date" name="start_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
                </div>
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
            </>
          )}

          {isEdit && (
            <>
              <div className="space-y-2">
                <Label htmlFor="debt-rate-edit">Interest rate %</Label>
                <Input id="debt-rate-edit" name="interest_rate" type="number" step="0.01" defaultValue={debt?.interest_rate ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="debt-emi-edit">EMI</Label>
                <Input id="debt-emi-edit" name="emi_amount" type="number" step="0.01" defaultValue={debt?.emi_amount ?? ""} />
              </div>
            </>
          )}

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
