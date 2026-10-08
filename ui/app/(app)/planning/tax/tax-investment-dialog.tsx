"use client";

import { useActionState, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EntityFormDialog } from "@/components/common/entity-form-dialog";
import { FieldError, FormFooter, FormGrid } from "@/components/common/form-primitives";
import { createTaxInvestment, updateTaxInvestment } from "./actions";
import { todayLocalISO } from "@/lib/format";
import { toast } from "sonner";

type Investment = { id: string; section: string; name: string; amount: string; investment_date: string; proof_status: string; financial_year: string; version: number };

export function TaxInvestmentDialog({
  open,
  onOpenChange,
  investment,
  sections,
  fy,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  investment?: Investment | null;
  sections: { section_code: string; section_name: string }[];
  fy: string;
  onSuccess?: () => void;
}) {
  const isEdit = !!investment;
  const [section, setSection] = useState(investment?.section || sections[0]?.section_code || "80C");
  const [proof, setProof] = useState(investment?.proof_status || "pending");
  const [state, formAction, isPending] = useActionState(isEdit ? updateTaxInvestment : createTaxInvestment, null);

  useEffect(() => {
    if (state?.success) {
      toast.success(isEdit ? "Investment updated" : "Investment added");
      onOpenChange(false);
      onSuccess?.();
    }
  }, [state?.success]);

  useEffect(() => {
    if (open) {
      setSection(investment?.section || sections[0]?.section_code || "80C");
      setProof(investment?.proof_status || "pending");
    }
  }, [open, investment]);

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit investment" : "Add tax investment"}
      description={`Record an 80C/80D investment for FY ${fy}.`}
      formKey={investment?.id ?? "new"}
      formAction={formAction}
      state={state}
      isEdit={isEdit}
      isPending={isPending}
      footer={<FormFooter onCancel={() => onOpenChange(false)} pending={isPending} isEdit={isEdit} createLabel="Add" />}
    >
      {isEdit && <input type="hidden" name="id" value={investment!.id} />}
      {isEdit && <input type="hidden" name="version" value={String(investment!.version)} />}
      {!isEdit && <input type="hidden" name="financial_year" value={fy} />}
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="proof_status" value={proof} />

      {state?.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>{Object.values(state.fieldErrors).join(" ")}</AlertDescription>
        </Alert>
      )}

          <div className="space-y-2">
            <Label>Section *</Label>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.section_code} value={s.section_code}>
                    {s.section_code} - {s.section_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax-name">Name *</Label>
            <Input id="tax-name" name="name" defaultValue={investment?.name || ""} placeholder="PPF - SBI, ELSS, LIC" required />
            <FieldError message={state?.fieldErrors?.name} />
          </div>

          <FormGrid>
            <div className="space-y-2">
              <Label htmlFor="tax-amount">Amount *</Label>
              <Input id="tax-amount" name="amount" type="number" step="0.01" defaultValue={investment?.amount ?? ""} placeholder="50000" required />
              <FieldError message={state?.fieldErrors?.amount} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-date">Date *</Label>
              <Input id="tax-date" name="investment_date" type="date" defaultValue={investment ? String(investment.investment_date).slice(0, 10) : todayLocalISO()} required />
            </div>
          </FormGrid>

          <div className="space-y-2">
            <Label>Proof status</Label>
            <Select value={proof} onValueChange={setProof}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="collected">Collected</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax-notes">Notes</Label>
            <Textarea id="tax-notes" name="notes" placeholder="Optional" />
          </div>
    </EntityFormDialog>
  );
}
