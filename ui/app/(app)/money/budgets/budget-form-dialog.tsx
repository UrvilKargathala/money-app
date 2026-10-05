"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CategorySelectWithCreate } from "@/components/common/category-select-with-create";
import { createBudget, updateBudget } from "./actions";
import { toast } from "sonner";

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

  useEffect(() => {
    if (state?.success) {
      toast.success(isEdit ? "Budget updated" : "Budget created");
      onOpenChange(false);
      onSuccess?.();
    }
  }, [state?.success]);

  useEffect(() => {
    if (open) setCategoryId(budget?.category_id || "");
  }, [open, budget]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit budget" : "Create budget"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the budget amount." : `Set a budget for ${month}/${year}.`}
          </DialogDescription>
        </DialogHeader>

        <form key={budget?.id ?? "new"} action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={budget!.id} />}
          {isEdit && <input type="hidden" name="version" value={String(budget!.version)} />}
          {!isEdit && <input type="hidden" name="category_id" value={categoryId === "overall" ? "" : categoryId} />}
          {!isEdit && <input type="hidden" name="month" value={String(month)} />}
          {!isEdit && <input type="hidden" name="year" value={String(year)} />}

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {!isEdit && (
            <div className="space-y-2">
              <CategorySelectWithCreate
                value={categoryId || "overall"}
                onValueChange={(value) => setCategoryId(value === "overall" ? "" : value)}
                categories={categories}
                emptyOption={{ value: "overall", label: "Overall (all categories)" }}
              />
              {state?.fieldErrors?.category_id && <p className="text-xs text-error-dark">{state.fieldErrors.category_id}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="budget-amount">Amount *</Label>
            <Input id="budget-amount" name="amount" type="number" step="0.01" defaultValue={budget ? String(budget.amount) : ""} placeholder="10000" required />
            {state?.fieldErrors?.amount && <p className="text-xs text-error-dark">{state.fieldErrors.amount}</p>}
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
