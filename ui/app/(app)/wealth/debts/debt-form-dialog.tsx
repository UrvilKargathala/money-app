"use client";

import { useActionState, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityFormDialog, useEntityFormSuccess } from "@/components/common/entity-form-dialog";
import { FieldError, FormGrid } from "@/components/common/form-primitives";
import { createDebt, updateDebt } from "./actions";
import { todayLocalISO } from "@/lib/format";

import type { Debt } from "@/lib/entities";

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

  useEntityFormSuccess({ state, isEdit, entityLabel: "Debt", onOpenChange, onSuccess });

  useEffect(() => {
    if (open) {
      setType(debt?.type || "personal_loan");
      setAccountId(debt?.account_id || "");
    }
  }, [open, debt]);

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit debt" : "Add debt"}
      description={isEdit ? "Update debt details." : "Track a loan or debt with EMI schedule."}
      formKey={debt?.id ?? "new"}
      formAction={formAction}
      state={state}
      isEdit={isEdit}
      isPending={isPending}
    >
      {isEdit && <input type="hidden" name="id" value={debt!.id} />}
      {isEdit && <input type="hidden" name="version" value={String(debt!.version)} />}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="account_id" value={accountId} />

      <div className="space-y-2">
        <Label htmlFor="debt-name">Name *</Label>
        <Input id="debt-name" name="name" defaultValue={debt?.name || ""} placeholder="Home Loan, Car Loan" required />
        <FieldError message={state?.fieldErrors?.name} />
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
              <FormGrid>
                <div className="space-y-2">
                  <Label htmlFor="debt-principal">Principal *</Label>
                  <Input id="debt-principal" name="principal_original" type="number" step="0.01" defaultValue="" placeholder="500000" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debt-outstanding">Outstanding *</Label>
                  <Input id="debt-outstanding" name="principal_outstanding" type="number" step="0.01" defaultValue="" placeholder="500000" required />
                </div>
              </FormGrid>
              <FormGrid>
                <div className="space-y-2">
                  <Label htmlFor="debt-rate">Interest rate % *</Label>
                  <Input id="debt-rate" name="interest_rate" type="number" step="0.01" defaultValue="" placeholder="9.5" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debt-emi">EMI *</Label>
                  <Input id="debt-emi" name="emi_amount" type="number" step="0.01" defaultValue="" placeholder="10000" required />
                </div>
              </FormGrid>
              <FormGrid>
                <div className="space-y-2">
                  <Label htmlFor="debt-tenure">Tenure (months) *</Label>
                  <Input id="debt-tenure" name="tenure_months" type="number" defaultValue="" placeholder="60" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debt-date">Start date *</Label>
                  <Input id="debt-date" name="start_date" type="date" defaultValue={todayLocalISO()} required />
                </div>
              </FormGrid>
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
    </EntityFormDialog>
  );
}
