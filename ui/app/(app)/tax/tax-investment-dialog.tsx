"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createTaxInvestment, updateTaxInvestment } from "./actions";
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit investment" : "Add tax investment"}</DialogTitle>
          <DialogDescription>Record an 80C/80D investment for FY {fy}.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={investment!.id} />}
          {isEdit && <input type="hidden" name="version" value={String(investment!.version)} />}
          {!isEdit && <input type="hidden" name="financial_year" value={fy} />}
          <input type="hidden" name="section" value={section} />
          <input type="hidden" name="proof_status" value={proof} />

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
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
                    {s.section_code} — {s.section_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax-name">Name *</Label>
            <Input id="tax-name" name="name" defaultValue={investment?.name || ""} placeholder="PPF - SBI, ELSS, LIC" required />
            {state?.fieldErrors?.name && <p className="text-xs text-error-dark">{state.fieldErrors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tax-amount">Amount *</Label>
              <Input id="tax-amount" name="amount" type="number" step="0.01" defaultValue={investment?.amount ?? ""} placeholder="50000" required />
              {state?.fieldErrors?.amount && <p className="text-xs text-error-dark">{state.fieldErrors.amount}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-date">Date *</Label>
              <Input id="tax-date" name="investment_date" type="date" defaultValue={investment ? new Date(investment.investment_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)} required />
            </div>
          </div>

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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : isEdit ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
