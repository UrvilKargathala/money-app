"use client";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Shared field-error line (was 46 copy-pasted `text-xs text-error-dark` paragraphs). */
export function FieldError({ message, className }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return <p className={cn("text-xs text-error-dark", className)}>{message}</p>;
}

/** Shared two-column form grid (was `grid grid-cols-2 gap-4` ×27). */
export function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-4", className)}>{children}</div>;
}

/** Shared dialog footer: Cancel + submit with pending state. */
export function FormFooter({
  onCancel,
  pending,
  isEdit,
  createLabel = "Create",
  savingLabel = "Saving...",
}: {
  onCancel: () => void;
  pending: boolean;
  isEdit: boolean;
  createLabel?: string;
  savingLabel?: string;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? savingLabel : isEdit ? "Save" : createLabel}
      </Button>
    </DialogFooter>
  );
}
