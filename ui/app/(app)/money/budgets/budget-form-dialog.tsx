"use client";

import { useActionState, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityFormDialog, useEntityFormSuccess } from "@/components/common/entity-form-dialog";
import { FieldError } from "@/components/common/form-primitives";
import { CategorySelectWithCreate } from "@/components/common/category-select-with-create";
import { createBudget, updateBudget } from "./actions";

type BudgetOpt = { id: string; name: string };
type Budget = { id: string; category_id: string | null; amount: string; version: number; month: number; year: number };

export function BudgetFormDialog({
  open,
  onOpenChange,
  budget,
  categories,
  month,
  year,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  budget?: Budget | null;
  categories: BudgetOpt[];
  month: number;
  year: number;
  onSuccess?: () => void;
}) {
  const isEdit = !!budget;
  const [categoryId, setCategoryId] = useState(budget?.category_id || "");
  const [state, formAction, isPending] = useActionState(isEdit ? updateBudget : createBudget, null);

  useEntityFormSuccess({ state, isEdit, entityLabel: "Budget", onOpenChange, onSuccess });

  useEffect(() => {
    if (open) setCategoryId(budget?.category_id || "");
  }, [open, budget]);

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit budget" : "Create budget"}
      description={isEdit ? "Update the budget amount." : `Set a budget for ${month}/${year}.`}
      formKey={budget?.id ?? "new"}
      formAction={formAction}
      state={state}
      isEdit={isEdit}
      isPending={isPending}
    >
      {isEdit && <input type="hidden" name="id" value={budget!.id} />}
      {isEdit && <input type="hidden" name="version" value={String(budget!.version)} />}
      {!isEdit && <input type="hidden" name="category_id" value={categoryId === "overall" ? "" : categoryId} />}
      {!isEdit && <input type="hidden" name="month" value={String(month)} />}
      {!isEdit && <input type="hidden" name="year" value={String(year)} />}

      {!isEdit && (
        <div className="space-y-2">
          <CategorySelectWithCreate
            value={categoryId || "overall"}
            onValueChange={(value) => setCategoryId(value === "overall" ? "" : value)}
            categories={categories}
            emptyOption={{ value: "overall", label: "Overall (all categories)" }}
          />
          <FieldError message={state?.fieldErrors?.category_id} />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="budget-amount">Amount *</Label>
        <Input id="budget-amount" name="amount" type="number" step="0.01" defaultValue={budget ? String(budget.amount) : ""} placeholder="10000" required />
        <FieldError message={state?.fieldErrors?.amount} />
      </div>
    </EntityFormDialog>
  );
}
