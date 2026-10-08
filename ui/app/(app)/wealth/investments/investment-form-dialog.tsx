"use client";

import { useActionState, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EntityFormDialog, useEntityFormSuccess } from "@/components/common/entity-form-dialog";
import { FormFooter, FormGrid } from "@/components/common/form-primitives";
import { createInvestment, updateInvestment } from "./actions";
import { todayLocalISO } from "@/lib/format";

import type { Investment } from "@/lib/entities";

export function InvestmentFormDialog({
  open,
  onOpenChange,
  investment,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  investment?: Investment | null;
  onSuccess?: () => void;
}) {
  const isEdit = !!investment;
  const [type, setType] = useState(investment?.type || "mutual_fund");
  const [category, setCategory] = useState(investment?.category || "equity");
  const [state, formAction, isPending] = useActionState(isEdit ? updateInvestment : createInvestment, null);

  useEntityFormSuccess({ state, isEdit, entityLabel: "Investment", onOpenChange, onSuccess });

  useEffect(() => {
    if (open) {
      setType(investment?.type || "mutual_fund");
      setCategory(investment?.category || "equity");
    }
  }, [open, investment]);

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Update price" : "Add investment"}
      description={isEdit ? "Update current price." : "Add a new holding."}
      formKey={investment?.id ?? "new"}
      formAction={formAction}
      state={state}
      isEdit={isEdit}
      isPending={isPending}
      footer={
        <FormFooter onCancel={() => onOpenChange(false)} pending={isPending} isEdit={isEdit} editLabel="Update" />
      }
    >
      {isEdit && <input type="hidden" name="id" value={investment!.id} />}
      {isEdit && <input type="hidden" name="version" value={String(investment!.version)} />}
      {!isEdit && <input type="hidden" name="type" value={type} />}
      {!isEdit && <input type="hidden" name="category" value={category} />}

      {state?.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>{Object.values(state.fieldErrors).join(" ")}</AlertDescription>
        </Alert>
      )}

          {!isEdit ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="inv-name">Name *</Label>
                <Input id="inv-name" name="name" defaultValue="" placeholder="HDFC Flexi Cap" required />
              </div>
              <FormGrid>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mutual_fund">Mutual Fund</SelectItem>
                      <SelectItem value="stock">Stock</SelectItem>
                      <SelectItem value="fd">FD</SelectItem>
                      <SelectItem value="ppf">PPF</SelectItem>
                      <SelectItem value="gold">Gold</SelectItem>
                      <SelectItem value="crypto">Crypto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equity">Equity</SelectItem>
                      <SelectItem value="debt">Debt</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="gold">Gold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </FormGrid>
              <FormGrid>
                <div className="space-y-2">
                  <Label htmlFor="inv-units">Units *</Label>
                  <Input id="inv-units" name="units" type="number" step="0.01" defaultValue="" placeholder="100" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-buy">Buy price *</Label>
                  <Input id="inv-buy" name="buy_price" type="number" step="0.01" defaultValue="" placeholder="100" required />
                </div>
              </FormGrid>
              <FormGrid>
                <div className="space-y-2">
                  <Label htmlFor="inv-current">Current price *</Label>
                  <Input id="inv-current" name="current_price" type="number" step="0.01" defaultValue="" placeholder="110" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-date">Purchase date</Label>
                  <Input id="inv-date" name="purchase_date" type="date" defaultValue={todayLocalISO()} />
                </div>
              </FormGrid>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="inv-price-edit">Current price *</Label>
                <Input id="inv-price-edit" name="current_price" type="number" step="0.01" defaultValue={investment?.current_price ?? ""} required />
              </div>
              <p className="text-xs text-ink-3">
                {investment?.name} • {investment?.units} units @ {investment?.buy_price}
              </p>
            </>
          )}
    </EntityFormDialog>
  );
}
